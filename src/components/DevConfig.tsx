import { useState, useEffect } from 'react';
import { X, Save, ExternalLink } from 'lucide-react';

interface DevConfigProps {
  onClose: () => void;
}

const DevConfig: React.FC<DevConfigProps> = ({ onClose }) => {
  const [terminalUrl, setTerminalUrl] = useState('');
  const [savedUrl, setSavedUrl] = useState('');

  useEffect(() => {
    // Carregar URL salva do localStorage
    const saved = localStorage.getItem('mupa_dev_terminal_url');
    if (saved) {
      setSavedUrl(saved);
      setTerminalUrl(saved);
    } else {
      setTerminalUrl(window.location.origin + '/terminal');
    }
  }, []);

  const handleSave = () => {
    if (terminalUrl.trim()) {
      localStorage.setItem('mupa_dev_terminal_url', terminalUrl.trim());
      setSavedUrl(terminalUrl.trim());
      alert('URL do terminal salva com sucesso!');
    }
  };

  const handleOpenTerminal = () => {
    const url = savedUrl || terminalUrl;
    if (url) {
      window.open(url, '_blank');
    }
  };

  const handleReset = () => {
    localStorage.removeItem('mupa_dev_terminal_url');
    const defaultUrl = window.location.origin + '/terminal';
    setTerminalUrl(defaultUrl);
    setSavedUrl('');
    alert('URL resetada para o padrão!');
  };

  // Só mostrar em modo desenvolvimento
  if (import.meta.env.PROD) {
    return null;
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl p-6 w-full max-w-md mx-4">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold text-gray-800">Configuração Dev - Terminal</h2>
          <button
            onClick={onClose}
            className="p-1 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              URL da Página Terminal
            </label>
            <input
              type="url"
              value={terminalUrl}
              onChange={(e) => setTerminalUrl(e.target.value)}
              placeholder="https://exemplo.com/terminal"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
            <p className="text-xs text-gray-500 mt-1">
              URL que será usada como página inicial do PWA
            </p>
          </div>

          {savedUrl && (
            <div className="bg-green-50 border border-green-200 rounded-lg p-3">
              <p className="text-sm text-green-800">
                <strong>URL salva:</strong> {savedUrl}
              </p>
            </div>
          )}

          <div className="flex gap-2">
            <button
              onClick={handleSave}
              className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-4 rounded-lg transition-colors flex items-center justify-center gap-2"
            >
              <Save className="w-4 h-4" />
              Salvar
            </button>
            <button
              onClick={handleReset}
              className="bg-gray-200 hover:bg-gray-300 text-gray-700 font-medium py-2 px-4 rounded-lg transition-colors"
            >
              Resetar
            </button>
          </div>

          {savedUrl && (
            <button
              onClick={handleOpenTerminal}
              className="w-full bg-green-600 hover:bg-green-700 text-white font-medium py-2 px-4 rounded-lg transition-colors flex items-center justify-center gap-2"
            >
              <ExternalLink className="w-4 h-4" />
              Abrir Terminal
            </button>
          )}
        </div>

        <div className="mt-4 pt-4 border-t border-gray-200">
          <p className="text-xs text-gray-500 text-center">
            Esta configuração está visível apenas em modo desenvolvimento
          </p>
        </div>
      </div>
    </div>
  );
};

export default DevConfig;
