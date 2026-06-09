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
  label_printer_protocol: 'epl' | 'zpl' | 'tspl';
  label_offset_x: number;
  label_offset_y: number;
  label_barcode_width: number;
  label_barcode_height: number;
  label_font_size: number;
  label_mrp_line_offset: number;
  language: string;
  low_stock_threshold: number;
  logo_width: number;
  logo_height: number;
  logo_align: 'left' | 'center' | 'right';
  receipt_font: string;
  voice_simple_mode: boolean;
  voice_full_mode: boolean;
  voice_model_ready: boolean;
  voice_custom_commands: string; // JSON string of custom commands
  smart_product_import: boolean;
  camera_sale_mode: boolean;
  camera_scan_interval: number;
}

interface SettingsState extends Settings {
  setSettings: (s: Partial<Settings>) => void;
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
      label_printer_protocol: 'epl',
      label_offset_x: 0,
      label_offset_y: 0,
      label_barcode_width: 2,
      label_barcode_height: 50,
      label_font_size: 3,
      label_mrp_line_offset: 12,
      language: 'en',
      low_stock_threshold: 5,
      logo_width: 120,
      logo_height: 120,
      logo_align: 'center' as const,
      receipt_font: "'Courier New', Courier, monospace",
      voice_simple_mode: false,
      voice_full_mode: false,
      voice_model_ready: false,
      voice_custom_commands: '{"simple":{},"full":{}}',
      smart_product_import: false,
      camera_sale_mode: false,
      camera_scan_interval: 2000,

      setSettings: (s) => set((state) => ({ ...state, ...s })),
      setLanguage: (language) => set({ language }),
    }),
    { name: 'pos-settings' }
  )
);
