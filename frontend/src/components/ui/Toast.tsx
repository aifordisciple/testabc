'use client';

import { toast as sonnerToast, type ExternalToast } from 'sonner';

type ToastOptions = ExternalToast;

const toast = {
  success: (message: string, options?: ToastOptions) => {
    return sonnerToast.success(message, options);
  },
  
  error: (message: string, options?: ToastOptions) => {
    return sonnerToast.error(message, options);
  },
  
  loading: (message: string, options?: ToastOptions) => {
    return sonnerToast.loading(message, options);
  },
  
  info: (message: string, options?: ToastOptions) => {
    return sonnerToast.info(message, options);
  },
  
  warning: (message: string, options?: ToastOptions) => {
    return sonnerToast.warning(message, options);
  },
  
  promise: <T,>(
    promise: Promise<T>,
    msgs: {
      loading: string;
      success: string | ((data: T) => string);
      error: string | ((error: unknown) => string);
    },
    options?: ToastOptions
  ) => {
    return sonnerToast.promise(promise, { ...msgs, ...options });
  },
  
  dismiss: (toastId?: string | number) => {
    sonnerToast.dismiss(toastId);
  },
  
  custom: (message: string, options?: ToastOptions) => {
    return sonnerToast(message, options);
  },
};

export { toast, type ToastOptions };
export { Toaster } from 'sonner';
