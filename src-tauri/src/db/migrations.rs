use rusqlite::{Connection, Result, params};

pub fn run_migrations(conn: &Connection) -> Result<()> {
    conn.execute_batch("PRAGMA journal_mode=WAL;")?;
    conn.execute_batch("PRAGMA foreign_keys=ON;")?;

    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS schema_version (version INTEGER NOT NULL);",
    )?;

    let current_version: i64 = conn
        .query_row(
            "SELECT COALESCE(MAX(version), 0) FROM schema_version",
            [],
            |r| r.get(0),
        )
        .unwrap_or(0);

    if current_version < 1 {
        conn.execute_batch(MIGRATION_V1)?;
        conn.execute("INSERT INTO schema_version VALUES (1)", [])?;
    }

    if current_version < 2 {
        conn.execute_batch(MIGRATION_V2)?;
        conn.execute("INSERT INTO schema_version VALUES (2)", [])?;
    }

    if current_version < 3 {
        conn.execute_batch(MIGRATION_V3)?;
        conn.execute("INSERT INTO schema_version VALUES (3)", [])?;
    }
    if current_version < 4 {
        conn.execute_batch(MIGRATION_V4)?;
        conn.execute("INSERT INTO schema_version VALUES (4)", [])?;
    }
    if current_version < 5 {
        conn.execute_batch(MIGRATION_V5)?;
        conn.execute("INSERT INTO schema_version VALUES (5)", [])?;
    }
    if current_version < 6 {
        conn.execute_batch(MIGRATION_V6)?;
        conn.execute("INSERT INTO schema_version VALUES (6)", [])?;
    }
    if current_version < 7 {
        conn.execute_batch(MIGRATION_V7)?;
        conn.execute("INSERT INTO schema_version VALUES (7)", [])?;
    }
    if current_version < 8 {
        conn.execute_batch(MIGRATION_V8)?;
        conn.execute("INSERT INTO schema_version VALUES (8)", [])?;
    }
    if current_version < 9 {
        conn.execute_batch(MIGRATION_V9)?;
        conn.execute("INSERT INTO schema_version VALUES (9)", [])?;
    }
    if current_version < 10 {
        conn.execute_batch(MIGRATION_V10)?;
        conn.execute("INSERT INTO schema_version VALUES (10)", [])?;
    }
    let admin_exists: i64 = conn.query_row(
        "SELECT COUNT(*) FROM users WHERE username = 'admin'",
        [],
        |r| r.get(0),
    ).unwrap_or(0);

    if admin_exists == 0 {
        let hash = bcrypt::hash("admin123", 12).unwrap();
        conn.execute(
            "INSERT INTO users (username, password_hash, role) VALUES ('admin', ?1, 'admin')",
            params![hash],
        )?;
    }

    Ok(())
}

