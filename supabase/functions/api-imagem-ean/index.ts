import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const jsonHeaders = { ...corsHeaders, "Content-Type": "application/json; charset=utf-8" };

// Busca pública do catálogo VTEX por EAN (não exige token).
const CATALOG_SEARCH_BASE = (Deno.env.get("CATALOG_SEARCH_URL") ??
  "https://superrissul.vtexcommercestable.com.br/api/catalog_system/pub/products/search")
  .replace(/\/+$/, "");

function normalizeEan(input: unknown) {
  return String(input ?? "").replace(/\D/g, "").trim();
}

async function fetchImagemPorEan(ean: string): Promise<string | null> {
  const url = `${CATALOG_SEARCH_BASE}?fq=alternateIds_Ean:${encodeURIComponent(ean)}`;
  const res = await fetch(url, { headers: { Accept: "application/json" } }).catch(() => null);
  if (!res || !res.ok) return null;
  const data = await res.json().catch(() => null);
  if (!Array.isArray(data)) return null;
  for (const produto of data) {
    for (const item of produto?.items ?? []) {
      if (normalizeEan(item?.ean) && normalizeEan(item.ean) !== ean) continue;
      const img = item?.images?.[0]?.imageUrl;
      if (typeof img === "string" && img) return img;
    }
  }
  return null;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const url = new URL(req.url);
  let ean = normalizeEan(url.searchParams.get("ean"));
  let salvar = url.searchParams.get("salvar") !== "false";

  if (req.method === "POST") {
    const body = await req.json().catch(() => ({}));
    ean = normalizeEan(body?.ean ?? ean);
    if (typeof body?.salvar === "boolean") salvar = body.salvar;
  }

  if (!ean) {
    return new Response(JSON.stringify({ error: "Informe o ean" }), { status: 400, headers: jsonHeaders });
  }

  const imagem = await fetchImagemPorEan(ean);
  if (!imagem) {
    return new Response(JSON.stringify({ ean, imagem_url: null, atualizado: false }), {
      status: 404,
      headers: jsonHeaders,
    });
  }

  let atualizado = false;
  if (salvar) {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const { error } = await supabase
      .from("produtos")
      .update({ imagem_url_vtex: imagem })
      .eq("ean", ean);
    atualizado = !error;
    if (error) console.error("update imagem falhou:", error.message);
  }

  return new Response(JSON.stringify({ ean, imagem_url: imagem, atualizado }), { headers: jsonHeaders });
});
