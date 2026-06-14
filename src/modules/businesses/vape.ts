import { BusinessModule } from '../types';

const vapeModule: BusinessModule = {
  id: 'vape',
  name: 'Pods & Vape Shop',
  nameUrdu: 'پوڈز اور ویپ شاپ',
  icon: 'Cigarette', // Wait, Cigarette might not exist in Lucide. Let's use 'Cigarette' or 'Cloud'
  description: 'Vape shop tracking juice in ML, with full bottle or loose filling options',
  color: 'from-fuchsia-500 to-indigo-500',

  extraFields: [
    { 
      key: 'vape_product_type', 
      label: 'Product Type', 
      type: 'select', 
      options: [{value: 'juice', label: 'Flavours & Juice'}, {value: 'device', label: 'Pod Device'}], 
      defaultValue: 'juice' 
    },
    { key: 'per_ml_cost', label: 'Per-ML Cost Rate', type: 'number', placeholder: 'e.g. 5.00' },
    { key: 'per_ml_sale', label: 'Per-ML Sale Rate', type: 'number', placeholder: 'e.g. 10.00' },
  ],

  inventoryColumns: [],

  units: ['ML', 'Bottle', 'Pod'],
  defaultUnit: 'ML',

  saleFields: [],

  features: ['size_color_grid', 'vape_sale_mode'],

  defaultCategories: [
    { name: 'Vape Juices', children: ['Freebase', 'Nic Salt'] },
    { name: 'Devices', children: ['Pod Kits', 'Mod Kits', 'Disposables'] },
    { name: 'Accessories', children: ['Coils', 'Cartridges', 'Batteries'] },
  ],

  variantLabel1: 'Size (ML)',
  variantLabel2: 'Flavour',
  useVariantGrid: true,
};

export default vapeModule;
