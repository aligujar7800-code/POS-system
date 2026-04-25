use rusqlite::{Connection, Result, params, Row};
use serde::{Serialize, Deserialize};
use sha2::Digest;

// ──── LICENSE CONFIG — UPDATE THESE BEFORE BUILDING ─────────────────────────
const DEV_EMAIL: &str = "aligujar7800@gmail.com";
const DEV_APP_PASSWORD: &str = "fukh wyzw kobv imrl";
const LICENSE_SECRET: &str = "FashionPointPOS_2026_SecretKey_XkZ9mQ";
/// Remote URL where you list approved Machine IDs and their expiry days
const ONLINE_LICENSES_URL: &str = "https://raw.githubusercontent.com/aligujar7800-code/POS-system/main/licenses.json";
// ────────────────────────────────────────────────────────────────────────────

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct LicenseInfo {
    pub license_key: String,
    pub machine_id: String,
    pub activated_at: String,
    pub expiry_date: Option<String>,
    pub status: String,
}

#[derive(serde::Deserialize)]
struct OnlineLicenseEntry {
    pub machine_id: String,
    pub days: i64, // e.g. 30, 365, or 9999 for lifetime
}

/// Get the Windows Machine GUID from the registry
pub fn get_machine_fingerprint() -> std::result::Result<String, String> {
    let output = std::process::Command::new("reg")
        .args(&[
            "query",
            "HKLM\\SOFTWARE\\Microsoft\\Cryptography",
            "/v",
            "MachineGuid",
        ])
        .output()
        .map_err(|e: std::io::Error| format!("Failed to read registry: {}", e))?;

    let stdout = String::from_utf8_lossy(&output.stdout);
    for line in stdout.lines() {
        if line.contains("MachineGuid") {
            let parts: Vec<&str> = line.split_whitespace().collect();
            if let Some(guid) = parts.last() {
                return Ok(guid.to_string());
            }
        }
    }
    Err("Could not read Machine GUID".to_string())
}

/// Generate a license key for a given machine ID using HMAC-SHA256
pub fn generate_key_for_machine(machine_id: &str) -> String {
    let input = format!("{}{}", machine_id, LICENSE_SECRET);
    let mut hasher = sha2::Sha256::new();
    hasher.update(input.as_bytes());
    let hash = hasher.finalize();
    let hex: String = hash.iter().map(|b| format!("{:02X}", b)).collect();
    format!(
        "CPOS-{}-{}-{}-{}",
        &hex[0..4],
        &hex[4..8],
        &hex[8..12],
        &hex[12..16]
    )
}

/// Check if the machine is approved in the online JSON file
pub async fn check_online_activation(db: tauri::State<'_, crate::commands::DbState>) -> std::result::Result<Option<LicenseInfo>, String> {
    let machine_id = get_machine_fingerprint()?;
    
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(10))
        .build()
        .map_err(|e: reqwest::Error| e.to_string())?;

    let response = client.get(ONLINE_LICENSES_URL).send().await;
    
    if let Ok(resp) = response {
        if let Ok(entries) = resp.json::<Vec<OnlineLicenseEntry>>().await {
            if let Some(entry) = entries.iter().find(|e| e.machine_id == machine_id) {
                // Auto-activate!
                let key = generate_key_for_machine(&machine_id);
                let expiry = chrono::Utc::now() + chrono::Duration::days(entry.days);
                let expiry_str = expiry.format("%Y-%m-%d").to_string();

                {
                    let conn = db.lock();
                    conn.execute(
                        "INSERT INTO app_license (id, license_key, machine_id, expiry_date, status)
                         VALUES (1, ?1, ?2, ?3, 'active')
                         ON CONFLICT(id) DO UPDATE SET
                            license_key = excluded.license_key,
                            machine_id = excluded.machine_id,
                            activated_at = datetime('now'),
                            expiry_date = excluded.expiry_date,
                            status = 'active'",
                        params![key, machine_id, expiry_str],
                    ).map_err(|e: rusqlite::Error| e.to_string())?;
                }

                return Ok(Some(LicenseInfo {
                    license_key: key,
                    machine_id,
                    activated_at: chrono::Utc::now().to_rfc3339(),
                    expiry_date: Some(expiry_str),
                    status: "active".to_string(),
                }));
            }
        }
    }
    Ok(None)
}

