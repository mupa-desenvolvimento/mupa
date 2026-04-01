import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const RISSUL_API = "https://www.rissul.com.br/api/catalog_system/pub/products/search";
const BATCH_SIZE = 50;
const DELAY_MS = 1500;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  try {
    // Create sync log entry
    const { data: syncLog, error: logErr } = await supabase
      .from("sync_log")
      .insert({ status: "running", iniciado_em: new Date().toISOString() })
      .select()
      .single();

    if (logErr) throw logErr;

    let offset = 0;
    let totalProcessed = 0;
    let novos = 0;
    let atualizados = 0;
    const categoriaSet = new Map<string, { nome: string; caminho: string }>();
    const marcaSet = new Set<string>();

    while (true) {
      const url = `${RISSUL_API}?_from=${offset}&_to=${offset + BATCH_SIZE - 1}`;
      const res = await fetch(url, {
        headers: {
          "Accept": "application/json",
          "User-Agent": "MupaCatalog/1.0",
        },
      });

      if (!res.ok) {
        console.log(`API returned ${res.status} at offset ${offset}`);
        break;
      }

      const produtos = await res.json();
      if (!Array.isArray(produtos) || produtos.length === 0) break;

      for (const produto of produtos) {
        const items = produto.items ?? [];

        for (const item of items) {
          const ean = item.ean ?? item.itemId;
          if (!ean) continue;

          const categorias = produto.categories ?? [];
          const categoria = categorias[0] ?? "";
          const categoriaId = produto.categoryId ?? "";

          if (categoriaId && categoria) {
            categoriaSet.set(categoriaId, {
              nome: categoria.split("/").filter(Boolean).pop() ?? categoria,
              caminho: categoria,
            });
          }

          if (produto.brand) marcaSet.add(produto.brand);

          const sellers = item.sellers ?? [];
          const offer = sellers[0]?.commertialOffer;
          const preco = offer?.Price ?? null;
          const precoLista = offer?.ListPrice ?? null;
          const disponivel = offer?.IsAvailable ?? (offer?.AvailableQuantity > 0) ?? true;

          const images = item.images ?? [];
          const imgUrl = images[0]?.imageUrl ?? null;

          const azureUrl = `https://sabancoimagenspng.blob.core.windows.net/png1000x1000/${ean}_1.png?sp=rl&st=2025-09-16T14:13:08Z&se=2026-03-16T22:28:08Z&spr=https&sv=2024-11-04&sr=c&sig=55doi7f%2F1M89ZfIPim7tR98%2BHEZJOWr8Ll5ygGkvqMg%3D`;

          const record = {
            product_id: String(produto.productId),
            ean: String(ean),
            nome: produto.productName ?? item.name ?? "Sem nome",
            nome_curto: item.complementName ?? item.nameComplete ?? null,
            marca: produto.brand ?? null,
            categoria,
            categoria_id: categoriaId ? String(categoriaId) : null,
            descricao: produto.description ?? null,
            unidade_medida: item.measurementUnit ?? "un",
            multiplicador: item.unitMultiplier ?? 1,
            link_rissul: produto.link ?? null,
            slug: produto.linkText ?? null,
            clusters: produto.productClusters ?? null,
            preco,
            preco_lista: precoLista,
            disponivel,
            imagem_url_vtex: imgUrl,
            imagem_url_azure: azureUrl,
            imagem_baixada: false,
          };

          const { error: upsertErr, data: upsertData } = await supabase
            .from("produtos")
            .upsert(record, { onConflict: "ean" })
            .select("id")
            .single();

          if (upsertErr) {
            console.error(`Upsert error for EAN ${ean}:`, upsertErr.message);
          } else {
            // Rough heuristic: if it was just created vs updated
            totalProcessed++;
          }
        }
      }

      // Update sync progress
      await supabase
        .from("sync_log")
        .update({ total_produtos: totalProcessed })
        .eq("id", syncLog.id);

      offset += BATCH_SIZE;

      // Delay to avoid rate limiting
      await new Promise((r) => setTimeout(r, DELAY_MS));

      // Safety: stop after 10000 products to avoid timeout
      if (totalProcessed > 10000) break;
    }

    // Save categories
    for (const [id, cat] of categoriaSet) {
      await supabase
        .from("categorias")
        .upsert({ id, nome: cat.nome, caminho: cat.caminho, total_produtos: 0 }, { onConflict: "id" });
    }

    // Save brands
    for (const marca of marcaSet) {
      await supabase
        .from("marcas")
        .upsert({ nome: marca, total_produtos: 0 }, { onConflict: "nome" });
    }

    // Update category/brand counts
    for (const [id] of categoriaSet) {
      const { count } = await supabase
        .from("produtos")
        .select("*", { count: "exact", head: true })
        .eq("categoria_id", id);
      await supabase.from("categorias").update({ total_produtos: count ?? 0 }).eq("id", id);
    }

    for (const marca of marcaSet) {
      const { count } = await supabase
        .from("produtos")
        .select("*", { count: "exact", head: true })
        .eq("marca", marca);
      await supabase.from("marcas").update({ total_produtos: count ?? 0 }).eq("nome", marca);
    }

    // Finalize sync log
    await supabase
      .from("sync_log")
      .update({
        status: "success",
        finalizado_em: new Date().toISOString(),
        total_produtos: totalProcessed,
        produtos_novos: totalProcessed, // simplified
        produtos_atualizados: 0,
      })
      .eq("id", syncLog.id);

    return new Response(
      JSON.stringify({ success: true, total: totalProcessed }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Sync error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
