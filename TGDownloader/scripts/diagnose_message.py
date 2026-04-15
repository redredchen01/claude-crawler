#!/usr/bin/env python3
"""
Diagnose what media is in a specific Telegram message
"""
import sys
import os
from telethon.sync import TelegramClient as TelegramClientSync

def diagnose_message(chat_id: str, message_id: str, phone: str, api_id: str, api_hash: str):
    """Diagnose message content"""

    session_dir = os.path.expanduser("~/.tgdownloader/sessions")
    os.makedirs(session_dir, exist_ok=True)

    session_file = os.path.join(session_dir, f"session_{phone.replace('+', '')}")
    session_with_ext = session_file + ".session"

    print(f"📱 Session file: {session_file}", file=sys.stderr)
    print(f"✅ Session exists: {os.path.exists(session_with_ext)}", file=sys.stderr)

    client = None
    try:
        # Create synchronous client
        client = TelegramClientSync(session_file, int(api_id), api_hash)

        try:
            client.connect()
        except Exception as conn_err:
            print(f"❌ Connection failed: {conn_err}", file=sys.stderr)
            return False

        try:
            me = client.get_me()
            if me:
                print(f"✅ Authenticated as: {me.first_name} {me.last_name}", file=sys.stderr)
            else:
                print(f"⚠️  Session connected but user info unavailable", file=sys.stderr)
        except Exception as auth_err:
            print(f"❌ Not authenticated: {auth_err}", file=sys.stderr)
            return False

        # Convert chat_id to entity
        try:
            chat_id_num = chat_id.lstrip('-')
            if chat_id_num.isdigit():
                # Channel ID - add -100 prefix for private channels
                entity = int(f"-100{chat_id_num}")
                print(f"📍 Using numeric channel ID: {entity}", file=sys.stderr)
            else:
                # Username - resolve it
                entity = client.get_entity(chat_id)
                print(f"📍 Resolved username to entity ID: {entity.id}", file=sys.stderr)
        except Exception as e:
            print(f"❌ Failed to resolve chat {chat_id}: {e}", file=sys.stderr)
            return False

        try:
            # Get the message
            try:
                messages = client.get_messages(entity, ids=int(message_id))
            except ValueError:
                messages = client.get_messages(entity, ids=message_id)

            if not messages or messages[0] is None:
                print(f"❌ Message {message_id} not found", file=sys.stderr)
                return False

            msg = messages[0]
            print(f"\n✅ Message found: {msg.id}", file=sys.stderr)
            print(f"   Date: {msg.date}", file=sys.stderr)
            print(f"   Text: {msg.text[:100] if msg.text else '(no text)'}", file=sys.stderr)

            # Check media
            if not msg.media:
                print(f"❌ Message has no media", file=sys.stderr)
                return False

            media_type = type(msg.media).__name__
            print(f"\n📦 Media Type: {media_type}", file=sys.stderr)

            # Inspect different media types
            if hasattr(msg.media, 'document'):
                doc = msg.media.document
                print(f"   Document ID: {doc.id}", file=sys.stderr)
                print(f"   MIME Type: {doc.mime_type}", file=sys.stderr)
                print(f"   Size: {doc.size} bytes ({doc.size / (1024*1024):.2f} MB)", file=sys.stderr)

                # Extract attributes
                if doc.attributes:
                    for attr in doc.attributes:
                        attr_type = type(attr).__name__
                        print(f"   Attribute: {attr_type}", file=sys.stderr)
                        if hasattr(attr, 'duration'):
                            duration_sec = attr.duration
                            minutes = duration_sec // 60
                            seconds = duration_sec % 60
                            print(f"      Duration: {minutes}m {seconds}s ({duration_sec}s)", file=sys.stderr)
                        if hasattr(attr, 'w') and hasattr(attr, 'h'):
                            print(f"      Resolution: {attr.w}x{attr.h}", file=sys.stderr)

            elif hasattr(msg.media, 'photo'):
                print(f"   Photo size: {msg.media.photo.size} bytes", file=sys.stderr)

            elif hasattr(msg.media, 'video'):
                video = msg.media.video
                print(f"   Video size: {video.size} bytes ({video.size / (1024*1024):.2f} MB)", file=sys.stderr)
                if hasattr(video, 'duration'):
                    duration_sec = video.duration
                    minutes = duration_sec // 60
                    seconds = duration_sec % 60
                    print(f"   Duration: {minutes}m {seconds}s ({duration_sec}s)", file=sys.stderr)
                if hasattr(video, 'w') and hasattr(video, 'h'):
                    print(f"   Resolution: {video.w}x{video.h}", file=sys.stderr)

            print(f"\n🔍 Raw media object: {msg.media}", file=sys.stderr)
            return True

        except Exception as e:
            print(f"❌ Error inspecting message: {e}", file=sys.stderr)
            import traceback
            traceback.print_exc()
            return False

    except Exception as e:
        print(f"❌ Client error: {e}", file=sys.stderr)
        import traceback
        traceback.print_exc()
        return False
    finally:
        if client and client.is_connected():
            client.disconnect()

def main():
    if len(sys.argv) < 5:
        print("Usage: diagnose_message.py <chat_id> <message_id> <phone> <api_id> <api_hash>", file=sys.stderr)
        sys.exit(1)

    chat_id, message_id, phone, api_id, api_hash = sys.argv[1:6]
    success = diagnose_message(chat_id, message_id, phone, api_id, api_hash)
    sys.exit(0 if success else 1)

if __name__ == "__main__":
    main()
