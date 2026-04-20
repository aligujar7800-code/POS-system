use rusqlite::{Connection, Result, params};
use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct Supplier {
    pub id: i64,
    pub name: String,
    pub phone: String,
    pub address: Option<String>,
    pub notes: Option<String>,
    pub outstanding_balance: f64,
    pub opening_balance: f64,
    pub created_at: String,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct SupplierLedgerEntry {
    pub id: i64,
    pub supplier_id: i64,
    pub entry_type: String, // 'purchase' | 'payment' | 'adjustment'
    pub amount: f64,
    pub balance_after: f64,
    pub description: Option<String>,
    pub entry_date: String,
    pub created_by: Option<i64>,
}

#[derive(Deserialize, Debug)]
pub struct CreateSupplierPayload {
    pub name: String,
    pub phone: String,
    pub address: Option<String>,
    pub notes: Option<String>,
    pub opening_balance: Option<f64>,
}

#[derive(Deserialize, Debug)]
pub struct SupplierPaymentPayload {
    pub supplier_id: i64,
    pub amount: f64,
    pub method: String,
    pub notes: Option<String>,
    pub created_by: Option<i64>,
}

pub fn get_all_suppliers(conn: &Connection) -> Result<Vec<Supplier>> {
    let mut stmt = conn.prepare("SELECT * FROM suppliers ORDER BY name")?;
    let rows = stmt.query_map([], |row| {
        Ok(Supplier {
            id: row.get(0)?,
            name: row.get(1)?,
            phone: row.get(2)?,
            address: row.get(3)?,
            notes: row.get(4)?,
            outstanding_balance: row.get(5)?,
            created_at: row.get(6)?,
            opening_balance: row.get(7)?,
        })
    })?;
    rows.collect()
}

pub fn get_supplier_by_id(conn: &Connection, id: i64) -> Result<Supplier> {
    conn.query_row(
        "SELECT * FROM suppliers WHERE id = ?1",
        params![id],
        |row| Ok(Supplier {
            id: row.get(0)?,
            name: row.get(1)?,
            phone: row.get(2)?,
            address: row.get(3)?,
            notes: row.get(4)?,
            outstanding_balance: row.get(5)?,
            created_at: row.get(6)?,
            opening_balance: row.get(7)?,
        })
    )
}

pub fn create_supplier(conn: &mut Connection, payload: &CreateSupplierPayload) -> Result<i64> {
    let tx = conn.transaction()?;
    
    let opening = payload.opening_balance.unwrap_or(0.0);
    
    tx.execute(
        "INSERT INTO suppliers (name, phone, address, notes, outstanding_balance, opening_balance) 
         VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        params![payload.name, payload.phone, payload.address, payload.notes, opening, opening],
    )?;
    
    let supplier_id = tx.last_insert_rowid();

    // If opening balance exists, record it in ledger
    if opening != 0.0 {
        tx.execute(
            "INSERT INTO supplier_ledger (supplier_id, entry_type, amount, balance_after, description)
             VALUES (?1, 'adjustment', ?2, ?3, 'Opening Balance')",
            params![supplier_id, opening, opening],
        )?;
    }

    tx.commit()?;
    
    // Auto-post to accounting journal (General Ledger)
    if opening != 0.0 {
        if let Err(e) = crate::db::auto_post::post_supplier_opening_balance(conn, opening, supplier_id, &payload.name, None) {
            eprintln!("Auto-post supplier opening balance failed: {:?}", e);
        }
    }

    Ok(supplier_id)
}

pub fn update_supplier(conn: &Connection, id: i64, payload: &CreateSupplierPayload) -> Result<()> {
    conn.execute(
        "UPDATE suppliers SET name = ?1, phone = ?2, address = ?3, notes = ?4 WHERE id = ?5",
        params![payload.name, payload.phone, payload.address, payload.notes, id],
    )?;
    Ok(())
}

pub fn get_supplier_ledger(conn: &Connection, supplier_id: i64, from: Option<&str>, to: Option<&str>) -> Result<Vec<SupplierLedgerEntry>> {
    let mut sql = "
        SELECT id, supplier_id, entry_type, amount, balance_after, description, entry_date, created_by 
        FROM supplier_ledger 
        WHERE supplier_id = ?1
    ".to_string();
    
    // Simplifed filtering for debugging/reliability
    if let Some(f) = from.filter(|s| !s.is_empty()) {
        sql += &format!(" AND entry_date >= '{}'", f);
    }
    if let Some(t) = to.filter(|s| !s.is_empty()) {
        sql += &format!(" AND entry_date <= '{} 23:59:59'", t);
    }
    
    sql += " ORDER BY id DESC"; // Use ID for reliable sorting if dates match

    let mut stmt = conn.prepare(&sql)?;
    let rows = stmt.query_map(params![supplier_id], map_ledger_row)?;
    
    let mut entries = Vec::new();
    for row_res in rows {
        match row_res {
            Ok(entry) => entries.push(entry),
            Err(e) => {
                eprintln!("Ledger mapping error: {:?}", e);
                return Err(e);
            }
        }
    }
    Ok(entries)
}

fn map_ledger_row(row: &rusqlite::Row) -> Result<SupplierLedgerEntry> {
    // Be defensive about types and nulls to avoid mysterious mapping errors
    let id: i64 = row.get(0)?;
    let supplier_id: i64 = row.get(1)?;
    let entry_type: String = row.get(2)?;
    let amount: f64 = row.get(3).unwrap_or(0.0);
    let balance_after: f64 = row.get(4).unwrap_or(0.0);
    let description: Option<String> = row.get(5).ok();
    
    // Sometimes date conversion can fail if format is unexpected
    let entry_date: String = row.get::<_, String>(6).unwrap_or_else(|_| {
        row.get::<_, Option<String>>(6).ok().flatten().unwrap_or_else(|| "Unknown".to_string())
    });
    
    let created_by: Option<i64> = row.get(7).ok();

    Ok(SupplierLedgerEntry {
        id,
        supplier_id,
        entry_type,
        amount,
        balance_after,
        description,
        entry_date,
        created_by,
    })
}

pub fn record_supplier_payment(conn: &mut Connection, payload: &SupplierPaymentPayload) -> Result<()> {
    let tx = conn.transaction()?;

    // 1. Get current balance
    let current_balance: f64 = tx.query_row(
        "SELECT outstanding_balance FROM suppliers WHERE id = ?1",
        params![payload.supplier_id],
        |r| r.get(0),
    )?;

    let new_balance = current_balance - payload.amount;

    // 2. Add ledger entry
    tx.execute(
        "INSERT INTO supplier_ledger (supplier_id, entry_type, amount, balance_after, description, created_by)
         VALUES (?1, 'payment', ?2, ?3, ?4, ?5)",
        params![
            payload.supplier_id,
            payload.amount,
            new_balance,
            payload.notes.clone().unwrap_or_else(|| "Supplier Payment".to_string()),
            payload.created_by
        ],
    )?;

    // 3. Update supplier balance
    tx.execute(
        "UPDATE suppliers SET outstanding_balance = ?1 WHERE id = ?2",
        params![new_balance, payload.supplier_id],
    )?;

    // 4. Record in cash book as expense
    tx.execute(
        "INSERT INTO cash_book (entry_type, category, amount, payment_method, description, created_by)
         VALUES ('expense', 'Supplier Payment', ?1, ?2, ?3, ?4)",
        params![
            payload.amount,
            payload.method,
            format!("Payment to supplier (ID: {})", payload.supplier_id),
            payload.created_by
        ],
    )?;

    tx.commit()?;

    // Auto-post to accounting journal (non-blocking)
    let supplier_name: String = conn.query_row(
        "SELECT name FROM suppliers WHERE id = ?1",
        params![payload.supplier_id],
        |r| r.get(0),
    ).unwrap_or_else(|_| format!("Supplier #{}", payload.supplier_id));
    
    if let Err(e) = crate::db::auto_post::post_supplier_payment(conn, payload.amount, payload.supplier_id, &supplier_name, payload.created_by) {
        eprintln!("Auto-post supplier payment failed: {:?}", e);
    }

    Ok(())
}
