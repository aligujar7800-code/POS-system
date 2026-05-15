use super::types::*;
use chrono::Local;

const SANDBOX_URL: &str = "https://sandbox.hbl.com/api/v1/merchant/qr/generate";
const PRODUCTION_URL: &str = "https://api.hbl.com/api/v1/merchant/qr/generate";

/// Generate QR code for HBL Pay
pub async fn generate_qr(
    creds: &GatewayCredentials, amount: f64, invoice_number: &str,
) -> Result<PaymentResponse, String> {
    let url = if creds.sandbox { SANDBOX_URL } else { PRODUCTION_URL };
    let now = Local::now();
    let txn_ref = format!("HBL{}", now.format("%Y%m%d%H%M%S%3f"));

    let payload = serde_json::json!({
        "merchantId": creds.merchant_id,
        "amount": format!("{:.2}", amount),
        "currency": "PKR",
        "transactionReference": txn_ref,
        "invoiceNumber": invoice_number,
        "expiryMinutes": 10,
    });

    let api_key = creds.api_key.as_deref().unwrap_or("");
    let client = reqwest::Client::new();
    let resp = client.post(url)
        .header("Authorization", format!("Bearer {}", api_key))
        .header("Content-Type", "application/json")
        .json(&payload)
        .timeout(std::time::Duration::from_secs(30))
        .send().await
        .map_err(|e| format!("HBL API failed: {}", e))?;

    let body = resp.text().await.map_err(|e| format!("Read failed: {}", e))?;
    let j: serde_json::Value = serde_json::from_str(&body).unwrap_or(serde_json::json!({"raw": body}));

    let success = j.get("success").and_then(|v| v.as_bool()).unwrap_or(false);
    let msg = j.get("message").and_then(|v| v.as_str()).unwrap_or("Unknown");
    let qr_data = j.get("qrCodeData")
        .or_else(|| j.get("qrString"))
        .and_then(|v| v.as_str()).map(String::from);

    let status = if success { TransactionStatus::Pending } else { TransactionStatus::Failed };

    Ok(PaymentResponse {
        gateway: PaymentGateway::HblPay, transaction_id: txn_ref,
        gateway_ref: j.get("transactionId").and_then(|v| v.as_str()).map(String::from),
        status, amount, message: msg.into(), qr_code_data: qr_data,
        raw_response: Some(body),
    })
}

/// Check payment status for HBL QR transaction
pub async fn check_status(
    creds: &GatewayCredentials, txn_ref: &str,
) -> Result<PaymentResponse, String> {
    let url = if creds.sandbox {
        "https://sandbox.hbl.com/api/v1/merchant/transaction/status"
    } else {
        "https://api.hbl.com/api/v1/merchant/transaction/status"
    };

    let api_key = creds.api_key.as_deref().unwrap_or("");
    let payload = serde_json::json!({
        "merchantId": creds.merchant_id,
        "transactionReference": txn_ref,
    });

    let client = reqwest::Client::new();
    let resp = client.post(url)
        .header("Authorization", format!("Bearer {}", api_key))
        .json(&payload)
        .timeout(std::time::Duration::from_secs(15))
        .send().await
        .map_err(|e| format!("Status check failed: {}", e))?;

    let body = resp.text().await.map_err(|e| format!("Read failed: {}", e))?;
    let j: serde_json::Value = serde_json::from_str(&body).unwrap_or(serde_json::json!({}));
    let txn_status = j.get("transactionStatus").and_then(|v| v.as_str()).unwrap_or("");
    let msg = j.get("message").and_then(|v| v.as_str()).unwrap_or("Unknown");

    let status = match txn_status {
        "COMPLETED" | "SUCCESS" | "PAID" => TransactionStatus::Success,
        "PENDING" | "INITIATED" => TransactionStatus::Pending,
        "EXPIRED" => TransactionStatus::Expired,
        _ => TransactionStatus::Failed,
    };

    Ok(PaymentResponse {
        gateway: PaymentGateway::HblPay, transaction_id: txn_ref.into(),
        gateway_ref: j.get("rrn").and_then(|v| v.as_str()).map(String::from),
        status, amount: 0.0, message: msg.into(), qr_code_data: None,
        raw_response: Some(body),
    })
}

pub async fn process_refund(
    creds: &GatewayCredentials, txn_ref: &str, amount: f64,
) -> Result<PaymentResponse, String> {
    let url = if creds.sandbox {
        "https://sandbox.hbl.com/api/v1/merchant/transaction/refund"
    } else {
        "https://api.hbl.com/api/v1/merchant/transaction/refund"
    };

    let api_key = creds.api_key.as_deref().unwrap_or("");
    let payload = serde_json::json!({
        "merchantId": creds.merchant_id,
        "originalTransactionReference": txn_ref,
        "refundAmount": format!("{:.2}", amount),
        "currency": "PKR",
    });

    let client = reqwest::Client::new();
    let resp = client.post(url)
        .header("Authorization", format!("Bearer {}", api_key))
        .json(&payload)
        .timeout(std::time::Duration::from_secs(30))
        .send().await
        .map_err(|e| format!("Refund failed: {}", e))?;

    let body = resp.text().await.map_err(|e| format!("Read failed: {}", e))?;
    let j: serde_json::Value = serde_json::from_str(&body).unwrap_or(serde_json::json!({}));
    let success = j.get("success").and_then(|v| v.as_bool()).unwrap_or(false);
    let msg = j.get("message").and_then(|v| v.as_str()).unwrap_or("Unknown");
    let status = if success { TransactionStatus::Refunded } else { TransactionStatus::Failed };

    Ok(PaymentResponse {
        gateway: PaymentGateway::HblPay,
        transaction_id: format!("REF-{}", txn_ref),
        gateway_ref: None, status, amount, message: msg.into(),
        qr_code_data: None, raw_response: Some(body),
    })
}
