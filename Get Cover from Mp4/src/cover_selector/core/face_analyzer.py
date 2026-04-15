"""Face detection analysis using MediaPipe."""

import numpy as np

from cover_selector.config import FaceAnalysisConfig

# Import MediaPipe components
try:
    from mediapipe import solutions as mp_solutions
    face_detection = mp_solutions.face_detection
except (ImportError, AttributeError):
    try:
        import mediapipe as mp
        face_detection = mp.solutions.face_detection
    except (ImportError, AttributeError):
        raise ImportError(
            "MediaPipe not properly installed. Install with: pip install mediapipe"
        )


class FaceAnalyzer:
    """Detects and analyzes faces in images using MediaPipe."""

    def __init__(self, config: FaceAnalysisConfig):
        """
        Initialize face analyzer.

        Args:
            config: Face analysis configuration
        """
        self.config = config
        self.detector = face_detection.FaceDetection(
            model_selection=0,  # 0=short range (0-2m), 1=full range (0-5m)
            min_detection_confidence=config.face_confidence,
        )

    def analyze(self, image: np.ndarray) -> dict:
        """
        Detect faces and analyze face-related features.

        Args:
            image: Input image (BGR format from OpenCV)

        Returns:
            Dictionary with face metrics:
            - face_count: Number of faces detected
            - largest_face_ratio: Largest face area ratio
            - face_edge_cutoff_ratio: Max face cutoff at edges
            - primary_face_center_offset: Offset of primary face from center
        """
        # MediaPipe expects RGB, not BGR
        image_rgb = image[:, :, ::-1] if len(image.shape) == 3 else image
        h, w = image.shape[:2]

        results = self.detector.process(image_rgb)

        face_count = 0
        face_ratios = []
        face_centers = []
        face_cutoffs = []

        if results.detections:
            face_count = len(results.detections)

            for detection in results.detections:
                # Get bounding box
                bbox = detection.location_data.relative_bounding_box
                left = bbox.xmin
                top = bbox.ymin
                width = bbox.width
                height = bbox.height

                # Convert to pixel coordinates
                x_min = int(left * w)
                y_min = int(top * h)
                x_max = int((left + width) * w)
                y_max = int((top + height) * h)

                # Calculate face area ratio
                face_area = width * height
                image_area = 1.0  # Normalized (relative_bounding_box uses 0-1 range)
                face_ratios.append(face_area)

                # Calculate center position
                face_center_x = left + width / 2.0
                face_center_y = top + height / 2.0
                face_centers.append((face_center_x, face_center_y))

                # Calculate edge cutoff
                cutoff = 0.0
                if left < 0:
                    cutoff = max(cutoff, -left)
                if left + width > 1:
                    cutoff = max(cutoff, (left + width) - 1)
                if top < 0:
                    cutoff = max(cutoff, -top)
                if top + height > 1:
                    cutoff = max(cutoff, (top + height) - 1)
                face_cutoffs.append(cutoff)

        # Calculate metrics
        largest_face_ratio = max(face_ratios) if face_ratios else 0.0
        face_edge_cutoff_ratio = max(face_cutoffs) if face_cutoffs else 0.0

        # Calculate primary face offset from center
        primary_face_center_offset = 0.0
        if face_centers:
            center_x, center_y = face_centers[0]
            offset_x = abs(center_x - 0.5)
            offset_y = abs(center_y - 0.5)
            primary_face_center_offset = max(offset_x, offset_y)

        return {
            "face_count": int(face_count),
            "largest_face_ratio": float(largest_face_ratio),
            "face_edge_cutoff_ratio": float(face_edge_cutoff_ratio),
            "primary_face_center_offset": float(primary_face_center_offset),
            "face_detections": results.detections if results.detections else [],
        }
