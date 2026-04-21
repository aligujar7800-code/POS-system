use serialport::SerialPort;
use serde::{Deserialize, Serialize};
use std::io::Write;
use std::time::Duration;

#[derive(Deserialize, Debug, Clone)]
pub struct PrinterConfig {
    pub printer_type: String, // "serial" | "network" | "usb"
    pub port: String,         // COM3, 192.168.1.100:9100, usb:...
    pub baud_rate: Option<u32>,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct ReceiptData {
    pub shop_name: String,
    pub shop_address: String,
    pub shop_phone: String,
    pub shop_email: String,
    pub header: String,
    pub invoice_number: String,
    pub sale_date: String,
    pub customer_name: Option<String>,
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

/// Build ESC/POS byte sequence for a professional receipt (48-char thermal)
pub fn build_receipt_bytes(data: &ReceiptData) -> Vec<u8> {
    let mut buf: Vec<u8> = Vec::new();
    let w: usize = 48; // 80mm paper = 48 chars

    // ── Initialize ───────────────────────────────────────────────────────────
    buf.extend_from_slice(b"\x1b\x40"); // ESC @ – reset

    // ── Shop Header (centered, double-size name) ────────────────────────────
    buf.extend_from_slice(b"\x1b\x61\x01"); // Center align
    buf.extend_from_slice(b"\x1b\x21\x30"); // Double height + width
    buf.extend_from_slice(clean_str(&data.shop_name).as_bytes());
    buf.push(b'\n');
    buf.extend_from_slice(b"\x1b\x21\x00"); // Normal size

    if !data.shop_address.is_empty() {
        buf.extend_from_slice(clean_str(&data.shop_address).as_bytes());
        buf.push(b'\n');
    }
    if !data.shop_phone.is_empty() {
        buf.extend_from_slice(clean_str(&data.shop_phone).as_bytes());
        buf.push(b'\n');
    }
    if !data.shop_email.is_empty() {
        buf.extend_from_slice(clean_str(&data.shop_email).as_bytes());
        buf.push(b'\n');
    }
    buf.push(b'\n');

    // ── Header Text ─────────────────────────────────────────────────────────
    if !data.header.is_empty() {
        for line in data.header.lines() {
            buf.extend_from_slice(b"\x1b\x61\x01"); // Center align
            buf.extend_from_slice(line.as_bytes());
            buf.push(b'\n');
        }
        buf.push(b'\n');
    }

    // ── Sale Info (left-aligned) ────────────────────────────────────────────
    buf.extend_from_slice(b"\x1b\x61\x00"); // Left align
    buf.extend_from_slice(format_two_col("Sale ID:", &data.invoice_number, w).as_bytes());
    buf.push(b'\n');
    buf.extend_from_slice(format_two_col("Date:", &data.sale_date, w).as_bytes());
    buf.push(b'\n');
    if let Some(ref name) = data.customer_name {
        if !name.is_empty() {
            buf.extend_from_slice(format_two_col("Customer:", name, w).as_bytes());
            buf.push(b'\n');
        }
    }
    buf.push(b'\n');

    // ── Items Header ────────────────────────────────────────────────────────
    buf.extend_from_slice(separator('-', w).as_bytes());
    buf.push(b'\n');
    // Header: Item(18)  Qty(4)  Rate(9)  Price(9)  = 48 with spaces
    let hdr = format!("{:<18} {:>4} {:>12} {:>10}", "Item", "Qty", "Rate", "Total");
    buf.extend_from_slice(hdr.as_bytes());
    buf.push(b'\n');
    buf.extend_from_slice(separator('-', w).as_bytes());
    buf.push(b'\n');

    // ── Items ───────────────────────────────────────────────────────────────
    for item in &data.items {
        let name = clean_str(&item.name);
        let qty_str = format!("{}", item.qty);
        let rate_str = format!("Rs.{:.2}", item.unit_price);
        let price_str = format!("Rs.{:.2}", item.total);

        if name.len() <= 18 {
            let line = format!("{:<18} {:>4} {:>12} {:>10}",
                name, qty_str, rate_str, price_str);
            buf.extend_from_slice(line.as_bytes());
            buf.push(b'\n');
        } else {
            // Name too long — print name on its own line, values on next
            buf.extend_from_slice(name.as_bytes());
            buf.push(b'\n');
            let line = format!("{:<18} {:>4} {:>12} {:>10}",
                "", qty_str, rate_str, price_str);
            buf.extend_from_slice(line.as_bytes());
            buf.push(b'\n');
        }

        // Show per-unit breakdown if qty > 1
        if item.qty > 1 {
            let detail = format!("  @ Rs.{:.2} x {}", item.unit_price, item.qty);
            buf.extend_from_slice(detail.as_bytes());
            buf.push(b'\n');
        }
    }

    buf.extend_from_slice(separator('-', w).as_bytes());
    buf.push(b'\n');

    // ── Totals ──────────────────────────────────────────────────────────────
    let sub_str = format!("Rs.{:.2}", data.subtotal);
    buf.extend_from_slice(format_two_col("SUBTOTAL:", &sub_str, w).as_bytes());
    buf.push(b'\n');

    if data.discount > 0.0 {
        let disc_str = format!("Rs.{:.2}", data.discount);
        buf.extend_from_slice(format_two_col("DISCOUNT:", &disc_str, w).as_bytes());
        buf.push(b'\n');
    }

    if data.tax > 0.0 {
        let tax_str = format!("Rs.{:.2}", data.tax);
        buf.extend_from_slice(format_two_col("TAX:", &tax_str, w).as_bytes());
        buf.push(b'\n');
    }

    // Bold total
    buf.extend_from_slice(b"\x1b\x21\x08"); // Bold on
    let total_str = format!("Rs.{:.2}", data.total);
    buf.extend_from_slice(format_two_col("TOTAL:", &total_str, w).as_bytes());
    buf.push(b'\n');
    buf.extend_from_slice(b"\x1b\x21\x00"); // Bold off

    // Payment
    let paid_label = format!("PAID ({}):", data.payment_method.to_uppercase());
    let paid_str = format!("Rs.{:.2}", data.paid);
    buf.extend_from_slice(format_two_col(&paid_label, &paid_str, w).as_bytes());
    buf.push(b'\n');

    if data.change > 0.0 {
        let ch_str = format!("Rs.{:.2}", data.change);
        buf.extend_from_slice(format_two_col("CHANGE:", &ch_str, w).as_bytes());
        buf.push(b'\n');
    }

    let balance = data.total - data.paid;
    if balance > 0.01 {
        let bal_str = format!("Rs.{:.2}", balance);
        buf.extend_from_slice(format_two_col("BALANCE DUE:", &bal_str, w).as_bytes());
        buf.push(b'\n');
    }

    buf.extend_from_slice(separator('=', w).as_bytes());
    buf.push(b'\n');

    // ── Shop info block (centered, after totals like Python module) ──────
    buf.extend_from_slice(b"\x1b\x61\x01"); // Center
    if !data.shop_address.is_empty() {
        buf.extend_from_slice(clean_str(&data.shop_address).as_bytes());
        buf.push(b'\n');
    }
    if !data.shop_phone.is_empty() {
        let tel = format!("Tel: {}", clean_str(&data.shop_phone));
        buf.extend_from_slice(tel.as_bytes());
        buf.push(b'\n');
    }
    if !data.shop_email.is_empty() {
        buf.extend_from_slice(clean_str(&data.shop_email).as_bytes());
        buf.push(b'\n');
    }
    buf.push(b'\n');

    // ── Footer text ─────────────────────────────────────────────────────────
    if !data.footer.is_empty() {
        for line in data.footer.lines() {
            buf.extend_from_slice(line.as_bytes());
            buf.push(b'\n');
        }
    }
    buf.push(b'\n');

    // ── Barcode (CODE128 of invoice number) ────────────────────────────────
    // Center barcode
    buf.extend_from_slice(b"\x1b\x61\x01"); // Center align
    // Set barcode height: GS h n
    buf.extend_from_slice(b"\x1d\x68\x3c"); // 60 dots
    // Set barcode width: GS w n
    buf.extend_from_slice(b"\x1d\x77\x02"); // width 2
    // HRI below barcode: GS H n
    buf.extend_from_slice(b"\x1d\x48\x02");
    // HRI font A: GS f n
    buf.extend_from_slice(b"\x1d\x66\x00");
    // Print CODE128: GS k m n d1..dn
    let barcode_data = data.invoice_number.as_bytes();
    let barcode_len = barcode_data.len().min(255) as u8;
    buf.extend_from_slice(b"\x1d\x6b\x49"); // GS k 73 (CODE128)
    buf.push(barcode_len);
    buf.extend_from_slice(&barcode_data[..barcode_len as usize]);
    buf.push(0x00); // NUL terminator
    buf.push(b'\n');
    buf.push(b'\n');

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


pub fn print_receipt(data: &ReceiptData, config: &PrinterConfig) -> Result<(), String> {
    let bytes = build_receipt_bytes(data);
    send_bytes(config, &bytes)
}

pub fn test_print(config: &PrinterConfig) -> Result<(), String> {
    let mut buf = Vec::new();
    buf.extend_from_slice(b"\x1b\x40"); // Init
    buf.extend_from_slice(b"\x1b\x61\x01"); // Center
    buf.extend_from_slice(b"\x1b\x21\x30"); // Double size
    buf.extend_from_slice(b"TEST PRINT\n");
    buf.extend_from_slice(b"\x1b\x21\x00");
    buf.extend_from_slice(b"Clothing POS System\n");
    buf.extend_from_slice(b"Printer is working!\n");
    buf.extend_from_slice(b"\n\n\n");
    buf.extend_from_slice(b"\x1d\x56\x41\x03");
    send_bytes(config, &buf)
}

pub fn open_cash_drawer(config: &PrinterConfig) -> Result<(), String> {
    // ESC p 0 25 250 – cash drawer pulse
    let cmd = b"\x1b\x70\x00\x19\xfa";
    send_bytes(config, cmd)
}


fn clean_str(s: &str) -> String {
    s.trim_matches('"').trim().to_string()
}
