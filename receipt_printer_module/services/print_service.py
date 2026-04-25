"""
Print Service
Handles thermal printer receipt printing using ESC/POS commands
"""

from datetime import datetime
from typing import List
from models.sale import Sale, SaleItem
import os
from config.printer_config import get_receipt_printer_config, get_store_info
from config.shop_settings import load_shop_settings
from services.escpos_printer import ESCPOSPrinter


class PrintService:
    """Service for thermal printer receipt operations"""
    
    def __init__(self):
        """Initialize print service with configuration"""
        self.config = get_receipt_printer_config()
        self.store_info = get_store_info()
        self.printer_width = self.config.get('characters_per_line', 48)
    
    def format_receipt(self, sale: Sale, include_refund_items: bool = True, include_due_amount: bool = True) -> List[str]:
        """
        Format sale receipt lines for thermal printer
        Returns list of formatted lines with enhanced visual appeal
        """
        lines = []

        # Load optional header/footer text from settings
        try:
            settings = load_shop_settings()
        except Exception:
            settings = {}
        header_text = (settings.get('receipt_header') or '').strip()
        footer_text = (settings.get('receipt_footer') or '').strip()
        
        # Top spacing - reduced
        # lines.append("") 
        
        # Header - Name removed (logo used instead)
        # lines.append("")
        
        # Sale Info section
        # lines.append("-" * self.printer_width)
        sale_id = sale.id or 'N/A'
        sale_date = sale.date.strftime('%Y-%m-%d %H:%M:%S') if sale.date else datetime.now().strftime('%Y-%m-%d %H:%M:%S')
        
        receipt_type = getattr(sale, 'receipt_type', 'SALE')
        if receipt_type == 'RETURN':
            lines.append(f"Return ID: {sale_id}")
            if getattr(sale, 'original_sale_id', None):
                lines.append(f"Original Sale ID: {sale.original_sale_id}")
            if getattr(sale, 'original_barcode', None):
                lines.append(f"Original Sale Barcode: {sale.original_barcode}")
        else:
            lines.append(f"Sale ID: {sale_id}")
            if sale.barcode:
                lines.append(f"Sale Barcode: {sale.barcode}")
                
        lines.append(f"Date: {sale_date}")
        
        # Customer information
        if sale.customer_name:
            lines.append(f"Customer: {sale.customer_name}")
        if sale.customer_number:
            lines.append(f"Phone: {sale.customer_number}")
        
        # lines.append("-" * self.printer_width)
        lines.append("")

        # Optional custom header (from settings) before items
        if header_text:
            for hline in header_text.splitlines():
                lines.append(hline)
            lines.append("")
        
        # Items Header with better formatting
        lines.append(" " + "-" * (self.printer_width - 2) + " ")
        header = f"{'Item':<18} {'Qty':>4} {'Rate':<9} {'Price':>9}"
        lines.append(header)
        lines.append(" " + "-" * (self.printer_width - 2) + " ")
        lines.append("")
        
        # Items with improved formatting
        for item in sale.items:
            item_name = item.product_name or f"Product {item.product_id}"
            
            # Format price and quantity
            unit_price = item.unit_price if item.unit_price > 0 else item.price
            price_str = f"Rs.{unit_price:>7.2f}"
            qty_str = f"{item.qty:>4}"
            rate_str = f"{(item.rate_type or 'SALE'):<9}"
            
            # Wrap long product names
            max_name_first_line = 18
            max_name_other_lines = 44
            
            if len(item_name) <= max_name_first_line:
                # Name fits on one line
                item_line = f"{item_name:<18} {qty_str} {rate_str} {price_str}"
                lines.append(item_line)
            else:
                # Name is too long, wrap it
                first_part = item_name[:max_name_first_line]
                item_line = f"{first_part:<18} {qty_str} {rate_str} {price_str}"
                lines.append(item_line)
                
                # Wrap remaining name
                remaining = item_name[max_name_first_line:]
                while len(remaining) > 0:
                    wrap_part = remaining[:max_name_other_lines]
                    wrap_line = f"  {wrap_part}"
                    lines.append(wrap_line)
                    remaining = remaining[max_name_other_lines:]
            
            # Show item subtotal if qty > 1
            if item.qty > 1:
                detail_str = f"  @ Rs.{unit_price:.2f} x {item.qty}"
                total_str = f"Rs.{item.total:>8.2f}"
                lines.append(f"{detail_str:<30} {total_str}")
            
            lines.append("-" * self.printer_width)  # Line after each item
        
        # Returned Items
        if include_refund_items and getattr(sale, 'returned_items', None):
            lines.append("")
            lines.append(self._center_text("--- RETURNED ITEMS ---"))
            lines.append("")
            for item in sale.returned_items:
                item_name = f"[RET] {item.product_name or f'Product {item.product_id}'}"
                
                # Format price and quantity
                unit_price = item.unit_price if item.unit_price > 0 else item.price
                price_str = f"-Rs.{unit_price:>6.2f}"
                qty_str = f"{item.qty:>4}"
                rate_str = f"{'RETURN':<9}"
                
                # Wrap long product names
                max_name_first_line = 18
                max_name_other_lines = 44
                
                if len(item_name) <= max_name_first_line:
                    item_line = f"{item_name:<18} {qty_str} {rate_str} {price_str}"
                    lines.append(item_line)
                else:
                    first_part = item_name[:max_name_first_line]
                    item_line = f"{first_part:<18} {qty_str} {rate_str} {price_str}"
                    lines.append(item_line)
                    
                    remaining = item_name[max_name_first_line:]
                    while len(remaining) > 0:
                        wrap_part = remaining[:max_name_other_lines]
                        wrap_line = f"  {wrap_part}"
                        lines.append(wrap_line)
                        remaining = remaining[max_name_other_lines:]
                
                # Show item subtotal if qty > 1
                if item.qty > 1:
                    detail_str = f"  @ -Rs.{unit_price:.2f} x {item.qty}"
                    total_str = f"-Rs.{item.total:>7.2f}"
                    lines.append(f"{detail_str:<30} {total_str}")
                
                lines.append("-" * self.printer_width)
                
        # Total section
        # lines.append(" " + "-" * (self.printer_width - 2) + " ")
        lines.append("")
        
        # Calculate subtotal
        subtotal = sum(item.total for item in sale.items)
        subtotal_str = f"Rs.{subtotal:>8.2f}"
        subtotal_line = f"{'SUBTOTAL:':<30} {subtotal_str}"
        lines.append(subtotal_line)
        
        # Discount if applicable
        if sale.discount and sale.discount > 0:
            discount_str = f"Rs.{sale.discount:>8.2f}"
            discount_line = f"{'DISCOUNT:':<30} {discount_str}"
            lines.append(discount_line)
            lines.append("")
        
        # Final total
        total_str = f"Rs.{sale.total_amount:>8.2f}"
        total_line = f"{'TOTAL AMOUNT:':<30} {total_str}"
        lines.append(total_line)
        
        # Payment details
        paid_amount = getattr(sale, 'paid_amount', sale.total_amount)
        payment_status = getattr(sale, 'payment_status', 'PAID')
        
        if include_due_amount and (payment_status == 'PARTIAL' or payment_status == 'UNPAID' or paid_amount > sale.total_amount):
            lines.append("-" * self.printer_width)
            paid_str = f"Rs.{paid_amount:>8.2f}"
            lines.append(f"{'PAID AMOUNT:':<30} {paid_str}")
            
            balance = sale.total_amount - paid_amount
            if balance < 0:
                ret_str = f"Rs.{abs(balance):>8.2f}"
                lines.append(f"{'RETURN TO CUSTOMER:':<30} {ret_str}")
            else:
                bal_str = f"Rs.{balance:>8.2f}"
                lines.append(f"{'BALANCE DUE:':<30} {bal_str}")
            
        lines.append("=" * self.printer_width) # Double line after total
        
        # Shop contact information block (after items & totals)
        # lines.append("=" * self.printer_width)
        if self.store_info.get('name'):
            lines.append(self._center_text(self.store_info['name']))
        if self.store_info.get('address'):
            lines.append(self._center_text(self.store_info['address']))
        if self.store_info.get('phone'):
            lines.append(self._center_text(f"Tel: {self.store_info['phone']}"))
        if self.store_info.get('email'):
            lines.append(self._center_text(self.store_info['email']))
        # lines.append("=" * self.printer_width)
        lines.append("")

        # Optional custom footer (intended for return policy etc.)
        if footer_text:
            for fline in footer_text.splitlines():
                lines.append(self._center_text(fline))
            lines.append("")

        # Greetings (maximum two lines, after policy)
        lines.append(self._center_text("Thank You For Shopping!"))
        lines.append(self._center_text("Visit Us Again"))
        lines.append("")

        # lines.append("=" * self.printer_width)
        # lines.append("=" * self.printer_width)
        
        # Bottom spacing
        lines.append("")
        lines.append("")
        
        return lines
    
    def _center_text(self, text: str) -> str:
        """Center text within receipt width"""
        padding = (self.printer_width - len(text)) // 2
        return " " * padding + text
    
    def _get_logo_path(self):
        """Get the shop logo path from settings"""
        try:
            from config.shop_settings import load_shop_settings
            settings = load_shop_settings()
            logo_path = settings.get('logo_path', '')
            if logo_path and os.path.exists(logo_path):
                return logo_path
        except Exception:
            pass
        return None

    def _print_logo(self, printer):
        """Print shop logo on the thermal printer using the improved print_image method"""
        logo_path = self._get_logo_path()
        if not logo_path:
            return
        
        try:
            # Load printing mode from settings
            settings = load_shop_settings()
            print_mode = settings.get('logo_print_mode', 'compatibility')
            use_bit_image = (print_mode == 'compatibility')
            
            # Set center alignment for logo
            printer.set_justification('center')
            
            # Use the new print_image method with the selected mode
            # 'compatibility' uses ESC * which is much safer for older/generic printers
            printer.print_image(logo_path, max_width=300, bit_image=use_bit_image)
            
            printer.print_line("")  # Add spacing after logo
            printer.set_justification('left')
            
        except Exception as e:
            print(f"Could not print logo: {e}")

    def print_receipt(self, sale: Sale, save_to_file: bool = True, include_refund_items: bool = True, include_due_amount: bool = True) -> bool:
        """
        Print receipt to thermal printer as plain text with logo.
        Returns True if successful
        """
        # Check if printer is selected
        if not self.config.get('printer_name') and not self.config.get('port'):
            print("Receipt printer not selected in settings. Skipping receipt generation.")
            return False

        receipt_lines = self.format_receipt(sale, include_refund_items=include_refund_items, include_due_amount=include_due_amount)
        receipt_text = "\n".join(receipt_lines)
        
        # Save to file (for testing or backup)
        if save_to_file:
            receipt_dir = "receipts"
            if not os.path.exists(receipt_dir):
                os.makedirs(receipt_dir)
            
            filename = f"receipt_{sale.id or datetime.now().strftime('%Y%m%d_%H%M%S')}.txt"
            filepath = os.path.join(receipt_dir, filename)
            
            try:
                with open(filepath, 'w', encoding='utf-8') as f:
                    f.write(receipt_text)
                print(f"Receipt saved to: {filepath}")
            except Exception as e:
                print(f"Error saving receipt: {e}")
        
        # Print to thermal printer
        try:
            printer = ESCPOSPrinter(printer_type='receipt')
            
            if not printer.connect():
                # Printer not connected, just print to console
                print("\n" + receipt_text)
                return True
            
            # Initialize printer
            printer.initialize()
            
            # Print logo first (if available)
            self._print_logo(printer)
            
            # Print each line as plain text
            for line in receipt_lines:
                printer.print_line(line)
                
            # Print Barcode at the footer
            if sale.barcode:
                printer.set_justification('center')
                # parameters: data, height=60 dots, width=2, hri_position=2 (below), hri_font=0
                printer.print_barcode_code128(sale.barcode, height=60, width=2, hri_position=2, hri_font=0)
                printer.print_line("")
                printer.set_justification('left')
            
            # Feed paper
            printer.feed_lines(3)
            
            # Cut paper (full cut)
            printer.cut_paper(full_cut=True)
            
            # Flush buffered data (important for Windows print spooler)
            printer.flush()
            
            # Disconnect
            printer.disconnect()
            
            return True
            
        except Exception as e:
            print(f"Error printing receipt: {str(e)}")
            # Fallback: print to console
            print("\n" + receipt_text)
            return False
    
    def set_store_info(self, name: str, address: str = "", phone: str = ""):
        """
        Set store information for receipts
        (Also updates global config)
        """
        from config.printer_config import set_store_info
        set_store_info(name, address, phone)
        self.store_info = get_store_info()

    def print_raw_text(self, text: str) -> bool:
        """Print raw text to thermal printer"""
        receipt_lines = text.splitlines()
        try:
            printer = ESCPOSPrinter(printer_type='receipt')
            
            if not printer.connect():
                # Printer not connected, just print to console
                print("\nRaw Text Print Fallback:\n" + text)
                return True
            
            # Initialize printer
            printer.initialize()
            
            # Print each line as plain text
            for line in receipt_lines:
                printer.print_line(line)
                
            # Feed paper
            printer.feed_lines(3)
            
            # Cut paper (full cut)
            printer.cut_paper(full_cut=True)
            
            # Flush buffered data
            printer.flush()
            
            # Disconnect
            printer.disconnect()
            
            return True
            
        except Exception as e:
            print(f"Error printing raw text: {str(e)}")
            # Fallback: print to console
            print("\n" + text)
            return False

    def print_html_a4(self, html_content: str, document_name: str = "Report") -> bool:
        """Print HTML content to A4 size via system print dialog"""
        try:
            from PyQt5.QtPrintSupport import QPrinter, QPrintDialog
            from PyQt5.QtGui import QTextDocument
            
            printer = QPrinter(QPrinter.HighResolution)
            # A4 is standard
            printer.setPageSize(QPrinter.A4)
            printer.setDocName(document_name)
            
            dialog = QPrintDialog(printer)
            if dialog.exec_() == QPrintDialog.Accepted:
                document = QTextDocument()
                document.setHtml(html_content)
                document.print_(printer)
                return True
            return False
            
        except ImportError as e:
            print(f"Missing QtPrintSupport library: {e}")
            return False
        except Exception as e:
            print(f"Error printing A4 report: {e}")
            return False
