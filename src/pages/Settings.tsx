import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { cmd } from '../lib/utils';
import { useSettingsStore } from '../stores/settingsStore';
import { useToast } from '../components/ui/Toaster';
import { Settings, Store, Printer, Users, Database, Globe, Check, Wifi, WifiOff, Plus, RefreshCw } from 'lucide-react';
import { save } from '@tauri-apps/plugin-dialog';

type Tab = 'shop' | 'receipt' | 'tax' | 'users' | 'hardware' | 'backup' | 'language';

interface UserRecord { id: number; username: string; role: string; is_active: boolean; }
interface PrinterInfo { port: string; name: string; printer_type: string; model_guess: string; }

export default function SettingsPage() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const settings = useSettingsStore();
  const qc = useQueryClient();

  const [tab, setTab] = useState<Tab>('shop');
  const [saving, setSaving] = useState(false);
  const [detecting, setDetecting] = useState(false);

  // Local editable state
  const [shopName, setShopName] = useState(settings.shop_name);
  const [shopAddress, setShopAddress] = useState(settings.shop_address);
  const [shopPhone, setShopPhone] = useState(settings.shop_phone);
  const [footer, setFooter] = useState(settings.receipt_footer);
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

  const { data: users = [] } = useQuery<UserRecord[]>({
    queryKey: ['users'],
    queryFn: () => cmd('get_all_users'),
    enabled: tab === 'users',
  });

  const saveShopSettings = async () => {
    setSaving(true);
    try {
      const map: Record<string, string> = {
        shop_name: shopName,
        shop_address: shopAddress,
        shop_phone: shopPhone,
        currency_symbol: currencySymbol,
        receipt_footer: footer,
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
        currency_symbol: currencySymbol,
        receipt_footer: footer,
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

  const addUser = async () => {
    if (!newUsername || !newPassword) { toast('Username and password required', 'error'); return; }
    try {
      await cmd('create_user', { payload: { username: newUsername, password: newPassword, role: newRole } });
      toast('User created!', 'success');
      qc.invalidateQueries({ queryKey: ['users'] });
      setShowAddUser(false);
      setNewUsername(''); setNewPassword('');
    } catch (e: any) {
      toast(e.toString(), 'error');
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
    ['shop',     t('settings.shopInfo'),    <Store className="w-4 h-4" />],
    ['receipt',  t('settings.receipt'),     <Settings className="w-4 h-4" />],
    ['tax',      t('settings.taxSettings'), <Settings className="w-4 h-4" />],
    ['users',    t('settings.users'),       <Users className="w-4 h-4" />],
    ['hardware', t('settings.hardware'),    <Printer className="w-4 h-4" />],
    ['backup',   t('settings.backup'),      <Database className="w-4 h-4" />],
    ['language', t('settings.language'),    <Globe className="w-4 h-4" />],
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
      </div>

      <div className="flex gap-6 h-full">
        {/* Side tabs */}
        <aside className="w-48 flex-shrink-0">
          <nav className="space-y-1">
            {tabs.map(([key, label, icon]) => (
              <button
                key={key}
                onClick={() => setTab(key)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors text-left ${
                  tab === key ? 'bg-brand-50 text-brand-700' : 'text-slate-600 hover:bg-slate-100'
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
            <div className="card p-6 space-y-4 max-w-xl">
              <h2 className="font-semibold text-slate-700">{t('settings.receipt')}</h2>
              <div>
                <label className="label">{t('settings.receiptFooter')}</label>
                <textarea value={footer} onChange={(e) => setFooter(e.target.value)} className="input h-24 resize-none" />
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
                <button onClick={() => setShowAddUser(true)} className="btn-primary btn-sm">
                  <Plus className="w-3.5 h-3.5" /> {t('settings.addUser')}
                </button>
              </div>
              <div className="table-container">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Username</th>
                      <th>Role</th>
                      <th>Status</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {users.map((u) => (
                      <tr key={u.id}>
                        <td className="font-medium">{u.username}</td>
                        <td><span className={u.role === 'admin' ? 'badge-blue' : 'badge-gray'}>{u.role}</span></td>
                        <td><span className={u.is_active ? 'badge-green' : 'badge-red'}>{u.is_active ? 'Active' : 'Inactive'}</span></td>
                        <td>
                          <button
                            onClick={() => toggleUser(u.id, !u.is_active)}
                            className="btn-sm btn-secondary"
                          >
                            {u.is_active ? 'Deactivate' : 'Activate'}
                          </button>
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
                        <label className="label">{t('settings.role')}</label>
                        <select value={newRole} onChange={(e) => setNewRole(e.target.value)} className="input">
                          <option value="cashier">{t('settings.cashier')}</option>
                          <option value="admin">{t('settings.admin')}</option>
                        </select>
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
            <div className="space-y-4 max-w-xl">
              <div className="card p-6 space-y-4">
                <h2 className="font-semibold text-slate-700">{t('settings.hardware')}</h2>
                <div className="flex gap-3">
                  <button onClick={detectPrinters} disabled={detecting} className="btn-secondary">
                    {detecting ? <span className="w-4 h-4 border-2 border-slate-400 border-t-slate-700 rounded-full animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                    {t('settings.detectPrinters')}
                  </button>
                  <button onClick={testPrint} className="btn-secondary">
                    <Printer className="w-4 h-4" /> {t('settings.testPrint')}
                  </button>
                </div>

                {detectedPrinters.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-sm font-medium text-slate-600">Detected Printers:</p>
                    {detectedPrinters.map((p, i) => (
                      <div key={i} className="flex items-center justify-between bg-slate-50 rounded-lg px-4 py-2.5">
                        <div>
                          <p className="text-sm font-medium">{p.model_guess}</p>
                          <p className="text-xs text-slate-400">{p.port}</p>
                        </div>
                        <button
                          onClick={() => { setPrinterType(p.printer_type); setPrinterPort(p.port); }}
                          className="btn-sm btn-primary"
                        >
                          Use
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                <div>
                  <label className="label">Printer Type</label>
                  <select value={printerType} onChange={(e) => setPrinterType(e.target.value)} className="input">
                    <option value="none">None</option>
                    <option value="serial">Serial/COM Port</option>
                    <option value="network">Network (TCP/IP)</option>
                  </select>
                </div>
                {printerType !== 'none' && (
                  <>
                    <div>
                      <label className="label">Port / IP:Port</label>
                      <input value={printerPort} onChange={(e) => setPrinterPort(e.target.value)} className="input" placeholder="COM3 or 192.168.1.100:9100" />
                    </div>
                    {printerType === 'serial' && (
                      <div>
                        <label className="label">Baud Rate</label>
                        <select value={printerBaud} onChange={(e) => setPrinterBaud(e.target.value)} className="input">
                          {[9600, 19200, 38400, 57600, 115200].map((b) => (
                            <option key={b} value={b}>{b}</option>
                          ))}
                        </select>
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          )}

          {/* Backup */}
          {tab === 'backup' && (
            <div className="card p-6 space-y-4 max-w-xl">
              <h2 className="font-semibold text-slate-700">{t('settings.backup')}</h2>
              <p className="text-sm text-slate-500">Export the SQLite database to a file for backup.</p>
              <button onClick={exportDb} className="btn-secondary">
                <Database className="w-4 h-4" /> {t('settings.exportDb')}
              </button>
            </div>
          )}

          {/* Language */}
          {tab === 'language' && (
            <div className="card p-6 space-y-4 max-w-xs">
              <h2 className="font-semibold text-slate-700">{t('settings.language')}</h2>
              <div className="grid grid-cols-2 gap-3">
                {[['en', '🇬🇧 English'], ['ur', '🇵🇰 اردو']].map(([code, label]) => (
                  <button
                    key={code}
                    onClick={() => settings.setLanguage(code)}
                    className={`rounded-xl py-4 text-sm font-medium border-2 transition-colors ${
                      settings.language === code
                        ? 'border-brand-500 bg-brand-50 text-brand-700'
                        : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
