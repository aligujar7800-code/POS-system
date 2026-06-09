# Grow Sale - Fashion Point POS System 
**Complete Technical & Functional Summary**

## 1. Overview
Grow Sale (Fashion Point POS) is a modern, high-performance Point of Sale application built to run completely offline with powerful cloud-sync capabilities. It is designed specifically for retail stores (like clothing, electronics, grocery, and pharmacy) with a strong emphasis on speed, security, and data integrity.

- **Frontend:** React.js, TypeScript, Vite, Tailwind CSS
- **Backend:** Rust (Tauri Framework)
- **Database:** SQLite (Local) with Write-Ahead Logging (WAL) for maximum performance.

---

## 2. Core Working & Features
The software covers the entire lifecycle of a retail business, from purchasing to point-of-sale and reporting.

### A. Inventory & Stock Management
- **Inward Stock (Purchasing):** Products are added via inward stock entries, linking them to specific suppliers. It tracks `cost_price`, `sale_price`, and `quantity`.
- **Bulk Fill:** Easily apply cost, sale price, and quantity to multiple variants (sizes/colors) at once to save time.
- **Stock Ledger & Adjustments:** Maintains a strict audit trail. Every stock change (sale, inward, or manual adjustment) is logged so inventory discrepancies can be tracked.
- **Dynamic Variants:** Supports variations like Size, Color, Weight, etc., dynamically changing based on the selected business module.

### B. Point of Sale (POS) & Sales
- **Fast Checkout:** Optimized for rapid barcode scanning and cart management.
- **Receipt Printing:** Integrated direct-to-printer functionality (bypassing browser dialogues) using a specialized Rust/binary backend.
- **Voice Commands:** Integrates with an offline AI voice module (Whisper Python sidecar) allowing cashiers to add products or navigate hands-free via voice commands.

### C. Supplier & Customer Ledgers
- **Suppliers:** Tracks pending payments (Udhaar) to suppliers based on inward stock.
- **Customers:** Tracks regular customers, their total visits, last visit dates, and credit (if applicable).

---

## 3. Advanced Cloud Integrations
Although the software is fully offline, it has a robust suite of cloud features that run entirely in the background without interrupting the cashier.

### A. Supabase Cloud Sync (Companion Mobile App)
- The desktop app seamlessly syncs sales data, customer data, and daily summaries to a **Supabase** cloud database in the background.
- **Companion Mobile App ("POS Dashboard"):** The store owner can use a mobile app to fetch real-time reports from Supabase. It shows monthly reports, daily breakdowns, profit margins, and Top 5 best-selling products.

### B. Google Drive Automated Backup
- **OAuth2 Integration:** Users log in securely to their Google Drive from within the POS.
- **Automatic Backups:** The app automatically flushes the database WAL and zips the `pos.db` file, uploading it securely to a hidden app-data folder in Google Drive.
- **Restoration:** If a PC crashes, the owner can download the zip from Drive, extract `pos.db`, and manually replace it in the app's folder to get 100% of their data back up to the minute.

---

## 4. Security & Licensing System
The software utilizes a highly secure, custom-built licensing system designed to prevent piracy and enforce monthly subscriptions.

- **Machine Fingerprinting:** Binds the software to a unique Windows `MachineGuid`. The software cannot be copied to another PC.
- **Cryptographic Keys:** Licenses are generated using `SHA-256` hashing combining the `Machine ID`, a `Secret Key`, and the **Current Month & Year**. 
- **Strict 30-Day Expiry:** 
  - Once activated, the software runs exactly for 30 days. 
  - After 30 days, the app locks down and displays a permanent "License Expired" screen. The user cannot access the dashboard until they enter a newly purchased key.
  - **No Auto-Renewal:** Auto-renewal is strictly disabled locally to ensure the user must contact the developer and pay for the next month's key.
  - **Anti-Reuse:** The database prevents users from reusing their old keys or last month's keys.
- **GitHub Whitelist (licenses.json):** Before accepting ANY license key, the software pings a hidden `licenses.json` file hosted on the developer's GitHub. If the customer's Machine ID is removed from this file, the app permanently refuses activation—giving the developer an absolute kill-switch over unpaid software.

---

## 5. Built-in Auto Updater (Tauri)
- **Seamless Updates:** The software uses Tauri's official updater.
- **How it Works:** The developer builds the new `.exe` and `.sig` (signature) files and updates `update.json` on GitHub.
- When the customer opens their app, it automatically detects the update, downloads it, and installs the latest bug fixes or features without any manual file sharing.

---

## 6. Supported Business Modules
The app is not just for clothing; it dynamically adapts its labels and features based on the selected business type:
- **Clothing POS** (Size & Color)
- **Electronics** (Model & Color)
- **Grocery** (Pack Size & Type)
- **Pharmacy** (Potency & Form)
- **Cosmetics** (Shade & Size)
- **General Store** (Default setup)

---
*Generated by Antigravity*
