import React, { useState, useEffect, useRef } from 'react';
import { cmd, formatCurrency } from '../../lib/utils';
import { useToast } from './Toaster';
import {
  X, Phone, Loader2, CheckCircle2, XCircle, QrCode,
  RefreshCw, Wifi, WifiOff, CreditCard, Store
} from 'lucide-react';

import jazzcashLogo from '../../assets/jazzcash.png';
import easypaisaLogo from '../../assets/easypaisa.png';
import hblLogo from '../../assets/hbl.png';
import stripeLogo from '../../assets/stripe.png';

// ─── Types ───────────────────────────────────────────────────────────────────

type Gateway = 'jazzcash' | 'easypaisa' | 'hbl_pay' | 'stripe';
type FlowStatus = 'input' | 'processing' | 'pending' | 'success' | 'failed' | 'offline';

interface PaymentFlowProps {
  gateway: Gateway;
  amount: number;
  invoiceNumber: string;
  currencySymbol: string;
  onSuccess: (txnId: number, gatewayRef: string | null) => void;
  onCancel: () => void;
  onOfflineQueue: () => void;
}

const GATEWAY_INFO: Record<Gateway, { name: string; color: string; bgClass: string; icon: React.ReactNode; needsPhone: boolean }> = {
  jazzcash: {
    name: 'JazzCash',
    color: '#e2001a',
    bgClass: 'from-red-600 to-red-700',
    icon: <img src={jazzcashLogo} className="w-full h-full object-contain p-2" />,
    needsPhone: true,
  },
  easypaisa: {
    name: 'EasyPaisa',
    color: '#00a651',
    bgClass: 'from-green-600 to-green-700',
    icon: <img src={easypaisaLogo} className="w-full h-full object-contain p-2" />,
    needsPhone: true,
  },
  hbl_pay: {
    name: 'HBL Pay',
    color: '#003366',
    bgClass: 'from-blue-800 to-blue-900',
    icon: <img src={hblLogo} className="w-full h-full object-contain p-2" />,
    needsPhone: false,
  },
  stripe: {
    name: 'Stripe',
    color: '#635bff',
    bgClass: 'from-indigo-600 to-purple-700',
    icon: <img src={stripeLogo} className="w-full h-full object-contain p-2" />,
    needsPhone: false,
  },
};

