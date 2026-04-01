import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Copy, CheckCircle } from "lucide-react";

interface Endpoint {
  method: "GET" | "POST";
  path: string;
  description: string;
  params?: string;
  example?: string;
  curl?: string;
}

const BASE_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1`;

const sections: { title: string; endpoints: Endpoint[] }[] = [
  {
    title: "🔌 API REST — Terminais Mupa",
    endpoints: [
      {
        method: "GET",
        path: `/api-produtos?ean=7894900027013`,
        description: "Busca produto por EAN (uso principal nos terminais)",
        example: "Retorna dados completos do produto com preço, imagem e disponibilidade",
        curl: `curl "${BASE_URL}/api-produtos?ean=7894900027013"`,
      },
      {
        method: "GET",
        path: `/api-produtos?q=leite integral`,
        description: "Busca por descrição — busca direta por nome, marca ou EAN. Usa índice trigram para busca fuzzy rápida.",
        params: "?q=TEXTO&limit=10 (padrão: 10, máximo: 50)",
        curl: `curl "${BASE_URL}/api-produtos?q=leite%20integral&limit=10"`,
      },
      {
        method: "GET",
        path: `/api-produtos?q=refri coca 2l`,
        description: "Busca inteligente com IA — se a busca direta retornar menos de 3 resultados, a IA interpreta a descrição parcial e encontra o produto correto.",
        example: "Modelo: gemini-2.5-flash-lite (mais rápido). Candidatos reduzidos a 50 para menor latência.",
        curl: `curl "${BASE_URL}/api-produtos?q=refri%20coca%202l"`,
      },
    ],
  },
  {
    title: "💡 Sugestões Inteligentes com IA",
    endpoints: [
      {
        method: "GET",
        path: `/api-sugestoes?ean=7894900027013`,
        description: "Retorna 3 grupos de sugestões em paralelo: mesma_marca, complementares (cross-sell IA) e perfil demográfico. Cache de 24h para respostas instantâneas.",
        params: "?ean=CODIGO&limit=6&idade=25&genero=masculino",
        example: "As 3 consultas rodam simultaneamente via Promise.all. Cache evita chamadas repetidas à IA.",
        curl: `curl "${BASE_URL}/api-sugestoes?ean=7894900027013"`,
      },
      {
        method: "GET",
        path: `/api-sugestoes?ean=7894900027013&idade=30&genero=feminino`,
        description: "Com perfil demográfico — IA sugere produtos relevantes para idade e gênero. Parâmetros opcionais.",
        example: "Mulher 30 anos + Coca-Cola → IA pode sugerir água, suco, biscoito, salada. Cache separado por perfil.",
        curl: `curl "${BASE_URL}/api-sugestoes?ean=7894900027013&idade=30&genero=feminino"`,
      },
    ],
  },
  {
    title: "Sincronização",
    endpoints: [
      {
        method: "POST",
        path: `/sync-produtos`,
        description: "Inicia sincronização incremental com Rissul (continua de onde parou)",
        curl: `curl -X POST "${BASE_URL}/sync-produtos"`,
      },
    ],
  },
  {
    title: "📋 Referência de Parâmetros",
    endpoints: [
      {
        method: "GET",
        path: "api-produtos",
        description: "?ean=CODIGO — Busca exata por EAN, retorna produto único ou 404. Caminho mais rápido (índice direto).",
      },
      {
        method: "GET",
        path: "api-produtos",
        description: "?q=DESCRICAO — Busca textual com índice gin_trgm. Se <3 resultados, ativa fallback IA (gemini-2.5-flash-lite).",
        params: "?q=TEXTO&limit=N (padrão: 10, máximo: 50)",
      },
      {
        method: "GET",
        path: "api-sugestoes",
        description: "?ean=CODIGO — Obrigatório. Retorna sugestões agrupadas: { mesma_marca, complementares, perfil }.",
        params: "?ean=CODIGO&limit=6&idade=N&genero=masculino|feminino",
      },
    ],
  },
  {
    title: "⚡ Otimizações de Performance",
    endpoints: [
      {
        method: "GET",
        path: "Índices de banco",
        description: "gin_trgm no campo nome para busca fuzzy, índices compostos (disponivel+marca), índice parcial em preco_lista para promoções. EAN indexado para lookup O(1).",
      },
      {
        method: "GET",
        path: "Paralelismo",
        description: "api-sugestoes executa as 3 consultas (marca, complementares, perfil) simultaneamente com Promise.all. searchProducts busca todas as categorias em paralelo.",
      },
      {
        method: "GET",
        path: "Cache IA (24h TTL)",
        description: "Tabela sugestoes_cache armazena categorias geradas pela IA por EAN+tipo+perfil. Cache write é fire-and-forget (não bloqueia resposta). Índice dedicado para lookups rápidos.",
      },
    ],
  },
];

export default function DocsPage() {
  const [copied, setCopied] = useState<string | null>(null);

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(text);
    setTimeout(() => setCopied(null), 2000);
  };

  return (
    <div className="space-y-8 max-w-4xl">
      <div>
        <h1 className="font-display text-3xl font-bold tracking-tight">API Docs</h1>
        <p className="text-muted-foreground mt-1">
          Documentação dos endpoints REST para integração com terminais Mupa
        </p>
      </div>

      {/* Terminal use cases */}
      <div className="stat-card">
        <h2 className="font-display text-lg font-semibold mb-3">Casos de Uso</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
          <div className="p-3 rounded-lg bg-muted">
            <p className="font-medium">🏪 Consulta de Preço</p>
            <code className="text-xs text-primary font-mono">GET /api-produtos?ean=EAN</code>
          </div>
          <div className="p-3 rounded-lg bg-muted">
            <p className="font-medium">🔍 Busca por Descrição</p>
            <code className="text-xs text-primary font-mono">GET /api-produtos?q=TEXTO</code>
          </div>
          <div className="p-3 rounded-lg bg-muted">
            <p className="font-medium">💡 Sugestões com IA</p>
            <code className="text-xs text-primary font-mono">GET /api-sugestoes?ean=EAN</code>
          </div>
          <div className="p-3 rounded-lg bg-muted">
            <p className="font-medium">👤 Sugestões por Perfil</p>
            <code className="text-xs text-primary font-mono">GET /api-sugestoes?ean=EAN&idade=25&genero=masculino</code>
          </div>
        </div>
      </div>

      {/* Endpoints */}
      {sections.map((section) => (
        <div key={section.title} className="stat-card">
          <h2 className="font-display text-lg font-semibold mb-4">{section.title}</h2>
          <div className="space-y-3">
            {section.endpoints.map((ep, idx) => (
              <div
                key={`${ep.path}-${idx}`}
                className="flex flex-col gap-2 p-3 rounded-lg bg-muted/50 hover:bg-muted transition-colors"
              >
                <div className="flex items-start gap-3">
                  <Badge
                    variant={ep.method === "GET" ? "secondary" : "default"}
                    className="shrink-0 mt-0.5 font-mono text-[10px]"
                  >
                    {ep.method}
                  </Badge>
                  <div className="flex-1 min-w-0">
                    <code className="text-sm font-mono text-foreground break-all">{ep.path}</code>
                    <p className="text-xs text-muted-foreground mt-1">{ep.description}</p>
                    {ep.params && (
                      <p className="text-[10px] text-muted-foreground font-mono mt-1 break-all">
                        Params: {ep.params}
                      </p>
                    )}
                    {ep.example && (
                      <p className="text-[10px] text-muted-foreground mt-1 italic">
                        {ep.example}
                      </p>
                    )}
                  </div>
                </div>
                {ep.curl && (
                  <div className="flex items-center gap-2 ml-0 mt-1 p-2 rounded bg-background border border-border">
                    <code className="text-[11px] font-mono text-muted-foreground flex-1 break-all">{ep.curl}</code>
                    <button
                      onClick={() => copyToClipboard(ep.curl!)}
                      className="shrink-0 text-muted-foreground hover:text-foreground transition-colors"
                    >
                      {copied === ep.curl ? (
                        <CheckCircle className="h-3.5 w-3.5 text-green-500" />
                      ) : (
                        <Copy className="h-3.5 w-3.5" />
                      )}
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
