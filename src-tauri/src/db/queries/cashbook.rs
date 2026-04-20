use rusqlite::{Connection, Result, params};
use serde::{Deserialize, Serialize};
use crate::db::queries::accounts;

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct CashBookEntry {
    pub id: i64,
    pub entry_type: String, // 'income' | 'expense' | 'transfer'
    pub category: String,
    pub amount: f64,
    pub payment_method: String,
    pub reference_id: Option<i64>,
    pub description: Option<String>,
    pub entry_date: String,
    pub created_by: Option<i64>,
    pub username: Option<String>,
    pub running_balance: f64,
}

/// Fetches a consolidated cash flow statement from the Accounting Journal.
/// This includes ALL movements in Cash (1001) and Bank (1002) accounts.
pub fn get_financial_ledger(
    conn: &Connection,
    from: Option<&str>,
    to: Option<&str>,
) -> Result<Vec<CashBookEntry>> {
    // 1. Calculate opening balance for Cash (1001) and Bank (1002)
    let opening_balance: f64 = if let Some(from_date) = from {
        conn.query_row(
            "SELECT COALESCE(SUM(jl.debit_amount - jl.credit_amount), 0)
             FROM journal_lines jl
             JOIN journal_entries je ON je.id = jl.journal_id
             JOIN accounts a ON a.id = jl.account_id
             WHERE a.code IN ('1001', '1002')
             AND date(je.entry_date, 'localtime') < ?1",
            params![from_date],
            |row| row.get(0),
        ).unwrap_or(0.0)
    } else {
        0.0
    };

    // 2. Fetch all journal lines affecting liquidity accounts
    // We also try to find the "Opposite Account Name" to use as a category.
    let mut sql = "
        SELECT 
            jl.id,
            CASE WHEN jl.debit_amount > 0 THEN 'income' ELSE 'expense' END as entry_type,
            COALESCE(
                (SELECT 
                    CASE 
                        WHEN je.reference_type = 'supplier' THEN (SELECT 'Supplier: ' || s.name FROM suppliers s WHERE s.id = je.reference_id)
                        WHEN je.reference_type = 'customer' THEN (SELECT 'Customer: ' || c.name FROM customers c WHERE c.id = je.reference_id)
                        ELSE a2.name 
                    END
                 FROM journal_lines jl2 
                 JOIN accounts a2 ON a2.id = jl2.account_id 
                 WHERE jl2.journal_id = je.id AND a2.code NOT IN ('1001', '1002') 
                 LIMIT 1),
                'Transfer'
            ) as category,
            ABS(jl.debit_amount - jl.credit_amount) as amount,
            a.name as payment_method, -- Shows 'Cash' or 'Bank' as the method
            je.reference_id,
            je.description,
            je.entry_date,
            je.created_by,
            u.username
        FROM journal_lines jl
        JOIN journal_entries je ON je.id = jl.journal_id
        JOIN accounts a ON a.id = jl.account_id
        LEFT JOIN users u ON u.id = je.created_by
        WHERE a.code IN ('1001', '1002')
    ".to_string();

    if let Some(_f) = from {
        sql += " AND date(je.entry_date, 'localtime') >= ?1";
    }
    if let Some(_t) = to {
        let p_idx = if from.is_some() { 2 } else { 1 };
        sql += &format!(" AND date(je.entry_date, 'localtime') <= ?{}", p_idx);
    }
    
    sql += " ORDER BY je.entry_date ASC, je.id ASC";

    let mut stmt = conn.prepare(&sql)?;

    let rows = match (from, to) {
        (Some(f), Some(t)) => stmt.query_map(params![f, t], map_journal_to_cashbook)?,
        (Some(f), None) => stmt.query_map(params![f], map_journal_to_cashbook)?,
        (None, Some(t)) => stmt.query_map(params![t], map_journal_to_cashbook)?,
        (None, None) => stmt.query_map(params![], map_journal_to_cashbook)?,
    };

    let mut results = Vec::new();
    let mut current_balance = opening_balance;

    for row in rows {
        if let Ok(mut entry) = row {
            if entry.entry_type == "income" {
                current_balance += entry.amount;
            } else {
                current_balance -= entry.amount;
            }
            entry.running_balance = current_balance;
            results.push(entry);
        }
    }

    Ok(results)
}

