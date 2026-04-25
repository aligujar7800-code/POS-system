import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { cmd, formatCurrency } from '../lib/utils';
import { backgroundSyncInventory, isShopifyConfigured } from '../lib/shopify';
import { useSettingsStore } from '../stores/settingsStore';
import { useAuthStore } from '../stores/authStore';
import { useToast } from '../components/ui/Toaster';
import { Search, Package, ArrowRightLeft, AlertCircle, History, CheckCircle2 } from 'lucide-react';

interface Product {
  id: number;
  name: string;
  sku: string;
  barcode?: string;
  category_name?: string;
  total_stock: number;
  cost_price: number;
}

interface Supplier {
  id: number;
  name: string;
  outstanding_balance: number;
}

interface ProductVariant {
  id: number;
  product_id: number;
  size?: string;
  color?: string;
  quantity: number;
  variant_barcode?: string;
}

const REASONS = [
  'Damage / Breakage',
  'Theft / Loss',
  'Counting Error',
  'Expired / Obsolete',
  'Returned to Supplier',
  'Gift / Promotion',
  'Opening Stock',
  'Other'
];

export default function StockAdjustment() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { user } = useAuthStore();
  const qc = useQueryClient();
  
  const [search, setSearch] = useState('');
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [selectedVariant, setSelectedVariant] = useState<ProductVariant | null>(null);
  const [newQty, setNewQty] = useState<string>('');
  const [reason, setReason] = useState(REASONS[2]); // Default: Counting Error
  const [customReason, setCustomReason] = useState('');

  // Fetch suppliers for financial linking
  const { data: suppliers = [] } = useQuery<Supplier[]>({
    queryKey: ['suppliers'],
    queryFn: () => cmd('get_all_suppliers'),
  });

  const [linkFinance, setLinkFinance] = useState(false);
  const [supplierId, setSupplierId] = useState<number | ''>('');
  const [unitCost, setUnitCost] = useState<string>('');

  useEffect(() => {
    if (selectedProduct) {
      setUnitCost(selectedProduct.cost_price.toString());
    }
  }, [selectedProduct]);

  // Search products
  const { data: searchResults = [], isFetching } = useQuery<Product[]>({
    queryKey: ['products-search', search],
    queryFn: () => cmd('search_products', { query: search }),
    enabled: search.length > 1,
  });

  // Fetch variants for selected product
  const { data: variants = [] } = useQuery<ProductVariant[]>({
    queryKey: ['product-variants', selectedProduct?.id],
    queryFn: () => cmd('get_product_variants', { productId: selectedProduct?.id }),
    enabled: !!selectedProduct,
  });

  const adjustmentMutation = useMutation({
    mutationFn: (payload: { 
      variantId: number; 
      newQty: number; 
      reason: string; 
      userId?: number;
      supplierId?: number;
      unitCost?: number;
    }) => cmd('update_variant_stock', payload),
    onSuccess: () => {
      toast('Stock adjusted successfully', 'success');
      qc.invalidateQueries({ queryKey: ['products'] });
      qc.invalidateQueries({ queryKey: ['product-variants', selectedProduct?.id] });
      qc.invalidateQueries({ queryKey: ['stock-ledger', selectedProduct?.id] });
      qc.invalidateQueries({ queryKey: ['suppliers'] });
      qc.invalidateQueries({ queryKey: ['supplier-ledger'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
      qc.invalidateQueries({ queryKey: ['financial-ledger'] });
      qc.invalidateQueries({ queryKey: ['total-udhaar'] });

      // Shopify: Sync updated inventory in background
      if (selectedVariant) {
        const varId = selectedVariant.id;
        const newQuantity = parseInt(newQty);
        isShopifyConfigured().then(configured => {
          if (configured) {
            cmd<Record<string, string>>('get_all_settings').then(s => {
              if (s?.shopify_auto_sync === '1') {
                backgroundSyncInventory(varId, newQuantity);
              }
            });
          }
        });
      }
      setNewQty('');
      setCustomReason('');
      setLinkFinance(false);
      setSupplierId('');
    },
    onError: (e: any) => {
      toast(e.toString(), 'error');
    }
  });

  const handleAdjust = () => {
    if (!selectedVariant) return;
    const qty = parseInt(newQty);
    if (isNaN(qty) || qty < 0) {
      toast('Please enter a valid non-negative quantity', 'error');
      return;
    }
    if (qty === selectedVariant.quantity) {
      toast('New quantity is the same as current stock. No adjustment needed.', 'error');
      return;
    }
    if (linkFinance && !supplierId) {
      toast('Please select a supplier for financial adjustment', 'error');
      return;
    }

    const finalReason = reason === 'Other' ? `Adjustment: ${customReason}` : `Adjustment: ${reason}`;
    
    adjustmentMutation.mutate({
      variantId: selectedVariant.id,
      newQty: qty,
      reason: finalReason,
      userId: user?.id,
      supplierId: linkFinance ? (supplierId as number) : undefined,
      unitCost: linkFinance ? parseFloat(unitCost) : undefined,
    });
  };

  return (
    <div className="page">
      <div className="page-header">
        <h1 className="page-title flex items-center gap-2">
          <ArrowRightLeft className="w-5 h-5 text-brand-600" />
          Stock Adjustment
        </h1>
        <p className="text-slate-500 text-sm">Correct manual errors, damages, or theft.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: Search & Selection */}
        <div className="lg:col-span-1 space-y-4">
          <div className="card p-4 space-y-4">
            <h2 className="font-semibold text-slate-800 flex items-center gap-2">
              <Package className="w-4 h-4 text-slate-400" />
              1. Select Product
            </h2>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search name or SKU..."
                className="input pl-9"
              />
            </div>

            <div className="space-y-2 max-h-[300px] overflow-y-auto pr-1">
              {search.length > 0 && searchResults.length === 0 && !isFetching && (
                <p className="text-center py-4 text-slate-400 text-sm">No products found</p>
              )}
              {searchResults.map((p) => (
                <button
                  key={p.id}
                  onClick={() => {
                    setSelectedProduct(p);
                    setSelectedVariant(null);
                    setSearch('');
                  }}
                  className={`w-full text-left p-3 rounded-lg border transition-all ${
                    selectedProduct?.id === p.id 
                      ? 'border-brand-500 bg-brand-50/50' 
                      : 'border-slate-100 hover:border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  <p className="font-medium text-sm text-slate-800">{p.name}</p>
                  <p className="text-xs text-slate-500 font-mono mt-1">{p.sku}</p>
                </button>
              ))}
            </div>
          </div>

          {selectedProduct && (
            <div className="card p-4 space-y-4 animate-in fade-in slide-in-from-top-2">
              <h2 className="font-semibold text-slate-800 flex items-center gap-2">
                <Layers className="w-4 h-4 text-slate-400" />
                2. Select Variant
              </h2>
              <div className="space-y-2">
                {variants.map((v) => (
                  <button
                    key={v.id}
                    onClick={() => {
                      setSelectedVariant(v);
                      setNewQty(v.quantity.toString());
                    }}
                    className={`w-full text-left p-3 rounded-lg border transition-all ${
                      selectedVariant?.id === v.id 
                        ? 'border-brand-500 bg-brand-50/50' 
                        : 'border-slate-100 hover:border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex justify-between items-center">
                      <p className="font-medium text-sm text-slate-800">
                        {v.size || 'No Size'} {v.color ? `/ ${v.color}` : ''}
                      </p>
                      <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                        v.quantity > 0 ? 'bg-slate-100 text-slate-600' : 'bg-red-50 text-red-500'
                      }`}>
                        Qty: {v.quantity}
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Right Column: Adjustment Form */}
        <div className="lg:col-span-2 space-y-6">
          {!selectedVariant ? (
            <div className="card p-12 flex flex-col items-center justify-center text-center opacity-60">
              <div className="w-16 h-16 rounded-full bg-slate-100 flex items-center justify-center mb-4">
                <AlertCircle className="w-8 h-8 text-slate-400" />
              </div>
              <h3 className="text-lg font-medium text-slate-700">No Variant Selected</h3>
              <p className="text-slate-500 max-w-xs mt-2">
                Search and select a product variant from the left to start adjusting stock levels.
              </p>
            </div>
          ) : (
            <div className="card p-6 space-y-6 animate-in fade-in slide-in-from-right-4">
              <div className="flex justify-between items-start">
                <div>
                  <h3 className="text-xl font-bold text-slate-800">{selectedProduct?.name}</h3>
                  <p className="text-sm text-slate-500 font-mono">
                    {selectedVariant.size} {selectedVariant.color} | SKU: {selectedProduct?.sku}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-slate-400 uppercase font-bold tracking-wider">Current Stock</p>
                  <p className="text-3xl font-black text-brand-600">{selectedVariant.quantity}</p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-4 border-t border-slate-100">
                <div className="space-y-2">
                  <label className="label">New Physical Quantity</label>
                  <input
                    type="number"
                    value={newQty}
                    onChange={(e) => setNewQty(e.target.value)}
                    className="input text-lg font-bold h-12"
                    placeholder="Enter actual count..."
                  />
                  <p className="text-xs text-slate-400 italic">
                    Enter the actual number of items currently in your hands.
                  </p>
                </div>

                <div className="space-y-2">
                  <label className="label">Adjustment Reason</label>
                  <select
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    className="input h-12"
                  >
                    {REASONS.map(r => <option key={r} value={r}>{r}</option>)}
                  </select>
                </div>
              </div>

              {reason === 'Other' && (
                <div className="space-y-2 animate-in fade-in">
                  <label className="label">Specific Description</label>
                  <textarea
                    value={customReason}
                    onChange={(e) => setCustomReason(e.target.value)}
                    className="input min-h-[80px]"
                    placeholder="Describe why you are making this change..."
                  />
                </div>
              )}

              {/* Financial Link Section */}
              <div className="border-t border-slate-100 pt-6 space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="text-sm font-bold text-slate-800">Financial Impact</h4>
                    <p className="text-xs text-slate-500">Link this adjustment to a supplier ledger</p>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input 
                      type="checkbox" 
                      className="sr-only peer" 
                      checked={linkFinance} 
                      onChange={(e) => setLinkFinance(e.target.checked)} 
                    />
                    <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-brand-600"></div>
                  </label>
                </div>

                {linkFinance && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 bg-slate-50 rounded-xl border border-slate-100 animate-in zoom-in-95 duration-200">
                    <div className="space-y-2">
                      <label className="label text-slate-500 uppercase tracking-wider">Affected Supplier</label>
                      <select
                        value={supplierId}
                        onChange={(e) => setSupplierId(Number(e.target.value))}
                        className="input"
                      >
                        <option value="">Select Supplier...</option>
                        {suppliers.map(s => (
                          <option key={s.id} value={s.id}>{s.name} (Bal: {formatCurrency(s.outstanding_balance)})</option>
                        ))}
                      </select>
                    </div>
                    <div className="space-y-2">
                      <label className="label text-slate-500 uppercase tracking-wider">Unit Cost for Calculation</label>
                      <input
                        type="number"
                        value={unitCost}
                        onChange={(e) => setUnitCost(e.target.value)}
                        className="input"
                        placeholder="Cost per item..."
                      />
                    </div>
                    
                    {supplierId && unitCost && (
                      <div className="md:col-span-2 mt-2 px-3 py-2 bg-brand-50 rounded-lg border border-brand-100">
                        <p className="text-sm text-brand-800">
                          {parseInt(newQty) < selectedVariant.quantity ? (
                            <>
                              <span className="font-bold">Debt Reduction:</span> Returning {selectedVariant.quantity - parseInt(newQty)} items will decrease your debt to this supplier by <span className="font-bold underline">{formatCurrency((selectedVariant.quantity - parseInt(newQty)) * parseFloat(unitCost))}</span>.
                            </>
                          ) : (
                            <>
                              <span className="font-bold">Debt Increase:</span> Adding {parseInt(newQty) - selectedVariant.quantity} items will increase your debt to this supplier by <span className="font-bold underline">{formatCurrency((parseInt(newQty) - selectedVariant.quantity) * parseFloat(unitCost))}</span>.
                            </>
                          )}
                        </p>
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div className="flex items-center justify-between p-4 bg-amber-50 rounded-xl border border-amber-100">
                <div className="flex gap-3">
                  <AlertCircle className="w-5 h-5 text-amber-500 flex-shrink-0" />
                  <div>
                    <p className="text-sm text-amber-800 font-medium">Audit Trail Record</p>
                    <p className="text-xs text-amber-700 mt-0.5">
                      This change will be logged under your account (**{user?.username}**) and will impact the financial reports.
                    </p>
                  </div>
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-4">
                <button
                  onClick={() => setSelectedVariant(null)}
                  className="btn-secondary px-6"
                  disabled={adjustmentMutation.isPending}
                >
                  Cancel
                </button>
                <button
                  onClick={handleAdjust}
                  className="btn-primary px-8"
                  disabled={adjustmentMutation.isPending}
                >
                  {adjustmentMutation.isPending ? 'Saving...' : 'Confirm Adjustment'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

const Layers = ({ className }: { className?: string }) => (
  <svg className={className} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="12 2 2 7 12 12 22 7 12 2" /><polyline points="2 17 12 22 22 17" /><polyline points="2 12 12 17 22 12" /></svg>
);
