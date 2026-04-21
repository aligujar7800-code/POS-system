import React, { useState, useCallback, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import Fuse from 'fuse.js';
import { cmd, formatCurrency } from '../lib/utils';
import { useCartStore } from '../stores/cartStore';
import { useSettingsStore } from '../stores/settingsStore';
import { useAuthStore } from '../stores/authStore';
import { SaleDetailsModal } from './Receipts';
import { useBarcode, useGlobalBarcode } from '../hooks/useBarcode';
import { useToast } from '../components/ui/Toaster';
import {
  Search, Plus, Minus, Trash2, X, UserPlus, User,
  CreditCard, Banknote, BookOpen, CheckCircle,
  Scan, ShoppingCart, ChevronDown
} from 'lucide-react';
import { cn } from '../lib/utils';

// ─── Types ───────────────────────────────────────────────────────────────────
interface Product {
  id: number;
  name: string;
  sku: string;
  barcode?: string;
  category_name?: string;
  variant_summary?: string;
  sale_price: number;
  tax_percent: number;
  total_stock: number;
}
interface ProductVariant {
  id: number; product_id: number; size?: string; color?: string;
  quantity: number; variant_barcode?: string; variant_price?: number;
}
interface Customer { id: number; name: string; phone: string; outstanding_balance: number; }

type PaymentMethod = 'cash' | 'card' | 'udhaar' | 'mixed';

// ─── Barcode indicator ────────────────────────────────────────────────────────
function ScannerIndicator() {
  const [active, setActive] = useState(false);
  useEffect(() => {
    function handler() {
      setActive(true);
      setTimeout(() => setActive(false), 600);
    }
    window.addEventListener('barcode-scanned', handler);
    return () => window.removeEventListener('barcode-scanned', handler);
  }, []);
  return (
    <div className={cn('flex items-center gap-1.5 text-xs transition-colors',
      active ? 'text-green-400' : 'text-slate-400')}>
      <Scan className="w-3.5 h-3.5" />
      <span>Scanner {active ? 'Active!' : 'Ready'}</span>
    </div>
  );
}

// ─── Product card ─────────────────────────────────────────────────────────────
function ProductCard({ product, onAdd }: { product: Product; onAdd: (p: Product) => void }) {
  const { currency_symbol } = useSettingsStore();
  const stockColor = product.total_stock === 0 ? 'text-red-500' : product.total_stock <= 5 ? 'text-amber-500' : 'text-green-600';
  return (
    <button
      onClick={() => onAdd(product)}
      disabled={product.total_stock === 0}
      className="card-hover p-3 text-left w-full disabled:opacity-50 disabled:cursor-not-allowed transition-transform hover:scale-[1.01] active:scale-[0.99]"
    >
      <div className="w-full aspect-square bg-slate-100 rounded-lg mb-2 flex items-center justify-center">
        <ShoppingCart className="w-8 h-8 text-slate-300" />
      </div>
      <p className="text-xs font-medium text-slate-800 truncate">{product.name}</p>
      <p className="text-[10px] text-slate-400 truncate">
        {product.category_name && <span className="text-brand-600 font-semibold">[{product.category_name}] </span>}
        #{product.sku}
      </p>
      {product.variant_summary && (
        <p className="text-[10px] text-slate-500 bg-slate-50 px-1.5 py-0.5 rounded border border-slate-100 mt-1 truncate" title={product.variant_summary}>
          {product.variant_summary}
        </p>
      )}
      <div className="flex items-center justify-between mt-1">
        <span className="text-sm font-bold text-brand-600">
          {formatCurrency(product.sale_price, currency_symbol)}
        </span>
        <span className={`text-xs font-medium ${stockColor}`}>{product.total_stock}</span>
      </div>
    </button>
  );
}

// ─── Cart Item row ─────────────────────────────────────────────────────────────
function CartRow({ idx, item, onQty, onRemove, onDiscount }: {
  idx: number;
  item: any;
  onQty: (i: number, q: number) => void;
  onRemove: (i: number) => void;
  onDiscount: (i: number, v: number, t: 'amount' | 'percent') => void;
}) {
  const { currency_symbol } = useSettingsStore();
  const [showDisc, setShowDisc] = useState(false);
  const [discVal, setDiscVal] = useState(item.discount.toString());
  const [discType, setDiscType] = useState<'amount' | 'percent'>(item.discount_type);

  return (
    <div className="border-b border-slate-50 last:border-0">
      <div className="flex items-start gap-2 px-3 py-2.5">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-slate-800 truncate">{item.product_name}</p>
          <p className="text-xs text-slate-400">{formatCurrency(item.unit_price, currency_symbol)} each</p>
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          <button onClick={() => onQty(idx, item.quantity - 1)} className="btn-icon bg-slate-100 hover:bg-slate-200 rounded-lg" disabled={item.quantity <= 1}>
            <Minus className="w-3 h-3" />
          </button>
          <input
            type="text"
            inputMode="numeric"
            value={item.quantity}
            onChange={(e) => onQty(idx, parseInt(e.target.value.replace(/\D/g, '')) || 1)}
            className="w-12 text-center text-sm font-semibold text-slate-800 border border-slate-200 rounded-md py-0.5 focus:border-brand-400 focus:outline-none focus:ring-1 focus:ring-brand-100"
          />
          <button onClick={() => onQty(idx, item.quantity + 1)} className="btn-icon bg-slate-100 hover:bg-slate-200 rounded-lg">
            <Plus className="w-3 h-3" />
          </button>
        </div>
        <div className="text-right flex-shrink-0 w-20">
          <p className="text-sm font-bold text-slate-900">{formatCurrency(item.total_price, currency_symbol)}</p>
          <button onClick={() => setShowDisc(!showDisc)} className="text-xs text-brand-500 hover:underline">
            {item.discount > 0 ? `Disc: ${item.discount}${item.discount_type === 'percent' ? '%' : ''}` : '+ Disc'}
          </button>
        </div>
        <button onClick={() => onRemove(idx)} className="text-slate-300 hover:text-red-500 transition-colors ml-1">
          <Trash2 className="w-4 h-4" />
        </button>
      </div>

      {showDisc && (
        <div className="flex items-center gap-2 px-3 pb-2">
          <input
            type="number"
            value={discVal}
            onChange={(e) => setDiscVal(e.target.value)}
            className="input-sm w-24"
            placeholder="0"
          />
          <select
            value={discType}
            onChange={(e) => setDiscType(e.target.value as 'amount' | 'percent')}
            className="input-sm w-24"
          >
            <option value="amount">Rs.</option>
            <option value="percent">%</option>
          </select>
          <button
            className="btn-sm btn-primary"
            onClick={() => {
              onDiscount(idx, parseFloat(discVal) || 0, discType);
              setShowDisc(false);
            }}
          >Apply</button>
        </div>
      )}
    </div>
  );
}

// ─── Main Sales Page ──────────────────────────────────────────────────────────
export default function SalesPage() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { user } = useAuthStore();
  const { 
    currency_symbol, tax_rate, printer_type, printer_port, printer_baud,
    shop_name, shop_address, shop_phone, shop_logo, shop_email,
    receipt_header, receipt_footer
  } = useSettingsStore();
  const cart = useCartStore();
  const queryClient = useQueryClient();

  const [productSearch, setProductSearch] = useState('');
  const [customerSearch, setCustomerSearch] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('cash');
  const [paidAmount, setPaidAmount] = useState('');
  const [saleNotes, setSaleNotes] = useState('');
  const [showQuickAdd, setShowQuickAdd] = useState(false);
  const [quickName, setQuickName] = useState('');
  const [quickPhone, setQuickPhone] = useState('');
  const [completing, setCompleting] = useState(false);
  const [lastSaleId, setLastSaleId] = useState<number | null>(null);
  const [showVariants, setShowVariants] = useState<Product | null>(null);

  const searchRef = useRef<HTMLInputElement>(null);

  const fmt = (n: number) => formatCurrency(n, currency_symbol);

  // Load all products
  const { data: allProducts = [] } = useQuery<Product[]>({
    queryKey: ['products'],
    queryFn: () => cmd('get_all_products'),
  });

  // Fuzzy search
  const fuse = new Fuse(allProducts, {
    keys: ['name', 'sku', 'barcode'],
    threshold: 0.35,
  });

  const filteredProducts = productSearch
    ? fuse.search(productSearch).map((r) => r.item)
    : allProducts.slice(0, 30);

  // Customer search
  const { data: customers = [] } = useQuery<Customer[]>({
    queryKey: ['customers-search', customerSearch],
    queryFn: () => cmd('search_customers', { query: customerSearch }),
    enabled: customerSearch.length >= 2,
  });

  // Barcode handler
  const handleBarcode = useCallback(async (barcode: string) => {
    try {
      const product = await cmd<Product | null>('get_product_by_barcode', { barcode });
      if (product) {
        // Resolve variant for barcode scanned item
        const variants = await cmd<ProductVariant[]>('get_product_variants', { productId: product.id });
        
        // 1. Try to find the exact variant that matches this barcode
        let variant = variants.find(v => v.variant_barcode === barcode);
        
        // 2. If no exact match (e.g. main product barcode was scanned), check if we need to show variant picker
        if (!variant && variants.length > 0) {
          if (variants.length > 1) {
            // Product has multiple variants, let user pick
            setShowVariants(product);
            return;
          }
          // Only one variant exists, use it
          variant = variants[0];
        }

        const nameStr = variant && (variant.size || variant.color) 
          ? `${product.name} (${[variant.size, variant.color].filter(Boolean).join(' / ')})`
          : product.name;

        cart.addItem({
          product_id: product.id,
          variant_id: variant?.id ?? undefined,
          product_name: nameStr,
          barcode: variant?.variant_barcode || product.barcode,
          quantity: 1,
          unit_price: variant?.variant_price ?? product.sale_price,
          discount: 0,
          discount_type: 'amount',
        });
        toast(`Added: ${nameStr}`, 'success');
      } else {
        toast(`Barcode not found: ${barcode}`, 'error');
      }
    } catch (e) {
      toast('Barcode lookup failed', 'error');
    }
  }, [cart, toast]);

  useBarcode(handleBarcode);

  // Ref to avoid stale closures in keyboard handler
  const completeSaleRef = useRef<() => void>(() => {});
  useEffect(() => { completeSaleRef.current = handleCompleteSale; });

  // Keyboard shortcuts
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'F1') { e.preventDefault(); cart.clearCart(); setPaymentMethod('cash'); setPaidAmount(''); setSaleNotes(''); } // New Sale
      if (e.key === 'F2') { e.preventDefault(); searchRef.current?.focus(); } // Focus search
      if (e.key === 'F10') { e.preventDefault(); completeSaleRef.current(); } // Complete sale (uses ref to avoid stale closure)
      if (e.key === 'Escape') { cart.clearCart(); }
    }
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, []);

  const addProductToCart = async (product: Product) => {
    // Check for variants
    try {
      const variants = await cmd<ProductVariant[]>('get_product_variants', { productId: product.id });
      if (variants.length > 1) {
        setShowVariants(product);
        return;
      }
      const variant = variants[0];
      cart.addItem({
        product_id: product.id,
        variant_id: variant?.id,
        product_name: product.name,
        barcode: product.barcode,
        quantity: 1,
        unit_price: variant?.variant_price ?? product.sale_price,
        discount: 0,
        discount_type: 'amount',
      });
    } catch {
      // Fallback: try to fetch variants if adding directly failed to include it
      try {
        const variants = await cmd<ProductVariant[]>('get_product_variants', { productId: product.id });
        const variant = variants[0];
        cart.addItem({
          product_id: product.id,
          variant_id: variant?.id ?? null,
          product_name: product.name,
          barcode: product.barcode,
          quantity: 1,
          unit_price: variant?.variant_price ?? product.sale_price,
          discount: 0,
          discount_type: 'amount',
        });
      } catch {
        cart.addItem({
          product_id: product.id,
          product_name: product.name,
          barcode: product.barcode,
          quantity: 1,
          unit_price: product.sale_price,
          discount: 0,
          discount_type: 'amount',
        });
      }
    }
  };

  // Computed totals
  const subtotal = cart.subtotal();
  const totalDiscount = cart.totalDiscount();
  const tax = cart.taxAmount(tax_rate);
  const total = cart.grandTotal(tax_rate);
  const paid = parseFloat(paidAmount) || 0;
  const change = Math.max(0, paid - total);
  const udhaar = Math.max(0, total - paid);

  const handleCompleteSale = async () => {
    if (cart.items.length === 0) { toast('Cart is empty', 'error'); return; }

    if ((paymentMethod === 'udhaar' || paid < total) && !cart.customer) {
      toast('Customer is required for Udhaar / partial payment sales', 'error');
      return;
    }

    // Stock is now validated strictly in the backend during create_sale.
    // This prevents overselling even if multiple users are selling at once.

    setCompleting(true);
    try {
      const status =
        paymentMethod === 'udhaar' ? 'udhaar' :
        paid < total ? 'partial' : 'paid';

      const [id, invoice] = await cmd<[number, string]>('create_sale', {
        payload: {
          customer_id: cart.customer?.id ?? null,
          items: cart.items.map((i) => ({
            product_id: i.product_id,
            variant_id: i.variant_id ?? null,
            product_name: i.product_name,
            barcode: i.barcode ?? null,
            quantity: i.quantity,
            unit_price: i.unit_price,
            discount: i.discount,
            total_price: i.total_price,
          })),
          subtotal,
          discount_amount: totalDiscount,
          discount_percent: subtotal > 0 ? (totalDiscount / subtotal) * 100 : 0,
          tax_amount: tax,
          total_amount: total,
          paid_amount: paymentMethod === 'udhaar' ? 0 : paid,
          change_amount: change,
          payment_method: paymentMethod,
          status,
          notes: saleNotes || null,
          created_by: user?.id ?? null,
        }
      });

      setLastSaleId(id);
      toast(`Sale complete! Invoice: ${invoice}`, 'success');
      
      // Instantly refresh other pages in background
      queryClient.invalidateQueries({ queryKey: ['sales'] });
      queryClient.invalidateQueries({ queryKey: ['products'] });
      queryClient.invalidateQueries({ queryKey: ['low-stock'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      queryClient.invalidateQueries({ queryKey: ['financial-ledger'] });
      queryClient.invalidateQueries({ queryKey: ['suppliers'] });
      queryClient.invalidateQueries({ queryKey: ['customers'] });
      queryClient.invalidateQueries({ queryKey: ['total-udhaar'] });
      
      // Auto-trigger invoice print
      if (printer_type && printer_type !== 'none') {
        cmd('print_sale_by_id', { 
          id: id,
          config: {
            printer_type,
            port: printer_port,
            baud_rate: printer_baud,
          }
        }).catch(e => {
          console.error("Print failed:", e);
          toast("Failed to print receipt: " + e.toString(), "error");
        });
      }

      cart.clearCart();
      setPaidAmount('');
      setSaleNotes('');
      setPaymentMethod('cash');
    } catch (err: any) {
      // Show full error message to user so they know if it's an accounting fail
      toast(err.toString(), 'error'); 
    } finally {
      setCompleting(false);
    }
  };

  const handleQuickAdd = async () => {
    if (!quickName || !quickPhone) return;
    try {
      const id = await cmd<number>('create_customer', {
        payload: { name: quickName, phone: quickPhone, address: null, notes: null }
      });
      const customer = await cmd<Customer>('get_customer_by_id', { id });
      cart.setCustomer(customer);
      setShowQuickAdd(false);
      setQuickName(''); setQuickPhone('');
      toast('Customer added', 'success');
    } catch (e: any) {
      toast(e.toString(), 'error');
    }
  };

  return (
    <div className="flex h-full overflow-hidden">
      {/* ── LEFT: Product search + grid ─────────────────────────────── */}
      <div className="w-[32%] flex flex-col border-r border-slate-200 bg-white overflow-hidden">
        <div className="p-3 border-b border-slate-100">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              ref={searchRef}
              type="text"
              value={productSearch}
              onChange={(e) => setProductSearch(e.target.value)}
              placeholder={t('sales.searchProduct')}
              className="input pl-9"
              id="product-search"
            />
          </div>
          <div className="flex items-center justify-between mt-2">
            <span className="text-xs text-slate-400">{filteredProducts.length} products</span>
            <ScannerIndicator />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-2 grid grid-cols-2 gap-2 content-start">
          {filteredProducts.map((p) => (
            <ProductCard key={p.id} product={p} onAdd={addProductToCart} />
          ))}
        </div>
      </div>

      {/* ── CENTER: Cart ─────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col overflow-hidden bg-slate-50">
        <div className="px-4 py-3 bg-white border-b border-slate-100 flex items-center justify-between">
          <h2 className="font-semibold text-slate-700 flex items-center gap-2">
            <ShoppingCart className="w-4 h-4" />
            {t('sales.cart')} ({cart.items.length})
          </h2>
          {cart.items.length > 0 && (
            <button onClick={() => cart.clearCart()} className="btn-ghost btn-sm text-red-500">
              <Trash2 className="w-3.5 h-3.5" /> Clear
            </button>
          )}
        </div>

        <div className="flex-1 overflow-y-auto bg-white mx-3 mt-3 rounded-xl border border-slate-100">
          {cart.items.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-slate-400 py-16">
              <ShoppingCart className="w-12 h-12 mb-3 opacity-30" />
              <p className="text-sm">{t('sales.emptyCart')}</p>
              <p className="text-xs mt-1">Scan or click a product</p>
            </div>
          ) : (
            cart.items.map((item, idx) => (
              <CartRow
                key={idx}
                idx={idx}
                item={item}
                onQty={cart.updateQty}
                onRemove={cart.removeItem}
                onDiscount={cart.updateItemDiscount}
              />
            ))
          )}
        </div>

        {/* Cart discount */}
        {cart.items.length > 0 && (
          <div className="bg-white mx-3 mt-2 rounded-xl border border-slate-100 px-4 py-2 flex items-center gap-3">
            <span className="text-xs text-slate-500 flex-shrink-0">Cart Discount:</span>
            <input
              type="number"
              value={cart.cartDiscount.value || ''}
              onChange={(e) => cart.setCartDiscount({ ...cart.cartDiscount, value: parseFloat(e.target.value) || 0 })}
              className="input-sm w-24"
              placeholder="0"
            />
            <select
              value={cart.cartDiscount.type}
              onChange={(e) => cart.setCartDiscount({ ...cart.cartDiscount, type: e.target.value as 'amount' | 'percent' })}
              className="input-sm w-20"
            >
              <option value="amount">Rs.</option>
              <option value="percent">%</option>
            </select>
            {cart.cartDiscountAmount() > 0 && (
              <span className="text-xs text-green-600 ml-auto">-{fmt(cart.cartDiscountAmount())}</span>
            )}
          </div>
        )}

        <div className="px-3 pb-3 mt-2" />
      </div>

      {/* ── RIGHT: Customer + Payment ─────────────────────────────────── */}
      <div className="w-[32%] flex flex-col border-l border-slate-200 bg-white overflow-y-auto">
        {/* Customer */}
        <div className="p-4 border-b border-slate-100">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-semibold text-slate-700 flex items-center gap-1.5">
              <User className="w-4 h-4" /> {t('sales.customer')}
            </h3>
            <button onClick={() => setShowQuickAdd(true)} className="btn-ghost btn-sm">
              <UserPlus className="w-3.5 h-3.5" /> {t('sales.quickAdd')}
            </button>
          </div>

          {cart.customer ? (
            <div className="flex items-center justify-between bg-brand-50 border border-brand-100 rounded-lg px-3 py-2">
              <div>
                <p className="text-sm font-semibold text-slate-800">{cart.customer.name}</p>
                <p className="text-xs text-slate-500">{cart.customer.phone}</p>
                {cart.customer.outstanding_balance > 0 && (
                  <p className="text-xs text-red-500 font-medium mt-0.5">
                    Udhaar: {fmt(cart.customer.outstanding_balance)}
                  </p>
                )}
              </div>
              <button onClick={() => cart.setCustomer(null)} className="text-slate-400 hover:text-red-500">
                <X className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="text"
                value={customerSearch}
                onChange={(e) => setCustomerSearch(e.target.value)}
                placeholder={t('sales.searchCustomer')}
                className="input pl-9 text-sm"
                id="customer-search"
              />
              {customerSearch.length >= 2 && customers.length > 0 && (
                <div className="absolute top-full left-0 right-0 z-10 bg-white border border-slate-200 rounded-lg shadow-card-hover mt-1">
                  {customers.map((c) => (
                    <button
                      key={c.id}
                      onClick={() => { cart.setCustomer(c); setCustomerSearch(''); }}
                      className="w-full text-left px-3 py-2 hover:bg-slate-50 text-sm"
                    >
                      <p className="font-medium">{c.name}</p>
                      <p className="text-xs text-slate-400">{c.phone}
                        {c.outstanding_balance > 0 && <span className="text-red-500 ml-2">Udhaar: {fmt(c.outstanding_balance)}</span>}
                      </p>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Payment method */}
        <div className="p-4 border-b border-slate-100">
          <label className="label">{t('sales.amountPaid')}</label>
          <div className="grid grid-cols-4 gap-1 mb-3">
            {(['cash', 'card', 'udhaar', 'mixed'] as PaymentMethod[]).map((m) => (
              <button
                key={m}
                onClick={() => setPaymentMethod(m)}
                className={cn('rounded-lg py-1.5 text-xs font-medium capitalize transition-colors',
                  paymentMethod === m
                    ? 'bg-brand-600 text-white'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                )}
              >
                {t(`sales.${m}`)}
              </button>
            ))}
          </div>

          {paymentMethod !== 'udhaar' && (
            <div>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-slate-400">Rs.</span>
                <input
                  type="number"
                  value={paidAmount}
                  onChange={(e) => setPaidAmount(e.target.value)}
                  placeholder="0"
                  className="input pl-10 text-lg font-bold"
                  id="paid-amount"
                />
              </div>
              {/* Quick cash buttons */}
              <div className="grid grid-cols-4 gap-1 mt-2">
                {[500, 1000, 2000, 5000].map((amt) => (
                  <button
                    key={amt}
                    onClick={() => setPaidAmount(String(amt))}
                    className="btn-secondary btn-sm text-xs"
                  >
                    {amt}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Totals */}
        <div className="p-4 space-y-2 flex-1">
          <div className="flex justify-between text-sm text-slate-600">
            <span>{t('sales.subtotal')}</span>
            <span>{fmt(subtotal)}</span>
          </div>
          {totalDiscount > 0 && (
            <div className="flex justify-between text-sm text-green-600">
              <span>{t('sales.discount')}</span>
              <span>-{fmt(totalDiscount)}</span>
            </div>
          )}
          {tax > 0 && (
            <div className="flex justify-between text-sm text-slate-600">
              <span>{t('sales.tax')}</span>
              <span>{fmt(tax)}</span>
            </div>
          )}
          <div className="flex justify-between font-bold text-slate-900 text-lg border-t border-slate-100 pt-2">
            <span>{t('sales.grandTotal')}</span>
            <span className="text-brand-600">{fmt(total)}</span>
          </div>
          {paymentMethod !== 'udhaar' && paid > 0 && (
            <>
              <div className="flex justify-between text-sm text-slate-600">
                <span>Paid</span>
                <span>{fmt(paid)}</span>
              </div>
              {change > 0 && (
                <div className="flex justify-between text-sm font-semibold text-green-600">
                  <span>{t('sales.change')}</span>
                  <span>{fmt(change)}</span>
                </div>
              )}
              {udhaar > 0 && paid > 0 && (
                <div className="flex justify-between text-sm font-semibold text-red-500">
                  <span>Udhaar Balance</span>
                  <span>{fmt(udhaar)}</span>
                </div>
              )}
            </>
          )}

          <textarea
            value={saleNotes}
            onChange={(e) => setSaleNotes(e.target.value)}
            placeholder="Notes (optional)"
            className="input text-xs mt-2 h-16 resize-none"
          />
        </div>

        {/* Complete Sale */}
        <div className="p-4 border-t border-slate-100 space-y-2">
          <button
            onClick={handleCompleteSale}
            disabled={completing || cart.items.length === 0}
            className="btn-primary w-full btn-lg"
            id="complete-sale-btn"
          >
            {completing
              ? <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              : <CheckCircle className="w-5 h-5" />
            }
            {t('sales.completeSale')} <span className="text-xs opacity-70 ml-1">(F10)</span>
          </button>
          <button
            onClick={() => cart.clearCart()}
            className="btn-secondary w-full"
          >
            <X className="w-4 h-4" /> {t('sales.newSale')} <span className="text-xs opacity-50 ml-1">(F1)</span>
          </button>
        </div>
      </div>

      {/* Quick Add Customer Dialog */}
      {showQuickAdd && (
        <>
          <div className="overlay" onClick={() => setShowQuickAdd(false)} />
          <div className="dialog w-80">
            <h2 className="font-semibold text-slate-800 mb-4">Quick Add Customer</h2>
            <div className="space-y-3">
              <div>
                <label className="label">Name *</label>
                <input value={quickName} onChange={(e) => setQuickName(e.target.value)} className="input" autoFocus />
              </div>
              <div>
                <label className="label">Phone *</label>
                <input value={quickPhone} onChange={(e) => setQuickPhone(e.target.value)} className="input" />
              </div>
              <div className="flex gap-2 pt-2">
                <button onClick={handleQuickAdd} className="btn-primary flex-1">Add</button>
                <button onClick={() => setShowQuickAdd(false)} className="btn-secondary flex-1">Cancel</button>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Variant selector dialog */}
      {showVariants && (
        <VariantDialog
          product={showVariants}
          onSelect={(v) => {
            cart.addItem({
              product_id: showVariants.id,
              variant_id: v.id,
              product_name: `${showVariants.name} (${[v.size, v.color].filter(Boolean).join(', ')})`,
              quantity: 1,
              unit_price: v.variant_price ?? showVariants.sale_price,
              discount: 0,
              discount_type: 'amount',
            });
            setShowVariants(null);
          }}
          onClose={() => setShowVariants(null)}
        />
      )}
      {lastSaleId && (
        <SaleDetailsModal
          saleId={lastSaleId}
          onClose={() => setLastSaleId(null)}
          onReprint={async () => {
            if (printer_type && printer_type !== 'none') {
              try {
                await cmd('print_sale_by_id', { 
                  id: lastSaleId,
                  config: { printer_type, port: printer_port, baud_rate: printer_baud }
                });
                toast("Receipt sent to printer", "success");
              } catch (e: any) {
                toast("Print failed: " + e.toString(), "error");
              }
            }
          }}
          onReturn={() => {
            toast("Please go to Receipts tab to process returns", "info");
            setLastSaleId(null);
          }}
          currency_symbol={currency_symbol}
          printer_type={printer_type}
          shop_name={shop_name}
          shop_address={shop_address}
          shop_phone={shop_phone}
          shop_logo={shop_logo}
          shop_email={shop_email}
          receipt_header={receipt_header}
          receipt_footer={receipt_footer}
        />
      )}
    </div>
  );
}

function VariantDialog({ product, onSelect, onClose }: {
  product: Product;
  onSelect: (v: ProductVariant) => void;
  onClose: () => void;
}) {
  const { data: variants = [] } = useQuery<ProductVariant[]>({
    queryKey: ['variants', product.id],
    queryFn: () => cmd('get_product_variants', { productId: product.id }),
  });
  const { currency_symbol } = useSettingsStore();

  return (
    <>
      <div className="overlay" onClick={onClose} />
      <div className="dialog w-96">
        <h2 className="font-semibold text-slate-800 mb-1">Select Variant</h2>
        <p className="text-sm text-slate-500 mb-4">{product.name}</p>
        <div className="space-y-2 max-h-80 overflow-y-auto">
          {variants.map((v) => (
            <button
              key={v.id}
              onClick={() => onSelect(v)}
              disabled={v.quantity === 0}
              className="w-full flex items-center justify-between px-4 py-3 rounded-xl border border-slate-200 hover:border-brand-300 hover:bg-brand-50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed text-left"
            >
              <div>
                <p className="font-medium text-sm">{[v.size, v.color].filter(Boolean).join(' / ')}</p>
                <p className="text-xs text-slate-400">{v.quantity} in stock</p>
              </div>
              <span className="font-bold text-brand-600 text-sm">
                {formatCurrency(v.variant_price ?? product.sale_price, currency_symbol)}
              </span>
            </button>
          ))}
        </div>
        <button onClick={onClose} className="btn-secondary w-full mt-4">Cancel</button>
      </div>
    </>
  );
}
