import { BusinessModule } from '../types';

const restaurantModule: BusinessModule = {
  id: 'restaurant',
  name: 'Restaurant & Food',
  nameUrdu: 'ریستوران اور کھانا',
  icon: 'UtensilsCrossed',
  description: 'Table management, order types (dine-in, takeaway, delivery), category-wise menu',
  color: 'from-red-500 to-orange-500',

  extraFields: [
    {
      key: 'prep_time',
      label: 'Prep Time (min)',
      type: 'number',
      placeholder: 'e.g. 15',
      helperText: 'Average preparation time in minutes',
    },
    {
      key: 'is_veg',
      label: 'Vegetarian',
      type: 'checkbox',
    },
    {
      key: 'spice_level',
      label: 'Spice Level',
      type: 'select',
      options: [
        { value: 'mild', label: 'Mild' },
        { value: 'medium', label: 'Medium' },
        { value: 'hot', label: 'Hot' },
        { value: 'extra_hot', label: 'Extra Hot' },
      ],
      defaultValue: 'medium',
    },
  ],

  inventoryColumns: [
    { key: 'prep_time', label: 'Prep', width: '60px', render: 'text' },
    { key: 'spice_level', label: 'Spice', width: '80px', render: 'badge', badgeColors: {
      mild: 'bg-green-100 text-green-700',
      medium: 'bg-yellow-100 text-yellow-700',
      hot: 'bg-orange-100 text-orange-700',
      extra_hot: 'bg-red-100 text-red-700',
    }},
  ],

  units: ['piece', 'plate', 'serving'],
  defaultUnit: 'plate',

  saleFields: [
    {
      key: 'table_number',
      label: 'Table #',
      type: 'number',
      placeholder: 'Table No.',
      showInCart: false,
    },
    {
      key: 'order_type',
      label: 'Order Type',
      type: 'select',
      options: [
        { value: 'dine_in', label: 'Dine-In' },
        { value: 'takeaway', label: 'Takeaway' },
        { value: 'delivery', label: 'Delivery' },
      ],
      defaultValue: 'dine_in',
      showInCart: false,
    },
  ],

  features: ['table_management'],

  defaultCategories: [
    { name: 'Main Course', children: ['Biryani', 'Karahi', 'BBQ', 'Handi', 'Rice Dishes'] },
    { name: 'Beverages', children: ['Cold Drinks', 'Fresh Juice', 'Tea', 'Lassi', 'Shake'] },
    { name: 'Starters', children: ['Soup', 'Salad', 'Tikka', 'Samosa', 'Pakora'] },
    { name: 'Desserts', children: ['Kheer', 'Gulab Jamun', 'Ice Cream', 'Halwa'] },
    { name: 'Fast Food', children: ['Burger', 'Pizza', 'Sandwich', 'Fries', 'Rolls'] },
    { name: 'Breads', children: ['Naan', 'Roti', 'Paratha', 'Kulcha'] },
  ],

  variantLabel1: 'Size',
  variantLabel2: 'Flavor',
  useVariantGrid: false,
};

export default restaurantModule;
