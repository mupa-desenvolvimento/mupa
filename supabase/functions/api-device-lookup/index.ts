import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const jsonHeaders = { ...corsHeaders, "Content-Type": "application/json; charset=utf-8" };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function cleanId(raw: string) {
  return String(raw ?? "").trim().replace(/`/g, "").replace(/^"+|"+$/g, "").replace(/^'+|'+$/g, "");
}

function normalizeDeviceKey(raw: string) {
  return cleanId(raw).replace(/[^A-Za-z0-9_-]/g, "").slice(0, 64);
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "GET" && req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Método não permitido" }), { status: 405, headers: jsonHeaders });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  try {
    const url = new URL(req.url);
    let deviceId = cleanId(url.searchParams.get("device_id") ?? url.searchParams.get("device_key") ?? "");
    if (!deviceId && req.method === "POST") {
      const body = await req.json().catch(() => ({}));
      deviceId = cleanId(body?.device_id ?? body?.device_key ?? "");
    }

    if (!deviceId) {
      return new Response(JSON.stringify({ error: "Informe device_id" }), { status: 400, headers: jsonHeaders });
    }

    const isUuid = UUID_RE.test(deviceId);
    const deviceKey = isUuid ? null : normalizeDeviceKey(deviceId);
    if (!isUuid && !deviceKey) {
      return new Response(JSON.stringify({ error: "device_id inválido" }), { status: 400, headers: jsonHeaders });
    }

    const devQuery = supabase
      .from("dispositivos")
      .select("id, empresa_id, nome, grupo_id, loja_numero, ativo, ativado_em, ultimo_acesso, codigo_ativacao, device_key");

    const { data: dispositivo, error: devErr } = isUuid
      ? await devQuery.eq("id", deviceId).maybeSingle()
      : await devQuery.eq("device_key", deviceKey!).maybeSingle();
    if (devErr) throw devErr;
    if (!dispositivo) {
      return new Response(JSON.stringify({ found: false }), { headers: jsonHeaders });
    }

    let empresa: { id: string; codigo_vinculo: string | null } | null = null;
    if (dispositivo.empresa_id) {
      const { data: emp, error: empErr } = await supabase
        .from("empresas")
        .select("id, codigo_vinculo")
        .eq("id", dispositivo.empresa_id)
        .maybeSingle();
      if (empErr) throw empErr;
      empresa = emp as typeof empresa;
    }

    return new Response(
      JSON.stringify({
        found: true,
        dispositivo: {
          id: dispositivo.id,
          nome: dispositivo.nome,
          empresa_id: dispositivo.empresa_id,
          grupo_id: dispositivo.grupo_id,
          loja_numero: dispositivo.loja_numero ?? null,
          ativo: dispositivo.ativo,
          ativado_em: dispositivo.ativado_em ?? null,
          ultimo_acesso: dispositivo.ultimo_acesso ?? null,
          codigo_ativacao: dispositivo.codigo_ativacao ?? null,
          device_key: dispositivo.device_key ?? null,
        },
        empresa: empresa ? { id: empresa.id, codigo_vinculo: empresa.codigo_vinculo } : null,
      }),
      { headers: jsonHeaders },
    );
  } catch (e: unknown) {
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Erro interno" }),
      { status: 500, headers: jsonHeaders },
    );
  }
});

