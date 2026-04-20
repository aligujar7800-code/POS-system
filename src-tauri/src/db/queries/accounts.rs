use rusqlite::{Connection, Result, params};
use serde::{Deserialize, Serialize};

// ── Structs ──────────────────────────────────────────────────

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct Account {
    pub id: i64,
    pub code: String,
    pub name: String,
    pub name_ur: Option<String>,
    pub account_type: String,
    pub category: String,
    pub normal_balance: String,
    pub is_system: bool,
    pub is_active: bool,
    pub parent_id: Option<i64>,
    pub description: Option<String>,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct AccountWithBalance {
    pub account: Account,
    pub debit_total: f64,
    pub credit_total: f64,
    pub balance: f64,
    pub normal_balance_amount: f64,
}

#[allow(dead_code)]
#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct JournalEntry {
    pub id: i64,
    pub entry_number: String,
    pub entry_date: String,
    pub description: String,
    pub reference_type: Option<String>,
    pub reference_id: Option<i64>,
    pub lines: Vec<JournalLine>,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct JournalLine {
    pub id: i64,
    pub account_id: i64,
    pub account_code: String,
    pub account_name: String,
    pub debit_amount: f64,
    pub credit_amount: f64,
    pub description: Option<String>,
}

#[derive(Serialize, Deserialize, Debug)]
pub struct CreateJournalEntry {
    pub entry_date: String,
    pub description: String,
    pub reference_type: Option<String>,
    pub reference_id: Option<i64>,
    pub lines: Vec<CreateJournalLine>,
}

#[derive(Serialize, Deserialize, Debug)]
pub struct CreateJournalLine {
    pub account_id: i64,
    pub debit_amount: f64,
    pub credit_amount: f64,
    pub description: Option<String>,
}

#[derive(Serialize, Deserialize, Debug)]
pub struct TrialBalance {
    pub from_date: String,
    pub to_date: String,
    pub accounts: Vec<AccountWithBalance>,
    pub total_debits: f64,
    pub total_credits: f64,
    pub is_balanced: bool,
}

#[derive(Serialize, Deserialize, Debug)]
pub struct ProfitLossReport {
    pub from_date: String,
    pub to_date: String,
    pub gross_revenue: f64,
    pub sales_discount: f64,
    pub sales_returns: f64,
    pub net_revenue: f64,
    pub cost_of_goods_sold: f64,
    pub gross_profit: f64,
    pub operating_expenses: Vec<AccountWithBalance>,
    pub total_operating_expenses: f64,
    pub net_profit: f64,
    pub net_profit_margin: f64,
}

#[derive(Deserialize, Debug)]
pub struct CreateAccountPayload {
    pub code: String,
    pub name: String,
    pub name_ur: Option<String>,
    pub account_type: String,
    pub category: String,
    pub normal_balance: String,
    pub parent_id: Option<i64>,
    pub description: Option<String>,
}

// ── Functions ────────────────────────────────────────────────

pub fn get_all_accounts(conn: &Connection) -> Result<Vec<Account>> {
    let mut stmt = conn.prepare(
        "SELECT id, code, name, name_ur, account_type, category, normal_balance,
                is_system, is_active, parent_id, description
         FROM accounts ORDER BY code"
    )?;
    let rows = stmt.query_map([], |row| {
        Ok(Account {
            id: row.get(0)?,
            code: row.get(1)?,
            name: row.get(2)?,
            name_ur: row.get(3)?,
            account_type: row.get(4)?,
            category: row.get(5)?,
            normal_balance: row.get(6)?,
            is_system: row.get::<_, i64>(7)? == 1,
            is_active: row.get::<_, i64>(8)? == 1,
            parent_id: row.get(9)?,
            description: row.get(10)?,
        })
    })?;
    rows.collect()
}

pub fn get_account_by_code(conn: &Connection, code: &str) -> Result<Account> {
    conn.query_row(
        "SELECT id, code, name, name_ur, account_type, category, normal_balance,
                is_system, is_active, parent_id, description
         FROM accounts WHERE code = ?1",
        params![code],
        |row| {
            Ok(Account {
                id: row.get(0)?,
                code: row.get(1)?,
                name: row.get(2)?,
                name_ur: row.get(3)?,
                account_type: row.get(4)?,
                category: row.get(5)?,
                normal_balance: row.get(6)?,
                is_system: row.get::<_, i64>(7)? == 1,
                is_active: row.get::<_, i64>(8)? == 1,
                parent_id: row.get(9)?,
                description: row.get(10)?,
            })
        },
    )
}

pub fn create_account(conn: &Connection, payload: &CreateAccountPayload) -> Result<i64> {
    // Validate code pattern
    let first_char = payload.code.chars().next().unwrap_or('0');
    let valid = match payload.account_type.as_str() {
        "asset" => first_char == '1',
        "liability" => first_char == '2',
        "equity" => first_char == '3',
        "revenue" => first_char == '4',
        "expense" => first_char == '5',
        _ => false,
    };
    if !valid {
        return Err(rusqlite::Error::InvalidParameterName(
            format!("Account code must start with correct digit for type: {}", payload.account_type)
        ));
    }

    conn.execute(
        "INSERT INTO accounts (code, name, name_ur, account_type, category, normal_balance, parent_id, description)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
        params![
            payload.code, payload.name, payload.name_ur,
            payload.account_type, payload.category, payload.normal_balance,
            payload.parent_id, payload.description
        ],
    )?;
    Ok(conn.last_insert_rowid())
}

pub fn update_account(conn: &Connection, id: i64, payload: &CreateAccountPayload) -> Result<()> {
    let is_system: bool = conn.query_row(
        "SELECT is_system FROM accounts WHERE id = ?1",
        params![id],
        |r| Ok(r.get::<_, i64>(0)? == 1),
    )?;
    if is_system {
        return Err(rusqlite::Error::InvalidParameterName(
            "System account cannot be modified".to_string()
        ));
    }
    conn.execute(
        "UPDATE accounts SET name = ?1, name_ur = ?2, description = ?3,
                updated_at = datetime('now') WHERE id = ?4",
        params![payload.name, payload.name_ur, payload.description, id],
    )?;
    Ok(())
}

pub fn delete_account(conn: &Connection, id: i64) -> Result<()> {
    let is_system: bool = conn.query_row(
        "SELECT is_system FROM accounts WHERE id = ?1",
        params![id],
        |r| Ok(r.get::<_, i64>(0)? == 1),
    )?;
    if is_system {
        return Err(rusqlite::Error::InvalidParameterName(
            "System account cannot be deleted".to_string()
        ));
    }
    let has_lines: i64 = conn.query_row(
        "SELECT COUNT(*) FROM journal_lines WHERE account_id = ?1",
        params![id],
        |r| r.get(0),
    )?;
    if has_lines > 0 {
        return Err(rusqlite::Error::InvalidParameterName(
            "Account has transactions and cannot be deleted".to_string()
        ));
    }
    conn.execute("DELETE FROM accounts WHERE id = ?1", params![id])?;
    Ok(())
}

// ── Journal Entry Creation ──────────────────────────────────

pub fn create_journal_entry(conn: &Connection, entry: &CreateJournalEntry, created_by: Option<i64>) -> Result<i64> {
    // Validation 1: minimum 2 lines
    if entry.lines.len() < 2 {
        return Err(rusqlite::Error::InvalidParameterName(
            "Journal entry must have at least 2 lines".to_string()
        ));
    }

    // Validation 2: debits == credits
    let total_debits: f64 = entry.lines.iter().map(|l| l.debit_amount).sum();
    let total_credits: f64 = entry.lines.iter().map(|l| l.credit_amount).sum();
    let diff = (total_debits - total_credits).abs();
    if diff > 0.01 {
        return Err(rusqlite::Error::InvalidParameterName(
            format!("Journal entry not balanced. Debits: {:.2}, Credits: {:.2}, Difference: {:.2}",
                    total_debits, total_credits, diff)
        ));
    }

    // Validation 3: no line with both debit and credit > 0
    for line in &entry.lines {
        if line.debit_amount > 0.0 && line.credit_amount > 0.0 {
            return Err(rusqlite::Error::InvalidParameterName(
                "A journal line cannot have both debit and credit amounts".to_string()
            ));
        }
    }

    // Generate entry number: JV-{YYYY}-{4digit}
    let year = chrono::Local::now().format("%Y").to_string();
    let count: i64 = conn.query_row(
        "SELECT COUNT(*) FROM journal_entries WHERE entry_number LIKE ?1",
        params![format!("JV-{}-%", year)],
        |r| r.get(0),
    )?;
    let entry_number = format!("JV-{}-{:04}", year, count + 1);

    // Save header
    conn.execute(
        "INSERT INTO journal_entries (entry_number, entry_date, description, reference_type, reference_id, created_by)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        params![
            entry_number, entry.entry_date, entry.description,
            entry.reference_type, entry.reference_id, created_by
        ],
    )?;
    let journal_id = conn.last_insert_rowid();

    // Save lines
    for line in &entry.lines {
        conn.execute(
            "INSERT INTO journal_lines (journal_id, account_id, debit_amount, credit_amount, description)
             VALUES (?1, ?2, ?3, ?4, ?5)",
            params![journal_id, line.account_id, line.debit_amount, line.credit_amount, line.description],
        )?;
    }

    // --- Subsidiary Ledger Syncing ---
    if let (Some(ref ref_type), Some(ref_id)) = (entry.reference_type.as_deref(), entry.reference_id) {
        for line in &entry.lines {
            let acct: Account = match conn.query_row(
                "SELECT id, code, name FROM accounts WHERE id = ?1",
                params![line.account_id],
                |r| Ok(Account {
                    id: r.get(0)?,
                    code: r.get(1)?,
                    name: r.get(2)?,
                    name_ur: None, account_type: "".to_string(), category: "".to_string(),
                    normal_balance: "".to_string(), is_system: false, is_active: true,
                    parent_id: None, description: None
                })
            ) {
                Ok(a) => a,
                Err(_) => continue,
            };

            // Handle Supplier (Account 2001 - Payables)
            if *ref_type == "supplier" && acct.code == "2001" {
                let amount = line.debit_amount - line.credit_amount; // Debit reduces payable
                conn.execute(
                    "UPDATE suppliers SET outstanding_balance = outstanding_balance - ?1 WHERE id = ?2",
                    params![amount, ref_id],
                )?;
                
                let balance_after: f64 = conn.query_row(
                    "SELECT outstanding_balance FROM suppliers WHERE id = ?1",
                    params![ref_id],
                    |r| r.get(0),
                ).unwrap_or(0.0);

                conn.execute(
                    "INSERT INTO supplier_ledger (supplier_id, entry_type, amount, balance_after, description, created_by)
                     VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
                    params![
                        ref_id, 
                        if line.debit_amount > 0.0 { "payment" } else { "adjustment" },
                        if line.debit_amount > 0.0 { line.debit_amount } else { line.credit_amount },
                        balance_after,
                        format!("Manual JV [{}]: {}", entry_number, entry.description),
                        created_by
                    ],
                )?;
            }

            // Handle Customer (Account 1020 - Receivables)
            if (*ref_type == "customer") && acct.code == "1020" {
                let amount = line.debit_amount - line.credit_amount; // Debit increases receivable
                conn.execute(
                    "UPDATE customers SET outstanding_balance = outstanding_balance + ?1 WHERE id = ?2",
                    params![amount, ref_id],
                )?;

                let balance_after: f64 = conn.query_row(
                    "SELECT outstanding_balance FROM customers WHERE id = ?1",
                    params![ref_id],
                    |r| r.get(0),
                ).unwrap_or(0.0);

                conn.execute(
                    "INSERT INTO ledger_entries (customer_id, entry_type, amount, balance_after, description, created_by)
                     VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
                    params![
                        ref_id,
                        if line.credit_amount > 0.0 { "payment" } else { "adjustment" },
                        if line.credit_amount > 0.0 { line.credit_amount } else { line.debit_amount },
                        balance_after,
                        format!("Manual JV [{}]: {}", entry_number, entry.description),
                        created_by
                    ],
                )?;
            }
        }
    }

    Ok(journal_id)
}

