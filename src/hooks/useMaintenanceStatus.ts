import { useState, useEffect, useCallback, useRef } from 'react';

interface MaintenanceStatus {
  isUnderMaintenance: boolean;
  message?: string;
  lastUpdated: Date;
}

interface MaintenanceOptions {
  checkInterval?: number;
  retryDelay?: number;
  maxRetries?: number;
}

export const useMaintenanceStatus = (options: MaintenanceOptions = {}) => {
  const {
    checkInterval = 30000, // 30 segundos
    retryDelay = 5000, // 5 segundos
    maxRetries = Infinity, // retry infinito
  } = options;

  const [maintenanceStatus, setMaintenanceStatus] = useState<MaintenanceStatus>({
    isUnderMaintenance: false,
    lastUpdated: new Date(),
  });

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const retryCountRef = useRef(0);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const retryTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Função para verificar status de manutenção
  const checkMaintenanceStatus = useCallback(async (): Promise<boolean> => {
    try {
      setIsLoading(true);
      setError(null);

      // Tentar buscar status da API
      const response = await fetch('/api/maintenance-status', {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-cache',
        },
        cache: 'no-cache',
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data: MaintenanceStatus = await response.json();
      
      setMaintenanceStatus({
        isUnderMaintenance: data.isUnderMaintenance || false,
        message: data.message,
        lastUpdated: new Date(),
      });

      // Reset retry count em caso de sucesso
      retryCountRef.current = 0;
      return data.isUnderMaintenance || false;

    } catch (err) {
      console.warn('Erro ao verificar status de manutenção:', err);
      setError(err instanceof Error ? err.message : 'Erro desconhecido');
      
      // Em caso de erro, assumir que NÃO está em manutenção
      // (dispositivo deve continuar funcionando)
      setMaintenanceStatus(prev => ({
        ...prev,
        isUnderMaintenance: false,
        lastUpdated: new Date(),
      }));

      return false;
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Função de retry com tentativas infinitas
  const retryCheck = useCallback(() => {
    if (retryCountRef.current < maxRetries) {
      retryCountRef.current++;
      console.log(`Tentativa ${retryCountRef.current} de verificar status de manutenção`);
      
      retryTimeoutRef.current = setTimeout(() => {
        checkMaintenanceStatus();
      }, retryDelay);
    } else {
      console.log('Número máximo de tentativas atingido, continuando operação normal');
      // Continuar operação normal mesmo sem status
      setMaintenanceStatus(prev => ({
        ...prev,
        isUnderMaintenance: false,
        lastUpdated: new Date(),
      }));
    }
  }, [checkMaintenanceStatus, retryDelay, maxRetries]);

  // Verificação inicial e periódica
  useEffect(() => {
    const performCheck = async () => {
      try {
        await checkMaintenanceStatus();
      } catch (error) {
        // Em caso de falha, tentar novamente após delay
        retryCheck();
      }
    };

    // Verificação imediata
    performCheck();

    // Verificação periódica (nunca para de verificar)
    intervalRef.current = setInterval(performCheck, checkInterval);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
      if (retryTimeoutRef.current) {
        clearTimeout(retryTimeoutRef.current);
      }
    };
  }, [checkMaintenanceStatus, checkInterval, retryCheck]);

  // Forçar verificação manual
  const forceCheck = useCallback(async () => {
    retryCountRef.current = 0; // Reset retry count
    return await checkMaintenanceStatus();
  }, [checkMaintenanceStatus]);

  // Limpar erros
  const clearError = useCallback(() => {
    setError(null);
  }, []);

  return {
    isUnderMaintenance: maintenanceStatus.isUnderMaintenance,
    maintenanceMessage: maintenanceStatus.message,
    lastUpdated: maintenanceStatus.lastUpdated,
    isLoading,
    error,
    forceCheck,
    clearError,
    retryCount: retryCountRef.current,
  };
};
