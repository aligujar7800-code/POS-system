import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { cmd, formatCurrency } from '../lib/utils';
import { useSettingsStore } from '../stores/settingsStore';
import { useAuthStore } from '../stores/authStore';
import { useToast } from '../components/ui/Toaster';
import { FileText, Plus, Trash2, CheckCircle2, AlertTriangle } from 'lucide-react';

interface Account {
  id: number; code: string; name: string; account_type: string;
}

interface JournalLineInput {
  key: number;
  account_id: number;
  debit_amount: string;
  credit_amount: string;
  description: string;
}

let lineKey = 0;
const emptyLine = (): JournalLineInput => ({ key: ++lineKey, account_id: 0, debit_amount: '', credit_amount: '', description: '' });

export default function ManualJournal() {
  const { currency_symbol } = useSettingsStore();
  const { user } = useAuthStore();
  const { toast } = useToast();
  const qc = useQueryClient();
  const fmt = (n: number) => formatCurrency(n, currency_symbol);

  const today = new Date().toISOString().slice(0, 10);
  const [entryDate, setEntryDate] = useState(today);
  const [description, setDescription] = useState('');
  const [lines, setLines] = useState<JournalLineInput[]>([emptyLine(), emptyLine()]);
  const [successJV, setSuccessJV] = useState<string | null>(null);

  const { data: accounts = [] } = useQuery<Account[]>({
    queryKey: ['accounts'],
    queryFn: () => cmd('get_all_accounts'),
  });

  const postMutation = useMutation({
    mutationFn: (payload: any) => cmd<number>('create_manual_journal', payload),
    onSuccess: (jvId: number) => {
      toast(`Journal posted successfully! JV ID: ${jvId}`, 'success');
      setSuccessJV(`JV-${new Date().getFullYear()}-${String(jvId).padStart(4, '0')}`);
      setDescription('');
      setLines([emptyLine(), emptyLine()]);
      qc.invalidateQueries({ queryKey: ['accounts'] });
      qc.invalidateQueries({ queryKey: ['account-ledger'] });
    },
    onError: (e: any) => toast(e.toString(), 'error'),
  });

  const totalDebits = lines.reduce((s, l) => s + (parseFloat(l.debit_amount) || 0), 0);
  const totalCredits = lines.reduce((s, l) => s + (parseFloat(l.credit_amount) || 0), 0);
  const diff = Math.abs(totalDebits - totalCredits);
  const isBalanced = totalDebits > 0 && diff < 0.01;

  const updateLine = (key: number, field: keyof JournalLineInput, value: string | number) => {
    setLines(prev => prev.map(l => {
      if (l.key !== key) return l;
      const updated = { ...l, [field]: value };
      // Clear the other side when one side is typed
      if (field === 'debit_amount' && value) updated.credit_amount = '';
      if (field === 'credit_amount' && value) updated.debit_amount = '';
      return updated;
    }));
  };

  const removeLine = (key: number) => {
    if (lines.length <= 2) return;
    setLines(prev => prev.filter(l => l.key !== key));
  };

  const handlePost = () => {
    if (!description.trim()) { toast('Description is required', 'error'); return; }
    if (!isBalanced) { toast('Debits and Credits must be equal', 'error'); return; }

    const validLines = lines.filter(l => l.account_id > 0 && (parseFloat(l.debit_amount) > 0 || parseFloat(l.credit_amount) > 0));
    if (validLines.length < 2) { toast('At least 2 valid lines are required', 'error'); return; }

    const payload = {
      entry: {
        entry_date: entryDate + ' 00:00:00',
        description: description.trim(),
        reference_type: 'manual',
        reference_id: null,
        lines: validLines.map(l => ({
          account_id: l.account_id,
          debit_amount: parseFloat(l.debit_amount) || 0,
          credit_amount: parseFloat(l.credit_amount) || 0,
          description: l.description || null,
        })),
      },
      createdBy: user?.id ?? null,
    };

    postMutation.mutate(payload);
  };

  return (
    <div className="page">
      <div className="page-header">
        <h1 className="page-title flex items-center gap-2">
          <FileText className="w-5 h-5 text-brand-600" /> Manual Journal Entry
        </h1>
      </div>

      {successJV && (
        <div className="mb-4 p-4 bg-green-50 border border-green-200 rounded-xl flex items-center gap-3 animate-in fade-in">
          <CheckCircle2 className="w-5 h-5 text-green-600" />
          <p className="text-green-800 font-medium">Journal <span className="font-mono font-bold">{successJV}</span> posted successfully!</p>
          <button onClick={() => setSuccessJV(null)} className="ml-auto text-green-500 hover:text-green-700 text-sm">Dismiss</button>
        </div>
      )}

      <div className="card p-6 space-y-6">
        {/* Header Fields */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="label">Date</label>
            <input type="date" value={entryDate} onChange={e => setEntryDate(e.target.value)} className="input" />
          </div>
          <div className="md:col-span-2">
            <label className="label">Description *</label>
            <input value={description} onChange={e => setDescription(e.target.value)} placeholder="e.g. Owner capital investment" className="input" />
          </div>
        </div>

        {/* Journal Lines Table */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm font-bold text-slate-700">Journal Lines</p>
            <button onClick={() => setLines(prev => [...prev, emptyLine()])} className="btn-secondary btn-sm">
              <Plus className="w-3.5 h-3.5" /> Add Line
            </button>
          </div>

          <div className="border border-slate-200 rounded-xl overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="bg-slate-50 text-xs text-slate-500 uppercase tracking-wider">
                  <th className="px-3 py-2.5 text-left w-[40%]">Account</th>
                  <th className="px-3 py-2.5 text-right w-[20%]">Debit</th>
                  <th className="px-3 py-2.5 text-right w-[20%]">Credit</th>
                  <th className="px-3 py-2.5 text-left w-[15%]">Note</th>
                  <th className="px-3 py-2.5 w-[5%]"></th>
                </tr>
              </thead>
              <tbody>
                {lines.map((line) => (
                  <tr key={line.key} className="border-t border-slate-100">
                    <td className="px-2 py-1.5">
                      <select
                        value={line.account_id}
                        onChange={e => updateLine(line.key, 'account_id', Number(e.target.value))}
                        className="input text-sm h-9"
                      >
                        <option value={0}>Select account...</option>
                        {accounts.map(a => (
                          <option key={a.id} value={a.id}>[{a.code}] {a.name}</option>
                        ))}
                      </select>
                    </td>
                    <td className="px-2 py-1.5">
                      <input
                        type="number"
                        value={line.debit_amount}
                        onChange={e => updateLine(line.key, 'debit_amount', e.target.value)}
                        placeholder="0"
                        className="input text-right text-sm h-9 font-mono"
                        min="0"
                      />
                    </td>
                    <td className="px-2 py-1.5">
                      <input
                        type="number"
                        value={line.credit_amount}
                        onChange={e => updateLine(line.key, 'credit_amount', e.target.value)}
                        placeholder="0"
                        className="input text-right text-sm h-9 font-mono"
                        min="0"
                      />
                    </td>
                    <td className="px-2 py-1.5">
                      <input
                        value={line.description}
                        onChange={e => updateLine(line.key, 'description', e.target.value)}
                        placeholder="Optional"
                        className="input text-sm h-9"
                      />
                    </td>
                    <td className="px-2 py-1.5 text-center">
                      <button onClick={() => removeLine(line.key)} className="text-slate-400 hover:text-red-500 transition-colors" disabled={lines.length <= 2}>
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className={`border-t-2 ${isBalanced ? 'border-green-300 bg-green-50' : diff > 0 ? 'border-red-300 bg-red-50' : 'border-slate-200 bg-slate-50'}`}>
                  <td className="px-3 py-3 font-bold text-sm text-slate-700">
                    {isBalanced ? (
                      <span className="flex items-center gap-1.5 text-green-700"><CheckCircle2 className="w-4 h-4" /> Balanced</span>
                    ) : diff > 0 ? (
                      <span className="flex items-center gap-1.5 text-red-700"><AlertTriangle className="w-4 h-4" /> Difference: {fmt(diff)}</span>
                    ) : (
                      <span className="text-slate-500">Enter amounts...</span>
                    )}
                  </td>
                  <td className="px-3 py-3 text-right font-mono font-bold text-sm text-blue-700">{fmt(totalDebits)}</td>
                  <td className="px-3 py-3 text-right font-mono font-bold text-sm text-amber-700">{fmt(totalCredits)}</td>
                  <td colSpan={2}></td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-3 pt-2 border-t border-slate-100">
          <button onClick={() => { setLines([emptyLine(), emptyLine()]); setDescription(''); }} className="btn-secondary px-6">
            Clear
          </button>
          <button
            onClick={handlePost}
            className="btn-primary px-8"
            disabled={!isBalanced || postMutation.isPending || !description.trim()}
          >
            {postMutation.isPending ? 'Posting...' : 'Post Journal Entry'}
          </button>
        </div>
      </div>
    </div>
  );
}