export default function PaymentFlowModal({
  gateway, amount, invoiceNumber, currencySymbol, onSuccess, onCancel, onOfflineQueue,
}: PaymentFlowProps) {
  const { toast } = useToast();
  const info = GATEWAY_INFO[gateway];
  const fmt = (n: number) => formatCurrency(n, currencySymbol);

  const [status, setStatus] = useState<FlowStatus>('input');
  const [phone, setPhone] = useState('');
  const [message, setMessage] = useState('');
  const [txnId, setTxnId] = useState<number | null>(null);
  const [transactionId, setTransactionId] = useState('');
  const [gatewayRef, setGatewayRef] = useState<string | null>(null);
  const [qrData, setQrData] = useState<string | null>(null);
  const [pollCount, setPollCount] = useState(0);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Cleanup polling on unmount
  useEffect(() => {
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, []);

  // Auto-initiate for non-phone gateways
  useEffect(() => {
    if (!info.needsPhone && status === 'input') {
      handleInitiate();
    }
  }, []);

  const handleInitiate = async () => {
    if (info.needsPhone && !phone.trim()) {
      toast('Customer phone number is required', 'error');
      return;
    }

    setStatus('processing');
    setMessage('Connecting to ' + info.name + '...');

    try {
      const result = await cmd<any>('payment_initiate', {
        gateway,
        amount,
        customerPhone: info.needsPhone ? phone : null,
        invoiceNumber,
        description: `POS Payment - ${invoiceNumber}`,
      });

      setTxnId(result.txn_id);
      setTransactionId(result.transaction_id);
      setGatewayRef(result.gateway_ref);

      if (result.status === 'success') {
        setStatus('success');
        setMessage(result.message || 'Payment successful!');
        onSuccess(result.txn_id, result.gateway_ref);
      } else if (result.status === 'pending') {
        setStatus('pending');
        setMessage(result.message || 'Waiting for customer approval...');
        if (result.qr_code_data) setQrData(result.qr_code_data);
        startPolling(result.txn_id, result.transaction_id);
      } else {
        setStatus('failed');
        setMessage(result.message || 'Payment failed');
      }
    } catch (err: any) {
      const errMsg = err?.toString() || 'Connection failed';
      if (errMsg.includes('network') || errMsg.includes('timeout') || errMsg.includes('connect')) {
        setStatus('offline');
        setMessage('No network connection. Payment can be queued for later.');
      } else {
        setStatus('failed');
        setMessage(errMsg);
      }
    }
  };

  const startPolling = (tid: number, trid: string) => {
    setPollCount(0);
    if (pollRef.current) clearInterval(pollRef.current);

    pollRef.current = setInterval(async () => {
      setPollCount(prev => {
        const next = prev + 1;
        if (next > 60) { // 5 min timeout (5s * 60)
          if (pollRef.current) clearInterval(pollRef.current);
          setStatus('failed');
          setMessage('Payment request timed out. Customer did not respond.');
          return next;
        }
        return next;
      });

      try {
        const result = await cmd<any>('payment_check_status', {
          gateway, transactionId: trid, txnId: tid,
        });

        if (result.status === 'success') {
          if (pollRef.current) clearInterval(pollRef.current);
          setStatus('success');
          setMessage(result.message || 'Payment confirmed!');
          setGatewayRef(result.gateway_ref);
          onSuccess(tid, result.gateway_ref);
        } else if (result.status === 'failed' || result.status === 'expired') {
          if (pollRef.current) clearInterval(pollRef.current);
          setStatus('failed');
          setMessage(result.message || 'Payment was declined');
        }
        // else still pending, keep polling
      } catch {
        // Network error during polling, keep trying
      }
    }, 5000);
  };

  const handleRetry = () => {
    setStatus('input');
    setMessage('');
    setTxnId(null);
    setQrData(null);
    setPollCount(0);
    if (pollRef.current) clearInterval(pollRef.current);
  };

  const handleQueueOffline = async () => {
    try {
      await cmd('payment_queue_offline', {
        gateway,
        payload: JSON.stringify({ amount, invoiceNumber, phone }),
      });
      toast('Payment queued for when network is available', 'info');
      onOfflineQueue();
    } catch (e: any) {
      toast('Failed to queue: ' + e.toString(), 'error');
    }
  };

  return (
    <>
      <div className="overlay" onClick={status === 'input' ? onCancel : undefined} />
      <div className="dialog w-[420px] p-0 overflow-hidden">
        {/* Header */}
        <div className={`bg-gradient-to-r ${info.bgClass} px-6 py-4 text-white flex items-center justify-between`}>
          <div className="flex items-center gap-3">
            {info.icon}
            <div>
              <h2 className="font-bold text-lg">{info.name} Payment</h2>
              <p className="text-white/80 text-sm">{fmt(amount)}</p>
            </div>
          </div>
          {status === 'input' && (
            <button onClick={onCancel} className="text-white/70 hover:text-white transition-colors">
              <X className="w-5 h-5" />
            </button>
          )}
        </div>

        <div className="p-6">
          {/* ─── Phone Input Stage ─── */}
          {status === 'input' && info.needsPhone && (
            <div className="space-y-4">
              <div>
                <label className="text-sm font-semibold text-slate-700 mb-1.5 block">
                  Customer Phone Number
                </label>
                <div className="relative">
                  <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="03XX-XXXXXXX"
                    className="input pl-10 text-lg font-mono tracking-wider"
                    autoFocus
                    onKeyDown={(e) => e.key === 'Enter' && handleInitiate()}
                  />
                </div>
                <p className="text-xs text-slate-400 mt-1.5">
                  {gateway === 'jazzcash'
                    ? 'Jazz/Mobilink number linked to JazzCash wallet'
                    : 'Telenor number linked to EasyPaisa account'
                  }
                </p>
              </div>

              <div className="bg-slate-50 rounded-xl p-3 space-y-1.5">
                <div className="flex justify-between text-sm">
                  <span className="text-slate-500">Amount</span>
                  <span className="font-bold text-slate-800">{fmt(amount)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-500">Invoice</span>
                  <span className="font-mono text-slate-600">{invoiceNumber}</span>
                </div>
              </div>

              <button
                onClick={handleInitiate}
                disabled={!phone.trim()}
                className="w-full py-3 rounded-xl font-bold text-white transition-all disabled:opacity-50"
                style={{ background: info.color }}
              >
                Send Payment Request
              </button>
            </div>
          )}

          {/* ─── Processing ─── */}
          {status === 'processing' && (
            <div className="flex flex-col items-center py-8">
              <div className="w-16 h-16 rounded-full flex items-center justify-center mb-4"
                style={{ background: `${info.color}15` }}>
                <Loader2 className="w-8 h-8 animate-spin" style={{ color: info.color }} />
              </div>
              <p className="text-sm text-slate-600 text-center">{message}</p>
            </div>
          )}

          {/* ─── Pending (waiting for customer) ─── */}
          {status === 'pending' && (
            <div className="flex flex-col items-center py-4">
              {qrData ? (
                /* HBL QR Code display */
                <div className="mb-4 p-4 bg-white border-2 border-slate-200 rounded-2xl">
                  <div className="w-48 h-48 bg-slate-100 rounded-xl flex items-center justify-center">
                    <QrCode className="w-24 h-24 text-slate-400" />
                  </div>
                  <p className="text-xs text-center text-slate-500 mt-2">
                    Ask customer to scan with HBL app
                  </p>
                </div>
              ) : (
                <div className="w-20 h-20 rounded-2xl flex items-center justify-center mb-4 relative bg-white shadow-lg border border-slate-100 overflow-hidden">
                  {info.icon}
                  <span className="absolute -top-1 -right-1 w-5 h-5 bg-amber-400 rounded-full animate-pulse" />
                </div>
              )}

              <h3 className="font-bold text-slate-800 text-lg mb-1">Waiting for Approval</h3>
              <p className="text-sm text-slate-500 text-center mb-4">{message}</p>

              <div className="w-full bg-slate-100 rounded-full h-1.5 mb-2">
                <div
                  className="h-1.5 rounded-full transition-all duration-1000"
                  style={{
                    width: `${Math.min(100, (pollCount / 60) * 100)}%`,
                    background: info.color,
                  }}
                />
              </div>
              <p className="text-xs text-slate-400">
                {Math.max(0, 300 - pollCount * 5)}s remaining
              </p>

              <button onClick={onCancel} className="btn-secondary btn-sm mt-4">
                Cancel
              </button>
            </div>
          )}

          {/* ─── Success ─── */}
          {status === 'success' && (
            <div className="flex flex-col items-center py-6">
              <div className="w-20 h-20 rounded-full bg-green-100 flex items-center justify-center mb-4">
                <CheckCircle2 className="w-10 h-10 text-green-600" />
              </div>
              <h3 className="font-bold text-green-700 text-xl mb-1">Payment Successful!</h3>
              <p className="text-sm text-slate-500 text-center mb-2">{message}</p>
              {gatewayRef && (
                <p className="text-xs font-mono bg-slate-100 px-3 py-1 rounded-lg text-slate-600">
                  Ref: {gatewayRef}
                </p>
              )}
              <button onClick={onCancel} className="btn-primary mt-6 w-full">
                Done
              </button>
            </div>
          )}

          {/* ─── Failed ─── */}
          {status === 'failed' && (
            <div className="flex flex-col items-center py-6">
              <div className="w-20 h-20 rounded-full bg-red-100 flex items-center justify-center mb-4">
                <XCircle className="w-10 h-10 text-red-500" />
              </div>
              <h3 className="font-bold text-red-600 text-xl mb-1">Payment Failed</h3>
              <p className="text-sm text-slate-500 text-center mb-6">{message}</p>
              <div className="flex gap-3 w-full">
                <button onClick={handleRetry} className="btn-secondary flex-1">
                  <RefreshCw className="w-4 h-4" /> Retry
                </button>
                <button onClick={onCancel} className="btn-primary flex-1">
                  Use Cash Instead
                </button>
              </div>
            </div>
          )}

          {/* ─── Offline ─── */}
          {status === 'offline' && (
            <div className="flex flex-col items-center py-6">
              <div className="w-20 h-20 rounded-full bg-amber-100 flex items-center justify-center mb-4">
                <WifiOff className="w-10 h-10 text-amber-600" />
              </div>
              <h3 className="font-bold text-amber-700 text-xl mb-1">No Connection</h3>
              <p className="text-sm text-slate-500 text-center mb-6">{message}</p>
              <div className="flex gap-3 w-full">
                <button onClick={handleQueueOffline} className="btn-secondary flex-1">
                  <Wifi className="w-4 h-4" /> Queue for Later
                </button>
                <button onClick={onCancel} className="btn-primary flex-1">
                  Use Cash Instead
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
