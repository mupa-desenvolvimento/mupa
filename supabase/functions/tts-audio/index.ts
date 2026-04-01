import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const AZURE_REGION = "brazilsouth";
const AZURE_TOKEN_URL = `https://${AZURE_REGION}.api.cognitive.microsoft.com/sts/v1.0/issuetoken`;
const AZURE_TTS_URL = `https://${AZURE_REGION}.tts.speech.microsoft.com/cognitiveservices/v1`;

const FRASES_OFERTA = [
  "Atenção! Este produto está em oferta! Aproveite agora!",
  "Promoção imperdível! Não perca essa oportunidade!",
  "Oferta especial! Garanta o seu antes que acabe!",
  "Produto em promoção! Economize agora mesmo!",
  "Preço especial por tempo limitado! Aproveite!",
];

const FRASES_SUGESTAO_MARCA = [
  "Confira mais produtos da mesma marca!",
  "Veja outros itens dessa marca!",
  "Essa marca tem mais opções pra você!",
  "Aproveite outros produtos da marca!",
  "Conheça mais dessa marca!",
];

const FRASES_SUGESTAO_COMPLEMENTAR = [
  "Que tal combinar com esses produtos?",
  "Veja o que combina perfeitamente!",
  "Aproveite e leve junto!",
  "Esses produtos combinam muito bem!",
  "Complete sua compra com essas sugestões!",
  "Olha o que vai bem junto!",
];

const FRASES_SUGESTAO_PERFIL = [
  "Selecionamos especialmente para você!",
  "Sugestões pensadas no seu perfil!",
  "Você também pode gostar desses!",
  "Recomendados para você!",
];

const FRASES_INDISPONIVEL = [
  "Produto temporariamente indisponível.",
  "Este produto não está disponível no momento.",
  "Desculpe, produto indisponível no momento.",
  "Produto fora de estoque temporariamente.",
];

function formatPrecoTexto(preco: number): string {
  const reais = Math.floor(preco);
  const centavos = Math.round((preco - reais) * 100);
  if (centavos > 0) return `${reais} reais e ${centavos} centavos`;
  return `${reais} reais`;
}

function buildSSML(texto: string): string {
  return `<speak version='1.0' xml:lang='pt-BR'>
  <voice xml:lang='pt-BR' xml:gender='Female' name='pt-BR-FranciscaNeural'>
    <prosody rate="0%" pitch="0%">${texto}</prosody>
  </voice>
</speak>`;
}

let cachedToken: { token: string; expiresAt: number } | null = null;

async function getAzureToken(apiKey: string): Promise<string> {
  if (cachedToken && Date.now() < cachedToken.expiresAt) return cachedToken.token;
  
  const resp = await fetch(AZURE_TOKEN_URL, {
    method: "POST",
    headers: { "Ocp-Apim-Subscription-Key": apiKey, "Content-Length": "0" },
  });
  if (!resp.ok) throw new Error(`Token fetch failed: ${resp.status}`);
  const token = await resp.text();
  cachedToken = { token, expiresAt: Date.now() + 8 * 60 * 1000 }; // 8 min
  return token;
}

async function generateAudio(token: string, ssml: string): Promise<ArrayBuffer> {
  const resp = await fetch(AZURE_TTS_URL, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/ssml+xml",
      "X-Microsoft-OutputFormat": "audio-24khz-48kbitrate-mono-mp3",
    },
    body: ssml,
  });
  if (!resp.ok) throw new Error(`TTS failed: ${resp.status}`);
  return resp.arrayBuffer();
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const AZURE_SPEECH_KEY = Deno.env.get("AZURE_SPEECH_KEY");
  if (!AZURE_SPEECH_KEY) {
    return new Response(JSON.stringify({ error: "AZURE_SPEECH_KEY not configured" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  const url = new URL(req.url);
  const tipo = url.searchParams.get("tipo") || "preco";
  const preco = parseFloat(url.searchParams.get("preco") || "0");
  const precoLista = parseFloat(url.searchParams.get("preco_lista") || "0");
  const tipoSugestao = url.searchParams.get("tipo_sugestao") || "complementares";

  try {
    let texto = "";

    if (tipo === "indisponivel") {
      texto = FRASES_INDISPONIVEL[Math.floor(Math.random() * FRASES_INDISPONIVEL.length)];
    } else {
      if (!preco) {
        return new Response(JSON.stringify({ error: "Informe ?preco=X" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const isOferta = precoLista > 0 && precoLista > preco;
      const precoTexto = formatPrecoTexto(preco);

      if (isOferta) {
        const frase = FRASES_OFERTA[Math.floor(Math.random() * FRASES_OFERTA.length)];
        texto = `${frase} Por apenas ${precoTexto}.`;
      } else {
        texto = `${precoTexto}.`;
      }

      // Pick suggestion phrase based on type
      let frasesSugestao: string[];
      switch (tipoSugestao) {
        case "mesma_marca":
          frasesSugestao = FRASES_SUGESTAO_MARCA;
          break;
        case "perfil":
          frasesSugestao = FRASES_SUGESTAO_PERFIL;
          break;
        default:
          frasesSugestao = FRASES_SUGESTAO_COMPLEMENTAR;
          break;
      }
      const fraseSug = frasesSugestao[Math.floor(Math.random() * frasesSugestao.length)];
      texto += ` ${fraseSug}`;
    }

    // Cache key based on content
    const cacheKey = `${tipo}|${preco}|${precoLista > preco ? "1" : "0"}|${tipoSugestao}`;
    
    // Check cache
    const { data: cached } = await supabase
      .from("tts_cache")
      .select("storage_path")
      .eq("cache_key", cacheKey)
      .maybeSingle();

    if (cached) {
      const { data: urlData } = supabase.storage.from("tts-audio").getPublicUrl(cached.storage_path);
      return new Response(JSON.stringify({ 
        audio_url: urlData.publicUrl, 
        texto, 
        cached: true 
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Generate audio
    const token = await getAzureToken(AZURE_SPEECH_KEY);
    const ssml = buildSSML(texto);
    const audioBuffer = await generateAudio(token, ssml);

    // Upload to storage
    const fileName = `tts_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.mp3`;
    const { error: uploadError } = await supabase.storage
      .from("tts-audio")
      .upload(fileName, audioBuffer, { contentType: "audio/mpeg", upsert: false });

    if (uploadError) throw new Error(`Upload failed: ${uploadError.message}`);

    // Save cache entry
    await supabase.from("tts_cache").insert({ cache_key: cacheKey, storage_path: fileName, texto });

    const { data: urlData } = supabase.storage.from("tts-audio").getPublicUrl(fileName);

    return new Response(JSON.stringify({ 
      audio_url: urlData.publicUrl, 
      texto, 
      cached: false 
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("TTS error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Erro interno" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
