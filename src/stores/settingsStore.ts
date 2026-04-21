import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface Settings {
  shop_name: string;
  shop_address: string;
  shop_phone: string;
  shop_logo: string | null;
  shop_email: string;
  tax_rate: number;
  currency_symbol: string;
  receipt_header: string;
  receipt_footer: string;
  printer_type: string;
  printer_port: string;
  printer_baud: number;
  label_printer_port: string;
  label_offset_x: number;
  label_offset_y: number;
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
      shop_logo: null,
      shop_email: '',
      tax_rate: 0,
      currency_symbol: 'Rs.',
      receipt_header: '',
      receipt_footer: 'Thank you for shopping with us!',
      printer_type: 'none',
      printer_port: '',
      printer_baud: 9600,
      label_printer_port: '',
      label_offset_x: 0,
      label_offset_y: 0,
      language: 'en',
      low_stock_threshold: 5,

      setSettings: (s) => set((state) => ({ ...state, ...s })),
      setLanguage: (language) => set({ language }),
    }),
    { name: 'pos-settings' }
  )
);
