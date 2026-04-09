import { useState, useEffect } from 'react';
import { Settings, Power, AlertTriangle, CheckCircle } from 'lucide-react';

interface MaintenanceStatus {
  isUnderMaintenance: boolean;
  message: string;
  lastUpdated: string;
}

const MaintenanceControlPage: React.FC = () => {
  const [status, setStatus] = useState<MaintenanceStatus>({
    isUnderMaintenance: false,
    message: '',
    lastUpdated: new Date().toISOString(),
  });
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Carregar status atual
  useEffect(() => {
    loadCurrentStatus();
  }, []);

  const loadCurrentStatus = async () => {
    try {
      const response = await fetch('/api/maintenance-status');
      if (response.ok) {
        const data = await response.json();
        setStatus(data);
      }
    } catch (error) {
      console.error('Erro ao carregar status:', error);
    }
  };

  const updateStatus = async (newStatus: boolean, message?: string) => {
    setIsLoading(true);
    setError(null);
    setSuccess(null);

    try {
      // Em produção, isso seria uma chamada API real
      // Por agora, vamos simular atualização local
      const updatedStatus: MaintenanceStatus = {
        isUnderMaintenance: newStatus,
        message: message || (newStatus ? 'Sistema em manutenção programada.' : ''),
        lastUpdated: new Date().toISOString(),
      };

      // Simular chamada API
      await new Promise(resolve => setTimeout(resolve, 1000));

      setStatus(updatedStatus);
      setSuccess(newStatus ? 'Sistema colocado em manutenção' : 'Sistema retirado de manutenção');

      // Limpar mensagem de sucesso após 3 segundos
      setTimeout(() => setSuccess(null), 3000);

    } catch (error) {
      setError('Erro ao atualizar status de manutenção');
      console.error(error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleMessageChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setStatus(prev => ({ ...prev, message: e.target.value }));
  };

  return (
    <div className="min-h-screen bg-gray-50 p-4">
      <div className="max-w-4xl mx-auto">
        <div className="bg-white rounded-lg shadow-lg p-6">
          <div className="flex items-center gap-3 mb-6">
            <Settings className="w-8 h-8 text-blue-600" />
            <h1 className="text-2xl font-bold text-gray-800">Controle de Manutenção</h1>
          </div>

          {/* Status Atual */}
          <div className={`rounded-lg p-4 mb-6 ${
            status.isUnderMaintenance 
              ? 'bg-red-50 border border-red-200' 
              : 'bg-green-50 border border-green-200'
          }`}>
            <div className="flex items-center gap-3">
              {status.isUnderMaintenance ? (
                <>
                  <AlertTriangle className="w-6 h-6 text-red-600" />
                  <div>
                    <h3 className="font-medium text-red-800">Sistema EM MANUTENÇÃO</h3>
                    <p className="text-sm text-red-600 mt-1">
                      {status.message || 'Sistema em manutenção programada.'}
                    </p>
                  </div>
                </>
              ) : (
                <>
                  <CheckCircle className="w-6 h-6 text-green-600" />
                  <div>
                    <h3 className="font-medium text-green-800">Sistema OPERACIONAL</h3>
                    <p className="text-sm text-green-600 mt-1">
                      Terminal funcionando normalmente
                    </p>
                  </div>
                </>
              )}
            </div>
            <div className="mt-3 text-xs text-gray-500">
              Última atualização: {new Date(status.lastUpdated).toLocaleString('pt-BR')}
            </div>
          </div>

          {/* Controles */}
          <div className="space-y-6">
            {/* Botões de Ação */}
            <div className="flex gap-4">
              <button
                onClick={() => updateStatus(true, status.message)}
                disabled={isLoading || status.isUnderMaintenance}
                className="flex-1 bg-red-600 hover:bg-red-700 disabled:bg-red-400 text-white font-medium py-3 px-4 rounded-lg transition-colors flex items-center justify-center gap-2"
              >
                <Power className="w-4 h-4" />
                {isLoading ? 'Processando...' : 'Ativar Manutenção'}
              </button>
              
              <button
                onClick={() => updateStatus(false)}
                disabled={isLoading || !status.isUnderMaintenance}
                className="flex-1 bg-green-600 hover:bg-green-700 disabled:bg-green-400 text-white font-medium py-3 px-4 rounded-lg transition-colors flex items-center justify-center gap-2"
              >
                <CheckCircle className="w-4 h-4" />
                {isLoading ? 'Processando...' : 'Desativar Manutenção'}
              </button>
            </div>

            {/* Campo de Mensagem */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Mensagem de Manutenção (opcional)
              </label>
              <textarea
                value={status.message}
                onChange={handleMessageChange}
                placeholder="Digite uma mensagem para exibir durante a manutenção..."
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                rows={3}
              />
              <p className="text-xs text-gray-500 mt-1">
                Esta mensagem será exibida no banner de manutenção
              </p>
            </div>

            {/* Informações */}
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <h3 className="font-medium text-blue-800 mb-2">Como funciona:</h3>
              <ul className="text-sm text-blue-700 space-y-1">
                <li>· Ao ativar manutenção, todos os terminais exibirão o banner</li>
                <li>· Os terminais continuam rodando e tentando consultar a API</li>
                <li>· Apenas a interface é substituída pelo banner de manutenção</li>
                <li>· Ao desativar, os terminais voltam ao funcionamento normal</li>
                <li>· O status é verificado a cada 30 segundos pelos terminais</li>
              </ul>
            </div>

            {/* Status de Conexão */}
            <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
              <h3 className="font-medium text-gray-800 mb-2">Status do Sistema</h3>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-gray-600">Status Atual:</span>
                  <span className={`ml-2 font-medium ${
                    status.isUnderMaintenance ? 'text-red-600' : 'text-green-600'
                  }`}>
                    {status.isUnderMaintenance ? 'Manutenção' : 'Operacional'}
                  </span>
                </div>
                <div>
                  <span className="text-gray-600">Última Verificação:</span>
                  <span className="ml-2 text-gray-800">
                    {new Date().toLocaleTimeString('pt-BR')}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Mensagens de Feedback */}
          {error && (
            <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-sm text-red-700">{error}</p>
            </div>
          )}

          {success && (
            <div className="mt-4 p-3 bg-green-50 border border-green-200 rounded-lg">
              <p className="text-sm text-green-700">{success}</p>
            </div>
          )}

          {/* Links Úteis */}
          <div className="mt-6 text-center">
            <a
              href="/terminal"
              className="inline-block text-blue-600 hover:text-blue-700 font-medium mr-4"
            >
              Ver Terminal
            </a>
            <a
              href="/diagnostic"
              className="inline-block text-blue-600 hover:text-blue-700 font-medium"
            >
              Diagnóstico PWA
            </a>
          </div>
        </div>
      </div>
    </div>
  );
};

export default MaintenanceControlPage;
