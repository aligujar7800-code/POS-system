import React, { useState, useCallback, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import Fuse from 'fuse.js';
import { cmd, formatCurrency, isProductService } from '../lib/utils';
import { backgroundCreateOrder, isShopifyConfigured } from '../lib/shopify';
import { useCartStore } from '../stores/cartStore';
import { useSettingsStore } from '../stores/settingsStore';
import { useAuthStore } from '../stores/authStore';
import { useVoiceCommandParser } from '../hooks/useVoiceCommandParser';
import { SaleDetailsModal } from './Receipts';
import { useBarcode, useGlobalBarcode } from '../hooks/useBarcode';
import { useToast } from '../components/ui/Toaster';
import PaymentFlowModal from '../components/ui/PaymentFlowModal';
import { useBusinessStore } from '../stores/businessStore';
import DraggableCamera from '../components/DraggableCamera';
import SmartProductImportModal from '../components/SmartProductImportModal';
import { playSuccessSound, playErrorSound } from '../lib/audio';
import ModuleFields from '../components/modules/ModuleFields';
import jazzcashLogo from '../assets/jazzcash.png';
import easypaisaLogo from '../assets/easypaisa.png';
import hblLogo from '../assets/hbl.png';
import {
  Search, Plus, Minus, Trash2, X, UserPlus, User,
  Banknote, BookOpen, CheckCircle,
  Scan, ShoppingCart, ChevronDown, CreditCard, Store
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
  product_meta?: string;
  image_path?: string;
}
interface ProductVariant {
  id: number; product_id: number; size?: string; color?: string;
  quantity: number; variant_barcode?: string; legacy_barcode?: string; variant_price?: number;
}
interface Customer { id: number; name: string; phone: string; outstanding_balance: number; }

type PaymentMethod = 'cash' | 'card' | 'udhaar' | 'mixed' | 'jazzcash' | 'easypaisa' | 'hbl_pay';

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
import { useImageSrc } from '../lib/image';

function ProductThumbnail({ imagePath }: { imagePath?: string }) {
  const src = useImageSrc(imagePath);
  if (!src) {
    return (
      <div className="w-full aspect-square bg-slate-100 rounded-lg mb-2 flex items-center justify-center text-slate-300">
        <ShoppingCart className="w-8 h-8" />
      </div>
    );
  }
  return (
    <div className="w-full aspect-square bg-slate-100 rounded-lg mb-2 flex items-center justify-center overflow-hidden">
      <img src={src} alt="Thumbnail" loading="lazy" className="w-full h-full object-cover" />
    </div>
  );
}

function ProductCard({ product, onAdd }: { product: Product; onAdd: (p: Product) => void }) {
  const { currency_symbol } = useSettingsStore();
  const activeModule = useBusinessStore(s => s.getActiveModule)();
  const isService = isProductService(product, activeModule);
  const stockColor = isService ? 'text-purple-600' : (product.total_stock === 0 ? 'text-red-500' : product.total_stock <= 5 ? 'text-amber-500' : 'text-green-600');
  
  return (
    <button
      onClick={() => onAdd(product)}
      disabled={!isService && product.total_stock === 0}
      className="card-hover p-3 text-left w-full disabled:opacity-50 disabled:cursor-not-allowed transition-transform hover:scale-[1.01] active:scale-[0.99]"
    >
      <ProductThumbnail imagePath={product.image_path} />
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
        <span className={`text-xs font-bold ${stockColor}`}>{isService ? 'Service' : product.total_stock}</span>
      </div>
    </button>
  );
}

// ─── Cart Item row ─────────────────────────────────────────────────────────────
function CartRow({ idx, item, onQty, onRemove, onDiscount, onUpdateMeta, cartFields }: {
  idx: number;
  item: any;
  onQty: (i: number, q: number) => void;
  onRemove: (i: number) => void;
  onDiscount: (i: number, v: number, t: 'amount' | 'percent') => void;
  onUpdateMeta: (i: number, k: string, v: any) => void;
  cartFields: any[];
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

      {/* Module specific cart fields */}
      {cartFields.length > 0 && (
        <div className="px-3 pb-2 pt-1 border-t border-slate-50 mt-1 bg-slate-50/50">
          <ModuleFields
            fields={cartFields}
            values={item.item_meta || {}}
            onChange={(key, val) => onUpdateMeta(idx, key, val)}
            compact
          />
        </div>
      )}
    </div>
  );
}

function VapeSaleModal({ 
  product, 
  variant, 
  onClose, 
  onConfirm 
}: { 
  product: Product; 
  variant: ProductVariant | null; 
  onClose: () => void; 
  onConfirm: (mode: 'bottle' | 'loose', qty: number) => void;
}) {
  const [mode, setMode] = useState<'bottle' | 'loose'>('bottle');
  const [qty, setQty] = useState('1');

  return (
    <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-md overflow-hidden shadow-2xl">
        <div className="p-6">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-xl font-bold text-slate-800">Select Sale Mode</h2>
            <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-full transition-colors">
              <X className="w-5 h-5 text-slate-400" />
            </button>
          </div>
          
          <p className="text-sm text-slate-600 mb-6">
            <span className="font-bold">{product.name}</span>
            {variant && variant.size && ` - ${variant.size}ML`}
          </p>

          <div className="grid grid-cols-2 gap-4 mb-6">
            <button
              onClick={() => { setMode('bottle'); setQty('1'); }}
              className={cn("p-4 rounded-xl border-2 text-center transition-all", mode === 'bottle' ? "border-brand-500 bg-brand-50 text-brand-700" : "border-slate-200 text-slate-500 hover:border-slate-300")}
            >
              <div className="font-bold mb-1">Full Bottle</div>
              <div className="text-xs opacity-80">Sell sealed bottle</div>
            </button>
            <button
              onClick={() => { setMode('loose'); setQty(''); }}
              className={cn("p-4 rounded-xl border-2 text-center transition-all", mode === 'loose' ? "border-brand-500 bg-brand-50 text-brand-700" : "border-slate-200 text-slate-500 hover:border-slate-300")}
            >
              <div className="font-bold mb-1">Loose Fill</div>
              <div className="text-xs opacity-80">Refill customer pod</div>
            </button>
          </div>

          <div className="mb-6">
            <label className="label text-sm font-bold text-slate-700 mb-2">
              {mode === 'bottle' ? 'Number of Bottles' : 'Amount Filled (ML)'}
            </label>
            <input 
              type="number" 
              value={qty} 
              onChange={e => setQty(e.target.value)} 
              className="input text-lg font-bold" 
              placeholder={mode === 'bottle' ? "1" : "e.g. 35"}
              autoFocus
            />
          </div>

          <button 
            onClick={() => onConfirm(mode, parseInt(qty) || 0)} 
            disabled={!parseInt(qty) || parseInt(qty) <= 0}
            className="btn-primary w-full py-3 text-lg"
          >
            Add to Cart
          </button>
        </div>
      </div>
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
    receipt_header, receipt_footer,
    logo_width, logo_height, logo_align, receipt_font,
    camera_sale_mode, camera_scan_interval
  } = useSettingsStore();
  const cart = useCartStore();
  const queryClient = useQueryClient();
  const { parseCommand } = useVoiceCommandParser();

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
  const [autoPrintSaleId, setAutoPrintSaleId] = useState<number | null>(null);
  const [showVariants, setShowVariants] = useState<Product | null>(null);
  const [showPaymentFlow, setShowPaymentFlow] = useState<'jazzcash' | 'easypaisa' | 'hbl_pay' | 'stripe' | null>(null);
  const [pendingGatewayTxnId, setPendingGatewayTxnId] = useState<number | null>(null);
  const [globalSaleMeta, setGlobalSaleMeta] = useState<Record<string, any>>({});
  const [vapeModal, setVapeModal] = useState<{product: Product, variant: ProductVariant | null} | null>(null);
  
  // Camera Sale Mode State
  const lastScanTimeRef = useRef(0);
  const [showCamera, setShowCamera] = useState(true); // local visibility — closing X doesn't change global setting
  const [missingProductBarcode, setMissingProductBarcode] = useState<string | null>(null);

  // Re-show camera when user re-enables the setting (e.g. from Settings page)
  useEffect(() => {
    if (camera_sale_mode) setShowCamera(true);
  }, [camera_sale_mode]);

  const activeModule = useBusinessStore(s => s.getActiveModule)();
  const globalSaleFields = activeModule.saleFields.filter(f => !f.showInCart);

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
  const handleBarcode = useCallback(async (scannedCode: string) => {
    const now = Date.now();
    if (now - lastScanTimeRef.current < (camera_scan_interval || 2000)) {
      return; // Debounce
    }
    lastScanTimeRef.current = now;

    let barcode = scannedCode;
    let overridePrice: number | null = null;
    
    if (barcode.includes('$')) {
      const parts = barcode.split('$');
      if (parts.length === 2) {
        barcode = parts[0];
        const parsedPrice = parseFloat(parts[1]);
        if (!isNaN(parsedPrice)) {
          overridePrice = parsedPrice;
        }
      }
    }

    try {
      const product = await cmd<Product | null>('get_product_by_barcode', { barcode });
      if (product) {
        playSuccessSound();
        // Resolve variant for barcode scanned item
        const variants = await cmd<ProductVariant[]>('get_product_variants', { productId: product.id });
        
        // 1. Try to find the exact variant that matches this barcode
        let variant = variants.find(v => v.variant_barcode === barcode || v.legacy_barcode === barcode);
        
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
          unit_price: overridePrice !== null ? overridePrice : (variant?.variant_price ?? product.sale_price),
          discount: 0,
          discount_type: 'amount',
        });
        toast(`Added: ${nameStr}`, 'success');
      } else {
        playErrorSound();
        setMissingProductBarcode(barcode);
      }
    } catch (e) {
      toast('Barcode lookup failed', 'error');
    }
  }, [cart, toast, camera_scan_interval]);

  useBarcode(handleBarcode);

  // Ref to avoid stale closures in keyboard handler
  const completeSaleRef = useRef<() => void>(() => {});
  useEffect(() => { completeSaleRef.current = handleCompleteSale; });

  // Voice Command Variant Listener
  useEffect(() => {
    const handleVariant = (e: any) => {
      if (e.detail?.product) {
        setShowVariants(e.detail.product);
      }
    };
    window.addEventListener('VOICE_COMMAND_REQUIRE_VARIANT', handleVariant);
    return () => window.removeEventListener('VOICE_COMMAND_REQUIRE_VARIANT', handleVariant);
  }, []);

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
      const variant = variants[0] || null;
      if (activeModule.features.includes('vape_sale_mode')) {
        let isDevice = false;
        try { isDevice = JSON.parse(product.product_meta || '{}').vape_product_type === 'device'; } catch {}
        if (!isDevice) {
          setVapeModal({ product, variant });
          return;
        }
      }
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
  const totalDiscount = cart.totalDiscount() + cart.cartDiscountAmount();
  const tax = cart.taxAmount(tax_rate);
  const total = cart.grandTotal(tax_rate);
  const paid = parseFloat(paidAmount) || 0;
  const change = Math.max(0, paid - total);
  const udhaar = Math.max(0, total - paid);

  // Automatically fill the "Amount Paid" field with the total amount
  // so the cashier doesn't have to type it manually for full payments.
  useEffect(() => {
    if (cart.items.length > 0) {
      setPaidAmount(total.toString());
    } else {
      setPaidAmount('');
    }
  }, [total, cart.items.length]);

  const handleCompleteSale = async () => {
    if (cart.items.length === 0) { toast('Cart is empty', 'error'); return; }

    if ((paymentMethod === 'udhaar' || paid < total) && !cart.customer) {
      toast('Customer is required for Udhaar / partial payment sales', 'error');
      return;
    }

    // For digital gateway payments, open the payment flow modal first
    if (['jazzcash', 'easypaisa', 'hbl_pay'].includes(paymentMethod)) {
      setShowPaymentFlow(paymentMethod as any);
      return;
    }

    // Stock is now validated strictly in the backend during create_sale.
    // This prevents overselling even if multiple users are selling at once.

    setCompleting(true);
    try {
      const status =
        paymentMethod === 'udhaar' ? 'udhaar' :
        paid < total ? 'partial' : 'paid';

      const metaNotes = Object.keys(globalSaleMeta).length > 0 ? Object.entries(globalSaleMeta).map(([k, v]) => `${k}: ${v}`).join(' | ') : null;
      const finalNotes = [saleNotes, metaNotes].filter(Boolean).join('\n');

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
            item_meta: i.item_meta && Object.keys(i.item_meta).length > 0 ? JSON.stringify(i.item_meta) : null,
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
          notes: finalNotes || null,
          created_by: user?.id ?? null,
        }
      });

      setAutoPrintSaleId(id);
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
      queryClient.invalidateQueries({ queryKey: ['sales-report'] });
      queryClient.invalidateQueries({ queryKey: ['pl'] });
      queryClient.invalidateQueries({ queryKey: ['pl-statement'] });
      queryClient.invalidateQueries({ queryKey: ['top-products'] });
      queryClient.invalidateQueries({ queryKey: ['profit-by-product'] });

      // Shopify: Create order in background (non-blocking)
      isShopifyConfigured().then(configured => {
        if (configured) {
          cmd<Record<string, string>>('get_all_settings').then(s => {
            if (s?.shopify_auto_sync === '1') {
              backgroundCreateOrder(id);
            }
          });
        }
      });
      

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
                onUpdateMeta={cart.updateItemMeta}
                cartFields={activeModule.saleFields.filter(f => f.showInCart)}
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

        <div className="px-3 pb-3 mt-2">
          {/* Smart Input Bar */}
          <form
            className="flex items-center gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              const input = e.currentTarget.elements.namedItem('smartInput') as HTMLInputElement;
              if (input.value.trim()) {
                parseCommand(input.value, true);
                input.value = '';
              }
            }}
          >
            <input 
              name="smartInput"
              type="text" 
              placeholder="Type items here (e.g. 2 chips and 1 amoxicillin) and press Enter..." 
              className="flex-1 input text-sm bg-white border-brand-200 focus:border-brand-500 focus:ring-1 focus:ring-brand-500 rounded-xl px-4 py-2"
              autoComplete="off"
            />
            <button type="submit" className="btn-primary rounded-xl px-4 py-2 text-sm font-medium whitespace-nowrap">
              Add Items
            </button>
          </form>
        </div>
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
          {/* Primary methods */}
          <div className="grid grid-cols-4 gap-1 mb-2">
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
          {/* Digital payment gateways */}
          <div className="grid grid-cols-3 gap-1 mb-3">
            <button
              onClick={() => setPaymentMethod('jazzcash')}
              className={cn('rounded-lg py-1.5 text-xs font-bold transition-colors flex items-center justify-center gap-1',
                paymentMethod === 'jazzcash'
                  ? 'bg-red-600 text-white shadow-lg shadow-red-200'
                  : 'bg-white text-red-700 hover:bg-red-50 border border-red-100'
              )}
            >
              <img src={jazzcashLogo} className="w-4 h-4 object-contain" /> JazzCash
            </button>
            <button
              onClick={() => setPaymentMethod('easypaisa')}
              className={cn('rounded-lg py-1.5 text-xs font-bold transition-colors flex items-center justify-center gap-1',
                paymentMethod === 'easypaisa'
                  ? 'bg-green-600 text-white shadow-lg shadow-green-200'
                  : 'bg-white text-green-700 hover:bg-green-50 border border-green-100'
              )}
            >
              <img src={easypaisaLogo} className="w-4 h-4 object-contain" /> EasyPaisa
            </button>
            <button
              onClick={() => setPaymentMethod('hbl_pay')}
              className={cn('rounded-lg py-1.5 text-xs font-bold transition-colors flex items-center justify-center gap-1',
                paymentMethod === 'hbl_pay'
                  ? 'bg-blue-800 text-white shadow-lg shadow-blue-200'
                  : 'bg-white text-blue-800 hover:bg-blue-50 border border-blue-100'
              )}
            >
              <img src={hblLogo} className="w-4 h-4 object-contain" /> HBL Pay
            </button>
          </div>

          {!['udhaar', 'jazzcash', 'easypaisa', 'hbl_pay'].includes(paymentMethod) && (
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

          {['jazzcash', 'easypaisa', 'hbl_pay'].includes(paymentMethod) && (
            <div className="bg-slate-50 rounded-xl p-3 text-center">
              <p className="text-xs text-slate-500">Full amount will be charged via {paymentMethod === 'jazzcash' ? 'JazzCash' : paymentMethod === 'easypaisa' ? 'EasyPaisa' : 'HBL Pay'}</p>
              <p className="text-lg font-bold text-slate-800 mt-1">{fmt(total)}</p>
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

          {globalSaleFields.length > 0 && (
            <div className="mt-3 pt-3 border-t border-slate-100 bg-slate-50 -mx-4 px-4 pb-3">
              <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-3">
                {activeModule.name} Details
              </p>
              <ModuleFields
                fields={globalSaleFields}
                values={globalSaleMeta}
                onChange={(key, val) => setGlobalSaleMeta(prev => ({ ...prev, [key]: val }))}
                compact
              />
            </div>
          )}
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
            if (activeModule.features.includes('vape_sale_mode')) {
              let isDevice = false;
              try { isDevice = JSON.parse(showVariants.product_meta || '{}').vape_product_type === 'device'; } catch {}
              if (!isDevice) {
                setVapeModal({ product: showVariants, variant: v });
                setShowVariants(null);
                return;
              }
            }
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

      {/* Vape Modal */}
      {vapeModal && (
        <VapeSaleModal
          product={vapeModal.product}
          variant={vapeModal.variant}
          onClose={() => setVapeModal(null)}
          onConfirm={(mode, qty) => {
            const variant = vapeModal.variant;
            const product = vapeModal.product;
            const nameStr = variant && (variant.size || variant.color) 
              ? `${product.name} (${[variant.size, variant.color].filter(Boolean).join(', ')})`
              : product.name;

            if (mode === 'bottle') {
              cart.addItem({
                product_id: product.id,
                variant_id: variant?.id,
                product_name: `${nameStr} [Bottle]`,
                barcode: variant?.variant_barcode || product.barcode,
                quantity: qty,
                unit_price: variant?.variant_price ?? product.sale_price,
                discount: 0,
                discount_type: 'amount',
                item_meta: { sale_mode: 'bottle', bottle_ml: parseInt(variant?.size || '1') || 1 }
              });
            } else {
              cart.addItem({
                product_id: product.id,
                variant_id: variant?.id,
                product_name: `${nameStr} [Loose]`,
                barcode: variant?.variant_barcode || product.barcode,
                quantity: qty,
                unit_price: product.sale_price, // product.sale_price is per-ml
                discount: 0,
                discount_type: 'amount',
                item_meta: { sale_mode: 'loose' }
              });
            }
            setVapeModal(null);
          }}
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
          logo_width={logo_width}
          logo_height={logo_height}
          logo_align={logo_align}
          receipt_font={receipt_font}
        />
      )}
      {autoPrintSaleId && (
        <SaleDetailsModal
          saleId={autoPrintSaleId}
          onClose={() => setAutoPrintSaleId(null)}
          onReprint={async () => {
            if (!printer_type || printer_type === 'none') return;
            try {
              await cmd('print_sale_by_id', {
                id: autoPrintSaleId,
                config: {
                  printer_type,
                  port: printer_port,
                  baud_rate: printer_baud,
                }
              });
            } catch (e: any) {
              toast("Print failed: " + e.toString(), "error");
            }
          }}
          onReturn={() => {}}
          currency_symbol={currency_symbol}
          printer_type={printer_type}
          shop_name={shop_name}
          shop_address={shop_address}
          shop_phone={shop_phone}
          shop_logo={shop_logo}
          shop_email={shop_email}
          receipt_header={receipt_header}
          receipt_footer={receipt_footer}
          logo_width={logo_width}
          logo_height={logo_height}
          logo_align={logo_align}
          receipt_font={receipt_font}
          autoPrint={true}
        />
      )}

      {/* Payment Gateway Flow Modal */}
      {showPaymentFlow && (
        <PaymentFlowModal
          gateway={showPaymentFlow}
          amount={total}
          invoiceNumber={`PENDING-${Date.now()}`}
          currencySymbol={currency_symbol}
          onSuccess={async (txnId, gatewayRef) => {
            setPendingGatewayTxnId(txnId);
            setShowPaymentFlow(null);
            // Now create the sale with gateway payment method
            setCompleting(true);
            try {
              const metaNotes = Object.keys(globalSaleMeta).length > 0 ? Object.entries(globalSaleMeta).map(([k, v]) => `${k}: ${v}`).join(' | ') : null;
              const gatewayNote = gatewayRef ? `Gateway Ref: ${gatewayRef || txnId}` : `Gateway Ref: ${txnId}`;
              const finalNotes = [saleNotes, metaNotes, gatewayNote].filter(Boolean).join('\n');

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
                    item_meta: i.item_meta && Object.keys(i.item_meta).length > 0 ? JSON.stringify(i.item_meta) : null,
                  })),
                  subtotal,
                  discount_amount: totalDiscount,
                  discount_percent: subtotal > 0 ? (totalDiscount / subtotal) * 100 : 0,
                  tax_amount: tax,
                  total_amount: total,
                  paid_amount: total,
                  change_amount: 0,
                  payment_method: paymentMethod,
                  status: 'paid',
                  notes: finalNotes || null,
                  created_by: user?.id ?? null,
                }
              });

              // Link payment transaction to the sale
              if (txnId) {
                cmd('payment_link_to_sale', { txnId, saleId: id }).catch(console.error);
              }

              setAutoPrintSaleId(id);
              toast(`Sale complete! Invoice: ${invoice} (${paymentMethod === 'jazzcash' ? 'JazzCash' : paymentMethod === 'easypaisa' ? 'EasyPaisa' : 'HBL Pay'})`, 'success');

              queryClient.invalidateQueries({ queryKey: ['sales'] });
              queryClient.invalidateQueries({ queryKey: ['products'] });
              queryClient.invalidateQueries({ queryKey: ['low-stock'] });
              queryClient.invalidateQueries({ queryKey: ['dashboard'] });
              queryClient.invalidateQueries({ queryKey: ['financial-ledger'] });
              queryClient.invalidateQueries({ queryKey: ['sales-report'] });
              queryClient.invalidateQueries({ queryKey: ['pl'] });
              queryClient.invalidateQueries({ queryKey: ['pl-statement'] });
              queryClient.invalidateQueries({ queryKey: ['top-products'] });
              queryClient.invalidateQueries({ queryKey: ['profit-by-product'] });


              cart.clearCart();
              setPaidAmount('');
              setSaleNotes('');
              setPaymentMethod('cash');
            } catch (err: any) {
              toast(err.toString(), 'error');
            } finally {
              setCompleting(false);
              setPendingGatewayTxnId(null);
            }
          }}
          onCancel={() => setShowPaymentFlow(null)}
          onOfflineQueue={() => {
            setShowPaymentFlow(null);
            toast('Payment queued. Complete sale with cash for now.', 'info');
            setPaymentMethod('cash');
          }}
        />
      )}

      {/* Camera & Smart Features */}
      {camera_sale_mode && showCamera && (
        <DraggableCamera 
          onScan={handleBarcode}
          onClose={() => setShowCamera(false)} 
          paused={!!missingProductBarcode || completing || !!showPaymentFlow || !!showVariants || !!autoPrintSaleId} 
        />
      )}

      {missingProductBarcode && (
        <SmartProductImportModal
          isOpen={true}
          initialBarcode={missingProductBarcode}
          onClose={() => setMissingProductBarcode(null)}
          onProductSaved={(product) => {
            cart.addItem({
              product_id: product.id,
              product_name: product.name,
              barcode: product.barcode,
              quantity: 1,
              unit_price: product.sale_price,
              discount: 0,
              discount_type: 'amount',
            });
            toast(`Added: ${product.name}`, 'success');
          }}
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
  const activeModule = useBusinessStore(s => s.getActiveModule)();
  const isService = isProductService(product, activeModule);

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
              disabled={!isService && v.quantity === 0}
              className="w-full flex items-center justify-between px-4 py-3 rounded-xl border border-slate-200 hover:border-brand-300 hover:bg-brand-50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed text-left"
            >
              <div>
                <p className="font-medium text-sm">{[v.size, v.color].filter(Boolean).join(' / ')}</p>
                <p className="text-xs text-slate-400">{isService ? 'Service' : `${v.quantity} in stock`}</p>
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
