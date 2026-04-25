"""
ESC/POS Printer Utility
Handles low-level ESC/POS command generation and printer communication
"""

import os
import platform
from typing import Optional, Tuple
from config.printer_config import PRINTER_CONFIG, PRINTER_TIMEOUT


class ESCPOSPrinter:
    """Low-level ESC/POS printer communication"""
    
    # ESC/POS Command Constants
    ESC = b'\x1B'
    GS = b'\x1D'
    DLE = b'\x10'
    NUL = b'\x00'
    LF = b'\n'
    CR = b'\r'
    
    def __init__(self, printer_type: str = 'barcode'):
        """
        Initialize printer
        printer_type: 'barcode' or 'receipt'
        """
        self.printer_type = printer_type
        self.config = PRINTER_CONFIG[printer_type]
        self.connection = None
        self.is_windows = platform.system() == 'Windows'
        self.encoding = self.config.get('encoding', 'cp437') # Default to PC437 for most thermal printers
    
    def connect(self) -> bool:
        """
        Connect to printer
        Returns True if successful
        """
        try:
            # Try Windows print spooler first if printer name is set
            if self.config.get('printer_name'):
                return self._connect_windows_spooler()
            
            # Try COM port if port is set
            if self.config.get('port'):
                return self._connect_serial()
            
            # No connection method configured
            print(f"Warning: No printer connection method configured for {self.printer_type} printer")
            return False
            
        except Exception as e:
            print(f"Error connecting to printer: {e}")
            return False
    
    def _connect_windows_spooler(self) -> bool:
        """Connect via Windows print spooler"""
        if not self.is_windows:
            return False
        
        try:
            import win32print
            import win32ui
            import win32con
            
            printer_name = self.config['printer_name']
            
            # Open printer
            hprinter = win32print.OpenPrinter(printer_name)
            if hprinter:
                self.connection = {
                    'type': 'windows_spooler',
                    'handle': hprinter,
                    'name': printer_name,
                    'buffer': bytearray()  # Buffer for ESC/POS commands
                }
                return True
        except ImportError:
            print("win32print not available. Install with: pip install pywin32")
        except Exception as e:
            print(f"Error connecting to Windows printer: {e}")
        
        return False
    
    def _connect_serial(self) -> bool:
        """Connect via serial/USB port"""
        try:
            import serial
            
            port = self.config['port']
            baudrate = self.config.get('baudrate', 9600)
            timeout = PRINTER_TIMEOUT
            
            ser = serial.Serial(port, baudrate, timeout=timeout)
            self.connection = {
                'type': 'serial',
                'handle': ser,
                'port': port
            }
            return True
            
        except ImportError:
            print("pyserial not available. Install with: pip install pyserial")
        except Exception as e:
            print(f"Error connecting to serial port {port}: {e}")
        
        return False
    
    def disconnect(self):
        """Disconnect from printer"""
        if not self.connection:
            return
        
        try:
            if self.connection['type'] == 'serial':
                self.connection['handle'].close()
            elif self.connection['type'] == 'windows_spooler' and self.is_windows:
                import win32print
                win32print.ClosePrinter(self.connection['handle'])
        except Exception as e:
            print(f"Error disconnecting printer: {e}")
        
        self.connection = None
    
    def send_raw(self, data: bytes) -> bool:
        """
        Send raw data to printer
        Returns True if successful
        
        Note: For Windows print spooler, data is buffered and sent when flush() is called
        """
        if not self.connection:
            return False
        
        try:
            if self.connection['type'] == 'serial':
                self.connection['handle'].write(data)
                return True
            elif self.connection['type'] == 'windows_spooler' and self.is_windows:
                # Buffer data for Windows spooler (will be sent on flush)
                if 'buffer' not in self.connection:
                    self.connection['buffer'] = bytearray()
                self.connection['buffer'].extend(data)
                return True
        except Exception as e:
            print(f"Error sending data to printer: {e}")
            return False
        
        return False
    
    def flush(self) -> bool:
        """
        Flush buffered data to printer (for Windows print spooler)
        Returns True if successful
        """
        if not self.connection:
            return False
        
        if self.connection['type'] == 'windows_spooler' and self.is_windows:
            try:
                import win32print
                hprinter = self.connection['handle']
                
                if 'buffer' in self.connection and len(self.connection['buffer']) > 0:
                    data = bytes(self.connection['buffer'])
                    job_info = ("POS Print", None, "RAW")
                    job = win32print.StartDocPrinter(hprinter, 1, job_info)
                    try:
                        win32print.StartPagePrinter(hprinter)
                        win32print.WritePrinter(hprinter, data)
                        win32print.EndPagePrinter(hprinter)
                    finally:
                        win32print.EndDocPrinter(hprinter)
                    
                    # Clear buffer
                    self.connection['buffer'] = bytearray()
                
                return True
            except Exception as e:
                print(f"Error flushing printer data: {e}")
                return False
        
        return True
    
    def initialize(self):
        """Initialize printer (ESC @)"""
        cmd = self.ESC + b'@'
        return self.send_raw(cmd)
    
    def set_justification(self, alignment: str = 'left'):
        """
        Set text justification
        alignment: 'left', 'center', 'right'
        """
        if alignment == 'left':
            cmd = self.ESC + b'a\x00'
        elif alignment == 'center':
            cmd = self.ESC + b'a\x01'
        elif alignment == 'right':
            cmd = self.ESC + b'a\x02'
        else:
            cmd = self.ESC + b'a\x00'
        
        return self.send_raw(cmd)
    
    def set_font(self, font: str = 'A'):
        """
        Set font
        font: 'A' (12x24) or 'B' (9x17)
        """
        if font == 'B':
            cmd = self.ESC + b'!\x01'
        else:
            cmd = self.ESC + b'!\x00'
        return self.send_raw(cmd)
    
    def set_text_size(self, width: int = 1, height: int = 1):
        """
        Set text size (1-8)
        """
        if not (1 <= width <= 8 and 1 <= height <= 8):
            return False
        
        size = (width - 1) | ((height - 1) << 4)
        cmd = self.GS + b'!' + bytes([size])
        return self.send_raw(cmd)
    
    def print_text(self, text: str):
        """Print text with configured encoding"""
        return self.send_raw(text.encode(self.encoding, errors='ignore'))
    
    def print_line(self, text: str = ""):
        """Print line with line feed and configured encoding"""
        data = text.encode(self.encoding, errors='ignore') + self.LF
        return self.send_raw(data)
    
    def feed_lines(self, lines: int = 1):
        """Feed paper (lines)"""
        cmd = self.ESC + b'd' + bytes([lines])
        return self.send_raw(cmd)
    
    def cut_paper(self, full_cut: bool = True):
        """
        Cut paper
        full_cut: True for full cut, False for partial cut
        """
        if full_cut:
            cmd = self.GS + b'V\x00'  # Full cut
        else:
            cmd = self.GS + b'V\x01'  # Partial cut
        return self.send_raw(cmd)
    
    def print_barcode_code128(self, data: str, height: int = 100, width: int = 2, 
                              hri_position: int = 2, hri_font: int = 0):
        """
        Print CODE128 barcode using ESC/POS commands
        data: Barcode data string
        height: Barcode height in dots (default 100)
        width: Bar width (1-6, default 2)
        hri_position: Human Readable Interpretation position (0=none, 1=above, 2=below, 3=above+below)
        hri_font: HRI font (0=font A, 1=font B)
        """
        if not (1 <= width <= 6):
            width = 2
        
        # Set barcode parameters FIRST (before printing)
        # Set barcode height (GS h n) - height in dots
        cmd_height = self.GS + b'h' + bytes([min(height, 255)])
        self.send_raw(cmd_height)
        
        # Set barcode width (GS w n) - width multiplier (1-6)
        cmd_width = self.GS + b'w' + bytes([width])
        self.send_raw(cmd_width)
        
        # Set HRI position (GS H n)
        cmd_hri_pos = self.GS + b'H' + bytes([hri_position])
        self.send_raw(cmd_hri_pos)
        
        # Set HRI font (GS f n)
        cmd_hri_font = self.GS + b'f' + bytes([hri_font])
        self.send_raw(cmd_hri_font)
        
        # Print barcode: GS k m n d1...dn NUL
        # m = 73 for CODE128
        # n = number of data bytes (0-255)
        data_bytes = data.encode('ascii', errors='ignore')
        data_len = len(data_bytes)
        if data_len > 255:
            data_bytes = data_bytes[:255]
            data_len = 255
        
        cmd = self.GS + b'k'
        cmd += bytes([73])  # CODE128
        cmd += bytes([data_len])  # Length of data
        cmd += data_bytes  # Barcode data
        cmd += self.NUL  # Terminator
        
        # Print barcode
        return self.send_raw(cmd)
    
    def set_label_mode(self):
        """Set printer to label mode (if supported)"""
        # Some Epson printers support label mode
        # This is model-specific, but commonly:
        # ESC i a (set label mode)
        cmd = self.ESC + b'i\x01'  # Label mode on
        return self.send_raw(cmd)

    def print_image(self, img_path: str, max_width: int = 300, bit_image: bool = False):
        """
        Print an image to the thermal printer
        img_path: Path to the image file
        max_width: Maximum width in dots
        bit_image: If True, use ESC * (Bit Image) instead of GS v 0 (Raster).
                  ESC * is more compatible with older/cheap printers.
        """
        if not os.path.exists(img_path):
            return False

        try:
            from PIL import Image
            img = Image.open(img_path)
            
            # Convert to gray then resize
            img = img.convert('L')
            width, height = img.size
            if width > max_width:
                ratio = max_width / width
                new_size = (max_width, int(height * ratio))
                img = img.resize(new_size, Image.LANCZOS)
            
            # Convert to 1-bit monochrome
            img = img.convert('1')
            width, height = img.size
            pixels = img.load()
            
            if bit_image:
                # ESC * m nL nH d1...dk (Bit Image mode)
                # m=33 (24-dot double density)
                # Process 24 vertical pixels at a time
                for y_offset in range(0, height, 24):
                    # Header: ESC * m nL nH
                    header = self.ESC + b'*' + bytes([33]) + bytes([width % 256, width // 256])
                    self.send_raw(header)
                    
                    for x in range(width):
                        # 24 bits (3 bytes) per vertical slice
                        column_data = bytearray([0, 0, 0])
                        for bit_idx in range(24):
                            y = y_offset + bit_idx
                            if y < height:
                                if pixels[x, y] == 0:  # Black
                                    byte_pos = bit_idx // 8
                                    bit_pos = 7 - (bit_idx % 8)
                                    column_data[byte_pos] |= (1 << bit_pos)
                        self.send_raw(bytes(column_data))
                    
                    self.send_raw(self.LF) # Next line
                return True
            else:
                # GS v 0 m xL xH yL yH d1...dk (Raster bit image)
                bytes_per_row = (width + 7) // 8
                xL = bytes_per_row & 0xFF
                xH = (bytes_per_row >> 8) & 0xFF
                yL = height & 0xFF
                yH = (height >> 8) & 0xFF
                
                header = self.GS + b'v0\x00' + bytes([xL, xH, yL, yH])
                self.send_raw(header)
                
                raster_data = bytearray()
                for y in range(height):
                    for byte_x in range(bytes_per_row):
                        byte_val = 0
                        for bit in range(8):
                            x = byte_x * 8 + bit
                            if x < width:
                                if pixels[x, y] == 0:  # Black
                                    byte_val |= (0x80 >> bit)
                        raster_data.append(byte_val)
                    
                    # Send every row to avoid huge buffer
                    if len(raster_data) > 1024:
                        self.send_raw(bytes(raster_data))
                        raster_data = bytearray()
                
                if raster_data:
                    self.send_raw(bytes(raster_data))
                
                return True

        except ImportError:
            print("PIL not available")
            return False
        except Exception as e:
            print(f"Error printing image: {e}")
            return False
    
    def __enter__(self):
        """Context manager entry"""
        self.connect()
        return self
    
    def __exit__(self, exc_type, exc_val, exc_tb):
        """Context manager exit"""
        self.disconnect()

