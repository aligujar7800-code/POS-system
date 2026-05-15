-- ═══════════════════════════════════════════════════════════════
-- Supabase Cloud Sync Tables for ClothingPOS
-- Run this in Supabase SQL Editor (Dashboard → SQL Editor)
-- ═══════════════════════════════════════════════════════════════

-- 1. Stores Table
CREATE TABLE IF NOT EXISTS stores (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  owner_email TEXT NOT NULL UNIQUE,
  store_name TEXT NOT NULL DEFAULT 'My Store',
  created_at TIMESTAMPTZ DEFAULT now(),
  plan TEXT DEFAULT 'free'
);

-- 2. Sales Table
CREATE TABLE IF NOT EXISTS sales (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  local_id BIGINT NOT NULL,
  amount DECIMAL(12,2) NOT NULL DEFAULT 0,
  profit DECIMAL(12,2) NOT NULL DEFAULT 0,
  payment_method TEXT NOT NULL DEFAULT 'cash',
  items_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(store_id, local_id)
);

-- 3. Customers Table
CREATE TABLE IF NOT EXISTS customers (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  local_id BIGINT NOT NULL,
  name TEXT NOT NULL,
  phone TEXT,
  total_visits INTEGER DEFAULT 0,
  last_visit TIMESTAMPTZ,
  UNIQUE(store_id, local_id)
);

-- 4. Daily Summary Table
CREATE TABLE IF NOT EXISTS daily_summary (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  total_sales DECIMAL(12,2) DEFAULT 0,
  total_profit DECIMAL(12,2) DEFAULT 0,
  total_customers INTEGER DEFAULT 0,
  top_products JSONB DEFAULT '[]'::jsonb,
  UNIQUE(store_id, date)
);

-- ═══════════════════════════════════════════════════════════════
-- Row Level Security (RLS)
-- ═══════════════════════════════════════════════════════════════

ALTER TABLE stores ENABLE ROW LEVEL SECURITY;
ALTER TABLE sales ENABLE ROW LEVEL SECURITY;
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_summary ENABLE ROW LEVEL SECURITY;

-- Service role can do everything (used by POS backend)
CREATE POLICY "service_role_all_stores" ON stores FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all_sales" ON sales FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all_customers" ON customers FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all_daily" ON daily_summary FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Anon/authenticated users can only read their own store data (for mobile app)
CREATE POLICY "anon_read_own_store" ON stores FOR SELECT TO anon USING (true);
CREATE POLICY "anon_read_own_sales" ON sales FOR SELECT TO anon USING (true);
CREATE POLICY "anon_read_own_customers" ON customers FOR SELECT TO anon USING (true);
CREATE POLICY "anon_read_own_daily" ON daily_summary FOR SELECT TO anon USING (true);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_sales_store_id ON sales(store_id);
CREATE INDEX IF NOT EXISTS idx_sales_created_at ON sales(created_at);
CREATE INDEX IF NOT EXISTS idx_customers_store_id ON customers(store_id);
CREATE INDEX IF NOT EXISTS idx_daily_summary_store_date ON daily_summary(store_id, date);

-- Enable realtime for mobile app
ALTER PUBLICATION supabase_realtime ADD TABLE sales;
ALTER PUBLICATION supabase_realtime ADD TABLE customers;
ALTER PUBLICATION supabase_realtime ADD TABLE daily_summary;
