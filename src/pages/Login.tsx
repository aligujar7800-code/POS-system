import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '../stores/authStore';
import { cmd } from '../lib/utils';
import { Store, Lock, User } from 'lucide-react';

interface UserResponse {
  id: number;
  username: string;
  role: 'admin' | 'cashier';
  is_active: boolean;
}

export default function LoginPage() {
  const { t } = useTranslation();
  const { login } = useAuthStore();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const user = await cmd<UserResponse>('authenticate_user', { username, password });
      login(user);
    } catch (err: any) {
      setError(t('auth.invalidCreds'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-brand-950 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-brand-600 shadow-lg mb-4">
            <Store className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-white">Fashion Point</h1>
          <p className="text-slate-400 text-sm mt-1">POS System — {t('auth.login')}</p>
        </div>

        {/* Card */}
        <div className="bg-white/5 backdrop-blur border border-white/10 rounded-2xl p-8 shadow-modal">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="label text-slate-300">{t('auth.username')}</label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  id="username"
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="input pl-9 bg-white/10 border-white/20 text-white placeholder:text-slate-500 focus:border-brand-400"
                  placeholder="admin"
                  required
                  autoFocus
                />
              </div>
            </div>

            <div>
              <label className="label text-slate-300">{t('auth.password')}</label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="input pl-9 bg-white/10 border-white/20 text-white placeholder:text-slate-500 focus:border-brand-400"
                  placeholder="••••••••"
                  required
                />
              </div>
            </div>

            {error && (
              <div className="rounded-lg bg-red-500/10 border border-red-500/30 px-3 py-2 text-red-400 text-sm">
                {error}
              </div>
            )}

            <button
              type="submit"
              id="login-btn"
              disabled={loading}
              className="btn-primary w-full mt-2"
            >
              {loading ? (
                <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : null}
              {t('auth.loginBtn')}
            </button>
          </form>

          <p className="text-center text-slate-500 text-xs mt-6">
            Default: admin / admin123
          </p>
        </div>
      </div>
    </div>
  );
}
