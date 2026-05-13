use calamine::{open_workbook, Reader, Xlsx, Data};
use std::path::Path;

/// Read an Excel (.xlsx) file and return (column_names, all_rows)
/// Reads the first sheet by default
pub fn read_excel(path: &str) -> Result<(Vec<String>, Vec<Vec<String>>), String> {
    let file_path = Path::new(path);
    if !file_path.exists() {
        return Err("File not found".into());
    }

    let mut workbook: Xlsx<_> = open_workbook(file_path)
        .map_err(|e| format!("Cannot open Excel file: {}", e))?;

    let sheet_names = workbook.sheet_names().to_vec();
    if sheet_names.is_empty() {
        return Err("Excel file has no sheets".into());
    }

    let range = workbook
        .worksheet_range(&sheet_names[0])
        .map_err(|e| format!("Cannot read sheet '{}': {}", sheet_names[0], e))?;

    let mut rows_iter = range.rows();

    // First row = headers
    let header_row = rows_iter.next().ok_or("Excel sheet is empty")?;
    let headers: Vec<String> = header_row
        .iter()
        .map(|cell| cell_to_string(cell).trim().to_string())
        .collect();

    if headers.is_empty() || headers.iter().all(|h| h.is_empty()) {
        return Err("Excel sheet has no column headers".into());
    }

    // Remaining rows = data
    let mut rows: Vec<Vec<String>> = Vec::new();
    for row in rows_iter {
        let values: Vec<String> = row.iter().map(|cell| cell_to_string(cell)).collect();
        // Skip completely empty rows
        if values.iter().all(|v| v.is_empty()) {
            continue;
        }
        // Pad short rows
        let mut padded = values;
        while padded.len() < headers.len() {
            padded.push(String::new());
        }
        rows.push(padded);
    }

    Ok((headers, rows))
}

/// List all sheet names in an Excel file
pub fn list_sheets(path: &str) -> Result<Vec<String>, String> {
    let workbook: Xlsx<_> = open_workbook(path)
        .map_err(|e| format!("Cannot open Excel file: {}", e))?;
    Ok(workbook.sheet_names().to_vec())
}

fn cell_to_string(cell: &Data) -> String {
    match cell {
        Data::Empty => String::new(),
        Data::String(s) => s.trim().to_string(),
        Data::Int(i) => i.to_string(),
        Data::Float(f) => {
            // Show integers cleanly (e.g. 100.0 → "100")
            if *f == (*f as i64) as f64 && f.abs() < 1e15 {
                format!("{}", *f as i64)
            } else {
                format!("{:.2}", f)
            }
        }
        Data::Bool(b) => b.to_string(),
        Data::DateTime(dt) => format!("{}", dt),
        Data::DateTimeIso(s) => s.clone(),
        Data::DurationIso(s) => s.clone(),
        Data::Error(e) => format!("ERR:{:?}", e),
    }
}
