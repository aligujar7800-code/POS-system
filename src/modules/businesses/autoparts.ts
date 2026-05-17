import { BusinessModule } from '../types';

const autoPartsModule: BusinessModule = {
  id: 'autoparts',
  name: 'Auto Parts',
  nameUrdu: 'آٹو پارٹس',
  icon: 'Car',
  description: 'Part number tracking with vehicle make/model compatibility',
  color: 'from-slate-600 to-gray-700',
  extraFields: [
    { key: 'part_number', label: 'Part Number', type: 'text', placeholder: 'e.g. OEM-12345' },
    { key: 'vehicle_make', label: 'Vehicle Make', type: 'text', placeholder: 'e.g. Toyota' },
    { key: 'vehicle_model', label: 'Vehicle Model', type: 'text', placeholder: 'e.g. Corolla 2020' },
    { key: 'compatible_vehicles', label: 'Compatible Vehicles', type: 'textarea', placeholder: 'Corolla 2018-2023, Yaris 2020+', helperText: 'Comma-separated list of compatible vehicles' },
    { key: 'oem_or_aftermarket', label: 'Type', type: 'select', options: [
      { value: 'oem', label: 'OEM (Original)' }, { value: 'aftermarket', label: 'Aftermarket' },
      { value: 'used', label: 'Used/Reconditioned' },
    ], defaultValue: 'aftermarket' },
  ],
  inventoryColumns: [
    { key: 'part_number', label: 'Part #', width: '100px', render: 'text' },
    { key: 'vehicle_make', label: 'Make', width: '80px', render: 'text' },
    { key: 'vehicle_model', label: 'Model', width: '100px', render: 'text' },
  ],
  units: ['piece', 'set', 'pair', 'liter'],
  defaultUnit: 'piece',
  saleFields: [
    { key: 'vehicle_reg', label: 'Vehicle Reg #', type: 'text', placeholder: 'LHR-1234', showInCart: false },
  ],
  features: ['vehicle_compat'],
  defaultCategories: [
    { name: 'Engine Parts', children: ['Oil Filter', 'Air Filter', 'Spark Plugs', 'Belts', 'Gaskets'] },
    { name: 'Brakes', children: ['Brake Pads', 'Brake Disc', 'Brake Fluid', 'Calipers'] },
    { name: 'Suspension', children: ['Shock Absorbers', 'Springs', 'Ball Joints', 'Bushings'] },
    { name: 'Electrical', children: ['Battery', 'Alternator', 'Starter Motor', 'Lights', 'Wiring'] },
    { name: 'Body Parts', children: ['Bumpers', 'Mirrors', 'Fenders', 'Door Handles'] },
    { name: 'Oils & Fluids', children: ['Engine Oil', 'Coolant', 'Transmission Fluid', 'Power Steering'] },
  ],
  variantLabel1: 'Size',
  variantLabel2: 'Side (L/R)',
  useVariantGrid: false,
};

export default autoPartsModule;