// ── Account Balance ─────────────────────────────────────────

fn get_account_balance_internal(conn: &Connection, account_id: i64, from: &str, to: &str) -> Result<(f64, f64)> {
    let (debit_total, credit_total): (f64, f64) = conn.query_row(
        "SELECT COALESCE(SUM(jl.debit_amount), 0), COALESCE(SUM(jl.credit_amount), 0)
         FROM journal_lines jl
         JOIN journal_entries je ON je.id = jl.journal_id
         WHERE jl.account_id = ?1 AND je.entry_date >= ?2 AND je.entry_date <= ?3",
        params![account_id, from, format!("{} 23:59:59", to)],
        |r| Ok((r.get(0)?, r.get(1)?)),
    )?;
    Ok((debit_total, credit_total))
}

// ── Trial Balance ───────────────────────────────────────────

pub fn get_trial_balance(conn: &Connection, from: &str, to: &str) -> Result<TrialBalance> {
    let accounts = get_all_accounts(conn)?;
    let mut result_accounts = Vec::new();
    let mut total_debits = 0.0_f64;
    let mut total_credits = 0.0_f64;

    for acct in accounts {
        if !acct.is_active { continue; }
        let (dr, cr) = get_account_balance_internal(conn, acct.id, from, to)?;
        if dr == 0.0 && cr == 0.0 { continue; } // skip zero-balance accounts

        let balance = dr - cr;
        let normal_balance_amount = if acct.normal_balance == "debit" { balance } else { -balance };

        // For trial balance display: put net in correct column
        if balance > 0.0 {
            total_debits += balance;
        } else {
            total_credits += balance.abs();
        }

        result_accounts.push(AccountWithBalance {
            account: acct,
            debit_total: dr,
            credit_total: cr,
            balance,
            normal_balance_amount,
        });
    }

    Ok(TrialBalance {
        from_date: from.to_string(),
        to_date: to.to_string(),
        accounts: result_accounts,
        total_debits,
        total_credits,
        is_balanced: (total_debits - total_credits).abs() < 0.01,
    })
}

