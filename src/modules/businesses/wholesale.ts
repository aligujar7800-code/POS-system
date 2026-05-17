import { BusinessModule } from '../types';

const wholesaleModule: BusinessModule = {
  id: 'wholesale',
  name: 'Wholesale & Distribution',
  nameUrdu: 'ہول سیل اور ڈسٹری بیوشن',
  icon: 'Warehouse',
  description: 'Minimum order quantities, retailer-wise pricing, automatic bulk discounts',
  color: 'from-indigo-500 to-blue-600',
  extraFields: [
    { key: 'min_order_qty', label: 'Minimum Order Qty', type: 'number', placeholder: '10', helperText: 'Minimum quantity per order' },
    { key: 'retailer_price', label: 'Retailer Price', type: 'number', placeholder: '0', helperText: 'Special price for registered retailers' },
    { key: 'wholesale_price', label: 'Wholesale Price', type: 'number', placeholder: '0' },
    { key: 'carton_qty', label: 'Units per Carton', type: 'number', placeholder: '24' },
    { key: 'bulk_tier1_qty', label: 'Tier 1 Qty', type: 'number', placeholder: '50' },
    { key: 'bulk_tier1_discount', label: 'Tier 1 Discount %', type: 'number', placeholder: '5' },
    { key: 'bulk_tier2_qty', label: 'Tier 2 Qty', type: 'number', placeholder: '100' },
    { key: 'bulk_tier2_discount', label: 'Tier 2 Discount %', type: 'number', placeholder: '10' },
  ],
  inventoryColumns: [
    { key: 'min_order_qty', label: 'MOQ', width: '60px', render: 'text' },
    { key: 'carton_qty', label: 'Ctn', width: '50px', render: 'text' },
  ],
  units: ['piece', 'carton', 'dozen', 'pack', 'kg', 'box'],
  defaultUnit: 'carton',
  saleFields: [
    { key: 'retailer_tier', label: 'Customer Tier', type: 'select', options: [
      { value: 'walk_in', label: 'Walk-In' }, { value: 'retailer', label: 'Retailer' },
      { value: 'distributor', label: 'Distributor' },
    ], defaultValue: 'walk_in', showInCart: false },
  ],
  features: ['bulk_discount', 'tiered_pricing'],
  defaultCategories: [
    { name: 'FMCG', children: ['Snacks', 'Beverages', 'Dairy', 'Personal Care'] },
    { name: 'Grocery', children: ['Rice', 'Flour', 'Oil', 'Spices', 'Sugar'] },
    { name: 'Household', children: ['Cleaning', 'Paper', 'Plastic'] },
    { name: 'Confectionery', children: ['Chocolates', 'Candies', 'Gum', 'Biscuits'] },
  ],
  variantLabel1: 'Pack Size',
  variantLabel2: 'Variant',
  useVariantGrid: false,
};

export default wholesaleModule;
