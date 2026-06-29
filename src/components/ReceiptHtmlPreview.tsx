import React from 'react';
import Barcode from 'react-barcode';

// Shared types from ReceiptBuilder
export type BlockType = 'text' | 'separator' | 'key_value' | 'item_list' | 'totals' | 'barcode' | 'qrcode' | 'logo' | 'spacing';
export type Align = 'left' | 'center' | 'right';
export type FontSize = 'normal' | 'double_width' | 'double_height' | 'double_all';

export interface ReceiptBlock {
  id: string;
  type: BlockType;
  content?: string;
  align?: Align;
  fontSize?: FontSize;
  bold?: boolean;
  visibleIf?: string;
  char?: string;
  leftText?: string;
  rightText?: string;
  lines?: number;
}

export interface ReceiptTemplate {
  version: number;
  width: string;
  blocks: ReceiptBlock[];
}

export const DEFAULT_TEMPLATE: ReceiptTemplate = {
  version: 1,
  width: '32',
  blocks: [
    { id: 'logo-1', type: 'logo', align: 'center' },
    { id: 'txt-name', type: 'text', content: '{{shop_name}}', align: 'center', fontSize: 'double_all', bold: true },
    { id: 'txt-addr', type: 'text', content: '{{shop_address}}', align: 'center' },
    { id: 'txt-phone', type: 'text', content: 'Tel: {{shop_phone}}', align: 'center' },
    { id: 'sep-1', type: 'separator', char: '-' },
    { id: 'kv-inv', type: 'key_value', leftText: 'Sale ID:', rightText: '{{invoice_number}}' },
    { id: 'kv-date', type: 'key_value', leftText: 'Date:', rightText: '{{invoice_datetime}}' },
    { id: 'kv-cust', type: 'key_value', leftText: 'Customer:', rightText: '{{customer_name}}', visibleIf: 'customer_name' },
    { id: 'kv-phone', type: 'key_value', leftText: 'Phone:', rightText: '{{customer_phone}}', visibleIf: 'customer_phone' },
    { id: 'sep-2', type: 'separator', char: '-' },
    { id: 'items-1', type: 'item_list' },
    { id: 'sep-3', type: 'separator', char: '=' },
    { id: 'totals-1', type: 'totals' },
    { id: 'sep-4', type: 'separator', char: '=' },
    { id: 'txt-foot', type: 'text', content: 'Thank you for shopping with us!', align: 'center' },
    { id: 'barcode-1', type: 'barcode', content: '{{invoice_number}}', align: 'center' }
  ]
};

export interface ReceiptPreviewData {
  variables: Record<string, string | number>;
  items: Array<{
    id: any;
    name: string;
    qty: number;
    unit_price: number;
    total: number;
  }>;
  shop_logo?: string | null;
  logo_width?: string | number;
  logo_height?: string | number;
  currency_symbol?: string;
  isMock?: boolean;
}

interface Props {
  template: ReceiptTemplate;
  data: ReceiptPreviewData;
  scale?: number;
}

