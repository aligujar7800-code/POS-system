import sys
import hashlib

# MUST MATCH THE RUST BACKEND SECRET EXACTLY
LICENSE_SECRET = b"FashionPointPOS_2026_SecretKey_XkZ9mQ"

def generate_key(machine_id: str) -> str:
    # Hash machine_id + secret
    input_data = machine_id.encode('utf-8') + LICENSE_SECRET
    hash_obj = hashlib.sha256(input_data)
    hex_digest = hash_obj.hexdigest().upper()
    
    # Format as CPOS-XXXX-XXXX-XXXX-XXXX
    return f"CPOS-{hex_digest[0:4]}-{hex_digest[4:8]}-{hex_digest[8:12]}-{hex_digest[12:16]}"

import subprocess

def copy_to_clipboard(text):
    try:
        subprocess.run("clip", text=True, input=text.strip(), check=True)
        print("📋 Key copied to clipboard automatically!")
    except Exception as e:
        print(f"Could not copy to clipboard automatically: {e}")

if __name__ == "__main__":
    print("=" * 50)
    print("🔑 Fashion Point POS - License Generator")
    print("=" * 50)
    
    if len(sys.argv) > 1:
        machine_id = sys.argv[1].strip()
    else:
        machine_id = input("Enter Customer Machine ID: ").strip()

    if not machine_id:
        print("Error: Machine ID is required.")
        sys.exit(1)

    key = generate_key(machine_id)
    print("\n[✔] SUCCESS")
    print(f"Machine ID  : {machine_id}")
    print(f"License Key : {key}\n")
    
    copy_to_clipboard(key)
    
    print("Share this key with the customer.")
    print("=" * 50)
    input("\nPress Enter to exit...")
