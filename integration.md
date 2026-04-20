# POS Hardware Integration Guide

This document contains all the logic and settings required to integrate hardware devices (Barcode Scanner, Receipt Printer, Label Printer) into a Tauri-based POS system. You can copy these settings and code snippets to reuse them in another project.

## 1. Receipt Printer (ESC/POS) & Cash Drawer

Receipt printing uses the ESC/POS protocol via Serial or Network (TCP).

### Backend Logic (Rust)
**File Path:** `src-tauri/src/hardware/printer.rs` (or integrated into `integration.rs`)

```rust
use serialport::SerialPort;
use serde::{Deserialize, Serialize};
use std::io::Write;
use std::time::Duration;

#[derive(Deserialize, Debug, Clone)]
pub struct PrinterConfig {
    pub printer_type: String, // "serial" | "network" | "usb"
    pub port: String,         // COM3, 192.168.1.100:9100, etc.
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
    pub total: f64,
    pub footer: String,
}

pub fn print_receipt(data: &ReceiptData, config: &PrinterConfig) -> Result<(), String> {
    let mut buf: Vec<u8> = Vec::new();
    // Initialize printer
    buf.extend_from_slice(b"\x1b\x40"); 
    // Center & Double Size for Shop Name
    buf.extend_from_slice(b"\x1b\x61\x01\x1b\x21\x30");
    buf.extend_from_slice(data.shop_name.as_bytes());
    buf.extend_from_slice(b"\n\x1b\x21\x00"); // Reset size
    
    // ... (See full printer.rs for details)
    
    // Cut Paper
    buf.extend_from_slice(b"\n\n\n\x1d\x56\x41\x03");
    
    send_bytes(config, &buf)
}

pub fn open_cash_drawer(config: &PrinterConfig) -> Result<(), String> {
    let cmd = b"\x1b\x70\x00\x19\xfa"; // ESC p 0 25 250
    send_bytes(config, cmd)
}
```

---

## 2. Barcode Label Printer (ZPL / TSPL)

Supports printing labels with specific variants (Size, Color).

### Backend Logic (Rust)
**File Path:** `src-tauri/src/hardware/label.rs`

```rust
pub fn build_zpl_label(data: &LabelData) -> String {
    let variant = format!("{} {}", data.size.as_deref().unwrap_or(""), data.color.as_deref().unwrap_or("")).trim().to_string();
    format!(
        "^XA\n^PW464\n^LL304\n\
         ^FO10,10^A0N,20,20^FD{name}^FS\n\
         ^FO10,35^A0N,16,16^FD{variant}^FS\n\
         ^FO10,80^BCN,60,Y,N,N^FD{barcode}^FS\n\
         ^PQ{qty}\n^XZ\n",
        name = data.product_name,
        variant = variant,
        barcode = data.barcode,
        qty = data.quantity
    )
}
```

---

## 3. Barcode Scanner (Keyboard Emulation)

Handles scanners that act as a keyboard by capturing fast inputs ending with "Enter".

### Frontend Logic (TypeScript/React)
**File Path:** `src/hooks/useBarcode.ts`

```typescript
import { useEffect, useRef } from 'react';

export function useBarcode(onScan: (barcode: string) => void) {
  const buffer = useRef('');
  const timer = useRef<any>(null);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Enter') {
        if (buffer.current.length >= 6) {
          onScan(buffer.current);
        }
        buffer.current = '';
        return;
      }

      if (e.key.length === 1) {
        buffer.current += e.key;
        clearTimeout(timer.current);
        timer.current = setTimeout(() => { buffer.current = ''; }, 100);
      }
    }
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [onScan]);
}
```

---

## 4. Hardware Detection

Automatically identifies connected USB or Serial (COM) devices.

### Backend Logic (Rust)
**File Path:** `src-tauri/src/hardware/detection.rs`

```rust
pub fn detect_all_printers() -> Vec<PrinterInfo> {
    let mut all = list_usb_printers();
    all.extend(list_serial_printers());
    all
}
```

---

## 5. Portability Instructions

To use this integration in another POS system:
1. **Dependencies**: Add `serialport`, `rusb`, and `serde` to `src-tauri/Cargo.toml`.
2. **Copy Files**: Copy the `src-tauri/src/hardware/` folder to your new project.
3. **Register Commands**: In `main.rs` or `lib.rs`, register the hardware commands:
   ```rust
   .invoke_handler(tauri::generate_handler![
       detect_printers,
       print_receipt,
       print_label,
       open_cash_drawer
   ])
   ```
4. **Settings**: Ensure your database has a `settings` table to store `printer_type` and `port`.
