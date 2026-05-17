use rusqlite::{Connection, params};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

use super::smart_mapper::ColumnMapping;

/// A single validation error found during pre-import checks
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ValidationError {
    pub row_number: usize,
    pub field: String,
    pub error_type: String,
    pub message: String,
}

/// How to handle duplicate barcodes
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum DuplicateAction {
    Skip,
    MergeStock,
    Replace,
    GenerateNew,
}

/// Import configuration sent from frontend
#[derive(Debug, Clone, Deserialize)]
pub struct ImportConfig {
    pub mappings: Vec<MappingEntry>,
    pub duplicate_action: String,  // "skip", "merge", "replace", "generate_new"
}

#[derive(Debug, Clone, Deserialize)]
pub struct MappingEntry {
    pub source_column: String,
    pub target_field: String,  // TargetField variant name
}

/// Result after import completes
#[derive(Debug, Clone, Serialize)]
pub struct ImportResult {
    pub total_rows: usize,
    pub imported: usize,
    pub skipped: usize,
    pub errors: usize,
    pub error_details: Vec<ValidationError>,
    pub import_batch_id: String,
}

/// Validate all rows before import and return errors
pub fn validate_rows(
    columns: &[String],
    rows: &[Vec<String>],
    config: &ImportConfig,
) -> Vec<ValidationError> {
    let mut errors = Vec::new();
    let col_map = build_column_index(columns, &config.mappings);

    let name_idx = col_map.get("ProductName");
    let barcode_idx = col_map.get("Barcode");
    let price_idx = col_map.get("SalePrice");
    let cost_idx = col_map.get("CostPrice");
    let stock_idx = col_map.get("Stock");

    let mut seen_barcodes: HashMap<String, usize> = HashMap::new();

    for (row_num, row) in rows.iter().enumerate() {
        let r = row_num + 2; // +2 for 1-indexed + header row

        // Check required: product name
        if let Some(&idx) = name_idx {
            let val = row.get(idx).map(|s| s.trim()).unwrap_or("");
            if val.is_empty() {
                errors.push(ValidationError {
                    row_number: r,
                    field: "Product Name".into(),
                    error_type: "missing".into(),
                    message: format!("Row {} has no product name", r),
                });
            }
        } else {
            // No product name column mapped at all
            if row_num == 0 {
                errors.push(ValidationError {
                    row_number: 0,
                    field: "Product Name".into(),
                    error_type: "unmapped".into(),
                    message: "No column is mapped to Product Name (required)".into(),
                });
            }
        }

        // Check price validity
        if let Some(&idx) = price_idx {
            let val = row.get(idx).map(|s| s.trim()).unwrap_or("");
            if !val.is_empty() {
                if let Err(_) = val.replace(',', "").parse::<f64>() {
                    errors.push(ValidationError {
                        row_number: r,
                        field: "Sale Price".into(),
                        error_type: "invalid".into(),
                        message: format!("Row {} has invalid price: '{}'", r, val),
                    });
                }
            }
        }

        // Check cost price
        if let Some(&idx) = cost_idx {
            let val = row.get(idx).map(|s| s.trim()).unwrap_or("");
            if !val.is_empty() {
                if let Err(_) = val.replace(',', "").parse::<f64>() {
                    errors.push(ValidationError {
                        row_number: r,
                        field: "Cost Price".into(),
                        error_type: "invalid".into(),
                        message: format!("Row {} has invalid cost price: '{}'", r, val),
                    });
                }
            }
        }

        // Check stock (non-negative integer)
        if let Some(&idx) = stock_idx {
            let val = row.get(idx).map(|s| s.trim()).unwrap_or("");
            if !val.is_empty() {
                match val.replace(',', "").parse::<f64>() {
                    Ok(n) if n < 0.0 => {
                        errors.push(ValidationError {
                            row_number: r,
                            field: "Stock".into(),
                            error_type: "negative".into(),
                            message: format!("Row {} has negative stock: {}", r, val),
                        });
                    }
                    Err(_) => {
                        errors.push(ValidationError {
                            row_number: r,
                            field: "Stock".into(),
                            error_type: "invalid".into(),
                            message: format!("Row {} has invalid stock value: '{}'", r, val),
                        });
                    }
                    _ => {}
                }
            }
        }

        // Validate meta fields
        if let Some(&idx) = col_map.get("meta:imei_number") {
            let val = row.get(idx).map(|s| s.trim()).unwrap_or("");
            if !val.is_empty() && (val.len() != 15 || !val.chars().all(char::is_numeric)) {
                errors.push(ValidationError {
                    row_number: r,
                    field: "IMEI Number".into(),
                    error_type: "invalid".into(),
                    message: format!("Row {} IMEI must be exactly 15 digits: '{}'", r, val),
                });
            }
        }

        if let Some(&idx) = col_map.get("meta:expiry_date") {
            let val = row.get(idx).map(|s| s.trim()).unwrap_or("");
            if !val.is_empty() {
                let parts: Vec<&str> = val.split(|c| c == '-' || c == '/').collect();
                let is_valid = if parts.len() == 3 {
                    let (p0, p1, p2) = (parts[0].len(), parts[1].len(), parts[2].len());
                    // DD-MM-YYYY or YYYY-MM-DD
                    (p0 == 2 && p1 == 2 && p2 == 4) || (p0 == 4 && p1 == 2 && p2 == 2)
                } else {
                    false
                };
                
                if !is_valid {
                    errors.push(ValidationError {
                        row_number: r,
                        field: "Expiry Date".into(),
                        error_type: "invalid".into(),
                        message: format!("Row {} Expiry Date must be DD-MM-YYYY or YYYY-MM-DD: '{}'", r, val),
                    });
                }
            }
        }

        // Duplicate barcode detection within the file
        if let Some(&idx) = barcode_idx {
            let val = row.get(idx).map(|s| s.trim().to_string()).unwrap_or_default();
            if !val.is_empty() {
                if let Some(prev_row) = seen_barcodes.get(&val) {
                    errors.push(ValidationError {
                        row_number: r,
                        field: "Barcode".into(),
                        error_type: "duplicate_in_file".into(),
                        message: format!("Barcode '{}' is duplicated (first seen at row {})", val, prev_row),
                    });
                } else {
                    seen_barcodes.insert(val, r);
                }
            }
        }

        // Cap errors to prevent memory blowup on very bad files
        if errors.len() > 500 {
            errors.push(ValidationError {
                row_number: 0,
                field: "".into(),
                error_type: "overflow".into(),
                message: "Too many errors detected (500+). Fix the file and try again.".into(),
            });
            break;
        }
    }

    errors
}

