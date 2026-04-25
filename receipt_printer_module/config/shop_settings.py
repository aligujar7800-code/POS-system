"""
Shop Settings Persistence
Reads/writes shop settings (name, address, phone, email, logo) to a JSON file
so they survive application restarts.
"""

import json
import os
import sys

# Settings file path - next to executable or in project root
def _get_settings_path():
    """Get the path for shop_settings.json"""
    if getattr(sys, 'frozen', False):
        # Running as compiled exe
        base_dir = os.path.dirname(sys.executable)
    else:
        # Running as script
        base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    return os.path.join(base_dir, 'shop_settings.json')


SETTINGS_FILE = _get_settings_path()

DEFAULT_SETTINGS = {
    'shop_name': 'Unique Garments',
    'shop_address': '',
    'shop_phone': '',
    'shop_email': '',
    'logo_path': '',
    'barcode_printer': '',
    'receipt_printer': '',
    # Optional extra text sections for receipts
    # These are shown on both the printed and on‑screen receipts.
    'receipt_header': '',
    'receipt_footer': "RETURN POLICY\nReceipt and barcode on item\nare required for returns.",
    'logo_print_mode': 'compatibility',  # 'compatibility' (ESC *) or 'standard' (GS v 0)
}


def load_shop_settings() -> dict:
    """Load shop settings from JSON file, returns defaults if file not found"""
    try:
        if os.path.exists(SETTINGS_FILE):
            with open(SETTINGS_FILE, 'r', encoding='utf-8') as f:
                saved = json.load(f)
                # Merge with defaults so new keys are always present
                merged = DEFAULT_SETTINGS.copy()
                merged.update(saved)
                return merged
    except Exception as e:
        print(f"Error loading shop settings: {e}")
    
    return DEFAULT_SETTINGS.copy()


def save_shop_settings(settings: dict) -> bool:
    """Save shop settings to JSON file. Returns True on success."""
    try:
        with open(SETTINGS_FILE, 'w', encoding='utf-8') as f:
            json.dump(settings, f, indent=4, ensure_ascii=False)
        return True
    except Exception as e:
        print(f"Error saving shop settings: {e}")
        return False
