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
import { ChevronLeft, ChevronRight } from 'lucide-react';

interface NavItemConfig {
  to: string;
  icon: React.ReactNode;
  label: string;
  permission?: string;
  shortcut?: string;
}

export default function Sidebar() {
  const { t } = useTranslation();
  const { user, logout } = useAuthStore();
  const { shop_name, language, setLanguage } = useSettingsStore();
  const navigate = useNavigate();
  const [isCollapsed, setIsCollapsed] = React.useState(() => {
    return localStorage.getItem('sidebar-collapsed') === 'true';
  });

  const toggleCollapse = () => {
    const newState = !isCollapsed;
    setIsCollapsed(newState);
    localStorage.setItem('sidebar-collapsed', String(newState));
  };

  const navItems: NavItemConfig[] = [
    { to: '/sales',     icon: <ShoppingCart className="w-5 h-5" />, label: t('nav.sales'), shortcut: 'F1', permission: 'sales' },
    { to: '/receipts',  icon: <Receipt className="w-5 h-5" />, label: "Receipts", permission: 'sales' },
    { to: '/inward',    icon: <PackagePlus className="w-5 h-5" />, label: "Inward Stock", permission: 'inventory' },
    { to: '/suppliers', icon: <Users className="w-5 h-5" />, label: "Suppliers", permission: 'suppliers' },
    { to: '/stock-adjustment', icon: <ArrowRightLeft className="w-5 h-5" />, label: 'Stock Adjustment', permission: 'stock_adjustment' },
    { to: '/cash-flow', icon: <DollarSign className="w-5 h-5" />, label: 'Cash Flow', permission: 'accounts' },
    { to: '/inventory', icon: <Package className="w-5 h-5" />, label: t('nav.inventory'), permission: 'inventory' },
    { to: '/inventory/categories', icon: <Layers className="w-5 h-5" />, label: 'Categories', permission: 'inventory' },
    { to: '/stock-ledger', icon: <ClipboardList className="w-5 h-5" />, label: 'Stock Ledger', permission: 'inventory' },
    { to: '/accounts/general-ledger', icon: <Globe className="w-5 h-5" />, label: 'General Ledger', permission: 'accounts' },
    { to: '/accounts', icon: <BookOpen className="w-5 h-5" />, label: 'Chart of Accounts', permission: 'accounts' },
    { to: '/reports',   icon: <BarChart3 className="w-5 h-5" />, label: t('nav.reports'), permission: 'reports' },
    { to: '/settings',  icon: <Settings className="w-5 h-5" />, label: t('nav.settings'), permission: 'settings' },
    { to: '/logout',    icon: <LogOut className="w-5 h-5" />, label: "Logout", permission: '' },
  ];

  const visibleItems = navItems.filter((item) => {
    if (user?.role === 'admin') return true;
    if (!item.permission) return true;
    try {
      const perms = JSON.parse(user?.permissions || '[]');
      return perms.includes(item.permission);
    } catch (e) {
      return false;
    }
  });

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const toggleLang = () => setLanguage(language === 'en' ? 'ur' : 'en');

  return (
    <aside 
      className={cn(
        "sidebar no-print h-full flex flex-col transition-all duration-300 relative",
        isCollapsed ? "w-20" : "w-60"
      )}
    >
      {/* Collapse Toggle Button */}
      <button 
        onClick={toggleCollapse}
        className="absolute -right-3 top-16 w-6 h-6 bg-brand-600 text-white rounded-full flex items-center justify-center shadow-lg hover:bg-brand-700 z-50 border-2 border-white"
      >
        {isCollapsed ? <ChevronRight className="w-3 h-3" /> : <ChevronLeft className="w-3 h-3" />}
      </button>

      {/* Logo */}
      <div className="px-5 py-5 border-b border-slate-700/50">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-brand-500 flex items-center justify-center flex-shrink-0">
            <Store className="w-4 h-4 text-white" />
          </div>
          {!isCollapsed && (
            <div className="min-w-0 transition-opacity duration-200">
              <p className="text-white font-semibold text-sm truncate">{shop_name}</p>
              <p className="text-slate-400 text-xs">POS System</p>
            </div>
          )}
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 py-3 overflow-y-auto">
        {visibleItems.map((item) => (
          item.to === '/logout' ? (
            <button
              key={item.to}
              onClick={handleLogout}
              className="nav-item w-full text-red-400 hover:bg-red-500/10"
            >
              {item.icon}
              {!isCollapsed && <span className="flex-1 text-sm text-left truncate">{item.label}</span>}
              {!isCollapsed && item.shortcut && (
                <span className="text-xs text-slate-500 font-mono bg-slate-800 px-1 rounded">
                  {item.shortcut}
                </span>
              )}
            </button>
          ) : (
            <NavLink
              key={item.to}
              to={item.to}
              title={isCollapsed ? item.label : ''}
              end={item.to === '/' || item.to === '/inventory' || item.to === '/accounts'}
              className={({ isActive }) =>
                cn('nav-item', isActive && 'active', isCollapsed && "justify-center px-0")
              }
            >
              {item.icon}
              {!isCollapsed && <span className="flex-1 text-sm truncate">{item.label}</span>}
              {!isCollapsed && item.shortcut && (
                <span className="text-xs text-slate-500 font-mono bg-slate-800 px-1 rounded">
                  {item.shortcut}
                </span>
              )}
            </NavLink>
          )
        ))}
      </nav>

      {/* Bottom actions */}
      <div className="border-t border-slate-700/50 p-3 space-y-1">
        <button
          onClick={toggleLang}
          className={cn("nav-item w-full", isCollapsed && "justify-center px-0")}
          title={isCollapsed ? (language === 'en' ? 'اردو' : 'English') : ''}
        >
          <Globe className="w-5 h-5" />
          {!isCollapsed && <span className="text-sm">{language === 'en' ? 'اردو' : 'English'}</span>}
        </button>

        {/* User info */}
        <div className={cn("flex items-center gap-3 py-2", isCollapsed ? "justify-center px-0" : "px-4")}>
          <div className="w-8 h-8 rounded-full bg-brand-600 flex items-center justify-center flex-shrink-0" title={user?.username}>
            <span className="text-white text-xs font-bold uppercase">
              {user?.username?.charAt(0) ?? '?'}
            </span>
          </div>
          {!isCollapsed && (
            <div className="flex-1 min-w-0">
              <p className="text-white text-xs font-medium truncate">{user?.username}</p>
              <p className="text-slate-400 text-xs capitalize">{user?.role}</p>
            </div>
          )}
          {!isCollapsed && (
            <button
              onClick={handleLogout}
              className="text-slate-400 hover:text-red-400 transition-colors"
              title={t('nav.logout')}
            >
              <LogOut className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>
    </aside>
  );
}
