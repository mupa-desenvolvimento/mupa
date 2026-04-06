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
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object") return null;
  return value as Record<string, unknown>;
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
    const action = String(body?.action ?? "activate");
    const codigoEmpresa = normalizeCode(String(body?.codigo_empresa ?? ""));
    const deviceIdRaw = String(body?.device_id ?? "").trim() || null;
    const deviceKeyRaw = String(body?.device_key ?? "").trim() || null;
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
    const empresaRec = asRecord(empresa);
    const empresaId = typeof empresaRec?.id === "string" ? empresaRec.id : null;
    const empresaAtivo = typeof empresaRec?.ativo === "boolean" ? empresaRec.ativo : null;
    if (!empresaId) {
      return new Response(JSON.stringify({ error: "Código inválido" }), { status: 404, headers: jsonHeaders });
    }
    if (empresaAtivo === false) {
      return new Response(JSON.stringify({ error: "Empresa inativa" }), { status: 403, headers: jsonHeaders });
    }

    if (action === "validate_empresa") {
      return new Response(
        JSON.stringify({ empresa: { id: empresaId, codigo_vinculo: codigoEmpresa } }),
        { headers: jsonHeaders },
      );
    }

    const now = new Date().toISOString();

    const deviceId = deviceIdRaw && UUID_RE.test(deviceIdRaw) ? deviceIdRaw : null;
    const deviceKey = deviceKeyRaw || (!deviceId && deviceIdRaw ? normalizeShortText(deviceIdRaw, 64) : null);

    const selectExisting = async () => {
      if (deviceId) {
        return await supabase
          .from("dispositivos")
          .select("id, empresa_id, codigo_ativacao")
          .eq("id", deviceId)
          .maybeSingle();
      }
      if (deviceKey) {
        return await supabase
          .from("dispositivos")
          .select("id, empresa_id, codigo_ativacao")
          .eq("device_key", deviceKey)
          .maybeSingle();
      }
      return { data: null, error: null } as { data: null; error: null };
    };

    {
      const { data: existing, error: existingError } = await selectExisting();

      if (existingError) throw existingError;

      const existingRec = asRecord(existing);
      const existingId = typeof existingRec?.id === "string" ? existingRec.id : null;
      const existingCodigoAtivacao =
        typeof existingRec?.codigo_ativacao === "string" ? existingRec.codigo_ativacao : null;
      if (existingId) {
        const baseUpdate = {
          empresa_id: empresaId,
          ativo: true,
          ativado_em: now,
          ultimo_acesso: now,
          nome: deviceName,
          grupo_id: grupoId,
          loja_numero: lojaNumero,
          device_key: deviceKey,
        } as Record<string, unknown>;

        let updateError: unknown = null;
        {
          const { error } = await supabase
            .from("dispositivos")
            .update(baseUpdate)
            .eq("id", existingId);
          updateError = error;
        }

        if (updateError) {
          const msg = updateError instanceof Error ? updateError.message : String(updateError);
          const missingLoja = msg.includes("loja_numero") && msg.includes("column");
          const missingKey = msg.includes("device_key") && msg.includes("column");
          if (missingLoja || missingKey) {
            if (missingLoja) delete baseUpdate.loja_numero;
            if (missingKey) delete baseUpdate.device_key;
            const { error } = await supabase
              .from("dispositivos")
              .update(baseUpdate)
              .eq("id", existingId);
            if (error) throw error;
            const warnings: string[] = [];
            if (missingLoja) warnings.push("Coluna dispositivos.loja_numero não existe. Aplique a migration sugerida para salvar o número da loja.");
            if (missingKey) warnings.push("Coluna dispositivos.device_key não existe. Aplique a migration sugerida para vincular ID externo.");
            return new Response(
              JSON.stringify({
                dispositivo: { id: existingId, empresa_id: empresaId, codigo_ativacao: existingCodigoAtivacao },
                warnings,
              }),
              { headers: jsonHeaders },
            );
          }
          throw updateError;
        }

        return new Response(
          JSON.stringify({
            dispositivo: { id: existingId, empresa_id: empresaId, codigo_ativacao: existingCodigoAtivacao },
          }),
          { headers: jsonHeaders },
        );
      }
    }

    const baseInsert = {
      empresa_id: empresaId,
      nome: deviceName,
      ativo: true,
      ativado_em: now,
      ultimo_acesso: now,
      grupo_id: grupoId,
      loja_numero: lojaNumero,
      device_key: deviceKey,
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
      const missingLoja = msg.includes("loja_numero") && msg.includes("column");
      const missingKey = msg.includes("device_key") && msg.includes("column");
      if (missingLoja || missingKey) {
        if (missingLoja) delete baseInsert.loja_numero;
        if (missingKey) delete baseInsert.device_key;
        const { data, error } = await supabase
          .from("dispositivos")
          .insert(baseInsert)
          .select("id, empresa_id, codigo_ativacao")
          .single();
        if (error) throw error;
        const insertedRec = asRecord(data);
        const inserted = insertedRec
          ? {
              id: typeof insertedRec.id === "string" ? insertedRec.id : "",
              empresa_id: typeof insertedRec.empresa_id === "string" ? insertedRec.empresa_id : null,
              codigo_ativacao: typeof insertedRec.codigo_ativacao === "string" ? insertedRec.codigo_ativacao : "",
            }
          : null;
        const warnings: string[] = [];
        if (missingLoja) warnings.push("Coluna dispositivos.loja_numero não existe. Aplique a migration sugerida para salvar o número da loja.");
        if (missingKey) warnings.push("Coluna dispositivos.device_key não existe. Aplique a migration sugerida para vincular ID externo.");
        return new Response(
          JSON.stringify({
            dispositivo: inserted,
            warnings,
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
