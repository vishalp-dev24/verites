/**
 * Custom React Hooks
 * Data fetching hooks with loading and error states
 */

'use client';

import { useState, useEffect, useCallback, useRef } from 'react';

interface UseQueryOptions<T> {
  enabled?: boolean;
  refetchInterval?: number;
  onSuccess?: (data: T) => void;
  onError?: (error: string) => void;
}

interface UseQueryResult<T> {
  data: T | null;
  isLoading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

export function useQuery<T>(
  queryFn: () => Promise<{ data?: T; error?: string }>,
  options: UseQueryOptions<T> = {}
): UseQueryResult<T> {
  const { enabled = true, refetchInterval, onSuccess, onError } = options;
  const [data, setData] = useState<T | null>(null);
  const [isLoading, setIsLoading] = useState(enabled);
  const [error, setError] = useState<string | null>(null);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  const fetch = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    
    try {
      const result = await queryFn();
      
      if (result.error) {
        setError(result.error);
        onError?.(result.error);
      } else if (result.data !== undefined) {
        setData(result.data);
        onSuccess?.(result.data);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      setError(message);
      onError?.(message);
    } finally {
      setIsLoading(false);
    }
  }, [queryFn, onSuccess, onError]);

  useEffect(() => {
    if (enabled) {
      fetch();
    }
  }, [enabled, fetch]);

  useEffect(() => {
    if (refetchInterval && enabled) {
      intervalRef.current = setInterval(fetch, refetchInterval);
      return () => {
        if (intervalRef.current) {
          clearInterval(intervalRef.current);
        }
      };
    }
  }, [refetchInterval, enabled, fetch]);

  return { data, isLoading, error, refetch: fetch };
}

interface UseMutationOptions<T, V> {
  onSuccess?: (data: T, variables: V) => void;
  onError?: (error: string, variables: V) => void;
}

interface UseMutationResult<T, V> {
  mutate: (variables: V) => Promise<void>;
  isLoading: boolean;
  error: string | null;
  data: T | null;
  reset: () => void;
}

export function useMutation<T, V = unknown>(
  mutationFn: (variables: V) => Promise<{ data?: T; error?: string }>,
  options: UseMutationOptions<T, V> = {}
): UseMutationResult<T, V> {
  const { onSuccess, onError } = options;
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<T | null>(null);

  const mutate = useCallback(async (variables: V) => {
    setIsLoading(true);
    setError(null);
    
    try {
      const result = await mutationFn(variables);
      
      if (result.error) {
        setError(result.error);
        onError?.(result.error, variables);
      } else if (result.data !== undefined) {
        setData(result.data);
        onSuccess?.(result.data, variables);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      setError(message);
      onError?.(message, variables);
    } finally {
      setIsLoading(false);
    }
  }, [mutationFn, onSuccess, onError]);

  const reset = useCallback(() => {
    setData(null);
    setError(null);
    setIsLoading(false);
  }, []);

  return { mutate, isLoading, error, data, reset };
}

// Debounced value hook
export function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);

  return debouncedValue;
}

// Local storage hook
export function useLocalStorage<T>(key: string, initialValue: T): [T, (value: T | ((prev: T) => T)) => void] {
  const [storedValue, setStoredValue] = useState<T>(initialValue);
  const isHydrated = useRef(false);

  useEffect(() => {
    if (typeof window !== 'undefined' && !isHydrated.current) {
      try {
        const item = window.localStorage.getItem(key);
        if (item) {
          setStoredValue(JSON.parse(item));
        }
      } catch (error) {
        console.warn(`Error reading localStorage key "${key}":`, error);
      }
      isHydrated.current = true;
    }
  }, [key]);

  const setValue = useCallback((value: T | ((prev: T) => T)) => {
    try {
      const valueToStore = value instanceof Function ? value(storedValue) : value;
      setStoredValue(valueToStore);
      if (typeof window !== 'undefined') {
        window.localStorage.setItem(key, JSON.stringify(valueToStore));
      }
    } catch (error) {
      console.warn(`Error setting localStorage key "${key}":`, error);
    }
  }, [key, storedValue]);

  return [storedValue, setValue];
}
