use aes_gcm::{
    aead::{Aead, KeyInit},
    Aes256Gcm, Nonce,
};
use base64::{engine::general_purpose::STANDARD as B64, Engine};
use rand::RngCore;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;
use std::sync::mpsc;
use std::thread;

// ─── Google OAuth Credentials (backend only) ─────────────────────────────────
use dotenvy::dotenv;

// ─── Environment Configuration ──────────────────────────────────────────────

fn get_google_credentials() -> (String, String) {
    let _ = dotenv(); // Load .env file
    let id = std::env::var("GOOGLE_CLIENT_ID").unwrap_or_default();
    let secret = std::env::var("GOOGLE_CLIENT_SECRET").unwrap_or_default();
    (id, secret)
}
const SCOPES: &str = "https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/userinfo.profile";
const REDIRECT_URI_BASE: &str = "http://127.0.0.1";

// ─── Token Data ──────────────────────────────────────────────────────────────

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct TokenData {
    pub access_token: String,
    pub refresh_token: String,
    pub expires_at: i64, // unix timestamp
    pub email: String,
    pub name: String,
    pub picture: String,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct GoogleUserInfo {
    pub email: String,
    pub name: String,
    pub picture: String,
}

// ─── Encryption helpers ──────────────────────────────────────────────────────

fn get_encryption_key() -> [u8; 32] {
    // Derive a machine-specific key using the same fingerprint logic as the license system
    use sha2::{Digest, Sha256};
    let mut hasher = Sha256::new();

    // Use machine-specific data for key derivation
    if let Ok(hostname) = std::env::var("COMPUTERNAME") {
        hasher.update(hostname.as_bytes());
    }
    hasher.update(b"pos-cloud-backup-encryption-salt-v1");

    // Add username for extra entropy
    if let Ok(user) = std::env::var("USERNAME") {
        hasher.update(user.as_bytes());
    }

    let result = hasher.finalize();
    let mut key = [0u8; 32];
    key.copy_from_slice(&result[..32]);
    key
}

fn encrypt_token_data(data: &TokenData) -> Result<String, String> {
    let key = get_encryption_key();
    let cipher = Aes256Gcm::new_from_slice(&key).map_err(|e| format!("Cipher init: {}", e))?;

    let mut nonce_bytes = [0u8; 12];
    rand::thread_rng().fill_bytes(&mut nonce_bytes);
    let nonce = Nonce::from_slice(&nonce_bytes);

    let json = serde_json::to_vec(data).map_err(|e| format!("Serialize: {}", e))?;
    let encrypted = cipher
        .encrypt(nonce, json.as_ref())
        .map_err(|e| format!("Encrypt: {}", e))?;

    // Prepend nonce to ciphertext
    let mut combined = nonce_bytes.to_vec();
    combined.extend_from_slice(&encrypted);

    Ok(B64.encode(combined))
}

fn decrypt_token_data(encoded: &str) -> Result<TokenData, String> {
    let key = get_encryption_key();
    let cipher = Aes256Gcm::new_from_slice(&key).map_err(|e| format!("Cipher init: {}", e))?;

    let combined = B64.decode(encoded).map_err(|e| format!("Base64 decode: {}", e))?;
    if combined.len() < 12 {
        return Err("Invalid token data".into());
    }

    let (nonce_bytes, ciphertext) = combined.split_at(12);
    let nonce = Nonce::from_slice(nonce_bytes);

    let decrypted = cipher
        .decrypt(nonce, ciphertext)
        .map_err(|_| "Failed to decrypt token — machine may have changed".to_string())?;

    serde_json::from_slice(&decrypted).map_err(|e| format!("Deserialize: {}", e))
}

// ─── Token Storage ───────────────────────────────────────────────────────────

fn tokens_file_path(app_data_dir: &PathBuf) -> PathBuf {
    app_data_dir.join("cloud_tokens.json")
}

/// Load all user tokens (user_id -> encrypted_string)
fn load_token_store(app_data_dir: &PathBuf) -> HashMap<String, String> {
    let path = tokens_file_path(app_data_dir);
    if let Ok(content) = fs::read_to_string(&path) {
        serde_json::from_str(&content).unwrap_or_default()
    } else {
        HashMap::new()
    }
}

/// Save token store back to disk
fn save_token_store(app_data_dir: &PathBuf, store: &HashMap<String, String>) -> Result<(), String> {
    let path = tokens_file_path(app_data_dir);
    let json = serde_json::to_string_pretty(store).map_err(|e| e.to_string())?;
    fs::write(&path, json).map_err(|e| format!("Failed to write tokens: {}", e))
}

/// Store token for a specific user
pub fn store_token(app_data_dir: &PathBuf, user_id: i64, token: &TokenData) -> Result<(), String> {
    let encrypted = encrypt_token_data(token)?;
    let mut store = load_token_store(app_data_dir);
    store.insert(user_id.to_string(), encrypted);
    save_token_store(app_data_dir, &store)
}

/// Get token for a specific user (decrypted)
pub fn get_token(app_data_dir: &PathBuf, user_id: i64) -> Result<Option<TokenData>, String> {
    let store = load_token_store(app_data_dir);
    match store.get(&user_id.to_string()) {
        Some(encrypted) => {
            let token = decrypt_token_data(encrypted)?;
            Ok(Some(token))
        }
        None => Ok(None),
    }
}

/// Remove token for a specific user
pub fn remove_token(app_data_dir: &PathBuf, user_id: i64) -> Result<(), String> {
    let mut store = load_token_store(app_data_dir);
    store.remove(&user_id.to_string());
    save_token_store(app_data_dir, &store)
}

// ─── OAuth Flow ──────────────────────────────────────────────────────────────

/// Start OAuth flow: opens browser, listens for callback, returns TokenData
pub async fn start_oauth_flow() -> Result<TokenData, String> {
    // Start a temporary HTTP server on a random port
    let server = tiny_http::Server::http("127.0.0.1:0")
        .map_err(|e| format!("Failed to start callback server: {}", e))?;
    let port = server
        .server_addr()
        .to_ip()
        .ok_or("Failed to get server port")?
        .port();
    let redirect_uri = format!("{}:{}", REDIRECT_URI_BASE, port);

    // Build the Google OAuth URL
        let (client_id, _) = get_google_credentials();
        let auth_url = format!(
            "https://accounts.google.com/o/oauth2/v2/auth?\
            client_id={}&\
            redirect_uri={}&\
            response_type=code&\
            scope={}&\
            access_type=offline&\
            prompt=consent",
            urlencoding(&client_id),
            urlencoding(&redirect_uri),
            urlencoding(SCOPES),
        );

    // Open browser
    if let Err(e) = open::that(&auth_url) {
        eprintln!("Failed to open browser: {}", e);
        return Err(format!("Could not open browser: {}", e));
    }

    // Wait for the callback (with timeout)
    let (tx, rx) = mpsc::channel::<String>();
    let server_thread = thread::spawn(move || {
        // Wait up to 5 minutes for the callback
        if let Ok(Some(request)) = server.recv_timeout(std::time::Duration::from_secs(300)) {
            let url_str = format!("http://localhost{}", request.url());
            if let Ok(parsed) = url::Url::parse(&url_str) {
                let params: HashMap<String, String> = parsed.query_pairs().into_owned().collect();
                if let Some(code) = params.get("code") {
                    let _ = tx.send(code.clone());

                    // Send a nice response to the browser
                    let response_html = r#"<!DOCTYPE html><html><head><style>
                        body{font-family:Inter,system-ui,sans-serif;display:flex;justify-content:center;align-items:center;min-height:100vh;background:linear-gradient(135deg,#667eea 0%,#764ba2 100%);margin:0}
                        .card{background:white;border-radius:20px;padding:48px;text-align:center;box-shadow:0 20px 60px rgba(0,0,0,0.3);max-width:400px}
                        .check{width:64px;height:64px;background:#10b981;border-radius:50%;display:flex;align-items:center;justify-content:center;margin:0 auto 24px}
                        h1{color:#1e293b;margin:0 0 8px;font-size:24px}
                        p{color:#64748b;margin:0;font-size:14px}
                    </style></head><body>
                    <div class="card">
                        <div class="check"><svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg></div>
                        <h1>Connected Successfully!</h1>
                        <p>Your Google account has been linked to ClothingPOS. You can close this tab now.</p>
                    </div></body></html>"#;
                    let response = tiny_http::Response::from_string(response_html)
                        .with_header(
                            tiny_http::Header::from_bytes(
                                &b"Content-Type"[..],
                                &b"text/html; charset=utf-8"[..],
                            )
                            .unwrap(),
                        );
                    let _ = request.respond(response);
                    return;
                }
            }
            // Error response
            let _ = request.respond(tiny_http::Response::from_string("Authorization failed"));
        }
    });

    // Wait for auth code
    let code = rx
        .recv_timeout(std::time::Duration::from_secs(300))
        .map_err(|_| "OAuth timeout — no response from Google within 5 minutes".to_string())?;
    let _ = server_thread.join();

    // Exchange code for tokens
    let client = reqwest::Client::new();
        let (client_id, client_secret) = get_google_credentials();
        let token_response = client
            .post("https://oauth2.googleapis.com/token")
            .form(&[
                ("code", code.as_str()),
                ("client_id", client_id.as_str()),
                ("client_secret", client_secret.as_str()),
                ("redirect_uri", &redirect_uri),
                ("grant_type", "authorization_code"),
            ])
        .send()
        .await
        .map_err(|e| format!("Token exchange failed: {}", e))?;

    let token_json: serde_json::Value = token_response
        .json()
        .await
        .map_err(|e| format!("Parse token response: {}", e))?;

    let access_token = token_json["access_token"]
        .as_str()
        .ok_or("No access_token in response")?
        .to_string();
    let refresh_token = token_json["refresh_token"]
        .as_str()
        .ok_or("No refresh_token in response")?
        .to_string();
    let expires_in = token_json["expires_in"].as_i64().unwrap_or(3600);
    let expires_at = chrono::Utc::now().timestamp() + expires_in;

    // Fetch user info
    let user_info = fetch_user_info(&access_token).await?;

    Ok(TokenData {
        access_token,
        refresh_token,
        expires_at,
        email: user_info.email,
        name: user_info.name,
        picture: user_info.picture,
    })
}

/// Fetch Google user info using access token
async fn fetch_user_info(access_token: &str) -> Result<GoogleUserInfo, String> {
    let client = reqwest::Client::new();
    let resp = client
        .get("https://www.googleapis.com/oauth2/v2/userinfo")
        .bearer_auth(access_token)
        .send()
        .await
        .map_err(|e| format!("User info request failed: {}", e))?;

    let info: serde_json::Value = resp
        .json()
        .await
        .map_err(|e| format!("Parse user info: {}", e))?;

    Ok(GoogleUserInfo {
        email: info["email"].as_str().unwrap_or("").to_string(),
        name: info["name"].as_str().unwrap_or("").to_string(),
        picture: info["picture"].as_str().unwrap_or("").to_string(),
    })
}

/// Refresh access token using refresh_token
pub async fn refresh_access_token(token: &mut TokenData) -> Result<(), String> {
    let client = reqwest::Client::new();
    let (client_id, client_secret) = get_google_credentials();
    let resp = client
        .post("https://oauth2.googleapis.com/token")
        .form(&[
            ("client_id", client_id.as_str()),
            ("client_secret", client_secret.as_str()),
            ("refresh_token", token.refresh_token.as_str()),
            ("grant_type", "refresh_token"),
        ])
        .send()
        .await
        .map_err(|e| format!("Token refresh failed: {}", e))?;

    let json: serde_json::Value = resp
        .json()
        .await
        .map_err(|e| format!("Parse refresh response: {}", e))?;

    if let Some(error) = json["error"].as_str() {
        return Err(format!("Token refresh error: {} - {}", error, json["error_description"].as_str().unwrap_or("")));
    }

    token.access_token = json["access_token"]
        .as_str()
        .ok_or("No access_token in refresh response")?
        .to_string();

    let expires_in = json["expires_in"].as_i64().unwrap_or(3600);
    token.expires_at = chrono::Utc::now().timestamp() + expires_in;

    // If a new refresh token was issued, save it
    if let Some(new_refresh) = json["refresh_token"].as_str() {
        token.refresh_token = new_refresh.to_string();
    }

    Ok(())
}

/// Get a valid access token, refreshing if needed
pub async fn get_valid_token(
    app_data_dir: &PathBuf,
    user_id: i64,
) -> Result<TokenData, String> {
    let mut token = get_token(app_data_dir, user_id)?
        .ok_or("No Google account connected for this user")?;

    // Check if token is expired (with 5-minute buffer)
    let now = chrono::Utc::now().timestamp();
    if now >= token.expires_at - 300 {
        refresh_access_token(&mut token).await?;
        store_token(app_data_dir, user_id, &token)?;
    }

    Ok(token)
}

// Simple URL encoding helper
fn urlencoding(s: &str) -> String {
    url::form_urlencoded::byte_serialize(s.as_bytes()).collect()
}
