use super::types::*;
use chrono::Local;
use sha2::{Digest, Sha256};
use std::collections::BTreeMap;

const SANDBOX_URL: &str = "https://sandbox.jazzcash.com.pk/ApplicationAPI/API/2.0/Purchase/DoMWalletTransaction";
const PRODUCTION_URL: &str = "https://payments.jazzcash.com.pk/ApplicationAPI/API/2.0/Purchase/DoMWalletTransaction";

fn generate_hash(params: &BTreeMap<String, String>, salt: &str) -> String {
    let mut input = salt.to_string();
    for (_k, v) in params {
        if !v.is_empty() { input.push('&'); input.push_str(v); }
    }
    let mut h = Sha256::new();
    h.update(input.as_bytes());
    format!("{:x}", h.finalize())
}

fn normalize_phone(phone: &str) -> String {
    let d: String = phone.chars().filter(|c| c.is_ascii_digit()).collect();
    if d.starts_with("92") && d.len() >= 12 { format!("0{}", &d[2..]) }
    else if d.starts_with("0") { d }
    else if d.len() == 10 { format!("0{}", d) }
    else { d }
}

pub async fn initiate_payment(
    creds: &GatewayCredentials, amount: f64, customer_phone: &str,
    invoice_number: &str, description: &str,
) -> Result<PaymentResponse, String> {
    let url = if creds.sandbox { SANDBOX_URL } else { PRODUCTION_URL };
    let salt = creds.integrity_salt.as_deref().unwrap_or("");
    let now = Local::now();
    let txn_ref = format!("T{}", now.format("%Y%m%d%H%M%S%3f"));
    let txn_date = now.format("%Y%m%d%H%M%S").to_string();
    let expiry = (now + chrono::Duration::minutes(10)).format("%Y%m%d%H%M%S").to_string();
    let amt = format!("{:.0}", amount * 100.0);
    let phone = normalize_phone(customer_phone);

    let mut p = BTreeMap::<String, String>::new();
    p.insert("pp_Language".into(), "EN".into());
    p.insert("pp_MerchantID".into(), creds.merchant_id.clone());
    p.insert("pp_Password".into(), creds.password.clone());
    p.insert("pp_TxnRefNo".into(), txn_ref.clone());
    p.insert("pp_Amount".into(), amt);
    p.insert("pp_TxnDateTime".into(), txn_date);
    p.insert("pp_TxnExpiryDateTime".into(), expiry);
    p.insert("pp_BillReference".into(), invoice_number.into());
    p.insert("pp_Description".into(), description.into());
    p.insert("pp_TxnCurrency".into(), "PKR".into());
    p.insert("pp_MobileNumber".into(), phone);
    p.insert("pp_CNIC".into(), "".into());
    let hash = generate_hash(&p, salt);
    p.insert("pp_SecureHash".into(), hash);

    let client = reqwest::Client::new();
    let resp = client.post(url).json(&p).timeout(std::time::Duration::from_secs(30))
        .send().await.map_err(|e| format!("JazzCash API failed: {}", e))?;
    let body = resp.text().await.map_err(|e| format!("Read failed: {}", e))?;
    let j: serde_json::Value = serde_json::from_str(&body).unwrap_or(serde_json::json!({"raw": body}));

    let code = j.get("pp_ResponseCode").and_then(|v| v.as_str()).unwrap_or("");
    let msg = j.get("pp_ResponseMessage").and_then(|v| v.as_str()).unwrap_or("Unknown");
    let gw_ref = j.get("pp_RetreivalReferenceNo").and_then(|v| v.as_str()).map(String::from);

    let status = match code {
        "000" | "124" => TransactionStatus::Success,
        "157" => TransactionStatus::Pending,
        _ => TransactionStatus::Failed,
    };

    Ok(PaymentResponse {
        gateway: PaymentGateway::JazzCash, transaction_id: txn_ref,
        gateway_ref: gw_ref, status, amount, message: msg.into(),
        qr_code_data: None, raw_response: Some(body),
    })
}

