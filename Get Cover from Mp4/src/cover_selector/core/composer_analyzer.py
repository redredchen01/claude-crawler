"""Analyzes ranking results and selects frames for composition."""

import logging
from typing import Dict, List

from cover_selector.config import CompositionAnalysisConfig
from cover_selector.schemas.frame_features import FrameFeatures
from cover_selector.schemas.ranking_result import RankingResult

logger = logging.getLogger(__name__)


class CompositionAnalysisResult:
    """Result of composition analysis."""

    def __init__(self):
        self.is_degraded = False
        self.degradation_reason = None
        self.bottom_image = None
        self.zoom_images = []


class ComposerAnalyzer:
    """Analyzes ranking results and selects frames for triple-collage composition."""

    def __init__(self, config: CompositionAnalysisConfig):
        """
        Initialize composer analyzer.

        Args:
            config: Composition analysis configuration
        """
        self.config = config

    def compose(
        self,
        ranking_results: List[RankingResult],
        frame_features_map: Dict[int, FrameFeatures],
        metadata: Dict = None,
    ) -> CompositionAnalysisResult:
        """
        Analyze ranking results and select frames for composition.

        Strategy:
        - Triple-collage mode: Intelligently select 3 frames based on composition requirements
          - Bottom image: Prefer complete, well-composed frames (not closeup, good balance)
          - Zoom images: Prefer frames with closeup/detail elements for visual richness
        - Degraded mode: If fewer than 3 valid frames, use single image mode

        Selection criteria:
        - Bottom frame: High composition_balance_score, not closeup, subject well-framed
        - Zoom frames: Closeup frames or frames with distinct subject presence

        Args:
            ranking_results: List of ranked frames
            frame_features_map: Mapping of frame_id → FrameFeatures
            metadata: Optional metadata (duration, etc.)

        Returns:
            CompositionAnalysisResult with selected frames and mode
        """
        result = CompositionAnalysisResult()

        # Filter and sort by final score (descending)
        valid_results = [
            r for r in ranking_results
            if r.status != "rejected" and r.final_score > 0
        ]
        valid_results.sort(key=lambda x: x.final_score, reverse=True)

        logger.info(f"Composition analysis: {len(valid_results)} valid frames from {len(ranking_results)} total")

        # Need at least 3 frames for triple-collage, fallback to degraded if fewer
        if len(valid_results) < 3:
            result.is_degraded = True
            result.degradation_reason = f"Insufficient frames for triple-collage ({len(valid_results)} < 3)"
            logger.warning(result.degradation_reason)

            # Use first frame as bottom image in degraded mode
            if valid_results:
                selected = valid_results[0]
                if selected.frame_id in frame_features_map:
                    result.bottom_image = frame_features_map[selected.frame_id]
                else:
                    result.is_degraded = True
                    result.degradation_reason = "Selected frame not found in features map"
        else:
            # Triple-collage mode: intelligently select frames for better composition
            result.is_degraded = False
            result.degradation_reason = None

            # Calculate video duration for time diversity
            if metadata and 'duration' in metadata:
                video_duration = metadata['duration']
            else:
                all_timestamps = [f.timestamp_sec for f in frame_features_map.values() if f.timestamp_sec > 0]
                video_duration = max(all_timestamps) if all_timestamps else 0.0

            # Find best bottom frame: prefer complete, well-composed frames
            bottom_frame = self._select_bottom_frame(valid_results, frame_features_map)
            if bottom_frame:
                result.bottom_image = bottom_frame
            else:
                result.is_degraded = True
                result.degradation_reason = "Could not find suitable bottom frame"
                return result

            # Find zoom frames: prefer frames with closeup/detail elements
            remaining_results = [
                r for r in valid_results
                if r.frame_id != bottom_frame.frame_id
            ]
            zoom_frames = self._select_zoom_frames(
                remaining_results,
                frame_features_map,
                count=2,
                bottom_features=bottom_frame,
                video_duration=video_duration
            )

            if len(zoom_frames) >= 2:
                result.zoom_images = zoom_frames[:2]
            else:
                # Fallback: use next highest scoring frames
                logger.warning(f"Could not find closeup frames, using top scorers instead")
                for i in range(1, min(3, len(valid_results))):
                    if valid_results[i].frame_id != bottom_frame.frame_id:
                        features = frame_features_map.get(valid_results[i].frame_id)
                        if features:
                            result.zoom_images.append(features)
                            if len(result.zoom_images) >= 2:
                                break

            # Ensure exactly 2 zoom images
            if len(result.zoom_images) < 2:
                result.is_degraded = True
                result.degradation_reason = f"Insufficient zoom frames ({len(result.zoom_images)} < 2)"
                logger.warning(result.degradation_reason)

        logger.info(
            f"Composition result: {'triple-collage' if not result.is_degraded else 'degraded'} mode, "
            f"bottom={result.bottom_image.frame_id if result.bottom_image else None}, "
            f"zooms={[z.frame_id for z in result.zoom_images]}"
        )

        return result

    def _select_bottom_frame(
        self,
        ranking_results: List[RankingResult],
        frame_features_map: Dict[int, FrameFeatures]
    ) -> FrameFeatures:
        """
        Select the best frame for bottom/base image.

        Criteria: Complete, well-composed frames with good balance
        - High composition_balance_score (prefer well-framed content) - ENHANCED ×8
        - Not a closeup (is_closeup=False for wider context)
        - Not subject too small (is_subject_too_small=False)
        - Good exposure (not over/underexposed) - NEW CHECK
        - Avoid scene boundaries (prefer middle frames) - NEW
        - High overall score
        """
        candidates = []

        for rank_result in ranking_results:
            if rank_result.frame_id not in frame_features_map:
                continue

            features = frame_features_map[rank_result.frame_id]

            # Prefer frames that are:
            # 1. Not closeups (shows more context)
            # 2. Subject not too small (has presence)
            # 3. Good composition balance (well-framed) - ENHANCED
            # 4. Not subject cutoff (complete subject)
            # 5. Good exposure for visibility - NEW
            # 6. Not at scene boundaries - NEW

            score = rank_result.final_score

            # Bonus for non-closeup frames (complete composition)
            if not features.is_closeup:
                score += 10

            # ENHANCED: Stronger bonus for good composition balance (was ×5, now ×8)
            if hasattr(features, 'composition_balance_score'):
                score += features.composition_balance_score * 8

            # NEW: Bonus for good exposure (visible details)
            if features.overexposure_score < 30 and features.underexposure_score < 30:
                score += 10

            # NEW: Slight bonus for well-centered frames (avoid scene boundaries)
            # Frames closer to 0.5 (middle) are better
            center_offset = abs(features.subject_center_offset - 0.5)
            if center_offset < 0.3:
                score += 5

            # Penalty for subject too small
            if features.is_subject_too_small:
                score -= 20

            # Penalty for subject cutoff
            if features.is_subject_cutoff:
                score -= 10

            # ENHANCED: Stronger penalty for poor exposure (was no check, now -15)
            if features.overexposure_score > 60 or features.underexposure_score > 60:
                score -= 15

            candidates.append((score, features))

        if candidates:
            candidates.sort(key=lambda x: x[0], reverse=True)
            logger.info(f"Selected bottom frame: {candidates[0][1].frame_id} (completeness score: {candidates[0][0]:.1f})")
            return candidates[0][1]

        return None

    def _get_content_type(self, largest_face_ratio: float) -> str:
        """
        Classify frame content type based on face ratio.

        Face ratio indicates what the frame focuses on:
        - > 0.35: Face close-up (脸部特写)
        - 0.2-0.35: Medium (身体上半身)
        - < 0.2: Body/Scene (身体全景或场景)

        Returns: "face", "medium", or "body"
        """
        if largest_face_ratio > 0.35:
            return "face"
        elif largest_face_ratio > 0.2:
            return "medium"
        else:
            return "body"

    def _compute_content_diversity(
        self,
        frame_a: FrameFeatures,
        frame_b: FrameFeatures
    ) -> float:
        """
        Compute visual content diversity between two frames (0-1).

        Primary goal: Prefer different "content types" (face vs body)
        - Face close-up (脸部特写): face_ratio > 0.35
        - Body/Scene (身体或场景): face_ratio < 0.2

        Secondary dimensions for frames of same type:
        - Face position: left vs right
        - Brightness: different lighting
        - Texture: different scene complexity

        Returns: 0.0 (identical) to 1.0 (maximally different)
        """
        # PRIMARY: Content type diversity (50% weight)
        # Different types = face vs body = most visually distinct
        type_a = self._get_content_type(frame_a.largest_face_ratio)
        type_b = self._get_content_type(frame_b.largest_face_ratio)

        if type_a != type_b:
            # Different content types (e.g., face close-up vs body)
            type_diversity = 1.0  # Maximum diversity
        else:
            # Same type: use face ratio difference within that category
            ratio_diff = abs(frame_a.largest_face_ratio - frame_b.largest_face_ratio)
            type_diversity = min(ratio_diff / 0.15, 1.0)  # Normalize to 0-1

        # SECONDARY: Face position diversity (25% weight)
        # Only matters if both are face close-ups
        face_pos_diff = abs(frame_a.primary_face_center_offset - frame_b.primary_face_center_offset)
        pos_score = min(face_pos_diff / 0.4, 1.0)  # 0.4 offset = fully diverse

        # Brightness diversity (15% weight)
        brightness_diff = abs(frame_a.brightness_score - frame_b.brightness_score)
        brightness_score = min(brightness_diff / 40.0, 1.0)

        # Edge density diversity (10% weight)
        edge_diff = abs(frame_a.edge_density - frame_b.edge_density)
        edge_score = min(edge_diff / 0.3, 1.0)

        diversity = (
            type_diversity * 0.50 +  # Content type is most important
            pos_score * 0.25 +
            brightness_score * 0.15 +
            edge_score * 0.10
        )

        logger.debug(
            f"Diversity frame {frame_a.frame_id}-{frame_b.frame_id}: "
            f"type={type_a}/{type_b}({type_diversity:.2f}), "
            f"pos({pos_score:.2f}), bright({brightness_score:.2f}), edge({edge_score:.2f}) → {diversity:.3f}"
        )

        return diversity

    def _select_zoom_frames(
        self,
        ranking_results: List[RankingResult],
        frame_features_map: Dict[int, FrameFeatures],
        count: int = 2,
        bottom_features: FrameFeatures = None,
        video_duration: float = 0.0,
    ) -> List[FrameFeatures]:
        """
        Select frames for zoom/closeup overlays.

        Criteria: Frames with closeup or detail elements for visual richness
        - Prefer closeup frames (is_closeup=True for focused details)
        - Prefer frames with CLEAR subject presence (was >0.05, now >0.15) - ENHANCED
        - Prefer frames with good composition
        - STRONGER exposure requirements - NEW
        - Brightness harmony with bottom frame - NEW (#2 优化)
        - Time diversity spread across video - NEW (#3 优化)
        """
        candidates = []

        for rank_result in ranking_results:
            if rank_result.frame_id not in frame_features_map:
                continue

            features = frame_features_map[rank_result.frame_id]

            # Prefer frames that are:
            # 1. Closeups (detailed, focused view)
            # 2. Good subject presence (clear focal point) - ENHANCED (>0.15)
            # 3. Good exposure (visible details) - ENHANCED
            # 4. Good composition

            score = rank_result.final_score

            # Bonus for closeup frames (detailed, visual interest)
            if features.is_closeup:
                score += 15

            # ENHANCED: Stronger requirement for clear subject presence
            # Was >0.05 (5%), now >0.15 (15%) - ensures clear facial features
            if not features.is_subject_too_small and features.largest_face_ratio > 0.15:
                score += 12  # Also increased from 8 to 12

            # Bonus for good composition
            if hasattr(features, 'composition_balance_score'):
                score += features.composition_balance_score * 4  # Increased from 3 to 4

            # ENHANCED: Stricter exposure check
            # Was >50 bad, now >40 bad - catch subtle exposure issues
            if features.overexposure_score < 40 and features.underexposure_score < 40:
                score += 8  # Bonus for good exposure

            # ENHANCED: Stronger penalty for bad exposure
            # Makes sure closeups are actually visible
            if features.overexposure_score > 50 or features.underexposure_score > 50:
                score -= 20  # Increased from 15 to 20

            # Penalty for cutoff (incomplete detail)
            if features.is_subject_cutoff:
                score -= 5

            # #2 HARMONY: Brightness harmony with bottom frame
            if bottom_features:
                brightness_diff = abs(features.brightness_score - bottom_features.brightness_score)
                if brightness_diff < 20:
                    score += 6   # Similar brightness = good visual harmony
                elif brightness_diff > 50:
                    score -= 8   # Too different = jarring contrast

                # Subject scale consistency: zoom should show bigger face than bottom
                if features.largest_face_ratio > bottom_features.largest_face_ratio * 1.2:
                    score += 8   # Zoom is actually more zoomed in = expected

            candidates.append((score, features))

        if candidates:
            candidates.sort(key=lambda x: x[0], reverse=True)

            # TWO-STAGE SELECTION: Time Diversity + Content Diversity
            # Stage 1: Select zoom_1 by quality + time constraint
            # Stage 2: Select zoom_2 by quality + content_diversity (one face, one body/scene)

            HARD_GAP = video_duration * 0.20 if video_duration > 0 else 0.0
            CONTENT_DIVERSITY_BONUS = 35  # Max bonus from content diversity

            selected = []

            # === STAGE 1: Select zoom_1 (quality + time constraint) ===
            zoom_1 = None
            if video_duration > 0 and bottom_features:
                # Prefer first frame that passes hard time constraint
                for score, feat in candidates:
                    dist_from_bottom = abs(feat.timestamp_sec - bottom_features.timestamp_sec)
                    if dist_from_bottom >= HARD_GAP:
                        zoom_1 = feat
                        logger.info(f"Zoom #1 selected: frame {feat.frame_id} (type: {self._get_content_type(feat.largest_face_ratio)}, time dist: {dist_from_bottom:.2f}s ≥ {HARD_GAP:.2f}s)")
                        break

            if zoom_1 is None:
                # Fallback: take best quality regardless of time
                zoom_1 = candidates[0][1]
                logger.warning(f"Zoom #1 (fallback to quality): frame {zoom_1.frame_id}")

            selected.append(zoom_1)

            # === STAGE 2: Select zoom_2 with content diversity preference ===
            if len(candidates) > 1:
                best_combined = -float('inf')
                zoom_2 = None
                zoom_2_diversity = 0.0

                for score, feat in candidates:
                    if feat == zoom_1:
                        continue

                    # Hard constraint: zoom_2 also must be far from bottom
                    if video_duration > 0 and bottom_features:
                        dist_from_bottom = abs(feat.timestamp_sec - bottom_features.timestamp_sec)
                        if dist_from_bottom < HARD_GAP:
                            continue  # Skip candidates too close to bottom

                    # CONTENT DIVERSITY: Prefer different frame types (face vs body)
                    content_diversity = self._compute_content_diversity(zoom_1, feat)
                    type_a = self._get_content_type(zoom_1.largest_face_ratio)
                    type_b = self._get_content_type(feat.largest_face_ratio)

                    # Combine quality + content diversity
                    combined = score + content_diversity * CONTENT_DIVERSITY_BONUS

                    # Extra bonus for temporal distance from zoom_1
                    if video_duration > 0:
                        dist_from_zoom1 = abs(feat.timestamp_sec - zoom_1.timestamp_sec)
                        if dist_from_zoom1 >= HARD_GAP:
                            combined += 5

                    if combined > best_combined:
                        best_combined = combined
                        zoom_2 = feat
                        zoom_2_diversity = content_diversity

                # Fallback: if hard constraint filtered all candidates
                if zoom_2 is None and len(candidates) > 1:
                    logger.warning(f"Hard time constraint removed all zoom_2 candidates, using best by quality+diversity")
                    for score, feat in candidates:
                        if feat == zoom_1:
                            continue
                        content_diversity = self._compute_content_diversity(zoom_1, feat)
                        combined = score + content_diversity * CONTENT_DIVERSITY_BONUS
                        if combined > best_combined:
                            best_combined = combined
                            zoom_2 = feat
                            zoom_2_diversity = content_diversity

                if zoom_2:
                    selected.append(zoom_2)
                    type_b = self._get_content_type(zoom_2.largest_face_ratio)
                    logger.info(f"Zoom #2 selected: frame {zoom_2.frame_id} (type: {type_a}/{type_b}, diversity: {zoom_2_diversity:.3f})")

            result = selected[:count]
            logger.info(f"Final zoom frames: {[f.frame_id for f in result]} (content diversity optimized)")
            return result

        return []
