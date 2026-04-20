use rusqlite::{Connection, Result, params};
use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct Customer {
    pub id: i64,
    pub name: String,
    pub phone: String,
    pub address: Option<String>,
    pub notes: Option<String>,
    pub outstanding_balance: f64,
}

#[derive(Deserialize)]
pub struct CreateCustomerPayload {
    pub name: String,
    pub phone: String,
    pub address: Option<String>,
    pub notes: Option<String>,
}

pub fn search_customers(conn: &Connection, query: &str) -> Result<Vec<Customer>> {
    let pattern = format!("%{}%", query);
    let mut stmt = conn.prepare(
        "SELECT id, name, phone, address, notes, outstanding_balance
         FROM customers
         WHERE name LIKE ?1 OR phone LIKE ?1
         ORDER BY name LIMIT 20",
    )?;
    let rows = stmt.query_map(params![pattern], |row| {
        Ok(Customer {
            id: row.get(0)?,
            name: row.get(1)?,
            phone: row.get(2)?,
            address: row.get(3)?,
            notes: row.get(4)?,
            outstanding_balance: row.get(5)?,
        })
    })?;
    rows.collect()
}

pub fn get_all_customers(conn: &Connection, sort_by: Option<&str>) -> Result<Vec<Customer>> {
    let order = match sort_by {
        Some("balance") => "outstanding_balance DESC",
        Some("name") => "name ASC",
        _ => "id DESC",
    };
    let sql = format!(
        "SELECT id, name, phone, address, notes, outstanding_balance
         FROM customers
         ORDER BY {order}"
    );
    let mut stmt = conn.prepare(&sql)?;
    let rows = stmt.query_map([], |row| {
        Ok(Customer {
            id: row.get(0)?,
            name: row.get(1)?,
            phone: row.get(2)?,
            address: row.get(3)?,
            notes: row.get(4)?,
            outstanding_balance: row.get(5)?,
        })
    })?;
    rows.collect()
}

pub fn create_customer(conn: &Connection, payload: &CreateCustomerPayload) -> Result<i64> {
    conn.execute(
        "INSERT INTO customers (name, phone, address, notes, outstanding_balance) VALUES (?1, ?2, ?3, ?4, 0)",
        params![payload.name, payload.phone, payload.address, payload.notes],
    )?;
    Ok(conn.last_insert_rowid())
}

pub fn get_customer_by_id(conn: &Connection, id: i64) -> Result<Customer> {
    conn.query_row(
        "SELECT id, name, phone, address, notes, outstanding_balance
         FROM customers WHERE id = ?1",
        params![id],
        |row| Ok(Customer {
            id: row.get(0)?,
            name: row.get(1)?,
            phone: row.get(2)?,
            address: row.get(3)?,
            notes: row.get(4)?,
            outstanding_balance: row.get(5)?,
        }),
    )
}

pub fn get_total_udhaar(conn: &Connection) -> Result<f64> {
    conn.query_row(
        "SELECT COALESCE(SUM(outstanding_balance), 0) FROM customers WHERE outstanding_balance > 0",
        [],
        |row| row.get(0),
    )
}

pub fn get_top_defaulters(conn: &Connection, limit: i64) -> Result<Vec<Customer>> {
    let mut stmt = conn.prepare(
        "SELECT id, name, phone, address, notes, outstanding_balance
         FROM customers
         WHERE outstanding_balance > 0
         ORDER BY outstanding_balance DESC
         LIMIT ?1",
    )?;
    let rows = stmt.query_map(params![limit], |row| {
        Ok(Customer {
            id: row.get(0)?,
            name: row.get(1)?,
            phone: row.get(2)?,
            address: row.get(3)?,
            notes: row.get(4)?,
            outstanding_balance: row.get(5)?,
        })
    })?;
    rows.collect()
}
