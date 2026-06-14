/**
 * Core type definitions for the modular business plugin system.
 * Each business type implements the BusinessModule interface.
 * The core engine uses these types to dynamically render
 * extra fields, columns, and features per business.
 */

// ─── Field Types ────────────────────────────────────────────────────────────

export type FieldType =
  | 'text'
  | 'number'
  | 'date'
  | 'select'
  | 'textarea'
  | 'time'
  | 'checkbox';

/**
 * An extra field that a business module injects into the Product Form.
 * Stored in `products.product_meta` as JSON.
 */
export interface ExtraField {
  key: string;            // JSON key in product_meta
  label: string;          // Display label (English)
  labelUrdu?: string;     // Urdu display label
  type: FieldType;
  placeholder?: string;
  required?: boolean;
  defaultValue?: string | number | boolean;
  options?: { value: string; label: string }[]; // For 'select' type
  unit?: string;          // e.g. "kg", "feet" — shown as suffix
  min?: number;
  max?: number;
  helperText?: string;    // Small description under the field
}

/**
 * An extra column that a business module injects into the Inventory table.
 * Reads from `products.product_meta`.
 */
export interface InventoryColumn {
  key: string;            // JSON key in product_meta
  label: string;          // Column header
  width?: string;         // CSS width
  render?: 'text' | 'badge' | 'date' | 'alert'; // How to render the value
  badgeColors?: Record<string, string>;  // value -> tailwind color class
}

/**
 * An extra field shown on the Sale screen when adding items to cart.
 * Stored in `sale_items.item_meta` as JSON.
 */
export interface SaleField {
  key: string;
  label: string;
  type: FieldType;
  placeholder?: string;
  options?: { value: string; label: string }[];
  defaultValue?: string | number;
  showInCart?: boolean;   // If true, displayed next to item in cart
  required?: boolean;
}

/**
 * Feature flags that enable special behaviors for a business type.
 */
export type FeatureFlag =
  | 'weight_sale'         // Sell by weight (grocery, fruit, dairy)
  | 'quick_sale'          // Fast-moving item quick buttons
  | 'expiry_alerts'       // Alert for expiring items (pharmacy, bakery)
  | 'daily_rate'          // Rate changes daily (fruit/veg)
  | 'table_management'    // Table/order type (restaurant)
  | 'imei_tracking'       // IMEI number tracking (electronics, mobile)
  | 'staff_assignment'    // Assign staff to service (salon)
  | 'bulk_discount'       // Auto bulk discounts (wholesale, hardware)
  | 'size_color_grid'     // Size × Color variant grid (clothing, shoes)
  | 'delivery_tracking'   // AM/PM delivery (dairy)
  | 'freshness_tracking'  // Freshness status (bakery)
  | 'vehicle_compat'      // Vehicle compatibility (auto parts)
  | 'seasonal_bulk'       // Seasonal bulk sale mode (stationery)
  | 'tiered_pricing'      // Retailer-wise pricing (wholesale)
  | 'monthly_hisaab'      // Customer-wise monthly account (dairy)
  | 'vape_sale_mode';     // ML-based Loose and Packaged selling (vape)

/**
 * Category seeds for initial setup of a business type.
 */
export interface CategorySeed {
  name: string;
  children?: string[];
}

// ─── Main Module Interface ──────────────────────────────────────────────────

export interface BusinessModule {
  /** Unique identifier, e.g. 'clothing', 'grocery' */
  id: string;

  /** English display name */
  name: string;

  /** Urdu display name */
  nameUrdu: string;

  /** Lucide icon name for UI */
  icon: string;

  /** Short English description */
  description: string;

  /** Color theme for the module card in settings */
  color: string;

  // ─── Product/Inventory Extensions ──────────────────────────

  /** Extra fields added to the Product Form */
  extraFields: ExtraField[];

  /** Extra columns added to the Inventory table */
  inventoryColumns: InventoryColumn[];

  /** Available measurement units */
  units: string[];

  /** Default unit for new products */
  defaultUnit: string;

  // ─── Sale Extensions ───────────────────────────────────────

  /** Extra fields shown during sale (per item or per sale) */
  saleFields: SaleField[];

  // ─── Feature Flags ─────────────────────────────────────────

  /** Special features enabled for this business type */
  features: FeatureFlag[];

  // ─── Category Seeds ────────────────────────────────────────

  /** Default categories to offer when this business is first selected */
  defaultCategories: CategorySeed[];

  // ─── Variant Config ────────────────────────────────────────

  /** Label for "variant 1" axis — e.g. "Size" for clothing, "Weight" for grocery */
  variantLabel1?: string;

  /** Label for "variant 2" axis — e.g. "Color" for clothing */
  variantLabel2?: string;

  /** Whether to show the size×color variant grid (clothing/shoes) */
  useVariantGrid?: boolean;
}
