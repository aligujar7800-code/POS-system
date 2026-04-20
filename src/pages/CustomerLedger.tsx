import React, { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { cmd, formatCurrency, formatDate } from '../lib/utils';
import { useSettingsStore } from '../stores/settingsStore';
import { useToast } from '../components/ui/Toaster';
import { ArrowLeft, DollarSign, Printer, Filter } from 'lucide-react';

interface Customer { id: number; name: string; phone: string; outstanding_balance: number; }
interface LedgerEntry {
  id: number; sale_id?: number; entry_type: string;
  amount: number; balance_after: number; description?: string; entry_date: string;
}
interface Summary { total_purchased: number; total_paid: number; balance_due: number; }

export default function CustomerLedger() {
  const { id } = useParams<{ id: string }>();
  const customerId = parseInt(id!);
  const { t } = useTranslation();
  const { currency_symbol } = useSettingsStore();
  const { toast } = useToast();
  const qc = useQueryClient();
  const fmt = (n: number) => formatCurrency(n, currency_symbol);

  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [showPay, setShowPay] = useState(false);
  const [payAmount, setPayAmount] = useState('');
  const [payMethod, setPayMethod] = useState('cash');
  const [payNote, setPayNote] = useState('');
  const [paying, setPaying] = useState(false);

  const { data: customer } = useQuery<Customer>({
    queryKey: ['customer', customerId],
    queryFn: () => cmd('get_customer_by_id', { id: customerId }),
  });

  const { data: entries = [] } = useQuery<LedgerEntry[]>({
    queryKey: ['ledger', customerId, from, to],
    queryFn: () => cmd('get_customer_ledger', {
      customer_id: customerId,
      from: from || null,
      to: to || null,
    }),
  });

  const { data: summary } = useQuery<Summary>({
    queryKey: ['ledger-summary', customerId],
    queryFn: () => cmd('get_customer_summary', { customer_id: customerId }),
  });

  const handlePay = async () => {
    if (!payAmount) return;
    setPaying(true);
    try {
      await cmd('record_payment', {
        payload: {
          customer_id: customerId,
          amount: parseFloat(payAmount),
          method: payMethod,
          notes: payNote || null,
          created_by: null,
        }
      });
      toast('Payment recorded!', 'success');
      qc.invalidateQueries({ queryKey: ['ledger', customerId] });
      qc.invalidateQueries({ queryKey: ['ledger-summary', customerId] });
      qc.invalidateQueries({ queryKey: ['customer', customerId] });
      qc.invalidateQueries({ queryKey: ['total-udhaar'] });
      setShowPay(false);
      setPayAmount(''); setPayNote('');
    } catch (e: any) {
      toast(e.toString(), 'error');
    } finally {
      setPaying(false);
    }
  };

  return (
    <div className="page">
      <div className="page-header">
        <div className="flex items-center gap-3">
          <Link to="/ledger" className="btn-ghost btn-icon">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div>
            <h1 className="page-title">{customer?.name ?? '...'}</h1>
            <p className="text-sm text-slate-500">{customer?.phone}</p>
          </div>
        </div>
        <div className="flex gap-2">
          {(customer?.outstanding_balance ?? 0) > 0 && (
            <button onClick={() => setShowPay(true)} className="btn-primary">
              <DollarSign className="w-4 h-4" /> {t('ledger.receivePayment')}
            </button>
          )}
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="stat-card border-l-4 border-l-brand-400">
          <p className="stat-label">{t('ledger.totalPurchased')}</p>
          <p className="stat-value text-brand-700">{fmt(summary?.total_purchased ?? 0)}</p>
        </div>
        <div className="stat-card border-l-4 border-l-green-400">
          <p className="stat-label">{t('ledger.totalPaid')}</p>
          <p className="stat-value text-green-700">{fmt(summary?.total_paid ?? 0)}</p>
        </div>
        <div className={`stat-card border-l-4 ${(summary?.balance_due ?? 0) > 0 ? 'border-l-red-400' : 'border-l-slate-300'}`}>
          <p className="stat-label">{t('ledger.balanceDue')}</p>
          <p className={`stat-value ${(summary?.balance_due ?? 0) > 0 ? 'text-red-600' : 'text-slate-600'}`}>
            {fmt(summary?.balance_due ?? 0)}
          </p>
        </div>
      </div>

      {/* Date filter */}
      <div className="flex items-center gap-3 mb-4">
        <Filter className="w-4 h-4 text-slate-400" />
        <div className="flex items-center gap-2">
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="input-sm" />
          <span className="text-slate-400 text-sm">to</span>
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="input-sm" />
          {(from || to) && (
            <button onClick={() => { setFrom(''); setTo(''); }} className="btn-ghost btn-sm">Clear</button>
          )}
        </div>
      </div>

      {/* Ledger table */}
      <div className="table-container">
        <table className="table">
          <thead>
            <tr>
              <th>{t('ledger.date')}</th>
              <th>{t('ledger.description')}</th>
              <th className="text-right">{t('ledger.debit')}</th>
              <th className="text-right">{t('ledger.credit')}</th>
              <th className="text-right">{t('ledger.balance')}</th>
            </tr>
          </thead>
          <tbody>
            {entries.length === 0 ? (
              <tr><td colSpan={5} className="text-center py-8 text-slate-400">{t('ledger.noEntries')}</td></tr>
            ) : (
              entries.map((e) => (
                <tr key={e.id}>
                  <td className="text-slate-500 text-xs">{formatDate(e.entry_date)}</td>
                  <td>
                    <p className="text-sm">{e.description ?? `${e.entry_type} #${e.id}`}</p>
                    {e.sale_id && (
                      <p className="text-xs text-brand-500">INV linked</p>
                    )}
                  </td>
                  <td className="text-right">
                    {e.entry_type === 'sale' ? (
                      <span className="font-medium text-red-600">{fmt(e.amount)}</span>
                    ) : '—'}
                  </td>
                  <td className="text-right">
                    {e.entry_type === 'payment' ? (
                      <span className="font-medium text-green-600">{fmt(e.amount)}</span>
                    ) : '—'}
                  </td>
                  <td className="text-right">
                    <span className={`font-semibold ${e.balance_after > 0 ? 'text-red-600' : 'text-green-600'}`}>
                      {fmt(e.balance_after)}
                    </span>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Receive Payment dialog */}
      {showPay && (
        <>
          <div className="overlay" onClick={() => setShowPay(false)} />
          <div className="dialog w-96">
            <h2 className="font-semibold text-slate-800 mb-4">{t('ledger.receivePayment')}</h2>
            <div className="space-y-3">
              <div>
                <label className="label">{t('ledger.amount')}</label>
                <input
                  type="number"
                  value={payAmount}
                  onChange={(e) => setPayAmount(e.target.value)}
                  className="input"
                  autoFocus
                  placeholder="0"
                />
                <div className="flex gap-1 mt-1">
                  {[500, 1000, 2000].map((a) => (
                    <button key={a} onClick={() => setPayAmount(String(a))} className="btn-sm btn-secondary text-xs">{a}</button>
                  ))}
                  <button onClick={() => setPayAmount(String(customer?.outstanding_balance ?? 0))} className="btn-sm btn-secondary text-xs">Full</button>
                </div>
              </div>
              <div>
                <label className="label">{t('ledger.method')}</label>
                <select value={payMethod} onChange={(e) => setPayMethod(e.target.value)} className="input">
                  <option value="cash">Cash</option>
                  <option value="card">Card</option>
                  <option value="bank">Bank Transfer</option>
                </select>
              </div>
              <div>
                <label className="label">{t('ledger.notes')}</label>
                <input value={payNote} onChange={(e) => setPayNote(e.target.value)} className="input" />
              </div>
              <div className="flex gap-2">
                <button onClick={handlePay} disabled={paying} className="btn-primary flex-1">
                  {paying ? <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : null}
                  Record
                </button>
                <button onClick={() => setShowPay(false)} className="btn-secondary flex-1">Cancel</button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
