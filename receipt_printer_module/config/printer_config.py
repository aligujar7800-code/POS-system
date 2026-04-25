"""
Printer Configuration
Configuration for barcode and receipt printers
"""

# Printer Configuration
PRINTER_CONFIG = {
    # Barcode Printer (Epson thermal label printer)
    'barcode': {
        'type': 'epson',  # epson, zebra, or generic
        'port': None,  # COM port (e.g., 'COM3') or None for Windows print spooler
        'printer_name': None,  # Windows printer name (e.g., 'Epson TM-T20II') or None for port-based
        'label_width_mm': 50,  # Label width in mm (40-50mm recommended)
        'label_height_mm': 25,  # Label height in mm (20-25mm recommended)
        'barcode_height_mm': 20,  # Barcode height in mm
        'dpi': 203,  # Printer DPI (common: 203, 300, 600)
        'barcode_symbology': 'CODE128',  # CODE128, EAN13, CODE39, etc.
        'quiet_zone_mm': 2,  # Quiet zone (margin) in mm
        'font_size': 10,  # Font size for text below barcode
    },
    
    # Receipt Printer (Thermal receipt printer - BC-95AC)
    'receipt': {
        'type': 'epson',  # epson, generic (ESC/POS compatible)
        'port': None,  # COM port - Not needed when using printer_name
        'printer_name': None,  # Windows printer name (from Device Manager → Print queues)
        'paper_width_mm': 80,  # Receipt width in mm (80mm for BC-95AC)
        'characters_per_line': 48,  # Characters per line for 80mm paper
        'encoding': 'utf-8',  # Character encoding
    },
    
    # Store Information (for receipts)
    'store': {
        'name': 'Unique Garments',
        'address': '',
        'phone': '',
        'email': '',
    }
}

# Auto-detect printer ports (set to True to scan for available COM ports)
AUTO_DETECT_PORTS = False

# Default timeout for printer operations (seconds)
PRINTER_TIMEOUT = 5


def get_barcode_printer_config():
    """Get barcode printer configuration"""
    return PRINTER_CONFIG['barcode']


def get_receipt_printer_config():
    """Get receipt printer configuration"""
    return PRINTER_CONFIG['receipt']


def get_store_info():
    """Get store information"""
    return PRINTER_CONFIG['store']


def set_barcode_printer_port(port: str):
    """Set barcode printer COM port"""
    PRINTER_CONFIG['barcode']['port'] = port


def set_receipt_printer_port(port: str):
    """Set receipt printer COM port"""
    PRINTER_CONFIG['receipt']['port'] = port


def set_barcode_printer_name(printer_name: str):
    """Set barcode printer Windows name"""
    PRINTER_CONFIG['barcode']['printer_name'] = printer_name


def set_receipt_printer_name(printer_name: str):
    """Set receipt printer Windows name"""
    PRINTER_CONFIG['receipt']['printer_name'] = printer_name


def set_store_info(name: str, address: str = '', phone: str = '', email: str = ''):
    """Set store information"""
    PRINTER_CONFIG['store']['name'] = name
    PRINTER_CONFIG['store']['address'] = address
    PRINTER_CONFIG['store']['phone'] = phone
    PRINTER_CONFIG['store']['email'] = email


# --- Load persisted shop settings on startup ---
def _load_persisted_settings():
    """Load saved shop settings from shop_settings.json into PRINTER_CONFIG"""
    try:
        from config.shop_settings import load_shop_settings
        saved = load_shop_settings()
        if saved.get('shop_name'):
            PRINTER_CONFIG['store']['name'] = saved['shop_name']
        if saved.get('shop_address'):
            PRINTER_CONFIG['store']['address'] = saved['shop_address']
        if saved.get('shop_phone'):
            PRINTER_CONFIG['store']['phone'] = saved['shop_phone']
        if saved.get('shop_email'):
            PRINTER_CONFIG['store']['email'] = saved['shop_email']
        
        # Load printer selections
        if saved.get('barcode_printer'):
            PRINTER_CONFIG['barcode']['printer_name'] = saved['barcode_printer']
        if saved.get('receipt_printer'):
            PRINTER_CONFIG['receipt']['printer_name'] = saved['receipt_printer']
    except Exception as e:
        print(f"Note: Could not load persisted shop settings: {e}")


_load_persisted_settings()
