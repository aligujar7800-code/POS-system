use rusqlite::Connection;

fn main() {
    let conn = Connection::open("C:\\Users\\Subhan Faisal\\AppData\\Roaming\\com.clothingpos.app\\data.db").unwrap();
    let date = "2026-06-11";
    let res: Result<(f64, f64), _> = conn.query_row(
            "SELECT COALESCE(SUM(sr.total_refund), 0),
                    COALESCE((
                        SELECT SUM(si.total_cogs / si.quantity * sri.quantity)
                        FROM sales_return_items sri
                        JOIN sale_items si ON sri.sale_item_id = si.id
                        JOIN sales s2 ON si.sale_id = s2.id
                        WHERE date(s2.sale_date, 'localtime') = ?1
                    ), 0)
             FROM sales_returns sr
             JOIN sales s ON sr.sale_id = s.id
             WHERE date(s.sale_date, 'localtime') = ?1",
        rusqlite::params![date],
        |r| Ok((r.get(0)?, r.get(1)?)),
    );
    println!("{:?}", res);
}
