use std::path::Path;

/// Read a CSV file and return (column_names, all_rows)
pub fn read_csv(path: &str) -> Result<(Vec<String>, Vec<Vec<String>>), String> {
    let file_path = Path::new(path);
    if !file_path.exists() {
        return Err("File not found".into());
    }

    let mut reader = csv::ReaderBuilder::new()
        .has_headers(true)
        .flexible(true) // allow rows with different column counts
        .from_path(file_path)
        .map_err(|e| format!("Cannot open CSV: {}", e))?;

    let headers: Vec<String> = reader
        .headers()
        .map_err(|e| format!("Cannot read CSV headers: {}", e))?
        .iter()
        .map(|h| h.trim().to_string())
        .collect();

    if headers.is_empty() {
        return Err("CSV file has no columns".into());
    }

    let mut rows: Vec<Vec<String>> = Vec::new();
    for result in reader.records() {
        match result {
            Ok(record) => {
                let row: Vec<String> = record.iter().map(|v| v.trim().to_string()).collect();
                // Pad short rows with empty strings
                let mut padded = row;
                while padded.len() < headers.len() {
                    padded.push(String::new());
                }
                rows.push(padded);
            }
            Err(e) => {
                eprintln!("Skipping malformed CSV row: {}", e);
                continue;
            }
        }
    }

    Ok((headers, rows))
}
