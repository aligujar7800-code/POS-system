pub mod supabase;
pub mod config;
pub mod sync_queue;

use crate::commands::DbState;
use std::path::PathBuf;

/// Main function called after a sale is created — fire-and-forget
pub async fn sync_sale_background(
    app_data_dir: &PathBuf,
    db: &DbState,
    sale_id: i64,
) -> Result<(), String> {
    // Check if cloud sync is configured
    let cfg = match config::load_sync_config(app_data_dir) {
        Some(c) => c,
        None => return Ok(()), // Not connected, skip silently
    };

    // Check internet
    if !check_internet().await {
        // Queue for later
        sync_queue::enqueue(app_data_dir, sync_queue::SyncItem::Sale { local_id: sale_id })?;
        eprintln!("[CloudSync] No internet — queued sale {}", sale_id);
        return Ok(());
    }

    // Read sale data from local DB
    let (sale_data, customer_data) = {
        let conn = db.lock();
        let sale = read_sale_for_sync(&conn, sale_id)?;
        let customer = if let Some(cid) = sale.customer_id {
            read_customer_for_sync(&conn, cid).ok()
        } else {
            None
        };
        (sale, customer)
    };

    // Push sale to Supabase
    if let Err(e) = supabase::upsert_sale(&cfg.store_id, &sale_data).await {
        eprintln!("[CloudSync] Sale sync failed: {} — queuing", e);
        sync_queue::enqueue(app_data_dir, sync_queue::SyncItem::Sale { local_id: sale_id })?;
        return Err(e);
    }

    // Push customer if present
    if let Some(cust) = customer_data {
        if let Err(e) = supabase::upsert_customer(&cfg.store_id, &cust).await {
            eprintln!("[CloudSync] Customer sync failed: {}", e);
        }
    }

    // Check and sync daily summary if needed
    let _ = check_and_sync_daily_summary(app_data_dir, db, &cfg).await;

    // Update last sync time
    let mut updated_cfg = cfg;
    updated_cfg.last_sync = Some(chrono::Utc::now().to_rfc3339());
    let _ = config::save_sync_config(app_data_dir, &updated_cfg);

    eprintln!("[CloudSync] Sale {} synced successfully", sale_id);
    Ok(())
}

/// Process offline queue
pub async fn process_sync_queue(app_data_dir: &PathBuf, db: &DbState) -> Result<usize, String> {
    let cfg = match config::load_sync_config(app_data_dir) {
        Some(c) => c,
        None => return Ok(0),
    };

    if !check_internet().await {
        return Ok(0);
    }

    let queue = sync_queue::load_queue(app_data_dir);
    if queue.is_empty() {
        return Ok(0);
    }

    let mut synced = 0;
    let mut remaining = Vec::new();

    for item in queue {
        let result = match &item.item {
            sync_queue::SyncItem::Sale { local_id } => {
                let sale_res = {
                    let conn = db.lock();
                    read_sale_for_sync(&conn, *local_id)
                };
                match sale_res {
                    Ok(sale) => supabase::upsert_sale(&cfg.store_id, &sale).await,
                    Err(e) => Err(e),
                }
            }
            sync_queue::SyncItem::Customer { local_id } => {
                let cust_res = {
                    let conn = db.lock();
                    read_customer_for_sync(&conn, *local_id)
                };
                match cust_res {
                    Ok(cust) => supabase::upsert_customer(&cfg.store_id, &cust).await,
                    Err(e) => Err(e),
                }
            }
            sync_queue::SyncItem::DailySummary { date } => {
                let summary_res = {
                    let conn = db.lock();
                    compute_daily_summary(&conn, date)
                };
                match summary_res {
                    Ok(summary) => supabase::upsert_daily_summary(&cfg.store_id, &summary).await,
                    Err(e) => Err(e),
                }
            }
        };

        match result {
            Ok(_) => synced += 1,
            Err(_) => {
                let mut retry = item;
                retry.retry_count += 1;
                if retry.retry_count < 10 {
                    remaining.push(retry);
                }
            }
        }
    }

    let _ = sync_queue::save_queue(app_data_dir, &remaining);

    if synced > 0 {
        let mut updated_cfg = cfg;
        updated_cfg.last_sync = Some(chrono::Utc::now().to_rfc3339());
        let _ = config::save_sync_config(app_data_dir, &updated_cfg);
    }

    Ok(synced)
}

