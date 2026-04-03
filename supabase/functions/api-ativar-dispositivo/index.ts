import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const jsonHeaders = { ...corsHeaders, "Content-Type": "application/json; charset=utf-8" };

function normalizeCode(input: string) {
  return input.replace(/[^A-Za-z0-9]/g, "").toUpperCase().trim();
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
    const codigoEmpresa = normalizeCode(String(body?.codigo_empresa ?? ""));
    const deviceId = String(body?.device_id ?? "").trim() || null;
    const deviceName = String(body?.device_name ?? "Terminal").trim() || "Terminal";

    if (!codigoEmpresa) {
      return new Response(JSON.stringify({ error: "Informe codigo_empresa" }), { status: 400, headers: jsonHeaders });
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

    const now = new Date().toISOString();

    if (deviceId) {
      const { data: existing, error: existingError } = await supabase
        .from("dispositivos")
        .select("id, empresa_id, codigo_ativacao")
        .eq("id", deviceId)
        .maybeSingle();

      if (existingError) throw existingError;

      if (existing) {
        const { error: updateError } = await supabase
          .from("dispositivos")
          .update({
            empresa_id: empresa.id,
            ativo: true,
            ativado_em: now,
            ultimo_acesso: now,
            nome: deviceName,
          })
          .eq("id", existing.id);

        if (updateError) throw updateError;

        return new Response(
          JSON.stringify({
            dispositivo: { id: existing.id, empresa_id: empresa.id, codigo_ativacao: existing.codigo_ativacao },
          }),
          { headers: jsonHeaders },
        );
      }
    }

    const { data: created, error: createError } = await supabase
      .from("dispositivos")
      .insert({
        empresa_id: empresa.id,
        nome: deviceName,
        ativo: true,
        ativado_em: now,
        ultimo_acesso: now,
      })
      .select("id, empresa_id, codigo_ativacao")
      .single();

    if (createError) throw createError;

    return new Response(JSON.stringify({ dispositivo: created }), { headers: jsonHeaders });
  } catch (e) {
    console.error("Activation error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Erro interno" }),
      { status: 500, headers: jsonHeaders },
    );
  }
});

