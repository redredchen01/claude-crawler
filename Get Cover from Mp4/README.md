# Cover Selector 🎬

[English](README.md) · [中文](README.zh.md)

Extract perfect video cover frames and generate rich triple-collage compositions automatically.

**Key Features:**
- 🎯 Intelligent frame selection based on rule-based visual analysis
- 🎨 Triple-collage composition (1 wide-shot bottom + 2 diverse closeup overlays)
- 📊 Scene detection and frame sampling for comprehensive analysis
- ⚡ Content diversity optimization (face vs body closeups)
- 🔄 Extensible analyzer pipeline
- 🌐 Web UI for interactive testing

## What It Does

Cover Selector analyzes your video and selects three frames optimized for cover image composition:

1. **Bottom Frame** — Full-width, well-composed shot that serves as the foundation
2. **Zoom #1** — First closeup with high quality
3. **Zoom #2** — Second closeup with different content (e.g., face vs body) to maximize visual interest

The three frames are combined into a 3-panel collage cover image.

## Installation

### Requirements
- Python 3.9+
- FFmpeg

### Setup

```bash
# Clone the repository
git clone https://github.com/yourusername/cover-selector.git
cd cover-selector

# Create virtual environment
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate

# Install dependencies
pip install -e ".[dev]"

# Verify installation
cover-selector --help
```

## Quick Start

### Web UI

```bash
python app.py
# Open http://localhost:8002 in your browser
# Drag & drop a video file to get started
```

### Command Line

```bash
cover-selector /path/to/video.mp4 --output /path/to/output/
```

### Python API

```python
from cover_selector.config import CoverSelectorConfig
from cover_selector.core.complete_pipeline import VideoToTripleCollagePipeline
from pathlib import Path

config = CoverSelectorConfig()
pipeline = VideoToTripleCollagePipeline(config)
results = pipeline.run("video.mp4", Path("output"))

print(f"Cover image: {results['final_cover']}")
```

## Architecture

### Pipeline Stages

```
Video Input
    ↓
Stage 1: Scene Detection (SceneDetector)
    ↓
Stage 2: Frame Sampling (FrameSampler) - 30 frames per scene
    ↓
Stage 3: Feature Extraction & Scoring (Scorer)
    ↓
Stage 4: Ranking (Ranker)
    ↓
Stage 5: Composition Analysis (ComposerAnalyzer)
         - Bottom frame selection (composition quality)
         - Zoom frame selection (content diversity optimization)
    ↓
Stage 6: Image Composition (ImageCompositor)
    ↓
Output: Triple-Collage Cover Image
```

### Key Components

- **SceneDetector** — Detects scene boundaries using frame similarity
- **FrameSampler** — Extracts candidate frames uniformly across scenes
- **Scorer** — Evaluates frame quality across multiple dimensions
- **Ranker** — Ranks frames by weighted score
- **ComposerAnalyzer** — Selects frames for composition with content diversity
- **ImageCompositor** — Renders final triple-collage image

## Content Diversity Optimization

The **Zoom Frame Selection** algorithm ensures the two closeup overlays show different content:

### Content Type Classification
- **Face** — `largest_face_ratio > 0.35` (face close-up)
- **Medium** — `0.2 < largest_face_ratio ≤ 0.35` (body upper half)
- **Body** — `largest_face_ratio ≤ 0.2` (full body or scene)

### Diversity Scoring
```
diversity = type_difference × 0.50       (primary: face vs body)
          + position_difference × 0.25   (left vs right for faces)
          + brightness_difference × 0.15 (lighting contrast)
          + edge_density_difference × 0.10 (texture complexity)
```

**Result:** Zoom frames are selected to maximize visual difference, avoiding similar duplicate closeups.

## Configuration

Edit `src/cover_selector/config.py` or pass options via environment:

```python
from cover_selector.config import CoverSelectorConfig

config = CoverSelectorConfig(
    scene_detection_threshold=25.0,  # Scene change sensitivity
    frame_samples_per_scene=30,      # Frames to extract per scene
)
```

## Testing

Run the test suite:

```bash
# All tests
pytest tests/ -v

# Specific test file
pytest tests/test_composer_analyzer.py -v

# With coverage
pytest tests/ --cov=src/cover_selector --cov-report=html
```

Current test coverage: **81%** for composer analysis, **26%** overall (pipeline uses heuristics, not all code paths fully tested in unit tests).

## Development

### Code Style

```bash
# Format with Black
black src/ tests/

# Sort imports with isort
isort src/ tests/

# Type checking with mypy
mypy src/

# Lint with flake8
flake8 src/ tests/
```

### Adding New Analyzers

Extend the `src/cover_selector/core/` directory:

```python
# Example: new analyzer
from cover_selector.schemas.frame_features import FrameFeatures

class MyAnalyzer:
    def analyze(self, image) -> dict:
        """Return dict of feature values to merge into FrameFeatures."""
        return {"my_score": 0.8}
```

Integrate into the pipeline in `complete_pipeline.py`.

## Limitations

- **Heuristic-Based:** Uses rule-based visual analysis without ML models
- **No Face Detection:** Currently uses frame characteristics as proxy for face detection (no MediaPipe)
- **Local-Only:** Runs entirely locally, no cloud processing
- **Video Format:** Best results with modern codecs (H.264, VP9)

## Performance

- **Frame Sampling:** ~1-2s per video (depends on scene count and duration)
- **Feature Extraction:** ~30-50ms per frame
- **Composition:** ~100ms for final render
- **Total:** 30s video → ~5-10 seconds end-to-end

*Tested on MacBook Pro M1 with 2GB candidate frame cache*

## Contributing

Contributions are welcome! Please see [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines on:
- Setting up development environment
- Code style and quality standards
- Testing requirements
- Pull request process

### Areas for Improvement

Help wanted in these areas:

- [ ] Real face detection integration (MediaPipe alternative)
- [ ] ML-based quality scoring
- [ ] Multi-language UI support
- [ ] Batch processing CLI
- [ ] Performance profiling & optimization
- [ ] Additional composition templates

## License

MIT License — see [LICENSE](LICENSE) file

## Acknowledgments

Built with:
- OpenCV for image processing
- Pydantic for data validation
- Typer for CLI framework
- scene-detect for scene detection

## Support

For questions or feedback:
- Visit the [GitHub repository](https://github.com/redredchen01/cover-selector-mvp)
- Check existing code and documentation
- Review test examples in `tests/` directory
