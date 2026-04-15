# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] - 2026-04-13

### Added
- Initial MVP release of Cover Selector
- Scene detection using frame similarity analysis
- Frame sampling (30 frames per scene)
- Multi-dimensional frame feature extraction:
  - Brightness scoring
  - Edge density analysis
  - Face detection proxy (face ratio and position)
  - Composition quality metrics
- Rule-based frame ranking system
- Content diversity optimization for zoom frame selection:
  - Face position differentiation (left vs right)
  - Zoom level variation (closeup vs medium)
  - Brightness harmony
  - Texture complexity
- Triple-collage composition rendering:
  - Full-width bottom frame for foundation
  - Two diverse closeup overlays
  - Automatic positioning and sizing
- Command-line interface with video input support
- Web UI for interactive testing and visualization
- Comprehensive test suite (250+ tests, 65% coverage)
- Python 3.9+ support with full type hints
- Documentation and contributing guidelines

### Features
- 🎯 Intelligent frame selection using rule-based visual analysis
- 🎨 Triple-collage composition generation
- 📊 Scene detection and frame sampling
- ⚡ Content diversity optimization
- 🔄 Extensible analyzer pipeline
- 🌐 Web UI for testing

### Technical Details
- Local-only processing (no external APIs)
- SQLite caching for performance
- Modular analyzer architecture
- Comprehensive logging and diagnostics

---

## [Unreleased]

### Planned Features
- Real face detection integration (MediaPipe alternative)
- ML-based quality scoring
- Multi-language UI support
- Batch processing CLI
- Performance profiling tools
- Additional composition templates
- Webhook integration for automation
- Video metadata extraction

### Under Consideration
- Cloud API support (optional)
- GPU acceleration for frame processing
- Advanced composition templates
- Video frame preview caching
- Integration with video editing platforms

---

## Development

For detailed version history and commit logs, see [git log](https://github.com/redredchen01/cover-selector-mvp/commits/main).

To report issues or suggest features, please open a [GitHub issue](https://github.com/redredchen01/cover-selector-mvp/issues).
