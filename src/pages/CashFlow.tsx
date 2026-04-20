import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { cmd, formatCurrency } from '../lib/utils';
import { useSettingsStore } from '../stores/settingsStore';
import { useToast } from '../components/ui/Toaster';
import { Search, DollarSign, ArrowUpRight, ArrowDownRight, FileText, Plus, X, User } from 'lucide-react';
import { format } from 'date-fns';
import { cn } from '../lib/utils';

interface CashBookEntry {
  id: number;
  entry_type: 'income' | 'expense' | 'transfer';
  category: string;
  amount: number;
  payment_method: string;
  reference_id: number | null;
  description: string | null;
  entry_date: string;
  created_by: number | null;
  username: string | null;
  running_balance: number;
}

export default function CashFlowPage() {
  const { t } = useTranslation();
  const { currency_symbol } = useSettingsStore();
  const { toast } = useToast();
  const qc = useQueryClient();
  const fmt = (n: number) => formatCurrency(Math.abs(n), currency_symbol);

  const [search, setSearch] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');

  // Form State
  const [showEntryModal, setShowEntryModal] = useState<'income' | 'expense' | null>(null);
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [description, setDescription] = useState('');
  const [selectedCustomer, setSelectedCustomer] = useState<{id: number, name: string} | null>(null);
  const [customerSearch, setCustomerSearch] = useState('');
  const [selectedSupplier, setSelectedSupplier] = useState<{id: number, name: string} | null>(null);
  const [supplierSearch, setSupplierSearch] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { data: entries = [], isLoading } = useQuery<CashBookEntry[]>({
    queryKey: ['financial-ledger', fromDate, toDate],
    queryFn: () => cmd('get_financial_ledger', {
      from: fromDate || null,
      to: toDate || null
    }),
  });

  const { data: customers = [] } = useQuery<any[]>({
    queryKey: ['customers-search', customerSearch],
    queryFn: () => cmd('get_all_customers', { search: customerSearch }),
    enabled: showEntryModal === 'income' && customerSearch.length >= 2,
  });

  const { data: suppliers = [] } = useQuery<any[]>({
    queryKey: ['suppliers-search', supplierSearch],
    queryFn: () => cmd('get_all_suppliers', { search: supplierSearch }),
    enabled: showEntryModal === 'expense' && supplierSearch.length >= 2,
  });

  const filtered = entries.filter((e) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      (e.description && e.description.toLowerCase().includes(q)) ||
      (e.category && e.category.toLowerCase().includes(q)) ||
      (e.payment_method && e.payment_method.toLowerCase().includes(q)) ||
      (e.username && e.username.toLowerCase().includes(q))
    );
  });

  const totalIncome = entries.filter(e => e.entry_type === 'income').reduce((acc, e) => acc + e.amount, 0);
  const totalExpense = entries.filter(e => e.entry_type === 'expense').reduce((acc, e) => acc + e.amount, 0);
  const currentBalance = entries.length > 0 ? entries[entries.length - 1].running_balance : 0;

  return (
    <>
      <div className="page">
      <div className="page-header flex justify-between items-start">
        <div>
          <h1 className="page-title flex items-center gap-2">
            <DollarSign className="w-5 h-5 text-brand-600" />
            Cash Flow & Ledger
          </h1>
          <p className="text-sm text-slate-500 mt-1">Record miscellaneous income and expenses.</p>
        </div>
        <div className="flex gap-3">
          <button 
            onClick={() => { setShowEntryModal('income'); setAmount(''); setCategory(''); setDescription(''); }}
            className="btn-primary bg-green-600 hover:bg-green-700 border-green-600"
          >
            <Plus className="w-4 h-4 mr-2" /> Record Receipt
          </button>
          <button 
            onClick={() => { setShowEntryModal('expense'); setAmount(''); setCategory(''); setDescription(''); setSelectedSupplier(null); setSupplierSearch(''); }}
            className="btn-primary bg-red-600 hover:bg-red-700 border-red-600"
          >
            <Plus className="w-4 h-4 mr-2" /> Record Payment
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="stat-card border-l-4 border-l-green-400">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-green-50 flex items-center justify-center">
              <ArrowDownRight className="w-4 h-4 text-green-600" />
            </div>
            <div>
              <p className="stat-value text-green-600">{fmt(totalIncome)}</p>
              <p className="stat-label">Total Income (Period)</p>
            </div>
          </div>
        </div>
        <div className="stat-card border-l-4 border-l-red-400">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-red-50 flex items-center justify-center">
              <ArrowUpRight className="w-4 h-4 text-red-500" />
            </div>
            <div>
              <p className="stat-value text-red-600">{fmt(totalExpense)}</p>
              <p className="stat-label">Total Expenses (Period)</p>
            </div>
          </div>
        </div>
        <div className="stat-card border-l-4 border-l-brand-400">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-brand-50 flex items-center justify-center">
              <DollarSign className="w-4 h-4 text-brand-600" />
            </div>
            <div>
              <p className={cn("stat-value", currentBalance < 0 ? "text-red-600" : "text-brand-700")}>
                {formatCurrency(currentBalance, currency_symbol)}
              </p>
              <p className="stat-label">Closing Balance</p>
            </div>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <div className="relative flex-1 min-w-[250px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            placeholder="Search by category, description..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="input pl-9 w-full"
          />
        </div>
        <div className="flex items-center gap-2">
          <label className="text-sm font-medium text-slate-600">From:</label>
          <input 
            type="date" 
            value={fromDate}
            onChange={(e) => setFromDate(e.target.value)}
            className="input"
          />
        </div>
        <div className="flex items-center gap-2">
          <label className="text-sm font-medium text-slate-600">To:</label>
          <input 
            type="date" 
            value={toDate}
            onChange={(e) => setToDate(e.target.value)}
            className="input"
          />
        </div>
      </div>

      {/* Data Table */}
      <div className="table-container flex-1 mb-8 shadow-sm">
        <table className="table font-mono text-sm w-full">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200">
              <th className="py-3 px-4 font-semibold text-slate-700 text-left">Date & Time</th>
              <th className="py-3 px-4 font-semibold text-slate-700 text-left">Category / Description</th>
              <th className="py-3 px-4 font-semibold text-slate-700 text-center">Account</th>
              <th className="py-3 px-4 font-semibold text-green-700 text-right">In (+)</th>
              <th className="py-3 px-4 font-semibold text-red-700 text-right">Out (-)</th>
              <th className="py-3 px-4 font-semibold text-brand-700 text-right">Balance</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan={6} className="text-center py-8 text-slate-400">Loading ledger...</td>
              </tr>
            ) : entries.length === 0 ? (
              <tr>
                <td colSpan={6} className="py-12 text-center text-slate-500">
                  <FileText className="w-12 h-12 mx-auto text-slate-300 mb-2" />
                  No transactions found for the selected period.
                </td>
              </tr>
            ) : (
              filtered.map((e) => (
                <tr key={e.id} className="border-b border-slate-100 hover:bg-slate-50/50 transition-colors">
                  <td className="py-3 px-4 text-slate-600 font-sans whitespace-nowrap">
                    {format(new Date(e.entry_date), 'dd MMM yyyy, hh:mm a')}
                    {e.username && <div className="text-[10px] text-slate-400">by {e.username}</div>}
                  </td>
                  <td className="py-3 px-4 text-slate-800 font-sans">
                    <div className="font-medium">{e.category}</div>
                    {e.description && <div className="text-xs text-slate-500">{e.description}</div>}
                  </td>
                  <td className="py-3 px-4 text-center">
                    <span className={cn(
                      "px-2 py-1 rounded text-xs font-bold uppercase",
                      e.payment_method.toLowerCase().includes('bank') ? "bg-blue-100 text-blue-700" : "bg-brand-100 text-brand-700"
                    )}>
                      {e.payment_method}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-right text-green-600 font-semibold tracking-tight">
                    {e.entry_type === 'income' ? fmt(e.amount) : '-'}
                  </td>
                  <td className="py-3 px-4 text-right text-red-500 tracking-tight">
                    {e.entry_type === 'expense' ? fmt(e.amount) : '-'}
                  </td>
                  <td className={cn(
                    "py-3 px-4 text-right font-bold tracking-tight",
                    e.running_balance < 0 ? "text-red-700" : "text-brand-700"
                  )}>
                    {formatCurrency(e.running_balance, currency_symbol)}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>

    {/* Entry Modal */}
    {showEntryModal && (
      <>
        <div className="overlay" onClick={() => setShowEntryModal(null)} />
        <div className="dialog w-96">
          <div className="flex justify-between items-center mb-4">
            <h2 className={cn("text-lg font-bold", showEntryModal === 'income' ? "text-green-700" : "text-red-700")}>
              {showEntryModal === 'income' ? 'Record Cash Receipt' : 'Record Cash Payment'}
            </h2>
            <button onClick={() => setShowEntryModal(null)} className="text-slate-400 hover:text-slate-600"><X className="w-5 h-5" /></button>
          </div>

          <div className="space-y-4">
            <div>
              <label className="label">Amount ({currency_symbol}) *</label>
              <input 
                type="number" 
                value={amount}
                onChange={e => setAmount(e.target.value)}
                className="input text-lg font-bold"
                placeholder="0.00"
                autoFocus
              />
            </div>

            {showEntryModal === 'income' && !selectedCustomer && (
              <div className="relative">
                <label className="label">Link Customer (for Debt Recovery)</label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input
                    type="text"
                    value={customerSearch}
                    onChange={(e) => setCustomerSearch(e.target.value)}
                    placeholder="Search customer name or phone..."
                    className="input pl-9 text-sm"
                  />
                </div>
                {customerSearch.length >= 2 && customers.length > 0 && (
                  <div className="absolute top-full left-0 right-0 z-[60] bg-white border border-slate-200 rounded-lg shadow-xl mt-1 max-h-40 overflow-y-auto">
                    {customers.map((c) => (
                      <button
                        key={c.id}
                        onClick={() => {
                          setSelectedCustomer({ id: c.id, name: c.name });
                          setCustomerSearch('');
                          setCategory('Old Debt Recovery');
                        }}
                        className="w-full text-left px-3 py-2 hover:bg-slate-50 text-sm border-b border-slate-50 last:border-0"
                      >
                        <p className="font-medium text-slate-800">{c.name}</p>
                        <p className="text-xs text-slate-400">{c.phone}</p>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {selectedCustomer && (
              <div className="bg-brand-50 border border-brand-100 rounded-lg p-3 flex justify-between items-center">
                <div>
                  <p className="text-xs text-brand-600 font-semibold uppercase tracking-wider">Customer Linked</p>
                  <p className="text-sm font-bold text-slate-800">{selectedCustomer.name}</p>
                </div>
                <button onClick={() => setSelectedCustomer(null)} className="text-slate-400 hover:text-red-500">
                  <X className="w-4 h-4" />
                </button>
              </div>
            )}

            {showEntryModal === 'expense' && !selectedSupplier && (
              <div className="relative">
                <label className="label">Link Supplier (Auto-update Balance)</label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input
                    type="text"
                    value={supplierSearch}
                    onChange={(e) => setSupplierSearch(e.target.value)}
                    placeholder="Search supplier name or phone..."
                    className="input pl-9 text-sm"
                  />
                </div>
                {supplierSearch.length >= 2 && suppliers.length > 0 && (
                  <div className="absolute top-full left-0 right-0 z-[60] bg-white border border-slate-200 rounded-lg shadow-xl mt-1 max-h-40 overflow-y-auto">
                    {suppliers.map((s: any) => (
                      <button
                        key={s.id}
                        onClick={() => {
                          setSelectedSupplier({ id: s.id, name: s.name });
                          setSupplierSearch('');
                          setCategory('Supplier Payment');
                        }}
                        className="w-full text-left px-3 py-2 hover:bg-slate-50 text-sm border-b border-slate-50 last:border-0"
                      >
                        <p className="font-medium text-slate-800">{s.name}</p>
                        <p className="text-xs text-slate-400">{s.phone}</p>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {selectedSupplier && (
              <div className="bg-red-50 border border-red-100 rounded-lg p-3 flex justify-between items-center">
                <div>
                  <p className="text-xs text-red-600 font-semibold uppercase tracking-wider">Supplier Linked</p>
                  <p className="text-sm font-bold text-slate-800">{selectedSupplier.name}</p>
                </div>
                <button onClick={() => setSelectedSupplier(null)} className="text-slate-400 hover:text-red-500">
                  <X className="w-4 h-4" />
                </button>
              </div>
            )}

            <div>
              <label className="label">Category *</label>
              <input 
                type="text" 
                list="categories"
                value={category}
                onChange={e => setCategory(e.target.value)}
                className="input"
                placeholder={showEntryModal === 'income' ? "e.g. Old Debt, Misc Income" : "e.g. Rent, Electricity, Fuel"}
              />
              <datalist id="categories">
                {showEntryModal === 'income' ? (
                  <>
                    <option value="Old Debt Recovery" />
                    <option value="Investment" />
                    <option value="Misc Income" />
                  </>
                ) : (
                  <>
                    <option value="Rent" />
                    <option value="Electricity Bill" />
                    <option value="Fuel / Travel" />
                    <option value="Staff Salary" />
                    <option value="Refreshment" />
                    <option value="Repair & Maintenance" />
                    <option value="Misc Expense" />
                  </>
                )}
              </datalist>
            </div>

            <div>
              <label className="label">Payment Method</label>
              <div className="grid grid-cols-3 gap-2">
                {['cash', 'bank', 'card'].map(m => (
                  <button 
                    key={m}
                    onClick={() => setPaymentMethod(m)}
                    className={cn(
                      "btn-sm border capitalize",
                      paymentMethod === m ? "bg-brand-600 text-white border-brand-600" : "bg-white text-slate-600 border-slate-200"
                    )}
                  >
                    {m}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="label">Description (Optional)</label>
              <textarea 
                value={description}
                onChange={e => setDescription(e.target.value)}
                className="input h-20 resize-none"
                placeholder="Details about this entry..."
              />
            </div>

            <button 
              onClick={async () => {
                const val = parseFloat(amount);
                if (!val || val <= 0) {
                  toast('Amount must be greater than zero', 'error');
                  return;
                }
                if (!category.trim()) {
                  toast('Category is required', 'error');
                  return;
                }
                setIsSubmitting(true);
                try {
                  await cmd('add_cashbook_entry', {
                    payload: {
                      entry_type: showEntryModal,
                      category,
                      amount: val,
                      payment_method: paymentMethod,
                      description: description || null,
                      created_by: null,
                      customer_id: selectedCustomer?.id || null,
                      supplier_id: selectedSupplier?.id || null
                    }
                  });
                  toast('Entry recorded successfully', 'success');
                  qc.invalidateQueries({ queryKey: ['financial-ledger'] });
                  qc.invalidateQueries({ queryKey: ['customers'] });
                  qc.invalidateQueries({ queryKey: ['suppliers'] });
                  qc.invalidateQueries({ queryKey: ['total-udhaar'] });
                  setShowEntryModal(null);
                  setSelectedCustomer(null);
                  setSelectedSupplier(null);
                } catch (e: any) {
                  toast(e.toString(), 'error');
                } finally {
                  setIsSubmitting(false);
                }
              }}
              disabled={isSubmitting}
              className={cn(
                "w-full py-3 rounded-xl font-bold text-white transition-all flex items-center justify-center gap-2",
                showEntryModal === 'income' ? "bg-green-600 hover:bg-green-700" : "bg-red-600 hover:bg-red-700",
                isSubmitting && "opacity-70 cursor-not-allowed"
              )}
            >
              {isSubmitting ? <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : null}
              {showEntryModal === 'income' ? 'Save Receipt' : 'Save Payment'}
            </button>
          </div>
        </div>
      </>
    )}
  </>
);
}
