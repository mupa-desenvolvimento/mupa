import { useEffect, useState } from 'react';
import { useTerminalUrl } from '@/hooks/useTerminalUrl';
import { Settings } from 'lucide-react';
import DevConfig from '@/components/DevConfig';

const HomePage = () => {
  const { redirectToTerminal, isDevMode } = useTerminalUrl();
  const [showDevConfig, setShowDevConfig] = useState(false);

  useEffect(() => {
    // Redirecionar imediatamente para o terminal
    const timer = setTimeout(() => {
      redirectToTerminal();
    }, 100);

    return () => clearTimeout(timer);
  }, [redirectToTerminal]);

  // Se for modo dev, mostrar configuração antes de redirecionar
  if (isDevMode) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="text-center">
          <div className="mb-8">
            <h1 className="text-3xl font-bold text-gray-800 mb-2">Mupa Terminal</h1>
            <p className="text-gray-600">Redirecionando para o terminal...</p>
          </div>

          <div className="flex flex-col gap-4 items-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            
            <button
              onClick={() => setShowDevConfig(true)}
              className="flex items-center gap-2 px-4 py-2 bg-gray-200 hover:bg-gray-300 rounded-lg transition-colors text-gray-700"
            >
              <Settings className="w-4 h-4" />
              Configurar URL (Dev)
            </button>
          </div>

          <div className="mt-8 flex flex-col gap-3 text-sm text-gray-500">
            <p>Modo Desenvolvimento</p>
            <p>Você será redirecionado automaticamente</p>
            <div className="flex justify-center gap-4 mt-4">
              <a
                href="/diagnostic"
                className="text-blue-600 hover:text-blue-700 underline"
                onClick={(e) => e.stopPropagation()}
              >
                Diagnóstico PWA
              </a>
              <a
                href="/pwa-help"
                className="text-blue-600 hover:text-blue-700 underline"
                onClick={(e) => e.stopPropagation()}
              >
                Ajuda PWA
              </a>
            </div>
          </div>
        </div>

        {showDevConfig && (
          <DevConfig onClose={() => setShowDevConfig(false)} />
        )}
      </div>
    );
  }

  // Em produção, mostrar tela de carregamento simples
  return (
    <div className="min-h-screen bg-gray-900 flex items-center justify-center">
      <div className="text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white mb-4"></div>
        <p className="text-white text-lg">Carregando terminal...</p>
      </div>
    </div>
  );
};

export default HomePage;
