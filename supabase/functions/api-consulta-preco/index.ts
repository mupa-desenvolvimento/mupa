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
    const numeroLoja = normalizeLoja(body?.numero_loja ?? "");
    const ean = normalizeEan(body?.ean ?? "");

    if (!codigoEmpresa) {
      return new Response(JSON.stringify({ error: "Informe codigo_empresa" }), { status: 400, headers: jsonHeaders });
    }

    const { data: empresa, error: empErr } = await supabase
      .from("empresas")
      .select("id, ativo")
      .eq("codigo_vinculo", codigoEmpresa)
      .maybeSingle();
    if (empErr) throw empErr;
    if (!empresa || empresa.ativo === false) {
      return new Response(JSON.stringify({ error: "Empresa inválida ou inativa" }), { status: 404, headers: jsonHeaders });
    }

    const { data: cfg, error: cfgErr } = await supabase
      .from("empresa_preco_config")
      .select("*")
      .eq("empresa_id", empresa.id)
      .eq("ativo", true)
      .maybeSingle();
    if (cfgErr) throw cfgErr;

    if (action === "status") {
      return new Response(
        JSON.stringify({
          ok: true,
          empresa_id: empresa.id,
          has_config: !!cfg,
        }),
        { headers: jsonHeaders },
      );
    }

    if (!cfg) {
      return new Response(
        JSON.stringify({ error: "Configuração de consulta de preço não encontrada para esta empresa" }),
        { status: 404, headers: jsonHeaders },
      );
    }

    if (!numeroLoja) {
      return new Response(JSON.stringify({ error: "Informe numero_loja" }), { status: 400, headers: jsonHeaders });
    }
    if (!ean) {
      return new Response(JSON.stringify({ error: "Informe ean" }), { status: 400, headers: jsonHeaders });
    }

    const now = new Date();
    const minValid = new Date(now.getTime() + 60_000).toISOString();

    let token: string | null = null;
    let tokenType: string = "Bearer";

    if (String(cfg.consulta_auth_type ?? "bearer").toLowerCase() === "bearer") {
      const { data: tokenRow } = await supabase
        .from("empresa_token_cache")
        .select("token, token_type, expira_em")
        .eq("empresa_id", empresa.id)
        .maybeSingle();

      if (tokenRow && String(tokenRow.expira_em) > minValid) {
        token = String(tokenRow.token);
        tokenType = String(tokenRow.token_type ?? "bearer");
      } else {
        const tokenHeaders = isRecord(cfg.token_headers) ? cfg.token_headers : {};
        const tokenMethod = String(cfg.token_method ?? "POST").toUpperCase();
        const tokenBodyObj = cfg.token_body ?? {};
        const tokenBody = typeof tokenBodyObj === "string" ? tokenBodyObj : JSON.stringify(tokenBodyObj);

        const tokenRes = await fetch(String(cfg.token_url), {
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
        const tokenValue = getByPath(tokenPayload, String(cfg.token_response_path ?? "token"));
        token = typeof tokenValue === "string" ? tokenValue : null;
        if (!token) {
          return new Response(JSON.stringify({ error: "Login não retornou token" }), { status: 502, headers: jsonHeaders });
        }

        const tokenTypeValue = isRecord(tokenPayload) && typeof tokenPayload.token_type === "string"
          ? tokenPayload.token_type
          : "bearer";
        tokenType = tokenTypeValue;

        let expirySeconds = parseNumber(
          cfg.token_expiry_field ? getByPath(tokenPayload, String(cfg.token_expiry_field)) : undefined,
        );
        if (!expirySeconds) expirySeconds = parseNumber(cfg.token_expiry_seconds) ?? 3600;
        const expiraEm = new Date(Date.now() + expirySeconds * 1000).toISOString();

        await supabase
          .from("empresa_token_cache")
          .upsert({ empresa_id: empresa.id, token, token_type: tokenType, expira_em: expiraEm }, { onConflict: "empresa_id" });
      }
    }

    const fixedParams = isRecord(cfg.consulta_params_fixos) ? cfg.consulta_params_fixos : {};
    const params: Record<string, string> = {};
    for (const [k, v] of Object.entries(fixedParams)) params[k] = String(v ?? "");

    const eanParam = String(cfg.consulta_ean_param ?? "ean");
    const lojaParam = typeof (cfg as Record<string, unknown>).consulta_loja_param === "string"
      ? String((cfg as Record<string, unknown>).consulta_loja_param)
      : "loja";

    params[eanParam] = ean;
    params[lojaParam] = numeroLoja;

    const consultaMethod = String(cfg.consulta_method ?? "GET").toUpperCase();
    const consultaHeaders = isRecord(cfg.consulta_headers) ? cfg.consulta_headers : {};

    let consultaUrl = String(cfg.consulta_url);
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

    let data = getByPath(consultaJson, String(cfg.data_path ?? "data"));
    if (Array.isArray(data)) data = data[0];
    if (!isRecord(data)) {
      return new Response(JSON.stringify({ error: "Resposta inválida da API de preço" }), { status: 502, headers: jsonHeaders });
    }

    const map = isRecord(cfg.mapeamento_campos) ? cfg.mapeamento_campos : {};
    const field = (k: string) => {
      const external = (map as Record<string, unknown>)[k];
      if (external == null) return undefined;
      if (typeof external !== "string") return undefined;
      return getByPath(data, external);
    };

    const nome = String(field("nome") ?? (data as Record<string, unknown>).descricao_produto ?? "").trim() || "Produto";
    const eanOut = String(field("ean") ?? (data as Record<string, unknown>).ean ?? ean).replace(/\D/g, "") || ean;
    const imagem = String(field("imagem_url") ?? (data as Record<string, unknown>).link_imagem ?? "").trim() || null;
    const precoRegular = parseNumber(field("preco_regular") ?? (data as Record<string, unknown>).preco_base);
    const precoClube = parseNumber(field("preco_clube") ?? (data as Record<string, unknown>).preco_clube);

    const produto = {
      ean: eanOut,
      nome,
      preco: precoClube ?? precoRegular ?? null,
      preco_lista: precoRegular ?? null,
      imagem_url_vtex: imagem,
      disponivel: true,
    };

    return new Response(JSON.stringify({ produto }), { headers: jsonHeaders });
  } catch (e) {
    console.error("api-consulta-preco error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Erro interno" }),
      { status: 500, headers: jsonHeaders },
    );
  }
});

