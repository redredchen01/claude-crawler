# Contributing to Cover Selector

Thank you for your interest in contributing! This document outlines the process for contributing to Cover Selector.

## Getting Started

1. **Fork the repository** on GitHub
2. **Clone your fork**:
   ```bash
   git clone https://github.com/YOUR_USERNAME/cover-selector-mvp.git
   cd cover-selector-mvp
   ```

3. **Create a virtual environment**:
   ```bash
   python -m venv venv
   source venv/bin/activate  # On Windows: venv\Scripts\activate
   ```

4. **Install in development mode**:
   ```bash
   pip install -e ".[dev]"
   ```

## Development Workflow

### Code Style

We follow strict code quality standards:

- **Formatting**: Black (line length: 100)
- **Import sorting**: isort (Black profile)
- **Type checking**: mypy
- **Linting**: flake8

### Before Committing

```bash
# Format code
black src/ tests/

# Sort imports
isort src/ tests/

# Type check
mypy src/

# Lint
flake8 src/ tests/

# Run tests
pytest tests/ -v --cov=src/cover_selector --cov-report=term-missing
```

### Making Changes

1. **Create a feature branch**:
   ```bash
   git checkout -b feat/your-feature-name
   ```

2. **Make your changes** following the code style guidelines

3. **Add tests** for new functionality in `tests/`

4. **Run the full test suite** to ensure nothing breaks:
   ```bash
   pytest tests/ -v
   ```

5. **Commit with clear messages**:
   ```bash
   git commit -m "feat: Add your feature description"
   ```

6. **Push and create a pull request**:
   ```bash
   git push origin feat/your-feature-name
   ```

## Commit Message Format

Use conventional commit format:
- `feat:` - New feature
- `fix:` - Bug fix
- `docs:` - Documentation
- `refactor:` - Code refactoring
- `test:` - Test additions/modifications
- `chore:` - Build, dependencies, etc.

Example: `feat: Add parallel frame processing support`

## Code Quality Standards

### Test Coverage

All new features must include tests. Aim for:
- **Happy path**: Core functionality works correctly
- **Edge cases**: Boundary conditions, empty inputs, special values
- **Error paths**: Invalid inputs, failure scenarios
- **Integration**: Cross-layer functionality

### Documentation

- Add docstrings to all public functions/classes
- Include type hints for parameters and returns
- Update README.md if behavior changes
- Add comments for non-obvious logic

### Performance Considerations

- Profile before optimizing
- Consider memory usage (especially with large videos)
- Use caching appropriately
- Avoid blocking operations in hot paths

## Testing

```bash
# Run all tests
pytest tests/

# Run specific test file
pytest tests/test_composer_analyzer.py -v

# Run with coverage
pytest tests/ --cov=src/cover_selector --cov-report=html
```

Coverage report will be in `htmlcov/index.html`

## Pull Request Process

1. Update documentation and README if needed
2. Add tests for new functionality
3. Ensure all tests pass locally
4. Write a clear PR description explaining:
   - What problem does this solve?
   - How does it work?
   - Any breaking changes?

5. Be responsive to review feedback

## Reporting Issues

Found a bug? Please create an issue with:
- Clear description of the problem
- Steps to reproduce
- Expected vs. actual behavior
- Python version and OS
- Relevant error messages or logs

## Questions?

Feel free to open a discussion or check existing code and tests for examples.

---

**Thank you for contributing to Cover Selector!** 🎬✨
