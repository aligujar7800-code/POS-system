import { BusinessModule } from '../types';

const dairyModule: BusinessModule = {
  id: 'dairy',
  name: 'Dairy & Milk Shop',
  nameUrdu: 'ڈیری اور دودھ کی دکان',
  icon: 'Milk',
  description: 'AM/PM delivery tracking, customer-wise monthly account',
  color: 'from-sky-400 to-blue-500',
  extraFields: [
    { key: 'delivery_type', label: 'Delivery Type', type: 'select', options: [
      { value: 'morning', label: 'Morning (AM)' }, { value: 'evening', label: 'Evening (PM)' },
      { value: 'both', label: 'Both' }, { value: 'shop', label: 'Shop Only' },
    ], defaultValue: 'both' },
    { key: 'fat_percentage', label: 'Fat %', type: 'number', placeholder: '3.5' },
  ],
  inventoryColumns: [
    { key: 'delivery_type', label: 'Delivery', width: '90px', render: 'badge' },
  ],
  units: ['liter', 'kg', 'piece', 'pack'],
  defaultUnit: 'liter',
  saleFields: [
    { key: 'delivery_time', label: 'Delivery', type: 'select', options: [
      { value: 'morning', label: 'Morning' }, { value: 'evening', label: 'Evening' },
    ], defaultValue: 'morning', showInCart: true },
  ],
  features: ['delivery_tracking', 'monthly_hisaab', 'weight_sale'],
  defaultCategories: [
    { name: 'Milk', children: ['Fresh Milk', 'Pasteurized', 'Flavored'] },
    { name: 'Yogurt', children: ['Plain', 'Sweetened', 'Lassi'] },
    { name: 'Butter & Ghee', children: ['Butter', 'Desi Ghee', 'Cream'] },
    { name: 'Cheese', children: ['Paneer', 'Mozzarella', 'Cheddar'] },
  ],
  variantLabel1: 'Pack Size',
  variantLabel2: 'Fat Level',
  useVariantGrid: false,
};

export default dairyModule;
