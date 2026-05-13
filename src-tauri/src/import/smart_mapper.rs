use serde::{Deserialize, Serialize};

/// The target fields in our POS schema that imported columns can map to
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum TargetField {
    ProductName,
    Barcode,
    Sku,
    Stock,
    SalePrice,
    CostPrice,
    Category,
    Brand,
    Size,
    Color,
    Description,
    ArticleNumber,
    Ignore,
}

impl TargetField {
    pub fn label(&self) -> &'static str {
        match self {
            Self::ProductName => "Product Name",
            Self::Barcode => "Barcode",
            Self::Sku => "SKU",
            Self::Stock => "Stock Quantity",
            Self::SalePrice => "Sale Price",
            Self::CostPrice => "Cost Price",
            Self::Category => "Category",
            Self::Brand => "Brand",
            Self::Size => "Size",
            Self::Color => "Color",
            Self::Description => "Description",
            Self::ArticleNumber => "Article Number",
            Self::Ignore => "— Ignore —",
        }
    }

    pub fn all_mappable() -> Vec<TargetField> {
        vec![
            Self::ProductName, Self::Barcode, Self::Sku, Self::Stock,
            Self::SalePrice, Self::CostPrice, Self::Category, Self::Brand,
            Self::Size, Self::Color, Self::Description, Self::ArticleNumber,
            Self::Ignore,
        ]
    }
}

/// Synonym lists for each target field (lowercase)
const SYNONYMS: &[(&str, &[&str])] = &[
    ("ProductName", &[
        "product_name", "product name", "productname", "item_name", "item name",
        "itemname", "name", "title", "product_title", "producttitle", "item",
        "description_name", "product", "goods", "goods_name", "article_name",
        "article name", "prod_name", "prodname", "item_description",
    ]),
    ("Barcode", &[
        "barcode", "bar_code", "barcode_no", "barcodeno", "ean", "ean13", "ean_13",
        "upc", "product_code", "productcode", "sku_barcode", "skubarcode",
        "bar code", "scan_code", "scancode", "code", "gtin",
    ]),
    ("Sku", &[
        "sku", "item_code", "itemcode", "product_id", "productid", "item_id",
        "itemid", "internal_code", "internalcode", "ref", "reference",
    ]),
    ("Stock", &[
        "qty", "quantity", "stock", "stock_qty", "stockqty", "inventory",
        "available_stock", "availablestock", "on_hand", "onhand", "stock_quantity",
        "stockquantity", "available", "remaining", "balance", "in_stock", "instock",
        "current_stock", "currentstock", "opening_stock",
    ]),
    ("SalePrice", &[
        "price", "sale_price", "saleprice", "selling_price", "sellingprice",
        "retail_price", "retailprice", "mrp", "unit_price", "unitprice",
        "sell_price", "sellprice", "rate", "selling_rate",
    ]),
    ("CostPrice", &[
        "cost", "cost_price", "costprice", "purchase_price", "purchaseprice",
        "buying_price", "buyingprice", "wholesale_price", "wholesaleprice",
        "supplier_price", "supplierprice", "landing_cost", "base_cost",
    ]),
    ("Category", &[
        "category", "category_name", "categoryname", "cat", "group",
        "product_group", "productgroup", "department", "dept", "type",
        "product_type", "producttype", "class",
    ]),
    ("Brand", &[
        "brand", "brand_name", "brandname", "manufacturer", "vendor",
        "supplier", "make", "company",
    ]),
    ("Size", &[
        "size", "product_size", "productsize", "measurement", "dimension",
        "variant_size",
    ]),
    ("Color", &[
        "color", "colour", "product_color", "productcolor", "shade",
        "variant_color",
    ]),
    ("Description", &[
        "description", "desc", "details", "product_description",
        "productdescription", "notes", "remarks", "product_details",
    ]),
    ("ArticleNumber", &[
        "article_number", "articlenumber", "article", "article_no", "articleno",
        "art_no", "artno", "model_number", "modelnumber", "model_no", "modelno",
        "style_number", "stylenumber", "style_no", "styleno",
    ]),
];

/// Result of analyzing a single column
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ColumnMapping {
    pub source_column: String,
    pub detected_field: String,      // TargetField variant name
    pub confidence: f64,             // 0.0–1.0
    pub detection_method: String,    // "synonym", "fuzzy", "pattern", "manual"
    pub sample_values: Vec<String>,  // first few values for UI preview
}

