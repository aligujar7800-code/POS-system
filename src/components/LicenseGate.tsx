import React, { useState, useEffect } from 'react';
import { Shield, Key, Copy, Check, ExternalLink, Loader2, Mail } from 'lucide-react';
import { cmd } from '../lib/utils';
import { Toaster, useToast } from './ui/Toaster';

interface LicenseGateProps {
  children: React.ReactNode;
}

export default function LicenseGate({ children }: LicenseGateProps) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [isLicensed, setIsLicensed] = useState(false);
  const [machineId, setMachineId] = useState('');
  
  // Activation State
  const [licenseKey, setLicenseKey] = useState('');
  const [activating, setActivating] = useState(false);

  // Request State
  const [showRequestForm, setShowRequestForm] = useState(false);
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [requesting, setRequesting] = useState(false);

  useEffect(() => {
    checkLicense();
  }, []);

  const checkLicense = async () => {
    try {
      // 1. Try local check first
      const status = await cmd<any>('get_license_status');
      if (status && status.status === 'active') {
        setIsLicensed(true);
        return;
      }

      // 2. Try online auto-activation
      setLoading(true);
      const onlineStatus = await cmd<any>('check_online_activation');
      if (onlineStatus && onlineStatus.status === 'active') {
        setIsLicensed(true);
        toast('Software automatically activated!', 'success');
        return;
      }

      // 3. Fallback to manual activation screen
      const mid = await cmd<string>('get_machine_id');
      setMachineId(mid);
    } catch (e: any) {
      console.error('License check failed:', e);
      // Show the actual error so we know what failed (e.g. table doesn't exist, reg query failed)
      setMachineId(`ERROR: ${e.toString()}`);
    } finally {
      setLoading(false);
    }
  };

  const handleActivate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!licenseKey) return;
    
    setActivating(true);
    try {
      await cmd('activate_license', { key: licenseKey });
      toast('License activated successfully!', 'success');
      setTimeout(() => setIsLicensed(true), 1500);
    } catch (e: any) {
      toast(e.toString(), 'error');
      setActivating(false);
    }
  };

  const handleRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!customerName || !customerPhone) return;

    setRequesting(true);
    try {
      await cmd('request_license', { 
        customerName, 
        customerPhone, 
        machineId 
      });
      toast('License request sent to developer! Please wait for your key.', 'success');
      setShowRequestForm(false);
    } catch (e: any) {
      toast('Failed to send request: ' + e.toString(), 'error');
    } finally {
      setRequesting(false);
    }
  };

  const copyMachineId = () => {
    navigator.clipboard.writeText(machineId);
    toast('Machine ID copied to clipboard', 'success');
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-brand-500 animate-spin" />
      </div>
    );
  }

  if (isLicensed) {
    return <>{children}</>;
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-brand-950 flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-3xl bg-brand-600 shadow-lg shadow-brand-500/20 mb-6">
            <Shield className="w-10 h-10 text-white" />
          </div>
          <h1 className="text-3xl font-bold text-white mb-2">Software Activation</h1>
          <p className="text-slate-400">Please activate your copy to continue using Fashion Point POS.</p>
        </div>

        <div className="bg-slate-800/50 backdrop-blur-xl border border-white/10 rounded-2xl p-8 shadow-2xl">
          
          <div className="mb-6 p-4 bg-black/20 rounded-xl border border-white/5">
            <p className="text-sm text-slate-400 mb-2">Your Machine ID:</p>
            <div className="flex items-center gap-2">
              <code className="flex-1 bg-black/30 px-3 py-2 rounded-lg text-brand-300 font-mono text-sm break-all">
                {machineId}
              </code>
              <button 
                onClick={copyMachineId}
                className="p-2 bg-white/5 hover:bg-white/10 rounded-lg text-slate-300 transition-colors"
                title="Copy to clipboard"
              >
                <Copy className="w-4 h-4" />
              </button>
            </div>
            <p className="text-xs text-slate-500 mt-2">
              Share this ID with the developer to receive your license key.
            </p>
          </div>

          {showRequestForm ? (
            <form onSubmit={handleRequest} className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-300">
              <h3 className="text-white font-medium mb-4 flex items-center gap-2">
                <Mail className="w-4 h-4 text-brand-400" /> Request License Key
              </h3>
              
              <div>
                <label className="block text-sm text-slate-300 mb-1">Your Name / Shop Name</label>
                <input
                  type="text"
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2.5 text-white placeholder:text-slate-500 focus:border-brand-500 focus:ring-1 focus:ring-brand-500 outline-none transition-all"
                  placeholder="Fashion Point"
                  required
                />
              </div>
              
              <div>
                <label className="block text-sm text-slate-300 mb-1">Phone Number</label>
                <input
                  type="text"
                  value={customerPhone}
                  onChange={(e) => setCustomerPhone(e.target.value)}
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2.5 text-white placeholder:text-slate-500 focus:border-brand-500 focus:ring-1 focus:ring-brand-500 outline-none transition-all"
                  placeholder="0300-1234567"
                  required
                />
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowRequestForm(false)}
                  className="flex-1 py-2.5 rounded-lg font-medium text-slate-300 bg-white/5 hover:bg-white/10 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={requesting}
                  className="flex-1 py-2.5 rounded-lg font-medium text-white bg-brand-600 hover:bg-brand-500 transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {requesting ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Send Request'}
                </button>
              </div>
            </form>
          ) : (
            <form onSubmit={handleActivate} className="space-y-4 animate-in fade-in zoom-in-95 duration-300">
              <div>
                <label className="block text-sm text-slate-300 mb-1">License Key</label>
                <div className="relative">
                  <Key className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                  <input
                    type="text"
                    value={licenseKey}
                    onChange={(e) => setLicenseKey(e.target.value.toUpperCase())}
                    className="w-full bg-white/5 border border-white/10 rounded-lg pl-10 pr-4 py-3 text-white placeholder:text-slate-600 focus:border-brand-500 focus:ring-1 focus:ring-brand-500 outline-none transition-all font-mono"
                    placeholder="CPOS-XXXX-XXXX-XXXX-XXXX"
                    required
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={activating || !licenseKey}
                className="w-full py-3 rounded-lg font-medium text-white bg-brand-600 hover:bg-brand-500 transition-colors flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-brand-500/25"
              >
                {activating ? (
                  <><Loader2 className="w-5 h-5 animate-spin" /> Activating...</>
                ) : (
                  <><Check className="w-5 h-5" /> Activate Software</>
                )}
              </button>
              
              <div className="pt-4 text-center">
                <button 
                  type="button"
                  onClick={() => setShowRequestForm(true)}
                  className="text-sm text-brand-400 hover:text-brand-300 transition-colors flex items-center gap-1 justify-center w-full"
                >
                  Don't have a key? Request one <ExternalLink className="w-3 h-3" />
                </button>
              </div>
            </form>
          )}

        </div>
        
        <p className="text-center text-slate-500 text-xs mt-8">
          Fashion Point POS System • Licensed Software
        </p>
      </div>
    </div>
  );
}
