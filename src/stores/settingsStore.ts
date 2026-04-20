import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface Settings {
  shop_name: string;
  shop_address: string;
  shop_phone: string;
  tax_rate: number;
  currency_symbol: string;
  receipt_footer: string;
  printer_type: string;
  printer_port: string;
  printer_baud: number;
  label_printer_port: string;
  language: string;
  low_stock_threshold: number;
}

interface SettingsState extends Settings {
  setSettings: (s: Partial<Settings>) => void;
  language: string;
  setLanguage: (lang: string) => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      shop_name: 'Fashion Point',
      shop_address: '123 Main Street, Lahore',
      shop_phone: '+92-300-0000000',
      tax_rate: 0,
      currency_symbol: 'Rs.',
      receipt_footer: 'Thank you for shopping with us!',
      printer_type: 'none',
      printer_port: '',
      printer_baud: 9600,
      label_printer_port: '',
      language: 'en',
      low_stock_threshold: 5,

      setSettings: (s) => set((state) => ({ ...state, ...s })),
      setLanguage: (language) => set({ language }),
    }),
    { name: 'pos-settings' }
  )
);
