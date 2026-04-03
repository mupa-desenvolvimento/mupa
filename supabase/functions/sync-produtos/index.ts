import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const RISSUL_API = "https://www.rissul.com.br/api/catalog_system/pub/products/search";
const BATCH_SIZE = 50;
const DELAY_MS = 800;
const MAX_EXECUTION_MS = 120_000; // 2 min safety margin

type SyncLogRow = {
  id: string;
  current_offset?: number | null;
  total_produtos?: number | null;
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  try {
    // Check for incomplete sync to resume
    const { data: pendingSync } = await supabase
      .from("sync_log")
      .select("*")
      .eq("status", "running")
      .order("iniciado_em", { ascending: false })
      .limit(1)
      .single();

    let syncLog: SyncLogRow;
    let offset = 0;
    let totalProcessed = 0;

    if (pendingSync) {
      // Resume from where we left off
      syncLog = pendingSync;
      offset = pendingSync.current_offset ?? 0;
      totalProcessed = pendingSync.total_produtos ?? 0;
      console.log(`Resuming sync from offset ${offset}, ${totalProcessed} already processed`);
    } else {
      // Start new sync
      const { data, error } = await supabase
        .from("sync_log")
        .insert({ status: "running", iniciado_em: new Date().toISOString(), current_offset: 0 })
        .select()
        .single();
      if (error) throw error;
      syncLog = data;
    }

    const startTime = Date.now();
    let emptyBatches = 0;

    while (true) {
      // Time check
      if (Date.now() - startTime > MAX_EXECUTION_MS) {
        console.log(`Time limit reached at offset ${offset}. Will resume next run.`);
        await supabase
          .from("sync_log")
          .update({ current_offset: offset, total_produtos: totalProcessed })
          .eq("id", syncLog.id);
        
        // Auto-invoke next run
        try {
          const url = Deno.env.get("SUPABASE_URL") + "/functions/v1/sync-produtos";
          fetch(url, {
            method: "POST",
            headers: {
              "Authorization": `Bearer ${Deno.env.get("SUPABASE_ANON_KEY")}`,
              "Content-Type": "application/json",
            },
          }).catch(() => undefined);
        } catch (e) { console.error(e); }

        return new Response(
          JSON.stringify({ success: true, status: "partial", total: totalProcessed, offset }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const url = `${RISSUL_API}?_from=${offset}&_to=${offset + BATCH_SIZE - 1}`;
      const res = await fetch(url, {
        headers: { "Accept": "application/json", "User-Agent": "MupaCatalog/1.0" },
      });

      if (!res.ok) {
        console.log(`API returned ${res.status} at offset ${offset}`);
        if (res.status === 429) {
          await new Promise((r) => setTimeout(r, 3000));
          continue;
        }
        emptyBatches++;
        if (emptyBatches >= 3) break;
        offset += BATCH_SIZE;
        continue;
      }

      const produtos = await res.json();
      if (!Array.isArray(produtos) || produtos.length === 0) {
        emptyBatches++;
        if (emptyBatches >= 3) break;
        offset += BATCH_SIZE;
        continue;
      }

      emptyBatches = 0;

      // Batch collect records
      const records: Array<Record<string, unknown>> = [];
      for (const produto of produtos) {
        const items = produto.items ?? [];
        for (const item of items) {
          const ean = item.ean ?? item.itemId;
          if (!ean) continue;

          const categorias = produto.categories ?? [];
          const categoria = categorias[0] ?? "";
          const categoriaId = produto.categoryId ?? "";
          const sellers = item.sellers ?? [];
          const offer = sellers[0]?.commertialOffer;
          const preco = offer?.Price ?? null;
          const precoLista = offer?.ListPrice ?? null;
          const disponivel =
            typeof offer?.IsAvailable === "boolean"
              ? offer.IsAvailable
              : typeof offer?.AvailableQuantity === "number"
                ? offer.AvailableQuantity > 0
                : true;
          const images = item.images ?? [];
          const imgUrl = images[0]?.imageUrl ?? null;

          records.push({
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
            imagem_url_azure: `https://sabancoimagenspng.blob.core.windows.net/png1000x1000/${ean}_1.png?sp=rl&st=2025-09-16T14:13:08Z&se=2026-03-16T22:28:08Z&spr=https&sv=2024-11-04&sr=c&sig=55doi7f%2F1M89ZfIPim7tR98%2BHEZJOWr8Ll5ygGkvqMg%3D`,
            imagem_baixada: false,
          });
        }
      }

      // Batch upsert
      if (records.length > 0) {
        const { error: upsertErr } = await supabase
          .from("produtos")
          .upsert(records, { onConflict: "ean" });
        if (upsertErr) {
          console.error(`Batch upsert error at offset ${offset}:`, upsertErr.message);
        } else {
          totalProcessed += records.length;
        }
      }

      // Save progress
      await supabase
        .from("sync_log")
        .update({ current_offset: offset + BATCH_SIZE, total_produtos: totalProcessed })
        .eq("id", syncLog.id);

      offset += BATCH_SIZE;
      await new Promise((r) => setTimeout(r, DELAY_MS));
    }

    // Sync complete — update categories & brands
    const { data: allProds } = await supabase
      .from("produtos")
      .select("categoria_id, categoria, marca")
      .not("categoria_id", "is", null);

    const catMap = new Map<string, string>();
    const brandSet = new Set<string>();
    const catCount = new Map<string, number>();
    const brandCount = new Map<string, number>();

    for (const p of allProds ?? []) {
      if (p.categoria_id) {
        catMap.set(p.categoria_id, p.categoria ?? "");
        catCount.set(p.categoria_id, (catCount.get(p.categoria_id) ?? 0) + 1);
      }
      if (p.marca) {
        brandSet.add(p.marca);
        brandCount.set(p.marca, (brandCount.get(p.marca) ?? 0) + 1);
      }
    }

    const catRecords = [...catMap.entries()].map(([id, cat]) => ({
      id,
      nome: cat.split("/").filter(Boolean).pop() ?? cat,
      caminho: cat,
      total_produtos: catCount.get(id) ?? 0,
    }));
    if (catRecords.length > 0) {
      await supabase.from("categorias").upsert(catRecords, { onConflict: "id" });
    }

    const brandRecords = [...brandSet].map((nome) => ({
      nome,
      total_produtos: brandCount.get(nome) ?? 0,
    }));
    if (brandRecords.length > 0) {
      await supabase.from("marcas").upsert(brandRecords, { onConflict: "nome" });
    }

    // Finalize
    await supabase
      .from("sync_log")
      .update({
        status: "success",
        finalizado_em: new Date().toISOString(),
        total_produtos: totalProcessed,
        current_offset: offset,
      })
      .eq("id", syncLog.id);

    return new Response(
      JSON.stringify({ success: true, status: "complete", total: totalProcessed }),
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
