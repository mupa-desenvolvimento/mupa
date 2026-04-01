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

const sections: { title: string; endpoints: Endpoint[] }[] = [
  {
    title: "Produtos",
    endpoints: [
      {
        method: "GET",
        path: "/api/produtos",
        description: "Lista paginada de produtos com filtros",
        params: "?q=negresco&marca=nestle&categoria_id=7&disponivel=true&com_imagem=true&promo=true&page=1&per_page=20",
      },
      {
        method: "GET",
        path: "/api/produtos/{ean}",
        description: "Busca produto por EAN (uso principal nos terminais)",
        example: '/api/produtos/7891000100103',
      },
      {
        method: "GET",
        path: "/api/produtos/busca?q=",
        description: "Busca full-text por nome, marca ou EAN",
      },
      {
        method: "GET",
        path: "/api/produtos/categoria/{id}",
        description: "Produtos filtrados por categoria",
      },
      {
        method: "GET",
        path: "/api/produtos/marca/{nome}",
        description: "Produtos filtrados por marca",
      },
      {
        method: "GET",
        path: "/api/produtos/sem-imagem",
        description: "Lista produtos sem imagem baixada",
      },
    ],
  },
  {
    title: "Sincronização",
    endpoints: [
      {
        method: "POST",
        path: "/api/sync/start",
        description: "Inicia sincronização completa com Rissul em background",
      },
      {
        method: "GET",
        path: "/api/sync/status",
        description: "Status atual da sincronização (progresso, ETA)",
      },
      {
        method: "GET",
        path: "/api/sync/logs",
        description: "Histórico de sincronizações anteriores",
      },
    ],
  },
  {
    title: "Imagens",
    endpoints: [
      {
        method: "GET",
        path: "/api/imagens/{ean}",
        description: "Retorna a URL da imagem do produto",
      },
      {
        method: "POST",
        path: "/api/imagens/sync",
        description: "Inicia download das imagens pendentes",
      },
      {
        method: "GET",
        path: "/api/imagens/status",
        description: "Progresso do download de imagens",
      },
    ],
  },
  {
    title: "Sugestões (Terminais)",
    endpoints: [
      {
        method: "GET",
        path: "/api/sugestoes/{ean}",
        description: "Produtos similares da mesma categoria (4-6 itens)",
      },
      {
        method: "GET",
        path: "/api/sugestoes/vinhos?tipo=tinto&preco_max=80",
        description: "Filtro especializado para vinhos",
      },
      {
        method: "GET",
        path: "/api/destaques?limite=10",
        description: "Produtos em promoção, ordenados por maior desconto",
      },
    ],
  },
  {
    title: "Categorias e Marcas",
    endpoints: [
      {
        method: "GET",
        path: "/api/categorias",
        description: "Árvore de categorias com contagem de produtos",
      },
      {
        method: "GET",
        path: "/api/marcas",
        description: "Lista de marcas com total de produtos",
      },
    ],
  },
  {
    title: "Dashboard / Stats",
    endpoints: [
      {
        method: "GET",
        path: "/api/stats",
        description: "Estatísticas gerais: totais, última sync, cobertura de imagens",
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
