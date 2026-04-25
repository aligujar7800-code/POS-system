use rusqlite::{Connection, Result, params};
use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct User {
    pub id: i64,
    pub username: String,
    pub role: String,
    pub is_active: bool,
    pub permissions: Option<String>,
}

#[allow(dead_code)]
#[derive(Deserialize)]
pub struct LoginPayload {
    pub username: String,
    pub password: String,
}

#[derive(Deserialize)]
pub struct CreateUserPayload {
    pub username: String,
    pub password: String,
    pub role: String,
    pub permissions: Option<String>,
}

pub fn authenticate(conn: &Connection, username: &str, password: &str) -> Result<Option<User>> {
    let result = conn.query_row(
        "SELECT id, username, password_hash, role, is_active, permissions FROM users WHERE username = ?1 AND is_active = 1",
        params![username],
        |row| {
            Ok((
                row.get::<_, i64>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, String>(2)?,
                row.get::<_, String>(3)?,
                row.get::<_, bool>(4)?,
                row.get::<_, Option<String>>(5)?,
            ))
        },
    );

    match result {
        Ok((id, uname, hash, role, is_active, permissions)) => {
            if bcrypt::verify(password, &hash).unwrap_or(false) {
                Ok(Some(User { id, username: uname, role, is_active, permissions }))
            } else {
                Ok(None)
            }
        }
        Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
        Err(e) => Err(e),
    }
}

pub fn get_all_users(conn: &Connection) -> Result<Vec<User>> {
    let mut stmt = conn.prepare(
        "SELECT id, username, role, is_active, permissions FROM users ORDER BY username",
    )?;
    let users = stmt.query_map([], |row| {
        Ok(User {
            id: row.get(0)?,
            username: row.get(1)?,
            role: row.get(2)?,
            is_active: row.get(3)?,
            permissions: row.get(4)?,
        })
    })?;
    users.collect()
}

pub fn create_user(conn: &Connection, payload: &CreateUserPayload) -> Result<i64> {
    let hash = bcrypt::hash(&payload.password, 12).unwrap();
    conn.execute(
        "INSERT INTO users (username, password_hash, role, permissions) VALUES (?1, ?2, ?3, ?4)",
        params![payload.username, hash, payload.role, payload.permissions],
    )?;
    Ok(conn.last_insert_rowid())
}

pub fn update_user_status(conn: &Connection, user_id: i64, is_active: bool) -> Result<()> {
    conn.execute(
        "UPDATE users SET is_active = ?1 WHERE id = ?2",
        params![is_active, user_id],
    )?;
    Ok(())
}

pub fn change_password(conn: &Connection, user_id: i64, new_password: &str) -> Result<()> {
    let hash = bcrypt::hash(new_password, 12).unwrap();
    conn.execute(
        "UPDATE users SET password_hash = ?1 WHERE id = ?2",
        params![hash, user_id],
    )?;
    Ok(())
}

pub fn delete_user(conn: &Connection, user_id: i64) -> Result<()> {
    conn.execute(
        "DELETE FROM users WHERE id = ?1 AND username != 'admin'",
        params![user_id],
    )?;
    Ok(())
}
