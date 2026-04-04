import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const jsonHeaders = { ...corsHeaders, "Content-Type": "application/json; charset=utf-8" };

function normalizeCode(input: string) {
  return input.replace(/[^A-Za-z0-9]/g, "").toUpperCase().trim();
}

function normalizeShortText(input: string, maxLen: number) {
  const raw = String(input ?? "");
  const trimmed = raw.replace(/\s+/g, " ").trim();
  let out = "";
  for (let i = 0; i < trimmed.length; i += 1) {
    const c = trimmed.charCodeAt(i);
    if (c < 32 || c === 127) continue;
    out += trimmed[i];
    if (out.length >= maxLen) break;
  }
  return out;
}

const EMPRESA_CODE_RE = /^[A-Z]{3}[0-9]{3}$/;

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
    const action = String(body?.action ?? "activate");
    const codigoEmpresa = normalizeCode(String(body?.codigo_empresa ?? ""));
    const deviceId = String(body?.device_id ?? "").trim() || null;
    const deviceName = normalizeShortText(body?.device_name ?? "Terminal", 40) || "Terminal";
    const grupoId = String(body?.grupo_id ?? "").trim() || null;
    const lojaNumero = normalizeShortText(body?.loja_numero ?? "", 12) || null;

    if (!codigoEmpresa) {
      return new Response(JSON.stringify({ error: "Informe codigo_empresa" }), { status: 400, headers: jsonHeaders });
    }
    if (!EMPRESA_CODE_RE.test(codigoEmpresa)) {
      return new Response(
        JSON.stringify({ error: "codigo_empresa inválido. Use o formato ABC123." }),
        { status: 400, headers: jsonHeaders },
      );
    }

    const { data: empresa, error: empresaError } = await supabase
      .from("empresas")
      .select("id, ativo")
      .eq("codigo_vinculo", codigoEmpresa)
      .maybeSingle();

    if (empresaError) throw empresaError;
    if (!empresa) {
      return new Response(JSON.stringify({ error: "Código inválido" }), { status: 404, headers: jsonHeaders });
    }
    if (empresa.ativo === false) {
      return new Response(JSON.stringify({ error: "Empresa inativa" }), { status: 403, headers: jsonHeaders });
    }

    if (action === "validate_empresa") {
      return new Response(
        JSON.stringify({ empresa: { id: empresa.id, codigo_vinculo: codigoEmpresa } }),
        { headers: jsonHeaders },
      );
    }

    const now = new Date().toISOString();

    if (deviceId) {
      const { data: existing, error: existingError } = await supabase
        .from("dispositivos")
        .select("id, empresa_id, codigo_ativacao")
        .eq("id", deviceId)
        .maybeSingle();

      if (existingError) throw existingError;

      if (existing) {
        const baseUpdate = {
          empresa_id: empresa.id,
          ativo: true,
          ativado_em: now,
          ultimo_acesso: now,
          nome: deviceName,
          grupo_id: grupoId,
          loja_numero: lojaNumero,
        } as Record<string, unknown>;

        let updateError: unknown = null;
        {
          const { error } = await supabase
            .from("dispositivos")
            .update(baseUpdate)
            .eq("id", existing.id);
          updateError = error;
        }

        if (updateError) {
          const msg = updateError instanceof Error ? updateError.message : String(updateError);
          if (msg.includes("loja_numero") && msg.includes("column")) {
            delete baseUpdate.loja_numero;
            const { error } = await supabase
              .from("dispositivos")
              .update(baseUpdate)
              .eq("id", existing.id);
            if (error) throw error;
            return new Response(
              JSON.stringify({
                dispositivo: { id: existing.id, empresa_id: empresa.id, codigo_ativacao: existing.codigo_ativacao },
                warnings: ["Coluna dispositivos.loja_numero não existe. Aplique a migration sugerida para salvar o número da loja."],
              }),
              { headers: jsonHeaders },
            );
          }
          throw updateError;
        }

        return new Response(
          JSON.stringify({
            dispositivo: { id: existing.id, empresa_id: empresa.id, codigo_ativacao: existing.codigo_ativacao },
          }),
          { headers: jsonHeaders },
        );
      }
    }

    const baseInsert = {
      empresa_id: empresa.id,
      nome: deviceName,
      ativo: true,
      ativado_em: now,
      ultimo_acesso: now,
      grupo_id: grupoId,
      loja_numero: lojaNumero,
    } as Record<string, unknown>;

    let createError: unknown = null;
    let created: { id: string; empresa_id: string | null; codigo_ativacao: string } | null = null;
    {
      const res = await supabase
        .from("dispositivos")
        .insert(baseInsert)
        .select("id, empresa_id, codigo_ativacao")
        .single();
      createError = res.error;
      created = res.data as typeof created;
    }

    if (createError) {
      const msg = createError instanceof Error ? createError.message : String(createError);
      if (msg.includes("loja_numero") && msg.includes("column")) {
        delete baseInsert.loja_numero;
        const { data, error } = await supabase
          .from("dispositivos")
          .insert(baseInsert)
          .select("id, empresa_id, codigo_ativacao")
          .single();
        if (error) throw error;
        return new Response(
          JSON.stringify({
            dispositivo: data,
            warnings: ["Coluna dispositivos.loja_numero não existe. Aplique a migration sugerida para salvar o número da loja."],
          }),
          { headers: jsonHeaders },
        );
      }
      throw createError;
    }

    return new Response(JSON.stringify({ dispositivo: created }), { headers: jsonHeaders });
  } catch (e) {
    console.error("Activation error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Erro interno" }),
      { status: 500, headers: jsonHeaders },
    );
  }
});

