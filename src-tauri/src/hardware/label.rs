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
    pub protocol: String, // "zpl" | "tspl" | "epl"
    pub offset_x: Option<i32>,
    pub offset_y: Option<i32>,
    pub mrp: Option<f64>,  // Original price before discount
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

    // Price line: if MRP provided, show MRP struck-through + sale price
    let price_section = if let Some(mrp) = data.mrp {
        format!(
            "^FO10,88^A0N,16,16^FDM.R.P Rs. {:.0}^FS\n\
             ^FO10,86^GB180,1,2^FS\n\
             ^FO10,106^A0N,22,22^FDSale Rs. {:.0}^FS\n",
            mrp, data.price
        )
    } else {
        format!("^FO10,90^A0N,22,22^FDRs. {:.0}^FS\n", data.price)
    };
    let barcode_y = if data.mrp.is_some() { 130 } else { 120 };

    format!(
        "^XA\n\
         ^PW{w}\n\
         ^LL{h}\n\
         ^FO10,15^A0N,18,18^FD{shop}^FS\n\
         ^FO10,40^A0N,24,24^FD{name}^FS\n\
         ^FO10,68^A0N,18,18^FD{variant}^FS\n\
         {price_section}\
         ^FO10,{barcode_y}^BCN,60,Y,N,N^FD{barcode}^FS\n\
         ^PQ{qty}\n\
         ^XZ\n",
        shop = data.shop_name,
        name = data.product_name,
        variant = variant,
        price_section = price_section,
        barcode = data.barcode,
        barcode_y = barcode_y,
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

    let price_lines = if let Some(mrp) = data.mrp {
        format!(
            "TEXT 10,68,\"2\",0,1,1,\"M.R.P Rs. {:.0}\"\n\
             TEXT 10,85,\"3\",0,1,1,\"Sale Rs. {:.0}\"\n",
            mrp, data.price
        )
    } else {
        format!("TEXT 10,70,\"3\",0,1,1,\"Rs. {:.0}\"\n", data.price)
    };
    let barcode_y = if data.mrp.is_some() { 105 } else { 95 };

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
         {price_lines}\
         BARCODE 10,{barcode_y},\"128\",60,1,0,2,2,\"{barcode}\"\n\
         PRINT {qty}\n\
         END\n",
        w = w,
        h = h,
        shop = data.shop_name,
        name = data.product_name,
        variant = variant,
        price_lines = price_lines,
        barcode_y = barcode_y,
        barcode = data.barcode,
        qty = data.quantity
    )
}