/// Detect what each column maps to based on its name + sample data
pub fn detect_columns(
    column_names: &[String],
    sample_rows: &[Vec<String>],  // each inner vec is one row, aligned with column_names
) -> Vec<ColumnMapping> {
    let mut mappings = Vec::new();
    let mut used_fields: Vec<String> = Vec::new(); // prevent duplicate assignments

    // Phase 1: exact/synonym match on column names
    for (col_idx, col_name) in column_names.iter().enumerate() {
        let clean = col_name.trim().to_lowercase().replace([' ', '-', '.'], "_");

        // Collect sample values for this column
        let samples: Vec<String> = sample_rows.iter()
            .take(5)
            .filter_map(|row| row.get(col_idx).cloned())
            .filter(|v| !v.is_empty())
            .collect();

        // Try exact synonym match
        let mut best_field = "Ignore".to_string();
        let mut best_confidence = 0.0_f64;
        let mut best_method = "none".to_string();

        for (field_name, synonyms) in SYNONYMS {
            for syn in *synonyms {
                if *syn == clean {
                    let conf = 0.98;
                    if conf > best_confidence && !used_fields.contains(&field_name.to_string()) {
                        best_field = field_name.to_string();
                        best_confidence = conf;
                        best_method = "synonym".to_string();
                    }
                }
            }
        }

        // Phase 2: fuzzy match if no exact synonym found
        if best_confidence < 0.7 {
            for (field_name, synonyms) in SYNONYMS {
                for syn in *synonyms {
                    let score = fuzzy_similarity(&clean, syn);
                    if score > best_confidence && score > 0.6 && !used_fields.contains(&field_name.to_string()) {
                        best_field = field_name.to_string();
                        best_confidence = score;
                        best_method = "fuzzy".to_string();
                    }
                }
            }
        }

        // Phase 3: data pattern detection if still uncertain
        if best_confidence < 0.5 && !samples.is_empty() {
            let (pattern_field, pattern_conf) = detect_by_pattern(&samples);
            if pattern_conf > best_confidence && !used_fields.contains(&pattern_field) {
                best_field = pattern_field;
                best_confidence = pattern_conf;
                best_method = "pattern".to_string();
            }
        }

        if best_field != "Ignore" {
            used_fields.push(best_field.clone());
        }

        mappings.push(ColumnMapping {
            source_column: col_name.clone(),
            detected_field: best_field,
            confidence: (best_confidence * 100.0).round() / 100.0, // round to 2 decimals
            detection_method: best_method,
            sample_values: samples,
        });
    }

    mappings
}

/// Fuzzy string similarity using bigram overlap (Dice coefficient)
fn fuzzy_similarity(a: &str, b: &str) -> f64 {
    if a == b { return 1.0; }
    if a.len() < 2 || b.len() < 2 { return 0.0; }

    let bigrams_a: Vec<(char, char)> = a.chars().zip(a.chars().skip(1)).collect();
    let bigrams_b: Vec<(char, char)> = b.chars().zip(b.chars().skip(1)).collect();

    let matches = bigrams_a.iter().filter(|bg| bigrams_b.contains(bg)).count();
    (2.0 * matches as f64) / (bigrams_a.len() + bigrams_b.len()) as f64
}

/// Detect field type by analyzing the data values themselves
fn detect_by_pattern(samples: &[String]) -> (String, f64) {
    let total = samples.len() as f64;
    if total == 0.0 { return ("Ignore".into(), 0.0); }

    let mut long_numeric = 0;    // barcode-like (10–14 digit strings)
    let mut integer_count = 0;    // pure integers
    let mut decimal_count = 0;    // decimal numbers
    let mut text_count = 0;       // general text strings

    for val in samples {
        let trimmed = val.trim();
        if trimmed.is_empty() { continue; }

        // Check if it's a long numeric string (barcode pattern)
        let digits_only: String = trimmed.chars().filter(|c| c.is_ascii_digit()).collect();
        if digits_only.len() >= 10 && digits_only.len() <= 14 && digits_only.len() == trimmed.len() {
            long_numeric += 1;
            continue;
        }

        // Check if pure integer
        if trimmed.parse::<i64>().is_ok() {
            integer_count += 1;
            continue;
        }

        // Check if decimal
        if trimmed.parse::<f64>().is_ok() {
            decimal_count += 1;
            continue;
        }

        text_count += 1;
    }

    let long_pct = long_numeric as f64 / total;
    let int_pct = integer_count as f64 / total;
    let dec_pct = decimal_count as f64 / total;
    let txt_pct = text_count as f64 / total;

    if long_pct > 0.5 {
        ("Barcode".into(), 0.85)
    } else if dec_pct > 0.5 {
        ("SalePrice".into(), 0.65)
    } else if int_pct > 0.5 {
        ("Stock".into(), 0.6)
    } else if txt_pct > 0.5 {
        ("ProductName".into(), 0.55)
    } else {
        ("Ignore".into(), 0.0)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_exact_synonym() {
        let cols = vec!["item_name".into(), "qty".into(), "ean13".into()];
        let rows = vec![
            vec!["Shirt".into(), "10".into(), "1234567890123".into()],
        ];
        let result = detect_columns(&cols, &rows);
        assert_eq!(result[0].detected_field, "ProductName");
        assert_eq!(result[1].detected_field, "Stock");
        assert_eq!(result[2].detected_field, "Barcode");
    }

    #[test]
    fn test_fuzzy_match() {
        let score = fuzzy_similarity("prod_name", "product_name");
        assert!(score > 0.5);
    }
}
