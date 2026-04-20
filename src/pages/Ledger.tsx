import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { cmd, formatCurrency } from '../lib/utils';
import { useSettingsStore } from '../stores/settingsStore';
import { useToast } from '../components/ui/Toaster';
import { Search, Users, TrendingDown, TrendingUp, DollarSign, ChevronRight } from 'lucide-react';

interface Customer {
  id: number; name: string; phone: string;
  address?: string; outstanding_balance: number;
}
type SortBy = 'balance' | 'name' | 'recent';

export default function LedgerPage() {
  const { t } = useTranslation();
  const { currency_symbol } = useSettingsStore();
  const { toast } = useToast();
  const qc = useQueryClient();
  const fmt = (n: number) => formatCurrency(n, currency_symbol);

  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState<SortBy>('balance');
  const [showPayDialog, setShowPayDialog] = useState<Customer | null>(null);
  const [payAmount, setPayAmount] = useState('');
  const [payMethod, setPayMethod] = useState('cash');
  const [payNote, setPayNote] = useState('');
  const [paying, setPaying] = useState(false);

  const { data: customers = [], isLoading } = useQuery<Customer[]>({
    queryKey: ['customers', sortBy],
    queryFn: () => cmd('get_all_customers', { sortBy: sortBy }),
  });

  const { data: totalUdhaar = 0 } = useQuery<number>({
    queryKey: ['total-udhaar'],
    queryFn: () => cmd('get_total_udhaar'),
  });

  const { data: collections = 0 } = useQuery<number>({
    queryKey: ['collections'],
    queryFn: () => cmd('get_todays_collections'),
  });

  const filtered = customers.filter(
    (c) => !search || c.name.toLowerCase().includes(search.toLowerCase()) || c.phone.includes(search)
  );

  const handleReceivePayment = async () => {
    if (!showPayDialog || !payAmount) return;
    setPaying(true);
    try {
      await cmd('record_payment', {
        payload: {
          customer_id: showPayDialog.id,
          amount: parseFloat(payAmount),
          method: payMethod,
          notes: payNote || null,
          created_by: null,
        }
      });
      toast('Payment recorded!', 'success');
      qc.invalidateQueries({ queryKey: ['customers'] });
      qc.invalidateQueries({ queryKey: ['total-udhaar'] });
      qc.invalidateQueries({ queryKey: ['collections'] });
      setShowPayDialog(null);
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
        <h1 className="page-title flex items-center gap-2">
          <Users className="w-5 h-5 text-brand-600" />
          {t('ledger.title')}
        </h1>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="stat-card border-l-4 border-l-red-400">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-red-50 flex items-center justify-center">
              <TrendingDown className="w-4 h-4 text-red-500" />
            </div>
            <div>
              <p className="stat-value text-red-600">{fmt(totalUdhaar)}</p>
              <p className="stat-label">{t('ledger.totalUdhaar')}</p>
            </div>
          </div>
        </div>
        <div className="stat-card border-l-4 border-l-green-400">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-green-50 flex items-center justify-center">
              <TrendingUp className="w-4 h-4 text-green-600" />
            </div>
            <div>
              <p className="stat-value text-green-600">{fmt(collections)}</p>
              <p className="stat-label">{t('ledger.todayCollections')}</p>
            </div>
          </div>
        </div>
        <div className="stat-card border-l-4 border-l-brand-400">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-brand-50 flex items-center justify-center">
              <Users className="w-4 h-4 text-brand-600" />
            </div>
            <div>
              <p className="stat-value">{customers.filter(c => c.outstanding_balance > 0).length}</p>
              <p className="stat-label">Active Udhaar Customers</p>
            </div>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 mb-4">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('common.search') + ' customers...'}
            className="input pl-9"
          />
        </div>
        <div className="flex rounded-lg overflow-hidden border border-slate-200">
          {(['balance', 'name', 'recent'] as SortBy[]).map((s) => (
            <button
              key={s}
              onClick={() => setSortBy(s)}
              className={`px-3 py-2 text-xs font-medium capitalize transition-colors ${
                sortBy === s ? 'bg-brand-600 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'
              }`}
            >
              {s === 'balance' ? 'Highest Balance' : s === 'name' ? 'Name' : 'Recent'}
            </button>
          ))}
        </div>
      </div>

      {/* Customer list */}
      <div className="table-container">
        <table className="table">
          <thead>
            <tr>
              <th>Customer</th>
              <th>Phone</th>
              <th>Balance</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr><td colSpan={4} className="text-center py-8 text-slate-400">{t('common.loading')}</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={4} className="text-center py-8 text-slate-400">{t('common.noData')}</td></tr>
            ) : (
              filtered.map((c) => (
                <tr key={c.id}>
                  <td>
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-brand-100 flex items-center justify-center flex-shrink-0">
                        <span className="text-brand-700 text-xs font-bold uppercase">{c.name.charAt(0)}</span>
                      </div>
                      <div>
                        <p className="font-medium text-slate-800">{c.name}</p>
                        {c.address && <p className="text-xs text-slate-400">{c.address}</p>}
                      </div>
                    </div>
                  </td>
                  <td className="text-slate-500">{c.phone}</td>
                  <td>
                    {c.outstanding_balance > 0 ? (
                      <span className="badge-red font-semibold">{fmt(c.outstanding_balance)}</span>
                    ) : (
                      <span className="badge-green">Settled</span>
                    )}
                  </td>
                  <td>
                    <div className="flex items-center gap-2">
                      {c.outstanding_balance > 0 && (
                        <button
                          onClick={() => setShowPayDialog(c)}
                          className="btn-sm btn-primary"
                        >
                          <DollarSign className="w-3.5 h-3.5" /> Receive
                        </button>
                      )}
                      <Link to={`/ledger/${c.id}`} className="btn-sm btn-secondary">
                        View <ChevronRight className="w-3.5 h-3.5" />
                      </Link>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Receive Payment Dialog */}
      {showPayDialog && (
        <>
          <div className="overlay" onClick={() => setShowPayDialog(null)} />
          <div className="dialog w-96">
            <h2 className="font-semibold text-slate-800 mb-1">{t('ledger.receivePayment')}</h2>
            <p className="text-sm text-slate-500 mb-4">
              {showPayDialog.name} — Balance: <strong className="text-red-500">{fmt(showPayDialog.outstanding_balance)}</strong>
            </p>
            <div className="space-y-3">
              <div>
                <label className="label">{t('ledger.amount')} *</label>
                <input
                  type="number"
                  value={payAmount}
                  onChange={(e) => setPayAmount(e.target.value)}
                  className="input"
                  placeholder="0"
                  autoFocus
                />
                <div className="flex gap-1 mt-1">
                  {[500, 1000, 2000].map((a) => (
                    <button key={a} onClick={() => setPayAmount(String(a))} className="btn-sm btn-secondary text-xs">{a}</button>
                  ))}
                  <button onClick={() => setPayAmount(String(showPayDialog.outstanding_balance))} className="btn-sm btn-secondary text-xs">Full</button>
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
                <input value={payNote} onChange={(e) => setPayNote(e.target.value)} className="input" placeholder="Optional note" />
              </div>
              <div className="flex gap-2 pt-2">
                <button onClick={handleReceivePayment} disabled={paying} className="btn-primary flex-1">
                  {paying ? <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : null}
                  Record Payment
                </button>
                <button onClick={() => setShowPayDialog(null)} className="btn-secondary flex-1">Cancel</button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
