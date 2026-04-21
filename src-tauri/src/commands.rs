use crate::db::{migrations, queries::*};
use crate::hardware::{detection, label, printer};
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
pub fn activate_license(db: State<DbState>, key: String) -> Result<license::LicenseInfo, String> {
    let conn = db.lock();
    license::activate_license(&conn, &key)
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
