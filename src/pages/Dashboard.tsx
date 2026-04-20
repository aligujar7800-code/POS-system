import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { cmd, formatCurrency } from '../lib/utils';
import { useSettingsStore } from '../stores/settingsStore';
import {
  ShoppingCart, Users, TrendingUp, Package, AlertTriangle, ChevronRight, Layers
} from 'lucide-react';

interface DailySummary { count: number; revenue: number; discounts: number; collected: number; }
interface Customer { id: number; name: string; phone: string; outstanding_balance: number; }
interface Product { id: number; name: string; sku: string; total_stock: number; low_stock_threshold: number; }

export default function DashboardPage() {
  const { t } = useTranslation();
  const { currency_symbol } = useSettingsStore();
  const fmt = (n: number) => formatCurrency(n, currency_symbol);

  const { data: today } = useQuery<DailySummary>({
    queryKey: ['today-summary'],
    queryFn: () => cmd('get_todays_summary'),
    refetchInterval: 30_000,
  });

  const { data: totalUdhaar = 0 } = useQuery<number>({
    queryKey: ['total-udhaar'],
    queryFn: () => cmd('get_total_udhaar'),
  });

  const { data: collections = 0 } = useQuery<number>({
    queryKey: ['collections'],
    queryFn: () => cmd('get_todays_collections'),
    refetchInterval: 30_000,
  });

  const { data: defaulters = [] } = useQuery<Customer[]>({
    queryKey: ['top-defaulters'],
    queryFn: () => cmd('get_top_defaulters', { limit: 5 }),
  });

  const { data: lowStock = [] } = useQuery<Product[]>({
    queryKey: ['low-stock'],
    queryFn: () => cmd('get_low_stock_products'),
  });

  const { data: summary } = useQuery<any>({
    queryKey: ['financial-summary'],
    queryFn: () => cmd('get_financial_summary'),
  });

  const stats = [
    {
      label: "Today's Sales",
      value: fmt(today?.revenue ?? 0),
      sub: `${today?.count ?? 0} transactions`,
      icon: <ShoppingCart className="w-5 h-5 text-brand-600" />,
      bg: 'bg-brand-50',
    },
    {
      label: "Total Udhaar",
      value: fmt(totalUdhaar),
      sub: 'Outstanding balance',
      icon: <Users className="w-5 h-5 text-red-500" />,
      bg: 'bg-red-50',
    },
    {
      label: "Today's Collections",
      value: fmt(collections),
      sub: 'Payments received today',
      icon: <TrendingUp className="w-5 h-5 text-green-600" />,
      bg: 'bg-green-50',
    },
    {
      label: 'Low Stock Items',
      value: String(lowStock.length),
      sub: 'Need restocking',
      icon: <Package className="w-5 h-5 text-amber-600" />,
      bg: 'bg-amber-50',
    },
    {
      label: 'Inventory Value',
      value: fmt(summary?.stock_value ?? 0),
      sub: 'Total stock worth',
      icon: <Layers className="w-5 h-5 text-indigo-600" />,
      bg: 'bg-indigo-50',
    },
  ];

  return (
    <div className="page">
      <div className="page-header">
        <h1 className="page-title">{t('nav.dashboard')}</h1>
        <Link to="/sales" className="btn-primary">
          <ShoppingCart className="w-4 h-4" />
          New Sale
        </Link>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-2 xl:grid-cols-5 gap-4 mb-6">
        {stats.map((s) => (
          <div key={s.label} className="stat-card flex items-start gap-4">
            <div className={`w-10 h-10 rounded-xl ${s.bg} flex items-center justify-center flex-shrink-0`}>
              {s.icon}
            </div>
            <div className="min-w-0">
              <p className="stat-value truncate">{s.value}</p>
              <p className="stat-label">{s.label}</p>
              <p className="text-xs text-slate-400 mt-0.5">{s.sub}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Top Defaulters */}
        <div className="card">
          <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
            <h2 className="font-semibold text-slate-800">{t('ledger.topDefaulters')}</h2>
            <Link to="/ledger" className="text-xs text-brand-600 hover:underline flex items-center gap-1">
              View all <ChevronRight className="w-3 h-3" />
            </Link>
          </div>
          <div className="divide-y divide-slate-50">
            {defaulters.length === 0 ? (
              <p className="px-5 py-4 text-sm text-slate-400">No outstanding balances</p>
            ) : (
              defaulters.map((c) => (
                <Link
                  key={c.id}
                  to={`/ledger/${c.id}`}
                  className="flex items-center justify-between px-5 py-3 hover:bg-slate-50 transition-colors"
                >
                  <div>
                    <p className="text-sm font-medium text-slate-800">{c.name}</p>
                    <p className="text-xs text-slate-400">{c.phone}</p>
                  </div>
                  <span className="badge-red">{fmt(c.outstanding_balance)}</span>
                </Link>
              ))
            )}
          </div>
        </div>

        {/* Low Stock Alert */}
        <div className="card">
          <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
            <h2 className="font-semibold text-slate-800 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-500" />
              Low Stock Alerts
            </h2>
            <Link to="/inventory" className="text-xs text-brand-600 hover:underline flex items-center gap-1">
              Manage <ChevronRight className="w-3 h-3" />
            </Link>
          </div>
          <div className="divide-y divide-slate-50">
            {lowStock.length === 0 ? (
              <p className="px-5 py-4 text-sm text-slate-400">All products well stocked</p>
            ) : (
              lowStock.slice(0, 8).map((p) => (
                <div key={p.id} className="flex items-center justify-between px-5 py-3">
                  <div>
                    <p className="text-sm font-medium text-slate-800">{p.name}</p>
                    <p className="text-xs text-slate-400">{p.sku}</p>
                  </div>
                  <span className={p.total_stock === 0 ? 'badge-red' : 'badge-amber'}>
                    {p.total_stock === 0 ? 'Out of Stock' : `${p.total_stock} left`}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
