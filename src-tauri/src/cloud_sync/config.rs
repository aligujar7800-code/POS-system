use aes_gcm::{
    aead::{Aead, KeyInit},
    Aes256Gcm, Nonce,
};
use base64::{engine::general_purpose::STANDARD as B64, Engine};
use rand::RngCore;
use serde::{Deserialize, Serialize};
use std::path::PathBuf;

const CONFIG_FILE: &str = "cloud_sync_config.enc";

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct CloudSyncConfig {
    pub store_id: String,
    pub owner_email: String,
    pub store_name: String,
    pub connected_at: String,
    pub last_sync: Option<String>,
    pub last_daily_summary_date: Option<String>,
}

// ─── Encryption (machine-specific key) ───────────────────────────────────────

fn get_encryption_key() -> [u8; 32] {
    use sha2::{Digest, Sha256};
    let mut hasher = Sha256::new();

    if let Ok(hostname) = std::env::var("COMPUTERNAME") {
        hasher.update(hostname.as_bytes());
    }
    hasher.update(b"pos-cloud-sync-encryption-salt-v1");
    if let Ok(user) = std::env::var("USERNAME") {
        hasher.update(user.as_bytes());
    }

    let result = hasher.finalize();
    let mut key = [0u8; 32];
    key.copy_from_slice(&result[..32]);
    key
}

fn encrypt_config(config: &CloudSyncConfig) -> Result<String, String> {
    let key = get_encryption_key();
    let cipher = Aes256Gcm::new_from_slice(&key).map_err(|e| format!("Cipher init: {}", e))?;

    let mut nonce_bytes = [0u8; 12];
    rand::thread_rng().fill_bytes(&mut nonce_bytes);
    let nonce = Nonce::from_slice(&nonce_bytes);

    let json = serde_json::to_vec(config).map_err(|e| format!("Serialize: {}", e))?;
    let encrypted = cipher
        .encrypt(nonce, json.as_ref())
        .map_err(|e| format!("Encrypt: {}", e))?;

    let mut combined = nonce_bytes.to_vec();
    combined.extend_from_slice(&encrypted);
    Ok(B64.encode(combined))
}

fn decrypt_config(encoded: &str) -> Result<CloudSyncConfig, String> {
    let key = get_encryption_key();
    let cipher = Aes256Gcm::new_from_slice(&key).map_err(|e| format!("Cipher init: {}", e))?;

    let combined = B64.decode(encoded).map_err(|e| format!("Base64 decode: {}", e))?;
    if combined.len() < 12 {
        return Err("Invalid config data".into());
    }

    let (nonce_bytes, ciphertext) = combined.split_at(12);
    let nonce = Nonce::from_slice(nonce_bytes);

    let decrypted = cipher
        .decrypt(nonce, ciphertext)
        .map_err(|_| "Failed to decrypt config — machine may have changed".to_string())?;

    serde_json::from_slice(&decrypted).map_err(|e| format!("Deserialize: {}", e))
}

// ─── Load / Save / Remove ────────────────────────────────────────────────────

pub fn load_sync_config(app_data_dir: &PathBuf) -> Option<CloudSyncConfig> {
    let path = app_data_dir.join(CONFIG_FILE);
    let content = std::fs::read_to_string(&path).ok()?;
    decrypt_config(&content).ok()
}

pub fn save_sync_config(app_data_dir: &PathBuf, config: &CloudSyncConfig) -> Result<(), String> {
    let path = app_data_dir.join(CONFIG_FILE);
    let encrypted = encrypt_config(config)?;
    std::fs::write(&path, encrypted).map_err(|e| format!("Save config: {}", e))
}

pub fn remove_sync_config(app_data_dir: &PathBuf) -> Result<(), String> {
    let path = app_data_dir.join(CONFIG_FILE);
    if path.exists() {
        std::fs::remove_file(&path).map_err(|e| format!("Remove config: {}", e))?;
    }
    Ok(())
}
