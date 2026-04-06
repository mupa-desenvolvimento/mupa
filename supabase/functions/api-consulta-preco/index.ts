import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const jsonHeaders = { ...corsHeaders, "Content-Type": "application/json; charset=utf-8" };

function normalizeEmpresaCode(input: string) {
  return String(input ?? "").replace(/[^A-Za-z0-9]/g, "").toUpperCase().trim();
}

function normalizeEan(input: string) {
  return String(input ?? "").replace(/\D/g, "").trim();
}

function normalizeBarcodeDigits(input: string) {
  return String(input ?? "").replace(/\D/g, "").trim();
}

function normalizeLoja(input: string) {
  return String(input ?? "").replace(/\s+/g, " ").trim();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function getByPath(obj: unknown, path: string) {
  const parts = String(path || "").split(".").map((p) => p.trim()).filter(Boolean);
  let cur: unknown = obj;
  for (const part of parts) {
    if (!isRecord(cur)) return undefined;
    cur = cur[part];
  }
  return cur;
}

function parseNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const cleaned = value.replace(",", ".").replace(/[^\d.]/g, "");
    const n = Number(cleaned);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return isRecord(value) ? value : null;
}

function normalizeLojaNumero(value: unknown) {
  return String(value ?? "")
    .toUpperCase()
    .replace(/[^A-Z0-9-]/g, "")
    .slice(0, 12)
    .trim();
}

function parseConsultaInput(input: {
  ean?: unknown;
  codigo_interno?: unknown;
  codigo_barras?: unknown;
  nome?: unknown;
}) {
  const barcodeRaw = String(input.codigo_barras ?? "").trim();
  const barcodeDigits = normalizeBarcodeDigits(barcodeRaw);
  if (barcodeDigits) {
    if (barcodeDigits.length >= 5 && barcodeDigits.slice(0, 1) === "2") {
      return { tipo: "balanca", codigo: barcodeDigits.slice(1, 5), barcode: barcodeDigits };
    }
    return { tipo: "barcode", codigo: barcodeDigits, barcode: barcodeDigits };
  }

  const ean = normalizeEan(String(input.ean ?? ""));
  if (ean) return { tipo: "ean", codigo: ean };

  const interno = normalizeBarcodeDigits(String(input.codigo_interno ?? ""));
  if (interno) return { tipo: "interno", codigo: interno };

  const nome = String(input.nome ?? "").trim();
  if (nome) return { tipo: "nome", codigo: "", nome };

  return { tipo: "vazio", codigo: "" };
}

