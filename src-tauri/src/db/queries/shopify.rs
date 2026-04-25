use rusqlite::{Connection, Result, params};
use serde::{Deserialize, Serialize};

// ─── Shopify Mappings ────────────────────────────────────────────────────────

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct ShopifyMapping {
    pub id: i64,
    pub local_product_id: i64,
    pub local_variant_id: Option<i64>,
    pub shopify_product_id: Option<i64>,
    pub shopify_variant_id: Option<i64>,
    pub shopify_inventory_item_id: Option<i64>,
    pub synced_at: String,
}

pub fn upsert_mapping(
    conn: &Connection,
    local_product_id: i64,
    local_variant_id: Option<i64>,
    shopify_product_id: Option<i64>,
    shopify_variant_id: Option<i64>,
    shopify_inventory_item_id: Option<i64>,
) -> Result<i64> {
    conn.execute(
        "INSERT INTO shopify_mappings (local_product_id, local_variant_id, shopify_product_id, shopify_variant_id, shopify_inventory_item_id, synced_at)
         VALUES (?1, ?2, ?3, ?4, ?5, datetime('now'))
         ON CONFLICT(local_product_id, local_variant_id)
         DO UPDATE SET
           shopify_product_id = excluded.shopify_product_id,
           shopify_variant_id = excluded.shopify_variant_id,
           shopify_inventory_item_id = excluded.shopify_inventory_item_id,
           synced_at = datetime('now')",
        params![local_product_id, local_variant_id, shopify_product_id, shopify_variant_id, shopify_inventory_item_id],
    )?;
    Ok(conn.last_insert_rowid())
}

pub fn get_mapping_by_local_product(conn: &Connection, local_product_id: i64) -> Result<Vec<ShopifyMapping>> {
    let mut stmt = conn.prepare(
        "SELECT id, local_product_id, local_variant_id, shopify_product_id, shopify_variant_id, shopify_inventory_item_id, synced_at
         FROM shopify_mappings WHERE local_product_id = ?1"
    )?;
    let rows = stmt.query_map(params![local_product_id], map_mapping)?;
    rows.collect()
}

pub fn get_mapping_by_local_variant(conn: &Connection, local_variant_id: i64) -> Result<Option<ShopifyMapping>> {
    match conn.query_row(
        "SELECT id, local_product_id, local_variant_id, shopify_product_id, shopify_variant_id, shopify_inventory_item_id, synced_at
         FROM shopify_mappings WHERE local_variant_id = ?1",
        params![local_variant_id],
        map_mapping,
    ) {
        Ok(m) => Ok(Some(m)),
        Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
        Err(e) => Err(e),
    }
}

pub fn get_all_mappings(conn: &Connection) -> Result<Vec<ShopifyMapping>> {
    let mut stmt = conn.prepare(
        "SELECT id, local_product_id, local_variant_id, shopify_product_id, shopify_variant_id, shopify_inventory_item_id, synced_at
         FROM shopify_mappings ORDER BY synced_at DESC"
    )?;
    let rows = stmt.query_map([], map_mapping)?;
    rows.collect()
}

pub fn delete_mapping(conn: &Connection, id: i64) -> Result<()> {
    conn.execute("DELETE FROM shopify_mappings WHERE id = ?1", params![id])?;
    Ok(())
}

pub fn delete_all_mappings(conn: &Connection) -> Result<()> {
    conn.execute("DELETE FROM shopify_mappings", [])?;
    Ok(())
}

fn map_mapping(row: &rusqlite::Row) -> rusqlite::Result<ShopifyMapping> {
    Ok(ShopifyMapping {
        id: row.get(0)?,
        local_product_id: row.get(1)?,
        local_variant_id: row.get(2)?,
        shopify_product_id: row.get(3)?,
        shopify_variant_id: row.get(4)?,
        shopify_inventory_item_id: row.get(5)?,
        synced_at: row.get(6)?,
    })
}

// ─── Sync Queue ──────────────────────────────────────────────────────────────

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct SyncQueueItem {
    pub id: i64,
    pub action_type: String,
    pub payload: String,
    pub error_message: Option<String>,
    pub retry_count: i64,
    pub status: String,
    pub created_at: String,
    pub updated_at: String,
}

pub fn enqueue_sync(conn: &Connection, action_type: &str, payload: &str) -> Result<i64> {
    conn.execute(
        "INSERT INTO shopify_sync_queue (action_type, payload) VALUES (?1, ?2)",
        params![action_type, payload],
    )?;
    Ok(conn.last_insert_rowid())
}

pub fn get_pending_syncs(conn: &Connection) -> Result<Vec<SyncQueueItem>> {
    let mut stmt = conn.prepare(
        "SELECT id, action_type, payload, error_message, retry_count, status, created_at, updated_at
         FROM shopify_sync_queue WHERE status IN ('pending', 'failed') AND retry_count < 5
         ORDER BY created_at ASC LIMIT 50"
    )?;
    let rows = stmt.query_map([], map_queue_item)?;
    rows.collect()
}

pub fn mark_sync_done(conn: &Connection, id: i64) -> Result<()> {
    conn.execute(
        "UPDATE shopify_sync_queue SET status = 'done', updated_at = datetime('now') WHERE id = ?1",
        params![id],
    )?;
    Ok(())
}

pub fn mark_sync_failed(conn: &Connection, id: i64, error: &str) -> Result<()> {
    conn.execute(
        "UPDATE shopify_sync_queue SET status = 'failed', error_message = ?2, retry_count = retry_count + 1, updated_at = datetime('now') WHERE id = ?1",
        params![id, error],
    )?;
    Ok(())
}

pub fn clear_done_syncs(conn: &Connection) -> Result<usize> {
    let count = conn.execute("DELETE FROM shopify_sync_queue WHERE status = 'done'", [])?;
    Ok(count)
}

pub fn get_queue_stats(conn: &Connection) -> Result<serde_json::Value> {
    let pending: i64 = conn.query_row(
        "SELECT COUNT(*) FROM shopify_sync_queue WHERE status = 'pending'", [], |r| r.get(0)
    )?;
    let failed: i64 = conn.query_row(
        "SELECT COUNT(*) FROM shopify_sync_queue WHERE status = 'failed'", [], |r| r.get(0)
    )?;
    let done: i64 = conn.query_row(
        "SELECT COUNT(*) FROM shopify_sync_queue WHERE status = 'done'", [], |r| r.get(0)
    )?;
    Ok(serde_json::json!({ "pending": pending, "failed": failed, "done": done }))
}

fn map_queue_item(row: &rusqlite::Row) -> rusqlite::Result<SyncQueueItem> {
    Ok(SyncQueueItem {
        id: row.get(0)?,
        action_type: row.get(1)?,
        payload: row.get(2)?,
        error_message: row.get(3)?,
        retry_count: row.get(4)?,
        status: row.get(5)?,
        created_at: row.get(6)?,
        updated_at: row.get(7)?,
    })
}
