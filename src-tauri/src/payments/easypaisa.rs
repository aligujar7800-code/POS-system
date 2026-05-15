use super::types::*;
use chrono::Local;

const SANDBOX_URL: &str = "https://easypay.easypaisa.com.pk/easypay-service/rest/v4/initiate-ma-transaction";
const PRODUCTION_URL: &str = "https://easypay.easypaisa.com.pk/easypay-service/rest/v4/initiate-ma-transaction";

fn normalize_phone(phone: &str) -> String {
    let d: String = phone.chars().filter(|c| c.is_ascii_digit()).collect();
    if d.starts_with("92") && d.len() >= 12 { format!("0{}", &d[2..]) }
    else if d.starts_with("0") { d }
    else if d.len() == 10 { format!("0{}", d) }
    else { d }
}

pub async fn initiate_payment(
    creds: &GatewayCredentials, amount: f64, customer_phone: &str,
    _invoice_number: &str, _description: &str,
) -> Result<PaymentResponse, String> {
    let url = if creds.sandbox { SANDBOX_URL } else { PRODUCTION_URL };
    let now = Local::now();
    let order_id = format!("EP{}", now.format("%Y%m%d%H%M%S%3f"));
    let phone = normalize_phone(customer_phone);

    let payload = serde_json::json!({
        "orderId": order_id,
        "storeId": creds.merchant_id,
        "transactionAmount": format!("{:.2}", amount),
        "transactionType": "MA",
        "mobileAccountNo": phone,
        "emailAddress": "",
        "tokenExpiry": (now + chrono::Duration::minutes(10)).format("%Y%m%d %H%M%S").to_string(),
    });

    let username = &creds.merchant_id;
    let password = &creds.password;

    let client = reqwest::Client::new();
    let resp = client.post(url)
        .basic_auth(username, Some(password))
        .json(&payload)
        .timeout(std::time::Duration::from_secs(30))
        .send().await
        .map_err(|e| format!("EasyPaisa API failed: {}", e))?;

    let body = resp.text().await.map_err(|e| format!("Read failed: {}", e))?;
    let j: serde_json::Value = serde_json::from_str(&body).unwrap_or(serde_json::json!({"raw": body}));

    let resp_code = j.get("responseCode").and_then(|v| v.as_str()).unwrap_or("");
    let resp_desc = j.get("responseDesc").and_then(|v| v.as_str())
        .or_else(|| j.get("responseMessage").and_then(|v| v.as_str()))
        .unwrap_or("Unknown response");
    let token = j.get("token").and_then(|v| v.as_str()).map(String::from);

    let status = match resp_code {
        "0000" => TransactionStatus::Success,
        "0001" => TransactionStatus::Pending,
        _ => TransactionStatus::Failed,
    };

    Ok(PaymentResponse {
        gateway: PaymentGateway::EasyPaisa, transaction_id: order_id,
        gateway_ref: token, status, amount, message: resp_desc.into(),
        qr_code_data: None, raw_response: Some(body),
    })
}

pub async fn check_status(
    creds: &GatewayCredentials, order_id: &str,
) -> Result<PaymentResponse, String> {
    let url = if creds.sandbox {
        "https://easypay.easypaisa.com.pk/easypay-service/rest/v4/inquire-transaction"
    } else {
        "https://easypay.easypaisa.com.pk/easypay-service/rest/v4/inquire-transaction"
    };

    let payload = serde_json::json!({
        "orderId": order_id,
        "storeId": creds.merchant_id,
        "accountNum": creds.merchant_id,
    });

    let client = reqwest::Client::new();
    let resp = client.post(url)
        .basic_auth(&creds.merchant_id, Some(&creds.password))
        .json(&payload)
        .timeout(std::time::Duration::from_secs(15))
        .send().await
        .map_err(|e| format!("Status check failed: {}", e))?;

    let body = resp.text().await.map_err(|e| format!("Read failed: {}", e))?;
    let j: serde_json::Value = serde_json::from_str(&body).unwrap_or(serde_json::json!({}));
    let code = j.get("responseCode").and_then(|v| v.as_str()).unwrap_or("");
    let msg = j.get("responseDesc").and_then(|v| v.as_str()).unwrap_or("Unknown");
    let txn_status = j.get("transactionStatus").and_then(|v| v.as_str()).unwrap_or("");

    let status = match txn_status {
        "PAID" | "SUCCESS" => TransactionStatus::Success,
        "PENDING" => TransactionStatus::Pending,
        _ => if code == "0000" { TransactionStatus::Success } else { TransactionStatus::Failed },
    };

    Ok(PaymentResponse {
        gateway: PaymentGateway::EasyPaisa, transaction_id: order_id.into(),
        gateway_ref: j.get("transactionId").and_then(|v| v.as_str()).map(String::from),
        status, amount: 0.0, message: msg.into(), qr_code_data: None, raw_response: Some(body),
    })
}

pub async fn process_refund(
    creds: &GatewayCredentials, original_order_id: &str, amount: f64,
) -> Result<PaymentResponse, String> {
    let url = if creds.sandbox {
        "https://easypay.easypaisa.com.pk/easypay-service/rest/v4/reverse-ma-transaction"
    } else {
        "https://easypay.easypaisa.com.pk/easypay-service/rest/v4/reverse-ma-transaction"
    };

    let payload = serde_json::json!({
        "orderId": original_order_id,
        "storeId": creds.merchant_id,
        "transactionAmount": format!("{:.2}", amount),
    });

    let client = reqwest::Client::new();
    let resp = client.post(url)
        .basic_auth(&creds.merchant_id, Some(&creds.password))
        .json(&payload)
        .timeout(std::time::Duration::from_secs(30))
        .send().await
        .map_err(|e| format!("Refund failed: {}", e))?;

    let body = resp.text().await.map_err(|e| format!("Read failed: {}", e))?;
    let j: serde_json::Value = serde_json::from_str(&body).unwrap_or(serde_json::json!({}));
    let code = j.get("responseCode").and_then(|v| v.as_str()).unwrap_or("");
    let msg = j.get("responseDesc").and_then(|v| v.as_str()).unwrap_or("Unknown");
    let status = if code == "0000" { TransactionStatus::Refunded } else { TransactionStatus::Failed };

    Ok(PaymentResponse {
        gateway: PaymentGateway::EasyPaisa,
        transaction_id: format!("REF-{}", original_order_id),
        gateway_ref: None, status, amount, message: msg.into(),
        qr_code_data: None, raw_response: Some(body),
    })
}
