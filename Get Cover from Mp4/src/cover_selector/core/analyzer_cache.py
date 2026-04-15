"""Global analyzer cache for performance optimization."""

import logging

logger = logging.getLogger(__name__)

# Global singleton analyzers (initialized once per process)
_analyzers = {}


def get_analyzer(analyzer_class, config, force_reinit=False):
    """
    Get or create a global singleton analyzer instance.

    Args:
        analyzer_class: The analyzer class to instantiate
        config: Configuration object for the analyzer
        force_reinit: Force reinitialization even if cached

    Returns:
        Singleton instance of the analyzer
    """
    cache_key = analyzer_class.__name__

    if not force_reinit and cache_key in _analyzers:
        return _analyzers[cache_key]

    logger.debug(f"Initializing analyzer: {cache_key}")
    instance = analyzer_class(config)
    _analyzers[cache_key] = instance
    return instance


def clear_cache():
    """Clear all cached analyzers."""
    _analyzers.clear()
    logger.info("Analyzer cache cleared")


def get_cache_stats():
    """Get cache statistics."""
    return {
        "cached_analyzers": len(_analyzers),
        "analyzer_types": list(_analyzers.keys()),
    }
