import { BusinessModule } from '../types';

const bakeryModule: BusinessModule = {
  id: 'bakery',
  name: 'Bakery & Sweets',
  nameUrdu: 'بیکری اور مٹھائی',
  icon: 'CakeSlice',
  description: 'Daily production tracking and freshness status management',
  color: 'from-amber-500 to-yellow-500',
  extraFields: [
    { key: 'production_date', label: 'Production Date', type: 'date', required: true },
    { key: 'shelf_life_hours', label: 'Shelf Life (hours)', type: 'number', placeholder: '48' },
    { key: 'freshness_status', label: 'Freshness', type: 'select', options: [
      { value: 'fresh', label: 'Fresh' }, { value: 'good', label: 'Good' },
      { value: 'expiring', label: 'Expiring Soon' }, { value: 'expired', label: 'Expired' },
    ], defaultValue: 'fresh' },
  ],
  inventoryColumns: [
    { key: 'freshness_status', label: 'Freshness', width: '100px', render: 'badge', badgeColors: {
      fresh: 'bg-green-100 text-green-700', good: 'bg-blue-100 text-blue-700',
      expiring: 'bg-amber-100 text-amber-700', expired: 'bg-red-100 text-red-700',
    }},
    { key: 'production_date', label: 'Produced', width: '100px', render: 'date' },
  ],
  units: ['piece', 'kg', 'dozen', 'box'],
  defaultUnit: 'piece',
  saleFields: [],
  features: ['freshness_tracking', 'expiry_alerts'],
  defaultCategories: [
    { name: 'Bread', children: ['White Bread', 'Brown Bread', 'Buns', 'Rolls'] },
    { name: 'Cakes', children: ['Birthday Cake', 'Pastry', 'Cupcake', 'Brownie'] },
    { name: 'Sweets', children: ['Gulab Jamun', 'Barfi', 'Laddu', 'Jalebi', 'Rasgulla'] },
    { name: 'Cookies', children: ['Biscuits', 'Rusk', 'Puffs'] },
    { name: 'Namkeen', children: ['Samosa', 'Pakora', 'Patties', 'Rolls'] },
  ],
  variantLabel1: 'Flavor',
  variantLabel2: 'Size',
  useVariantGrid: false,
};

export default bakeryModule;
