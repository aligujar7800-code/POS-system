import { BusinessModule } from '../types';

const hardwareModule: BusinessModule = {
  id: 'hardware',
  name: 'Hardware Store',
  nameUrdu: 'ہارڈویئر اسٹور',
  icon: 'Wrench',
  description: 'Hardware items with length units, bulk discounts, supplier tracking',
  color: 'from-orange-500 to-amber-600',

  extraFields: [
    {
      key: 'length_value',
      label: 'Length / Size',
      type: 'number',
      placeholder: 'e.g. 10',
      helperText: 'Length or dimension of the item',
    },
    {
      key: 'length_unit',
      label: 'Measurement Unit',
      type: 'select',
      options: [
        { value: 'piece', label: 'Piece' },
        { value: 'feet', label: 'Feet' },
        { value: 'meter', label: 'Meter' },
        { value: 'inch', label: 'Inch' },
        { value: 'kg', label: 'Kilogram' },
        { value: 'set', label: 'Set' },
      ],
      defaultValue: 'piece',
    },
    {
      key: 'bulk_discount_qty',
      label: 'Bulk Discount Qty',
      type: 'number',
      placeholder: 'Min qty for discount',
      helperText: 'Minimum quantity to trigger bulk discount',
    },
    {
      key: 'bulk_discount_percent',
      label: 'Bulk Discount %',
      type: 'number',
      placeholder: 'e.g. 10',
      helperText: 'Discount percentage for bulk purchase',
    },
  ],

  inventoryColumns: [
    { key: 'length_unit', label: 'Unit', width: '80px', render: 'badge' },
    { key: 'length_value', label: 'Size', width: '80px', render: 'text' },
  ],

  units: ['piece', 'feet', 'meter', 'inch', 'kg', 'set'],
  defaultUnit: 'piece',

  saleFields: [
    {
      key: 'length_qty',
      label: 'Length/Qty',
      type: 'number',
      placeholder: 'feet/meters',
      showInCart: true,
    },
  ],

  features: ['bulk_discount'],

  defaultCategories: [
    { name: 'Pipes & Fittings', children: ['PVC Pipes', 'GI Pipes', 'Fittings', 'Valves'] },
    { name: 'Electrical', children: ['Wires', 'Switches', 'MCBs', 'Lights'] },
    { name: 'Paint & Finishing', children: ['Paints', 'Brushes', 'Sandpaper', 'Putty'] },
    { name: 'Tools', children: ['Hand Tools', 'Power Tools', 'Measuring', 'Cutting'] },
    { name: 'Fasteners', children: ['Screws', 'Nails', 'Bolts', 'Anchors'] },
    { name: 'Sanitary', children: ['Taps', 'Showers', 'Commodes', 'Sinks'] },
  ],

  variantLabel1: 'Size/Length',
  variantLabel2: 'Type',
  useVariantGrid: false,
};

export default hardwareModule;
