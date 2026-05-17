import { BusinessModule } from '../types';

const groceryModule: BusinessModule = {
  id: 'grocery',
  name: 'Kiryana & General Store',
  nameUrdu: 'کریانہ اور جنرل اسٹور',
  icon: 'ShoppingBasket',
  description: 'Loose items, weight-based sale, fast moving item quick buttons',
  color: 'from-green-500 to-emerald-600',

  extraFields: [
    {
      key: 'weight',
      label: 'Weight',
      type: 'number',
      placeholder: 'e.g. 500',
      unit: 'g',
      helperText: 'Weight per unit for loose items',
    },
    {
      key: 'unit_type',
      label: 'Unit Type',
      type: 'select',
      options: [
        { value: 'piece', label: 'Piece' },
        { value: 'gram', label: 'Gram (g)' },
        { value: 'kg', label: 'Kilogram (kg)' },
        { value: 'liter', label: 'Liter (L)' },
        { value: 'ml', label: 'Milliliter (mL)' },
        { value: 'pack', label: 'Pack' },
        { value: 'dozen', label: 'Dozen' },
      ],
      defaultValue: 'piece',
    },
    {
      key: 'is_fast_moving',
      label: 'Fast Moving Item',
      type: 'checkbox',
      helperText: 'Show in quick sale buttons on sale screen',
    },
  ],

  inventoryColumns: [
    { key: 'unit_type', label: 'Unit', width: '80px', render: 'badge' },
    { key: 'weight', label: 'Weight', width: '80px', render: 'text' },
  ],

  units: ['piece', 'gram', 'kg', 'liter', 'ml', 'pack', 'dozen'],
  defaultUnit: 'piece',

  saleFields: [
    {
      key: 'weight_qty',
      label: 'Weight/Qty',
      type: 'number',
      placeholder: 'e.g. 250g',
      showInCart: true,
    },
  ],

  features: ['weight_sale', 'quick_sale'],

  defaultCategories: [
    { name: 'Grocery', children: ['Rice & Flour', 'Spices', 'Oil & Ghee', 'Pulses', 'Sugar & Salt'] },
    { name: 'Beverages', children: ['Cold Drinks', 'Juices', 'Tea & Coffee', 'Water'] },
    { name: 'Dairy', children: ['Milk', 'Yogurt', 'Butter', 'Cheese'] },
    { name: 'Snacks', children: ['Chips', 'Biscuits', 'Namkeen', 'Chocolates'] },
    { name: 'Household', children: ['Cleaning', 'Detergent', 'Tissue', 'Plastic Bags'] },
    { name: 'Personal Care', children: ['Soap', 'Shampoo', 'Toothpaste', 'Cream'] },
  ],

  variantLabel1: 'Pack Size',
  variantLabel2: 'Brand',
  useVariantGrid: false,
};

export default groceryModule;
