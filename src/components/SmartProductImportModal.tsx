import React, { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { X, Package, RefreshCw, Check } from 'lucide-react';
import CameraScanner from './ui/CameraScanner';
import { cmd } from '../lib/utils';
import { useToast } from './ui/Toaster';
import { playSuccessSound, playErrorSound } from '../lib/audio';

interface SmartProductImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onProductSaved?: (product: any) => void;
  initialBarcode?: string; // If opened from Sales missing product flow
}

interface Category { id: number; name: string; parent_id?: number | null; }

export default function SmartProductImportModal({ isOpen, onClose, onProductSaved, initialBarcode }: SmartProductImportModalProps) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const qc = useQueryClient();

  const [step, setStep] = useState<'scan' | 'form'>(initialBarcode ? 'form' : 'scan');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  // Form State
  const [barcode, setBarcode] = useState(initialBarcode || '');
  const [name, setName] = useState('');
  const [brand, setBrand] = useState('');
  const [mainCategory, setMainCategory] = useState(''); // parent category id as string
  const [categoryId, setCategoryId] = useState(''); // sub-category id as string
  const [price, setPrice] = useState('');
  const [cost, setCost] = useState('');
  const [stock, setStock] = useState('1');

  const { data: categories = [] } = useQuery<Category[]>({
    queryKey: ['categories'],
    queryFn: () => cmd('get_all_categories'),
    enabled: isOpen,
  });

  // Hierarchical category helpers (mirrors ProductForm.tsx)
  const mainCategories = categories.filter(c => !c.parent_id);
  const filteredSubCategories = categories.filter(c =>
    c.parent_id === (mainCategory ? parseInt(mainCategory) : -1)
  );

  const resetForm = () => {
    setBarcode('');
    setName('');
    setBrand('');
    setMainCategory('');
    setCategoryId('');
    setPrice('');
    setCost('');
    setStock('1');
  };

  const fetchProductData = useCallback(async (code: string) => {
    setLoading(true);
    setBarcode(code);
    try {
      // 1. Try UPCitemDB
      let foundName = '';
      let foundBrand = '';
      let foundCategory = '';

      try {
        const upcRes = await fetch(`https://api.upcitemdb.com/prod/trial/lookup?upc=${code}`);
        if (upcRes.ok) {
          const upcData = await upcRes.json();
          if (upcData.items && upcData.items.length > 0) {
            const item = upcData.items[0];
            foundName = item.title || '';
            foundBrand = item.brand || '';
            foundCategory = item.category ? item.category.split('>').pop()?.trim() || '' : '';
          }
        }
      } catch (e) {
        console.warn('UPCitemDB fetch failed:', e);
      }

      // 2. Try Open Food Facts if not found
      if (!foundName) {
        try {
          const offRes = await fetch(`https://world.openfoodfacts.org/api/v0/product/${code}.json`);
          if (offRes.ok) {
            const offData = await offRes.json();
            if (offData.status === 1 && offData.product) {
              foundName = offData.product.product_name || '';
              foundBrand = offData.product.brands ? offData.product.brands.split(',')[0] : '';
              foundCategory = offData.product.categories ? offData.product.categories.split(',').pop()?.trim() || '' : '';
            }
          }
        } catch (e) {
          console.warn('Open Food Facts fetch failed:', e);
        }
      }

      if (foundName) {
        playSuccessSound();
        toast('Product info found!', 'success');
        setName(foundName);
        setBrand(foundBrand);

        // Try to match category hierarchically
        if (foundCategory && categories.length > 0) {
          // First try sub-categories
          const subMatch = categories.find(c => c.parent_id && c.name.toLowerCase() === foundCategory.toLowerCase());
          if (subMatch) {
            setMainCategory(subMatch.parent_id!.toString());
            setCategoryId(subMatch.id.toString());
          } else {
            // Try main categories
            const mainMatch = categories.find(c => !c.parent_id && c.name.toLowerCase() === foundCategory.toLowerCase());
            if (mainMatch) {
              setMainCategory(mainMatch.id.toString());
            }
          }
        }
      } else {
        playErrorSound();
        toast('Product not found in public databases. Please enter manually.', 'error');
      }
    } catch (error) {
      console.error('Error fetching product data:', error);
      toast('Failed to lookup product.', 'error');
    } finally {
      setLoading(false);
      setStep('form');
    }
  }, [toast, categories]);

  // Open/init effect — placed after fetchProductData declaration
  useEffect(() => {
    if (isOpen) {
      if (initialBarcode) {
        setStep('form');
        setBarcode(initialBarcode);
        fetchProductData(initialBarcode);
      } else {
        resetForm();
        setStep('scan');
      }
    }
  }, [isOpen, initialBarcode, fetchProductData]);

  const handleScan = (scannedCode: string) => {
    fetchProductData(scannedCode);
  };

  const handleSave = async () => {
    if (!name.trim()) {
      toast('Product Name is required', 'error');
      return;
    }
    setSaving(true);
    try {
      // Use selected sub-category, or main category if no sub selected
      let finalCatId = categoryId ? parseInt(categoryId) : (mainCategory ? parseInt(mainCategory) : null);

      const pCost = parseFloat(cost) || 0;
      const pPrice = parseFloat(price) || 0;
      const pQty = parseInt(stock) || 0;

      // Generate article number like ProductForm does
      let articleNum: string | null = null;
      try {
        articleNum = await cmd<string>('generate_article_number');
      } catch {
        // Non-critical — proceed without it
      }

      const payload = {
        name,
        sku: barcode, // use barcode as sku for simplicity if not provided
        barcode: barcode || null,
        article_number: articleNum,
        category_id: finalCatId,
        brand: brand || null,
        description: null,
        cost_price: pCost,
        sale_price: pPrice,
        tax_percent: 0,
        low_stock_threshold: 5,
        product_meta: null,
      };

      const variants = [{
        size: null,
        color: null,
        quantity: pQty,
        variant_barcode: barcode || null,
        variant_price: pPrice,
        cost_price: pCost,
      }];

      const res = await cmd<any>('create_product', { payload, variants });
      const savedId = typeof res === 'number' ? res : res?.id || 0;

      toast('Product saved successfully!', 'success');
      qc.invalidateQueries({ queryKey: ['products'] });
      qc.invalidateQueries({ queryKey: ['categories'] });

      const newProduct = {
        id: savedId,
        name,
        barcode,
        sale_price: pPrice,
        cost_price: pCost,
        total_stock: pQty,
      };

      if (onProductSaved) {
        onProductSaved(newProduct);
      }

      if (initialBarcode) {
        onClose(); // Close if opened from Sales flow
      } else {
        // Restart scan loop for Inventory flow
        resetForm();
        setStep('scan');
      }
    } catch (e: any) {
      toast(e.toString(), 'error');
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh]">
        <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
          <h2 className="font-bold text-slate-800 flex items-center gap-2">
            <Package className="w-5 h-5 text-brand-600" />
            Smart Product Import
          </h2>
          <button onClick={onClose} className="btn-ghost btn-icon text-slate-400 hover:text-slate-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {step === 'scan' ? (
            <div className="space-y-4">
              <p className="text-center text-slate-500 text-sm">Position the barcode inside the camera frame.</p>
              {loading ? (
                <div className="flex flex-col items-center justify-center py-12">
                  <RefreshCw className="w-8 h-8 text-brand-500 animate-spin mb-4" />
                  <p className="font-medium text-slate-700">Looking up product...</p>
                </div>
              ) : (
                <CameraScanner onScan={handleScan} />
              )}
            </div>
          ) : (
            <div className="space-y-4 animate-in fade-in slide-in-from-bottom-2">
              <div className="bg-brand-50 p-3 rounded-xl border border-brand-100 flex items-start gap-3">
                <Check className="w-5 h-5 text-brand-600 mt-0.5" />
                <div>
                  <p className="text-sm font-bold text-brand-800">Barcode Scanned: {barcode}</p>
                  <p className="text-xs text-brand-600 mt-0.5">Please review the details below before saving.</p>
                </div>
              </div>

              <div>
                <label className="label">Product Name *</label>
                <input value={name} onChange={e => setName(e.target.value)} className="input" autoFocus />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="label">Brand</label>
                  <input value={brand} onChange={e => setBrand(e.target.value)} className="input" />
                </div>
              </div>

              {/* Hierarchical Category Picker (matches ProductForm.tsx) */}
              {mainCategories.length > 0 && (
                <div className="space-y-3">
                  <div>
                    <label className="label">Main Category</label>
                    <div className="grid grid-cols-3 gap-2">
                      {mainCategories.map(m => (
                        <button
                          key={m.id}
                          type="button"
                          onClick={() => {
                            setMainCategory(m.id.toString());
                            setCategoryId(''); // Reset sub when main changes
                          }}
                          className={`py-2 px-3 rounded-lg text-xs font-bold border transition-all ${
                            mainCategory === m.id.toString()
                              ? 'bg-brand-600 text-white border-brand-600 shadow-md'
                              : 'bg-white text-slate-600 border-slate-200 hover:border-brand-300'
                          }`}
                        >
                          {m.name}
                        </button>
                      ))}
                    </div>
                  </div>

                  {mainCategory && filteredSubCategories.length > 0 && (
                    <div>
                      <label className="label">Sub-Category</label>
                      <select
                        value={categoryId}
                        onChange={e => setCategoryId(e.target.value)}
                        className="input"
                      >
                        <option value="">Select Sub-Category...</option>
                        {filteredSubCategories.map(c => (
                          <option key={c.id} value={c.id}>{c.name}</option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>
              )}

              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="label">Cost Price</label>
                  <input type="number" value={cost} onChange={e => setCost(e.target.value)} className="input" placeholder="0" />
                </div>
                <div>
                  <label className="label">Sale Price</label>
                  <input type="number" value={price} onChange={e => setPrice(e.target.value)} className="input font-bold text-brand-600" placeholder="0" />
                </div>
                <div>
                  <label className="label">Initial Stock</label>
                  <input type="number" value={stock} onChange={e => setStock(e.target.value)} className="input" placeholder="1" />
                </div>
              </div>
            </div>
          )}
        </div>

        {step === 'form' && (
          <div className="px-4 py-3 bg-slate-50 border-t border-slate-100 flex items-center justify-between">
            <button onClick={() => { resetForm(); setStep('scan'); }} className="btn-secondary" disabled={saving}>
              <RefreshCw className="w-4 h-4 mr-2" /> Scan Again
            </button>
            <button onClick={handleSave} className="btn-primary" disabled={saving}>
              {saving ? 'Saving...' : 'Save Product'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
