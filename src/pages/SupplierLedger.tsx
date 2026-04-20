import React, { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { cmd, formatCurrency, formatDate } from '../lib/utils';
import { useSettingsStore } from '../stores/settingsStore';
import { useToast } from '../components/ui/Toaster';
import { ArrowLeft, DollarSign, Printer, Filter, Calendar } from 'lucide-react';

interface Supplier { id: number; name: string; phone: string; address?: string; outstanding_balance: number; }
interface SupplierLedgerEntry {
  id: number; entry_type: string; // 'purchase' | 'payment' | 'adjustment'
  amount: number; balance_after: number; description?: string; entry_date: string;
}

export default function SupplierLedgerPage() {
  const { id } = useParams<{ id: string }>();
  const supplierId = parseInt(id!);
  const { currency_symbol } = useSettingsStore();
  const { toast } = useToast();
  const qc = useQueryClient();
  const fmt = (n: number) => formatCurrency(Math.abs(n), currency_symbol);

  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [showPay, setShowPay] = useState(false);
  const [payAmount, setPayAmount] = useState('');
  const [payMethod, setPayMethod] = useState('cash');
  const [payNote, setPayNote] = useState('');
  const [paying, setPaying] = useState(false);

  const { data: supplier } = useQuery<Supplier>({
    queryKey: ['supplier', supplierId],
    queryFn: () => cmd('get_supplier_by_id', { id: supplierId }),
  });

  const { data: entries = [], error } = useQuery<SupplierLedgerEntry[]>({
    queryKey: ['supplier-ledger', supplierId, from, to],
    queryFn: () => cmd('get_supplier_ledger', {
      supplierId: supplierId,
      from: from || null,
      to: to || null,
    }),
  });

  const handlePay = async () => {
    if (!payAmount) return;
    setPaying(true);
    try {
      await cmd('record_supplier_payment', {
        payload: {
          supplier_id: supplierId,
          amount: parseFloat(payAmount),
          method: payMethod,
          notes: payNote || null,
          created_by: null,
        }
      });
      toast('Payment recorded successfully!', 'success');
      qc.invalidateQueries({ queryKey: ['supplier-ledger', supplierId] });
      qc.invalidateQueries({ queryKey: ['supplier', supplierId] });
      qc.invalidateQueries({ queryKey: ['suppliers'] });
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
          <Link to="/suppliers" className="btn-ghost btn-icon no-print">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div>
            <h1 className="page-title">{supplier?.name ?? 'Loading...'}</h1>
            <p className="text-sm text-slate-500 font-mono">{supplier?.phone}</p>
          </div>
        </div>
        <div className="flex gap-2 no-print">
           <button onClick={() => window.print()} className="btn-secondary">
            <Printer className="w-4 h-4" /> Print Ledger
          </button>
          <button onClick={() => setShowPay(true)} className="btn-primary">
            <DollarSign className="w-4 h-4" /> Record Payment
          </button>
        </div>
      </div>

      {/* Summary Row */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className="stat-card border-l-4 border-l-slate-400">
           <p className="stat-label text-xs uppercase font-bold text-slate-500 tracking-wider">Status</p>
           <p className={`stat-value ${supplier?.outstanding_balance! > 0 ? 'text-red-600' : 'text-green-600'}`}>
             {supplier?.outstanding_balance! > 0 ? 'Payment Due' : supplier?.outstanding_balance! < 0 ? 'Advance Given' : 'Settled'}
           </p>
        </div>
        <div className="stat-card border-l-4 border-l-brand-400">
           <p className="stat-label text-xs uppercase font-bold text-slate-500 tracking-wider">Current Balance</p>
           <p className="stat-value text-brand-700">{fmt(supplier?.outstanding_balance ?? 0)}</p>
        </div>
        <div className="stat-card border-l-4 border-l-green-400">
           <p className="stat-label text-xs uppercase font-bold text-slate-500 tracking-wider">Last Transaction</p>
           <p className="stat-value text-slate-700 text-lg">
             {entries.length > 0 ? formatDate(entries[entries.length - 1].entry_date) : 'N/A'}
           </p>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white p-3 rounded-lg border border-slate-200 flex items-center gap-4 mb-4 no-print">
        <div className="flex items-center gap-2 text-slate-500">
          <Filter className="w-4 h-4" />
          <span className="text-xs font-bold uppercase tracking-widest">Filters</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Calendar className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="input-sm pl-8 text-xs" />
          </div>
          <span className="text-slate-400 text-xs">to</span>
          <div className="relative">
            <Calendar className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="input-sm pl-8 text-xs" />
          </div>
          {(from || to) && (
            <button onClick={() => { setFrom(''); setTo(''); }} className="text-brand-600 hover:text-brand-700 text-xs font-bold">Clear</button>
          )}
        </div>
      </div>

      {/* Ledger table */}
      <div className="table-container">
        <table className="table">
          <thead>
            <tr>
              <th className="w-40">Date</th>
              <th>Description</th>
              <th className="text-right">Debit (-)</th>
              <th className="text-right">Credit (+)</th>
              <th className="text-right">Balance</th>
            </tr>
          </thead>
          <tbody>
            {error ? (
              <tr><td colSpan={5} className="text-center py-12">
                <div className="bg-red-50 border border-red-200 text-red-700 p-4 rounded-lg inline-block text-left">
                  <p className="font-bold text-sm">Error loading ledger</p>
                  <p className="text-xs opacity-80 mt-1">{(error as any).toString()}</p>
                </div>
              </td></tr>
            ) : entries.length === 0 ? (
              <tr><td colSpan={5} className="text-center py-12 text-slate-400 font-medium">No transactions found in this period.</td></tr>
            ) : (
              entries.map((e) => (
                <tr key={e.id} className="hover:bg-slate-50/50">
                  <td className="text-slate-500 text-xs font-medium">{formatDate(e.entry_date)}</td>
                  <td>
                    <p className="text-sm font-medium text-slate-700">{e.description || e.entry_type}</p>
                  </td>
                  <td className="text-right">
                    {e.entry_type === 'payment' ? (
                      <span className="font-bold text-red-600">-{fmt(e.amount)}</span>
                    ) : '—'}
                  </td>
                  <td className="text-right">
                    {e.entry_type === 'purchase' ? (
                      <span className="font-bold text-green-600">+{fmt(e.amount)}</span>
                    ) : '—'}
                  </td>
                  <td className="text-right">
                    <span className={`font-black ${e.balance_after > 0 ? 'text-red-600' : 'text-brand-600'}`}>
                      {fmt(e.balance_after)}
                    </span>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Record Payment Dialog */}
      {showPay && (
        <>
          <div className="overlay" onClick={() => setShowPay(false)} />
          <div className="dialog w-96 animate-in fade-in zoom-in duration-200">
            <h2 className="font-bold text-slate-800 text-lg mb-1">Pay Supplier</h2>
            <p className="text-sm text-slate-500 mb-4">Entering payment for <strong className="text-slate-700">{supplier?.name}</strong></p>
            
            <div className="space-y-4">
              <div className="bg-slate-50 p-3 rounded-lg flex justify-between items-center">
                 <span className="text-xs font-bold text-slate-500 uppercase">Outstanding Balance</span>
                 <span className="text-lg font-black text-red-600">{fmt(supplier?.outstanding_balance ?? 0)}</span>
              </div>

              <div>
                <label className="label text-[10px] font-black uppercase text-slate-400">Payment Amount *</label>
                <input
                  type="number"
                  value={payAmount}
                  onChange={(e) => setPayAmount(e.target.value)}
                  className="input font-bold text-lg"
                  autoFocus
                  placeholder="0"
                />
                <div className="flex gap-1 mt-2">
                  <button onClick={() => setPayAmount(String(supplier?.outstanding_balance ?? 0))} className="btn-ghost btn-sm text-[10px] font-black uppercase bg-slate-100 hover:bg-slate-200 flex-1">Pay Full</button>
                  <button onClick={() => setPayAmount(String(Math.floor((supplier?.outstanding_balance ?? 0) / 2)))} className="btn-ghost btn-sm text-[10px] font-black uppercase bg-slate-100 hover:bg-slate-200 flex-1">Pay Half</button>
                </div>
              </div>

              <div>
                <label className="label text-[10px] font-black uppercase text-slate-400">Payment Method</label>
                <select value={payMethod} onChange={(e) => setPayMethod(e.target.value)} className="input">
                  <option value="cash">Cash</option>
                  <option value="bank">Bank Transfer</option>
                  <option value="cheque">Cheque</option>
                </select>
              </div>

              <div>
                <label className="label text-[10px] font-black uppercase text-slate-400">Notes / Reference</label>
                <input value={payNote} onChange={(e) => setPayNote(e.target.value)} className="input" placeholder="e.g. Voucher #123" />
              </div>

              <div className="flex gap-2 pt-2">
                <button onClick={handlePay} disabled={paying} className="btn-primary flex-1">
                  {paying ? <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin mr-2" /> : null}
                  Confirm Payment
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
