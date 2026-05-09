import sys
import hashlib
import datetime

# MUST MATCH THE RUST BACKEND SECRET EXACTLY
LICENSE_SECRET = "FashionPointPOS_2026_SecretKey_XkZ9mQ"

# License validity period in days
LICENSE_DAYS = 30

def generate_key(machine_id: str) -> str:
    # Format: MMYYYY (e.g., 052026)
    month_str = datetime.datetime.now().strftime("%m%Y")
    # Hash machine_id + secret + month_str
    input_data = machine_id + LICENSE_SECRET + month_str
    hash_obj = hashlib.sha256(input_data.encode('utf-8'))
    hex_digest = hash_obj.hexdigest().upper()
    
    # Format as CPOS-XXXX-XXXX-XXXX-XXXX
    return f"CPOS-{hex_digest[0:4]}-{hex_digest[4:8]}-{hex_digest[8:12]}-{hex_digest[12:16]}"

import subprocess

def copy_to_clipboard(text):
    try:
        subprocess.run("clip", text=True, input=text.strip(), check=True)
        print("Key copied to clipboard automatically!")
    except Exception as e:
        print(f"Could not copy to clipboard automatically: {e}")

if __name__ == "__main__":
    print("=" * 60)
    print("Fashion Point POS - License Generator (30-Day License)")
    print("=" * 60)
    
    if len(sys.argv) > 1:
        machine_id = sys.argv[1].strip()
    else:
        machine_id = input("Enter Customer Machine ID: ").strip()

    if not machine_id:
        print("Error: Machine ID is required.")
        sys.exit(1)

    key = generate_key(machine_id)
    
    
    print("\n[✔] SUCCESS")
    print(f"Machine ID    : {machine_id}")
    print(f"License Key   : {key}")
    print(f"Valid For     : {LICENSE_DAYS} days")
    print()
    
    copy_to_clipboard(key)
    
    print("-" * 60)
    print("⚠️  IMPORTANT: This license is valid for 30 DAYS only!")
    print("    After 30 days, the customer must request renewal.")
    print("-" * 60)
    print()
    print("📝 Add this entry to licenses.json on GitHub:")
    print(f'   {{"machine_id": "{machine_id}", "days": {LICENSE_DAYS}}}')
    print()
    print("🔄 To RENEW an expired license:")
    print("   1. Update the entry in licenses.json (keep same machine_id)")
    print("   2. Customer opens the app → it will auto-renew for 30 more days")
    print("=" * 60)
    input("\nPress Enter to exit...")
