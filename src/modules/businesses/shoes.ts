import { BusinessModule } from '../types';

const shoeModule: BusinessModule = {
  id: 'shoes',
  name: 'Shoe Store',
  nameUrdu: 'جوتوں کی دکان',
  icon: 'Footprints',
  description: 'Size and color combination tracking with brand-wise inventory',
  color: 'from-stone-500 to-zinc-600',
  extraFields: [],  // Size and color handled via native variant grid
  inventoryColumns: [],
  units: ['pair'],
  defaultUnit: 'pair',
  saleFields: [],
  features: ['size_color_grid'],
  defaultCategories: [
    { name: 'Men', children: ['Formal', 'Casual', 'Sports', 'Sandals', 'Sneakers', 'Boots'] },
    { name: 'Women', children: ['Heels', 'Flats', 'Sandals', 'Sneakers', 'Boots', 'Pumps'] },
    { name: 'Kids', children: ['School Shoes', 'Sports', 'Sandals', 'Sneakers'] },
    { name: 'Accessories', children: ['Socks', 'Insoles', 'Shoe Care', 'Laces'] },
  ],
  variantLabel1: 'Size',
  variantLabel2: 'Color',
  useVariantGrid: true,
};

export default shoeModule;
