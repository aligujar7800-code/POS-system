import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { cmd, formatCurrency } from '../lib/utils';
import { useSettingsStore } from '../stores/settingsStore';
import { BookOpen, Filter, Download } from 'lucide-react';
import { save } from '@tauri-apps/plugin-dialog';
import { writeTextFile } from '@tauri-apps/plugin-fs';
import { useToast } from '../components/ui/Toaster';

interface Account {
  id: number; code: string; name: string; account_type: string;
  normal_balance: string;
}
interface JournalLine {
  id: number; account_id: number; account_code: string; account_name: string;
  debit_amount: number; credit_amount: number; description?: string;
}

function getDefaultDates() {
  const pad = (n: number) => n.toString().padStart(2, '0');
  const now = new Date();
  const from = new Date(now.getFullYear(), now.getMonth(), 1);
  return {
    from: `${from.getFullYear()}-${pad(from.getMonth() + 1)}-${pad(from.getDate())}`,
    to: `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`,
  };
}

export default function AccountLedger() {
  const { currency_symbol } = useSettingsStore();
  const { toast } = useToast();
  const fmt = (n: number) => formatCurrency(n, currency_symbol);
  const [params] = useSearchParams();
  const accountIdParam = params.get('id');

  const defaults = getDefaultDates();
  const [from, setFrom] = useState(defaults.from);
  const [to, setTo] = useState(defaults.to);
  const [selectedAccountId, setSelectedAccountId] = useState<number | null>(accountIdParam ? Number(accountIdParam) : null);

  const { data: accounts = [] } = useQuery<Account[]>({
    queryKey: ['accounts'],
    queryFn: () => cmd('get_all_accounts'),
  });

  const { data: lines = [] } = useQuery<JournalLine[]>({
    queryKey: ['account-ledger', selectedAccountId, from, to],
    queryFn: () => cmd('get_account_ledger_data', { accountId: selectedAccountId!, fromDate: from, toDate: to }),
    enabled: !!selectedAccountId,
  });

  const selectedAccount = accounts.find(a => a.id === selectedAccountId);

  // Calculate running balance
  const linesWithBalance = lines.map((l, i) => {
    const prior = lines.slice(0, i).reduce((s, x) => s + x.debit_amount - x.credit_amount, 0);
    const balance = prior + l.debit_amount - l.credit_amount;
    return { ...l, balance };
  });

  const totalDebits = lines.reduce((s, l) => s + l.debit_amount, 0);
  const totalCredits = lines.reduce((s, l) => s + l.credit_amount, 0);
  const closingBalance = totalDebits - totalCredits;

  const exportCSV = async () => {
    if (!lines.length) return;
    const rows = linesWithBalance.map(l => ({
      Description: l.description || '',
      Debit: l.debit_amount,
      Credit: l.credit_amount,
      Balance: l.balance,
    }));
    const headers = Object.keys(rows[0]);
    const csv = [headers.join(','), ...rows.map(r => headers.map(h => `"${(r as any)[h]}"`).join(','))].join('\n');
    try {
      const dest = await save({ filters: [{ name: 'CSV', extensions: ['csv'] }], defaultPath: `account_ledger_${selectedAccount?.code}.csv` });
      if (!dest) return;
      await writeTextFile(dest, csv);
      toast('CSV exported', 'success');
    } catch (e: any) { toast('Export failed: ' + e.toString(), 'error'); }
  };

  return (
    <div className="page">
      <div className="page-header">
        <h1 className="page-title flex items-center gap-2">
          <BookOpen className="w-5 h-5 text-brand-600" /> Account Ledger
        </h1>
        <button onClick={exportCSV} className="btn-secondary" disabled={!lines.length}>
          <Download className="w-4 h-4" /> Export CSV
        </button>
      </div>

      {/* Filters */}
      <div className="bg-white p-3 rounded-lg border border-slate-200 flex items-center gap-4 mb-5 flex-wrap">
        <div className="flex items-center gap-2 text-slate-500">
          <Filter className="w-4 h-4" />
          <span className="text-xs font-bold uppercase tracking-widest">Filters</span>
        </div>
        <select value={selectedAccountId ?? ''} onChange={e => setSelectedAccountId(Number(e.target.value))} className="input w-64">
          <option value="">Select Account...</option>
          {accounts.map(a => <option key={a.id} value={a.id}>[{a.code}] {a.name}</option>)}
        </select>
        <input type="date" value={from} onChange={e => setFrom(e.target.value)} className="input-sm" />
        <span className="text-slate-400">—</span>
        <input type="date" value={to} onChange={e => setTo(e.target.value)} className="input-sm" />
      </div>

      {selectedAccount && (
        <div className="mb-4 px-4 py-3 bg-brand-50 rounded-lg border border-brand-100 flex items-center gap-4">
          <span className="font-mono font-bold text-brand-700">[{selectedAccount.code}]</span>
          <span className="font-semibold text-slate-900">{selectedAccount.name}</span>
          <span className="badge bg-slate-100 text-slate-600 text-xs">{selectedAccount.account_type} / {selectedAccount.normal_balance}</span>
        </div>
      )}

      <div className="card">
        <table className="table">
          <thead>
            <tr>
              <th>Description</th>
              <th className="text-right">Debit</th>
              <th className="text-right">Credit</th>
              <th className="text-right">Balance</th>
            </tr>
          </thead>
          <tbody>
            {linesWithBalance.map(l => (
              <tr key={l.id}>
                <td className="text-sm text-slate-700">{l.description || '—'}</td>
                <td className={`text-right font-mono text-sm ${l.debit_amount > 0 ? 'text-blue-600 font-medium' : 'text-slate-300'}`}>
                  {l.debit_amount > 0 ? fmt(l.debit_amount) : '—'}
                </td>
                <td className={`text-right font-mono text-sm ${l.credit_amount > 0 ? 'text-amber-600 font-medium' : 'text-slate-300'}`}>
                  {l.credit_amount > 0 ? fmt(l.credit_amount) : '—'}
                </td>
                <td className={`text-right font-mono text-sm font-bold ${l.balance >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {l.balance >= 0 ? fmt(l.balance) : `(${fmt(Math.abs(l.balance))})`}
                </td>
              </tr>
            ))}
            {lines.length === 0 && (
              <tr><td colSpan={4} className="text-center py-8 text-slate-400">{selectedAccountId ? 'No transactions in this range' : 'Select an account to view'}</td></tr>
            )}
          </tbody>
          {lines.length > 0 && (
            <tfoot>
              <tr className="border-t-2 border-slate-200 bg-slate-50">
                <td className="font-bold text-slate-700">Totals</td>
                <td className="text-right font-mono font-bold text-blue-600">{fmt(totalDebits)}</td>
                <td className="text-right font-mono font-bold text-amber-600">{fmt(totalCredits)}</td>
                <td className={`text-right font-mono font-bold ${closingBalance >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                  {closingBalance >= 0 ? fmt(closingBalance) : `(${fmt(Math.abs(closingBalance))})`}
                </td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}
