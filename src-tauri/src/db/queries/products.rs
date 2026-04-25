use rusqlite::{Connection, Result, params};
use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct Product {
    pub id: i64,
    pub name: String,
    pub sku: String,
    pub barcode: Option<String>,
    pub category_id: Option<i64>,
    pub category_name: Option<String>,
    pub variant_summary: Option<String>,
    pub brand: Option<String>,
    pub description: Option<String>,
    pub image_path: Option<String>,
    pub cost_price: f64,
    pub sale_price: f64,
    pub tax_percent: f64,
    pub low_stock_threshold: i64,
    pub total_stock: i64,
    pub is_active: bool,
    pub article_number: Option<String>,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct ProductVariant {
    pub id: i64,
    pub product_id: i64,
    pub size: Option<String>,
    pub color: Option<String>,
    pub quantity: i64,
    pub variant_barcode: Option<String>,
    pub variant_price: Option<f64>,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct Category {
    pub id: i64,
    pub name: String,
    pub parent_id: Option<i64>,
    pub product_count: i64,
}

#[derive(Deserialize)]
pub struct CreateProductPayload {
    pub name: String,
    pub sku: String,
    pub barcode: Option<String>,
    pub category_id: Option<i64>,
    pub brand: Option<String>,
    pub description: Option<String>,
    pub cost_price: f64,
    pub sale_price: f64,
    pub tax_percent: f64,
    pub low_stock_threshold: Option<i64>,
    pub article_number: Option<String>,
}

#[derive(Deserialize, Clone)]
pub struct VariantPayload {
    pub size: Option<String>,
    pub color: Option<String>,
    pub quantity: i64,
    pub variant_barcode: Option<String>,
    pub variant_price: Option<f64>,
}

pub fn search_products(conn: &Connection, query: &str) -> Result<Vec<Product>> {
    let pattern = format!("%{}%", query);
    let sql = product_select_sql()
        + " WHERE p.is_active = 1 AND (p.name LIKE ?1 OR p.sku LIKE ?1 OR p.barcode LIKE ?1
              OR EXISTS (SELECT 1 FROM product_variants pv WHERE pv.product_id = p.id AND pv.variant_barcode LIKE ?1))
           ORDER BY p.name LIMIT 50";
    let mut stmt = conn.prepare(&sql)?;
    let rows = stmt.query_map(params![pattern], map_product)?;
    rows.collect()
}

pub fn get_all_products(conn: &Connection) -> Result<Vec<Product>> {
    let sql = product_select_sql() + " WHERE p.is_active = 1 ORDER BY p.name";
    let mut stmt = conn.prepare(&sql)?;
    let rows = stmt.query_map([], map_product)?;
    rows.collect()
}

pub fn get_product_by_barcode(conn: &Connection, barcode: &str) -> Result<Option<Product>> {
    // ... logic remains same ...
    let sql = product_select_sql() + " WHERE p.is_active = 1 AND p.barcode = ?1 LIMIT 1";
    let result = conn.query_row(&sql, params![barcode], map_product);
    match result {
        Ok(p) => Ok(Some(p)),
        Err(rusqlite::Error::QueryReturnedNoRows) => {
            // Try variant barcode
            let sql2 = product_select_sql()
                + " WHERE p.is_active = 1 AND EXISTS (SELECT 1 FROM product_variants pv WHERE pv.product_id = p.id AND pv.variant_barcode = ?1) LIMIT 1";
            match conn.query_row(&sql2, params![barcode], map_product) {
                Ok(p) => Ok(Some(p)),
                Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
                Err(e) => Err(e),
            }
        }
        Err(e) => Err(e),
    }
}

pub fn get_product_by_id(conn: &Connection, id: i64) -> Result<Option<Product>> {
    let sql = product_select_sql() + " WHERE p.id = ?1 LIMIT 1";
    match conn.query_row(&sql, params![id], map_product) {
        Ok(p) => Ok(Some(p)),
        Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
        Err(e) => Err(e),
    }
}

pub fn get_product_variants(conn: &Connection, product_id: i64) -> Result<Vec<ProductVariant>> {
    let mut stmt = conn.prepare(
        "SELECT id, product_id, size, color, quantity, variant_barcode, variant_price
         FROM product_variants 
         WHERE product_id = ?1 
         ORDER BY id ASC",
    )?;
    
    let rows = stmt.query_map(params![product_id], |row| {
        Ok(ProductVariant {
            id: row.get(0)?,
            product_id: row.get(1)?,
            size: row.get::<_, Option<String>>(2)?,
            color: row.get::<_, Option<String>>(3)?,
            quantity: row.get(4)?,
            variant_barcode: row.get::<_, Option<String>>(5)?,
            variant_price: row.get::<_, Option<f64>>(6)?,
        })
    })?;

    rows.collect()
}

#[derive(Deserialize)]
pub struct BulkProductItem {
    pub name: String,
    pub sku: Option<String>,
    pub category_id: Option<i64>,
    pub size: Option<String>,
    pub color: Option<String>,
    pub cost_price: f64,
    pub sale_price: f64,
    pub initial_stock: i64,
    pub barcode: Option<String>,
    pub article_number: Option<String>,
}

pub fn create_product(
    conn: &Connection,
    payload: &CreateProductPayload,
    variants: &[VariantPayload],
) -> Result<i64> {
    let sku = if payload.sku.is_empty() {
        generate_sku(conn)?
    } else {
        payload.sku.clone()
    };

    let article_number = if payload.article_number.as_deref().unwrap_or("").is_empty() {
        generate_article_number(conn)?
    } else {
        payload.article_number.clone().unwrap()
    };

    conn.execute(
        "INSERT INTO products (name, sku, barcode, category_id, brand, description,
            cost_price, sale_price, tax_percent, low_stock_threshold, is_active, article_number)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, 1, ?11)",
        params![
            payload.name, sku, payload.barcode, payload.category_id,
            payload.brand, payload.description,
            payload.cost_price, payload.sale_price, payload.tax_percent,
            payload.low_stock_threshold.unwrap_or(5),
            article_number
        ],
    )?;
    let product_id = conn.last_insert_rowid();

    for (index, variant) in variants.iter().enumerate() {
        let v_barcode = if variant.variant_barcode.as_deref().unwrap_or("").is_empty() {
            Some(format!("{}-{:02}", article_number, index + 1))
        } else {
            variant.variant_barcode.clone()
        };

        conn.execute(
            "INSERT INTO product_variants (product_id, size, color, quantity, variant_barcode, variant_price)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            params![
                product_id, variant.size, variant.color,
                variant.quantity, v_barcode, variant.variant_price
            ],
        )?;
        let variant_id = conn.last_insert_rowid();

        if variant.quantity > 0 {
            conn.execute(
                "INSERT INTO purchase_lots (product_id, variant_id, original_qty, remaining_qty, cost_price)
                 VALUES (?1, ?2, ?3, ?4, ?5)",
                params![product_id, variant_id, variant.quantity, variant.quantity, payload.cost_price],
            )?;

            // Log initial stock in history
            conn.execute(
                "INSERT INTO stock_history (product_id, variant_id, prev_qty, new_qty, reason)
                 VALUES (?1, ?2, ?3, ?4, ?5)",
                params![product_id, variant_id, 0, variant.quantity, "Initial Stock"],
            )?;
        }
    }

    Ok(product_id)
}

