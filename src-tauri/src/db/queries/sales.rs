use rusqlite::{Connection, Result, params};
use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct Sale {
    pub id: i64,
    pub invoice_number: String,
    pub customer_id: Option<i64>,
    pub customer_name: Option<String>,
    pub customer_phone: Option<String>,
    pub sale_date: String,
    pub subtotal: f64,
    pub discount_amount: f64,
    pub discount_percent: f64,
    pub tax_amount: f64,
    pub total_amount: f64,
    pub paid_amount: f64,
    pub change_amount: f64,
    pub payment_method: String,
    pub status: String,
    pub notes: Option<String>,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct SaleItem {
    pub id: Option<i64>,
    pub sale_id: Option<i64>,
    pub product_id: Option<i64>,
    pub variant_id: Option<i64>,
    pub product_name: String,
    pub barcode: Option<String>,
    pub quantity: i64,
    pub unit_price: f64,
    pub discount: f64,
    pub total_price: f64,
    #[serde(default)]
    pub returned_quantity: i64,
    pub item_meta: Option<String>,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct SalesReturn {
    pub id: i64,
    pub return_number: String,
    pub sale_id: i64,
    pub return_date: String,
    pub total_refund: f64,
    pub refund_method: String,
    pub reason: Option<String>,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct SalesReturnItem {
    pub id: i64,
    pub return_id: i64,
    pub sale_item_id: i64,
    pub product_name: String,
    pub quantity: i64,
    pub unit_price: f64,
    pub total_refund: f64,
    pub is_damaged: bool,
}

#[derive(Deserialize)]
pub struct CreateSalePayload {
    pub customer_id: Option<i64>,
    pub items: Vec<SaleItem>,
    pub subtotal: f64,
    pub discount_amount: f64,
    pub discount_percent: f64,
    pub tax_amount: f64,
    pub total_amount: f64,
    pub paid_amount: f64,
    pub change_amount: f64,
    pub payment_method: String,
    pub status: String,
    pub notes: Option<String>,
    pub created_by: Option<i64>,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct ReturnItemPayload {
    pub sale_item_id: i64,
    pub quantity: i64,
    pub is_damaged: bool,
}

#[derive(Deserialize)]
pub struct ProcessReturnPayload {
    pub sale_id: i64,
    pub items: Vec<ReturnItemPayload>,
    pub refund_method: String,
    pub reason: Option<String>,
    pub created_by: Option<i64>,
}

pub fn create_sale(conn: &mut Connection, payload: &CreateSalePayload) -> Result<(i64, String)> {
    let tx = conn.transaction()?;
    
    let invoice = generate_invoice_number(&tx)?;

    tx.execute(
        "INSERT INTO sales (invoice_number, customer_id, subtotal, discount_amount,
            discount_percent, tax_amount, total_amount, paid_amount, change_amount,
            payment_method, status, notes, created_by)
         VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13)",
        params![
            invoice, payload.customer_id, payload.subtotal, payload.discount_amount,
            payload.discount_percent, payload.tax_amount, payload.total_amount,
            payload.paid_amount, payload.change_amount, payload.payment_method,
            payload.status, payload.notes, payload.created_by
        ],
    )?;
    let sale_id = tx.last_insert_rowid();

    for item in &payload.items {
        let mut cogs = 0.0;
        
        let vid = if let Some(id) = item.variant_id {
            id
        } else if let Some(pid) = item.product_id {
            tx.query_row(
                "SELECT id FROM product_variants WHERE product_id = ?1 LIMIT 1",
                params![pid],
                |r| r.get(0),
            ).unwrap_or(0)
        } else {
            0
        };

        if vid > 0 {
            let current_qty: i64 = tx.query_row(
                "SELECT quantity FROM product_variants WHERE id = ?1",
                params![vid],
                |r| r.get(0),
            ).unwrap_or(0);

            let mut stock_deduction = item.quantity;
            if let Some(ref meta_str) = item.item_meta {
                if let Ok(meta_json) = serde_json::from_str::<serde_json::Value>(meta_str) {
                    if meta_json["sale_mode"] == "bottle" {
                        if let Some(bottle_ml) = meta_json["bottle_ml"].as_i64() {
                            stock_deduction = item.quantity * bottle_ml;
                        }
                    }
                }
            }

            if current_qty < stock_deduction {
                return Err(rusqlite::Error::ToSqlConversionFailure(Box::new(std::io::Error::new(
                    std::io::ErrorKind::Other,
                    format!("Insufficient stock for variant ID {}: Requested {}, Available {}", vid, stock_deduction, current_qty)
                ))));
            }

            cogs = crate::db::queries::products::deduct_fifo_lots(&tx, vid, stock_deduction).unwrap_or(0.0);
            tx.execute(
                "UPDATE product_variants SET quantity = quantity - ?1 WHERE id = ?2",
                params![stock_deduction, vid],
            )?;
            
            let new_qty = current_qty - stock_deduction;

            tx.execute(
                "INSERT INTO stock_history (product_id, variant_id, prev_qty, new_qty, reason, changed_by)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
                params![
                    item.product_id, vid, current_qty, new_qty,
                    format!("Sale {}", invoice), payload.created_by
                ],
            )?;
        }

        tx.execute(
            "INSERT INTO sale_items (sale_id, product_id, variant_id, product_name,
                barcode, quantity, unit_price, discount, total_price, total_cogs, item_meta)
             VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11)",
            params![
                sale_id, item.product_id, if vid > 0 { Some(vid) } else { item.variant_id }, item.product_name,
                item.barcode, item.quantity, item.unit_price, item.discount, item.total_price, cogs, item.item_meta
            ],
        )?;
    }

    if let Some(customer_id) = payload.customer_id {
        let udhaar = payload.total_amount - payload.paid_amount;
        if udhaar > 0.0 {
            let prev_balance: f64 = tx.query_row(
                "SELECT COALESCE(balance_after, 0) FROM ledger_entries
                 WHERE customer_id = ?1 ORDER BY entry_date DESC, id DESC LIMIT 1",
                params![customer_id],
                |r| r.get(0),
            ).unwrap_or(0.0);

            let new_balance = prev_balance + udhaar;
            tx.execute(
                "INSERT INTO ledger_entries (customer_id, sale_id, entry_type, amount, balance_after, description, created_by)
                 VALUES (?1, ?2, 'sale', ?3, ?4, ?5, ?6)",
                params![
                    customer_id, sale_id, udhaar, new_balance,
                    format!("Sale {}", invoice), payload.created_by
                ],
            )?;

            tx.execute(
                "UPDATE customers SET outstanding_balance = ?1 WHERE id = ?2",
                params![new_balance, customer_id],
            )?;
        }
    }

    if payload.paid_amount > 0.0 {
        tx.execute(
            "INSERT INTO cash_book (entry_type, category, amount, payment_method, reference_id, description, created_by)
             VALUES ('income', 'sales', ?1, ?2, ?3, ?4, ?5)",
            params![
                payload.paid_amount, payload.payment_method, sale_id,
                format!("Payment for {}", invoice), payload.created_by
            ],
        )?;
    }

    tx.commit()?;

    // Auto-post to accounting journal (MUST SUCCEED or we report error)
    crate::db::auto_post::post_sale(conn, sale_id, payload.created_by)
        .map_err(|e| rusqlite::Error::ToSqlConversionFailure(Box::new(std::io::Error::new(
            std::io::ErrorKind::Other,
            format!("Accounting auto-post failed: {}. The sale record exists, but please check financials manually.", e)
        ))))?;

    Ok((sale_id, invoice))
}

