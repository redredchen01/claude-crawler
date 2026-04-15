"""OCR text detection using Tesseract."""

import numpy as np
import pytesseract
from PIL import Image

from cover_selector.config import OCRDetectionConfig


class OCRDetector:
    """Detects text regions in images using Tesseract OCR."""

    def __init__(self, config: OCRDetectionConfig):
        """
        Initialize OCR detector.

        Args:
            config: OCR detection configuration
        """
        self.config = config

    def analyze(self, image: np.ndarray) -> dict:
        """
        Detect text in image regions.

        Args:
            image: Input image (BGR from OpenCV)

        Returns:
            Dictionary with OCR metrics:
            - ocr_text_count: Number of text regions
            - ocr_text_area_ratio: Ratio of text to image
            - bottom_subtitle_ratio: Bottom region text ratio
            - corner_text_ratio: Corner regions text ratio
            - center_text_ratio: Center region text ratio
        """
        if not self.config.ocr_enabled:
            return {
                "ocr_text_count": 0,
                "ocr_text_area_ratio": 0.0,
                "bottom_subtitle_ratio": 0.0,
                "corner_text_ratio": 0.0,
                "center_text_ratio": 0.0,
            }

        try:
            h, w = image.shape[:2]

            # Convert BGR to RGB for PIL
            image_rgb = image[:, :, ::-1]
            pil_image = Image.fromarray(image_rgb)

            # Detect text with Tesseract
            data = pytesseract.image_to_data(
                pil_image,
                output_type=pytesseract.Output.DICT,
                config="--psm 6",
            )

            # Count text regions (words detected)
            text_count = sum(1 for conf in data["conf"] if int(conf) > 0)

            # Calculate text areas
            text_area = 0.0
            bottom_area = 0.0
            corner_area = 0.0
            center_area = 0.0

            for idx in range(len(data["text"])):
                if int(data["conf"][idx]) <= 0:
                    continue

                x, y, w_box, h_box = (
                    data["left"][idx],
                    data["top"][idx],
                    data["width"][idx],
                    data["height"][idx],
                )
                box_area = w_box * h_box

                # Add to total text area
                text_area += box_area

                # Check regions
                y_ratio = y / h
                y_end_ratio = (y + h_box) / h

                # Bottom 20% (subtitle region)
                if y_ratio > 0.8:
                    bottom_area += box_area
                # Center region (< 0.4 margin from sides and top/bottom)
                elif (
                    0.15 < y_ratio < 0.85
                    and x / w > 0.15
                    and (x + w_box) / w < 0.85
                ):
                    center_area += box_area
                # Corners (top-left, top-right, bottom-left, bottom-right)
                elif (y_ratio < 0.2 or y_end_ratio > 0.8) and (
                    x / w < 0.2 or (x + w_box) / w > 0.8
                ):
                    corner_area += box_area

            # Calculate ratios
            image_area = h * w
            ocr_text_area_ratio = text_area / image_area if image_area > 0 else 0.0
            bottom_subtitle_ratio = bottom_area / image_area if image_area > 0 else 0.0
            corner_text_ratio = corner_area / image_area if image_area > 0 else 0.0
            center_text_ratio = center_area / image_area if image_area > 0 else 0.0

            return {
                "ocr_text_count": int(text_count),
                "ocr_text_area_ratio": float(min(ocr_text_area_ratio, 1.0)),
                "bottom_subtitle_ratio": float(min(bottom_subtitle_ratio, 1.0)),
                "corner_text_ratio": float(min(corner_text_ratio, 1.0)),
                "center_text_ratio": float(min(center_text_ratio, 1.0)),
            }

        except Exception as e:
            # If OCR fails, return zeros
            return {
                "ocr_text_count": 0,
                "ocr_text_area_ratio": 0.0,
                "bottom_subtitle_ratio": 0.0,
                "corner_text_ratio": 0.0,
                "center_text_ratio": 0.0,
            }
