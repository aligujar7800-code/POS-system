use crate::db::{migrations, queries::*};
use crate::hardware::{detection, label, printer};
use crate::cloud_backup;
use parking_lot::Mutex;
use rusqlite::Connection;
use serde_json::Value;
use std::collections::HashMap;
use std::sync::Arc;
use tauri::{Manager, State};

pub type DbState = Arc<Mutex<Connection>>;

// ─── License ─────────────────────────────────────────────────────────────────

#[tauri::command]
pub async fn check_online_activation(db: State<'_, DbState>) -> Result<Option<license::LicenseInfo>, String> {
    license::check_online_activation(db).await
}

#[tauri::command]
pub fn get_license_status(db: State<'_, DbState>) -> Result<Option<license::LicenseInfo>, String> {
    let conn = db.lock();
    license::get_license_status(&conn).map_err(|e: rusqlite::Error| e.to_string())
}

#[tauri::command]
pub async fn activate_license(db: State<'_, DbState>, key: String) -> Result<license::LicenseInfo, String> {
    license::activate_license(db, &key).await
}

#[tauri::command]
pub fn get_machine_id() -> Result<String, String> {
    license::get_machine_fingerprint()
}

#[tauri::command]
pub fn request_license(
    customer_name: String,
    customer_phone: String,
    machine_id: String,
) -> Result<(), String> {
    license::send_license_request(&customer_name, &customer_phone, &machine_id)
}

// ─── Auth ────────────────────────────────────────────────────────────────────

#[tauri::command]
pub fn authenticate_user(
    db: State<DbState>,
    username: String,
    password: String,
) -> Result<users::User, String> {
    let conn = db.lock();
    users::authenticate(&conn, &username, &password)
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "Invalid credentials".to_string())
}

#[tauri::command]
pub fn verify_admin_password(
    db: State<DbState>,
    username: String,
    password: String,
) -> Result<bool, String> {
    let conn = db.lock();
    let user = users::authenticate(&conn, &username, &password).map_err(|e| e.to_string())?;
    match user {
        Some(u) => Ok(u.role == "admin"),
        None => Ok(false)
    }
}