async function readTextSafe(res: Response) {
  return await res.text().catch(() => "");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Método não permitido" }), { status: 405, headers: jsonHeaders });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  try {
    const body = await req.json().catch(() => ({}));
    const action = String(body?.action ?? "consultar");
    const codigoEmpresa = normalizeEmpresaCode(body?.codigo_empresa ?? "");
    const numeroLoja = normalizeLojaNumero(body?.numero_loja ?? "");
    const consultaInput = parseConsultaInput({
      ean: body?.ean,
      codigo_interno: body?.codigo_interno,
      codigo_barras: body?.codigo_barras,
      nome: body?.nome,
    });

    if (!codigoEmpresa) {
      return new Response(JSON.stringify({ error: "Informe codigo_empresa" }), { status: 400, headers: jsonHeaders });
    }

    const { data: empresa, error: empErr } = await supabase
      .from("empresas")
      .select("id, ativo")
      .eq("codigo_vinculo", codigoEmpresa)
      .maybeSingle();
    if (empErr) throw empErr;
    const empresaRec = asRecord(empresa);
    const empresaId = typeof empresaRec?.id === "string" ? empresaRec.id : null;
    const empresaAtivo = typeof empresaRec?.ativo === "boolean" ? empresaRec.ativo : null;
    if (!empresaId || empresaAtivo === false) {
      return new Response(JSON.stringify({ error: "Empresa inválida ou inativa" }), { status: 404, headers: jsonHeaders });
    }

    const { data: cfg, error: cfgErr } = await supabase
      .from("empresa_preco_config")
      .select("*")
      .eq("empresa_id", empresaId)
      .eq("ativo", true)
      .maybeSingle();
    if (cfgErr) throw cfgErr;
    const cfgRec = asRecord(cfg);

    if (action === "status") {
      return new Response(
        JSON.stringify({
          ok: true,
          empresa_id: empresaId,
          has_config: !!cfgRec,
        }),
        { headers: jsonHeaders },
      );
    }

    if (!cfgRec) {
      return new Response(
        JSON.stringify({ error: "Configuração de consulta de preço não encontrada para esta empresa" }),
        { status: 404, headers: jsonHeaders },
      );
    }

    if (!numeroLoja) {
      return new Response(JSON.stringify({ error: "Informe numero_loja" }), { status: 400, headers: jsonHeaders });
    }
    if (consultaInput.tipo === "vazio") {
      return new Response(JSON.stringify({ error: "Informe ean, codigo_barras, codigo_interno ou nome" }), { status: 400, headers: jsonHeaders });
    }

    let codigoConsulta = consultaInput.codigo;
    if (consultaInput.tipo === "nome") {
      const nome = consultaInput.nome ?? "";
      const { data: localHit } = await supabase
        .from("produtos")
        .select("ean")
        .ilike("nome", `%${nome}%`)
        .limit(1)
        .maybeSingle();
      const localRec = asRecord(localHit);
      const localEan = normalizeEan(String(localRec?.ean ?? ""));
      if (!localEan) {
        return new Response(JSON.stringify({ error: "Produto não encontrado (nome)" }), { status: 404, headers: jsonHeaders });
      }
      codigoConsulta = localEan;
    }
    if (!codigoConsulta) {
      return new Response(JSON.stringify({ error: "Código inválido" }), { status: 400, headers: jsonHeaders });
    }

    const now = new Date();
    const minValid = new Date(now.getTime() + 60_000).toISOString();

    let token: string | null = null;
    let tokenType: string = "Bearer";

    if (String(cfgRec.consulta_auth_type ?? "bearer").toLowerCase() === "bearer") {
      const { data: tokenRow } = await supabase
        .from("empresa_token_cache")
        .select("token, token_type, expira_em")
        .eq("empresa_id", empresaId)
        .maybeSingle();

      const tokenRec = asRecord(tokenRow);
      if (tokenRec && String(tokenRec.expira_em ?? "") > minValid) {
        token = String(tokenRec.token ?? "");
        tokenType = String(tokenRec.token_type ?? "bearer");
      } else {
        const tokenHeaders = isRecord(cfgRec.token_headers) ? cfgRec.token_headers : {};
        const tokenMethod = String(cfgRec.token_method ?? "POST").toUpperCase();
        const tokenBodyObj = cfgRec.token_body ?? {};
        const tokenBody = typeof tokenBodyObj === "string" ? tokenBodyObj : JSON.stringify(tokenBodyObj);

        const tokenRes = await fetch(String(cfgRec.token_url), {
          method: tokenMethod,
          headers: {
            "Content-Type": "application/json",
            ...(tokenHeaders as Record<string, string>),
          },
          body: tokenMethod === "GET" ? undefined : tokenBody,
        });

        if (!tokenRes.ok) {
          const text = await readTextSafe(tokenRes);
          return new Response(
            JSON.stringify({ error: text || `Falha no login (${tokenRes.status})` }),
            { status: 502, headers: jsonHeaders },
          );
        }

        const tokenPayload = await tokenRes.json().catch(() => null);
        const tokenValue = getByPath(tokenPayload, String(cfgRec.token_response_path ?? "token"));
        token = typeof tokenValue === "string" ? tokenValue : null;
        if (!token) {
          return new Response(JSON.stringify({ error: "Login não retornou token" }), { status: 502, headers: jsonHeaders });
        }

        const tokenTypeValue = isRecord(tokenPayload) && typeof tokenPayload.token_type === "string"
          ? tokenPayload.token_type
          : "bearer";
        tokenType = tokenTypeValue;

        let expirySeconds = parseNumber(
          cfgRec.token_expiry_field ? getByPath(tokenPayload, String(cfgRec.token_expiry_field)) : undefined,
        );
        if (!expirySeconds) expirySeconds = parseNumber(cfgRec.token_expiry_seconds) ?? 3600;
        const expiraEm = new Date(Date.now() + expirySeconds * 1000).toISOString();

        await supabase
          .from("empresa_token_cache")
          .upsert({ empresa_id: empresaId, token, token_type: tokenType, expira_em: expiraEm }, { onConflict: "empresa_id" });
      }
    }

    const fixedParams = isRecord(cfgRec.consulta_params_fixos) ? cfgRec.consulta_params_fixos : {};
    const params: Record<string, string> = {};
    for (const [k, v] of Object.entries(fixedParams)) params[k] = String(v ?? "");

    const eanParam = String(cfgRec.consulta_ean_param ?? "ean");
    const lojaParam = typeof cfgRec.consulta_loja_param === "string"
      ? String(cfgRec.consulta_loja_param)
      : "loja";

    params[eanParam] = codigoConsulta;
    params[lojaParam] = numeroLoja;

    const consultaMethod = String(cfgRec.consulta_method ?? "GET").toUpperCase();
    const consultaHeaders = isRecord(cfgRec.consulta_headers) ? cfgRec.consulta_headers : {};

    let consultaUrl = String(cfgRec.consulta_url);
    let consultaBody: string | undefined;
    if (consultaMethod === "GET") {
      const u = new URL(consultaUrl);
      for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
      consultaUrl = u.toString();
    } else {
      consultaBody = JSON.stringify(params);
    }

    const authHeader = token
      ? { Authorization: `${tokenType || "Bearer"} ${token}` }
      : {};

    const consultaRes = await fetch(consultaUrl, {
      method: consultaMethod,
      headers: {
        ...(consultaMethod === "GET" ? {} : { "Content-Type": "application/json" }),
        ...(consultaHeaders as Record<string, string>),
        ...authHeader,
      },
      body: consultaMethod === "GET" ? undefined : consultaBody,
    });

    const consultaJson = await consultaRes.json().catch(() => null);
    if (!consultaRes.ok) {
      const msg = isRecord(consultaJson) && typeof consultaJson.message === "string"
        ? consultaJson.message
        : await readTextSafe(consultaRes);
      return new Response(
        JSON.stringify({ error: msg || `Erro na consulta (${consultaRes.status})` }),
        { status: 502, headers: jsonHeaders },
      );
    }

    if (isRecord(consultaJson) && consultaJson.success === false) {
      const msg = typeof consultaJson.message === "string" ? consultaJson.message : "Erro ao consultar preço";
      return new Response(JSON.stringify({ error: msg }), { status: 502, headers: jsonHeaders });
    }

    let data = getByPath(consultaJson, String(cfgRec.data_path ?? "data"));
    if (Array.isArray(data)) data = data[0];
    if (!isRecord(data)) {
      return new Response(JSON.stringify({ error: "Resposta inválida da API de preço" }), { status: 502, headers: jsonHeaders });
    }

    const map = isRecord(cfgRec.mapeamento_campos) ? cfgRec.mapeamento_campos : {};
    const field = (k: string) => {
      const external = (map as Record<string, unknown>)[k];
      if (external == null) return undefined;
      if (typeof external !== "string") return undefined;
      return getByPath(data, external);
    };

    const nome = String(field("nome") ?? (data as Record<string, unknown>).descricao_produto ?? "").trim() || "Produto";
    const eanOut = String(field("ean") ?? (data as Record<string, unknown>).ean ?? codigoConsulta).replace(/\D/g, "") || codigoConsulta;
    const imagem = String(field("imagem_url") ?? (data as Record<string, unknown>).link_imagem ?? "").trim() || null;
    const precoRegular = parseNumber(field("preco_regular") ?? (data as Record<string, unknown>).preco_base);
    const precoClube = parseNumber(field("preco_clube") ?? (data as Record<string, unknown>).preco_clube);
    const precoOferta = parseNumber(
      field("preco_oferta") ??
        (data as Record<string, unknown>).preco_venda ??
        (data as Record<string, unknown>).preco_prop_sellprice ??
        (data as Record<string, unknown>).preco_promocional,
    );
    const precoCampanha = parseNumber(
      (data as Record<string, unknown>).preco_campanha ??
        (data as Record<string, unknown>).campanha_preco,
    );

    const produto = {
      ean: eanOut,
      nome,
      preco: precoCampanha ?? precoOferta ?? precoClube ?? precoRegular ?? null,
      preco_lista: precoRegular ?? null,
      imagem_url_vtex: imagem,
      disponivel: true,
    };

    const precos: Array<{ tipo: string; valor: number; origem: string }> = [];
    if (typeof precoCampanha === "number") precos.push({ tipo: "campanha", valor: precoCampanha, origem: "api_empresa" });
    if (typeof precoOferta === "number") precos.push({ tipo: "promocao", valor: precoOferta, origem: "api_empresa" });
    if (typeof precoClube === "number") precos.push({ tipo: "perfil", valor: precoClube, origem: "api_empresa" });
    if (typeof precoRegular === "number") precos.push({ tipo: "padrao", valor: precoRegular, origem: "api_empresa" });

    const prioridade = ["campanha", "promocao", "perfil", "quantidade", "loja", "importado", "padrao"];
    const escolhido = prioridade.map((t) => precos.find((p) => p.tipo === t)).find(Boolean) ?? null;
    const precoFinal = escolhido?.valor ?? (typeof produto.preco === "number" ? produto.preco : null);
    const precoOriginal = precoFinal != null && typeof precoRegular === "number" && precoRegular > precoFinal ? precoRegular : null;

    return new Response(JSON.stringify({
      ok: true,
      consulta: {
        tipo: consultaInput.tipo,
        codigo: codigoConsulta,
        barcode: consultaInput.barcode ?? null,
        empresa: codigoEmpresa,
        loja: numeroLoja,
      },
      produto,
      precos_disponiveis: precos,
      preco_final: precoFinal,
      preco_original: precoOriginal,
      tipo_preco: escolhido?.tipo ?? null,
    }), { headers: jsonHeaders });
  } catch (e) {
    console.error("api-consulta-preco error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Erro interno" }),
      { status: 500, headers: jsonHeaders },
    );
  }
});
