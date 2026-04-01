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
    // 1. Find source product
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

    // 2. MARCA — same brand, different product
    let marcaQuery = supabase
      .from("produtos")
      .select("ean, nome, nome_curto, marca, categoria, preco, preco_lista, imagem_url_vtex")
      .neq("ean", ean)
      .eq("disponivel", true);

    if (produto.marca) {
      marcaQuery = marcaQuery.eq("marca", produto.marca);
    }
    const { data: marcaResults } = await marcaQuery.limit(limit);

    // 3. COMBINAR — AI-powered cross-sell
    let complementares: any[] = [];
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");

    if (LOVABLE_API_KEY) {
      try {
        const aiPrompt = `Dado o produto "${produto.nome}" (categoria: ${produto.categoria || "desconhecida"}, marca: ${produto.marca || "desconhecida"}), sugira exatamente 5 tipos/categorias de produtos complementares que um cliente provavelmente compraria junto.

Exemplos:
- Pizza congelada → refrigerante, ketchup, queijo ralado, cerveja, sorvete
- Cerveja → petiscos, amendoim, carvão, copo descartável, gelo
- Shampoo → condicionador, creme de pentear, toalha, escova de cabelo

Responda APENAS com os nomes das categorias separados por vírgula, sem explicação.`;

        const aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${LOVABLE_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "google/gemini-3-flash-preview",
            messages: [
              { role: "system", content: "Você é um especialista em varejo e cross-sell de supermercado brasileiro. Responda apenas com categorias separadas por vírgula." },
              { role: "user", content: aiPrompt },
            ],
          }),
        });

        if (aiResp.ok) {
          const aiData = await aiResp.json();
          const categories = (aiData.choices?.[0]?.message?.content || "")
            .split(",")
            .map((c: string) => c.trim().toLowerCase())
            .filter(Boolean);

          if (categories.length > 0) {
            const existingEans = new Set([ean, ...(marcaResults ?? []).map((p: any) => p.ean)]);

            for (const cat of categories) {
              if (complementares.length >= limit) break;

              const { data: catProducts } = await supabase
                .from("produtos")
                .select("ean, nome, nome_curto, marca, categoria, preco, preco_lista, imagem_url_vtex")
                .eq("disponivel", true)
                .or(`nome.ilike.%${cat}%,nome_curto.ilike.%${cat}%,categoria.ilike.%${cat}%`)
                .limit(2);

              if (catProducts) {
                for (const p of catProducts) {
                  if (!existingEans.has(p.ean) && complementares.length < limit) {
                    existingEans.add(p.ean);
                    complementares.push({ ...p, motivo: cat });
                  }
                }
              }
            }
          }
        }
      } catch (aiErr) {
        console.error("AI cross-sell error:", aiErr);
      }
    }

    // 4. PERFIL — AI demographic suggestions (only when idade or genero provided)
    let perfilResults: any[] = [];

    if (LOVABLE_API_KEY && (idade || genero)) {
      try {
        const perfilDesc = [
          idade ? `idade aproximada: ${idade} anos` : "",
          genero ? `gênero: ${genero}` : "",
        ].filter(Boolean).join(", ");

        const perfilPrompt = `Um cliente de supermercado com perfil: ${perfilDesc}, está consultando o produto "${produto.nome}".
Sugira exatamente 5 tipos de produtos que essa pessoa provavelmente teria interesse, considerando o perfil demográfico.

Exemplos:
- Homem 25 anos + cerveja → carvão, carne para churrasco, copo descartável, farofa, refrigerante
- Mulher 35 anos + leite → cereal infantil, achocolatado, biscoito, iogurte, fruta
- Idoso 65 anos + pão → manteiga, café, leite, queijo, presunto

Responda APENAS com os nomes dos produtos/categorias separados por vírgula.`;

        const aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${LOVABLE_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "google/gemini-3-flash-preview",
            messages: [
              { role: "system", content: "Você é um especialista em comportamento de consumo em supermercados brasileiros. Responda apenas com categorias separadas por vírgula." },
              { role: "user", content: perfilPrompt },
            ],
          }),
        });

        if (aiResp.ok) {
          const aiData = await aiResp.json();
          const suggestions = (aiData.choices?.[0]?.message?.content || "")
            .split(",")
            .map((c: string) => c.trim().toLowerCase())
            .filter(Boolean);

          const allExisting = new Set([
            ean,
            ...(marcaResults ?? []).map((p: any) => p.ean),
            ...complementares.map((p: any) => p.ean),
          ]);

          for (const sug of suggestions) {
            if (perfilResults.length >= limit) break;

            const { data: sugProducts } = await supabase
              .from("produtos")
              .select("ean, nome, nome_curto, marca, categoria, preco, preco_lista, imagem_url_vtex")
              .eq("disponivel", true)
              .or(`nome.ilike.%${sug}%,nome_curto.ilike.%${sug}%,categoria.ilike.%${sug}%`)
              .limit(2);

            if (sugProducts) {
              for (const p of sugProducts) {
                if (!allExisting.has(p.ean) && perfilResults.length < limit) {
                  allExisting.add(p.ean);
                  perfilResults.push({ ...p, motivo: sug });
                }
              }
            }
          }
        }
      } catch (aiErr) {
        console.error("AI profile error:", aiErr);
      }
    }

    return new Response(
      JSON.stringify({
        produto_consultado: {
          ean: produto.ean,
          nome: produto.nome,
          marca: produto.marca,
          categoria: produto.categoria,
        },
        sugestoes: {
          mesma_marca: marcaResults ?? [],
          complementares,
          perfil: perfilResults,
        },
        parametros_recebidos: {
          ean,
          idade: idade || null,
          genero: genero || null,
          limit,
        },
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
