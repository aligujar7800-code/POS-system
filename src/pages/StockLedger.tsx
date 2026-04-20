import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { cmd, formatCurrency } from '../lib/utils';
import { useSettingsStore } from '../stores/settingsStore';
import { ClipboardList, Search, ArrowUpCircle, ArrowDownCircle, MinusCircle, Filter } from 'lucide-react';

interface Product { id: number; name: string; sku: string; total_stock: number; }
interface StockLedgerEntry {
  id: number;
  variant_info: string;
  prev_qty: number;
  new_qty: number;
  change: number;
  reason: string;
  changed_at: string;
}

export default function StockLedger() {
  const { currency_symbol } = useSettingsStore();
  const [selectedProductId, setSelectedProductId] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const { data: products = [] } = useQuery<Product[]>({
    queryKey: ['products'],
    queryFn: () => cmd('get_all_products'),
  });

  const { data: ledger = [], isLoading } = useQuery<StockLedgerEntry[]>({
    queryKey: ['stock-ledger', selectedProductId, dateFrom, dateTo],
    queryFn: () => cmd('get_stock_ledger', {
      productId: selectedProductId,
      dateFrom: dateFrom || null,
      dateTo: dateTo || null,
    }),
    enabled: !!selectedProductId,
  });

  const filteredProducts = products.filter(p =>
    p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    p.sku.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const selectedProduct = products.find(p => p.id === selectedProductId);

  const getMovementIcon = (change: number) => {
    if (change > 0) return <ArrowUpCircle className="w-4 h-4 text-emerald-500" />;
    if (change < 0) return <ArrowDownCircle className="w-4 h-4 text-red-500" />;
    return <MinusCircle className="w-4 h-4 text-slate-400" />;
  };

  const getReasonBadge = (reason: string) => {
    if (reason.startsWith('Inward')) return { bg: '#dcfce7', color: '#166534', label: 'Inward' };
    if (reason.startsWith('Sale')) return { bg: '#fee2e2', color: '#991b1b', label: 'Sale' };
    if (reason.startsWith('Adjust')) return { bg: '#fef3c7', color: '#92400e', label: 'Adjustment' };
    return { bg: '#e2e8f0', color: '#475569', label: reason.substring(0, 16) };
  };

  return (
    <div style={{ display: 'flex', height: '100%', background: '#f8fafc' }}>
      {/* Left Panel — Product Selector */}
      <div style={{ width: 320, borderRight: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', background: '#fff', flexShrink: 0 }}>
        <div style={{ padding: 20, borderBottom: '1px solid #e2e8f0' }}>
          <h2 style={{ fontSize: 18, fontWeight: 700, color: '#1e293b', display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
            <ClipboardList style={{ width: 20, height: 20, color: '#6366f1' }} />
            Stock Ledger
          </h2>
          <div style={{ position: 'relative' }}>
            <Search style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', width: 16, height: 16, color: '#94a3b8' }} />
            <input
              type="text"
              placeholder="Search product..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              style={{ width: '100%', padding: '10px 10px 10px 36px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 14, outline: 'none' }}
            />
          </div>
        </div>

        <div style={{ flex: 1, overflow: 'auto' }}>
          {filteredProducts.map(p => (
            <button
              key={p.id}
              onClick={() => setSelectedProductId(p.id)}
              style={{
                width: '100%', textAlign: 'left', padding: '14px 20px',
                borderBottom: '1px solid #f1f5f9', cursor: 'pointer',
                background: selectedProductId === p.id ? '#eef2ff' : '#fff',
                borderLeft: selectedProductId === p.id ? '3px solid #6366f1' : '3px solid transparent',
                transition: 'all 0.15s', border: 'none',
                borderBottomStyle: 'solid', borderBottomWidth: 1, borderBottomColor: '#f1f5f9',
                borderLeftStyle: 'solid', borderLeftWidth: 3,
                borderLeftColor: selectedProductId === p.id ? '#6366f1' : 'transparent',
              }}
            >
              <div style={{ fontWeight: 600, color: '#1e293b', fontSize: 14 }}>{p.name}</div>
              <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 4 }}>
                {p.sku} • Stock: <span style={{ fontWeight: 600, color: p.total_stock > 0 ? '#16a34a' : '#ef4444' }}>{p.total_stock}</span>
              </div>
            </button>
          ))}
          {filteredProducts.length === 0 && (
            <div style={{ padding: 40, textAlign: 'center', color: '#94a3b8', fontSize: 14 }}>No products found</div>
          )}
        </div>
      </div>

      {/* Right Panel — Ledger Table */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {/* Header & Filters */}
        <div style={{ padding: '16px 24px', borderBottom: '1px solid #e2e8f0', background: '#fff', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
          <div>
            <h3 style={{ fontSize: 16, fontWeight: 700, color: '#1e293b' }}>
              {selectedProduct ? selectedProduct.name : 'Select a product'}
            </h3>
            {selectedProduct && (
              <p style={{ fontSize: 13, color: '#64748b' }}>
                Full audit trail — every stock movement is logged here.
              </p>
            )}
          </div>
          {selectedProductId && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <Filter style={{ width: 14, height: 14, color: '#94a3b8' }} />
              <input
                type="date"
                value={dateFrom}
                onChange={e => setDateFrom(e.target.value)}
                style={{ padding: '6px 10px', border: '1px solid #e2e8f0', borderRadius: 6, fontSize: 13 }}
              />
              <span style={{ color: '#94a3b8' }}>to</span>
              <input
                type="date"
                value={dateTo}
                onChange={e => setDateTo(e.target.value)}
                style={{ padding: '6px 10px', border: '1px solid #e2e8f0', borderRadius: 6, fontSize: 13 }}
              />
            </div>
          )}
        </div>

        {/* Table */}
        <div style={{ flex: 1, overflow: 'auto' }}>
          {!selectedProductId ? (
            <div style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: '#94a3b8' }}>
              <ClipboardList style={{ width: 64, height: 64, color: '#e2e8f0', marginBottom: 16 }} />
              <p style={{ fontSize: 18, fontWeight: 500, color: '#64748b' }}>Select a product</p>
              <p style={{ fontSize: 14, marginTop: 8, maxWidth: 340, textAlign: 'center' }}>
                Choose a product from the left panel to view its complete stock movement history.
              </p>
            </div>
          ) : isLoading ? (
            <div style={{ padding: 40, textAlign: 'center', color: '#94a3b8' }}>Loading ledger...</div>
          ) : ledger.length === 0 ? (
            <div style={{ padding: 60, display: 'flex', flexDirection: 'column', alignItems: 'center', color: '#94a3b8' }}>
              <ClipboardList style={{ width: 48, height: 48, marginBottom: 16, color: '#cbd5e1' }} />
              <p style={{ fontSize: 16, fontWeight: 500 }}>No stock movements found</p>
              <p style={{ fontSize: 14, marginTop: 4 }}>This product has no recorded stock changes yet.</p>
            </div>
          ) : (
            <table style={{ width: '100%', fontSize: 14, borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: '#f1f5f9', borderBottom: '2px solid #e2e8f0', position: 'sticky', top: 0 }}>
                  <th style={{ padding: '12px 20px', textAlign: 'left', fontWeight: 600, color: '#475569' }}>Date & Time</th>
                  <th style={{ padding: '12px 20px', textAlign: 'left', fontWeight: 600, color: '#475569' }}>Variant</th>
                  <th style={{ padding: '12px 20px', textAlign: 'left', fontWeight: 600, color: '#475569' }}>Type</th>
                  <th style={{ padding: '12px 16px', textAlign: 'center', fontWeight: 600, color: '#475569' }}>Before</th>
                  <th style={{ padding: '12px 16px', textAlign: 'center', fontWeight: 600, color: '#475569' }}>Change</th>
                  <th style={{ padding: '12px 16px', textAlign: 'center', fontWeight: 600, color: '#475569' }}>After</th>
                  <th style={{ padding: '12px 20px', textAlign: 'left', fontWeight: 600, color: '#475569' }}>Reason / Note</th>
                </tr>
              </thead>
              <tbody>
                {ledger.map(entry => {
                  const badge = getReasonBadge(entry.reason);
                  return (
                    <tr key={entry.id} style={{ borderBottom: '1px solid #f1f5f9', background: '#fff' }}>
                      <td style={{ padding: '14px 20px', color: '#64748b', fontSize: 13 }}>
                        {new Date(entry.changed_at).toLocaleString('en-PK', { dateStyle: 'medium', timeStyle: 'short' })}
                      </td>
                      <td style={{ padding: '14px 20px' }}>
                        <span style={{ background: '#f1f5f9', padding: '3px 8px', borderRadius: 6, fontSize: 12, fontWeight: 500 }}>
                          {entry.variant_info}
                        </span>
                      </td>
                      <td style={{ padding: '14px 20px' }}>
                        <span style={{ background: badge.bg, color: badge.color, padding: '3px 10px', borderRadius: 20, fontSize: 12, fontWeight: 600 }}>
                          {badge.label}
                        </span>
                      </td>
                      <td style={{ padding: '14px 16px', textAlign: 'center', color: '#64748b', fontWeight: 500 }}>
                        {entry.prev_qty}
                      </td>
                      <td style={{ padding: '14px 16px', textAlign: 'center' }}>
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                          {getMovementIcon(entry.change)}
                          <span style={{
                            fontWeight: 700,
                            color: entry.change > 0 ? '#16a34a' : entry.change < 0 ? '#ef4444' : '#94a3b8'
                          }}>
                            {entry.change > 0 ? '+' : ''}{entry.change}
                          </span>
                        </div>
                      </td>
                      <td style={{ padding: '14px 16px', textAlign: 'center', fontWeight: 700, color: '#1e293b' }}>
                        {entry.new_qty}
                      </td>
                      <td style={{ padding: '14px 20px', color: '#64748b', fontSize: 13, maxWidth: 260 }}>
                        <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {entry.reason}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* Footer Summary */}
        {selectedProductId && ledger.length > 0 && (
          <div style={{ padding: '12px 24px', borderTop: '1px solid #e2e8f0', background: '#f8fafc', display: 'flex', justifyContent: 'space-between', fontSize: 13, color: '#64748b' }}>
            <span>Total movements: <strong>{ledger.length}</strong></span>
            <span>
              Net change: <strong style={{ color: ledger.reduce((s, e) => s + e.change, 0) >= 0 ? '#16a34a' : '#ef4444' }}>
                {ledger.reduce((s, e) => s + e.change, 0) > 0 ? '+' : ''}{ledger.reduce((s, e) => s + e.change, 0)}
              </strong>
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
