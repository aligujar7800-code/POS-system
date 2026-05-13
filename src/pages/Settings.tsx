import React, { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { cmd } from '../lib/utils';
import { useSettingsStore } from '../stores/settingsStore';
import { useAuthStore } from '../stores/authStore';
import { useNavigate } from 'react-router-dom';
import { useToast } from '../components/ui/Toaster';
import { Settings, Store, Printer, Users, Database, Globe, Check, RefreshCw, Tag, Save, LogOut, Plus, Trash2, ShoppingBag, Wifi, WifiOff, AlertTriangle, RotateCw, Eye, EyeOff, Cloud, CloudUpload, CloudDownload, Clock, Mail, HardDrive, History, Unplug, Timer, Usb, Network, Activity } from 'lucide-react';
import { save } from '@tauri-apps/plugin-dialog';

type Tab = 'shop' | 'receipt' | 'tax' | 'users' | 'hardware' | 'integrations' | 'language' | 'license';
type IntegrationView = 'list' | 'shopify' | 'google';

interface BackupEntry { id: string; name: string; size: string; created_time: string; }
interface CloudAccount { email: string; name: string; picture: string; }

interface UserRecord { id: number; username: string; role: string; is_active: boolean; permissions?: string; }
interface PrinterInfo { port: string; name: string; printer_type: string; model_guess: string; }
import { ShieldCheck } from 'lucide-react';

export default function SettingsPage() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { logout } = useAuthStore();
  const navigate = useNavigate();
  const settings = useSettingsStore();
  const qc = useQueryClient();

  const [tab, setTab] = useState<Tab>('shop');
  const [integrationView, setIntegrationView] = useState<IntegrationView>('list');
  const [saving, setSaving] = useState(false);
  const [detecting, setDetecting] = useState(false);

  // Local editable state
  const [shopName, setShopName] = useState(settings.shop_name);
  const [shopAddress, setShopAddress] = useState(settings.shop_address);
  const [shopPhone, setShopPhone] = useState(settings.shop_phone);
  const [shopLogo, setShopLogo] = useState(settings.shop_logo || '');
  const [logoWidth, setLogoWidth] = useState(settings.logo_width || 120);
  const [logoHeight, setLogoHeight] = useState(settings.logo_height || 120);
  const [logoAlign, setLogoAlign] = useState<'left' | 'center' | 'right'>(settings.logo_align || 'center');
  const [shopEmail, setShopEmail] = useState(settings.shop_email || '');
  const [receiptHeader, setReceiptHeader] = useState(settings.receipt_header || '');
  const [footer, setFooter] = useState(settings.receipt_footer);
  const [receiptFont, setReceiptFont] = useState(settings.receipt_font || "'Courier New', Courier, monospace");
  const [taxRate, setTaxRate] = useState(String(settings.tax_rate));
  const [printerType, setPrinterType] = useState(settings.printer_type);
  const [printerPort, setPrinterPort] = useState(settings.printer_port);
  const [printerBaud, setPrinterBaud] = useState(String(settings.printer_baud));
  const [currencySymbol, setCurrencySymbol] = useState(settings.currency_symbol);
  const [lowStockThreshold, setLowStockThreshold] = useState(String(settings.low_stock_threshold));
  const [detectedPrinters, setDetectedPrinters] = useState<PrinterInfo[]>([]);

  // Add user form
  const [showAddUser, setShowAddUser] = useState(false);
  const [newUsername, setNewUsername] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newRole, setNewRole] = useState('cashier');
  const [selectedPerms, setSelectedPerms] = useState<string[]>(['sales']);

  // Delete user state
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [userToDelete, setUserToDelete] = useState<UserRecord | null>(null);
  const [adminUsername, setAdminUsername] = useState('');
  const [adminPassword, setAdminPassword] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);

  // Shopify settings state
  const [shopifyDomain, setShopifyDomain] = useState('');
  const [shopifyToken, setShopifyToken] = useState('');
  const [shopifyClientId, setShopifyClientId] = useState('');
  const [shopifySecret, setShopifySecret] = useState('');
  const [showToken, setShowToken] = useState(false);
  const [showSecret, setShowSecret] = useState(false);
  const [shopifyLocationId, setShopifyLocationId] = useState('');
  const [shopifyAutoSync, setShopifyAutoSync] = useState(false);
  const [shopifyAutoSyncProducts, setShopifyAutoSyncProducts] = useState(false);
  const [shopifyTestResult, setShopifyTestResult] = useState<any>(null);
  const [shopifyTesting, setShopifyTesting] = useState(false);
  const [shopifyLocations, setShopifyLocations] = useState<any[]>([]);
  const [shopifyQueueStats, setShopifyQueueStats] = useState<any>(null);
  const [shopifyPending, setShopifyPending] = useState<any[]>([]);
  const [shopifyRetrying, setShopifyRetrying] = useState(false);
  const [shopifySaving, setShopifySaving] = useState(false);

  // Cloud Backup state
  const [cloudAccount, setCloudAccount] = useState<CloudAccount | null>(null);
  const [cloudConnecting, setCloudConnecting] = useState(false);
  const [cloudBackups, setCloudBackups] = useState<BackupEntry[]>([]);
  const [cloudStorage, setCloudStorage] = useState<{ limit: number; usage: number } | null>(null);
  const [cloudInterval, setCloudInterval] = useState(6);
  const [cloudLastBackup, setCloudLastBackup] = useState<number | null>(null);
  const [cloudBackingUp, setCloudBackingUp] = useState(false);
  const [cloudRestoring, setCloudRestoring] = useState(false);
  const [cloudLoadingBackups, setCloudLoadingBackups] = useState(false);
  const [cloudQueueCount, setCloudQueueCount] = useState(0);

  const permissionModules = [
    { id: 'sales', label: 'Sales' },
    { id: 'inventory', label: 'Inventory' },
    { id: 'reports', label: 'Reports' },
    { id: 'settings', label: 'Settings' },
    { id: 'suppliers', label: 'Suppliers' },
    { id: 'customers', label: 'Customers' },
    { id: 'accounts', label: 'Accounts' },
    { id: 'expenses', label: 'Expenses' },
    { id: 'stock_adjustment', label: 'Stock Adjustment' },
  ];

  const { data: users = [] } = useQuery<UserRecord[]>({
    queryKey: ['users'],
    queryFn: () => cmd('get_all_users'),
    enabled: tab === 'users',
  });

  const { data: licenseInfo } = useQuery<any>({
    queryKey: ['licenseInfo'],
    queryFn: () => cmd('get_license_status'),
    enabled: tab === 'license',
  });

  // Load Shopify settings from DB when tab is activated
  useEffect(() => {
    if (tab !== 'integrations' || integrationView !== 'shopify') return;
    (async () => {
      try {
        const s = await cmd<Record<string, string>>('get_all_settings');
        if (s) {
          setShopifyDomain(s.shopify_domain || '');
          setShopifyToken(s.shopify_token || '');
          setShopifyClientId(s.shopify_client_id || '');
          setShopifySecret(s.shopify_client_secret || '');
          setShopifyLocationId(s.shopify_location_id || '');
          setShopifyAutoSync(s.shopify_auto_sync === '1');
          setShopifyAutoSyncProducts(s.shopify_auto_sync_products === '1');
        }
        // Load queue stats
        const stats = await cmd('shopify_get_queue_stats');
        setShopifyQueueStats(stats);
        const pending = await cmd<any[]>('shopify_get_pending_syncs');
        setShopifyPending(pending || []);
      } catch (e) {
        console.warn('Failed to load Shopify settings:', e);
      }
    })();
  }, [tab]);

  // Load Cloud Backup data when backup tab is activated
  const currentUser = useAuthStore.getState().user;
  const loadCloudData = useCallback(async () => {
    if (!currentUser) return;
    try {
      const account = await cmd<CloudAccount | null>('cloud_backup_get_account', { userId: currentUser.id });
      setCloudAccount(account);
      if (account) {
        setCloudLoadingBackups(true);
        const [backups, storage, interval, lastTime, queueStatus] = await Promise.all([
          cmd<BackupEntry[]>('cloud_backup_list', { userId: currentUser.id }).catch(() => []),
          cmd<any>('cloud_backup_storage', { userId: currentUser.id }).catch(() => null),
          cmd<number>('cloud_backup_get_interval', { userId: currentUser.id }).catch(() => 6),
          cmd<number | null>('cloud_backup_last_time', { userId: currentUser.id }).catch(() => null),
          cmd<any>('cloud_backup_queue_status').catch(() => ({ count: 0 })),
        ]);
        setCloudBackups(backups);
        setCloudStorage(storage);
        setCloudInterval(interval);
        setCloudLastBackup(lastTime);
        setCloudQueueCount(queueStatus?.count || 0);
        setCloudLoadingBackups(false);
      }
    } catch (e) {
      console.warn('Failed to load cloud backup data:', e);
    }
  }, [currentUser]);

  useEffect(() => {
    if (tab === 'integrations' && integrationView === 'google') loadCloudData();
  }, [tab, integrationView, loadCloudData]);

  const connectGmail = async () => {
    if (!currentUser) return;
    setCloudConnecting(true);
    try {
      const account = await cmd<CloudAccount>('cloud_backup_connect', { userId: currentUser.id });
      setCloudAccount(account);
      toast(`Connected to ${account.email}!`, 'success');
      // Set default interval
      await cmd('cloud_backup_set_interval', { userId: currentUser.id, hours: 6 });
      loadCloudData();
    } catch (e: any) {
      toast('Connection failed: ' + e.toString(), 'error');
    } finally {
      setCloudConnecting(false);
    }
  };

  const disconnectGmail = async () => {
    if (!currentUser) return;
    if (!window.confirm('Disconnect your Google account? Automatic backups will stop.')) return;
    try {
      await cmd('cloud_backup_disconnect', { userId: currentUser.id });
      setCloudAccount(null);
      setCloudBackups([]);
      setCloudStorage(null);
      toast('Google account disconnected', 'success');
    } catch (e: any) {
      toast(e.toString(), 'error');
    }
  };

  const triggerManualBackup = async () => {
    if (!currentUser) return;
    setCloudBackingUp(true);
    try {
      const result = await cmd<any>('cloud_backup_now', { userId: currentUser.id });
      toast(`Backup complete: ${result.file_name}`, 'success');
      loadCloudData();
    } catch (e: any) {
      toast('Backup failed: ' + e.toString(), 'error');
    } finally {
      setCloudBackingUp(false);
    }
  };

  const changeInterval = async (hours: number) => {
    if (!currentUser) return;
    setCloudInterval(hours);
    try {
      await cmd('cloud_backup_set_interval', { userId: currentUser.id, hours });
      toast(`Backup interval set to ${hours} hours`, 'success');
    } catch (e: any) {
      toast(e.toString(), 'error');
    }
  };

  const restoreFromCloud = async () => {
    if (!currentUser) return;
    if (!window.confirm('⚠️ This will replace your current database with the latest cloud backup. A safety copy of your current data will be saved. Continue?')) return;
    setCloudRestoring(true);
    try {
      const name = await cmd<string>('cloud_backup_restore', { userId: currentUser.id });
      toast(`Database restored from ${name}. Please restart the application.`, 'success');
    } catch (e: any) {
      toast('Restore failed: ' + e.toString(), 'error');
    } finally {
      setCloudRestoring(false);
    }
  };

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const saveShopSettings = async () => {
    setSaving(true);
    try {
      const map: Record<string, string> = {
        shop_name: shopName,
        shop_address: shopAddress,
        shop_phone: shopPhone,
        shop_logo: shopLogo,
        logo_width: String(logoWidth),
        logo_height: String(logoHeight),
        logo_align: logoAlign,
        shop_email: shopEmail,
        currency_symbol: currencySymbol,
        receipt_header: receiptHeader,
        receipt_footer: footer,
        receipt_font: receiptFont,
        tax_rate: String(parseFloat(taxRate) || 0),
        low_stock_threshold: String(parseInt(lowStockThreshold) || 5),
        printer_type: printerType,
        printer_port: printerPort,
        printer_baud: printerBaud,
      };
      await cmd('set_many_settings', { map });
      settings.setSettings({
        shop_name: shopName,
        shop_address: shopAddress,
        shop_phone: shopPhone,
        shop_logo: shopLogo || null,
        logo_width: logoWidth,
        logo_height: logoHeight,
        logo_align: logoAlign,
        shop_email: shopEmail,
        currency_symbol: currencySymbol,
        receipt_header: receiptHeader,
        receipt_footer: footer,
        receipt_font: receiptFont,
        tax_rate: parseFloat(taxRate) || 0,
        low_stock_threshold: parseInt(lowStockThreshold) || 5,
        printer_type: printerType,
        printer_port: printerPort,
        printer_baud: parseInt(printerBaud) || 9600,
      });
      toast('Settings saved!', 'success');
    } catch (e: any) {
      toast(e.toString(), 'error');
    } finally {
      setSaving(false);
    }
  };

  const detectPrinters = async () => {
    setDetecting(true);
    try {
      const list = await cmd<PrinterInfo[]>('detect_printers');
      setDetectedPrinters(list);
      if (list.length === 0) toast('No printers detected', 'info');
      else toast(`Found ${list.length} printer(s)`, 'success');
    } catch (e: any) {
      toast('Detection failed: ' + e.toString(), 'error');
    } finally {
      setDetecting(false);
    }
  };

  const testPrint = async () => {
    try {
      await cmd('test_print', {
        config: { printer_type: printerType, port: printerPort, baud_rate: parseInt(printerBaud) || 9600 }
      });
      toast('Test page sent!', 'success');
    } catch (e: any) {
      toast('Print failed: ' + e.toString(), 'error');
    }
  };

  const testLabelPrint = async () => {
    const port = settings.label_printer_port || settings.printer_port;
    if (!port || port === 'none' || port.trim() === '') {
      toast('No label printer selected! Go to Hardware settings and select a Label Printer first.', 'error');
      return;
    }
    const protocol = settings.label_printer_protocol || 'epl';
    try {
      const pType = (() => {
        if (port.toUpperCase().startsWith('COM')) return 'serial';
        if (port.startsWith('usb:')) return 'usb';
        if (port.includes('.') && port.includes(':')) return 'network';
        return 'system';
      })();
      toast(`Sending test label to "${port}" via ${protocol.toUpperCase()}...`, 'info');
      await cmd('test_label_print', {
        config: { printer_type: pType, port: port, baud_rate: parseInt(printerBaud) || 9600 },
        protocol: protocol
      });
      toast(`Test label sent to "${port}" via ${protocol.toUpperCase()}!`, 'success');
    } catch (e: any) {
      toast('Label test failed: ' + e.toString(), 'error');
    }
  };

  const addUser = async () => {
    if (!newUsername || !newPassword) { toast('Username and password required', 'error'); return; }
    try {
      await cmd('create_user', { 
        payload: { 
          username: newUsername, 
          password: newPassword, 
          role: newRole,
          permissions: JSON.stringify(selectedPerms)
        } 
      });
      toast('User created!', 'success');
      qc.invalidateQueries({ queryKey: ['users'] });
      setShowAddUser(false);
      setNewUsername(''); setNewPassword('');
      setSelectedPerms(['sales']);
    } catch (e: any) {
      toast(e.toString(), 'error');
    }
  };

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const deleteUser = async () => {
    if (!userToDelete) return;

    // If cashier, just delete (simple confirmation already handled or direct)
    if (userToDelete.role === 'cashier') {
      setIsDeleting(true);
      try {
        await cmd('delete_user', { userId: userToDelete.id });
        toast('Cashier deleted successfully', 'success');
        qc.invalidateQueries({ queryKey: ['users'] });
        setUserToDelete(null);
      } catch (e: any) {
        toast(e.toString(), 'error');
      } finally {
        setIsDeleting(false);
      }
      return;
    }

    // For Admin deletion, require verification
    if (!adminUsername || !adminPassword) {
      toast('Username and password required for admin deletion', 'error');
      return;
    }

    setIsDeleting(true);
    try {
      const isValid = await cmd<boolean>('verify_admin_password', { 
        username: adminUsername, 
        password: adminPassword 
      });

      if (!isValid) {
        toast('Invalid admin credentials', 'error');
        setIsDeleting(false);
        return;
      }

      await cmd('delete_user', { userId: userToDelete.id });
      toast('Admin user deleted successfully', 'success');
      qc.invalidateQueries({ queryKey: ['users'] });
      setShowDeleteModal(false);
      setUserToDelete(null);
      setAdminUsername('');
      setAdminPassword('');
    } catch (e: any) {
      toast(e.toString(), 'error');
    } finally {
      setIsDeleting(false);
    }
  };

  const toggleUser = async (userId: number, active: boolean) => {
    try {
      await cmd('update_user_status', { userId: userId, isActive: active });
      qc.invalidateQueries({ queryKey: ['users'] });
      toast(active ? 'User activated' : 'User deactivated', 'success');
    } catch (e: any) {
      toast(e.toString(), 'error');
    }
  };

  const exportDb = async () => {
    try {
      const destPath = await save({
        filters: [{ name: 'SQLite Database', extensions: ['db'] }],
        defaultPath: 'pos_backup.db'
      });

      if (!destPath) return;

      await cmd('backup_database', { destPath });
      toast('Database exported successfully!', 'success');
    } catch (e: any) {
      toast(e.toString(), 'error');
    }
  };

  const tabs: [Tab, string, React.ReactNode][] = [
    ['shop', t('settings.shopInfo'), <Store className="w-4 h-4" />],
    ['receipt', t('settings.receipt'), <Settings className="w-4 h-4" />],
    ['tax', t('settings.taxSettings'), <Settings className="w-4 h-4" />],
    ['users', t('settings.users'), <Users className="w-4 h-4" />],
    ['hardware', t('settings.hardware'), <Printer className="w-4 h-4" />],
    ['integrations', 'Integrations', <ShoppingBag className="w-4 h-4" />],
    ['language', t('settings.language'), <Globe className="w-4 h-4" />],
    ['license', 'License', <ShieldCheck className="w-4 h-4" />],
  ];

  return (
    <div className="page">
      <div className="page-header">
        <h1 className="page-title flex items-center gap-2">
          <Settings className="w-5 h-5 text-brand-600" />
          {t('settings.title')}
        </h1>
        {['shop', 'receipt', 'tax', 'hardware'].includes(tab) && (
          <button onClick={saveShopSettings} disabled={saving} className="btn-primary">
            {saving ? <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Check className="w-4 h-4" />}
            {t('settings.save')}
          </button>
        )}
        {tab === 'integrations' && integrationView !== 'list' && (
          <button 
            onClick={() => setIntegrationView('list')} 
            className="btn-secondary"
          >
            <RotateCw className="w-4 h-4" /> Back to Integrations
          </button>
        )}
      </div>

      <div className="flex gap-6 h-full">
        {/* Side tabs */}
        <aside className="w-48 flex-shrink-0">
          <nav className="space-y-1">
            {tabs.map(([key, label, icon]) => (
              <button
                key={key}
                onClick={() => setTab(key)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors text-left ${tab === key ? 'bg-brand-50 text-brand-700' : 'text-slate-600 hover:bg-slate-100'
                  }`}
              >
                {icon} {label}
              </button>
            ))}
          </nav>
        </aside>

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          {/* Shop Info */}
          {tab === 'shop' && (
            <div className="card p-6 space-y-4 max-w-xl">
              <h2 className="font-semibold text-slate-700">{t('settings.shopInfo')}</h2>
              <div>
                <label className="label">{t('settings.shopName')}</label>
                <input value={shopName} onChange={(e) => setShopName(e.target.value)} className="input" />
              </div>
              <div>
                <label className="label">{t('settings.shopAddress')}</label>
                <textarea value={shopAddress} onChange={(e) => setShopAddress(e.target.value)} className="input h-20 resize-none" />
              </div>
              <div>
                <label className="label">{t('settings.shopPhone')}</label>
                <input value={shopPhone} onChange={(e) => setShopPhone(e.target.value)} className="input" />
              </div>
              <div>
                <label className="label">Shop Logo (For Receipts)</label>
                <div className="flex items-center gap-4">
                  {shopLogo && (
                    <img src={shopLogo} alt="Logo" className="w-16 h-16 object-contain border border-slate-200 rounded-md bg-white p-1" />
                  )}
                  <input 
                    type="file" 
                    accept="image/*" 
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      if (file.size > 5000000) { toast("Image must be smaller than 5MB", "error"); return; }
                      const reader = new FileReader();
                      reader.onloadend = () => setShopLogo(reader.result as string);
                      reader.readAsDataURL(file);
                    }} 
                    className="text-xs file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-xs file:font-semibold file:bg-brand-50 file:text-brand-700 hover:file:bg-brand-100" 
                  />
                  {shopLogo && <button onClick={() => setShopLogo('')} className="text-xs text-red-500 hover:underline">Remove</button>}
                </div>

                {/* Logo Settings & Preview */}
                {shopLogo && (
                  <div className="mt-4 p-4 border border-slate-200 rounded-xl bg-slate-50 flex gap-6">
                    <div className="flex-1 space-y-4">
                      <h4 className="font-semibold text-sm text-slate-700">Logo Print Settings</h4>
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="text-xs font-bold text-slate-500">Width (px)</label>
                          <input type="number" value={logoWidth} onChange={e => setLogoWidth(parseInt(e.target.value) || 120)} className="input-sm mt-1" />
                        </div>
                        <div>
                          <label className="text-xs font-bold text-slate-500">Height (px)</label>
                          <input type="number" value={logoHeight} onChange={e => setLogoHeight(parseInt(e.target.value) || 120)} className="input-sm mt-1" />
                        </div>
                      </div>
                      <div>
                        <label className="text-xs font-bold text-slate-500">Alignment</label>
                        <select value={logoAlign} onChange={e => setLogoAlign(e.target.value as any)} className="input-sm mt-1">
                          <option value="left">Left</option>
                          <option value="center">Center</option>
                          <option value="right">Right</option>
                        </select>
                      </div>
                    </div>

                    {/* Live Receipt Preview */}
                    <div className="w-64 bg-white p-4 border border-dashed border-slate-300 shadow-sm text-center font-mono text-[10px] leading-relaxed flex-shrink-0">
                      <p className="text-slate-400 font-sans font-bold text-xs mb-4 border-b border-slate-100 pb-2">Live Receipt Preview</p>
                      
                      <img src={shopLogo} alt="Logo" style={{ 
                        width: `${logoWidth}px`, 
                        height: `${logoHeight}px`, 
                        margin: logoAlign === 'center' ? '0 auto 6px' : logoAlign === 'right' ? '0 0 6px auto' : '0 auto 6px 0',
                        display: 'block', 
                        objectFit: 'contain' 
                      }} />
                      
                      <div style={{ fontSize: '14px', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: '0.1em' }}>{shopName || 'My Shop'}</div>
                      <div style={{ marginTop: '2px' }}>{shopAddress}</div>
                      <div>{shopPhone}</div>
                      
                      <div className="border-t border-dashed border-slate-300 my-2 pt-2 text-left">
                        <div className="flex justify-between"><span>Sale ID:</span><span className="font-bold">INV-0001</span></div>
                        <div className="flex justify-between"><span>Customer:</span><span>Walk-in</span></div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
              <div className="grid grid-cols-2 gap-4 pt-2">
                <div>
                  <label className="label">Currency Symbol</label>
                  <input value={currencySymbol} onChange={(e) => setCurrencySymbol(e.target.value)} className="input" placeholder="Rs. / $ / AED" />
                </div>
                <div>
                  <label className="label">Default Low Stock Alert</label>
                  <input type="number" value={lowStockThreshold} onChange={(e) => setLowStockThreshold(e.target.value)} className="input" min={1} />
                </div>
              </div>
            </div>
          )}

          {/* Receipt */}
          {tab === 'receipt' && (
            <div className="card p-6 space-y-5 max-w-xl">
              <h2 className="font-semibold text-slate-700">{t('settings.receipt')}</h2>
              
              {/* Receipt Font */}
              <div>
                <label className="label">Receipt Font Family</label>
                <p className="text-[11px] text-slate-400 mb-1">Select a professional font style for the printed receipt</p>
                <select 
                  value={receiptFont} 
                  onChange={(e) => setReceiptFont(e.target.value)} 
                  className="input"
                >
                  <option value="'Courier New', Courier, monospace">Courier New (Default, Monospace)</option>
                  <option value="'Inter', sans-serif">Inter (Modern, Clean)</option>
                  <option value="'Roboto', sans-serif">Roboto (Professional)</option>
                  <option value="'Fira Code', monospace">Fira Code (Modern Monospace)</option>
                  <option value="'Helvetica Neue', Helvetica, Arial, sans-serif">Helvetica Neue (Classic)</option>
                  <option value="'Segoe UI', Tahoma, Geneva, Verdana, sans-serif">Segoe UI (Windows Native)</option>
                  <option value="system-ui, -apple-system, sans-serif">System UI (Native)</option>
                  <option value="'Times New Roman', Times, serif">Times New Roman (Traditional)</option>
                  <option value="'SF Pro Text', sans-serif">SF Pro (Apple Style)</option>
                  <option value="'Space Mono', monospace">Space Mono (Tech/Modern)</option>
                </select>
              </div>

              {/* Receipt Header */}
              <div>
                <label className="label">Receipt Header Text</label>
                <p className="text-[11px] text-slate-400 mb-1">Shows at the top of receipt before items (e.g., promotions, announcements)</p>
                <textarea 
                  value={receiptHeader} 
                  onChange={(e) => setReceiptHeader(e.target.value)} 
                  className="input h-20 resize-none font-mono text-xs" 
                  placeholder="e.g., SUMMER SALE - 20% OFF ALL ITEMS"
                />
              </div>

              {/* Receipt Footer */}
              <div>
                <label className="label">{t('settings.receiptFooter')}</label>
                <p className="text-[11px] text-slate-400 mb-1">Shows at the bottom of receipt (return policy, greetings, etc.)</p>
                <textarea 
                  value={footer} 
                  onChange={(e) => setFooter(e.target.value)} 
                  className="input h-24 resize-none font-mono text-xs" 
                  placeholder={"RETURN POLICY\nReceipt and barcode on item\nare required for returns."}
                />
              </div>

              {/* Shop Email */}
              <div>
                <label className="label">Shop Email (shown on receipt)</label>
                <input 
                  value={shopEmail} 
                  onChange={(e) => setShopEmail(e.target.value)} 
                  className="input" 
                  placeholder="shop@example.com" 
                />
              </div>

              {/* Live Preview */}
              <div>
                <label className="label">Receipt Font Preview</label>
                <div 
                  className="p-6 bg-white border border-dashed border-slate-300 w-80 shadow-sm text-center text-sm mx-auto"
                  style={{ fontFamily: receiptFont, lineHeight: '1.6', color: '#000' }}
                >
                  <div style={{ fontSize: '18px', fontWeight: 'bold', textTransform: 'uppercase' }}>{shopName || 'Shop Name'}</div>
                  <div style={{ fontSize: '12px' }}>{shopAddress}</div>
                  <div style={{ fontSize: '12px', borderBottom: '1px dashed #333', paddingBottom: '8px', marginBottom: '8px' }}>{shopPhone}</div>
                  
                  {receiptHeader && (
                    <div style={{ fontSize: '12px', marginBottom: '8px', borderBottom: '1px dashed #333', paddingBottom: '8px' }}>
                      {receiptHeader.split('\n').map((l, i) => <div key={i}>{l}</div>)}
                    </div>
                  )}

                  <div className="flex justify-between font-bold border-b border-dashed border-slate-300 pb-2 mb-2 text-xs">
                    <span>ITEM</span>
                    <span>TOTAL</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span>T-Shirt (M / Red)</span>
                    <span>{currencySymbol} 1500</span>
                  </div>
                  <div className="flex justify-between font-bold border-t border-dashed border-slate-300 pt-2 mt-2 text-xs">
                    <span>GRAND TOTAL</span>
                    <span>{currencySymbol} 1500</span>
                  </div>

                  {footer && (
                    <div style={{ fontSize: '10px', marginTop: '12px', paddingTop: '8px', borderTop: '1px dashed #333' }}>
                      {footer.split('\n').map((l, i) => <div key={i}>{l}</div>)}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Tax */}
          {tab === 'tax' && (
            <div className="card p-6 space-y-4 max-w-xl">
              <h2 className="font-semibold text-slate-700">{t('settings.taxSettings')}</h2>
              <div>
                <label className="label">{t('settings.taxRate')}</label>
                <input type="number" value={taxRate} onChange={(e) => setTaxRate(e.target.value)} className="input" min={0} max={100} />
              </div>
            </div>
          )}

          {/* Users */}
          {tab === 'users' && (
            <div className="space-y-4 max-w-2xl">
              <div className="flex items-center justify-between">
                <h2 className="font-semibold text-slate-700">{t('settings.users')}</h2>
                <div className="flex gap-2">
                  <button onClick={handleLogout} className="btn-secondary btn-sm border-red-200 text-red-600 hover:bg-red-50">
                    <LogOut className="w-3.5 h-3.5" /> Logout
                  </button>
                  <button onClick={() => setShowAddUser(true)} className="btn-primary btn-sm">
                    <Plus className="w-3.5 h-3.5" /> {t('settings.addUser')}
                  </button>
                </div>
              </div>
              <div className="table-container">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Username</th>
                      <th>Role</th>
                      <th>Permissions</th>
                      <th>Status</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {users.map((u) => (
                      <tr key={u.id}>
                        <td className="font-medium">{u.username}</td>
                        <td><span className={u.role === 'admin' ? 'badge-blue' : 'badge-gray'}>{u.role}</span></td>
                        <td>
                          <div className="flex flex-wrap gap-1 max-w-[200px]">
                            {(() => {
                              try {
                                const perms = JSON.parse(u.permissions || '[]');
                                return perms.map((p: string) => (
                                  <span key={p} className="text-[9px] bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded uppercase font-bold">
                                    {p.replace('_', ' ')}
                                  </span>
                                ));
                              } catch (e) {
                                return <span className="text-[10px] text-slate-400">Default</span>;
                              }
                            })()}
                          </div>
                        </td>
                        <td><span className={u.is_active ? 'badge-green' : 'badge-red'}>{u.is_active ? 'Active' : 'Inactive'}</span></td>
                        <td>
                          <div className="flex gap-2">
                            <button
                              onClick={() => toggleUser(u.id, !u.is_active)}
                              className="btn-sm btn-secondary"
                            >
                              {u.is_active ? 'Deactivate' : 'Activate'}
                            </button>
                            {u.id !== useAuthStore.getState().user?.id && (
                              <button
                                onClick={async () => {
                                  if (u.role === 'cashier') {
                                    if (window.confirm(`Are you sure you want to delete cashier "${u.username}"?`)) {
                                      setUserToDelete(u);
                                      // Trigger delete directly for cashiers
                                      // We'll use a small timeout to let the state update
                                      setTimeout(() => {
                                        const btn = document.getElementById('hidden-delete-trigger');
                                        if (btn) btn.click();
                                      }, 0);
                                    }
                                  } else {
                                    setUserToDelete(u);
                                    setShowDeleteModal(true);
                                  }
                                }}
                                className="btn-sm btn-secondary text-red-500 hover:bg-red-50 border-red-100"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {showAddUser && (
                <>
                  <div className="overlay" onClick={() => setShowAddUser(false)} />
                  <div className="dialog w-80">
                    <h2 className="font-semibold text-slate-800 mb-4">{t('settings.addUser')}</h2>
                    <div className="space-y-3">
                      <div>
                        <label className="label">Username</label>
                        <input value={newUsername} onChange={(e) => setNewUsername(e.target.value)} className="input" autoFocus />
                      </div>
                      <div>
                        <label className="label">Password</label>
                        <input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} className="input" />
                      </div>
                      <div>
                        <select value={newRole} onChange={(e) => {
                          setNewRole(e.target.value);
                          if (e.target.value === 'admin') setSelectedPerms(permissionModules.map(m => m.id));
                        }} className="input">
                          <option value="cashier">{t('settings.cashier')}</option>
                          <option value="admin">{t('settings.admin')}</option>
                        </select>
                      </div>

                      <div>
                        <label className="label">Permissions / Access</label>
                        <div className="grid grid-cols-2 gap-2 mt-2 max-h-[200px] overflow-y-auto p-2 border border-slate-100 rounded-lg">
                          {permissionModules.map(m => (
                            <label key={m.id} className="flex items-center gap-2 cursor-pointer hover:bg-slate-50 p-1 rounded transition-colors">
                              <input 
                                type="checkbox" 
                                checked={selectedPerms.includes(m.id)} 
                                onChange={(e) => {
                                  if (e.target.checked) setSelectedPerms([...selectedPerms, m.id]);
                                  else setSelectedPerms(selectedPerms.filter(p => p !== m.id));
                                }}
                                className="rounded text-brand-600"
                              />
                              <span className="text-xs text-slate-600">{m.label}</span>
                            </label>
                          ))}
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <button onClick={addUser} className="btn-primary flex-1">Create</button>
                        <button onClick={() => setShowAddUser(false)} className="btn-secondary flex-1">Cancel</button>
                      </div>
                    </div>
                  </div>
                </>
              )}
            </div>
          )}

          {/* Hardware */}
          {tab === 'hardware' && (
            <div className="space-y-6 max-w-4xl">
              <div className="flex items-center justify-between bg-white p-4 rounded-2xl border border-slate-100 shadow-sm">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center text-slate-500">
                    <Activity className="w-5 h-5" />
                  </div>
                  <div>
                    <h2 className="font-bold text-slate-800">Hardware Manager</h2>
                    <p className="text-xs text-slate-500">Configure and test your POS peripherals</p>
                  </div>
                </div>
                <button 
                  onClick={detectPrinters} 
                  disabled={detecting}
                  className="btn-secondary group"
                >
                  <RefreshCw className={`w-4 h-4 ${detecting ? 'animate-spin' : 'group-hover:rotate-180 transition-transform duration-500'}`} />
                  {detecting ? 'Scanning...' : 'Detect Devices'}
                </button>
              </div>

              {/* Detected Scanners (Quick Info) */}
              {detectedPrinters.filter(p => p.printer_type === 'usb_hid').length > 0 && (
                <div className="relative overflow-hidden bg-gradient-to-br from-indigo-500 to-brand-600 p-5 rounded-3xl shadow-lg shadow-indigo-200">
                  <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full -mr-16 -mt-16 blur-2xl" />
                  <div className="relative flex items-center justify-between">
                    <div className="space-y-1">
                      <p className="text-[10px] font-bold text-indigo-100 uppercase tracking-[0.2em]">Hardware Active</p>
                      <h3 className="text-lg font-bold text-white">Barcode Scanners Detected</h3>
                    </div>
                    <div className="flex -space-x-2">
                      {detectedPrinters.filter(p => p.printer_type === 'usb_hid').map((_, i) => (
                        <div key={i} className="w-8 h-8 rounded-full bg-white/20 border-2 border-indigo-400 flex items-center justify-center backdrop-blur-md">
                          <Usb className="w-4 h-4 text-white" />
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="mt-4 flex flex-wrap gap-2">
                    {detectedPrinters.filter(p => p.printer_type === 'usb_hid').map((p, i) => (
                      <div key={i} className="flex items-center gap-2 bg-white/10 px-3 py-1.5 rounded-xl border border-white/20 backdrop-blur-sm">
                        <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse shadow-[0_0_8px_rgba(74,222,128,0.8)]"></div>
                        <span className="text-xs font-semibold text-white">{p.model_guess}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* RECEIPT PRINTER SECTION */}
                <div className="card overflow-hidden border-none shadow-xl shadow-slate-200/50">
                  <div className="p-1 bg-gradient-to-r from-brand-400 to-indigo-500" />
                  <div className="p-6 space-y-6">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="p-2.5 bg-brand-50 text-brand-600 rounded-xl">
                          <Printer className="w-5 h-5" />
                        </div>
                        <h3 className="font-bold text-slate-800">Receipt Printer</h3>
                      </div>
                      {printerType !== 'none' && (
                        <span className="px-2 py-0.5 text-[10px] font-bold bg-green-50 text-green-600 rounded-full border border-green-100 uppercase tracking-wider">Ready</span>
                      )}
                    </div>

                    <div className="space-y-5">
                      <div>
                        <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-3 block">Connection Architecture</label>
                        <div className="grid grid-cols-2 gap-2">
                          {[
                            { id: 'system', label: 'System', icon: <Activity className="w-4 h-4" />, sub: 'Windows Spooler' },
                            { id: 'usb', label: 'USB', icon: <Usb className="w-4 h-4" />, sub: 'Direct Driverless' },
                            { id: 'network', label: 'Network', icon: <Network className="w-4 h-4" />, sub: 'TCP/IP Port' },
                            { id: 'none', label: 'Disable', icon: <Unplug className="w-4 h-4" />, sub: 'No Printer' }
                          ].map((t) => (
                            <div 
                              key={t.id}
                              onClick={() => setPrinterType(t.id)}
                              className={`p-3 rounded-2xl border-2 cursor-pointer transition-all ${
                                printerType === t.id 
                                  ? 'border-brand-500 bg-brand-50/50' 
                                  : 'border-slate-100 bg-slate-50/50 hover:border-slate-200 hover:bg-white'
                              }`}
                            >
                              <div className={`mb-2 ${printerType === t.id ? 'text-brand-600' : 'text-slate-400'}`}>
                                {t.icon}
                              </div>
                              <p className={`text-xs font-bold ${printerType === t.id ? 'text-brand-700' : 'text-slate-700'}`}>{t.label}</p>
                              <p className="text-[10px] text-slate-400 font-medium">{t.sub}</p>
                            </div>
                          ))}
                        </div>
                      </div>

                      {printerType !== 'none' && (
                        <div className="space-y-4 animate-in fade-in slide-in-from-top-2 duration-300">
                          <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100">
                            <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2 block">Device Selection</label>
                            {printerType === 'system' ? (
                              <select 
                                value={printerPort} 
                                onChange={(e) => setPrinterPort(e.target.value)} 
                                className="input bg-white font-medium"
                              >
                                <option value="">Choose a printer...</option>
                                {detectedPrinters.filter(p => p.printer_type === 'system').map(p => (
                                  <option key={p.port} value={p.port}>{p.name}</option>
                                ))}
                              </select>
                            ) : (
                              <div className="relative">
                                <input 
                                  value={printerPort} 
                                  onChange={(e) => setPrinterPort(e.target.value)} 
                                  className="input bg-white pr-10 font-mono text-sm" 
                                  list="usb-serial-printers"
                                  placeholder={printerType === 'usb' ? "usb:0a5f:000a" : "192.168.1.100"} 
                                />
                                <div className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-300">
                                  {printerType === 'usb' ? <Usb className="w-4 h-4" /> : <Network className="w-4 h-4" />}
                                </div>
                                <datalist id="usb-serial-printers">
                                  {detectedPrinters.filter(p => p.printer_type === 'usb' || p.printer_type === 'serial').map(p => (
                                    <option key={p.port} value={p.port}>{p.name}</option>
                                  ))}
                                </datalist>
                              </div>
                            )}
                          </div>
                          
                          <button onClick={testPrint} className="w-full py-3 bg-white border-2 border-slate-200 rounded-2xl text-slate-700 text-xs font-bold flex items-center justify-center gap-2 hover:bg-slate-50 hover:border-slate-300 transition-all shadow-sm">
                            <Printer className="w-4 h-4 text-brand-500" /> Test Receipt Print
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* LABEL PRINTER SECTION */}
                <div className="card overflow-hidden border-none shadow-xl shadow-slate-200/50">
                  <div className="p-1 bg-gradient-to-r from-orange-400 to-amber-500" />
                  <div className="p-6 space-y-6">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="p-2.5 bg-orange-50 text-orange-600 rounded-xl">
                          <Tag className="w-5 h-5" />
                        </div>
                        <h3 className="font-bold text-slate-800">Label Printer</h3>
                      </div>
                      {settings.label_printer_port && (
                        <span className="px-2 py-0.5 text-[10px] font-bold bg-orange-50 text-orange-600 rounded-full border border-orange-100 uppercase tracking-wider">Configured</span>
                      )}
                    </div>

                    <div className="space-y-5">
                      <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100 space-y-4">
                        <div>
                          <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2 block">Device Port</label>
                          <select 
                            value={settings.label_printer_port} 
                            onChange={(e) => settings.setSettings({ label_printer_port: e.target.value })} 
                            className="input bg-white font-medium"
                          >
                            <option value="">Manual / Use Receipt Printer</option>
                            {detectedPrinters.filter(p => p.printer_type === 'system').map(p => (
                              <option key={p.port} value={p.port}>{p.name}</option>
                            ))}
                            <optgroup label="Direct Ports">
                              {detectedPrinters.filter(p => p.printer_type === 'usb' || p.printer_type === 'serial').map(p => (
                                <option key={p.port} value={p.port}>{p.name} ({p.port})</option>
                              ))}
                            </optgroup>
                          </select>
                        </div>

                        <div>
                          <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2 block">Control Protocol</label>
                          <div className="grid grid-cols-1 gap-2">
                            {[
                              { id: 'zpl', label: 'ZPL II', desc: 'Modern Zebra, GK, ZT series' },
                              { id: 'tspl', label: 'TSPL', desc: 'Xprinter, TSC, Generic Chinese' },
                              { id: 'epl', label: 'EPL2', desc: 'Legacy Zebra, Eltron' }
                            ].map((proto) => (
                              <div 
                                key={proto.id}
                                onClick={() => settings.setSettings({ label_printer_protocol: proto.id as any })}
                                className={`flex items-center justify-between p-3 rounded-xl border-2 cursor-pointer transition-all ${
                                  settings.label_printer_protocol === proto.id 
                                    ? 'border-orange-500 bg-orange-50/50' 
                                    : 'border-white bg-white hover:border-slate-200'
                                }`}
                              >
                                <div>
                                  <p className={`text-xs font-bold ${settings.label_printer_protocol === proto.id ? 'text-orange-700' : 'text-slate-700'}`}>{proto.label}</p>
                                  <p className="text-[10px] text-slate-400">{proto.desc}</p>
                                </div>
                                {settings.label_printer_protocol === proto.id && (
                                  <div className="w-5 h-5 bg-orange-500 rounded-full flex items-center justify-center">
                                    <Check className="w-3 h-3 text-white" />
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                      
                      <p className="text-[10px] text-slate-400 italic bg-blue-50/50 p-3 rounded-xl border border-blue-100/50 leading-relaxed">
                        <Activity className="w-3 h-3 inline mr-1 text-blue-500" />
                        Tip: If the printer prints blank or ignores commands, try switching between ZPL and TSPL.
                      </p>

                      <button onClick={testLabelPrint} className="w-full py-3 bg-white border-2 border-slate-200 rounded-2xl text-slate-700 text-xs font-bold flex items-center justify-center gap-2 hover:bg-slate-50 hover:border-slate-300 transition-all shadow-sm">
                        <Tag className="w-4 h-4 text-orange-500" /> Test Barcode Print
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex justify-end pt-4">
                <button 
                  onClick={() => {
                    settings.setSettings({
                      printer_type: printerType,
                      printer_port: printerPort,
                      printer_baud: parseInt(printerBaud) || 9600,
                      label_printer_port: settings.label_printer_port,
                      label_printer_protocol: settings.label_printer_protocol,
                    });
                    toast(`Hardware configuration synced and saved!`, 'success');
                  }} 
                  className="btn-primary px-10 h-12 shadow-lg shadow-brand-200 rounded-2xl"
                >
                  <Save className="w-5 h-5" /> Commit Hardware Settings
                </button>
              </div>
            </div>
          ) }

          {/* Integrations Tab */}
          {tab === 'integrations' && (
            <div className="space-y-6">
              {integrationView === 'list' && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-4xl">
                  {/* Shopify Card */}
                  <div 
                    onClick={() => setIntegrationView('shopify')}
                    className="group relative overflow-hidden bg-white rounded-3xl border border-slate-200 p-8 cursor-pointer transition-all hover:border-green-300 hover:shadow-2xl hover:shadow-green-100/50"
                  >
                    <div className="absolute top-0 right-0 w-32 h-32 bg-green-50 rounded-full -mr-16 -mt-16 transition-transform group-hover:scale-110" />
                    <div className="relative">
                      <div className="w-16 h-16 mb-6 rounded-2xl bg-white shadow-lg flex items-center justify-center border border-slate-100">
                        <svg className="w-10 h-10" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                          <path d="M18.8 6.5C18.8 6.5 16.4 4.5 13.9 4.1C13.9 4.1 13.1 3.5 11.9 3.5C10.7 3.5 10 4.1 10 4.1C7.5 4.5 5.1 6.5 5.1 6.5C4.1 7.4 3.7 8.6 3.7 9.8L5.2 19.3C5.3 20.2 6.1 20.8 7 20.8H16.9C17.8 20.8 18.6 20.2 18.7 19.3L20.2 9.8C20.2 8.6 19.8 7.4 18.8 6.5Z" fill="#95BF47"/>
                          <path d="M12 3.5C13.2 3.5 14 4.1 14 4.1C16.5 4.5 18.9 6.5 18.9 6.5C19.9 7.4 20.3 8.6 20.3 9.8L18.8 19.3C18.7 20.2 17.9 20.8 17 20.8H12V3.5Z" fill="#5E8E3E"/>
                        </svg>
                      </div>
                      <h3 className="text-xl font-bold text-slate-800 mb-2">Shopify</h3>
                      <p className="text-sm text-slate-500 mb-6 leading-relaxed">
                        Sync your products, inventory, and orders with your Shopify online store automatically.
                      </p>
                      <div className="flex items-center gap-2 text-green-600 font-bold text-xs uppercase tracking-wider">
                        Configure Connection <Plus className="w-3 h-3" />
                      </div>
                    </div>
                  </div>

                  {/* Google Cloud Card */}
                  <div 
                    onClick={() => setIntegrationView('google')}
                    className="group relative overflow-hidden bg-white rounded-3xl border border-slate-200 p-8 cursor-pointer transition-all hover:border-blue-300 hover:shadow-2xl hover:shadow-blue-100/50"
                  >
                    <div className="absolute top-0 right-0 w-32 h-32 bg-blue-50 rounded-full -mr-16 -mt-16 transition-transform group-hover:scale-110" />
                    <div className="relative">
                      <div className="w-16 h-16 mb-6 rounded-2xl bg-white shadow-lg flex items-center justify-center border border-slate-100">
                        <svg className="w-10 h-10" viewBox="0 0 24 24">
                          <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
                          <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                          <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                          <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                        </svg>
                      </div>
                      <h3 className="text-xl font-bold text-slate-800 mb-2">Google Cloud</h3>
                      <p className="text-sm text-slate-500 mb-6 leading-relaxed">
                        Securely backup your entire database to Google Drive and restore it from anywhere in the world.
                      </p>
                      <div className="flex items-center gap-2 text-blue-600 font-bold text-xs uppercase tracking-wider">
                        Configure Connection <Plus className="w-3 h-3" />
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Shopify Inner View */}
              {integrationView === 'shopify' && (
                <div className="animate-in fade-in slide-in-from-bottom-4 duration-300">
                  <div className="space-y-6 max-w-2xl">
                    {/* Connection Config */}
                    <div className="card p-6 space-y-5">
                      <div className="flex items-center gap-3 border-b border-slate-100 pb-4">
                        <div className="p-2 bg-green-50 text-green-600 rounded-lg">
                          <ShoppingBag className="w-5 h-5" />
                        </div>
                        <div>
                          <h2 className="font-semibold text-slate-800">Shopify Store Connection</h2>
                          <p className="text-sm text-slate-500">Connect your POS to Shopify Admin API</p>
                        </div>
                      </div>

                      <div className="space-y-4">
                        <div>
                          <label className="label">Store Domain</label>
                          <p className="text-[11px] text-slate-400 mb-1">e.g. mystore.myshopify.com (without https://)</p>
                          <input
                            value={shopifyDomain}
                            onChange={(e) => setShopifyDomain(e.target.value)}
                            className="input"
                            placeholder="yourstore.myshopify.com"
                          />
                        </div>

                        <div>
                          <label className="label">Admin API Access Token</label>
                          <p className="text-[11px] text-slate-400 mb-1">
                            For legacy Custom Apps (starts with shpat_). Leave blank if using Dev Dashboard.
                          </p>
                          <div className="relative">
                            <input
                              type={showToken ? 'text' : 'password'}
                              value={shopifyToken}
                              onChange={(e) => setShopifyToken(e.target.value)}
                              className="input pr-10"
                              placeholder="shpat_xxxxxxxxxxxxxxxxxxxxx"
                            />
                            <button
                              type="button"
                              onClick={() => setShowToken(!showToken)}
                              className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-600"
                            >
                              {showToken ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                            </button>
                          </div>
                        </div>

                        <div className="relative flex items-center py-2">
                          <div className="flex-grow border-t border-slate-200"></div>
                          <span className="flex-shrink-0 mx-4 text-xs font-medium text-slate-400 uppercase tracking-wider">OR (Dev Dashboard)</span>
                          <div className="flex-grow border-t border-slate-200"></div>
                        </div>

                        <div>
                          <label className="label">Client ID</label>
                          <p className="text-[11px] text-slate-400 mb-1">From Shopify Dev Dashboard (Partners)</p>
                          <input
                            value={shopifyClientId}
                            onChange={(e) => setShopifyClientId(e.target.value)}
                            className="input"
                            placeholder="e.g. 221236935fc603525b19ce7c78911359"
                          />
                        </div>

                        <div>
                          <label className="label">Client Secret</label>
                          <p className="text-[11px] text-slate-400 mb-1">From Shopify Dev Dashboard (Starts with shpss_)</p>
                          <div className="relative">
                            <input
                              type={showSecret ? 'text' : 'password'}
                              value={shopifySecret}
                              onChange={(e) => setShopifySecret(e.target.value)}
                              className="input pr-10"
                              placeholder="shpss_xxxxxxxxxxxxxxxxxxxxx"
                            />
                            <button
                              type="button"
                              onClick={() => setShowSecret(!showSecret)}
                              className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-600"
                            >
                              {showSecret ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                            </button>
                          </div>
                        </div>

                        <div className="flex gap-3">
                          <button
                            onClick={async () => {
                              setShopifySaving(true);
                              try {
                                await cmd('set_many_settings', {
                                  map: {
                                    shopify_domain: shopifyDomain,
                                    shopify_token: shopifyToken,
                                    shopify_client_id: shopifyClientId,
                                    shopify_client_secret: shopifySecret,
                                    shopify_location_id: shopifyLocationId,
                                    shopify_auto_sync: shopifyAutoSync ? '1' : '0',
                                    shopify_auto_sync_products: shopifyAutoSyncProducts ? '1' : '0',
                                  }
                                });
                                toast('Shopify settings saved!', 'success');
                              } catch (e: any) {
                                toast(e.toString(), 'error');
                              } finally {
                                setShopifySaving(false);
                              }
                            }}
                            disabled={shopifySaving}
                            className="btn-primary"
                          >
                            <Save className="w-4 h-4" />
                            {shopifySaving ? 'Saving...' : 'Save Settings'}
                          </button>

                          <button
                            onClick={async () => {
                              setShopifyTesting(true);
                              setShopifyTestResult(null);
                              try {
                                // Save first
                                await cmd('set_many_settings', {
                                  map: { 
                                    shopify_domain: shopifyDomain, 
                                    shopify_token: shopifyToken,
                                    shopify_client_id: shopifyClientId,
                                    shopify_client_secret: shopifySecret
                                  }
                                });
                                const result = await cmd('shopify_test_connection');
                                setShopifyTestResult({ success: true, data: result });
                                toast('Connected to Shopify!', 'success');

                                // Fetch locations
                                try {
                                  const locs = await cmd<any[]>('shopify_get_locations');
                                  setShopifyLocations(locs || []);
                                } catch (e) {
                                  console.warn('Failed to fetch locations:', e);
                                }
                              } catch (e: any) {
                                setShopifyTestResult({ success: false, error: e.toString() });
                                toast('Connection failed: ' + e.toString(), 'error');
                              } finally {
                                setShopifyTesting(false);
                              }
                            }}
                            disabled={shopifyTesting || !shopifyDomain || (!shopifyToken && (!shopifyClientId || !shopifySecret))}
                            className="btn-secondary"
                          >
                            {shopifyTesting ? (
                              <RefreshCw className="w-4 h-4 animate-spin" />
                            ) : (
                              <Wifi className="w-4 h-4" />
                            )}
                            Test Connection
                          </button>
                        </div>

                        {/* Connection Test Result */}
                        {shopifyTestResult && (
                          <div className={`p-4 rounded-xl border ${
                            shopifyTestResult.success
                              ? 'bg-green-50 border-green-200'
                              : 'bg-red-50 border-red-200'
                          }`}>
                            {shopifyTestResult.success ? (
                              <div className="space-y-2">
                                <div className="flex items-center gap-2 text-green-700 font-semibold text-sm">
                                  <Wifi className="w-4 h-4" />
                                  Connected Successfully!
                                </div>
                                <div className="grid grid-cols-2 gap-2 text-xs text-green-800">
                                  <div><span className="font-bold">Store:</span> {shopifyTestResult.data?.name}</div>
                                  <div><span className="font-bold">Domain:</span> {shopifyTestResult.data?.domain}</div>
                                  <div><span className="font-bold">Plan:</span> {shopifyTestResult.data?.plan}</div>
                                  <div><span className="font-bold">Currency:</span> {shopifyTestResult.data?.currency}</div>
                                </div>
                              </div>
                            ) : (
                              <div className="flex items-center gap-2 text-red-700 text-sm">
                                <WifiOff className="w-4 h-4" />
                                <span className="font-semibold">Connection Failed:</span>
                                <span className="text-red-600 text-xs">{shopifyTestResult.error}</span>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Location Selection */}
                    <div className="card p-6 space-y-4">
                      <h3 className="font-semibold text-slate-700 flex items-center gap-2">
                        <Store className="w-4 h-4 text-blue-500" />
                        Inventory Location
                      </h3>
                      <p className="text-xs text-slate-500">
                        Select which Shopify location to use for inventory tracking. This is required for inventory sync.
                      </p>
                      <select
                        value={shopifyLocationId}
                        onChange={(e) => setShopifyLocationId(e.target.value)}
                        className="input"
                      >
                        <option value="">Select a location...</option>
                        {shopifyLocations.map((loc: any) => (
                          <option key={loc.id} value={String(loc.id)}>
                            {loc.name} {loc.active ? '(Active)' : '(Inactive)'}
                          </option>
                        ))}
                      </select>
                      {shopifyLocations.length === 0 && (
                        <p className="text-[11px] text-amber-600 italic">
                          Test connection first to load available locations.
                        </p>
                      )}

                      {/* Auto-sync Toggle */}
                      <div className="flex flex-col gap-3">
                        <div className="flex items-center justify-between p-3 bg-slate-50 rounded-xl border border-slate-100">
                          <div>
                            <p className="text-sm font-medium text-slate-700">Auto-sync on sale & inventory</p>
                            <p className="text-[11px] text-slate-400">Automatically push changes to Shopify in the background</p>
                          </div>
                          <label className="relative inline-flex items-center cursor-pointer">
                            <input
                              type="checkbox"
                              checked={shopifyAutoSync}
                              onChange={(e) => setShopifyAutoSync(e.target.checked)}
                              className="sr-only peer"
                            />
                            <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-green-500"></div>
                          </label>
                        </div>

                        <div className="flex items-center justify-between p-3 bg-slate-50 rounded-xl border border-slate-100">
                          <div>
                            <p className="text-sm font-medium text-slate-700">Auto-sync products</p>
                            <p className="text-[11px] text-slate-400">Automatically create/update products on Shopify when saved</p>
                          </div>
                          <label className="relative inline-flex items-center cursor-pointer">
                            <input
                              type="checkbox"
                              checked={shopifyAutoSyncProducts}
                              onChange={(e) => setShopifyAutoSyncProducts(e.target.checked)}
                              className="sr-only peer"
                            />
                            <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-green-500"></div>
                          </label>
                        </div>
                      </div>
                    </div>

                    {/* Sync Queue Dashboard */}
                    <div className="card p-6 space-y-4">
                      <div className="flex items-center justify-between">
                        <h3 className="font-semibold text-slate-700 flex items-center gap-2">
                          <RotateCw className="w-4 h-4 text-orange-500" />
                          Sync Queue
                        </h3>
                        <div className="flex gap-2">
                          <button
                            onClick={async () => {
                              try {
                                const stats = await cmd('shopify_get_queue_stats');
                                setShopifyQueueStats(stats);
                                const pending = await cmd<any[]>('shopify_get_pending_syncs');
                                setShopifyPending(pending || []);
                              } catch (e: any) {
                                toast(e.toString(), 'error');
                              }
                            }}
                            className="btn-secondary btn-sm"
                          >
                            <RefreshCw className="w-3.5 h-3.5" />
                            Refresh
                          </button>
                          <button
                            onClick={async () => {
                              setShopifyRetrying(true);
                              try {
                                const result = await cmd<string>('shopify_retry_pending');
                                toast(result, 'success');
                                // Refresh stats
                                const stats = await cmd('shopify_get_queue_stats');
                                setShopifyQueueStats(stats);
                                const pending = await cmd<any[]>('shopify_get_pending_syncs');
                                setShopifyPending(pending || []);
                              } catch (e: any) {
                                toast(e.toString(), 'error');
                              } finally {
                                setShopifyRetrying(false);
                              }
                            }}
                            disabled={shopifyRetrying}
                            className="btn-primary btn-sm"
                          >
                            {shopifyRetrying ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <RotateCw className="w-3.5 h-3.5" />}
                            Retry All
                          </button>
                        </div>
                      </div>

                      {shopifyQueueStats && (
                        <div className="grid grid-cols-3 gap-3">
                          <div className="p-3 bg-amber-50 border border-amber-100 rounded-xl text-center">
                            <p className="text-2xl font-bold text-amber-700">{shopifyQueueStats.pending}</p>
                            <p className="text-[10px] font-bold text-amber-500 uppercase tracking-wider">Pending</p>
                          </div>
                          <div className="p-3 bg-red-50 border border-red-100 rounded-xl text-center">
                            <p className="text-2xl font-bold text-red-700">{shopifyQueueStats.failed}</p>
                            <p className="text-[10px] font-bold text-red-500 uppercase tracking-wider">Failed</p>
                          </div>
                          <div className="p-3 bg-green-50 border border-green-100 rounded-xl text-center">
                            <p className="text-2xl font-bold text-green-700">{shopifyQueueStats.done}</p>
                            <p className="text-[10px] font-bold text-green-500 uppercase tracking-wider">Done</p>
                          </div>
                        </div>
                      )}

                      {shopifyPending.length > 0 && (
                        <div className="space-y-2">
                          <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider">Pending / Failed Items</h4>
                          <div className="max-h-48 overflow-y-auto space-y-1.5">
                            {shopifyPending.map((item: any) => (
                              <div key={item.id} className="flex items-center justify-between p-2.5 bg-slate-50 rounded-lg border border-slate-100 text-xs">
                                <div className="flex items-center gap-2">
                                  <span className={`w-2 h-2 rounded-full ${
                                    item.status === 'pending' ? 'bg-amber-400' : 'bg-red-400'
                                  }`} />
                                  <span className="font-mono font-bold text-slate-600">{item.action_type}</span>
                                </div>
                                <div className="flex items-center gap-3">
                                  <span className="text-slate-400">Retries: {item.retry_count}</span>
                                  {item.error_message && (
                                    <span className="text-red-500 max-w-[200px] truncate" title={item.error_message}>
                                      <AlertTriangle className="w-3 h-3 inline mr-1" />
                                      {item.error_message}
                                    </span>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {shopifyPending.length === 0 && shopifyQueueStats && (
                        <p className="text-sm text-slate-400 text-center py-4 italic">No pending sync operations</p>
                      )}
                    </div>

                    {/* Help Section */}
                    <div className="card p-6 bg-blue-50/50 border-blue-100">
                      <h3 className="font-semibold text-blue-800 text-sm mb-3">Setup Guide</h3>
                      <ol className="text-xs text-blue-700 space-y-2 list-decimal list-inside">
                        <li>Go to your Shopify Admin → Settings → Apps and sales channels → Develop apps</li>
                        <li>Create a new custom app and configure Admin API scopes: <span className="font-mono bg-blue-100 px-1 rounded">write_products</span>, <span className="font-mono bg-blue-100 px-1 rounded">write_inventory</span>, <span className="font-mono bg-blue-100 px-1 rounded">write_orders</span>, <span className="font-mono bg-blue-100 px-1 rounded">read_locations</span></li>
                        <li>Install the app and copy the Admin API access token (starts with shpat_)</li>
                        <li>Paste the token above and test the connection</li>
                        <li>Select your primary inventory location</li>
                        <li>Enable auto-sync to automatically push sales and inventory changes</li>
                      </ol>
                    </div>
                  </div>
                </div>
              )}

              {/* Google Cloud Inner View */}
              {integrationView === 'google' && (
                <div className="animate-in fade-in slide-in-from-bottom-4 duration-300">
                  <div className="space-y-6 max-w-2xl">

                    {/* Google Account Connection */}
                    <div className="card p-6">
                      <div className="flex items-center gap-3 border-b border-slate-100 pb-4 mb-5">
                        <div className="p-2 bg-blue-50 text-blue-600 rounded-lg">
                          <Cloud className="w-5 h-5" />
                        </div>
                        <div>
                          <h2 className="font-semibold text-slate-800">Google Drive Cloud Backup</h2>
                          <p className="text-sm text-slate-500">Connect your Gmail to automatically backup your database</p>
                        </div>
                      </div>

                      {!cloudAccount ? (
                        <div className="text-center py-8">
                          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-gradient-to-br from-blue-100 to-indigo-100 flex items-center justify-center">
                            <Mail className="w-8 h-8 text-blue-600" />
                          </div>
                          <h3 className="font-semibold text-slate-700 mb-1">Connect Your Google Account</h3>
                          <p className="text-sm text-slate-500 mb-6 max-w-sm mx-auto">
                            Link your Gmail to enable automatic cloud backups. Only backup files will be stored — we won't access anything else.
                          </p>
                          <button
                            onClick={connectGmail}
                            disabled={cloudConnecting}
                            className="inline-flex items-center gap-2 px-6 py-2.5 bg-white border-2 border-slate-200 rounded-xl font-medium text-sm text-slate-700 hover:border-blue-300 hover:bg-blue-50 transition-all shadow-sm"
                          >
                            {cloudConnecting ? (
                              <><span className="w-4 h-4 border-2 border-blue-300 border-t-blue-600 rounded-full animate-spin" /> Connecting...</>
                            ) : (
                              <><svg className="w-5 h-5" viewBox="0 0 24 24"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/></svg> Sign in with Google</>
                            )}
                          </button>
                        </div>
                      ) : (
                        <div className="space-y-5">
                          {/* Connected Account Info */}
                          <div className="flex items-center justify-between p-4 bg-gradient-to-r from-green-50 to-emerald-50 rounded-xl border border-green-100">
                            <div className="flex items-center gap-3">
                              {cloudAccount.picture ? (
                                <img src={cloudAccount.picture} alt="" className="w-10 h-10 rounded-full border-2 border-white shadow-sm" />
                              ) : (
                                <div className="w-10 h-10 rounded-full bg-green-200 flex items-center justify-center text-green-700 font-bold text-sm">
                                  {cloudAccount.name?.charAt(0) || cloudAccount.email?.charAt(0) || '?'}
                                </div>
                              )}
                              <div>
                                <p className="font-medium text-slate-700 text-sm">{cloudAccount.name}</p>
                                <p className="text-xs text-slate-500">{cloudAccount.email}</p>
                              </div>
                              <span className="ml-2 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider bg-green-100 text-green-700 rounded-full">Connected</span>
                            </div>
                            <button onClick={disconnectGmail} className="text-xs text-red-500 hover:text-red-700 hover:underline flex items-center gap-1">
                              <Unplug className="w-3.5 h-3.5" /> Disconnect
                            </button>
                          </div>

                          {/* Storage Usage */}
                          {cloudStorage && cloudStorage.limit > 0 && (
                            <div className="p-4 bg-slate-50 rounded-xl border border-slate-100">
                              <div className="flex items-center justify-between mb-2">
                                <span className="text-xs font-semibold text-slate-500 flex items-center gap-1.5">
                                  <HardDrive className="w-3.5 h-3.5" /> Google Drive Storage
                                </span>
                                <span className="text-xs text-slate-500">
                                  {formatBytes(cloudStorage.usage)} / {formatBytes(cloudStorage.limit)}
                                </span>
                              </div>
                              <div className="w-full bg-slate-200 rounded-full h-2">
                                <div
                                  className={`h-2 rounded-full transition-all ${
                                    (cloudStorage.usage / cloudStorage.limit) > 0.9 ? 'bg-red-500' :
                                    (cloudStorage.usage / cloudStorage.limit) > 0.7 ? 'bg-amber-500' : 'bg-blue-500'
                                  }`}
                                  style={{ width: `${Math.min(100, (cloudStorage.usage / cloudStorage.limit) * 100)}%` }}
                                />
                              </div>
                              <p className="text-[11px] text-slate-400 mt-1">
                                {formatBytes(cloudStorage.limit - cloudStorage.usage)} free
                              </p>
                            </div>
                          )}

                          {/* Backup Controls Row */}
                          <div className="grid grid-cols-2 gap-4">
                            {/* Backup Interval */}
                            <div className="p-4 bg-slate-50 rounded-xl border border-slate-100">
                              <label className="text-xs font-semibold text-slate-500 flex items-center gap-1.5 mb-2">
                                <Timer className="w-3.5 h-3.5" /> Auto Backup Interval
                              </label>
                              <select
                                value={cloudInterval}
                                onChange={(e) => changeInterval(parseInt(e.target.value))}
                                className="input bg-white text-sm"
                              >
                                <option value={2}>Every 2 hours</option>
                                <option value={6}>Every 6 hours</option>
                                <option value={12}>Every 12 hours</option>
                                <option value={24}>Every 24 hours</option>
                              </select>
                            </div>

                            {/* Last Backup */}
                            <div className="p-4 bg-slate-50 rounded-xl border border-slate-100">
                              <label className="text-xs font-semibold text-slate-500 flex items-center gap-1.5 mb-2">
                                <Clock className="w-3.5 h-3.5" /> Last Backup
                              </label>
                              <p className="text-sm font-medium text-slate-700">
                                {cloudLastBackup
                                  ? new Date(cloudLastBackup * 1000).toLocaleString('en-PK')
                                  : 'No backup yet'}
                              </p>
                              {cloudQueueCount > 0 && (
                                <p className="text-[10px] text-amber-600 mt-1 flex items-center gap-1">
                                  <AlertTriangle className="w-3 h-3" /> {cloudQueueCount} backup(s) queued (offline)
                                </p>
                              )}
                            </div>
                          </div>

                          {/* Action Buttons */}
                          <div className="flex gap-3">
                            <button
                              onClick={triggerManualBackup}
                              disabled={cloudBackingUp}
                              className="btn-primary flex-1"
                            >
                              {cloudBackingUp ? (
                                <><span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Backing up...</>
                              ) : (
                                <><CloudUpload className="w-4 h-4" /> Backup Now</>
                              )}
                            </button>
                            <button
                              onClick={restoreFromCloud}
                              disabled={cloudRestoring || cloudBackups.length === 0}
                              className="btn-secondary flex-1"
                            >
                              {cloudRestoring ? (
                                <><span className="w-4 h-4 border-2 border-slate-300 border-t-slate-600 rounded-full animate-spin" /> Restoring...</>
                              ) : (
                                <><CloudDownload className="w-4 h-4" /> Restore Latest</>
                              )}
                            </button>
                            <button onClick={exportDb} className="btn-secondary" title="Export database to local file">
                              <Database className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Backup History */}
                    {cloudAccount && (
                      <div className="card p-6">
                        <div className="flex items-center justify-between mb-4">
                          <h3 className="font-semibold text-slate-700 flex items-center gap-2">
                            <History className="w-4 h-4 text-slate-400" /> Backup History
                          </h3>
                          <button onClick={loadCloudData} className="btn-sm btn-secondary">
                            <RefreshCw className="w-3.5 h-3.5" /> Refresh
                          </button>
                        </div>

                        {cloudLoadingBackups ? (
                          <div className="flex items-center justify-center py-8">
                            <span className="w-6 h-6 border-2 border-slate-200 border-t-brand-500 rounded-full animate-spin" />
                          </div>
                        ) : cloudBackups.length === 0 ? (
                          <div className="text-center py-8 text-slate-400">
                            <CloudUpload className="w-10 h-10 mx-auto mb-2 opacity-40" />
                            <p className="text-sm">No backups yet. Click "Backup Now" to create your first backup.</p>
                          </div>
                        ) : (
                          <div className="table-container max-h-[320px] overflow-y-auto">
                            <table className="table">
                              <thead>
                                <tr>
                                  <th>File Name</th>
                                  <th>Size</th>
                                  <th>Date</th>
                                </tr>
                              </thead>
                              <tbody>
                                {cloudBackups.map((b) => (
                                  <tr key={b.id}>
                                    <td className="font-mono text-xs">{b.name}</td>
                                    <td className="text-xs text-slate-500">{formatBytes(parseInt(b.size || '0'))}</td>
                                    <td className="text-xs text-slate-500">
                                      {b.created_time ? new Date(b.created_time).toLocaleString('en-PK') : '-'}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}

                        <p className="text-[11px] text-slate-400 mt-3">
                          Maximum 30 backups are kept. Older backups are automatically deleted.
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
      {/* Delete User Modal */}
      {showDeleteModal && (
        <>
          <div className="overlay" onClick={() => !isDeleting && setShowDeleteModal(false)} />
          <div className="dialog w-96">
            <div className="flex items-center gap-3 mb-4 text-red-600">
              <Trash2 className="w-6 h-6" />
              <h2 className="font-bold text-lg">Confirm User Deletion</h2>
            </div>
            
            <p className="text-sm text-slate-600 mb-6">
              Are you sure you want to delete user <span className="font-bold">"{userToDelete?.username}"</span>? 
              This action is permanent.
            </p>

            <div className="space-y-4">
              <div>
                <label className="label">Your Admin Username</label>
                <input 
                  type="text" 
                  value={adminUsername} 
                  onChange={(e) => setAdminUsername(e.target.value)} 
                  className="input"
                  placeholder="Enter your username"
                  autoFocus
                />
              </div>
              <div>
                <label className="label">Your Admin Password</label>
                <input 
                  type="password" 
                  value={adminPassword} 
                  onChange={(e) => setAdminPassword(e.target.value)} 
                  className="input"
                  placeholder="Enter your password"
                  onKeyDown={(e) => e.key === 'Enter' && deleteUser()}
                />
              </div>

              <div className="flex gap-3 pt-2">
                <button 
                  onClick={deleteUser} 
                  disabled={isDeleting || !adminPassword || !adminUsername}
                  className="btn-primary bg-red-600 hover:bg-red-700 flex-1"
                >
                  {isDeleting ? 'Deleting...' : 'Confirm Delete'}
                </button>
                <button 
                  onClick={() => {
                    setShowDeleteModal(false);
                    setAdminUsername('');
                    setAdminPassword('');
                  }} 
                  disabled={isDeleting}
                  className="btn-secondary flex-1"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </>
      )}
      <button id="hidden-delete-trigger" style={{ display: 'none' }} onClick={deleteUser} />
    </div>
  );
}
