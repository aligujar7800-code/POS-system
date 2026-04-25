use rusqlite::{Connection, Result, params};
use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize, Debug)]
pub struct SalesReportRow {
    pub date: String,
    pub count: i64,
    pub subtotal: f64,
    pub discounts: f64,
    pub tax: f64,
    pub revenue: f64,
    pub cash: f64,
    pub card: f64,
    pub udhaar: f64,
}

#[derive(Serialize, Deserialize, Debug)]
pub struct TopProduct {
    pub product_name: String,
    pub sku: String,
    pub qty_sold: i64,
    pub revenue: f64,
}

#[derive(Serialize, Deserialize, Debug)]
pub struct HourlyData {
    pub hour: i64,
    pub count: i64,
    pub revenue: f64,
}

pub fn sales_report(conn: &Connection, from: &str, to: &str, group_by: &str) -> Result<Vec<SalesReportRow>> {
    let fmt = match group_by {
        "weekly" | "week" => "%Y-W%W",
        "monthly" | "month" => "%Y-%m",
        _ => "%Y-%m-%d",
    };
    let sql = format!(
        "SELECT strftime('{fmt}', sale_date, 'localtime') as period,
                COUNT(*) as count,
                COALESCE(SUM(subtotal), 0),
                COALESCE(SUM(discount_amount), 0),
                COALESCE(SUM(tax_amount), 0),
                COALESCE(SUM(total_amount), 0),
                COALESCE(SUM(CASE WHEN payment_method = 'cash' THEN paid_amount ELSE 0 END), 0),
                COALESCE(SUM(CASE WHEN payment_method = 'card' THEN paid_amount ELSE 0 END), 0),
                COALESCE(SUM(CASE WHEN status = 'udhaar' OR status = 'partial' THEN total_amount - paid_amount ELSE 0 END), 0)
         FROM sales
         WHERE date(sale_date, 'localtime') BETWEEN ?1 AND ?2
         GROUP BY period ORDER BY period"
    );
    let mut stmt = conn.prepare(&sql)?;
    let rows = stmt.query_map(params![from, to], |row| {
        Ok(SalesReportRow {
            date: row.get(0)?,
            count: row.get(1)?,
            subtotal: row.get(2)?,
            discounts: row.get(3)?,
            tax: row.get(4)?,
            revenue: row.get(5)?,
            cash: row.get(6)?,
            card: row.get(7)?,
            udhaar: row.get(8)?,
        })
    })?;
    rows.collect()
}

pub fn top_products(conn: &Connection, from: &str, to: &str, limit: i64) -> Result<Vec<TopProduct>> {
    let mut stmt = conn.prepare(
        "SELECT si.product_name,
                COALESCE(p.sku, '') as sku,
                SUM(si.quantity) as qty_sold,
                SUM(si.total_price) as revenue
         FROM sale_items si
         LEFT JOIN products p ON p.id = si.product_id
         JOIN sales s ON s.id = si.sale_id
         WHERE date(s.sale_date, 'localtime') BETWEEN ?1 AND ?2
         GROUP BY si.product_name
         ORDER BY qty_sold DESC
         LIMIT ?3",
    )?;
    let rows = stmt.query_map(params![from, to, limit], |row| {
        Ok(TopProduct {
            product_name: row.get(0)?,
            sku: row.get(1)?,
            qty_sold: row.get(2)?,
            revenue: row.get(3)?,
        })
    })?;
    rows.collect()
}

pub fn hourly_sales(conn: &Connection, date: &str) -> Result<Vec<HourlyData>> {
    let mut stmt = conn.prepare(
        "SELECT CAST(strftime('%H', sale_date, 'localtime') AS INTEGER) as hour,
                COUNT(*) as count, COALESCE(SUM(total_amount), 0)
         FROM sales WHERE date(sale_date, 'localtime') = ?1
         GROUP BY hour ORDER BY hour",
    )?;
    let rows = stmt.query_map(params![date], |row| {
        Ok(HourlyData {
            hour: row.get(0)?,
            count: row.get(1)?,
            revenue: row.get(2)?,
        })
    })?;
    rows.collect()
}

pub fn profit_loss(conn: &Connection, from: &str, to: &str) -> Result<serde_json::Value> {
    let revenue: f64 = conn.query_row(
        "SELECT COALESCE(SUM(total_amount), 0) FROM sales WHERE date(sale_date, 'localtime') BETWEEN ?1 AND ?2",
        params![from, to], |r| r.get(0))?;
    let cogs: f64 = conn.query_row(
        "SELECT COALESCE(SUM(si.total_cogs), 0)
         FROM sale_items si
         JOIN sales s ON s.id = si.sale_id
         WHERE date(s.sale_date, 'localtime') BETWEEN ?1 AND ?2",
        params![from, to], |r| r.get(0))?;
    let expenses: f64 = conn.query_row(
        "SELECT COALESCE(SUM(amount), 0) FROM expenses WHERE date(expense_date, 'localtime') BETWEEN ?1 AND ?2",
        params![from, to], |r| r.get(0))?;
    let gross_profit = revenue - cogs;
    let net_profit = gross_profit - expenses;

    Ok(serde_json::json!({
        "revenue": revenue,
        "cogs": cogs,
        "gross_profit": gross_profit,
        "expenses": expenses,
        "net_profit": net_profit
    }))
}

pub fn inventory_valuation(conn: &Connection) -> Result<serde_json::Value> {
    let row = conn.query_row(
        "SELECT 
            (SELECT COUNT(*) FROM products WHERE is_active = 1),
            (SELECT COALESCE(SUM(remaining_qty * cost_price), 0) FROM purchase_lots),
            (SELECT COALESCE(SUM(pv.quantity * p.sale_price), 0) 
             FROM products p JOIN product_variants pv ON pv.product_id = p.id WHERE p.is_active = 1)",
        [],
        |r| Ok((r.get::<_, i64>(0)?, r.get::<_, f64>(1)?, r.get::<_, f64>(2)?)),
    )?;
    Ok(serde_json::json!({
        "product_count": row.0,
        "cost_value": row.1,
        "sale_value": row.2
    }))
}

pub fn dead_stock(conn: &Connection, days: i64) -> Result<Vec<serde_json::Value>> {
    let mut stmt = conn.prepare(
        "SELECT p.id, p.name, p.sku, p.sale_price,
                COALESCE(SUM(pv.quantity), 0) as stock,
                MAX(s.sale_date) as last_sold
         FROM products p
         LEFT JOIN product_variants pv ON pv.product_id = p.id
         LEFT JOIN sale_items si ON si.product_id = p.id
         LEFT JOIN sales s ON s.id = si.sale_id
         GROUP BY p.id
         HAVING last_sold IS NULL OR julianday('now') - julianday(last_sold) > ?1
         ORDER BY stock DESC",
    )?;
    let rows = stmt.query_map(params![days], |row| {
        Ok(serde_json::json!({
            "id": row.get::<_, i64>(0)?,
            "name": row.get::<_, String>(1)?,
            "sku": row.get::<_, String>(2)?,
            "sale_price": row.get::<_, f64>(3)?,
            "stock": row.get::<_, i64>(4)?,
            "last_sold": row.get::<_, Option<String>>(5)?
        }))
    })?;
    rows.collect()
}
