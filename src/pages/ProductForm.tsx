import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { cmd, cn } from '../lib/utils';
import { useToast } from '../components/ui/Toaster';
import { ArrowLeft, Plus, Trash2, RefreshCw, Package } from 'lucide-react';
import Barcode from 'react-barcode';

interface Category { id: number; name: string; parent_id?: number | null; }
interface VariantEntry {
  color: string;
  quantity: number;
  barcode: string;
  price: string;
}
interface SizeGroup {
  id: string;
  size: string;
  colors: VariantEntry[];
}

const emptyColor = (): VariantEntry => ({ color: '', quantity: 0, barcode: '', price: '' });
const emptySizeGroup = (): SizeGroup => ({ id: Math.random().toString(36).substring(7), size: '', colors: [emptyColor()] });

export default function ProductForm() {
  const { id } = useParams<{ id?: string }>();
  const isEdit = Boolean(id);
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { toast } = useToast();
  const qc = useQueryClient();

  const [name, setName]         = useState('');
  const [sku, setSku]           = useState('');
  const [articleNumber, setArticleNumber] = useState('');
  const [barcode, setBarcode]   = useState('');
  const [mainCategory, setMainCategory] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [brand, setBrand]       = useState('');
  const [description, setDesc]  = useState('');
  const [costPrice, setCostPrice] = useState('');
  const [salePrice, setSalePrice] = useState('');
  const [taxPct, setTaxPct]     = useState('0');
  const [lowStock, setLowStock] = useState('5');
  const [sizeGroups, setSizeGroups] = useState<SizeGroup[]>([emptySizeGroup()]);
  const [saving, setSaving]     = useState(false);

  // Fetch product data if editing
  const { data: productData } = useQuery({
    queryKey: ['product', id],
    queryFn: () => cmd<any>('get_product_by_id', { id: parseInt(id!) }),
    enabled: isEdit,
  });

  const { data: variantsData } = useQuery({
    queryKey: ['product_variants', id],
    queryFn: () => cmd<any[]>('get_product_variants', { productId: parseInt(id!) }),
    enabled: isEdit,
  });

  // Populate form on edit
  useEffect(() => {
    if (isEdit && productData) {
      setName(productData.name || '');
      setSku(productData.sku || '');
      setArticleNumber(productData.article_number || '');
      setBarcode(productData.barcode || '');
      setCategoryId(productData.category_id?.toString() || '');
      setBrand(productData.brand || '');
      setDesc(productData.description || '');
      setCostPrice(productData.cost_price?.toString() || '');
      setSalePrice(productData.sale_price?.toString() || '');
      setTaxPct(productData.tax_percent?.toString() || '0');
      setLowStock(productData.low_stock_threshold?.toString() || '5');
    }
  }, [isEdit, productData]);

  useEffect(() => {
    if (!isEdit) {
      cmd<string>('generate_article_number').then(art => {
        setArticleNumber(art);
      }).catch(console.error);
    }
  }, [isEdit]);

  useEffect(() => {
    if (isEdit && variantsData && variantsData.length > 0) {
      // Map flat variants back to size groups
      const groups: Record<string, SizeGroup> = {};
      variantsData.forEach(v => {
        const sizeKey = v.size || 'default';
        if (!groups[sizeKey]) {
          groups[sizeKey] = { id: Math.random().toString(36).substring(7), size: v.size || '', colors: [] };
        }
        groups[sizeKey].colors.push({
          color: v.color || '',
          quantity: v.quantity,
          barcode: v.variant_barcode || '',
          price: v.variant_price?.toString() || ''
        });
      });
      setSizeGroups(Object.values(groups));
    }
  }, [isEdit, variantsData]);

  const { data: categories = [] } = useQuery<Category[]>({
    queryKey: ['categories'],
    queryFn: () => cmd('get_all_categories'),
  });

  const mainCategories = categories.filter(c => !c.parent_id);
  const filteredSubCategories = categories.filter(c => 
    c.parent_id === (mainCategory ? parseInt(mainCategory) : -1)
  );

  // Auto-detect main category on edit
  useEffect(() => {
    if (isEdit && productData && categories.length > 0) {
      const subCat = categories.find(c => c.id === productData.category_id);
      if (subCat && subCat.parent_id) {
        setMainCategory(subCat.parent_id.toString());
      } else if (productData.category_id) {
        // If the selected category is itself a main category
        setMainCategory(productData.category_id.toString());
      }
    }
  }, [isEdit, productData, categories]);

  const generateBarcode = async () => {
    try {
      const ean = await cmd<string>('generate_ean13');
      setBarcode(ean);
    } catch (e) {
      toast('Failed to generate barcode', 'error');
    }
  };

  const addSizeGroup = () => setSizeGroups(prev => [...prev, emptySizeGroup()]);
  const removeSizeGroup = (id: string) => setSizeGroups(prev => prev.filter(g => g.id !== id));
  
  const addColorToGroup = (groupId: string) => {
    setSizeGroups(prev => prev.map(g => g.id === groupId ? { ...g, colors: [...g.colors, emptyColor()] } : g));
  };

  const updateSizeInGroup = (groupId: string, size: string) => {
    setSizeGroups(prev => prev.map(g => g.id === groupId ? { ...g, size } : g));
  };

  const updateColorInGroup = (groupId: string, colorIndex: number, field: keyof VariantEntry, val: any) => {
    setSizeGroups(prev => prev.map(g => {
      if (g.id !== groupId) return g;
      const nextColors = [...g.colors];
      nextColors[colorIndex] = { ...nextColors[colorIndex], [field]: val };
      return { ...g, colors: nextColors };
    }));
  };

  const removeColorFromGroup = (groupId: string, colorIndex: number) => {
    setSizeGroups(prev => prev.map(g => {
      if (g.id !== groupId) return g;
      return { ...g, colors: g.colors.filter((_, idx) => idx !== colorIndex) };
    }));
  };

  const handleSave = async () => {
    if (!name.trim()) { toast('Product Name is required', 'error'); return; }
    if (!salePrice && !isEdit) { toast('Default Sale Price is required', 'error'); return; }
    setSaving(true);
    try {
      const payload = {
        name, sku, barcode: barcode || null,
        article_number: articleNumber || null,
        category_id: categoryId ? parseInt(categoryId) : null,
        brand: brand || null, description: description || null,
        cost_price: parseFloat(costPrice) || 0,
        sale_price: parseFloat(salePrice) || 0,
        tax_percent: parseFloat(taxPct) || 0,
        low_stock_threshold: parseInt(lowStock) || 5,
      };

      // Flatten size groups into variants
      const variantPayloads: any[] = [];
      sizeGroups.forEach(group => {
        group.colors.forEach(c => {
          if (group.size || c.color || c.quantity > 0) {
            variantPayloads.push({
              size: group.size || null,
              color: c.color || null,
              quantity: isEdit ? (parseInt(String(c.quantity)) || 0) : 0,
              variant_barcode: c.barcode || null,
              variant_price: c.price ? parseFloat(c.price) : null,
            });
          }
        });
      });

      if (isEdit) {
        await cmd('update_product', { id: parseInt(id!), payload });
      } else {
        await cmd('create_product', { payload, variants: variantPayloads });
      }

      toast(`Product ${isEdit ? 'updated' : 'created'}!`, 'success');
      qc.invalidateQueries({ queryKey: ['products'] });
      navigate('/inventory');
    } catch (e: any) {
      toast(e.toString(), 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="page max-w-4xl">
      <div className="page-header">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate(-1)} className="btn-ghost btn-icon">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h1 className="page-title">{isEdit ? t('inventory.editProduct') : t('inventory.addProduct')}</h1>
        </div>
        <button onClick={handleSave} disabled={saving} className="btn-primary px-8">
          {saving ? <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : null}
          {t('inventory.save')}
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          {/* Main Info */}
          <div className="card p-6">
            <div className="flex items-center gap-2 mb-4 text-brand-600">
               <Package className="w-5 h-5" />
               <h2 className="font-bold text-lg">Product Details</h2>
            </div>
            
            <div className="space-y-4">
              <div>
                <label className="label text-xs font-bold text-slate-500 uppercase">Product Name *</label>
                <input value={name} onChange={(e) => setName(e.target.value)} className="input text-lg font-medium" placeholder="e.g. Cotton Polo Shirt" autoFocus />
              </div>
              
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="label text-xs font-bold text-slate-500 uppercase">Article No *</label>
                  <div className="relative flex items-center">
                    <input 
                      value={articleNumber} 
                      onChange={(e) => setArticleNumber(e.target.value)} 
                      className="input font-mono text-sm text-brand-600 font-bold pr-10" 
                      placeholder="e.g. ART-00001" 
                    />
                    <button
                      onClick={() => {
                        cmd<string>('generate_article_number').then(art => setArticleNumber(art)).catch(console.error);
                      }}
                      className="absolute right-2 text-slate-400 hover:text-brand-600 p-1"
                      title="Generate New Article Number"
                    >
                      <RefreshCw className="w-4 h-4" />
                    </button>
                  </div>
                </div>
                <div>
                  <label className="label text-xs font-bold text-slate-500 uppercase">SKU (Opt)</label>
                  <input value={sku} onChange={(e) => setSku(e.target.value)} className="input" placeholder="Auto" />
                </div>
                <div>
                  <label className="label text-xs font-bold text-slate-500 uppercase">Brand</label>
                  <input value={brand} onChange={(e) => setBrand(e.target.value)} className="input" placeholder="e.g. Khaadi" />
                </div>
              </div>

              <div>
                <label className="label text-xs font-bold text-slate-500 uppercase">Description</label>
                <textarea value={description} onChange={(e) => setDesc(e.target.value)} className="input h-20 resize-none" placeholder="Add material, fit, or style notes..." />
              </div>
            </div>
          </div>

          {/* Hierarchical Variants */}
          <div className="card p-6 bg-slate-50/50">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="font-bold text-lg text-slate-800">Sizes & Color Varieties</h2>
                <p className="text-sm text-slate-500">
                  {isEdit ? 'Current stock levels for each variety.' : 'Group your stock by size and add multiple colors for each.'}
                </p>
              </div>
              {!isEdit && (
                <button onClick={addSizeGroup} className="btn-secondary">
                  <Plus className="w-4 h-4" /> Add New Size
                </button>
              )}
            </div>

            <div className="space-y-6">
              {sizeGroups.map((group) => (
                <div key={group.id} className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
                  <div className="bg-slate-50 px-4 py-3 border-b border-slate-200 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <span className="text-xs font-black text-slate-400 uppercase tracking-widest">Size:</span>
                      <input 
                        value={group.size} 
                        readOnly={isEdit}
                        onChange={(e) => updateSizeInGroup(group.id, e.target.value)}
                        className={cn("bg-transparent border-none focus:ring-0 font-bold text-brand-700 w-24 p-0", isEdit && "cursor-not-allowed")}
                        placeholder="M, L, XL..."
                      />
                    </div>
                    {!isEdit && (
                      <button onClick={() => removeSizeGroup(group.id)} className="text-slate-400 hover:text-red-500 transition-colors">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                  
                  <div className="p-4 space-y-3">
                    <div className="grid grid-cols-12 gap-3 text-[10px] font-black text-slate-400 uppercase tracking-tighter px-1">
                      <div className="col-span-4">Color</div>
                      <div className="col-span-2 text-center">Quantity</div>
                      <div className="col-span-3">Barcode</div>
                      <div className="col-span-2 text-right">PRICE</div>
                      <div className="col-span-1" />
                    </div>
                    
                    {group.colors.map((c, idx) => (
                      <div key={idx} className="grid grid-cols-12 gap-2 items-center">
                        <div className="col-span-4">
                          <input value={c.color} readOnly={isEdit} onChange={(e) => updateColorInGroup(group.id, idx, 'color', e.target.value)} className={cn("input-sm", isEdit && "bg-slate-50 cursor-not-allowed")} placeholder="Black, Navy..." />
                        </div>
                        <div className="col-span-2" title="Stock cannot be edited manually. Use Inward or Stock Adjustment to change quantities.">
                          <input type="number" value={isEdit ? c.quantity : 0} readOnly disabled className={cn("input-sm text-center font-bold bg-slate-50 cursor-not-allowed", !isEdit && "text-slate-400")} min={0} />
                        </div>
                        <div className="col-span-3">
                          <input value={c.barcode} readOnly={isEdit} onChange={(e) => updateColorInGroup(group.id, idx, 'barcode', e.target.value)} className={cn("input-sm text-xs", isEdit && "bg-slate-50 cursor-not-allowed")} placeholder="Scan..." />
                        </div>
                        <div className="col-span-2">
                          <input type="number" value={c.price} readOnly={isEdit} onChange={(e) => updateColorInGroup(group.id, idx, 'price', e.target.value)} className={cn("input-sm text-right", isEdit && "bg-slate-50 cursor-not-allowed")} placeholder="0" />
                        </div>
                        <div className="col-span-1 flex justify-center">
                          {group.colors.length > 1 && !isEdit && (
                            <button onClick={() => removeColorFromGroup(group.id, idx)} className="text-slate-300 hover:text-red-400">
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                    
                    {!isEdit && (
                      <button 
                        onClick={() => addColorToGroup(group.id)}
                        className="w-full py-2 mt-2 border border-dashed border-slate-200 rounded-lg text-xs font-semibold text-slate-500 hover:bg-slate-50 hover:text-brand-600 transition-all flex items-center justify-center gap-1"
                      >
                        <Plus className="w-3 h-3" /> Add Another Color for {group.size || 'this size'}
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
            {isEdit && (
               <p className="mt-4 text-[11px] text-slate-400 italic">
                 Note: To adjust stock quantities or add new varieties for an existing product, please use the **Inward Stock** or **Stock Adjustment** modules.
               </p>
            )}
          </div>
        </div>

        <div className="space-y-6">
          {/* Organization */}
          <div className="card p-6">
            <h3 className="font-bold text-slate-800 mb-4">Organization</h3>
            <div className="space-y-4">
              <div>
                <label className="label text-xs font-bold text-slate-500 uppercase">Main Category</label>
                <div className="grid grid-cols-2 gap-2">
                  {mainCategories.map(m => (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => {
                        setMainCategory(m.id.toString());
                        setCategoryId(''); // Reset sub-category when main changes
                      }}
                      className={`py-2 px-3 rounded-lg text-xs font-bold border transition-all ${
                        mainCategory === m.id.toString() ? 'bg-brand-600 text-white border-brand-600 shadow-md' : 'bg-white text-slate-600 border-slate-200 hover:border-brand-300'
                      }`}
                    >
                      {m.name}
                    </button>
                  ))}
                </div>
              </div>
              
              <div>
                <label className="label text-xs font-bold text-slate-500 uppercase">Sub-Category</label>
                <select 
                  value={categoryId} 
                  onChange={(e) => setCategoryId(e.target.value)} 
                  className="input"
                  disabled={!mainCategory}
                >
                  <option value="">{mainCategory ? 'Select Sub-Category...' : 'Choose Main Category First'}</option>
                  {filteredSubCategories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>

              <div>
                <label className="label text-xs font-bold text-slate-500 uppercase">Master Barcode</label>
                <div className="flex gap-2">
                  <input value={barcode} onChange={(e) => setBarcode(e.target.value)} className="input flex-1" placeholder="Optional" />
                  <button onClick={generateBarcode} className="btn-secondary btn-icon" title="Generate">
                    <RefreshCw className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Default Pricing */}
          <div className="card p-6">
            <h3 className="font-bold text-slate-800 mb-4">Pricing & Stock Alerts</h3>
            <div className="space-y-4">
              <div>
                <label className="label text-xs font-bold text-slate-500 uppercase font-mono">Default Cost Price</label>
                <input type="number" value={costPrice} onChange={(e) => setCostPrice(e.target.value)} className="input font-bold text-amber-600" />
              </div>
              <div>
                <label className="label text-xs font-bold text-slate-500 uppercase font-mono">Default Sale Price *</label>
                <input type="number" value={salePrice} onChange={(e) => setSalePrice(e.target.value)} className="input font-black text-brand-600 text-xl" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="label text-xs font-bold text-slate-500 uppercase">Tax %</label>
                  <input type="number" value={taxPct} onChange={(e) => setTaxPct(e.target.value)} className="input" />
                </div>
                <div>
                  <label className="label text-xs font-bold text-slate-500 uppercase">Low Alert</label>
                  <input type="number" value={lowStock} onChange={(e) => setLowStock(e.target.value)} className="input" />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
