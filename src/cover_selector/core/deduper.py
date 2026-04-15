"""Deduplication using dHash (difference hash)."""

from pathlib import Path
from typing import Dict, List, Optional

import cv2
import numpy as np

from cover_selector.config import DeduplicationConfig
from cover_selector.schemas.candidate_frame import CandidateFrame


class Deduper:
    """Detects and groups similar frames using dHash."""

    def __init__(self, config: DeduplicationConfig):
        """
        Initialize deduper.

        Args:
            config: Deduplication configuration
        """
        self.config = config
        self.hash_size = 8

    def compute_dhash(self, image: np.ndarray) -> str:
        """
        Compute difference hash (dHash) of image.

        Args:
            image: Input image

        Returns:
            dHash as binary string
        """
        # Convert to grayscale
        if len(image.shape) == 3:
            gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
        else:
            gray = image

        # Resize to (hash_size+1) x hash_size for computing differences
        resized = cv2.resize(gray, (self.hash_size + 1, self.hash_size))

        # Compute horizontal gradients (differences between adjacent pixels)
        diff = resized[:, 1:] > resized[:, :-1]

        # Convert boolean array to hash string
        dhash = "".join("1" if d else "0" for row in diff for d in row)
        return dhash

    def hamming_distance(self, hash1: str, hash2: str) -> int:
        """
        Calculate Hamming distance between two hashes.

        Args:
            hash1: First hash string
            hash2: Second hash string

        Returns:
            Hamming distance (number of different bits)
        """
        return sum(c1 != c2 for c1, c2 in zip(hash1, hash2))

    def deduplicate(
        self, frames: List[CandidateFrame], scores: Dict[int, float]
    ) -> Dict[int, dict]:
        """
        Deduplicate frames and assign group IDs.

        Args:
            frames: List of CandidateFrame objects
            scores: Dict of frame_id -> final_score

        Returns:
            Dict of frame_id -> dedup info:
            - duplicate_group_id: Group ID (or None if not a duplicate)
            - duplicate_similarity_score: Similarity to group representative
            - is_duplicate: Whether frame is a duplicate (not group representative)
        """
        if not self.config.dedup_enabled or len(frames) == 0:
            return {f.frame_id: {"duplicate_group_id": None, "duplicate_similarity_score": 0.0, "is_duplicate": False} for f in frames}

        # Compute hashes for all frames
        hashes: Dict[int, str] = {}
        for frame in frames:
            try:
                image = cv2.imread(str(frame.image_path))
                if image is not None:
                    hashes[frame.frame_id] = self.compute_dhash(image)
            except Exception:
                # If hash computation fails, skip
                pass

        # Find duplicate groups using full-scan approach
        groups: Dict[int, List[int]] = {}  # group_id -> [frame_ids]
        assigned = set()
        next_group_id = 0

        for i, frame_i in enumerate(frames):
            if frame_i.frame_id in assigned or frame_i.frame_id not in hashes:
                continue

            # Start new group with this frame as representative
            group_id = next_group_id
            group = [frame_i.frame_id]
            assigned.add(frame_i.frame_id)

            # Find similar frames
            hash_i = hashes[frame_i.frame_id]
            for j, frame_j in enumerate(frames):
                if i >= j or frame_j.frame_id in assigned or frame_j.frame_id not in hashes:
                    continue

                hash_j = hashes[frame_j.frame_id]
                distance = self.hamming_distance(hash_i, hash_j)

                # If similar, add to group
                if distance <= self.config.dedup_threshold:
                    group.append(frame_j.frame_id)
                    assigned.add(frame_j.frame_id)

            if len(group) > 1:
                groups[group_id] = group
                next_group_id += 1

        # Build result dict
        result = {}
        for frame in frames:
            result[frame.frame_id] = {
                "duplicate_group_id": None,
                "duplicate_similarity_score": 0.0,
                "is_duplicate": False,
            }

        # Mark duplicate frames
        for group_id, group_frames in groups.items():
            # Find highest-scoring frame in group
            best_frame_id = max(
                group_frames,
                key=lambda fid: scores.get(fid, 0.0)
            )

            # Mark all frames in group
            for frame_id in group_frames:
                similarity = 1.0 if frame_id == best_frame_id else 0.8
                result[frame_id] = {
                    "duplicate_group_id": group_id,
                    "duplicate_similarity_score": similarity,
                    "is_duplicate": frame_id != best_frame_id,
                }

        return result