/// EPL2 label format — used by Zebra TLP 2844 and other older Eltron/Zebra printers
/// Supports 2-across label layout (2 labels per row on 4" printhead)
pub fn build_epl2_label(data: &LabelData) -> String {
    let size_line = data.size.as_deref().unwrap_or("");
    let color_line = data.color.as_deref().unwrap_or("");
    let variant = format!("{} {}", size_line, color_line).trim().to_string();

    let mut cmds = String::new();
    
    let pairs = data.quantity / 2;
    let remainder = data.quantity % 2;

    let off_x = data.offset_x.unwrap_or(0);
    let off_y = data.offset_y.unwrap_or(0);

    let lx = 10 + off_x;
    let rx = 420 + off_x;
    let y0 = 5 + off_y;
    let y1 = 25 + off_y;
    let y2 = 48 + off_y;
    let y3 = 65 + off_y;
    let y4 = 90 + off_y;

    let build_content = |include_right: bool| -> String {
        let mut s = String::new();
        s.push_str("\nN\n");
        s.push_str("q812\n");       // Full width for 2-across on 4" printhead
        s.push_str("Q200,24\n");    // Label height, gap
        s.push_str("D8\n");
        s.push_str("S2\n");

        // Helper: build price lines for one label column
        let build_price = |x: i32| -> String {
            let mut p = String::new();
            if let Some(mrp) = data.mrp {
                // MRP with strikethrough line
                p.push_str(&format!("A{},{},0,1,1,1,N,\"M.R.P Rs. {:.0}\"\n", x, y3, mrp));
                p.push_str(&format!("LO{},{},160,1\n", x, y3 + 5)); // strikethrough
                p.push_str(&format!("A{},{},0,2,1,1,N,\"Sale Rs. {:.0}\"\n", x, y3 + 15, data.price));
            } else {
                p.push_str(&format!("A{},{},0,2,1,1,N,\"Rs. {:.0}\"\n", x, y3, data.price));
            }
            p
        };
        let barcode_y = if data.mrp.is_some() { y4 + 12 } else { y4 };

        // ---- LEFT LABEL ----
        s.push_str(&format!("A{},{},0,1,1,1,N,\"{}\"\n", lx, y0, data.shop_name));
        s.push_str(&format!("A{},{},0,2,1,1,N,\"{}\"\n", lx, y1, data.product_name));
        if !variant.is_empty() {
            s.push_str(&format!("A{},{},0,1,1,1,N,\"{}\"\n", lx, y2, variant));
        }
        s.push_str(&build_price(lx));
        s.push_str(&format!("B{},{},0,1,2,2,45,B,\"{}\"\n", lx, barcode_y, data.barcode));

        if include_right {
            // ---- RIGHT LABEL ----
            s.push_str(&format!("A{},{},0,1,1,1,N,\"{}\"\n", rx, y0, data.shop_name));
            s.push_str(&format!("A{},{},0,2,1,1,N,\"{}\"\n", rx, y1, data.product_name));
            if !variant.is_empty() {
                s.push_str(&format!("A{},{},0,1,1,1,N,\"{}\"\n", rx, y2, variant));
            }
            s.push_str(&build_price(rx));
            s.push_str(&format!("B{},{},0,1,2,2,45,B,\"{}\"\n", rx, barcode_y, data.barcode));
        }
        s
    };

    if pairs > 0 {
        cmds.push_str(&build_content(true));
        cmds.push_str(&format!("P{}\n", pairs));
    }

    if remainder > 0 {
        cmds.push_str(&build_content(false));
        cmds.push_str(&format!("P{}\n", remainder));
    }

    cmds
}

/// Batch item for multi-variant label printing
#[derive(Deserialize, Debug, Clone)]
pub struct LabelBatchItem {
    pub shop_name: String,
    pub product_name: String,
    pub size: Option<String>,
    pub color: Option<String>,
    pub price: f64,
    pub barcode: String,
    pub quantity: u32,
    pub offset_x: Option<i32>,
    pub offset_y: Option<i32>,
    pub mrp: Option<f64>,  // Original price before discount
}