/// Execute the actual import into the POS database
pub fn execute_import(
    conn: &Connection,
    columns: &[String],
    rows: &[Vec<String>],
    config: &ImportConfig,
) -> Result<ImportResult, String> {
    let col_map = build_column_index(columns, &config.mappings);
    let batch_id = format!("IMP-{}", chrono::Utc::now().format("%Y%m%d-%H%M%S"));

    let dup_action = match config.duplicate_action.as_str() {
        "merge" => DuplicateAction::MergeStock,
        "replace" => DuplicateAction::Replace,
        "generate_new" => DuplicateAction::GenerateNew,
        _ => DuplicateAction::Skip,
    };

    let name_idx = col_map.get("ProductName").copied();
    let barcode_idx = col_map.get("Barcode").copied();
    let sku_idx = col_map.get("Sku").copied();
    let stock_idx = col_map.get("Stock").copied();
    let price_idx = col_map.get("SalePrice").copied();
    let cost_idx = col_map.get("CostPrice").copied();
    let category_idx = col_map.get("Category").copied();
    let brand_idx = col_map.get("Brand").copied();
    let size_idx = col_map.get("Size").copied();
    let color_idx = col_map.get("Color").copied();
    let desc_idx = col_map.get("Description").copied();
    let article_idx = col_map.get("ArticleNumber").copied();

    let mut meta_mappings: Vec<(String, usize)> = Vec::new();
    for m in &config.mappings {
        if m.target_field.starts_with("meta:") {
            if let Some(&idx) = col_map.get(&m.target_field) {
                let key = m.target_field.trim_start_matches("meta:").to_string();
                meta_mappings.push((key, idx));
            }
        }
    }

    let mut imported = 0usize;
    let mut skipped = 0usize;
    let mut err_count = 0usize;
    let mut error_details = Vec::new();

    // Log import batch
    let _ = conn.execute(
        "INSERT INTO import_history (batch_id, source_type, total_rows, status) VALUES (?1, 'file', ?2, 'running')",
        params![batch_id, rows.len()],
    );

    // Process in chunks of 200 using transactions for performance
    let chunk_size = 200;
    for chunk in rows.chunks(chunk_size) {
        let tx = conn.unchecked_transaction().map_err(|e| e.to_string())?;

        for (_local_idx, row) in chunk.iter().enumerate() {
            let global_idx = imported + skipped + err_count + 1;

            let product_name = get_val(row, name_idx).unwrap_or_default();
            if product_name.is_empty() {
                skipped += 1;
                continue;
            }

            let barcode = get_val(row, barcode_idx).unwrap_or_default();
            let sku = get_val(row, sku_idx).unwrap_or_default();
            let stock_str = get_val(row, stock_idx).unwrap_or_else(|| "0".into());
            let stock: i64 = stock_str.replace(',', "").parse::<f64>().unwrap_or(0.0).max(0.0) as i64;
            let price: f64 = get_val(row, price_idx)
                .unwrap_or_else(|| "0".into())
                .replace(',', "")
                .parse()
                .unwrap_or(0.0);
            let cost: f64 = get_val(row, cost_idx)
                .unwrap_or_else(|| "0".into())
                .replace(',', "")
                .parse()
                .unwrap_or(0.0);
            let category_name = get_val(row, category_idx).unwrap_or_default();
            let brand = get_val(row, brand_idx);
            let size = get_val(row, size_idx);
            let color = get_val(row, color_idx);
            let description = get_val(row, desc_idx);
            let article_no = get_val(row, article_idx);

            // Resolve category ID
            let category_id = if !category_name.is_empty() {
                resolve_category(&tx, &category_name)
            } else {
                None
            };

            // Check for existing barcode in DB
            if !barcode.is_empty() {
                let exists = barcode_exists(&tx, &barcode);
                if exists {
                    match dup_action {
                        DuplicateAction::Skip => {
                            skipped += 1;
                            continue;
                        }
                        DuplicateAction::MergeStock => {
                            // Add stock to existing product's variant
                            if let Err(e) = merge_stock_to_existing(&tx, &barcode, stock) {
                                error_details.push(ValidationError {
                                    row_number: global_idx,
                                    field: "Barcode".into(),
                                    error_type: "merge_failed".into(),
                                    message: format!("Failed to merge stock for barcode '{}': {}", barcode, e),
                                });
                                err_count += 1;
                            } else {
                                imported += 1;
                            }
                            continue;
                        }
                        DuplicateAction::Replace => {
                            // Delete existing and re-insert below
                            let _ = delete_product_by_barcode(&tx, &barcode);
                        }
                        DuplicateAction::GenerateNew => {
                            // We'll store the old barcode as legacy and generate a new one below
                        }
                    }
                }
            }

            // Generate SKU if empty
            let final_sku = if sku.is_empty() {
                generate_import_sku(&tx)?
            } else {
                // Ensure SKU uniqueness
                if sku_exists(&tx, &sku) {
                    generate_import_sku(&tx)?
                } else {
                    sku
                }
            };

            // Generate article number
            let final_article = if article_no.as_deref().unwrap_or("").is_empty() {
                generate_import_article(&tx)?
            } else {
                article_no.unwrap_or_default()
            };

            // Handle barcode for GenerateNew duplicates
            let (final_barcode, legacy_barcode) = if !barcode.is_empty() && matches!(dup_action, DuplicateAction::GenerateNew) && barcode_exists(&tx, &barcode) {
                let new_bc = format!("{}-01", final_article);
                (Some(new_bc), Some(barcode))
            } else if !barcode.is_empty() {
                (Some(barcode.clone()), None)
            } else {
                (None, None)
            };

            // Build product_meta JSON
            let mut meta_json = serde_json::Map::new();
            for (key, idx) in &meta_mappings {
                if let Some(val) = get_val(row, Some(*idx)) {
                    meta_json.insert(key.clone(), serde_json::Value::String(val));
                }
            }
            let product_meta_str = if meta_json.is_empty() {
                None
            } else {
                Some(serde_json::Value::Object(meta_json).to_string())
            };

            // Insert product
            match tx.execute(
                "INSERT INTO products (name, sku, barcode, category_id, brand, description, cost_price, sale_price, tax_percent, low_stock_threshold, is_active, article_number, product_meta)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, 0, 5, 1, ?9, ?10)",
                params![product_name, final_sku, final_barcode, category_id, brand, description, cost, price, final_article, product_meta_str],
            ) {
                Ok(_) => {
                    let product_id = tx.last_insert_rowid();

                    // Create variant
                    let v_barcode = final_barcode.clone().or_else(|| Some(format!("{}-01", final_article)));
                    tx.execute(
                        "INSERT INTO product_variants (product_id, size, color, quantity, variant_barcode, variant_price)
                         VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
                        params![product_id, size, color, stock, v_barcode, if price > 0.0 { Some(price) } else { None }],
                    ).map_err(|e| e.to_string())?;

                    let variant_id = tx.last_insert_rowid();

                    // Store legacy barcode if needed
                    if let Some(ref lbc) = legacy_barcode {
                        let _ = tx.execute(
                            "UPDATE product_variants SET legacy_barcode = ?1 WHERE id = ?2",
                            params![lbc, variant_id],
                        );
                    }

                    // Purchase lot for FIFO
                    if stock > 0 {
                        let _ = tx.execute(
                            "INSERT INTO purchase_lots (product_id, variant_id, original_qty, remaining_qty, cost_price)
                             VALUES (?1, ?2, ?3, ?4, ?5)",
                            params![product_id, variant_id, stock, stock, cost],
                        );
                        let _ = tx.execute(
                            "INSERT INTO stock_history (product_id, variant_id, prev_qty, new_qty, reason)
                             VALUES (?1, ?2, 0, ?3, ?4)",
                            params![product_id, variant_id, stock, format!("Import: {}", batch_id)],
                        );
                    }

                    imported += 1;
                }
                Err(e) => {
                    error_details.push(ValidationError {
                        row_number: global_idx,
                        field: "insert".into(),
                        error_type: "db_error".into(),
                        message: format!("Row {}: {}", global_idx, e),
                    });
                    err_count += 1;
                }
            }
        }

        tx.commit().map_err(|e| e.to_string())?;
    }

    // Update import history
    let status = if err_count > 0 { "completed_with_errors" } else { "completed" };
    let _ = conn.execute(
        "UPDATE import_history SET imported_count = ?1, skipped_count = ?2, error_count = ?3, status = ?4 WHERE batch_id = ?5",
        params![imported as i64, skipped as i64, err_count as i64, status, batch_id],
    );

    Ok(ImportResult {
        total_rows: rows.len(),
        imported,
        skipped,
        errors: err_count,
        error_details,
        import_batch_id: batch_id,
    })
}

