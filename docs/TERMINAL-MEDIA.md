# 📺 Terminal de Reprodução de Conteúdos (Digital Signage)

Este documento descreve **como o terminal de mídias do Mupa foi construído** e **como ele deve ser construído/operado**: arquitetura, fluxo de dados, contratos, comportamentos esperados e pontos de extensão.

> Rota pública: `/terminal` — acesso de quiosque (sem login).
> Painel de gestão: `/terminal-media` — biblioteca, playlists, configurações.

---

## 1. Visão geral

O terminal é um **PWA fullscreen** que cumpre dois papéis simultâneos:

1. **Digital Signage** — reproduz uma playlist de **imagens e vídeos** (slideshow) enquanto está ocioso.
2. **Consulta de preços** — quando um código de barras é lido (scanner USB/HID ou teclado virtual), interrompe o slideshow e exibe ficha do produto (imagem, descrição, preços, sugestões de IA, TTS).

Após inatividade (~30s) ou 3s após erro de consulta, retorna automaticamente ao slideshow.

**Requisitos não-funcionais:**
- Funcionar **offline** (PWA + cache de manifesto + IndexedDB).
- Estética premium, sem rolagem, adaptativa a `portrait` e `landscape`.
- Tela sempre acordada (`Wake Lock`) e em fullscreen.
- Ativação por **código único** ou **QR Code** vinculado à empresa.

---

## 2. Stack

| Camada | Tecnologia |
|---|---|
| UI | React 18 + Vite + Tailwind + framer-motion |
| Backend | Supabase (Lovable Cloud) — Postgres + Storage + Edge Functions (Deno) |
| Offline | Workbox (NetworkFirst) + IndexedDB (`mupa-cache`) + `localStorage` fallback |
| Mídia | `<img>` para imagens, `<video autoplay muted playsinline>` para vídeos |
| TTS | Edge Function `tts-audio` (Microsoft Azure) |
| Sugestões | Edge Function `api-sugestoes` (LLM) |
| App nativo opcional | `expo-terminal/` — WebView que aponta para `/terminal?device_id=…` |

---

## 3. Arquitetura

```
┌─────────────────────── Painel /terminal-media ───────────────────────┐
│  Upload de mídia → Storage  │  Playlists  │  Configurações           │
│  Vincula playlist a Dispositivo / Grupo                              │
└──────────────────────────────┬───────────────────────────────────────┘
                               │ (Postgres + Storage)
                               ▼
┌──────────────────────── Terminal /terminal ──────────────────────────┐
│  1) Ativação (código/QR)  →  device_id persistido                    │
│  2) Pull do manifesto de mídia (por device_id)                       │
│  3) Slideshow loop (idle)                                            │
│  4) Scanner / teclado virtual → consulta-preço → ficha do produto    │
│  5) TTS + sugestões → reset por inatividade → volta ao slideshow     │
└──────────────────────────────────────────────────────────────────────┘
```

---

## 4. Modelo de dados (essencial)

| Tabela | Função |
|---|---|
| `terminal_media` | Itens de mídia: `tipo` (`imagem`/`video`), `url`, `storage_path`, `duracao_segundos`, `ativo`, `ordem`. |
| `terminal_playlists` | Playlists nomeadas. |
| `terminal_playlist_items` | Itens da playlist com `ordem` e `duracao_segundos` (override). |
| `dispositivos` | Terminais físicos: `id`, `nome`, `grupo_id`, `playlist_id`, `config_override`, `ultimo_acesso`. |
| `grupos_dispositivos` | Agrupamento (loja/setor) para playlist e config padrão. |
| `terminal_config` | Configurações globais por chave (`tipo_sugestao`, `beep_enabled`, `tts_enabled`, layout, cores, footer, etc.). |
| `empresas` / `lojas` | Multi-tenant; ativação vincula `device` à empresa/loja. |

> Storage: bucket `terminal-media` para arquivos enviados; URL pública gerada via Supabase Storage.

---

## 5. Ciclo de vida do terminal

### 5.1. Ativação (primeiro boot)
1. Terminal abre `/terminal` sem `device_id` reconhecido.
2. Wizard pede **código de empresa** (regex `^[A-Z]{3}[0-9]{3}$`) **ou** lê QR.
3. Chama `api-ativar-dispositivo` → cria/recupera `dispositivo`, devolve `device_id`.
4. `device_id` é salvo em `localStorage` (`mupa.deviceId`) — em apps Expo, em `AsyncStorage`.
5. Próximos boots: chama `api-device-lookup` para validar e baixar a config atual.

