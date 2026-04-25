use reqwest::header::{HeaderMap, HeaderValue, CONTENT_TYPE};
use serde::{Deserialize, Serialize};
use serde_json::Value;

const API_VERSION: &str = "2024-01";

// ─── Shopify HTTP Client ─────────────────────────────────────────────────────

pub struct ShopifyClient {
    base_url: String,
    client: reqwest::Client,
}

impl ShopifyClient {
    pub fn new(store_domain: &str, access_token: &str) -> Result<Self, String> {
        let domain = store_domain
            .trim()
            .trim_end_matches('/')
            .replace("https://", "")
            .replace("http://", "");

        let mut headers = HeaderMap::new();
        headers.insert(
            "X-Shopify-Access-Token",
            HeaderValue::from_str(access_token).map_err(|e| format!("Invalid token: {}", e))?,
        );
        headers.insert(CONTENT_TYPE, HeaderValue::from_static("application/json"));

        let client = reqwest::Client::builder()
            .default_headers(headers)
            .timeout(std::time::Duration::from_secs(30))
            .build()
            .map_err(|e| format!("HTTP client error: {}", e))?;

        Ok(Self {
            base_url: format!("https://{}/admin/api/{}", domain, API_VERSION),
            client,
        })
    }

    // ─── Connection Test ─────────────────────────────────────────────────

    pub async fn test_connection(&self) -> Result<ShopInfo, String> {
        let url = format!("{}/shop.json", self.base_url);
        let resp = self.client.get(&url).send().await.map_err(|e| format!("Connection failed: {}", e))?;

        if !resp.status().is_success() {
            let status = resp.status();
            let body = resp.text().await.unwrap_or_default();
            return Err(format!("Shopify API error {}: {}", status, body));
        }

        let data: Value = resp.json().await.map_err(|e| format!("Parse error: {}", e))?;
        let shop = &data["shop"];

        Ok(ShopInfo {
            name: shop["name"].as_str().unwrap_or("").to_string(),
            domain: shop["domain"].as_str().unwrap_or("").to_string(),
            email: shop["email"].as_str().unwrap_or("").to_string(),
            plan: shop["plan_display_name"].as_str().unwrap_or("").to_string(),
            currency: shop["currency"].as_str().unwrap_or("").to_string(),
        })
    }

    // ─── Locations ───────────────────────────────────────────────────────

    pub async fn get_locations(&self) -> Result<Vec<ShopifyLocation>, String> {
        let url = format!("{}/locations.json", self.base_url);
        let resp = self.client.get(&url).send().await.map_err(|e| format!("Request failed: {}", e))?;

        if !resp.status().is_success() {
            let status = resp.status();
            let body = resp.text().await.unwrap_or_default();
            return Err(format!("Shopify API error {}: {}", status, body));
        }

        let data: Value = resp.json().await.map_err(|e| format!("Parse error: {}", e))?;
        let locations = data["locations"]
            .as_array()
            .ok_or("No locations array")?
            .iter()
            .map(|loc| ShopifyLocation {
                id: loc["id"].as_i64().unwrap_or(0),
                name: loc["name"].as_str().unwrap_or("").to_string(),
                active: loc["active"].as_bool().unwrap_or(false),
            })
            .collect();

        Ok(locations)
    }

    // ─── Products ────────────────────────────────────────────────────────

    pub async fn create_product(&self, product: &CreateShopifyProduct) -> Result<ShopifyProductResponse, String> {
        let url = format!("{}/products.json", self.base_url);
        let body = serde_json::json!({ "product": product });

        let resp = self.client.post(&url)
            .json(&body)
            .send()
            .await
            .map_err(|e| format!("Request failed: {}", e))?;

        if !resp.status().is_success() {
            let status = resp.status();
            let body = resp.text().await.unwrap_or_default();
            return Err(format!("Shopify create product error {}: {}", status, body));
        }

        let data: Value = resp.json().await.map_err(|e| format!("Parse error: {}", e))?;
        parse_product_response(&data["product"])
    }

    pub async fn update_product(&self, shopify_product_id: i64, product: &UpdateShopifyProduct) -> Result<ShopifyProductResponse, String> {
        let url = format!("{}/products/{}.json", self.base_url, shopify_product_id);
        let body = serde_json::json!({ "product": product });

        let resp = self.client.put(&url)
            .json(&body)
            .send()
            .await
            .map_err(|e| format!("Request failed: {}", e))?;

        if !resp.status().is_success() {
            let status = resp.status();
            let body = resp.text().await.unwrap_or_default();
            return Err(format!("Shopify update product error {}: {}", status, body));
        }

        let data: Value = resp.json().await.map_err(|e| format!("Parse error: {}", e))?;
        parse_product_response(&data["product"])
    }

