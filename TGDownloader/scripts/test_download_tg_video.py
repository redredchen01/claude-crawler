#!/usr/bin/env python3
"""Unit tests for download_tg_video.py"""

import json
import sys
import unittest
from unittest.mock import Mock, patch, MagicMock
from io import StringIO

# Import the module to test
sys.path.insert(0, '/Users/dex/YD 2026/TGDownloader/scripts')
from download_tg_video import extract_metadata


class TestExtractMetadata(unittest.TestCase):
    """Test metadata extraction from Telegram messages"""

    def test_extract_metadata_from_message(self):
        """Test basic metadata extraction"""
        # Create a mock message with text
        msg = Mock()
        msg.text = "Sample Video Title"
        msg.media = None

        metadata = extract_metadata(msg)
        self.assertIn("title", metadata)
        self.assertEqual(metadata["title"], "Sample Video Title")

    def test_extract_metadata_truncates_long_title(self):
        """Test that long titles are truncated to 100 chars"""
        msg = Mock()
        msg.text = "x" * 150  # 150 char title
        msg.media = None

        metadata = extract_metadata(msg)
        self.assertEqual(len(metadata["title"]), 100)
        self.assertEqual(metadata["title"], "x" * 100)

    def test_extract_metadata_no_text(self):
        """Test extraction when message has no text"""
        msg = Mock()
        msg.text = None
        msg.media = None

        metadata = extract_metadata(msg)
        self.assertNotIn("title", metadata)

    def test_extract_metadata_filters_none_values(self):
        """Test that None values are filtered out"""
        msg = Mock()
        msg.text = None
        msg.media = None

        metadata = extract_metadata(msg)
        # Should only contain non-None values
        for k, v in metadata.items():
            self.assertIsNotNone(v)

    def test_extract_metadata_with_document(self):
        """Test extraction from document media"""
        msg = Mock()
        msg.text = "Video Title"

        # Mock document
        doc = Mock()
        doc.size = 1024 * 1024 * 100  # 100 MB
        doc.mime_type = "video/mp4"
        doc.attributes = []

        media = Mock()
        media.document = doc
        msg.media = media

        metadata = extract_metadata(msg)
        self.assertEqual(metadata["file_size"], 1024 * 1024 * 100)
        self.assertEqual(metadata["mime_type"], "video/mp4")

    def test_extract_metadata_with_video_attributes(self):
        """Test extraction of video-specific attributes"""
        from telethon.tl.types import DocumentAttributeVideo

        msg = Mock()
        msg.text = "Video"

        # Mock document with video attributes
        doc = Mock()
        doc.size = 50 * 1024 * 1024
        doc.mime_type = "video/mp4"

        # Create a proper DocumentAttributeVideo mock
        video_attr = Mock(spec=DocumentAttributeVideo)
        video_attr.duration = 120  # 2 minutes
        video_attr.w = 1920  # width
        video_attr.h = 1080  # height

        doc.attributes = [video_attr]

        media = Mock()
        media.document = doc
        msg.media = media

        metadata = extract_metadata(msg)
        self.assertIn("duration", metadata)
        self.assertIn("width", metadata)
        self.assertIn("height", metadata)
        self.assertEqual(metadata["duration"], 120)
        self.assertEqual(metadata["width"], 1920)
        self.assertEqual(metadata["height"], 1080)


class TestMetadataJSON(unittest.TestCase):
    """Test JSON serialization of metadata"""

    def test_metadata_is_json_serializable(self):
        """Test that metadata can be converted to JSON"""
        msg = Mock()
        msg.text = "Test Video"
        msg.media = None

        metadata = extract_metadata(msg)
        # Should not raise an exception
        json_str = json.dumps(metadata)
        self.assertIsInstance(json_str, str)

        # Verify JSON can be parsed back
        parsed = json.loads(json_str)
        self.assertEqual(parsed["title"], "Test Video")


if __name__ == "__main__":
    unittest.main()
