use aes_gcm::{
    aead::{Aead, KeyInit},
    Aes256Gcm, Nonce,
};
use rand::RngCore;
use std::collections::HashMap;
use std::path::PathBuf;

use super::types::GatewayCredentials;

/// Derive a 32-byte key from a static app secret (Portable Encryption)
fn derive_key() -> [u8; 32] {
    use sha2::{Digest, Sha256};
    let mut hasher = Sha256::new();
    // Static salt and secret for portability across machines
    hasher.update(b"clothing-pos-secure-v2-portable-secret");
    hasher.update(b"7d8f9a2b1c3e4f5a6b7c8d9e0f1a2b3c"); // Strong static salt
    hasher.finalize().into()
}

/// Encrypt a string using AES-256-GCM
fn encrypt_string(plaintext: &str) -> Result<String, String> {
    let key = derive_key();
    let cipher = Aes256Gcm::new_from_slice(&key)
        .map_err(|e| format!("Cipher init failed: {}", e))?;

    let mut nonce_bytes = [0u8; 12];
    rand::thread_rng().fill_bytes(&mut nonce_bytes);
    let nonce = Nonce::from_slice(&nonce_bytes);

    let ciphertext = cipher
        .encrypt(nonce, plaintext.as_bytes())
        .map_err(|e| format!("Encryption failed: {}", e))?;

    // Prepend nonce to ciphertext, then base64 encode
    let mut combined = nonce_bytes.to_vec();
    combined.extend_from_slice(&ciphertext);
    Ok(base64::Engine::encode(
        &base64::engine::general_purpose::STANDARD,
        &combined,
    ))
}

/// Decrypt an AES-256-GCM encrypted base64 string
fn decrypt_string(encoded: &str) -> Result<String, String> {
    let key = derive_key();
    let cipher = Aes256Gcm::new_from_slice(&key)
        .map_err(|e| format!("Cipher init failed: {}", e))?;

    let combined = base64::Engine::decode(
        &base64::engine::general_purpose::STANDARD,
        encoded,
    )
    .map_err(|e| format!("Base64 decode failed: {}", e))?;

    if combined.len() < 12 {
        return Err("Invalid encrypted data".to_string());
    }

    let (nonce_bytes, ciphertext) = combined.split_at(12);
    let nonce = Nonce::from_slice(nonce_bytes);

    let plaintext = cipher
        .decrypt(nonce, ciphertext)
        .map_err(|e| format!("Decryption failed: {}", e))?;

    String::from_utf8(plaintext).map_err(|e| format!("UTF-8 decode failed: {}", e))
}

/// Get the credentials file path
fn creds_path(data_dir: &PathBuf) -> PathBuf {
    data_dir.join("payment_credentials.enc")
}

/// Load all gateway credentials from encrypted file
pub fn load_all_credentials(data_dir: &PathBuf) -> Result<HashMap<String, GatewayCredentials>, String> {
    let path = creds_path(data_dir);
    if !path.exists() {
        return Ok(HashMap::new());
    }

    let encoded = std::fs::read_to_string(&path)
        .map_err(|e| format!("Failed to read credentials file: {}", e))?;

    if encoded.trim().is_empty() {
        return Ok(HashMap::new());
    }

    let decrypted = decrypt_string(&encoded)?;
    let creds: HashMap<String, GatewayCredentials> =
        serde_json::from_str(&decrypted)
            .map_err(|e| format!("Failed to parse credentials: {}", e))?;

    Ok(creds)
}

/// Save gateway credentials (encrypted)
pub fn save_credentials(
    data_dir: &PathBuf,
    gateway: &str,
    creds: &GatewayCredentials,
) -> Result<(), String> {
    let mut all = load_all_credentials(data_dir)?;
    all.insert(gateway.to_string(), creds.clone());

    let json = serde_json::to_string(&all)
        .map_err(|e| format!("Failed to serialize credentials: {}", e))?;

    let encrypted = encrypt_string(&json)?;

    std::fs::write(creds_path(data_dir), encrypted)
        .map_err(|e| format!("Failed to write credentials: {}", e))?;

    Ok(())
}

/// Get credentials for a specific gateway
pub fn get_credentials(data_dir: &PathBuf, gateway: &str) -> Result<Option<GatewayCredentials>, String> {
    let all = load_all_credentials(data_dir)?;
    Ok(all.get(gateway).cloned())
}

/// Remove credentials for a gateway
pub fn remove_credentials(data_dir: &PathBuf, gateway: &str) -> Result<(), String> {
    let mut all = load_all_credentials(data_dir)?;
    all.remove(gateway);

    let json = serde_json::to_string(&all)
        .map_err(|e| format!("Failed to serialize credentials: {}", e))?;

    let encrypted = encrypt_string(&json)?;

    std::fs::write(creds_path(data_dir), encrypted)
        .map_err(|e| format!("Failed to write credentials: {}", e))?;

    Ok(())
}

/// Check if a gateway has credentials configured
pub fn has_credentials(data_dir: &PathBuf, gateway: &str) -> bool {
    load_all_credentials(data_dir)
        .map(|all| all.contains_key(gateway))
        .unwrap_or(false)
}

/// Get a summary of which gateways are configured (without exposing secrets)
pub fn get_configured_gateways(data_dir: &PathBuf) -> Result<Vec<serde_json::Value>, String> {
    let all = load_all_credentials(data_dir)?;
    Ok(all
        .iter()
        .map(|(key, creds)| {
            serde_json::json!({
                "gateway": key,
                "merchant_id": mask_string(&creds.merchant_id),
                "sandbox": creds.sandbox,
                "configured": true,
            })
        })
        .collect())
}

/// Mask a string showing only first 3 and last 2 characters
fn mask_string(s: &str) -> String {
    if s.len() <= 5 {
        return "***".to_string();
    }
    format!("{}***{}", &s[..3], &s[s.len() - 2..])
}
