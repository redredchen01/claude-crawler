#!/usr/bin/env python3
"""
Simple test to check if Telethon can connect and fetch a message
Doesn't need API credentials - uses existing session
"""
import sys
import os
from telethon.sync import TelegramClient

def test_download(chat_id: str, message_id: str, phone: str):
    """Test download - uses existing session"""

    session_dir = os.path.expanduser("~/.tgdownloader/sessions")
    session_file = os.path.join(session_dir, f"session_{phone.replace('+', '')}")
    session_with_ext = session_file + ".session"

    print(f"📱 Session file: {session_file}")
    print(f"✅ Session exists: {os.path.exists(session_with_ext)}")

    if not os.path.exists(session_with_ext):
        print(f"❌ Session file not found. Need to initialize session first.")
        return False

    # Note: We don't have API credentials, so we use a minimal client
    # This will only work if the session is already authenticated
    try:
        # Try with dummy credentials - session file contains everything needed
        client = TelegramClient(session_file, 1, "1")
        client.connect()

        # Try to get message
        try:
            entity = client.get_entity(chat_id)
            print(f"✅ Resolved entity: {entity}")
        except Exception as e:
            print(f"❌ Failed to resolve entity: {e}")
            entity = None

        if entity:
            try:
                result = client.get_messages(entity, ids=int(message_id))
                # get_messages returns single Message or list
                msg = result[0] if isinstance(result, list) else result
                if msg:
                    m = msg
                    print(f"✅ Found message: {m.id}")
                    if m.media:
                        print(f"   Media type: {type(m.media).__name__}")
                        if hasattr(m.media, 'document'):
                            doc = m.media.document
                            print(f"   Size: {doc.size} bytes ({doc.size/(1024*1024):.2f}MB)")
                            if doc.attributes:
                                for attr in doc.attributes:
                                    if hasattr(attr, 'duration'):
                                        sec = attr.duration
                                        print(f"   Duration: {sec//60}m {sec%60}s")
                        return True
                    else:
                        print(f"❌ Message has no media")
                        return False
                else:
                    print(f"❌ Message not found")
                    return False
            except Exception as e:
                print(f"❌ Error getting message: {e}")
                import traceback
                traceback.print_exc()
                return False
        else:
            print(f"❌ Could not resolve entity")
            return False

    except Exception as e:
        print(f"❌ Connection failed: {e}")
        import traceback
        traceback.print_exc()
        return False
    finally:
        try:
            if client and client.is_connected():
                client.disconnect()
        except:
            pass

if __name__ == "__main__":
    if len(sys.argv) < 4:
        print("Usage: test_download_simple.py <chat_id> <message_id> <phone>")
        sys.exit(1)

    chat_id, message_id, phone = sys.argv[1:4]
    success = test_download(chat_id, message_id, phone)
    sys.exit(0 if success else 1)
