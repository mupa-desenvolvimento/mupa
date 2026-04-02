# 📋 Mupa — Documentação Técnica Completa

## Índice

1. [Visão Geral](#visão-geral)
2. [Arquitetura](#arquitetura)
3. [Banco de Dados](#banco-de-dados)
4. [Terminal de Consulta (`/terminal`)](#terminal-de-consulta)
5. [Painel de Gerenciamento (`/dispositivos`)](#painel-de-gerenciamento)
6. [Edge Functions (APIs)](#edge-functions)
7. [Fluxo Completo — Do Cadastro à Consulta](#fluxo-completo)
8. [Configurações do Terminal](#configurações-do-terminal)

---

## Visão Geral

**Mupa** é uma plataforma SaaS multi-tenant para terminais de consulta de preços em supermercados. Cada **empresa** tem seu próprio catálogo de produtos, dispositivos (terminais físicos) e configurações de API.

O sistema é composto por:

- **Painel administrativo** — gerencia empresas, dispositivos, mídias, sincronização e configurações.
- **Terminal de consulta** (`/terminal`) — interface fullscreen para quiosques/totens que lê códigos de barras e exibe preço, imagem e sugestões com IA.
- **APIs REST** — Edge Functions que servem dados de produtos e sugestões aos terminais.

**Stack:** React 18 + Vite + Tailwind CSS + Supabase (Lovable Cloud) + Edge Functions (Deno).

---

## Arquitetura

```
┌────────────────────────────────────────────────────────────────┐
│                        FRONTEND (React)                        │
│                                                                │
│  ┌──────────────┐  ┌──────────────┐  ┌───────────────────────┐ │
│  │ Painel Admin │  │   Terminal   │  │  Páginas: Dashboard,  │ │
│  │ /dispositivos│  │  /terminal   │  │  Catálogo, Sync, etc  │ │
│  └──────┬───────┘  └──────┬───────┘  └───────────┬───────────┘ │
└─────────┼─────────────────┼──────────────────────┼─────────────┘
          │                 │                      │
          ▼                 ▼                      ▼
┌────────────────────────────────────────────────────────────────┐
│                     SUPABASE (Lovable Cloud)                   │
│                                                                │
│  ┌─────────────┐  ┌──────────────┐  ┌───────────────────────┐ │
│  │  Database    │  │   Storage    │  │    Edge Functions      │ │
│  │  (Postgres)  │  │  (tts-audio) │  │  api-produtos         │ │
│  │  + RLS       │  │              │  │  api-sugestoes         │ │
│  │  + Realtime  │  │              │  │  sync-produtos         │ │
│  │             │  │              │  │  tts-audio             │ │
│  └─────────────┘  └──────────────┘  └───────────────────────┘ │
│                                                                │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  Integrações Externas                                   │   │
│  │  • Lovable AI Gateway (Gemini 2.5 Flash Lite)           │   │
│  │  • Azure Cognitive Services (TTS - Francisca Neural)    │   │
│  │  • API VTEX/REST da empresa (sync de produtos)          │   │
│  └─────────────────────────────────────────────────────────┘   │
└────────────────────────────────────────────────────────────────┘
```

---

## Banco de Dados

### Tabelas Principais

| Tabela | Descrição |
|--------|-----------|
| `empresas` | Cadastro de empresas (multi-tenant). Campos: `nome`, `slug`, `logo_url`, `ativo`. |
| `dispositivos` | Terminais físicos vinculados a empresas. Campos: `nome`, `empresa_id`, `codigo_ativacao`, `ativo`, `ativado_em`, `ultimo_acesso`. |
| `empresa_usuarios` | Relação N:N entre usuários e empresas. Campos: `user_id`, `empresa_id`, `role`. |
| `empresa_api_config` | Configuração de API REST/VTEX por empresa. Campos: `api_url`, `api_token`, `tipo_api` (rest/graphql/vtex). Relação 1:1 com empresa. |
| `empresa_midias` | Mídias do slideshow por empresa. Campos: `nome`, `tipo`, `url`, `storage_path`, `ordem`, `duracao_segundos`, `ativo`. |
| `produtos` | Catálogo de produtos. Campos: `ean`, `nome`, `nome_curto`, `marca`, `categoria`, `preco`, `preco_lista`, `disponivel`, `imagem_url_vtex`, etc. |
| `terminal_media` | Mídias globais do slideshow (quando não há empresa vinculada). |
| `terminal_config` | Configurações key-value do terminal (fontes, cores, tipo de sugestão, etc). Atualizada em tempo real via Realtime. |
| `sugestoes_cache` | Cache de categorias geradas pela IA para sugestões. TTL de 24h. Chave: `ean + tipo + chave_perfil`. |
| `tts_cache` | Cache de áudios TTS gerados. Chave: `tipo + preco + oferta + tipoSugestao`. |
| `sync_log` | Log de sincronizações com a API da empresa. Suporta retomada incremental. |
| `categorias` | Árvore de categorias de produtos. |
| `marcas` | Índice de marcas com contagem de produtos. |

### Row Level Security (RLS)

- **Leitura pública**: `produtos`, `categorias`, `marcas`, `empresas`, `dispositivos`, `terminal_config`, `terminal_media` (ativas), `empresa_midias` (ativas).
- **Escrita autenticada**: `empresas`, `dispositivos`, `empresa_usuarios`, `empresa_api_config`, `empresa_midias`, `terminal_config`, `terminal_media`.
- **Service role only**: `tts_cache` (insert), `sync_log`, `sugestoes_cache`.

---

## Terminal de Consulta

**Rota:** `/terminal`  
**Arquivo:** `src/pages/TerminalPage.tsx` (~1086 linhas)

### Fluxo de Estados

```
┌──────────────┐     código válido      ┌──────────────┐
│   ATIVAÇÃO   │ ──────────────────────► │    IDLE      │
│  (primeira   │                        │  (slideshow  │
│   vez)       │                        │   de mídias) │
└──────────────┘                        └──────┬───────┘
                                               │
                                          escaneio EAN
                                               │
                                               ▼
                                        ┌──────────────┐
                                        │   LOADING    │
                                        │ (spinner)    │
                                        └──────┬───────┘
                                               │
                              ┌────────────────┼────────────────┐
                              ▼                                 ▼
                       ┌──────────────┐                  ┌──────────────┐
                       │   PRODUTO    │                  │    ERRO      │
                       │  (exibição   │                  │ (3s timeout  │
                       │   completa)  │                  │  volta idle) │
                       └──────┬───────┘                  └──────────────┘
                              │
                         30s inatividade
                              │
                              ▼
                       ┌──────────────┐
                       │    IDLE      │
                       │  (volta ao   │
                       │   slideshow) │
                       └──────────────┘
```

### 1. Tela de Ativação

Quando o terminal é aberto pela primeira vez (sem `mupa_device_id` no `localStorage`), exibe uma tela de ativação:

- O operador digita o **código de ativação** (8 caracteres alfanuméricos, ex: `ABCD1234`) gerado pelo admin.
- O sistema consulta a tabela `dispositivos` pelo `codigo_ativacao`.
- Se válido:
  - Atualiza o dispositivo como `ativo = true` e registra `ativado_em`.
  - Persiste `mupa_device_id` e `mupa_empresa_id` no `localStorage`.
  - Transição para o estado IDLE.
- Se inválido: exibe mensagem de erro.

```typescript
// Persistência local
localStorage.setItem("mupa_device_id", data.id);
localStorage.setItem("mupa_empresa_id", data.empresa_id || "");
```

### 2. Estado IDLE (Slideshow)

Quando nenhum produto está sendo exibido:

- Carrega mídias da tabela `terminal_media` (imagens e vídeos).
- Exibe slideshow automático com transições suaves (crossfade de 1.2s).
- Cada mídia respeita o campo `duracao_segundos`.
- Vídeos avançam automaticamente ao terminar (`onEnded`).
- Se não há mídias, exibe ícone de barcode com animação flutuante e texto "Consulte um produto".
- Atualiza mídias em tempo real via Supabase Realtime.

### 3. Consulta de Produto

O terminal mantém um `<input>` invisível sempre focado (verifica a cada 200ms). Leitores de código de barras USB enviam os dígitos como keypresses, finalizando com `Enter`.

**Fluxo:**
1. Leitor envia EAN → `Enter` → chama `consultar()`
2. Toca **beep** de confirmação (AudioContext, 1200Hz, 150ms)
3. Chama `GET /api-produtos?ean=XXXXXX` (Edge Function)
4. Se encontrado:
   - Exibe produto com layout "Premium Retail"
   - Chama TTS para falar o preço (`GET /tts-audio?preco=X&tipo_sugestao=Y`)
   - Extrai paleta de cores da imagem do produto (k-means clustering)
   - Gera tema dinâmico de cores com contraste WCAG garantido
   - Busca sugestões em paralelo (`GET /api-sugestoes?ean=X`)
5. Se não encontrado:
   - Exibe mensagem de erro por 3 segundos
   - TTS fala "Produto temporariamente indisponível"
   - Volta ao slideshow automaticamente

### 4. Exibição do Produto

Layout vertical sem scroll, otimizado para tela cheia:

```
┌─────────────────────────────────────┐
│          IMAGEM DO PRODUTO          │
│         (tamanho configurável)      │
│                                     │
├─────────────────────────────────────┤
│  ┌───────────────────────────────┐  │
│  │  DESCRIÇÃO                    │  │  ← Card branco translúcido
│  │  Primeiras 3 palavras em bold │  │
│  │  Resto em texto menor         │  │
│  │  Marca                       │  │
│  └───────────────────────────────┘  │
│                                     │  ← Container com cor da imagem
│  ┌───────────────────────────────┐  │
│  │        R$ 12,99               │  │  ← Sub-container com cor secundária
│  │     De R$ 15,99               │  │
│  │        un                     │  │
│  └───────────────────────────────┘  │
│                                     │
│  ┌─── PROMOÇÃO ──────────────────┐  │  ← Strip animado (só se há desconto)
│                                     │
│  ✨ Combina perfeitamente!         │  ← Título dinâmico por tipo
│  ┌─────┐ ┌─────┐ ┌─────┐         │
│  │ Sug │ │ Sug │ │ Sug │         │  ← Cards de sugestão clicáveis
│  │  1  │ │  2  │ │  3  │         │
│  └─────┘ └─────┘ └─────┘         │
└─────────────────────────────────────┘
```

### 5. Sistema de Cores Dinâmicas

O terminal extrai as cores dominantes da imagem do produto usando **k-means clustering** (5 clusters, 12 iterações) em um canvas 80x80:

1. Carrega imagem em `<canvas>` com `crossOrigin: "anonymous"`
2. Filtra pixels: remove brancos (>235), pretos (<20), baixa saturação
3. Agrupa por k-means → 4 cores dominantes
4. Gera tema completo:
   - **Primary**: cor mais frequente
   - **Secondary**: segunda mais frequente
   - **Accent**: cor mais vibrante (sort por saturação × distância de L=50)
   - Backgrounds: versões muito claras (~88-92% lighten)
   - Container: lighten 72% do primary
   - Price container: secondary com gradient
5. Garante contraste WCAG 4.5:1 em todos os textos

Cache em `Map<string, ProductTheme>` para evitar recalcular.

### 6. Text-to-Speech (TTS)

Frases dinâmicas por contexto:

| Contexto | Exemplo de Frase |
|----------|-----------------|
| Preço normal | "12 reais e 99 centavos. Que tal combinar com esses produtos?" |
| Preço em oferta | "Promoção imperdível! Não perca essa oportunidade! Por apenas 8 reais e 50 centavos. Confira mais produtos da mesma marca!" |
| Sugestão mesma marca | "...Confira mais produtos da mesma marca!" |
| Sugestão complementar | "...Que tal combinar com esses produtos?" |
| Sugestão perfil | "...Selecionamos especialmente para você!" |
| Indisponível | "Produto temporariamente indisponível." |

Motor: **Azure Cognitive Services** (voz `pt-BR-FranciscaNeural`).

### 7. Sugestões com IA

Três tipos executados em **paralelo** (`Promise.all`):

1. **Mesma Marca** — query direta: `WHERE marca = X AND ean != Y AND disponivel = true`
2. **Complementares (Cross-sell)** — IA (Gemini 2.5 Flash Lite) gera 5 categorias complementares → busca produtos por categoria
3. **Perfil Demográfico** — IA gera categorias baseadas em `idade` e `gênero` do cliente

Cache de 24h na tabela `sugestoes_cache` para evitar chamadas repetidas à IA.

O título das sugestões muda dinamicamente:
- `mesma_marca` → "🏷️ Mais dessa marca!"
- `perfil` → "⭐ Recomendados pra você!"
- `complementares` → "✨ Combina perfeitamente!"

### 8. Comportamentos do Terminal

| Funcionalidade | Detalhe |
|---------------|---------|
| **Fullscreen** | Entra automaticamente ao carregar. Botão no canto superior direito para toggle. |
| **Wake Lock** | Impede que a tela desligue (`navigator.wakeLock`). |
| **Auto-focus** | Input invisível recebe foco a cada 200ms. Reage a visibility change e fullscreen change. |
| **Reset por inatividade** | 30 segundos sem interação → volta ao slideshow. Qualquer toque/tecla reinicia o timer. |
| **Erro temporário** | Exibe por 3 segundos com barra de progresso, depois volta ao idle. |
| **Clique em sugestão** | Consulta o EAN do produto sugerido (mesma lógica de escaneio). |
| **Cursor** | `cursor: none` — escondido em modo produto. |
| **Indicador de foco** | Bolinha verde/vermelha no canto inferior esquerdo indica se o input está focado. |

---

## Painel de Gerenciamento

**Rota:** `/dispositivos`  
**Arquivo:** `src/pages/DispositivosPage.tsx` (~511 linhas)

### Abas

#### 1. Empresas

| Ação | Descrição |
|------|-----------|
| **Criar empresa** | Dialog com campo nome. Gera slug automático (`slugify`). |
| **Ativar/Desativar** | Switch inline na tabela. |
| **Excluir** | Confirmação antes de deletar. Remove todos os dados relacionados. |

Tabela exibe: Nome, Slug, Quantidade de dispositivos vinculados, Status (ativo/inativo).

#### 2. Dispositivos

| Ação | Descrição |
|------|-----------|
| **Criar dispositivo** | Nome + empresa (opcional). Gera código de ativação aleatório (8 chars de `ABCDEFGHJKLMNPQRSTUVWXYZ23456789` — sem ambíguos I/O/0/1). |
| **Copiar código** | Botão para copiar o código de ativação para a clipboard. |
| **QR Code** | Abre o QR Code do código de ativação em nova aba (via `api.qrserver.com`). |
| **Ativar/Desativar** | Switch inline + badge visual. |
| **Excluir** | Confirmação antes de deletar. |

Tabela exibe: Nome, Empresa vinculada, Código de Ativação, Status, Último Acesso.

#### 3. API Config

Para cada empresa cadastrada, exibe um card com:

| Campo | Descrição |
|-------|-----------|
| **URL da API** | Endpoint REST da empresa para sincronização de produtos |
| **Token / API Key** | Chave de autenticação (campo password) |
| **Tipo** | `rest`, `graphql` ou `vtex` |

Relação 1:1 com empresa (`empresa_api_config`). Upsert ao salvar.

---

## Edge Functions

### `api-produtos`

Busca de produtos com fallback IA.

| Parâmetro | Descrição |
|-----------|-----------|
| `?ean=CODIGO` | Busca exata por EAN (índice direto, O(1)). Retorna produto único ou 404. |
| `?q=TEXTO` | Busca textual com `ilike` (índice gin_trgm). Se < 3 resultados, ativa fallback IA. |
| `?limit=N` | Máximo de resultados para busca por texto (padrão: 10, max: 50). |

**Fallback IA:** Gemini 2.5 Flash Lite recebe lista de 50 candidatos e retorna índices dos mais relevantes.

### `api-sugestoes`

Sugestões inteligentes em 3 categorias paralelas.

| Parâmetro | Descrição |
|-----------|-----------|
| `?ean=CODIGO` | Obrigatório. Produto base. |
| `?limit=N` | Máximo por categoria (padrão: 6, max: 20). |
| `?idade=N` | Opcional. Idade para sugestões por perfil. |
| `?genero=M/F` | Opcional. Gênero para sugestões por perfil. |

**Resposta:**
```json
{
  "sugestoes": {
    "mesma_marca": [...],
    "complementares": [...],
    "perfil": [...]
  }
}
```

### `tts-audio`

Geração de áudio com cache.

| Parâmetro | Descrição |
|-----------|-----------|
| `?preco=X` | Preço para falar. |
| `?preco_lista=X` | Preço original (se maior que preco, é oferta). |
| `?tipo_sugestao=X` | `mesma_marca`, `complementares` ou `perfil`. Define a frase de sugestão. |
| `?tipo=indisponivel` | Fala frase de produto indisponível. |

**Motor:** Azure Cognitive Services, voz `pt-BR-FranciscaNeural`, região `brazilsouth`.  
**Cache:** Tabela `tts_cache` + Storage bucket `tts-audio`. Áudio em MP3 24kHz.

### `sync-produtos`

Sincronização incremental com API externa (Rissul/VTEX).

- **Resumível:** Se interrompido, retoma do último `current_offset`.
- **Batches:** 50 produtos por lote com delay de 800ms.
- **Timeout:** 2 minutos de segurança.
- **Log:** Registra progresso em `sync_log` (produtos novos, atualizados, imagens baixadas).

---

## Fluxo Completo — Do Cadastro à Consulta

```
1. Admin acessa /dispositivos
   ├── Cria empresa "Supermercado XYZ"
   ├── Configura API (URL + token) na aba API Config
   ├── Cria dispositivo "Terminal Loja 01" vinculado à empresa
   └── Obtém código de ativação: ABCD1234

2. Admin gera QR Code do código e cola no terminal físico

3. Terminal físico acessa /terminal
   ├── Exibe tela de ativação
   ├── Operador digita ABCD1234 (ou escaneia QR Code)
   ├── Sistema valida → ativa dispositivo → salva no localStorage
   └── Terminal entra no modo IDLE (slideshow)

4. Cliente escaneia um produto no terminal
   ├── Leitor USB envia EAN + Enter
   ├── Terminal chama GET /api-produtos?ean=XXX
   ├── Exibe produto com cores extraídas da imagem
   ├── TTS fala o preço
   ├── Busca sugestões com IA em paralelo
   └── Exibe sugestões clicáveis

5. Após 30s de inatividade → volta ao slideshow
```

---

## Configurações do Terminal

Armazenadas na tabela `terminal_config` como key-value. Atualizadas em **tempo real** via Supabase Realtime.

| Chave | Tipo | Padrão | Descrição |
|-------|------|--------|-----------|
| `tipo_sugestao` | string | `complementares` | Tipo de sugestão: `mesma_marca`, `complementares`, `perfil`, `todas` |
| `beep_enabled` | bool | `true` | Som de confirmação ao escanear |
| `tts_enabled` | bool | `true` | Áudio TTS do preço |
| `font_nome` | number | `24` | Tamanho da fonte do nome do produto (px) |
| `font_preco` | number | `72` | Tamanho da fonte do preço (px) |
| `img_size` | number | `280` | Tamanho da imagem do produto (px) |
| `max_sugestoes` | number | `3` | Quantidade de sugestões exibidas |
| `cor_auto` | bool | `true` | Cores dinâmicas extraídas da imagem |
| `cor_fundo` | string | `#1a0a0a` | Cor de fundo (quando cor_auto = false) |
| `cor_descricao` | string | `#c0392b` | Cor da descrição (quando cor_auto = false) |
| `cor_preco` | string | `#ffffff` | Cor do preço (quando cor_auto = false) |
| `waves_enabled` | bool | `false` | Ondas SVG decorativas no rodapé |

---

## Variáveis de Ambiente Necessárias

| Variável | Onde | Descrição |
|----------|------|-----------|
| `SUPABASE_URL` | Edge Functions (auto) | URL do projeto Supabase |
| `SUPABASE_SERVICE_ROLE_KEY` | Edge Functions (auto) | Chave service role |
| `LOVABLE_API_KEY` | Edge Functions (auto) | Chave para Lovable AI Gateway |
| `AZURE_SPEECH_KEY` | Edge Functions (secret) | Chave do Azure Cognitive Services para TTS |
| `VITE_SUPABASE_URL` | Frontend (auto) | URL pública do Supabase |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Frontend (auto) | Chave anon do Supabase |

---

## Rotas da Aplicação

| Rota | Componente | Protegida | Descrição |
|------|-----------|-----------|-----------|
| `/` | DashboardPage | ✅ | Dashboard com estatísticas |
| `/catalogo` | CatalogoPage | ✅ | Visualização do catálogo de produtos |
| `/sync` | SyncPage | ✅ | Controle de sincronização |
| `/imagens` | ImagensPage | ✅ | Gerenciamento de imagens |
| `/docs` | DocsPage | ✅ | Documentação da API |
| `/terminal-media` | TerminalMediaPage | ✅ | Gerenciamento de mídias do slideshow |
| `/dispositivos` | DispositivosPage | ✅ | Gerenciamento de empresas, dispositivos e APIs |
| `/terminal` | TerminalPage | ❌ | Terminal de consulta (público, requer ativação) |