/// Build EPL2 commands for a batch of labels (2-across layout)
/// Pairs items left-right across the printhead
/// Each item's `quantity` field determines how many copies to print
pub fn build_epl2_batch(items: &[LabelBatchItem], shop_name: &str) -> String {
    let mut cmds = String::new();

    // 1. Expand items by their quantity
    //    e.g. item with quantity=10 becomes 10 individual label entries
    let expanded: Vec<&LabelBatchItem> = items.iter()
        .flat_map(|item| std::iter::repeat(item).take(item.quantity as usize))
        .collect();

    if expanded.is_empty() {
        return cmds;
    }

    // 2. Pair them left-right
    let mut pairs = Vec::new();
    let mut i = 0;
    while i < expanded.len() {
        let left = expanded[i];
        let right = if i + 1 < expanded.len() { Some(expanded[i + 1]) } else { None };
        pairs.push((left, right));
        i += 2;
    }

    // 3. Group consecutive identical pairs to compress the payload (prevents TLP2844 buffer overflow)
    let mut i = 0;
    while i < pairs.len() {
        let current_pair = pairs[i];
        let mut count = 1;

        let mut j = i + 1;
        while j < pairs.len() {
            let next_pair = pairs[j];
            let left_same = current_pair.0.barcode == next_pair.0.barcode;
            let right_same = match (current_pair.1, next_pair.1) {
                (Some(r1), Some(r2)) => r1.barcode == r2.barcode,
                (None, None) => true,
                _ => false,
            };

            if left_same && right_same {
                count += 1;
                j += 1;
            } else {
                break;
            }
        }

        let left = current_pair.0;
        let right = current_pair.1;

        let left_variant = format!(
            "{} {}",
            left.size.as_deref().unwrap_or(""),
            left.color.as_deref().unwrap_or("")
        ).trim().to_string();
        let off_x = left.offset_x.unwrap_or(0);
        let off_y = left.offset_y.unwrap_or(0);
        let lx = 10 + off_x;
        let rx = 420 + off_x;
        let y0 = 5 + off_y;
        let y1 = 25 + off_y;
        let y2 = 48 + off_y;
        let y3 = 65 + off_y;
        let y4 = 90 + off_y;

        // For each unique pair, build a single print job spanning full width
        cmds.push_str("\nN\n");
        cmds.push_str("q812\n");       // Full printhead width for 2-across
        cmds.push_str("Q200,24\n");    // Label height, gap
        cmds.push_str("D8\n");
        cmds.push_str("S2\n");

        // Helper: build price lines for one label column
        let build_price_batch = |x: i32, item: &LabelBatchItem| -> String {
            let mut p = String::new();
            if let Some(mrp) = item.mrp {
                p.push_str(&format!("A{},{},0,1,1,1,N,\"M.R.P Rs. {:.0}\"\n", x, y3, mrp));
                p.push_str(&format!("LO{},{},160,1\n", x, y3 + 5));
                p.push_str(&format!("A{},{},0,2,1,1,N,\"Sale Rs. {:.0}\"\n", x, y3 + 15, item.price));
            } else {
                p.push_str(&format!("A{},{},0,2,1,1,N,\"Rs. {:.0}\"\n", x, y3, item.price));
            }
            p
        };
        let has_mrp = left.mrp.is_some() || right.map_or(false, |r| r.mrp.is_some());
        let barcode_y = if has_mrp { y4 + 12 } else { y4 };

        // ---- LEFT LABEL ----
        cmds.push_str(&format!("A{},{},0,1,1,1,N,\"{}\"\n", lx, y0, shop_name));
        cmds.push_str(&format!("A{},{},0,2,1,1,N,\"{}\"\n", lx, y1, left.product_name));
        if !left_variant.is_empty() {
            cmds.push_str(&format!("A{},{},0,1,1,1,N,\"{}\"\n", lx, y2, left_variant));
        }
        cmds.push_str(&build_price_batch(lx, left));
        cmds.push_str(&format!("B{},{},0,1,2,2,45,B,\"{}\"\n", lx, barcode_y, left.barcode));

        // ---- RIGHT LABEL ----
        if let Some(r) = right {
            let right_variant = format!(
                "{} {}",
                r.size.as_deref().unwrap_or(""),
                r.color.as_deref().unwrap_or("")
            ).trim().to_string();

            cmds.push_str(&format!("A{},{},0,1,1,1,N,\"{}\"\n", rx, y0, shop_name));
            cmds.push_str(&format!("A{},{},0,2,1,1,N,\"{}\"\n", rx, y1, r.product_name));
            if !right_variant.is_empty() {
                cmds.push_str(&format!("A{},{},0,1,1,1,N,\"{}\"\n", rx, y2, right_variant));
            }
            cmds.push_str(&build_price_batch(rx, r));
            cmds.push_str(&format!("B{},{},0,1,2,2,45,B,\"{}\"\n", rx, barcode_y, r.barcode));
        }

        // Print exactly 'count' copies of this paired layout
        cmds.push_str(&format!("P{}\n", count));

        i += count;
    }

    cmds
}

pub fn print_label(data: &LabelData, config: &PrinterConfig) -> Result<(), String> {
    let cmd_str = match data.protocol.as_str() {
        "zpl" => build_zpl_label(data),
        "epl" => build_epl2_label(data),
        "tspl" => build_tspl_label(data),
        _ => build_epl2_label(data), // default to EPL2 for older Zebra printers
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
        "usb" => {
            use std::time::Duration;
            let parts: Vec<&str> = config.port.split(':').collect();
            if parts.len() < 3 {
                return Err("Invalid USB port format. Expected usb:vid:pid".to_string());
            }
            let vid = u16::from_str_radix(parts[1], 16).map_err(|e| e.to_string())?;
            let pid = u16::from_str_radix(parts[2], 16).map_err(|e| e.to_string())?;
            let handle = rusb::open_device_with_vid_pid(vid, pid)
                .ok_or_else(|| format!("USB device {:04x}:{:04x} not found", vid, pid))?;
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
                        let _ = handle.set_auto_detach_kernel_driver(true);
                        handle.claim_interface(interface_desc.interface_number()).map_err(|e| e.to_string())?;
                        break;
                    }
                }
                if endpoint_addr.is_some() { break; }
            }
            let addr = endpoint_addr.ok_or("No bulk out endpoint found")?;
            handle.write_bulk(addr, &bytes, Duration::from_secs(5)).map_err(|e| e.to_string())?;
        }
        "system" => {
            send_raw_to_system_printer(&config.port, &bytes)?;
        }
        _ => return Err(format!("Unsupported label printer type: {}", config.printer_type)),
    }

    Ok(())
}