/// Rollback an import batch (soft-delete all products from that batch)
pub fn rollback_import(conn: &Connection, batch_id: &str) -> Result<usize, String> {
    let reason = format!("Import: {}", batch_id);
    let deleted: usize = conn.execute(
        "UPDATE products SET is_active = 0 WHERE id IN (
            SELECT DISTINCT product_id FROM stock_history WHERE reason = ?1
        )",
        params![reason],
    ).map_err(|e| e.to_string())?;

    let _ = conn.execute(
        "UPDATE import_history SET status = 'rolled_back' WHERE batch_id = ?1",
        params![batch_id],
    );

    Ok(deleted)
}

// ─── Helpers ────────────────────────────────────────────────────────────────

fn build_column_index(columns: &[String], mappings: &[MappingEntry]) -> HashMap<String, usize> {
    let mut map = HashMap::new();
    for m in mappings {
        if m.target_field == "Ignore" { continue; }
        if let Some(idx) = columns.iter().position(|c| c == &m.source_column) {
            map.insert(m.target_field.clone(), idx);
        }
    }
    map
}

fn get_val(row: &[String], idx: Option<usize>) -> Option<String> {
    idx.and_then(|i| row.get(i)).map(|s| s.trim().to_string()).filter(|s| !s.is_empty())
}

