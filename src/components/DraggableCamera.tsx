import React, { useState, useEffect, useRef } from 'react';
import { Camera, X, Maximize2, Minimize2, GripHorizontal } from 'lucide-react';
import CameraScanner from './ui/CameraScanner';
import { cn } from '../lib/utils';

interface DraggableCameraProps {
  onScan: (barcode: string) => void;
  onClose: () => void;
  paused?: boolean;
}

export default function DraggableCamera({ onScan, onClose, paused }: DraggableCameraProps) {
  const [position, setPosition] = useState({ x: 20, y: 80 });
  const [isDragging, setIsDragging] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const dragRef = useRef<{ startX: number; startY: number; initX: number; initY: number } | null>(null);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging || !dragRef.current) return;
      const dx = e.clientX - dragRef.current.startX;
      const dy = e.clientY - dragRef.current.startY;
      const widgetWidth = isMinimized ? 256 : 320;
      const widgetHeight = 40; // at minimum, header is always visible
      setPosition({
        x: Math.max(0, Math.min(window.innerWidth - widgetWidth, dragRef.current.initX + dx)),
        y: Math.max(0, Math.min(window.innerHeight - widgetHeight, dragRef.current.initY + dy)),
      });
    };

    const handleMouseUp = () => {
      setIsDragging(false);
    };

    if (isDragging) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging]);

  const handleMouseDown = (e: React.MouseEvent) => {
    setIsDragging(true);
    dragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      initX: position.x,
      initY: position.y,
    };
  };

  return (
    <div
      style={{ left: `${position.x}px`, top: `${position.y}px` }}
      className={cn(
        "fixed z-50 flex flex-col bg-white rounded-xl shadow-2xl border border-slate-200 overflow-hidden transition-all duration-200 ease-out",
        isDragging ? "opacity-90 scale-[1.02] shadow-brand-500/20" : "opacity-100",
        isMinimized ? "w-64" : "w-80"
      )}
    >
      {/* Header / Drag Handle */}
      <div
        onMouseDown={handleMouseDown}
        className="flex items-center justify-between px-3 py-2 bg-slate-800 text-white cursor-grab active:cursor-grabbing"
      >
        <div className="flex items-center gap-2">
          <GripHorizontal className="w-4 h-4 text-slate-400" />
          <Camera className="w-4 h-4" />
          <span className="text-xs font-bold uppercase tracking-wider">
            Scanner
          </span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setIsMinimized(!isMinimized)}
            className="p-1 hover:bg-slate-700 rounded transition-colors"
          >
            {isMinimized ? <Maximize2 className="w-3.5 h-3.5" /> : <Minimize2 className="w-3.5 h-3.5" />}
          </button>
          <button
            onClick={onClose}
            className="p-1 hover:bg-red-500 rounded transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Body */}
      {!isMinimized && (
        <div className="p-2 bg-slate-900 flex justify-center items-center">
          <CameraScanner onScan={onScan} paused={paused} />
        </div>
      )}
    </div>
  );
}
