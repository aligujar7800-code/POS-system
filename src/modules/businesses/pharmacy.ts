import { BusinessModule } from '../types';

const pharmacyModule: BusinessModule = {
  id: 'pharmacy',
  name: 'Pharmacy & Medical Store',
  nameUrdu: 'فارمیسی اور میڈیکل اسٹور',
  icon: 'Pill',
  description: 'Medicine tracking with generic names, expiry dates, batch numbers, and auto alerts',
  color: 'from-blue-500 to-cyan-500',

  extraFields: [
    {
      key: 'generic_name',
      label: 'Generic Name',
      type: 'text',
      placeholder: 'e.g. Paracetamol',
      helperText: 'Scientific/generic name of the medicine',
    },
    {
      key: 'expiry_date',
      label: 'Expiry Date',
      type: 'date',
      required: true,
      helperText: 'Medicine expiry date — alerts will trigger 30 days before',
    },
    {
      key: 'batch_number',
      label: 'Batch Number',
      type: 'text',
      placeholder: 'e.g. BATCH-2026-001',
      helperText: 'Manufacturer batch/lot number',
    },
    {
      key: 'manufacturer',
      label: 'Manufacturer',
      type: 'text',
      placeholder: 'e.g. GSK, Sanofi',
    },
    {
      key: 'dosage_form',
      label: 'Dosage Form',
      type: 'select',
      options: [
        { value: 'tablet', label: 'Tablet' },
        { value: 'capsule', label: 'Capsule' },
        { value: 'syrup', label: 'Syrup' },
        { value: 'injection', label: 'Injection' },
        { value: 'cream', label: 'Cream/Ointment' },
        { value: 'drops', label: 'Drops' },
        { value: 'inhaler', label: 'Inhaler' },
        { value: 'sachet', label: 'Sachet' },
        { value: 'other', label: 'Other' },
      ],
      defaultValue: 'tablet',
    },
    {
      key: 'requires_prescription',
      label: 'Requires Prescription',
      type: 'checkbox',
      helperText: 'Mark if this medicine requires a prescription',
    },
  ],

  inventoryColumns: [
    { key: 'generic_name', label: 'Generic', width: '120px', render: 'text' },
    {
      key: 'expiry_date',
      label: 'Expiry',
      width: '100px',
      render: 'alert',
    },
    { key: 'batch_number', label: 'Batch', width: '100px', render: 'text' },
    { key: 'dosage_form', label: 'Form', width: '80px', render: 'badge' },
  ],

  units: ['piece', 'strip', 'bottle', 'box', 'tube', 'pack'],
  defaultUnit: 'strip',

  saleFields: [],

  features: ['expiry_alerts'],

  defaultCategories: [
    { name: 'Medicines', children: ['Painkillers', 'Antibiotics', 'Vitamins', 'Cough & Cold', 'Digestive', 'Heart'] },
    { name: 'OTC', children: ['First Aid', 'Bandages', 'Antiseptic', 'Thermometer'] },
    { name: 'Baby Care', children: ['Baby Formula', 'Diapers', 'Baby Medicine'] },
    { name: 'Surgical', children: ['Gloves', 'Masks', 'Syringes', 'Cotton'] },
    { name: 'Cosmetics', children: ['Skin Care', 'Hair Care', 'Dental'] },
  ],

  variantLabel1: 'Strength',
  variantLabel2: 'Pack Size',
  useVariantGrid: false,
};

export default pharmacyModule;
