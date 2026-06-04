pub mod supabase;
pub mod config;
pub mod sync_queue;

use crate::commands::DbState;
use std::path::PathBuf;

fn log_sync_event(app_data_dir: &PathBuf, message: &str) {
    let log_path = app_data_dir.join("cloud_sync.log");
    if let Ok(mut file) = std::fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(&log_path)
    {
        use std::io::Write;
        let timestamp = chrono::Local::now().to_rfc3339();
        let _ = writeln!(file, "[{}] {}", timestamp, message);
    }
}

/// Main function called after a sale is created — fire-and-forget
pub async fn sync_sale_background(
    app_data_dir: &PathBuf,
    db: &DbState,
    sale_id: i64,
) -> Result<(), String> {
    log_sync_event(app_data_dir, &format!("--- Start background sync for sale {} ---", sale_id));

    // Check if cloud sync is configured
    let cfg = match config::load_sync_config(app_data_dir) {
        Some(c) => c,
        None => {
            log_sync_event(app_data_dir, "Background sync skipped: Cloud sync not configured");
            return Ok(());
        }
    };

    log_sync_event(app_data_dir, &format!("Store connected: {}, Owner: {}", cfg.store_name, cfg.owner_email));

    // Check internet
    if !check_internet().await {
        // Queue for later
        if let Err(e) = sync_queue::enqueue(app_data_dir, sync_queue::SyncItem::Sale { local_id: sale_id }) {
            log_sync_event(app_data_dir, &format!("No internet & failed to queue sale: {}", e));
        } else {
            log_sync_event(app_data_dir, &format!("No internet — queued sale {}", sale_id));
        }
        return Ok(());
    }

    // Read sale data from local DB
    let (sale_data, customer_data) = match {
        let conn = db.lock();
        read_sale_for_sync(&conn, sale_id).map(|sale| {
            let customer = if let Some(cid) = sale.customer_id {
                read_customer_for_sync(&conn, cid).ok()
            } else {
                None
            };
            (sale, customer)
        })
    } {
        Ok(data) => data,
        Err(err) => {
            log_sync_event(app_data_dir, &format!("DB Error reading sale: {}", err));
            return Err(err);
        }
    };

    log_sync_event(app_data_dir, &format!("Read sale local_id: {}, amount: {}, payments: {}", sale_data.local_id, sale_data.amount, sale_data.payment_method));

    // Push sale to Supabase
    if let Err(e) = supabase::upsert_sale(&cfg.store_id, &sale_data).await {
        log_sync_event(app_data_dir, &format!("Supabase upsert sale failed: {} — queuing", e));
        let _ = sync_queue::enqueue(app_data_dir, sync_queue::SyncItem::Sale { local_id: sale_id });
        return Err(e);
    }

    log_sync_event(app_data_dir, &format!("Sale {} upserted successfully", sale_id));

    // Push customer if present
    if let Some(cust) = customer_data {
        if let Err(e) = supabase::upsert_customer(&cfg.store_id, &cust).await {
            log_sync_event(app_data_dir, &format!("Customer {} upsert failed: {}", cust.local_id, e));
        } else {
            log_sync_event(app_data_dir, &format!("Customer {} upserted successfully", cust.local_id));
        }
    }

    // Check and sync daily summary if needed
    if let Err(e) = check_and_sync_daily_summary(app_data_dir, db, &cfg).await {
        log_sync_event(app_data_dir, &format!("Daily summary sync failed/skipped: {}", e));
    } else {
        log_sync_event(app_data_dir, "Daily summary checked/synced");
    }

    // Sync today's summary as well so the mobile dashboard updates instantly
    let today = chrono::Local::now().format("%Y-%m-%d").to_string();
    let today_summary_res = {
        let conn = db.lock();
        compute_daily_summary(&conn, &today)
    };
    match today_summary_res {
        Ok(summary) => {
            if summary.total_sales > 0.0 {
                if let Err(e) = supabase::upsert_daily_summary(&cfg.store_id, &summary).await {
                    log_sync_event(app_data_dir, &format!("Failed to sync today's summary: {}", e));
                } else {
                    log_sync_event(app_data_dir, "Today's summary synced successfully");
                }
            }
        }
        Err(e) => {
            log_sync_event(app_data_dir, &format!("Failed to compute today's summary: {}", e));
        }
    }

    // Update last sync time
    let mut updated_cfg = cfg;
    updated_cfg.last_sync = Some(chrono::Utc::now().to_rfc3339());
    let _ = config::save_sync_config(app_data_dir, &updated_cfg);

    log_sync_event(app_data_dir, &format!("--- Success background sync for sale {} ---", sale_id));
    Ok(())
}

