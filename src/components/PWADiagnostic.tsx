import { useState, useEffect } from 'react';
import { Check, X, AlertTriangle, Smartphone, Globe, Wifi, WifiOff } from 'lucide-react';

interface DiagnosticResult {
  name: string;
  status: 'pass' | 'fail' | 'warning';
  message: string;
  details?: string;
}

const PWADiagnostic: React.FC = () => {
  const [results, setResults] = useState<DiagnosticResult[]>([]);
  const [isRunning, setIsRunning] = useState(false);

  const runDiagnostic = async () => {
    setIsRunning(true);
    const diagnostics: DiagnosticResult[] = [];

    // 1. HTTPS Check
    const isHttps = location.protocol === 'https:' || location.hostname === 'localhost';
    diagnostics.push({
      name: 'HTTPS',
      status: isHttps ? 'pass' : 'fail',
      message: isHttps ? 'Conexão segura detectada' : 'HTTPS é obrigatório para PWA',
      details: !isHttps ? 'PWA requer HTTPS em produção. Use localhost ou HTTPS.' : undefined
    });

    // 2. Service Worker Check
    if ('serviceWorker' in navigator) {
      try {
        const registration = await navigator.serviceWorker.ready;
        diagnostics.push({
          name: 'Service Worker',
          status: 'pass',
          message: 'Service Worker ativo e registrado',
          details: `Scope: ${registration.scope}`
        });
      } catch (error) {
        diagnostics.push({
          name: 'Service Worker',
          status: 'fail',
          message: 'Erro no Service Worker',
          details: String(error)
        });
      }
    } else {
      diagnostics.push({
        name: 'Service Worker',
        status: 'fail',
        message: 'Service Worker não suportado',
        details: 'Navegador não suporta Service Workers'
      });
    }

    // 3. Manifest Check
    try {
      const manifest = await fetch('/manifest.json').then(r => r.json());
      diagnostics.push({
        name: 'Manifest',
        status: 'pass',
        message: 'Manifest.json carregado com sucesso',
        details: `Nome: ${manifest.name}, Display: ${manifest.display}`
      });
    } catch (error) {
      diagnostics.push({
        name: 'Manifest',
        status: 'fail',
        message: 'Erro ao carregar manifest.json',
        details: String(error)
      });
    }

    // 4. Installability Check
    let isInstallable = false;
    try {
      if ('serviceWorker' in navigator && 'PushManager' in window) {
        const registration = await navigator.serviceWorker.ready;
        if ('prompt' in registration) {
          isInstallable = true;
        }
      }
      
      // Check for beforeinstallprompt event
      diagnostics.push({
        name: 'Instalabilidade',
        status: isInstallable ? 'pass' : 'warning',
        message: isInstallable ? 'PWA pode ser instalado' : 'Verifique critérios de instalação',
        details: !isInstallable ? 'PWA precisa: HTTPS, Service Worker, Manifest válido, e ser acessado algumas vezes' : undefined
      });
    } catch (error) {
      diagnostics.push({
        name: 'Instalabilidade',
        status: 'warning',
        message: 'Não foi possível verificar instalabilidade',
        details: String(error)
      });
    }

    // 5. Screen Orientation Check
    const orientationSupported = 'screen' in window && 'orientation' in window.screen;
    diagnostics.push({
      name: 'Orientação de Tela',
      status: orientationSupported ? 'pass' : 'warning',
      message: orientationSupported ? 'Orientação de tela suportada' : 'Orientação pode não funcionar',
      details: !orientationSupported ? 'Alguns navegadores não suportam orientação forçada' : undefined
    });

    // 6. Fullscreen API Check
    const fullscreenSupported = 'fullscreenElement' in document || 'webkitFullscreenElement' in document;
    diagnostics.push({
      name: 'Fullscreen API',
      status: fullscreenSupported ? 'pass' : 'fail',
      message: fullscreenSupported ? 'Fullscreen suportado' : 'Fullscreen não suportado',
      details: !fullscreenSupported ? 'Fullscreen é essencial para experiência PWA' : undefined
    });

    // 7. Cache API Check
    const cacheSupported = 'caches' in window;
    diagnostics.push({
      name: 'Cache API',
      status: cacheSupported ? 'pass' : 'fail',
      message: cacheSupported ? 'Cache suportado' : 'Cache não suportado',
      details: !cacheSupported ? 'Cache é necessário para funcionalidade offline' : undefined
    });

    // 8. Storage Check
    const storageSupported = 'localStorage' in window && 'sessionStorage' in window;
    diagnostics.push({
      name: 'Storage API',
      status: storageSupported ? 'pass' : 'fail',
      message: storageSupported ? 'Storage suportado' : 'Storage não suportado',
      details: !storageSupported ? 'Storage necessário para configurações e cache' : undefined
    });

    // 9. Network Check
    const isOnline = navigator.onLine;
    diagnostics.push({
      name: 'Conexão',
      status: isOnline ? 'pass' : 'warning',
      message: isOnline ? 'Online' : 'Offline',
      details: !isOnline ? 'Modo offline detectado' : undefined
    });

    // 10. Device Check
    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    diagnostics.push({
      name: 'Dispositivo',
      status: 'pass',
      message: isMobile ? 'Dispositivo móvel detectado' : 'Dispositivo desktop detectado',
      details: isMobile ? 'Ótimo para PWA' : 'PWA funciona melhor em dispositivos móveis'
    });

    setResults(diagnostics);
    setIsRunning(false);
  };

  useEffect(() => {
    runDiagnostic();
  }, []);

  const getStatusIcon = (status: 'pass' | 'fail' | 'warning') => {
    switch (status) {
      case 'pass':
        return <Check className="w-5 h-5 text-green-600" />;
      case 'fail':
        return <X className="w-5 h-5 text-red-600" />;
      case 'warning':
        return <AlertTriangle className="w-5 h-5 text-yellow-600" />;
    }
  };

  const getStatusColor = (status: 'pass' | 'fail' | 'warning') => {
    switch (status) {
      case 'pass':
        return 'bg-green-50 border-green-200 text-green-800';
      case 'fail':
        return 'bg-red-50 border-red-200 text-red-800';
      case 'warning':
        return 'bg-yellow-50 border-yellow-200 text-yellow-800';
    }
  };

  const passCount = results.filter(r => r.status === 'pass').length;
  const failCount = results.filter(r => r.status === 'fail').length;
  const warningCount = results.filter(r => r.status === 'warning').length;

  return (
    <div className="min-h-screen bg-gray-50 p-4">
      <div className="max-w-4xl mx-auto">
        <div className="bg-white rounded-lg shadow-lg p-6 mb-6">
          <div className="flex items-center gap-3 mb-6">
            <Smartphone className="w-8 h-8 text-blue-600" />
            <h1 className="text-2xl font-bold text-gray-800">Diagnóstico PWA</h1>
          </div>

          <div className="grid grid-cols-3 gap-4 mb-6">
            <div className="bg-green-50 rounded-lg p-4 text-center">
              <div className="text-2xl font-bold text-green-600">{passCount}</div>
              <div className="text-sm text-green-800">Passou</div>
            </div>
            <div className="bg-red-50 rounded-lg p-4 text-center">
              <div className="text-2xl font-bold text-red-600">{failCount}</div>
              <div className="text-sm text-red-800">Falhou</div>
            </div>
            <div className="bg-yellow-50 rounded-lg p-4 text-center">
              <div className="text-2xl font-bold text-yellow-600">{warningCount}</div>
              <div className="text-sm text-yellow-800">Aviso</div>
            </div>
          </div>

          <button
            onClick={runDiagnostic}
            disabled={isRunning}
            className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white font-medium py-2 px-4 rounded-lg transition-colors mb-6"
          >
            {isRunning ? 'Executando diagnóstico...' : 'Executar diagnóstico novamente'}
          </button>

          <div className="space-y-3">
            {results.map((result, index) => (
              <div
                key={index}
                className={`border rounded-lg p-4 ${getStatusColor(result.status)}`}
              >
                <div className="flex items-start gap-3">
                  {getStatusIcon(result.status)}
                  <div className="flex-1">
                    <div className="font-medium">{result.name}</div>
                    <div className="text-sm mt-1">{result.message}</div>
                    {result.details && (
                      <div className="text-xs mt-2 opacity-75">{result.details}</div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>

          {failCount > 0 && (
            <div className="mt-6 p-4 bg-red-50 border border-red-200 rounded-lg">
              <h3 className="font-medium text-red-800 mb-2">Problemas encontrados:</h3>
              <ul className="text-sm text-red-700 space-y-1">
                {results.filter(r => r.status === 'fail').map((result, index) => (
                  <li key={index}>· {result.message}</li>
                ))}
              </ul>
            </div>
          )}

          {warningCount > 0 && (
            <div className="mt-6 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
              <h3 className="font-medium text-yellow-800 mb-2">Avisos:</h3>
              <ul className="text-sm text-yellow-700 space-y-1">
                {results.filter(r => r.status === 'warning').map((result, index) => (
                  <li key={index}>· {result.message}</li>
                ))}
              </ul>
            </div>
          )}

          <div className="mt-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
            <h3 className="font-medium text-blue-800 mb-2">Soluções comuns:</h3>
            <ul className="text-sm text-blue-700 space-y-1">
              <li>· Use HTTPS em produção (obrigatório para PWA)</li>
              <li>· Acesse o site algumas vezes antes de tentar instalar</li>
              <li>· Use Chrome ou Edge para melhor compatibilidade</li>
              <li>· Limpe o cache e dados do site se tiver problemas</li>
              <li>· Verifique se o Service Worker está registrado</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PWADiagnostic;
