use rusqlite::{Connection, Result, params};
use super::queries::accounts;

/// Auto-post a completed sale to the journal.
/// Creates revenue entry + COGS entry.
pub fn post_sale(conn: &Connection, sale_id: i64, created_by: Option<i64>) -> Result<()> {
    // Fetch sale details
    let (total_amount, subtotal, discount_amount, tax_amount, payment_method, paid_amount): (f64, f64, f64, f64, String, f64) = conn.query_row(
        "SELECT total_amount, subtotal, discount_amount, tax_amount, payment_method, paid_amount FROM sales WHERE id = ?1",
        params![sale_id],
        |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?, r.get(4)?, r.get(5)?)),
    )?;

    let invoice: String = conn.query_row(
        "SELECT invoice_number FROM sales WHERE id = ?1",
        params![sale_id],
        |r| r.get(0),
    )?;

    // Fetch total COGS from sale_items
    let total_cogs: f64 = conn.query_row(
        "SELECT COALESCE(SUM(total_cogs), 0) FROM sale_items WHERE sale_id = ?1",
        params![sale_id],
        |r| r.get(0),
    )?;

    let today = chrono::Local::now().format("%Y-%m-%d %H:%M:%S").to_string();

    // ── Revenue journal entry ──
    let cash_account_id = accounts::get_account_id_by_code(conn, "1001")?;
    let bank_account_id = accounts::get_account_id_by_code(conn, "1002")?;
    let receivable_id = accounts::get_account_id_by_code(conn, "1020")?;
    let revenue_id = accounts::get_account_id_by_code(conn, "4001")?;
    let discount_id = accounts::get_account_id_by_code(conn, "4002")?;
    let tax_payable_id = accounts::get_account_id_by_code(conn, "2020")?;

    let mut lines = Vec::new();

    // Calculate portions for Mixed/Udhaar/Cash
    let udhaar_amount = (total_amount - paid_amount).max(0.0);
    
    // DR: Cash/Bank Portion
    if paid_amount > 0.0 {
        let target_account = if payment_method == "card" { bank_account_id } else { cash_account_id };
        lines.push(accounts::CreateJournalLine {
            account_id: target_account,
            debit_amount: paid_amount,
            credit_amount: 0.0,
            description: Some(format!("{} portion", payment_method)),
        });
    }

    // DR: Udhaar Portion (Receivable)
    if udhaar_amount > 0.0 {
        lines.push(accounts::CreateJournalLine {
            account_id: receivable_id,
            debit_amount: udhaar_amount,
            credit_amount: 0.0,
            description: Some("Udhaar portion".to_string()),
        });
    }

    // CR: Sales Revenue (subtotal before discount)
    let revenue_amount = subtotal;
    lines.push(accounts::CreateJournalLine {
        account_id: revenue_id,
        debit_amount: 0.0,
        credit_amount: revenue_amount,
        description: None,
    });

    // DR: Discount (contra-revenue)
    if discount_amount > 0.0 {
        lines.push(accounts::CreateJournalLine {
            account_id: discount_id,
            debit_amount: discount_amount,
            credit_amount: 0.0,
            description: Some("Sales discount".to_string()),
        });
    }

    // CR: Tax Payable
    if tax_amount > 0.0 {
        lines.push(accounts::CreateJournalLine {
            account_id: tax_payable_id,
            debit_amount: 0.0,
            credit_amount: tax_amount,
            description: Some("GST on sale".to_string()),
        });
    }

    // Balance the debit side: total debits must equal total credits
    // Debits = cash/receivable + discount 
    // Credits = revenue + tax
    // They should balance already since total_amount = subtotal - discount + tax
    // and we put subtotal as revenue credit, discount as DR, tax as CR
    // Actually: DR side = total_amount + discount_amount
    //           CR side = subtotal + tax_amount = (total_amount + discount_amount - tax_amount) + tax_amount = total_amount + discount_amount
    // So they balance ✓

    if lines.len() >= 2 {
        let (customer_id,): (Option<i64>,) = conn.query_row(
            "SELECT customer_id FROM sales WHERE id = ?1",
            params![sale_id],
            |r| Ok((r.get(0)?,)),
        ).unwrap_or((None,));

        let entry = accounts::CreateJournalEntry {
            entry_date: today.clone(),
            description: format!("Sale {}", invoice),
            reference_type: Some("sale".to_string()),
            reference_id: customer_id, // Link to Customer
            lines,
        };
        let _ = accounts::create_journal_entry(conn, &entry, created_by);
    }

    // ── COGS journal entry ──
    if total_cogs > 0.0 {
        let cogs_id = accounts::get_account_id_by_code(conn, "5001")?;
        let inventory_id = accounts::get_account_id_by_code(conn, "1010")?;

        let (customer_id,): (Option<i64>,) = conn.query_row(
            "SELECT customer_id FROM sales WHERE id = ?1",
            params![sale_id],
            |r| Ok((r.get(0)?,)),
        ).unwrap_or((None,));

        let cogs_entry = accounts::CreateJournalEntry {
            entry_date: today,
            description: format!("COGS for {}", invoice),
            reference_type: Some("sale".to_string()),
            reference_id: customer_id, // Link to Customer
            lines: vec![
                accounts::CreateJournalLine {
                    account_id: cogs_id,
                    debit_amount: total_cogs,
                    credit_amount: 0.0,
                    description: Some("Cost of goods sold".to_string()),
                },
                accounts::CreateJournalLine {
                    account_id: inventory_id,
                    debit_amount: 0.0,
                    credit_amount: total_cogs,
                    description: Some("Inventory reduction".to_string()),
                },
            ],
        };
        let _ = accounts::create_journal_entry(conn, &cogs_entry, created_by);
    }

    Ok(())
}