// ── P&L Report ──────────────────────────────────────────────

pub fn get_profit_loss(conn: &Connection, from: &str, to: &str) -> Result<ProfitLossReport> {
    // Helper: get balance for account by code
    let bal = |code: &str| -> f64 {
        let acct = get_account_by_code(conn, code);
        match acct {
            Ok(a) => {
                let (dr, cr) = get_account_balance_internal(conn, a.id, from, to).unwrap_or((0.0, 0.0));
                if a.normal_balance == "credit" { cr - dr } else { dr - cr }
            }
            Err(_) => 0.0,
        }
    };

    let gross_revenue = bal("4001");
    let sales_discount = bal("4002");
    let sales_returns = bal("4003");
    let net_revenue = gross_revenue - sales_discount - sales_returns;
    let cost_of_goods_sold = bal("5001");
    let gross_profit = net_revenue - cost_of_goods_sold;

    // Operating expenses: all 5xxx accounts except 5001
    let mut operating_expenses = Vec::new();
    let mut total_operating_expenses = 0.0_f64;

    let expense_accounts: Vec<Account> = get_all_accounts(conn)?
        .into_iter()
        .filter(|a| a.account_type == "expense" && a.code != "5001" && a.is_active)
        .collect();

    for acct in expense_accounts {
        let (dr, cr) = get_account_balance_internal(conn, acct.id, from, to).unwrap_or((0.0, 0.0));
        let balance = dr - cr;
        if balance == 0.0 { continue; }
        total_operating_expenses += balance;
        operating_expenses.push(AccountWithBalance {
            account: acct,
            debit_total: dr,
            credit_total: cr,
            balance,
            normal_balance_amount: balance,
        });
    }

    let net_profit = gross_profit - total_operating_expenses;
    let net_profit_margin = if net_revenue > 0.0 { (net_profit / net_revenue) * 100.0 } else { 0.0 };

    Ok(ProfitLossReport {
        from_date: from.to_string(),
        to_date: to.to_string(),
        gross_revenue,
        sales_discount,
        sales_returns,
        net_revenue,
        cost_of_goods_sold,
        gross_profit,
        operating_expenses,
        total_operating_expenses,
        net_profit,
        net_profit_margin,
    })
}

