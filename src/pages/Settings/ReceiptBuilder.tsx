import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { 
  DndContext, 
  closestCenter, 
  KeyboardSensor, 
  PointerSensor, 
  useSensor, 
  useSensors 
} from '@dnd-kit/core';
import { 
  arrayMove, 
  SortableContext, 
  sortableKeyboardCoordinates, 
  verticalListSortingStrategy,
  useSortable
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical, Plus, Trash2, Settings2, Image as ImageIcon, Type, Minus, List, AlignLeft, Barcode, QrCode } from 'lucide-react';
import { cmd } from '../../lib/utils';
import { useSettingsStore } from '../../stores/settingsStore';
import { useToast } from '../../components/ui/Toaster';
import ReceiptHtmlPreview, { BlockType, Align, FontSize, ReceiptBlock, ReceiptTemplate, DEFAULT_TEMPLATE } from '../../components/ReceiptHtmlPreview';

export type { BlockType, Align, FontSize, ReceiptBlock, ReceiptTemplate };
export { DEFAULT_TEMPLATE };

interface SortableItemProps {
  block: ReceiptBlock;
  selected: boolean;
  onSelect: () => void;
  onDelete: () => void;
}

function SortableBlockItem({ block, selected, onSelect, onDelete }: SortableItemProps) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id: block.id });
  const style = { transform: CSS.Transform.toString(transform), transition };

  const getIcon = () => {
    switch(block.type) {
      case 'logo': return <ImageIcon className="w-4 h-4 text-purple-500" />;
      case 'text': return <Type className="w-4 h-4 text-blue-500" />;
      case 'separator': return <Minus className="w-4 h-4 text-slate-400" />;
      case 'item_list': return <List className="w-4 h-4 text-orange-500" />;
      case 'key_value': return <AlignLeft className="w-4 h-4 text-green-500" />;
      case 'totals': return <List className="w-4 h-4 text-red-500" />;
      case 'barcode': return <Barcode className="w-4 h-4 text-slate-600" />;
      case 'qrcode': return <QrCode className="w-4 h-4 text-slate-600" />;
      case 'spacing': return <Minus className="w-4 h-4 text-transparent border-dashed border-b border-slate-300" />;
      default: return <Settings2 className="w-4 h-4" />;
    }
  };

  const getTitle = () => {
    switch(block.type) {
      case 'text': return `Text: ${block.content?.substring(0, 15) || 'Empty'}`;
      case 'separator': return `Separator (${block.char})`;
      case 'key_value': return `${block.leftText} ${block.rightText}`;
      case 'spacing': return `Blank Lines (${block.lines || 1})`;
      default: return block.type.replace('_', ' ').toUpperCase();
    }
  };

  return (
    <div ref={setNodeRef} style={style} className={`flex items-center gap-3 p-3 bg-white border ${selected ? 'border-brand-500 shadow-sm' : 'border-slate-200'} rounded-lg mb-2 group cursor-pointer hover:border-brand-300`} onClick={onSelect}>
      <div {...attributes} {...listeners} className="cursor-grab text-slate-400 hover:text-slate-600">
        <GripVertical className="w-4 h-4" />
      </div>
      <div className="flex-1 flex items-center gap-3 min-w-0">
        {getIcon()}
        <span className="text-sm font-medium text-slate-700 truncate">{getTitle()}</span>
      </div>
      {block.visibleIf && <span className="text-[10px] bg-amber-100 text-amber-700 px-2 py-0.5 rounded uppercase font-bold">Cond</span>}
      <button onClick={(e) => { e.stopPropagation(); onDelete(); }} className="text-slate-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity p-1">
        <Trash2 className="w-4 h-4" />
      </button>
    </div>
  );
}

