#!/usr/bin/env python3
"""
Initialize Telegram session with phone authentication
Stores session for reuse by download scripts
"""
import sys
import os
from telethon.sync import TelegramClient

def init_session(phone: str, api_id: str, api_hash: str, code: str = None, password: str = None):
    """Initialize Telegram session with phone authentication"""

    session_dir = os.path.expanduser("~/.tgdownloader/sessions")
    os.makedirs(session_dir, exist_ok=True)

    session_file = os.path.join(session_dir, f"session_{phone.replace('+', '')}")

    print(f"🔐 Initializing Telegram session for {phone}")
    print(f"📁 Session file: {session_file}.session")

    client = TelegramClient(session_file, int(api_id), api_hash)

    try:
        # Connect
        print("\n🔗 Connecting to Telegram...")
        client.connect()
        print("✅ Connected")

        # Send code
        print("\n📱 Sending verification code to your phone...")
        result = client.send_code_request(phone)
        print("✅ Verification code sent")
        print(f"   Phone Hash: {result.phone_code_hash}")

        # Get code from user
        if not code:
            try:
                code = input("\n🔑 Enter the code you received (or type 'pass' if you have password): ").strip()
            except EOFError:
                print("\n❌ No code provided and running in non-interactive mode")
                print("   Run with code as argument: init_session.py <phone> <api_id> <api_hash> <code>")
                return False

        # Sign in
        try:
            client.sign_in(phone, code)
            print("✅ Signed in successfully!")
        except Exception as e:
            if "2FA" in str(e) or "password" in str(e).lower():
                print("\n🔐 Two-factor authentication required")
                if not password:
                    try:
                        password = input("🔑 Enter your password: ").strip()
                    except EOFError:
                        print("❌ Password required but running in non-interactive mode")
                        print("   Run with password as argument: init_session.py <phone> <api_id> <api_hash> <code> <password>")
                        return False
                client.sign_in(password=password)
                print("✅ Signed in with 2FA")
            else:
                raise

        # Verify
        me = client.get_me()
        print(f"\n👤 Authenticated as: {me.first_name} {me.last_name or ''}")
        print(f"📞 Phone: {me.phone}")

        print(f"\n✅ Session initialized successfully!")
        print(f"📁 Saved to: {session_file}.session")
        return True

    except Exception as e:
        print(f"\n❌ Error: {e}")
        import traceback
        traceback.print_exc()
        return False
    finally:
        if client.is_connected():
            client.disconnect()

if __name__ == "__main__":
    if len(sys.argv) < 4:
        print("Usage: init_session.py <phone> <api_id> <api_hash> [code] [password]")
        print("\nExamples:")
        print("  # Interactive (prompts for code):")
        print("  python3 init_session.py '+886916615712' 1234567 'abc123...'")
        print("\n  # Non-interactive (with code and password):")
        print("  python3 init_session.py '+886916615712' 1234567 'abc123...' '12345' 'mypassword'")
        print("\nGet API credentials from: https://my.telegram.org/auth/login")
        sys.exit(1)

    phone, api_id, api_hash = sys.argv[1:4]
    code = sys.argv[4] if len(sys.argv) > 4 else None
    password = sys.argv[5] if len(sys.argv) > 5 else None
    success = init_session(phone, api_id, api_hash, code, password)
    sys.exit(0 if success else 1)
