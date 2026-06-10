use rusqlite::{Connection, Result, params, Row};
use serde::{Serialize, Deserialize};
use sha2::Digest;

// ──── LICENSE CONFIG — UPDATE THESE BEFORE BUILDING ─────────────────────────
const DEV_EMAIL: &str = "aligujar7800@gmail.com";
const DEV_APP_PASSWORD: &str = "fukh wyzw kobv imrl";
const LICENSE_SECRET: &str = "FashionPointPOS_2026_SecretKey_XkZ9mQ";
/// Remote URL where you list approved Machine IDs and their expiry days
const ONLINE_LICENSES_URL: &str = "https://raw.githubusercontent.com/aligujar7800-code/POS-system/main/licenses.json";
/// Default license validity in days (for manual key activation)
const DEFAULT_LICENSE_DAYS: i64 = 30;
// ────────────────────────────────────────────────────────────────────────────

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct LicenseInfo {
    pub license_key: String,
    pub machine_id: String,
    pub activated_at: String,
    pub expiry_date: Option<String>,
    pub status: String,
    /// Days remaining until expiry (-1 = expired, 0 = last day)
    pub days_remaining: Option<i64>,
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

pub fn generate_key_for_machine(machine_id: &str, month_offset: i32) -> String {
    use chrono::Datelike;
    let date = chrono::Utc::now();
    let mut year = date.year();
    let mut month = date.month() as i32 + month_offset;
    while month > 12 { month -= 12; year += 1; }
    while month < 1 { month += 12; year -= 1; }

    let month_str = format!("{:02}{:04}", month, year); // e.g., 052026
    let input = format!("{}{}{}", machine_id, LICENSE_SECRET, month_str);
    let mut hasher = sha2::Sha256::new();
    hasher.update(input.as_bytes());
    let result = hasher.finalize();
    let hex_str: String = result.iter().map(|b| format!("{:02X}", b)).collect();
    format!("CPOS-{}-{}-{}-{}", &hex_str[0..4], &hex_str[4..8], &hex_str[8..12], &hex_str[12..16])
}

/// Calculate days remaining from an expiry date string
fn calc_days_remaining(expiry_str: &str) -> i64 {
    if let Ok(expiry) = chrono::NaiveDate::parse_from_str(expiry_str, "%Y-%m-%d") {
        let today = chrono::Utc::now().naive_utc().date();
        (expiry - today).num_days()
    } else {
        -1
    }
}

/// Check if the machine is approved in the online JSON file.
/// Now only used as a whitelist check. No auto-renewal.
pub async fn check_online_activation(_db: tauri::State<'_, crate::commands::DbState>) -> std::result::Result<Option<LicenseInfo>, String> {
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
                days_remaining: None,
            })
        },
    ) {
        Ok(mut info) => {
            // Check if expired
            if let Some(ref date_str) = info.expiry_date {
                let mut days = calc_days_remaining(date_str);
                
                // Force max 30 days for ANY existing license (e.g. from old 3000-day configs)
                if days > DEFAULT_LICENSE_DAYS {
                    let new_expiry = chrono::Utc::now() + chrono::Duration::days(DEFAULT_LICENSE_DAYS);
                    let new_expiry_str = new_expiry.format("%Y-%m-%d").to_string();
                    let _ = conn.execute(
                        "UPDATE app_license SET expiry_date = ?1 WHERE id = 1",
                        params![new_expiry_str],
                    );
                    info.expiry_date = Some(new_expiry_str);
                    days = DEFAULT_LICENSE_DAYS;
                }

                info.days_remaining = Some(days);

                if days < 0 && days >= -3 {
                    info.status = "grace_period".to_string();
                    let _ = conn.execute(
                        "UPDATE app_license SET status = 'grace_period' WHERE id = 1",
                        [],
                    );
                } else if days < -3 {
                    info.status = "expired".to_string();
                    let _ = conn.execute(
                        "UPDATE app_license SET status = 'expired' WHERE id = 1",
                        [],
                    );
                }
            } else {
                // No expiry date means it was an old unlimited license
                // Enforce 30-day limit: set expiry to 30 days from activated_at
                if let Ok(activated) = chrono::NaiveDate::parse_from_str(
                    &info.activated_at.split('T').next().unwrap_or(&info.activated_at).split(' ').next().unwrap_or(&info.activated_at),
                    "%Y-%m-%d"
                ) {
                    let expiry = activated + chrono::Duration::days(DEFAULT_LICENSE_DAYS);
                    let expiry_str = expiry.format("%Y-%m-%d").to_string();
                    let days = calc_days_remaining(&expiry_str);
                    
                    // Update DB with the calculated expiry
                    let _ = conn.execute(
                        "UPDATE app_license SET expiry_date = ?1 WHERE id = 1",
                        params![expiry_str],
                    );

                    info.expiry_date = Some(expiry_str);
                    info.days_remaining = Some(days);

                    if days < 0 && days >= -3 {
                        info.status = "grace_period".to_string();
                        let _ = conn.execute(
                            "UPDATE app_license SET status = 'grace_period' WHERE id = 1",
                            [],
                        );
                    } else if days < -3 {
                        info.status = "expired".to_string();
                        let _ = conn.execute(
                            "UPDATE app_license SET status = 'expired' WHERE id = 1",
                            [],
                        );
                    }
                }
            }
            Ok(Some(info))
        },
        Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
        Err(e) => Err(e),
    }
}

