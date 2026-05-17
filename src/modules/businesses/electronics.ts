import { BusinessModule } from '../types';

const electronicsModule: BusinessModule = {
  id: 'electronics',
  name: 'Electronics Store',
  nameUrdu: 'الیکٹرانکس اسٹور',
  icon: 'Monitor',
  description: 'IMEI tracking, warranty dates, brand-wise filtering',
  color: 'from-blue-600 to-indigo-600',
  extraFields: [
    { key: 'imei_number', label: 'IMEI / Serial Number', type: 'text', placeholder: '35-209900-176148-1' },
    { key: 'warranty_date', label: 'Warranty Expiry', type: 'date' },
    { key: 'warranty_months', label: 'Warranty (months)', type: 'number', placeholder: '12' },
    { key: 'model_number', label: 'Model Number', type: 'text', placeholder: 'SM-A545F' },
  ],
  inventoryColumns: [
    { key: 'imei_number', label: 'IMEI/Serial', width: '140px', render: 'text' },
    { key: 'warranty_date', label: 'Warranty', width: '100px', render: 'date' },
  ],
  units: ['piece'],
  defaultUnit: 'piece',
  saleFields: [
    { key: 'imei_sold', label: 'IMEI/Serial', type: 'text', placeholder: 'Enter IMEI', showInCart: true },
  ],
  features: ['imei_tracking'],
  defaultCategories: [
    { name: 'Mobile Phones', children: ['Samsung', 'iPhone', 'Xiaomi', 'Oppo'] },
    { name: 'Laptops', children: ['HP', 'Dell', 'Lenovo', 'Asus'] },
    { name: 'TV & Display', children: ['LED TV', 'Smart TV', 'Monitor'] },
    { name: 'Accessories', children: ['Chargers', 'Cables', 'Cases', 'Earphones'] },
    { name: 'Home Appliance', children: ['Fan', 'Iron', 'Blender'] },
  ],
  variantLabel1: 'Color',
  variantLabel2: 'Storage',
  useVariantGrid: false,
};

export default electronicsModule;