pub fn create_bulk_products(
    conn: &Connection,
    items: &[BulkProductItem],
) -> Result<()> {
    for item in items {
        // 1. Find or create product
        let product_id: i64 = match conn.query_row(
            "SELECT id, is_active FROM products WHERE (article_number = ?1 AND ?1 IS NOT NULL) OR (name = ?2 AND (category_id = ?3 OR (category_id IS NULL AND ?3 IS NULL)))",
            params![item.article_number, item.name, item.category_id],
            |row| Ok((row.get::<_, i64>(0)?, row.get::<_, i64>(1)?)),
        ) {
            Ok((id, active)) => {
                if active == 0 {
                    conn.execute("UPDATE products SET is_active = 1 WHERE id = ?1", params![id])?;
                }
                id
            },
            Err(_) => {
                let sku = match &item.sku {
                    Some(s) if !s.is_empty() => s.clone(),
                    _ => generate_sku(conn)?,
                };
                let article_no = match &item.article_number {
                    Some(a) if !a.is_empty() => a.clone(),
                    _ => generate_article_number(conn)?,
                };
                conn.execute(
                    "INSERT INTO products (name, sku, barcode, category_id, cost_price, sale_price, article_number, is_active)
                     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, 1)",
                    params![item.name, sku, item.barcode, item.category_id, item.cost_price, item.sale_price, article_no],
                )?;
                conn.last_insert_rowid()
            }
        };

        // 2. Add variant
        let variant_count: i64 = conn.query_row(
            "SELECT COUNT(*) FROM product_variants WHERE product_id = ?1",
            params![product_id],
            |r| r.get(0)
        )?;

        let article_number: String = conn.query_row(
            "SELECT article_number FROM products WHERE id = ?1",
            params![product_id],
            |r| r.get(0)
        )?;

        let v_barcode = if item.barcode.as_deref().unwrap_or("").is_empty() {
            Some(format!("{}-{:02}", article_number, variant_count + 1))
        } else {
            item.barcode.clone()
        };

        conn.execute(
            "INSERT INTO product_variants (product_id, size, color, quantity, variant_barcode, variant_price)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            params![
                product_id, 
                item.size, 
                item.color, 
                item.initial_stock, 
                v_barcode,
                if item.sale_price > 0.0 { Some(item.sale_price) } else { None }
            ],
        )?;
        let variant_id = conn.last_insert_rowid();

        // 3. Purchase lot if stock > 0
        if item.initial_stock > 0 {
            conn.execute(
                "INSERT INTO purchase_lots (product_id, variant_id, original_qty, remaining_qty, cost_price)
                 VALUES (?1, ?2, ?3, ?4, ?5)",
                params![product_id, variant_id, item.initial_stock, item.initial_stock, item.cost_price],
            )?;

            // Log initial stock in history
            conn.execute(
                "INSERT INTO stock_history (product_id, variant_id, prev_qty, new_qty, reason)
                 VALUES (?1, ?2, ?3, ?4, ?5)",
                params![product_id, variant_id, 0, item.initial_stock, "Initial Stock (Bulk)"],
            )?;
        }
    }
    Ok(())
}

pub fn update_product(
    conn: &Connection,
    id: i64,
    payload: &CreateProductPayload,
) -> Result<()> {
    conn.execute(
        "UPDATE products SET name=?1, barcode=?2, category_id=?3, brand=?4,
                 description=?5, cost_price=?6, sale_price=?7, tax_percent=?8,
                 low_stock_threshold=?9, updated_at=datetime('now'), article_number=?11
         WHERE id=?10",
        params![
            payload.name, payload.barcode, payload.category_id, payload.brand,
            payload.description, payload.cost_price, payload.sale_price,
            payload.tax_percent, payload.low_stock_threshold.unwrap_or(5), id,
            payload.article_number
        ],
    )?;
    Ok(())
}

