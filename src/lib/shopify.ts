/**
 * Shopify Integration Service
 * 
 * Provides typed wrappers around Tauri commands for the Shopify integration.
 * All calls are async and non-blocking. Failed syncs are automatically queued
 * for retry in the backend.
 */

import { cmd } from './utils';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface ShopInfo {
  name: string;
  domain: string;
  email: string;
  plan: string;
  currency: string;
}

export interface ShopifyLocation {
  id: number;
  name: string;
  active: boolean;
}

export interface ShopifyMapping {
  id: number;
  local_product_id: number;
  local_variant_id: number | null;
  shopify_product_id: number | null;
  shopify_variant_id: number | null;
  shopify_inventory_item_id: number | null;
  synced_at: string;
}

export interface SyncQueueItem {
  id: number;
  action_type: string;
  payload: string;
  error_message: string | null;
  retry_count: number;
  status: string;
  created_at: string;
  updated_at: string;
}

export interface QueueStats {
  pending: number;
  failed: number;
  done: number;
}

// ─── API Functions ───────────────────────────────────────────────────────────

/** Test connection to Shopify store */
export async function testShopifyConnection(): Promise<ShopInfo> {
  return cmd<ShopInfo>('shopify_test_connection');
}

/** Get all Shopify locations for inventory tracking */
export async function getShopifyLocations(): Promise<ShopifyLocation[]> {
  return cmd<ShopifyLocation[]>('shopify_get_locations');
}

/** 
 * Sync a product to Shopify (creates or updates).
 * Call after product creation or update.
 */
export async function syncProductToShopify(productId: number): Promise<string> {
  return cmd<string>('shopify_sync_product', { productId });
}

/**
 * Sync inventory level for a variant to Shopify.
 * Call after stock changes (inward, adjustment, sale).
 */
export async function syncInventoryToShopify(variantId: number, quantity: number): Promise<string> {
  return cmd<string>('shopify_sync_inventory', { variantId, quantity });
}

/**
 * Create a Shopify order from a completed POS sale.
 * Call after sale is completed.
 */
export async function createShopifyOrder(saleId: number): Promise<string> {
  return cmd<string>('shopify_create_order', { saleId });
}

/** Get all local↔Shopify ID mappings */
export async function getShopifyMappings(): Promise<ShopifyMapping[]> {
  return cmd<ShopifyMapping[]>('shopify_get_mappings');
}

/** Get sync queue statistics */
export async function getQueueStats(): Promise<QueueStats> {
  return cmd<QueueStats>('shopify_get_queue_stats');
}

/** Get all pending/failed sync items */
export async function getPendingSyncs(): Promise<SyncQueueItem[]> {
  return cmd<SyncQueueItem[]>('shopify_get_pending_syncs');
}

/** Retry all pending/failed sync operations */
export async function retryPendingSyncs(): Promise<string> {
  return cmd<string>('shopify_retry_pending');
}

/** Clear completed sync entries from the queue */
export async function clearDoneSyncs(): Promise<number> {
  return cmd<number>('shopify_clear_done_syncs');
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Check if Shopify is configured (domain + token set) */
export async function isShopifyConfigured(): Promise<boolean> {
  try {
    const settings = await cmd<Record<string, string>>('get_all_settings');
    return !!(settings?.shopify_domain && settings?.shopify_token);
  } catch {
    return false;
  }
}

/**
 * Background sync trigger — fires and forgets.
 * Used after sales and inventory updates to avoid blocking the UI.
 */
export function backgroundSyncProduct(productId: number) {
  syncProductToShopify(productId).catch((e) =>
    console.warn('[Shopify] Background product sync failed:', e)
  );
}

export function backgroundSyncInventory(variantId: number, quantity: number) {
  syncInventoryToShopify(variantId, quantity).catch((e) =>
    console.warn('[Shopify] Background inventory sync failed:', e)
  );
}

export function backgroundCreateOrder(saleId: number) {
  createShopifyOrder(saleId).catch((e) =>
    console.warn('[Shopify] Background order sync failed:', e)
  );
}
