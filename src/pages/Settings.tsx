import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { cmd } from '../lib/utils';
import { useSettingsStore } from '../stores/settingsStore';
import { useToast } from '../components/ui/Toaster';
import { Settings, Store, Printer, Users, Database, Globe, Check, Wifi, WifiOff, Plus, RefreshCw, Tag, Save } from 'lucide-react';
import { save } from '@tauri-apps/plugin-dialog';

type Tab = 'shop' | 'receipt' | 'tax' | 'users' | 'hardware' | 'backup' | 'language' | 'license';

interface UserRecord { id: number; username: string; role: string; is_active: boolean; }
interface PrinterInfo { port: string; name: string; printer_type: string; model_guess: string; }
import { ShieldCheck } from 'lucide-react';

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
  const [shopLogo, setShopLogo] = useState(settings.shop_logo || '');
  const [shopEmail, setShopEmail] = useState(settings.shop_email || '');
  const [receiptHeader, setReceiptHeader] = useState(settings.receipt_header || '');
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

  const { data: licenseInfo } = useQuery<any>({
    queryKey: ['licenseInfo'],
    queryFn: () => cmd('get_license_status'),
    enabled: tab === 'license',
  });

  const saveShopSettings = async () => {
    setSaving(true);
    try {
      const map: Record<string, string> = {
        shop_name: shopName,
        shop_address: shopAddress,
        shop_phone: shopPhone,
        shop_logo: shopLogo,
        shop_email: shopEmail,
        currency_symbol: currencySymbol,
        receipt_header: receiptHeader,
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
        shop_logo: shopLogo || null,
        shop_email: shopEmail,
        currency_symbol: currencySymbol,
        receipt_header: receiptHeader,
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
    ['shop', t('settings.shopInfo'), <Store className="w-4 h-4" />],
    ['receipt', t('settings.receipt'), <Settings className="w-4 h-4" />],
    ['tax', t('settings.taxSettings'), <Settings className="w-4 h-4" />],
    ['users', t('settings.users'), <Users className="w-4 h-4" />],
    ['hardware', t('settings.hardware'), <Printer className="w-4 h-4" />],
    ['backup', t('settings.backup'), <Database className="w-4 h-4" />],
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
                      if (file.size > 500000) { toast("Image must be smaller than 500KB", "error"); return; }
                      const reader = new FileReader();
                      reader.onloadend = () => setShopLogo(reader.result as string);
                      reader.readAsDataURL(file);
                    }} 
                    className="text-xs file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-xs file:font-semibold file:bg-brand-50 file:text-brand-700 hover:file:bg-brand-100" 
                  />
                  {shopLogo && <button onClick={() => setShopLogo('')} className="text-xs text-red-500 hover:underline">Remove</button>}
                </div>
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
                <label className="label">Receipt Preview</label>
                <div className="border border-slate-200 rounded-lg p-4 bg-slate-50" style={{ fontFamily: "'Courier New', monospace", fontSize: '11px', lineHeight: '1.5', color: '#000', maxWidth: '280px' }}>
                  <div style={{ textAlign: 'center', borderBottom: '2px dashed #333', paddingBottom: '6px', marginBottom: '6px' }}>
                    <div style={{ fontSize: '14px', fontWeight: 'bold', textTransform: 'uppercase' }}>{shopName || 'Shop Name'}</div>
                    {shopAddress && <div style={{ fontSize: '10px' }}>{shopAddress}</div>}
                    {shopPhone && <div style={{ fontSize: '10px' }}>{shopPhone}</div>}
                    {shopEmail && <div style={{ fontSize: '10px' }}>{shopEmail}</div>}
                  </div>
                  {receiptHeader && (
                    <div style={{ textAlign: 'center', fontSize: '10px', marginBottom: '4px', color: '#444' }}>
                      {receiptHeader.split('\n').map((l, i) => <div key={i}>{l}</div>)}
                    </div>
                  )}
                  <div style={{ borderBottom: '1px dashed #999', marginBottom: '4px', paddingBottom: '2px', fontSize: '10px' }}>Sale ID: INV-XXXX-XXXX</div>
                  <div style={{ fontSize: '10px', color: '#666' }}>... items ...</div>
                  <div style={{ borderTop: '2px solid #000', marginTop: '4px', paddingTop: '2px', fontWeight: 'bold' }}>TOTAL: Rs. X,XXX.XX</div>
                  <div style={{ borderTop: '3px double #333', marginTop: '6px', paddingTop: '4px', textAlign: 'center', fontSize: '10px' }}>
                    {shopAddress && <div>{shopAddress}</div>}
                    {shopPhone && <div>Tel: {shopPhone}</div>}
                    {shopEmail && <div>{shopEmail}</div>}
                  </div>
                  {footer && (
                    <div style={{ textAlign: 'center', fontSize: '10px', marginTop: '4px', color: '#444' }}>
                      {footer.split('\n').map((l, i) => <div key={i}>{l}</div>)}
                    </div>
                  )}
                  <div style={{ textAlign: 'center', fontSize: '10px', marginTop: '6px', letterSpacing: '2px' }}>|||||||||||||||||||||||</div>
                  <div style={{ textAlign: 'center', fontSize: '9px' }}>INV-XXXX-XXXX</div>
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
              <div className="card p-6 space-y-6">
                <div className="flex items-center justify-between">
                  <h2 className="font-semibold text-slate-700">Hardware Integration</h2>
                  <button 
                    onClick={detectPrinters} 
                    disabled={detecting}
                    className="btn-secondary text-xs py-1.5"
                  >
                    {detecting ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                    Refresh Devices
                  </button>
                </div>

                {/* Detected Scanners (Quick Info) */}
                {detectedPrinters.filter(p => p.printer_type === 'usb_hid').length > 0 && (
                  <div className="p-3 bg-blue-50 border border-blue-100 rounded-xl space-y-2">
                    <p className="text-[10px] font-bold text-blue-400 uppercase tracking-widest">Active Barcode Scanners</p>
                    <div className="flex flex-wrap gap-2">
                      {detectedPrinters.filter(p => p.printer_type === 'usb_hid').map((p, i) => (
                        <div key={i} className="flex items-center gap-2 bg-white px-2 py-1 rounded-md border border-blue-100 shadow-sm">
                          <div className="w-1.5 h-1.5 rounded-full bg-green-500"></div>
                          <span className="text-[11px] font-medium text-blue-900">{p.model_guess}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-1 gap-6">
                  {/* RECEIPT PRINTER SECTION */}
                  <div className="space-y-3 p-4 bg-slate-50/50 rounded-2xl border border-slate-100">
                    <div className="flex items-center gap-2 text-slate-800">
                      <div className="p-1.5 bg-brand-100 text-brand-600 rounded-lg">
                        <Printer className="w-4 h-4" />
                      </div>
                      <h3 className="font-bold text-sm">Receipt Printer</h3>
                    </div>
                    
                    <div className="space-y-4">
                      <div>
                        <label className="label text-xs">Printer Connection Type</label>
                        <select 
                          value={printerType} 
                          onChange={(e) => setPrinterType(e.target.value)} 
                          className="input bg-white"
                        >
                          <option value="none">Disabled</option>
                          <option value="system">Windows System Printer (Recommended)</option>
                          <option value="usb">Direct USB (Advanced)</option>
                          <option value="serial">Serial/COM Port</option>
                          <option value="network">Network (TCP/IP)</option>
                        </select>
                      </div>

                      {printerType !== 'none' && (
                        <div className="space-y-3">
                          <div>
                            <label className="label text-xs">Select Printer Device</label>
                            {printerType === 'system' ? (
                              <select 
                                value={printerPort} 
                                onChange={(e) => setPrinterPort(e.target.value)} 
                                className="input bg-white"
                              >
                                <option value="">Select a printer...</option>
                                {detectedPrinters.filter(p => p.printer_type === 'system').map(p => (
                                  <option key={p.port} value={p.port}>{p.name}</option>
                                ))}
                              </select>
                            ) : (
                              <div>
                                <input 
                                  value={printerPort} 
                                  onChange={(e) => setPrinterPort(e.target.value)} 
                                  className="input bg-white" 
                                  list="usb-serial-printers"
                                  placeholder={printerType === 'usb' ? "Select or enter usb:0a5f:000a" : "Select or enter COM3 / IP"} 
                                />
                                <datalist id="usb-serial-printers">
                                  {detectedPrinters.filter(p => p.printer_type === 'usb' || p.printer_type === 'serial').map(p => (
                                    <option key={p.port} value={p.port}>{p.name}</option>
                                  ))}
                                </datalist>
                              </div>
                            )}
                          </div>
                          
                          <button onClick={testPrint} className="btn-secondary w-full text-xs">
                            <Printer className="w-3.5 h-3.5" /> Test Receipt Print
                          </button>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* LABEL PRINTER SECTION */}
                  <div className="space-y-3 p-4 bg-slate-50/50 rounded-2xl border border-slate-100">
                    <div className="flex items-center gap-2 text-slate-800">
                      <div className="p-1.5 bg-orange-100 text-orange-600 rounded-lg">
                        <Tag className="w-4 h-4" />
                      </div>
                      <h3 className="font-bold text-sm">Barcode / Label Printer</h3>
                    </div>

                    <div className="space-y-4">
                      <div>
                        <label className="label text-xs">Select Label Printer</label>
                        <select 
                          value={settings.label_printer_port} 
                          onChange={(e) => settings.setSettings({ label_printer_port: e.target.value })} 
                          className="input bg-white"
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
                      
                      <p className="text-[10px] text-slate-400 italic">
                        Tip: Select your Zebra or Xprinter here to use it specifically for barcode labels.
                      </p>
                    </div>
                  </div>
                </div>

                <div className="pt-4 flex justify-end">
                  <button 
                    onClick={() => {
                      toast("Hardware settings saved successfully");
                    }} 
                    className="btn-primary px-8"
                  >
                    <Save className="w-4 h-4" /> Save Hardware Config
                  </button>
                </div>
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
                    className={`rounded-xl py-4 text-sm font-medium border-2 transition-colors ${settings.language === code
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

          {/* License Info */}
          {tab === 'license' && (
            <div className="card p-6 space-y-4 max-w-xl">
              <div className="flex items-center gap-3 border-b border-slate-100 pb-4 mb-4">
                <div className="p-2 bg-brand-50 text-brand-600 rounded-lg">
                  <ShieldCheck className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="font-semibold text-slate-800">Software License</h2>
                  <p className="text-sm text-slate-500">Your activation details</p>
                </div>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Status</label>
                  <div className="mt-1 flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.4)]"></span>
                    <span className="font-medium text-slate-700">Activated</span>
                  </div>
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">License Key</label>
                  <p className="mt-1 font-mono text-sm bg-slate-50 border border-slate-100 px-3 py-2 rounded-lg text-slate-600">
                    {licenseInfo?.license_key ? (
                      `CPOS-****-****-****-${licenseInfo.license_key.slice(-4)}`
                    ) : 'Loading...'}
                  </p>
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Machine Fingerprint</label>
                  <p className="mt-1 font-mono text-sm bg-slate-50 border border-slate-100 px-3 py-2 rounded-lg text-slate-600 break-all">
                    {licenseInfo?.machine_id || 'Loading...'}
                  </p>
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Activated On</label>
                  <p className="mt-1 text-sm text-slate-700">
                    {licenseInfo?.activated_at || 'Loading...'}
                  </p>
                </div>

                {licenseInfo?.expiry_date && (
                  <div>
                    <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Expires On</label>
                    <p className="mt-1 text-sm font-medium text-red-600">
                      {licenseInfo.expiry_date}
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
