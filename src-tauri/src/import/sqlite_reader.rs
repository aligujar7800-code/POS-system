use rusqlite::{Connection, OpenFlags};
use std::path::Path;

/// Information about a table in the external database
#[derive(serde::Serialize, Clone, Debug)]
pub struct TableInfo {
    pub name: String,
    pub row_count: i64,
    pub columns: Vec<String>,
    pub is_product_table: bool,  // auto-detected best candidate
}

/// Open an external SQLite DB in read-only mode and list its tables
pub fn list_tables(path: &str) -> Result<Vec<TableInfo>, String> {
    let file_path = Path::new(path);
    if !file_path.exists() {
        return Err("Database file not found".into());
    }

    let conn = Connection::open_with_flags(file_path, OpenFlags::SQLITE_OPEN_READ_ONLY)
        .map_err(|e| format!("Cannot open database: {}", e))?;

    // Get all user tables
    let mut stmt = conn
        .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name")
        .map_err(|e| format!("Query error: {}", e))?;

    let table_names: Vec<String> = stmt
        .query_map([], |row| row.get(0))
        .map_err(|e| format!("Query error: {}", e))?
        .filter_map(|r| r.ok())
        .collect();

    let mut tables = Vec::new();
    let mut best_score = 0i32;
    let mut best_idx = 0usize;

    for (idx, tname) in table_names.iter().enumerate() {
        // Get row count
        let count: i64 = conn
            .query_row(&format!("SELECT COUNT(*) FROM [{}]", tname), [], |r| r.get(0))
            .unwrap_or(0);

        // Get columns
        let columns = get_table_columns(&conn, tname);

        // Score how likely this is a "products" table
        let score = score_product_table(tname, &columns);
        if score > best_score {
            best_score = score;
            best_idx = idx;
        }

        tables.push(TableInfo {
            name: tname.clone(),
            row_count: count,
            columns,
            is_product_table: false,
        });
    }

    // Mark the best candidate
    if !tables.is_empty() && best_score > 0 {
        tables[best_idx].is_product_table = true;
    }

    Ok(tables)
}

/// Read data from a specific table in an external SQLite DB
pub fn read_table(path: &str, table_name: &str) -> Result<(Vec<String>, Vec<Vec<String>>), String> {
    let conn = Connection::open_with_flags(path, OpenFlags::SQLITE_OPEN_READ_ONLY)
        .map_err(|e| format!("Cannot open database: {}", e))?;

    let columns = get_table_columns(&conn, table_name);
    if columns.is_empty() {
        return Err(format!("Table '{}' has no columns", table_name));
    }

    let sql = format!("SELECT * FROM [{}]", table_name);
    let mut stmt = conn.prepare(&sql).map_err(|e| format!("Query error: {}", e))?;

    let col_count = columns.len();
    let rows: Vec<Vec<String>> = stmt
        .query_map([], |row| {
            let mut values = Vec::with_capacity(col_count);
            for i in 0..col_count {
                let val: String = match row.get::<_, rusqlite::types::Value>(i) {
                    Ok(rusqlite::types::Value::Null) => String::new(),
                    Ok(rusqlite::types::Value::Integer(v)) => v.to_string(),
                    Ok(rusqlite::types::Value::Real(v)) => {
                        if v == (v as i64) as f64 && v.abs() < 1e15 {
                            format!("{}", v as i64)
                        } else {
                            format!("{:.2}", v)
                        }
                    }
                    Ok(rusqlite::types::Value::Text(s)) => s,
                    Ok(rusqlite::types::Value::Blob(_)) => "[blob]".into(),
                    Err(_) => String::new(),
                };
                values.push(val);
            }
            Ok(values)
        })
        .map_err(|e| format!("Read error: {}", e))?
        .filter_map(|r| r.ok())
        .collect();

    Ok((columns, rows))
}

fn get_table_columns(conn: &Connection, table_name: &str) -> Vec<String> {
    let sql = format!("PRAGMA table_info([{}])", table_name);
    let mut stmt = match conn.prepare(&sql) {
        Ok(s) => s,
        Err(_) => return vec![],
    };
    stmt.query_map([], |row| {
        let name: String = row.get(1)?;
        Ok(name)
    })
    .unwrap_or_else(|_| panic!("table_info failed"))
    .filter_map(|r| r.ok())
    .collect()
}

/// Heuristic scoring: how likely is this table a "products" table?
fn score_product_table(name: &str, columns: &[String]) -> i32 {
    let lower_name = name.to_lowercase();
    let lower_cols: Vec<String> = columns.iter().map(|c| c.to_lowercase()).collect();
    let mut score = 0;

    // Table name scoring
    let name_keywords = ["product", "item", "inventory", "goods", "stock", "article"];
    for kw in name_keywords {
        if lower_name.contains(kw) { score += 10; }
    }

    // Column name scoring
    let col_keywords = [
        ("name", 5), ("price", 5), ("barcode", 8), ("sku", 6),
        ("quantity", 5), ("stock", 5), ("cost", 4), ("category", 3),
        ("brand", 3), ("description", 2),
    ];
    for (kw, pts) in col_keywords {
        if lower_cols.iter().any(|c| c.contains(kw)) {
            score += pts;
        }
    }

    score
}
