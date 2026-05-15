use serde::{Deserialize, Serialize};

// ─── Supabase Credentials (backend only, never exposed to frontend) ──────────
// These are embedded at compile time. The service_role key bypasses RLS.

const SUPABASE_URL: &str = "https://xyhfbzbgznumczasluem.supabase.co";
const SUPABASE_SERVICE_KEY: &str = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inh5aGZiemJnem51bWN6YXNsdWVtIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3ODg0NjY5NCwiZXhwIjoyMDk0NDIyNjk0fQ.AfAqijVTrG1GrFq5qXwnYbQZPu1wXbGpD8UvKNRwxiw";

pub fn get_supabase_url() -> &'static str {
    SUPABASE_URL
}

fn rest_url(table: &str) -> String {
    format!("{}/rest/v1/{}", SUPABASE_URL, table)
}

fn client_with_auth() -> Result<reqwest::Client, String> {
    reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(15))
        .build()
        .map_err(|e| format!("HTTP client error: {}", e))
}

fn auth_headers() -> Vec<(&'static str, String)> {
    vec![
        ("apikey", SUPABASE_SERVICE_KEY.to_string()),
        ("Authorization", format!("Bearer {}", SUPABASE_SERVICE_KEY)),
        ("Content-Type", "application/json".to_string()),
    ]
}

// ─── Store Management ────────────────────────────────────────────────────────

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct StoreRecord {
    pub id: String,
    pub owner_email: String,
    pub store_name: String,
    pub created_at: String,
    pub plan: String,
}

/// Find existing store by email, or create a new one
pub async fn find_or_create_store(email: &str, store_name: &str) -> Result<StoreRecord, String> {
    let client = client_with_auth()?;

    // First, try to find existing store
    let url = format!(
        "{}?owner_email=eq.{}&select=*",
        rest_url("stores"),
        urlencoding(email)
    );

    let mut req = client.get(&url);
    for (k, v) in auth_headers() {
        req = req.header(k, v);
    }

    let resp = req.send().await.map_err(|e| format!("Find store: {}", e))?;
    let status = resp.status();
    let text = resp.text().await.map_err(|e| format!("Read response: {}", e))?;

    if !status.is_success() {
        return Err(format!("Find store failed ({}): {}", status, text));
    }

    let stores: Vec<StoreRecord> = serde_json::from_str(&text)
        .map_err(|e| format!("Parse stores: {} — body: {}", e, text))?;

    if let Some(store) = stores.into_iter().next() {
        return Ok(store);
    }

    // Store not found — create new one
    let payload = serde_json::json!({
        "owner_email": email,
        "store_name": store_name,
        "plan": "free"
    });

    let mut req = client.post(&rest_url("stores")).body(payload.to_string());
    for (k, v) in auth_headers() {
        req = req.header(k, v);
    }
    req = req.header("Prefer", "return=representation");

    let resp = req.send().await.map_err(|e| format!("Create store: {}", e))?;
    let status = resp.status();
    let text = resp.text().await.map_err(|e| format!("Read create response: {}", e))?;

    if !status.is_success() {
        return Err(format!("Create store failed ({}): {}", status, text));
    }

    let created: Vec<StoreRecord> = serde_json::from_str(&text)
        .map_err(|e| format!("Parse created store: {} — body: {}", e, text))?;

    created
        .into_iter()
        .next()
        .ok_or("Store creation returned empty response".into())
}

// ─── Sale Sync ───────────────────────────────────────────────────────────────

/// Upsert a sale record to Supabase (idempotent via store_id + local_id)
pub async fn upsert_sale(store_id: &str, sale: &super::SaleSyncData) -> Result<(), String> {
    let client = client_with_auth()?;

    let payload = serde_json::json!({
        "store_id": store_id,
        "local_id": sale.local_id,
        "amount": sale.amount,
        "profit": sale.profit,
        "payment_method": sale.payment_method,
        "items_count": sale.items_count,
        "created_at": sale.created_at,
    });

    let mut req = client.post(&rest_url("sales")).body(payload.to_string());
    for (k, v) in auth_headers() {
        req = req.header(k, v);
    }
    // Upsert: on conflict (store_id, local_id) merge
    req = req.header("Prefer", "resolution=merge-duplicates");

    let resp = req.send().await.map_err(|e| format!("Upsert sale: {}", e))?;
    let status = resp.status();

    if !status.is_success() {
        let text = resp.text().await.unwrap_or_default();
        return Err(format!("Upsert sale failed ({}): {}", status, text));
    }

    Ok(())
}

// ─── Customer Sync ───────────────────────────────────────────────────────────

/// Upsert a customer record to Supabase (idempotent via store_id + local_id)
pub async fn upsert_customer(store_id: &str, cust: &super::CustomerSyncData) -> Result<(), String> {
    let client = client_with_auth()?;

    let payload = serde_json::json!({
        "store_id": store_id,
        "local_id": cust.local_id,
        "name": cust.name,
        "phone": cust.phone,
        "total_visits": cust.total_visits,
        "last_visit": cust.last_visit,
    });

    let mut req = client.post(&rest_url("customers")).body(payload.to_string());
    for (k, v) in auth_headers() {
        req = req.header(k, v);
    }
    req = req.header("Prefer", "resolution=merge-duplicates");

    let resp = req.send().await.map_err(|e| format!("Upsert customer: {}", e))?;
    let status = resp.status();

    if !status.is_success() {
        let text = resp.text().await.unwrap_or_default();
        return Err(format!("Upsert customer failed ({}): {}", status, text));
    }

    Ok(())
}

// ─── Daily Summary Sync ──────────────────────────────────────────────────────

/// Upsert daily summary to Supabase (idempotent via store_id + date)
pub async fn upsert_daily_summary(
    store_id: &str,
    summary: &super::DailySummaryData,
) -> Result<(), String> {
    let client = client_with_auth()?;

    let payload = serde_json::json!({
        "store_id": store_id,
        "date": summary.date,
        "total_sales": summary.total_sales,
        "total_profit": summary.total_profit,
        "total_customers": summary.total_customers,
        "top_products": summary.top_products,
    });

    let mut req = client
        .post(&rest_url("daily_summary"))
        .body(payload.to_string());
    for (k, v) in auth_headers() {
        req = req.header(k, v);
    }
    req = req.header("Prefer", "resolution=merge-duplicates");

    let resp = req.send().await.map_err(|e| format!("Upsert daily summary: {}", e))?;
    let status = resp.status();

    if !status.is_success() {
        let text = resp.text().await.unwrap_or_default();
        return Err(format!("Upsert daily summary failed ({}): {}", status, text));
    }

    Ok(())
}

// ─── URL Encoding Helper ─────────────────────────────────────────────────────

fn urlencoding(s: &str) -> String {
    url::form_urlencoded::byte_serialize(s.as_bytes()).collect()
}
