import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface PrecoConfig {
  id: string;
  empresa_id: string;
  token_url: string;
  token_method: string;
  token_body: Record<string, unknown>;
  token_headers: Record<string, string>;
  token_response_path: string;
  token_expiry_field: string | null;
  token_expiry_seconds: number;
  consulta_url: string;
  consulta_method: string;
  consulta_params_fixos: Record<string, string>;
  consulta_ean_param: string;
  consulta_auth_type: string;
  consulta_headers: Record<string, string>;
  data_path: string;
  mapeamento_campos: Record<string, string | null>;
}

interface PrecoSaida {
  ean: string;
  nome: string;
  imagem_url: string | null;
  embalagem: string | null;
  unidade_proporcional: string | null;
  status: string | null;
  precos: PrecoParcela[];
  dados_brutos: Record<string, unknown>;
}

interface PrecoParcela {
  tipo: string;
  valor: number;
  label: string;
  destaque?: boolean;
}

function extractByPath(obj: Record<string, unknown>, path: string): unknown {
  if (!path) return obj;
  const parts = path.split('.');
  let current: unknown = obj;
  for (const part of parts) {
    if (current == null || typeof current !== 'object') return null;
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

function buildPrecos(data: Record<string, unknown>, mapeamento: Record<string, string | null>): PrecoParcela[] {
  const precos: PrecoParcela[] = [];

  const getVal = (key: string): number | null => {
    const field = mapeamento[key];
    if (!field) return null;
    const val = data[field];
    if (val == null) return null;
    const num = parseFloat(String(val));
    return isNaN(num) ? null : num;
  };

  const regular = getVal('preco_regular');
  const clube = getVal('preco_clube');
  const oferta = getVal('preco_oferta');
  const proporcional = getVal('preco_proporcional');
  const propClube = getVal('preco_proporcional_clube');
  const mediaVenda = getVal('media_venda');

  const unidadeField = mapeamento['unidade_proporcional'];
  const unidade = unidadeField ? String(data[unidadeField] ?? '') : '';

  // Detect price patterns
  const hasClube = clube != null && clube > 0;
  const hasOferta = oferta != null && oferta > 0;
  const isOnSale = hasClube || hasOferta || (regular != null && mediaVenda != null && regular < mediaVenda);

  if (regular != null) {
    precos.push({
      tipo: 'regular',
      valor: regular,
      label: isOnSale ? 'Preço Regular' : 'Preço',
      destaque: !hasClube && !hasOferta,
    });
  }

  if (hasOferta) {
    precos.push({
      tipo: 'oferta',
      valor: oferta!,
      label: regular ? `De R$ ${regular.toFixed(2)} por` : 'Oferta',
      destaque: !hasClube,
    });
  }

  if (hasClube) {
    precos.push({
      tipo: 'clube',
      valor: clube!,
      label: 'Cliente Clube',
      destaque: true,
    });
  }

  if (proporcional != null && proporcional > 0) {
    precos.push({
      tipo: 'proporcional',
      valor: proporcional,
      label: unidade ? `R$/${unidade}` : 'R$/un',
    });
  }

  if (propClube != null && propClube > 0) {
    precos.push({
      tipo: 'proporcional_clube',
      valor: propClube,
      label: unidade ? `R$/${unidade} Clube` : 'R$/un Clube',
    });
  }

  // Detect bulk discount patterns from codigo_etiqueta or limite
  const limiteField = mapeamento['limite_compra'];
  const limite = limiteField ? data[limiteField] : null;
  if (limite && Number(limite) > 0) {
    // Find the highlighted price and add limit info
    const destaque = precos.find(p => p.destaque);
    if (destaque) {
      destaque.label = `Na compra de até ${limite} un - ${destaque.label}`;
    }
  }

  return precos;
}

async function getToken(
  supabase: ReturnType<typeof createClient>,
  config: PrecoConfig
): Promise<string> {
  // Check cache first
  const { data: cached } = await supabase
    .from('empresa_token_cache')
    .select('token, expira_em')
    .eq('empresa_id', config.empresa_id)
    .maybeSingle();

  const cachedRow = cached as { token: string; expira_em: string } | null;
  if (cachedRow && new Date(cachedRow.expira_em) > new Date()) {
    return cachedRow.token;
  }

  // Fetch new token
  const resp = await fetch(config.token_url, {
    method: config.token_method,
    headers: config.token_headers as HeadersInit,
    body: config.token_method !== 'GET' ? JSON.stringify(config.token_body) : undefined,
  });

  if (!resp.ok) {
    throw new Error(`Token request failed: ${resp.status} ${resp.statusText}`);
  }

  const tokenData = await resp.json();
  const token = extractByPath(tokenData, config.token_response_path) as string;

  if (!token) {
    throw new Error(`Token not found at path "${config.token_response_path}" in response`);
  }

  // Determine expiry
  let expirySeconds = config.token_expiry_seconds || 3600;
  if (config.token_expiry_field && tokenData[config.token_expiry_field]) {
    expirySeconds = parseInt(String(tokenData[config.token_expiry_field]), 10) || expirySeconds;
  }

  const expiraEm = new Date(Date.now() + (expirySeconds - 60) * 1000).toISOString(); // 60s safety margin

  // Upsert cache
  await supabase
    .from('empresa_token_cache')
    .upsert({
      empresa_id: config.empresa_id,
      token,
      token_type: tokenData.token_type || 'bearer',
      expira_em: expiraEm,
    }, { onConflict: 'empresa_id' });

  return token;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );

  const url = new URL(req.url);
  const empresaId = url.searchParams.get('empresa_id');
  const ean = url.searchParams.get('ean');
  const lojaOverride = url.searchParams.get('loja');

  if (!empresaId || !ean) {
    return new Response(
      JSON.stringify({ error: 'Parâmetros empresa_id e ean são obrigatórios' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  try {
    // Get config
    const { data: config, error: configError } = await supabase
      .from('empresa_preco_config')
      .select('*')
      .eq('empresa_id', empresaId)
      .eq('ativo', true)
      .maybeSingle();

    if (configError || !config) {
      return new Response(
        JSON.stringify({ error: 'Configuração de preços não encontrada para esta empresa' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get token
    const token = await getToken(supabase, config as PrecoConfig);

    // Build query URL
    const consultaUrl = new URL(config.consulta_url);
    
    // Add fixed params
    const fixedParams = config.consulta_params_fixos as Record<string, string>;
    for (const [key, value] of Object.entries(fixedParams)) {
      consultaUrl.searchParams.set(key, String(value));
    }

    // Override loja if provided
    if (lojaOverride && fixedParams['loja']) {
      consultaUrl.searchParams.set('loja', lojaOverride);
    }

    // Add EAN
    consultaUrl.searchParams.set(config.consulta_ean_param, ean);

    // Build headers
    const consultaHeaders: Record<string, string> = {
      ...(config.consulta_headers as Record<string, string>),
    };

    if (config.consulta_auth_type === 'bearer') {
      consultaHeaders['Authorization'] = `Bearer ${token}`;
    }

    // Make request
    const productResp = await fetch(consultaUrl.toString(), {
      method: config.consulta_method,
      headers: consultaHeaders,
    });

    if (!productResp.ok) {
      return new Response(
        JSON.stringify({ error: `Consulta falhou: ${productResp.status}`, details: await productResp.text() }),
        { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const rawResponse = await productResp.json();

    // Extract data from response
    const data = extractByPath(rawResponse, config.data_path) as Record<string, unknown>;

    if (!data) {
      return new Response(
        JSON.stringify({ error: 'Dados não encontrados no caminho especificado', data_path: config.data_path, resposta: rawResponse }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const mapeamento = config.mapeamento_campos as Record<string, string | null>;

    // Map fields
    const getMapped = (key: string): string | null => {
      const field = mapeamento[key];
      if (!field) return null;
      const val = data[field];
      return val != null ? String(val) : null;
    };

    // Build standardized output
    const precos = buildPrecos(data, mapeamento);

    const saida: PrecoSaida = {
      ean: getMapped('ean') || ean,
      nome: getMapped('nome') || 'Produto',
      imagem_url: getMapped('imagem_url'),
      embalagem: getMapped('embalagem_venda'),
      unidade_proporcional: getMapped('unidade_proporcional'),
      status: getMapped('status'),
      precos,
      dados_brutos: data,
    };

    return new Response(
      JSON.stringify({ success: true, produto: saida }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Consulta preço error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Erro interno' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
