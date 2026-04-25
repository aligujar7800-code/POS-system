use rusqlite::{Connection, Result};
use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct GlobalLedgerEntry {
    pub id: i64,
    pub entry_number: String,
    pub entry_date: String,
    pub description: String,
    pub reference_type: Option<String>,
    pub reference_id: Option<i64>,
    pub entity_name: Option<String>, // Customer or Supplier name
    pub debit: f64,
    pub credit: f64,
    pub account_name: String,
    pub account_code: String,
}

pub fn get_global_ledger(
    conn: &Connection,
    from: Option<&str>,
    to: Option<&str>,
    account_id: Option<i64>,
    reference_id: Option<i64>,
    reference_type: Option<&str>,
) -> Result<Vec<GlobalLedgerEntry>> {
    let mut sql = "
        SELECT 
            je.id, je.entry_number, je.entry_date, je.description, 
            je.reference_type, je.reference_id,
            jl.debit_amount, jl.credit_amount,
            a.name as account_name, a.code as account_code,
            CASE 
                WHEN je.reference_type IN ('sale', 'customer_payment', 'udhaar_payment', 'customer', 'customer_opening') THEN (SELECT name FROM customers WHERE id = je.reference_id)
                WHEN je.reference_type IN ('inward_stock', 'supplier_payment', 'supplier', 'supplier_opening') THEN (SELECT name FROM suppliers WHERE id = je.reference_id)
                ELSE NULL
            END as entity_name
        FROM journal_entries je
        JOIN journal_lines jl ON je.id = jl.journal_id
        JOIN accounts a ON jl.account_id = a.id
        WHERE 1=1
    ".to_string();

    let mut param_idx = 1;
    let mut query_params: Vec<Box<dyn rusqlite::ToSql>> = Vec::new();

    if let Some(f) = from.filter(|s| !s.is_empty()) {
        sql += &format!(" AND je.entry_date >= ?{}", param_idx);
        query_params.push(Box::new(f.to_string()));
        param_idx += 1;
    }
    if let Some(t) = to.filter(|s| !s.is_empty()) {
        sql += &format!(" AND je.entry_date <= ?{}", param_idx);
        query_params.push(Box::new(format!("{} 23:59:59", t)));
        param_idx += 1;
    }
    if let Some(aid) = account_id {
        sql += &format!(" AND jl.account_id = ?{}", param_idx);
        query_params.push(Box::new(aid));
        param_idx += 1;
    }
    if let Some(rid) = reference_id {
        sql += &format!(" AND je.reference_id = ?{}", param_idx);
        query_params.push(Box::new(rid));
        param_idx += 1;
    }
    if let Some(rt) = reference_type {
        if rt == "supplier" {
            sql += " AND je.reference_type IN ('inward_stock', 'supplier_payment', 'supplier', 'manual', 'supplier_opening') ";
            if account_id.is_none() {
                sql += " AND a.code = '2001' ";
            }
        } else if rt == "customer" {
            sql += " AND je.reference_type IN ('sale', 'customer_payment', 'udhaar_payment', 'customer', 'manual', 'customer_opening') ";
            if account_id.is_none() {
                sql += " AND a.code = '1020' ";
            }
        } else {
            sql += &format!(" AND je.reference_type = ?{}", param_idx);
            query_params.push(Box::new(rt.to_string()));
        }
    }

    sql += " ORDER BY je.entry_date DESC, je.id DESC LIMIT 500";

    let mut stmt = conn.prepare(&sql)?;
    let rows = stmt.query_map(
        rusqlite::params_from_iter(query_params),
        |row| {
            Ok(GlobalLedgerEntry {
                id: row.get(0)?,
                entry_number: row.get(1)?,
                entry_date: row.get(2)?,
                description: row.get(3)?,
                reference_type: row.get(4)?,
                reference_id: row.get(5)?,
                debit: row.get(6)?,
                credit: row.get(7)?,
                account_name: row.get(8)?,
                account_code: row.get(9)?,
                entity_name: row.get(10)?,
            })
        },
    )?;

    let mut entries = Vec::new();
    for row in rows {
        entries.push(row?);
    }
    Ok(entries)
}

