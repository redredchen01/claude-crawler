#!/usr/bin/env python3
"""
Initialize Telegram session - run this once to authenticate
Usage: python init_telegram_session.py <phone> <api_id> <api_hash>
"""

import sys
import os
from telethon.sync import TelegramClient

def init_session(phone: str, api_id: str, api_hash: str):
    """Initialize Telegram session"""

    session_dir = os.path.expanduser("~/.tgdownloader/sessions")
    os.makedirs(session_dir, exist_ok=True)
    session_file = os.path.join(session_dir, f"session_{phone.replace('+', '')}")

    print(f"🔐 初始化 Telegram 会话")
    print(f"📱 电话号码: {phone}")
    print(f"📁 会话文件: {session_file}")

    try:
        # Use synchronous client
        from telethon.sync import TelegramClient as TelegramClientSync
        client = TelegramClientSync(session_file, int(api_id), api_hash)

        with client:
            # This will prompt for code if needed
            print("✅ 会话已初始化!")
            me = client.get_me()
            print(f"✅ 已连接: {me.first_name}")
            return True

    except Exception as e:
        print(f"❌ 错误: {e}")
        return False

def main():
    if len(sys.argv) != 4:
        print("Usage: init_telegram_session.py <phone> <api_id> <api_hash>", file=sys.stderr)
        print("Example: init_telegram_session.py '+886916615712' '39536205' 'f3bf20655dedabf9b05790c26744bb1a'", file=sys.stderr)
        sys.exit(1)

    phone, api_id, api_hash = sys.argv[1:4]
    success = init_session(phone, api_id, api_hash)
    sys.exit(0 if success else 1)

if __name__ == "__main__":
    main()
