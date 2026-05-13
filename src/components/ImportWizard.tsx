import React, { useState, useCallback } from 'react';
import { cmd } from '../lib/utils';
import { useToast } from '../components/ui/Toaster';
import { Upload, FileSpreadsheet, Database, ChevronRight, ChevronLeft, Check, AlertTriangle, Loader2, RotateCcw, X, ArrowDownToLine } from 'lucide-react';

type Step = 1 | 2 | 3 | 4 | 5 | 6;
type FileType = 'csv' | 'excel' | 'sqlite';

interface Mapping { source_column: string; detected_field: string; confidence: number; detection_method: string; sample_values: string[]; }
interface TableInfo { name: string; row_count: number; columns: string[]; is_product_table: boolean; }
interface ValError { row_number: number; field: string; error_type: string; message: string; }

const TARGET_FIELDS = [
  { value: 'ProductName', label: 'Product Name' }, { value: 'Barcode', label: 'Barcode' },
  { value: 'Sku', label: 'SKU' }, { value: 'Stock', label: 'Stock Quantity' },
  { value: 'SalePrice', label: 'Sale Price' }, { value: 'CostPrice', label: 'Cost Price' },
  { value: 'Category', label: 'Category' }, { value: 'Brand', label: 'Brand' },
  { value: 'Size', label: 'Size' }, { value: 'Color', label: 'Color' },
  { value: 'Description', label: 'Description' }, { value: 'ArticleNumber', label: 'Article Number' },
  { value: 'Ignore', label: '— Ignore —' },
];

