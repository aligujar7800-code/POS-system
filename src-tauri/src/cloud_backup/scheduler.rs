use parking_lot::Mutex;
use std::path::PathBuf;
use std::sync::Arc;
use std::collections::HashMap;

/// Backup scheduler state — tracks intervals per user
pub struct BackupScheduler {
    pub app_data_dir: PathBuf,
    /// user_id -> last_backup_timestamp (unix)
    pub last_backup: Mutex<HashMap<i64, i64>>,
    /// user_id -> interval_hours
    pub intervals: Mutex<HashMap<i64, u64>>,
    /// Whether the scheduler loop is running
    pub running: Mutex<bool>,
}

impl BackupScheduler {
    pub fn new(app_data_dir: PathBuf) -> Self {
        Self {
            app_data_dir,
            last_backup: Mutex::new(HashMap::new()),
            intervals: Mutex::new(HashMap::new()),
            running: Mutex::new(false),
        }
    }

    /// Set backup interval for a user (in hours)
    pub fn set_interval(&self, user_id: i64, hours: u64) {
        self.intervals.lock().insert(user_id, hours);
    }

    /// Get backup interval for a user
    pub fn get_interval(&self, user_id: i64) -> u64 {
        *self.intervals.lock().get(&user_id).unwrap_or(&6)
    }

    /// Record that a backup just completed for a user
    pub fn record_backup(&self, user_id: i64) {
        let now = chrono::Utc::now().timestamp();
        self.last_backup.lock().insert(user_id, now);
    }

    /// Get last backup timestamp for a user
    pub fn get_last_backup(&self, user_id: i64) -> Option<i64> {
        self.last_backup.lock().get(&user_id).copied()
    }

    /// Check which users need a backup right now
    pub fn users_needing_backup(&self) -> Vec<i64> {
        let now = chrono::Utc::now().timestamp();
        let intervals = self.intervals.lock();
        let last_backups = self.last_backup.lock();

        let mut needs_backup = Vec::new();

        for (user_id, interval_hours) in intervals.iter() {
            let interval_secs = (*interval_hours) as i64 * 3600;
            let last = last_backups.get(user_id).copied().unwrap_or(0);

            if now - last >= interval_secs {
                needs_backup.push(*user_id);
            }
        }

        needs_backup
    }
}

/// Start the background scheduler loop
pub fn start_scheduler(scheduler: Arc<BackupScheduler>, db_state: crate::commands::DbState) {
    let mut running = scheduler.running.lock();
    if *running {
        return; // Already running
    }
    *running = true;
    drop(running);

    let scheduler_clone = scheduler.clone();

    tauri::async_runtime::spawn(async move {
        loop {
            // Check every 5 minutes
            tokio::time::sleep(tokio::time::Duration::from_secs(300)).await;

            let is_running = *scheduler_clone.running.lock();
            if !is_running {
                break;
            }

            // Process offline queue first
            let _ = super::queue::process_queue(&scheduler_clone.app_data_dir).await;

            // Check which users need backup
            let users = scheduler_clone.users_needing_backup();

            for user_id in users {
                // Check if this user has a connected Google account
                match super::google_auth::get_token(&scheduler_clone.app_data_dir, user_id) {
                    Ok(Some(_)) => {}
                    _ => continue, // No account connected, skip
                }

                // Flush WAL before backup
                {
                    let conn = db_state.lock();
                    let _ = conn.execute_batch("PRAGMA wal_checkpoint(FULL);");
                }

                // Check internet connectivity
                if !super::queue::check_internet().await {
                    // Queue for later
                    let _ = super::queue::enqueue_backup(&scheduler_clone.app_data_dir, user_id);
                    eprintln!("[Scheduler] No internet — queued backup for user {}", user_id);
                    continue;
                }

                // Perform backup
                match super::drive::perform_full_backup(&scheduler_clone.app_data_dir, user_id).await {
                    Ok(result) => {
                        scheduler_clone.record_backup(user_id);
                        eprintln!(
                            "[Scheduler] Backup complete for user {}: {} ({}KB)",
                            user_id,
                            result.file_name,
                            result.size_bytes / 1024
                        );
                        // Remove from offline queue if present
                        let _ = super::queue::dequeue_backup(&scheduler_clone.app_data_dir, user_id);
                    }
                    Err(e) => {
                        eprintln!("[Scheduler] Backup failed for user {}: {}", user_id, e);
                        // Queue for retry
                        let _ = super::queue::enqueue_backup(&scheduler_clone.app_data_dir, user_id);
                    }
                }
            }
        }
    });
}

/// Load scheduler state from settings (persisted intervals)
pub fn load_scheduler_settings(
    scheduler: &BackupScheduler,
    app_data_dir: &PathBuf,
) {
    let settings_path = app_data_dir.join("backup_scheduler.json");
    if let Ok(content) = std::fs::read_to_string(&settings_path) {
        if let Ok(map) = serde_json::from_str::<HashMap<String, u64>>(&content) {
            let mut intervals = scheduler.intervals.lock();
            for (user_id_str, hours) in map {
                if let Ok(uid) = user_id_str.parse::<i64>() {
                    intervals.insert(uid, hours);
                }
            }
        }
    }
}

/// Save scheduler settings to disk
pub fn save_scheduler_settings(
    scheduler: &BackupScheduler,
    app_data_dir: &PathBuf,
) -> Result<(), String> {
    let intervals = scheduler.intervals.lock();
    let map: HashMap<String, u64> = intervals
        .iter()
        .map(|(k, v)| (k.to_string(), *v))
        .collect();

    let settings_path = app_data_dir.join("backup_scheduler.json");
    let json = serde_json::to_string_pretty(&map).map_err(|e| e.to_string())?;
    std::fs::write(&settings_path, json).map_err(|e| format!("Save scheduler settings: {}", e))
}
