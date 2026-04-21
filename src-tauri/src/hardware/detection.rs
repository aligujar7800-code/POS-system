use serde::{Deserialize, Serialize};

/// Known USB printer VID/PID pairs
const KNOWN_PRINTERS: &[(u16, u16, &str)] = &[
    (0x0483, 0x5740, "Xprinter"),
    (0x04b8, 0x0202, "Epson TM-T20"),
    (0x04b8, 0x0e15, "Epson TM-T88"),
    (0x0519, 0x0003, "Star TSP"),
    (0x154f, 0x0520, "Generic ESC/POS"),
    (0x0456, 0x0808, "Bixolon"),
];

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct PrinterInfo {
    pub port: String,
    pub name: String,
    pub printer_type: String, // "usb" | "serial" | "network"
    pub model_guess: String,
    pub vid: Option<u16>,
    pub pid: Option<u16>,
}

pub fn list_usb_printers() -> Vec<PrinterInfo> {
    let mut result = Vec::new();

    match rusb::devices() {
        Ok(list) => {
            for device in list.iter() {
                if let Ok(desc) = device.device_descriptor() {
                    let vid = desc.vendor_id();
                    let pid = desc.product_id();

                    // Check if device class is printer (7) or match known list
                    let is_printer = desc.class_code() == 7
                        || KNOWN_PRINTERS.iter().any(|(v, p, _)| *v == vid && *p == pid);
                        
                    // Check if device is HID (3), typically used by Barcode Scanners
                    let mut is_hid = desc.class_code() == 3;
                    
                    // If device class is 0, check interfaces for HID (3)
                    if !is_hid && desc.class_code() == 0 {
                        if let Ok(config) = device.active_config_descriptor() {
                            for interface in config.interfaces() {
                                for interface_desc in interface.descriptors() {
                                    if interface_desc.class_code() == 3 {
                                        is_hid = true;
                                        break;
                                    }
                                }
                            }
                        }
                    }

                    if is_printer || is_hid {
                        let mut name_guess = None;
                        
                        // Try to get real product name from USB device strings
                        if let Ok(handle) = device.open() {
                            // Some devices might hang on string reading, so we ignore errors
                            if let Ok(mfg) = handle.read_manufacturer_string_ascii(&desc) {
                                if let Ok(prod) = handle.read_product_string_ascii(&desc) {
                                    if !mfg.is_empty() && !prod.is_empty() {
                                        name_guess = Some(format!("{} {}", mfg.trim(), prod.trim()));
                                    } else if !prod.is_empty() {
                                        name_guess = Some(prod.trim().to_string());
                                    }
                                }
                            }
                        }

                        let model = if let Some(n) = name_guess {
                            n
                        } else if is_printer {
                            KNOWN_PRINTERS
                                .iter()
                                .find(|(v, p, _)| *v == vid && *p == pid)
                                .map(|(_, _, m)| m.to_string())
                                .unwrap_or_else(|| format!("USB Printer {:04x}:{:04x}", vid, pid))
                        } else {
                            format!("USB Barcode Scanner / Input Device ({:04x}:{:04x})", vid, pid)
                        };

                        let ptype = if is_printer { "usb" } else { "usb_hid" };

                        result.push(PrinterInfo {
                            port: format!("usb:{:04x}:{:04x}", vid, pid),
                            name: model.clone(),
                            printer_type: ptype.to_string(),
                            model_guess: model,
                            vid: Some(vid),
                            pid: Some(pid),
                        });
                    }
                }
            }
        }
        Err(e) => {
            eprintln!("USB enumeration error (non-fatal): {}", e);
        }
    }

    result
}

pub fn list_serial_printers() -> Vec<PrinterInfo> {
    let mut result = Vec::new();
    match serialport::available_ports() {
        Ok(ports) => {
            for port in ports {
                let model = match &port.port_type {
                    serialport::SerialPortType::UsbPort(info) => {
                        let vid = info.vid;
                        let pid = info.pid;
                        KNOWN_PRINTERS
                            .iter()
                            .find(|(v, p, _)| *v == vid && *p == pid)
                            .map(|(_, _, m)| m.to_string())
                            .unwrap_or_else(|| "Serial/COM Printer".to_string())
                    }
                    _ => "Serial Port Device".to_string(),
                };
                result.push(PrinterInfo {
                    port: port.port_name.clone(),
                    name: port.port_name.clone(),
                    printer_type: "serial".to_string(),
                    model_guess: model,
                    vid: None,
                    pid: None,
                });
            }
        }
        Err(e) => eprintln!("Serial port scan error (non-fatal): {}", e),
    }
    result
}

pub fn list_system_printers() -> Vec<PrinterInfo> {
    let mut result = Vec::new();
    let printers = printers::get_printers();
    for p in printers {
        result.push(PrinterInfo {
            port: p.name.clone(),
            name: p.name.clone(),
            printer_type: "system".to_string(),
            model_guess: p.name,
            vid: None,
            pid: None,
        });
    }
    result
}

pub fn detect_all_printers() -> Vec<PrinterInfo> {
    let mut all = list_usb_printers();
    all.extend(list_serial_printers());
    all.extend(list_system_printers());
    all
}
