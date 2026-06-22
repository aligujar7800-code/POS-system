mod commands;
mod db;
mod hardware;
mod shopify;
mod cloud_backup;
mod cloud_sync;
mod import;
mod payments;

use commands::*;
use parking_lot::Mutex;
use std::sync::Arc;
use tauri::Manager;
use tauri_plugin_shell::process::CommandChild;

struct SidecarState(Arc<Mutex<Option<CommandChild>>>);

#[tauri::command]
fn kill_sidecar(state: tauri::State<'_, SidecarState>) {
    if let Some(child) = state.0.lock().take() {
        println!("Killing Whisper sidecar...");
        let _ = child.kill();
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_notification::init())
        .setup(|app| {
            let conn = commands::init_db(&app.handle())
                .expect("Failed to initialize database");
            let db_state: DbState = Arc::new(Mutex::new(conn));
            app.manage(db_state.clone());

            // Initialize cloud backup scheduler
            let data_dir = app.handle()
                .path()
                .app_data_dir()
                .expect("Failed to get app data dir");

            let scheduler = Arc::new(cloud_backup::scheduler::BackupScheduler::new(data_dir.clone()));
            cloud_backup::scheduler::load_scheduler_settings(&scheduler, &data_dir);
            app.manage(scheduler.clone());

            // Start background scheduler
            cloud_backup::scheduler::start_scheduler(scheduler, db_state.clone());

            // Start cloud sync queue processor
            let sync_data_dir = data_dir.clone();
            let sync_db = db_state;
            tauri::async_runtime::spawn(async move {
                loop {
                    tokio::time::sleep(tokio::time::Duration::from_secs(300)).await;
                    let _ = cloud_sync::process_sync_queue(&sync_data_dir, &sync_db).await;
                }
            });

            // Spawn the Whisper sidecar
            use tauri_plugin_shell::ShellExt;
            let sidecar_child = Arc::new(Mutex::new(None));
            app.manage(SidecarState(sidecar_child.clone()));

            if let Ok(sidecar) = app.handle().shell().sidecar("whisper_sidecar") {
                match sidecar.spawn() {
                    Ok((mut rx, child)) => {
                        *sidecar_child.lock() = Some(child);
                        tauri::async_runtime::spawn(async move {
                            while let Some(_event) = rx.recv().await {
                                // Keep sidecar alive, can log events if needed
                            }
                        });
                    }
                    Err(e) => eprintln!("Failed to spawn Whisper sidecar: {}", e),
                }
            } else {
                eprintln!("Whisper sidecar not found in config");
            }

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
            upload_product_image,
            get_image_base64,
            remove_product_image,
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
            get_return_with_items,
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
            record_supplier_discount,
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
            get_profit_by_product,
            get_profit_by_category,
            get_profit_by_subcategory,
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
            test_label_print,
            print_sale_by_id,
            open_cash_drawer,
            // Backup
            backup_database,
            restore_local_backup,
            get_db_path,
            // Cloud Backup
            cloud_backup_connect,
            cloud_backup_disconnect,
            cloud_backup_get_account,
            cloud_backup_now,
            cloud_backup_list,
            cloud_backup_storage,
            cloud_backup_set_interval,
            cloud_backup_get_interval,
            cloud_backup_last_time,
            cloud_backup_restore,
            cloud_backup_queue_status,
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
            shopify_delete_product,
            shopify_sync_inventory,
            shopify_create_order,
            shopify_get_mappings,
            shopify_get_queue_stats,
            shopify_get_pending_syncs,
            shopify_retry_pending,
            shopify_clear_done_syncs,
            // Import System
            import_detect_schema,
            import_list_tables,
            import_preview_data,
            import_validate,
            import_execute,
            import_rollback,
            import_history,
            // Payment Gateways
            payment_save_credentials,
            payment_get_configured,
            payment_remove_credentials,
            payment_initiate,
            payment_check_status,
            payment_refund,
            payment_link_to_sale,
            payment_get_sale_transactions,
            payment_queue_offline,
            payment_get_queue,
            payment_method_breakdown,
            payment_gateway_summary,
            // Cloud Sync (Supabase)
            cloud_sync_connect,
            cloud_sync_disconnect,
            cloud_sync_status,
            cloud_sync_now,
            kill_sidecar,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