fn barcode_exists(conn: &Connection, barcode: &str) -> bool {
    let count: i64 = conn.query_row(
        "SELECT COUNT(*) FROM products WHERE barcode = ?1 AND is_active = 1
         UNION ALL
         SELECT COUNT(*) FROM product_variants pv JOIN products p ON p.id = pv.product_id WHERE pv.variant_barcode = ?1 AND p.is_active = 1",
        params![barcode],
        |r| r.get(0),
    ).unwrap_or(0);
    count > 0
}

fn sku_exists(conn: &Connection, sku: &str) -> bool {
    let count: i64 = conn.query_row(
        "SELECT COUNT(*) FROM products WHERE sku = ?1",
        params![sku],
        |r| r.get(0),
    ).unwrap_or(0);
    count > 0
}

fn merge_stock_to_existing(conn: &Connection, barcode: &str, additional_stock: i64) -> Result<(), String> {
    // Find variant with this barcode
    let variant_id: i64 = conn.query_row(
        "SELECT pv.id FROM product_variants pv JOIN products p ON p.id = pv.product_id
         WHERE (pv.variant_barcode = ?1 OR p.barcode = ?1) AND p.is_active = 1 LIMIT 1",
        params![barcode],
        |r| r.get(0),
    ).map_err(|_| format!("No active product found with barcode '{}'", barcode))?;

    conn.execute(
        "UPDATE product_variants SET quantity = quantity + ?1 WHERE id = ?2",
        params![additional_stock, variant_id],
    ).map_err(|e| e.to_string())?;

    Ok(())
}

