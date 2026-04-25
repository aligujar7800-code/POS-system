import React, { Suspense, lazy, useEffect } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuthStore } from './stores/authStore';
import { useSettingsStore } from './stores/settingsStore';
import AppShell from './components/Layout/AppShell';
import LoginPage from './pages/Login';
import LicenseGate from './components/LicenseGate';
import { cmd } from './lib/utils';
import { Toaster } from './components/ui/Toaster';
import { useTranslation } from 'react-i18next';
import { check } from '@tauri-apps/plugin-updater';
import { ask, message } from '@tauri-apps/plugin-dialog';
import { relaunch } from '@tauri-apps/plugin-process';

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

function ProtectedRoute({ children, permission }: { children: React.ReactNode; permission?: string }) {
  const { user } = useAuthStore();
  if (!user) return <Navigate to="/login" replace />;
  
  if (user.role === 'admin') return <>{children}</>;

  if (permission) {
    try {
      const perms = JSON.parse(user.permissions || '[]');
      if (!perms.includes(permission)) {
        return <Navigate to="/" replace />;
      }
    } catch (e) {
      return <Navigate to="/" replace />;
    }
  }
  
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
            shop_logo: dbSettings.shop_logo,
            shop_email: dbSettings.shop_email || '',
            currency_symbol: dbSettings.currency_symbol || 'Rs.',
            receipt_header: dbSettings.receipt_header || '',
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

    // Auto-Updater Check
    async function checkForUpdates() {
      try {
        console.log('Checking for updates...');
        const update = await check();
        console.log('Update result:', update);

        if (update && update.available) {
          console.log(`New version found: ${update.version}`);
          const yes = await ask(`A new version (${update.version}) is available!\n\nDo you want to download and install it now?`, { 
            title: 'Update Available', 
            kind: 'info' 
          });
          
          if (yes) {
            console.log('Downloading and installing update...');
            await update.downloadAndInstall();
            console.log('Update installed successfully!');
            await relaunch();
          }
        } else {
          console.log('No update available.');
        }
      } catch (e) {
        console.error('Failed to check for updates:', e);
      }
    }
    
    if (typeof window !== 'undefined' && (window as any).__TAURI_INTERNALS__) {
      checkForUpdates();
    }
  }, [setSettings]);

  useEffect(() => {
    document.documentElement.lang = language;
    document.documentElement.dir = language === 'ur' ? 'rtl' : 'ltr';
    i18n.changeLanguage(language);
  }, [language, i18n]);

  if (!user) {
    return (
      <Toaster>
        <LicenseGate>
          <LoginPage />
        </LicenseGate>
      </Toaster>
    );
  }

  return (
    <Toaster>
      <LicenseGate>
      <AppShell>
        <Suspense fallback={<PageLoader />}>
          <Routes>
            <Route path="/"           element={<Navigate to="/sales" replace />} />
            <Route path="/sales"      element={<ProtectedRoute permission="sales"><SalesPage /></ProtectedRoute>} />
            <Route path="/receipts"   element={<ProtectedRoute permission="sales"><ReceiptsPage /></ProtectedRoute>} />
            <Route path="/inward"     element={<ProtectedRoute permission="inventory"><InwardPage /></ProtectedRoute>} />
            <Route path="/ledger/:id" element={<ProtectedRoute permission="customers"><CustomerLedger /></ProtectedRoute>} />
            <Route path="/suppliers" element={<ProtectedRoute permission="suppliers"><SuppliersPage /></ProtectedRoute>} />
            <Route path="/suppliers/:id" element={<ProtectedRoute permission="suppliers"><SupplierLedgerPage /></ProtectedRoute>} />
            <Route path="/cash-flow" element={<ProtectedRoute permission="accounts"><CashFlowPage /></ProtectedRoute>} />
            <Route path="/inventory"  element={<ProtectedRoute permission="inventory"><InventoryPage /></ProtectedRoute>} />
            <Route path="/inventory/categories" element={<ProtectedRoute permission="inventory"><CategoriesPage /></ProtectedRoute>} />
            <Route path="/inventory/bulk" element={<ProtectedRoute permission="inventory"><BulkAddPage /></ProtectedRoute>} />
            <Route path="/inventory/new"      element={<ProtectedRoute permission="inventory"><ProductForm /></ProtectedRoute>} />
            <Route path="/inventory/edit/:id" element={<ProtectedRoute permission="inventory"><ProductForm /></ProtectedRoute>} />
            <Route path="/stock-ledger" element={<ProtectedRoute permission="inventory"><StockLedgerPage /></ProtectedRoute>} />
            <Route path="/stock-adjustment" element={<ProtectedRoute permission="stock_adjustment"><StockAdjustmentPage /></ProtectedRoute>} />
            <Route path="/accounts" element={<ProtectedRoute permission="accounts"><ChartOfAccountsPage /></ProtectedRoute>} />
            <Route path="/accounts/general-ledger" element={<ProtectedRoute permission="accounts"><GeneralLedgerPage /></ProtectedRoute>} />
            <Route path="/reports"    element={<ProtectedRoute permission="reports"><ReportsPage /></ProtectedRoute>} />
            <Route path="/settings"   element={<ProtectedRoute permission="settings"><SettingsPage /></ProtectedRoute>} />
            <Route path="*"           element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
      </AppShell>
    </LicenseGate>
  </Toaster>
  );
}
