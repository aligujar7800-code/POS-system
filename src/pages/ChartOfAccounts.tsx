import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { cmd, formatCurrency } from '../lib/utils';
import { useSettingsStore } from '../stores/settingsStore';
import { useToast } from '../components/ui/Toaster';
import { Link } from 'react-router-dom';
import { BookOpen, Plus, Lock, Trash2, Search, Eye } from 'lucide-react';

interface Account {
  id: number; code: string; name: string; name_ur?: string;
  account_type: string; category: string; normal_balance: string;
  is_system: boolean; is_active: boolean; parent_id?: number; description?: string;
}
interface AccountWithBalance {
  account: Account; debit_total: number; credit_total: number;
  balance: number; normal_balance_amount: number;
}
interface JournalLine {
  id: number; account_id: number; account_code: string; account_name: string;
  debit_amount: number; credit_amount: number; description?: string;
}
interface SubLedgerPart {
  id: number;
  name: string;
  phone: string;
  outstanding_balance: number;
}

const TYPE_COLORS: Record<string, string> = {
  asset: 'bg-blue-100 text-blue-700',
  liability: 'bg-amber-100 text-amber-700',
  equity: 'bg-purple-100 text-purple-700',
  revenue: 'bg-green-100 text-green-700',
  expense: 'bg-red-100 text-red-700',
};
const TYPE_ORDER = ['asset', 'liability', 'equity', 'revenue', 'expense'];
const TYPE_LABELS: Record<string, string> = { asset: 'Assets', liability: 'Liabilities', equity: 'Equity', revenue: 'Revenue', expense: 'Expenses' };

