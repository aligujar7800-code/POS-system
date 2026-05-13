use serde::{Deserialize, Serialize};
use std::path::PathBuf;

const QUEUE_FILE: &str = "backup_queue.json";

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct QueuedBackup {
    pub user_id: i64,
    pub queued_at: String,
    pub retry_count: u32,
}

/// Load the backup queue from disk
pub fn load_queue(app_data_dir: &PathBuf) -> Vec<QueuedBackup> {
    let path = app_data_dir.join(QUEUE_FILE);
    if let Ok(content) = std::fs::read_to_string(&path) {
        serde_json::from_str(&content).unwrap_or_default()
    } else {
        Vec::new()
    }
}

/// Save the backup queue to disk
pub fn save_queue(app_data_dir: &PathBuf, queue: &[QueuedBackup]) -> Result<(), String> {
    let path = app_data_dir.join(QUEUE_FILE);
    let json = serde_json::to_string_pretty(queue).map_err(|e| e.to_string())?;
    std::fs::write(&path, json).map_err(|e| format!("Save queue: {}", e))
}

/// Add a backup to the offline queue
pub fn enqueue_backup(app_data_dir: &PathBuf, user_id: i64) -> Result<(), String> {
    let mut queue = load_queue(app_data_dir);

    // Don't duplicate if already queued for this user
    if queue.iter().any(|q| q.user_id == user_id) {
        return Ok(());
    }

    queue.push(QueuedBackup {
        user_id,
        queued_at: chrono::Utc::now().to_rfc3339(),
        retry_count: 0,
    });

    save_queue(app_data_dir, &queue)
}

/// Remove a specific user's entry from the queue
pub fn dequeue_backup(app_data_dir: &PathBuf, user_id: i64) -> Result<(), String> {
    let mut queue = load_queue(app_data_dir);
    queue.retain(|q| q.user_id != user_id);
    save_queue(app_data_dir, &queue)
}

/// Check if there is internet connectivity
pub async fn check_internet() -> bool {
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(5))
        .build();

    match client {
        Ok(c) => c
            .head("https://www.googleapis.com")
            .send()
            .await
            .is_ok(),
        Err(_) => false,
    }
}

/// Process the offline queue — try uploading queued backups
pub async fn process_queue(app_data_dir: &PathBuf) -> Vec<(i64, Result<(), String>)> {
    let mut results = Vec::new();
    let queue = load_queue(app_data_dir);

    if queue.is_empty() {
        return results;
    }

    // Check internet first
    if !check_internet().await {
        return results;
    }

    let mut remaining = Vec::new();

    for mut item in queue {
        match super::drive::perform_full_backup(app_data_dir, item.user_id).await {
            Ok(_result) => {
                results.push((item.user_id, Ok(())));
            }
            Err(e) => {
                item.retry_count += 1;
                // Keep in queue if under 10 retries
                if item.retry_count < 10 {
                    remaining.push(item.clone());
                }
                results.push((item.user_id, Err(e)));
            }
        }
    }

    let _ = save_queue(app_data_dir, &remaining);
    results
}
