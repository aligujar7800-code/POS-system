import React, { useState, useRef, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { Mic, Loader2 } from 'lucide-react';
import { useSettingsStore } from '../stores/settingsStore';
import { useVoiceCommandParser } from '../hooks/useVoiceCommandParser';
import { useToast } from './ui/Toaster';

export default function FloatingMicrophone() {
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  
  const { voice_simple_mode, voice_full_mode } = useSettingsStore();
  const location = useLocation();
  const { parseCommand } = useVoiceCommandParser();
  const { toast } = useToast();

  const isSalesPage = location.pathname.includes('/sales');

  // Determine visibility based on modes
  const isVisible = voice_full_mode || (voice_simple_mode && isSalesPage);

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      chunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      mediaRecorder.onstop = async () => {
        const blob = new Blob(chunksRef.current, { type: 'audio/wav' });
        // Stop all tracks to release microphone
        stream.getTracks().forEach(track => track.stop());
        
        await processAudio(blob);
      };

      mediaRecorder.start();
      setIsRecording(true);
    } catch (err) {
      console.error("Microphone access denied or error:", err);
      toast('Microphone Error: Could not access mic. Check permissions.', 'error');
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  };

  const handleToggle = () => {
    if (isRecording) {
      stopRecording();
    } else {
      startRecording();
    }
  };

  const processAudio = async (blob: Blob) => {
    setIsProcessing(true);
    try {
      const formData = new FormData();
      formData.append('file', blob, 'command.wav');

      // Send to local Python sidecar
      const response = await fetch('http://127.0.0.1:8000/transcribe', {
        method: 'POST',
        body: formData,
      });

      const data = await response.json();
      
      if (data.success && data.text) {
        toast(`You said: "${data.text}"`, 'info');
        await parseCommand(data.text);
      } else {
        throw new Error(data.error || "Failed to transcribe");
      }
    } catch (error) {
      console.error("Voice processing error:", error);
      toast('Voice Error: Make sure the model is downloaded in Settings.', 'error');
    } finally {
      setIsProcessing(false);
    }
  };

  // Keyboard shortcut (optional, Spacebar when not in input)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Example: Ctrl+Space to toggle recording (optional)
      if (e.ctrlKey && e.code === 'Space' && isVisible) {
        e.preventDefault();
        handleToggle();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isRecording, isVisible]);

  if (!isVisible) return null;

  return (
    <div className="fixed bottom-6 right-6 z-50 flex items-center gap-3">
      {isProcessing && (
        <div className="bg-white px-4 py-2 rounded-full shadow-lg border border-gray-100 flex items-center gap-2 animate-in fade-in slide-in-from-right-5">
          <Loader2 className="w-4 h-4 animate-spin text-brand-600" />
          <span className="text-sm font-medium text-gray-700">Thinking...</span>
        </div>
      )}
      
      {isRecording && !isProcessing && (
        <div className="bg-red-50 px-4 py-2 rounded-full shadow-lg border border-red-100 flex items-center gap-2 animate-in fade-in slide-in-from-right-5">
          <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
          <span className="text-sm font-medium text-red-700">Listening...</span>
        </div>
      )}

      <button
        onClick={handleToggle}
        disabled={isProcessing}
        className={`
          p-4 rounded-full shadow-xl transition-all duration-300
          ${isProcessing ? 'bg-gray-100 text-gray-400 cursor-not-allowed transform scale-95' : 
            isRecording ? 'bg-red-500 text-white hover:bg-red-600 transform scale-110 shadow-red-500/30' : 
            'bg-brand-600 text-white hover:bg-brand-700 hover:scale-105 shadow-brand-600/30'}
        `}
        title="Tap to voice command (Urdu)"
      >
        <Mic className={`w-6 h-6 ${isRecording ? 'animate-pulse' : ''}`} />
      </button>
    </div>
  );
}
