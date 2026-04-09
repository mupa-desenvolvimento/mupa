import { useState, useEffect, useCallback, useRef } from 'react';

interface ConnectionDetectorOptions {
  pingInterval?: number;
  timeoutMs?: number;
  maxRetries?: number;
  retryDelay?: number;
}

interface ConnectionStatus {
  isOnline: boolean;
  isConnecting: boolean;
  error: string | null;
  lastChecked: Date | null;
}

export const useConnectionDetector = (options: ConnectionDetectorOptions = {}) => {
  const {
    pingInterval = 30000, // 30 segundos
    timeoutMs = 5000, // 5 segundos timeout
    maxRetries = 3,
    retryDelay = 2000, // 2 segundos entre tentativas
  } = options;

  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>({
    isOnline: navigator.onLine,
    isConnecting: false,
    error: null,
    lastChecked: null,
  });

  const [showMaintenance, setShowMaintenance] = useState(false);
  const retryCountRef = useRef(0);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const retryTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Função para verificar conexão com a API
  const checkConnection = useCallback(async (): Promise<boolean> => {
    try {
      // Tenta fazer uma requisição simples para verificar conexão
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

      // Tenta primeiro o endpoint de health, depois fallback para o próprio domínio
      let response: Response | null = null;
      
      try {
        response = await fetch('/api/health', {
          method: 'HEAD',
          signal: controller.signal,
          cache: 'no-cache',
        });
      } catch {
        // Fallback para verificar se o próprio site está acessível
        response = await fetch('/', {
          method: 'HEAD',
          signal: controller.signal,
          cache: 'no-cache',
        });
      }

      clearTimeout(timeoutId);
      return response?.ok || false;
    } catch (error) {
      console.warn('Connection check failed:', error);
      return false;
    }
  }, [timeoutMs]);

  // Função para atualizar status da conexão
  const updateConnectionStatus = useCallback((isOnline: boolean, error: string | null = null) => {
    setConnectionStatus(prev => ({
      ...prev,
      isOnline,
      error,
      lastChecked: new Date(),
    }));

    if (!isOnline) {
      retryCountRef.current++;
      if (retryCountRef.current >= maxRetries) {
        setShowMaintenance(true);
      }
    } else {
      retryCountRef.current = 0;
      setShowMaintenance(false);
    }
  }, [maxRetries]);

  // Função de retry manual
  const retryConnection = useCallback(async () => {
    setConnectionStatus(prev => ({ ...prev, isConnecting: true }));
    
    try {
      const isOnline = await checkConnection();
      updateConnectionStatus(isOnline, isOnline ? null : 'Falha na conexão');
    } catch (error) {
      updateConnectionStatus(false, 'Erro ao verificar conexão');
    } finally {
      setConnectionStatus(prev => ({ ...prev, isConnecting: false }));
    }
  }, [checkConnection, updateConnectionStatus]);

  // Monitorar eventos online/offline do navegador
  useEffect(() => {
    const handleOnline = () => {
      updateConnectionStatus(true);
      retryCountRef.current = 0;
      setShowMaintenance(false);
    };

    const handleOffline = () => {
      updateConnectionStatus(false, 'Conexão com a internet perdida');
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [updateConnectionStatus]);

  // Verificação periódica da conexão
  useEffect(() => {
    const performPeriodicCheck = async () => {
      try {
        const isOnline = await checkConnection();
        updateConnectionStatus(isOnline);
      } catch (error) {
        updateConnectionStatus(false, 'Erro na verificação periódica');
      }
    };

    // Iniciar verificação periódica
    intervalRef.current = setInterval(performPeriodicCheck, pingInterval);

    // Fazer primeira verificação imediatamente
    performPeriodicCheck();

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [checkConnection, updateConnectionStatus, pingInterval]);

  // Auto-retry quando falha
  useEffect(() => {
    if (!connectionStatus.isOnline && retryCountRef.current < maxRetries) {
      retryTimeoutRef.current = setTimeout(() => {
        retryConnection();
      }, retryDelay);
    }

    return () => {
      if (retryTimeoutRef.current) {
        clearTimeout(retryTimeoutRef.current);
      }
    };
  }, [connectionStatus.isOnline, retryCountRef.current, maxRetries, retryDelay, retryConnection]);

  // Detectar travamento da aplicação (sem resposta por muito tempo)
  useEffect(() => {
    let lastActivity = Date.now();
    let activityCheckInterval: NodeJS.Timeout | undefined;

    const updateActivity = () => {
      lastActivity = Date.now();
    };

    const checkForFreeze = () => {
      const now = Date.now();
      const timeSinceLastActivity = now - lastActivity;
      
      // Se não houver atividade por 2 minutos, considera travado
      if (timeSinceLastActivity > 120000) {
        updateConnectionStatus(false, 'Aplicação parece estar travada');
        setShowMaintenance(true);
      }
    };

    // Monitorar eventos de usuário
    const events = ['mousedown', 'mousemove', 'keypress', 'scroll', 'touchstart'];
    events.forEach(event => {
      document.addEventListener(event, updateActivity, true);
    });

    // Verificar periodicamente se a aplicação está responsiva
    activityCheckInterval = setInterval(checkForFreeze, 30000);

    return () => {
      events.forEach(event => {
        document.removeEventListener(event, updateActivity, true);
      });
      if (activityCheckInterval) {
        clearInterval(activityCheckInterval);
      }
    };
  }, [updateConnectionStatus]);

  return {
    connectionStatus,
    showMaintenance,
    retryConnection,
    isOnline: connectionStatus.isOnline,
    isConnecting: connectionStatus.isConnecting,
    error: connectionStatus.error,
  };
};
