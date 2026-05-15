use serde::{Deserialize, Serialize};
use std::path::PathBuf;

const QUEUE_FILE: &str = "cloud_sync_queue.json";

#[derive(Serialize, Deserialize, Clone, Debug)]
pub enum SyncItem {
    Sale { local_id: i64 },
    Customer { local_id: i64 },
    DailySummary { date: String },
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct QueueEntry {
    pub item: SyncItem,
    pub queued_at: String,
    pub retry_count: u32,
}

/// Load the sync queue from disk
pub fn load_queue(app_data_dir: &PathBuf) -> Vec<QueueEntry> {
    let path = app_data_dir.join(QUEUE_FILE);
    if let Ok(content) = std::fs::read_to_string(&path) {
        serde_json::from_str(&content).unwrap_or_default()
    } else {
        Vec::new()
    }
}

/// Save the sync queue to disk
pub fn save_queue(app_data_dir: &PathBuf, queue: &[QueueEntry]) -> Result<(), String> {
    let path = app_data_dir.join(QUEUE_FILE);
    let json = serde_json::to_string_pretty(queue).map_err(|e| e.to_string())?;
    std::fs::write(&path, json).map_err(|e| format!("Save sync queue: {}", e))
}

/// Add an item to the offline sync queue (deduplicates)
pub fn enqueue(app_data_dir: &PathBuf, item: SyncItem) -> Result<(), String> {
    let mut queue = load_queue(app_data_dir);

    // Deduplicate
    let already_queued = queue.iter().any(|q| match (&q.item, &item) {
        (SyncItem::Sale { local_id: a }, SyncItem::Sale { local_id: b }) => a == b,
        (SyncItem::Customer { local_id: a }, SyncItem::Customer { local_id: b }) => a == b,
        (SyncItem::DailySummary { date: a }, SyncItem::DailySummary { date: b }) => a == b,
        _ => false,
    });

    if already_queued {
        return Ok(());
    }

    queue.push(QueueEntry {
        item,
        queued_at: chrono::Utc::now().to_rfc3339(),
        retry_count: 0,
    });

    save_queue(app_data_dir, &queue)
}

/// Get queue count
pub fn queue_count(app_data_dir: &PathBuf) -> usize {
    load_queue(app_data_dir).len()
}
