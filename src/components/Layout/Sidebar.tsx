import React from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '../../stores/authStore';
import { useSettingsStore } from '../../stores/settingsStore';
import {
  LayoutDashboard, ShoppingCart, BookOpen, Package, PackagePlus,
  BarChart3, Settings, LogOut, Store, Globe, Receipt, DollarSign, ClipboardList,
  ArrowRightLeft, Layers, Users
} from 'lucide-react';
import { cn } from '../../lib/utils';

interface NavItemConfig {
  to: string;
  icon: React.ReactNode;
  label: string;
  adminOnly?: boolean;
  shortcut?: string;
}

export default function Sidebar() {
  const { t } = useTranslation();
  const { user, logout } = useAuthStore();
  const { shop_name, language, setLanguage } = useSettingsStore();
  const navigate = useNavigate();

  const navItems: NavItemConfig[] = [
    { to: '/sales',     icon: <ShoppingCart className="w-5 h-5" />, label: t('nav.sales'), shortcut: 'F1' },
    { to: '/receipts',  icon: <Receipt className="w-5 h-5" />, label: "Receipts" },
    { to: '/inward',    icon: <PackagePlus className="w-5 h-5" />, label: "Inward Stock", adminOnly: true },
    { to: '/suppliers', icon: <Users className="w-5 h-5" />, label: "Suppliers", adminOnly: true },
    { to: '/stock-adjustment', icon: <ArrowRightLeft className="w-5 h-5" />, label: 'Stock Adjustment', adminOnly: true },
    { to: '/cash-flow', icon: <DollarSign className="w-5 h-5" />, label: 'Cash Flow', adminOnly: true },
    { to: '/inventory', icon: <Package className="w-5 h-5" />, label: t('nav.inventory'), adminOnly: true },
    { to: '/inventory/categories', icon: <Layers className="w-5 h-5" />, label: 'Categories', adminOnly: true },
    { to: '/stock-ledger', icon: <ClipboardList className="w-5 h-5" />, label: 'Stock Ledger', adminOnly: true },
    { to: '/accounts/general-ledger', icon: <Globe className="w-5 h-5" />, label: 'General Ledger', adminOnly: true },
    { to: '/accounts', icon: <BookOpen className="w-5 h-5" />, label: 'Chart of Accounts', adminOnly: true },
    { to: '/reports',   icon: <BarChart3 className="w-5 h-5" />, label: t('nav.reports'), adminOnly: true },
    { to: '/settings',  icon: <Settings className="w-5 h-5" />, label: t('nav.settings'), adminOnly: true },
  ];

  const visibleItems = navItems.filter(
    (item) => !item.adminOnly || user?.role === 'admin'
  );

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const toggleLang = () => setLanguage(language === 'en' ? 'ur' : 'en');

  return (
    <aside className="sidebar no-print h-full flex flex-col" style={{ minWidth: 200, maxWidth: 240 }}>
      {/* Logo */}
      <div className="px-5 py-5 border-b border-slate-700/50">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-brand-500 flex items-center justify-center flex-shrink-0">
            <Store className="w-4 h-4 text-white" />
          </div>
          <div className="min-w-0">
            <p className="text-white font-semibold text-sm truncate">{shop_name}</p>
            <p className="text-slate-400 text-xs">POS System</p>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 py-3 overflow-y-auto">
        {visibleItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === '/' || item.to === '/inventory' || item.to === '/accounts'}
            className={({ isActive }) =>
              cn('nav-item', isActive && 'active')
            }
          >
            {item.icon}
            <span className="flex-1 text-sm">{item.label}</span>
            {item.shortcut && (
              <span className="text-xs text-slate-500 font-mono bg-slate-800 px-1 rounded">
                {item.shortcut}
              </span>
            )}
          </NavLink>
        ))}
      </nav>

      {/* Bottom actions */}
      <div className="border-t border-slate-700/50 p-3 space-y-1">
        <button
          onClick={toggleLang}
          className="nav-item w-full"
        >
          <Globe className="w-5 h-5" />
          <span className="text-sm">{language === 'en' ? 'اردو' : 'English'}</span>
        </button>

        {/* User info */}
        <div className="flex items-center gap-3 px-4 py-2">
          <div className="w-8 h-8 rounded-full bg-brand-600 flex items-center justify-center flex-shrink-0">
            <span className="text-white text-xs font-bold uppercase">
              {user?.username?.charAt(0) ?? '?'}
            </span>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-white text-xs font-medium truncate">{user?.username}</p>
            <p className="text-slate-400 text-xs capitalize">{user?.role}</p>
          </div>
          <button
            onClick={handleLogout}
            className="text-slate-400 hover:text-red-400 transition-colors"
            title={t('nav.logout')}
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>
    </aside>
  );
}
