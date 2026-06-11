import sqlite3

conn = sqlite3.connect(r'C:\Users\Subhan Faisal\AppData\Roaming\com.clothingpos.app\pos.db')
cursor = conn.cursor()

try:
    cursor.execute("""
        SELECT COALESCE(SUM(sr.total_refund), 0),
               COALESCE((
                   SELECT SUM(si.total_cogs / si.quantity * sri.quantity)
                   FROM sales_return_items sri
                   JOIN sale_items si ON sri.sale_item_id = si.id
                   JOIN sales s2 ON si.sale_id = s2.id
                   WHERE date(s2.sale_date, 'localtime') = ?
               ), 0)
        FROM sales_returns sr
        JOIN sales s ON sr.sale_id = s.id
        WHERE date(s.sale_date, 'localtime') = ?
    """, ("2026-06-11", "2026-06-11"))
    print(cursor.fetchall())
except Exception as e:
    print(f"Error: {e}")
