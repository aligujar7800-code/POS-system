use rusqlite::{Connection, Result, params};
use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct LedgerEntry {
    pub id: i64,
    pub customer_id: i64,
    pub sale_id: Option<i64>,
    pub entry_type: String,
    pub amount: f64,
    pub balance_after: f64,
    pub description: Option<String>,
    pub entry_date: String,
}

#[derive(Deserialize)]
pub struct RecordPaymentPayload {
    pub customer_id: i64,
    pub amount: f64,
    pub method: String,
    pub notes: Option<String>,
    pub created_by: Option<i64>,
}

pub fn get_customer_ledger(
    conn: &Connection,
    customer_id: i64,
    from: Option<&str>,
    to: Option<&str>,
) -> Result<Vec<LedgerEntry>> {
    let mut sql = "SELECT id, customer_id, sale_id, entry_type, amount, balance_after, description, entry_date
                   FROM ledger_entries WHERE customer_id = ?1".to_string();

    let mut param_idx = 2;
    if from.is_some() {
        sql += &format!(" AND date(entry_date, 'localtime') >= ?{}", param_idx);
        param_idx += 1;
    }
    if to.is_some() {
        sql += &format!(" AND date(entry_date, 'localtime') <= ?{}", param_idx);
    }
    sql += " ORDER BY entry_date ASC, id ASC";

    let mut stmt = conn.prepare(&sql)?;

    let rows = match (from, to) {
        (Some(f), Some(t)) => stmt.query_map(params![customer_id, f, t], map_entry)?,
        (Some(f), None) => stmt.query_map(params![customer_id, f], map_entry)?,
        (None, Some(t)) => stmt.query_map(params![customer_id, t], map_entry)?,
        (None, None) => stmt.query_map(params![customer_id], map_entry)?,
    };
    rows.collect()
}

pub fn record_payment(conn: &mut Connection, payload: &RecordPaymentPayload) -> Result<i64> {
    let tx = conn.transaction()?;

    let prev_balance: f64 = tx.query_row(
        "SELECT COALESCE(balance_after, 0) FROM ledger_entries
         WHERE customer_id = ?1 ORDER BY entry_date DESC, id DESC LIMIT 1",
        params![payload.customer_id],
        |r| r.get(0),
    ).unwrap_or(0.0);

    let new_balance = (prev_balance - payload.amount).max(0.0);
    let desc = payload.notes.clone().unwrap_or_else(|| {
        format!("Payment received via {}", payload.method)
    });

    tx.execute(
        "INSERT INTO ledger_entries (customer_id, entry_type, amount, balance_after, description, created_by)
         VALUES (?1, 'payment', ?2, ?3, ?4, ?5)",
        params![
            payload.customer_id, payload.amount, new_balance,
            &desc, payload.created_by
        ],
    )?;

    tx.execute(
        "UPDATE customers SET outstanding_balance = ?1 WHERE id = ?2",
        params![new_balance, payload.customer_id],
    )?;
    
    // Log in cash_book as income
    tx.execute(
        "INSERT INTO cash_book (entry_type, category, amount, payment_method, reference_id, description, created_by)
         VALUES ('income', 'Customer Payment', ?1, ?2, ?3, ?4, ?5)",
        params![
            payload.amount, payload.method, payload.customer_id, &desc, payload.created_by
        ],
    )?;

    tx.commit()?;

    // Auto-post to accounting journal (non-blocking)
    let customer_name: String = conn.query_row(
        "SELECT name FROM customers WHERE id = ?1",
        params![payload.customer_id],
        |r| r.get(0),
    ).unwrap_or_else(|_| format!("Customer #{}", payload.customer_id));
    if let Err(e) = crate::db::auto_post::post_udhaar_payment(conn, payload.amount, payload.customer_id, &customer_name, payload.created_by) {
        eprintln!("Auto-post udhaar payment failed: {:?}", e);
    }

    Ok(conn.last_insert_rowid())
}

pub fn get_customer_summary(conn: &Connection, customer_id: i64) -> Result<serde_json::Value> {
    let total_purchased: f64 = conn.query_row(
        "SELECT COALESCE(SUM(amount), 0) FROM ledger_entries
         WHERE customer_id = ?1 AND entry_type = 'sale'",
        params![customer_id],
        |r| r.get(0),
    )?;
    let total_paid: f64 = conn.query_row(
        "SELECT COALESCE(SUM(amount), 0) FROM ledger_entries
         WHERE customer_id = ?1 AND entry_type = 'payment'",
        params![customer_id],
        |r| r.get(0),
    )?;
    let balance: f64 = conn.query_row(
        "SELECT COALESCE(balance_after, 0) FROM ledger_entries
         WHERE customer_id = ?1 ORDER BY entry_date DESC, id DESC LIMIT 1",
        params![customer_id],
        |r| r.get(0),
    ).unwrap_or(0.0);

    Ok(serde_json::json!({
        "total_purchased": total_purchased,
        "total_paid": total_paid,
        "balance_due": balance
    }))
}

pub fn get_todays_collections(conn: &Connection) -> Result<f64> {
    let today = chrono::Local::now().format("%Y-%m-%d").to_string();
    conn.query_row(
        "SELECT COALESCE(SUM(amount), 0) FROM ledger_entries
         WHERE entry_type = 'payment' AND date(entry_date, 'localtime') = ?1",
        params![today],
        |r| r.get(0),
    )
}

fn map_entry(row: &rusqlite::Row) -> rusqlite::Result<LedgerEntry> {
    Ok(LedgerEntry {
        id: row.get(0)?,
        customer_id: row.get(1)?,
        sale_id: row.get(2)?,
        entry_type: row.get(3)?,
        amount: row.get(4)?,
        balance_after: row.get(5)?,
        description: row.get(6)?,
        entry_date: row.get(7)?,
    })
}