export default function ReceiptBuilder() {
  const { toast } = useToast();
  const settings = useSettingsStore();
  
  const [template, setTemplate] = useState<ReceiptTemplate>(DEFAULT_TEMPLATE);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Load from settings
  useEffect(() => {
    try {
      if (settings.custom_receipt_template) {
        setTemplate(JSON.parse(settings.custom_receipt_template));
      }
    } catch (e) {
      console.error("Failed to parse custom receipt template", e);
    }
  }, [settings.custom_receipt_template]);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const handleDragEnd = (event: any) => {
    const { active, over } = event;
    if (active.id !== over.id) {
      setTemplate((t) => {
        const oldIndex = t.blocks.findIndex((b) => b.id === active.id);
        const newIndex = t.blocks.findIndex((b) => b.id === over.id);
        return { ...t, blocks: arrayMove(t.blocks, oldIndex, newIndex) };
      });
    }
  };

  const saveTemplate = async () => {
    setSaving(true);
    try {
      const jsonStr = JSON.stringify(template);
      await cmd('set_setting', { key: 'custom_receipt_template', value: jsonStr });
      settings.setSettings({ custom_receipt_template: jsonStr });
      toast('Receipt template saved successfully!', 'success');
    } catch (e: any) {
      toast('Failed to save template: ' + e.toString(), 'error');
    } finally {
      setSaving(false);
    }
  };

  const addBlock = (type: BlockType) => {
    const newBlock: ReceiptBlock = {
      id: `${type}-${Date.now()}`,
      type,
      align: 'left',
      fontSize: 'normal',
      bold: false,
      content: type === 'text' ? 'New Text' : undefined,
      char: type === 'separator' ? '-' : undefined,
      leftText: type === 'key_value' ? 'Label:' : undefined,
      rightText: type === 'key_value' ? 'Value' : undefined,
      lines: type === 'spacing' ? 1 : undefined,
    };
    setTemplate({ ...template, blocks: [...template.blocks, newBlock] });
    setSelectedId(newBlock.id);
  };

  const updateSelectedBlock = (updates: Partial<ReceiptBlock>) => {
    if (!selectedId) return;
    setTemplate({
      ...template,
      blocks: template.blocks.map(b => b.id === selectedId ? { ...b, ...updates } : b)
    });
  };

  const selectedBlock = template.blocks.find(b => b.id === selectedId);

  // Mock preview generator
  const renderPreview = () => {
    return <ReceiptHtmlPreview template={template} data={{ variables: {}, items: [], isMock: true, shop_logo: settings.shop_logo, logo_width: settings.logo_width, logo_height: settings.logo_height }} />;
  };

  return (
    <div className="flex flex-col h-[calc(100vh-140px)] overflow-y-auto pr-2">
      {/* Header toolbar */}
      <div className="flex items-center justify-between pb-4 border-b border-slate-200 mb-4">
        <div>
          <h2 className="text-lg font-bold text-slate-800">Receipt Builder</h2>
          <p className="text-sm text-slate-500">Design your receipt template visually</p>
        </div>
        <div className="flex items-center gap-3">
          <select 
            value={template.width} 
            onChange={e => setTemplate({...template, width: e.target.value as any})}
            className="input-sm w-32"
          >
            <option value="58mm">58mm (Narrow)</option>
            <option value="80mm">80mm (Wide)</option>
          </select>
          <button onClick={() => {
            if(window.confirm('Reset to default template?')) {
              setTemplate(DEFAULT_TEMPLATE);
              setSelectedId(null);
            }
          }} className="btn-secondary text-xs">Reset Default</button>
          <button onClick={saveTemplate} disabled={saving} className="btn-primary text-xs">
            {saving ? 'Saving...' : 'Save Template'}
          </button>
        </div>
      </div>

      <div className="flex gap-6 shrink-0 h-[500px] mb-6">
        
        {/* Left Panel: Add Elements */}
        <div className="w-[260px] card p-4 shrink-0 flex flex-col">
          <h3 className="text-sm font-bold text-slate-700 mb-3">Add Elements</h3>
            <div className="grid grid-cols-3 gap-2">
              <button onClick={() => addBlock('text')} className="flex flex-col items-center justify-center p-2 border border-slate-200 rounded hover:bg-slate-50 text-xs text-slate-600"><Type className="w-4 h-4 mb-1" />Text</button>
              <button onClick={() => addBlock('separator')} className="flex flex-col items-center justify-center p-2 border border-slate-200 rounded hover:bg-slate-50 text-xs text-slate-600"><Minus className="w-4 h-4 mb-1" />Separator</button>
              <button onClick={() => addBlock('key_value')} className="flex flex-col items-center justify-center p-2 border border-slate-200 rounded hover:bg-slate-50 text-xs text-slate-600"><AlignLeft className="w-4 h-4 mb-1" />Key/Value</button>
              <button onClick={() => addBlock('logo')} className="flex flex-col items-center justify-center p-2 border border-slate-200 rounded hover:bg-slate-50 text-xs text-slate-600"><ImageIcon className="w-4 h-4 mb-1" />Logo</button>
              <button onClick={() => addBlock('item_list')} className="flex flex-col items-center justify-center p-2 border border-slate-200 rounded hover:bg-slate-50 text-xs text-slate-600"><List className="w-4 h-4 mb-1" />Item List</button>
              <button onClick={() => addBlock('totals')} className="flex flex-col items-center justify-center p-2 border border-slate-200 rounded hover:bg-slate-50 text-xs text-slate-600"><Settings2 className="w-4 h-4 mb-1" />Totals</button>
              <button onClick={() => addBlock('barcode')} className="flex flex-col items-center justify-center p-2 border border-slate-200 rounded hover:bg-slate-50 text-xs text-slate-600"><Barcode className="w-4 h-4 mb-1" />Barcode</button>
              <button onClick={() => addBlock('qrcode')} className="flex flex-col items-center justify-center p-2 border border-slate-200 rounded hover:bg-slate-50 text-xs text-slate-600"><QrCode className="w-4 h-4 mb-1" />QR Code</button>
              <button onClick={() => addBlock('spacing')} className="flex flex-col items-center justify-center p-2 border border-slate-200 rounded hover:bg-slate-50 text-xs text-slate-600"><Minus className="w-4 h-4 mb-1 border-dashed" />Spacing</button>
            </div>
        </div>

        {/* Middle Panel: Receipt Layout */}
        <div className="card p-4 flex-1 min-w-[200px] overflow-hidden flex flex-col">
          <h3 className="text-sm font-bold text-slate-700 mb-3">Receipt Layout</h3>
            <div className="flex-1 overflow-y-auto">
              <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                <SortableContext items={template.blocks} strategy={verticalListSortingStrategy}>
                  {template.blocks.map(block => (
                    <SortableBlockItem 
                      key={block.id} 
                      block={block} 
                      selected={selectedId === block.id} 
                      onSelect={() => setSelectedId(block.id)}
                      onDelete={() => {
                        setTemplate({ ...template, blocks: template.blocks.filter(b => b.id !== block.id) });
                        if(selectedId === block.id) setSelectedId(null);
                      }}
                    />
                  ))}
                </SortableContext>
              </DndContext>
          </div>
        </div>

        {/* Right Panel: Properties Editor */}
        <div className="w-[280px] card p-4 shrink-0 overflow-y-auto pb-10">
          <h3 className="text-sm font-bold text-slate-700 mb-4">Properties</h3>
          {selectedBlock ? (
            <div className="space-y-4">
              
              <div className="bg-slate-50 p-2 text-xs text-slate-500 rounded text-center uppercase tracking-wider font-bold mb-4">
                {selectedBlock.type.replace('_', ' ')}
              </div>

              {/* Common Align */}
              {['text', 'logo', 'barcode', 'qrcode'].includes(selectedBlock.type) && (
                <div>
                  <label className="text-xs font-bold text-slate-600">Alignment</label>
                  <div className="flex gap-2 mt-1">
                    {['left', 'center', 'right'].map(a => (
                      <button key={a} onClick={() => updateSelectedBlock({ align: a as any })} className={`flex-1 py-1.5 text-xs font-medium rounded border ${selectedBlock.align === a ? 'bg-brand-50 border-brand-500 text-brand-700' : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'}`}>
                        {a.charAt(0).toUpperCase() + a.slice(1)}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Text / Content */}
              {['text', 'barcode', 'qrcode'].includes(selectedBlock.type) && (
                <div>
                  <label className="text-xs font-bold text-slate-600">Content / Variables</label>
                  <textarea 
                    value={selectedBlock.content || ''} 
                    onChange={e => updateSelectedBlock({ content: e.target.value })}
                    className="input-sm mt-1 h-20 resize-none font-mono text-xs"
                    placeholder="e.g. {{shop_name}} or Hello"
                  />
                  <p className="text-[10px] text-slate-400 mt-1 leading-tight">Use variables like {'{{shop_name}}, {{invoice_number}}, {{grand_total}}'}</p>
                </div>
              )}

              {/* Font settings */}
              {['text', 'key_value'].includes(selectedBlock.type) && (
                <>
                  <div>
                    <label className="text-xs font-bold text-slate-600">Font Size</label>
                    <select value={selectedBlock.fontSize || 'normal'} onChange={e => updateSelectedBlock({ fontSize: e.target.value as any })} className="input-sm mt-1">
                      <option value="normal">Normal</option>
                      <option value="double_width">Double Width</option>
                      <option value="double_height">Double Height</option>
                      <option value="double_all">Double Width & Height</option>
                    </select>
                  </div>
                  <label className="flex items-center gap-2 text-sm font-medium text-slate-700 cursor-pointer mt-2">
                    <input type="checkbox" checked={selectedBlock.bold || false} onChange={e => updateSelectedBlock({ bold: e.target.checked })} className="rounded border-slate-300 text-brand-600 focus:ring-brand-500" />
                    Bold Text
                  </label>
                </>
              )}

              {/* Key Value Specific */}
              {selectedBlock.type === 'key_value' && (
                <>
                  <div>
                    <label className="text-xs font-bold text-slate-600">Left Text (Label)</label>
                    <input value={selectedBlock.leftText || ''} onChange={e => updateSelectedBlock({ leftText: e.target.value })} className="input-sm mt-1" />
                  </div>
                  <div>
                    <label className="text-xs font-bold text-slate-600">Right Text (Value/Variable)</label>
                    <input value={selectedBlock.rightText || ''} onChange={e => updateSelectedBlock({ rightText: e.target.value })} className="input-sm mt-1" />
                  </div>
                </>
              )}

              {/* Separator Specific */}
              {selectedBlock.type === 'separator' && (
                <div>
                  <label className="text-xs font-bold text-slate-600">Character</label>
                  <select value={selectedBlock.char || '-'} onChange={e => updateSelectedBlock({ char: e.target.value })} className="input-sm mt-1">
                    <option value="-">Dashes (---)</option>
                    <option value="=">Equals (===)</option>
                    <option value="*">Asterisks (***)</option>
                    <option value="_">Underscores (___)</option>
                    <option value=" ">Blank Spaces (   )</option>
                  </select>
                </div>
              )}

              {/* Spacing Specific */}
              {selectedBlock.type === 'spacing' && (
                <div>
                  <label className="text-xs font-bold text-slate-600">Number of lines</label>
                  <input type="number" min="1" max="10" value={selectedBlock.lines || 1} onChange={e => updateSelectedBlock({ lines: parseInt(e.target.value) || 1 })} className="input-sm mt-1" />
                </div>
              )}

              <hr className="border-slate-100 my-4" />

              {/* Visibility Logic */}
              <div>
                <label className="text-xs font-bold text-slate-600 flex items-center justify-between">
                  Conditional Visibility
                  <span className="text-[10px] font-normal text-slate-400">Optional</span>
                </label>
                <input 
                  value={selectedBlock.visibleIf || ''} 
                  onChange={e => updateSelectedBlock({ visibleIf: e.target.value })}
                  placeholder="e.g. tax > 0"
                  className="input-sm mt-1 font-mono text-xs" 
                />
                <p className="text-[10px] text-slate-400 mt-1 leading-tight">Show block only if condition is true. E.g. <code className="bg-slate-100 px-1 rounded">discount &gt; 0</code>, <code className="bg-slate-100 px-1 rounded">customer_name</code></p>
              </div>

            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-40 text-slate-400 text-sm text-center">
              <Settings2 className="w-8 h-8 mb-2 opacity-20" />
              Select an element from the layout to edit its properties
            </div>
          )}
        </div>

      </div>

      {/* Bottom Panel: Live Preview */}
      <div className="card overflow-hidden shrink-0 flex flex-col mb-10">
        <div className="bg-slate-50 border-b border-slate-200 p-3 font-bold text-slate-700 text-sm">
          Receipt Preview ({template.width})
        </div>
        <div className="bg-slate-100 p-8 flex justify-center pb-12">
          {renderPreview()}
        </div>
      </div>

    </div>
  );
}