pub fn process_sales_return(conn: &mut Connection, payload: &ProcessReturnPayload) -> Result<(i64, String)> {
    let tx = conn.transaction()?;

    let return_no = generate_return_number(&tx)?;
    let mut total_refund = 0.0;

    // 1. Insert Return Header
    tx.execute(
        "INSERT INTO sales_returns (return_number, sale_id, refund_method, reason, created_by)
         VALUES (?1, ?2, ?3, ?4, ?5)",
        params![return_no, payload.sale_id, payload.refund_method, payload.reason, payload.created_by],
    )?;
    let return_id = tx.last_insert_rowid();

    // 2. Fetch sale info for accounting and discount calculation
    let (customer_id, invoice_number, subtotal, discount_amount): (Option<i64>, String, f64, f64) = tx.query_row(
        "SELECT customer_id, invoice_number, subtotal, discount_amount FROM sales WHERE id = ?1",
        params![payload.sale_id],
        |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?)),
    )?;

    let (sum_gross, sum_net): (f64, f64) = tx.query_row(
        "SELECT COALESCE(SUM(unit_price * quantity), 0), COALESCE(SUM(total_price), 0) FROM sale_items WHERE sale_id = ?1",
        params![payload.sale_id],
        |r| Ok((r.get(0)?, r.get(1)?)),
    )?;
    
    let total_item_discount = sum_gross - sum_net;
    let bill_discount = f64::max(0.0, discount_amount - total_item_discount);
    let discount_ratio = if sum_net > 0.0 { bill_discount / sum_net } else { 0.0 };

    // 3. Process each item
    for item in &payload.items {
        let (product_id, variant_id, unit_price, total_price, quantity, _product_name, returned_qty): (Option<i64>, Option<i64>, f64, f64, i64, String, i64) = tx.query_row(
            "SELECT product_id, variant_id, unit_price, total_price, quantity, product_name,
                    COALESCE((SELECT SUM(quantity) FROM sales_return_items WHERE sale_item_id = si.id), 0) as returned_qty
             FROM sale_items si WHERE si.id = ?1",
            params![item.sale_item_id],
            |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?, r.get(4)?, r.get(5)?, r.get(6)?)),
        )?;

        let available_to_return = quantity - returned_qty;
        if item.quantity > available_to_return {
            return Err(rusqlite::Error::ToSqlConversionFailure(Box::new(std::io::Error::new(
                std::io::ErrorKind::Other,
                format!("Cannot return more than available quantity. Available: {}, Requested: {}", available_to_return, item.quantity)
            ))));
        }


        let net_item_unit_price = if quantity > 0 { total_price / quantity as f64 } else { unit_price };
        let refunded_unit_price = net_item_unit_price * (1.0 - discount_ratio);
        let line_refund = refunded_unit_price * item.quantity as f64;
        total_refund += line_refund;

        tx.execute(
            "INSERT INTO sales_return_items (return_id, sale_item_id, product_id, variant_id, quantity, unit_price, total_refund, is_damaged)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
            params![return_id, item.sale_item_id, product_id, variant_id, item.quantity, refunded_unit_price, line_refund, item.is_damaged],
        )?;

        // Update Stock if not damaged
        if !item.is_damaged {
            if let Some(vid) = variant_id {
                let prev_qty: i64 = tx.query_row(
                    "SELECT quantity FROM product_variants WHERE id = ?1",
                    params![vid],
                    |r| r.get(0),
                ).unwrap_or(0);
                let new_qty = prev_qty + item.quantity;

                tx.execute(
                    "UPDATE product_variants SET quantity = quantity + ?1 WHERE id = ?2",
                    params![item.quantity, vid],
                )?;

                tx.execute(
                    "INSERT INTO stock_history (product_id, variant_id, prev_qty, new_qty, reason, changed_by)
                     VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
                    params![product_id, vid, prev_qty, new_qty, format!("Return for {}", invoice_number), payload.created_by],
                )?;
            }
        }
    }

    // 4. Update Header with total
    tx.execute(
        "UPDATE sales_returns SET total_refund = ?1 WHERE id = ?2",
        params![total_refund, return_id],
    )?;

    // 5. Adjust Accounting (Customer Ledger / Cash Book)
    if payload.refund_method == "adjustment" && customer_id.is_some() {
        let cid = customer_id.unwrap();
        let prev_balance: f64 = tx.query_row(
            "SELECT COALESCE(balance_after, 0) FROM ledger_entries WHERE customer_id = ?1 ORDER BY entry_date DESC, id DESC LIMIT 1",
            params![cid],
            |r| r.get(0),
        ).unwrap_or(0.0);
        let new_balance = prev_balance - total_refund;

        tx.execute(
            "INSERT INTO ledger_entries (customer_id, sale_id, entry_type, amount, balance_after, description, created_by)
             VALUES (?1, ?2, 'adjustment', ?3, ?4, ?5, ?6)",
            params![cid, payload.sale_id, -total_refund, new_balance, format!("Return SR-{}", return_id), payload.created_by],
        )?;

        tx.execute("UPDATE customers SET outstanding_balance = ?1 WHERE id = ?2", params![new_balance, cid])?;
    } else if payload.refund_method == "cash" {
        tx.execute(
            "INSERT INTO cash_book (entry_type, category, amount, payment_method, reference_id, description, created_by)
             VALUES ('expense', 'sales_return', ?1, 'cash', ?2, ?3, ?4)",
            params![total_refund, return_id, format!("Refund for Return {}", return_no), payload.created_by],
        )?;
    }

    tx.commit()?;

    // Auto-post to accounting journal (Sales Return accounts)
    if let Err(e) = crate::db::auto_post::post_sales_return(conn, return_id, payload.created_by) {
        let _ = std::fs::write("autopost_error.log", format!("Auto-post return failed (id={}): {:?}", return_id, e));
        eprintln!("Auto-post return failed (id={}): {:?}", return_id, e);
    }

    Ok((return_id, return_no))
}

