import React, { useState, useRef, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useQueryClient, useQuery } from '@tanstack/react-query';
import Fuse from 'fuse.js';
import {
  Search, Plus, Trash2, PackagePlus, Receipt, ArrowRight, History,
  Package, Check, Users, ShoppingBag, Baby, Tag, RefreshCw, Layers
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cmd, formatCurrency } from '../lib/utils';
import { backgroundSyncInventory, isShopifyConfigured } from '../lib/shopify';
import { useSettingsStore } from '../stores/settingsStore';
import { useToast } from '../components/ui/Toaster';
import AdminConfirmModal from '../components/ui/AdminConfirmModal';



interface InwardHistoryEntry {
  id: number;
  product_name: string;
  variant_info: string;
  received_qty: number;
  cost_price: number;
  total_cost: number;
  supplier_name: string;
  date: string;
}

interface CartItem {
  cart_id: string;
  product_id: number;
  variant_id: number;
  article_number: string;
  main_category: string;
  sub_category_id: number;
  sub_category_name: string;
  product_name: string;
  color: string;
  size: string;
  quantity: number;
  cost_price: number;
  sale_price: number;
}



export default function InwardPage() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const qc = useQueryClient();
  const { currency_symbol } = useSettingsStore();

  const [activeTab, setActiveTab] = useState<'new' | 'history'>('new');
  const [showClearHistoryModal, setShowClearHistoryModal] = useState(false);
  const [isClearingHistory, setIsClearingHistory] = useState(false);

  // ── Search-Based Flow State ───────────────────────────
  const [productSearch, setProductSearch] = useState('');
  const [selectedProduct, setSelectedProduct] = useState<any>(null);

  // We temporarily hold variant inputs here maps variant_id to { quantity, cost_price, sale_price }
  const [variantInputs, setVariantInputs] = useState<Record<number, { quantity: string, cost_price: string, sale_price: string }>>({});

  // Adding new variant on the fly
  const [showAddVariant, setShowAddVariant] = useState(false);
  const [newColor, setNewColor] = useState('');
  const [newSize, setNewSize] = useState('');
  const [newQuantity, setNewQuantity] = useState('');
  const [newCost, setNewCost] = useState('');
  const [newSale, setNewSale] = useState('');

  // ── Cart & Voucher ──────────────────────────────────────
  const [cart, setCart] = useState<CartItem[]>([]);
  const [supplierId, setSupplierId] = useState<number | null>(null);
  const [supplierName, setSupplierName] = useState(''); // Keep as fallback/desc
  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [paymentAmount, setPaymentAmount] = useState<string>('');
  const [notes, setNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const articleInputRef = useRef<HTMLInputElement>(null);

  // ── Queries ─────────────────────────────────────────────
  const { data: allProducts = [], isLoading: prodLoading } = useQuery<any[]>({
    queryKey: ['products'],
    queryFn: () => cmd('get_all_products'),
  });

  const { data: productVariants = [], isLoading: variantsLoading } = useQuery<any[]>({
    queryKey: ['product_variants', selectedProduct?.id],
    queryFn: () => cmd('get_product_variants', { productId: selectedProduct?.id }),
    enabled: !!selectedProduct,
  });

  const fuse = new Fuse(allProducts, { keys: ['name', 'sku', 'article_number', 'barcode'], threshold: 0.3 });
  const searchResults = productSearch ? fuse.search(productSearch).map(r => r.item) : allProducts.slice(0, 15);

  const { data: historyData = [], isLoading: isLoadingHistory } = useQuery({
    queryKey: ['inward-history'],
    queryFn: () => cmd<InwardHistoryEntry[]>('get_inward_history'),
    enabled: activeTab === 'history',
  });

  const { data: suppliers = [] } = useQuery<any[]>({
    queryKey: ['suppliers'],
    queryFn: () => cmd('get_all_suppliers'),
  });



  // ── Add to Cart ─────────────────────────────────────────
  const handleAddToCart = () => {
    if (!selectedProduct) return;

    let added = 0;
    const newItems: CartItem[] = [];

    Object.entries(variantInputs).forEach(([vIdStr, inputs]) => {
      const q = parseInt(inputs.quantity) || 0;
      if (q > 0) {
        const v = productVariants.find((pv: any) => pv.id === parseInt(vIdStr));
        if (v) {
          newItems.push({
            cart_id: Math.random().toString(36).substring(7),
            product_id: selectedProduct.id,
            variant_id: v.id,
            article_number: selectedProduct.article_number || '',
            main_category: selectedProduct.category_name || '',
            sub_category_id: selectedProduct.category_id || 0,
            sub_category_name: selectedProduct.category_name || '',
            product_name: selectedProduct.name || '',
            color: v.color || '',
            size: v.size || '',
            quantity: q,
            cost_price: parseFloat(inputs.cost_price) || parseFloat(v.variant_price) || parseFloat(selectedProduct.cost_price) || 0,
            sale_price: parseFloat(inputs.sale_price) || parseFloat(v.variant_price) || parseFloat(selectedProduct.sale_price) || 0,
          });
          added++;
        }
      }
    });

    if (showAddVariant) {
      const q = parseInt(newQuantity) || 0;
      if (q > 0) {
        newItems.push({
          cart_id: Math.random().toString(36).substring(7),
          product_id: selectedProduct.id,
          variant_id: 0, // 0 indicates a new variant to be created by backend
          article_number: selectedProduct.article_number || '',
          main_category: selectedProduct.category_name || '',
          sub_category_id: selectedProduct.category_id || 0,
          sub_category_name: selectedProduct.category_name || '',
          product_name: selectedProduct.name || '',
          color: newColor.trim() || '',
          size: newSize.trim() || '',
          quantity: q,
          cost_price: parseFloat(newCost) || parseFloat(selectedProduct.cost_price) || 0,
          sale_price: parseFloat(newSale) || parseFloat(selectedProduct.sale_price) || 0,
        });
        added++;
        setNewColor(''); setNewSize(''); setNewQuantity(''); setNewCost(''); setNewSale('');
        setShowAddVariant(false);
      }
    }

    if (added === 0) {
      toast('Please enter a valid quantity for at least one variation.', 'error');
      return;
    }

    setCart(prev => [...prev, ...newItems]);
    setVariantInputs({});
    toast(`${added} items added to voucher!`, 'success');
  };

  const removeCartItem = (cartId: string) => {
    setCart(prev => prev.filter(c => c.cart_id !== cartId));
  };

  const updateCartItem = (cartId: string, updates: Partial<CartItem>) => {
    setCart(prev => prev.map(c => c.cart_id === cartId ? { ...c, ...updates } : c));
  };

  const totalAmount = cart.reduce((sum, item) => sum + (item.quantity * item.cost_price), 0);
  const totalQty = cart.reduce((sum, item) => sum + item.quantity, 0);

  // ── Submit ──────────────────────────────────────────────
  const handleSubmit = async () => {
    if (cart.length === 0) return;

    if (!supplierId) {
      toast('Please select a Supplier from the dropdown first. If they do not exist, create them in the Suppliers page.', 'error');
      return;
    }

    let paid = parseFloat(paymentAmount);
    if (isNaN(paid)) paid = 0;

    setIsSubmitting(true);
    try {
      await cmd('add_inward_stock', {
        payload: {
          items: cart.map(c => ({
            product_id: c.product_id,
            variant_id: c.variant_id,
            quantity: c.quantity,
            cost_price: c.cost_price,
            sale_price: c.sale_price,
            size: c.size || null,
            color: c.color || null,
          })),
          payment_method: paymentMethod,
          payment_amount: paid,
          supplier_id: supplierId,
          supplier_name: supplierName || null,
          notes: notes || null,
          created_by: null,
        },
      });

      toast('Inward stock recorded successfully!', 'success');
      setCart([]);
      setSupplierName('');
      setPaymentAmount('');
      setNotes('');
      resetFlow();
      qc.invalidateQueries({ queryKey: ['products'] });
      qc.invalidateQueries({ queryKey: ['low-stock'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
      qc.invalidateQueries({ queryKey: ['inward-history'] });
      qc.invalidateQueries({ queryKey: ['financial-ledger'] });
      qc.invalidateQueries({ queryKey: ['suppliers'] });
      qc.invalidateQueries({ queryKey: ['total-udhaar'] });

      // Shopify: Sync inventory for each variant in background
      isShopifyConfigured().then(configured => {
        if (configured) {
          cmd<Record<string, string>>('get_all_settings').then(s => {
            if (s?.shopify_auto_sync === '1') {
              // For each cart item, sync the updated stock to Shopify
              cart.forEach(item => {
                if (item.variant_id && item.variant_id > 0) {
                  // Fetch current stock for this variant and sync
                  cmd<any[]>('get_product_variants', { productId: item.product_id }).then(variants => {
                    const v = variants?.find(v => v.id === item.variant_id);
                    if (v) backgroundSyncInventory(item.variant_id, v.quantity);
                  }).catch(() => {});
                }
              });
            }
          });
        }
      });
    } catch (e: any) {
      toast(e.toString(), 'error');
      console.error(e);
    } finally {
      setIsSubmitting(false);
    }
  };

  // ── Reset category selection ────────────────────────────
  const resetFlow = () => {
    setSelectedProduct(null);
    setProductSearch('');
    setVariantInputs({});
    setShowAddVariant(false);
  };

  // ══════════════════════════════════════════════════════════
  // ── RENDER ───────────────────────────────────────────────
  // ══════════════════════════════════════════════════════════
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: '#f8fafc', overflow: 'hidden' }}>
      <div style={{ flex: 1, overflowY: 'auto', padding: 24 }}>
      {/* Header & Tabs */}
      <div style={{ marginBottom: 24, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 700, color: '#1e293b' }}>Inward Stock</h1>
          <p style={{ fontSize: 14, color: '#64748b' }}>Manage stock arrivals from suppliers.</p>
        </div>

        <div style={{ display: 'flex', background: '#e2e8f0', padding: 4, borderRadius: 8 }}>
          <button
            onClick={() => setActiveTab('new')}
            style={{ padding: '8px 16px', borderRadius: 6, fontSize: 14, fontWeight: 600, border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, transition: '0.2s', ...(activeTab === 'new' ? { background: '#fff', color: '#1e293b', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' } : { background: 'transparent', color: '#64748b' }) }}
          >
            <PackagePlus style={{ width: 16, height: 16 }} /> New Voucher
          </button>
          <button
            onClick={() => setActiveTab('history')}
            style={{ padding: '8px 16px', borderRadius: 6, fontSize: 14, fontWeight: 600, border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, transition: '0.2s', ...(activeTab === 'history' ? { background: '#fff', color: '#1e293b', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' } : { background: 'transparent', color: '#64748b' }) }}
          >
            <History style={{ width: 16, height: 16 }} /> History
          </button>
        </div>
      </div>

      {activeTab === 'new' ? (
        <div style={{ display: 'flex', gap: 24, minHeight: 'min-content' }}>
          {/* ── LEFT: Category Flow + Cart ─────────────────── */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 20 }}>

            {/* Step 1: Search & Select Product */}
            <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0', padding: 20 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
                <div style={{ width: 28, height: 28, borderRadius: 8, background: '#6366f1', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 800 }}>1</div>
                <h3 style={{ fontSize: 15, fontWeight: 700, color: '#1e293b', margin: 0 }}>Select Product</h3>
                {selectedProduct && (
                  <button onClick={resetFlow} style={{ marginLeft: 'auto', fontSize: 12, color: '#6366f1', background: '#eef2ff', border: 'none', borderRadius: 6, padding: '4px 12px', cursor: 'pointer', fontWeight: 600 }}>
                    Change Product
                  </button>
                )}
              </div>

              {!selectedProduct ? (
                <div>
                  <div style={{ position: 'relative', marginBottom: 12 }}>
                    <Search style={{ position: 'absolute', left: 12, top: 12, width: 16, height: 16, color: '#94a3b8' }} />
                    <input
                      value={productSearch}
                      onChange={(e) => setProductSearch(e.target.value)}
                      placeholder="Search by name, article number, or barcode..."
                      style={{ width: '100%', padding: '10px 10px 10px 38px', borderRadius: 8, border: '2px solid #e2e8f0', fontSize: 14, outline: 'none' }}
                    />
                  </div>
                  <div style={{ maxHeight: 300, overflow: 'auto', display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {searchResults.map((p: any) => (
                      <div
                        key={p.id}
                        onClick={() => { setSelectedProduct(p); setVariantInputs({}); }}
                        style={{ padding: '12px 16px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                      >
                        <div>
                          <div style={{ fontWeight: 700, color: '#1e293b' }}>{p.name}</div>
                          <div style={{ fontSize: 12, color: '#64748b' }}>Art: {p.article_number || 'N/A'} | Stock: {p.total_stock || 0}</div>
                        </div>
                        <button style={{ padding: '4px 12px', background: '#6366f1', color: '#fff', border: 'none', borderRadius: 6, fontWeight: 600, fontSize: 12, cursor: 'pointer' }}>Select</button>
                      </div>
                    ))}
                    {searchResults.length === 0 && <div style={{ padding: 16, textAlign: 'center', color: '#94a3b8' }}>No products found</div>}
                  </div>
                </div>
              ) : (
                <div style={{ padding: '12px 16px', background: '#f1f5f9', border: '1px solid #cbd5e1', borderRadius: 8 }}>
                  <div style={{ fontWeight: 700, fontSize: 16, color: '#0f172a' }}>{selectedProduct.name}</div>
                  <div style={{ fontSize: 13, color: '#475569' }}>Article: {selectedProduct.article_number || 'N/A'} | Category: {selectedProduct.category_name || 'N/A'}</div>
                </div>
              )}
            </div>

            {/* Step 2: Receive Stock Variants */}
            {selectedProduct && (
              <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0', padding: 20, animation: 'fadeIn 0.25s ease' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
                  <div style={{ width: 28, height: 28, borderRadius: 8, background: '#6366f1', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 800 }}>2</div>
                  <h3 style={{ fontSize: 15, fontWeight: 700, color: '#1e293b', margin: 0 }}>Stock Receiving Details</h3>
                </div>

                <div style={{ marginBottom: 16 }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 100px 100px 80px', gap: 8, fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', marginBottom: 8, padding: '0 4px' }}>
                    <div>Size</div>
                    <div>Color</div>
                    <div>Cost Price</div>
                    <div>Sale Price</div>
                    <div style={{ textAlign: 'center' }}>Receive Qty</div>
                  </div>

                  {variantsLoading ? <div style={{ textAlign: 'center', color: '#94a3b8', padding: 12 }}>Loading variants...</div> : productVariants.map((v: any) => (
                    <div key={v.id} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 100px 100px 80px', gap: 8, alignItems: 'center', marginBottom: 8 }}>
                      <div style={{ padding: '6px 10px', background: '#f8fafc', borderRadius: 6, fontSize: 13, fontWeight: 600 }}>{v.size || 'Default'}</div>
                      <div style={{ padding: '6px 10px', background: '#f8fafc', borderRadius: 6, fontSize: 13, fontWeight: 600 }}>{v.color || 'None'}</div>
                      <input
                        type="number"
                        value={variantInputs[v.id]?.cost_price || ''}
                        onChange={(e) => setVariantInputs(prev => ({ ...prev, [v.id]: { ...prev[v.id], cost_price: e.target.value } }))}
                        style={{ padding: '6px', borderRadius: 6, border: '1px solid #e2e8f0', fontSize: 13 }}
                        placeholder={String(selectedProduct.cost_price || 'Cost')}
                      />
                      <input
                        type="number"
                        value={variantInputs[v.id]?.sale_price || ''}
                        onChange={(e) => setVariantInputs(prev => ({ ...prev, [v.id]: { ...prev[v.id], sale_price: e.target.value } }))}
                        style={{ padding: '6px', borderRadius: 6, border: '1px solid #e2e8f0', fontSize: 13 }}
                        placeholder={String(v.variant_price || selectedProduct.sale_price || 'Sale')}
                      />
                      <input
                        type="number"
                        min="0"
                        value={variantInputs[v.id]?.quantity || ''}
                        onChange={(e) => setVariantInputs(prev => ({ ...prev, [v.id]: { ...prev[v.id], quantity: e.target.value } }))}
                        style={{ padding: '6px', borderRadius: 6, border: '2px solid #cbd5e1', fontSize: 14, fontWeight: 700, textAlign: 'center', outlineColor: '#6366f1' }}
                        placeholder="0"
                      />
                    </div>
                  ))}

                  {!showAddVariant && (
                    <button onClick={() => setShowAddVariant(true)} style={{ marginTop: 12, padding: '8px 0', width: '100%', background: 'transparent', border: '1px dashed #cbd5e1', borderRadius: 8, color: '#64748b', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                      + Receive a completely new Size/Color for this product
                    </button>
                  )}

                  {showAddVariant && (
                    <div style={{ marginTop: 12, padding: 12, background: '#fef2f2', border: '1px dashed #fca5a5', borderRadius: 8 }}>
                      <div style={{ fontSize: 12, fontWeight: 700, color: '#ef4444', marginBottom: 8 }}>New Variation</div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 100px 100px 80px', gap: 8, alignItems: 'center' }}>
                        <input placeholder="Size (eg XL)" value={newSize} onChange={e => setNewSize(e.target.value)} style={{ padding: '6px', borderRadius: 6, border: '1px solid #fecaca', fontSize: 13 }} />
                        <input placeholder="Color (eg Red)" value={newColor} onChange={e => setNewColor(e.target.value)} style={{ padding: '6px', borderRadius: 6, border: '1px solid #fecaca', fontSize: 13 }} />
                        <input type="number" placeholder="Cost" value={newCost} onChange={e => setNewCost(e.target.value)} style={{ padding: '6px', borderRadius: 6, border: '1px solid #fecaca', fontSize: 13 }} />
                        <input type="number" placeholder="Sale" value={newSale} onChange={e => setNewSale(e.target.value)} style={{ padding: '6px', borderRadius: 6, border: '1px solid #fecaca', fontSize: 13 }} />
                        <input type="number" placeholder="0" value={newQuantity} onChange={e => setNewQuantity(e.target.value)} style={{ padding: '6px', borderRadius: 6, border: '2px solid #ef4444', fontSize: 14, fontWeight: 700, textAlign: 'center' }} />
                      </div>
                    </div>
                  )}
                </div>

                {/* Add Button */}
                <button
                  onClick={handleAddToCart}
                  style={{
                    width: '100%',
                    padding: '14px 24px',
                    borderRadius: 10,
                    border: 'none',
                    background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
                    color: '#fff',
                    fontSize: 15,
                    fontWeight: 700,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 8,
                    boxShadow: '0 4px 16px rgba(99,102,241,0.3)',
                    transition: 'all 0.2s',
                  }}
                >
                  <Plus style={{ width: 18, height: 18 }} /> Add to Voucher
                </button>
              </div>
            )}

            {/* Cart Table - Enhanced Detail View */}
            {cart.length > 0 && (
              <div style={{ background: '#fff', borderRadius: 16, border: '1px solid #e2e8f0', overflow: 'hidden', boxShadow: '0 4px 20px rgba(0,0,0,0.08)', marginBottom: 20 }}>
                <div style={{ padding: '16px 20px', background: '#f8fafc', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ padding: 8, background: '#eef2ff', borderRadius: 10, color: '#6366f1' }}>
                      <Layers style={{ width: 18, height: 18 }} />
                    </div>
                    <div>
                      <h3 style={{ fontSize: 16, fontWeight: 800, color: '#1e293b', margin: 0 }}>Voucher Summary</h3>
                      <p style={{ fontSize: 11, color: '#64748b', margin: 0 }}>Review items before saving stock</p>
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                     <span style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Total Pieces:</span>
                     <span style={{ marginLeft: 8, fontSize: 18, fontWeight: 900, color: '#6366f1' }}>{totalQty}</span>
                  </div>
                </div>

                <div style={{ width: '100%' }}>
                  {/* Header Row */}
                  <div style={{ display: 'grid', gridTemplateColumns: '2fr 1.5fr 2fr 100px 120px 120px 50px', gap: 12, padding: '12px 20px', background: '#f1f5f9', borderBottom: '2px solid #e2e8f0', fontSize: 11, fontWeight: 700, color: '#475569', textTransform: 'uppercase' }}>
                    <div>Article / Product</div>
                    <div>Category</div>
                    <div>Details</div>
                    <div style={{ textAlign: 'center' }}>Qty</div>
                    <div style={{ textAlign: 'right' }}>Unit Cost</div>
                    <div style={{ textAlign: 'right' }}>Total</div>
                    <div></div>
                  </div>

                  {/* Data Rows */}
                  <div style={{ background: '#fff' }}>
                    {cart.map((item) => (
                      <div key={item.cart_id} style={{ display: 'grid', gridTemplateColumns: '2fr 1.5fr 2fr 100px 120px 120px 50px', gap: 12, padding: '12px 20px', borderBottom: '1px solid #f1f5f9', alignItems: 'center' }}>
                        <div>
                          <div style={{ fontFamily: 'monospace', fontWeight: 800, color: '#6366f1', fontSize: 13 }}>{item.article_number}</div>
                          <div style={{ fontSize: 12, color: '#1e293b', marginTop: 2, fontWeight: 500 }}>{item.product_name}</div>
                        </div>
                        
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                          <span style={{ fontSize: 10, background: '#eef2ff', color: '#6366f1', padding: '2px 6px', borderRadius: 4, fontWeight: 700 }}>{item.main_category}</span>
                          <span style={{ fontSize: 10, background: '#f8fafc', color: '#64748b', padding: '2px 6px', borderRadius: 4, fontWeight: 600 }}>{item.sub_category_name}</span>
                        </div>

                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                          {item.size && <span style={{ fontSize: 10, background: '#f1f5f9', color: '#475569', padding: '2px 6px', borderRadius: 4, fontWeight: 800, border: '1px solid #e2e8f0' }}>S: {item.size}</span>}
                          {item.color && <span style={{ fontSize: 10, background: '#fff7ed', color: '#c2410c', padding: '2px 6px', borderRadius: 4, fontWeight: 800, border: '1px solid #ffedd5' }}>C: {item.color}</span>}
                        </div>

                        <div style={{ textAlign: 'center' }}>
                          <input
                            type="number"
                            value={item.quantity || ''}
                            onChange={(e) => updateCartItem(item.cart_id, { quantity: parseInt(e.target.value) || 0 })}
                            style={{ width: '100%', textAlign: 'center', padding: '4px', border: '1px solid #e2e8f0', borderRadius: 6, fontWeight: 700, fontSize: 13 }}
                          />
                        </div>

                        <div style={{ textAlign: 'right' }}>
                          <input
                            type="number"
                            value={item.cost_price || ''}
                            onChange={(e) => updateCartItem(item.cart_id, { cost_price: parseFloat(e.target.value) || 0 })}
                            style={{ width: '100%', textAlign: 'right', padding: '4px', border: '1px solid #e2e8f0', borderRadius: 6, fontSize: 12 }}
                          />
                        </div>

                        <div style={{ textAlign: 'right', fontWeight: 800, color: '#0f172a', fontSize: 14 }}>
                          {formatCurrency(item.quantity * item.cost_price, currency_symbol)}
                        </div>

                        <div style={{ textAlign: 'right' }}>
                          <button onClick={() => removeCartItem(item.cart_id)} style={{ color: '#ef4444', background: 'none', border: 'none', cursor: 'pointer', padding: 4 }}>
                            <Trash2 style={{ width: 16, height: 16 }} />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Empty State */}
            {cart.length === 0 && !selectedProduct && (
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: '#94a3b8', background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0', padding: 40 }}>
                <PackagePlus style={{ width: 56, height: 56, color: '#e2e8f0', marginBottom: 16 }} />
                <p style={{ fontSize: 17, fontWeight: 600, color: '#64748b' }}>Search for a product to start</p>
                <p style={{ fontSize: 14, textAlign: 'center', maxWidth: 400, marginTop: 6 }}>Search by name or article number → Enter quantity for each size/color.</p>
              </div>
            )}
          </div>

          {/* ── RIGHT: Voucher Panel ────────────────────────── */}
          <div style={{ width: 360, display: 'flex', flexDirection: 'column', background: '#0f172a', borderRadius: 12, overflow: 'hidden', color: '#fff', flexShrink: 0, border: '1px solid #1e293b' }}>
            <div style={{ padding: 20, borderBottom: '1px solid #1e293b', display: 'flex', alignItems: 'center', gap: 12 }}>
              <Receipt style={{ width: 24, height: 24, color: '#818cf8' }} />
              <div>
                <h2 style={{ fontSize: 18, fontWeight: 700, margin: 0 }}>Inward Voucher</h2>
                <p style={{ fontSize: 12, color: '#64748b', margin: 0 }}>Voucher details & payment</p>
              </div>
            </div>

            <div style={{ flex: 1, overflow: 'auto', padding: 20, display: 'flex', flexDirection: 'column', gap: 20 }}>
              {/* Supplier Selection */}
              <div>
                <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: '#64748b', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Supplier</label>
                <div style={{ display: 'flex', gap: 8 }}>
                  <select
                    value={supplierId || ''}
                    onChange={(e) => {
                      const id = e.target.value ? parseInt(e.target.value) : null;
                      setSupplierId(id);
                      const s = suppliers.find((sup: any) => sup.id === id);
                      if (s) setSupplierName(s.name);
                    }}
                    style={{ flex: 1, background: '#1e293b', border: '1px solid #334155', borderRadius: 8, padding: '10px 12px', fontSize: 13, color: '#fff', outline: 'none' }}
                  >
                    <option value="">-- Select Existing Supplier --</option>
                    {suppliers.map((s: any) => (
                      <option key={s.id} value={s.id}>{s.name} ({s.phone})</option>
                    ))}
                  </select>
                  <Link to="/suppliers" style={{ padding: '8px 10px', background: '#334155', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff' }} title="Manage Suppliers">
                    <Users style={{ width: 14, height: 14 }} />
                  </Link>
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: '#64748b', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Payment Method</label>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  {(['cash', 'bank'] as const).map(m => (
                    <button
                      key={m}
                      onClick={() => setPaymentMethod(m)}
                      style={{
                        padding: '8px 12px',
                        borderRadius: 8,
                        fontSize: 14,
                        fontWeight: 500,
                        textTransform: 'capitalize',
                        border: '1px solid',
                        cursor: 'pointer',
                        transition: 'all 0.15s',
                        ...(paymentMethod === m
                          ? { background: '#6366f1', borderColor: '#818cf8', color: '#fff' }
                          : { background: '#1e293b', borderColor: '#334155', color: '#cbd5e1' }),
                      }}
                    >
                      {m}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: '#64748b', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Paid Amount</label>
                <div style={{ position: 'relative' }}>
                  <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: '#64748b' }}>{currency_symbol}</span>
                  <input
                    type="number"
                    value={paymentAmount}
                    onChange={e => setPaymentAmount(e.target.value)}
                    style={{ width: '100%', background: '#1e293b', border: '1px solid #334155', borderRadius: 8, padding: '10px 12px 10px 40px', fontSize: 18, fontWeight: 500, color: '#fff', outline: 'none' }}
                    placeholder="0.00"
                  />
                </div>
                <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8 }}>
                  <button
                    onClick={() => setPaymentAmount(totalAmount.toString())}
                    style={{ fontSize: 12, color: '#818cf8', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 500 }}
                  >
                    Pay Full Amount
                  </button>
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: '#64748b', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Notes</label>
                <textarea
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  style={{ width: '100%', background: '#1e293b', border: '1px solid #334155', borderRadius: 8, padding: '8px 12px', fontSize: 14, color: '#fff', outline: 'none', resize: 'none', height: 64 }}
                  placeholder="Any additional notes..."
                />
              </div>

              {/* Summary */}
              {cart.length > 0 && (
                <div style={{ background: '#1e293b', borderRadius: 10, padding: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: '#94a3b8' }}>
                    <span>Total Items</span>
                    <span style={{ fontWeight: 600, color: '#e2e8f0' }}>{cart.length}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: '#94a3b8' }}>
                    <span>Total Pieces</span>
                    <span style={{ fontWeight: 600, color: '#e2e8f0' }}>{totalQty}</span>
                  </div>
                  {totalAmount - (parseFloat(paymentAmount) || 0) > 0 && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: '#f87171', borderTop: '1px solid #334155', paddingTop: 8 }}>
                      <span>Balance Due</span>
                      <span style={{ fontWeight: 700 }}>{formatCurrency(totalAmount - (parseFloat(paymentAmount) || 0), currency_symbol)}</span>
                    </div>
                  )}
                </div>
              )}
            </div>

            <div style={{ padding: 20, background: '#020617', borderTop: '1px solid #1e293b' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <span style={{ color: '#64748b', fontWeight: 500 }}>Total Cost</span>
                <span style={{ fontSize: 28, fontWeight: 700, color: '#fff' }}>
                  {formatCurrency(totalAmount, currency_symbol)}
                </span>
              </div>
              <button
                onClick={handleSubmit}
                disabled={cart.length === 0 || isSubmitting}
                style={{
                  width: '100%',
                  padding: '16px 0',
                  borderRadius: 12,
                  fontSize: 16,
                  fontWeight: 700,
                  color: '#fff',
                  border: 'none',
                  cursor: cart.length === 0 || isSubmitting ? 'not-allowed' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 8,
                  ...(cart.length === 0 || isSubmitting
                    ? { background: '#1e293b', opacity: 0.6 }
                    : { background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', boxShadow: '0 4px 16px rgba(99,102,241,0.4)' }),
                }}
              >
                {isSubmitting && <span style={{ width: 20, height: 20, border: '2px solid rgba(255,255,255,0.3)', borderTop: '2px solid #fff', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />}
                Record Inward Stock <ArrowRight style={{ width: 20, height: 20 }} />
              </button>
            </div>
          </div>
        </div>
      ) : (
        /* ═══ HISTORY TAB ═══ */
        <div style={{ flex: 1, background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          <div style={{ padding: '16px 20px', borderBottom: '1px solid #e2e8f0', background: '#f8fafc', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h2 style={{ fontSize: 16, fontWeight: 600, color: '#1e293b', margin: 0 }}>Recent Inward Vouchers</h2>
            <button
              onClick={() => setShowClearHistoryModal(true)}
              style={{ background: 'none', border: 'none', color: '#ef4444', fontSize: 13, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}
            >
              <Trash2 style={{ width: 14, height: 14 }} /> Clear History
            </button>
          </div>
          <div style={{ flex: 1, overflow: 'auto' }}>
            {isLoadingHistory ? (
              <div style={{ padding: 40, textAlign: 'center', color: '#94a3b8' }}>Loading history...</div>
            ) : historyData.length === 0 ? (
              <div style={{ padding: 60, display: 'flex', flexDirection: 'column', alignItems: 'center', color: '#94a3b8' }}>
                <Package style={{ width: 48, height: 48, marginBottom: 16, color: '#cbd5e1' }} />
                <p style={{ fontSize: 16, fontWeight: 500 }}>No inward history found</p>
                <p style={{ fontSize: 14, marginTop: 4 }}>Vouchers will appear here once you record them.</p>
              </div>
            ) : (
              <table style={{ width: '100%', fontSize: 14, borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: '#f1f5f9', borderBottom: '2px solid #e2e8f0', position: 'sticky', top: 0 }}>
                    <th style={{ padding: '12px 20px', textAlign: 'left', fontWeight: 600, color: '#475569' }}>Date & Time</th>
                    <th style={{ padding: '12px 20px', textAlign: 'left', fontWeight: 600, color: '#475569' }}>Product</th>
                    <th style={{ padding: '12px 20px', textAlign: 'center', fontWeight: 600, color: '#475569' }}>Received Qty</th>
                    <th style={{ padding: '12px 20px', textAlign: 'right', fontWeight: 600, color: '#475569' }}>Unit Cost</th>
                    <th style={{ padding: '12px 20px', textAlign: 'right', fontWeight: 600, color: '#475569' }}>Total Value</th>
                    <th style={{ padding: '12px 20px', textAlign: 'left', fontWeight: 600, color: '#475569' }}>Supplier</th>
                  </tr>
                </thead>
                <tbody>
                  {historyData.map((row) => (
                    <tr key={row.id} style={{ borderBottom: '1px solid #e2e8f0', background: '#fff' }}>
                      <td style={{ padding: '16px 20px', color: '#64748b', fontSize: 13 }}>
                        {new Date(row.date).toLocaleString('en-PK', { dateStyle: 'medium', timeStyle: 'short' })}
                      </td>
                      <td style={{ padding: '16px 20px' }}>
                        <div style={{ fontWeight: 600, color: '#1e293b' }}>{row.product_name}</div>
                        {row.variant_info !== 'N/A' && (
                          <div style={{ fontSize: 12, color: '#64748b', marginTop: 4, background: '#f1f5f9', display: 'inline-block', padding: '2px 6px', borderRadius: 4 }}>
                            {row.variant_info}
                          </div>
                        )}
                      </td>
                      <td style={{ padding: '16px 20px', textAlign: 'center', fontWeight: 600, color: '#10b981' }}>
                        +{row.received_qty}
                      </td>
                      <td style={{ padding: '16px 20px', textAlign: 'right', color: '#64748b' }}>
                        {formatCurrency(row.cost_price, currency_symbol)}
                      </td>
                      <td style={{ padding: '16px 20px', textAlign: 'right', fontWeight: 600, color: '#1e293b' }}>
                        {formatCurrency(row.total_cost, currency_symbol)}
                      </td>
                      <td style={{ padding: '16px 20px', color: '#64748b' }}>
                        <div style={{ display: 'inline-flex', alignItems: 'center', background: '#e0e7ff', color: '#4338ca', padding: '4px 8px', borderRadius: 6, fontSize: 12, fontWeight: 500 }}>
                          {row.supplier_name || 'Unknown'}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      <AdminConfirmModal
        isOpen={showClearHistoryModal}
        onClose={() => setShowClearHistoryModal(false)}
        onConfirm={async () => {
          setIsClearingHistory(true);
          try {
            await cmd('clear_inward_history');
            toast('Inward history cleared successfully', 'success');
            qc.invalidateQueries({ queryKey: ['inward-history'] });
          } catch (e: any) {
            toast(e.toString(), 'error');
          } finally {
            setIsClearingHistory(false);
            setShowClearHistoryModal(false);
          }
        }}
        title="Clear Inward History?"
        message="Are you sure you want to clear ALL inward stock history? This action cannot be undone and will remove all records from the history list."
        actionLabel="Clear All"
        isDestructive={true}
      />

      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
      </div> {/* End scrollable area */}
    </div>
  );
}