/// Send raw bytes directly to a Windows system printer using winspool API.
/// This is required for Zebra/thermal printers that expect RAW ZPL/TSPL commands.
#[cfg(target_os = "windows")]
pub fn send_raw_to_system_printer(printer_name: &str, data: &[u8]) -> Result<(), String> {
    use std::ffi::CString;
    use std::ptr;

    #[repr(C)]
    struct DocInfoA {
        p_doc_name: *const i8,
        p_output_file: *const i8,
        p_data_type: *const i8,
    }

    extern "system" {
        fn OpenPrinterA(pPrinterName: *const i8, phPrinter: *mut usize, pDefault: *const u8) -> i32;
        fn StartDocPrinterA(hPrinter: usize, Level: i32, pDocInfo: *const DocInfoA) -> i32;
        fn StartPagePrinter(hPrinter: usize) -> i32;
        fn WritePrinter(hPrinter: usize, pBuf: *const u8, cbBuf: u32, pcWritten: *mut u32) -> i32;
        fn EndPagePrinter(hPrinter: usize) -> i32;
        fn EndDocPrinter(hPrinter: usize) -> i32;
        fn ClosePrinter(hPrinter: usize) -> i32;
    }

    let printer_cstr = CString::new(printer_name).map_err(|e| e.to_string())?;
    let doc_name = CString::new("POS Label").unwrap();
    let data_type = CString::new("RAW").unwrap();

    unsafe {
        let mut h_printer: usize = 0;
        if OpenPrinterA(printer_cstr.as_ptr(), &mut h_printer, ptr::null()) == 0 {
            return Err(format!("Failed to open printer '{}'", printer_name));
        }

        let doc_info = DocInfoA {
            p_doc_name: doc_name.as_ptr(),
            p_output_file: ptr::null(),
            p_data_type: data_type.as_ptr(),
        };

        if StartDocPrinterA(h_printer, 1, &doc_info) == 0 {
            ClosePrinter(h_printer);
            return Err("StartDocPrinter failed".to_string());
        }

        if StartPagePrinter(h_printer) == 0 {
            EndDocPrinter(h_printer);
            ClosePrinter(h_printer);
            return Err("StartPagePrinter failed".to_string());
        }

        let mut written: u32 = 0;
        if WritePrinter(h_printer, data.as_ptr(), data.len() as u32, &mut written) == 0 {
            EndPagePrinter(h_printer);
            EndDocPrinter(h_printer);
            ClosePrinter(h_printer);
            return Err("WritePrinter failed".to_string());
        }

        EndPagePrinter(h_printer);
        EndDocPrinter(h_printer);
        ClosePrinter(h_printer);
    }

    Ok(())
}

#[cfg(not(target_os = "windows"))]
pub fn send_raw_to_system_printer(_printer_name: &str, _data: &[u8]) -> Result<(), String> {
    Err("System printer RAW printing is only supported on Windows".to_string())
}

/// Print a batch of labels (2-across) to a system printer
pub fn print_label_batch(items: &[LabelBatchItem], shop_name: &str, config: &PrinterConfig) -> Result<(), String> {
    let cmd_str = build_epl2_batch(items, shop_name);
    let bytes = cmd_str.into_bytes();

    match config.printer_type.as_str() {
        "system" => send_raw_to_system_printer(&config.port, &bytes)?,
        "serial" => {
            let baud = config.baud_rate.unwrap_or(9600);
            let mut port = serialport::new(&config.port, baud)
                .timeout(std::time::Duration::from_secs(5))
                .open()
                .map_err(|e| format!("Cannot open {}: {}", config.port, e))?;
            std::io::Write::write_all(&mut port, &bytes).map_err(|e| e.to_string())?;
        }
        _ => return Err(format!("Unsupported printer type for batch: {}", config.printer_type)),
    }

    Ok(())
}
