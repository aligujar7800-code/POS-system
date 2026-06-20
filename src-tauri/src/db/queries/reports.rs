use rusqlite::{Connection, Result, params};
use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize, Debug)]
pub struct SalesReportRow {
    pub date: String,
    pub count: i64,
    pub subtotal: f64,
    pub discounts: f64,
    pub tax: f64,
    pub gross_revenue: f64,
    pub returns: f64,
    pub revenue: f64,
    pub cash: f64,
    pub card: f64,
    pub udhaar: f64,
    pub jazzcash: f64,
    pub easypaisa: f64,
    pub hbl_pay: f64,
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

#[derive(Serialize, Deserialize, Debug)]
pub struct ProductPerformance {
    pub name: String,
    pub sku: String,
    pub qty_sold: i64,
    pub revenue: f64,
    pub cogs: f64,
    pub profit: f64,
}

#[derive(Serialize, Deserialize, Debug)]
pub struct CategoryPerformance {
    pub name: String,
    pub qty_sold: i64,
    pub revenue: f64,
    pub profit: f64,
}

pub fn sales_report(conn: &Connection, from: &str, to: &str, group_by: &str) -> Result<Vec<SalesReportRow>> {
    let fmt = match group_by {
        "weekly" | "week" => "%Y-W%W",
        "monthly" | "month" => "%Y-%m",
        _ => "%Y-%m-%d",
    };
    let sql = format!(
        "WITH date_series AS (
            SELECT DISTINCT strftime('{fmt}', sale_date, 'localtime') as period FROM sales WHERE date(sale_date, 'localtime') BETWEEN ?1 AND ?2
            UNION
            SELECT DISTINCT strftime('{fmt}', return_date, 'localtime') FROM sales_returns WHERE date(return_date, 'localtime') BETWEEN ?1 AND ?2
        ),
        s_agg AS (
            SELECT strftime('{fmt}', sale_date, 'localtime') as period,
                   COUNT(*) as count,
                   SUM(subtotal) as subtotal,
                   SUM(discount_amount) as discount_amount,
                   SUM(tax_amount) as tax_amount,
                   SUM(total_amount) as total_amount,
                   SUM(CASE WHEN payment_method = 'cash' THEN paid_amount ELSE 0 END) as cash,
                   SUM(CASE WHEN payment_method = 'card' THEN paid_amount ELSE 0 END) as card,
                   SUM(CASE WHEN status = 'udhaar' OR status = 'partial' THEN total_amount - paid_amount ELSE 0 END) as udhaar,
                   SUM(CASE WHEN payment_method = 'jazzcash' THEN paid_amount ELSE 0 END) as jazzcash,
                   SUM(CASE WHEN payment_method = 'easypaisa' THEN paid_amount ELSE 0 END) as easypaisa,
                   SUM(CASE WHEN payment_method = 'hbl_pay' THEN paid_amount ELSE 0 END) as hbl_pay
            FROM sales
            WHERE date(sale_date, 'localtime') BETWEEN ?1 AND ?2
            GROUP BY period
        ),
        r_agg AS (
            SELECT strftime('{fmt}', return_date, 'localtime') as period,
                   SUM(total_refund) as total_refund,
                   SUM(CASE WHEN refund_method = 'cash' THEN total_refund ELSE 0 END) as ret_cash,
                   SUM(CASE WHEN refund_method = 'bank' THEN total_refund ELSE 0 END) as ret_card,
                   SUM(CASE WHEN refund_method = 'adjustment' THEN total_refund ELSE 0 END) as ret_adj
            FROM sales_returns
            WHERE date(return_date, 'localtime') BETWEEN ?1 AND ?2
            GROUP BY period
        )
        SELECT d.period,
               COALESCE(s.count, 0),
               COALESCE(s.subtotal, 0),
               COALESCE(s.discount_amount, 0),
               COALESCE(s.tax_amount, 0),
               COALESCE(s.total_amount, 0) as gross_revenue,
               COALESCE(r.total_refund, 0) as returns,
               COALESCE(s.total_amount, 0) - COALESCE(r.total_refund, 0) as revenue,
               COALESCE(s.cash, 0) - COALESCE(r.ret_cash, 0),
               COALESCE(s.card, 0) - COALESCE(r.ret_card, 0),
               COALESCE(s.udhaar, 0) - COALESCE(r.ret_adj, 0),
               COALESCE(s.jazzcash, 0),
               COALESCE(s.easypaisa, 0),
               COALESCE(s.hbl_pay, 0)
        FROM date_series d
        LEFT JOIN s_agg s ON d.period = s.period
        LEFT JOIN r_agg r ON d.period = r.period
        ORDER BY d.period"
    );
    let mut stmt = conn.prepare(&sql)?;
    let rows = stmt.query_map(params![from, to], |row| {
        Ok(SalesReportRow {
            date: row.get(0)?,
            count: row.get(1)?,
            subtotal: row.get(2)?,
            discounts: row.get(3)?,
            tax: row.get(4)?,
            gross_revenue: row.get(5)?,
            returns: row.get(6)?,
            revenue: row.get(7)?,
            cash: row.get(8)?,
            card: row.get(9)?,
            udhaar: row.get(10)?,
            jazzcash: row.get(11)?,
            easypaisa: row.get(12)?,
            hbl_pay: row.get(13)?,
        })
    })?;
    rows.collect()
}

