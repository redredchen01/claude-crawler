"""Blur/clarity analysis using Laplacian variance."""

import cv2
import numpy as np

from cover_selector.config import BlurAnalysisConfig


class BlurAnalyzer:
    """Analyzes image clarity using Laplacian variance and edge detection."""

    def __init__(self, config: BlurAnalysisConfig):
        """
        Initialize blur analyzer.

        Args:
            config: Blur analysis configuration
        """
        self.config = config

    def analyze(self, image: np.ndarray) -> dict:
        """
        Analyze image clarity and blur.

        Args:
            image: Input image (BGR or grayscale)

        Returns:
            Dictionary with:
            - blur_score: 0-100 clarity score
            - laplacian_variance: Laplacian variance
            - edge_density: Edge pixel ratio
        """
        # Convert to grayscale if needed
        if len(image.shape) == 3:
            gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
        else:
            gray = image

        # Calculate Laplacian variance (sharpness metric)
        laplacian = cv2.Laplacian(gray, cv2.CV_64F)
        laplacian_variance = laplacian.var()

        # Calculate edge density using Canny
        edges = cv2.Canny(gray, 100, 200)
        edge_pixels = np.count_nonzero(edges)
        total_pixels = edges.shape[0] * edges.shape[1]
        edge_density = edge_pixels / total_pixels if total_pixels > 0 else 0.0

        # Normalize Laplacian variance to 0-100 scale
        # Typical sharp images have variance > 500, blurry < 100
        normalized_variance = min(laplacian_variance, 1000.0)
        blur_score = (normalized_variance / 1000.0) * 100.0

        return {
            "blur_score": float(blur_score),
            "laplacian_variance": float(laplacian_variance),
            "edge_density": float(edge_density),
        }