pub fn post_sales_return(conn: &Connection, return_id: i64, created_by: Option<i64>) -> Result<()> {
    // 1. Fetch return and sale details
    let (sale_id, return_number, total_refund, refund_method, _reason): (i64, String, f64, String, Option<String>) = conn.query_row(
        "SELECT sale_id, return_number, total_refund, refund_method, reason FROM sales_returns WHERE id = ?1",
        params![return_id],
        |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?, r.get(4)?)),
    )?;

    let (invoice_number, customer_id): (String, Option<i64>) = conn.query_row(
        "SELECT invoice_number, customer_id FROM sales WHERE id = ?1",
        params![sale_id],
        |r| Ok((r.get(0)?, r.get(1)?)),
    )?;

    // 2. Calculate COGS reversal for NON-damaged items
    let cogs_reversal: f64 = conn.query_row(
        "SELECT COALESCE(SUM(si.total_cogs / si.quantity * sri.quantity), 0) 
         FROM sales_return_items sri
         JOIN sale_items si ON si.id = sri.sale_item_id
         WHERE sri.return_id = ?1 AND sri.is_damaged = 0",
        params![return_id],
        |r| r.get(0),
    )?;

    let today = chrono::Local::now().format("%Y-%m-%d %H:%M:%S").to_string();
    let mut lines = Vec::new();

    // Accounts
    let sales_return_id = accounts::get_account_id_by_code(conn, "4003")?;
    let cash_id = accounts::get_account_id_by_code(conn, "1001")?;
    let receivable_id = accounts::get_account_id_by_code(conn, "1020")?;
    let inventory_id = accounts::get_account_id_by_code(conn, "1010")?;
    let cogs_id = accounts::get_account_id_by_code(conn, "5001")?;

    // ── Entry 1: Refund Transaction ──
    // DR: Sales Returns (4003)
    lines.push(accounts::CreateJournalLine {
        account_id: sales_return_id,
        debit_amount: total_refund,
        credit_amount: 0.0,
        description: Some(format!("Return for {}", invoice_number)),
    });

    // CR: Cash or Receivable
    if refund_method == "adjustment" {
        lines.push(accounts::CreateJournalLine {
            account_id: receivable_id,
            debit_amount: 0.0,
            credit_amount: total_refund,
            description: Some("Customer balance adjusted".to_string()),
        });
    } else {
        lines.push(accounts::CreateJournalLine {
            account_id: cash_id,
            debit_amount: 0.0,
            credit_amount: total_refund,
            description: Some("Cash refunded".to_string()),
        });
    }

    let refund_entry = accounts::CreateJournalEntry {
        entry_date: today.clone(),
        description: format!("Return {} ({})", return_number, invoice_number),
        reference_type: Some("sale".to_string()),
        reference_id: customer_id,
        lines,
    };
    let _ = accounts::create_journal_entry(conn, &refund_entry, created_by);

    // ── Entry 2: COGS Reversal (if items returned to stock) ──
    if cogs_reversal > 0.0 {
        let cogs_reversal_entry = accounts::CreateJournalEntry {
            entry_date: today,
            description: format!("COGS Reversal for Return {}", return_number),
            reference_type: Some("sale".to_string()),
            reference_id: customer_id,
            lines: vec![
                accounts::CreateJournalLine {
                    account_id: inventory_id,
                    debit_amount: cogs_reversal,
                    credit_amount: 0.0,
                    description: Some("Inventory restored".to_string()),
                },
                accounts::CreateJournalLine {
                    account_id: cogs_id,
                    debit_amount: 0.0,
                    credit_amount: cogs_reversal,
                    description: Some("COGS reversal".to_string()),
                },
            ],
        };
        let _ = accounts::create_journal_entry(conn, &cogs_reversal_entry, created_by);
    }

    Ok(())
}

