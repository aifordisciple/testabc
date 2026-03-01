'use client';

import { useState, useEffect, useCallback } from 'react';

type StorageValue<T> = T | null;

export function useStorage<T>(key: string, initialValue?: T): [StorageValue<T>, (value: T | ((prev: T) => T)) => void, () => void] {
  const [storedValue, setStoredValue] = useState<StorageValue<T>>(null);
  const [isInitialized, setIsInitialized] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    
    try {
      const item = window.localStorage.getItem(key);
      if (item) {
        setStoredValue(JSON.parse(item) as T);
      } else if (initialValue !== undefined) {
        setStoredValue(initialValue);
        window.localStorage.setItem(key, JSON.stringify(initialValue));
      }
    } catch (error) {
      console.warn(`Error reading localStorage key "${key}":`, error);
    }
    setIsInitialized(true);
  }, [key, initialValue]);

  const setValue = useCallback((value: T | ((prev: T) => T)) => {
    try {
      const valueToStore = value instanceof Function ? value(storedValue as T) : value;
      setStoredValue(valueToStore);
      if (typeof window !== 'undefined') {
        window.localStorage.setItem(key, JSON.stringify(valueToStore));
      }
    } catch (error) {
      console.warn(`Error setting localStorage key "${key}":`, error);
    }
  }, [key, storedValue]);

  const removeValue = useCallback(() => {
    try {
      setStoredValue(null);
      if (typeof window !== 'undefined') {
        window.localStorage.removeItem(key);
      }
    } catch (error) {
      console.warn(`Error removing localStorage key "${key}":`, error);
    }
  }, [key]);

  return [isInitialized ? storedValue : initialValue ?? null, setValue, removeValue];
}

export function getStorageItem<T>(key: string, defaultValue?: T): T | null {
  if (typeof window === 'undefined') return defaultValue ?? null;
  
  try {
    const item = window.localStorage.getItem(key);
    return item ? JSON.parse(item) as T : (defaultValue ?? null);
  } catch {
    return defaultValue ?? null;
  }
}

export function setStorageItem<T>(key: string, value: T): void {
  if (typeof window === 'undefined') return;
  
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch (error) {
    console.warn(`Error setting localStorage key "${key}":`, error);
  }
}

export function removeStorageItem(key: string): void {
  if (typeof window === 'undefined') return;
  
  try {
    window.localStorage.removeItem(key);
  } catch (error) {
    console.warn(`Error removing localStorage key "${key}":`, error);
  }
}