pub fn top_products(conn: &Connection, from: &str, to: &str, limit: i64) -> Result<Vec<TopProduct>> {
    let mut stmt = conn.prepare(
        "SELECT product_name, sku, SUM(qty) as qty_sold, SUM(rev) as revenue
         FROM (
             SELECT si.product_name, COALESCE(p.sku, '') as sku, si.quantity as qty, si.total_price as rev
             FROM sale_items si
             JOIN sales s ON s.id = si.sale_id
             LEFT JOIN products p ON p.id = si.product_id
             WHERE date(s.sale_date, 'localtime') BETWEEN ?1 AND ?2
             
             UNION ALL
             
             SELECT si.product_name, COALESCE(p.sku, '') as sku, -sri.quantity as qty, -sri.total_refund as rev
             FROM sales_return_items sri
             JOIN sales_returns sr ON sr.id = sri.return_id
             JOIN sale_items si ON si.id = sri.sale_item_id
             LEFT JOIN products p ON p.id = si.product_id
             WHERE date(sr.return_date, 'localtime') BETWEEN ?1 AND ?2
         )
         GROUP BY product_name, sku
         HAVING qty_sold > 0
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
        "WITH h_series AS (
            SELECT CAST(strftime('%H', sale_date, 'localtime') AS INTEGER) as hour FROM sales WHERE date(sale_date, 'localtime') = ?1
            UNION
            SELECT CAST(strftime('%H', return_date, 'localtime') AS INTEGER) FROM sales_returns WHERE date(return_date, 'localtime') = ?1
         ),
         s_agg AS (
            SELECT CAST(strftime('%H', sale_date, 'localtime') AS INTEGER) as hour,
                   COUNT(*) as count, SUM(total_amount) as revenue
            FROM sales WHERE date(sale_date, 'localtime') = ?1
            GROUP BY hour
         ),
         r_agg AS (
            SELECT CAST(strftime('%H', return_date, 'localtime') AS INTEGER) as hour,
                   SUM(total_refund) as refund
            FROM sales_returns WHERE date(return_date, 'localtime') = ?1
            GROUP BY hour
         )
         SELECT h.hour, COALESCE(s.count, 0), COALESCE(s.revenue, 0) - COALESCE(r.refund, 0)
         FROM h_series h
         LEFT JOIN s_agg s ON h.hour = s.hour
         LEFT JOIN r_agg r ON h.hour = r.hour
         ORDER BY h.hour",
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
    let returns: f64 = conn.query_row(
        "SELECT COALESCE(SUM(total_refund), 0) FROM sales_returns WHERE date(return_date, 'localtime') BETWEEN ?1 AND ?2",
        params![from, to], |r| r.get(0)).unwrap_or(0.0);
    
    let returned_cogs: f64 = conn.query_row(
        "SELECT COALESCE(SUM((si.total_cogs * 1.0 / NULLIF(si.quantity, 0)) * sri.quantity), 0)
         FROM sales_return_items sri
         JOIN sales_returns sr ON sr.id = sri.return_id
         JOIN sale_items si ON si.id = sri.sale_item_id
         WHERE date(sr.return_date, 'localtime') BETWEEN ?1 AND ?2
         AND sri.is_damaged = 0",
        params![from, to], |r| r.get(0)).unwrap_or(0.0);

    let net_revenue = revenue - returns;
    let net_cogs = cogs - returned_cogs;
    let gross_profit = net_revenue - net_cogs;
    let net_profit = gross_profit - expenses;

    Ok(serde_json::json!({
        "revenue": net_revenue,
        "cogs": net_cogs,
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
            (SELECT COALESCE(SUM(MAX(pv.quantity, 0) * COALESCE(NULLIF(pv.variant_price, 0), p.sale_price)), 0) 
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
        "SELECT p.id, p.name, p.sku, COALESCE(NULLIF(p.sale_price, 0), MAX(pv.variant_price), 0) as sale_price,
                COALESCE(SUM(pv.quantity), 0) as stock,
                MAX(s.sale_date) as last_sold
         FROM products p
         LEFT JOIN product_variants pv ON pv.product_id = p.id
         LEFT JOIN sale_items si ON si.product_id = p.id
         LEFT JOIN sales s ON s.id = si.sale_id
         GROUP BY p.id
         HAVING (last_sold IS NULL OR julianday('now') - julianday(last_sold) > ?1) AND stock > 0
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

pub fn profit_by_product(conn: &Connection, from: &str, to: &str) -> Result<Vec<ProductPerformance>> {
    let mut stmt = conn.prepare(
        "SELECT name, sku, SUM(qty) as qty, SUM(revenue) as revenue, SUM(cogs) as cogs, SUM(revenue - cogs) as profit
         FROM (
             SELECT p.name, COALESCE(p.sku, '') as sku, si.quantity as qty, si.total_price as revenue, si.total_cogs as cogs, p.id
             FROM sale_items si
             JOIN products p ON p.id = si.product_id
             JOIN sales s ON s.id = si.sale_id
             WHERE date(s.sale_date, 'localtime') BETWEEN ?1 AND ?2
             
             UNION ALL
             
             SELECT p.name, COALESCE(p.sku, '') as sku, -sri.quantity as qty, -sri.total_refund as revenue,
                    CASE WHEN sri.is_damaged = 0 THEN -((si.total_cogs * 1.0 / NULLIF(si.quantity, 0)) * sri.quantity) ELSE 0 END as cogs, p.id
             FROM sales_return_items sri
             JOIN sales_returns sr ON sr.id = sri.return_id
             JOIN sale_items si ON si.id = sri.sale_item_id
             JOIN products p ON p.id = sri.product_id
             WHERE date(sr.return_date, 'localtime') BETWEEN ?1 AND ?2
         )
         GROUP BY id
         ORDER BY profit DESC"
    )?;
    let rows = stmt.query_map(params![from, to], |row| {
        Ok(ProductPerformance {
            name: row.get(0)?,
            sku: row.get(1)?,
            qty_sold: row.get(2)?,
            revenue: row.get(3)?,
            cogs: row.get(4)?,
            profit: row.get(5)?,
        })
    })?;
    rows.collect()
}

pub fn profit_by_category(conn: &Connection, from: &str, to: &str) -> Result<Vec<CategoryPerformance>> {
    let mut stmt = conn.prepare(
        "SELECT cat_name, SUM(qty) as qty, SUM(revenue) as revenue, SUM(revenue - cogs) as profit
         FROM (
             SELECT COALESCE(pc.name, c.name) as cat_name, si.quantity as qty, si.total_price as revenue, si.total_cogs as cogs, COALESCE(pc.id, c.id) as group_id
             FROM sale_items si
             JOIN products p ON p.id = si.product_id
             JOIN categories c ON c.id = p.category_id
             LEFT JOIN categories pc ON pc.id = c.parent_id
             JOIN sales s ON s.id = si.sale_id
             WHERE date(s.sale_date, 'localtime') BETWEEN ?1 AND ?2
             
             UNION ALL
             
             SELECT COALESCE(pc.name, c.name) as cat_name, -sri.quantity as qty, -sri.total_refund as revenue, 
                    CASE WHEN sri.is_damaged = 0 THEN -((si.total_cogs * 1.0 / NULLIF(si.quantity, 0)) * sri.quantity) ELSE 0 END as cogs, COALESCE(pc.id, c.id) as group_id
             FROM sales_return_items sri
             JOIN sales_returns sr ON sr.id = sri.return_id
             JOIN sale_items si ON si.id = sri.sale_item_id
             JOIN products p ON p.id = sri.product_id
             JOIN categories c ON c.id = p.category_id
             LEFT JOIN categories pc ON pc.id = c.parent_id
             WHERE date(sr.return_date, 'localtime') BETWEEN ?1 AND ?2
         )
         GROUP BY group_id
         ORDER BY profit DESC"
    )?;
    let rows = stmt.query_map(params![from, to], |row| {
        Ok(CategoryPerformance {
            name: row.get(0)?,
            qty_sold: row.get(1)?,
            revenue: row.get(2)?,
            profit: row.get(3)?,
        })
    })?;
    rows.collect()
}

pub fn profit_by_subcategory(conn: &Connection, from: &str, to: &str) -> Result<Vec<CategoryPerformance>> {
    let mut stmt = conn.prepare(
        "SELECT subcat_name, SUM(qty) as qty, SUM(revenue) as revenue, SUM(revenue - cogs) as profit
         FROM (
             SELECT c.name as subcat_name, si.quantity as qty, si.total_price as revenue, si.total_cogs as cogs, c.id as group_id
             FROM sale_items si
             JOIN products p ON p.id = si.product_id
             JOIN categories c ON c.id = p.category_id
             JOIN sales s ON s.id = si.sale_id
             WHERE date(s.sale_date, 'localtime') BETWEEN ?1 AND ?2
             
             UNION ALL
             
             SELECT c.name as subcat_name, -sri.quantity as qty, -sri.total_refund as revenue, 
                    CASE WHEN sri.is_damaged = 0 THEN -((si.total_cogs * 1.0 / NULLIF(si.quantity, 0)) * sri.quantity) ELSE 0 END as cogs, c.id as group_id
             FROM sales_return_items sri
             JOIN sales_returns sr ON sr.id = sri.return_id
             JOIN sale_items si ON si.id = sri.sale_item_id
             JOIN products p ON p.id = sri.product_id
             JOIN categories c ON c.id = p.category_id
             WHERE date(sr.return_date, 'localtime') BETWEEN ?1 AND ?2
         )
         GROUP BY group_id
         ORDER BY profit DESC"
    )?;
    let rows = stmt.query_map(params![from, to], |row| {
        Ok(CategoryPerformance {
            name: row.get(0)?,
            qty_sold: row.get(1)?,
            revenue: row.get(2)?,
            profit: row.get(3)?,
        })
    })?;
    rows.collect()
}
