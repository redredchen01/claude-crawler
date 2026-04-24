from .engine import ParsingEngine
from .tag import TagExtractor
from .density import DensityExtractor
from .structured import StructuredExtractor
from crawler.models import ParseResult

# Initialize the fully-unleashed modular engine
_engine = ParsingEngine(
    extractors=[
        StructuredExtractor(), # High-fidelity metadata first
        TagExtractor(threshold=2), # Multi-signal tags
        DensityExtractor() # Semantic DOM fallback
    ]
)

def parse_page(html: str, url: str, source: str = "static") -> ParseResult:
    """Entry point for parsing HTML into resources and links. Fully Unleashed."""
    return _engine.parse(html, url, source=source)

