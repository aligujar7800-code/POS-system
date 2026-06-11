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
  const [scanSuccess, setScanSuccess] = useState(false);

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
            {
              deviceId: { exact: cameraId }
            },
            {
              fps: 20,
              qrbox: { width: 320, height: 120 },
              aspectRatio: 1.777,
              videoConstraints: {
                deviceId: { exact: cameraId },
                width: { ideal: 1920 },
                height: { ideal: 1080 },
                facingMode: 'environment',
                // @ts-ignore - focusMode is valid but not in TS types
                advanced: [
                  { focusMode: 'continuous' } as any,
                  { zoom: 1.5 } as any,
                ],
              },
            },
            (decodedText, result) => {
              console.log('[CameraScanner] DETECTED:', decodedText, result?.result?.format?.formatName);
              if (!pausedRef.current) {
                // Flash green feedback
                setScanSuccess(true);
                setTimeout(() => setScanSuccess(false), 600);
                onScanRef.current(decodedText);
              }
            },
            () => {} // ignore per-frame scan misses
          );

          // After start, try to enable autofocus and torch via track settings
          try {
            const videoElem = document.querySelector(`#${containerId} video`) as HTMLVideoElement;
            if (videoElem && videoElem.srcObject) {
              const track = (videoElem.srcObject as MediaStream).getVideoTracks()[0];
              const capabilities = track.getCapabilities?.() as any;
              const settings: any = {};
              
              // Enable continuous autofocus if supported
              if (capabilities?.focusMode?.includes('continuous')) {
                settings.focusMode = 'continuous';
              }
              // Apply zoom if supported (1.5x to get closer to barcode)
              if (capabilities?.zoom) {
                const maxZoom = Math.min(capabilities.zoom.max, 2.5);
                settings.zoom = Math.max(capabilities.zoom.min, Math.min(1.5, maxZoom));
              }
              
              if (Object.keys(settings).length > 0) {
                await track.applyConstraints({ advanced: [settings] } as any);
                console.log('[CameraScanner] Applied advanced constraints:', settings);
              }
            }
          } catch (advErr) {
            console.warn('[CameraScanner] Could not apply advanced camera constraints:', advErr);
          }

          console.log('[CameraScanner] Started successfully with HD + autofocus');
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
      
      {/* Scan guide overlay - red line that turns green on scan */}
      {!error && !paused && (
        <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
          <div className="relative" style={{ width: '320px', height: '120px' }}>
            {/* Corner brackets */}
            <div className="absolute top-0 left-0 w-6 h-6 border-t-3 border-l-3 rounded-tl-md" style={{ borderColor: scanSuccess ? '#22c55e' : '#ef4444', borderWidth: '3px', borderRight: 'none', borderBottom: 'none' }} />
            <div className="absolute top-0 right-0 w-6 h-6 border-t-3 border-r-3 rounded-tr-md" style={{ borderColor: scanSuccess ? '#22c55e' : '#ef4444', borderWidth: '3px', borderLeft: 'none', borderBottom: 'none' }} />
            <div className="absolute bottom-0 left-0 w-6 h-6 border-b-3 border-l-3 rounded-bl-md" style={{ borderColor: scanSuccess ? '#22c55e' : '#ef4444', borderWidth: '3px', borderRight: 'none', borderTop: 'none' }} />
            <div className="absolute bottom-0 right-0 w-6 h-6 border-b-3 border-r-3 rounded-br-md" style={{ borderColor: scanSuccess ? '#22c55e' : '#ef4444', borderWidth: '3px', borderLeft: 'none', borderTop: 'none' }} />
            {/* Center scan line */}
            <div 
              className="absolute left-2 right-2 transition-colors duration-300" 
              style={{ 
                top: '50%', 
                height: '2px', 
                background: scanSuccess 
                  ? 'linear-gradient(90deg, transparent, #22c55e, #22c55e, transparent)' 
                  : 'linear-gradient(90deg, transparent, #ef4444, #ef4444, transparent)',
                boxShadow: scanSuccess ? '0 0 8px #22c55e' : '0 0 8px #ef4444',
              }} 
            />
          </div>
        </div>
      )}

      {/* Instruction text */}
      {!error && !paused && (
        <div className="absolute bottom-3 left-0 right-0 text-center">
          <span className="text-[11px] font-bold text-white/80 bg-black/50 px-3 py-1 rounded-full">
            {scanSuccess ? '✅ Barcode Detected!' : 'Place barcode inside the red box'}
          </span>
        </div>
      )}

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
