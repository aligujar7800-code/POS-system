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
        _ => {
            return Err(format!("Unsupported printer type: {}", config.printer_type));
        }
    }
    Ok(())
}

/// Build ESC/POS byte sequence for a receipt
pub fn build_receipt_bytes(data: &ReceiptData) -> Vec<u8> {
    let mut buf: Vec<u8> = Vec::new();

    // Initialize printer
    buf.extend_from_slice(b"\x1b\x40"); // ESC @

    // Center + double-size for shop name
    buf.extend_from_slice(b"\x1b\x61\x01"); // Center align
    buf.extend_from_slice(b"\x1b\x21\x30"); // Double height + width
    buf.extend_from_slice(clean_str(&data.shop_name).as_bytes());
    buf.extend_from_slice(b"\n");
    buf.extend_from_slice(b"\x1b\x21\x00"); // Normal size

    buf.extend_from_slice(clean_str(&data.shop_address).as_bytes());
    buf.extend_from_slice(b"\n");
    buf.extend_from_slice(clean_str(&data.shop_phone).as_bytes());
    buf.extend_from_slice(b"\n");
    buf.extend_from_slice(b"--------------------------------\n");

    // Left align
    buf.extend_from_slice(b"\x1b\x61\x00");
    buf.extend_from_slice(format!("Invoice: {}\n", data.invoice_number).as_bytes());
    buf.extend_from_slice(format!("Date:    {}\n", data.sale_date).as_bytes());
    buf.extend_from_slice(format!("Cashier: {}\n", data.cashier).as_bytes());
    if let Some(ref name) = data.customer_name {
        buf.extend_from_slice(format!("Customer:{}\n", name).as_bytes());
    }
    buf.extend_from_slice(b"================================\n");
    buf.extend_from_slice(b"Item             Qty  Price  Total\n");
    buf.extend_from_slice(b"--------------------------------\n");

    for item in &data.items {
        let line = format!(
            "{:<16} {:>3} {:>6.0} {:>6.0}\n",
            truncate(&item.name, 16),
            item.qty,
            item.unit_price,
            item.total
        );
        buf.extend_from_slice(line.as_bytes());
    }

    buf.extend_from_slice(b"================================\n");
    buf.extend_from_slice(format!("Subtotal:           {:>8.0}\n", data.subtotal).as_bytes());
    if data.discount > 0.0 {
        buf.extend_from_slice(format!("Discount:           {:>8.0}\n", data.discount).as_bytes());
    }
    if data.tax > 0.0 {
        buf.extend_from_slice(format!("Tax:                {:>8.0}\n", data.tax).as_bytes());
    }
    buf.extend_from_slice(b"\x1b\x21\x20"); // Bold
    buf.extend_from_slice(format!("TOTAL:              {:>8.0}\n", data.total).as_bytes());
    buf.extend_from_slice(b"\x1b\x21\x00"); // Normal
    buf.extend_from_slice(format!("Paid ({}):        {:>8.0}\n", data.payment_method, data.paid).as_bytes());
    if data.change > 0.0 {
        buf.extend_from_slice(format!("Change:             {:>8.0}\n", data.change).as_bytes());
    }
    buf.extend_from_slice(b"--------------------------------\n");

    // Footer centered
    buf.extend_from_slice(b"\x1b\x61\x01");
    buf.extend_from_slice(data.footer.as_bytes());
    buf.extend_from_slice(b"\n");

    // Feed and cut
    buf.extend_from_slice(b"\n\n\n");
    buf.extend_from_slice(b"\x1d\x56\x41\x03"); // Full cut

    buf
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

fn truncate(s: &str, max: usize) -> String {
    let s = clean_str(s);
    if s.len() <= max {
        s.to_string()
    } else {
        format!("{}.", &s[..max - 1])
    }
}

fn clean_str(s: &str) -> String {
    s.trim_matches('"').trim().to_string()
}
