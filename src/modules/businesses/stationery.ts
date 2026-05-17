import { BusinessModule } from '../types';

const stationeryModule: BusinessModule = {
  id: 'stationery',
  name: 'Stationery & Books',
  nameUrdu: 'اسٹیشنری اور کتابیں',
  icon: 'BookOpen',
  description: 'Item-wise stock with school season bulk sale mode',
  color: 'from-teal-500 to-cyan-600',
  extraFields: [
    { key: 'is_seasonal', label: 'School Season Item', type: 'checkbox', helperText: 'Mark for bulk sale during school season' },
    { key: 'pack_size', label: 'Pack Size', type: 'number', placeholder: 'e.g. 12' },
    { key: 'grade_level', label: 'Grade/Class', type: 'text', placeholder: 'e.g. Class 5-8' },
  ],
  inventoryColumns: [
    { key: 'pack_size', label: 'Pack', width: '60px', render: 'text' },
  ],
  units: ['piece', 'pack', 'dozen', 'ream', 'set'],
  defaultUnit: 'piece',
  saleFields: [],
  features: ['seasonal_bulk'],
  defaultCategories: [
    { name: 'Books', children: ['Textbooks', 'Notebooks', 'Registers', 'Drawing Books'] },
    { name: 'Writing', children: ['Pens', 'Pencils', 'Markers', 'Highlighters', 'Erasers'] },
    { name: 'Paper', children: ['A4 Paper', 'Chart Paper', 'Colored Paper', 'Carbon Paper'] },
    { name: 'Art & Craft', children: ['Colors', 'Brushes', 'Glue', 'Scissors', 'Clay'] },
    { name: 'Office', children: ['Files', 'Folders', 'Tape', 'Stapler', 'Stamps'] },
    { name: 'Bags', children: ['School Bags', 'Lunch Boxes', 'Water Bottles'] },
  ],
  variantLabel1: 'Size',
  variantLabel2: 'Type',
  useVariantGrid: false,
};

export default stationeryModule;
