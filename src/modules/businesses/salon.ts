import { BusinessModule } from '../types';

const salonModule: BusinessModule = {
  id: 'salon',
  name: 'Salon & Beauty Parlor',
  nameUrdu: 'سیلون اور بیوٹی پارلر',
  icon: 'Scissors',
  description: 'Service type selection, staff assignment, and service time tracking',
  color: 'from-pink-500 to-rose-500',

  extraFields: [
    {
      key: 'service_type',
      label: 'Service Type',
      type: 'select',
      options: [
        { value: 'haircut', label: 'Haircut' },
        { value: 'color', label: 'Hair Color' },
        { value: 'facial', label: 'Facial' },
        { value: 'manicure', label: 'Manicure' },
        { value: 'pedicure', label: 'Pedicure' },
        { value: 'waxing', label: 'Waxing' },
        { value: 'threading', label: 'Threading' },
        { value: 'makeup', label: 'Makeup' },
        { value: 'massage', label: 'Massage' },
        { value: 'bridal', label: 'Bridal Package' },
        { value: 'other', label: 'Other' },
      ],
      defaultValue: 'haircut',
    },
    {
      key: 'duration_minutes',
      label: 'Duration (minutes)',
      type: 'number',
      placeholder: 'e.g. 30',
      helperText: 'Average service duration',
    },
    {
      key: 'staff_required',
      label: 'Staff Required',
      type: 'number',
      placeholder: '1',
      defaultValue: 1,
    },
  ],

  inventoryColumns: [
    { key: 'service_type', label: 'Service', width: '100px', render: 'badge' },
    { key: 'duration_minutes', label: 'Duration', width: '80px', render: 'text' },
  ],

  units: ['service'],
  defaultUnit: 'service',

  saleFields: [
    {
      key: 'staff_member',
      label: 'Staff Member',
      type: 'text',
      placeholder: 'Assign staff',
      showInCart: true,
    },
    {
      key: 'service_start',
      label: 'Start Time',
      type: 'time',
      showInCart: false,
    },
    {
      key: 'service_end',
      label: 'End Time',
      type: 'time',
      showInCart: false,
    },
  ],

  features: ['staff_assignment'],

  defaultCategories: [
    { name: 'Hair Services', children: ['Haircut', 'Hair Color', 'Blowdry', 'Straightening', 'Keratin'] },
    { name: 'Skin Care', children: ['Facial', 'Cleanup', 'Bleach', 'Mask'] },
    { name: 'Nail Services', children: ['Manicure', 'Pedicure', 'Nail Art', 'Gel Nails'] },
    { name: 'Body Services', children: ['Waxing', 'Threading', 'Massage', 'Scrub'] },
    { name: 'Bridal', children: ['Bridal Makeup', 'Mehndi', 'Hair Styling', 'Package'] },
    { name: 'Products', children: ['Shampoo', 'Conditioner', 'Serum', 'Tools'] },
  ],

  variantLabel1: 'Duration',
  variantLabel2: 'Level',
  useVariantGrid: false,
};

export default salonModule;
