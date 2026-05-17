/**
 * Business Store — Manages the active business type.
 * Persisted in both Zustand localStorage AND SQLite settings.
 * The active module is derived from the registry.
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { getModule, DEFAULT_MODULE_ID } from '../modules/registry';
import type { BusinessModule } from '../modules/types';

interface BusinessState {
  /** Current business type ID, e.g. 'clothing', 'grocery' */
  businessType: string;

  /** Set a new business type */
  setBusinessType: (type: string) => void;

  /** Get the active module config (computed) */
  getActiveModule: () => BusinessModule;
}

export const useBusinessStore = create<BusinessState>()(
  persist(
    (set, get) => ({
      businessType: DEFAULT_MODULE_ID,

      setBusinessType: (type: string) => set({ businessType: type }),

      getActiveModule: () => getModule(get().businessType),
    }),
    { name: 'pos-business-type' }
  )
);
