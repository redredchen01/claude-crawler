"""Image preprocessing: thumbnail generation and resizing."""

from pathlib import Path

import cv2

from cover_selector.config import ImagePreprocessConfig


class ImagePreprocess:
    """Preprocesses images: resizes and creates thumbnails."""

    def __init__(self, config: ImagePreprocessConfig):
        """
        Initialize image preprocessor.

        Args:
            config: Image preprocessing configuration
        """
        self.config = config

    def create_preview(self, image_path: Path, output_path: Path) -> Path:
        """
        Create a preview/thumbnail from original image.

        Resizes long edge to analysis_max_size while maintaining aspect ratio.

        Args:
            image_path: Path to original image
            output_path: Path where to save preview

        Returns:
            Path to saved preview image

        Raises:
            ValueError: If image cannot be read
            IOError: If preview cannot be saved
        """
        try:
            image = cv2.imread(str(image_path))
            if image is None:
                raise ValueError(f"Cannot read image: {image_path}")

            # Get original dimensions
            height, width = image.shape[:2]

            # Calculate scaling factor based on longest edge
            max_edge = max(height, width)
            if max_edge > self.config.analysis_max_size:
                scale_factor = self.config.analysis_max_size / max_edge
                new_width = int(width * scale_factor)
                new_height = int(height * scale_factor)

                # Resize using high-quality interpolation
                resized = cv2.resize(
                    image,
                    (new_width, new_height),
                    interpolation=cv2.INTER_LANCZOS4,
                )
            else:
                resized = image

            # Create output directory if needed
            output_path.parent.mkdir(parents=True, exist_ok=True)

            # Save preview
            success = cv2.imwrite(str(output_path), resized)
            if not success:
                raise IOError(f"Failed to save preview: {output_path}")

            return output_path

        except cv2.error as e:
            raise ValueError(f"OpenCV error processing image: {str(e)}")

    def get_image_dimensions(self, image_path: Path) -> tuple:
        """
        Get image dimensions without loading full image.

        Args:
            image_path: Path to image

        Returns:
            Tuple of (width, height)

        Raises:
            ValueError: If image cannot be read
        """
        image = cv2.imread(str(image_path))
        if image is None:
            raise ValueError(f"Cannot read image: {image_path}")

        height, width = image.shape[:2]
        return width, height