### 5.2. Estados em runtime
- `idle` → tocando slideshow.
- `consulting` → loader animado durante chamada de preço.
- `product` → ficha exibida (com timer de reset de 30s).
- `error` → mensagem amigável; volta a `idle` em 3s.

---

## 6. Pipeline de mídia (slideshow)

### 6.1. Manifesto
O terminal mantém um **manifesto local** (`MediaManifest`) cacheado por `device_id`:

```ts
type MediaManifest = {
  v: 1;
  updated_at: string;
  device_id: string | null;
  playlist_id: string | null;
  items: Array<{
    id: string;
    tipo: "imagem" | "video";
    url: string;
    duracao_segundos: number;
  }>;
};
```

Chave de cache: `mupa:media_manifest:v1:<device_id>` em **IndexedDB** (com fallback `localStorage`).

### 6.2. Atualização
- **Pull periódico** (`useInfinitePolling`) revalida o manifesto a cada N segundos.
- Comparação por `updated_at`; se diferente, substitui e recarrega o player.
- Pré-carrega próximas mídias (`<link rel="preload">` lógico via `Image()` / `<video preload="auto">`).

### 6.3. Player
- Imagens: avançam após `duracao_segundos`.
- Vídeos: avançam ao `onEnded` (sem áudio: `muted` + `playsinline` para autoplay confiável).
- `AnimatePresence` (framer-motion) faz crossfade suave.
- Em erro de carregamento de um item, **pula** para o próximo e marca o item para retry no próximo manifesto.

### 6.4. Offline
- Service Worker (Workbox, **NetworkFirst**) cacheia URLs de mídia, Supabase REST e Edge Functions.
- Sem rede + sem cache → exibe cartão "Sem mídia disponível" e mantém a tela viva.

---

## 7. Pipeline de consulta de preço

1. Input vem do scanner (HID emula teclado) **ou** do `VirtualKeyboard`.
2. Hidden input acumula dígitos; `Enter` dispara `consultaPreco(ean)`.
3. Cache local primeiro: `mupa:preco_cache:v1:<empresa>:<loja>:<ean>` (TTL curto).
4. Cache miss → `api-consulta-preco` (com `apikey` + `Authorization` da chave anon) com timeout (`fetchJsonWithTimeout`).
5. Sucesso:
   - Renderiza ficha (`ProductView`) com tema dinâmico extraído da imagem.
   - Dispara `tts-audio` em paralelo (não bloqueia render).
   - Dispara `api-sugestoes` em background (`runInBackground` / `requestIdleCallback`).
6. Inatividade de 30s → volta ao slideshow.

### 7.1. Foco do input oculto
Um listener global (`pointerdown`/`touchstart`) reforça o foco do input invisível para o scanner sempre funcionar — **exceto** quando o alvo está dentro de `.mupa-virtual-keyboard` (evita roubar o clique dos botões).

### 7.2. Teclado virtual
Componente `VirtualKeyboard`:
- `onMouseDown`/`onPointerDown` no container chamam `e.preventDefault()` para **não perder o foco** do input oculto.
- Botões usam `onClick` padrão para máxima compatibilidade mobile/desktop.
- Container marcado com classe `mupa-virtual-keyboard` (vide acima).

---

## 8. Fullscreen, Wake Lock e Kiosk

`useFullscreen()`:
- Pede `requestFullscreen` na primeira interação (e automaticamente se `display-mode: standalone`).
- Solicita `navigator.wakeLock.request("screen")` e re-adquire em `visibilitychange`.

App Expo (`expo-terminal/App.tsx`):
- `expo-keep-awake` mantém a tela.
- `NavigationBar` oculta a barra Android (modo imersivo).
- WebView com `domStorageEnabled` + `cacheEnabled`; reinjeta foco no input a cada ~1.4s.
- Teclado físico do app envia eventos `KeyboardEvent` para o WebView.

---

## 9. Painel `/terminal-media` (como construir conteúdos)

Funcionalidades implementadas:

- **Biblioteca de mídia**: upload (imagem/vídeo) com preview, duração, filtro e busca.
- **Playlists**: timeline drag-and-drop (`@dnd-kit`), reordenação, duração por item, remoção.
- **Vínculo**: playlist → dispositivo ou grupo (`config_override`).
- **Configurações** (persistidas em `terminal_config`):
  - `tipo_sugestao`, `beep_enabled`, `tts_enabled`.
  - Layouts pré-definidos (`classico`, `compacto`, `painel`, `cartaz`, `vitrine`, `minimalista`).
  - Tipografia (`font_nome`, `font_preco`), `img_size`, `max_sugestoes`.
  - Cores (auto a partir da imagem ou manuais), waves, footer, relógio.
  - URL de API de mapeamento de preço externa (Clube/Oferta/Atacado).
- **QR de ativação** por empresa/dispositivo (componente `QrCodeTile`).
- **Preview ao vivo** com zoom e play/pause da timeline.

---

## 10. Edge Functions usadas pelo terminal

| Função | Uso |
|---|---|
| `api-ativar-dispositivo` | Ativa device por código de empresa. |
| `api-device-lookup` | Recupera config + playlist do device. |
| `api-consulta-preco` / `consulta-preco` | Consulta preço por EAN. |
| `api-produto-nobg` | Imagem do produto sem fundo. |
| `api-image-proxy` | Proxy para imagens de terceiros (CORS/cache). |
| `api-sugestoes` | Sugestões com IA. |
| `tts-audio` | Áudio TTS (Azure) em `audio/mpeg`. |
| `sync-produtos` | Sincroniza catálogo (admin). |

> **Headers obrigatórios** no front: `apikey` + `Authorization: Bearer <VITE_SUPABASE_PUBLISHABLE_KEY>`.

---

## 11. Cache e resiliência

- **IndexedDB** (`mupa-cache` / store `kv`) — chaves:
  - `mupa:media_manifest:v1:<device_id>`
  - `mupa:empresa_preco_config:v1:<empresa>`
  - `mupa:preco_cache:v1:<empresa>:<loja>:<ean>`
- **Fallback** em `localStorage` quando IDB indisponível.
- **Timeouts** explícitos com `AbortController` em todas as chamadas críticas.
- **Pré-aquecimento** opcional: ao receber novo manifesto, baixa as primeiras N mídias.

---

## 12. Acessibilidade & UX

- Sem rolagem; layout adaptativo a `portrait`/`landscape` via `getViewport()` + `visualViewport`.
- Tipografia ampliada para leitura à distância.
- Contraste calculado dinamicamente do tema do produto (HSL → RGB).
- Mensagens de erro em PT-BR amigáveis (`formatApiError`).

---

## 13. Como adicionar uma nova mídia (passo a passo)

1. Acesse `/terminal-media` autenticado.
2. **Upload** na biblioteca (drag-and-drop ou botão).
3. Defina `duracao_segundos` (imagens; vídeos usam duração nativa).
4. Abra/ crie uma **Playlist** e arraste o item para a timeline.
5. Vincule a playlist a um **Dispositivo** ou **Grupo**.
6. O terminal-alvo pega o novo manifesto no próximo polling (ou ao recarregar).

---

## 14. Como criar/registrar um novo terminal

1. No painel, gere um **código de empresa** (`AAA000`) ou QR.
2. No dispositivo (web ou app Expo), abra `/terminal`.
3. Informe o código → wizard salva `device_id`.
4. Opcional: abra `/dispositivos` para renomear, mover de grupo, atribuir playlist.

---

## 15. Boas práticas de construção

- **Nunca** bloquear o render da ficha de produto com TTS/sugestões — sempre `runInBackground`.
- **Sempre** validar `device_id` antes de qualquer chamada que dependa de loja/empresa.
- **Não** armazenar segredos no front; usar apenas `VITE_SUPABASE_PUBLISHABLE_KEY`.
- **Manter** os atalhos de classe (`mupa-virtual-keyboard`) ao introduzir novos componentes que não devem perder foco.
- **Versionar** caches via sufixo `:v1` para invalidar com migrações futuras.
- **Evitar** tocar em `src/integrations/supabase/*` (auto-gerado).

---

## 16. Roadmap sugerido

- Agendamento de playlists por dia/horário.
- Métricas de exibição (quais mídias rodaram, por quanto tempo).
- A/B de layouts da ficha de produto.
- Modo "promo" — overlay temporário sobre o slideshow sem trocar a playlist.
- Push em tempo real do manifesto via Supabase Realtime (eliminar polling).

---

_Atualizado para refletir a implementação atual de `src/pages/TerminalPage.tsx`, `src/pages/TerminalMediaPage.tsx`, `src/components/virtual-keyboard/*`, `src/hooks/useFullscreen.ts` e `expo-terminal/App.tsx`._