pub async fn process_refund(
    creds: &GatewayCredentials, original_ref: &str, amount: f64,
) -> Result<PaymentResponse, String> {
    let url = if creds.sandbox {
        "https://sandbox.jazzcash.com.pk/ApplicationAPI/API/2.0/Purchase/DoMWalletTransactionRefund"
    } else {
        "https://payments.jazzcash.com.pk/ApplicationAPI/API/2.0/Purchase/DoMWalletTransactionRefund"
    };
    let salt = creds.integrity_salt.as_deref().unwrap_or("");
    let now = Local::now();
    let txn_ref = format!("R{}", now.format("%Y%m%d%H%M%S%3f"));

    let mut p = BTreeMap::<String, String>::new();
    p.insert("pp_MerchantID".into(), creds.merchant_id.clone());
    p.insert("pp_Password".into(), creds.password.clone());
    p.insert("pp_TxnRefNo".into(), txn_ref.clone());
    p.insert("pp_TxnDateTime".into(), now.format("%Y%m%d%H%M%S").to_string());
    p.insert("pp_Amount".into(), format!("{:.0}", amount * 100.0));
    p.insert("pp_TxnCurrency".into(), "PKR".into());
    p.insert("pp_OriginalTxnRefNo".into(), original_ref.into());
    let hash = generate_hash(&p, salt);
    p.insert("pp_SecureHash".into(), hash);

    let client = reqwest::Client::new();
    let resp = client.post(url).json(&p).timeout(std::time::Duration::from_secs(30))
        .send().await.map_err(|e| format!("Refund failed: {}", e))?;
    let body = resp.text().await.map_err(|e| format!("Read failed: {}", e))?;
    let j: serde_json::Value = serde_json::from_str(&body).unwrap_or(serde_json::json!({}));
    let code = j.get("pp_ResponseCode").and_then(|v| v.as_str()).unwrap_or("");
    let msg = j.get("pp_ResponseMessage").and_then(|v| v.as_str()).unwrap_or("Unknown");
    let status = if code == "000" { TransactionStatus::Refunded } else { TransactionStatus::Failed };

    Ok(PaymentResponse {
        gateway: PaymentGateway::JazzCash, transaction_id: txn_ref,
        gateway_ref: None, status, amount, message: msg.into(),
        qr_code_data: None, raw_response: Some(body),
    })
}

pub async fn check_status(creds: &GatewayCredentials, txn_ref: &str) -> Result<PaymentResponse, String> {
    let url = if creds.sandbox {
        "https://sandbox.jazzcash.com.pk/ApplicationAPI/API/2.0/Purchase/DoMWalletTransactionStatus"
    } else {
        "https://payments.jazzcash.com.pk/ApplicationAPI/API/2.0/Purchase/DoMWalletTransactionStatus"
    };
    let mut p = BTreeMap::<String, String>::new();
    p.insert("pp_MerchantID".into(), creds.merchant_id.clone());
    p.insert("pp_Password".into(), creds.password.clone());
    p.insert("pp_TxnRefNo".into(), txn_ref.into());

    let client = reqwest::Client::new();
    let resp = client.post(url).json(&p).timeout(std::time::Duration::from_secs(15))
        .send().await.map_err(|e| format!("Status check failed: {}", e))?;
    let body = resp.text().await.map_err(|e| format!("Read failed: {}", e))?;
    let j: serde_json::Value = serde_json::from_str(&body).unwrap_or(serde_json::json!({}));
    let code = j.get("pp_ResponseCode").and_then(|v| v.as_str()).unwrap_or("");
    let msg = j.get("pp_ResponseMessage").and_then(|v| v.as_str()).unwrap_or("Unknown");

    let status = match code {
        "000" | "124" => TransactionStatus::Success,
        "157" => TransactionStatus::Pending,
        _ => TransactionStatus::Failed,
    };

    Ok(PaymentResponse {
        gateway: PaymentGateway::JazzCash, transaction_id: txn_ref.into(),
        gateway_ref: j.get("pp_RetreivalReferenceNo").and_then(|v| v.as_str()).map(String::from),
        status, amount: 0.0, message: msg.into(), qr_code_data: None, raw_response: Some(body),
    })
}
