import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  const url = new URL(req.url);
  const ean = url.searchParams.get("ean");
  const limit = Math.min(parseInt(url.searchParams.get("limit") ?? "6"), 20);

  if (!ean) {
    return new Response(
      JSON.stringify({ error: "Informe ?ean=CODIGO" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  try {
    // Find the source product
    const { data: produto, error } = await supabase
      .from("produtos")
      .select("ean, nome, marca, categoria_id, categoria, preco")
      .eq("ean", ean)
      .single();

    if (error || !produto) {
      return new Response(
        JSON.stringify({ error: "Produto não encontrado", ean }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get similar products from same category, excluding the original
    let query = supabase
      .from("produtos")
      .select("ean, nome, nome_curto, marca, categoria, preco, preco_lista, disponivel, imagem_url_vtex")
      .neq("ean", ean)
      .eq("disponivel", true);

    if (produto.categoria_id) {
      query = query.eq("categoria_id", produto.categoria_id);
    } else if (produto.categoria) {
      query = query.eq("categoria", produto.categoria);
    } else {
      // Fallback: same brand
      if (produto.marca) {
        query = query.eq("marca", produto.marca);
      }
    }

    const { data: sugestoes } = await query.limit(limit);

    // If not enough from same category, fill with same brand
    let extras: any[] = [];
    if ((sugestoes?.length ?? 0) < limit && produto.marca) {
      const existing = new Set([ean, ...(sugestoes ?? []).map(s => s.ean)]);
      const { data: brandResults } = await supabase
        .from("produtos")
        .select("ean, nome, nome_curto, marca, categoria, preco, preco_lista, disponivel, imagem_url_vtex")
        .eq("marca", produto.marca)
        .eq("disponivel", true)
        .limit(limit);

      extras = (brandResults ?? []).filter(p => !existing.has(p.ean));
    }

    const combined = [...(sugestoes ?? []), ...extras].slice(0, limit);

    return new Response(
      JSON.stringify({
        produto_consultado: { ean: produto.ean, nome: produto.nome, marca: produto.marca },
        sugestoes: combined,
        total: combined.length,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("Suggestions error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Erro interno" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