pub fn get_sale_with_items(conn: &Connection, sale_id: i64) -> Result<(Sale, Vec<SaleItem>)> {
    let sale = conn.query_row(
        "SELECT s.id, s.invoice_number, s.customer_id, c.name, c.phone, s.sale_date,
                s.subtotal, s.discount_amount, s.discount_percent, s.tax_amount,
                s.total_amount, s.paid_amount, s.change_amount, s.payment_method,
                s.status, s.notes
         FROM sales s LEFT JOIN customers c ON c.id = s.customer_id
         WHERE s.id = ?1",
        params![sale_id],
        map_sale,
    )?;

    let mut stmt = conn.prepare(
        "SELECT si.id, si.sale_id, si.product_id, si.variant_id, si.product_name, si.barcode,
                si.quantity, si.unit_price, si.discount, si.total_price,
                COALESCE((SELECT SUM(quantity) FROM sales_return_items WHERE sale_item_id = si.id), 0) as returned_qty,
                si.item_meta
         FROM sale_items si WHERE si.sale_id = ?1",
    )?;
    let items: Result<Vec<SaleItem>> = stmt
        .query_map(params![sale_id], map_sale_item)?
        .collect();

    Ok((sale, items?))
}

pub fn get_sales_by_date(conn: &Connection, from: &str, to: &str) -> Result<Vec<Sale>> {
    let mut stmt = conn.prepare(
        "SELECT s.id, s.invoice_number, s.customer_id, c.name, c.phone, s.sale_date,
                s.subtotal, s.discount_amount, s.discount_percent, s.tax_amount,
                s.total_amount, s.paid_amount, s.change_amount, s.payment_method,
                s.status, s.notes
         FROM sales s LEFT JOIN customers c ON c.id = s.customer_id
         WHERE date(s.sale_date, 'localtime') BETWEEN ?1 AND ?2
         ORDER BY s.id DESC",
    )?;
    let rows = stmt.query_map(params![from, to], map_sale)?;
    rows.collect()
}