/// Auto-post an expense entry.
#[allow(dead_code)]
pub fn post_expense(conn: &Connection, amount: f64, account_code: &str, description: &str, created_by: Option<i64>) -> Result<()> {
    if amount <= 0.0 { return Ok(()); }

    let expense_account_id = accounts::get_account_id_by_code(conn, account_code)
        .unwrap_or_else(|_| accounts::get_account_id_by_code(conn, "5020").unwrap_or(0));
    let cash_id = accounts::get_account_id_by_code(conn, "1001")?;

    if expense_account_id == 0 { return Ok(()); }

    let today = chrono::Local::now().format("%Y-%m-%d %H:%M:%S").to_string();

    let entry = accounts::CreateJournalEntry {
        entry_date: today,
        description: description.to_string(),
        reference_type: Some("expense".to_string()),
        reference_id: None,
        lines: vec![
            accounts::CreateJournalLine {
                account_id: expense_account_id,
                debit_amount: amount,
                credit_amount: 0.0,
                description: Some(description.to_string()),
            },
            accounts::CreateJournalLine {
                account_id: cash_id,
                debit_amount: 0.0,
                credit_amount: amount,
                description: Some("Cash payment".to_string()),
            },
        ],
    };
    let _ = accounts::create_journal_entry(conn, &entry, created_by);
    Ok(())
}

/// Auto-post udhaar payment received from customer.
pub fn post_udhaar_payment(conn: &Connection, amount: f64, customer_id: i64, customer_name: &str, created_by: Option<i64>) -> Result<()> {
    if amount <= 0.0 { return Ok(()); }

    let cash_id = accounts::get_account_id_by_code(conn, "1001")?;
    let receivable_id = accounts::get_account_id_by_code(conn, "1020")?;

    let today = chrono::Local::now().format("%Y-%m-%d %H:%M:%S").to_string();

    let entry = accounts::CreateJournalEntry {
        entry_date: today,
        description: format!("Udhaar payment from {}", customer_name),
        reference_type: Some("customer_payment".to_string()),
        reference_id: Some(customer_id),
        lines: vec![
            accounts::CreateJournalLine {
                account_id: cash_id,
                debit_amount: amount,
                credit_amount: 0.0,
                description: None,
            },
            accounts::CreateJournalLine {
                account_id: receivable_id,
                debit_amount: 0.0,
                credit_amount: amount,
                description: None,
            },
        ],
    };
    let _ = accounts::create_journal_entry(conn, &entry, created_by);
    Ok(())
}