// ── Account Ledger ──────────────────────────────────────────

pub fn get_account_ledger(conn: &Connection, account_id: i64, from: &str, to: &str) -> Result<Vec<JournalLine>> {
    let mut stmt = conn.prepare(
        "SELECT jl.id, jl.account_id, a.code, a.name,
                jl.debit_amount, jl.credit_amount, je.description,
                je.entry_number, je.entry_date, je.reference_type
         FROM journal_lines jl
         JOIN journal_entries je ON je.id = jl.journal_id
         JOIN accounts a ON a.id = jl.account_id
         WHERE jl.account_id = ?1 AND je.entry_date >= ?2 AND je.entry_date <= ?3
         ORDER BY je.entry_date ASC, je.id ASC"
    )?;
    let rows = stmt.query_map(params![account_id, from, format!("{} 23:59:59", to)], |row| {
        Ok(JournalLine {
            id: row.get(0)?,
            account_id: row.get(1)?,
            account_code: row.get(2)?,
            account_name: row.get(3)?,
            debit_amount: row.get(4)?,
            credit_amount: row.get(5)?,
            description: row.get(6)?,
        })
    })?;
    rows.collect()
}

// ── Utility: get account ID by code ─────────────────────────
pub fn get_account_id_by_code(conn: &Connection, code: &str) -> Result<i64> {
    conn.query_row(
        "SELECT id FROM accounts WHERE code = ?1",
        params![code],
        |r| r.get(0),
    )
}