fn map_journal_to_cashbook(row: &rusqlite::Row) -> rusqlite::Result<CashBookEntry> {
    Ok(CashBookEntry {
        id: row.get(0)?,
        entry_type: row.get(1)?,
        category: row.get(2)?,
        amount: row.get(3)?,
        payment_method: row.get(4)?,
        reference_id: row.get(5)?,
        description: row.get(6)?,
        entry_date: row.get(7)?,
        created_by: row.get(8)?,
        username: row.get(9)?,
        running_balance: 0.0,
    })
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct CreateCashBookPayload {
    pub entry_type: String, // 'income' or 'expense'
    pub category: String,
    pub amount: f64,
    pub payment_method: String,
    pub description: Option<String>,
    pub created_by: Option<i64>,
    pub customer_id: Option<i64>,
    pub supplier_id: Option<i64>,
}

pub fn add_cashbook_entry(conn: &Connection, payload: &CreateCashBookPayload) -> Result<i64> {
    // 1. Determine accounts
    let cash_account_code = if payload.payment_method.to_lowercase() == "bank" { "1002" } else { "1001" };
    let cash_id = accounts::get_account_id_by_code(conn, cash_account_code)?;
    
    // 2. Determine the opposite account (Income or Expense)
    let is_debt_recovery = payload.category.to_lowercase().contains("debt") || 
                           payload.category.to_lowercase().contains("recovery") ||
                           payload.category.to_lowercase().contains("wasooli") ||
                           payload.customer_id.is_some();

    let is_supplier_payment = payload.category.to_lowercase().contains("supplier") || 
                              payload.category.to_lowercase().contains("purchase payment") ||
                              payload.supplier_id.is_some();

    let opposite_account_code = if payload.entry_type == "expense" {
        if is_supplier_payment {
            "2001" // Accounts Payable
        } else {
            match payload.category.to_lowercase().as_str() {
                "rent" => "5010",
                "electricity" | "electric" => "5011",
                "salary" | "salaries" | "staff" => "5012",
                "packaging" | "bags" => "5013",
                "transport" | "delivery" => "5014",
                "mobile" | "internet" | "phone" => "5015",
                "repair" | "maintenance" => "5016",
                _ => "5020",
            }
        }
    } else {
        // For income
        if is_debt_recovery {
            "1020" // Accounts Receivable
        } else {
            match payload.category.to_lowercase().as_str() {
                "investment" | "owner" | "capital" => "3001", // Owner's Capital
                "sale" | "revenue" => "4001",
                _ => "4001", // Default to Sales Revenue if unknown
            }
        }
    };
    let opposite_id = accounts::get_account_id_by_code(conn, opposite_account_code)?;

    let today = chrono::Local::now().format("%Y-%m-%d %H:%M:%S").to_string();
    let is_income = payload.entry_type == "income";

    // 3. Create General Ledger entry (Journal)
    let entry = accounts::CreateJournalEntry {
        entry_date: today.clone(),
        description: payload.description.clone().unwrap_or_else(|| payload.category.clone()),
        reference_type: Some(if is_supplier_payment { "supplier".to_string() } else if is_debt_recovery { "customer".to_string() } else { payload.entry_type.clone() }),
        reference_id: payload.supplier_id.or(payload.customer_id), 
        lines: vec![
            accounts::CreateJournalLine {
                account_id: cash_id,
                debit_amount: if is_income { payload.amount } else { 0.0 },
                credit_amount: if is_income { 0.0 } else { payload.amount },
                description: None,
            },
            accounts::CreateJournalLine {
                account_id: opposite_id,
                debit_amount: if is_income { 0.0 } else { payload.amount },
                credit_amount: if is_income { payload.amount } else { 0.0 },
                description: Some(payload.category.clone()),
            },
        ],
    };

    let journal_id = accounts::create_journal_entry(conn, &entry, payload.created_by)?;

    // 4. Update Subsidiary Ledgers
    // Customer Sync
    if let Some(cid) = payload.customer_id {
        if is_income && opposite_account_code == "1020" {
            let balance_after: f64 = conn.query_row(
                "SELECT outstanding_balance FROM customers WHERE id = ?1",
                params![cid], |r| r.get(0)
            ).unwrap_or(0.0);

            conn.execute(
                "INSERT INTO ledger_entries (customer_id, entry_type, amount, balance_after, description, created_by)
                 VALUES (?1, 'payment', ?2, ?3, ?4, ?5)",
                params![
                    cid, payload.amount, balance_after,
                    format!("Cash Flow Recovery: {}", payload.category), payload.created_by
                ],
            )?;
        }
    }

    // Supplier Sync
    if let Some(sid) = payload.supplier_id {
        if !is_income && opposite_account_code == "2001" {
            let balance_after: f64 = conn.query_row(
                "SELECT outstanding_balance FROM suppliers WHERE id = ?1",
                params![sid], |r| r.get(0)
            ).unwrap_or(0.0);

            conn.execute(
                "INSERT INTO supplier_ledger (supplier_id, entry_type, amount, balance_after, description, created_by)
                 VALUES (?1, 'payment', ?2, ?3, ?4, ?5)",
                params![
                    sid, payload.amount, balance_after,
                    format!("Cash Flow Payment: {}", payload.category), payload.created_by
                ],
            )?;
        }
    }

    Ok(journal_id)
}
