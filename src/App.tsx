import React, { Suspense, lazy, useEffect } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuthStore } from './stores/authStore';
import { useSettingsStore } from './stores/settingsStore';
import AppShell from './components/Layout/AppShell';
import LoginPage from './pages/Login';
import { cmd } from './lib/utils';
import { Toaster } from './components/ui/Toaster';
import { useTranslation } from 'react-i18next';

// Lazy-loaded pages
const SalesPage      = lazy(() => import('./pages/Sales'));
const ReceiptsPage   = lazy(() => import('./pages/Receipts'));
const InwardPage     = lazy(() => import('./pages/Inward'));
const LedgerPage     = lazy(() => import('./pages/Ledger'));
const CustomerLedger = lazy(() => import('./pages/CustomerLedger'));
const CashFlowPage   = lazy(() => import('./pages/CashFlow'));
const InventoryPage  = lazy(() => import('./pages/Inventory'));
const BulkAddPage     = lazy(() => import('./pages/BulkAddProducts'));
const ProductForm    = lazy(() => import('./pages/ProductForm'));
const ReportsPage    = lazy(() => import('./pages/Reports'));
const SettingsPage   = lazy(() => import('./pages/Settings'));
const StockLedgerPage = lazy(() => import('./pages/StockLedger'));
const StockAdjustmentPage = lazy(() => import('./pages/StockAdjustment'));
const CategoriesPage    = lazy(() => import('./pages/Categories'));
const SuppliersPage     = lazy(() => import('./pages/Suppliers.tsx'));
const SupplierLedgerPage = lazy(() => import('./pages/SupplierLedger.tsx'));
const ChartOfAccountsPage = lazy(() => import('./pages/ChartOfAccounts'));
const GeneralLedgerPage   = lazy(() => import('./pages/GeneralLedger'));

function PageLoader() {
  return (
    <div className="flex items-center justify-center h-full">
      <div className="w-8 h-8 rounded-full border-4 border-brand-200 border-t-brand-600 animate-spin" />
    </div>
  );
}

function ProtectedRoute({ children, adminOnly = false }: { children: React.ReactNode; adminOnly?: boolean }) {
  const { user } = useAuthStore();
  if (!user) return <Navigate to="/login" replace />;
  if (adminOnly && user.role !== 'admin') return <Navigate to="/" replace />;
  return <>{children}</>;
}

export default function App() {
  const { user } = useAuthStore();
  const { language, setSettings } = useSettingsStore();
  const { i18n } = useTranslation();

  // Load settings from DB on startup
  useEffect(() => {
    const syncSettings = async () => {
      try {
        const dbSettings = await cmd<Record<string, string>>('get_all_settings');
        if (dbSettings) {
          setSettings({
            shop_name: dbSettings.shop_name,
            shop_address: dbSettings.shop_address,
            shop_phone: dbSettings.shop_phone,
            currency_symbol: dbSettings.currency_symbol || 'Rs.',
            receipt_footer: dbSettings.receipt_footer,
            tax_rate: parseFloat(dbSettings.tax_rate) || 0,
            low_stock_threshold: parseInt(dbSettings.low_stock_threshold) || 5,
            printer_type: dbSettings.printer_type || 'none',
            printer_port: dbSettings.printer_port,
            printer_baud: parseInt(dbSettings.printer_baud) || 9600,
            language: dbSettings.language || 'en',
          });
        }
      } catch (e) {
        console.error('Failed to sync settings from DB:', e);
      }
    };
    syncSettings();
  }, [setSettings]);

  useEffect(() => {
    document.documentElement.lang = language;
    document.documentElement.dir = language === 'ur' ? 'rtl' : 'ltr';
    i18n.changeLanguage(language);
  }, [language, i18n]);

  if (!user) {
    return (
      <Toaster>
        <LoginPage />
      </Toaster>
    );
  }

  return (
    <Toaster>
      <AppShell>
        <Suspense fallback={<PageLoader />}>
          <Routes>
            <Route path="/"           element={<Navigate to="/sales" replace />} />
            <Route path="/sales"      element={<ProtectedRoute><SalesPage /></ProtectedRoute>} />
            <Route path="/receipts"   element={<ProtectedRoute><ReceiptsPage /></ProtectedRoute>} />
            <Route path="/inward"     element={<ProtectedRoute adminOnly><InwardPage /></ProtectedRoute>} />
            <Route path="/ledger/:id" element={<ProtectedRoute><CustomerLedger /></ProtectedRoute>} />
            <Route path="/suppliers" element={<ProtectedRoute adminOnly><SuppliersPage /></ProtectedRoute>} />
            <Route path="/suppliers/:id" element={<ProtectedRoute adminOnly><SupplierLedgerPage /></ProtectedRoute>} />
            <Route path="/cash-flow" element={<ProtectedRoute><CashFlowPage /></ProtectedRoute>} />
            <Route path="/inventory"  element={<ProtectedRoute adminOnly><InventoryPage /></ProtectedRoute>} />
            <Route path="/inventory/categories" element={<ProtectedRoute adminOnly><CategoriesPage /></ProtectedRoute>} />
            <Route path="/inventory/bulk" element={<ProtectedRoute adminOnly><BulkAddPage /></ProtectedRoute>} />
            <Route path="/inventory/new"      element={<ProtectedRoute adminOnly><ProductForm /></ProtectedRoute>} />
            <Route path="/inventory/edit/:id" element={<ProtectedRoute adminOnly><ProductForm /></ProtectedRoute>} />
            <Route path="/stock-ledger" element={<ProtectedRoute adminOnly><StockLedgerPage /></ProtectedRoute>} />
            <Route path="/stock-adjustment" element={<ProtectedRoute adminOnly><StockAdjustmentPage /></ProtectedRoute>} />
            <Route path="/accounts" element={<ProtectedRoute adminOnly><ChartOfAccountsPage /></ProtectedRoute>} />
            <Route path="/accounts/general-ledger" element={<ProtectedRoute adminOnly><GeneralLedgerPage /></ProtectedRoute>} />
            <Route path="/reports"    element={<ProtectedRoute adminOnly><ReportsPage /></ProtectedRoute>} />
            <Route path="/settings"   element={<ProtectedRoute adminOnly><SettingsPage /></ProtectedRoute>} />
            <Route path="*"           element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
      </AppShell>
    </Toaster>
  );
}