#[derive(Serialize, Deserialize)]
pub struct FinancialSummary {
    pub total_receivable: f64,
    pub total_payable: f64,
    pub cash_balance: f64,
    pub bank_balance: f64,
    pub stock_value: f64,
    pub net_position: f64,
}

pub fn get_financial_summary(conn: &Connection) -> Result<FinancialSummary> {
    let total_receivable: f64 = conn.query_row(
        "SELECT COALESCE(SUM(outstanding_balance), 0) FROM customers WHERE outstanding_balance > 0",
        [],
        |r| r.get(0),
    )?;

    let total_payable: f64 = conn.query_row(
        "SELECT COALESCE(SUM(outstanding_balance), 0) FROM suppliers WHERE outstanding_balance > 0",
        [],
        |r| r.get(0),
    )?;

    // Total Cash (Account 1001)
    let cash_balance: f64 = conn.query_row(
        "SELECT COALESCE(SUM(jl.debit_amount - jl.credit_amount), 0) 
         FROM journal_lines jl JOIN accounts a ON a.id = jl.account_id 
         WHERE a.code = '1001'",
        [],
        |r| r.get(0),
    )?;

    // Total Bank (Account 1002)
    let bank_balance: f64 = conn.query_row(
        "SELECT COALESCE(SUM(jl.debit_amount - jl.credit_amount), 0) 
         FROM journal_lines jl JOIN accounts a ON a.id = jl.account_id 
         WHERE a.code = '1002'",
        [],
        |r| r.get(0),
    )?;
    
    // Total Stock Value (FIFO: Sum of remaining lots * their actual cost)
    let stock_value: f64 = conn.query_row(
        "SELECT COALESCE(SUM(remaining_qty * cost_price), 0) FROM purchase_lots",
        [],
        |r| r.get(0),
    )?;
    
    Ok(FinancialSummary {
        total_receivable,
        total_payable,
        cash_balance,
        bank_balance,
        stock_value,
        net_position: cash_balance + bank_balance + total_receivable + stock_value - total_payable,
    })
}

pub fn get_filtered_balance(
    conn: &Connection,
    account_id: Option<i64>,
    reference_id: Option<i64>,
    reference_type: Option<&str>,
) -> Result<f64> {
    let mut sql = "
        SELECT COALESCE(SUM(jl.debit_amount - jl.credit_amount), 0)
        FROM journal_lines jl
        JOIN journal_entries je ON jl.journal_id = je.id
        JOIN accounts a ON jl.account_id = a.id
        WHERE 1=1
    ".to_string();

    let mut param_idx = 1;
    let mut query_params: Vec<Box<dyn rusqlite::ToSql>> = Vec::new();

    if let Some(aid) = account_id {
        sql += &format!(" AND jl.account_id = ?{}", param_idx);
        query_params.push(Box::new(aid));
        param_idx += 1;
    } else if reference_id.is_some() {
        sql += " AND a.code IN ('1020', '2001') ";
    }
    
    if let Some(rid) = reference_id {
        sql += &format!(" AND je.reference_id = ?{}", param_idx);
        query_params.push(Box::new(rid));
        param_idx += 1;
    }
    if let Some(rt) = reference_type {
        if rt == "supplier" {
            sql += " AND je.reference_type IN ('inward_stock', 'supplier_payment', 'supplier', 'manual', 'supplier_opening') ";
            if account_id.is_none() {
                sql += " AND a.code = '2001' ";
            }
        } else if rt == "customer" {
            sql += " AND je.reference_type IN ('sale', 'customer_payment', 'udhaar_payment', 'customer', 'manual', 'customer_opening') ";
            if account_id.is_none() {
                sql += " AND a.code = '1020' ";
            }
        } else if !rt.is_empty() {
            sql += &format!(" AND je.reference_type = ?{}", param_idx);
            query_params.push(Box::new(rt.to_string()));
        }
    }

    conn.query_row(
        &sql,
        rusqlite::params_from_iter(query_params),
        |r| r.get(0),
    )
}
