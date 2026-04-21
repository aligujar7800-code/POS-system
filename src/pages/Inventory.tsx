import React, { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { cmd, formatCurrency } from '../lib/utils';
import { useSettingsStore } from '../stores/settingsStore';
import { useToast } from '../components/ui/Toaster';
import AdminConfirmModal from '../components/ui/AdminConfirmModal';
import BarcodeModal from '../components/ui/BarcodeModal';
import { Package, Plus, Search, Filter, Layers, Trash2, TrendingUp, ChevronDown, ChevronRight, Printer, RefreshCcw } from 'lucide-react';

interface Product {
  id: number; name: string; sku: string; barcode?: string;
  category_name?: string; brand?: string; sale_price: number;
  cost_price: number; total_stock: number; low_stock_threshold: number;
  image_path?: string; variant_summary?: string; article_number?: string;
}

interface ProductVariant {
  id: number;
  product_id: number;
  size?: string;
  color?: string;
  quantity: number;
  variant_barcode?: string;
  variant_price?: number;
}
interface Category { id: number; name: string; }

type StockFilter = 'all' | 'in_stock' | 'low_stock' | 'out_of_stock';

export default function InventoryPage() {
  const { t } = useTranslation();
  const { currency_symbol } = useSettingsStore();
  const fmt = (n: number) => formatCurrency(n, currency_symbol);

  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<number | null>(null);
  const [stockFilter, setStockFilter] = useState<StockFilter>('all');
  const { toast } = useToast();
  const qc = useQueryClient();

  // Deletion State
  const [deletingProduct, setDeletingProduct] = useState<Product | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Variant & Barcode State
  const [expandedProductId, setExpandedProductId] = useState<number | null>(null);
  const [activeBarcodeProduct, setActiveBarcodeProduct] = useState<{
    name: string;
    barcode: string;
    size?: string;
    color?: string;
    price: number;
    sku?: string;
  } | null>(null);

  const { data: variants = [], isLoading: isLoadingVariants, isError, error } = useQuery<ProductVariant[]>({
    queryKey: ['variants', expandedProductId],
    queryFn: async () => {
      console.log('Fetching variants for ID:', expandedProductId);
      const res = await cmd<ProductVariant[]>('get_product_variants', { productId: expandedProductId });
      console.log('Variants received:', res);
      return res || [];
    },
    enabled: !!expandedProductId,
  });

  if (isError) {
    console.error('Variants query error:', error);
  }

  const { data: products = [], isLoading } = useQuery<Product[]>({
    queryKey: ['products'],
    queryFn: () => cmd('get_all_products'),
  });

  const { data: categories = [] } = useQuery<Category[]>({
    queryKey: ['categories'],
    queryFn: () => cmd('get_all_categories'),
  });

  const filtered = useMemo(() => {
    return products.filter((p) => {
      if (search && !p.name.toLowerCase().includes(search.toLowerCase()) && !p.sku.toLowerCase().includes(search.toLowerCase())) return false;
      if (categoryFilter && p.category_name !== categories.find(c => c.id === categoryFilter)?.name) return false;
      if (stockFilter === 'in_stock' && p.total_stock <= p.low_stock_threshold) return false;
      if (stockFilter === 'low_stock' && (p.total_stock === 0 || p.total_stock > p.low_stock_threshold)) return false;
      if (stockFilter === 'out_of_stock' && p.total_stock !== 0) return false;
      return true;
    });
  }, [products, search, categoryFilter, stockFilter, categories]);

  // Parse variant summary to extract individual variant info with prices
  function parseVariants(summary?: string): { label: string; price?: string }[] {
    if (!summary) return [];
    return summary.split(', ').map(v => {
      const match = v.match(/^(.+?)\s*@([\d.]+)$/);
      if (match) return { label: match[1], price: match[2] };
      return { label: v };
    });
  }


  function stockBadge(p: Product) {
    if (p.total_stock === 0) return <span className="badge-red">Out of Stock</span>;
    if (p.total_stock <= p.low_stock_threshold) return <span className="badge-amber">Low Stock ({p.total_stock})</span>;
    return <span className="badge-green">In Stock ({p.total_stock})</span>;
  }

  return (
    <div className="page">
      <div className="page-header">
        <h1 className="page-title flex items-center gap-2">
          <Package className="w-5 h-5 text-brand-600" />
          {t('inventory.title')}
        </h1>
        <div className="flex gap-2">
          <button 
            onClick={async () => {
              try {
                const count = await cmd<number>('ensure_variant_barcodes');
                toast(`${count} variants updated with new barcodes`, 'success');
                qc.invalidateQueries({ queryKey: ['products'] });
              } catch (e: any) {
                toast(e.toString(), 'error');
              }
            }}
            className="btn-secondary"
            title="Generate barcodes for variants that don't have one"
          >
            <RefreshCcw className="w-4 h-4" /> Fix Barcodes
          </button>
          <Link to="/inventory/categories" className="btn-secondary">
            <Layers className="w-4 h-4" /> Categories
          </Link>
          <Link to="/inventory/bulk" className="btn-secondary">
            <Layers className="w-4 h-4" /> Bulk Entry
          </Link>
          <Link to="/inventory/new" className="btn-primary">
            <Plus className="w-4 h-4" /> {t('inventory.addProduct')}
          </Link>
        </div>
      </div>

      {/* Inventory Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className="card p-4 border-l-4 border-l-brand-500 shadow-sm flex items-center gap-4">
          <div className="w-10 h-10 rounded-full bg-brand-50 flex items-center justify-center text-brand-600">
            <Package className="w-5 h-5" />
          </div>
          <div>
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Total Products</p>
            <p className="text-xl font-black text-slate-800">{products.length}</p>
          </div>
        </div>
        <div className="card p-4 border-l-4 border-l-blue-500 shadow-sm flex items-center gap-4">
          <div className="w-10 h-10 rounded-full bg-blue-50 flex items-center justify-center text-blue-600">
            <Layers className="w-5 h-5" />
          </div>
          <div>
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Total Stock Count</p>
            <p className="text-xl font-black text-slate-800">
              {products.reduce((acc, p) => acc + p.total_stock, 0)} Units
            </p>
          </div>
        </div>
        <div className="card p-4 border-l-4 border-l-emerald-500 shadow-sm flex items-center gap-4">
          <div className="w-10 h-10 rounded-full bg-emerald-50 flex items-center justify-center text-emerald-600">
            <TrendingUp className="w-5 h-5" />
          </div>
          <div>
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Total Stock Value</p>
            <p className="text-xl font-black text-emerald-700">
              {fmt(products.reduce((acc, p) => acc + (p.total_stock * p.cost_price), 0))}
            </p>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search name or SKU..."
            className="input pl-9"
          />
        </div>
        <select
          value={categoryFilter ?? ''}
          onChange={(e) => setCategoryFilter(e.target.value ? parseInt(e.target.value) : null)}
          className="input w-44"
        >
          <option value="">All Categories</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
        <div className="flex rounded-lg overflow-hidden border border-slate-200 text-xs">
          {(['all', 'in_stock', 'low_stock', 'out_of_stock'] as StockFilter[]).map((f) => (
            <button
              key={f}
              onClick={() => setStockFilter(f)}
              className={`px-3 py-2 font-medium capitalize transition-colors ${
                stockFilter === f ? 'bg-brand-600 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'
              }`}
            >
              {f.replace('_', ' ')}
            </button>
          ))}
        </div>
      </div>

      {/* Product table */}
      <div className="table-container">
        <table className="table">
          <thead>
            <tr>
              <th>Product</th>
              <th>SKU / Barcode</th>
              <th>Category</th>
              <th>Variants & Prices</th>
              <th className="text-right">Default Price</th>
              <th>Stock</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr><td colSpan={7} className="text-center py-8 text-slate-400">{t('common.loading')}</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={7} className="text-center py-8 text-slate-400">{t('common.noData')}</td></tr>
            ) : (
              filtered.map((p) => (
                <React.Fragment key={p.id}>
                <tr 
                  className={expandedProductId === p.id ? 'bg-brand-50/30' : ''}
                  onClick={() => setExpandedProductId(expandedProductId === p.id ? null : p.id)}
                  style={{ cursor: 'pointer' }}
                >
                  <td>
                    <div className="flex items-center gap-3">
                      <div className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 transition-colors ${expandedProductId === p.id ? 'bg-brand-100 text-brand-600' : 'bg-slate-100 text-slate-400'}`}>
                        <Package className="w-4 h-4" />
                      </div>
                      <div>
                        <p className="font-medium text-slate-800">{p.name}</p>
                        {p.brand && <p className="text-xs text-slate-400">{p.brand}</p>}
                        {p.article_number && <p className="text-xs text-brand-500 font-mono font-semibold">{p.article_number}</p>}
                      </div>
                    </div>
                  </td>
                  <td>
                    <p className="font-mono text-xs text-slate-700">{p.sku}</p>
                    {p.barcode && <p className="text-xs text-slate-400">{p.barcode}</p>}
                  </td>
                  <td className="text-slate-500 text-sm">{p.category_name ?? '—'}</td>
                  <td>
                    <div className="flex items-center gap-1 text-[10px] font-bold text-brand-600/60 uppercase tracking-tighter">
                      <ChevronDown className={`w-3 h-3 transition-transform ${expandedProductId === p.id ? 'rotate-180 text-brand-600' : ''}`} />
                      {expandedProductId === p.id ? 'Close Details' : 'View Variants'}
                    </div>
                  </td>
                  <td className="text-right">
                    <div className="text-xs text-slate-400">Cost: {fmt(p.cost_price)}</div>
                    <div className="font-semibold text-brand-600">{fmt(p.sale_price)}</div>
                  </td>
                  <td>{stockBadge(p)}</td>
                  <td>
                    <div className="flex items-center gap-2" onClick={e => e.stopPropagation()}>
                      <Link to={`/inventory/edit/${p.id}`} className="btn-secondary btn-sm">
                        Edit
                      </Link>
                      <button 
                        onClick={() => setDeletingProduct(p)}
                        className="btn-ghost btn-sm text-slate-400 hover:text-red-500"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>

                {/* Expanded Variants Row */}
                {expandedProductId === p.id && (
                  <tr>
                    <td colSpan={7} className="p-0 bg-slate-50/50">
                      <div className="px-6 py-4 border-b border-slate-200">
                        <div className="flex items-center justify-between mb-3">
                          <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                            <Layers className="w-3 h-3" /> Individual Variants
                          </h4>
                          <button
                            onClick={async (e) => {
                              e.stopPropagation();
                              if (variants.length === 0) return;
                              const validVariants = variants.filter(v => v.variant_barcode && v.quantity > 0);
                              if (validVariants.length === 0) {
                                toast('No variants with barcodes and stock found to print.', 'error');
                                return;
                              }
                              try {
                                const port = useSettingsStore.getState().label_printer_port || useSettingsStore.getState().printer_port;
                                const printer_type = (() => {
                                  if (port.toUpperCase().startsWith('COM')) return 'serial';
                                  if (port.startsWith('usb:')) return 'usb';
                                  if (port.includes('.') && port.includes(':')) return 'network';
                                  return 'system';
                                })();
                                const batchItems = validVariants.flatMap(v => 
                                  Array.from({ length: v.quantity }).map(() => ({
                                    shop_name: useSettingsStore.getState().shop_name,
                                    product_name: p.name,
                                    size: v.size,
                                    color: v.color,
                                    price: v.variant_price || p.sale_price,
                                    barcode: v.variant_barcode || '',
                                    quantity: 1, // handled by flatMap
                                    offset_x: useSettingsStore.getState().label_offset_x,
                                    offset_y: useSettingsStore.getState().label_offset_y
                                  }))
                                );
                                await cmd('print_label_batch', {
                                  items: batchItems,
                                  shopName: useSettingsStore.getState().shop_name,
                                  config: {
                                    printer_type,
                                    port,
                                    baud_rate: useSettingsStore.getState().printer_baud
                                  }
                                });
                                toast('Batch sent to printer!', 'success');
                              } catch (err: any) {
                                toast(err.toString(), 'error');
                              }
                            }}
                            className="btn-secondary btn-sm"
                            disabled={isLoadingVariants || variants.length === 0}
                          >
                            <Printer className="w-4 h-4 mr-1" /> Print All Variants
                          </button>
                        </div>
                        
                        {isLoadingVariants ? (
                          <div className="py-4 text-center text-xs text-slate-400">Loading variants...</div>
                        ) : variants.length === 0 ? (
                          <div className="py-4 text-center text-xs text-slate-400">No variants found for this product.</div>
                        ) : (
                          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                            {variants.map((v) => (
                              <div key={v.id} className="bg-white p-3 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                  <div className="w-8 h-8 rounded-full bg-slate-50 flex items-center justify-center text-[10px] font-bold text-slate-500">
                                    {v.size || '—'}
                                  </div>
                                  <div>
                                    <p className="text-sm font-bold text-slate-700">
                                      {v.color || 'Standard'} {v.size ? `(${v.size})` : ''}
                                    </p>
                                    <div className="flex items-center gap-2 mt-0.5">
                                      <p className="text-[10px] font-mono text-slate-400">{v.variant_barcode || 'No Barcode'}</p>
                                      <p className={`text-[10px] font-bold px-1.5 rounded ${v.quantity > 0 ? 'bg-emerald-50 text-emerald-600' : 'bg-red-50 text-red-600'}`}>
                                        {v.quantity} in stock
                                      </p>
                                    </div>
                                  </div>
                                </div>
                                <div className="flex items-center gap-2">
                                  <div className="text-right mr-2">
                                    <p className="text-xs font-black text-brand-600">
                                      {currency_symbol}{v.variant_price || p.sale_price}
                                    </p>
                                  </div>
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setActiveBarcodeProduct({
                                        name: p.name,
                                        barcode: v.variant_barcode || '',
                                        size: v.size,
                                        color: v.color,
                                        price: v.variant_price || p.sale_price,
                                        sku: p.sku
                                      });
                                    }}
                                    disabled={!v.variant_barcode}
                                    className="w-8 h-8 rounded-lg bg-slate-50 flex items-center justify-center text-slate-400 hover:bg-brand-50 hover:text-brand-600 transition-colors border border-slate-100"
                                    title="Print Barcode"
                                  >
                                    <Printer className="w-4 h-4" />
                                  </button>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </td>
                  </tr>
                )}
                </React.Fragment>
              ))
            )}
          </tbody>
        </table>
      </div>

      <AdminConfirmModal
        isOpen={!!deletingProduct}
        onClose={() => setDeletingProduct(null)}
        onConfirm={async () => {
          if (!deletingProduct) return;
          setIsDeleting(true);
          try {
            await cmd('delete_product', { id: deletingProduct.id });
            toast('Product deleted successfully', 'success');
            qc.invalidateQueries({ queryKey: ['products'] });
            qc.invalidateQueries({ queryKey: ['categories'] });
          } catch (e: any) {
            toast(e.toString(), 'error');
          } finally {
            setIsDeleting(false);
            setDeletingProduct(null);
          }
        }}
        title="Delete Product?"
        message={`Are you sure you want to delete "${deletingProduct?.name}"? This will hide the product from POS and inventory lists.`}
        actionLabel="Delete"
        isDestructive={true}
      />

      {activeBarcodeProduct && (
        <BarcodeModal 
          isOpen={!!activeBarcodeProduct}
          onClose={() => setActiveBarcodeProduct(null)}
          product={activeBarcodeProduct}
        />
      )}
    </div>
  );
}
