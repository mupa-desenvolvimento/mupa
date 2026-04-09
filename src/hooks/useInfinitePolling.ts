import { useState, useEffect, useCallback, useRef } from 'react';

interface InfinitePollingOptions {
  interval: number;
  retryDelay?: number;
  maxRetries?: number;
  onError?: (error: Error) => void;
  onSuccess?: (data: any) => void;
}

export const useInfinitePolling = <T = any>(
  fetchFunction: () => Promise<T>,
  options: InfinitePollingOptions
) => {
  const {
    interval,
    retryDelay = 5000,
    maxRetries = Infinity,
    onError,
    onSuccess,
  } = options;

  const [data, setData] = useState<T | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [retryCount, setRetryCount] = useState(0);
  const [isPolling, setIsPolling] = useState(true);

  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const retryTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const executePoll = useCallback(async () => {
    if (!isPolling) return;

    try {
      // Cancelar requisição anterior se existir
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }

      abortControllerRef.current = new AbortController();
      setIsLoading(true);
      setError(null);

      const result = await fetchFunction();
      
      setData(result);
      setLastUpdate(new Date());
      setRetryCount(0); // Reset retry count em sucesso
      
      onSuccess?.(result);

    } catch (err) {
      const error = err instanceof Error ? err : new Error('Erro desconhecido');
      setError(error);
      setRetryCount(prev => prev + 1);
      
      onError?.(error);

      // Tentar novamente se não excedeu o máximo
      if (retryCount < maxRetries - 1) {
        retryTimeoutRef.current = setTimeout(() => {
          executePoll();
        }, retryDelay);
      } else {
        console.log(`Número máximo de tentativas (${maxRetries}) atingido, continuando polling`);
        // Reset retry count e continuar tentando
        setRetryCount(0);
        retryTimeoutRef.current = setTimeout(() => {
          executePoll();
        }, retryDelay * 2); // Dobrar o delay após max retries
      }
    } finally {
      setIsLoading(false);
    }
  }, [fetchFunction, isPolling, retryCount, maxRetries, retryDelay, onError, onSuccess]);

  // Iniciar polling
  useEffect(() => {
    if (!isPolling) return;

    // Executar imediatamente
    executePoll();

    // Configurar intervalo contínuo
    intervalRef.current = setInterval(executePoll, interval);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
      if (retryTimeoutRef.current) {
        clearTimeout(retryTimeoutRef.current);
      }
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, [executePoll, interval, isPolling]);

  // Controles do polling
  const startPolling = useCallback(() => {
    setIsPolling(true);
  }, []);

  const stopPolling = useCallback(() => {
    setIsPolling(false);
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
    }
    if (retryTimeoutRef.current) {
      clearTimeout(retryTimeoutRef.current);
    }
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
  }, []);

  const forceUpdate = useCallback(() => {
    setRetryCount(0);
    executePoll();
  }, [executePoll]);

  return {
    data,
    isLoading,
    error,
    lastUpdate,
    retryCount,
    isPolling,
    startPolling,
    stopPolling,
    forceUpdate,
  };
};
