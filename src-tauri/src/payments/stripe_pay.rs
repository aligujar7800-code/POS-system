use super::types::*;
use chrono::Local;

/// Stripe Payment Intent (card payments) — optional for Pakistan
pub async fn create_payment_intent(
    creds: &GatewayCredentials, amount: f64, invoice_number: &str,
) -> Result<PaymentResponse, String> {
    let api_secret = creds.api_secret.as_deref()
        .ok_or("Stripe API secret not configured")?;

    let amount_cents = (amount * 100.0) as i64;
    let txn_ref = format!("STR{}", Local::now().format("%Y%m%d%H%M%S%3f"));

    let client = reqwest::Client::new();
    let resp = client
        .post("https://api.stripe.com/v1/payment_intents")
        .basic_auth(api_secret, None::<&str>)
        .form(&[
            ("amount", amount_cents.to_string()),
            ("currency", "pkr".into()),
            ("payment_method_types[]", "card".into()),
            ("metadata[invoice]", invoice_number.into()),
            ("metadata[pos_ref]", txn_ref.clone()),
        ])
        .timeout(std::time::Duration::from_secs(30))
        .send().await
        .map_err(|e| format!("Stripe API failed: {}", e))?;

    let body = resp.text().await.map_err(|e| format!("Read failed: {}", e))?;
    let j: serde_json::Value = serde_json::from_str(&body).unwrap_or(serde_json::json!({}));

    let pi_id = j.get("id").and_then(|v| v.as_str()).map(String::from);
    let client_secret = j.get("client_secret").and_then(|v| v.as_str()).map(String::from);
    let pi_status = j.get("status").and_then(|v| v.as_str()).unwrap_or("");
    let error = j.get("error").and_then(|e| e.get("message")).and_then(|v| v.as_str());

    if let Some(err) = error {
        return Ok(PaymentResponse {
            gateway: PaymentGateway::Stripe, transaction_id: txn_ref,
            gateway_ref: None, status: TransactionStatus::Failed,
            amount, message: err.into(), qr_code_data: None,
            raw_response: Some(body),
        });
    }

    let status = match pi_status {
        "succeeded" => TransactionStatus::Success,
        "requires_payment_method" | "requires_confirmation" | "requires_action" => TransactionStatus::Pending,
        _ => TransactionStatus::Pending,
    };

    Ok(PaymentResponse {
        gateway: PaymentGateway::Stripe, transaction_id: txn_ref,
        gateway_ref: pi_id,
        status, amount, message: format!("Payment intent created: {}", pi_status),
        qr_code_data: client_secret, // frontend uses this for Stripe.js confirmation
        raw_response: Some(body),
    })
}

pub async fn process_refund(
    creds: &GatewayCredentials, payment_intent_id: &str, amount: f64,
) -> Result<PaymentResponse, String> {
    let api_secret = creds.api_secret.as_deref()
        .ok_or("Stripe API secret not configured")?;

    let amount_cents = (amount * 100.0) as i64;

    let client = reqwest::Client::new();
    let resp = client
        .post("https://api.stripe.com/v1/refunds")
        .basic_auth(api_secret, None::<&str>)
        .form(&[
            ("payment_intent", payment_intent_id),
            ("amount", &amount_cents.to_string()),
        ])
        .timeout(std::time::Duration::from_secs(30))
        .send().await
        .map_err(|e| format!("Stripe refund failed: {}", e))?;

    let body = resp.text().await.map_err(|e| format!("Read failed: {}", e))?;
    let j: serde_json::Value = serde_json::from_str(&body).unwrap_or(serde_json::json!({}));
    let refund_status = j.get("status").and_then(|v| v.as_str()).unwrap_or("");
    let error = j.get("error").and_then(|e| e.get("message")).and_then(|v| v.as_str());

    if let Some(err) = error {
        return Ok(PaymentResponse {
            gateway: PaymentGateway::Stripe,
            transaction_id: format!("REF-{}", payment_intent_id),
            gateway_ref: None, status: TransactionStatus::Failed,
            amount, message: err.into(), qr_code_data: None,
            raw_response: Some(body),
        });
    }

    let status = if refund_status == "succeeded" { TransactionStatus::Refunded } else { TransactionStatus::Failed };

    Ok(PaymentResponse {
        gateway: PaymentGateway::Stripe,
        transaction_id: format!("REF-{}", payment_intent_id),
        gateway_ref: j.get("id").and_then(|v| v.as_str()).map(String::from),
        status, amount, message: format!("Refund {}", refund_status),
        qr_code_data: None, raw_response: Some(body),
    })
}
