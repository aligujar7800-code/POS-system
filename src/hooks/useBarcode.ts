import { useEffect, useRef } from 'react';

const BUFFER_TIMEOUT_MS = 100;
const MIN_BARCODE_LENGTH = 6;

export function useBarcode(onScan: (barcode: string) => void) {
  const buffer = useRef('');
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      // Only capture printable characters when not in an input/textarea
      const tag = (e.target as HTMLElement).tagName;
      const isInput = tag === 'INPUT' || tag === 'TEXTAREA';

      if (e.key === 'Enter') {
        if (buffer.current.length >= MIN_BARCODE_LENGTH) {
          const code = buffer.current;
          buffer.current = '';
          if (timer.current) clearTimeout(timer.current);
          onScan(code);
          // Dispatch custom event for other listeners
          window.dispatchEvent(new CustomEvent('barcode-scanned', { detail: code }));
        } else {
          buffer.current = '';
        }
        return;
      }

      // Only buffer if key arrives quickly (scanner behaviour)
      if (e.key.length === 1) {
        if (!isInput || buffer.current.length > 0) {
          buffer.current += e.key;
          if (timer.current) clearTimeout(timer.current);
          timer.current = setTimeout(() => {
            buffer.current = '';
          }, BUFFER_TIMEOUT_MS);
        }
      }
    }

    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [onScan]);
}

/** Hook to listen to global barcode-scanned events */
export function useGlobalBarcode(onScan: (barcode: string) => void) {
  useEffect(() => {
    function handler(e: Event) {
      onScan((e as CustomEvent<string>).detail);
    }
    window.addEventListener('barcode-scanned', handler);
    return () => window.removeEventListener('barcode-scanned', handler);
  }, [onScan]);
}