pub fn delete_product(conn: &Connection, id: i64) -> Result<()> {
    conn.execute(
        "UPDATE products SET is_active = 0, updated_at = datetime('now') WHERE id = ?1",
        params![id],
    )?;
    Ok(())
}

pub fn clear_inward_history(conn: &Connection) -> Result<()> {
    conn.execute(
        "DELETE FROM stock_history WHERE reason LIKE 'Inward Stock%'",
        [],
    )?;
    Ok(())
}

pub fn update_variant_stock(
    conn: &Connection,
    variant_id: i64,
    new_qty: i64,
    reason: Option<&str>,
    user_id: Option<i64>,
    supplier_id: Option<i64>,
    unit_cost: Option<f64>,
) -> Result<()> {
    let prev: i64 = conn.query_row(
        "SELECT quantity FROM product_variants WHERE id = ?1",
        params![variant_id],
        |r| r.get(0),
    )?;
    let product_id: i64 = conn.query_row(
        "SELECT product_id FROM product_variants WHERE id = ?1",
        params![variant_id],
        |r| r.get(0),
    )?;

    // Handle FIFO lots update
    if new_qty > prev {
        let diff = new_qty - prev;
        let cost_price: f64 = conn.query_row(
            "SELECT cost_price FROM products WHERE id = ?1",
            params![product_id],
            |r| r.get(0),
        )?;
        conn.execute(
            "INSERT INTO purchase_lots (product_id, variant_id, original_qty, remaining_qty, cost_price)
             VALUES (?1, ?2, ?3, ?4, ?5)",
            params![product_id, variant_id, diff, diff, cost_price],
        )?;
    } else if new_qty < prev {
        let diff = prev - new_qty;
        // Deduct from FIFO lots using utility function
        let _ = deduct_fifo_lots(conn, variant_id, diff)?;
    }

    // 3. Update variant quantity and log history
    conn.execute(
        "UPDATE product_variants SET quantity = ?1 WHERE id = ?2",
        params![new_qty, variant_id],
    )?;
    conn.execute(
        "INSERT INTO stock_history (product_id, variant_id, prev_qty, new_qty, reason, changed_by)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        params![product_id, variant_id, prev, new_qty, reason, user_id],
    )?;

    // 4. Handle Financial Impact if Supplier is linked
    if let (Some(sid), Some(cost)) = (supplier_id, unit_cost) {
        let qty_diff_f = (prev as f64) - (new_qty as f64);
        let financial_impact = qty_diff_f * cost; // If returning (new < prev), impact is positive (debt decreases)

        // Get current supplier balance
        let current_supplier_balance: f64 = conn.query_row(
            "SELECT outstanding_balance FROM suppliers WHERE id = ?1",
            params![sid],
            |r| r.get(0),
        )?;

        let new_supplier_balance = current_supplier_balance - financial_impact;

        // Update supplier balance
        conn.execute(
            "UPDATE suppliers SET outstanding_balance = ?1 WHERE id = ?2",
            params![new_supplier_balance, sid],
        )?;

        // Log in supplier ledger
        let ledger_desc = format!(
            "Stock Adjustment: {} ({} -> {})", 
            reason.unwrap_or("Manual Adjustment"),
            prev, 
            new_qty
        );
        
        conn.execute(
            "INSERT INTO supplier_ledger (supplier_id, entry_type, amount, balance_after, description, created_by)
             VALUES (?1, 'adjustment', ?2, ?3, ?4, ?5)",
            params![sid, financial_impact, new_supplier_balance, ledger_desc, user_id],
        )?;
    }

    Ok(())
}

pub fn deduct_fifo_lots(conn: &Connection, variant_id: i64, mut qty_to_deduct: i64) -> Result<f64> {
    if qty_to_deduct <= 0 { return Ok(0.0); }
    
    // Fetch lots ordered by purchase date
    let mut stmt = conn.prepare(
        "SELECT id, remaining_qty, cost_price FROM purchase_lots 
         WHERE variant_id = ?1 AND remaining_qty > 0 
         ORDER BY purchase_date ASC, id ASC"
    )?;
    
    let lots: Result<Vec<(i64, i64, f64)>> = stmt.query_map(params![variant_id], |row| {
        Ok((row.get(0)?, row.get(1)?, row.get(2)?))
    })?.collect();
    let lots = lots?;
    
    let mut total_cogs = 0.0;
    
    for (lot_id, rem_qty, cost) in lots {
        if qty_to_deduct == 0 { break; }
        
        let deduct = std::cmp::min(qty_to_deduct, rem_qty);
        qty_to_deduct -= deduct;
        total_cogs += cost * (deduct as f64);
        
        conn.execute(
            "UPDATE purchase_lots SET remaining_qty = remaining_qty - ?1 WHERE id = ?2",
            params![deduct, lot_id],
        )?;
    }
    
    // Fallback: If stock is negative and we exhausted all lots, we still need to record COGS at current price
    if qty_to_deduct > 0 {
        let fallback_cost: f64 = conn.query_row(
            "SELECT p.cost_price FROM products p JOIN product_variants pv ON pv.product_id = p.id WHERE pv.id = ?1",
            params![variant_id],
            |r| r.get(0),
        ).unwrap_or(0.0);
        total_cogs += fallback_cost * (qty_to_deduct as f64);
    }
    
    Ok(total_cogs)
}

