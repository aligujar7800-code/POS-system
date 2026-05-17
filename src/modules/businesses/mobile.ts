import { BusinessModule } from '../types';

const mobileModule: BusinessModule = {
  id: 'mobile',
  name: 'Mobile & Phone Shop',
  nameUrdu: 'موبائل اور فون کی دکان',
  icon: 'Smartphone',
  description: 'IMEI tracking, network status, accessories management',
  color: 'from-violet-500 to-purple-600',
  extraFields: [
    { key: 'imei', label: 'IMEI Number', type: 'text', placeholder: '35-209900-176148-1' },
    { key: 'imei2', label: 'IMEI 2 (Dual SIM)', type: 'text', placeholder: 'Second IMEI' },
    { key: 'network_status', label: 'Network Status', type: 'select', options: [
      { value: 'unlocked', label: 'Unlocked' }, { value: 'locked', label: 'Locked' },
      { value: 'pta_approved', label: 'PTA Approved' }, { value: 'non_pta', label: 'Non-PTA' },
    ], defaultValue: 'pta_approved' },
    { key: 'storage_gb', label: 'Storage (GB)', type: 'number', placeholder: '128' },
    { key: 'ram_gb', label: 'RAM (GB)', type: 'number', placeholder: '8' },
    { key: 'is_accessory', label: 'Is Accessory', type: 'checkbox', helperText: 'Charger, case, screen guard, etc.' },
  ],
  inventoryColumns: [
    { key: 'imei', label: 'IMEI', width: '140px', render: 'text' },
    { key: 'network_status', label: 'Network', width: '90px', render: 'badge', badgeColors: {
      pta_approved: 'bg-green-100 text-green-700', non_pta: 'bg-red-100 text-red-700',
      unlocked: 'bg-blue-100 text-blue-700', locked: 'bg-amber-100 text-amber-700',
    }},
  ],
  units: ['piece'],
  defaultUnit: 'piece',
  saleFields: [
    { key: 'imei_sold', label: 'IMEI', type: 'text', placeholder: 'Enter IMEI', showInCart: true },
  ],
  features: ['imei_tracking'],
  defaultCategories: [
    { name: 'New Phones', children: ['Samsung', 'iPhone', 'Xiaomi', 'Oppo', 'Vivo', 'Infinix'] },
    { name: 'Used Phones', children: ['Flagship', 'Mid Range', 'Budget'] },
    { name: 'Accessories', children: ['Chargers', 'Cases', 'Screen Guard', 'Earphones', 'Power Bank'] },
    { name: 'Parts', children: ['Screens', 'Batteries', 'Speakers', 'Flex Cables'] },
    { name: 'Tablets', children: ['iPad', 'Samsung Tab', 'Other'] },
  ],
  variantLabel1: 'Color',
  variantLabel2: 'Storage',
  useVariantGrid: false,
};

export default mobileModule;
