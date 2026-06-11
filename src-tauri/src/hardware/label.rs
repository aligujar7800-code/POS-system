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
    pub barcode_width: Option<i32>,
    pub barcode_height: Option<i32>,
    pub mrp_line_offset: Option<i32>,
    pub mrp: Option<f64>,  // Original price before discount
}

pub fn build_zpl_label(data: &LabelData) -> String {
    // TLP 2844-Z: 203 dpi, full printhead = 812 dots (4 inch)
    // 2-across layout: each label ~380 dots wide
    let label_w: i32 = 350;
    let label_h = if data.template == "small" { 203 } else { 300 };
    let full_w = 812; // full printhead width for 2-across

    let off_x = data.offset_x.unwrap_or(0);
    let off_y = data.offset_y.unwrap_or(0);
    let lx = 30 + off_x;    // left label X origin (30 dots margin)
    let rx = 430 + off_x;   // right label X origin

    let size_str = data.size.as_deref().unwrap_or("");
    let color_str = data.color.as_deref().unwrap_or("");
    let sku_str = if data.sku.is_empty() { String::new() } else { format!("ART-{}", data.sku) };

    // Build content for one label at given X origin
    let build_one = |x: i32| -> String {
        let mut s = String::new();

        let name_y = 8 + off_y;
        let sku_y = 34 + off_y;
        let price_y = 54 + off_y;
        let barcode_y = 72 + off_y;

        // Row 1: Product Name (left) + Size (right)
        s.push_str(&format!("^FO{},{}^A0N,22,22^FD{}^FS\n", x, name_y, data.product_name));
        if !size_str.is_empty() {
            let size_x = x + label_w - 50;
            s.push_str(&format!("^FO{},{}^A0N,22,22^FD{}^FS\n", size_x, name_y, size_str));
        }

        // Row 2: ART-SKU (left) + Color (right)
        if !sku_str.is_empty() {
            s.push_str(&format!("^FO{},{}^A0N,18,18^FD{}^FS\n", x, sku_y, sku_str));
        }
        if !color_str.is_empty() {
            let color_x = x + label_w - 70;
            s.push_str(&format!("^FO{},{}^A0N,18,18^FD{}^FS\n", color_x, sku_y, color_str));
        }

        // Row 3: Price
        if let Some(mrp) = data.mrp {
            let mrp_text = format!("MRP: {:.0}", mrp);
            s.push_str(&format!("^FO{},{}^A0N,24,24^FD{}^FS\n", x, price_y, mrp_text));
            
            let mrp_width = mrp_text.len() as i32 * 15;
            let line_y_offset = data.mrp_line_offset.unwrap_or(12);
            s.push_str(&format!("^FO{},{}^GB{},2,2^FS\n", x, price_y + line_y_offset, mrp_width));

            let sale_x = x + label_w / 2;
            s.push_str(&format!("^FO{},{}^A0N,24,24^FDRs. {:.0}^FS\n", sale_x, price_y, data.price));
        } else {
            s.push_str(&format!("^FO{},{}^A0N,24,24^FDRs. {:.0}^FS\n", x, price_y, data.price));
        }

        // Row 4: Barcode (Code 128 with human-readable number below)
        s.push_str(&format!("^FO{},{}^BCN,40,Y,N,N^FD{}^FS\n", x, barcode_y, data.barcode));

        s
    };

    let mut cmds = String::new();

    let pairs = data.quantity / 2;
    let remainder = data.quantity % 2;

    // Print pairs (2 labels per row)
    if pairs > 0 {
        cmds.push_str(&format!(
            "^XA\n^PW{}\n^LL{}\n{}{}^PQ{}\n^XZ\n",
            full_w, label_h,
            build_one(lx),
            build_one(rx),
            pairs
        ));
    }

    // Print remainder (1 label, left side only)
    if remainder > 0 {
        cmds.push_str(&format!(
            "^XA\n^PW{}\n^LL{}\n{}^PQ1\n^XZ\n",
            full_w, label_h,
            build_one(lx)
        ));
    }

    cmds
}