/// Auto-post inward stock purchase.
pub fn post_inward_stock(conn: &Connection, total_cost: f64, paid_amount: f64, supplier_id: i64, supplier_name: &str, created_by: Option<i64>) -> Result<()> {
    if total_cost <= 0.0 { return Ok(()); }

    let inventory_id = accounts::get_account_id_by_code(conn, "1010")?;
    let cash_id = accounts::get_account_id_by_code(conn, "1001")?;
    let payable_id = accounts::get_account_id_by_code(conn, "2001")?;

    let today = chrono::Local::now().format("%Y-%m-%d %H:%M:%S").to_string();

    let mut lines = Vec::new();

    // DR: Inventory
    lines.push(accounts::CreateJournalLine {
        account_id: inventory_id,
        debit_amount: total_cost,
        credit_amount: 0.0,
        description: Some(format!("Stock from {}", supplier_name)),
    });

    // CR: Cash (paid portion) or Payable (credit portion)
    if paid_amount > 0.0 {
        lines.push(accounts::CreateJournalLine {
            account_id: cash_id,
            debit_amount: 0.0,
            credit_amount: paid_amount,
            description: Some("Cash payment".to_string()),
        });
    }

    let diff = total_cost - paid_amount;
    if diff > 0.0 {
        // We owe the supplier (Credit balance)
        lines.push(accounts::CreateJournalLine {
            account_id: payable_id,
            debit_amount: 0.0,
            credit_amount: diff,
            description: Some(format!("Credit to {}", supplier_name)),
        });
    } else if diff < 0.0 {
        // We overpaid the supplier (Debit advance)
        lines.push(accounts::CreateJournalLine {
            account_id: payable_id,
            debit_amount: diff.abs(),
            credit_amount: 0.0,
            description: Some(format!("Advance payment to {}", supplier_name)),
        });
    }

    if lines.len() >= 2 {
        let entry = accounts::CreateJournalEntry {
            entry_date: today,
            description: format!("Inventory purchase from {}", supplier_name),
            reference_type: Some("inward_stock".to_string()),
            reference_id: Some(supplier_id),
            lines,
        };
        let _ = accounts::create_journal_entry(conn, &entry, created_by);
    }

    Ok(())
}

/// Auto-post payment made to supplier.
pub fn post_supplier_payment(conn: &Connection, amount: f64, supplier_id: i64, supplier_name: &str, created_by: Option<i64>) -> Result<()> {
    if amount <= 0.0 { return Ok(()); }

    let payable_id = accounts::get_account_id_by_code(conn, "2001")?;
    let cash_id = accounts::get_account_id_by_code(conn, "1001")?;

    let today = chrono::Local::now().format("%Y-%m-%d %H:%M:%S").to_string();

    let entry = accounts::CreateJournalEntry {
        entry_date: today,
        description: format!("Payment to supplier {}", supplier_name),
        reference_type: Some("supplier_payment".to_string()),
        reference_id: Some(supplier_id),
        lines: vec![
            accounts::CreateJournalLine {
                account_id: payable_id,
                debit_amount: amount,
                credit_amount: 0.0,
                description: None,
            },
            accounts::CreateJournalLine {
                account_id: cash_id,
                debit_amount: 0.0,
                credit_amount: amount,
                description: None,
            },
        ],
    };
    let _ = accounts::create_journal_entry(conn, &entry, created_by);
    Ok(())
}

/// Auto-post opening balance for a new supplier.
pub fn post_supplier_opening_balance(conn: &Connection, amount: f64, supplier_id: i64, supplier_name: &str, created_by: Option<i64>) -> Result<()> {
    if amount == 0.0 { return Ok(()); }

    let payable_id = accounts::get_account_id_by_code(conn, "2001")?;
    let equity_id = accounts::get_account_id_by_code(conn, "3001")?; // Owner Capital as offset

    let today = chrono::Local::now().format("%Y-%m-%d %H:%M:%S").to_string();
    let mut lines = Vec::new();

    if amount > 0.0 {
        // We owe the supplier: CR Payable, DR Equity (Opening Balances)
        lines.push(accounts::CreateJournalLine {
            account_id: payable_id,
            debit_amount: 0.0,
            credit_amount: amount,
            description: Some(format!("Opening balance for {}", supplier_name)),
        });
        lines.push(accounts::CreateJournalLine {
            account_id: equity_id,
            debit_amount: amount,
            credit_amount: 0.0,
            description: Some(format!("Opening balance offset for {}", supplier_name)),
        });
    } else {
        // Supplier owes us (Advance): DR Payable, CR Equity
        lines.push(accounts::CreateJournalLine {
            account_id: payable_id,
            debit_amount: amount.abs(),
            credit_amount: 0.0,
            description: Some(format!("Opening advance for {}", supplier_name)),
        });
        lines.push(accounts::CreateJournalLine {
            account_id: equity_id,
            debit_amount: 0.0,
            credit_amount: amount.abs(),
            description: Some(format!("Opening advance offset for {}", supplier_name)),
        });
    }

    let entry = accounts::CreateJournalEntry {
        entry_date: today,
        description: format!("Opening Balance: {}", supplier_name),
        reference_type: Some("supplier_opening".to_string()),
        reference_id: Some(supplier_id),
        lines,
    };
    let _ = accounts::create_journal_entry(conn, &entry, created_by);
    Ok(())
}