pub fn search_sales(conn: &Connection, query: Option<&str>, from: Option<&str>, to: Option<&str>) -> Result<Vec<Sale>> {
    let mut sql = "SELECT s.id, s.invoice_number, s.customer_id, c.name, c.phone, s.sale_date,
                          s.subtotal, s.discount_amount, s.discount_percent, s.tax_amount,
                          s.total_amount, s.paid_amount, s.change_amount, s.payment_method,
                          s.status, s.notes
                   FROM sales s LEFT JOIN customers c ON c.id = s.customer_id
                   WHERE 1=1 ".to_string();

    let mut bind_params: Vec<rusqlite::types::Value> = Vec::new();

    if let Some(q) = query {
        if !q.trim().is_empty() {
            sql.push_str(" AND (s.invoice_number LIKE ? OR c.name LIKE ? OR c.phone LIKE ?) ");
            let pattern = format!("%{}%", q);
            bind_params.push(pattern.clone().into());
            bind_params.push(pattern.clone().into());
            bind_params.push(pattern.into());
        }
    }

    if let Some(f) = from {
        if !f.trim().is_empty() {
            sql.push_str(" AND date(s.sale_date, 'localtime') >= ? ");
            bind_params.push(f.to_string().into());
        }
    }

    if let Some(t) = to {
        if !t.trim().is_empty() {
            sql.push_str(" AND date(s.sale_date, 'localtime') <= ? ");
            bind_params.push(t.to_string().into());
        }
    }

    sql.push_str(" ORDER BY s.id DESC LIMIT 100");

    let mut stmt = conn.prepare(&sql)?;
    let rows = stmt.query_map(rusqlite::params_from_iter(bind_params.iter()), map_sale)?;
    rows.collect()
}

