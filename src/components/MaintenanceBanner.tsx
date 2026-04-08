import React from 'react';

interface MaintenanceBannerProps {
  message?: string;
  showRetry?: boolean;
  onRetry?: () => void;
}

const MaintenanceBanner: React.FC<MaintenanceBannerProps> = ({ 
  message = "Sistema em manutenção. Retomamos em breve.",
  showRetry = true,
  onRetry
}) => {
  return (
    <div className="min-h-screen w-full flex flex-col items-center justify-center bg-gray-50 p-4">
      <div className="max-w-4xl w-full text-center">
        {/* Banner Image */}
        <div className="mb-8 flex justify-center">
          <img 
            src="/Banner Manutenção.jpg" 
            alt="Banner de Manutenção" 
            className="max-w-full h-auto rounded-lg shadow-lg"
            style={{ maxHeight: '60vh' }}
            onError={(e) => {
              // Fallback se a imagem não carregar
              const target = e.target as HTMLImageElement;
              target.style.display = 'none';
            }}
          />
        </div>
        
        {/* Message */}
        <div className="bg-white rounded-lg shadow-md p-6 mb-6">
          <h1 className="text-3xl font-bold text-gray-800 mb-4">
            Manutenção em Andamento
          </h1>
          <p className="text-lg text-gray-600 mb-4">
            {message}
          </p>
          <p className="text-sm text-gray-500">
            Pedimos desculpas pelo inconveniente. Estamos trabalhando para normalizar o serviço o mais rápido possível.
          </p>
        </div>

        {/* Retry Button */}
        {showRetry && onRetry && (
          <button
            onClick={onRetry}
            className="bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 px-6 rounded-lg transition-colors duration-200 shadow-md"
          >
            Tentar Novamente
          </button>
        )}

        {/* Auto-retry indicator */}
        <div className="mt-4">
          <p className="text-sm text-gray-500">
            Tentando reconectar automaticamente...
          </p>
        </div>
      </div>
    </div>
  );
};

export default MaintenanceBanner;