/// Process offline queue
pub async fn process_sync_queue(app_data_dir: &PathBuf, db: &DbState) -> Result<usize, String> {
    let cfg = match config::load_sync_config(app_data_dir) {
        Some(c) => c,
        None => return Ok(0),
    };

    if !check_internet().await {
        log_sync_event(app_data_dir, "Queue check skipped: No internet");
        return Ok(0);
    }

    let queue = sync_queue::load_queue(app_data_dir);
    if queue.is_empty() {
        return Ok(0);
    }

    log_sync_event(app_data_dir, &format!("Processing offline sync queue ({} items)...", queue.len()));

    let mut synced = 0;
    let mut remaining = Vec::new();

    for item in queue {
        let item_desc = match &item.item {
            sync_queue::SyncItem::Sale { local_id } => format!("Sale {}", local_id),
            sync_queue::SyncItem::Customer { local_id } => format!("Customer {}", local_id),
            sync_queue::SyncItem::DailySummary { date } => format!("DailySummary {}", date),
        };

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
            Ok(_) => {
                log_sync_event(app_data_dir, &format!("Queue sync success: {}", item_desc));
                synced += 1;
            }
            Err(e) => {
                log_sync_event(app_data_dir, &format!("Queue sync failed for {}: {}", item_desc, e));
                let mut retry = item;
                retry.retry_count += 1;
                if retry.retry_count < 10 {
                    remaining.push(retry);
                } else {
                    log_sync_event(app_data_dir, &format!("Queue item {} discarded after 10 attempts", item_desc));
                }
            }
        }
    }

    let _ = sync_queue::save_queue(app_data_dir, &remaining);

    if synced > 0 {
        let mut updated_cfg = cfg;
        updated_cfg.last_sync = Some(chrono::Utc::now().to_rfc3339());
        let _ = config::save_sync_config(app_data_dir, &updated_cfg);
        log_sync_event(app_data_dir, &format!("Queue processed: {} items synced successfully", synced));
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
    log_sync_event(app_data_dir, "--- Start manual full sync ---");

    let cfg = config::load_sync_config(app_data_dir)
        .ok_or("Cloud sync not connected")?;

    if !check_internet().await {
        log_sync_event(app_data_dir, "Manual sync failed: No internet connection");
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

    log_sync_event(app_data_dir, &format!("Manual sync: Found {} sales for date {}", sale_ids.len(), today));

    for sid in &sale_ids {
        let sale = {
            let conn = db.lock();
            read_sale_for_sync(&conn, *sid)?
        };
        match supabase::upsert_sale(&cfg.store_id, &sale).await {
            Ok(_) => sales_synced += 1,
            Err(e) => log_sync_event(app_data_dir, &format!("Manual sync: Failed to upsert sale {}: {}", sid, e)),
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

    log_sync_event(app_data_dir, &format!("Manual sync: Found {} total customers to sync", customer_ids.len()));

    for cid in &customer_ids {
        let cust = {
            let conn = db.lock();
            read_customer_for_sync(&conn, *cid)?
        };
        match supabase::upsert_customer(&cfg.store_id, &cust).await {
            Ok(_) => customers_synced += 1,
            Err(e) => log_sync_event(app_data_dir, &format!("Manual sync: Failed to upsert customer {}: {}", cid, e)),
        }
    }

    // Sync daily summary
    if let Err(e) = check_and_sync_daily_summary(app_data_dir, db, &cfg).await {
        log_sync_event(app_data_dir, &format!("Manual sync: Daily summary sync failed/skipped: {}", e));
    }

    // Also sync today's summary
    let today_summary = {
        let conn = db.lock();
        compute_daily_summary(&conn, &today)?
    };
    if today_summary.total_sales > 0.0 {
        if let Err(e) = supabase::upsert_daily_summary(&cfg.store_id, &today_summary).await {
            log_sync_event(app_data_dir, &format!("Manual sync: Today's summary sync failed: {}", e));
        }
    }

    // Process offline queue
    log_sync_event(app_data_dir, "Manual sync: Processing offline queue");
    let queued = process_sync_queue(app_data_dir, db).await.unwrap_or(0);

    // Update last sync
    let mut updated_cfg = cfg;
    updated_cfg.last_sync = Some(chrono::Utc::now().to_rfc3339());
    let _ = config::save_sync_config(app_data_dir, &updated_cfg);

    log_sync_event(app_data_dir, &format!("--- Manual sync complete: {} sales, {} customers synced ---", sales_synced, customers_synced));

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
