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

function base64ToBytes(base64: string) {
  const bin = atob(base64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

function publicUrl(supabaseUrl: string, bucket: string, path: string) {
  const base = supabaseUrl.replace(/\/+$/, "");
  const p = path.replace(/^\/+/, "");
  return `${base}/storage/v1/object/public/${bucket}/${p}`;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Método não permitido" }), { status: 405, headers: jsonHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabase = createClient(
    supabaseUrl,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  try {
    const body = await req.json().catch(() => ({}));
    const codigoEmpresa = normalizeEmpresaCode(body?.codigo_empresa ?? "");
    const numeroLoja = normalizeLoja(body?.numero_loja ?? "");
    const ean = normalizeEan(body?.ean ?? "");
    const pngBase64 = String(body?.png_base64 ?? "").trim();

    if (!codigoEmpresa) return new Response(JSON.stringify({ error: "Informe codigo_empresa" }), { status: 400, headers: jsonHeaders });
    if (!numeroLoja) return new Response(JSON.stringify({ error: "Informe numero_loja" }), { status: 400, headers: jsonHeaders });
    if (!ean) return new Response(JSON.stringify({ error: "Informe ean" }), { status: 400, headers: jsonHeaders });
    if (!pngBase64) return new Response(JSON.stringify({ error: "Informe png_base64" }), { status: 400, headers: jsonHeaders });

    const bytes = base64ToBytes(pngBase64);
    if (bytes.byteLength > 2_500_000) {
      return new Response(JSON.stringify({ error: "Imagem muito grande" }), { status: 413, headers: jsonHeaders });
    }

    const path = `nobg-v2/${codigoEmpresa}/${numeroLoja}/${ean}.png`;
    const { error: upErr } = await supabase.storage
      .from("produto-nobg")
      .upload(path, bytes, { upsert: true, contentType: "image/png", cacheControl: "3600" });
    if (upErr) throw upErr;

    return new Response(JSON.stringify({ ok: true, url: publicUrl(supabaseUrl, "produto-nobg", path) }), { headers: jsonHeaders });
  } catch (e: unknown) {
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Erro interno" }),
      { status: 500, headers: jsonHeaders },
    );
  }
});

