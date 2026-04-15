"""Brightness and exposure analysis."""

import cv2
import numpy as np

from cover_selector.config import BrightnessAnalysisConfig


class BrightnessAnalyzer:
    """Analyzes image brightness, contrast, and exposure."""

    def __init__(self, config: BrightnessAnalysisConfig):
        """
        Initialize brightness analyzer.

        Args:
            config: Brightness analysis configuration
        """
        self.config = config

    def analyze(self, image: np.ndarray) -> dict:
        """
        Analyze image brightness and exposure.

        Args:
            image: Input image (BGR or grayscale)

        Returns:
            Dictionary with brightness metrics:
            - brightness_score: 0-100 average brightness
            - contrast_score: 0-100 contrast
            - overexposure_score: % of overexposed pixels
            - underexposure_score: % of underexposed pixels
        """
        # Convert to grayscale if needed
        if len(image.shape) == 3:
            gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
        else:
            gray = image

        # Calculate brightness (mean pixel value)
        mean_intensity = np.mean(gray)
        brightness_score = (mean_intensity / 255.0) * 100.0

        # Calculate contrast (standard deviation)
        std_intensity = np.std(gray)
        contrast_score = min((std_intensity / 128.0) * 100.0, 100.0)

        # Calculate overexposure (pixels > 240)
        overexposed = np.sum(gray > 240)
        overexposure_score = (overexposed / gray.size) * 100.0

        # Calculate underexposure (pixels < 20)
        underexposed = np.sum(gray < 20)
        underexposure_score = (underexposed / gray.size) * 100.0

        return {
            "brightness_score": float(brightness_score),
            "contrast_score": float(contrast_score),
            "overexposure_score": float(overexposure_score),
            "underexposure_score": float(underexposure_score),
        }
