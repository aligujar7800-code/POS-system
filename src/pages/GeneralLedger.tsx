import React, { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { cmd, formatCurrency } from '../lib/utils';
import { useSettingsStore } from '../stores/settingsStore';
import { useAuthStore } from '../stores/authStore';
import { useToast } from '../components/ui/Toaster';
import {
  History,
  Plus,
  Filter,
  Calendar,
  ArrowUpRight,
  ArrowDownRight,
  Wallet,
  Banknote,
  Scale,
  FileText,
  Trash2,
  CheckCircle2,
  X,
  PlusCircle,
  Search,
  User,
  Users,
  Package,
  Printer
} from 'lucide-react';
import { format } from 'date-fns';
import { cn } from '../lib/utils';

// --- Types ---
interface GlobalLedgerEntry {
  id: number; entry_number: string; entry_date: string; description: string;
  reference_type: string | null; reference_id: number | null;
  entity_name: string | null; debit: number; credit: number;
  account_name: string; account_code: string;
}
interface FinancialSummary {
  total_receivable: number; total_payable: number; cash_balance: number;
  bank_balance: number; stock_value: number; net_position: number;
}
interface Account { id: number; code: string; name: string; }
interface Entity { id: number; name: string; phone: string; }
interface JournalLineInput { key: number; account_id: number; debit_amount: string; credit_amount: string; note: string; }

let lineKey = 0;
const emptyLine = (): JournalLineInput => ({ key: ++lineKey, account_id: 0, debit_amount: '', credit_amount: '', note: '' });

export default function GeneralLedger() {
  const { currency_symbol, shop_name, shop_address, shop_phone } = useSettingsStore();
  const { user } = useAuthStore();
  const { toast } = useToast();
  const qc = useQueryClient();
  const fmt = (n: number) => formatCurrency(n, currency_symbol);

  const [searchParams, setSearchParams] = useSearchParams();
  const urlAccountId = searchParams.get('accountId');

  // --- States ---
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [accountId, setAccountId] = useState<number | null>(urlAccountId ? Number(urlAccountId) : null);
  const [entityType, setEntityType] = useState<'customer' | 'supplier' | null>(null);
  const [entityId, setEntityId] = useState<number | null>(null);
  const [search, setSearch] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);

  // Form State for Manual Entry
  const [entryDate, setEntryDate] = useState(new Date().toISOString().slice(0, 10));
  const [entryDesc, setEntryDesc] = useState('');
  const [modalEntityType, setModalEntityType] = useState<'customer' | 'supplier' | null>(null);
  const [modalEntityId, setModalEntityId] = useState<number | null>(null);
  const [lines, setLines] = useState<JournalLineInput[]>([emptyLine(), emptyLine()]);

  // Smart Template: Auto-fill accounts when party is selected
  const applyTemplate = (type: 'supplier' | 'customer') => {
    const cashAcct = accounts.find(a => a.code === '1001');
    const payableAcct = accounts.find(a => a.code === '2001');
    const receivableAcct = accounts.find(a => a.code === '1020');

    if (type === 'supplier' && payableAcct && cashAcct) {
      setLines([
        { ...emptyLine(), account_id: payableAcct.id, note: 'Payment to Supplier' },
        { ...emptyLine(), account_id: cashAcct.id, note: 'Paid from Cash' }
      ]);
      setEntryDesc(`Payment to ${suppliers.find(s => s.id === modalEntityId)?.name || 'Supplier'}`);
    } else if (type === 'customer' && receivableAcct && cashAcct) {
      setLines([
        { ...emptyLine(), account_id: cashAcct.id, note: 'Received from Customer' },
        { ...emptyLine(), account_id: receivableAcct.id, note: 'Receipt from Customer' }
      ]);
      setEntryDesc(`Receipt from ${customers.find(c => c.id === modalEntityId)?.name || 'Customer'}`);
    }
  };

  // --- Queries ---
  const { data: summary } = useQuery<FinancialSummary>({
    queryKey: ['financial-summary'], queryFn: () => cmd('get_financial_summary'),
  });
  const { data: accounts = [] } = useQuery<Account[]>({ queryKey: ['accounts'], queryFn: () => cmd('get_all_accounts') });
  const { data: suppliers = [] } = useQuery<any[]>({ queryKey: ['suppliers'], queryFn: () => cmd('get_all_suppliers') });
  const { data: customers = [] } = useQuery<any[]>({ queryKey: ['customers'], queryFn: () => cmd('get_all_customers') });

  // Auto-Repair Health Check on mount
  React.useEffect(() => {
    cmd('repair_accounting_data').then((count: any) => {
      if (count > 0) {
        console.log(`Repaired ${count} accounting links.`);
        qc.invalidateQueries({ queryKey: ['global-ledger'] });
        qc.invalidateQueries({ queryKey: ['filtered-balance'] });
      }
    });
  }, []);

  const { data: entries = [], isLoading } = useQuery<GlobalLedgerEntry[]>({
    queryKey: ['global-ledger', dateFrom, dateTo, accountId, entityId, entityType],
    queryFn: () => cmd('get_global_ledger', {
      from: dateFrom || null,
      to: dateTo || null,
      accountId: accountId,
      referenceId: entityId,
      referenceType: entityType
    }),
  });
  const { data: liveBalance = 0 } = useQuery<number>({
    queryKey: ['live-balance', accountId, entityId, entityType],
    queryFn: () => cmd('get_account_balance', {
      accountId: accountId,
      referenceId: entityId,
      referenceType: entityType
    }),
    enabled: accountId !== null || entityId !== null
  });

  const postMutation = useMutation({
    mutationFn: (payload: any) => cmd('create_manual_journal', payload),
    onSuccess: () => {
      toast(`Journal entry posted successfully!`, 'success');
      setShowAddModal(false); setEntryDesc(''); setLines([emptyLine(), emptyLine()]);
      setModalEntityType(null); setModalEntityId(null);
      qc.invalidateQueries({ queryKey: ['global-ledger'] });
      qc.invalidateQueries({ queryKey: ['financial-summary'] });
    },
    onError: (e: any) => toast(e.toString(), 'error'),
  });

  // --- Helpers ---
  const totalDebits = lines.reduce((s: number, l: JournalLineInput) => s + (parseFloat(l.debit_amount) || 0), 0);
  const totalCredits = lines.reduce((s: number, l: JournalLineInput) => s + (parseFloat(l.credit_amount) || 0), 0);
  const diff = Math.abs(totalDebits - totalCredits);
  const isBalanced = totalDebits > 0 && diff < 0.01;

  const updateLine = (key: number, field: keyof JournalLineInput, value: any) => {
    setLines((prev: JournalLineInput[]) => prev.map((l: JournalLineInput) => {
      if (l.key !== key) return l;
      const updated = { ...l, [field]: value };
      if (field === 'debit_amount' && value) updated.credit_amount = '';
      if (field === 'credit_amount' && value) updated.debit_amount = '';
      return updated;
    }));
  };

  const handlePost = () => {
    if (!entryDesc.trim()) { toast('Description is required', 'error'); return; }
    if (!isBalanced) { toast('Debits and Credits must be equal', 'error'); return; }
    const validLines = lines.filter((l: JournalLineInput) => l.account_id > 0 && (parseFloat(l.debit_amount) > 0 || parseFloat(l.credit_amount) > 0));
    const payload = {
      entry: {
        entry_date: entryDate + ' 00:00:00',
        description: entryDesc.trim(),
        reference_type: modalEntityType || 'manual',
        reference_id: modalEntityId,
        lines: validLines.map((l: JournalLineInput) => ({
          account_id: l.account_id,
          debit_amount: parseFloat(l.debit_amount) || 0,
          credit_amount: parseFloat(l.credit_amount) || 0,
          description: l.note || null,
        })),
      },
      createdBy: user?.id ?? null,
    };
    postMutation.mutate(payload);
  };

  const filteredEntries = entries.filter(e => {
    if (!search) return true;
    const s = search.toLowerCase();
    return e.description.toLowerCase().includes(s) || (e.entity_name?.toLowerCase().includes(s)) || e.entry_number.toLowerCase().includes(s);
  });

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title flex items-center gap-2">
            <History className="w-5 h-5 text-brand-600" /> General Ledger
          </h1>
          <p className="text-sm text-slate-500 mt-1">Unified business timeline and professional accounting.</p>
        </div>
        <div className="flex gap-2 no-print">
          <button onClick={() => window.print()} className="btn-secondary">
            <Printer className="w-4 h-4" /> Print Ledger
          </button>
          <button onClick={() => setShowAddModal(true)} className="btn-primary">
            <PlusCircle className="w-4 h-4" /> New Entry
          </button>
        </div>
      </div>

      {/* Print Header (Visible only when printing) - Professional Letterhead Look */}
      <div className="hidden print:block mb-8 border-b-4 border-slate-900 pb-6">
        <div className="flex justify-between items-start">
          <div>
            <h1 className="text-4xl font-black text-slate-900 mb-1">{shop_name}</h1>
            <p className="text-sm text-slate-600 font-bold uppercase tracking-widest">{shop_address}</p>
            <p className="text-sm text-slate-600 font-bold uppercase tracking-widest">Contact: {shop_phone}</p>
          </div>
          <div className="text-right border-l-2 border-slate-200 pl-6">
            <h2 className="text-2xl font-black text-slate-900 uppercase tracking-tighter">Account Statement</h2>
            <p className="text-xs text-slate-500 font-bold mt-1">Generated: {format(new Date(), 'dd MMM yyyy HH:mm')}</p>
          </div>
        </div>

        <div className="mt-8 grid grid-cols-2 gap-8">
          <div className="bg-slate-50 p-4 rounded-lg border border-slate-200">
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Statement For</p>
            {accountId || entityId ? (
              <div>
                <p className="text-lg font-black text-slate-900">
                  {accountId ? accounts.find(a => a.id === accountId)?.name :
                    entityType === 'supplier' ? suppliers.find(s => s.id === entityId)?.name :
                      customers.find(c => c.id === entityId)?.name}
                </p>
                <p className="text-xs text-slate-500 font-bold mt-1">
                  {accountId ? `Account Code: ${accounts.find(a => a.id === accountId)?.code}` :
                    `Type: ${entityType?.toUpperCase()}`}
                </p>
              </div>
            ) : (
              <p className="text-lg font-black text-slate-900">Consolidated General Ledger</p>
            )}
          </div>
          <div className="bg-slate-900 p-4 rounded-lg flex flex-col justify-center">
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Closing Balance</p>
            <h3 className="text-3xl font-black text-white">{fmt(Math.abs(liveBalance))}</h3>
            <p className="text-[10px] font-black text-slate-400 uppercase mt-1">
              {liveBalance >= 0 ? 'Debit Balance (DR)' : 'Credit Balance (CR)'}
            </p>
          </div>
        </div>
      </div>

      {/* Dynamic Dashboard Cards */}
      {(accountId !== null || entityId !== null) ? (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mb-6 no-print">
          <div className="card md:col-span-2 p-6 bg-brand-600 border-brand-500 shadow-lg relative overflow-hidden">
            <div className="absolute top-0 right-0 p-4 opacity-10">
              <Scale className="w-24 h-24 text-white" />
            </div>
            <p className="text-brand-100 text-xs font-black uppercase tracking-widest mb-2">
              {entityType === 'supplier' ? (liveBalance > 0 ? "Advance Payment" : "Payment Due") :
                entityType === 'customer' ? (liveBalance > 0 ? "Amount Due" : "Advance / Credit") :
                  "Account Balance"}
            </p>
            <h2 className="text-4xl font-black text-white">
              {fmt(Math.abs(liveBalance))}
            </h2>
            <div className="flex items-center gap-2 mt-2">
              <span className={cn(
                "px-2 py-0.5 rounded text-[10px] font-black uppercase",
                ((entityType === 'supplier' && liveBalance > 0) || (entityType === 'customer' && liveBalance < 0))
                  ? "bg-emerald-400 text-emerald-950" : "bg-amber-400 text-amber-950"
              )}>
                {entityType === 'supplier' ? (liveBalance > 0 ? "ADVANCE (DR)" : "PAYABLE (CR)") :
                  entityType === 'customer' ? (liveBalance > 0 ? "RECEIVABLE (DR)" : "ADVANCE (CR)") :
                    (liveBalance >= 0 ? "DR BALANCE" : "CR BALANCE")}
              </span>
              <p className="text-brand-200 text-[10px] font-bold uppercase truncate max-w-[150px]">
                {accountId ? accounts.find(a => a.id === accountId)?.name :
                  entityType === 'supplier' ? suppliers.find(s => s.id === entityId)?.name :
                    customers.find(c => c.id === entityId)?.name}
              </p>
            </div>
          </div>
        </div>
      ) : summary && (
        <div className="grid grid-cols-1 md:grid-cols-3 xl:grid-cols-6 gap-3 mb-6 no-print">
          <div className="card p-3 border-l-4 border-l-blue-500 shadow-sm">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1 flex justify-between">
              Receivables <ArrowDownRight className="w-3 h-3 text-blue-400" />
            </p>
            <p className="text-lg font-black text-blue-700">{fmt(summary?.total_receivable ?? 0)}</p>
          </div>
          <div className="card p-3 border-l-4 border-l-amber-500 shadow-sm">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1 flex justify-between">
              Payables <ArrowUpRight className="w-3 h-3 text-amber-400" />
            </p>
            <p className="text-lg font-black text-amber-700">{fmt(summary?.total_payable ?? 0)}</p>
          </div>
          <div className="card p-3 border-l-4 border-l-emerald-500 shadow-sm">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1 flex justify-between">
              Cash <Wallet className="w-3 h-3 text-emerald-400" />
            </p>
            <p className="text-lg font-black text-emerald-700">{fmt(summary?.cash_balance ?? 0)}</p>
          </div>
          <div className="card p-3 border-l-4 border-l-indigo-500 shadow-sm">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1 flex justify-between">
              Bank <Banknote className="w-3 h-3 text-indigo-400" />
            </p>
            <p className="text-lg font-black text-indigo-700">{fmt(summary?.bank_balance ?? 0)}</p>
          </div>
          <div className="card p-3 border-l-4 border-l-brand-500 shadow-sm">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1 flex justify-between">
              Stock Value <Package className="w-3 h-3 text-brand-400" />
            </p>
            <p className="text-lg font-black text-brand-700">{fmt(summary?.stock_value ?? 0)}</p>
          </div>
          <div className="card p-3 bg-brand-600 border-brand-600 shadow-md">
            <p className="text-[10px] font-bold text-brand-100 uppercase tracking-widest mb-1 flex justify-between">
              Net Value <Scale className="w-3 h-3 text-white" />
            </p>
            <p className="text-lg font-black text-white">
              {fmt(summary?.net_position ?? 0)}
            </p>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="bg-white p-3 rounded-xl border border-slate-200 flex items-center gap-3 mb-4 flex-wrap no-print">
        <div className="relative flex-1 min-w-[300px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input type="text" placeholder="Search Entity, Description, or Invoice..." className="input-sm pl-9 w-full" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <select
          className="input-sm flex-1 min-w-[250px] text-xs font-bold"
          value={accountId ? `acc:${accountId}` : entityId ? `${entityType}:${entityId}` : ''}
          onChange={(e) => {
            const val = e.target.value;
            if (!val) {
              setAccountId(null); setEntityType(null); setEntityId(null);
              searchParams.delete('accountId'); setSearchParams(searchParams);
              return;
            }
            const [type, id] = val.split(':');
            if (type === 'acc') {
              setAccountId(Number(id)); setEntityType(null); setEntityId(null);
              setSearchParams({ accountId: id });
            } else {
              setAccountId(null); setEntityType(type as any); setEntityId(Number(id));
              searchParams.delete('accountId'); setSearchParams(searchParams);
            }
          }}>
          <option value="">All Accounts & Entities</option>
          <optgroup label="Main Accounts">
            {accounts.map(a => <option key={`a-${a.id}`} value={`acc:${a.id}`}>[{a.code}] {a.name}</option>)}
          </optgroup>
          <optgroup label="Suppliers (Payables)">
            {suppliers.map(s => <option key={`s-${s.id}`} value={`supplier:${s.id}`}>{s.name}</option>)}
          </optgroup>
          <optgroup label="Customers (Receivables)">
            {customers.map(c => <option key={`c-${c.id}`} value={`customer:${c.id}`}>{c.name}</option>)}
          </optgroup>
        </select>
        <div className="flex items-center gap-2">
          <Calendar className="w-4 h-4 text-slate-400" />
          <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="input-sm text-xs" />
          <span className="text-slate-400">—</span>
          <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="input-sm text-xs" />
        </div>
      </div>

      {/* Timeline Table */}
      <div className="card shadow-md">
        <table className="table">
          <thead>
            <tr className="bg-slate-50/80 text-[11px] uppercase tracking-wider font-bold">
              <th className="w-24">Date</th>
              <th className="w-32">Entry</th>
              <th>Description / Account</th>
              <th className="text-right">Debit (+)</th>
              <th className="text-right">Credit (-)</th>
            </tr>
          </thead>
          <tbody className="text-sm">
            {isLoading ? (
              <tr><td colSpan={5} className="text-center py-20 text-slate-400">Loading General Ledger...</td></tr>
            ) : filteredEntries.length === 0 ? (
              <tr><td colSpan={5} className="text-center py-20 text-slate-400 font-medium">No ledger records found.</td></tr>
            ) : (
              filteredEntries.map((e) => (
                <tr key={`${e.id}-${e.account_code}`} className="hover:bg-slate-50 transition-colors border-b border-slate-50 last:border-0 group">
                  <td className="py-3 text-slate-400 font-mono text-[10px]">
                    {format(new Date(e.entry_date), 'dd/MM/yyyy')}
                  </td>
                  <td className="py-3">
                    <span className="text-[10px] bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded font-mono font-bold group-hover:bg-brand-100 group-hover:text-brand-700 transition-colors">
                      {e.entry_number}
                    </span>
                  </td>
                  <td className="py-3">
                    <div className="font-bold text-slate-800 flex items-center gap-2">
                      {e.description}
                      {e.entity_name && <span className="text-[10px] bg-brand-50 text-brand-700 border border-brand-100 px-1.5 py-0.5 rounded-full font-black uppercase tracking-tighter">{e.entity_name}</span>}
                    </div>
                    <div className="text-[11px] text-slate-500 mt-1 flex items-center gap-1 opacity-70">
                      <span className="font-mono bg-slate-100 px-1 rounded">{e.account_code}</span> {e.account_name}
                    </div>
                  </td>
                  <td className={cn("py-3 text-right font-mono font-bold", e.debit > 0 ? "text-blue-600" : "text-slate-200")}>
                    {e.debit > 0 ? fmt(e.debit) : '—'}
                  </td>
                  <td className={cn("py-3 text-right font-mono font-bold", e.credit > 0 ? "text-amber-600" : "text-slate-200")}>
                    {e.credit > 0 ? fmt(e.credit) : '—'}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* New Entry Modal (The integrated Manual Journal) */}
      {showAddModal && (
        <>
          <div className="overlay" onClick={() => setShowAddModal(false)} />
          <div className="dialog max-w-4xl max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-black text-slate-800 flex items-center gap-2">
                <FileText className="w-5 h-5 text-brand-600" /> New Ledger Entry
              </h2>
              <button onClick={() => setShowAddModal(false)} className="text-slate-400 hover:text-slate-600"><X className="w-6 h-6" /></button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
              <div className="md:col-span-1">
                <label className="label uppercase text-[10px] font-black text-slate-400">Entry Date</label>
                <input type="date" value={entryDate} onChange={e => setEntryDate(e.target.value)} className="input font-bold" />
              </div>
              <div className="md:col-span-2">
                <label className="label uppercase text-[10px] font-black text-slate-400">Entry Note / Description *</label>
                <input value={entryDesc} onChange={e => setEntryDesc(e.target.value)} placeholder="e.g. Owner Investment, Office Rent" className="input font-bold" />
              </div>
            </div>

            <div className="bg-brand-50/50 p-4 rounded-xl border border-brand-100 flex items-center gap-4 mb-6">
              <div className="flex-shrink-0">
                <div className="w-10 h-10 rounded-full bg-brand-100 flex items-center justify-center">
                  <Users className="w-5 h-5 text-brand-600" />
                </div>
              </div>
              <div className="flex-1 grid grid-cols-2 gap-4">
                <div>
                  <label className="label uppercase text-[9px] font-black text-brand-600">Link to Party (Optional)</label>
                  <div className="flex gap-2">
                    <button
                      onClick={() => { setModalEntityType(null); setModalEntityId(null); }}
                      className={cn("px-3 py-1 text-[10px] font-black rounded-lg transition-all", !modalEntityType ? "bg-brand-600 text-white" : "bg-white text-brand-600 border border-brand-200")}
                    >
                      NONE
                    </button>
                    <button
                      onClick={() => setModalEntityType('supplier')}
                      className={cn("px-3 py-1 text-[10px] font-black rounded-lg transition-all", modalEntityType === 'supplier' ? "bg-brand-600 text-white" : "bg-white text-brand-600 border border-brand-200")}
                    >
                      SUPPLIER
                    </button>
                    <button
                      onClick={() => setModalEntityType('customer')}
                      className={cn("px-3 py-1 text-[10px] font-black rounded-lg transition-all", modalEntityType === 'customer' ? "bg-brand-600 text-white" : "bg-white text-brand-600 border border-brand-200")}
                    >
                      CUSTOMER
                    </button>
                  </div>
                </div>
                {modalEntityType && (
                  <div className="animate-in fade-in slide-in-from-left-2 duration-200">
                    <label className="label uppercase text-[9px] font-black text-brand-600">
                      {modalEntityType === 'supplier' ? 'Select Supplier' : 'Select Customer'}
                    </label>
                    <select
                      value={modalEntityId || ''}
                      onChange={e => setModalEntityId(Number(e.target.value))}
                      className="input-sm font-bold text-xs bg-white border-brand-200 focus:border-brand-500"
                    >
                      <option value="">Choose...</option>
                      {(modalEntityType === 'supplier' ? suppliers : customers).map((it: any) => (
                        <option key={it.id} value={it.id}>{it.name} ({it.phone})</option>
                      ))}
                    </select>
                    <button
                      onClick={() => applyTemplate(modalEntityType!)}
                      className="mt-2 text-[10px] font-black text-brand-600 hover:text-brand-700 bg-brand-50 px-2 py-1 rounded-lg border border-brand-100 flex items-center gap-1"
                    >
                      <PlusCircle className="w-3 h-3" /> Auto-Fill Accounts
                    </button>
                  </div>
                )}
              </div>
            </div>

            <div className="space-y-3 mb-6">
              <div className="flex justify-between items-center bg-slate-100 px-4 py-2 rounded-lg">
                <span className="text-xs font-black uppercase text-slate-500 tracking-wider">Transaction Details (Double Entry)</span>
                <button onClick={() => setLines((prev: JournalLineInput[]) => [...prev, emptyLine()])} className="btn-secondary btn-sm text-[10px] font-black">
                  <Plus className="w-3 h-3" /> Add Line
                </button>
              </div>

              <div className="border border-slate-200 rounded-xl overflow-hidden">
                <table className="w-full">
                  <thead className="bg-slate-50 border-b border-slate-200">
                    <tr className="text-[10px] uppercase font-black text-slate-400 tracking-wider">
                      <th className="px-3 py-2 text-left">Account</th>
                      <th className="px-3 py-2 text-right">Debit (+)</th>
                      <th className="px-3 py-2 text-right">Credit (-)</th>
                      <th className="px-3 py-2 text-left w-32">Note</th>
                      <th className="w-10"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {lines.map((line: JournalLineInput) => (
                      <tr key={line.key} className="border-b border-slate-100 last:border-0 group">
                        <td className="p-2">
                          <select value={line.account_id} onChange={e => updateLine(line.key, 'account_id', Number(e.target.value))} className="input-sm text-[11px] font-bold h-9">
                            <option value={0}>Select account...</option>
                            {accounts.map(a => <option key={a.id} value={a.id}>[{a.code}] {a.name}</option>)}
                          </select>
                        </td>
                        <td className="p-2">
                          <input type="number" value={line.debit_amount} onChange={e => updateLine(line.key, 'debit_amount', e.target.value)} placeholder="0" className="input-sm text-right h-9 font-mono font-bold" />
                        </td>
                        <td className="p-2">
                          <input type="number" value={line.credit_amount} onChange={e => updateLine(line.key, 'credit_amount', e.target.value)} placeholder="0" className="input-sm text-right h-9 font-mono font-bold" />
                        </td>
                        <td className="p-2">
                          <input value={line.note} onChange={e => updateLine(line.key, 'note', e.target.value)} placeholder="Note" className="input-sm h-9 text-[11px]" />
                        </td>
                        <td className="p-2 text-center">
                          <button onClick={() => setLines((prev: JournalLineInput[]) => prev.filter((l: JournalLineInput) => l.key !== line.key))} className="text-slate-300 hover:text-red-500 transition-colors" disabled={lines.length <= 2}><Trash2 className="w-4 h-4" /></button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className={cn("bg-slate-50 border-t-2", isBalanced ? "border-green-200" : "border-red-100")}>
                    <tr>
                      <td className="px-3 py-3 font-black text-[11px]">
                        {isBalanced ?
                          <span className="flex items-center gap-1 text-green-600"><CheckCircle2 className="w-4 h-4" /> BALANCED</span> :
                          <span className={cn(diff > 0 ? "text-red-600" : "text-slate-400")}>DIFF: {fmt(diff)}</span>
                        }
                      </td>
                      <td className="px-3 py-3 text-right font-mono font-black text-blue-700">{fmt(totalDebits)}</td>
                      <td className="px-3 py-3 text-right font-mono font-black text-amber-700">{fmt(totalCredits)}</td>
                      <td colSpan={2}></td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>

            <div className="flex justify-end gap-3">
              <button onClick={() => setShowAddModal(false)} className="btn-secondary px-8 font-black uppercase text-xs">Discard</button>
              <button onClick={handlePost} disabled={!isBalanced || postMutation.isPending || !entryDesc.trim()} className="btn-primary px-10 font-black uppercase text-xs">
                {postMutation.isPending ? 'Posting...' : 'Save & Post Ledger Entry'}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
