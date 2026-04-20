import React, { createContext, useContext, useState, useCallback } from 'react';
import { cn } from '../../lib/utils';
import { X, CheckCircle, AlertCircle, Info } from 'lucide-react';

type ToastType = 'success' | 'error' | 'info';
interface Toast { id: number; message: string; type: ToastType; }

interface ToastContextValue {
  toast: (message: string, type?: ToastType) => void;
}
const ToastContext = createContext<ToastContextValue>({ toast: () => {} });
export const useToast = () => useContext(ToastContext);

let nextId = 0;
export function Toaster({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const dismiss = useCallback((id: number) =>
    setToasts((t) => t.filter((x) => x.id !== id)), []);

  const toast = useCallback((message: string, type: ToastType = 'info') => {
    const id = ++nextId;
    setToasts((t) => [...t, { id, message, type }]);
    setTimeout(() => dismiss(id), 4000);
  }, [dismiss]);

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 w-80">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={cn(
              'flex items-start gap-3 rounded-xl px-4 py-3 shadow-modal text-sm font-medium animate-slide-up',
              t.type === 'success' && 'bg-green-600 text-white',
              t.type === 'error'   && 'bg-red-600 text-white',
              t.type === 'info'    && 'bg-slate-800 text-white'
            )}
          >
            {t.type === 'success' && <CheckCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />}
            {t.type === 'error'   && <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />}
            {t.type === 'info'    && <Info className="w-4 h-4 flex-shrink-0 mt-0.5" />}
            <span className="flex-1">{t.message}</span>
            <button onClick={() => dismiss(t.id)} className="opacity-70 hover:opacity-100">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
