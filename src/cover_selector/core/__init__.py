"""Core cover selector modules."""

from cover_selector.core.blur_analyzer import BlurAnalyzer
from cover_selector.core.brightness_analyzer import BrightnessAnalyzer
from cover_selector.core.composition_analyzer import CompositionAnalyzer
from cover_selector.core.deduper import Deduper
from cover_selector.core.frame_sampler import FrameSampler
from cover_selector.core.image_preprocess import ImagePreprocess
from cover_selector.core.ocr_detector import OCRDetector
from cover_selector.core.ranker import Ranker
from cover_selector.core.report_builder import ReportBuilder
from cover_selector.core.scene_detector import SceneDetector
from cover_selector.core.scorer import Scorer

# FaceAnalyzer requires MediaPipe which may not be available
try:
    from cover_selector.core.face_analyzer import FaceAnalyzer
except (ImportError, AttributeError):
    FaceAnalyzer = None

__all__ = [
    "BlurAnalyzer",
    "BrightnessAnalyzer",
    "CompositionAnalyzer",
    "Deduper",
    "FaceAnalyzer",
    "FrameSampler",
    "ImagePreprocess",
    "OCRDetector",
    "Ranker",
    "ReportBuilder",
    "SceneDetector",
    "Scorer",
]
