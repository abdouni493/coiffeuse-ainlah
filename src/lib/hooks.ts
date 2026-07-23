// ============================================================================
// PERFORMANCE OPTIMIZATION HOOKS & UTILITIES
// ============================================================================

import React, { useCallback, useRef, useEffect, useState } from 'react';

/**
 * Hook for debounced values (useful for search, filters)
 * Delays updating value until user stops typing
 */
export function useDebounce<T>(value: T, delay: number = 500): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => clearTimeout(handler);
  }, [value, delay]);

  return debouncedValue;
}

/**
 * Hook for throttled functions (useful for scroll, resize events)
 * Limits function execution frequency
 */
export function useThrottle<T extends (...args: any[]) => any>(
  callback: T,
  delay: number = 300
): T {
  const lastRunRef = useRef(Date.now());

  return useCallback((...args: any[]) => {
    const now = Date.now();
    if (now - lastRunRef.current >= delay) {
      lastRunRef.current = now;
      callback(...args);
    }
  }, [callback, delay]) as T;
}

/**
 * Hook for intersection observer (lazy loading)
 * Triggers callback when element enters viewport
 */
export function useIntersectionObserver(
  ref: React.RefObject<HTMLElement>,
  options: IntersectionObserverInit = {}
): boolean {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    if (!ref.current) return;

    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        setIsVisible(true);
        observer.unobserve(entry.target);
      }
    }, {
      threshold: 0.1,
      ...options,
    });

    observer.observe(ref.current);

    return () => observer.disconnect();
  }, [ref, options]);

  return isVisible;
}

/**
 * Hook for local storage with automatic sync
 * Persists state to localStorage
 */
export function useLocalStorage<T>(key: string, initialValue: T): [T, (value: T) => void] {
  const [storedValue, setStoredValue] = useState<T>(() => {
    try {
      const item = window.localStorage.getItem(key);
      return item ? JSON.parse(item) : initialValue;
    } catch {
      return initialValue;
    }
  });

  const setValue = useCallback((value: T) => {
    try {
      setStoredValue(value);
      window.localStorage.setItem(key, JSON.stringify(value));
    } catch (error) {
      console.error(`Failed to save to localStorage:`, error);
    }
  }, [key]);

  return [storedValue, setValue];
}

/**
 * Hook for pagination
 * Manages pagination state
 */
export function usePagination<T>(
  items: T[],
  itemsPerPage: number = 50
): {
  currentItems: T[];
  currentPage: number;
  totalPages: number;
  goToPage: (page: number) => void;
  hasNextPage: boolean;
  hasPrevPage: boolean;
} {
  const [currentPage, setCurrentPage] = useState(1);

  const totalPages = Math.ceil(items.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const currentItems: T[] = items.slice(startIndex, endIndex);

  const goToPage = useCallback((page: number) => {
    const pageNumber = Math.max(1, Math.min(page, totalPages));
    setCurrentPage(pageNumber);
  }, [totalPages]);

  return {
    currentItems,
    currentPage,
    totalPages,
    goToPage,
    hasNextPage: currentPage < totalPages,
    hasPrevPage: currentPage > 1,
  };
}

/**
 * Hook for async data fetching
 * Manages loading, error, and data states
 */
export function useAsync<T, E = string>(
  asyncFunction: () => Promise<T>,
  immediate: boolean = true
) {
  const [status, setStatus] = useState<'idle' | 'pending' | 'success' | 'error'>('idle');
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<E | null>(null);

  const execute = useCallback(async () => {
    setStatus('pending');
    setData(null);
    setError(null);

    try {
      const response = await asyncFunction();
      setData(response);
      setStatus('success');
      return response;
    } catch (error) {
      setError(error as E);
      setStatus('error');
      throw error;
    }
  }, [asyncFunction]);

  useEffect(() => {
    if (immediate) {
      execute();
    }
  }, [execute, immediate]);

  return { status, data, error, execute };
}

/**
 * Hook for request deduplication
 * Prevents duplicate requests for same data
 */
export function useRequestCache<T>(
  key: string,
  fetcher: () => Promise<T>,
  ttl: number = 5000
) {
  const cacheRef = useRef(new Map<string, { data: T; timestamp: number }>());
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    const cached = cacheRef.current.get(key);
    const now = Date.now();

    if (cached && now - cached.timestamp < ttl) {
      setData(cached.data);
      return;
    }

    setLoading(true);
    fetcher()
      .then(result => {
        cacheRef.current.set(key, { data: result, timestamp: Date.now() });
        setData(result);
      })
      .catch(err => setError(err))
      .finally(() => setLoading(false));
  }, [key, fetcher, ttl]);

  return { data, loading, error };
}

export type { };