export default function ReceiptHtmlPreview({ template, data, scale = 1 }: Props) {
  const parsedWidth = parseInt(template.width) || (template.width === '80mm' ? 48 : 32);
  const charsPerLine = parsedWidth;
  const widthPx = charsPerLine > 40 ? '380px' : '280px';
  
  const formatCurrency = (val: number) => {
    if (data.isMock) return `[${val}]`;
    const num = Number(val);
    if (isNaN(num)) return '0.00';
    return `${data.currency_symbol || ''}${num.toFixed(2)}`;
  };

  const interpolate = (text?: string) => {
    if (!text) return '';
    return text.replace(/{{(.*?)}}/g, (match, key) => {
      if (data.variables[key] !== undefined && data.variables[key] !== null && data.variables[key] !== '') {
        return String(data.variables[key]);
      }
      return data.isMock ? `[${key}]` : '';
    });
  };

  // Evaluate condition
  const evaluateCond = (cond?: string) => {
    if (!cond) return true;
    if (data.isMock && cond.includes('false')) return false; // Mock specific test
    if (data.isMock) return true; // Show mostly everything in mock
    
    // Simple evaluator: variable > 0 or variable exists
    if (cond.includes('>')) {
      const parts = cond.split('>');
      const key = parts[0].trim();
      const val = parseFloat(parts[1].trim());
      const varVal = parseFloat(String(data.variables[key])) || 0;
      return varVal > val;
    }
    
    if (cond.includes('==')) {
      const parts = cond.split('==');
      const key = parts[0].trim();
      const val = parts[1].trim().replace(/['"]/g, '');
      return String(data.variables[key] || '') === val;
    }

    // Just checking if variable exists and is not empty/zero
    const varVal = data.variables[cond.trim()];
    if (varVal === undefined || varVal === null || varVal === '' || varVal === 0 || varVal === '0') {
      return false;
    }
    
    return true;
  };

  return (
    <div 
      className="bg-white border border-slate-200 shadow-sm mx-auto overflow-hidden p-4 font-mono text-xs leading-tight text-slate-800 shrink-0" 
      style={{ width: widthPx, minWidth: widthPx, maxWidth: widthPx, minHeight: '400px', transform: `scale(${scale})`, transformOrigin: 'top center' }}
    >
      {template.blocks.map(block => {
        if (!evaluateCond(block.visibleIf)) return null;

        let style: React.CSSProperties = {
          textAlign: block.align || 'left',
          fontWeight: block.bold ? 'bold' : 'normal',
          fontSize: block.fontSize?.includes('double') ? '1.2em' : '1em',
          marginBottom: '4px',
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word'
        };

        if (block.type === 'logo') {
          return (
            <div key={block.id} style={style} className="py-2 flex items-center justify-center">
              {data.shop_logo ? (
                <img src={data.shop_logo} alt="Logo" style={{ width: data.logo_width ? `${data.logo_width}px` : undefined, height: data.logo_height ? `${data.logo_height}px` : undefined, maxWidth: '100%', objectFit: 'contain' }} />
              ) : (
                <div className="text-slate-400 border border-dashed border-slate-300 bg-slate-50 w-full flex justify-center italic py-2">Shop Logo</div>
              )}
            </div>
          );
        }
        
        if (block.type === 'text') {
          return <div key={block.id} style={style}>{interpolate(block.content)}</div>;
        }
        
        if (block.type === 'separator') {
          return <div key={block.id} style={{...style, wordBreak: 'break-all'}}>{block.char?.repeat(charsPerLine)}</div>;
        }
        
        if (block.type === 'key_value') {
          const l = block.leftText || '';
          const r = interpolate(block.rightText);
          const spaces = charsPerLine - l.length - r.length;
          return <div key={block.id} style={{...style, wordBreak: 'break-all'}}>{l}{spaces > 0 ? '\u00A0'.repeat(spaces) : ' '}{r}</div>;
        }
        
        if (block.type === 'item_list') {
          const isNarrow = charsPerLine <= 40;
          return (
            <div key={block.id} style={{ ...style, wordBreak: 'normal' }} className="my-2 border-y border-dashed border-slate-300 py-2">
              <div className="flex font-bold mb-1">
                <span style={{ flex: '1 1 40%' }}>Item</span>
                <span style={{ width: isNarrow ? '25px' : '35px', textAlign: 'center' }}>Qty</span>
                <span style={{ width: isNarrow ? '55px' : '70px', textAlign: 'right' }}>Rate</span>
                <span style={{ width: isNarrow ? '60px' : '75px', textAlign: 'right' }}>Total</span>
              </div>
              {data.items.length === 0 && data.isMock && (
                <div className="text-slate-500 italic text-center py-2">[Dynamic Item List Renders Here]</div>
              )}
              {data.items.map((i, idx) => (
                <div key={idx} style={{ paddingBottom: '2px', marginBottom: '2px' }}>
                  <div className="flex">
                    <span style={{ flex: '1 1 40%', wordBreak: 'break-word' }}>{isNarrow ? '' : `${idx+1}. `}{i.name}</span>
                    <span style={{ width: isNarrow ? '25px' : '35px', textAlign: 'center' }}>{i.qty}</span>
                    <span style={{ width: isNarrow ? '55px' : '70px', textAlign: 'right' }}>{data.isMock ? '[R]' : i.unit_price}</span>
                    <span style={{ width: isNarrow ? '60px' : '75px', textAlign: 'right', fontWeight: 'bold' }}>{data.isMock ? '[T]' : i.total}</span>
                  </div>
                  {i.qty > 1 && !data.isMock && (
                    <div style={{ fontSize: '10px', color: '#666', paddingLeft: '4px' }}>
                      @ {i.unit_price} x {i.qty}
                    </div>
                  )}
                </div>
              ))}
            </div>
          );
        }
        
        if (block.type === 'totals') {
          return (
            <div key={block.id} style={{ ...style, textAlign: 'right', paddingRight: '4px' }}>
              {data.isMock && <div className="text-slate-500 italic text-center py-2 border-b border-dashed border-slate-300 mb-2">[Dynamic Totals Render Here]</div>}
              {!data.isMock && (
                <>
                  <div className="flex justify-between"><span>Subtotal:</span><span>{formatCurrency(Number(data.variables['subtotal']) || 0)}</span></div>
                  {Number(data.variables['discount']) > 0 && <div className="flex justify-between"><span>Discount:</span><span>{formatCurrency(Number(data.variables['discount']) || 0)}</span></div>}
                  {Number(data.variables['tax']) > 0 && <div className="flex justify-between"><span>Tax:</span><span>{formatCurrency(Number(data.variables['tax']) || 0)}</span></div>}
                  <div className="flex justify-between font-bold mt-1 text-[1.1em]"><span>Total:</span><span>{formatCurrency(Number(data.variables['grand_total']) || 0)}</span></div>
                  <div className="flex justify-between mt-1"><span>Paid:</span><span>{formatCurrency(Number(data.variables['amount_paid']) || 0)}</span></div>
                  {Number(data.variables['change_returned']) > 0 && <div className="flex justify-between"><span>Change:</span><span>{formatCurrency(Number(data.variables['change_returned']) || 0)}</span></div>}
                </>
              )}
            </div>
          );
        }
        
        if (block.type === 'barcode' || block.type === 'qrcode') {
          const val = interpolate(block.content);
          return (
            <div key={block.id} style={style} className="py-2 flex flex-col items-center justify-center">
              {block.type === 'barcode' ? (
                <Barcode value={val || '0000'} width={1.2} height={40} displayValue={true} fontSize={11} margin={0} />
              ) : (
                <div className="border border-slate-300 bg-slate-50 w-24 h-24 flex items-center justify-center text-[10px] text-slate-400">QR CODE<br/>{val}</div>
              )}
            </div>
          );
        }
        
        if (block.type === 'spacing') {
          return <div key={block.id} style={{ height: `${(block.lines || 1) * 14}px` }} />;
        }
        
        return null;
      })}
    </div>
  );
}