    // ─── Inventory ───────────────────────────────────────────────────────

    pub async fn set_inventory_level(&self, inventory_item_id: i64, location_id: i64, available: i64) -> Result<(), String> {
        let url = format!("{}/inventory_levels/set.json", self.base_url);
        let body = serde_json::json!({
            "location_id": location_id,
            "inventory_item_id": inventory_item_id,
            "available": available,
        });

        let resp = self.client.post(&url)
            .json(&body)
            .send()
            .await
            .map_err(|e| format!("Request failed: {}", e))?;

        if !resp.status().is_success() {
            let status = resp.status();
            let body = resp.text().await.unwrap_or_default();
            return Err(format!("Shopify set inventory error {}: {}", status, body));
        }

        Ok(())
    }

    // ─── Orders ──────────────────────────────────────────────────────────

    pub async fn create_order(&self, order: &CreateShopifyOrder) -> Result<ShopifyOrderResponse, String> {
        let url = format!("{}/orders.json", self.base_url);
        let body = serde_json::json!({ "order": order });

        let resp = self.client.post(&url)
            .json(&body)
            .send()
            .await
            .map_err(|e| format!("Request failed: {}", e))?;

        if !resp.status().is_success() {
            let status = resp.status();
            let body = resp.text().await.unwrap_or_default();
            return Err(format!("Shopify create order error {}: {}", status, body));
        }

        let data: Value = resp.json().await.map_err(|e| format!("Parse error: {}", e))?;
        let order_data = &data["order"];

        Ok(ShopifyOrderResponse {
            id: order_data["id"].as_i64().unwrap_or(0),
            order_number: order_data["order_number"].as_i64().unwrap_or(0),
            name: order_data["name"].as_str().unwrap_or("").to_string(),
        })
    }
}

// ─── Data Types ──────────────────────────────────────────────────────────────

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct ShopInfo {
    pub name: String,
    pub domain: String,
    pub email: String,
    pub plan: String,
    pub currency: String,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct ShopifyLocation {
    pub id: i64,
    pub name: String,
    pub active: bool,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct CreateShopifyProduct {
    pub title: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub body_html: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub vendor: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub product_type: Option<String>,
    pub variants: Vec<ShopifyVariant>,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct UpdateShopifyProduct {
    pub id: i64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub title: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub body_html: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub variants: Option<Vec<ShopifyVariant>>,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct ShopifyVariant {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub id: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub title: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub price: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub sku: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub barcode: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub option1: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub option2: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub inventory_management: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub inventory_quantity: Option<i64>,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct ShopifyProductResponse {
    pub id: i64,
    pub title: String,
    pub variants: Vec<ShopifyVariantResponse>,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct ShopifyVariantResponse {
    pub id: i64,
    pub title: String,
    pub inventory_item_id: i64,
    pub sku: Option<String>,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct CreateShopifyOrder {
    pub line_items: Vec<ShopifyLineItem>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub financial_status: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub note: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tags: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub transactions: Option<Vec<ShopifyTransaction>>,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct ShopifyLineItem {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub variant_id: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub title: Option<String>,
    pub quantity: i64,
    pub price: String,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct ShopifyTransaction {
    pub kind: String,
    pub status: String,
    pub amount: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub gateway: Option<String>,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct ShopifyOrderResponse {
    pub id: i64,
    pub order_number: i64,
    pub name: String,
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

fn parse_product_response(product: &Value) -> Result<ShopifyProductResponse, String> {
    let variants = product["variants"]
        .as_array()
        .ok_or("No variants array in response")?
        .iter()
        .map(|v| ShopifyVariantResponse {
            id: v["id"].as_i64().unwrap_or(0),
            title: v["title"].as_str().unwrap_or("").to_string(),
            inventory_item_id: v["inventory_item_id"].as_i64().unwrap_or(0),
            sku: v["sku"].as_str().map(|s| s.to_string()),
        })
        .collect();

    Ok(ShopifyProductResponse {
        id: product["id"].as_i64().unwrap_or(0),
        title: product["title"].as_str().unwrap_or("").to_string(),
        variants,
    })
}
