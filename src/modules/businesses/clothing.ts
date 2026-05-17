import { BusinessModule } from '../types';

const clothingModule: BusinessModule = {
  id: 'clothing',
  name: 'Clothing & Fashion',
  nameUrdu: 'کپڑے اور فیشن',
  icon: 'Shirt',
  description: 'Garments store with size, color variants and category management',
  color: 'from-purple-500 to-pink-500',

  extraFields: [],  // Size & color are handled by the native variant grid
  
  inventoryColumns: [],  // variant_summary already shown natively

  units: ['piece'],
  defaultUnit: 'piece',

  saleFields: [],  // No extra sale fields needed — variant picker handles it

  features: ['size_color_grid'],

  defaultCategories: [
    { name: 'Men', children: ['Shirts', 'Trousers', 'Suits', 'Kurta', 'T-Shirts', 'Jeans'] },
    { name: 'Women', children: ['Shirts', 'Trousers', 'Kurta', 'Dupatta', 'Frocks', 'Jeans'] },
    { name: 'Kids', children: ['Shirts', 'Trousers', 'Frocks', 'T-Shirts', 'Shorts', 'Jeans'] },
  ],

  variantLabel1: 'Size',
  variantLabel2: 'Color',
  useVariantGrid: true,
};

export default clothingModule;
