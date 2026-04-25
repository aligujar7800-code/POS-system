import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { cmd } from '../lib/utils';
import { useToast } from '../components/ui/Toaster';
import { ArrowLeft, Plus, Trash2, Save, RefreshCw, Layers } from 'lucide-react';

interface Category { id: number; name: string; parent_id?: number | null; }

interface Category { id: number; name: string; }
interface VariantEntry {
  color: string;
  quantity: number;
  barcode: string;
  cost_price: string;
  sale_price: string;
}
interface SizeGroup {
  id: string;
  size: string;
  colors: VariantEntry[];
}
interface BulkProductGroup {
  id: string;
  name: string;
  sku: string;
  article_number: string;
  main_category_id: string;
  category_id: string;
  sizeGroups: SizeGroup[];
}

const emptyColor = (): VariantEntry => ({ color: '', quantity: 0, barcode: '', cost_price: '', sale_price: '' });
const emptySizeGroup = (): SizeGroup => ({ id: Math.random().toString(36).substring(7), size: '', colors: [emptyColor()] });
const emptyProduct = (articleNumber: string = ''): BulkProductGroup => ({
  id: Math.random().toString(36).substring(7),
  name: '',
  sku: '',
  article_number: articleNumber,
  main_category_id: '',
  category_id: '',
  sizeGroups: [emptySizeGroup()]
});

