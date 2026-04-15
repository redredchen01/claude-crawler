#!/usr/bin/env python3
"""
Download Telegram video using Telethon with pre-authenticated session
"""
import sys
import os
import json
from telethon.sync import TelegramClient as TelegramClientSync
from telethon.tl.types import DocumentAttributeVideo

def extract_metadata(msg):
    """Extract metadata from a Telegram message"""
    metadata = {
        "title": None,
        "duration": None,
        "file_size": None,
        "mime_type": None,
        "width": None,
        "height": None
    }

    # Try to get title from message text
    if msg.text:
        metadata["title"] = msg.text[:100]  # Limit to 100 chars

    # Extract video attributes
    if msg.media and hasattr(msg.media, 'document'):
        doc = msg.media.document
        metadata["file_size"] = doc.size if doc else None
        metadata["mime_type"] = doc.mime_type if doc else None

        # Extract video attributes from document
        if doc and hasattr(doc, 'attributes'):
            for attr in doc.attributes:
                if isinstance(attr, DocumentAttributeVideo):
                    metadata["duration"] = attr.duration
                    metadata["width"] = attr.w
                    metadata["height"] = attr.h
                    break

    # Clean up None values
    return {k: v for k, v in metadata.items() if v is not None}

def download_video_sync(chat_id: str, message_id: str, phone: str, api_id: str, api_hash: str, output_file: str, resume_offset: int = 0, info_only: bool = False):
    """Download video from Telegram using pre-authenticated session"""

    session_dir = os.path.expanduser("~/.tgdownloader/sessions")
    os.makedirs(session_dir, exist_ok=True)

    # Telethon stores sessions as .session files but accepts base name without extension
    # It will look for both session_name and session_name.session
    session_file = os.path.join(session_dir, f"session_{phone.replace('+', '')}")
    session_with_ext = session_file + ".session"

    print(f"📱 Session file: {session_file}", file=sys.stderr)
    print(f"✅ Session exists: {os.path.exists(session_with_ext)}", file=sys.stderr)

    client = None
    try:
        # Create synchronous client with explicit storage settings
        # storage = MemoryStorage() to avoid database locking issues
        # But we need to use file storage for session persistence
        client = TelegramClientSync(session_file, int(api_id), api_hash)

        # Try to use existing session without re-authenticating
        # If session is valid, connect() will work; if not, we fall through to error
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
                # Session appears valid, continue anyway
        except Exception as auth_err:
            print(f"❌ Not authenticated: {auth_err}", file=sys.stderr)
            print(f"   Please ensure session is initialized", file=sys.stderr)
            return False

        # Convert chat_id to entity
        try:
            chat_id_num = chat_id.lstrip('-')
            if chat_id_num.isdigit():
                # Channel ID - add -100 prefix for private channels
                entity = int(f"-100{chat_id_num}")
                print(f"📍 Resolved to channel: {entity}", file=sys.stderr)
            else:
                # Username - resolve it
                entity = client.get_entity(chat_id)
                print(f"📍 Resolved username to entity ID: {entity.id}", file=sys.stderr)
        except Exception as e:
            print(f"❌ Failed to resolve chat {chat_id}: {e}", file=sys.stderr)
            return False

        try:
            # Get message by ID (supports both regular messages and posts)
            # Posts can be accessed the same way as messages in Telethon
            try:
                result = client.get_messages(entity, ids=int(message_id))
            except ValueError:
                # If message_id is not a valid integer, it might be a post ID
                # Try as string ID
                result = client.get_messages(entity, ids=message_id)

            # get_messages with ids parameter returns a single Message, not a list
            msg = result[0] if isinstance(result, list) else result

            if not msg:
                print(f"❌ Post/Message {message_id} not found", file=sys.stderr)
                return False

            print(f"✅ Found post/message: {msg.id}", file=sys.stderr)

            # Check for media
            if not msg.media:
                print(f"❌ Message has no media", file=sys.stderr)
                return False

            # Extract and output metadata as JSON (first line to stdout)
            metadata = extract_metadata(msg)
            print(json.dumps(metadata), flush=True)

            # If info-only mode, return early
            if info_only:
                return True

            # Download media
            media_type = type(msg.media).__name__
            if resume_offset > 0:
                print(f"⬇️  Downloading {media_type} (resuming from {resume_offset} bytes)...", file=sys.stderr)
            else:
                print(f"⬇️  Downloading {media_type}...", file=sys.stderr)

            # Use offset for resume if resuming from partial download
            try:
                if resume_offset > 0:
                    result = client.download_media(msg, file=output_file, offset=resume_offset)
                else:
                    result = client.download_media(msg, file=output_file)

                # Telethon's download_media returns file path on success, None on failure
                # Log what we got back
                print(f"📥 download_media returned: {result}", file=sys.stderr)

                # Check if file was actually created
                if not os.path.exists(output_file):
                    print(f"❌ File not found at {output_file}", file=sys.stderr)
                    return False

                file_size = os.path.getsize(output_file)
                expected_size = msg.media.document.size if hasattr(msg.media, 'document') and msg.media.document else None

                print(f"📊 File size: {file_size} bytes", file=sys.stderr)
                if expected_size:
                    print(f"📊 Expected size: {expected_size} bytes", file=sys.stderr)
                    if file_size < expected_size * 0.9:  # Allow 10% margin
                        print(f"⚠️  Download appears incomplete ({file_size} < {expected_size})", file=sys.stderr)
                        return False

                print(f"✅ Downloaded: {file_size} bytes", file=sys.stderr)
                return True

            except Exception as download_err:
                print(f"❌ Download error: {download_err}", file=sys.stderr)
                import traceback
                traceback.print_exc(file=sys.stderr)
                return False

        except Exception as e:
            print(f"❌ Error downloading message: {e}", file=sys.stderr)
            import traceback
            traceback.print_exc()
            return False

    except Exception as e:
        print(f"❌ Client error: {e}", file=sys.stderr)
        import traceback
        traceback.print_exc()
        return False
    finally:
        # Always disconnect to free session lock
        if client:
            try:
                # Properly close all connections
                client.disconnect()
                # Ensure session storage is properly closed
                if hasattr(client, '_session') and client._session:
                    try:
                        client._session.close()
                    except:
                        pass
            except Exception as e:
                print(f"⚠️  Failed to disconnect: {e}", file=sys.stderr)
            finally:
                # Force garbage collection to release resources
                import gc
                gc.collect()

def main():
    if len(sys.argv) < 7:
        print("Usage: download_tg_video.py <chat_id> <message_id> <phone> <api_id> <api_hash> <output_file> [resume_offset] [info_only]", file=sys.stderr)
        sys.exit(1)

    chat_id, message_id, phone, api_id, api_hash, output_file = sys.argv[1:7]
    resume_offset = int(sys.argv[7]) if len(sys.argv) > 7 else 0
    info_only = sys.argv[8] == "1" if len(sys.argv) > 8 else False
    success = download_video_sync(chat_id, message_id, phone, api_id, api_hash, output_file, resume_offset, info_only)
    sys.exit(0 if success else 1)

if __name__ == "__main__":
    main()
