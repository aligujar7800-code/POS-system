import React, { useState, useEffect } from 'react';
import { X, Printer, Tag, Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cmd } from '../../lib/utils';
import { useSettingsStore } from '../../stores/settingsStore';
import { useToast } from './Toaster';

interface VariantItem {
  id: number;
  size?: string;
  color?: string;
  quantity: number;
  variant_barcode?: string;
  variant_price?: number;
  printQty: number; // Local state for printing
}

interface BatchBarcodeModalProps {
  isOpen: boolean;
  onClose: () => void;
  product: {
    id: number;
    name: string;
    sale_price: number;
    sku: string;
  };
  variants: any[]; // ProductVariant[]
}

export default function BatchBarcodeModal({ isOpen, onClose, product, variants: initialVariants }: BatchBarcodeModalProps) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const settings = useSettingsStore();
  const [items, setItems] = useState<VariantItem[]>([]);
  const [isPrinting, setIsPrinting] = useState(false);
  const [showDiscount, setShowDiscount] = useState(false);
  const [mrpPrice, setMrpPrice] = useState(product.sale_price);
  const [salePrice, setSalePrice] = useState(product.sale_price);

  useEffect(() => {
    if (isOpen) {
      // Initialize with variants that have barcodes and positive stock
      const validItems = initialVariants
        .filter(v => v.variant_barcode)
        .map(v => ({
          ...v,
          printQty: 1 // Default to 1, user adjusts as needed
        }));
      setItems(validItems);
    }
  }, [isOpen, initialVariants]);

  if (!isOpen) return null;

  const totalLabels = items.reduce((acc, item) => acc + item.printQty, 0);

  const handlePrint = async () => {
    if (items.length === 0 || totalLabels === 0) {
      toast('No labels to print', 'error');
      return;
    }

    setIsPrinting(true);
    try {
      const port = settings.label_printer_port || settings.printer_port;
      const printer_type = (() => {
        if (port.toUpperCase().startsWith('COM')) return 'serial';
        if (port.startsWith('usb:')) return 'usb';
        if (port.includes('.') && port.includes(':')) return 'network';
        return 'system';
      })();

      const batchItems = items
        .filter(v => v.printQty > 0)
        .map(v => ({
          shop_name: settings.shop_name,
          product_name: product.name,
          size: v.size,
          color: v.color,
          price: showDiscount ? salePrice : (v.variant_price || product.sale_price),
          barcode: v.variant_barcode || '',
          quantity: v.printQty,
          offset_x: settings.label_offset_x,
          offset_y: settings.label_offset_y,
          mrp: showDiscount ? mrpPrice : null
        }));

      await cmd('print_label_batch', {
        items: batchItems,
        shopName: settings.shop_name,
        config: {
          printer_type,
          port,
          baud_rate: settings.printer_baud
        }
      });

      toast(`Successfully sent ${totalLabels} labels to printer`, 'success');
      onClose();
    } catch (e: any) {
      toast(e.toString(), 'error');
    } finally {
      setIsPrinting(false);
    }
  };

  const updateQty = (id: number, delta: number) => {
    setItems(prev => prev.map(item => 
      item.id === id ? { ...item, printQty: Math.max(0, item.printQty + delta) } : item
    ));
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={onClose} />
      
      <div className="relative w-full max-w-2xl bg-white rounded-2xl shadow-2xl overflow-hidden border border-slate-200">
        <div className="flex items-center justify-between p-4 border-b border-slate-100 bg-slate-50/50">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-brand-100 flex items-center justify-center text-brand-600">
              <Printer className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-slate-800">Batch Print Preview</h3>
              <p className="text-xs text-slate-500">{product.name} - {product.sku}</p>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 transition-colors p-1">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-0 max-h-[60vh] overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 sticky top-0 z-10 shadow-sm">
              <tr className="text-left text-[10px] font-black text-slate-400 uppercase tracking-widest">
                <th className="px-6 py-3">Variant (Size/Color)</th>
                <th className="px-4 py-3">Barcode</th>
                <th className="px-4 py-3 text-center">Stock</th>
                <th className="px-6 py-3 text-right">Print Quantity</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {items.map((item) => (
                <tr key={item.id} className={item.printQty === 0 ? 'opacity-40' : ''}>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-[10px] font-bold text-slate-500">
                        {item.size || '—'}
                      </div>
                      <p className="font-bold text-slate-700">{item.color || 'Standard'}</p>
                    </div>
                  </td>
                  <td className="px-4 py-4 font-mono text-xs text-slate-500">{item.variant_barcode}</td>
                  <td className="px-4 py-4 text-center">
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${item.quantity > 0 ? 'bg-emerald-50 text-emerald-600' : 'bg-red-50 text-red-600'}`}>
                      {item.quantity}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center justify-end gap-2">
                      <button 
                        onClick={() => updateQty(item.id, -1)}
                        className="w-7 h-7 rounded bg-slate-100 flex items-center justify-center hover:bg-slate-200"
                      >
                        -
                      </button>
                      <input 
                        type="number"
                        value={item.printQty}
                        onChange={(e) => updateQty(item.id, (parseInt(e.target.value) || 0) - item.printQty)}
                        className="w-12 text-center font-bold text-slate-800 bg-transparent border-b-2 border-brand-500 focus:outline-none"
                      />
                      <button 
                        onClick={() => updateQty(item.id, 1)}
                        className="w-7 h-7 rounded bg-slate-100 flex items-center justify-center hover:bg-slate-200"
                      >
                        +
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {items.length === 0 && (
            <div className="p-12 text-center">
              <Tag className="w-12 h-12 text-slate-200 mx-auto mb-3" />
              <p className="text-slate-400">No variants found with barcodes.</p>
            </div>
          )}
        </div>

        <div className="p-6 bg-slate-50/80 border-t border-slate-100">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-4">
              <div>
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Total Labels</p>
                <p className="text-2xl font-black text-brand-600">{totalLabels}</p>
              </div>
              <div className="h-10 w-px bg-slate-200" />
              <div>
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Selected Variants</p>
                <p className="text-2xl font-black text-slate-800">{items.filter(i => i.printQty > 0).length}</p>
              </div>
            </div>
            
            <div className="flex gap-3">
              <button 
                onClick={onClose}
                className="px-6 h-12 rounded-xl text-slate-600 font-bold hover:bg-white transition-all border border-slate-200"
              >
                Cancel
              </button>
              <button 
                onClick={handlePrint}
                disabled={isPrinting || totalLabels === 0}
                className="px-8 h-12 rounded-xl bg-brand-600 text-white font-bold hover:bg-brand-700 shadow-lg shadow-brand-200 transition-all flex items-center gap-2 disabled:opacity-50"
              >
                {isPrinting ? (
                  <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  <>
                    <Printer className="w-4 h-4" />
                    Confirm & Print
                  </>
                )}
              </button>
            </div>
          </div>
          
          <div className="flex items-center gap-2 text-[10px] text-slate-500 bg-blue-50/50 p-2 rounded-lg border border-blue-100">
            <div className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
            Each label will include Shop Name, Product Name, Variant Details, Price, and Barcode.
          </div>

          {/* Discount Toggle */}
          <div className="mt-3">
            <button
              onClick={() => {
                setShowDiscount(!showDiscount);
                if (!showDiscount) {
                  setMrpPrice(product.sale_price);
                  setSalePrice(product.sale_price);
                }
              }}
              className={`w-full h-10 rounded-xl text-sm font-bold transition-all border flex items-center justify-center gap-2 ${
                showDiscount
                  ? 'bg-emerald-50 border-emerald-300 text-emerald-700'
                  : 'bg-slate-50 border-slate-200 text-slate-500 hover:bg-slate-100'
              }`}
            >
              <Tag className="w-4 h-4" />
              {showDiscount ? 'Discount Active' : 'Add MRP / Sale Price'}
            </button>

            {showDiscount && (
              <div className="flex gap-3 mt-3">
                <div className="flex-1">
                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">M.R.P (Original)</label>
                  <input
                    type="number"
                    value={mrpPrice}
                    onChange={(e) => setMrpPrice(parseFloat(e.target.value) || 0)}
                    className="w-full h-10 text-center text-sm font-bold bg-transparent border border-red-200 rounded-lg focus:border-red-500 focus:ring-1 focus:ring-red-500 focus:outline-none text-red-600"
                  />
                </div>
                <div className="flex-1">
                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Sale Price</label>
                  <input
                    type="number"
                    value={salePrice}
                    onChange={(e) => setSalePrice(parseFloat(e.target.value) || 0)}
                    className="w-full h-10 text-center text-sm font-bold bg-transparent border border-emerald-200 rounded-lg focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 focus:outline-none text-emerald-600"
                  />
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
