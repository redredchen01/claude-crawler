#!/usr/bin/env python3
"""
Telegram download service - keeps Telethon authenticated and ready for downloads.
Listens on a local socket for download requests.
"""
import sys
import os
import json
import socket
import time
from pathlib import Path
from telethon.sync import TelegramClient as TelegramClientSync


class TelegramDownloadService:
    def __init__(self, api_id: str, api_hash: str, phone: str):
        self.api_id = api_id
        self.api_hash = api_hash
        self.phone = phone

        session_dir = os.path.expanduser("~/.tgdownloader/sessions")
        os.makedirs(session_dir, exist_ok=True)
        self.session_file = os.path.join(session_dir, f"session_{phone.replace('+', '')}")

        self.client = None
        self.socket_path = "/tmp/tgdownloader_service.sock"

    def authenticate(self):
        """Authenticate with Telegram"""
        try:
            self.client = TelegramClientSync(self.session_file, int(self.api_id), self.api_hash)

            with self.client:
                me = self.client.get_me()
                print(f"✅ Authenticated as: {me.first_name}", file=sys.stderr)
                return True
        except Exception as e:
            print(f"❌ Authentication failed: {e}", file=sys.stderr)
            return False

    def download_media(self, chat_id: str, message_id: str, output_file: str) -> bool:
        """Download media from a Telegram message"""
        if not self.client:
            print("❌ Client not authenticated", file=sys.stderr)
            return False

        try:
            with self.client:
                # Parse chat ID
                try:
                    chat_id_num = chat_id.lstrip('-')
                    if chat_id_num.isdigit():
                        entity = int(f"-100{chat_id_num}")
                    else:
                        entity = self.client.get_entity(chat_id)
                except Exception as e:
                    print(f"❌ Failed to resolve chat {chat_id}: {e}", file=sys.stderr)
                    return False

                # Get message
                try:
                    messages = self.client.get_messages(entity, ids=int(message_id))
                    if not messages or messages[0] is None:
                        print(f"❌ Message not found", file=sys.stderr)
                        return False

                    msg = messages[0]
                    if not msg.media:
                        print(f"❌ No media in message", file=sys.stderr)
                        return False

                    # Download
                    result = self.client.download_media(msg, file=output_file)
                    if result and os.path.exists(output_file):
                        file_size = os.path.getsize(output_file)
                        print(f"✅ Downloaded: {file_size} bytes", file=sys.stderr)
                        return True
                    else:
                        print(f"❌ Download failed", file=sys.stderr)
                        return False

                except Exception as e:
                    print(f"❌ Error downloading: {e}", file=sys.stderr)
                    return False

        except Exception as e:
            print(f"❌ Client error: {e}", file=sys.stderr)
            return False


def main():
    """Run the download service"""
    api_id = os.getenv("TELEGRAM_API_ID")
    api_hash = os.getenv("TELEGRAM_API_HASH")
    phone = os.getenv("TELEGRAM_PHONE")

    if not api_id or not api_hash:
        print("❌ Missing TELEGRAM_API_ID or TELEGRAM_API_HASH", file=sys.stderr)
        sys.exit(1)

    if not phone:
        print("❌ Missing TELEGRAM_PHONE environment variable", file=sys.stderr)
        sys.exit(1)

    # For now, just provide a simple download function
    # This could be extended to use sockets/IPC for real service architecture
    service = TelegramDownloadService(api_id, api_hash, phone)

    if len(sys.argv) > 1 and sys.argv[1] == "download":
        # Command-line usage: python telegram_service.py download <chat_id> <message_id> <output_file>
        if len(sys.argv) < 5:
            print("Usage: telegram_service.py download <chat_id> <message_id> <output_file>", file=sys.stderr)
            sys.exit(1)

        chat_id = sys.argv[2]
        message_id = sys.argv[3]
        output_file = sys.argv[4]

        if service.authenticate():
            success = service.download_media(chat_id, message_id, output_file)
            sys.exit(0 if success else 1)
        else:
            sys.exit(1)
    else:
        print("Usage: telegram_service.py download <chat_id> <message_id> <output_file>", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
