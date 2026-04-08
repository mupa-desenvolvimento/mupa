import { useState, useEffect } from 'react';

export const useTerminalUrl = () => {
  const [terminalUrl, setTerminalUrl] = useState('');

  useEffect(() => {
    // Em produção, usar URL fixa
    if (import.meta.env.PROD) {
      setTerminalUrl('/terminal');
      return;
    }

    // Em desenvolvimento, usar URL configurada ou padrão
    const savedUrl = localStorage.getItem('mupa_dev_terminal_url');
    if (savedUrl) {
      setTerminalUrl(savedUrl);
    } else {
      setTerminalUrl('/terminal');
    }
  }, []);

  const redirectToTerminal = () => {
    if (terminalUrl) {
      if (terminalUrl.startsWith('http')) {
        // URL externa (dev mode)
        window.location.href = terminalUrl;
      } else {
        // URL relativa (prod mode)
        window.location.href = terminalUrl;
      }
    }
  };

  return {
    terminalUrl,
    redirectToTerminal,
    isDevMode: !import.meta.env.PROD,
    isProdMode: import.meta.env.PROD
  };
};
