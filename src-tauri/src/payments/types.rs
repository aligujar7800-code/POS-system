use serde::{Deserialize, Serialize};

/// Which gateway processed the payment
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum PaymentGateway {
    JazzCash,
    EasyPaisa,
    HblPay,
    Stripe,
}

impl PaymentGateway {
    pub fn as_str(&self) -> &'static str {
        match self {
            PaymentGateway::JazzCash => "jazzcash",
            PaymentGateway::EasyPaisa => "easypaisa",
            PaymentGateway::HblPay => "hbl_pay",
            PaymentGateway::Stripe => "stripe",
        }
    }

    pub fn from_str(s: &str) -> Option<Self> {
        match s {
            "jazzcash" => Some(PaymentGateway::JazzCash),
            "easypaisa" => Some(PaymentGateway::EasyPaisa),
            "hbl_pay" => Some(PaymentGateway::HblPay),
            "stripe" => Some(PaymentGateway::Stripe),
            _ => None,
        }
    }

    pub fn display_name(&self) -> &'static str {
        match self {
            PaymentGateway::JazzCash => "JazzCash",
            PaymentGateway::EasyPaisa => "EasyPaisa",
            PaymentGateway::HblPay => "HBL Pay",
            PaymentGateway::Stripe => "Stripe",
        }
    }
}

/// Transaction lifecycle status
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum TransactionStatus {
    Pending,
    Success,
    Failed,
    Refunded,
    Queued,   // offline queue
    Expired,
}

impl TransactionStatus {
    pub fn as_str(&self) -> &'static str {
        match self {
            TransactionStatus::Pending => "pending",
            TransactionStatus::Success => "success",
            TransactionStatus::Failed => "failed",
            TransactionStatus::Refunded => "refunded",
            TransactionStatus::Queued => "queued",
            TransactionStatus::Expired => "expired",
        }
    }
}

/// Request to initiate a payment through any gateway
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PaymentRequest {
    pub gateway: PaymentGateway,
    pub amount: f64,
    pub customer_phone: Option<String>,
    pub invoice_number: String,
    pub description: Option<String>,
}

/// Standard response from any gateway
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PaymentResponse {
    pub gateway: PaymentGateway,
    pub transaction_id: String,         // our internal ID
    pub gateway_ref: Option<String>,    // gateway's reference
    pub status: TransactionStatus,
    pub amount: f64,
    pub message: String,
    pub qr_code_data: Option<String>,   // for HBL QR
    pub raw_response: Option<String>,   // raw JSON from gateway
}

/// Refund request
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RefundRequest {
    pub transaction_id: String,
    pub gateway: PaymentGateway,
    pub amount: f64,
    pub reason: Option<String>,
}

/// Credentials for a gateway (stored encrypted)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GatewayCredentials {
    pub gateway: String,
    pub merchant_id: String,
    pub password: String,
    pub integrity_salt: Option<String>,  // JazzCash
    pub api_key: Option<String>,         // EasyPaisa/Stripe
    pub api_secret: Option<String>,      // Stripe
    pub sandbox: bool,
}

/// Transaction record stored in DB
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PaymentTransaction {
    pub id: i64,
    pub sale_id: Option<i64>,
    pub gateway: String,
    pub gateway_ref: Option<String>,
    pub transaction_type: String,  // "payment" or "refund"
    pub amount: f64,
    pub status: String,
    pub customer_phone: Option<String>,
    pub request_payload: Option<String>,
    pub response_payload: Option<String>,
    pub error_message: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

/// Queued transaction for offline retry
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct QueuedPayment {
    pub id: i64,
    pub gateway: String,
    pub payload: String,
    pub retry_count: i64,
    pub last_error: Option<String>,
    pub status: String,
    pub created_at: String,
}
