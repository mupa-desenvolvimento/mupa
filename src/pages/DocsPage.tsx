import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { FileText, Copy, CheckCircle } from "lucide-react";

interface Endpoint {
  method: "GET" | "POST";
  path: string;
  description: string;
  params?: string;
  example?: string;
}

const BASE_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1`;

const sections: { title: string; endpoints: Endpoint[] }[] = [
  {
    title: "🔌 API REST — Terminais Mupa",
    endpoints: [
      {
        method: "GET",
        path: `${BASE_URL}/api-produtos?ean=7894900027013`,
        description: "Busca produto por EAN (uso principal nos terminais)",
        example: "Retorna dados completos do produto com preço, imagem e disponibilidade",
      },
      {
        method: "GET",
        path: `${BASE_URL}/api-produtos?q=leite integral`,
        description: "Busca por descrição — busca direta por nome, marca ou EAN",
        params: "?q=TEXTO&limit=10",
      },
      {
        method: "GET",
        path: `${BASE_URL}/api-produtos?q=refri coca 2l`,
        description: "Busca inteligente com IA — identifica produto mesmo com descrição parcial ou incompleta",
        example: "Usa IA para interpretar buscas como 'refri coca 2l' e encontrar 'Refrigerante Coca-Cola Pet 2L'",
      },
    ],
  },
  {
    title: "💡 Sugestões de Produtos Similares",
    endpoints: [
      {
        method: "GET",
        path: `${BASE_URL}/api-sugestoes?ean=7894900027013`,
        description: "Retorna produtos similares da mesma categoria (ex: outros refrigerantes)",
        params: "?ean=CODIGO&limit=6",
        example: "Busca Coca-Cola 2L → sugere Pepsi, Sprite, Fruki e outros refrigerantes",
      },
    ],
  },
  {
    title: "Sincronização",
    endpoints: [
      {
        method: "POST",
        path: `${BASE_URL}/sync-produtos`,
        description: "Inicia sincronização incremental com Rissul (continua de onde parou)",
      },
    ],
  },
  {
    title: "Parâmetros da API",
    endpoints: [
      {
        method: "GET",
        path: "?ean=CODIGO",
        description: "Busca exata por EAN — retorna um único produto ou 404",
      },
      {
        method: "GET",
        path: "?q=DESCRICAO",
        description: "Busca por texto — primeiro tenta match direto, se poucos resultados usa IA",
      },
      {
        method: "GET",
        path: "?q=DESCRICAO&limit=20",
        description: "Limita resultados (padrão: 10, máximo: 50)",
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
            <code className="text-xs text-primary font-mono">GET /api/produtos/&#123;ean&#125;</code>
          </div>
          <div className="p-3 rounded-lg bg-muted">
            <p className="font-medium">🛒 Self-Checkout</p>
            <code className="text-xs text-primary font-mono">GET /api/produtos/&#123;ean&#125;</code>
          </div>
          <div className="p-3 rounded-lg bg-muted">
            <p className="font-medium">💡 Sugestões</p>
            <code className="text-xs text-primary font-mono">GET /api/sugestoes/&#123;ean&#125;</code>
          </div>
          <div className="p-3 rounded-lg bg-muted">
            <p className="font-medium">🍷 Vinhos</p>
            <code className="text-xs text-primary font-mono">GET /api/sugestoes/vinhos?tipo=tinto</code>
          </div>
        </div>
      </div>

      {/* Endpoints */}
      {sections.map((section) => (
        <div key={section.title} className="stat-card">
          <h2 className="font-display text-lg font-semibold mb-4">{section.title}</h2>
          <div className="space-y-3">
            {section.endpoints.map((ep) => (
              <div
                key={ep.path}
                className="flex items-start gap-3 p-3 rounded-lg bg-muted/50 hover:bg-muted transition-colors"
              >
                <Badge
                  variant={ep.method === "GET" ? "secondary" : "default"}
                  className="shrink-0 mt-0.5 font-mono text-[10px]"
                >
                  {ep.method}
                </Badge>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <code className="text-sm font-mono text-foreground break-all">{ep.path}</code>
                    <button
                      onClick={() => copyToClipboard(ep.path)}
                      className="shrink-0 text-muted-foreground hover:text-foreground transition-colors"
                    >
                      {copied === ep.path ? (
                        <CheckCircle className="h-3.5 w-3.5 text-success" />
                      ) : (
                        <Copy className="h-3.5 w-3.5" />
                      )}
                    </button>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">{ep.description}</p>
                  {ep.params && (
                    <p className="text-[10px] text-muted-foreground font-mono mt-1 break-all">
                      Params: {ep.params}
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
