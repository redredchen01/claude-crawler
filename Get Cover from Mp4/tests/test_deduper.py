"""Tests for deduplication."""

import pytest
import numpy as np

from cover_selector.config import DeduplicationConfig
from cover_selector.core.deduper import Deduper


@pytest.fixture
def config():
    """Default deduplication config."""
    return DeduplicationConfig()


@pytest.fixture
def deduper(config):
    """Deduper instance."""
    return Deduper(config)


def test_deduper_init(config):
    """Test Deduper initialization."""
    deduper = Deduper(config)
    assert deduper.config == config
    assert deduper.hash_size == 8


def test_dhash_computation(deduper):
    """Test dHash computation."""
    # Create simple image
    image = np.zeros((100, 100, 3), dtype=np.uint8)
    image[25:75, 25:75] = 255

    dhash = deduper.compute_dhash(image)

    assert isinstance(dhash, str)
    assert len(dhash) == 64  # 8x8 = 64 bits
    assert all(c in "01" for c in dhash)


def test_hamming_distance(deduper):
    """Test Hamming distance calculation."""
    hash1 = "1010" * 16  # 64 bits
    hash2 = "1010" * 16

    distance = deduper.hamming_distance(hash1, hash2)
    assert distance == 0

    # Different hash
    hash3 = "1111" * 16
    distance = deduper.hamming_distance(hash1, hash3)
    assert distance > 0


def test_deduplicate_empty_list(deduper):
    """Test deduplication with empty frame list."""
    result = deduper.deduplicate([], {})
    assert result == {}


def test_deduplicate_disabled(config):
    """Test deduplication when disabled."""
    config.dedup_enabled = False
    deduper = Deduper(config)

    # Create mock frames (won't load images, just check logic)
    from cover_selector.schemas.candidate_frame import CandidateFrame
    from pathlib import Path

    frame = CandidateFrame(
        frame_id=0,
        scene_id=0,
        timestamp_sec=0.0,
        image_path=Path("/fake/path.jpg"),
        preview_path=Path("/fake/preview.jpg"),
    )

    result = deduper.deduplicate([frame], {0: 100.0})

    assert result[0]["duplicate_group_id"] is None
    assert result[0]["is_duplicate"] is False