export default function ChartOfAccounts() {
  const { currency_symbol } = useSettingsStore();
  const { toast } = useToast();
  const qc = useQueryClient();
  const fmt = (n: number) => formatCurrency(Math.abs(n), currency_symbol);

  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState<string>('all');
  const [selected, setSelected] = useState<Account | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [newCode, setNewCode] = useState('');
  const [newName, setNewName] = useState('');
  const [newNameUr, setNewNameUr] = useState('');
  const [newType, setNewType] = useState('expense');
  const [newCategory, setNewCategory] = useState('operating_expense');
  const [newNormal, setNewNormal] = useState('debit');
  const [newOpeningBalance, setNewOpeningBalance] = useState('');

  const { data: accounts = [] } = useQuery<Account[]>({
    queryKey: ['accounts'],
    queryFn: () => cmd('get_all_accounts'),
  });
  const { data: allCustomers = [] } = useQuery<SubLedgerPart[]>({
    queryKey: ['all-customers'],
    queryFn: () => cmd('get_all_customers'),
  });
  const { data: allSuppliers = [] } = useQuery<SubLedgerPart[]>({
    queryKey: ['all-suppliers'],
    queryFn: () => cmd('get_all_suppliers'),
  });

  // Get defaults for date
  const now = new Date();
  const fromDefault = `${now.getFullYear()}-01-01`;
  const toDefault = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

  const { data: ledgerLines = [] } = useQuery<JournalLine[]>({
    queryKey: ['account-ledger-preview', selected?.id],
    queryFn: () => cmd('get_account_ledger_data', { accountId: selected!.id, fromDate: fromDefault, toDate: toDefault }),
    enabled: !!selected,
  });

  const { data: subledgerData = [] } = useQuery<SubLedgerPart[]>({
    queryKey: ['subledger', selected?.code],
    queryFn: () => {
      if (selected?.code === '1020') return cmd('get_all_customers');
      if (selected?.code === '2001') return cmd('get_all_suppliers');
      return [];
    },
    enabled: !!selected && (selected.code === '1020' || selected.code === '2001'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => cmd('delete_account_entry', { id }),
    onSuccess: () => { toast('Account deleted', 'success'); qc.invalidateQueries({ queryKey: ['accounts'] }); setSelected(null); },
    onError: (e: any) => toast(e.toString(), 'error'),
  });

  const createMutation = useMutation({
    mutationFn: (payload: any) => cmd('create_account_entry', { payload }),
    onSuccess: () => { 
      toast('Account created', 'success'); 
      qc.invalidateQueries({ queryKey: ['accounts'] }); 
      setShowAdd(false); 
      setNewCode(''); 
      setNewName(''); 
      setNewOpeningBalance('');
    },
    onError: (e: any) => toast(e.toString(), 'error'),
  });

  const filtered = accounts.filter(a => {
    const matchSearch = !search || a.code.includes(search) || a.name.toLowerCase().includes(search.toLowerCase());
    const matchType = filterType === 'all' || a.account_type === filterType;
    return matchSearch && matchType;
  });

  const matchingSuppliers = allSuppliers.filter(s => 
    search && s.name.toLowerCase().includes(search.toLowerCase()) && (filterType === 'all' || filterType === 'liability')
  );
  const matchingCustomers = allCustomers.filter(c => 
    search && c.name.toLowerCase().includes(search.toLowerCase()) && (filterType === 'all' || filterType === 'asset')
  );

  const grouped = TYPE_ORDER.map(type => ({
    type,
    label: TYPE_LABELS[type],
    accounts: filtered.filter(a => a.account_type === type),
  })).filter(g => g.accounts.length > 0);

  const debitTotal = ledgerLines.reduce((s, l) => s + l.debit_amount, 0);
  const creditTotal = ledgerLines.reduce((s, l) => s + l.credit_amount, 0);
  const netBalance = debitTotal - creditTotal;

  return (
    <div className="page">
      <div className="page-header">
        <h1 className="page-title flex items-center gap-2">
          <BookOpen className="w-5 h-5 text-brand-600" /> Chart of Accounts
        </h1>
        <button onClick={() => setShowAdd(true)} className="btn-primary">
          <Plus className="w-4 h-4" /> Add Account
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        {/* LEFT: Account List */}
        <div className="lg:col-span-2 space-y-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search code or name..." className="input pl-9" />
          </div>
          <div className="flex gap-1 flex-wrap">
            {['all', ...TYPE_ORDER].map(t => (
              <button key={t} onClick={() => setFilterType(t)} className={`px-3 py-1.5 rounded-lg text-xs font-medium capitalize transition-colors ${filterType === t ? 'bg-brand-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>{t === 'all' ? 'All' : TYPE_LABELS[t]}</button>
            ))}
          </div>
          <div className="space-y-4 max-h-[65vh] overflow-y-auto pr-1">
            {grouped.map(g => (
              <div key={g.type}>
                <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">{g.label} ({g.type.charAt(0).toUpperCase()}{g.type.slice(1).substring(0, 3)} — {g.accounts[0]?.code.charAt(0)}xxx)</p>
                <div className="space-y-1">
                  {g.accounts.map(a => (
                    <button key={a.id} onClick={() => setSelected(a)} className={`w-full text-left px-3 py-2.5 rounded-lg border transition-all flex items-center gap-3 ${selected?.id === a.id ? 'border-brand-500 bg-brand-50/50' : 'border-slate-100 hover:border-slate-200 hover:bg-slate-50'}`}>
                      <span className="font-mono text-xs font-bold text-slate-500 w-10">{a.code}</span>
                      <span className="text-sm font-medium text-slate-800 flex-1">{a.name}</span>
                      {a.is_system && <Lock className="w-3.5 h-3.5 text-slate-400" />}
                      <span className={`badge text-[10px] ${TYPE_COLORS[a.account_type]}`}>{a.account_type}</span>
                    </button>
                  ))}
                  {/* Show sub-ledgers in list if searching */}
                  {g.type === 'liability' && matchingSuppliers.map(s => (
                     <div key={`s-list-${s.id}`} className="ml-6 pl-4 border-l-2 border-slate-100 py-1">
                        <div className="flex items-center justify-between bg-white p-2 rounded border border-slate-100 shadow-sm">
                           <div className="flex items-center gap-2">
                              <div className="w-1 h-1 rounded-full bg-amber-400" />
                              <span className="text-xs font-bold text-slate-700">{s.name}</span>
                           </div>
                           <Link to={`/accounts/general-ledger?referenceId=${s.id}&referenceType=supplier`} className="text-[10px] text-brand-600 font-black hover:underline">View Ledger</Link>
                        </div>
                     </div>
                  ))}
                  {g.type === 'asset' && matchingCustomers.map(c => (
                     <div key={`c-list-${c.id}`} className="ml-6 pl-4 border-l-2 border-slate-100 py-1">
                        <div className="flex items-center justify-between bg-white p-2 rounded border border-slate-100 shadow-sm">
                           <div className="flex items-center gap-2">
                              <div className="w-1 h-1 rounded-full bg-blue-400" />
                              <span className="text-xs font-bold text-slate-700">{c.name}</span>
                           </div>
                           <Link to={`/accounts/general-ledger?referenceId=${c.id}&referenceType=customer`} className="text-[10px] text-brand-600 font-black hover:underline">View Ledger</Link>
                        </div>
                     </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* RIGHT: Detail */}
        <div className="lg:col-span-3">
          {!selected ? (
            <div className="card p-12 flex flex-col items-center justify-center text-center opacity-60">
              <BookOpen className="w-12 h-12 text-slate-300 mb-4" />
              <h3 className="text-lg font-medium text-slate-700">Select an Account</h3>
              <p className="text-slate-500 text-sm mt-1">Click on any account from the list to see details and transactions.</p>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="card p-5">
                <div className="flex justify-between items-start">
                  <div>
                    <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Account Detail</p>
                    <h2 className="text-xl font-bold text-slate-900 mt-1">[{selected.code}] {selected.name}</h2>
                    {selected.name_ur && <p className="text-sm text-slate-500 mt-0.5 font-urdu">{selected.name_ur}</p>}
                  </div>
                  <div className="flex gap-2">
                    <span className={`badge ${TYPE_COLORS[selected.account_type]}`}>{selected.account_type}</span>
                    <span className="badge bg-slate-100 text-slate-600">{selected.normal_balance}</span>
                  </div>
                </div>
                <div className="flex gap-2 mt-4">
                  <Link to={`/accounts/general-ledger?accountId=${selected.id}`} className="btn-secondary btn-sm"><Eye className="w-3.5 h-3.5" /> Full Ledger</Link>
                  {!selected.is_system && (
                    <button onClick={() => { if(confirm('Delete this account?')) deleteMutation.mutate(selected.id) }} className="btn-danger btn-sm"><Trash2 className="w-3.5 h-3.5" /> Delete</button>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div className="stat-card"><p className="stat-label">Total Debits</p><p className="stat-value text-sm text-blue-600">{fmt(debitTotal)}</p></div>
                <div className="stat-card"><p className="stat-label">Total Credits</p><p className="stat-value text-sm text-amber-600">{fmt(creditTotal)}</p></div>
                <div className="stat-card"><p className="stat-label">Net Balance</p><p className={`stat-value text-sm ${netBalance >= 0 ? 'text-green-600' : 'text-red-600'}`}>{fmt(netBalance)}</p></div>
              </div>

              <div className="card">
                <div className="px-4 py-3 border-b border-slate-100 flex justify-between items-center">
                  <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                    {selected.code === '1020' ? 'Customer Receivables (Sub-Ledger)' : 
                     selected.code === '2001' ? 'Supplier Payables (Sub-Ledger)' : 
                     'Recent Transactions (Last 10)'}
                  </p>
                  {(selected.code === '1020' || selected.code === '2001') && (
                    <span className="text-[10px] font-medium text-brand-600 bg-brand-50 px-2 py-0.5 rounded-full border border-brand-100">Live Breakdown</span>
                  )}
                </div>

                {/* Sub-Ledger View for AP/AR */}
                {(selected.code === '1020' || selected.code === '2001') ? (
                  <div className="max-h-[400px] overflow-y-auto">
                    <table className="table">
                      <thead>
                        <tr>
                          <th>{selected.code === '1020' ? 'Customer' : 'Supplier'}</th>
                          <th>Phone</th>
                          <th className="text-right">Balance Due</th>
                          <th className="w-10"></th>
                        </tr>
                      </thead>
                      <tbody>
                        {subledgerData.filter(i => i.outstanding_balance > 0).map(item => (
                          <tr key={item.id} className="hover:bg-slate-50 transition-colors">
                            <td>
                              <div className="font-medium text-slate-800">{item.name}</div>
                            </td>
                            <td className="text-slate-500 text-xs">{item.phone}</td>
                            <td className="text-right font-mono font-bold text-brand-600">
                              {fmt(item.outstanding_balance)}
                            </td>
                            <td>
                              <Link to={selected.code === '1020' ? `/ledger?id=${item.id}` : `/suppliers?id=${item.id}`} className="text-slate-400 hover:text-brand-600">
                                <Eye className="w-4 h-4" />
                              </Link>
                            </td>
                          </tr>
                        ))}
                        {subledgerData.filter(i => i.outstanding_balance > 0).length === 0 && (
                          <tr><td colSpan={4} className="text-center py-10 text-slate-400">All balances are clear!</td></tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <table className="table">
                    <thead><tr><th>Debit</th><th>Credit</th><th>Description</th></tr></thead>
                    <tbody>
                      {ledgerLines.slice(0, 10).map(l => (
                        <tr key={l.id}>
                          <td className={l.debit_amount > 0 ? 'font-medium text-blue-600' : ''}>{l.debit_amount > 0 ? fmt(l.debit_amount) : '—'}</td>
                          <td className={l.credit_amount > 0 ? 'font-medium text-amber-600' : ''}>{l.credit_amount > 0 ? fmt(l.credit_amount) : '—'}</td>
                          <td className="text-slate-600 text-sm">{l.description || '—'}</td>
                        </tr>
                      ))}
                      {ledgerLines.length === 0 && <tr><td colSpan={3} className="text-center py-6 text-slate-400">No transactions yet</td></tr>}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Add Account Dialog */}
      {showAdd && (
        <>
          <div className="overlay" onClick={() => setShowAdd(false)} />
          <div className="dialog max-w-lg">
            <h2 className="text-lg font-bold text-slate-900 mb-4">Add New Account</h2>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div><label className="label">Code</label><input value={newCode} onChange={e => setNewCode(e.target.value)} placeholder="e.g. 5017" className="input font-mono" /></div>
                <div><label className="label">Type</label>
                  <select value={newType} onChange={e => { setNewType(e.target.value); setNewNormal(e.target.value === 'revenue' || e.target.value === 'liability' || e.target.value === 'equity' ? 'credit' : 'debit'); }} className="input">
                    {TYPE_ORDER.map(t => <option key={t} value={t}>{TYPE_LABELS[t]}</option>)}
                  </select>
                </div>
              </div>
              <div><label className="label">Name (English)</label><input value={newName} onChange={e => setNewName(e.target.value)} placeholder="Account name" className="input" /></div>
              <div><label className="label">Name (Urdu — optional)</label><input value={newNameUr} onChange={e => setNewNameUr(e.target.value)} placeholder="اردو نام" className="input text-right" dir="rtl" /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="label">Category</label><input value={newCategory} onChange={e => setNewCategory(e.target.value)} placeholder="e.g. operating_expense" className="input" /></div>
                <div><label className="label">Normal Balance</label>
                  <select value={newNormal} onChange={e => setNewNormal(e.target.value)} className="input">
                    <option value="debit">Debit</option><option value="credit">Credit</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="label">Opening Balance (Optional)</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">{currency_symbol}</span>
                  <input 
                    type="number"
                    value={newOpeningBalance} 
                    onChange={e => setNewOpeningBalance(e.target.value)} 
                    placeholder="0.00" 
                    className="input pl-8" 
                  />
                </div>
                <p className="text-[10px] text-slate-400 mt-1 italic">* Offset against Owner Capital (3001)</p>
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-6">
              <button onClick={() => setShowAdd(false)} className="btn-secondary">Cancel</button>
              <button onClick={() => createMutation.mutate({ 
                code: newCode, 
                name: newName, 
                name_ur: newNameUr || null, 
                account_type: newType, 
                category: newCategory, 
                normal_balance: newNormal, 
                parent_id: null, 
                description: null,
                opening_balance: parseFloat(newOpeningBalance) || 0
              })} className="btn-primary" disabled={!newCode || !newName}>Create Account</button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
