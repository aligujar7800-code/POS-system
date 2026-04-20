import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '../../stores/authStore';
import { cmd } from '../../lib/utils';
import { useToast } from './Toaster';
import { ShieldAlert, X } from 'lucide-react';

interface AdminConfirmModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title?: string;
  message?: string;
  actionLabel?: string;
  isDestructive?: boolean;
}

export default function AdminConfirmModal({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  actionLabel = 'Confirm',
  isDestructive = true
}: AdminConfirmModalProps) {
  const { t } = useTranslation();
  const { user } = useAuthStore();
  const { toast } = useToast();
  
  const [password, setPassword] = useState('');
  const [isVerifying, setIsVerifying] = useState(false);

  if (!isOpen) return null;

  const handleConfirm = async () => {
    if (!password) {
      toast('Please enter your password', 'error');
      return;
    }

    setIsVerifying(true);
    try {
      const isValid = await cmd<boolean>('verify_admin_password', { 
        username: user?.username || 'admin', 
        password 
      });

      if (isValid) {
        onConfirm();
        setPassword('');
        onClose();
      } else {
        toast('Invalid admin password', 'error');
      }
    } catch (e: any) {
      toast(e.toString(), 'error');
    } finally {
      setIsVerifying(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={onClose} />
      
      <div className="relative w-full max-w-md bg-white rounded-2xl shadow-2xl overflow-hidden border border-slate-200">
        <div className="flex items-center justify-between p-4 border-b border-slate-100 bg-slate-50/50">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-amber-100 flex items-center justify-center">
              <ShieldAlert className="w-5 h-5 text-amber-600" />
            </div>
            <h3 className="font-bold text-slate-800">{title || 'Admin Authentication Required'}</h3>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 transition-colors p-1">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6">
          <p className="text-sm text-slate-600 mb-6 leading-relaxed">
            {message || 'This action is protected. Please enter your administrator password to proceed with this sensitive operation.'}
          </p>

          <div className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
                Administrator Password
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleConfirm()}
                placeholder="••••••••"
                className="w-full h-12 bg-slate-50 border border-slate-200 rounded-xl px-4 text-slate-800 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-all text-center text-lg tracking-widest"
                autoFocus
              />
            </div>

            <div className="flex gap-3 pt-2">
              <button
                onClick={onClose}
                className="flex-1 h-12 rounded-xl text-slate-600 font-bold hover:bg-slate-100 transition-all border border-slate-200"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirm}
                disabled={isVerifying}
                className={`flex-1 h-12 rounded-xl text-white font-bold transition-all flex items-center justify-center gap-2 ${
                  isDestructive 
                    ? 'bg-red-600 hover:bg-red-700 shadow-lg shadow-red-200' 
                    : 'bg-brand-600 hover:bg-brand-700 shadow-lg shadow-brand-200'
                }`}
              >
                {isVerifying ? (
                  <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  actionLabel
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
