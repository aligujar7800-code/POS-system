/**
 * ModuleFields — Renders extra fields defined by the active business module.
 * Used in ProductForm (for product_meta) and Sales (for item_meta).
 * Reads field definitions from the module config and renders the appropriate input.
 */

import React from 'react';
import type { ExtraField, SaleField } from '../../modules/types';

interface ModuleFieldsProps {
  fields: (ExtraField | SaleField)[];
  values: Record<string, any>;
  onChange: (key: string, value: any) => void;
  compact?: boolean;  // For sale screen — smaller inputs
  readOnly?: boolean;
}

export default function ModuleFields({ fields, values, onChange, compact, readOnly }: ModuleFieldsProps) {
  if (!fields || fields.length === 0) return null;

  const inputClass = compact
    ? 'input-sm text-xs'
    : 'input';

  const labelClass = compact
    ? 'text-[10px] font-bold text-slate-500 uppercase tracking-tighter mb-0.5'
    : 'label text-xs font-bold text-slate-500 uppercase';

  return (
    <div className={compact ? 'space-y-2' : 'space-y-4'}>
      {fields.map((field) => (
        <div key={field.key}>
          {field.type !== 'checkbox' && (
            <label className={labelClass}>
              {field.label}
              {('required' in field && field.required) && <span className="text-red-500 ml-0.5">*</span>}
            </label>
          )}

          {/* Text input */}
          {field.type === 'text' && (
            <input
              type="text"
              value={values[field.key] || ''}
              onChange={(e) => onChange(field.key, e.target.value)}
              placeholder={field.placeholder}
              className={inputClass}
              readOnly={readOnly}
            />
          )}

          {/* Number input */}
          {field.type === 'number' && (
            <div className="relative">
              <input
                type="number"
                value={values[field.key] ?? ''}
                onChange={(e) => onChange(field.key, e.target.value ? parseFloat(e.target.value) : '')}
                placeholder={field.placeholder}
                className={`${inputClass} ${('unit' in field && field.unit) ? 'pr-12' : ''}`}
                readOnly={readOnly}
                min={('min' in field) ? field.min : undefined}
                max={('max' in field) ? field.max : undefined}
              />
              {('unit' in field && field.unit) && (
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400 font-medium">
                  {field.unit}
                </span>
              )}
            </div>
          )}

          {/* Date input */}
          {field.type === 'date' && (
            <input
              type="date"
              value={values[field.key] || ''}
              onChange={(e) => onChange(field.key, e.target.value)}
              className={inputClass}
              readOnly={readOnly}
            />
          )}

          {/* Time input */}
          {field.type === 'time' && (
            <input
              type="time"
              value={values[field.key] || ''}
              onChange={(e) => onChange(field.key, e.target.value)}
              className={inputClass}
              readOnly={readOnly}
            />
          )}

          {/* Select dropdown */}
          {field.type === 'select' && (
            <select
              value={values[field.key] ?? field.defaultValue ?? ''}
              onChange={(e) => onChange(field.key, e.target.value)}
              className={inputClass}
              disabled={readOnly}
            >
              <option value="">Select...</option>
              {field.options?.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          )}

          {/* Textarea */}
          {field.type === 'textarea' && (
            <textarea
              value={values[field.key] || ''}
              onChange={(e) => onChange(field.key, e.target.value)}
              placeholder={field.placeholder}
              className={`${inputClass} h-16 resize-none`}
              readOnly={readOnly}
            />
          )}

          {/* Checkbox */}
          {field.type === 'checkbox' && (
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={!!values[field.key]}
                onChange={(e) => onChange(field.key, e.target.checked)}
                className="w-4 h-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
                disabled={readOnly}
              />
              <span className={compact ? 'text-xs text-slate-600' : 'text-sm text-slate-700 font-medium'}>
                {field.label}
              </span>
            </label>
          )}

          {/* Helper text */}
          {('helperText' in field && field.helperText) && (
            <p className="text-[10px] text-slate-400 mt-0.5">{field.helperText}</p>
          )}
        </div>
      ))}
    </div>
  );
}

/**
 * ModuleInventoryValue — Renders a single cell value for an extra inventory column.
 * Handles different render modes: text, badge, date, alert.
 */
export function ModuleInventoryValue({ 
  value, 
  render, 
  badgeColors 
}: { 
  value: any; 
  render?: string; 
  badgeColors?: Record<string, string>;
}) {
  if (value === undefined || value === null || value === '') {
    return <span className="text-slate-300">—</span>;
  }

  switch (render) {
    case 'badge': {
      const colorClass = badgeColors?.[value] || 'bg-slate-100 text-slate-600';
      return (
        <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold capitalize ${colorClass}`}>
          {String(value).replace(/_/g, ' ')}
        </span>
      );
    }

    case 'date': {
      try {
        const d = new Date(value);
        const now = new Date();
        const diffDays = Math.ceil((d.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
        const dateStr = d.toLocaleDateString('en-PK', { year: '2-digit', month: 'short', day: 'numeric' });
        
        if (diffDays < 0) {
          return <span className="text-red-600 font-bold text-xs">⚠ {dateStr}</span>;
        } else if (diffDays <= 30) {
          return <span className="text-amber-600 font-semibold text-xs">⏰ {dateStr}</span>;
        }
        return <span className="text-slate-600 text-xs">{dateStr}</span>;
      } catch {
        return <span className="text-slate-600 text-xs">{String(value)}</span>;
      }
    }

    case 'alert': {
      // Same as date but with more prominent alert styling
      try {
        const d = new Date(value);
        const now = new Date();
        const diffDays = Math.ceil((d.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
        const dateStr = d.toLocaleDateString('en-PK', { year: '2-digit', month: 'short', day: 'numeric' });
        
        if (diffDays < 0) {
          return (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-red-100 text-red-700 text-[10px] font-bold">
              ❌ Expired
            </span>
          );
        } else if (diffDays <= 30) {
          return (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 text-[10px] font-bold animate-pulse">
              ⚠ {diffDays}d left
            </span>
          );
        } else if (diffDays <= 90) {
          return (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-yellow-50 text-yellow-700 text-[10px] font-bold">
              📅 {dateStr}
            </span>
          );
        }
        return <span className="text-slate-600 text-xs">{dateStr}</span>;
      } catch {
        return <span className="text-slate-600 text-xs">{String(value)}</span>;
      }
    }

    default:
      return <span className="text-slate-600 text-xs">{String(value)}</span>;
  }
}