fn delete_product_by_barcode(conn: &Connection, barcode: &str) -> Result<(), String> {
    conn.execute(
        "UPDATE products SET is_active = 0 WHERE barcode = ?1 OR id IN (
            SELECT product_id FROM product_variants WHERE variant_barcode = ?1
        )",
        params![barcode],
    ).map_err(|e| e.to_string())?;
    Ok(())
}

fn resolve_category(conn: &Connection, name: &str) -> Option<i64> {
    // Try to find existing category
    match conn.query_row(
        "SELECT id FROM categories WHERE LOWER(name) = LOWER(?1) LIMIT 1",
        params![name],
        |r| r.get::<_, i64>(0),
    ) {
        Ok(id) => Some(id),
        Err(_) => {
            // Create new category
            match conn.execute(
                "INSERT INTO categories (name) VALUES (?1)",
                params![name],
            ) {
                Ok(_) => Some(conn.last_insert_rowid()),
                Err(_) => None,
            }
        }
    }
}

fn generate_import_sku(conn: &Connection) -> Result<String, String> {
    let max_num: i64 = conn.query_row(
        "SELECT COALESCE(MAX(CAST(SUBSTR(sku, 5) AS INTEGER)), 0) FROM products WHERE sku LIKE 'SKU-%'",
        [],
        |r| r.get(0),
    ).unwrap_or(0);
    Ok(format!("SKU-{:06}", max_num + 1))
}

fn generate_import_article(conn: &Connection) -> Result<String, String> {
    let max_num: i64 = conn.query_row(
        "SELECT COALESCE(MAX(CAST(SUBSTR(article_number, 5) AS INTEGER)), 0) FROM products WHERE article_number LIKE 'ART-%'",
        [],
        |r| r.get(0),
    ).unwrap_or(0);
    Ok(format!("ART-{:05}", max_num + 1))
}
