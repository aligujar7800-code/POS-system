use rusqlite::{Connection, Result, params};

/// Scans and repairs journal entries that are missing reference_id or reference_type.
/// This links old entries to their respective Suppliers and Customers.
pub fn repair_journal_links(conn: &Connection) -> Result<usize> {
    let mut repaired_count = 0;

    // 1. Link Suppliers based on names in description
    let suppliers: Vec<(i64, String)> = {
        let mut stmt = conn.prepare("SELECT id, name FROM suppliers")?;
        let rows = stmt.query_map([], |r| Ok((r.get(0)?, r.get::<_, String>(1)?)))?;
        rows.filter_map(|r| r.ok()).collect()
    };

    for (s_id, s_name) in suppliers {
        let affected = conn.execute(
            "UPDATE journal_entries 
             SET reference_id = ?1, reference_type = CASE 
                WHEN description LIKE '%purchase%' OR description LIKE '%Stock%' THEN 'inward_stock'
                WHEN description LIKE '%Payment%' THEN 'supplier_payment'
                ELSE 'supplier_payment'
             END
             WHERE (reference_id IS NULL OR reference_id = 0) 
             AND description LIKE ?",
            params![s_id, format!("%{}%", s_name)],
        )?;
        repaired_count += affected;
    }

    // 2. Link Customers based on names in description
    let customers: Vec<(i64, String)> = {
        let mut stmt = conn.prepare("SELECT id, name FROM customers")?;
        let rows = stmt.query_map([], |r| Ok((r.get(0)?, r.get::<_, String>(1)?)))?;
        rows.filter_map(|r| r.ok()).collect()
    };

    for (c_id, c_name) in customers {
        let affected = conn.execute(
            "UPDATE journal_entries 
             SET reference_id = ?1, reference_type = CASE 
                WHEN description LIKE '%Sale%' THEN 'sale'
                WHEN description LIKE '%Payment%' OR description LIKE '%Udhaar%' THEN 'customer_payment'
                ELSE 'customer_payment'
             END
             WHERE (reference_id IS NULL OR reference_id = 0) 
             AND description LIKE ?",
            params![c_id, format!("%{}%", c_name)],
        )?;
        repaired_count += affected;
    }

    // 3. Fix missing reference_types for existing IDs
    let affected_types = conn.execute(
        "UPDATE journal_entries 
         SET reference_type = 'supplier_payment' 
         WHERE reference_id IN (SELECT id FROM suppliers) AND reference_type IS NULL",
        [],
    )?;
    repaired_count += affected_types;

    // 4. Backfill missing Opening Balance journal entries for Suppliers
    let suppliers_with_bal: Vec<(i64, String, f64)> = {
        let mut stmt = conn.prepare("SELECT id, name, opening_balance FROM suppliers WHERE opening_balance != 0")?;
        let rows = stmt.query_map([], |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)))?;
        rows.filter_map(|r| r.ok()).collect()
    };

    for (s_id, s_name, s_bal) in suppliers_with_bal {
        let exists: bool = conn.query_row(
            "SELECT COUNT(*) FROM journal_entries WHERE reference_id = ?1 AND reference_type = 'supplier_opening'",
            params![s_id],
            |r| Ok(r.get::<_, i64>(0)? > 0),
        )?;

        if !exists {
            if let Err(e) = crate::db::auto_post::post_supplier_opening_balance(conn, s_bal, s_id, &s_name, None) {
                eprintln!("Repair: Failed to post opening balance for {}: {:?}", s_name, e);
            } else {
                repaired_count += 1;
            }
        }
    }

    // 5. Recalculate all Party Balances from scratch
    recalculate_party_balances(conn)?;

    Ok(repaired_count)
}

pub fn recalculate_party_balances(conn: &Connection) -> Result<()> {
    // 1. Recalculate Suppliers
    let supplier_ids: Vec<i64> = {
        let mut stmt = conn.prepare("SELECT id FROM suppliers")?;
        let rows = stmt.query_map([], |r| r.get(0))?;
        rows.filter_map(|r| r.ok()).collect()
    };

    for s_id in supplier_ids {
        // Balance = (Credits - Debits) for Payables
        let balance: f64 = conn.query_row(
            "SELECT COALESCE(SUM(jl.credit_amount - jl.debit_amount), 0)
             FROM journal_lines jl
             JOIN journal_entries je ON jl.journal_id = je.id
             JOIN accounts a ON jl.account_id = a.id
             WHERE je.reference_id = ?1 AND je.reference_type IN ('inward_stock', 'supplier_payment', 'supplier', 'manual', 'supplier_opening')
             AND a.code = '2001'",
            params![s_id],
            |r| r.get(0),
        )?;

        conn.execute("UPDATE suppliers SET outstanding_balance = ?1 WHERE id = ?2", params![balance, s_id])?;
    }

    // 2. Recalculate Customers
    let customer_ids: Vec<i64> = {
        let mut stmt = conn.prepare("SELECT id FROM customers")?;
        let rows = stmt.query_map([], |r| r.get(0))?;
        rows.filter_map(|r| r.ok()).collect()
    };

    for c_id in customer_ids {
        // Balance = (Debits - Credits) for Receivables
        let balance: f64 = conn.query_row(
            "SELECT COALESCE(SUM(jl.debit_amount - jl.credit_amount), 0)
             FROM journal_lines jl
             JOIN journal_entries je ON jl.journal_id = je.id
             JOIN accounts a ON jl.account_id = a.id
             WHERE je.reference_id = ?1 AND je.reference_type IN ('sale', 'customer_payment', 'udhaar_payment', 'customer', 'manual')
             AND a.code = '1020'",
            params![c_id],
            |r| r.get(0),
        )?;

        conn.execute("UPDATE customers SET outstanding_balance = ?1 WHERE id = ?2", params![balance, c_id])?;
    }

    Ok(())
}