export default function ImportWizard() {
  const { toast } = useToast();
  const [step, setStep] = useState<Step>(1);
  const [fileType, setFileType] = useState<FileType | null>(null);
  const [filePath, setFilePath] = useState('');
  const [fileName, setFileName] = useState('');
  const [loading, setLoading] = useState(false);
  const [mappings, setMappings] = useState<Mapping[]>([]);
  const [columns, setColumns] = useState<string[]>([]);
  const [totalRows, setTotalRows] = useState(0);
  const [previewRows, setPreviewRows] = useState<string[][]>([]);
  const [valErrors, setValErrors] = useState<ValError[]>([]);
  const [dupAction, setDupAction] = useState('skip');
  const [importResult, setImportResult] = useState<any>(null);
  const [importing, setImporting] = useState(false);
  const [tables, setTables] = useState<TableInfo[]>([]);
  const [selectedTable, setSelectedTable] = useState('');
  const [history, setHistory] = useState<any[]>([]);

  // File picker
  const pickFile = useCallback(async () => {
    try {
      const { open } = await import('@tauri-apps/plugin-dialog');
      const exts = fileType === 'csv' ? ['csv','txt'] : fileType === 'excel' ? ['xlsx','xls'] : ['db','sqlite','sqlite3'];
      const selected = await open({ multiple: false, filters: [{ name: fileType || 'File', extensions: exts }] });
      if (selected) {
        const p = typeof selected === 'string' ? selected : (selected as any).path || String(selected);
        setFilePath(p);
        setFileName(p.split(/[\\/]/).pop() || p);
        if (fileType === 'sqlite') {
          setLoading(true);
          const tbls = await cmd<TableInfo[]>('import_list_tables', { filePath: p });
          setTables(tbls);
          const auto = tbls.find(t => t.is_product_table);
          if (auto) setSelectedTable(auto.name);
          setLoading(false);
        }
      }
    } catch (e: any) { toast(String(e), 'error'); }
  }, [fileType, toast]);

  // Detect schema
  const detectSchema = useCallback(async () => {
    if (!filePath) return;
    setLoading(true);
    try {
      const res = await cmd<any>('import_detect_schema', { filePath, fileType, tableName: selectedTable || undefined });
      setColumns(res.columns);
      setTotalRows(res.total_rows);
      setMappings(res.mappings);
      setStep(3);
    } catch (e: any) { toast(String(e), 'error'); }
    setLoading(false);
  }, [filePath, fileType, selectedTable, toast]);

  // Preview + Validate
  const runPreview = useCallback(async () => {
    setLoading(true);
    try {
      const prev = await cmd<any>('import_preview_data', { filePath, fileType, tableName: selectedTable || undefined, limit: 50 });
      setPreviewRows(prev.preview_rows);
      const cfg = { mappings: mappings.map(m => ({ source_column: m.source_column, target_field: m.detected_field })), duplicate_action: dupAction };
      const val = await cmd<any>('import_validate', { filePath, fileType, tableName: selectedTable || undefined, config: cfg });
      setValErrors(val.errors || []);
      setStep(5);
    } catch (e: any) { toast(String(e), 'error'); }
    setLoading(false);
  }, [filePath, fileType, selectedTable, mappings, dupAction, toast]);

  // Execute import
  const runImport = useCallback(async () => {
    setImporting(true);
    try {
      const cfg = { mappings: mappings.map(m => ({ source_column: m.source_column, target_field: m.detected_field })), duplicate_action: dupAction };
      const res = await cmd<any>('import_execute', { filePath, fileType, tableName: selectedTable || undefined, config: cfg });
      setImportResult(res);
      setStep(6);
      toast(`${res.imported} products imported successfully.`, 'success');
    } catch (e: any) { toast(String(e), 'error'); }
    setImporting(false);
  }, [filePath, fileType, selectedTable, mappings, dupAction, toast]);

  // Load history
  const loadHistory = useCallback(async () => {
    try { const h = await cmd<any[]>('import_history'); setHistory(h); } catch {}
  }, []);

  // Rollback
  const rollback = useCallback(async (batchId: string) => {
    try {
      const count = await cmd<number>('import_rollback', { batchId });
      toast(`${count} products deactivated.`, 'success');
      loadHistory();
    } catch (e: any) { toast(String(e), 'error'); }
  }, [toast, loadHistory]);

  const confBadge = (c: number) => {
    const pct = Math.round(c * 100);
    const color = pct >= 90 ? 'bg-emerald-100 text-emerald-700' : pct >= 60 ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-700';
    return <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${color}`}>{pct}%</span>;
  };

  const stepNames = ['Source', 'Upload', 'Detect', 'Map', 'Preview', 'Import'];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-gradient-to-r from-indigo-600 to-purple-600 rounded-2xl p-6 text-white">
        <div className="flex items-center gap-3 mb-2">
          <ArrowDownToLine className="w-6 h-6" />
          <h2 className="text-xl font-bold">Smart Inventory Import</h2>
        </div>
        <p className="text-indigo-100 text-sm">Migrate from any POS system — CSV, Excel, or Database. AI-powered column detection.</p>
      </div>

      {/* Progress Steps */}
      <div className="flex items-center gap-1">
        {stepNames.map((name, i) => (
          <React.Fragment key={i}>
            <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-all ${
              step > i + 1 ? 'bg-emerald-100 text-emerald-700' : step === i + 1 ? 'bg-indigo-600 text-white shadow-lg' : 'bg-slate-100 text-slate-400'
            }`}>
              {step > i + 1 ? <Check className="w-3 h-3" /> : <span>{i + 1}</span>}
              <span className="hidden sm:inline">{name}</span>
            </div>
            {i < 5 && <div className={`flex-1 h-0.5 ${step > i + 1 ? 'bg-emerald-300' : 'bg-slate-200'}`} />}
          </React.Fragment>
        ))}
      </div>

      {/* Step 1: Source Type */}
      {step === 1 && (
        <div className="grid grid-cols-3 gap-4">
          {([['csv', 'CSV File', 'Comma-separated values (.csv)', <FileSpreadsheet key="c" className="w-8 h-8" />],
             ['excel', 'Excel File', 'Microsoft Excel (.xlsx)', <FileSpreadsheet key="e" className="w-8 h-8" />],
             ['sqlite', 'SQLite Database', 'Database files (.db, .sqlite)', <Database key="s" className="w-8 h-8" />]] as [FileType, string, string, React.ReactNode][]).map(([type_, title, desc, icon]) => (
            <button key={type_} onClick={() => { setFileType(type_); setStep(2); }}
              className={`p-6 rounded-2xl border-2 text-left transition-all hover:shadow-lg hover:border-indigo-400 hover:-translate-y-0.5 ${
                fileType === type_ ? 'border-indigo-500 bg-indigo-50' : 'border-slate-200 bg-white'
              }`}>
              <div className="text-indigo-500 mb-3">{icon}</div>
              <h3 className="font-bold text-slate-800 mb-1">{title}</h3>
              <p className="text-xs text-slate-500">{desc}</p>
            </button>
          ))}

          {/* Import History */}
          <div className="col-span-3 mt-2">
            <button onClick={loadHistory} className="text-xs text-indigo-600 hover:underline font-medium">View Import History →</button>
            {history.length > 0 && (
              <div className="mt-3 border rounded-xl overflow-hidden">
                <table className="w-full text-xs">
                  <thead className="bg-slate-50"><tr>
                    <th className="px-3 py-2 text-left">Batch</th><th className="px-3 py-2">Rows</th><th className="px-3 py-2">Imported</th>
                    <th className="px-3 py-2">Status</th><th className="px-3 py-2">Date</th><th className="px-3 py-2"></th>
                  </tr></thead>
                  <tbody>{history.map((h, i) => (
                    <tr key={i} className="border-t"><td className="px-3 py-2 font-mono">{h.batch_id}</td>
                      <td className="px-3 py-2 text-center">{h.total_rows}</td><td className="px-3 py-2 text-center text-emerald-600 font-bold">{h.imported}</td>
                      <td className="px-3 py-2 text-center"><span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${h.status === 'completed' ? 'bg-emerald-100 text-emerald-700' : h.status === 'rolled_back' ? 'bg-slate-100 text-slate-500' : 'bg-amber-100 text-amber-700'}`}>{h.status}</span></td>
                      <td className="px-3 py-2 text-slate-500">{new Date(h.created_at).toLocaleString()}</td>
                      <td className="px-3 py-2">{h.status !== 'rolled_back' && <button onClick={() => rollback(h.batch_id)} className="text-red-500 hover:text-red-700"><RotateCcw className="w-3.5 h-3.5" /></button>}</td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Step 2: Upload File */}
      {step === 2 && (
        <div className="space-y-4">
          <div onClick={pickFile}
            className="border-2 border-dashed border-indigo-300 rounded-2xl p-12 text-center cursor-pointer hover:bg-indigo-50 hover:border-indigo-400 transition-all">
            <Upload className="w-12 h-12 text-indigo-400 mx-auto mb-3" />
            <p className="font-semibold text-slate-700">{filePath ? fileName : 'Click to select file'}</p>
            <p className="text-xs text-slate-400 mt-1">{fileType === 'csv' ? '.csv' : fileType === 'excel' ? '.xlsx' : '.db, .sqlite, .sqlite3'}</p>
          </div>

          {filePath && fileType === 'sqlite' && tables.length > 0 && (
            <div className="bg-white rounded-xl border p-4 space-y-3">
              <h3 className="font-semibold text-sm text-slate-700">Select Product Table</h3>
              <div className="grid gap-2">{tables.map(t => (
                <button key={t.name} onClick={() => setSelectedTable(t.name)}
                  className={`flex items-center justify-between p-3 rounded-lg border text-sm transition-all ${selectedTable === t.name ? 'border-indigo-500 bg-indigo-50' : 'border-slate-200 hover:bg-slate-50'}`}>
                  <div className="flex items-center gap-2">
                    <Database className="w-4 h-4 text-slate-400" />
                    <span className="font-medium">{t.name}</span>
                    {t.is_product_table && <span className="px-1.5 py-0.5 bg-emerald-100 text-emerald-700 rounded text-[10px] font-bold">Auto-detected</span>}
                  </div>
                  <span className="text-slate-400 text-xs">{t.row_count} rows · {t.columns.length} cols</span>
                </button>
              ))}</div>
            </div>
          )}

          <div className="flex gap-3">
            <button onClick={() => { setStep(1); setFilePath(''); setFileName(''); }} className="btn-secondary"><ChevronLeft className="w-4 h-4" /> Back</button>
            <button onClick={detectSchema} disabled={!filePath || loading || (fileType === 'sqlite' && !selectedTable)}
              className="btn-primary flex-1 disabled:opacity-50">
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ChevronRight className="w-4 h-4" />}
              {loading ? 'Analyzing...' : 'Analyze File'}
            </button>
          </div>
        </div>
      )}

      {/* Step 3: Auto Detection Results */}
      {step === 3 && (
        <div className="space-y-4">
          <div className="bg-white rounded-xl border p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-bold text-slate-800">Column Detection Results</h3>
              <span className="text-xs text-slate-500">{totalRows.toLocaleString()} rows found</span>
            </div>
            <div className="border rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-slate-50"><tr>
                  <th className="px-4 py-2.5 text-left text-xs font-bold text-slate-500">Source Column</th>
                  <th className="px-4 py-2.5 text-left text-xs font-bold text-slate-500">Detected As</th>
                  <th className="px-4 py-2.5 text-center text-xs font-bold text-slate-500">Confidence</th>
                  <th className="px-4 py-2.5 text-left text-xs font-bold text-slate-500">Sample</th>
                </tr></thead>
                <tbody>{mappings.map((m, i) => (
                  <tr key={i} className="border-t hover:bg-slate-50">
                    <td className="px-4 py-2.5 font-mono text-xs font-medium">{m.source_column}</td>
                    <td className="px-4 py-2.5 font-semibold text-indigo-700 text-xs">{TARGET_FIELDS.find(f => f.value === m.detected_field)?.label || m.detected_field}</td>
                    <td className="px-4 py-2.5 text-center">{confBadge(m.confidence)}</td>
                    <td className="px-4 py-2.5 text-xs text-slate-400 truncate max-w-[200px]">{m.sample_values.slice(0, 3).join(', ')}</td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          </div>
          <div className="flex gap-3">
            <button onClick={() => setStep(2)} className="btn-secondary"><ChevronLeft className="w-4 h-4" /> Back</button>
            <button onClick={() => setStep(4)} className="btn-primary flex-1"><ChevronRight className="w-4 h-4" /> Customize Mapping</button>
          </div>
        </div>
      )}

      {/* Step 4: Manual Mapping Override */}
      {step === 4 && (
        <div className="space-y-4">
          <div className="bg-white rounded-xl border p-4 space-y-3">
            <h3 className="font-bold text-slate-800">Column Mapping</h3>
            <p className="text-xs text-slate-500">Adjust mappings if needed. Each source column maps to one target field.</p>
            <div className="space-y-2">{mappings.map((m, i) => (
              <div key={i} className="flex items-center gap-3 p-3 rounded-lg bg-slate-50">
                <span className="font-mono text-xs font-medium text-slate-600 w-40 truncate">{m.source_column}</span>
                <ChevronRight className="w-4 h-4 text-slate-300" />
                <select value={m.detected_field} onChange={e => {
                  const updated = [...mappings]; updated[i] = { ...m, detected_field: e.target.value, confidence: 1.0, detection_method: 'manual' }; setMappings(updated);
                }} className="flex-1 text-sm border rounded-lg px-3 py-1.5 bg-white focus:ring-2 focus:ring-indigo-300 outline-none">
                  {TARGET_FIELDS.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
                </select>
                {confBadge(m.confidence)}
              </div>
            ))}</div>
          </div>

          <div className="bg-white rounded-xl border p-4 space-y-3">
            <h3 className="font-bold text-slate-800">Duplicate Barcode Handling</h3>
            <div className="grid grid-cols-2 gap-2">{([
              ['skip', 'Skip Duplicates', 'Ignore rows with existing barcodes'],
              ['merge', 'Merge Stock', 'Add stock to existing products'],
              ['replace', 'Replace Product', 'Overwrite existing product data'],
              ['generate_new', 'New Barcode', 'Keep old as legacy, generate new'],
            ] as [string, string, string][]).map(([val, title, desc]) => (
              <button key={val} onClick={() => setDupAction(val)}
                className={`p-3 rounded-lg border text-left transition-all text-sm ${dupAction === val ? 'border-indigo-500 bg-indigo-50' : 'border-slate-200 hover:bg-slate-50'}`}>
                <span className="font-semibold block">{title}</span>
                <span className="text-xs text-slate-500">{desc}</span>
              </button>
            ))}</div>
          </div>

          <div className="flex gap-3">
            <button onClick={() => setStep(3)} className="btn-secondary"><ChevronLeft className="w-4 h-4" /> Back</button>
            <button onClick={runPreview} disabled={loading} className="btn-primary flex-1">
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ChevronRight className="w-4 h-4" />}
              {loading ? 'Validating...' : 'Preview & Validate'}
            </button>
          </div>
        </div>
      )}

      {/* Step 5: Preview + Validation */}
      {step === 5 && (
        <div className="space-y-4">
          {valErrors.length > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-2">
                <AlertTriangle className="w-4 h-4 text-amber-600" />
                <span className="font-bold text-amber-800 text-sm">{valErrors.length} issues found</span>
              </div>
              <div className="max-h-40 overflow-y-auto space-y-1">{valErrors.slice(0, 20).map((e, i) => (
                <p key={i} className="text-xs text-amber-700">Row {e.row_number}: {e.message}</p>
              ))}</div>
              {valErrors.length > 20 && <p className="text-xs text-amber-500 mt-1">...and {valErrors.length - 20} more</p>}
            </div>
          )}

          {valErrors.length === 0 && (
            <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 flex items-center gap-2">
              <Check className="w-5 h-5 text-emerald-600" />
              <span className="font-bold text-emerald-800">All {totalRows.toLocaleString()} rows passed validation!</span>
            </div>
          )}

          <div className="bg-white rounded-xl border overflow-hidden">
            <div className="p-3 border-b bg-slate-50 flex items-center justify-between">
              <span className="font-bold text-sm text-slate-700">Data Preview (first {Math.min(previewRows.length, 50)} rows)</span>
              <span className="text-xs text-slate-400">{totalRows.toLocaleString()} total</span>
            </div>
            <div className="overflow-x-auto max-h-64">
              <table className="w-full text-xs">
                <thead className="bg-slate-50 sticky top-0"><tr>
                  <th className="px-3 py-2 text-left font-bold text-slate-400">#</th>
                  {columns.map((c, i) => {
                    const m = mappings.find(m => m.source_column === c);
                    return <th key={i} className="px-3 py-2 text-left">
                      <span className="font-bold text-slate-600">{c}</span>
                      {m && m.detected_field !== 'Ignore' && <span className="block text-[10px] text-indigo-500 font-normal">→ {m.detected_field}</span>}
                    </th>;
                  })}
                </tr></thead>
                <tbody>{previewRows.slice(0, 50).map((row, ri) => (
                  <tr key={ri} className="border-t hover:bg-slate-50">
                    <td className="px-3 py-1.5 text-slate-400">{ri + 1}</td>
                    {row.map((val, ci) => <td key={ci} className="px-3 py-1.5 truncate max-w-[150px]">{val}</td>)}
                  </tr>
                ))}</tbody>
              </table>
            </div>
          </div>

          <div className="flex gap-3">
            <button onClick={() => setStep(4)} className="btn-secondary"><ChevronLeft className="w-4 h-4" /> Back</button>
            <button onClick={runImport} disabled={importing} className="btn-primary flex-1 bg-emerald-600 hover:bg-emerald-700">
              {importing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
              {importing ? `Importing ${totalRows.toLocaleString()} products...` : `Import ${totalRows.toLocaleString()} Products`}
            </button>
          </div>
        </div>
      )}

      {/* Step 6: Import Complete */}
      {step === 6 && importResult && (
        <div className="space-y-4">
          <div className="bg-gradient-to-br from-emerald-500 to-teal-600 rounded-2xl p-8 text-center text-white">
            <div className="w-16 h-16 bg-white/20 rounded-full flex items-center justify-center mx-auto mb-4">
              <Check className="w-8 h-8" />
            </div>
            <h3 className="text-2xl font-bold mb-1">Import Complete!</h3>
            <p className="text-emerald-100">Batch: {importResult.batch_id}</p>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div className="bg-white rounded-xl border p-5 text-center">
              <p className="text-3xl font-bold text-emerald-600">{importResult.imported}</p>
              <p className="text-xs text-slate-500 mt-1">Imported</p>
            </div>
            <div className="bg-white rounded-xl border p-5 text-center">
              <p className="text-3xl font-bold text-amber-500">{importResult.skipped}</p>
              <p className="text-xs text-slate-500 mt-1">Skipped</p>
            </div>
            <div className="bg-white rounded-xl border p-5 text-center">
              <p className="text-3xl font-bold text-red-500">{importResult.errors}</p>
              <p className="text-xs text-slate-500 mt-1">Errors</p>
            </div>
          </div>

          {importResult.error_details?.length > 0 && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-4 max-h-40 overflow-y-auto">
              {importResult.error_details.slice(0, 20).map((e: ValError, i: number) => (
                <p key={i} className="text-xs text-red-700">Row {e.row_number}: {e.message}</p>
              ))}
            </div>
          )}

          <div className="flex gap-3">
            <button onClick={() => rollback(importResult.batch_id)} className="btn-secondary text-red-600">
              <RotateCcw className="w-4 h-4" /> Rollback Import
            </button>
            <button onClick={() => { setStep(1); setFilePath(''); setFileName(''); setMappings([]); setImportResult(null); }}
              className="btn-primary flex-1">Start New Import</button>
          </div>
        </div>
      )}
    </div>
  );
}
