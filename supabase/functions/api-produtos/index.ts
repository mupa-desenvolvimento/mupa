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
  const query = url.searchParams.get("q");
  const limit = Math.min(parseInt(url.searchParams.get("limit") ?? "10"), 50);

  try {
    // 1. Exact EAN lookup - fastest path
    if (ean) {
      const { data, error } = await supabase
        .from("produtos")
        .select("*")
        .eq("ean", ean)
        .single();

      if (error || !data) {
        return new Response(
          JSON.stringify({ error: "Produto não encontrado", ean }),
          { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      return new Response(
        JSON.stringify({ produto: data }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 2. Description search
    if (query) {
      // Select only needed columns for faster response
      const selectCols = "ean, nome, nome_curto, marca, categoria, preco, preco_lista, disponivel, imagem_url_vtex";
      
      // Direct ilike search (uses gin_trgm index)
      const { data: directResults } = await supabase
        .from("produtos")
        .select(selectCols)
        .or(`nome.ilike.%${query}%,nome_curto.ilike.%${query}%,marca.ilike.%${query}%`)
        .limit(limit);

      if (directResults && directResults.length >= 3) {
        return new Response(
          JSON.stringify({ produtos: directResults, match_type: "direct", total: directResults.length }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // AI-powered fuzzy matching only when direct results are insufficient
      const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
      if (!LOVABLE_API_KEY) {
        return new Response(
          JSON.stringify({ produtos: directResults ?? [], match_type: "direct", total: directResults?.length ?? 0 }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Get candidates with word-level matching
      const words = query.trim().split(/\s+/).filter(w => w.length > 2);
      let candidateQuery = supabase
        .from("produtos")
        .select(selectCols);

      if (words.length > 0) {
        const orConditions = words.map(w => `nome.ilike.%${w}%`).join(",");
        candidateQuery = candidateQuery.or(orConditions);
      }

      const { data: candidates } = await candidateQuery.limit(50);

      if (!candidates || candidates.length === 0) {
        return new Response(
          JSON.stringify({ produtos: [], match_type: "ai", total: 0 }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Use fastest model for fuzzy matching
      const productList = candidates.map((p, i) => `${i}: ${p.nome} | ${p.marca ?? ""}`).join("\n");

      const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash-lite",
          messages: [
            {
              role: "system",
              content: `Você é um assistente de busca de produtos de supermercado. O usuário vai descrever um produto de forma parcial, incompleta ou com erros de digitação. Identifique os produtos mais relevantes da lista.\nRetorne APENAS os índices separados por vírgula. Máximo ${limit}. Se nenhum corresponder, retorne "NONE".`
            },
            {
              role: "user",
              content: `Busca: "${query}"\n\nProdutos:\n${productList}`
            }
          ],
        }),
      });

      if (!aiResponse.ok) {
        return new Response(
          JSON.stringify({ produtos: directResults ?? [], match_type: "direct_fallback", total: directResults?.length ?? 0 }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const aiData = await aiResponse.json();
      const aiText = aiData.choices?.[0]?.message?.content?.trim() ?? "NONE";

      if (aiText === "NONE") {
        return new Response(
          JSON.stringify({ produtos: [], match_type: "ai", total: 0 }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const indices = aiText
        .replace(/[^0-9,]/g, "")
        .split(",")
        .map(Number)
        .filter((n: number) => !isNaN(n) && n >= 0 && n < candidates.length)
        .slice(0, limit);

      const aiResults = indices.map((i: number) => candidates[i]);

      return new Response(
        JSON.stringify({ produtos: aiResults, match_type: "ai", total: aiResults.length }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ error: "Informe ?ean=CODIGO ou ?q=DESCRICAO" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("API error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Erro interno" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
