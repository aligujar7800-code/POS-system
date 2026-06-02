import React, { useEffect, useRef, useState, useId } from 'react';
import { Html5Qrcode, Html5QrcodeScannerState, Html5QrcodeSupportedFormats } from 'html5-qrcode';

interface CameraScannerProps {
  onScan: (barcode: string) => void;
  paused?: boolean;
}

// All 1D and 2D barcode formats
const SUPPORTED_FORMATS = [
  Html5QrcodeSupportedFormats.EAN_13,
  Html5QrcodeSupportedFormats.EAN_8,
  Html5QrcodeSupportedFormats.UPC_A,
  Html5QrcodeSupportedFormats.UPC_E,
  Html5QrcodeSupportedFormats.CODE_128,
  Html5QrcodeSupportedFormats.CODE_39,
  Html5QrcodeSupportedFormats.CODE_93,
  Html5QrcodeSupportedFormats.ITF,
  Html5QrcodeSupportedFormats.QR_CODE,
  Html5QrcodeSupportedFormats.DATA_MATRIX,
];

export default function CameraScanner({ onScan, paused = false }: CameraScannerProps) {
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const uniqueSuffix = useId().replace(/:/g, '-');
  const containerId = `html5-qrcode-reader-${uniqueSuffix}`;
  const [error, setError] = useState<string | null>(null);
  const mountedRef = useRef(true);

  const onScanRef = useRef(onScan);
  const pausedRef = useRef(paused);
  useEffect(() => { onScanRef.current = onScan; }, [onScan]);
  useEffect(() => { pausedRef.current = paused; }, [paused]);

  useEffect(() => {
    mountedRef.current = true;

    // Small delay to ensure the DOM element is ready
    const timer = setTimeout(async () => {
      if (!mountedRef.current) return;

      const html5Qrcode = new Html5Qrcode(containerId, {
        formatsToSupport: SUPPORTED_FORMATS,
        verbose: false,
      });
      scannerRef.current = html5Qrcode;

      try {
        const cameras = await Html5Qrcode.getCameras();
        if (!mountedRef.current) return;
        
        if (cameras && cameras.length > 0) {
          const cameraId = cameras[cameras.length - 1].id;
          console.log('[CameraScanner] Using camera:', cameras[cameras.length - 1].label, cameraId);
          console.log('[CameraScanner] Available cameras:', cameras.map(c => c.label));

          await html5Qrcode.start(
            { deviceId: { exact: cameraId } },
            {
              fps: 10,
              // No qrbox = scan the entire camera frame
              // This is the most reliable for 1D barcodes
            },
            (decodedText, result) => {
              console.log('[CameraScanner] DETECTED:', decodedText, result?.result?.format?.formatName);
              if (!pausedRef.current) {
                onScanRef.current(decodedText);
              }
            },
            () => {} // ignore per-frame scan misses
          );
          console.log('[CameraScanner] Started successfully');
        } else {
          setError('No camera found on this device.');
        }
      } catch (err: any) {
        console.error('[CameraScanner] Error:', err);
        if (mountedRef.current) {
          setError(err.message || 'Failed to start camera.');
        }
      }
    }, 300);

    return () => {
      mountedRef.current = false;
      clearTimeout(timer);
      if (scannerRef.current) {
        try {
          if (scannerRef.current.getState() !== Html5QrcodeScannerState.NOT_STARTED) {
            scannerRef.current.stop().catch(() => {});
          }
        } catch {
          // ignore cleanup errors
        }
      }
    };
  }, [containerId]);

  useEffect(() => {
    if (scannerRef.current) {
      try {
        if (scannerRef.current.getState() === Html5QrcodeScannerState.SCANNING) {
          if (paused) {
            scannerRef.current.pause();
          } else {
            scannerRef.current.resume();
          }
        }
      } catch {
        // ignore state transition errors
      }
    }
  }, [paused]);

  return (
    <div className="relative w-full max-w-md mx-auto overflow-hidden bg-black rounded-2xl shadow-xl">
      <div id={containerId} className="w-full h-full min-h-[320px]"></div>
      {error && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/80 text-white p-4 text-center text-sm font-medium">
          {error}
        </div>
      )}
      {paused && !error && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/60 text-white font-bold tracking-widest uppercase">
          Paused
        </div>
      )}
    </div>
  );
}