pub fn get_all_categories(conn: &Connection) -> Result<Vec<Category>> {
    let mut stmt = conn.prepare("
        SELECT c.id, c.name, c.parent_id, COUNT(p.id) as product_count 
        FROM categories c
        LEFT JOIN products p ON p.category_id = c.id AND p.is_active = 1
        GROUP BY c.id
        ORDER BY c.name
    ")?;
    let rows = stmt.query_map([], |row| {
        Ok(Category {
            id: row.get(0)?,
            name: row.get(1)?,
            parent_id: row.get(2)?,
            product_count: row.get(3)?,
        })
    })?;
    rows.collect()
}

pub fn create_category(conn: &Connection, name: &str, parent_id: Option<i64>) -> Result<i64> {
    // Check for duplicate name under the same parent
    let existing: i64 = match parent_id {
        Some(pid) => conn.query_row(
            "SELECT COUNT(*) FROM categories WHERE LOWER(name) = LOWER(?1) AND parent_id = ?2",
            params![name, pid],
            |r| r.get(0),
        )?,
        None => conn.query_row(
            "SELECT COUNT(*) FROM categories WHERE LOWER(name) = LOWER(?1) AND parent_id IS NULL",
            params![name],
            |r| r.get(0),
        )?,
    };
    if existing > 0 {
        return Err(rusqlite::Error::InvalidParameterName("Category with this name already exists in this section".to_string()));
    }
    conn.execute(
        "INSERT INTO categories (name, parent_id) VALUES (?1, ?2)",
        params![name, parent_id],
    )?;
    Ok(conn.last_insert_rowid())
}

pub fn generate_ean13(conn: &Connection, offset: i64) -> Result<String> {
    let count: i64 = conn.query_row("SELECT COUNT(*) FROM products", [], |r| r.get(0))?;
    let base = format!("0000001{:05}", count + 1 + offset);
    let check = ean13_check_digit(&base);
    Ok(format!("{}{}", base, check))
}

fn ean13_check_digit(s: &str) -> u8 {
    let digits: Vec<u32> = s.chars()
        .filter_map(|c| c.to_digit(10))
        .collect();
    let sum: u32 = digits.iter().enumerate().map(|(i, &d)| {
        if i % 2 == 0 { d } else { d * 3 }
    }).sum();
    ((10 - (sum % 10)) % 10) as u8
}

fn generate_sku(conn: &Connection) -> Result<String> {
    let count: i64 = conn.query_row("SELECT COUNT(*) FROM products", [], |r| r.get(0))?;
    Ok(format!("SKU-{:05}", count + 1))
}


pub fn ensure_variant_barcodes(conn: &Connection) -> Result<i64> {
    // 1. First, ensure all products have an article number
    let mut stmt_no_art = conn.prepare("SELECT id FROM products WHERE article_number IS NULL OR article_number = ''")?;
    let product_ids: Vec<i64> = stmt_no_art.query_map([], |row| row.get(0))?.collect::<Result<Vec<_>>>()?;
    
    for pid in product_ids {
        let art = generate_article_number(conn)?;
        conn.execute("UPDATE products SET article_number = ?1 WHERE id = ?2", params![art, pid])?;
    }

    // 2. Fetch variants needing barcodes
    let mut stmt = conn.prepare("
        SELECT pv.id, p.article_number, 
               (SELECT COUNT(*) FROM product_variants pv2 WHERE pv2.product_id = pv.product_id AND pv2.id <= pv.id) as seq
        FROM product_variants pv
        JOIN products p ON p.id = pv.product_id
        WHERE pv.variant_barcode IS NULL OR pv.variant_barcode = ''
    ")?;

    let updates: Vec<(i64, String)> = stmt.query_map([], |row| {
        let id: i64 = row.get(0)?;
        let article: String = row.get(1)?;
        let seq: i64 = row.get(2)?;
        Ok((id, format!("{}-{:02}", article, seq)))
    })?.collect::<Result<Vec<_>>>()?;

    let count = updates.len();
    for (id, barcode) in updates {
        conn.execute(
            "UPDATE product_variants SET variant_barcode = ?1 WHERE id = ?2",
            params![barcode, id]
        )?;
    }
    Ok(count as i64)
}

fn product_select_sql() -> String {
    "SELECT p.id, p.name, p.sku, p.barcode, p.category_id, c.name as cat_name,
            p.brand, p.description, p.image_path, p.cost_price, p.sale_price,
            p.tax_percent, p.low_stock_threshold,
            COALESCE((SELECT SUM(pv.quantity) FROM product_variants pv WHERE pv.product_id = p.id), 0) as total_stock,
            p.is_active,
            NULL as variant_summary,
            p.article_number
     FROM products p
     LEFT JOIN categories c ON c.id = p.category_id"
        .to_string()
}

fn map_product(row: &rusqlite::Row) -> rusqlite::Result<Product> {
    Ok(Product {
        id: row.get(0)?,
        name: row.get(1)?,
        sku: row.get(2)?,
        barcode: row.get(3)?,
        category_id: row.get(4)?,
        category_name: row.get(5)?,
        brand: row.get(6)?,
        description: row.get(7)?,
        image_path: row.get(8)?,
        cost_price: row.get(9)?,
        sale_price: row.get(10)?,
        tax_percent: row.get(11)?,
        low_stock_threshold: row.get(12)?,
        total_stock: row.get(13)?,
        is_active: row.get::<_, i32>(14)? == 1,
        variant_summary: row.get(15)?,
        article_number: row.get(16)?,
    })
}

pub fn get_low_stock_products(conn: &Connection) -> Result<Vec<Product>> {
    let sql = product_select_sql()
        + " WHERE p.is_active = 1 AND ((SELECT SUM(pv.quantity) FROM product_variants pv WHERE pv.product_id = p.id) <= p.low_stock_threshold
            OR NOT EXISTS (SELECT 1 FROM product_variants pv WHERE pv.product_id = p.id))
           ORDER BY p.name";
    let mut stmt = conn.prepare(&sql)?;
    let rows = stmt.query_map([], map_product)?;
    rows.collect()
}

// ─── Inward Stock ────────────────────────────────────────────────────────────

#[derive(Deserialize)]
pub struct InwardItem {
    pub product_id: i64,
    pub variant_id: i64,
    pub quantity: i64,
    pub cost_price: f64,
    pub size: Option<String>,
    pub color: Option<String>,
    pub sale_price: Option<f64>,
}

#[derive(Deserialize)]
pub struct InwardStockPayload {
    pub items: Vec<InwardItem>,
    pub payment_method: String, // 'cash', 'bank', etc.
    pub payment_amount: f64,
    pub supplier_id: Option<i64>,
    pub supplier_name: Option<String>,
    pub notes: Option<String>,
    pub created_by: Option<i64>,
}

pub fn add_inward_stock(conn: &mut Connection, payload: &InwardStockPayload) -> Result<()> {
    let tx = conn.transaction()?;

    for item in &payload.items {
        let mut actual_variant_id = item.variant_id;
        if actual_variant_id == 0 {
            // Find existing variant with EXACT size and color, or insert a new one
            let find_sql = if item.size.is_some() && item.color.is_some() {
                "SELECT id FROM product_variants WHERE product_id = ?1 AND size = ?2 AND color = ?3"
            } else if item.size.is_some() {
                "SELECT id FROM product_variants WHERE product_id = ?1 AND size = ?2 AND color IS NULL"
            } else if item.color.is_some() {
                "SELECT id FROM product_variants WHERE product_id = ?1 AND size IS NULL AND color = ?2"
            } else {
                "SELECT id FROM product_variants WHERE product_id = ?1 AND size IS NULL AND color IS NULL"
            };

            let existing_var: Option<i64> = if item.size.is_some() && item.color.is_some() {
                tx.query_row(find_sql, params![item.product_id, item.size, item.color], |r| r.get(0)).unwrap_or(None)
            } else if item.size.is_some() {
                tx.query_row(find_sql, params![item.product_id, item.size], |r| r.get(0)).unwrap_or(None)
            } else if item.color.is_some() {
                tx.query_row(find_sql, params![item.product_id, item.color], |r| r.get(0)).unwrap_or(None)
            } else {
                tx.query_row(find_sql, params![item.product_id], |r| r.get(0)).unwrap_or(None)
            };

            if let Some(vid) = existing_var {
                actual_variant_id = vid;
            } else {
                // Not found! We must create this new combination.
                // Generate a barcode for the new variant
                let variant_count: i64 = tx.query_row(
                    "SELECT COUNT(*) FROM product_variants WHERE product_id = ?1",
                    params![item.product_id],
                    |r| r.get(0)
                ).unwrap_or(0);

                let article_number: Option<String> = tx.query_row(
                    "SELECT article_number FROM products WHERE id = ?1",
                    params![item.product_id],
                    |r| r.get(0)
                ).unwrap_or(None);

                let v_barcode = if let Some(art) = article_number {
                    if !art.is_empty() {
                        Some(format!("{}-{:02}", art, variant_count + 1))
                    } else {
                        None
                    }
                } else {
                    None
                };

                tx.execute(
                    "INSERT INTO product_variants (product_id, size, color, quantity, variant_barcode) VALUES (?1, ?2, ?3, 0, ?4)",
                    params![item.product_id, item.size, item.color, v_barcode],
                )?;
                actual_variant_id = tx.last_insert_rowid();
            }
        }

        // 1. Insert into purchase_lots for FIFO
        tx.execute(
            "INSERT INTO purchase_lots (product_id, variant_id, original_qty, remaining_qty, cost_price)
             VALUES (?1, ?2, ?3, ?4, ?5)",
            params![
                item.product_id,
                actual_variant_id,
                item.quantity,
                item.quantity,
                item.cost_price
            ],
        )?;

        tx.execute(
            "UPDATE product_variants SET quantity = quantity + ?1 WHERE id = ?2",
            params![item.quantity, actual_variant_id],
        )?;

        // 2.1 Update variant price if provided
        if let Some(sp) = item.sale_price {
            if sp > 0.0 {
                tx.execute(
                    "UPDATE product_variants SET variant_price = ?1 WHERE id = ?2",
                    params![sp, actual_variant_id],
                )?;
            }
        }

        // 3. Update master product cost_price to the LATEST lot cost
        tx.execute(
            "UPDATE products SET cost_price = ?1, updated_at = datetime('now') WHERE id = ?2",
            params![item.cost_price, item.product_id],
        )?;

        // 4. Log stock history
        let current_qty: i64 = tx.query_row(
            "SELECT quantity FROM product_variants WHERE id = ?1",
            params![actual_variant_id],
            |r| r.get(0),
        )?;
        let prev_qty = current_qty - item.quantity;
        let mut reason = "Inward Stock".to_string();
        if let Some(ref s) = payload.supplier_name {
            reason.push_str(&format!(" from {}", s));
        }

        tx.execute(
            "INSERT INTO stock_history (product_id, variant_id, prev_qty, new_qty, reason, changed_by, unit_cost)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
            params![
                item.product_id,
                actual_variant_id,
                prev_qty,
                current_qty,
                reason,
                payload.created_by,
                item.cost_price
            ],
        )?;
    }

    // 5. If there is a payment, log it in cash_book as an expense (Supplier Payment)
    if payload.payment_amount > 0.0 {
        let desc = payload.notes.clone().unwrap_or_else(|| {
            if let Some(ref s) = payload.supplier_name {
                format!("Payment to supplier: {}", s)
            } else {
                "Purchase of stock".to_string()
            }
        });

        tx.execute(
            "INSERT INTO cash_book (entry_type, category, amount, payment_method, description, created_by)
             VALUES ('expense', 'Inventory Purchase', ?1, ?2, ?3, ?4)",
            params![
                payload.payment_amount,
                payload.payment_method,
                desc,
                payload.created_by
            ],
        )?;
    }

    // 6. Supplier Ledger tracking
    if let Some(sid) = payload.supplier_id {
        let total_purchase: f64 = payload.items.iter().map(|i| i.quantity as f64 * i.cost_price).sum();
        
        let current_balance: f64 = tx.query_row(
            "SELECT outstanding_balance FROM suppliers WHERE id = ?1",
            params![sid],
            |r| r.get(0),
        )?;
        
        let mut running_balance = current_balance + total_purchase;
        
        // Record Purchase Entry (Credit)
        tx.execute(
            "INSERT INTO supplier_ledger (supplier_id, entry_type, amount, balance_after, description, created_by)
             VALUES (?1, 'purchase', ?2, ?3, ?4, ?5)",
            params![sid, total_purchase, running_balance, "Inventory Purchase", payload.created_by],
        )?;

        if payload.payment_amount > 0.0 {
            running_balance -= payload.payment_amount;
            // Record Payment Entry (Debit)
            tx.execute(
                "INSERT INTO supplier_ledger (supplier_id, entry_type, amount, balance_after, description, created_by)
                 VALUES (?1, 'payment', ?2, ?3, ?4, ?5)",
                params![sid, payload.payment_amount, running_balance, "Initial Payment", payload.created_by],
            )?;
        }

        tx.execute(
            "UPDATE suppliers SET outstanding_balance = ?1 WHERE id = ?2",
            params![running_balance, sid],
        )?;
    }

    tx.commit()?;

    // 7. Auto-post to accounting journal (Double Entry)
    let total_purchase: f64 = payload.items.iter().map(|i| i.quantity as f64 * i.cost_price).sum();
    let supplier_name_str = payload.supplier_name.as_deref().unwrap_or("Unknown Supplier");
    if let Err(e) = crate::db::auto_post::post_inward_stock(conn, total_purchase, payload.payment_amount, payload.supplier_id.unwrap_or(0), supplier_name_str, payload.created_by) {
        eprintln!("Auto-post inward stock failed: {:?}", e);
    }

    Ok(())
}

#[derive(Serialize)]
pub struct InwardHistoryEntry {
    pub id: i64,
    pub product_name: String,
    pub variant_info: String,
    pub received_qty: i64,
    pub cost_price: f64,
    pub total_cost: f64,
    pub supplier_name: String,
    pub date: String,
}

pub fn get_inward_history(conn: &Connection) -> Result<Vec<InwardHistoryEntry>> {
    let mut stmt = conn.prepare(
        "SELECT sh.id, 
                p.name, 
                IFNULL(pv.size, '') as size, 
                IFNULL(pv.color, '') as color, 
                (sh.new_qty - sh.prev_qty) as received_qty,
                COALESCE(sh.unit_cost, p.cost_price),
                sh.reason,
                sh.changed_at
         FROM stock_history sh
         JOIN products p ON p.id = sh.product_id
         LEFT JOIN product_variants pv ON pv.id = sh.variant_id
         WHERE sh.reason LIKE 'Inward Stock%' AND sh.new_qty > sh.prev_qty
         ORDER BY sh.changed_at DESC LIMIT 100"
    )?;

    let rows = stmt.query_map([], |row| {
        let size: String = row.get(2)?;
        let color: String = row.get(3)?;
        let variant_info = if !size.is_empty() && !color.is_empty() {
            format!("{} - {}", size, color)
        } else if !size.is_empty() {
            size
        } else if !color.is_empty() {
            color
        } else {
            "N/A".to_string()
        };

        let received_qty: i64 = row.get(4)?;
        let cost_price: f64 = row.get(5)?;
        let reason: String = row.get(6)?;
        
        let supplier_name = if reason.starts_with("Inward Stock from ") {
            reason.replace("Inward Stock from ", "")
        } else {
            "Unknown".to_string()
        };

        Ok(InwardHistoryEntry {
            id: row.get(0)?,
            product_name: row.get(1)?,
            variant_info,
            received_qty,
            cost_price,
            total_cost: cost_price * (received_qty as f64),
            supplier_name,
            date: row.get(7)?,
        })
    })?;

    rows.collect()
}

#[derive(Serialize)]
pub struct StockLedgerEntry {
    pub id: i64,
    pub variant_info: String,
    pub prev_qty: i64,
    pub new_qty: i64,
    pub change: i64,
    pub reason: String,
    pub changed_at: String,
}

pub fn get_stock_ledger(
    conn: &Connection,
    product_id: i64,
    date_from: Option<&str>,
    date_to: Option<&str>,
) -> Result<Vec<StockLedgerEntry>> {
    let mut sql = String::from(
        "SELECT sh.id,
                IFNULL(pv.size, '') as size,
                IFNULL(pv.color, '') as color,
                sh.prev_qty,
                sh.new_qty,
                IFNULL(sh.reason, 'Unknown'),
                sh.changed_at
         FROM stock_history sh
         LEFT JOIN product_variants pv ON pv.id = sh.variant_id
         WHERE sh.product_id = ?1"
    );

    let mut param_idx = 2;
    if date_from.is_some() {
        sql.push_str(&format!(" AND sh.changed_at >= ?{}", param_idx));
        param_idx += 1;
    }
    if date_to.is_some() {
        sql.push_str(&format!(" AND sh.changed_at <= ?{}", param_idx));
    }
    sql.push_str(" ORDER BY sh.changed_at DESC LIMIT 500");

    let mut stmt = conn.prepare(&sql)?;

    // Build dynamic params
    let mut params_vec: Vec<Box<dyn rusqlite::types::ToSql>> = vec![Box::new(product_id)];
    if let Some(df) = date_from {
        params_vec.push(Box::new(df.to_string()));
    }
    if let Some(dt) = date_to {
        params_vec.push(Box::new(dt.to_string()));
    }

    let param_refs: Vec<&dyn rusqlite::types::ToSql> = params_vec.iter().map(|p| p.as_ref()).collect();

    let rows = stmt.query_map(param_refs.as_slice(), |row| {
        let size: String = row.get(1)?;
        let color: String = row.get(2)?;
        let variant_info = if !size.is_empty() && !color.is_empty() {
            format!("{} - {}", size, color)
        } else if !size.is_empty() {
            size
        } else if !color.is_empty() {
            color
        } else {
            "Default".to_string()
        };

        let prev_qty: i64 = row.get(3)?;
        let new_qty: i64 = row.get(4)?;

        Ok(StockLedgerEntry {
            id: row.get(0)?,
            variant_info,
            prev_qty,
            new_qty,
            change: new_qty - prev_qty,
            reason: row.get(5)?,
            changed_at: row.get(6)?,
        })
    })?;

    rows.collect()
}

// ─── Hierarchical Categories ── ──────────────────────────────────────────────

pub fn get_sub_categories(conn: &Connection, parent_id: i64) -> Result<Vec<Category>> {
    let mut stmt = conn.prepare("
        SELECT c.id, c.name, c.parent_id, COUNT(p.id) as product_count 
        FROM categories c
        LEFT JOIN products p ON p.category_id = c.id AND p.is_active = 1
        WHERE c.parent_id = ?1
        GROUP BY c.id
        ORDER BY c.name
    ")?;
    let rows = stmt.query_map(params![parent_id], |row| {
        Ok(Category {
            id: row.get(0)?,
            name: row.get(1)?,
            parent_id: row.get(2)?,
            product_count: row.get(3)?,
        })
    })?;
    rows.collect()
}

pub fn get_main_categories(conn: &Connection) -> Result<Vec<Category>> {
    let mut stmt = conn.prepare("
        SELECT c.id, c.name, c.parent_id, 
            (SELECT COUNT(*) FROM categories sc WHERE sc.parent_id = c.id) as sub_count
        FROM categories c
        WHERE c.parent_id IS NULL AND c.id IN (100, 200, 300)
        ORDER BY c.id
    ")?;
    let rows = stmt.query_map([], |row| {
        Ok(Category {
            id: row.get(0)?,
            name: row.get(1)?,
            parent_id: row.get(2)?,
            product_count: row.get(3)?,
        })
    })?;
    rows.collect()
}

pub fn delete_category(conn: &Connection, id: i64) -> Result<()> {
    // Prevent deleting main categories
    if id == 100 || id == 200 || id == 300 {
        return Err(rusqlite::Error::InvalidParameterName("Cannot delete main categories (Men, Women, Kids)".to_string()));
    }
    // Move products to no category
    conn.execute("UPDATE products SET category_id = NULL WHERE category_id = ?1", params![id])?;
    conn.execute("DELETE FROM categories WHERE id = ?1", params![id])?;
    Ok(())
}

pub fn update_category(conn: &Connection, id: i64, name: &str) -> Result<()> {
    conn.execute("UPDATE categories SET name = ?1 WHERE id = ?2", params![name, id])?;
    Ok(())
}

pub fn generate_article_number(conn: &Connection) -> Result<String> {
    let count: i64 = conn.query_row(
        "SELECT COALESCE(MAX(CAST(SUBSTR(article_number, 5) AS INTEGER)), 0) FROM products WHERE article_number LIKE 'ART-%'",
        [],
        |r| r.get(0),
    )?;
    Ok(format!("ART-{:05}", count + 1))
}

// ─── Inward via Article (Category-based) ─────────────────────────────────────

#[derive(Deserialize, Debug)]
pub struct InwardArticleItem {
    pub article_number: String,
    pub category_id: i64,    // sub-category ID
    pub product_name: String,
    pub color: Option<String>,
    pub size: Option<String>,
    pub quantity: i64,
    pub cost_price: f64,
    pub sale_price: f64,
}

#[derive(Deserialize, Debug)]
pub struct InwardArticlePayload {
    pub items: Vec<InwardArticleItem>,
    pub payment_method: String,
    pub payment_amount: f64,
    pub supplier_id: Option<i64>,
    pub supplier_name: Option<String>,
    pub notes: Option<String>,
    pub created_by: Option<i64>,
}

pub fn create_inward_article(conn: &mut Connection, payload: &InwardArticlePayload) -> Result<()> {
    let tx = conn.transaction()?;

    for item in &payload.items {
        // 1. Find or create product by article_number
        let product_id: i64 = match tx.query_row(
            "SELECT id FROM products WHERE article_number = ?1 AND is_active = 1",
            params![item.article_number],
            |r| r.get(0),
        ) {
            Ok(id) => {
                // Update cost/sale price to the latest
                tx.execute(
                    "UPDATE products SET cost_price = ?1, sale_price = ?2, category_id = ?3, updated_at = datetime('now') WHERE id = ?4",
                    params![item.cost_price, item.sale_price, item.category_id, id],
                )?;
                id
            }
            Err(_) => {
                // Create new product
                let sku = generate_sku(&tx)?;
                tx.execute(
                    "INSERT INTO products (name, sku, category_id, cost_price, sale_price, article_number, is_active)
                     VALUES (?1, ?2, ?3, ?4, ?5, ?6, 1)",
                    params![item.product_name, sku, item.category_id, item.cost_price, item.sale_price, item.article_number],
                )?;
                tx.last_insert_rowid()
            }
        };

        // 2. Find or create variant by size + color
        let variant_id: i64 = {
            let find_sql = match (item.size.as_ref(), item.color.as_ref()) {
                (Some(_), Some(_)) => "SELECT id FROM product_variants WHERE product_id = ?1 AND size = ?2 AND color = ?3",
                (Some(_), None)    => "SELECT id FROM product_variants WHERE product_id = ?1 AND size = ?2 AND color IS NULL",
                (None, Some(_))    => "SELECT id FROM product_variants WHERE product_id = ?1 AND size IS NULL AND color = ?2",
                (None, None)       => "SELECT id FROM product_variants WHERE product_id = ?1 AND size IS NULL AND color IS NULL",
            };

            let existing: Option<i64> = match (item.size.as_ref(), item.color.as_ref()) {
                (Some(s), Some(c)) => tx.query_row(find_sql, params![product_id, s, c], |r| r.get(0)).ok(),
                (Some(s), None)    => tx.query_row(find_sql, params![product_id, s], |r| r.get(0)).ok(),
                (None, Some(c))    => tx.query_row(find_sql, params![product_id, c], |r| r.get(0)).ok(),
                (None, None)       => tx.query_row(find_sql, params![product_id], |r| r.get(0)).ok(),
            };

            match existing {
                Some(vid) => vid,
                None => {
                    tx.execute(
                        "INSERT INTO product_variants (product_id, size, color, quantity, variant_price) VALUES (?1, ?2, ?3, 0, ?4)",
                        params![product_id, item.size, item.color, item.sale_price],
                    )?;
                    tx.last_insert_rowid()
                }
            }
        };

        // 3. Purchase lot for FIFO tracking
        tx.execute(
            "INSERT INTO purchase_lots (product_id, variant_id, original_qty, remaining_qty, cost_price)
             VALUES (?1, ?2, ?3, ?4, ?5)",
            params![product_id, variant_id, item.quantity, item.quantity, item.cost_price],
        )?;

        // 4. Update variant quantity
        tx.execute(
            "UPDATE product_variants SET quantity = quantity + ?1 WHERE id = ?2",
            params![item.quantity, variant_id],
        )?;

        // 5. Log stock history
        let current_qty: i64 = tx.query_row(
            "SELECT quantity FROM product_variants WHERE id = ?1",
            params![variant_id],
            |r| r.get(0),
        )?;
        let prev_qty = current_qty - item.quantity;
        let mut reason = format!("Inward Stock [{}]", item.article_number);
        if let Some(ref s) = payload.supplier_name {
            reason.push_str(&format!(" from {}", s));
        }

        tx.execute(
            "INSERT INTO stock_history (product_id, variant_id, prev_qty, new_qty, reason, changed_by)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            params![product_id, variant_id, prev_qty, current_qty, reason, payload.created_by],
        )?;
    }

    // 6. Cash book entry for the payment
    if payload.payment_amount > 0.0 {
        let desc = payload.notes.clone().unwrap_or_else(|| {
            if let Some(ref s) = payload.supplier_name {
                format!("Payment to supplier: {}", s)
            } else {
                "Purchase of stock".to_string()
            }
        });

        tx.execute(
            "INSERT INTO cash_book (entry_type, category, amount, payment_method, description, created_by)
             VALUES ('expense', 'Inventory Purchase', ?1, ?2, ?3, ?4)",
            params![payload.payment_amount, payload.payment_method, desc, payload.created_by],
        )?;
    }
    // 7. Supplier Ledger tracking
    if let Some(sid) = payload.supplier_id {
        let total_purchase: f64 = payload.items.iter().map(|i| i.quantity as f64 * i.cost_price).sum();
        
        // 7.1 Record Purchase Entry
        let current_balance: f64 = tx.query_row(
            "SELECT outstanding_balance FROM suppliers WHERE id = ?1",
            params![sid],
            |r| r.get(0),
        )?;
        
        let balance_after_purchase = current_balance + total_purchase;
        tx.execute(
            "INSERT INTO supplier_ledger (supplier_id, entry_type, amount, balance_after, description, created_by)
             VALUES (?1, 'purchase', ?2, ?3, ?4, ?5)",
            params![sid, total_purchase, balance_after_purchase, "Inventory Purchase", payload.created_by],
        )?;

        // 7.2 Record Payment Entry (if any)
        let final_balance = if payload.payment_amount > 0.0 {
            let bal = balance_after_purchase - payload.payment_amount;
            tx.execute(
                "INSERT INTO supplier_ledger (supplier_id, entry_type, amount, balance_after, description, created_by)
                 VALUES (?1, 'payment', ?2, ?3, ?4, ?5)",
                params![sid, payload.payment_amount, bal, "Initial Payment", payload.created_by],
            )?;
            bal
        } else {
            balance_after_purchase
        };

        // 7.3 Update Supplier Outstanding Balance
        tx.execute(
            "UPDATE suppliers SET outstanding_balance = ?1 WHERE id = ?2",
            params![final_balance, sid],
        )?;
    }

    tx.commit()?;

    // Auto-post to accounting journal (non-blocking)
    let total_purchase: f64 = payload.items.iter().map(|i| i.quantity as f64 * i.cost_price).sum();
    let supplier_name_str = payload.supplier_name.as_deref().unwrap_or("Unknown Supplier");
    if let Err(e) = crate::db::auto_post::post_inward_stock(conn, total_purchase, payload.payment_amount, payload.supplier_id.unwrap_or(0), supplier_name_str, payload.created_by) {
        eprintln!("Auto-post inward stock failed: {:?}", e);
    }

    Ok(())
}
