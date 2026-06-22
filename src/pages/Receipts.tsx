import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { formatCurrency, cmd } from '../lib/utils';
import ReceiptHtmlPreview, { DEFAULT_TEMPLATE, ReceiptTemplate, ReceiptPreviewData } from '../components/ReceiptHtmlPreview';
import { useSettingsStore } from '../stores/settingsStore';
import { useToast } from '../components/ui/Toaster';
import { format } from 'date-fns';
import { Search, Printer, Eye, X, Receipt as ReceiptIcon, ArrowRightLeft, AlertTriangle, Barcode as BarcodeIcon, RotateCw, CreditCard, Store } from 'lucide-react';
import { cn } from '../lib/utils';
import Barcode from 'react-barcode';
import { useBarcode } from '../hooks/useBarcode';
import { useAuthStore } from '../stores/authStore';

interface Sale {
  id: number;
  invoice_number: string;
  customer_id: number | null;
  customer_name: string | null;
  customer_phone: string | null;
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
  returned_quantity?: number;
}

export default function ReceiptsPage() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const {
    printer_type, printer_port, printer_baud, currency_symbol,
    shop_name, shop_address, shop_phone, shop_logo, shop_email,
    receipt_header, receipt_footer,
    logo_width, logo_height, logo_align, receipt_font, custom_receipt_template
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

  useBarcode(async (barcode) => {
    if (!selectedSale && !returningSale) {
      setQuery(barcode);
    }
  });

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
          logo_width={logo_width}
          logo_height={logo_height}
          logo_align={logo_align}
          receipt_font={receipt_font}
          custom_receipt_template={custom_receipt_template}
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
  shop_name, shop_address, shop_phone, shop_logo, shop_email, receipt_header, receipt_footer,
  logo_width, logo_height, logo_align, receipt_font,
  autoPrint = false,
  custom_receipt_template
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
  logo_width?: number;
  logo_height?: number;
  logo_align?: 'left' | 'center' | 'right';
  receipt_font?: string;
  autoPrint?: boolean;
  custom_receipt_template?: string;
}) {
  const { data, isLoading, error, refetch } = useQuery<[Sale, SaleItem[]]>({
    queryKey: ['sale-details', saleId],
    queryFn: () => cmd('get_sale_with_items', { id: saleId })
  });

  const [refundLoading, setRefundLoading] = useState(false);
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const handleGatewayRefund = async () => {
    if (!data) return;
    const [sale] = data;
    
    if (!window.confirm(`Are you sure you want to refund ${formatCurrency(sale.total_amount, currency_symbol)} via ${sale.payment_method}?`)) {
      return;
    }

    setRefundLoading(true);
    try {
      // 1. Process gateway refund
      const result = await cmd<any>('payment_refund', {
        gateway: sale.payment_method,
        saleId: sale.id,
        amount: sale.total_amount,
        reason: "Customer requested refund"
      });

      if (result.status === 'success') {
        toast("Gateway refund successful: " + (result.message || ""), "success");
        // 2. Mark sale as returned/refunded in local DB (simplified)
        // In a real app, you might want to call process_sales_return too
        queryClient.invalidateQueries({ queryKey: ['sale-details', saleId] });
        queryClient.invalidateQueries({ queryKey: ['sales-history'] });
        queryClient.invalidateQueries({ queryKey: ['sales-report'] });
        queryClient.invalidateQueries({ queryKey: ['pl'] });
        queryClient.invalidateQueries({ queryKey: ['pl-statement'] });
        refetch();
      } else {
        toast("Refund failed: " + (result.message || "Unknown error"), "error");
      }
    } catch (err: any) {
      toast("Refund Error: " + err.toString(), "error");
    } finally {
      setRefundLoading(false);
    }
  };

  React.useEffect(() => {
    if (data && autoPrint) {
      const timer = setTimeout(() => {
        if (printer_type && printer_type !== 'none') {
          onReprint();
        } else {
          window.print();
        }
        onClose();
      }, 500); // give it a moment to render images/fonts
      return () => clearTimeout(timer);
    }
  }, [data, autoPrint, onClose, printer_type, onReprint]);

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

  // Construct preview data
  const variables = {
    shop_name: shop_name || 'My Shop',
    shop_address: shop_address || '',
    shop_phone: shop_phone || '',
    shop_email: shop_email || '',
    invoice_number: sale.invoice_number,
    invoice_date: format(new Date(sale.sale_date), 'dd MMM yyyy'),
    invoice_time: format(new Date(sale.sale_date), 'hh:mm a'),
    invoice_datetime: format(new Date(sale.sale_date), 'dd MMM yyyy, hh:mm a'),
    customer_name: sale.customer_name || 'Walk-in',
    customer_phone: sale.customer_phone || '',
    cashier_name: "Cashier",
    payment_method: sale.payment_method.toUpperCase(),
    subtotal: sale.subtotal,
    discount: sale.discount_amount,
    tax: sale.tax_amount,
    grand_total: sale.total_amount,
    amount_paid: sale.paid_amount,
    change_returned: sale.change_amount
  };

  const previewData: ReceiptPreviewData = {
    variables,
    items: items.map(i => ({
      id: i.id,
      name: i.product_name,
      qty: i.quantity,
      unit_price: i.unit_price,
      total: i.total_price
    })),
    shop_logo,
    logo_width,
    logo_height,
    currency_symbol
  };

  const template: ReceiptTemplate = custom_receipt_template 
    ? JSON.parse(custom_receipt_template) 
    : DEFAULT_TEMPLATE;

  // If autoPrint is true, we hide the modal UI (it will still render for @media print)
  if (autoPrint) {
    return (
      <div className="print-receipt" style={{ opacity: 0, position: 'absolute', pointerEvents: 'none' }}>
        <ReceiptHtmlPreview template={template} data={previewData} />
      </div>
    );
  }

  return (
    <>
      <div className="overlay no-print" onClick={onClose} />
      <div className="dialog w-full max-w-[420px] print-receipt">
        <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-100 no-print">
          <div>
            <h2 className="text-lg font-bold text-slate-800">Receipt Details</h2>
            <p className="text-xs text-slate-500">Preview before printing</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-red-500 no-print"><X className="w-5 h-5" /></button>
        </div>

        <div className="flex justify-center w-full">
          <ReceiptHtmlPreview template={template} data={previewData} />
        </div>

        <div className="mt-6 flex flex-col gap-3 no-print">
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

            {['jazzcash', 'easypaisa', 'hbl_pay', 'stripe'].includes(sale.payment_method) && sale.status === 'paid' && (
              <button
                onClick={handleGatewayRefund}
                disabled={refundLoading}
                className="btn-secondary py-2 rounded-lg flex items-center justify-center gap-2 text-orange-600 border-orange-200 hover:bg-orange-50 disabled:opacity-50"
              >
                {refundLoading ? <RotateCw className="w-4 h-4 animate-spin" /> : <ArrowRightLeft className="w-4 h-4" />}
                Full Refund via {sale.payment_method}
              </button>
            )}
          </div>
      </div>
    </>
  );
}

