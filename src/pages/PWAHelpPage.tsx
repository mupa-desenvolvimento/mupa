import { useState, useEffect } from 'react';
import { Smartphone, Download, Globe, Shield, Wifi, CheckCircle, XCircle, AlertCircle } from 'lucide-react';

const PWAHelpPage = () => {
  const [isInstallable, setIsInstallable] = useState(false);
  const [isInstalled, setIsInstalled] = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);

  useEffect(() => {
    // Verificar se já está instalado
    setIsInstalled(window.matchMedia('(display-mode: standalone)').matches);

    // Capturar evento beforeinstallprompt
    const handleBeforeInstallPrompt = (e: any) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setIsInstallable(true);
    };

    // Capturar evento appinstalled
    const handleAppInstalled = () => {
      setIsInstalled(true);
      setIsInstallable(false);
      setDeferredPrompt(null);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  const handleInstallClick = async () => {
    if (!deferredPrompt) return;

    try {
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      
      if (outcome === 'accepted') {
        setIsInstalled(true);
        setIsInstallable(false);
      }
      
      setDeferredPrompt(null);
    } catch (error) {
      console.error('Erro na instalação:', error);
    }
  };

  const requirements = [
    {
      icon: <Globe className="w-5 h-5" />,
      title: 'HTTPS',
      description: 'Conexão segura obrigatória',
      check: location.protocol === 'https:' || location.hostname === 'localhost'
    },
    {
      icon: <Smartphone className="w-5 h-5" />,
      title: 'Service Worker',
      description: 'Funcionalidade offline',
      check: 'serviceWorker' in navigator
    },
    {
      icon: <Shield className="w-5 h-5" />,
      title: 'Manifest',
      description: 'Configurações PWA',
      check: true // Será verificado dinamicamente
    },
    {
      icon: <Wifi className="w-5 h-5" />,
      title: 'Acessos Múltiplos',
      description: 'Acessar o site algumas vezes',
      check: true
    }
  ];

  const steps = [
    {
      browser: 'Chrome Android',
      steps: [
        'Abra o site no Chrome',
        'Aguarde o banner de instalação',
        'Toque em "Instalar aplicativo"',
        'Confirme a instalação',
        'Ícone aparecerá na tela inicial'
      ]
    },
    {
      browser: 'Samsung Internet',
      steps: [
        'Abra o site no navegador',
        'Toque no menu (três pontos)',
        'Selecione "Adicionar à tela inicial"',
        'Toque em "Adicionar"',
        'Confirme na tela inicial'
      ]
    },
    {
      browser: 'Firefox Android',
      steps: [
        'Abra o site no Firefox',
        'Toque no menu (três pontos)',
        'Selecione "Instalar site como aplicativo"',
        'Toque em "Instalar"',
        'Confirme a instalação'
      ]
    }
  ];

  const troubleshooting = [
    {
      problem: 'Banner não aparece',
      solution: 'Acesse o site várias vezes, limpe o cache, verifique HTTPS'
    },
    {
      problem: 'Botão instalar não funciona',
      solution: 'Use Chrome, verifique conexão, reinicie o navegador'
    },
    {
      problem: 'App não funciona offline',
      solution: 'Verifique Service Worker, limpe dados, reinstale'
    },
    {
      problem: 'Ícone não aparece',
      solution: 'Verifique tela inicial, pesquise "Mupa", reinstale'
    }
  ];

  return (
    <div className="min-h-screen bg-gray-50 p-4">
      <div className="max-w-4xl mx-auto">
        <div className="bg-white rounded-lg shadow-lg p-6 mb-6">
          <div className="flex items-center gap-3 mb-6">
            <Smartphone className="w-8 h-8 text-blue-600" />
            <h1 className="text-2xl font-bold text-gray-800">Ajuda PWA - Mupa Terminal</h1>
          </div>

          {/* Status de Instalação */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-medium text-blue-800">Status da Instalação</h3>
                <p className="text-sm text-blue-600 mt-1">
                  {isInstalled 
                    ? 'PWA já está instalado' 
                    : isInstallable 
                      ? 'PWA pronto para instalar' 
                      : 'Verifique requisitos abaixo'
                  }
                </p>
              </div>
              {isInstallable && !isInstalled && (
                <button
                  onClick={handleInstallClick}
                  className="bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-4 rounded-lg transition-colors flex items-center gap-2"
                >
                  <Download className="w-4 h-4" />
                  Instalar Agora
                </button>
              )}
            </div>
          </div>

          {/* Requisitos */}
          <div className="mb-6">
            <h2 className="text-xl font-bold text-gray-800 mb-4">Requisitos para Instalação</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {requirements.map((req, index) => (
                <div key={index} className="flex items-start gap-3 p-4 bg-gray-50 rounded-lg">
                  <div className={`p-2 rounded-lg ${req.check ? 'bg-green-100 text-green-600' : 'bg-red-100 text-red-600'}`}>
                    {req.icon}
                  </div>
                  <div className="flex-1">
                    <h3 className="font-medium text-gray-800">{req.title}</h3>
                    <p className="text-sm text-gray-600">{req.description}</p>
                  </div>
                  <div>
                    {req.check ? (
                      <CheckCircle className="w-5 h-5 text-green-600" />
                    ) : (
                      <XCircle className="w-5 h-5 text-red-600" />
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Passos de Instalação */}
          <div className="mb-6">
            <h2 className="text-xl font-bold text-gray-800 mb-4">Como Instalar</h2>
            <div className="space-y-4">
              {steps.map((guide, index) => (
                <div key={index} className="border rounded-lg p-4">
                  <h3 className="font-medium text-gray-800 mb-3">{guide.browser}</h3>
                  <ol className="space-y-2">
                    {guide.steps.map((step, stepIndex) => (
                      <li key={stepIndex} className="flex items-start gap-3">
                        <span className="flex-shrink-0 w-6 h-6 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center text-sm font-medium">
                          {stepIndex + 1}
                        </span>
                        <span className="text-sm text-gray-700">{step}</span>
                      </li>
                    ))}
                  </ol>
                </div>
              ))}
            </div>
          </div>

          {/* Troubleshooting */}
          <div className="mb-6">
            <h2 className="text-xl font-bold text-gray-800 mb-4">Solução de Problemas</h2>
            <div className="space-y-3">
              {troubleshooting.map((item, index) => (
                <div key={index} className="flex items-start gap-3 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
                  <AlertCircle className="w-5 h-5 text-yellow-600 mt-0.5" />
                  <div>
                    <h3 className="font-medium text-yellow-800">{item.problem}</h3>
                    <p className="text-sm text-yellow-700 mt-1">{item.solution}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Dicas Adicionais */}
          <div className="bg-green-50 border border-green-200 rounded-lg p-4">
            <h3 className="font-medium text-green-800 mb-3">Dicas para Melhor Experiência</h3>
            <ul className="text-sm text-green-700 space-y-1">
              <li>· Use Chrome ou Edge para melhor compatibilidade</li>
              <li>· Acesse o site pelo menos 3 vezes antes de instalar</li>
              <li>· Mantenha o aplicativo atualizado</li>
              <li>· Conceda permissões quando solicitado</li>
              <li>· Use em modo landscape para melhor visualização</li>
            </ul>
          </div>

          {/* Links Úteis */}
          <div className="mt-6 text-center">
            <a
              href="/diagnostic"
              className="inline-flex items-center gap-2 text-blue-600 hover:text-blue-700 font-medium"
            >
              Executar Diagnóstico PWA
              <AlertCircle className="w-4 h-4" />
            </a>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PWAHelpPage;
