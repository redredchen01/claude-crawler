"""High-quality triple-collage image composition using Pillow."""

import logging
from pathlib import Path
from typing import Optional

from PIL import Image, ImageDraw

from cover_selector.config import CompositionAnalysisConfig

logger = logging.getLogger(__name__)


class ImageCompositor:
    """Composes images: bottom frame with two circular overlays inside."""

    def __init__(self, config: CompositionAnalysisConfig):
        """
        Initialize image compositor.

        Args:
            config: CompositionAnalysisConfig with layout and output parameters
        """
        self.config = config
        self.layout = config.layout
        self.output_cfg = config.output

    def compose(
        self,
        bottom_path: str,
        zoom1_path: str,
        zoom2_path: str,
        output_path: str,
        frame_timestamps: Optional[dict] = None,
    ) -> Path:
        """
        Compose images with circular overlays inside the bottom frame.

        Layout:
        - Bottom image: Large frame (1920×1080 or original size), no modifications
        - Zoom1: Circular overlay (360×360) inside bottom frame at top-right, overlaying content
        - Zoom2: Circular overlay (360×360) inside bottom frame at bottom-right, overlaying content

        Args:
            bottom_path: Path to bottom/base image (large frame)
            zoom1_path: Path to first zoom image (will be made circular)
            zoom2_path: Path to second zoom image (will be made circular)
            output_path: Output JPEG path
            frame_timestamps: Optional dict with expected timestamps for verification

        Returns:
            Path to output image

        Raises:
            FileNotFoundError: If input files don't exist
            ValueError: If composition fails
        """
        try:
            # Load and convert images to RGB
            bottom = Image.open(bottom_path).convert('RGB')
            zoom1 = Image.open(zoom1_path).convert('RGB')
            zoom2 = Image.open(zoom2_path).convert('RGB')
        except Exception as e:
            logger.error(f"Failed to load images: {e}")
            raise

        try:
            # Resize zoom images to circular size and make them circular
            circle_size = self.layout.zoom_size  # e.g., 360
            zoom1_circular = self._make_circular_frame(zoom1, circle_size)
            zoom2_circular = self._make_circular_frame(zoom2, circle_size)
        except Exception as e:
            logger.error(f"Failed to process overlay images: {e}")
            raise

        # Use bottom image as canvas (original size, no modifications)
        canvas = bottom.copy()
        canvas_width, canvas_height = canvas.size

        # Position circles INSIDE the bottom frame
        # Top-right: position inside bottom frame with padding
        zoom1_x = canvas_width - circle_size - self.layout.padding
        zoom1_y = self.layout.padding

        # Bottom-right: position inside bottom frame with padding
        zoom2_x = canvas_width - circle_size - self.layout.padding
        zoom2_y = canvas_height - circle_size - self.layout.padding

        # Paste circular frames using their alpha channel as mask
        # This ensures only the circular area is pasted, overlaying the bottom image
        canvas.paste(zoom1_circular, (zoom1_x, zoom1_y), zoom1_circular)
        canvas.paste(zoom2_circular, (zoom2_x, zoom2_y), zoom2_circular)

        # Save with EXIF metadata handling
        self._save_with_metadata(canvas, output_path, bottom_path)

        logger.info(f"Composed image saved to {output_path} (size: {canvas.size})")
        return Path(output_path)

    def _make_circular_frame(self, image: Image.Image, size: int) -> Image.Image:
        """
        Create a circular frame from image with transparent background.

        Returns RGBA image where circle is opaque and outside is transparent.
        This allows proper overlay with alpha blending - no white background.

        Args:
            image: Input image
            size: Output size (diameter of circle)

        Returns:
            RGBA Image with circular frame (circle opaque, outside transparent)
        """
        # Resize image to square
        img_resized = image.resize((size, size), Image.Resampling.LANCZOS)

        # Create circular mask
        mask = Image.new('L', (size, size), 0)
        draw = ImageDraw.Draw(mask)
        draw.ellipse([0, 0, size - 1, size - 1], fill=255)

        # Convert to RGBA and apply circular mask
        img_rgba = img_resized.convert('RGBA')
        img_rgba.putalpha(mask)

        # Return RGBA image with transparent background outside circle
        return img_rgba

    def _save_with_metadata(self, image: Image.Image, output_path: str, exif_source: Optional[str] = None) -> None:
        """
        Save image as JPEG, attempting to preserve EXIF metadata.

        Args:
            image: PIL Image to save
            output_path: Output file path
            exif_source: Source image path to extract EXIF from (optional)
        """
        output_path = Path(output_path)
        output_path.parent.mkdir(parents=True, exist_ok=True)

        # Prepare EXIF data if available
        exif_bytes = None
        if self.output_cfg.preserve_exif and exif_source:
            try:
                import piexif

                try:
                    exif_dict = piexif.load(exif_source)
                    exif_bytes = piexif.dump(exif_dict)
                except piexif.InvalidImageDataError:
                    logger.warning(f"Source EXIF data corrupted, saving without metadata")
                except AttributeError:
                    logger.debug(f"No EXIF metadata in source image")
            except ImportError:
                logger.warning("piexif not installed, cannot preserve EXIF metadata. "
                             "Install with: pip install piexif")
                if not self.output_cfg.fallback_on_exif_fail:
                    raise ValueError("EXIF preservation required but piexif unavailable")

        # Convert to RGB for JPEG if needed
        save_image = image
        if image.mode in ('RGBA', 'LA', 'P'):
            # Create white background for transparency
            save_image = Image.new('RGB', image.size, (255, 255, 255))
            save_image.paste(image, (0, 0), image if image.mode == 'RGBA' else None)

        # Save JPEG with optimal settings
        try:
            save_kwargs = {
                'format': 'JPEG',
                'quality': self.output_cfg.jpg_quality,
                'optimize': self.output_cfg.jpg_optimize,
                'progressive': self.output_cfg.jpg_progressive,
            }
            if exif_bytes:
                save_kwargs['exif'] = exif_bytes
            save_image.save(str(output_path), **save_kwargs)
            logger.info(f"Saved JPEG to {output_path} (quality={self.output_cfg.jpg_quality})")
        except Exception as e:
            # Fallback: save without EXIF if primary save fails
            if self.output_cfg.fallback_on_exif_fail:
                logger.warning(f"JPEG save with EXIF failed, retrying without metadata: {e}")
                save_image.save(
                    str(output_path),
                    'JPEG',
                    quality=self.output_cfg.jpg_quality,
                    optimize=self.output_cfg.jpg_optimize,
                    progressive=self.output_cfg.jpg_progressive,
                )
            else:
                raise
