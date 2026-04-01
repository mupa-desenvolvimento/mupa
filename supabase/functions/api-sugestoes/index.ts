import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const CACHE_TTL_HOURS = 24;

async function getCachedCategories(
  supabase: any, ean: string, tipo: string, chavePerfil: string | null
): Promise<string[] | null> {
  const query = supabase
    .from("sugestoes_cache")
    .select("categorias_ai, criado_em")
    .eq("ean", ean)
    .eq("tipo", tipo);

  if (chavePerfil) {
    query.eq("chave_perfil", chavePerfil);
  } else {
    query.is("chave_perfil", null);
  }

  const { data } = await query.maybeSingle();
  if (!data) return null;

  const age = Date.now() - new Date(data.criado_em).getTime();
  if (age > CACHE_TTL_HOURS * 3600 * 1000) return null;

  return data.categorias_ai;
}

async function setCachedCategories(
  supabase: any, ean: string, tipo: string, chavePerfil: string | null, categorias: string[]
) {
  // Fire and forget - don't await to save time
  supabase.from("sugestoes_cache").upsert(
    { ean, tipo, chave_perfil: chavePerfil, categorias_ai: categorias, criado_em: new Date().toISOString() },
    { onConflict: "ean,tipo,chave_perfil" }
  ).then(() => {});
}

async function fetchAICategories(apiKey: string, systemMsg: string, prompt: string): Promise<string[]> {
  const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash-lite",
      messages: [
        { role: "system", content: systemMsg },
        { role: "user", content: prompt },
      ],
    }),
  });
  if (!resp.ok) return [];
  const data = await resp.json();
  return (data.choices?.[0]?.message?.content || "")
    .split(",").map((c: string) => c.trim().toLowerCase()).filter(Boolean);
}

async function searchProducts(supabase: any, categories: string[], excludeEans: Set<string>, limit: number) {
  // Run all category searches in parallel
  const promises = categories.map(cat =>
    supabase
      .from("produtos")
      .select("ean, nome, nome_curto, marca, categoria, preco, preco_lista, imagem_url_vtex")
      .eq("disponivel", true)
      .or(`nome.ilike.%${cat}%,nome_curto.ilike.%${cat}%,categoria.ilike.%${cat}%`)
      .limit(3)
  );

  const results: any[] = [];
  const responses = await Promise.all(promises);
  
  for (let i = 0; i < responses.length; i++) {
    if (results.length >= limit) break;
    const { data } = responses[i];
    if (data) {
      for (const p of data) {
        if (!excludeEans.has(p.ean) && results.length < limit) {
          excludeEans.add(p.ean);
          results.push({ ...p, motivo: categories[i] });
        }
      }
    }
  }
  return results;
}

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
  const idade = url.searchParams.get("idade");
  const genero = url.searchParams.get("genero");
  const limit = Math.min(parseInt(url.searchParams.get("limit") ?? "6"), 20);

  if (!ean) {
    return new Response(
      JSON.stringify({ error: "Informe ?ean=CODIGO" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  try {
    // Fetch product data
    const { data: produto, error } = await supabase
      .from("produtos")
      .select("ean, nome, nome_curto, marca, categoria_id, categoria, preco, clusters")
      .eq("ean", ean)
      .single();

    if (error || !produto) {
      return new Response(
        JSON.stringify({ error: "Produto não encontrado", ean }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    const existingEans = new Set([ean]);

    // Run ALL three suggestion types in PARALLEL
    const marcaPromise = (async () => {
      let q = supabase
        .from("produtos")
        .select("ean, nome, nome_curto, marca, categoria, preco, preco_lista, imagem_url_vtex")
        .neq("ean", ean)
        .eq("disponivel", true);
      if (produto.marca) q = q.eq("marca", produto.marca);
      const { data } = await q.limit(limit);
      return data ?? [];
    })();

    const complementaresPromise = (async () => {
      if (!LOVABLE_API_KEY) return [];
      try {
        let categories = await getCachedCategories(supabase, ean, "complementares", null);
        if (!categories) {
          const prompt = `Dado o produto "${produto.nome}" (categoria: ${produto.categoria || "desconhecida"}, marca: ${produto.marca || "desconhecida"}), sugira exatamente 5 tipos/categorias de produtos complementares que um cliente provavelmente compraria junto.\nResponda APENAS com os nomes das categorias separados por vírgula, sem explicação.`;
          categories = await fetchAICategories(LOVABLE_API_KEY,
            "Você é um especialista em varejo e cross-sell de supermercado brasileiro. Responda apenas com categorias separadas por vírgula.", prompt);
          if (categories.length > 0) setCachedCategories(supabase, ean, "complementares", null, categories);
        }
        return categories.length > 0 ? await searchProducts(supabase, categories, existingEans, limit) : [];
      } catch (e) { console.error("AI cross-sell error:", e); return []; }
    })();

    const perfilPromise = (async () => {
      if (!LOVABLE_API_KEY || (!idade && !genero)) return [];
      try {
        const chavePerfil = [idade || "", genero || ""].join("|");
        let categories = await getCachedCategories(supabase, ean, "perfil", chavePerfil);
        if (!categories) {
          const perfilDesc = [idade ? `idade: ${idade}` : "", genero ? `gênero: ${genero}` : ""].filter(Boolean).join(", ");
          const prompt = `Um cliente de supermercado com perfil: ${perfilDesc}, está consultando o produto "${produto.nome}".\nSugira exatamente 5 tipos de produtos que essa pessoa teria interesse.\nResponda APENAS com os nomes separados por vírgula.`;
          categories = await fetchAICategories(LOVABLE_API_KEY,
            "Você é um especialista em comportamento de consumo em supermercados brasileiros. Responda apenas com categorias separadas por vírgula.", prompt);
          if (categories.length > 0) setCachedCategories(supabase, ean, "perfil", chavePerfil, categories);
        }
        return categories.length > 0 ? await searchProducts(supabase, categories, existingEans, limit) : [];
      } catch (e) { console.error("AI profile error:", e); return []; }
    })();

    // Wait for all three in parallel
    const [marcaResults, complementares, perfilResults] = await Promise.all([
      marcaPromise, complementaresPromise, perfilPromise
    ]);

    return new Response(
      JSON.stringify({
        produto_consultado: { ean: produto.ean, nome: produto.nome, marca: produto.marca, categoria: produto.categoria },
        sugestoes: { mesma_marca: marcaResults, complementares, perfil: perfilResults },
        parametros_recebidos: { ean, idade: idade || null, genero: genero || null, limit },
        cache_info: { ttl_hours: CACHE_TTL_HOURS },
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
