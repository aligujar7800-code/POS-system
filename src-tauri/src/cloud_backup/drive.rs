use crate::cloud_backup::google_auth::{self, TokenData};
use serde::{Deserialize, Serialize};
use std::io::{Read, Write};
use std::path::PathBuf;
use zip::write::FileOptions;

const DRIVE_API_BASE: &str = "https://www.googleapis.com/drive/v3";
const DRIVE_UPLOAD_BASE: &str = "https://www.googleapis.com/upload/drive/v3";
const BACKUP_FOLDER_NAME: &str = "POS_Backups";
const MAX_BACKUPS: usize = 30;

// ─── Types ───────────────────────────────────────────────────────────────────

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct BackupEntry {
    pub id: String,
    pub name: String,
    pub size: String,
    pub created_time: String,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct DriveStorageInfo {
    pub limit: u64,       // total bytes
    pub usage: u64,       // used bytes
    pub usage_in_drive: u64,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct BackupResult {
    pub success: bool,
    pub file_name: String,
    pub file_id: String,
    pub size_bytes: u64,
    pub timestamp: String,
}

// ─── ZIP the database ────────────────────────────────────────────────────────

/// Create a ZIP file from the SQLite database
pub fn create_backup_zip(db_path: &PathBuf, output_dir: &PathBuf) -> Result<(PathBuf, String), String> {
    let now = chrono::Local::now();
    let file_name = format!("pos_backup_{}.zip", now.format("%Y-%m-%d_%H-%M"));
    let zip_path = output_dir.join(&file_name);

    // Read the database file
    let mut db_data = Vec::new();
    std::fs::File::open(db_path)
        .map_err(|e| format!("Cannot open database: {}", e))?
        .read_to_end(&mut db_data)
        .map_err(|e| format!("Cannot read database: {}", e))?;

    // Create ZIP
    let zip_file = std::fs::File::create(&zip_path)
        .map_err(|e| format!("Cannot create ZIP file: {}", e))?;
    let mut zip_writer = zip::ZipWriter::new(zip_file);

    let options = FileOptions::default()
        .compression_method(zip::CompressionMethod::Deflated)
        .unix_permissions(0o644);

    zip_writer
        .start_file("pos.db", options)
        .map_err(|e| format!("ZIP start_file error: {}", e))?;
    zip_writer
        .write_all(&db_data)
        .map_err(|e| format!("ZIP write error: {}", e))?;
    zip_writer
        .finish()
        .map_err(|e| format!("ZIP finish error: {}", e))?;

    Ok((zip_path, file_name))
}

// ─── Drive Folder Management ─────────────────────────────────────────────────

/// Find or create the POS_Backups folder in Google Drive
async fn get_or_create_backup_folder(token: &TokenData) -> Result<String, String> {
    let client = reqwest::Client::new();

    // Search for existing folder
    let query = format!(
        "name='{}' and mimeType='application/vnd.google-apps.folder' and trashed=false",
        BACKUP_FOLDER_NAME
    );
    let search_url = format!(
        "{}/files?q={}&fields=files(id,name)&spaces=drive",
        DRIVE_API_BASE,
        urlencoding(&query)
    );

    let resp = client
        .get(&search_url)
        .bearer_auth(&token.access_token)
        .send()
        .await
        .map_err(|e| format!("Drive folder search failed: {}", e))?;

    let json: serde_json::Value = resp
        .json()
        .await
        .map_err(|e| format!("Parse folder response: {}", e))?;

    // Check for existing folder
    if let Some(files) = json["files"].as_array() {
        if let Some(folder) = files.first() {
            if let Some(id) = folder["id"].as_str() {
                return Ok(id.to_string());
            }
        }
    }

    // Create new folder
    let metadata = serde_json::json!({
        "name": BACKUP_FOLDER_NAME,
        "mimeType": "application/vnd.google-apps.folder"
    });

    let resp = client
        .post(&format!("{}/files", DRIVE_API_BASE))
        .bearer_auth(&token.access_token)
        .header("Content-Type", "application/json")
        .body(metadata.to_string())
        .send()
        .await
        .map_err(|e| format!("Create folder failed: {}", e))?;

    let folder_json: serde_json::Value = resp
        .json()
        .await
        .map_err(|e| format!("Parse folder creation: {}", e))?;

    folder_json["id"]
        .as_str()
        .map(|s| s.to_string())
        .ok_or("Failed to get folder ID after creation".into())
}

// ─── Upload Backup ───────────────────────────────────────────────────────────

/// Upload a backup ZIP to Google Drive
pub async fn upload_backup(
    token: &TokenData,
    zip_path: &PathBuf,
    file_name: &str,
) -> Result<BackupResult, String> {
    let client = reqwest::Client::new();
    let folder_id = get_or_create_backup_folder(token).await?;

    // Read the ZIP file
    let mut zip_data = Vec::new();
    std::fs::File::open(zip_path)
        .map_err(|e| format!("Cannot open ZIP: {}", e))?
        .read_to_end(&mut zip_data)
        .map_err(|e| format!("Cannot read ZIP: {}", e))?;

    let size_bytes = zip_data.len() as u64;

    // Create multipart upload
    let metadata = serde_json::json!({
        "name": file_name,
        "parents": [folder_id]
    });

    let boundary = "pos_backup_boundary_2025";
    let mut body = Vec::new();

    // Part 1: metadata
    write!(body, "--{}\r\n", boundary).unwrap();
    write!(body, "Content-Type: application/json; charset=UTF-8\r\n\r\n").unwrap();
    write!(body, "{}\r\n", metadata.to_string()).unwrap();

    // Part 2: file content
    write!(body, "--{}\r\n", boundary).unwrap();
    write!(body, "Content-Type: application/zip\r\n\r\n").unwrap();
    body.extend_from_slice(&zip_data);
    write!(body, "\r\n--{}--\r\n", boundary).unwrap();

    let upload_url = format!(
        "{}/files?uploadType=multipart&fields=id,name,size,createdTime",
        DRIVE_UPLOAD_BASE
    );

    let resp = client
        .post(&upload_url)
        .bearer_auth(&token.access_token)
        .header(
            "Content-Type",
            format!("multipart/related; boundary={}", boundary),
        )
        .body(body)
        .send()
        .await
        .map_err(|e| format!("Upload failed: {}", e))?;

    let status = resp.status();
    let resp_text = resp.text().await.map_err(|e| format!("Read response: {}", e))?;

    if !status.is_success() {
        return Err(format!("Upload failed ({}): {}", status, resp_text));
    }

    let upload_json: serde_json::Value =
        serde_json::from_str(&resp_text).map_err(|e| format!("Parse upload response: {}", e))?;

    let file_id = upload_json["id"]
        .as_str()
        .unwrap_or("")
        .to_string();

    Ok(BackupResult {
        success: true,
        file_name: file_name.to_string(),
        file_id,
        size_bytes,
        timestamp: chrono::Utc::now().to_rfc3339(),
    })
}

// ─── List Backups ────────────────────────────────────────────────────────────

/// List all backups in the POS_Backups folder
pub async fn list_backups(token: &TokenData) -> Result<Vec<BackupEntry>, String> {
    let client = reqwest::Client::new();
    let folder_id = get_or_create_backup_folder(token).await?;

    let query = format!(
        "'{}' in parents and trashed=false",
        folder_id
    );
    let url = format!(
        "{}/files?q={}&fields=files(id,name,size,createdTime)&orderBy=createdTime desc&pageSize=100",
        DRIVE_API_BASE,
        urlencoding(&query)
    );

    let resp = client
        .get(&url)
        .bearer_auth(&token.access_token)
        .send()
        .await
        .map_err(|e| format!("List backups failed: {}", e))?;

    let json: serde_json::Value = resp
        .json()
        .await
        .map_err(|e| format!("Parse list response: {}", e))?;

    let mut entries = Vec::new();
    if let Some(files) = json["files"].as_array() {
        for file in files {
            entries.push(BackupEntry {
                id: file["id"].as_str().unwrap_or("").to_string(),
                name: file["name"].as_str().unwrap_or("").to_string(),
                size: file["size"].as_str().unwrap_or("0").to_string(),
                created_time: file["createdTime"].as_str().unwrap_or("").to_string(),
            });
        }
    }

    Ok(entries)
}

// ─── Delete Old Backups ──────────────────────────────────────────────────────

/// Delete backups beyond MAX_BACKUPS count
pub async fn cleanup_old_backups(token: &TokenData) -> Result<usize, String> {
    let backups = list_backups(token).await?;

    if backups.len() <= MAX_BACKUPS {
        return Ok(0);
    }

    let client = reqwest::Client::new();
    let to_delete = &backups[MAX_BACKUPS..];
    let mut deleted = 0;

    for backup in to_delete {
        let url = format!("{}/files/{}", DRIVE_API_BASE, backup.id);
        match client
            .delete(&url)
            .bearer_auth(&token.access_token)
            .send()
            .await
        {
            Ok(resp) if resp.status().is_success() || resp.status().as_u16() == 204 => {
                deleted += 1;
            }
            Ok(resp) => {
                eprintln!("Failed to delete backup {}: status {}", backup.name, resp.status());
            }
            Err(e) => {
                eprintln!("Failed to delete backup {}: {}", backup.name, e);
            }
        }
    }

    Ok(deleted)
}

// ─── Storage Info ────────────────────────────────────────────────────────────

/// Get Google Drive storage quota info
pub async fn get_storage_info(token: &TokenData) -> Result<DriveStorageInfo, String> {
    let client = reqwest::Client::new();
    let url = format!("{}/about?fields=storageQuota", DRIVE_API_BASE);

    let resp = client
        .get(&url)
        .bearer_auth(&token.access_token)
        .send()
        .await
        .map_err(|e| format!("Storage info failed: {}", e))?;

    let json: serde_json::Value = resp
        .json()
        .await
        .map_err(|e| format!("Parse storage response: {}", e))?;

    let quota = &json["storageQuota"];
    Ok(DriveStorageInfo {
        limit: quota["limit"]
            .as_str()
            .and_then(|s| s.parse().ok())
            .unwrap_or(0),
        usage: quota["usage"]
            .as_str()
            .and_then(|s| s.parse().ok())
            .unwrap_or(0),
        usage_in_drive: quota["usageInDrive"]
            .as_str()
            .and_then(|s| s.parse().ok())
            .unwrap_or(0),
    })
}

// ─── Download Backup (Restore) ───────────────────────────────────────────────

/// Download the latest backup from Drive and restore it
pub async fn download_latest_backup(
    token: &TokenData,
    restore_path: &PathBuf,
) -> Result<String, String> {
    let backups = list_backups(token).await?;
    let latest = backups
        .first()
        .ok_or("No backups found in Google Drive")?;

    let client = reqwest::Client::new();
    let url = format!("{}/files/{}?alt=media", DRIVE_API_BASE, latest.id);

    let resp = client
        .get(&url)
        .bearer_auth(&token.access_token)
        .send()
        .await
        .map_err(|e| format!("Download failed: {}", e))?;

    if !resp.status().is_success() {
        return Err(format!("Download failed: status {}", resp.status()));
    }

    let zip_data = resp
        .bytes()
        .await
        .map_err(|e| format!("Read download: {}", e))?;

    // Extract ZIP to get pos.db
    let cursor = std::io::Cursor::new(zip_data.to_vec());
    let mut archive = zip::ZipArchive::new(cursor)
        .map_err(|e| format!("Invalid ZIP file: {}", e))?;

    for i in 0..archive.len() {
        let mut file = archive
            .by_index(i)
            .map_err(|e| format!("ZIP entry error: {}", e))?;

        if file.name() == "pos.db" {
            let mut db_data = Vec::new();
            file.read_to_end(&mut db_data)
                .map_err(|e| format!("Read ZIP entry: {}", e))?;

            std::fs::write(restore_path, &db_data)
                .map_err(|e| format!("Write restored DB: {}", e))?;

            return Ok(latest.name.clone());
        }
    }

    Err("pos.db not found in backup ZIP".into())
}

// ─── Full Backup Flow ────────────────────────────────────────────────────────

/// Perform a complete backup: ZIP → Upload → Cleanup
pub async fn perform_full_backup(
    app_data_dir: &PathBuf,
    user_id: i64,
) -> Result<BackupResult, String> {
    // Get valid token
    let token = google_auth::get_valid_token(app_data_dir, user_id).await?;

    let db_path = app_data_dir.join("pos.db");
    if !db_path.exists() {
        return Err("Database file not found".into());
    }

    // Create temp directory for ZIP
    let temp_dir = app_data_dir.join("backup_temp");
    std::fs::create_dir_all(&temp_dir).map_err(|e| format!("Create temp dir: {}", e))?;

    // Flush WAL before backup
    // (The caller should handle this via the DB connection)

    // Create ZIP
    let (zip_path, file_name) = create_backup_zip(&db_path, &temp_dir)?;

    // Upload to Drive
    let result = upload_backup(&token, &zip_path, &file_name).await?;

    // Clean up temp file
    let _ = std::fs::remove_file(&zip_path);
    let _ = std::fs::remove_dir(&temp_dir);

    // Cleanup old backups
    let _ = cleanup_old_backups(&token).await;

    Ok(result)
}

fn urlencoding(s: &str) -> String {
    url::form_urlencoded::byte_serialize(s.as_bytes()).collect()
}
