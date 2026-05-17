/**
 * BusinessTypeSelector — Settings panel for choosing the active business type.
 * Displays all registered modules as visual cards.
 * Saves selection to both Zustand store and SQLite settings.
 */

import React, { useState } from 'react';
import { getAllModules } from '../../modules/registry';
import { useBusinessStore } from '../../stores/businessStore';
import { cmd } from '../../lib/utils';
import { useToast } from '../ui/Toaster';
import {
  Shirt, ShoppingBasket, Wrench, Pill, UtensilsCrossed, Scissors,
  Monitor, CakeSlice, Milk, Smartphone, Footprints, BookOpen,
  Car, Apple, Warehouse, Check, AlertTriangle, Store
} from 'lucide-react';

// Map icon name strings to actual Lucide components
const iconMap: Record<string, React.ReactNode> = {
  Shirt: <Shirt className="w-6 h-6" />,
  ShoppingBasket: <ShoppingBasket className="w-6 h-6" />,
  Wrench: <Wrench className="w-6 h-6" />,
  Pill: <Pill className="w-6 h-6" />,
  UtensilsCrossed: <UtensilsCrossed className="w-6 h-6" />,
  Scissors: <Scissors className="w-6 h-6" />,
  Monitor: <Monitor className="w-6 h-6" />,
  CakeSlice: <CakeSlice className="w-6 h-6" />,
  Milk: <Milk className="w-6 h-6" />,
  Smartphone: <Smartphone className="w-6 h-6" />,
  Footprints: <Footprints className="w-6 h-6" />,
  BookOpen: <BookOpen className="w-6 h-6" />,
  Car: <Car className="w-6 h-6" />,
  Apple: <Apple className="w-6 h-6" />,
  Warehouse: <Warehouse className="w-6 h-6" />,
};

export default function BusinessTypeSelector() {
  const { businessType, setBusinessType } = useBusinessStore();
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);
  const [pendingType, setPendingType] = useState<string | null>(null);

  const modules = getAllModules();

  const handleSelect = async (moduleId: string) => {
    if (moduleId === businessType) return;

    setPendingType(moduleId);
  };

  const confirmChange = async () => {
    if (!pendingType) return;
    setSaving(true);
    try {
      // Save to SQLite settings
      await cmd('set_many_settings', {
        map: { business_type: pendingType }
      });

      // Update Zustand store
      setBusinessType(pendingType);
      
      toast(`Business type changed to "${modules.find(m => m.id === pendingType)?.name}". Sale and Inventory screens will now show relevant fields.`, 'success');
      setPendingType(null);
    } catch (e: any) {
      toast(e.toString(), 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Current business info */}
      <div className="bg-gradient-to-r from-brand-50 to-purple-50 border border-brand-100 rounded-2xl p-5">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 rounded-xl bg-brand-600 flex items-center justify-center text-white">
            {iconMap[modules.find(m => m.id === businessType)?.icon || 'Store'] || <Store className="w-6 h-6" />}
          </div>
          <div>
            <h3 className="font-bold text-slate-800 text-lg">
              {modules.find(m => m.id === businessType)?.name || 'Clothing & Fashion'}
            </h3>
            <p className="text-xs text-slate-500">
              {modules.find(m => m.id === businessType)?.description}
            </p>
          </div>
        </div>
        <p className="text-xs text-slate-400 mt-2">
          Currently active. Sale screen, inventory, and product forms are configured for this business type.
        </p>
      </div>

      {/* Module Grid */}
      <div>
        <h3 className="font-bold text-slate-700 mb-3 flex items-center gap-2">
          <Store className="w-4 h-4 text-brand-600" />
          Select Your Business Type
        </h3>
        <p className="text-xs text-slate-400 mb-4">
          Choose the type that best matches your business. This configures which extra fields appear on sale and inventory screens.
          Core features (reports, backup, sync, accounts) remain the same for all types.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {modules.map((mod) => {
            const isActive = mod.id === businessType;
            const isPending = mod.id === pendingType;

            return (
              <button
                key={mod.id}
                onClick={() => handleSelect(mod.id)}
                className={`relative text-left p-4 rounded-xl border-2 transition-all duration-200 ${
                  isActive
                    ? 'border-brand-500 bg-brand-50/50 shadow-md shadow-brand-100'
                    : isPending
                    ? 'border-amber-400 bg-amber-50/50 shadow-md shadow-amber-100'
                    : 'border-slate-200 bg-white hover:border-brand-200 hover:shadow-sm'
                }`}
              >
                {/* Active badge */}
                {isActive && (
                  <div className="absolute top-2 right-2">
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-brand-600 text-white text-[10px] font-bold">
                      <Check className="w-3 h-3" /> Active
                    </span>
                  </div>
                )}

                <div className="flex items-start gap-3">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${
                    isActive
                      ? 'bg-brand-600 text-white'
                      : 'bg-gradient-to-br ' + mod.color + ' text-white'
                  }`}>
                    {iconMap[mod.icon] || <Store className="w-6 h-6" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className={`font-bold text-sm ${isActive ? 'text-brand-700' : 'text-slate-800'}`}>
                      {mod.name}
                    </p>
                    <p className="text-[10px] text-slate-400 font-medium">{mod.nameUrdu}</p>
                    <p className="text-[11px] text-slate-500 mt-1 line-clamp-2">{mod.description}</p>
                    
                    {/* Feature pills */}
                    <div className="flex flex-wrap gap-1 mt-2">
                      {mod.units.slice(0, 3).map(u => (
                        <span key={u} className="px-1.5 py-0.5 bg-slate-100 text-slate-500 text-[9px] rounded font-medium">
                          {u}
                        </span>
                      ))}
                      {mod.extraFields.length > 0 && (
                        <span className="px-1.5 py-0.5 bg-blue-50 text-blue-600 text-[9px] rounded font-medium">
                          +{mod.extraFields.length} fields
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Confirmation dialog */}
      {pendingType && pendingType !== businessType && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setPendingType(null)} />
          <div className="relative bg-white rounded-2xl shadow-2xl p-6 max-w-md mx-4 animate-in fade-in zoom-in-95">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 rounded-xl bg-amber-100 flex items-center justify-center text-amber-600">
                <AlertTriangle className="w-6 h-6" />
              </div>
              <div>
                <h3 className="font-bold text-slate-800">Change Business Type?</h3>
                <p className="text-xs text-slate-500">This will reconfigure your POS screens</p>
              </div>
            </div>

            <div className="bg-slate-50 rounded-xl p-4 mb-4 space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-slate-500">From:</span>
                <span className="font-bold text-slate-700">
                  {modules.find(m => m.id === businessType)?.name}
                </span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-slate-500">To:</span>
                <span className="font-bold text-brand-600">
                  {modules.find(m => m.id === pendingType)?.name}
                </span>
              </div>
            </div>

            <p className="text-xs text-slate-500 mb-4">
              Your existing data (products, sales, reports) will remain intact.
              Only the extra fields on sale and inventory screens will change.
            </p>

            <div className="flex gap-3">
              <button
                onClick={confirmChange}
                disabled={saving}
                className="btn-primary flex-1"
              >
                {saving ? (
                  <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  <Check className="w-4 h-4" />
                )}
                Confirm Change
              </button>
              <button
                onClick={() => setPendingType(null)}
                className="btn-secondary flex-1"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
