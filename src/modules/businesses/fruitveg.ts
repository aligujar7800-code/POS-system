import { BusinessModule } from '../types';

const fruitVegModule: BusinessModule = {
  id: 'fruitveg',
  name: 'Fruit & Vegetable',
  nameUrdu: 'پھل اور سبزی',
  icon: 'Apple',
  description: 'Daily rate changes, weight-based sales, perishable item alerts',
  color: 'from-lime-500 to-green-600',
  extraFields: [
    { key: 'daily_rate', label: 'Today\'s Rate (per kg)', type: 'number', placeholder: 'e.g. 250' },
    { key: 'is_perishable', label: 'Perishable', type: 'checkbox', defaultValue: true, helperText: 'Get alerts when stock is old' },
    { key: 'shelf_life_days', label: 'Shelf Life (days)', type: 'number', placeholder: '3', helperText: 'Days before item goes bad' },
    { key: 'origin', label: 'Origin', type: 'text', placeholder: 'e.g. Local, Imported' },
    { key: 'grade', label: 'Grade', type: 'select', options: [
      { value: 'a', label: 'Grade A (Premium)' }, { value: 'b', label: 'Grade B (Standard)' },
      { value: 'c', label: 'Grade C (Economy)' },
    ], defaultValue: 'b' },
  ],
  inventoryColumns: [
    { key: 'daily_rate', label: 'Rate/kg', width: '80px', render: 'text' },
    { key: 'grade', label: 'Grade', width: '70px', render: 'badge', badgeColors: {
      a: 'bg-green-100 text-green-700', b: 'bg-blue-100 text-blue-700', c: 'bg-amber-100 text-amber-700',
    }},
  ],
  units: ['kg', 'dozen', 'piece', 'crate'],
  defaultUnit: 'kg',
  saleFields: [
    { key: 'weight_kg', label: 'Weight (kg)', type: 'number', placeholder: '0.5', showInCart: true },
  ],
  features: ['weight_sale', 'daily_rate', 'expiry_alerts'],
  defaultCategories: [
    { name: 'Fruits', children: ['Apple', 'Banana', 'Mango', 'Orange', 'Grapes', 'Watermelon'] },
    { name: 'Vegetables', children: ['Potato', 'Tomato', 'Onion', 'Spinach', 'Carrot', 'Capsicum'] },
    { name: 'Seasonal', children: ['Summer Fruits', 'Winter Vegetables', 'Dry Fruits'] },
    { name: 'Herbs', children: ['Mint', 'Coriander', 'Ginger', 'Garlic', 'Green Chili'] },
  ],
  variantLabel1: 'Grade',
  variantLabel2: 'Origin',
  useVariantGrid: false,
};

export default fruitVegModule;
