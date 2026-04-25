# Receipt Printing Module

This module contains the complete logic for thermal receipt printing using ESC/POS commands. It is designed to be portable and easily integrated into other Python applications.

## Directory Structure

```
receipt_printer_module/
├── config/
│   ├── printer_config.py      # Core printer configuration logic
│   └── shop_settings.py       # Shop name, address, and receipt header/footer settings
├── services/
│   ├── print_service.py       # High-level receipt formatting and printing service
│   └── escpos_printer.py      # Low-level ESC/POS command generation and communication
├── models/
│   └── sale.py                # Data models for Sales and Sale Items (used by print service)
├── printer_config.json        # JSON storage for printer selection
├── shop_settings.json         # JSON storage for shop details
└── requirements.txt           # Required Python libraries
```

## How It Works

1.  **Low-Level (`escpos_printer.py`)**: Handles raw byte communication with the printer via the Windows Print Spooler (`win32print`) or Serial COM ports. It translates commands like `initialize`, `cut`, `barcode`, and `justification` into ESC/POS bytes.
2.  **High-Level (`print_service.py`)**: Takes a `Sale` object and converts it into a formatted list of strings (the receipt layout). It handles wrapping long product names, calculating totals/discounts, and adding shop info.
3.  **Configuration**: Settings are persisted in JSON files and loaded via the `config` module.

## Requirements

Install dependencies using:
```bash
pip install -r requirements.txt
```

Main dependencies:
- `pywin32`: For Windows printer communication
- `pyserial`: For COM port communication
- `Pillow`: For printing logos/images

## Integration Example

```python
from services.print_service import PrintService
from models.sale import Sale, SaleItem
from datetime import datetime

# 1. Create a sale object
sale = Sale(
    id=101,
    customer_name="John Doe",
    total_amount=1500.0,
    items=[
        SaleItem(product_name="Product A", qty=2, price=500.0),
        SaleItem(product_name="Product B", qty=1, price=500.0)
    ],
    date=datetime.now()
)

# 2. Initialize and print
printer = PrintService()
printer.print_receipt(sale)
```
