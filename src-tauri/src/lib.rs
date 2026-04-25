mod commands;
mod db;
mod hardware;
mod shopify;

use commands::*;
use parking_lot::Mutex;
use std::sync::Arc;
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .setup(|app| {
            let conn = commands::init_db(&app.handle())
                .expect("Failed to initialize database");
            let db_state: DbState = Arc::new(Mutex::new(conn));
            app.manage(db_state);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            // License
            check_online_activation,
            get_license_status,
            activate_license,
            get_machine_id,
            request_license,
            // Auth
            authenticate_user,
            get_all_users,
            create_user,
            update_user_status,
            change_password,
            verify_admin_password,
            delete_user,
            // Products
            search_products,
            get_all_products,
            get_product_by_barcode,
            get_product_by_id,
            get_product_variants,
            create_product,
            create_bulk_products,
            delete_product,
            update_product,
            update_variant_stock,
            get_stock_ledger,
            get_all_categories,
            create_category,
            get_sub_categories,
            get_main_categories,
            delete_category,
            update_category,
            generate_article_number,
            create_inward_article,
            generate_ean13,
            get_low_stock_products,
            add_inward_stock,
            get_inward_history,
            clear_inward_history,
            ensure_variant_barcodes,
            // Sales
            create_sale,
            get_sale_with_items,
            get_sales_by_date,
            get_todays_summary,
            search_sales,
            process_sales_return,
            // Customers
            search_customers,
            get_all_customers,
            create_customer,
            get_customer_by_id,
            get_total_udhaar,
            get_top_defaulters,
            // Suppliers
            get_all_suppliers,
            get_supplier_by_id,
            create_supplier,
            update_supplier,
            get_supplier_ledger,
            record_supplier_payment,
            // Ledger
            get_financial_ledger,
            add_cashbook_entry,
            get_customer_ledger,
            record_payment,
            get_customer_summary,
            get_todays_collections,
            // Reports
            sales_report,
            top_products,
            hourly_sales,
            profit_loss,
            inventory_valuation,
            dead_stock,
            // Settings
            get_all_settings,
            set_setting,
            set_many_settings,
            // Hardware
            detect_printers,
            test_print,
            print_receipt,
            print_label,
            print_label_batch,
            print_sale_by_id,
            open_cash_drawer,
            // Backup
            backup_database,
            get_db_path,
            // Accounting
            get_all_accounts,
            create_account_entry,
            update_account_entry,
            delete_account_entry,
            create_manual_journal,
            get_trial_balance_report,
            get_profit_loss_report,
            get_account_ledger_data,
            get_global_ledger,
            get_financial_summary,
            get_account_balance,
            repair_accounting_data,
            // Shopify
            shopify_test_connection,
            shopify_get_locations,
            shopify_sync_product,
            shopify_sync_inventory,
            shopify_create_order,
            shopify_get_mappings,
            shopify_get_queue_stats,
            shopify_get_pending_syncs,
            shopify_retry_pending,
            shopify_clear_done_syncs,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