#[tauri::command]
pub fn get_all_users(db: State<DbState>) -> Result<Vec<users::User>, String> {
    let conn = db.lock();
    users::get_all_users(&conn).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn create_user(
    db: State<DbState>,
    payload: users::CreateUserPayload,
) -> Result<i64, String> {
    let conn = db.lock();
    users::create_user(&conn, &payload).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn update_user_status(
    db: State<DbState>,
    user_id: i64,
    is_active: bool,
) -> Result<(), String> {
    let conn = db.lock();
    users::update_user_status(&conn, user_id, is_active).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn change_password(
    db: State<DbState>,
    user_id: i64,
    new_password: String,
) -> Result<(), String> {
    let conn = db.lock();
    users::change_password(&conn, user_id, &new_password).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn delete_user(db: State<DbState>, user_id: i64) -> Result<(), String> {
    let conn = db.lock();
    users::delete_user(&conn, user_id).map_err(|e| e.to_string())
}

// ─── Products ────────────────────────────────────────────────────────────────

#[tauri::command]
pub fn search_products(db: State<DbState>, query: String) -> Result<Vec<products::Product>, String> {
    let conn = db.lock();
    products::search_products(&conn, &query).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_all_products(db: State<DbState>) -> Result<Vec<products::Product>, String> {
    let conn = db.lock();
    products::get_all_products(&conn).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_product_by_barcode(
    db: State<DbState>,
    barcode: String,
) -> Result<Option<products::Product>, String> {
    let conn = db.lock();
    products::get_product_by_barcode(&conn, &barcode).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_product_by_id(
    db: State<DbState>,
    id: i64,
) -> Result<Option<products::Product>, String> {
    let conn = db.lock();
    products::get_product_by_id(&conn, id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_product_variants(
    db: State<DbState>,
    product_id: i64,
) -> Result<Vec<products::ProductVariant>, String> {
    let conn = db.lock();
    products::get_product_variants(&conn, product_id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn create_product(
    db: State<DbState>,
    payload: products::CreateProductPayload,
    variants: Vec<products::VariantPayload>,
) -> Result<i64, String> {
    let conn = db.lock();
    products::create_product(&conn, &payload, &variants).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn create_bulk_products(
    db: State<DbState>,
    items: Vec<products::BulkProductItem>,
) -> Result<(), String> {
    let conn = db.lock();
    products::create_bulk_products(&conn, &items).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn delete_product(db: State<DbState>, id: i64) -> Result<(), String> {
    let conn = db.lock();
    products::delete_product(&conn, id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn clear_inward_history(db: State<DbState>) -> Result<(), String> {
    let conn = db.lock();
    products::clear_inward_history(&conn).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn update_product(
    db: State<DbState>,
    id: i64,
    payload: products::CreateProductPayload,
) -> Result<(), String> {
    let conn = db.lock();
    products::update_product(&conn, id, &payload).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn update_variant_stock(
    db: State<DbState>,
    variant_id: i64,
    new_qty: i64,
    reason: Option<String>,
    user_id: Option<i64>,
    supplier_id: Option<i64>,
    unit_cost: Option<f64>,
) -> Result<(), String> {
    let conn = db.lock();
    products::update_variant_stock(
        &conn, 
        variant_id, 
        new_qty, 
        reason.as_deref(), 
        user_id,
        supplier_id,
        unit_cost
    )
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_stock_ledger(
    db: State<DbState>,
    product_id: i64,
    date_from: Option<String>,
    date_to: Option<String>,
) -> Result<Vec<products::StockLedgerEntry>, String> {
    let conn = db.lock();
    products::get_stock_ledger(
        &conn,
        product_id,
        date_from.as_deref(),
        date_to.as_deref(),
    ).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_all_categories(db: State<DbState>) -> Result<Vec<products::Category>, String> {
    let conn = db.lock();
    products::get_all_categories(&conn).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn create_category(
    db: State<DbState>,
    name: String,
    parent_id: Option<i64>,
) -> Result<i64, String> {
    let conn = db.lock();
    products::create_category(&conn, &name, parent_id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_sub_categories(
    db: State<DbState>,
    parent_id: i64,
) -> Result<Vec<products::Category>, String> {
    let conn = db.lock();
    products::get_sub_categories(&conn, parent_id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_main_categories(db: State<DbState>) -> Result<Vec<products::Category>, String> {
    let conn = db.lock();
    products::get_main_categories(&conn).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn delete_category(
    db: State<DbState>,
    id: i64,
) -> Result<(), String> {
    let conn = db.lock();
    products::delete_category(&conn, id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn update_category(
    db: State<DbState>,
    id: i64,
    name: String,
) -> Result<(), String> {
    let conn = db.lock();
    products::update_category(&conn, id, &name).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn generate_article_number(db: State<DbState>) -> Result<String, String> {
    let conn = db.lock();
    products::generate_article_number(&conn).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn ensure_variant_barcodes(db: State<DbState>) -> Result<i64, String> {
    let conn = db.lock();
    products::ensure_variant_barcodes(&conn).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn create_inward_article(
    db: State<DbState>,
    payload: products::InwardArticlePayload,
) -> Result<(), String> {
    let mut conn = db.lock();
    products::create_inward_article(&mut conn, &payload).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn generate_ean13(db: State<DbState>, offset: Option<i64>) -> Result<String, String> {
    let conn = db.lock();
    products::generate_ean13(&conn, offset.unwrap_or(0)).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn add_inward_stock(
    db: State<DbState>,
    payload: products::InwardStockPayload,
) -> Result<(), String> {
    let mut conn = db.lock();
    products::add_inward_stock(&mut conn, &payload).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_low_stock_products(db: State<DbState>) -> Result<Vec<products::Product>, String> {
    let conn = db.lock();
    products::get_low_stock_products(&conn).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_inward_history(db: State<DbState>) -> Result<Vec<products::InwardHistoryEntry>, String> {
    let conn = db.lock();
    products::get_inward_history(&conn).map_err(|e| e.to_string())
}

// ─── Sales ───────────────────────────────────────────────────────────────────

#[tauri::command]
pub fn create_sale(
    db: State<DbState>,
    payload: sales::CreateSalePayload,
) -> Result<(i64, String), String> {
    let mut conn = db.lock();
    sales::create_sale(&mut *conn, &payload).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_sale_with_items(
    db: State<DbState>,
    id: i64,
) -> Result<(sales::Sale, Vec<sales::SaleItem>), String> {
    let conn = db.lock();
    sales::get_sale_with_items(&conn, id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_return_with_items(
    db: State<DbState>,
    id: i64,
) -> Result<(sales::SalesReturn, Vec<sales::SalesReturnItem>), String> {
    let conn = db.lock();
    sales::get_return_with_items(&conn, id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_sales_by_date(
    db: State<DbState>,
    from: String,
    to: String,
) -> Result<Vec<sales::Sale>, String> {
    let conn = db.lock();
    sales::get_sales_by_date(&conn, &from, &to).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn search_sales(
    db: State<DbState>,
    query: Option<String>,
    from: Option<String>,
    to: Option<String>,
) -> Result<Vec<sales::Sale>, String> {
    let conn = db.lock();
    sales::search_sales(&conn, query.as_deref(), from.as_deref(), to.as_deref()).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn process_sales_return(
    db: State<DbState>,
    payload: sales::ProcessReturnPayload,
) -> Result<(i64, String), String> {
    let mut conn = db.lock();
    sales::process_sales_return(&mut conn, &payload).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_todays_summary(db: State<DbState>) -> Result<Value, String> {
    let conn = db.lock();
    sales::get_todays_summary(&conn).map_err(|e| e.to_string())
}

// ─── Customers ───────────────────────────────────────────────────────────────

#[tauri::command]
pub fn search_customers(
    db: State<DbState>,
    query: String,
) -> Result<Vec<customers::Customer>, String> {
    let conn = db.lock();
    customers::search_customers(&conn, &query).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_all_customers(
    db: State<DbState>,
    sort_by: Option<String>,
) -> Result<Vec<customers::Customer>, String> {
    let conn = db.lock();
    customers::get_all_customers(&conn, sort_by.as_deref()).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn create_customer(
    db: State<DbState>,
    payload: customers::CreateCustomerPayload,
) -> Result<i64, String> {
    let conn = db.lock();
    customers::create_customer(&conn, &payload).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_customer_by_id(
    db: State<DbState>,
    id: i64,
) -> Result<customers::Customer, String> {
    let conn = db.lock();
    customers::get_customer_by_id(&conn, id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_total_udhaar(db: State<DbState>) -> Result<f64, String> {
    let conn = db.lock();
    customers::get_total_udhaar(&conn).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_top_defaulters(
    db: State<DbState>,
    limit: i64,
) -> Result<Vec<customers::Customer>, String> {
    let conn = db.lock();
    customers::get_top_defaulters(&conn, limit).map_err(|e| e.to_string())
}

// ─── Financial Ledger ────────────────────────────────────────────────────────
#[tauri::command]
pub fn get_financial_ledger(
    db: State<DbState>,
    from: Option<String>,
    to: Option<String>,
) -> Result<Vec<cashbook::CashBookEntry>, String> {
    let conn = db.lock();
    cashbook::get_financial_ledger(&conn, from.as_deref(), to.as_deref())
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn add_cashbook_entry(
    db: State<DbState>,
    payload: cashbook::CreateCashBookPayload,
) -> Result<i64, String> {
    let conn = db.lock();
    cashbook::add_cashbook_entry(&conn, &payload).map_err(|e| e.to_string())
}

// ─── Ledger ──────────────────────────────────────────────────────────────────
#[tauri::command]
pub fn get_customer_ledger(
    db: State<DbState>,
    customer_id: i64,
    from: Option<String>,
    to: Option<String>,
) -> Result<Vec<ledger::LedgerEntry>, String> {
    let conn = db.lock();
    ledger::get_customer_ledger(&conn, customer_id, from.as_deref(), to.as_deref())
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn record_payment(
    db: State<DbState>,
    payload: ledger::RecordPaymentPayload,
) -> Result<i64, String> {
    let mut conn = db.lock();
    ledger::record_payment(&mut *conn, &payload).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_customer_summary(
    db: State<DbState>,
    customer_id: i64,
) -> Result<Value, String> {
    let conn = db.lock();
    ledger::get_customer_summary(&conn, customer_id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_todays_collections(db: State<DbState>) -> Result<f64, String> {
    let conn = db.lock();
    ledger::get_todays_collections(&conn).map_err(|e| e.to_string())
}

// ─── Reports ─────────────────────────────────────────────────────────────────

#[tauri::command]
pub fn sales_report(
    db: State<DbState>,
    from: String,
    to: String,
    group_by: String,
) -> Result<Vec<reports::SalesReportRow>, String> {
    let conn = db.lock();
    reports::sales_report(&conn, &from, &to, &group_by).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn top_products(
    db: State<DbState>,
    from: String,
    to: String,
    limit: i64,
) -> Result<Vec<reports::TopProduct>, String> {
    let conn = db.lock();
    reports::top_products(&conn, &from, &to, limit).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn hourly_sales(db: State<DbState>, date: String) -> Result<Vec<reports::HourlyData>, String> {
    let conn = db.lock();
    reports::hourly_sales(&conn, &date).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn profit_loss(
    db: State<DbState>,
    from: String,
    to: String,
) -> Result<Value, String> {
    let conn = db.lock();
    reports::profit_loss(&conn, &from, &to).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn inventory_valuation(db: State<DbState>) -> Result<Value, String> {
    let conn = db.lock();
    reports::inventory_valuation(&conn).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn dead_stock(db: State<DbState>, days: i64) -> Result<Vec<Value>, String> {
    let conn = db.lock();
    reports::dead_stock(&conn, days).map_err(|e| e.to_string())
}

// ─── Settings ────────────────────────────────────────────────────────────────

#[tauri::command]
pub fn get_all_settings(db: State<DbState>) -> Result<HashMap<String, String>, String> {
    let conn = db.lock();
    settings::get_all_settings(&conn).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn set_setting(
    db: State<DbState>,
    key: String,
    value: String,
) -> Result<(), String> {
    let conn = db.lock();
    settings::set_setting(&conn, &key, &value).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn set_many_settings(
    db: State<DbState>,
    map: HashMap<String, String>,
) -> Result<(), String> {
    let conn = db.lock();
    settings::set_many_settings(&conn, &map).map_err(|e| e.to_string())
}

// ─── Hardware ────────────────────────────────────────────────────────────────

#[tauri::command]
pub fn detect_printers() -> Result<Vec<detection::PrinterInfo>, String> {
    Ok(detection::detect_all_printers())
}

#[tauri::command]
pub fn test_print(config: printer::PrinterConfig) -> Result<(), String> {
    printer::test_print(&config)
}

#[tauri::command]
pub fn print_receipt(
    data: printer::ReceiptData,
    config: printer::PrinterConfig,
) -> Result<(), String> {
    printer::print_receipt(&data, &config)
}

#[tauri::command]
pub fn print_label(
    data: label::LabelData,
    config: printer::PrinterConfig,
) -> Result<(), String> {
    label::print_label(&data, &config)
}

#[tauri::command]
pub fn print_label_batch(
    items: Vec<label::LabelBatchItem>,
    shop_name: String,
    config: printer::PrinterConfig,
) -> Result<(), String> {
    label::print_label_batch(&items, &shop_name, &config)
}

#[tauri::command]
pub fn test_label_print(
    config: printer::PrinterConfig,
    protocol: String,
) -> Result<(), String> {
    label::test_label_print(&config, &protocol)
}

#[tauri::command]
pub fn print_sale_by_id(
    db: State<DbState>,
    id: i64,
    config: printer::PrinterConfig,
) -> Result<(), String> {
    let conn = db.lock();
    let (sale, items) = sales::get_sale_with_items(&conn, id).map_err(|e| e.to_string())?;
    
    // Fetch settings for header
    let settings = settings::get_all_settings(&conn).unwrap_or_default();
    let shop_name = settings.get("shop_name").cloned().unwrap_or_else(|| "My Shop".to_string());
    let shop_address = settings.get("shop_address").cloned().unwrap_or_default();
    let shop_phone = settings.get("shop_phone").cloned().unwrap_or_default();
    let shop_email = settings.get("shop_email").cloned().unwrap_or_default();
    let receipt_header = settings.get("receipt_header").cloned().unwrap_or_default();
    let receipt_footer = settings.get("receipt_footer").cloned().unwrap_or_else(|| "Thank You!".to_string());

    let receipt_items = items.into_iter().map(|i| printer::ReceiptItem {
        name: i.product_name,
        qty: i.quantity,
        unit_price: i.unit_price,
        total: i.total_price,
    }).collect();

    let data = printer::ReceiptData {
        shop_name,
        shop_address,
        shop_phone,
        shop_email,
        header: receipt_header,
        invoice_number: sale.invoice_number,
        sale_date: sale.sale_date,
        customer_name: sale.customer_name,
        cashier: "Cashier".to_string(), // In future map created_by to username
        items: receipt_items,
        subtotal: sale.subtotal,
        discount: sale.discount_amount,
        tax: sale.tax_amount,
        total: sale.total_amount,
        paid: sale.paid_amount,
        change: sale.change_amount,
        payment_method: sale.payment_method,
        footer: receipt_footer,
    };

    printer::print_receipt(&data, &config)
}

#[tauri::command]
pub fn open_cash_drawer(config: printer::PrinterConfig) -> Result<(), String> {
    printer::open_cash_drawer(&config)
}

// ─── Backup ──────────────────────────────────────────────────────────────────

#[tauri::command]
pub fn backup_database(
    app: tauri::AppHandle,
    db: State<DbState>,
    dest_path: String,
) -> Result<(), String> {
    let conn = db.lock();
    // Flush WAL to main DB file
    conn.execute_batch("PRAGMA wal_checkpoint(FULL);")
        .map_err(|e: rusqlite::Error| e.to_string())?;
    drop(conn);

    let data_dir = app
        .path()
        .app_data_dir()
        .map_err(|e: tauri::Error| e.to_string())?;
    let src_path = data_dir.join("pos.db");
    
    std::fs::copy(&src_path, &dest_path).map_err(|e| format!("Copy failed: {}", e))?;
    Ok(())
}

#[tauri::command]
pub fn get_db_path(app: tauri::AppHandle) -> Result<String, String> {
    let data_dir = app
        .path()
        .app_data_dir()
        .map_err(|e: tauri::Error| e.to_string())?;
    Ok(data_dir.join("pos.db").to_string_lossy().to_string())
}

// ─── Cloud Backup ────────────────────────────────────────────────────────────

/// Start Google OAuth flow — opens browser, returns connected account info
#[tauri::command]
pub async fn cloud_backup_connect(
    app: tauri::AppHandle,
    user_id: i64,
) -> Result<serde_json::Value, String> {
    let data_dir = app
        .path()
        .app_data_dir()
        .map_err(|e: tauri::Error| e.to_string())?;

    let token = cloud_backup::google_auth::start_oauth_flow().await?;

    // Store encrypted token for this user
    cloud_backup::google_auth::store_token(&data_dir, user_id, &token)?;

    Ok(serde_json::json!({
        "email": token.email,
        "name": token.name,
        "picture": token.picture,
    }))
}

/// Disconnect Google account for a user
#[tauri::command]
pub fn cloud_backup_disconnect(
    app: tauri::AppHandle,
    user_id: i64,
) -> Result<(), String> {
    let data_dir = app
        .path()
        .app_data_dir()
        .map_err(|e: tauri::Error| e.to_string())?;

    cloud_backup::google_auth::remove_token(&data_dir, user_id)
}

/// Get connected Google account info for a user
#[tauri::command]
pub async fn cloud_backup_get_account(
    app: tauri::AppHandle,
    user_id: i64,
) -> Result<Option<serde_json::Value>, String> {
    let data_dir = app
        .path()
        .app_data_dir()
        .map_err(|e: tauri::Error| e.to_string())?;

    match cloud_backup::google_auth::get_token(&data_dir, user_id)? {
        Some(token) => Ok(Some(serde_json::json!({
            "email": token.email,
            "name": token.name,
            "picture": token.picture,
        }))),
        None => Ok(None),
    }
}

/// Trigger a manual backup to Google Drive
#[tauri::command]
pub async fn cloud_backup_now(
    app: tauri::AppHandle,
    db: State<'_, DbState>,
    user_id: i64,
) -> Result<serde_json::Value, String> {
    let data_dir = app
        .path()
        .app_data_dir()
        .map_err(|e: tauri::Error| e.to_string())?;

    // Flush WAL first
    {
        let conn = db.lock();
        conn.execute_batch("PRAGMA wal_checkpoint(FULL);")
            .map_err(|e: rusqlite::Error| e.to_string())?;
    }

    // Check internet
    if !cloud_backup::queue::check_internet().await {
        // Queue for later
        cloud_backup::queue::enqueue_backup(&data_dir, user_id)?;
        return Err("No internet connection. Backup queued for when connectivity is restored.".into());
    }

    match cloud_backup::drive::perform_full_backup(&data_dir, user_id).await {
        Ok(result) => {
            // Update scheduler's last backup time
            if let Some(scheduler) = app.try_state::<std::sync::Arc<cloud_backup::scheduler::BackupScheduler>>() {
                scheduler.record_backup(user_id);
            }

            Ok(serde_json::json!({
                "success": true,
                "file_name": result.file_name,
                "file_id": result.file_id,
                "size_bytes": result.size_bytes,
                "timestamp": result.timestamp,
            }))
        }
        Err(e) => {
            // Queue for retry
            let _ = cloud_backup::queue::enqueue_backup(&data_dir, user_id);
            Err(e)
        }
    }
}

/// List all backups in Google Drive
#[tauri::command]
pub async fn cloud_backup_list(
    app: tauri::AppHandle,
    user_id: i64,
) -> Result<Vec<cloud_backup::drive::BackupEntry>, String> {
    let data_dir = app
        .path()
        .app_data_dir()
        .map_err(|e: tauri::Error| e.to_string())?;

    let token = cloud_backup::google_auth::get_valid_token(&data_dir, user_id).await?;
    cloud_backup::drive::list_backups(&token).await
}

/// Get Google Drive storage info
#[tauri::command]
pub async fn cloud_backup_storage(
    app: tauri::AppHandle,
    user_id: i64,
) -> Result<serde_json::Value, String> {
    let data_dir = app
        .path()
        .app_data_dir()
        .map_err(|e: tauri::Error| e.to_string())?;

    let token = cloud_backup::google_auth::get_valid_token(&data_dir, user_id).await?;
    let info = cloud_backup::drive::get_storage_info(&token).await?;

    Ok(serde_json::json!({
        "limit": info.limit,
        "usage": info.usage,
        "usage_in_drive": info.usage_in_drive,
    }))
}

/// Set backup interval for a user
#[tauri::command]
pub fn cloud_backup_set_interval(
    app: tauri::AppHandle,
    user_id: i64,
    hours: u64,
) -> Result<(), String> {
    let data_dir = app
        .path()
        .app_data_dir()
        .map_err(|e: tauri::Error| e.to_string())?;

    if let Some(scheduler) = app.try_state::<std::sync::Arc<cloud_backup::scheduler::BackupScheduler>>() {
        scheduler.set_interval(user_id, hours);
        cloud_backup::scheduler::save_scheduler_settings(&scheduler, &data_dir)?;
    }
    Ok(())
}

/// Get backup interval for a user
#[tauri::command]
pub fn cloud_backup_get_interval(
    app: tauri::AppHandle,
    user_id: i64,
) -> Result<u64, String> {
    if let Some(scheduler) = app.try_state::<std::sync::Arc<cloud_backup::scheduler::BackupScheduler>>() {
        Ok(scheduler.get_interval(user_id))
    } else {
        Ok(6) // default
    }
}

/// Get last backup time for a user
#[tauri::command]
pub fn cloud_backup_last_time(
    app: tauri::AppHandle,
    user_id: i64,
) -> Result<Option<i64>, String> {
    if let Some(scheduler) = app.try_state::<std::sync::Arc<cloud_backup::scheduler::BackupScheduler>>() {
        Ok(scheduler.get_last_backup(user_id))
    } else {
        Ok(None)
    }
}

/// Restore database from the latest cloud backup
#[tauri::command]
pub async fn cloud_backup_restore(
    app: tauri::AppHandle,
    db: State<'_, DbState>,
    user_id: i64,
) -> Result<String, String> {
    let data_dir = app
        .path()
        .app_data_dir()
        .map_err(|e: tauri::Error| e.to_string())?;

    let token = cloud_backup::google_auth::get_valid_token(&data_dir, user_id).await?;

    // Close current DB connection to allow overwrite
    let db_path = data_dir.join("pos.db");

    // Create a backup of current DB first
    let backup_current = data_dir.join("pos_pre_restore_backup.db");
    if db_path.exists() {
        let conn = db.lock();
        conn.execute_batch("PRAGMA wal_checkpoint(FULL);")
            .map_err(|e: rusqlite::Error| e.to_string())?;
        drop(conn);
        std::fs::copy(&db_path, &backup_current)
            .map_err(|e| format!("Failed to backup current DB: {}", e))?;
    }

    // Download and restore
    let restored_name = cloud_backup::drive::download_latest_backup(&token, &db_path).await?;

    Ok(restored_name)
}

/// Get offline queue status
#[tauri::command]
pub fn cloud_backup_queue_status(
    app: tauri::AppHandle,
) -> Result<serde_json::Value, String> {
    let data_dir = app
        .path()
        .app_data_dir()
        .map_err(|e: tauri::Error| e.to_string())?;

    let queue = cloud_backup::queue::load_queue(&data_dir);
    Ok(serde_json::json!({
        "count": queue.len(),
        "items": queue,
    }))
}

// ─── Suppliers ──────────────────────────────────────────────────────────────

#[tauri::command]
pub fn get_all_suppliers(db: State<DbState>) -> Result<Vec<suppliers::Supplier>, String> {
    let conn = db.lock();
    suppliers::get_all_suppliers(&conn).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_supplier_by_id(db: State<DbState>, id: i64) -> Result<suppliers::Supplier, String> {
    let conn = db.lock();
    suppliers::get_supplier_by_id(&conn, id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn create_supplier(db: State<DbState>, payload: suppliers::CreateSupplierPayload) -> Result<i64, String> {
    let mut conn = db.lock();
    suppliers::create_supplier(&mut conn, &payload).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn update_supplier(db: State<DbState>, id: i64, payload: suppliers::CreateSupplierPayload) -> Result<(), String> {
    let conn = db.lock();
    suppliers::update_supplier(&conn, id, &payload).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_supplier_ledger(
    db: State<DbState>,
    supplier_id: i64,
    from: Option<String>,
    to: Option<String>
) -> Result<Vec<suppliers::SupplierLedgerEntry>, String> {
    let conn = db.lock();
    suppliers::get_supplier_ledger(&conn, supplier_id, from.as_deref(), to.as_deref())
        .map_err(|e| format!("Ledger Error (ID: {}): {}", supplier_id, e.to_string()))
}

#[tauri::command]
pub fn record_supplier_payment(db: State<DbState>, payload: suppliers::SupplierPaymentPayload) -> Result<(), String> {
    let mut conn = db.lock();
    suppliers::record_supplier_payment(&mut conn, &payload).map_err(|e| e.to_string())
}

// ─── Accounting ─────────────────────────────────────────────────────────────

#[tauri::command]
pub fn get_all_accounts(db: State<DbState>) -> Result<Vec<accounts::Account>, String> {
    let conn = db.lock();
    accounts::get_all_accounts(&conn).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn create_account_entry(db: State<DbState>, payload: accounts::CreateAccountPayload) -> Result<i64, String> {
    let conn = db.lock();
    accounts::create_account(&conn, &payload).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn update_account_entry(db: State<DbState>, id: i64, payload: accounts::CreateAccountPayload) -> Result<(), String> {
    let conn = db.lock();
    accounts::update_account(&conn, id, &payload).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn delete_account_entry(db: State<DbState>, id: i64) -> Result<(), String> {
    let conn = db.lock();
    accounts::delete_account(&conn, id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn create_manual_journal(db: State<DbState>, entry: accounts::CreateJournalEntry, created_by: Option<i64>) -> Result<i64, String> {
    let conn = db.lock();
    accounts::create_journal_entry(&conn, &entry, created_by).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_trial_balance_report(db: State<DbState>, from_date: String, to_date: String) -> Result<accounts::TrialBalance, String> {
    let conn = db.lock();
    accounts::get_trial_balance(&conn, &from_date, &to_date).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_profit_loss_report(db: State<DbState>, from_date: String, to_date: String) -> Result<accounts::ProfitLossReport, String> {
    let conn = db.lock();
    accounts::get_profit_loss(&conn, &from_date, &to_date).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_account_ledger_data(db: State<DbState>, account_id: i64, from_date: String, to_date: String) -> Result<Vec<accounts::JournalLine>, String> {
    let conn = db.lock();
    accounts::get_account_ledger(&conn, account_id, &from_date, &to_date).map_err(|e| e.to_string())
}

// ─── Financials (Consolidated) ──────────────────────────────────────────

#[tauri::command]
pub fn get_global_ledger(
    state: tauri::State<DbState>,
    from: Option<String>,
    to: Option<String>,
    account_id: Option<i64>,
    reference_id: Option<i64>,
    reference_type: Option<String>,
) -> Result<Vec<financials::GlobalLedgerEntry>, String> {
    let conn = state.lock();
    financials::get_global_ledger(
        &conn,
        from.as_deref(),
        to.as_deref(),
        account_id,
        reference_id,
        reference_type.as_deref(),
    ).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_account_balance(
    state: tauri::State<DbState>,
    account_id: Option<i64>,
    reference_id: Option<i64>,
    reference_type: Option<String>,
) -> Result<f64, String> {
    let conn = state.lock();
    financials::get_filtered_balance(
        &conn,
        account_id,
        reference_id,
        reference_type.as_deref(),
    ).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn repair_accounting_data(db: State<DbState>) -> Result<usize, String> {
    let conn = db.lock();
    repair::repair_journal_links(&conn).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_financial_summary(db: State<DbState>) -> Result<financials::FinancialSummary, String> {
    let conn = db.lock();
    financials::get_financial_summary(&conn).map_err(|e| e.to_string())
}

// ─── Shopify Integration ────────────────────────────────────────────────────

#[tauri::command]
pub async fn shopify_test_connection(
    db: State<'_, DbState>,
) -> Result<crate::shopify::client::ShopInfo, String> {
    let client = get_shopify_client(&db).await?;
    client.test_connection().await
}

#[tauri::command]
pub async fn shopify_get_locations(
    db: State<'_, DbState>,
) -> Result<Vec<crate::shopify::client::ShopifyLocation>, String> {
    let client = get_shopify_client(&db).await?;
    client.get_locations().await
}

#[tauri::command]
pub async fn shopify_sync_product(
    db: State<'_, DbState>,
    product_id: i64,
) -> Result<String, String> {
    let client = get_shopify_client(&db).await?;

    // Fetch local product + variants
    let (product, variants, existing_mappings) = {
        let conn = db.lock();
        let prod = products::get_product_by_id(&conn, product_id)
            .map_err(|e| e.to_string())?
            .ok_or("Product not found")?;
        let vars = products::get_product_variants(&conn, product_id)
            .map_err(|e| e.to_string())?;
        let maps = shopify::get_mapping_by_local_product(&conn, product_id)
            .map_err(|e| e.to_string())?;
        (prod, vars, maps)
    };

    // Check if product already exists on Shopify
    let has_shopify_id = existing_mappings.iter()
        .find(|m| m.local_variant_id.is_none() || m.shopify_product_id.is_some())
        .and_then(|m| m.shopify_product_id);

    if let Some(shopify_pid) = has_shopify_id {
        // UPDATE existing product
        let shopify_variants: Vec<crate::shopify::client::ShopifyVariant> = variants.iter().map(|v| {
            let existing = existing_mappings.iter().find(|m| m.local_variant_id == Some(v.id));
            crate::shopify::client::ShopifyVariant {
                id: existing.and_then(|m| m.shopify_variant_id),
                title: Some(format!("{} / {}", v.size.clone().unwrap_or_default(), v.color.clone().unwrap_or_default())),
                price: Some(format!("{:.2}", v.variant_price.unwrap_or(product.sale_price))),
                sku: v.variant_barcode.clone(),
                barcode: v.variant_barcode.clone(),
                option1: v.size.clone(),
                option2: v.color.clone(),
                inventory_management: Some("shopify".to_string()),
                inventory_quantity: Some(v.quantity),
            }
        }).collect();

        let update = crate::shopify::client::UpdateShopifyProduct {
            id: shopify_pid,
            title: Some(product.name.clone()),
            body_html: product.description.clone(),
            status: Some("active".to_string()),
            variants: Some(shopify_variants),
        };

        let result = client.update_product(shopify_pid, &update).await;

        match result {
            Ok(resp) => {
                let conn = db.lock();
                for (i, sv) in resp.variants.iter().enumerate() {
                    if let Some(local_var) = variants.get(i) {
                        let _ = shopify::upsert_mapping(
                            &conn, product_id, Some(local_var.id),
                            Some(resp.id), Some(sv.id), Some(sv.inventory_item_id),
                        );
                    }
                }
                Ok(format!("Updated product on Shopify (ID: {})", resp.id))
            }
            Err(e) => {
                // Queue for retry
                let conn = db.lock();
                let payload = serde_json::json!({
                    "action": "update_product",
                    "product_id": product_id,
                    "shopify_product_id": shopify_pid,
                }).to_string();
                let _ = shopify::enqueue_sync(&conn, "update_product", &payload);
                Err(format!("Shopify sync failed (queued for retry): {}", e))
            }
        }
    } else {
        // CREATE new product
        let shopify_variants: Vec<crate::shopify::client::ShopifyVariant> = variants.iter().map(|v| {
            crate::shopify::client::ShopifyVariant {
                id: None,
                title: Some(format!("{} / {}", v.size.clone().unwrap_or_default(), v.color.clone().unwrap_or_default())),
                price: Some(format!("{:.2}", v.variant_price.unwrap_or(product.sale_price))),
                sku: v.variant_barcode.clone(),
                barcode: v.variant_barcode.clone(),
                option1: v.size.clone(),
                option2: v.color.clone(),
                inventory_management: Some("shopify".to_string()),
                inventory_quantity: Some(v.quantity),
            }
        }).collect();

        let create = crate::shopify::client::CreateShopifyProduct {
            title: product.name.clone(),
            body_html: product.description.clone(),
            vendor: product.brand.clone(),
            product_type: product.category_name.clone(),
            status: Some("active".to_string()),
            variants: shopify_variants,
        };

        let result = client.create_product(&create).await;

        match result {
            Ok(resp) => {
                let conn = db.lock();
                // Save mappings for product + each variant
                for (i, sv) in resp.variants.iter().enumerate() {
                    if let Some(local_var) = variants.get(i) {
                        let _ = shopify::upsert_mapping(
                            &conn, product_id, Some(local_var.id),
                            Some(resp.id), Some(sv.id), Some(sv.inventory_item_id),
                        );
                    }
                }
                Ok(format!("Created product on Shopify (ID: {})", resp.id))
            }
            Err(e) => {
                let conn = db.lock();
                let payload = serde_json::json!({
                    "action": "create_product",
                    "product_id": product_id,
                }).to_string();
                let _ = shopify::enqueue_sync(&conn, "create_product", &payload);
                Err(format!("Shopify sync failed (queued for retry): {}", e))
            }
        }
    }
}

#[tauri::command]
pub async fn shopify_sync_inventory(
    db: State<'_, DbState>,
    variant_id: i64,
    quantity: i64,
) -> Result<String, String> {
    let client = get_shopify_client(&db).await?;

    let (mapping, location_id) = {
        let conn = db.lock();
        let m = shopify::get_mapping_by_local_variant(&conn, variant_id)
            .map_err(|e| e.to_string())?
            .ok_or("No Shopify mapping found for this variant. Sync the product first.")?;
        let settings = settings::get_all_settings(&conn).map_err(|e| e.to_string())?;
        let loc = settings.get("shopify_location_id").cloned().unwrap_or_default()
            .parse::<i64>().unwrap_or(0);
        (m, loc)
    };

    if location_id == 0 {
        return Err("Shopify location not configured. Go to Settings → Shopify.".into());
    }

    let inv_item_id = mapping.shopify_inventory_item_id
        .ok_or("No inventory_item_id mapped for this variant")?;

    match client.set_inventory_level(inv_item_id, location_id, quantity).await {
        Ok(_) => Ok(format!("Inventory updated on Shopify (qty: {})", quantity)),
        Err(e) => {
            let conn = db.lock();
            let payload = serde_json::json!({
                "action": "set_inventory",
                "variant_id": variant_id,
                "quantity": quantity,
                "inventory_item_id": inv_item_id,
                "location_id": location_id,
            }).to_string();
            let _ = shopify::enqueue_sync(&conn, "set_inventory", &payload);
            Err(format!("Inventory sync failed (queued for retry): {}", e))
        }
    }
}

#[tauri::command]
pub async fn shopify_create_order(
    db: State<'_, DbState>,
    sale_id: i64,
) -> Result<String, String> {
    let client = get_shopify_client(&db).await?;

    let (sale, items) = {
        let conn = db.lock();
        sales::get_sale_with_items(&conn, sale_id).map_err(|e| e.to_string())?
    };

    // Build line items, mapping local variant IDs to Shopify variant IDs
    let mut line_items = Vec::new();
    {
        let conn = db.lock();
        for item in &items {
            let shopify_variant_id = if let Some(vid) = item.variant_id {
                shopify::get_mapping_by_local_variant(&conn, vid)
                    .ok()
                    .flatten()
                    .and_then(|m| m.shopify_variant_id)
            } else {
                None
            };

            line_items.push(crate::shopify::client::ShopifyLineItem {
                variant_id: shopify_variant_id,
                title: if shopify_variant_id.is_none() { Some(item.product_name.clone()) } else { None },
                quantity: item.quantity,
                price: format!("{:.2}", item.unit_price),
            });
        }
    }

    let gateway = match sale.payment_method.as_str() {
        "cash" => "cash",
        "card" => "card",
        _ => "manual",
    };

    let order = crate::shopify::client::CreateShopifyOrder {
        line_items,
        financial_status: Some("paid".to_string()),
        note: Some(format!("POS Sale: {} | {}", sale.invoice_number, sale.payment_method)),
        tags: Some("pos-sale".to_string()),
        transactions: Some(vec![crate::shopify::client::ShopifyTransaction {
            kind: "sale".to_string(),
            status: "success".to_string(),
            amount: format!("{:.2}", sale.total_amount),
            gateway: Some(gateway.to_string()),
        }]),
    };

    match client.create_order(&order).await {
        Ok(resp) => Ok(format!("Order created on Shopify: {} (ID: {})", resp.name, resp.id)),
        Err(e) => {
            let conn = db.lock();
            let payload = serde_json::json!({
                "action": "create_order",
                "sale_id": sale_id,
            }).to_string();
            let _ = shopify::enqueue_sync(&conn, "create_order", &payload);
            Err(format!("Order sync failed (queued for retry): {}", e))
        }
    }
}

#[tauri::command]
pub fn shopify_get_mappings(db: State<DbState>) -> Result<Vec<shopify::ShopifyMapping>, String> {
    let conn = db.lock();
    shopify::get_all_mappings(&conn).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn shopify_get_queue_stats(db: State<DbState>) -> Result<Value, String> {
    let conn = db.lock();
    shopify::get_queue_stats(&conn).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn shopify_get_pending_syncs(db: State<DbState>) -> Result<Vec<shopify::SyncQueueItem>, String> {
    let conn = db.lock();
    shopify::get_pending_syncs(&conn).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn shopify_retry_pending(
    db: State<'_, DbState>,
) -> Result<String, String> {
    let pending = {
        let conn = db.lock();
        shopify::get_pending_syncs(&conn).map_err(|e| e.to_string())?
    };

    if pending.is_empty() {
        return Ok("No pending syncs to retry".into());
    }

    let client = get_shopify_client(&db).await?;

    let mut success_count = 0;
    let mut fail_count = 0;

    for item in &pending {
        let payload: Value = serde_json::from_str(&item.payload).unwrap_or_default();
        let action = payload["action"].as_str().unwrap_or("");

        let result = match action {
            "set_inventory" => {
                let inv_id = payload["inventory_item_id"].as_i64().unwrap_or(0);
                let loc_id = payload["location_id"].as_i64().unwrap_or(0);
                let qty = payload["quantity"].as_i64().unwrap_or(0);
                client.set_inventory_level(inv_id, loc_id, qty).await.map(|_| ())
            }
            "create_product" => {
                // Re-trigger full product sync
                let pid = payload["product_id"].as_i64().unwrap_or(0);
                if pid > 0 {
                    // Mark as done, the caller should re-invoke shopify_sync_product
                    let conn = db.lock();
                    let _ = shopify::mark_sync_done(&conn, item.id);
                    success_count += 1;
                    continue;
                }
                Err("Invalid product_id".into())
            }
            "update_product" => {
                let pid = payload["product_id"].as_i64().unwrap_or(0);
                if pid > 0 {
                    let conn = db.lock();
                    let _ = shopify::mark_sync_done(&conn, item.id);
                    success_count += 1;
                    continue;
                }
                Err("Invalid product_id".into())
            }
            "create_order" => {
                let sid = payload["sale_id"].as_i64().unwrap_or(0);
                if sid > 0 {
                    let conn = db.lock();
                    let _ = shopify::mark_sync_done(&conn, item.id);
                    success_count += 1;
                    continue;
                }
                Err("Invalid sale_id".into())
            }
            _ => Err(format!("Unknown action: {}", action)),
        };

        let conn = db.lock();
        match result {
            Ok(_) => {
                let _ = shopify::mark_sync_done(&conn, item.id);
                success_count += 1;
            }
            Err(e) => {
                let _ = shopify::mark_sync_failed(&conn, item.id, &e);
                fail_count += 1;
            }
        }
    }

    Ok(format!("Retry complete: {} succeeded, {} failed", success_count, fail_count))
}

#[tauri::command]
pub fn shopify_clear_done_syncs(db: State<DbState>) -> Result<usize, String> {
    let conn = db.lock();
    shopify::clear_done_syncs(&conn).map_err(|e| e.to_string())
}

/// Build a ShopifyClient from saved settings.
/// Supports two auth modes:
///   1. Direct access token (shpat_...) — legacy custom apps
///   2. Client ID + Client Secret — Dev Dashboard apps (exchanges for temp token)
async fn get_shopify_client(db: &State<'_, DbState>) -> Result<crate::shopify::client::ShopifyClient, String> {
    let (domain, token, client_id, client_secret) = {
        let conn = db.lock();
        let settings = settings::get_all_settings(&conn).map_err(|e| e.to_string())?;
        (
            settings.get("shopify_domain").cloned().unwrap_or_default(),
            settings.get("shopify_token").cloned().unwrap_or_default(),
            settings.get("shopify_client_id").cloned().unwrap_or_default(),
            settings.get("shopify_client_secret").cloned().unwrap_or_default(),
        )
    };

    if domain.is_empty() {
        return Err("Shopify domain is required. Go to Settings → Shopify.".into());
    }

    // Priority 1: Direct access token (shpat_)
    if !token.is_empty() {
        return crate::shopify::client::ShopifyClient::new(&domain, &token);
    }

    // Priority 2: Client credentials grant (client_id + client_secret)
    if !client_id.is_empty() && !client_secret.is_empty() {
        return crate::shopify::client::ShopifyClient::from_client_credentials(
            &domain,
            &client_id,
            &client_secret,
        )
        .await;
    }

    Err("Shopify not configured. Provide either an Access Token or Client ID + Client Secret in Settings → Shopify.".into())
}

// ─── Import System ──────────────────────────────────────────────────────────

#[tauri::command]
pub fn import_detect_schema(file_path: String, file_type: String, table_name: Option<String>) -> Result<Value, String> {
    use crate::import::{csv_reader, excel_reader, sqlite_reader, smart_mapper};

    let (columns, rows) = match file_type.as_str() {
        "csv" => csv_reader::read_csv(&file_path)?,
        "excel" => excel_reader::read_excel(&file_path)?,
        "sqlite" => {
            let tname = table_name.ok_or("Table name required for SQLite import")?;
            sqlite_reader::read_table(&file_path, &tname)?
        }
        _ => return Err(format!("Unsupported file type: {}", file_type)),
    };

    // Take sample rows for detection (first 20)
    let sample: Vec<Vec<String>> = rows.iter().take(20).cloned().collect();
    let mappings = smart_mapper::detect_columns(&columns, &sample);

    Ok(serde_json::json!({
        "columns": columns,
        "total_rows": rows.len(),
        "mappings": mappings,
    }))
}

#[tauri::command]
pub fn import_list_tables(file_path: String) -> Result<Vec<crate::import::sqlite_reader::TableInfo>, String> {
    crate::import::sqlite_reader::list_tables(&file_path)
}

#[tauri::command]
pub fn import_preview_data(file_path: String, file_type: String, table_name: Option<String>, limit: Option<usize>) -> Result<Value, String> {
    use crate::import::{csv_reader, excel_reader, sqlite_reader};

    let (columns, rows) = match file_type.as_str() {
        "csv" => csv_reader::read_csv(&file_path)?,
        "excel" => excel_reader::read_excel(&file_path)?,
        "sqlite" => {
            let tname = table_name.ok_or("Table name required")?;
            sqlite_reader::read_table(&file_path, &tname)?
        }
        _ => return Err(format!("Unsupported file type: {}", file_type)),
    };

    let max = limit.unwrap_or(50).min(100);
    let preview: Vec<Vec<String>> = rows.iter().take(max).cloned().collect();

    Ok(serde_json::json!({
        "columns": columns,
        "total_rows": rows.len(),
        "preview_rows": preview,
    }))
}

#[tauri::command]
pub fn import_validate(
    file_path: String,
    file_type: String,
    table_name: Option<String>,
    config: crate::import::import_engine::ImportConfig,
) -> Result<Value, String> {
    use crate::import::{csv_reader, excel_reader, sqlite_reader, import_engine};

    let (columns, rows) = match file_type.as_str() {
        "csv" => csv_reader::read_csv(&file_path)?,
        "excel" => excel_reader::read_excel(&file_path)?,
        "sqlite" => {
            let tname = table_name.ok_or("Table name required")?;
            sqlite_reader::read_table(&file_path, &tname)?
        }
        _ => return Err(format!("Unsupported: {}", file_type)),
    };

    let errors = import_engine::validate_rows(&columns, &rows, &config);

    Ok(serde_json::json!({
        "total_rows": rows.len(),
        "error_count": errors.len(),
        "errors": errors,
        "is_valid": errors.is_empty(),
    }))
}

#[tauri::command]
pub fn import_execute(
    db: State<DbState>,
    file_path: String,
    file_type: String,
    table_name: Option<String>,
    config: crate::import::import_engine::ImportConfig,
) -> Result<Value, String> {
    use crate::import::{csv_reader, excel_reader, sqlite_reader, import_engine};

    let (columns, rows) = match file_type.as_str() {
        "csv" => csv_reader::read_csv(&file_path)?,
        "excel" => excel_reader::read_excel(&file_path)?,
        "sqlite" => {
            let tname = table_name.ok_or("Table name required")?;
            sqlite_reader::read_table(&file_path, &tname)?
        }
        _ => return Err(format!("Unsupported: {}", file_type)),
    };

    let conn = db.lock();
    let result = import_engine::execute_import(&conn, &columns, &rows, &config)?;

    Ok(serde_json::json!({
        "total_rows": result.total_rows,
        "imported": result.imported,
        "skipped": result.skipped,
        "errors": result.errors,
        "error_details": result.error_details,
        "batch_id": result.import_batch_id,
    }))
}

#[tauri::command]
pub fn import_rollback(db: State<DbState>, batch_id: String) -> Result<usize, String> {
    let conn = db.lock();
    crate::import::import_engine::rollback_import(&conn, &batch_id)
}

#[tauri::command]
pub fn import_history(db: State<DbState>) -> Result<Vec<Value>, String> {
    let conn = db.lock();
    let mut stmt = conn.prepare(
        "SELECT batch_id, source_type, source_name, total_rows, imported_count, skipped_count, error_count, status, created_at
         FROM import_history ORDER BY created_at DESC LIMIT 20"
    ).map_err(|e| e.to_string())?;

    let rows: Vec<Value> = stmt.query_map([], |row| {
        Ok(serde_json::json!({
            "batch_id": row.get::<_, String>(0)?,
            "source_type": row.get::<_, String>(1)?,
            "source_name": row.get::<_, Option<String>>(2)?,
            "total_rows": row.get::<_, i64>(3)?,
            "imported": row.get::<_, i64>(4)?,
            "skipped": row.get::<_, i64>(5)?,
            "errors": row.get::<_, i64>(6)?,
            "status": row.get::<_, String>(7)?,
            "created_at": row.get::<_, String>(8)?,
        }))
    }).map_err(|e| e.to_string())?
    .filter_map(|r| r.ok())
    .collect();

    Ok(rows)
}

/// Initialize database — called at app start
pub fn init_db(app: &tauri::AppHandle) -> Result<Connection, String> {
    let data_dir = app
        .path()
        .app_data_dir()
        .map_err(|e: tauri::Error| e.to_string())?;
    std::fs::create_dir_all(&data_dir).map_err(|e| e.to_string())?;
    let db_path = data_dir.join("pos.db");
    let conn = Connection::open(&db_path).map_err(|e: rusqlite::Error| e.to_string())?;
    migrations::run_migrations(&conn).map_err(|e: rusqlite::Error| e.to_string())?;
    Ok(conn)
}
