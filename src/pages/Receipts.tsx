import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { cmd, formatCurrency } from '../lib/utils';
import { useSettingsStore } from '../stores/settingsStore';
import { useToast } from '../components/ui/Toaster';
import { format } from 'date-fns';
import { Search, Printer, Eye, X, Receipt as ReceiptIcon, ArrowRightLeft, AlertTriangle } from 'lucide-react';
import { cn } from '../lib/utils';
import Barcode from 'react-barcode';

interface Sale {
  id: number;
  invoice_number: string;
  customer_id: number | null;
  customer_name: string | null;
  sale_date: string;
  subtotal: number;
  discount_amount: number;
  tax_amount: number;
  total_amount: number;
  paid_amount: number;
  change_amount: number;
  payment_method: string;
  status: string;
  notes: string | null;
}

interface SaleItem {
  id: number;
  sale_id: number;
  product_name: string;
  quantity: number;
  unit_price: number;
  discount: number;
  total_price: number;
}

export default function ReceiptsPage() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const {
    printer_type, printer_port, printer_baud, currency_symbol,
    shop_name, shop_address, shop_phone, shop_logo, shop_email,
    receipt_header, receipt_footer
  } = useSettingsStore();

  const [query, setQuery] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  const [selectedSale, setSelectedSale] = useState<number | null>(null);
  const [returningSale, setReturningSale] = useState<number | null>(null);

  const { data: sales = [], isFetching } = useQuery<Sale[]>({
    queryKey: ['sales-history', query, fromDate, toDate],
    queryFn: () => cmd('search_sales', {
      query: query || null,
      from: fromDate || null,
      to: toDate || null
    }),
  });

  const filteredSales = statusFilter
    ? sales.filter(s => s.status === statusFilter)
    : sales;

  const handleReprint = async (saleId: number) => {
    if (!printer_type || printer_type === 'none') {
      toast("No printer configured in settings.", "error");
      return;
    }
    try {
      await cmd('print_sale_by_id', {
        id: saleId,
        config: {
          printer_type,
          port: printer_port,
          baud_rate: printer_baud,
        }
      });
      toast("Receipt sent to printer", "success");
    } catch (e: any) {
      toast("Print failed: " + e.toString(), "error");
    }
  };

  return (
    <div className="flex flex-col h-full bg-slate-50 p-6">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Sales Receipts</h1>
          <p className="text-sm text-slate-500">View history and reprint past sales invoices.</p>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 mb-6 flex flex-wrap gap-4 items-center">
        <div className="relative flex-1 min-w-[250px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            placeholder="Search by Invoice or Customer Name..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="input pl-9 w-full"
          />
        </div>
        <div className="flex items-center gap-2">
          <label className="text-sm font-medium text-slate-600">From:</label>
          <input
            type="date"
            value={fromDate}
            onChange={(e) => setFromDate(e.target.value)}
            className="input"
          />
        </div>
        <div className="flex items-center gap-2">
          <label className="text-sm font-medium text-slate-600">To:</label>
          <input
            type="date"
            value={toDate}
            onChange={(e) => setToDate(e.target.value)}
            className="input"
          />
        </div>
        <div className="flex items-center gap-2">
          <label className="text-sm font-medium text-slate-600">Status:</label>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="input w-32"
          >
            <option value="">All</option>
            <option value="paid">Paid</option>
            <option value="partial">Partial</option>
            <option value="udhaar">Udhaar</option>
          </select>
        </div>
      </div>

      {/* Data Table */}
      <div className="flex-1 bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden flex flex-col">
        <div className="overflow-x-auto flex-1">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 text-sm">
                <th className="py-3 px-4 font-semibold text-slate-700">Date/Time</th>
                <th className="py-3 px-4 font-semibold text-slate-700">Invoice</th>
                <th className="py-3 px-4 font-semibold text-slate-700">Customer</th>
                <th className="py-3 px-4 font-semibold text-slate-700">Payment</th>
                <th className="py-3 px-4 font-semibold text-slate-700">Status</th>
                <th className="py-3 px-4 font-semibold text-slate-700">Amount</th>
                <th className="py-3 px-4 font-semibold text-slate-700 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {isFetching && filteredSales.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-slate-500">Loading...</td>
                </tr>
              ) : filteredSales.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-slate-500">
                    <ReceiptIcon className="w-12 h-12 mx-auto text-slate-300 mb-2" />
                    No sales found matching your criteria.
                  </td>
                </tr>
              ) : (
                filteredSales.map((s) => (
                  <tr key={s.id} className="border-b border-slate-100 hover:bg-slate-50/50 transition-colors group">
                    <td className="py-3 px-4 text-sm text-slate-600">
                      {format(new Date(s.sale_date), 'dd MMM yyyy, hh:mm a')}
                    </td>
                    <td className="py-3 px-4 text-sm font-medium text-brand-700">
                      {s.invoice_number}
                    </td>
                    <td className="py-3 px-4 text-sm text-slate-700">
                      {s.customer_name || <span className="text-slate-400 italic">Walk-in</span>}
                    </td>
                    <td className="py-3 px-4">
                      <span className={cn("px-2 py-1 rounded text-xs font-medium uppercase",
                        s.payment_method === 'cash' ? "bg-emerald-100 text-emerald-700" :
                          s.payment_method === 'card' ? "bg-blue-100 text-blue-700" :
                            s.payment_method === 'udhaar' ? "bg-rose-100 text-rose-700" :
                              "bg-amber-100 text-amber-700"
                      )}>
                        {s.payment_method}
                      </span>
                    </td>
                    <td className="py-3 px-4">
                      <span className={cn("px-2 py-1 rounded text-xs font-medium uppercase",
                        s.status === 'paid' ? "bg-emerald-100 text-emerald-700" :
                          s.status === 'partial' ? "bg-amber-100 text-amber-700" :
                            "bg-rose-100 text-rose-700"
                      )}>
                        {s.status}
                      </span>
                    </td>
                    <td className="py-3 px-4 font-semibold text-slate-800">
                      {formatCurrency(s.total_amount, currency_symbol)}
                    </td>
                    <td className="py-3 px-4 text-right">
                      <div className="flex justify-end gap-2">
                        <button
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            setSelectedSale(s.id);
                          }}
                          className="btn-icon text-slate-400 hover:text-brand-600 hover:bg-brand-50"
                          title="View Details"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                        <button
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            if (!printer_type || printer_type === 'none') {
                              setSelectedSale(s.id);
                            } else {
                              handleReprint(s.id);
                            }
                          }}
                          className="btn-icon text-slate-400 hover:text-emerald-600 hover:bg-emerald-50"
                          title="Reprint Receipt"
                        >
                          <Printer className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {selectedSale && (
        <SaleDetailsModal
          saleId={selectedSale}
          onClose={() => setSelectedSale(null)}
          onReprint={() => handleReprint(selectedSale)}
          onReturn={() => {
            const id = selectedSale;
            setSelectedSale(null);
            setReturningSale(id);
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

      {returningSale && (
        <ReturnItemsModal
          saleId={returningSale}
          onClose={() => setReturningSale(null)}
          currencySymbol={currency_symbol}
        />
      )}
    </div>
  );
}

export function SaleDetailsModal({
  saleId, onClose, onReprint, onReturn, currency_symbol, printer_type,
  shop_name, shop_address, shop_phone, shop_logo, shop_email, receipt_header, receipt_footer
}: {
  saleId: number;
  onClose: () => void;
  onReprint: () => void;
  onReturn: () => void;
  currency_symbol: string;
  printer_type?: string;
  shop_name?: string;
  shop_address?: string;
  shop_phone?: string;
  shop_logo?: string | null;
  shop_email?: string;
  receipt_header?: string;
  receipt_footer?: string;
}) {
  const { data, isLoading, error } = useQuery<[Sale, SaleItem[]]>({
    queryKey: ['sale-details', saleId],
    queryFn: () => cmd('get_sale_with_items', { id: saleId })
  });

  if (isLoading) {
    return (
      <>
        <div className="overlay" onClick={onClose} />
        <div className="dialog w-[500px] flex items-center justify-center py-12">
          <span className="w-8 h-8 rounded-full border-4 border-brand-200 border-t-brand-600 animate-spin" />
        </div>
      </>
    );
  }

  if (error || !data) {
    return (
      <>
        <div className="overlay" onClick={onClose} />
        <div className="dialog w-[500px] text-center py-8">
          <p className="text-red-500 mb-4">Error loading details</p>
          <pre className="text-xs text-left p-4 bg-slate-100 mb-4 overflow-auto border border-red-200">
            {String(error)}
          </pre>
          <button onClick={onClose} className="btn-secondary">Close</button>
        </div>
      </>
    );
  }

  const [sale, items] = data;

  return (
    <>
      <div className="overlay no-print" onClick={onClose} />
      <div className="dialog w-[400px] print-receipt font-mono text-sm">
        <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-100 no-print">
          <div>
            <h2 className="text-lg font-bold text-slate-800">Receipt Details</h2>
            <p className="text-xs text-slate-500">Preview before printing</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-red-500 no-print"><X className="w-5 h-5" /></button>
        </div>

        {/* ── Thermal-style Receipt Body ── */}
        <div style={{ fontFamily: "'Courier New', Courier, monospace", fontSize: '12px', lineHeight: '1.6', color: '#000', letterSpacing: '0.02em' }}>

          {/* Shop Header - Centered */}
          <div style={{ textAlign: 'center', marginBottom: '12px', paddingBottom: '8px', borderBottom: '2px dashed #333' }}>
            {shop_logo && (
              <img src={shop_logo} alt="Logo" style={{ width: '56px', height: '56px', margin: '0 auto 6px', display: 'block', objectFit: 'contain' }} />
            )}
            <div style={{ fontSize: '18px', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: '0.1em' }}>{shop_name || 'My Shop'}</div>
            {shop_address && <div style={{ fontSize: '11px', marginTop: '2px' }}>{shop_address}</div>}
            {shop_phone && <div style={{ fontSize: '11px' }}>{shop_phone}</div>}
            {shop_email && <div style={{ fontSize: '11px' }}>{shop_email}</div>}
          </div>

          {/* Receipt Header Text (from settings) */}
          {receipt_header && (
            <div style={{ textAlign: 'center', fontSize: '11px', marginBottom: '8px', padding: '4px 0', borderBottom: '1px dashed #999' }}>
              {receipt_header.split('\n').map((line, idx) => (
                <div key={idx}>{line}</div>
              ))}
            </div>
          )}

          {/* Sale Info - Left/Right */}
          <div style={{ marginBottom: '8px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Sale ID:</span><span style={{ fontWeight: 600 }}>{sale.invoice_number}</span></div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Date:</span><span>{format(new Date(sale.sale_date), 'dd MMM yyyy, hh:mm a')}</span></div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Customer:</span><span>{sale.customer_name || 'Walk-in'}</span></div>
          </div>

          {/* Items Header */}
          <div style={{ borderTop: '1px dashed #333', borderBottom: '1px dashed #333', padding: '4px 0', marginBottom: '4px' }}>
            <div style={{ display: 'flex', fontWeight: 'bold' }}>
              <span style={{ flex: '1 1 40%' }}>Item</span>
              <span style={{ width: '35px', textAlign: 'center' }}>Qty</span>
              <span style={{ width: '70px', textAlign: 'right' }}>Rate</span>
              <span style={{ width: '75px', textAlign: 'right' }}>Total</span>
            </div>
          </div>

          {/* Items */}
          <div style={{ marginBottom: '8px' }}>
            {items.map(i => (
              <div key={i.id} style={{ borderBottom: '1px dotted #ccc', paddingBottom: '4px', marginBottom: '4px' }}>
                <div style={{ display: 'flex' }}>
                  <span style={{ flex: '1 1 40%', wordBreak: 'break-word' }}>{i.product_name}</span>
                  <span style={{ width: '35px', textAlign: 'center' }}>{i.quantity}</span>
                  <span style={{ width: '70px', textAlign: 'right' }}>{formatCurrency(i.unit_price, currency_symbol)}</span>
                  <span style={{ width: '75px', textAlign: 'right', fontWeight: 'bold' }}>{formatCurrency(i.total_price, currency_symbol)}</span>
                </div>
                {i.quantity > 1 && (
                  <div style={{ fontSize: '10px', color: '#666', paddingLeft: '4px' }}>
                    @ {formatCurrency(i.unit_price, currency_symbol)} x {i.quantity}
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Separator */}
          <div style={{ borderTop: '1px dashed #333', paddingTop: '6px', marginBottom: '4px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>SUBTOTAL:</span><span>{formatCurrency(sale.subtotal, currency_symbol)}</span></div>
            {sale.discount_amount > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>DISCOUNT:</span><span>-{formatCurrency(sale.discount_amount, currency_symbol)}</span></div>
            )}
            {sale.tax_amount > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>TAX:</span><span>{formatCurrency(sale.tax_amount, currency_symbol)}</span></div>
            )}
          </div>

          {/* Total - Bold */}
          <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 'bold', fontSize: '14px', borderTop: '2px solid #000', borderBottom: '2px solid #000', padding: '4px 0', margin: '4px 0' }}>
            <span>TOTAL:</span><span>{formatCurrency(sale.total_amount, currency_symbol)}</span>
          </div>

          {/* Payment */}
          <div style={{ marginBottom: '8px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>PAID ({sale.payment_method.toUpperCase()}):</span><span>{formatCurrency(sale.paid_amount, currency_symbol)}</span></div>
            {sale.change_amount > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>CHANGE:</span><span>{formatCurrency(sale.change_amount, currency_symbol)}</span></div>
            )}
            {(sale.total_amount - sale.paid_amount) > 0.01 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', color: '#c00', fontWeight: 'bold' }}><span>BALANCE DUE:</span><span>{formatCurrency(sale.total_amount - sale.paid_amount, currency_symbol)}</span></div>
            )}
          </div>

          {/* Double-line separator */}
          <div style={{ borderTop: '3px double #333', marginBottom: '8px' }}></div>

          {/* Shop info repeated (like Python module) */}
          <div style={{ textAlign: 'center', fontSize: '11px', marginBottom: '8px' }}>
            {shop_address && <div>{shop_address}</div>}
            {shop_phone && <div>Tel: {shop_phone}</div>}
            {shop_email && <div>{shop_email}</div>}
          </div>

          {/* Footer */}
          <div style={{ textAlign: 'center', fontSize: '11px', marginBottom: '10px' }}>
            {(receipt_footer || 'Thank You!').split('\n').map((line, idx) => (
              <div key={idx}>{line}</div>
            ))}
          </div>

          {/* Barcode */}
          <div style={{ textAlign: 'center', margin: '8px 0' }}>
            <Barcode
              value={sale.invoice_number}
              width={1.2}
              height={40}
              displayValue={true}
              fontSize={11}
              margin={0}
              font="'Courier New', monospace"
            />
          </div>
        </div>

        <div className="mt-6 flex flex-col gap-3 no-print">
          {/* Direct Thermal Printer (ESC/POS – sharp professional output) */}
          {printer_type && printer_type !== 'none' && (
            <button
              onClick={() => {
                onReprint();
                onClose();
              }}
              className="btn-primary py-2 rounded-lg flex items-center justify-center gap-2"
            >
              <Printer className="w-4 h-4" />
              Print Receipt (Thermal Printer)
            </button>
          )}

          {/* Browser Print Preview (A4 / PDF fallback) */}
          <button
            onClick={() => window.print()}
            className={`${printer_type && printer_type !== 'none' ? 'btn-secondary' : 'btn-primary'} py-2 rounded-lg flex items-center justify-center gap-2`}
          >
            <Eye className="w-4 h-4" />
            Print Preview (Browser)
          </button>

          <button
            onClick={onReturn}
            className="btn-secondary py-2 rounded-lg flex items-center justify-center gap-2 text-rose-600 border-rose-200 hover:bg-rose-50"
          >
            <ArrowRightLeft className="w-4 h-4" />
            Return Items
          </button>
        </div>
      </div>
    </>
  );
}

function ReturnItemsModal({ saleId, onClose, currencySymbol }: { saleId: number; onClose: () => void; currencySymbol: string }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery<[Sale, SaleItem[]]>({
    queryKey: ['sale-details', saleId],
    queryFn: () => cmd('get_sale_with_items', { id: saleId })
  });

  const [returnQtys, setReturnQtys] = useState<Record<number, number>>({});
  const [damagedMap, setDamagedMap] = useState<Record<number, boolean>>({});
  const [refundMethod, setRefundMethod] = useState<'cash' | 'adjustment'>('cash');
  const [reason, setReason] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (isLoading || !data) return null;
  const [sale, items] = data;

  const handleQtyChange = (itemId: number, qty: number, max: number) => {
    const val = Math.max(0, Math.min(qty, max));
    setReturnQtys(prev => ({ ...prev, [itemId]: val }));
  };

  const totalRefund = items.reduce((sum, item) => {
    const qty = returnQtys[item.id] || 0;
    return sum + (qty * item.unit_price);
  }, 0);

  const handleSubmit = async () => {
    const payloads = items
      .filter(i => (returnQtys[i.id] || 0) > 0)
      .map(i => ({
        sale_item_id: i.id,
        quantity: returnQtys[i.id],
        is_damaged: !!damagedMap[i.id],
      }));

    if (payloads.length === 0) {
      toast("Select at least one item to return", "error");
      return;
    }

    try {
      setIsSubmitting(true);
      await cmd('process_sales_return', {
        payload: {
          sale_id: saleId,
          items: payloads,
          refund_method: refundMethod,
          reason: reason || null,
          created_by: null,
        }
      });
      toast("Return processed successfully", "success");
      queryClient.invalidateQueries({ queryKey: ['sales-history'] });
      queryClient.invalidateQueries({ queryKey: ['sales'] });
      queryClient.invalidateQueries({ queryKey: ['products'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      queryClient.invalidateQueries({ queryKey: ['financial-ledger'] });
      queryClient.invalidateQueries({ queryKey: ['customers'] });
      queryClient.invalidateQueries({ queryKey: ['total-udhaar'] });
      onClose();
    } catch (e: any) {
      toast(e.toString(), "error");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
      <div className="overlay" onClick={onClose} />
      <div className="dialog w-[600px] flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold text-slate-800">Return Items: {sale.invoice_number}</h2>
          <button onClick={onClose} className="btn-icon"><X className="w-5 h-5" /></button>
        </div>

        <div className="p-4 bg-amber-50 rounded-lg border border-amber-100 mb-4 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-amber-700">
            Selected items will be returned to stock (unless marked damaged). Accounts will be adjusted automatically.
          </p>
        </div>

        <div className="flex-1 overflow-y-auto mb-4 border rounded-lg border-slate-100">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 sticky top-0">
              <tr className="border-b border-slate-200 text-slate-600">
                <th className="p-3 font-semibold text-left">Item Name</th>
                <th className="p-3 font-semibold text-center">Sold</th>
                <th className="p-3 font-semibold text-center w-24">Return Qty</th>
                <th className="p-3 font-semibold text-center">Damaged?</th>
                <th className="p-3 font-semibold text-right">Refund</th>
              </tr>
            </thead>
            <tbody>
              {items.map(item => (
                <tr key={item.id} className="border-b border-slate-50 hover:bg-slate-50/50">
                  <td className="p-3">
                    <div className="font-medium text-slate-800">{item.product_name}</div>
                    <div className="text-xs text-slate-500">{formatCurrency(item.unit_price, currencySymbol)}</div>
                  </td>
                  <td className="p-3 text-center text-slate-600">{item.quantity}</td>
                  <td className="p-3">
                    <input
                      type="number"
                      className="input py-1 text-center w-full"
                      value={returnQtys[item.id] || ''}
                      onChange={(e) => handleQtyChange(item.id, parseInt(e.target.value) || 0, item.quantity)}
                      placeholder="0"
                    />
                  </td>
                  <td className="p-3 text-center">
                    <input
                      type="checkbox"
                      className="w-4 h-4 rounded text-rose-600 focus:ring-rose-500"
                      checked={!!damagedMap[item.id]}
                      onChange={(e) => setDamagedMap(prev => ({ ...prev, [item.id]: e.target.checked }))}
                    />
                  </td>
                  <td className="p-3 text-right font-bold text-slate-700">
                    {formatCurrency((returnQtys[item.id] || 0) * item.unit_price, currencySymbol)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="grid grid-cols-2 gap-4 mb-4">
          <div>
            <label className="text-xs font-bold text-slate-500 uppercase mb-1 block">Refund Method</label>
            <select
              className="input w-full"
              value={refundMethod}
              onChange={(e) => setRefundMethod(e.target.value as any)}
            >
              <option value="cash">Cash Refund</option>
              {sale.customer_id && <option value="adjustment">Deduct from Customer Udhaar</option>}
            </select>
          </div>
          <div>
            <label className="text-xs font-bold text-slate-500 uppercase mb-1 block">Total Refund</label>
            <div className="text-2xl font-black text-rose-600">{formatCurrency(totalRefund, currencySymbol)}</div>
          </div>
        </div>

        <div>
          <label className="text-xs font-bold text-slate-500 uppercase mb-1 block">Return Reason (Optional)</label>
          <input
            type="text"
            className="input w-full mb-6"
            placeholder="e.g., Size issue, Wrong color..."
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
        </div>

        <div className="flex gap-3">
          <button onClick={onClose} className="btn-secondary flex-1" disabled={isSubmitting}>Cancel</button>
          <button
            onClick={handleSubmit}
            className="btn-primary flex-1 bg-rose-600 hover:bg-rose-700 border-rose-600"
            disabled={isSubmitting || totalRefund <= 0}
          >
            {isSubmitting ? "Processing..." : `Confirm Return & Refund`}
          </button>
        </div>
      </div>
    </>
  );
}