const MIGRATION_V1: &str = "
-- Categories
CREATE TABLE IF NOT EXISTS categories (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    name        TEXT NOT NULL,
    parent_id   INTEGER REFERENCES categories(id) ON DELETE SET NULL,
    created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Products
CREATE TABLE IF NOT EXISTS products (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    name          TEXT NOT NULL,
    sku           TEXT UNIQUE NOT NULL,
    barcode       TEXT,
    category_id   INTEGER REFERENCES categories(id) ON DELETE SET NULL,
    brand         TEXT,
    description   TEXT,
    image_path    TEXT,
    cost_price    REAL NOT NULL DEFAULT 0,
    sale_price    REAL NOT NULL DEFAULT 0,
    tax_percent   REAL NOT NULL DEFAULT 0,
    low_stock_threshold INTEGER NOT NULL DEFAULT 5,
    created_at    TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Product Variants
CREATE TABLE IF NOT EXISTS product_variants (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    product_id      INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    size            TEXT,
    color           TEXT,
    quantity        INTEGER NOT NULL DEFAULT 0,
    variant_barcode TEXT,
    variant_price   REAL,
    created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Customers
CREATE TABLE IF NOT EXISTS customers (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    name          TEXT NOT NULL,
    phone         TEXT UNIQUE NOT NULL,
    address       TEXT,
    notes         TEXT,
    created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Users
CREATE TABLE IF NOT EXISTS users (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    username      TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    role          TEXT NOT NULL CHECK(role IN ('admin','cashier')) DEFAULT 'cashier',
    is_active     INTEGER NOT NULL DEFAULT 1,
    created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Sales
CREATE TABLE IF NOT EXISTS sales (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    invoice_number   TEXT UNIQUE NOT NULL,
    customer_id      INTEGER REFERENCES customers(id) ON DELETE SET NULL,
    sale_date        TEXT NOT NULL DEFAULT (datetime('now')),
    subtotal         REAL NOT NULL DEFAULT 0,
    discount_amount  REAL NOT NULL DEFAULT 0,
    discount_percent REAL NOT NULL DEFAULT 0,
    tax_amount       REAL NOT NULL DEFAULT 0,
    total_amount     REAL NOT NULL DEFAULT 0,
    paid_amount      REAL NOT NULL DEFAULT 0,
    change_amount    REAL NOT NULL DEFAULT 0,
    payment_method   TEXT NOT NULL CHECK(payment_method IN ('cash','card','udhaar','mixed')) DEFAULT 'cash',
    status           TEXT NOT NULL CHECK(status IN ('paid','partial','udhaar')) DEFAULT 'paid',
    notes            TEXT,
    created_by       INTEGER REFERENCES users(id) ON DELETE SET NULL
);

-- Sale Items
CREATE TABLE IF NOT EXISTS sale_items (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    sale_id      INTEGER NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
    product_id   INTEGER REFERENCES products(id) ON DELETE SET NULL,
    variant_id   INTEGER REFERENCES product_variants(id) ON DELETE SET NULL,
    product_name TEXT NOT NULL,
    barcode      TEXT,
    quantity     INTEGER NOT NULL DEFAULT 1,
    unit_price   REAL NOT NULL,
    discount     REAL NOT NULL DEFAULT 0,
    total_price  REAL NOT NULL
);

-- Ledger Entries
CREATE TABLE IF NOT EXISTS ledger_entries (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    customer_id   INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
    sale_id       INTEGER REFERENCES sales(id) ON DELETE SET NULL,
    entry_type    TEXT NOT NULL CHECK(entry_type IN ('sale','payment','adjustment')),
    amount        REAL NOT NULL,
    balance_after REAL NOT NULL,
    description   TEXT,
    entry_date    TEXT NOT NULL DEFAULT (datetime('now')),
    created_by    INTEGER REFERENCES users(id) ON DELETE SET NULL
);

-- Expenses
CREATE TABLE IF NOT EXISTS expenses (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    category     TEXT NOT NULL,
    amount       REAL NOT NULL,
    description  TEXT,
    expense_date TEXT NOT NULL DEFAULT (date('now')),
    created_by   INTEGER REFERENCES users(id) ON DELETE SET NULL
);

-- Settings
CREATE TABLE IF NOT EXISTS settings (
    key   TEXT UNIQUE NOT NULL,
    value TEXT NOT NULL
);

-- Stock History
CREATE TABLE IF NOT EXISTS stock_history (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    product_id  INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    variant_id  INTEGER REFERENCES product_variants(id) ON DELETE SET NULL,
    prev_qty    INTEGER NOT NULL,
    new_qty     INTEGER NOT NULL,
    reason      TEXT,
    changed_by  INTEGER REFERENCES users(id) ON DELETE SET NULL,
    changed_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_products_sku ON products(sku);
CREATE INDEX IF NOT EXISTS idx_products_barcode ON products(barcode);
CREATE INDEX IF NOT EXISTS idx_customers_phone ON customers(phone);
CREATE INDEX IF NOT EXISTS idx_sales_date ON sales(sale_date);
CREATE INDEX IF NOT EXISTS idx_sale_items_sale ON sale_items(sale_id);
CREATE INDEX IF NOT EXISTS idx_ledger_customer ON ledger_entries(customer_id);
CREATE INDEX IF NOT EXISTS idx_variants_barcode ON product_variants(variant_barcode);

-- Default Settings
INSERT OR IGNORE INTO settings (key, value) VALUES
    ('shop_name',          'Fashion Point'),
    ('shop_address',       '123 Main Street, Lahore'),
    ('shop_phone',         '+92-300-0000000'),
    ('tax_rate',           '0'),
    ('currency_symbol',    'Rs.'),
    ('receipt_footer',     'Thank you for shopping with us!'),
    ('printer_type',       'none'),
    ('printer_port',       ''),
    ('label_printer_port', ''),
    ('language',           'en'),
    ('low_stock_threshold','5'),
    ('idle_timeout_minutes','30');

-- Default Category
INSERT OR IGNORE INTO categories (name) VALUES ('General');
";

const MIGRATION_V2: &str = "
-- Purchase Lots for FIFO
CREATE TABLE IF NOT EXISTS purchase_lots (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    variant_id INTEGER NOT NULL REFERENCES product_variants(id) ON DELETE CASCADE,
    original_qty INTEGER NOT NULL,
    remaining_qty INTEGER NOT NULL,
    cost_price REAL NOT NULL,
    purchase_date TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Cash Book for Income/Expense double-entry
CREATE TABLE IF NOT EXISTS cash_book (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    entry_type TEXT NOT NULL CHECK(entry_type IN ('income','expense','transfer')),
    category TEXT NOT NULL,
    amount REAL NOT NULL,
    payment_method TEXT NOT NULL,
    reference_id INTEGER,
    description TEXT,
    entry_date TEXT NOT NULL DEFAULT (datetime('now')),
    created_by INTEGER REFERENCES users(id) ON DELETE SET NULL
);

-- Add Cost of Goods Sold tracking to sale_items
ALTER TABLE sale_items ADD COLUMN total_cogs REAL NOT NULL DEFAULT 0;

-- Backfill purchase_lots for existing products with positive quantity
INSERT INTO purchase_lots (product_id, variant_id, original_qty, remaining_qty, cost_price)
SELECT pv.product_id, pv.id, pv.quantity, pv.quantity, p.cost_price 
FROM product_variants pv
JOIN products p ON p.id = pv.product_id
WHERE pv.quantity > 0;
";

const MIGRATION_V3: &str = "
-- Add is_active to products for soft delete
ALTER TABLE products ADD COLUMN is_active INTEGER NOT NULL DEFAULT 1;
";

const MIGRATION_V4: &str = "
-- Performance Indexes for Cash Book and Ledger
CREATE INDEX IF NOT EXISTS idx_cash_book_date ON cash_book(entry_date);
CREATE INDEX IF NOT EXISTS idx_cash_book_cat ON cash_book(category);
CREATE INDEX IF NOT EXISTS idx_ledger_date ON ledger_entries(entry_date);
";

const MIGRATION_V5: &str = "
-- Add article_number to products
ALTER TABLE products ADD COLUMN article_number TEXT;
CREATE INDEX IF NOT EXISTS idx_products_article ON products(article_number);

-- Seed Main Categories with fixed IDs
INSERT OR IGNORE INTO categories (id, name, parent_id) VALUES (100, 'Men', NULL);
INSERT OR IGNORE INTO categories (id, name, parent_id) VALUES (200, 'Women', NULL);
INSERT OR IGNORE INTO categories (id, name, parent_id) VALUES (300, 'Kids', NULL);

-- Men sub-categories
INSERT OR IGNORE INTO categories (name, parent_id) VALUES ('Shirts', 100);
INSERT OR IGNORE INTO categories (name, parent_id) VALUES ('Trousers', 100);
INSERT OR IGNORE INTO categories (name, parent_id) VALUES ('Suits', 100);
INSERT OR IGNORE INTO categories (name, parent_id) VALUES ('Kurta', 100);
INSERT OR IGNORE INTO categories (name, parent_id) VALUES ('T-Shirts', 100);
INSERT OR IGNORE INTO categories (name, parent_id) VALUES ('Jeans', 100);

-- Women sub-categories
INSERT OR IGNORE INTO categories (name, parent_id) VALUES ('Shirts', 200);
INSERT OR IGNORE INTO categories (name, parent_id) VALUES ('Trousers', 200);
INSERT OR IGNORE INTO categories (name, parent_id) VALUES ('Kurta', 200);
INSERT OR IGNORE INTO categories (name, parent_id) VALUES ('Dupatta', 200);
INSERT OR IGNORE INTO categories (name, parent_id) VALUES ('Frocks', 200);
INSERT OR IGNORE INTO categories (name, parent_id) VALUES ('Jeans', 200);

-- Kids sub-categories
INSERT OR IGNORE INTO categories (name, parent_id) VALUES ('Shirts', 300);
INSERT OR IGNORE INTO categories (name, parent_id) VALUES ('Trousers', 300);
INSERT OR IGNORE INTO categories (name, parent_id) VALUES ('Frocks', 300);
INSERT OR IGNORE INTO categories (name, parent_id) VALUES ('T-Shirts', 300);
INSERT OR IGNORE INTO categories (name, parent_id) VALUES ('Shorts', 300);
INSERT OR IGNORE INTO categories (name, parent_id) VALUES ('Jeans', 300);
";

const MIGRATION_V6: &str = "
-- Suppliers
CREATE TABLE IF NOT EXISTS suppliers (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    name          TEXT NOT NULL,
    phone         TEXT UNIQUE NOT NULL,
    address       TEXT,
    notes         TEXT,
    outstanding_balance REAL NOT NULL DEFAULT 0,
    created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Supplier Ledger
CREATE TABLE IF NOT EXISTS supplier_ledger (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    supplier_id   INTEGER NOT NULL REFERENCES suppliers(id) ON DELETE CASCADE,
    entry_type    TEXT NOT NULL CHECK(entry_type IN ('purchase','payment','adjustment')),
    amount        REAL NOT NULL,
    balance_after REAL NOT NULL,
    description   TEXT,
    entry_date    TEXT NOT NULL DEFAULT (datetime('now')),
    created_by    INTEGER REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_supplier_phone ON suppliers(phone);
CREATE INDEX IF NOT EXISTS idx_supplier_ledger_date ON supplier_ledger(entry_date);
";

const MIGRATION_V7: &str = "
-- Chart of Accounts master table
CREATE TABLE IF NOT EXISTS accounts (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    code            TEXT NOT NULL UNIQUE,
    name            TEXT NOT NULL,
    name_ur         TEXT,
    account_type    TEXT NOT NULL CHECK(account_type IN (
                        'asset','liability','equity',
                        'revenue','expense')),
    category        TEXT NOT NULL,
    normal_balance  TEXT NOT NULL CHECK(normal_balance IN ('debit','credit')),
    is_system       INTEGER DEFAULT 0,
    is_active       INTEGER DEFAULT 1,
    parent_id       INTEGER REFERENCES accounts(id),
    description     TEXT,
    created_at      TEXT DEFAULT (datetime('now')),
    updated_at      TEXT DEFAULT (datetime('now'))
);

-- Journal entries header
CREATE TABLE IF NOT EXISTS journal_entries (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    entry_number    TEXT NOT NULL UNIQUE,
    entry_date      TEXT NOT NULL,
    description     TEXT NOT NULL,
    reference_type  TEXT,
    reference_id    INTEGER,
    is_posted       INTEGER DEFAULT 1,
    created_by      INTEGER REFERENCES users(id),
    created_at      TEXT DEFAULT (datetime('now'))
);

-- Journal entry lines (double-entry)
CREATE TABLE IF NOT EXISTS journal_lines (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    journal_id      INTEGER NOT NULL REFERENCES journal_entries(id),
    account_id      INTEGER NOT NULL REFERENCES accounts(id),
    debit_amount    REAL DEFAULT 0,
    credit_amount   REAL DEFAULT 0,
    description     TEXT,
    CHECK (
        (debit_amount > 0 AND credit_amount = 0) OR
        (credit_amount > 0 AND debit_amount = 0)
    )
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_journal_lines_account ON journal_lines(account_id);
CREATE INDEX IF NOT EXISTS idx_journal_lines_journal ON journal_lines(journal_id);
CREATE INDEX IF NOT EXISTS idx_journal_entries_date ON journal_entries(entry_date);
CREATE INDEX IF NOT EXISTS idx_journal_entries_ref ON journal_entries(reference_type, reference_id);

-- Seed default Chart of Accounts
INSERT OR IGNORE INTO accounts (code, name, name_ur, account_type, category, normal_balance, is_system) VALUES
('1001','Cash in Hand','نقد رقم','asset','current_asset','debit',1),
('1002','Bank Account','بینک اکاؤنٹ','asset','current_asset','debit',1),
('1010','Inventory / Stock','اسٹاک','asset','current_asset','debit',1),
('1020','Accounts Receivable','ادھار دیا گیا','asset','current_asset','debit',1),
('1030','Shop Furniture','فرنیچر','asset','fixed_asset','debit',0),
('1031','Computer & Equipment','آلات','asset','fixed_asset','debit',0),
('1040','Security Deposit','سکیورٹی ڈپازٹ','asset','other_asset','debit',0),
('2001','Accounts Payable','سپلائر کو ادائیگی','liability','current_liability','credit',1),
('2010','Customer Advance','گاہک پیشگی','liability','current_liability','credit',0),
('2020','Tax Payable (GST)','جی ایس ٹی','liability','current_liability','credit',0),
('2030','Short Term Loan','قرضہ','liability','current_liability','credit',0),
('3001','Owner Capital','مالک سرمایہ','equity','equity','credit',1),
('3002','Retained Earnings','پچھلے سال منافع','equity','equity','credit',1),
('3003','Owner Drawings','مالک نکالی رقم','equity','equity','debit',0),
('4001','Sales Revenue','فروخت آمدنی','revenue','operating_revenue','credit',1),
('4002','Sales Discount Given','رعایت دی گئی','revenue','contra_revenue','debit',1),
('4003','Sales Returns','واپسی','revenue','contra_revenue','debit',1),
('5001','Cost of Goods Sold','مال کی لاگت','expense','cogs','debit',1),
('5010','Rent Expense','کرایہ','expense','operating_expense','debit',0),
('5011','Electricity Bill','بجلی بل','expense','operating_expense','debit',0),
('5012','Staff Salaries','تنخواہیں','expense','operating_expense','debit',0),
('5013','Packaging & Bags','پیکنگ','expense','operating_expense','debit',0),
('5014','Transport / Delivery','ٹرانسپورٹ','expense','operating_expense','debit',0),
('5015','Mobile / Internet','موبائل','expense','operating_expense','debit',0),
('5016','Repair & Maintenance','مرمت','expense','operating_expense','debit',0),
('5020','Miscellaneous Expense','متفرق اخراجات','expense','operating_expense','debit',0);
";

const MIGRATION_V8: &str = "
-- Add outstanding_balance to customers
ALTER TABLE customers ADD COLUMN outstanding_balance REAL NOT NULL DEFAULT 0;

-- Backfill outstanding_balance from last ledger entry for each customer
UPDATE customers SET outstanding_balance = (
    SELECT balance_after FROM ledger_entries 
    WHERE customer_id = customers.id 
    ORDER BY entry_date DESC, id DESC LIMIT 1
) WHERE EXISTS (SELECT 1 FROM ledger_entries WHERE customer_id = customers.id);
";

const MIGRATION_V9: &str = "
-- Sales Returns Header
CREATE TABLE IF NOT EXISTS sales_returns (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    return_number    TEXT NOT NULL UNIQUE,
    sale_id          INTEGER NOT NULL REFERENCES sales(id),
    return_date      TEXT NOT NULL DEFAULT (datetime('now')),
    total_refund     REAL NOT NULL DEFAULT 0,
    refund_method    TEXT NOT NULL CHECK(refund_method IN ('cash','bank','credit_note','adjustment')),
    reason           TEXT,
    created_by       INTEGER REFERENCES users(id)
);

-- Sales Return Items
CREATE TABLE IF NOT EXISTS sales_return_items (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    return_id        INTEGER NOT NULL REFERENCES sales_returns(id) ON DELETE CASCADE,
    sale_item_id     INTEGER NOT NULL REFERENCES sale_items(id),
    product_id       INTEGER REFERENCES products(id),
    variant_id       INTEGER REFERENCES product_variants(id),
    quantity         INTEGER NOT NULL,
    unit_price       REAL NOT NULL,
    total_refund     REAL NOT NULL,
    is_damaged       INTEGER DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_sales_returns_sale ON sales_returns(sale_id);
CREATE INDEX IF NOT EXISTS idx_sales_return_items_return ON sales_return_items(return_id);

-- Generate return numbers starting from SR-2026-0001
CREATE TABLE IF NOT EXISTS return_counters (
    year INTEGER PRIMARY KEY,
    last_val INTEGER NOT NULL DEFAULT 0
);
";

const MIGRATION_V10: &str = "
-- Add opening_balance to suppliers
ALTER TABLE suppliers ADD COLUMN opening_balance REAL NOT NULL DEFAULT 0;
";
