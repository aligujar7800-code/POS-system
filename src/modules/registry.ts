/**
 * Module Registry — Central hub that registers all business modules.
 * The core engine uses this to look up the active module by ID.
 * 
 * To add a new business type in the future:
 * 1. Create a new file in src/modules/businesses/
 * 2. Import and add it to the `modules` map below
 * That's it. No core engine changes needed.
 */

import { BusinessModule } from './types';

// ─── Import all business modules ────────────────────────────────────────────
import clothingModule from './businesses/clothing';
import groceryModule from './businesses/grocery';
import hardwareModule from './businesses/hardware';
import pharmacyModule from './businesses/pharmacy';
import restaurantModule from './businesses/restaurant';
import salonModule from './businesses/salon';
import electronicsModule from './businesses/electronics';
import bakeryModule from './businesses/bakery';
import dairyModule from './businesses/dairy';
import mobileModule from './businesses/mobile';
import shoeModule from './businesses/shoes';
import stationeryModule from './businesses/stationery';
import autoPartsModule from './businesses/autoparts';
import fruitVegModule from './businesses/fruitveg';
import wholesaleModule from './businesses/wholesale';
import vapeModule from './businesses/vape';

// ─── Module Map ─────────────────────────────────────────────────────────────

const modules: Record<string, BusinessModule> = {
  clothing: clothingModule,
  grocery: groceryModule,
  hardware: hardwareModule,
  pharmacy: pharmacyModule,
  restaurant: restaurantModule,
  salon: salonModule,
  electronics: electronicsModule,
  bakery: bakeryModule,
  dairy: dairyModule,
  mobile: mobileModule,
  shoes: shoeModule,
  stationery: stationeryModule,
  autoparts: autoPartsModule,
  fruitveg: fruitVegModule,
  wholesale: wholesaleModule,
  vape: vapeModule,
};

// ─── Public API ─────────────────────────────────────────────────────────────

/** Get a specific module by its ID. Falls back to clothing if not found. */
export function getModule(id: string): BusinessModule {
  return modules[id] || modules.clothing;
}

/** Get a list of all registered modules (for the Settings selector). */
export function getAllModules(): BusinessModule[] {
  return Object.values(modules);
}

/** Get all module IDs. */
export function getModuleIds(): string[] {
  return Object.keys(modules);
}

/** Check if a module has a specific feature flag. */
export function moduleHasFeature(moduleId: string, feature: string): boolean {
  const mod = modules[moduleId];
  return mod ? mod.features.includes(feature as any) : false;
}

/** Default module ID */
export const DEFAULT_MODULE_ID = 'clothing';

export default modules;