pub fn get_todays_summary(conn: &Connection) -> Result<serde_json::Value> {
    let today = chrono::Local::now().format("%Y-%m-%d").to_string();
    let row = conn.query_row(
        "SELECT COUNT(*) as count, COALESCE(SUM(total_amount),0) as revenue,
                COALESCE(SUM(discount_amount),0) as discounts,
                COALESCE(SUM(paid_amount),0) as collected
         FROM sales WHERE date(sale_date, 'localtime') = ?1",
        params![today],
        |r| Ok((r.get::<_, i64>(0)?, r.get::<_, f64>(1)?, r.get::<_, f64>(2)?, r.get::<_, f64>(3)?)),
    )?;
    Ok(serde_json::json!({
        "count": row.0,
        "revenue": row.1,
        "discounts": row.2,
        "collected": row.3,
        "date": today
    }))
}

fn generate_invoice_number(conn: &Connection) -> Result<String> {
    let year = chrono::Local::now().format("%Y").to_string();
    let count: i64 = conn.query_row(
        "SELECT COUNT(*) FROM sales WHERE invoice_number LIKE ?1",
        params![format!("INV-{}-%%", year)],
        |r| r.get(0),
    )?;
    Ok(format!("INV-{}-{:04}", year, count + 1))
}

fn generate_return_number(conn: &Connection) -> Result<String> {
    let year = chrono::Local::now().format("%Y").to_string();
    conn.execute(
        "INSERT OR IGNORE INTO return_counters (year, last_val) VALUES (?1, 0)",
        params![year],
    )?;
    conn.execute(
        "UPDATE return_counters SET last_val = last_val + 1 WHERE year = ?1",
        params![year],
    )?;
    let val: i64 = conn.query_row(
        "SELECT last_val FROM return_counters WHERE year = ?1",
        params![year],
        |r| r.get(0),
    )?;
    Ok(format!("SR-{}-{:04}", year, val))
}

fn map_sale(row: &rusqlite::Row) -> rusqlite::Result<Sale> {
    Ok(Sale {
        id: row.get(0)?,
        invoice_number: row.get(1)?,
        customer_id: row.get(2)?,
        customer_name: row.get(3)?,
        customer_phone: row.get(4)?,
        sale_date: row.get(5)?,
        subtotal: row.get(6)?,
        discount_amount: row.get(7)?,
        discount_percent: row.get(8)?,
        tax_amount: row.get(9)?,
        total_amount: row.get(10)?,
        paid_amount: row.get(11)?,
        change_amount: row.get(12)?,
        payment_method: row.get(13)?,
        status: row.get(14)?,
        notes: row.get(15)?,
    })
}

fn map_sale_item(row: &rusqlite::Row) -> rusqlite::Result<SaleItem> {
    Ok(SaleItem {
        id: row.get(0)?,
        sale_id: row.get(1)?,
        product_id: row.get(2)?,
        variant_id: row.get(3)?,
        product_name: row.get(4)?,
        barcode: row.get(5)?,
        quantity: row.get(6)?,
        unit_price: row.get(7)?,
        discount: row.get(8)?,
        total_price: row.get(9)?,
        returned_quantity: row.get(10).unwrap_or(0),
        item_meta: row.get(11)?,
    })
}

pub fn get_return_with_items(conn: &Connection, return_id: i64) -> Result<(SalesReturn, Vec<SalesReturnItem>)> {
    let ret = conn.query_row(
        "SELECT id, return_number, sale_id, return_date, total_refund, refund_method, reason
         FROM sales_returns WHERE id = ?1",
        params![return_id],
        |row| Ok(SalesReturn {
            id: row.get(0)?,
            return_number: row.get(1)?,
            sale_id: row.get(2)?,
            return_date: row.get(3)?,
            total_refund: row.get(4)?,
            refund_method: row.get(5)?,
            reason: row.get(6)?,
        }),
    )?;

    let mut stmt = conn.prepare(
        "SELECT ri.id, ri.return_id, ri.sale_item_id, si.product_name,
                ri.quantity, ri.unit_price, ri.total_refund, ri.is_damaged
         FROM sales_return_items ri
         JOIN sale_items si ON si.id = ri.sale_item_id
         WHERE ri.return_id = ?1",
    )?;
    let items: Result<Vec<SalesReturnItem>> = stmt
        .query_map(params![return_id], |row| Ok(SalesReturnItem {
            id: row.get(0)?,
            return_id: row.get(1)?,
            sale_item_id: row.get(2)?,
            product_name: row.get(3)?,
            quantity: row.get(4)?,
            unit_price: row.get(5)?,
            total_refund: row.get(6)?,
            is_damaged: row.get::<_, i64>(7)? > 0,
        }))?
        .collect();

    Ok((ret, items?))
}
