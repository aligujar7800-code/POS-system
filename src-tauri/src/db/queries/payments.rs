use rusqlite::{Connection, Result, params};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PaymentTransaction {
    pub id: i64,
    pub sale_id: Option<i64>,
    pub gateway: String,
    pub gateway_ref: Option<String>,
    pub transaction_type: String,
    pub amount: f64,
    pub status: String,
    pub customer_phone: Option<String>,
    pub request_payload: Option<String>,
    pub response_payload: Option<String>,
    pub error_message: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct QueuedPayment {
    pub id: i64,
    pub gateway: String,
    pub payload: String,
    pub retry_count: i64,
    pub last_error: Option<String>,
    pub status: String,
    pub created_at: String,
}

/// Insert a new payment transaction record
pub fn insert_transaction(
    conn: &Connection,
    sale_id: Option<i64>,
    gateway: &str,
    gateway_ref: Option<&str>,
    txn_type: &str,
    amount: f64,
    status: &str,
    customer_phone: Option<&str>,
    request_payload: Option<&str>,
    response_payload: Option<&str>,
    error_message: Option<&str>,
) -> Result<i64> {
    conn.execute(
        "INSERT INTO payment_transactions 
         (sale_id, gateway, gateway_ref, transaction_type, amount, status,
          customer_phone, request_payload, response_payload, error_message)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
        params![
            sale_id, gateway, gateway_ref, txn_type, amount, status,
            customer_phone, request_payload, response_payload, error_message
        ],
    )?;
    Ok(conn.last_insert_rowid())
}

/// Update transaction status
pub fn update_transaction_status(
    conn: &Connection,
    id: i64,
    status: &str,
    gateway_ref: Option<&str>,
    response_payload: Option<&str>,
    error_message: Option<&str>,
) -> Result<()> {
    conn.execute(
        "UPDATE payment_transactions 
         SET status = ?1, gateway_ref = COALESCE(?2, gateway_ref),
             response_payload = COALESCE(?3, response_payload),
             error_message = ?4, updated_at = datetime('now')
         WHERE id = ?5",
        params![status, gateway_ref, response_payload, error_message, id],
    )?;
    Ok(())
}

/// Link transaction to a sale
pub fn link_to_sale(conn: &Connection, txn_id: i64, sale_id: i64) -> Result<()> {
    conn.execute(
        "UPDATE payment_transactions SET sale_id = ?1 WHERE id = ?2",
        params![sale_id, txn_id],
    )?;
    Ok(())
}

/// Get transaction by ID
pub fn get_transaction(conn: &Connection, id: i64) -> Result<PaymentTransaction> {
    conn.query_row(
        "SELECT id, sale_id, gateway, gateway_ref, transaction_type, amount,
                status, customer_phone, request_payload, response_payload,
                error_message, created_at, updated_at
         FROM payment_transactions WHERE id = ?1",
        params![id],
        map_transaction,
    )
}

/// Get transactions for a sale
pub fn get_sale_transactions(conn: &Connection, sale_id: i64) -> Result<Vec<PaymentTransaction>> {
    let mut stmt = conn.prepare(
        "SELECT id, sale_id, gateway, gateway_ref, transaction_type, amount,
                status, customer_phone, request_payload, response_payload,
                error_message, created_at, updated_at
         FROM payment_transactions WHERE sale_id = ?1 ORDER BY id DESC"
    )?;
    let rows = stmt.query_map(params![sale_id], map_transaction)?;
    rows.collect()
}

/// Get recent transactions by gateway
pub fn get_recent_transactions(
    conn: &Connection, gateway: Option<&str>, limit: i64,
) -> Result<Vec<PaymentTransaction>> {
    let (sql, bind) = if let Some(gw) = gateway {
        (
            "SELECT id, sale_id, gateway, gateway_ref, transaction_type, amount,
                    status, customer_phone, request_payload, response_payload,
                    error_message, created_at, updated_at
             FROM payment_transactions WHERE gateway = ?1 ORDER BY id DESC LIMIT ?2".to_string(),
            vec![rusqlite::types::Value::Text(gw.to_string()), rusqlite::types::Value::Integer(limit)],
        )
    } else {
        (
            "SELECT id, sale_id, gateway, gateway_ref, transaction_type, amount,
                    status, customer_phone, request_payload, response_payload,
                    error_message, created_at, updated_at
             FROM payment_transactions ORDER BY id DESC LIMIT ?1".to_string(),
            vec![rusqlite::types::Value::Integer(limit)],
        )
    };
    let mut stmt = conn.prepare(&sql)?;
    let rows = stmt.query_map(rusqlite::params_from_iter(bind.iter()), map_transaction)?;
    rows.collect()
}

/// Queue a payment for offline retry
pub fn queue_payment(
    conn: &Connection, gateway: &str, payload: &str,
) -> Result<i64> {
    conn.execute(
        "INSERT INTO payment_queue (gateway, payload, status) VALUES (?1, ?2, 'pending')",
        params![gateway, payload],
    )?;
    Ok(conn.last_insert_rowid())
}

/// Get pending queued payments
pub fn get_pending_queue(conn: &Connection) -> Result<Vec<QueuedPayment>> {
    let mut stmt = conn.prepare(
        "SELECT id, gateway, payload, retry_count, last_error, status, created_at
         FROM payment_queue WHERE status = 'pending' ORDER BY id ASC"
    )?;
    let rows = stmt.query_map([], |row| {
        Ok(QueuedPayment {
            id: row.get(0)?,
            gateway: row.get(1)?,
            payload: row.get(2)?,
            retry_count: row.get(3)?,
            last_error: row.get(4)?,
            status: row.get(5)?,
            created_at: row.get(6)?,
        })
    })?;
    rows.collect()
}

/// Update queue item after retry
pub fn update_queue_item(
    conn: &Connection, id: i64, status: &str, error: Option<&str>,
) -> Result<()> {
    conn.execute(
        "UPDATE payment_queue SET status = ?1, last_error = ?2,
         retry_count = retry_count + 1 WHERE id = ?3",
        params![status, error, id],
    )?;
    Ok(())
}

/// Get payment method breakdown for reports
pub fn payment_method_breakdown(
    conn: &Connection, from: &str, to: &str,
) -> Result<serde_json::Value> {
    let mut stmt = conn.prepare(
        "SELECT payment_method, COUNT(*) as cnt, COALESCE(SUM(total_amount), 0) as total
         FROM sales
         WHERE date(sale_date, 'localtime') BETWEEN ?1 AND ?2
         GROUP BY payment_method
         ORDER BY total DESC"
    )?;
    let rows = stmt.query_map(params![from, to], |row| {
        Ok(serde_json::json!({
            "method": row.get::<_, String>(0)?,
            "count": row.get::<_, i64>(1)?,
            "total": row.get::<_, f64>(2)?,
        }))
    })?;
    let data: Result<Vec<serde_json::Value>> = rows.collect();
    Ok(serde_json::json!(data?))
}

/// Get gateway transaction summary
pub fn gateway_transaction_summary(
    conn: &Connection, from: &str, to: &str,
) -> Result<serde_json::Value> {
    let mut stmt = conn.prepare(
        "SELECT gateway, status, COUNT(*) as cnt, COALESCE(SUM(amount), 0) as total
         FROM payment_transactions
         WHERE date(created_at, 'localtime') BETWEEN ?1 AND ?2
         GROUP BY gateway, status
         ORDER BY gateway, status"
    )?;
    let rows = stmt.query_map(params![from, to], |row| {
        Ok(serde_json::json!({
            "gateway": row.get::<_, String>(0)?,
            "status": row.get::<_, String>(1)?,
            "count": row.get::<_, i64>(2)?,
            "total": row.get::<_, f64>(3)?,
        }))
    })?;
    let data: Result<Vec<serde_json::Value>> = rows.collect();
    Ok(serde_json::json!(data?))
}

fn map_transaction(row: &rusqlite::Row) -> rusqlite::Result<PaymentTransaction> {
    Ok(PaymentTransaction {
        id: row.get(0)?,
        sale_id: row.get(1)?,
        gateway: row.get(2)?,
        gateway_ref: row.get(3)?,
        transaction_type: row.get(4)?,
        amount: row.get(5)?,
        status: row.get(6)?,
        customer_phone: row.get(7)?,
        request_payload: row.get(8)?,
        response_payload: row.get(9)?,
        error_message: row.get(10)?,
        created_at: row.get(11)?,
        updated_at: row.get(12)?,
    })
}
