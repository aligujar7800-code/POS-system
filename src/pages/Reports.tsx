import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { cmd, formatCurrency } from '../lib/utils';
import { useSettingsStore } from '../stores/settingsStore';
import {
  BarChart, Bar, PieChart, Pie, Cell, Tooltip, Legend,
  XAxis, YAxis, ResponsiveContainer, CartesianGrid
} from 'recharts';
import { BarChart3, TrendingUp, Package, Download } from 'lucide-react';
import { save } from '@tauri-apps/plugin-dialog';
import { writeTextFile } from '@tauri-apps/plugin-fs';
import { useToast } from '../components/ui/Toaster';

const COLORS = ['#6174f4', '#22c55e', '#f59e0b', '#ef4444', '#8b5cf6'];

type Tab = 'sales' | 'pl' | 'inventory' | 'trial_balance' | 'pl_statement';
type GroupBy = 'daily' | 'weekly' | 'monthly';

function getDefaultDates() {
  const pad = (n: number) => n.toString().padStart(2, '0');
  const getLocalStr = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  
  const to = new Date();
  const from = new Date();
  from.setDate(1); // start of month
  
  return {
    from: getLocalStr(from),
    to: getLocalStr(to),
  };
}

export default function ReportsPage() {
  const { t } = useTranslation();
  const { currency_symbol } = useSettingsStore();
  const { toast } = useToast();
  const fmt = (n: number) => formatCurrency(n, currency_symbol);

  const [tab, setTab] = useState<Tab>('sales');
  const [groupBy, setGroupBy] = useState<GroupBy>('daily');
  const defaults = getDefaultDates();
  const [from, setFrom] = useState(defaults.from);
  const [to, setTo] = useState(defaults.to);

  // Sales report data
  const { data: salesData = [] } = useQuery({
    queryKey: ['sales-report', from, to, groupBy],
    queryFn: () => cmd<any[]>('sales_report', { from, to, groupBy }),
    enabled: tab === 'sales',
  });

  const { data: topProducts = [] } = useQuery({
    queryKey: ['top-products', from, to],
    queryFn: () => cmd<any[]>('top_products', { from, to, limit: 10 }),
    enabled: tab === 'sales',
  });

  const { data: pl } = useQuery({
    queryKey: ['pl', from, to],
    queryFn: () => cmd<any>('profit_loss', { from, to }),
    enabled: tab === 'pl',
  });

  const { data: invVal } = useQuery({
    queryKey: ['inv-val'],
    queryFn: () => cmd<any>('inventory_valuation'),
    enabled: tab === 'inventory',
  });

  const { data: deadStock = [] } = useQuery({
    queryKey: ['dead-stock', 30],
    queryFn: () => cmd<any[]>('dead_stock', { days: 30 }),
    enabled: tab === 'inventory',
  });

  // Trial Balance
  const { data: trialBalance } = useQuery<any>({
    queryKey: ['trial-balance', from, to],
    queryFn: () => cmd('get_trial_balance_report', { fromDate: from, toDate: to }),
    enabled: tab === 'trial_balance',
  });

  // P&L Statement (accounting-based)
  const { data: plStatement } = useQuery<any>({
    queryKey: ['pl-statement', from, to],
    queryFn: () => cmd('get_profit_loss_report', { fromDate: from, toDate: to }),
    enabled: tab === 'pl_statement',
  });

  const paymentPieData = salesData.length > 0 ? [
    { name: 'Cash', value: salesData.reduce((s, d) => s + (d.cash ?? 0), 0) },
    { name: 'Card', value: salesData.reduce((s, d) => s + (d.card ?? 0), 0) },
    { name: 'Udhaar', value: salesData.reduce((s, d) => s + (d.udhaar ?? 0), 0) },
  ].filter(d => d.value > 0) : [];

  const totalRevenue = salesData.reduce((s, d) => s + (d.revenue ?? 0), 0);
  const totalDiscount = salesData.reduce((s, d) => s + (d.discounts ?? 0), 0);
  const totalCount = salesData.reduce((s, d) => s + (d.count ?? 0), 0);

  const exportCSV = async () => {
    let dataToExport: any[] = [];
    let filename = '';

    if (tab === 'sales') {
      dataToExport = salesData;
      filename = `sales_report_${from}_${to}.csv`;
    } else if (tab === 'pl' && pl) {
      dataToExport = [{
        Period: `${from} to ${to}`,
        'Gross Revenue': pl.gross_revenue,
        Discounts: pl.discounts,
        'Net Revenue': pl.net_revenue,
        COGS: pl.cogs,
        'Gross Profit': pl.gross_profit,
        Expenses: pl.expenses,
        'Net Profit': pl.net_profit
      }];
      filename = `profit_loss_${from}_${to}.csv`;
    } else if (tab === 'inventory') {
      dataToExport = deadStock.map((s: any) => ({
        SKU: s.sku,
        Name: s.name,
        Price: s.sale_price,
        Stock: s.stock,
        'Last Sold': s.last_sold || 'Never'
      }));
      filename = `dead_stock_report.csv`;
    }

    if (!dataToExport.length) return;

    const headers = Object.keys(dataToExport[0]);
    const csvContent = [
      headers.join(','),
      ...dataToExport.map(row => 
        headers.map(h => {
          let val = row[h] ?? '';
          if (typeof val === 'string') val = val.replace(/"/g, '""');
          return `"${val}"`;
        }).join(',')
      )
    ].join('\n');

    try {
      const destPath = await save({
        filters: [{ name: 'CSV File', extensions: ['csv'] }],
        defaultPath: filename
      });
      
      if (!destPath) return;

      await writeTextFile(destPath, csvContent);
      toast('CSV Exported successfully!', 'success');
    } catch (err: any) {
      toast('Export failed: ' + err.toString(), 'error');
    }
  };

  return (
    <div className="page">
      <div className="page-header flex justify-between items-center">
        <h1 className="page-title flex items-center gap-2">
          <BarChart3 className="w-5 h-5 text-brand-600" />
          {t('reports.title')}
        </h1>
        <button className="btn-secondary" onClick={exportCSV}>
          <Download className="w-4 h-4" /> Export CSV
        </button>
      </div>

      {/* Tabs */}
      <div className="flex rounded-xl bg-slate-100 p-1 mb-6 w-fit flex-wrap">
        {([['sales', t('reports.salesReport')], ['pl', t('reports.profitLoss')], ['inventory', t('reports.inventoryReport')], ['trial_balance', 'Trial Balance'], ['pl_statement', 'P&L Statement']] as [Tab, string][]).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              tab === key ? 'bg-white text-brand-600 shadow-sm' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Date range + groupBy */}
      {(tab === 'sales' || tab === 'pl' || tab === 'trial_balance' || tab === 'pl_statement') && (
        <div className="flex items-center gap-3 mb-5 flex-wrap">
          <div className="flex items-center gap-2">
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="input-sm" />
            <span className="text-slate-400">—</span>
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="input-sm" />
          </div>
          {tab === 'sales' && (
            <div className="flex rounded-lg overflow-hidden border border-slate-200 text-xs">
              {(['daily', 'weekly', 'monthly'] as GroupBy[]).map((g) => (
                <button
                  key={g}
                  onClick={() => setGroupBy(g)}
                  className={`px-3 py-2 font-medium capitalize ${
                    groupBy === g ? 'bg-brand-600 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  {t(`reports.${g}`)}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Sales Tab ── */}
      {tab === 'sales' && (
        <div className="space-y-6">
          {/* Summary stats */}
          <div className="grid grid-cols-3 gap-4">
            <div className="stat-card">
              <p className="stat-label">Total Revenue</p>
              <p className="stat-value text-brand-600">{fmt(totalRevenue)}</p>
              <p className="text-xs text-slate-400 mt-1">{totalCount} transactions</p>
            </div>
            <div className="stat-card">
              <p className="stat-label">Total Discounts</p>
              <p className="stat-value text-amber-600">{fmt(totalDiscount)}</p>
            </div>
            <div className="stat-card">
              <p className="stat-label">Net Revenue</p>
              <p className="stat-value text-green-600">{fmt(totalRevenue - totalDiscount)}</p>
            </div>
          </div>

          {/* Revenue chart */}
          <div className="card p-5">
            <h3 className="font-semibold text-slate-700 mb-4">Revenue Over Time</h3>
            {salesData.length === 0 ? (
              <p className="text-center text-slate-400 py-8">No data for selected range</p>
            ) : (
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={salesData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip formatter={(v: any) => fmt(v)} />
                  <Bar dataKey="revenue" name="Revenue" fill="#6174f4" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="discounts" name="Discounts" fill="#f59e0b" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>

          <div className="grid grid-cols-2 gap-6">
            {/* Payment pie */}
            {paymentPieData.length > 0 && (
              <div className="card p-5">
                <h3 className="font-semibold text-slate-700 mb-4">Payment Methods</h3>
                <ResponsiveContainer width="100%" height={200}>
                  <PieChart>
                    <Pie data={paymentPieData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80}>
                      {paymentPieData.map((_, i) => (
                        <Cell key={i} fill={COLORS[i % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(v: any) => fmt(v)} />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            )}

            {/* Top products */}
            <div className="card p-5">
              <h3 className="font-semibold text-slate-700 mb-4">Top Products</h3>
              {topProducts.length === 0 ? (
                <p className="text-center text-slate-400 py-8">No data</p>
              ) : (
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={topProducts.slice(0, 6)} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis type="number" tick={{ fontSize: 10 }} />
                    <YAxis dataKey="product_name" type="category" tick={{ fontSize: 10 }} width={80} />
                    <Tooltip />
                    <Bar dataKey="qty_sold" name="Qty Sold" fill="#22c55e" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── P&L Tab ── */}
      {tab === 'pl' && pl && (
        <div className="grid grid-cols-2 gap-6">
          <div className="card p-5 space-y-3">
            <h3 className="font-semibold text-slate-700 mb-2">Profit & Loss Summary</h3>
            {[
              { label: t('reports.revenue'), value: pl.revenue, color: 'text-brand-600' },
              { label: t('reports.cogs'), value: -pl.cogs, color: 'text-red-500' },
              { label: t('reports.grossProfit'), value: pl.gross_profit, color: 'text-green-600', bold: true },
              { label: t('reports.expenses'), value: -pl.expenses, color: 'text-red-500' },
              { label: t('reports.netProfit'), value: pl.net_profit, color: pl.net_profit >= 0 ? 'text-green-700' : 'text-red-700', bold: true },
            ].map((row) => (
              <div key={row.label} className={`flex justify-between items-center py-2 ${row.bold ? 'border-t border-slate-200 font-bold text-base' : 'text-sm'}`}>
                <span className="text-slate-600">{row.label}</span>
                <span className={row.color}>{fmt(row.value)}</span>
              </div>
            ))}
          </div>
          <div className="card p-5">
            <h3 className="font-semibold text-slate-700 mb-4">Visual Breakdown</h3>
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={[{
                name: 'Summary',
                Revenue: pl.revenue,
                COGS: pl.cogs,
                Expenses: pl.expenses,
                'Net Profit': Math.max(0, pl.net_profit),
              }]}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" />
                <YAxis />
                <Tooltip formatter={(v: any) => fmt(v)} />
                <Legend />
                <Bar dataKey="Revenue" fill="#6174f4" />
                <Bar dataKey="COGS" fill="#f59e0b" />
                <Bar dataKey="Expenses" fill="#ef4444" />
                <Bar dataKey="Net Profit" fill="#22c55e" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* ── Inventory Tab ── */}
      {tab === 'inventory' && (
        <div className="space-y-6">
          {invVal && (
            <div className="grid grid-cols-3 gap-4">
              <div className="stat-card">
                <p className="stat-label">Total Products</p>
                <p className="stat-value">{invVal.product_count}</p>
              </div>
              <div className="stat-card">
                <p className="stat-label">Cost Value</p>
                <p className="stat-value text-amber-600">{fmt(invVal.cost_value)}</p>
              </div>
              <div className="stat-card">
                <p className="stat-label">Sale Value</p>
                <p className="stat-value text-brand-600">{fmt(invVal.sale_value)}</p>
              </div>
            </div>
          )}
          <div className="card">
            <div className="px-5 py-4 border-b border-slate-100">
              <h3 className="font-semibold text-slate-700 flex items-center gap-2">
                <Package className="w-4 h-4 text-amber-500" />
                Dead Stock (No sales in 30 days)
              </h3>
            </div>
            <table className="table">
              <thead>
                <tr>
                  <th>Product</th>
                  <th>SKU</th>
                  <th className="text-right">Stock</th>
                  <th className="text-right">Sale Price</th>
                  <th>Last Sold</th>
                </tr>
              </thead>
              <tbody>
                {deadStock.map((d: any) => (
                  <tr key={d.id}>
                    <td className="font-medium text-slate-800">{d.name}</td>
                    <td className="font-mono text-xs text-slate-500">{d.sku}</td>
                    <td className="text-right">{d.stock}</td>
                    <td className="text-right">{fmt(d.sale_price)}</td>
                    <td className="text-slate-500 text-sm">{d.last_sold ?? 'Never'}</td>
                  </tr>
                ))}
                {deadStock.length === 0 && (
                  <tr><td colSpan={5} className="text-center py-8 text-slate-400">No dead stock</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Trial Balance Tab ── */}
      {tab === 'trial_balance' && trialBalance && (
        <div className="space-y-4">
          <div className="flex items-center gap-3 mb-2">
            {trialBalance.is_balanced ? (
              <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-green-100 text-green-700 text-sm font-bold">✓ Balanced</span>
            ) : (
              <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-red-100 text-red-700 text-sm font-bold">✗ Not Balanced</span>
            )}
          </div>
          <div className="card">
            <table className="table">
              <thead>
                <tr>
                  <th>Code</th>
                  <th>Account Name</th>
                  <th className="text-right">Debit</th>
                  <th className="text-right">Credit</th>
                </tr>
              </thead>
              <tbody>
                {trialBalance.accounts.map((a: any) => (
                  <tr key={a.account.id}>
                    <td className="font-mono text-xs text-slate-500">{a.account.code}</td>
                    <td className="font-medium text-slate-800">{a.account.name}</td>
                    <td className="text-right font-mono text-sm">{a.balance > 0 ? fmt(a.balance) : ''}</td>
                    <td className="text-right font-mono text-sm">{a.balance < 0 ? fmt(Math.abs(a.balance)) : ''}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-slate-300 bg-slate-50 font-bold">
                  <td colSpan={2} className="text-slate-700">TOTAL</td>
                  <td className="text-right font-mono text-blue-700">{fmt(trialBalance.total_debits)}</td>
                  <td className="text-right font-mono text-amber-700">{fmt(trialBalance.total_credits)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      {/* ── P&L Statement Tab ── */}
      {tab === 'pl_statement' && plStatement && (
        <div className="max-w-2xl">
          <div className="card p-6 space-y-1">
            <h2 className="text-lg font-bold text-slate-900 text-center mb-4 pb-3 border-b border-slate-200">Profit & Loss Statement</h2>
            
            <p className="text-xs font-bold text-slate-400 uppercase tracking-widest pt-2">REVENUE</p>
            <div className="flex justify-between py-1.5"><span className="text-sm text-slate-600">Sales Revenue (4001)</span><span className="text-sm font-mono">{fmt(plStatement.gross_revenue)}</span></div>
            <div className="flex justify-between py-1.5"><span className="text-sm text-slate-600">Less: Discount Given (4002)</span><span className="text-sm font-mono text-red-500">({fmt(plStatement.sales_discount)})</span></div>
            <div className="flex justify-between py-1.5"><span className="text-sm text-slate-600">Less: Sales Returns (4003)</span><span className="text-sm font-mono text-red-500">({fmt(plStatement.sales_returns)})</span></div>
            <div className="flex justify-between py-2 border-t border-slate-200 font-bold"><span className="text-slate-800">Net Revenue</span><span className="font-mono">{fmt(plStatement.net_revenue)}</span></div>
            
            <p className="text-xs font-bold text-slate-400 uppercase tracking-widest pt-4">COST OF GOODS SOLD</p>
            <div className="flex justify-between py-1.5"><span className="text-sm text-slate-600">Cost of Goods Sold (5001)</span><span className="text-sm font-mono text-red-500">({fmt(plStatement.cost_of_goods_sold)})</span></div>
            <div className="flex justify-between py-2 border-t border-slate-200 font-bold">
              <span className="text-slate-800">GROSS PROFIT</span>
              <span className={`font-mono ${plStatement.gross_profit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                {fmt(plStatement.gross_profit)} {plStatement.net_revenue > 0 ? `(${((plStatement.gross_profit / plStatement.net_revenue) * 100).toFixed(1)}%)` : ''}
              </span>
            </div>
            
            <p className="text-xs font-bold text-slate-400 uppercase tracking-widest pt-4">OPERATING EXPENSES</p>
            {plStatement.operating_expenses.map((exp: any) => (
              <div key={exp.account.id} className="flex justify-between py-1.5">
                <span className="text-sm text-slate-600">{exp.account.name} ({exp.account.code})</span>
                <span className="text-sm font-mono text-red-500">({fmt(exp.balance)})</span>
              </div>
            ))}
            <div className="flex justify-between py-2 border-t border-slate-200 font-bold">
              <span className="text-slate-800">Total Operating Expenses</span>
              <span className="font-mono text-red-600">({fmt(plStatement.total_operating_expenses)})</span>
            </div>
            
            <div className="flex justify-between py-3 mt-2 border-t-2 border-double border-slate-400 text-lg font-black">
              <span className="text-slate-900">NET PROFIT</span>
              <span className={plStatement.net_profit >= 0 ? 'text-green-700' : 'text-red-700'}>
                {fmt(plStatement.net_profit)} {plStatement.net_revenue > 0 ? `(${plStatement.net_profit_margin.toFixed(1)}%)` : ''}
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
