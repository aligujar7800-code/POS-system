import React, { useState } from 'react';
import Barcode from 'react-barcode';
import { useTranslation } from 'react-i18next';
import { cmd } from '../../lib/utils';
import { useSettingsStore } from '../../stores/settingsStore';
import { useToast } from './Toaster';
import { X, Printer, Tag, ArrowLeft } from 'lucide-react';

interface BarcodeModalProps {
  isOpen: boolean;
  onClose: () => void;
  product: {
    name: string;
    barcode: string;
    size?: string;
    color?: string;
    price: number;
    sku?: string;
  };
}

export default function BarcodeModal({ isOpen, onClose, product }: BarcodeModalProps) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const settings = useSettingsStore();
  const [quantity, setQuantity] = useState(1);
  const [isPrinting, setIsPrinting] = useState(false);
  const [template, setTemplate] = useState<'small' | 'large'>('large');
  const [showDiscount, setShowDiscount] = useState(false);
  const [mrpPrice, setMrpPrice] = useState(product.price);
  const [salePrice, setSalePrice] = useState(product.price);

  if (!isOpen) return null;

  const handlePrintLabel = async () => {
    setIsPrinting(true);
    try {
      await cmd('print_label', {
        data: {
          shop_name: settings.shop_name,
          product_name: product.name,
          sku: product.sku || '',
          size: product.size,
          color: product.color,
          price: showDiscount ? salePrice : product.price,
          barcode: showDiscount ? `${product.barcode}$${salePrice}` : product.barcode,
          quantity: quantity,
          template: 'small',
          protocol: settings.label_printer_protocol,
          offset_x: settings.label_offset_x,
          offset_y: settings.label_offset_y,
          mrp: showDiscount ? mrpPrice : null
        },
        config: {
          printer_type: (() => {
            const port = settings.label_printer_port || settings.printer_port;
            if (port.toUpperCase().startsWith('COM')) return 'serial';
            if (port.startsWith('usb:')) return 'usb';
            if (port.includes('.') && port.includes(':')) return 'network';
            return 'system';
          })(),
          port: settings.label_printer_port || settings.printer_port,
          baud_rate: settings.printer_baud
        }
      });
      toast('Label sent to printer', 'success');
    } catch (e: any) {
      toast(e.toString(), 'error');
    } finally {
      setIsPrinting(false);
    }
  };

  const handleBrowserPrint = () => {
    window.print();
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={onClose} />
      
      <div className="relative w-full max-w-lg bg-white rounded-2xl shadow-2xl overflow-hidden border border-slate-200">
        <div className="flex items-center justify-between p-4 border-b border-slate-100 bg-slate-50/50">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-brand-100 flex items-center justify-center text-brand-600">
              <Tag className="w-5 h-5" />
            </div>
            <h3 className="font-bold text-slate-800">Print Barcode Label</h3>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 transition-colors p-1">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6">
          <div className="flex flex-col items-center gap-6">
            {/* Barcode Preview */}
            <div 
              className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col transition-all overflow-hidden"
              style={{
                width: '280px',
                minHeight: '160px',
                fontFamily: "'Courier New', Courier, monospace"
              }}
            >
              {/* Row 1: Product Name + Size */}
              <div className="flex justify-between items-start mb-1">
                <span className="font-extrabold text-[13px] text-slate-900 uppercase leading-tight truncate flex-1">{product.name}</span>
                {product.size && <span className="text-[12px] font-bold text-slate-700 ml-2 whitespace-nowrap">{product.size}</span>}
              </div>

              {/* Row 2: Article/SKU + Color */}
              <div className="flex justify-between items-center mb-1">
                {product.sku && <span className="text-[10px] font-bold text-slate-500 uppercase">ART-{product.sku}</span>}
                {product.color && <span className="text-[11px] font-semibold text-slate-500">{product.color}</span>}
              </div>

              {/* Row 3: Price (MRP + Sale or just Price) */}
              <div className="flex items-baseline gap-4 mb-2">
                {showDiscount ? (
                  <>
                    <span className="line-through text-[14px] font-extrabold text-slate-400 decoration-2">MRP: {mrpPrice.toLocaleString()}</span>
                    <span className="text-[16px] font-black text-slate-900">SALE: {salePrice.toLocaleString()}</span>
                  </>
                ) : (
                  <span className="text-[16px] font-black text-slate-900">{settings.currency_symbol} {product.price.toLocaleString()}</span>
                )}
              </div>

              {/* Row 4: Barcode */}
              <div className="flex justify-center mt-auto">
                <Barcode 
                  value={showDiscount ? `${product.barcode}$${salePrice}` : product.barcode} 
                  width={1.4} 
                  height={45} 
                  fontSize={12}
                  margin={0}
                  font="'Courier New', monospace"
                />
              </div>
            </div>

            <div className="w-full space-y-4">
              <div className="flex gap-4">
                <div className="flex-[1.5]">
                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2">
                    Alignment (X, Y)
                  </label>
                  <div className="flex items-center gap-2 h-10">
                    <input 
                      type="number"
                      title="Horizontal Offset (X)"
                      value={settings.label_offset_x}
                      onChange={(e) => settings.setSettings({ label_offset_x: parseInt(e.target.value) || 0 })}
                      className="flex-1 w-full min-w-0 h-full text-center text-sm font-bold bg-transparent border border-slate-200 rounded-lg focus:border-brand-500 focus:ring-1 focus:ring-brand-500 focus:outline-none"
                    />
                    <input 
                      type="number"
                      title="Vertical Offset (Y)"
                      value={settings.label_offset_y}
                      onChange={(e) => settings.setSettings({ label_offset_y: parseInt(e.target.value) || 0 })}
                      className="flex-1 w-full min-w-0 h-full text-center text-sm font-bold bg-transparent border border-slate-200 rounded-lg focus:border-brand-500 focus:ring-1 focus:ring-brand-500 focus:outline-none"
                    />
                  </div>
                </div>
                <div className="flex-1">
                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2">
                    Quantity
                  </label>
                  <div className="flex items-center gap-2 h-10">
                    <button 
                      onClick={() => setQuantity(q => Math.max(1, q - 1))}
                      className="w-8 h-8 rounded-lg border border-slate-200 flex items-center justify-center hover:bg-slate-50 text-slate-600 text-sm"
                    >
                      -
                    </button>
                    <input 
                      type="number"
                      value={quantity}
                      onChange={(e) => setQuantity(Math.max(1, parseInt(e.target.value) || 1))}
                      className="flex-1 h-full text-center text-sm font-bold bg-transparent border-b border-brand-500 focus:outline-none"
                    />
                    <button 
                      onClick={() => setQuantity(q => q + 1)}
                      className="w-8 h-8 rounded-lg border border-slate-200 flex items-center justify-center hover:bg-slate-50 text-slate-600 text-sm"
                    >
                      +
                    </button>
                  </div>
                </div>
              </div>

              {/* Discount Toggle */}
              <div className="w-full">
                <button
                  onClick={() => {
                    setShowDiscount(!showDiscount);
                    if (!showDiscount) {
                      setMrpPrice(product.price);
                      setSalePrice(product.price);
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

              <div className="grid grid-cols-2 gap-3 pt-4">
                <button
                  onClick={handleBrowserPrint}
                  className="h-12 rounded-xl text-slate-700 font-bold hover:bg-slate-100 transition-all border border-slate-200 flex items-center justify-center gap-2"
                >
                  <Printer className="w-4 h-4" />
                  Print (A4)
                </button>
                <button
                  onClick={handlePrintLabel}
                  disabled={isPrinting}
                  className="h-12 rounded-xl bg-brand-600 text-white font-bold hover:bg-brand-700 shadow-lg shadow-brand-200 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {isPrinting ? (
                    <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  ) : (
                    <>
                      <Tag className="w-4 h-4" />
                      Label Printer
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-slate-50 p-4 border-t border-slate-100 flex items-center gap-2">
          <div className="w-4 h-4 rounded-full bg-blue-500 animate-pulse" />
          <p className="text-[10px] text-slate-500 font-medium leading-tight">
            Connect your Label Printer to <span className="font-bold text-slate-700">{settings.label_printer_port || 'USB/COM'}</span> to use direct thermal printing.
          </p>
        </div>
      </div>

      <style>{`
        @media print {
          body * { visibility: hidden; }
          .print-section, .print-section * { visibility: visible; }
          .print-section { position: absolute; left: 0; top: 0; }
        }
      `}</style>
    </div>
  );
}