export default function BulkAddProducts() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { toast } = useToast();
  const qc = useQueryClient();

  const [products, setProducts] = useState<BulkProductGroup[]>([emptyProduct()]);
  const [isSaving, setIsSaving] = useState(false);

  const { data: categories = [] } = useQuery<Category[]>({
    queryKey: ['categories'],
    queryFn: () => cmd('get_all_categories'),
  });

  const mainCategories = categories.filter(c => !c.parent_id);

  React.useEffect(() => {
    cmd<string>('generate_article_number').then(art => {
      setProducts([emptyProduct(art)]);
    }).catch(console.error);
  }, []);

  const addProduct = async () => {
    try {
      let nextArt = "";
      // Smart increment based on current list
      if (products.length > 0) {
        const lastArt = products[products.length - 1].article_number;
        if (lastArt && lastArt.startsWith('ART-')) {
          const numPart = lastArt.substring(4);
          const num = parseInt(numPart);
          if (!isNaN(num)) {
            nextArt = `ART-${(num + 1).toString().padStart(5, '0')}`;
          }
        }
      }

      // Fallback to backend if we couldn't increment locally
      if (!nextArt) {
        nextArt = await cmd<string>('generate_article_number');
      }
      
      setProducts(prev => [...prev, emptyProduct(nextArt)]);
    } catch {
      setProducts(prev => [...prev, emptyProduct()]);
    }
  };
  const removeProduct = (id: string) => setProducts(prev => prev.filter(p => p.id !== id));
  
  const updateProductInfo = (id: string, field: keyof BulkProductGroup, val: string) => {
    setProducts(prev => prev.map(p => p.id === id ? { ...p, [field]: val } : p));
  };

  const addSizeToProduct = (productId: string) => {
    setProducts(prev => prev.map(p => p.id === productId ? { ...p, sizeGroups: [...p.sizeGroups, emptySizeGroup()] } : p));
  };

  const removeSizeFromProduct = (productId: string, groupId: string) => {
    setProducts(prev => prev.map(p => {
      if (p.id !== productId) return p;
      return { ...p, sizeGroups: p.sizeGroups.filter(g => g.id !== groupId) };
    }));
  };

  const addColorToGroup = (productId: string, groupId: string) => {
    setProducts(prev => prev.map(p => {
      if (p.id !== productId) return p;
      return {
        ...p,
        sizeGroups: p.sizeGroups.map(g => g.id === groupId ? { ...g, colors: [...g.colors, emptyColor()] } : g)
      };
    }));
  };

  const updateSizeInGroup = (productId: string, groupId: string, size: string) => {
    setProducts(prev => prev.map(p => {
      if (p.id !== productId) return p;
      return { ...p, sizeGroups: p.sizeGroups.map(g => g.id === groupId ? { ...g, size } : g) };
    }));
  };

  const updateColorInGroup = (productId: string, groupId: string, colorIndex: number, field: keyof VariantEntry, val: any) => {
    setProducts(prev => prev.map(p => {
      if (p.id !== productId) return p;
      return {
        ...p,
        sizeGroups: p.sizeGroups.map(g => {
          if (g.id !== groupId) return g;
          const nextColors = [...g.colors];
          nextColors[colorIndex] = { ...nextColors[colorIndex], [field]: val };
          return { ...g, colors: nextColors };
        })
      };
    }));
  };

  const removeColorFromGroup = (productId: string, groupId: string, colorIndex: number) => {
    setProducts(prev => prev.map(p => {
      if (p.id !== productId) return p;
      return {
        ...p,
        sizeGroups: p.sizeGroups.map(g => {
          if (g.id !== groupId) return g;
          return { ...g, colors: g.colors.filter((_, idx) => idx !== colorIndex) };
        })
      };
    }));
  };

  const generateBulkBarcodes = async () => {
    const nextProducts = JSON.parse(JSON.stringify(products));
    
    // Helper to calculate sequential EAN-13
    const getNextEan13 = (previousEan: string): string => {
        const baseStr = previousEan.substring(0, 12);
        const numPart = parseInt(baseStr, 10) + 1;
        const nextBase = numPart.toString().padStart(12, '0');
        let sum = 0;
        for (let i = 0; i < 12; i++) {
            let d = parseInt(nextBase[i], 10);
            sum += (i % 2 === 0) ? d : d * 3;
        }
        let check = (10 - (sum % 10)) % 10;
        return nextBase + check.toString();
    };

    let lastGeneratedId = "";

    for (const p of nextProducts) {
      for (const g of p.sizeGroups) {
        for (const c of g.colors) {
          if (!c.barcode) {
            if (!lastGeneratedId) {
              try {
                lastGeneratedId = await cmd<string>('generate_ean13', { offset: 0 });
                c.barcode = lastGeneratedId;
              } catch (e) {}
            } else {
              lastGeneratedId = getNextEan13(lastGeneratedId);
              c.barcode = lastGeneratedId;
            }
          }
        }
      }
    }
    setProducts(nextProducts);
  };

  const handleSave = async () => {
    const flattenItems: any[] = [];
    products.forEach(p => {
      if (!p.name) return;
      p.sizeGroups.forEach(g => {
        g.colors.forEach(c => {
          if (g.size || c.color) {
            flattenItems.push({
              name: p.name,
              sku: p.sku || null,
              article_number: p.article_number || null,
              category_id: p.category_id ? parseInt(p.category_id) : (p.main_category_id ? parseInt(p.main_category_id) : null),
              size: g.size || null,
              color: c.color || null,
              cost_price: parseFloat(c.cost_price) || 0,
              sale_price: parseFloat(c.sale_price) || 0,
              initial_stock: 0,
              barcode: c.barcode || null
            });
          }
        });
      });
    });

    if (flattenItems.length === 0) {
      toast('Please add at least one item with a name', 'error');
      return;
    }

    setIsSaving(true);
    try {
      await cmd('create_bulk_products', { items: flattenItems });
      toast(`Successfully added batch of ${flattenItems.length} items!`, 'success');
      qc.invalidateQueries({ queryKey: ['products'] });
      navigate('/inventory');
    } catch (e: any) {
      toast(e.toString(), 'error');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="page overflow-hidden flex flex-col">
      <div className="page-header py-4 border-b border-slate-200">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate(-1)} className="btn-ghost btn-icon">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="page-title flex items-center gap-2">
              <Layers className="w-5 h-5 text-brand-600" />
              Hierarchical Bulk Entry
            </h1>
            <p className="text-xs text-slate-500">Add multiple clothing products with their size/color variations</p>
          </div>
        </div>
        <div className="flex gap-2">
          <button onClick={generateBulkBarcodes} className="btn-secondary">
            <RefreshCw className="w-4 h-4 mr-2" /> Auto Barcodes
          </button>
          <button onClick={handleSave} disabled={isSaving} className="btn-primary min-w-[140px]">
            {isSaving ? <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin mr-2" /> : <Save className="w-4 h-4 mr-2" />}
            Save Batch
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-auto bg-slate-50 p-6 space-y-8">
        <div className="flex items-center gap-3 bg-blue-50 p-3 rounded-lg border border-blue-100 mb-2">
           <Layers className="w-4 h-4 text-blue-600" />
           <p className="text-xs text-blue-700">Ab aap har product ki <b>Main Category</b> alag se select kar sakte hain. Sub-category khud filter ho jaye gi.</p>
        </div>

        {/* Product Cards */}
        {products.map((p, pIdx) => (
          <div key={p.id} className="card p-6 bg-white shadow-md relative group">
            <button 
              onClick={() => removeProduct(p.id)}
              className="absolute top-4 right-4 text-slate-300 hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100"
            >
              <Trash2 className="w-5 h-5" />
            </button>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
              <div className="md:col-span-1">
                <label className="label text-[10px] font-black text-slate-400 uppercase">Product Name {pIdx + 1} *</label>
                <input 
                  value={p.name} 
                  onChange={e => updateProductInfo(p.id, 'name', e.target.value)}
                  className="input font-bold text-lg" 
                  placeholder="e.g. Slim Fit Kurta" 
                />
              </div>
              <div>
                <label className="label text-[10px] font-black text-slate-400 uppercase">Article No *</label>
                <input 
                  value={p.article_number} 
                  onChange={e => updateProductInfo(p.id, 'article_number', e.target.value)}
                  className="input font-mono text-sm text-brand-600 font-bold" 
                  placeholder="e.g. ART-00001" 
                />
              </div>
              <div>
                <label className="label text-[10px] font-black text-slate-400 uppercase">SKU (Optional)</label>
                <input 
                  value={p.sku} 
                  onChange={e => updateProductInfo(p.id, 'sku', e.target.value)}
                  className="input" 
                  placeholder="Leave empty for auto" 
                />
              </div>
              <div>
                <label className="label text-[10px] font-black text-slate-400 uppercase text-blue-600">Main Category *</label>
                <select 
                  value={p.main_category_id} 
                  onChange={e => {
                    updateProductInfo(p.id, 'main_category_id', e.target.value);
                    updateProductInfo(p.id, 'category_id', ''); // reset sub-category
                  }}
                  className="input border-blue-200 bg-blue-50/30"
                >
                  <option value="">Select Main...</option>
                  {mainCategories.map(cat => <option key={cat.id} value={cat.id}>{cat.name}</option>)}
                </select>
              </div>
              <div>
                <label className="label text-[10px] font-black text-slate-400 uppercase">Category / Sub-Type</label>
                <select 
                  value={p.category_id} 
                  onChange={e => updateProductInfo(p.id, 'category_id', e.target.value)}
                  className="input"
                  disabled={!p.main_category_id}
                >
                  <option value="">{p.main_category_id ? 'Select Sub-Category...' : 'Choose Main First'}</option>
                  {categories
                    .filter(cat => cat.parent_id === (p.main_category_id ? parseInt(p.main_category_id) : -1))
                    .map(cat => <option key={cat.id} value={cat.id}>{cat.name}</option>)
                  }
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
              {p.sizeGroups.map((group) => (
                <div key={group.id} className="bg-slate-50 border border-slate-100 rounded-xl overflow-hidden">
                  <div className="bg-slate-100/50 px-4 py-2 border-b border-slate-200 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                       <span className="text-[10px] font-black text-slate-400 uppercase">Size:</span>
                       <input 
                        value={group.size} 
                        onChange={e => updateSizeInGroup(p.id, group.id, e.target.value)}
                        className="bg-transparent border-0 p-0 w-20 font-bold text-brand-700 focus:ring-0" 
                        placeholder="M, L..." 
                       />
                    </div>
                    <button onClick={() => removeSizeFromProduct(p.id, group.id)} className="text-slate-300 hover:text-red-500">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                  <div className="p-4 space-y-2">
                    <div className="grid grid-cols-[2fr_2fr_0.8fr_1fr_1fr_30px] gap-2 text-[8px] font-black text-slate-400 uppercase tracking-widest px-1">
                      <div>Color</div>
                      <div>Barcode</div>
                      <div className="text-center">Qty</div>
                      <div className="text-right">Cost</div>
                      <div className="text-right">Price</div>
                      <div></div>
                    </div>
                    {group.colors.map((c, cIdx) => (
                      <div key={cIdx} className="grid grid-cols-[2fr_2fr_0.8fr_1fr_1fr_30px] gap-2 items-center">
                        <div>
                          <input 
                            value={c.color} 
                            onChange={e => updateColorInGroup(p.id, group.id, cIdx, 'color', e.target.value)}
                            className="input-sm text-xs" 
                            placeholder="Red" 
                          />
                        </div>
                        <div>
                          <input 
                            value={c.barcode} 
                            onChange={e => updateColorInGroup(p.id, group.id, cIdx, 'barcode', e.target.value)}
                            className="input-sm text-[10px] font-mono text-brand-600" 
                            placeholder="Auto" 
                          />
                        </div>
                        <div title="Stock cannot be edited manually. Use Inward or Stock Adjustment.">
                          <input 
                            type="number" 
                            value={0} 
                            disabled
                            readOnly
                            className="input-sm text-xs text-center font-bold bg-slate-50 text-slate-400 cursor-not-allowed" 
                          />
                        </div>
                        <div>
                          <input 
                            type="number" 
                            value={c.cost_price} 
                            onChange={e => updateColorInGroup(p.id, group.id, cIdx, 'cost_price', e.target.value)}
                            className="input-sm text-[10px] text-right" 
                            placeholder="0" 
                          />
                        </div>
                        <div>
                          <input 
                            type="number" 
                            value={c.sale_price} 
                            onChange={e => updateColorInGroup(p.id, group.id, cIdx, 'sale_price', e.target.value)}
                            className="input-sm text-[10px] text-right font-bold text-brand-600" 
                            placeholder="0" 
                          />
                        </div>
                        <div className="flex justify-end pr-1">
                           {group.colors.length > 1 && (
                             <button onClick={() => removeColorFromGroup(p.id, group.id, cIdx)} className="text-slate-300 hover:text-red-400 p-1">
                               <Trash2 className="w-3.5 h-3.5" />
                             </button>
                           )}
                        </div>
                      </div>
                    ))}
                    <button 
                      onClick={() => addColorToGroup(p.id, group.id)}
                      className="w-full py-1.5 mt-2 border border-dashed border-slate-200 rounded text-[10px] font-bold text-slate-400 hover:text-brand-600 hover:bg-white transition-all"
                    >
                      + Color for {group.size || 'Size'}
                    </button>
                  </div>
                </div>
              ))}
              <button 
                onClick={() => addSizeToProduct(p.id)}
                className="flex items-center justify-center p-6 border-2 border-dashed border-slate-100 rounded-xl text-slate-400 hover:bg-slate-50 hover:border-brand-200 hover:text-brand-600 transition-all text-xs font-bold"
              >
                <Plus className="w-5 h-5 mr-2" /> Add Size Group for {p.name || 'this product'}
              </button>
            </div>
          </div>
        ))}

        <div className="flex justify-center pb-12">
           <button 
            onClick={addProduct}
            className="flex items-center gap-3 py-4 px-12 bg-white border-2 border-brand-500 text-brand-600 rounded-2xl font-black text-sm uppercase tracking-widest shadow-xl hover:bg-brand-500 hover:text-white transition-all transform hover:scale-105 active:scale-95"
           >
            <Plus className="w-6 h-6" /> Add Another Product to Batch
           </button>
        </div>
      </div>
    </div>
  );
}