function ReturnItemsModal({ saleId, onClose, currencySymbol }: { saleId: number; onClose: () => void; currencySymbol: string }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { user } = useAuthStore();
  const { printer_type, printer_port, printer_baud, shop_name, shop_address, shop_phone, shop_logo, shop_email, receipt_header, receipt_footer, logo_width, logo_height, logo_align, receipt_font, custom_receipt_template } = useSettingsStore();

  const { data, isLoading } = useQuery<[Sale, SaleItem[]]>({
    queryKey: ['sale-details', saleId],
    queryFn: () => cmd('get_sale_with_items', { id: saleId })
  });

  const [returnQtys, setReturnQtys] = useState<Record<number, number>>({});
  const [damagedMap, setDamagedMap] = useState<Record<number, boolean>>({});
  const [reason, setReason] = useState('');
  
  // Exchange state
  const [exchangeItems, setExchangeItems] = useState<any[]>([]);
  const [netPaymentMethod, setNetPaymentMethod] = useState<'cash' | 'card' | 'udhaar' | 'adjustment'>('cash');
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  // Success state to show receipt
  const [exchangeReceipt, setExchangeReceipt] = useState<{ returnId: number, saleId: number | null } | null>(null);

  useBarcode(async (barcode) => {
    if (exchangeReceipt) return; // Don't scan if showing receipt
    try {
      const product = await cmd<any>('get_product_by_barcode', { barcode });
      if (product) {
        const variants = await cmd<any[]>('get_product_variants', { productId: product.id });
        let variant = variants.find(v => v.variant_barcode === barcode);
        if (!variant && variants.length > 0) variant = variants[0];
        
        const nameStr = variant && (variant.size || variant.color) 
          ? `${product.name} (${[variant.size, variant.color].filter(Boolean).join(' / ')})`
          : product.name;

        setExchangeItems(prev => {
          const existing = prev.find(i => i.barcode === (variant?.variant_barcode || product.barcode));
          if (existing) {
            return prev.map(i => i.barcode === existing.barcode ? { ...i, quantity: i.quantity + 1, total_price: (i.quantity + 1) * i.unit_price } : i);
          }
          return [...prev, {
            product_id: product.id,
            variant_id: variant?.id,
            product_name: nameStr,
            barcode: variant?.variant_barcode || product.barcode,
            quantity: 1,
            unit_price: variant?.variant_price ?? product.sale_price,
            discount: 0,
            total_price: variant?.variant_price ?? product.sale_price,
          }];
        });
        toast(`Added exchange item: ${nameStr}`, 'success');
      } else {
        toast(`Barcode not found: ${barcode}`, 'error');
      }
    } catch (e) {
      toast('Barcode lookup failed', 'error');
    }
  });

  if (isLoading || !data) return null;
  const [sale, items] = data;

  const handleQtyChange = (itemId: number, qty: number, max: number) => {
    const val = Math.max(0, Math.min(qty, max));
    setReturnQtys(prev => ({ ...prev, [itemId]: val }));
  };

  const removeExchangeItem = (index: number) => {
    setExchangeItems(prev => prev.filter((_, i) => i !== index));
  };

  const sumGross = items.reduce((sum, item) => sum + (item.unit_price * item.quantity), 0);
  const sumNet = items.reduce((sum, item) => sum + item.total_price, 0);
  const totalItemDiscount = sumGross - sumNet;
  const billDiscount = Math.max(0, sale.discount_amount - totalItemDiscount);
  const discountRatio = sumNet > 0 ? (billDiscount / sumNet) : 0;

  const totalRefund = items.reduce((sum, item) => {
    const qty = returnQtys[item.id] || 0;
    const netItemUnitPrice = item.quantity > 0 ? (item.total_price / item.quantity) : item.unit_price;
    const refundedUnitPrice = netItemUnitPrice * (1 - discountRatio);
    return sum + (qty * refundedUnitPrice);
  }, 0);

  const totalExchange = exchangeItems.reduce((sum, item) => sum + item.total_price, 0);
  const netAmount = totalExchange - totalRefund; // positive = customer owes us, negative = we owe customer

  const handleSubmit = async () => {
    const payloads = items
      .filter(i => (returnQtys[i.id] || 0) > 0)
      .map(i => ({
        sale_item_id: i.id,
        quantity: returnQtys[i.id],
        is_damaged: !!damagedMap[i.id],
      }));

    if (payloads.length === 0 && exchangeItems.length === 0) {
      toast("Select items to return or exchange", "error");
      return;
    }

    try {
      setIsSubmitting(true);
      let returnIdRes = null;
      
      // Process Return if any items selected
      if (payloads.length > 0) {
        const refundMethodStr = netAmount > 0 ? netPaymentMethod : (netPaymentMethod === 'adjustment' ? 'adjustment' : 'cash');
        const [retId] = await cmd<[number, string]>('process_sales_return', {
          payload: {
            sale_id: saleId,
            items: payloads,
            refund_method: refundMethodStr,
            reason: reason || null,
            created_by: user?.id || null,
          }
        });
        returnIdRes = retId;
      }

      let newSaleIdRes = null;
      // Process Exchange Sale if any items added
      if (exchangeItems.length > 0) {
        const [sId] = await cmd<[number, string]>('create_sale', {
          payload: {
            customer_id: sale.customer_id,
            items: exchangeItems,
            subtotal: totalExchange,
            discount_amount: 0,
            discount_percent: 0,
            tax_amount: 0,
            total_amount: totalExchange,
            paid_amount: netAmount > 0 ? (netPaymentMethod === 'udhaar' ? 0 : totalExchange) : totalExchange,
            change_amount: netAmount < 0 ? Math.abs(netAmount) : 0,
            payment_method: netAmount > 0 ? netPaymentMethod : 'cash',
            status: netAmount > 0 && netPaymentMethod === 'udhaar' ? 'udhaar' : 'paid',
            notes: `Exchange for sale #${sale.invoice_number}`,
            created_by: user?.id || null,
          }
        });
        newSaleIdRes = sId;
      }

      toast("Exchange processed successfully", "success");
      queryClient.invalidateQueries({ queryKey: ['sales-history'] });
      queryClient.invalidateQueries({ queryKey: ['sales'] });
      queryClient.invalidateQueries({ queryKey: ['sales-report'] });
      queryClient.invalidateQueries({ queryKey: ['pl'] });
      queryClient.invalidateQueries({ queryKey: ['pl-statement'] });
      queryClient.invalidateQueries({ queryKey: ['products'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      queryClient.invalidateQueries({ queryKey: ['financial-ledger'] });
      queryClient.invalidateQueries({ queryKey: ['customers'] });
      queryClient.invalidateQueries({ queryKey: ['total-udhaar'] });
      
      if (returnIdRes || newSaleIdRes) {
        setExchangeReceipt({ returnId: returnIdRes as any, saleId: newSaleIdRes });
      } else {
        onClose();
      }
      
    } catch (e: any) {
      toast(e.toString(), "error");
      setIsSubmitting(false);
    }
  };

  if (exchangeReceipt) {
    return (
      <ExchangeReceiptModal 
        returnId={exchangeReceipt.returnId}
        saleId={exchangeReceipt.saleId}
        onClose={onClose}
        currencySymbol={currencySymbol}
        printerConfig={{ printer_type, printer_port, printer_baud }}
        shopInfo={{ shop_name, shop_address, shop_phone, shop_logo, shop_email, receipt_header, receipt_footer, logo_width, logo_height, logo_align, receipt_font }}
        custom_receipt_template={custom_receipt_template}
      />
    );
  }

  return (
    <>
      <div className="overlay" onClick={onClose} />
      <div className="dialog w-[900px] flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold text-slate-800">Return & Exchange: {sale.invoice_number}</h2>
          <button onClick={onClose} className="btn-icon"><X className="w-5 h-5" /></button>
        </div>

        <div className="flex gap-4 flex-1 min-h-0">
          {/* Left: Return Items */}
          <div className="flex-1 flex flex-col border border-slate-200 rounded-lg overflow-hidden">
            <div className="bg-slate-50 p-3 font-semibold border-b border-slate-200 text-slate-700">Items to Return</div>
            <div className="flex-1 overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 sticky top-0">
                  <tr className="border-b border-slate-200 text-slate-600">
                    <th className="p-2 font-semibold text-left">Item Name</th>
                    <th className="p-2 font-semibold text-center w-24">Return Qty</th>
                    <th className="p-2 font-semibold text-center w-16">Damaged?</th>
                    <th className="p-2 font-semibold text-right">Refund</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map(item => {
                    const netItemUnitPrice = item.quantity > 0 ? (item.total_price / item.quantity) : item.unit_price;
                    const refundedUnitPrice = netItemUnitPrice * (1 - discountRatio);
                    return (
                      <tr key={item.id} className="border-b border-slate-50 hover:bg-slate-50/50">
                        <td className="p-2">
                          <div className="font-medium text-slate-800 truncate" title={item.product_name}>{item.product_name}</div>
                          <div className="text-xs text-slate-500">
                            {formatCurrency(refundedUnitPrice, currencySymbol)}
                            {Math.abs(refundedUnitPrice - item.unit_price) > 0.01 && (
                              <span className="text-slate-400 line-through ml-1.5">
                                ({formatCurrency(item.unit_price, currencySymbol)})
                              </span>
                            )}
                            <span> (Sold: {item.quantity}{(item.returned_quantity || 0) > 0 ? `, Returned: ${item.returned_quantity}` : ''})</span>
                          </div>
                          {item.discount > 0 && (
                            <div className="text-xs text-brand-600 mt-0.5 font-medium">
                              Discount given: {formatCurrency(item.discount, currencySymbol)}
                            </div>
                          )}
                        </td>
                        <td className="p-2">
                          <input type="number" className="input px-1 py-1 text-center w-full font-bold text-brand-700 bg-brand-50/30" value={returnQtys[item.id] ?? ''} onChange={(e) => handleQtyChange(item.id, parseInt(e.target.value) || 0, Math.max(0, item.quantity - (item.returned_quantity || 0)))} placeholder="0" min={0} max={Math.max(0, item.quantity - (item.returned_quantity || 0))} disabled={item.quantity - (item.returned_quantity || 0) <= 0} />
                        </td>
                        <td className="p-2 text-center">
                          <input type="checkbox" className="w-4 h-4 rounded text-rose-600" checked={!!damagedMap[item.id]} onChange={(e) => setDamagedMap(prev => ({ ...prev, [item.id]: e.target.checked }))} />
                        </td>
                        <td className="p-2 text-right font-bold text-slate-700">
                          {formatCurrency((returnQtys[item.id] || 0) * refundedUnitPrice, currencySymbol)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Right: Exchange Items */}
          <div className="flex-1 flex flex-col border border-slate-200 rounded-lg overflow-hidden">
            <div className="bg-brand-50 p-3 font-semibold border-b border-brand-100 text-brand-700 flex justify-between items-center">
              <span>New Items (Exchange)</span>
              <span className="text-xs font-normal opacity-70 flex items-center gap-1"><BarcodeIcon className="w-3 h-3" /> Scan barcode to add</span>
            </div>
            <div className="flex-1 overflow-y-auto bg-white">
               {exchangeItems.length === 0 ? (
                 <div className="flex flex-col items-center justify-center h-full text-slate-400 p-6 text-center">
                   <p className="text-sm">No new items added.</p>
                   <p className="text-xs mt-1">Scan a barcode to add items for exchange.</p>
                 </div>
               ) : (
                 <div className="divide-y divide-slate-50">
                   {exchangeItems.map((item, idx) => (
                     <div key={idx} className="p-2 flex items-center justify-between hover:bg-slate-50">
                       <div className="flex-1 min-w-0 pr-2">
                         <div className="font-medium text-sm text-slate-800 truncate">{item.product_name}</div>
                         <div className="text-xs text-slate-500">{formatCurrency(item.unit_price, currencySymbol)}</div>
                       </div>
                       <div className="flex items-center gap-3">
                         <input type="number" className="input-sm w-16 text-center" value={item.quantity} onChange={(e) => {
                           const q = parseInt(e.target.value) || 1;
                           setExchangeItems(prev => prev.map((vi, i) => i === idx ? { ...vi, quantity: q, total_price: q * vi.unit_price } : vi));
                         }} />
                         <div className="font-bold text-sm w-16 text-right">{formatCurrency(item.total_price, currencySymbol)}</div>
                         <button onClick={() => removeExchangeItem(idx)} className="text-slate-400 hover:text-red-500"><X className="w-4 h-4"/></button>
                       </div>
                     </div>
                   ))}
                 </div>
               )}
            </div>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-3 gap-4 p-4 bg-slate-50 rounded-xl border border-slate-200">
          <div>
            <div className="text-sm text-slate-500 mb-1">Total Refund</div>
            <div className="text-xl font-bold text-rose-600">{formatCurrency(totalRefund, currencySymbol)}</div>
          </div>
          <div>
            <div className="text-sm text-slate-500 mb-1">Total New Sale</div>
            <div className="text-xl font-bold text-brand-600">{formatCurrency(totalExchange, currencySymbol)}</div>
          </div>
          <div className="border-l border-slate-200 pl-4">
            <div className="text-sm text-slate-500 mb-1">{netAmount > 0 ? "Customer Owes" : "Refund to Customer"}</div>
            <div className={`text-2xl font-black ${netAmount > 0 ? 'text-brand-600' : 'text-emerald-600'}`}>
              {formatCurrency(Math.abs(netAmount), currencySymbol)}
            </div>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-4">
          <div>
            <label className="text-xs font-bold text-slate-500 uppercase mb-1 block">Payment / Refund Method</label>
            <select className="input w-full" value={netPaymentMethod} onChange={(e) => setNetPaymentMethod(e.target.value as any)}>
              <option value="cash">Cash</option>
              <option value="card">Card</option>
              {sale.customer_id && <option value="adjustment">Udhaar / Adjustment</option>}
            </select>
          </div>
          <div>
            <label className="text-xs font-bold text-slate-500 uppercase mb-1 block">Return Reason (Optional)</label>
            <input type="text" className="input w-full" placeholder="e.g., Size issue..." value={reason} onChange={(e) => setReason(e.target.value)} />
          </div>
        </div>

        <div className="flex gap-3 mt-6">
          <button onClick={onClose} className="btn-secondary flex-1" disabled={isSubmitting}>Cancel</button>
          <button
            onClick={handleSubmit}
            className="btn-primary flex-1 bg-brand-600 hover:bg-brand-700"
            disabled={isSubmitting || (totalRefund === 0 && totalExchange === 0)}
          >
            {isSubmitting ? "Processing..." : `Confirm Return & Exchange`}
          </button>
        </div>
      </div>
    </>
  );
}

function ExchangeReceiptModal({ returnId, saleId, onClose, currencySymbol, printerConfig, shopInfo, custom_receipt_template }: any) {
  const { toast } = useToast();
  
  const returnQuery = useQuery<any>({
    queryKey: ['return-details', returnId],
    queryFn: () => returnId ? cmd('get_return_with_items', { id: returnId }) : Promise.resolve(null),
    enabled: !!returnId
  });

  const saleQuery = useQuery<any>({
    queryKey: ['sale-details', saleId],
    queryFn: () => saleId ? cmd('get_sale_with_items', { id: saleId }) : Promise.resolve(null),
    enabled: !!saleId
  });

  const isLoading = (returnId && returnQuery.isLoading) || (saleId && saleQuery.isLoading);

  if (isLoading) {
    return <div className="overlay"><div className="dialog text-center p-8">Loading receipt...</div></div>;
  }

  const [ret, retItems] = returnQuery.data || [null, []];
  const [sale, saleItems] = saleQuery.data || [null, []];

  const totalRefund = ret?.total_refund || 0;
  const totalSale = sale?.total_amount || 0;
  const netAmount = totalSale - totalRefund;

  const handlePrint = async () => {
    if (printerConfig.printer_type && printerConfig.printer_type !== 'none') {
      try {
        const receiptItems = [
          ...(retItems || []).map((i: any) => ({
            name: `(RET) ${i.product_name}`,
            qty: i.quantity,
            unit_price: i.unit_price,
            total: -(i.total_refund)
          })),
          ...(saleItems || []).map((i: any) => ({
            name: i.product_name,
            qty: i.quantity,
            unit_price: i.unit_price,
            total: i.total_price
          }))
        ];

        const receiptData = {
          shop_name: shopInfo.shop_name || 'My Shop',
          shop_address: shopInfo.shop_address || '',
          shop_phone: shopInfo.shop_phone || '',
          shop_email: shopInfo.shop_email || '',
          header: "EXCHANGE RECEIPT",
          invoice_number: sale?.invoice_number || ret?.return_number || 'EXCHANGE',
          sale_date: new Date().toISOString(),
          customer_name: null,
          cashier: "Cashier",
          items: receiptItems,
          subtotal: netAmount,
          discount: 0,
          tax: 0,
          total: netAmount,
          paid: Math.max(0, netAmount),
          change: Math.max(0, -netAmount),
          payment_method: sale?.payment_method || ret?.refund_method || 'CASH',
          footer: shopInfo.receipt_footer || 'Thank You!'
        };

        await cmd('print_receipt', {
          data: receiptData,
          config: {
            printer_type: printerConfig.printer_type,
            port: printerConfig.printer_port,
            baud_rate: printerConfig.printer_baud,
          },
          template_json: custom_receipt_template || null
        });
        toast("Thermal receipt sent to printer", "success");
        onClose();
      } catch (e: any) {
        toast("Thermal Print Failed: " + e.toString(), "error");
        window.print();
        onClose();
      }
    } else {
      window.print();
      onClose();
    }
  };

  return (
    <>
      <div className="overlay no-print" onClick={onClose} />
      <div className="dialog w-[400px] print-receipt font-mono text-sm">
        <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-100 no-print">
          <div>
            <h2 className="text-lg font-bold text-slate-800">Exchange Receipt</h2>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-red-500 no-print"><X className="w-5 h-5" /></button>
        </div>

        <div style={{ fontFamily: shopInfo.receipt_font || "'Courier New', Courier, monospace", fontSize: '12px', lineHeight: '1.6', color: '#000', letterSpacing: '0.02em' }}>
          
          <div style={{ textAlign: 'center', marginBottom: '12px', paddingBottom: '8px', borderBottom: '2px dashed #333' }}>
            {shopInfo.shop_logo && (
              <img src={shopInfo.shop_logo} alt="Logo" style={{ width: `${shopInfo.logo_width || 120}px`, height: `${shopInfo.logo_height || 120}px`, margin: shopInfo.logo_align === 'center' ? '0 auto 6px' : shopInfo.logo_align === 'right' ? '0 0 6px auto' : '0 auto 6px 0', display: 'block', objectFit: 'contain' }} />
            )}
            <div style={{ fontSize: '18px', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: '0.1em' }}>{shopInfo.shop_name || 'My Shop'}</div>
            {shopInfo.shop_address && <div style={{ fontSize: '11px', marginTop: '2px' }}>{shopInfo.shop_address}</div>}
            {shopInfo.shop_phone && <div style={{ fontSize: '11px' }}>{shopInfo.shop_phone}</div>}
          </div>

          <div style={{ textAlign: 'center', fontSize: '13px', fontWeight: 'bold', marginBottom: '8px', padding: '4px 0' }}>
            EXCHANGE RECEIPT
          </div>

          <div style={{ marginBottom: '8px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Date:</span><span>{format(new Date(), 'dd MMM yyyy, hh:mm a')}</span></div>
            {ret && <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Return Ref:</span><span>{ret.return_number}</span></div>}
            {sale && <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Sale Ref:</span><span>{sale.invoice_number}</span></div>}
          </div>

          {/* Returned Items */}
          {retItems.length > 0 && (
            <>
              <div style={{ borderTop: '1px dashed #333', borderBottom: '1px dashed #333', padding: '4px 0', marginBottom: '4px', marginTop: '8px' }}>
                <div style={{ fontWeight: 'bold' }}>RETURNED ITEMS</div>
              </div>
              <div style={{ marginBottom: '8px' }}>
                {retItems.map((i: any, index: number) => (
                  <div key={i.id} style={{ borderBottom: '1px dotted #ccc', paddingBottom: '4px', marginBottom: '4px' }}>
                    <div style={{ display: 'flex' }}>
                      <span style={{ flex: '1 1 40%', wordBreak: 'break-word', color: '#c00' }}>- {i.product_name}</span>
                      <span style={{ width: '35px', textAlign: 'center' }}>{i.quantity}</span>
                      <span style={{ width: '70px', textAlign: 'right' }}>{formatCurrency(i.unit_price, currencySymbol)}</span>
                      <span style={{ width: '75px', textAlign: 'right', fontWeight: 'bold' }}>-{formatCurrency(i.total_refund, currencySymbol)}</span>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}

          {/* New Sale Items */}
          {saleItems.length > 0 && (
            <>
              <div style={{ borderTop: '1px dashed #333', borderBottom: '1px dashed #333', padding: '4px 0', marginBottom: '4px', marginTop: '8px' }}>
                <div style={{ fontWeight: 'bold' }}>NEW ITEMS</div>
              </div>
              <div style={{ marginBottom: '8px' }}>
                {saleItems.map((i: any, index: number) => (
                  <div key={i.id} style={{ borderBottom: '1px dotted #ccc', paddingBottom: '4px', marginBottom: '4px' }}>
                    <div style={{ display: 'flex' }}>
                      <span style={{ flex: '1 1 40%', wordBreak: 'break-word' }}>{index + 1}. {i.product_name}</span>
                      <span style={{ width: '35px', textAlign: 'center' }}>{i.quantity}</span>
                      <span style={{ width: '70px', textAlign: 'right' }}>{formatCurrency(i.unit_price, currencySymbol)}</span>
                      <span style={{ width: '75px', textAlign: 'right', fontWeight: 'bold' }}>{formatCurrency(i.total_price, currencySymbol)}</span>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}

          <div style={{ borderTop: '1px dashed #333', paddingTop: '6px', marginBottom: '4px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>TOTAL REFUND:</span><span style={{ color: '#c00' }}>-{formatCurrency(totalRefund, currencySymbol)}</span></div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>NEW SALE TOTAL:</span><span>{formatCurrency(totalSale, currencySymbol)}</span></div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 'bold', fontSize: '14px', borderTop: '2px solid #000', borderBottom: '2px solid #000', padding: '4px 0', margin: '4px 0' }}>
            <span>NET {netAmount > 0 ? "DUE" : "REFUND"}:</span><span>{formatCurrency(Math.abs(netAmount), currencySymbol)}</span>
          </div>

          <div style={{ borderTop: '3px double #333', marginBottom: '8px' }}></div>
          <div style={{ textAlign: 'center', fontSize: '11px', marginBottom: '10px' }}>
            {(shopInfo.receipt_footer || 'Thank You!').split('\n').map((line: string, idx: number) => (
              <div key={idx}>{line}</div>
            ))}
          </div>

          {sale && (
            <div style={{ textAlign: 'center', margin: '8px 0' }}>
              <Barcode value={sale.invoice_number} width={1.2} height={40} displayValue={true} fontSize={11} margin={0} font="'Courier New', monospace" />
            </div>
          )}
        </div>

        <div className="mt-6 flex flex-col gap-3 no-print">
          {printerConfig.printer_type && printerConfig.printer_type !== 'none' && (
            <button onClick={handlePrint} className="btn-primary py-2 rounded-lg flex items-center justify-center gap-2">
              <Printer className="w-4 h-4" /> Print Receipt (Thermal Printer)
            </button>
          )}
          <button onClick={() => window.print()} className={`${printerConfig.printer_type && printerConfig.printer_type !== 'none' ? 'btn-secondary' : 'btn-primary'} py-2 rounded-lg flex items-center justify-center gap-2`}>
            <Eye className="w-4 h-4" /> Print Preview (Browser)
          </button>
        </div>
      </div>
    </>
  );
}
