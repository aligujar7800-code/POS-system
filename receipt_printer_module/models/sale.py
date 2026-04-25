"""
Sale Models
"""

from dataclasses import dataclass
from datetime import datetime
from typing import Optional, List


@dataclass
class SaleItem:
    """Individual sale item model"""
    id: Optional[int] = None
    sale_id: Optional[int] = None
    product_id: int = 0
    product_name: Optional[str] = None
    product_barcode: Optional[str] = None
    qty: int = 0
    price: float = 0.0
    unit_price: float = 0.0
    cost_price: float = 0.0
    rate_type: str = "SALE"

    def __post_init__(self):
        # Sync price and unit_price when one is set
        if self.unit_price == 0.0 and self.price > 0.0:
            self.unit_price = self.price
        elif self.price == 0.0 and self.unit_price > 0.0:
            self.price = self.unit_price
    
    @property
    def total(self):
        """Calculate item total (sale amount)"""
        return self.qty * (self.unit_price if self.unit_price > 0 else self.price)
    
    @property
    def cost_total(self):
        """Calculate total cost amount"""
        return self.qty * self.cost_price
    
    @property
    def profit(self):
        """Calculate item profit"""
        return self.total - self.cost_total
    
    def to_dict(self):
        """Convert to dictionary"""
        return {
            'id': self.id,
            'sale_id': self.sale_id,
            'product_id': self.product_id,
            'product_name': self.product_name,
            'product_barcode': self.product_barcode,
            'qty': self.qty,
            'price': float(self.price),
            'unit_price': float(self.unit_price),
            'cost_price': float(self.cost_price),
            'rate_type': self.rate_type,
            'total': float(self.total),
            'cost_total': float(self.cost_total),
            'profit': float(self.profit)
        }
    
    @classmethod
    def from_dict(cls, data):
        """Create from dictionary"""
        return cls(
            id=data.get('id'),
            sale_id=data.get('sale_id'),
            product_id=data.get('product_id', 0),
            product_name=data.get('product_name'),
            product_barcode=data.get('product_barcode'),
            qty=data.get('qty', 0),
            price=float(data.get('price', 0.0)),
            unit_price=float(data.get('unit_price', 0.0)),
            cost_price=float(data.get('cost_price', 0.0)),
            rate_type=data.get('rate_type', 'SALE') or 'SALE'
        )


@dataclass
class Sale:
    """Sale model"""
    id: Optional[int] = None
    receipt_type: str = 'SALE'  # SALE or RETURN
    barcode: Optional[str] = None
    total_amount: float = 0.0
    customer_name: Optional[str] = None
    customer_number: Optional[str] = None
    discount: float = 0.0
    discount_percentage: float = 0.0
    paid_amount: float = 0.0
    payment_status: str = 'PAID'
    account_id: Optional[int] = None
    date: Optional[datetime] = None
    items: List[SaleItem] = None
    returned_items: List[SaleItem] = None
    return_receipts: List[dict] = None
    original_sale_id: Optional[int] = None
    original_barcode: Optional[str] = None
    is_deleted: bool = False
    delete_reason: Optional[str] = None
    
    def __post_init__(self):
        if self.items is None:
            self.items = []
        if self.returned_items is None:
            self.returned_items = []
        if self.return_receipts is None:
            self.return_receipts = []
    
    @property
    def subtotal(self):
        """Calculate subtotal before discount"""
        return sum(item.total for item in self.items)
    
    @property
    def final_amount(self):
        """Calculate final amount after discount"""
        return max(0.0, self.subtotal - self.discount)
    
    def to_dict(self):
        """Convert to dictionary"""
        return {
            'id': self.id,
            'receipt_type': self.receipt_type,
            'barcode': self.barcode,
            'total_amount': float(self.total_amount),
            'customer_name': self.customer_name,
            'customer_number': self.customer_number,
            'discount': float(self.discount),
            'discount_percentage': float(self.discount_percentage),
            'paid_amount': float(self.paid_amount),
            'payment_status': self.payment_status,
            'account_id': self.account_id,
            'date': self.date.isoformat() if self.date else None,
            'is_deleted': self.is_deleted,
            'delete_reason': self.delete_reason,
            'items': [item.to_dict() for item in self.items]
        }
    
    @classmethod
    def from_dict(cls, data):
        """Create from dictionary"""
        items_data = data.get('items', [])
        items = [SaleItem.from_dict(item) for item in items_data] if items_data else []
        
        return cls(
            id=data.get('id'),
            receipt_type=data.get('receipt_type', 'SALE'),
            barcode=data.get('barcode'),
            total_amount=float(data.get('total_amount', 0.0)),
            customer_name=data.get('customer_name'),
            customer_number=data.get('customer_number'),
            discount=float(data.get('discount', 0.0)),
            discount_percentage=float(data.get('discount_percentage', 0.0)),
            paid_amount=float(data.get('paid_amount', 0.0)),
            payment_status=data.get('payment_status', 'PAID'),
            account_id=data.get('account_id'),
            date=data.get('date'),
            items=items,
            is_deleted=bool(data.get('is_deleted', False)),
            delete_reason=data.get('delete_reason')
        )