/// Build ZPL commands for a batch of labels (2-across layout)
/// Pairs different variants left-right across the printhead
pub fn build_zpl_batch(items: &[LabelBatchItem], _shop_name: &str) -> String {
    let mut cmds = String::new();
    let label_w: i32 = 350;
    let full_w = 812;
    let label_h = 203;

    // 1. Expand items by their quantity
    let expanded: Vec<&LabelBatchItem> = items.iter()
        .flat_map(|item| std::iter::repeat(item).take(item.quantity as usize))
        .collect();

    if expanded.is_empty() {
        return cmds;
    }

    // 2. Pair them left-right
    let mut pairs: Vec<(&LabelBatchItem, Option<&LabelBatchItem>)> = Vec::new();
    let mut i = 0;
    while i < expanded.len() {
        let left = expanded[i];
        let right = if i + 1 < expanded.len() { Some(expanded[i + 1]) } else { None };
        pairs.push((left, right));
        i += 2;
    }

    // Helper: build one ZPL label at position x
    let build_one_zpl = |x: i32, item: &LabelBatchItem| -> String {
        let mut s = String::new();
        let off_y = item.offset_y.unwrap_or(0);
        let size_str = item.size.as_deref().unwrap_or("");
        let color_str = item.color.as_deref().unwrap_or("");
        let sku_str = if item.sku.is_empty() { String::new() } else { format!("ART-{}", item.sku) };

        let name_y = 8 + off_y;
        let sku_y = 34 + off_y;
        let price_y = 54 + off_y;
        let barcode_y = 72 + off_y;

        // Row 1: Product Name + Size
        s.push_str(&format!("^FO{},{}^A0N,22,22^FD{}^FS\n", x, name_y, item.product_name));
        if !size_str.is_empty() {
            let size_x = x + label_w - 50;
            s.push_str(&format!("^FO{},{}^A0N,22,22^FD{}^FS\n", size_x, name_y, size_str));
        }

        // Row 2: SKU + Color
        if !sku_str.is_empty() {
            s.push_str(&format!("^FO{},{}^A0N,18,18^FD{}^FS\n", x, sku_y, sku_str));
        }
        if !color_str.is_empty() {
            let color_x = x + label_w - 70;
            s.push_str(&format!("^FO{},{}^A0N,18,18^FD{}^FS\n", color_x, sku_y, color_str));
        }

        // Row 3: Price
        if let Some(mrp) = item.mrp {
            let mrp_text = format!("MRP: {:.0}", mrp);
            s.push_str(&format!("^FO{},{}^A0N,24,24^FD{}^FS\n", x, price_y, mrp_text));
            
            let mrp_width = mrp_text.len() as i32 * 15;
            let line_y_offset = item.mrp_line_offset.unwrap_or(12);
            s.push_str(&format!("^FO{},{}^GB{},2,2^FS\n", x, price_y + line_y_offset, mrp_width));

            let sale_x = x + label_w / 2;
            s.push_str(&format!("^FO{},{}^A0N,24,24^FDRs. {:.0}^FS\n", sale_x, price_y, item.price));
        } else {
            s.push_str(&format!("^FO{},{}^A0N,24,24^FDRs. {:.0}^FS\n", x, price_y, item.price));
        }

        // Row 4: Barcode
        s.push_str(&format!("^FO{},{}^BCN,40,Y,N,N^FD{}^FS\n", x, barcode_y, item.barcode));

        s
    };

    // 3. Group consecutive identical pairs to compress
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
        let off_x = left.offset_x.unwrap_or(0);
        let lx = 30 + off_x;
        let rx = 430 + off_x;

        let mut label_block = format!("^XA\n^PW{}\n^LL{}\n", full_w, label_h);
        label_block.push_str(&build_one_zpl(lx, left));
        if let Some(r) = right {
            label_block.push_str(&build_one_zpl(rx, r));
        }
        label_block.push_str(&format!("^PQ{}\n^XZ\n", count));
        cmds.push_str(&label_block);

        i += count;
    }

    cmds
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
/// Layout matches professional clothing tag:
///   Line 1: Product Name (left) + Size (right)
///   Line 2: ART-SKU (left) + Color (right)
///   Line 3: MRP: X,XXX (strikethrough) + SALE: X,XXX (bold)  OR  Rs. X,XXX
///   Line 4: Barcode (centered)
///   Line 5: Barcode number (below barcode)
pub fn build_epl2_label(data: &LabelData) -> String {
    let size_str = data.size.as_deref().unwrap_or("");
    let color_str = data.color.as_deref().unwrap_or("");
    let sku_str = if data.sku.is_empty() { String::new() } else { format!("ART-{}", data.sku) };

    let mut cmds = String::new();
    
    let pairs = data.quantity / 2;
    let remainder = data.quantity % 2;

    let off_x = data.offset_x.unwrap_or(0);
    let off_y = data.offset_y.unwrap_or(0);

    let lx = 10 + off_x;    // left label X origin
    let rx = 420 + off_x;   // right label X origin
    let label_w: i32 = 380;      // usable width per label

    // Y positions for each row
    let name_y = 8 + off_y;     // Row 1: Product name + Size
    let sku_y = 32 + off_y;     // Row 2: ART-SKU + Color
    let price_y = 55 + off_y;   // Row 3: MRP/Sale or Price
    let barcode_y = 85 + off_y; // Row 4: Barcode

    let build_one_label = |x: i32| -> String {
        let mut s = String::new();

        // Row 1: Product Name (left, bold) + Size (right)
        s.push_str(&format!("A{},{},0,2,1,1,N,\"{}\"\n", x, name_y, data.product_name));
        if !size_str.is_empty() {
            let size_x = x + label_w - (size_str.len() as i32 * 8);
            s.push_str(&format!("A{},{},0,2,1,1,N,\"{}\"\n", size_x.max(x + 200), name_y, size_str));
        }

        // Row 2: ART-SKU (left) + Color (right)
        if !sku_str.is_empty() {
            s.push_str(&format!("A{},{},0,1,1,1,N,\"{}\"\n", x, sku_y, sku_str));
        }
        if !color_str.is_empty() {
            let color_x = x + label_w - (color_str.len() as i32 * 8);
            s.push_str(&format!("A{},{},0,1,1,1,N,\"{}\"\n", color_x.max(x + 200), sku_y, color_str));
        }

        // Row 3: Price
        if let Some(mrp) = data.mrp {
            let mrp_text = format!("MRP: {:.0}", mrp);
            s.push_str(&format!("A{},{},0,3,1,1,N,\"{}\"\n", x, price_y, mrp_text));
            let mrp_width = mrp_text.len() as i32 * 10;
            let line_y_offset = data.mrp_line_offset.unwrap_or(12);
            s.push_str(&format!("LO{},{},{},2\n", x, price_y + line_y_offset, mrp_width));
            let sale_text = format!("SALE: {:.0}", data.price);
            let sale_x = x + label_w / 2 + 10;
            s.push_str(&format!("A{},{},0,3,1,1,N,\"{}\"\n", sale_x, price_y, sale_text));
        } else {
            s.push_str(&format!("A{},{},0,3,1,1,N,\"Rs. {:.0}\"\n", x, price_y, data.price));
        }

        // Row 4: Barcode (Code 128, with human readable text below)
        let b_width = data.barcode_width.unwrap_or(2);
        let b_height = data.barcode_height.unwrap_or(50);
        s.push_str(&format!("B{},{},0,1,{},2,{},B,\"{}\"\n", x, barcode_y, b_width, b_height, data.barcode));

        s
    };

    let build_content = |include_right: bool| -> String {
        let mut s = String::new();
        s.push_str("\nN\n");
        s.push_str("q812\n");
        s.push_str("Q200,24\n");
        s.push_str("D8\n");
        s.push_str("S2\n");

        s.push_str(&build_one_label(lx));

        if include_right {
            s.push_str(&build_one_label(rx));
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
    pub sku: String,
    pub size: Option<String>,
    pub color: Option<String>,
    pub price: f64,
    pub barcode: String,
    pub quantity: u32,
    pub protocol: Option<String>,
    pub offset_x: Option<i32>,
    pub offset_y: Option<i32>,
    pub barcode_width: Option<i32>,
    pub barcode_height: Option<i32>,
    pub mrp_line_offset: Option<i32>,
    pub mrp: Option<f64>,  // Original price before discount
}

/// Build EPL2 commands for a batch of labels (2-across layout)
/// Pairs items left-right across the printhead
/// Each item's `quantity` field determines how many copies to print
pub fn build_epl2_batch(items: &[LabelBatchItem], _shop_name: &str) -> String {
    let mut cmds = String::new();

    // 1. Expand items by their quantity
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

    // Helper: build one label at position x
    let build_one_batch_label = |x: i32, item: &LabelBatchItem, off_y: i32| -> String {
        let mut s = String::new();
        let label_w: i32 = 380;
        let size_str = item.size.as_deref().unwrap_or("");
        let color_str = item.color.as_deref().unwrap_or("");

        let name_y = 8 + off_y;
        let sku_y = 32 + off_y;
        let price_y = 55 + off_y;
        let barcode_y = 85 + off_y;

        // Row 1: Product Name (left, bold) + Size (right)
        s.push_str(&format!("A{},{},0,2,1,1,N,\"{}\"\n", x, name_y, item.product_name));
        if !size_str.is_empty() {
            let size_x = x + label_w - (size_str.len() as i32 * 8);
            s.push_str(&format!("A{},{},0,2,1,1,N,\"{}\"\n", size_x.max(x + 200), name_y, size_str));
        }

        // Row 2: ART + Color
        if !item.sku.is_empty() {
            s.push_str(&format!("A{},{},0,1,1,1,N,\"ART-{}\"\n", x, sku_y, item.sku));
        }
        if !color_str.is_empty() {
            let color_x = x + label_w - (color_str.len() as i32 * 8);
            s.push_str(&format!("A{},{},0,1,1,1,N,\"{}\"\n", color_x.max(x + 200), sku_y, color_str));
        }

        // Row 3: Price
        if let Some(mrp) = item.mrp {
            let mrp_text = format!("MRP: {:.0}", mrp);
            s.push_str(&format!("A{},{},0,3,1,1,N,\"{}\"\n", x, price_y, mrp_text));
            let mrp_width = mrp_text.len() as i32 * 10;
            // Use the custom mrp_line_offset (defaults to 12 if not provided)
            let line_y_offset = item.mrp_line_offset.unwrap_or(12);
            s.push_str(&format!("LO{},{},{},2\n", x, price_y + line_y_offset, mrp_width));
            let sale_text = format!("SALE: {:.0}", item.price);
            let sale_x = x + label_w / 2 + 10;
            s.push_str(&format!("A{},{},0,3,1,1,N,\"{}\"\n", sale_x, price_y, sale_text));
        } else {
            s.push_str(&format!("A{},{},0,3,1,1,N,\"Rs. {:.0}\"\n", x, price_y, item.price));
        }

        // Row 4: Barcode
        let b_width = item.barcode_width.unwrap_or(2);
        let b_height = item.barcode_height.unwrap_or(50);
        // EPL2 Barcode: B{p1},{p2},{p3},{p4},{p5},{p6},{p7},{p8},"{DATA}"
        // p5 = narrow bar width, p6 = wide bar width
        s.push_str(&format!("B{},{},0,1,{},2,{},B,\"{}\"\n", x, barcode_y, b_width, b_height, item.barcode));

        s
    };

    // 3. Group consecutive identical pairs to compress the payload
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

        let off_x = left.offset_x.unwrap_or(0);
        let off_y = left.offset_y.unwrap_or(0);
        let lx = 10 + off_x;
        let rx = 420 + off_x;

        cmds.push_str("\nN\n");
        cmds.push_str("q812\n");
        cmds.push_str("Q200,24\n");
        cmds.push_str("D8\n");
        cmds.push_str("S2\n");

        // Left label
        cmds.push_str(&build_one_batch_label(lx, left, off_y));

        // Right label
        if let Some(r) = right {
            cmds.push_str(&build_one_batch_label(rx, r, off_y));
        }

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

pub fn test_label_print(config: &PrinterConfig, protocol: &str) -> Result<(), String> {
    let test_data = LabelData {
        shop_name: "TEST SHOP".to_string(),
        product_name: "Test Barcode Label".to_string(),
        sku: "TEST-123".to_string(),
        size: Some("L".to_string()),
        color: Some("Red".to_string()),
        price: 999.0,
        barcode: "123456789".to_string(),
        quantity: 1,
        template: "small".to_string(),
        protocol: protocol.to_string(),
        offset_x: Some(0),
        offset_y: Some(0),
        barcode_width: Some(2),
        barcode_height: Some(50),
        mrp_line_offset: Some(12),
        mrp: None,
    };
    print_label(&test_data, config)
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
/// Detects protocol from first item and uses appropriate builder (ZPL/EPL2)
pub fn print_label_batch(items: &[LabelBatchItem], shop_name: &str, config: &PrinterConfig) -> Result<(), String> {
    // Check protocol from the first item (default to EPL2)
    let protocol = items.first()
        .and_then(|item| item.protocol.as_deref())
        .unwrap_or("epl");

    let cmd_str = match protocol {
        "zpl" => build_zpl_batch(items, shop_name),
        _ => build_epl2_batch(items, shop_name),
    };
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
