# Mupa Terminal - PWA Nativo Android

## Visão Geral

Este projeto foi configurado como um Progressive Web App (PWA) que pode ser instalado como um aplicativo nativo em dispositivos Android.

## Funcionalidades PWA

### Modo Desenvolvimento
- **URL Configurável**: É possível configurar a URL da página terminal através da interface de desenvolvimento
- **Hot Reload**: Atualizações automáticas durante o desenvolvimento
- **DevTools**: Ferramentas de desenvolvedor disponíveis

### Modo Produção
- **URL Fixa**: A página terminal é fixa (`/terminal`)
- **Cache Offline**: Funciona mesmo sem conexão à internet
- **Instalação Nativa**: Pode ser instalado como aplicativo Android
- **Fullscreen**: Executa em modo tela cheia
- **Sem URL Bar**: Barra de endereço oculta

## Instalação como App Android

### Através do Chrome
1. Abra o aplicativo no navegador Chrome
2. Clique no menu (três pontos) no canto superior direito
3. Selecione "Instalar aplicativo" ou "Adicionar à tela inicial"
4. Confirme a instalação

### Automaticamente
- O PWA detectará automaticamente e mostrará o banner de instalação

## Configuração de Desenvolvimento

### Alterar URL do Terminal (Modo Dev)
1. Acesse a página inicial (`/`)
2. Clique no botão "Configurar URL (Dev)"
3. Insira a URL desejada (ex: `https://dev.exemplo.com/terminal`)
4. Clique em "Salvar"
5. A nova URL será usada para redirecionamento

### Resetar Configuração
- Clique em "Resetar" para voltar à URL padrão

## Estrutura de Arquivos PWA

```
public/
|-- pwa-192.png          # Ícone 192x192
|-- pwa-512.png          # Ícone 512x512
|-- manifest.json        # Manifesto do PWA
|-- sw.js                 # Service Worker
|-- browserconfig.xml     # Configuração Windows
|-- api/health           # Endpoint de verificação
```

## Configurações Técnicas

### Manifest.json
- **Nome**: Mupa Terminal
- **Display**: Standalone (modo app)
- **Orientação**: Portrait
- **Tema**: Escuro (#0f172a)
- **Start URL**: `/` (redireciona para terminal)

### Service Worker
- **Cache**: Estratégia de cache offline
- **Sync**: Sincronização em background
- **Push**: Notificações push
- **Fallback**: Página offline

### Metatags HTML
- **Viewport-fit=cover**: Para telas com notch
- **User-scalable=no**: Previne zoom
- **Theme-color**: Cor da barra de status
- **Apple-touch-icon**: Ícone iOS

## Comportamento por Modo

### Modo Desenvolvimento (`npm run dev`)
- Interface de configuração visível
- URL configurável via localStorage
- Service worker em modo dev
- Hot reload ativo

### Modo Produção (`npm run build && npm run preview`)
- Interface de configuração oculta
- URL fixa: `/terminal`
- Service worker otimizado
- Cache agressivo
- Build otimizado

## Deploy

### Build para Produção
```bash
npm run build
```

### Preview Local
```bash
npm run preview
```

### Deploy em Servidor
1. Faça o upload da pasta `dist/`
2. Configure HTTPS (obrigatório para PWA)
3. Garanta que o service worker está servido corretamente

## Funcionalidades Android

### Instalação
- Ícone na tela inicial
- Sem barra de endereço
- Fullscreen automático
- Ícone personalizado

### Comportamento
- Abre diretamente no terminal
- Funciona offline
- Notificações push
- Sincronização em background

### Gestos
- Swipe para fechar (configurável)
- Pull-to-refresh desativado
- Zoom desativado

## Troubleshooting

### PWA não instala
- Verifique se está usando HTTPS
- Verifique o manifest.json
- Limpe o cache do navegador

### Service Worker não atualiza
- Use o DevTools > Application > Service Workers
- Clique em "Update on reload"
- Limpe o storage do navegador

### URL não redireciona
- Verifique o localStorage em modo dev
- Limpe os dados do site
- Recarregue a página

## Desenvolvimento Futuro

- [ ] Ícones de múltiplos tamanhos
- [ ] Splash screens personalizadas
- [ ] Notificações push avançadas
- [ ] Sincronização de dados offline
- [ ] Compartilhamento de conteúdo
- [ ] Integração com APIs nativas
