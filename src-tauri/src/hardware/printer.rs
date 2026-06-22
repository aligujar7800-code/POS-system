use serialport::SerialPort;
use serde::{Deserialize, Serialize};
use std::io::Write;
use std::time::Duration;

#[derive(Deserialize, Debug, Clone)]
pub struct PrinterConfig {
    pub printer_type: String, // "serial" | "network" | "usb" | "system"
    pub port: String,         // COM3, 192.168.1.100:9100, usb:...
    pub baud_rate: Option<u32>,
}

#[derive(Deserialize, Debug, Clone, Default)]
#[serde(rename_all = "camelCase")]
pub struct ReceiptBlock {
    pub id: String,
    pub r#type: String, // "text" | "separator" | "key_value" | "item_list" | "totals" | "barcode" | "qrcode" | "logo" | "spacing"
    pub content: Option<String>,
    pub align: Option<String>,
    pub font_size: Option<String>,
    pub bold: Option<bool>,
    pub visible_if: Option<String>,
    pub char: Option<String>,
    pub left_text: Option<String>,
    pub right_text: Option<String>,
    pub lines: Option<i64>,
}

#[derive(Deserialize, Debug, Clone, Default)]
pub struct ReceiptTemplate {
    pub version: i64,
    pub width: String, // "58mm" | "80mm"
    pub blocks: Vec<ReceiptBlock>,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct ReceiptData {
    pub shop_name: String,
    pub shop_address: String,
    pub shop_phone: String,
    pub shop_email: String,
    pub shop_website: Option<String>,
    pub shop_ntn: Option<String>,
    pub shop_strn: Option<String>,
    pub shop_logo: Option<String>,
    pub logo_width: Option<f32>,
    pub logo_height: Option<f32>,
    pub currency_symbol: Option<String>,
    pub header: String,
    pub invoice_number: String,
    pub sale_date: String,
    pub customer_name: Option<String>,
    pub customer_phone: Option<String>,
    pub customer_email: Option<String>,
    pub cashier: String,
    pub items: Vec<ReceiptItem>,
    pub subtotal: f64,
    pub discount: f64,
    pub tax: f64,
    pub total: f64,
    pub paid: f64,
    pub change: f64,
    pub payment_method: String,
    pub footer: String,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct ReceiptItem {
    pub name: String,
    pub qty: i64,
    pub unit_price: f64,
    pub total: f64,
}

fn open_serial(port: &str, baud: u32) -> Result<Box<dyn SerialPort>, String> {
    serialport::new(port, baud)
        .timeout(Duration::from_secs(5))
        .open()
        .map_err(|e| format!("Cannot open {}: {}", port, e))
}

fn send_bytes(config: &PrinterConfig, data: &[u8]) -> Result<(), String> {
    match config.printer_type.as_str() {
        "serial" => {
            let baud = config.baud_rate.unwrap_or(9600);
            let mut port = open_serial(&config.port, baud)?;
            port.write_all(data).map_err(|e| e.to_string())?;
        }
        "network" => {
            use std::net::TcpStream;
            let mut stream = TcpStream::connect(&config.port)
                .map_err(|e| format!("TCP connect failed: {}", e))?;
            stream.write_all(data).map_err(|e| e.to_string())?;
        }
        "usb" => {
            // Port format is "usb:vid:pid"
            let parts: Vec<&str> = config.port.split(':').collect();
            if parts.len() < 3 {
                return Err("Invalid USB port format. Expected usb:vid:pid".to_string());
            }
            let vid = u16::from_str_radix(parts[1], 16).map_err(|e| e.to_string())?;
            let pid = u16::from_str_radix(parts[2], 16).map_err(|e| e.to_string())?;

            let handle = rusb::open_device_with_vid_pid(vid, pid)
                .ok_or_else(|| format!("USB device {:04x}:{:04x} not found", vid, pid))?;
            
            // Find bulk out endpoint
            let config_desc = handle.device().active_config_descriptor().map_err(|e| e.to_string())?;
            let mut endpoint_addr = None;

            for interface in config_desc.interfaces() {
                for interface_desc in interface.descriptors() {
                    for endpoint_desc in interface_desc.endpoint_descriptors() {
                        if endpoint_desc.direction() == rusb::Direction::Out && 
                           endpoint_desc.transfer_type() == rusb::TransferType::Bulk {
                            endpoint_addr = Some(endpoint_desc.address());
                            break;
                        }
                    }
                    if endpoint_addr.is_some() {
                        // Claim interface
                        let _ = handle.set_auto_detach_kernel_driver(true);
                        handle.claim_interface(interface_desc.interface_number()).map_err(|e| e.to_string())?;
                        break;
                    }
                }
                if endpoint_addr.is_some() { break; }
            }

            let addr = endpoint_addr.ok_or("No bulk out endpoint found for USB printer")?;
            handle.write_bulk(addr, data, Duration::from_secs(5)).map_err(|e| e.to_string())?;
        }
        "system" => {
            // Print via Windows Spooler using RAW winspool API
            crate::hardware::label::send_raw_to_system_printer(&config.port, data)?;
        }
        _ => {
            return Err(format!("Unsupported printer type: {}", config.printer_type));
        }
    }
    Ok(())
}

fn evaluate_condition(cond: &str, data: &ReceiptData) -> bool {
    let c = cond.trim().to_lowercase();
    if c.is_empty() { return true; }
    if c == "tax > 0" { data.tax > 0.0 }
    else if c == "discount > 0" { data.discount > 0.0 }
    else if c.contains("customer_phone") { data.customer_phone.is_some() && !data.customer_phone.as_ref().unwrap().is_empty() }
    else if c.contains("customer_name") || c == "customer" { data.customer_name.is_some() && !data.customer_name.as_ref().unwrap().is_empty() }
    else if c.contains("change") { data.change > 0.0 }
    else if c.contains("paid") { data.paid > 0.0 }
    else { true }
}

fn interpolate_vars(text: &str, data: &ReceiptData) -> String {
    let mut s = text.to_string();
    s = s.replace("{{shop_name}}", &data.shop_name);
    s = s.replace("{{shop_address}}", &data.shop_address);
    s = s.replace("{{shop_phone}}", &data.shop_phone);
    s = s.replace("{{shop_email}}", &data.shop_email);
    s = s.replace("{{shop_website}}", data.shop_website.as_deref().unwrap_or(""));
    s = s.replace("{{shop_ntn}}", data.shop_ntn.as_deref().unwrap_or(""));
    s = s.replace("{{shop_strn}}", data.shop_strn.as_deref().unwrap_or(""));
    s = s.replace("{{invoice_number}}", &data.invoice_number);
    s = s.replace("{{invoice_date}}", data.sale_date.split(' ').next().unwrap_or(""));
    s = s.replace("{{invoice_time}}", data.sale_date.split(' ').nth(1).unwrap_or(""));
    s = s.replace("{{invoice_datetime}}", &data.sale_date);
    s = s.replace("{{customer_name}}", data.customer_name.as_deref().unwrap_or("Walk-in"));
    s = s.replace("{{customer_phone}}", data.customer_phone.as_deref().unwrap_or(""));
    s = s.replace("{{customer_email}}", data.customer_email.as_deref().unwrap_or(""));
    s = s.replace("{{cashier_name}}", &data.cashier);
    s = s.replace("{{sale_id}}", &data.invoice_number);
    s = s.replace("{{payment_method}}", &data.payment_method.to_uppercase());
    s = s.replace("{{total_items}}", &format!("{}", data.items.iter().map(|i| i.qty).sum::<i64>()));
    s = s.replace("{{subtotal}}", &format!("{:.2}", data.subtotal));
    s = s.replace("{{tax}}", &format!("{:.2}", data.tax));
    s = s.replace("{{discount}}", &format!("{:.2}", data.discount));
    s = s.replace("{{grand_total}}", &format!("{:.2}", data.total));
    s = s.replace("{{amount_paid}}", &format!("{:.2}", data.paid));
    s = s.replace("{{change_returned}}", &format!("{:.2}", data.change));
    s
}

/// Build ESC/POS byte sequence using dynamic template
pub fn build_receipt_bytes(data: &ReceiptData, template: Option<&ReceiptTemplate>) -> Vec<u8> {
    let mut buf: Vec<u8> = Vec::new();
    
    let default_blocks = vec![
        ReceiptBlock { id: "1".into(), r#type: "logo".into(), align: Some("center".into()), ..Default::default() },
        ReceiptBlock { id: "2".into(), r#type: "text".into(), content: Some("{{shop_name}}".into()), align: Some("center".into()), font_size: Some("double_all".into()), bold: Some(true), ..Default::default() },
        ReceiptBlock { id: "3".into(), r#type: "text".into(), content: Some("{{shop_address}}".into()), align: Some("center".into()), ..Default::default() },
        ReceiptBlock { id: "4".into(), r#type: "text".into(), content: Some("Tel: {{shop_phone}}".into()), align: Some("center".into()), ..Default::default() },
        ReceiptBlock { id: "5".into(), r#type: "separator".into(), char: Some("-".into()), ..Default::default() },
        ReceiptBlock { id: "6".into(), r#type: "key_value".into(), left_text: Some("Sale ID:".into()), right_text: Some("{{invoice_number}}".into()), ..Default::default() },
        ReceiptBlock { id: "7".into(), r#type: "key_value".into(), left_text: Some("Date:".into()), right_text: Some("{{invoice_datetime}}".into()), ..Default::default() },
        ReceiptBlock { id: "7b".into(), r#type: "key_value".into(), left_text: Some("Customer:".into()), right_text: Some("{{customer_name}}".into()), visible_if: Some("customer_name".into()), ..Default::default() },
        ReceiptBlock { id: "7c".into(), r#type: "key_value".into(), left_text: Some("Phone:".into()), right_text: Some("{{customer_phone}}".into()), visible_if: Some("customer_phone".into()), ..Default::default() },
        ReceiptBlock { id: "8".into(), r#type: "separator".into(), char: Some("-".into()), ..Default::default() },
        ReceiptBlock { id: "9".into(), r#type: "item_list".into(), ..Default::default() },
        ReceiptBlock { id: "10".into(), r#type: "separator".into(), char: Some("=".into()), ..Default::default() },
        ReceiptBlock { id: "11".into(), r#type: "totals".into(), ..Default::default() },
        ReceiptBlock { id: "12".into(), r#type: "separator".into(), char: Some("=".into()), ..Default::default() },
        ReceiptBlock { id: "13".into(), r#type: "text".into(), content: Some("Thank you for shopping with us!".into()), align: Some("center".into()), ..Default::default() },
        ReceiptBlock { id: "14".into(), r#type: "barcode".into(), content: Some("{{invoice_number}}".into()), align: Some("center".into()), ..Default::default() }
    ];

    let t = template.cloned().unwrap_or(ReceiptTemplate {
        version: 1,
        width: "80mm".into(),
        blocks: default_blocks,
    });

    let w: usize = if t.width == "58mm" { 32 } else { 48 };

    buf.extend_from_slice(b"\x1b\x40"); // ESC @ – reset

    for block in t.blocks {
        if let Some(cond) = &block.visible_if {
            if !evaluate_condition(cond, data) {
                continue;
            }
        }

        // Handle alignment
        let align = block.align.as_deref().unwrap_or("left");
        match align {
            "center" => buf.extend_from_slice(b"\x1b\x61\x01"),
            "right" => buf.extend_from_slice(b"\x1b\x61\x02"),
            _ => buf.extend_from_slice(b"\x1b\x61\x00"),
        }

        // Handle font size and bold
        let mut font_cmd = 0u8;
        if block.bold.unwrap_or(false) {
            font_cmd |= 0x08;
            buf.extend_from_slice(b"\x1b\x45\x01"); // ESC E 1 (bold on)
        } else {
            buf.extend_from_slice(b"\x1b\x45\x00"); // ESC E 0 (bold off)
        }
        
        match block.font_size.as_deref().unwrap_or("normal") {
            "double_width" => font_cmd |= 0x20,
            "double_height" => font_cmd |= 0x10,
            "double_all" => font_cmd |= 0x30,
            _ => {}
        }
        buf.extend_from_slice(b"\x1b\x21");
        buf.push(font_cmd);

        match block.r#type.as_str() {
            "logo" => {
                if let Some(logo_base64) = &data.shop_logo {
                    if !logo_base64.is_empty() {
                        let target_w = data.logo_width.map(|w| w as u32).unwrap_or(250);
                        if let Some(raster_bytes) = build_raster_image(logo_base64, target_w) {
                            buf.extend_from_slice(&raster_bytes);
                        }
                    }
                }
            }
            "text" => {
                if let Some(content) = &block.content {
                    let text = interpolate_vars(content, data);
                    for line in text.lines() {
                        buf.extend_from_slice(clean_str(line).as_bytes());
                        buf.push(b'\n');
                    }
                }
            }
            "separator" => {
                let ch = block.char.as_deref().unwrap_or("-").chars().next().unwrap_or('-');
                buf.extend_from_slice(separator(ch, w).as_bytes());
                buf.push(b'\n');
            }
            "key_value" => {
                let left = block.left_text.as_deref().unwrap_or("");
                let right_raw = block.right_text.as_deref().unwrap_or("");
                let right = interpolate_vars(right_raw, data);
                buf.extend_from_slice(format_two_col(left, &right, w).as_bytes());
                buf.push(b'\n');
            }
            "item_list" => {
                // Determine layout based on width
                let (name_w, qty_w, rate_w, tot_w) = if w == 32 {
                    (14, 3, 6, 6) // 14 + 1 + 3 + 1 + 6 + 1 + 6 = 32
                } else {
                    (20, 4, 10, 11) // 20 + 1 + 4 + 1 + 10 + 1 + 11 = 48
                };
                
                let hdr = format!("{:<nw$} {:>qw$} {:>rw$} {:>tw$}", "Item", "Qty", "Rate", "Total", nw=name_w, qw=qty_w, rw=rate_w, tw=tot_w);
                buf.extend_from_slice(hdr.as_bytes());
                buf.push(b'\n');
                buf.extend_from_slice(separator('-', w).as_bytes());
                buf.push(b'\n');

                for (idx, item) in data.items.iter().enumerate() {
                    let name = format!("{}. {}", idx + 1, clean_str(&item.name));
                    let qty_str = format!("{}", item.qty);
                    let rate_str = format!("{:.2}", item.unit_price);
                    let price_str = format!("{:.2}", item.total);

                    if name.len() <= name_w {
                        let line = format!("{:<nw$} {:>qw$} {:>rw$} {:>tw$}", name, qty_str, rate_str, price_str, nw=name_w, qw=qty_w, rw=rate_w, tw=tot_w);
                        buf.extend_from_slice(line.as_bytes());
                        buf.push(b'\n');
                    } else {
                        buf.extend_from_slice(name.as_bytes());
                        buf.push(b'\n');
                        let line = format!("{:<nw$} {:>qw$} {:>rw$} {:>tw$}", "", qty_str, rate_str, price_str, nw=name_w, qw=qty_w, rw=rate_w, tw=tot_w);
                        buf.extend_from_slice(line.as_bytes());
                        buf.push(b'\n');
                    }
                }
            }
            "totals" => {
                let sub_str = format!("{:.2}", data.subtotal);
                buf.extend_from_slice(format_two_col("SUBTOTAL:", &sub_str, w).as_bytes());
                buf.push(b'\n');

                if data.discount > 0.0 {
                    let disc_str = format!("{:.2}", data.discount);
                    buf.extend_from_slice(format_two_col("DISCOUNT:", &disc_str, w).as_bytes());
                    buf.push(b'\n');
                }

                if data.tax > 0.0 {
                    let tax_str = format!("{:.2}", data.tax);
                    buf.extend_from_slice(format_two_col("TAX:", &tax_str, w).as_bytes());
                    buf.push(b'\n');
                }

                buf.extend_from_slice(b"\x1b\x21\x08"); // Bold on
                buf.extend_from_slice(b"\x1b\x45\x01"); // ESC E 1 (bold on)
                let total_str = format!("{:.2}", data.total);
                buf.extend_from_slice(format_two_col("TOTAL:", &total_str, w).as_bytes());
                buf.push(b'\n');
                buf.extend_from_slice(b"\x1b\x21\x00"); // Bold off
                buf.extend_from_slice(b"\x1b\x45\x00"); // ESC E 0 (bold off)

                let paid_label = format!("PAID ({}):", data.payment_method.to_uppercase());
                let paid_str = format!("{:.2}", data.paid);
                buf.extend_from_slice(format_two_col(&paid_label, &paid_str, w).as_bytes());
                buf.push(b'\n');

                if data.change > 0.0 {
                    let ch_str = format!("{:.2}", data.change);
                    buf.extend_from_slice(format_two_col("CHANGE:", &ch_str, w).as_bytes());
                    buf.push(b'\n');
                }

                let balance = data.total - data.paid;
                if balance > 0.01 {
                    let bal_str = format!("{:.2}", balance);
                    buf.extend_from_slice(format_two_col("BALANCE DUE:", &bal_str, w).as_bytes());
                    buf.push(b'\n');
                }
            }
            "barcode" => {
                if let Some(content) = &block.content {
                    let text = interpolate_vars(content, data);
                    buf.extend_from_slice(b"\x1b\x61\x01"); // Center align
                    buf.extend_from_slice(b"\x1d\x68\x3c"); // 60 dots
                    buf.extend_from_slice(b"\x1d\x77\x02"); // width 2
                    buf.extend_from_slice(b"\x1d\x48\x02"); // HRI below
                    buf.extend_from_slice(b"\x1d\x66\x00"); // Font A
                    
                    let mut barcode_data = Vec::new();
                    barcode_data.extend_from_slice(b"{B");
                    barcode_data.extend_from_slice(text.as_bytes());
                    let barcode_len = barcode_data.len().min(255) as u8;
                    
                    buf.extend_from_slice(b"\x1d\x6b\x49"); // GS k 73
                    buf.push(barcode_len);
                    buf.extend_from_slice(&barcode_data[..barcode_len as usize]);
                    buf.push(b'\n');
                }
            }
            "qrcode" => {
                if let Some(content) = &block.content {
                    let text = interpolate_vars(content, data);
                    let len = text.len() + 3;
                    let p_l = (len % 256) as u8;
                    let p_h = (len / 256) as u8;
                    
                    buf.extend_from_slice(b"\x1b\x61\x01"); // Center align
                    // Model 2
                    buf.extend_from_slice(b"\x1d\x28\x6b\x04\x00\x31\x41\x32\x00");
                    // Size 6
                    buf.extend_from_slice(b"\x1d\x28\x6b\x03\x00\x31\x43\x06");
                    // Error correction M
                    buf.extend_from_slice(b"\x1d\x28\x6b\x03\x00\x31\x45\x31");
                    // Store data
                    buf.extend_from_slice(b"\x1d\x28\x6b");
                    buf.push(p_l);
                    buf.push(p_h);
                    buf.extend_from_slice(b"\x31\x50\x30");
                    buf.extend_from_slice(text.as_bytes());
                    // Print
                    buf.extend_from_slice(b"\x1d\x28\x6b\x03\x00\x31\x51\x30");
                    buf.push(b'\n');
                }
            }
            "spacing" => {
                let lines = block.lines.unwrap_or(1);
                for _ in 0..lines {
                    buf.push(b'\n');
                }
            }
            _ => {}
        }
        
        // Reset formatting after each block
        buf.extend_from_slice(b"\x1b\x21\x00"); // Normal size
        buf.extend_from_slice(b"\x1b\x45\x00"); // Bold off
    }

    // ── Feed + Cut ──────────────────────────────────────────────────────────
    buf.extend_from_slice(b"\x1b\x64\x04"); // Feed 4 lines
    buf.extend_from_slice(b"\x1d\x56\x41\x03"); // Full cut

    buf
}

/// Format two strings left/right justified within `width` chars
fn format_two_col(left: &str, right: &str, width: usize) -> String {
    let gap = width.saturating_sub(left.len() + right.len());
    format!("{}{}{}", left, " ".repeat(gap), right)
}

/// Create a separator line of `ch` repeated `width` times
fn separator(ch: char, width: usize) -> String {
    std::iter::repeat(ch).take(width).collect()
}

pub fn print_receipt(data: &ReceiptData, config: &PrinterConfig, template_json: Option<String>) -> Result<(), String> {
    let template = template_json.and_then(|j| serde_json::from_str(&j).ok());
    let bytes = build_receipt_bytes(data, template.as_ref());
    send_bytes(config, &bytes)
}

pub fn test_print(config: &PrinterConfig, template_json: Option<String>) -> Result<(), String> {
    let data = ReceiptData {
        shop_name: "Clothing POS System".into(),
        shop_address: "123 Main Street, City".into(),
        shop_phone: "0300-1234567".into(),
        shop_email: "contact@example.com".into(),
        shop_website: Some("www.example.com".into()),
        shop_ntn: Some("1234567-8".into()),
        shop_strn: Some("1234567890".into()),
        shop_logo: None,
        logo_width: None,
        logo_height: None,
        currency_symbol: Some("Rs.".into()),
        header: "TEST RECEIPT HEADER".into(),
        invoice_number: "INV-TEST-001".into(),
        sale_date: "2026-06-21 15:30:00".into(),
        customer_name: Some("Ali Gujjar".into()),
        customer_phone: Some("0333-7654321".into()),
        customer_email: Some("ali@example.com".into()),
        cashier: "Admin".into(),
        items: vec![
            crate::hardware::printer::ReceiptItem { name: "Test T-Shirt".into(), qty: 2, unit_price: 500.0, total: 1000.0 },
            crate::hardware::printer::ReceiptItem { name: "Test Jeans".into(), qty: 1, unit_price: 1500.0, total: 1500.0 }
        ],
        subtotal: 2500.0,
        discount: 100.0,
        tax: 0.0,
        total: 2400.0,
        paid: 2500.0,
        change: 100.0,
        payment_method: "cash".into(),
        footer: "TEST RECEIPT FOOTER\nTHANK YOU".into(),
    };
    
    let template = template_json.and_then(|j| serde_json::from_str(&j).ok());
    let bytes = build_receipt_bytes(&data, template.as_ref());
    send_bytes(config, &bytes)
}

pub fn open_cash_drawer(config: &PrinterConfig) -> Result<(), String> {
    // ESC p 0 25 250 – cash drawer pulse
    let cmd = b"\x1b\x70\x00\x19\xfa";
    send_bytes(config, cmd)
}


fn clean_str(s: &str) -> String {
    s.trim_matches('"').trim().to_string()
}

fn build_raster_image(base64_str: &str, target_width: u32) -> Option<Vec<u8>> {
    let b64 = if let Some(idx) = base64_str.find("base64,") {
        &base64_str[idx + 7..]
    } else {
        base64_str
    };

    use base64::{Engine as _, engine::general_purpose};
    let bytes = general_purpose::STANDARD.decode(b64.trim()).ok()?;

    let img = image::load_from_memory(&bytes).ok()?.into_rgba8();
    
    let mut bg = image::RgbaImage::from_pixel(img.width(), img.height(), image::Rgba([255, 255, 255, 255]));
    image::imageops::overlay(&mut bg, &img, 0, 0);

    let luma_img = image::DynamicImage::ImageRgba8(bg).into_luma8();
    
    let (mut width, mut height) = luma_img.dimensions();
    let final_img = if width > target_width {
        let ratio = target_width as f32 / width as f32;
        let new_height = (height as f32 * ratio) as u32;
        image::imageops::resize(&luma_img, target_width, new_height, image::imageops::FilterType::CatmullRom)
    } else {
        luma_img
    };
    
    let (width, height) = final_img.dimensions();

    let mut buf = Vec::new();
    buf.extend_from_slice(b"\x1b\x40"); // Initialize printer
    buf.extend_from_slice(b"\x1b\x61\x01"); // Center alignment
    
    // Set line spacing to 24 dots
    buf.extend_from_slice(b"\x1b\x33\x18");

    let bands = (height + 23) / 24;
    for band in 0..bands {
        // ESC * m nL nH d1...dk
        buf.extend_from_slice(b"\x1b\x2a\x21"); // m = 33 (0x21) -> 24-dot double density
        buf.push((width % 256) as u8);
        buf.push((width / 256) as u8);
        
        for x in 0..width {
            for i in 0..3 {
                let mut byte = 0u8;
                for bit in 0..8 {
                    let y = band * 24 + i * 8 + bit;
                    if y < height {
                        let pixel = final_img.get_pixel(x, y)[0];
                        if pixel < 128 { // darker than 50% gray
                            byte |= 1 << (7 - bit);
                        }
                    }
                }
                buf.push(byte);
            }
        }
        // Print and feed paper for the band
        buf.extend_from_slice(b"\n");
    }

    // Reset line spacing to default
    buf.extend_from_slice(b"\x1b\x32");
    buf.extend_from_slice(b"\n");
    
    Some(buf)
}
