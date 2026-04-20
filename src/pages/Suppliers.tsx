import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { cmd, formatCurrency } from '../lib/utils';
import { useSettingsStore } from '../stores/settingsStore';
import { useToast } from '../components/ui/Toaster';
import { Search, Users, TrendingDown, DollarSign, ChevronRight, Plus, MapPin, Phone } from 'lucide-react';

interface Supplier {
  id: number; name: string; phone: string;
  address?: string; notes?: string; outstanding_balance: number;
}

export default function SuppliersPage() {
  const { t } = useTranslation();
  const { currency_symbol } = useSettingsStore();
  const { toast } = useToast();
  const qc = useQueryClient();
  const fmt = (n: number) => formatCurrency(Math.abs(n), currency_symbol);

  const [search, setSearch] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState<Supplier | null>(null);
  
  // Form State
  const [formName, setFormName] = useState('');
  const [formPhone, setFormPhone] = useState('');
  const [formAddress, setFormAddress] = useState('');
  const [formNotes, setFormNotes] = useState('');
  const [formOpeningBalance, setFormOpeningBalance] = useState('');
  const [saving, setSaving] = useState(false);

  const { data: suppliers = [], isLoading } = useQuery<Supplier[]>({
    queryKey: ['suppliers'],
    queryFn: () => cmd('get_all_suppliers'),
  });

  const filtered = suppliers.filter(
    (s) => !search || s.name.toLowerCase().includes(search.toLowerCase()) || s.phone.includes(search)
  );

  const totalOwed = suppliers.reduce((sum, s) => sum + s.outstanding_balance, 0);

  const handleOpenAdd = () => {
    setEditingSupplier(null);
    setFormName(''); setFormPhone(''); setFormAddress(''); setFormNotes(''); setFormOpeningBalance('0');
    setShowAddModal(true);
  };

  const handleOpenEdit = (s: Supplier) => {
    setEditingSupplier(s);
    setFormName(s.name); setFormPhone(s.phone); setFormAddress(s.address || ''); setFormNotes(s.notes || '');
    setShowAddModal(true);
  };

  const handleSave = async () => {
    if (!formName || !formPhone) {
      toast('Name and Phone are required', 'error');
      return;
    }
    setSaving(true);
    try {
      const payload = { 
        name: formName, 
        phone: formPhone, 
        address: formAddress || null, 
        notes: formNotes || null,
        opening_balance: !editingSupplier ? parseFloat(formOpeningBalance) || 0 : undefined
      };
      if (editingSupplier) {
        await cmd('update_supplier', { id: editingSupplier.id, payload });
        toast('Supplier updated!', 'success');
      } else {
        await cmd('create_supplier', { payload });
        toast('Supplier created!', 'success');
      }
      qc.invalidateQueries({ queryKey: ['suppliers'] });
      setShowAddModal(false);
    } catch (e: any) {
      toast(e.toString(), 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="page">
      <div className="page-header">
        <h1 className="page-title flex items-center gap-2">
          <Users className="w-5 h-5 text-brand-600" />
          Suppliers (Inventory Khata)
        </h1>
        <button onClick={handleOpenAdd} className="btn-primary">
          <Plus className="w-4 h-4" /> Add Supplier
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-4 mb-6">
        <div className="stat-card border-l-4 border-l-red-400">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-red-50 flex items-center justify-center text-red-500">
               <TrendingDown className="w-5 h-5" />
            </div>
            <div>
              <p className="stat-label text-slate-500 text-xs uppercase font-bold tracking-wider">Total Payable (Udhaar)</p>
              <p className="stat-value text-red-600">{fmt(totalOwed)}</p>
            </div>
          </div>
        </div>
        <div className="stat-card border-l-4 border-l-brand-400">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-brand-50 flex items-center justify-center text-brand-500">
               <Users className="w-5 h-5" />
            </div>
            <div>
              <p className="stat-label text-slate-500 text-xs uppercase font-bold tracking-wider">Total Suppliers</p>
              <p className="stat-value text-brand-700">{suppliers.length}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Search */}
      <div className="flex items-center gap-3 mb-4">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search suppliers by name or phone..."
            className="input pl-9"
          />
        </div>
      </div>

      {/* Supplier Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {isLoading ? (
          <div className="col-span-full py-12 text-center text-slate-400">Loading suppliers...</div>
        ) : filtered.length === 0 ? (
          <div className="col-span-full py-12 text-center text-slate-400">No suppliers found.</div>
        ) : (
          filtered.map((s) => (
            <div key={s.id} className="bg-white rounded-xl border border-slate-200 p-5 hover:shadow-md transition-shadow">
              <div className="flex justify-between items-start mb-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center font-bold text-slate-600 uppercase">
                    {s.name.charAt(0)}
                  </div>
                  <div>
                    <h3 className="font-bold text-slate-800 leading-tight">{s.name}</h3>
                    <div className="flex items-center gap-1 text-slate-400 text-xs mt-1">
                      <Phone className="w-3 h-3" /> {s.phone}
                    </div>
                  </div>
                </div>
                {s.outstanding_balance !== 0 && (
                  <div className={`px-2 py-1 rounded text-[10px] font-black uppercase ${s.outstanding_balance > 0 ? 'bg-red-50 text-red-600' : 'bg-green-50 text-green-600'}`}>
                    {s.outstanding_balance > 0 ? 'Payable' : 'Advance'}
                  </div>
                )}
              </div>

              <div className="space-y-2 mb-5">
                {s.address && (
                  <div className="flex items-start gap-2 text-slate-500 text-xs">
                    <MapPin className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
                    <span>{s.address}</span>
                  </div>
                )}
                <div className="bg-slate-50 rounded-lg p-3">
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Current Balance</p>
                  <p className={`text-xl font-bold ${s.outstanding_balance > 0 ? 'text-red-600' : 'text-slate-600'}`}>
                    {fmt(s.outstanding_balance)}
                  </p>
                </div>
              </div>

              <div className="flex gap-2">
                <Link to={`/suppliers/${s.id}`} className="flex-1 btn-secondary btn-sm justify-center">
                  View Ledger <ChevronRight className="w-3.5 h-3.5" />
                </Link>
                <button onClick={() => handleOpenEdit(s)} className="btn-ghost btn-sm px-3">Edit</button>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Add/Edit Modal */}
      {showAddModal && (
        <>
          <div className="overlay" onClick={() => setShowAddModal(false)} />
          <div className="dialog w-96 animate-in fade-in zoom-in duration-200">
            <h2 className="text-lg font-bold text-slate-800 mb-4">
              {editingSupplier ? 'Edit Supplier' : 'Add New Supplier'}
            </h2>
            <div className="space-y-4">
              <div>
                <label className="label text-xs font-bold text-slate-500 uppercase">Full Name *</label>
                <input value={formName} onChange={e => setFormName(e.target.value)} className="input" placeholder="e.g. Zeeshan Fabrics" />
              </div>
              <div>
                <label className="label text-xs font-bold text-slate-500 uppercase">Phone Number *</label>
                <input value={formPhone} onChange={e => setFormPhone(e.target.value)} className="input" placeholder="03xx-xxxxxxx" />
              </div>
              <div>
                <label className="label text-xs font-bold text-slate-500 uppercase">Shop Address</label>
                <input value={formAddress} onChange={e => setFormAddress(e.target.value)} className="input" placeholder="Optional" />
              </div>
              <div>
                <label className="label text-xs font-bold text-slate-500 uppercase">Notes</label>
                <textarea value={formNotes} onChange={e => setFormNotes(e.target.value)} className="input min-h-[80px]" placeholder="Optional remarks" />
              </div>
              {!editingSupplier && (
                <div className="bg-brand-50/50 p-3 rounded-xl border border-brand-100 animate-in fade-in slide-in-from-top-2 duration-300">
                  <label className="label text-[10px] font-black text-brand-600 uppercase tracking-widest">Opening Balance (Udhaar)</label>
                  <input 
                    type="number" 
                    value={formOpeningBalance} 
                    onChange={e => setFormOpeningBalance(e.target.value)} 
                    className="input font-bold text-lg bg-white border-brand-200" 
                    placeholder="0" 
                  />
                  <p className="text-[9px] text-brand-400 mt-1 font-medium italic">Record previous outstanding balance with this supplier.</p>
                </div>
              )}
              <div className="flex gap-2 pt-2">
                <button onClick={handleSave} disabled={saving} className="btn-primary flex-1">
                  {saving ? <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin mr-2" /> : null}
                  {editingSupplier ? 'Update' : 'Save'} Supplier
                </button>
                <button onClick={() => setShowAddModal(false)} className="btn-secondary flex-1">Cancel</button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