/// Check and sync daily summary if a new day has started
async fn check_and_sync_daily_summary(
    app_data_dir: &PathBuf,
    db: &DbState,
    cfg: &config::CloudSyncConfig,
) -> Result<(), String> {
    let today = chrono::Local::now().format("%Y-%m-%d").to_string();
    let yesterday = (chrono::Local::now() - chrono::Duration::days(1))
        .format("%Y-%m-%d")
        .to_string();

    // Check if yesterday's summary was already synced
    let needs_sync = match &cfg.last_daily_summary_date {
        Some(last_date) => last_date != &yesterday && last_date != &today,
        None => true,
    };

    if !needs_sync {
        return Ok(());
    }

    // Compute yesterday's summary from local DB
    let summary = {
        let conn = db.lock();
        compute_daily_summary(&conn, &yesterday)?
    };

    // Only sync if there were sales
    if summary.total_sales > 0.0 {
        supabase::upsert_daily_summary(&cfg.store_id, &summary).await?;
    }

    // Update last summary date
    let mut updated_cfg = cfg.clone();
    updated_cfg.last_daily_summary_date = Some(yesterday);
    let _ = config::save_sync_config(app_data_dir, &updated_cfg);

    Ok(())
}

/// Manual full sync — syncs today's sales, all customers, and daily summary
pub async fn manual_full_sync(app_data_dir: &PathBuf, db: &DbState) -> Result<serde_json::Value, String> {
    let cfg = config::load_sync_config(app_data_dir)
        .ok_or("Cloud sync not connected")?;

    if !check_internet().await {
        return Err("No internet connection".into());
    }

    let today = chrono::Local::now().format("%Y-%m-%d").to_string();
    let mut sales_synced = 0u64;
    let mut customers_synced = 0u64;

    // Sync today's sales
    let sale_ids: Vec<i64> = {
        let conn = db.lock();
        let mut stmt = conn.prepare(
            "SELECT id FROM sales WHERE date(sale_date, 'localtime') = ?1"
        ).map_err(|e| e.to_string())?;
        let ids: Vec<i64> = stmt.query_map(rusqlite::params![today], |r| r.get(0))
            .map_err(|e| e.to_string())?
            .filter_map(|r| r.ok())
            .collect();
        ids
    };

    for sid in &sale_ids {
        let sale = {
            let conn = db.lock();
            read_sale_for_sync(&conn, *sid)?
        };
        if supabase::upsert_sale(&cfg.store_id, &sale).await.is_ok() {
            sales_synced += 1;
        }
    }

    // Sync all customers
    let customer_ids: Vec<i64> = {
        let conn = db.lock();
        let mut stmt = conn.prepare("SELECT id FROM customers")
            .map_err(|e| e.to_string())?;
        let ids: Vec<i64> = stmt.query_map([], |r| r.get(0))
            .map_err(|e| e.to_string())?
            .filter_map(|r| r.ok())
            .collect();
        ids
    };

    for cid in &customer_ids {
        let cust = {
            let conn = db.lock();
            read_customer_for_sync(&conn, *cid)?
        };
        if supabase::upsert_customer(&cfg.store_id, &cust).await.is_ok() {
            customers_synced += 1;
        }
    }

    // Sync daily summary
    let _ = check_and_sync_daily_summary(app_data_dir, db, &cfg).await;

    // Also sync today's summary
    let today_summary = {
        let conn = db.lock();
        compute_daily_summary(&conn, &today)?
    };
    if today_summary.total_sales > 0.0 {
        let _ = supabase::upsert_daily_summary(&cfg.store_id, &today_summary).await;
    }

    // Process offline queue
    let queued = process_sync_queue(app_data_dir, db).await.unwrap_or(0);

    // Update last sync
    let mut updated_cfg = cfg;
    updated_cfg.last_sync = Some(chrono::Utc::now().to_rfc3339());
    let _ = config::save_sync_config(app_data_dir, &updated_cfg);

    Ok(serde_json::json!({
        "sales_synced": sales_synced,
        "customers_synced": customers_synced,
        "queue_processed": queued,
        "timestamp": chrono::Utc::now().to_rfc3339(),
    }))
}

// ─── Helper: Read sale data for sync ─────────────────────────────────────────

#[derive(serde::Serialize, Clone, Debug)]
pub struct SaleSyncData {
    pub local_id: i64,
    pub amount: f64,
    pub profit: f64,
    pub payment_method: String,
    pub items_count: i64,
    pub created_at: String,
    pub customer_id: Option<i64>,
}