/// Get current license status from DB and check expiry
pub fn get_license_status(conn: &Connection) -> Result<Option<LicenseInfo>> {
    match conn.query_row(
        "SELECT license_key, machine_id, activated_at, expiry_date, status FROM app_license WHERE id = 1",
        [],
        |row: &Row| {
            Ok(LicenseInfo {
                license_key: row.get(0)?,
                machine_id: row.get(1)?,
                activated_at: row.get(2)?,
                expiry_date: row.get(3)?,
                status: row.get(4)?,
            })
        },
    ) {
        Ok(info) => {
            // Check if expired
            if let Some(ref date_str) = info.expiry_date {
                if let Ok(expiry) = chrono::NaiveDate::parse_from_str(date_str, "%Y-%m-%d") {
                    if expiry < chrono::Utc::now().naive_utc().date() {
                        let mut expired_info = info.clone();
                        expired_info.status = "expired".to_string();
                        return Ok(Some(expired_info));
                    }
                }
            }
            Ok(Some(info))
        },
        Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
        Err(e) => Err(e),
    }
}

/// Activate a license key manually (fallback)
pub fn activate_license(conn: &Connection, key: &str) -> std::result::Result<LicenseInfo, String> {
    let machine_id = get_machine_fingerprint()?;

    let expected = generate_key_for_machine(&machine_id);
    if key.trim().to_uppercase() != expected {
        return Err("Invalid license key".to_string());
    }

    conn.execute(
        "INSERT INTO app_license (id, license_key, machine_id, expiry_date, status)
         VALUES (1, ?1, ?2, NULL, 'active')
         ON CONFLICT(id) DO UPDATE SET
            license_key = excluded.license_key,
            machine_id = excluded.machine_id,
            activated_at = datetime('now'),
            expiry_date = NULL,
            status = 'active'",
        params![key.trim().to_uppercase(), machine_id],
    )
    .map_err(|e| format!("DB error: {}", e))?;

    Ok(LicenseInfo {
        license_key: key.to_string(),
        machine_id,
        activated_at: chrono::Utc::now().to_rfc3339(),
        expiry_date: None,
        status: "active".to_string(),
    })
}

/// Send a license request email to the developer
pub fn send_license_request(
    customer_name: &str,
    customer_phone: &str,
    machine_id: &str,
) -> std::result::Result<(), String> {
    use lettre::transport::smtp::authentication::Credentials;
    use lettre::{Message, SmtpTransport, Transport};

    let body = format!(
        "═══════════════════════════════════════\n\
         🔑 NEW LICENSE REQUEST — ClothingPOS\n\
         ═══════════════════════════════════════\n\n\
         Customer Name : {}\n\
         Phone         : {}\n\
         Machine ID    : {}\n\n\
         ───────────────────────────────────────\n\
         To activate, add this to your GitHub licenses.json:\n\n\
         {{\"machine_id\": \"{}\", \"days\": 30}}\n\
         ═══════════════════════════════════════",
        customer_name, customer_phone, machine_id, machine_id
    );

    let email = Message::builder()
        .from(format!("ClothingPOS <{}>", DEV_EMAIL).parse().unwrap())
        .to(DEV_EMAIL.parse().unwrap())
        .subject(format!("🔑 License Request — {} [{}]", customer_name, &machine_id[..8]))
        .body(body)
        .map_err(|e| format!("Email build error: {}", e))?;

    let creds = Credentials::new(DEV_EMAIL.to_string(), DEV_APP_PASSWORD.to_string());

    let mailer = SmtpTransport::relay("smtp.gmail.com")
        .map_err(|e| format!("SMTP error: {}", e))?
        .credentials(creds)
        .build();

    mailer.send(&email).map_err(|e| format!("Send failed: {}", e))?;

    Ok(())
}