/// Activate a license key manually — checks Github whitelist, validates monthly key, and activates for 30 days.
pub async fn activate_license(db: tauri::State<'_, crate::commands::DbState>, key: &str) -> std::result::Result<LicenseInfo, String> {
    let machine_id = get_machine_fingerprint()?;

    // 1. Verify online whitelist
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(10))
        .build()
        .map_err(|e| e.to_string())?;

    let resp = client.get(ONLINE_LICENSES_URL).send().await.map_err(|_| "Network error checking license. Please connect to internet.".to_string())?;
    let entries: Vec<OnlineLicenseEntry> = resp.json().await.map_err(|_| "Invalid license server response.".to_string())?;

    if !entries.iter().any(|e| e.machine_id == machine_id) {
        return Err("This machine is not authorized. Please ask developer to add your ID.".to_string());
    }

    // 2. Validate Key
    let upper_key = key.trim().to_uppercase();
    
    let expected_current = generate_key_for_machine(&machine_id, 0);
    let expected_prev = generate_key_for_machine(&machine_id, -1);
    let expected_next = generate_key_for_machine(&machine_id, 1);

    if upper_key != expected_current && upper_key != expected_prev && upper_key != expected_next {
        return Err("Invalid license key.".to_string());
    }

    // 3. Prevent reuse
    {
        let conn = db.lock();
        let current_db_key: Option<String> = conn.query_row(
            "SELECT license_key FROM app_license WHERE id = 1",
            [],
            |row| row.get(0)
        ).ok();

        if let Some(db_key) = current_db_key {
            if db_key == upper_key {
                return Err("This license key has already been used.".to_string());
            }
        }
    }

    // 4. Activate
    let expiry = chrono::Utc::now() + chrono::Duration::days(DEFAULT_LICENSE_DAYS);
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
            params![upper_key, machine_id, expiry_str],
        ).map_err(|e: rusqlite::Error| e.to_string())?;
    }

    let days_remaining = calc_days_remaining(&expiry_str);

    Ok(LicenseInfo {
        license_key: upper_key,
        machine_id,
        activated_at: chrono::Utc::now().to_rfc3339(),
        expiry_date: Some(expiry_str),
        status: "active".to_string(),
        days_remaining: Some(days_remaining),
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
         ⚠️  LICENSE IS VALID FOR 30 DAYS ONLY\n\
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