fn read_sale_for_sync(conn: &rusqlite::Connection, sale_id: i64) -> Result<SaleSyncData, String> {
    let (total_amount, payment_method, sale_date, customer_id): (f64, String, String, Option<i64>) =
        conn.query_row(
            "SELECT total_amount, payment_method, sale_date, customer_id FROM sales WHERE id = ?1",
            rusqlite::params![sale_id],
            |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?)),
        )
        .map_err(|e| format!("Read sale {}: {}", sale_id, e))?;

    let (items_count, total_cogs): (i64, f64) = conn
        .query_row(
            "SELECT COUNT(*), COALESCE(SUM(total_cogs), 0) FROM sale_items WHERE sale_id = ?1",
            rusqlite::params![sale_id],
            |r| Ok((r.get(0)?, r.get(1)?)),
        )
        .unwrap_or((0, 0.0));

    Ok(SaleSyncData {
        local_id: sale_id,
        amount: total_amount,
        profit: total_amount - total_cogs,
        payment_method,
        items_count,
        created_at: sale_date,
        customer_id,
    })
}

// ─── Helper: Read customer data for sync ─────────────────────────────────────

#[derive(serde::Serialize, Clone, Debug)]
pub struct CustomerSyncData {
    pub local_id: i64,
    pub name: String,
    pub phone: Option<String>,
    pub total_visits: i64,
    pub last_visit: Option<String>,
}

fn read_customer_for_sync(conn: &rusqlite::Connection, customer_id: i64) -> Result<CustomerSyncData, String> {
    let (name, phone): (String, Option<String>) = conn
        .query_row(
            "SELECT name, phone FROM customers WHERE id = ?1",
            rusqlite::params![customer_id],
            |r| Ok((r.get(0)?, r.get(1)?)),
        )
        .map_err(|e| format!("Read customer {}: {}", customer_id, e))?;

    let total_visits: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM sales WHERE customer_id = ?1",
            rusqlite::params![customer_id],
            |r| r.get(0),
        )
        .unwrap_or(0);

    let last_visit: Option<String> = conn
        .query_row(
            "SELECT MAX(sale_date) FROM sales WHERE customer_id = ?1",
            rusqlite::params![customer_id],
            |r| r.get(0),
        )
        .unwrap_or(None);

    Ok(CustomerSyncData {
        local_id: customer_id,
        name,
        phone,
        total_visits,
        last_visit,
    })
}

// ─── Helper: Compute daily summary ───────────────────────────────────────────

#[derive(serde::Serialize, Clone, Debug)]
pub struct DailySummaryData {
    pub date: String,
    pub total_sales: f64,
    pub total_profit: f64,
    pub total_customers: i64,
    pub top_products: serde_json::Value,
}

fn compute_daily_summary(conn: &rusqlite::Connection, date: &str) -> Result<DailySummaryData, String> {
    let (total_sales, total_cogs): (f64, f64) = conn
        .query_row(
            "SELECT COALESCE(SUM(s.total_amount), 0),
                    COALESCE((SELECT SUM(si.total_cogs) FROM sale_items si JOIN sales s2 ON si.sale_id = s2.id WHERE date(s2.sale_date, 'localtime') = ?1), 0)
             FROM sales s WHERE date(s.sale_date, 'localtime') = ?1",
            rusqlite::params![date],
            |r| Ok((r.get(0)?, r.get(1)?)),
        )
        .unwrap_or((0.0, 0.0));

    let total_customers: i64 = conn
        .query_row(
            "SELECT COUNT(DISTINCT customer_id) FROM sales WHERE date(sale_date, 'localtime') = ?1 AND customer_id IS NOT NULL",
            rusqlite::params![date],
            |r| r.get(0),
        )
        .unwrap_or(0);

    // Top 5 products
    let mut stmt = conn
        .prepare(
            "SELECT si.product_name, SUM(si.quantity) as qty, SUM(si.total_price) as revenue
             FROM sale_items si JOIN sales s ON si.sale_id = s.id
             WHERE date(s.sale_date, 'localtime') = ?1
             GROUP BY si.product_name ORDER BY qty DESC LIMIT 5",
        )
        .map_err(|e| e.to_string())?;

    let top: Vec<serde_json::Value> = stmt
        .query_map(rusqlite::params![date], |r| {
            Ok(serde_json::json!({
                "name": r.get::<_, String>(0)?,
                "qty": r.get::<_, i64>(1)?,
                "revenue": r.get::<_, f64>(2)?,
            }))
        })
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();

    Ok(DailySummaryData {
        date: date.to_string(),
        total_sales,
        total_profit: total_sales - total_cogs,
        total_customers,
        top_products: serde_json::json!(top),
    })
}

// ─── Internet check ──────────────────────────────────────────────────────────

async fn check_internet() -> bool {
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(5))
        .build();
    match client {
        Ok(c) => c
            .head(supabase::get_supabase_url())
            .send()
            .await
            .is_ok(),
        Err(_) => false,
    }
}
