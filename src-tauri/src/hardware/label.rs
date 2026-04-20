use serde::Deserialize;
use std::io::Write;
use crate::hardware::printer::PrinterConfig;

#[derive(Deserialize, Debug, Clone)]
pub struct LabelData {
    pub shop_name: String,
    pub product_name: String,
    #[allow(dead_code)]
    pub sku: String,
    pub size: Option<String>,
    pub color: Option<String>,
    pub price: f64,
    pub barcode: String,
    pub quantity: u32,
    pub template: String, // "small" | "large"
    pub protocol: String, // "zpl" | "tspl"
}

pub fn build_zpl_label(data: &LabelData) -> String {
    let (w, h) = if data.template == "small" { (304, 204) } else { (464, 304) };
    let size_line = data.size.as_deref().unwrap_or("");
    let color_line = data.color.as_deref().unwrap_or("");
    let variant = if !size_line.is_empty() || !color_line.is_empty() {
        format!("{} {}", size_line, color_line).trim().to_string()
    } else {
        String::new()
    };

    format!(
        "^XA\n\
         ^PW{w}\n\
         ^LL{h}\n\
         ^FO10,15^A0N,18,18^FD{shop}^FS\n\
         ^FO10,40^A0N,24,24^FD{name}^FS\n\
         ^FO10,68^A0N,18,18^FD{variant}^FS\n\
         ^FO10,90^A0N,22,22^FDRs. {price:.0}^FS\n\
         ^FO10,120^BCN,70,Y,N,N^FD{barcode}^FS\n\
         ^PQ{qty}\n\
         ^XZ\n",
        shop = data.shop_name,
        name = data.product_name,
        variant = variant,
        price = data.price,
        barcode = data.barcode,
        qty = data.quantity,
        w = w,
        h = h
    )
}

pub fn build_tspl_label(data: &LabelData) -> String {
    let (w, h) = if data.template == "small" { (38, 25) } else { (58, 40) };
    let size_line = data.size.as_deref().unwrap_or("");
    let color_line = data.color.as_deref().unwrap_or("");
    let variant = format!("{} {}", size_line, color_line).trim().to_string();

     format!(
        "SIZE {w} mm, {h} mm\n\
         GAP 3 mm, 0 mm\n\
         DIRECTION 0\n\
         REFERENCE 0,0\n\
         OFFSET 0 mm\n\
         SET PEEL OFF\n\
         SET CUTTER OFF\n\
         CLS\n\
         TEXT 10,5,\"2\",0,1,1,\"{shop}\"\n\
         TEXT 10,25,\"3\",0,1,1,\"{name}\"\n\
         TEXT 10,50,\"2\",0,1,1,\"{variant}\"\n\
         TEXT 10,70,\"3\",0,1,1,\"Rs. {price:.0}\"\n\
         BARCODE 10,95,\"128\",60,1,0,2,2,\"{barcode}\"\n\
         PRINT {qty}\n\
         END\n",
        w = w,
        h = h,
        shop = data.shop_name,
        name = data.product_name,
        variant = variant,
        price = data.price,
        barcode = data.barcode,
        qty = data.quantity
    )
}

pub fn print_label(data: &LabelData, config: &PrinterConfig) -> Result<(), String> {
    let cmd_str = if data.protocol == "zpl" {
        build_zpl_label(data)
    } else {
        build_tspl_label(data)
    };

    let bytes = cmd_str.into_bytes();

    match config.printer_type.as_str() {
        "serial" => {
            let baud = config.baud_rate.unwrap_or(9600);
            let mut port = serialport::new(&config.port, baud)
                .timeout(std::time::Duration::from_secs(5))
                .open()
                .map_err(|e| format!("Cannot open {}: {}", config.port, e))?;
            port.write_all(&bytes).map_err(|e| e.to_string())?;
        }
        "network" => {
            use std::net::TcpStream;
            let mut stream = TcpStream::connect(&config.port)
                .map_err(|e| format!("TCP connect failed: {}", e))?;
            stream.write_all(&bytes).map_err(|e| e.to_string())?;
        }
        _ => return Err(format!("Unsupported label printer type: {}", config.printer_type)),
    }

    Ok(())
}
