"""Tests for structured data extraction (JSON-LD, OG, Twitter, microdata)."""

import os
import json

import pytest

from bs4 import BeautifulSoup

from crawler.parser import (
    parse_page,
    _extract_detail_resource,
    _extract_metric,
    _extract_published_date,
    _img_qualifies,
    _normalize_date_triple,
    _parse_metric_number,
    _pick_cover_image,
    _pick_main_container,
    _resolve_img_src,
)

def _img(html: str):
    return BeautifulSoup(html, "lxml").find("img")

class TestOpenGraphExtractor:
    """`_extract_opengraph(soup) -> dict` returns omit-from-dict for
    unhit fields so the Unit 5 merger can distinguish 'source didn't
    provide' from 'source said empty'."""

    def _soup(self, html):
        return BeautifulSoup(html, "lxml")

    def test_full_og_returns_all_fields(self):
        from crawler.parser import _extract_opengraph
        soup = self._soup("""
            <meta property="og:title" content="Real Title">
            <meta property="og:image" content="https://cdn.example.com/p/1.jpg">
            <meta property="og:description" content="A summary.">
            <meta property="article:section" content="Tech">
            <meta property="article:published_time" content="2026-04-17T10:00:00Z">
            <meta property="article:tag" content="python">
            <meta property="article:tag" content="web">
        """)
        out = _extract_opengraph(soup)
        assert out["title"] == "Real Title"
        assert out["cover_url"] == "https://cdn.example.com/p/1.jpg"
        assert out["description"] == "A summary."
        assert out["category"] == "Tech"
        assert out["published_at"] == "2026-04-17T10:00:00Z"
        assert out["tags"] == ["python", "web"]

    def test_empty_og_returns_empty_dict(self):
        from crawler.parser import _extract_opengraph
        out = _extract_opengraph(self._soup("<p>body</p>"))
        assert out == {}

    def test_og_title_seo_chain_stripped(self):
        """og:title carrying `Item｜Section｜Brand` gets normalized via
        _strip_title_site_suffix. Without this, kissavs-class sites
        ship the SEO chain into Resource.title."""
        from crawler.parser import _extract_opengraph
        soup = self._soup(
            '<meta property="og:title" '
            'content="GRACE-029｜角色剧情｜KISSAVS">'
        )
        out = _extract_opengraph(soup)
        assert out["title"] == "GRACE-029"

    def test_og_title_single_pipe_preserved(self):
        """Single pipe is often legitimate punctuation (e.g. "X: Y | Z"
        in article titles). Suffix strip only fires on 2+ pipes."""
        from crawler.parser import _extract_opengraph
        soup = self._soup('<meta property="og:title" content="Item | Site">')
        out = _extract_opengraph(soup)
        assert out["title"] == "Item | Site"

    def test_product_code_hyphen_preserved(self):
        from crawler.parser import _extract_opengraph
        soup = self._soup('<meta property="og:title" content="GRACE-029 Title">')
        out = _extract_opengraph(soup)
        assert "GRACE-029" in out["title"]

    def test_placeholder_image_rejected(self):
        """og:image pointing at a site logo / default image is rejected
        so downstream sees 'source didn't provide cover_url'."""
        from crawler.parser import _extract_opengraph
        for placeholder in [
            "https://site.example/static/default.png",
            "https://site.example/images/site-logo.svg",
            "https://cdn.example/assets/avatar-default.jpg",
            "https://x.com/no-image.png",
            "https://x.com/placeholder.webp",
        ]:
            soup = self._soup(
                f'<meta property="og:image" content="{placeholder}">'
            )
            out = _extract_opengraph(soup)
            assert "cover_url" not in out, f"placeholder not filtered: {placeholder}"

    def test_real_image_accepted(self):
        from crawler.parser import _extract_opengraph
        soup = self._soup(
            '<meta property="og:image" '
            'content="https://cdn.example/uploads/2026/item-042.jpg">'
        )
        out = _extract_opengraph(soup)
        assert out["cover_url"] == "https://cdn.example/uploads/2026/item-042.jpg"

    def test_empty_content_absent_from_dict(self):
        """`<meta property="og:title" content="">` is 'source gave up' —
        we omit from dict, letting next priority source try."""
        from crawler.parser import _extract_opengraph
        soup = self._soup('<meta property="og:title" content="">')
        out = _extract_opengraph(soup)
        assert "title" not in out

    def test_article_tags_deduped_in_order(self):
        from crawler.parser import _extract_opengraph
        soup = self._soup("""
            <meta property="article:tag" content="python">
            <meta property="article:tag" content="web">
            <meta property="article:tag" content="python">
            <meta property="article:tag" content="perf">
        """)
        out = _extract_opengraph(soup)
        assert out["tags"] == ["python", "web", "perf"]

    def test_tags_rejected_when_stuffing(self):
        """20 one-char tags = SEO soup; filter out so DOM scorer wins."""
        from crawler.parser import _extract_opengraph
        metas = "\n".join(
            f'<meta property="article:tag" content="w{i}">' for i in range(25)
        )
        out = _extract_opengraph(self._soup(metas))
        assert "tags" not in out


class TestTwitterCardsExtractor:
    def _soup(self, html):
        return BeautifulSoup(html, "lxml")

    def test_full_twitter(self):
        from crawler.parser import _extract_twitter_cards
        soup = self._soup("""
            <meta name="twitter:title" content="Tweet Title">
            <meta name="twitter:image" content="https://x.com/p/1.jpg">
            <meta name="twitter:description" content="Tweet summary">
        """)
        out = _extract_twitter_cards(soup)
        assert out == {
            "title": "Tweet Title",
            "cover_url": "https://x.com/p/1.jpg",
            "description": "Tweet summary",
        }

    def test_twitter_image_src_fallback(self):
        """Older Twitter Card spec used `twitter:image:src` instead of
        `twitter:image`. Accept both with image-first priority."""
        from crawler.parser import _extract_twitter_cards
        soup = self._soup(
            '<meta name="twitter:image:src" content="https://x.com/legacy.jpg">'
        )
        out = _extract_twitter_cards(soup)
        assert out["cover_url"] == "https://x.com/legacy.jpg"

    def test_twitter_image_preferred_over_src(self):
        from crawler.parser import _extract_twitter_cards
        soup = self._soup("""
            <meta name="twitter:image" content="https://x.com/new.jpg">
            <meta name="twitter:image:src" content="https://x.com/old.jpg">
        """)
        out = _extract_twitter_cards(soup)
        assert out["cover_url"] == "https://x.com/new.jpg"

    def test_empty_twitter(self):
        from crawler.parser import _extract_twitter_cards
        out = _extract_twitter_cards(self._soup("<p>body</p>"))
        assert out == {}

    def test_twitter_placeholder_image_rejected(self):
        from crawler.parser import _extract_twitter_cards
        soup = self._soup(
            '<meta name="twitter:image" content="https://site/default.png">'
        )
        out = _extract_twitter_cards(soup)
        assert "cover_url" not in out


class TestTagKeywordsParsing:
    """`_parse_tags_keywords` normalizes list / delimited-string inputs."""

    def test_python_list(self):
        from crawler.parser import _parse_tags_keywords
        assert _parse_tags_keywords(["a", "b", "c"]) == ["a", "b", "c"]

    def test_comma_delimited_string(self):
        from crawler.parser import _parse_tags_keywords
        assert _parse_tags_keywords("python, web, perf") == ["python", "web", "perf"]

    def test_cjk_delimiters(self):
        from crawler.parser import _parse_tags_keywords
        assert _parse_tags_keywords("偶像，巨乳、痴女;纪录片") == [
            "偶像", "巨乳", "痴女", "纪录片"
        ]

    def test_empty_string(self):
        from crawler.parser import _parse_tags_keywords
        assert _parse_tags_keywords("") == []

    def test_none(self):
        from crawler.parser import _parse_tags_keywords
        assert _parse_tags_keywords(None) == []

    def test_dedup_preserves_order(self):
        from crawler.parser import _parse_tags_keywords
        assert _parse_tags_keywords(["a", "b", "a", "c"]) == ["a", "b", "c"]

    def test_unsupported_type_returns_empty(self):
        from crawler.parser import _parse_tags_keywords
        assert _parse_tags_keywords({"unexpected": "dict"}) == []


class TestStuffingGate:
    def test_normal_tag_list_passes(self):
        from crawler.parser import _tags_pass_stuffing_gate
        assert _tags_pass_stuffing_gate(["python", "web", "performance"]) is True

    def test_too_many_tags_rejected(self):
        from crawler.parser import _tags_pass_stuffing_gate
        assert _tags_pass_stuffing_gate([f"t{i}" for i in range(20)]) is False

    def test_too_short_average_rejected(self):
        from crawler.parser import _tags_pass_stuffing_gate
        # 5 one-char tags → avg 1 < 2
        assert _tags_pass_stuffing_gate(["a", "b", "c", "d", "e"]) is False

    def test_empty_list_rejected(self):
        from crawler.parser import _tags_pass_stuffing_gate
        assert _tags_pass_stuffing_gate([]) is False

    def test_boundary_15_passes(self):
        from crawler.parser import _tags_pass_stuffing_gate
        # 15 tags each 4 chars → at the edge but valid
        assert _tags_pass_stuffing_gate([f"tag{i:02d}" for i in range(15)]) is True

    def test_boundary_16_rejected(self):
        from crawler.parser import _tags_pass_stuffing_gate
        assert _tags_pass_stuffing_gate([f"tag{i:02d}" for i in range(16)]) is False


class TestMicrodataExtractor:
    """`_extract_microdata(soup) -> dict` reads schema.org microdata
    via [itemscope][itemtype] + itemprop attributes. Unhit fields omitted."""

    def _soup(self, html):
        return BeautifulSoup(html, "lxml")

    def test_happy_path_article(self):
        from crawler.parser import _extract_microdata
        soup = self._soup("""
            <article itemscope itemtype="https://schema.org/Article">
                <h1 itemprop="name">Microdata Title</h1>
                <meta itemprop="description" content="A summary.">
                <img itemprop="image" src="https://cdn.example/p.jpg">
                <meta itemprop="datePublished" content="2026-04-17">
                <meta itemprop="articleSection" content="Tech">
                <meta itemprop="keywords" content="python,web,perf">
            </article>
        """)
        out = _extract_microdata(soup)
        assert out == {
            "title": "Microdata Title",
            "cover_url": "https://cdn.example/p.jpg",
            "description": "A summary.",
            "published_at": "2026-04-17",
            "category": "Tech",
            "tags": ["python", "web", "perf"],
        }

    def test_no_itemscope_returns_empty(self):
        from crawler.parser import _extract_microdata
        out = _extract_microdata(self._soup("<p>no microdata here</p>"))
        assert out == {}

    def test_image_src_from_img_tag(self):
        from crawler.parser import _extract_microdata
        soup = self._soup(
            '<article itemscope itemtype="https://schema.org/Article">'
            '<img itemprop="image" src="https://cdn/item.jpg"></article>'
        )
        out = _extract_microdata(soup)
        assert out["cover_url"] == "https://cdn/item.jpg"

    def test_published_date_from_meta_content(self):
        from crawler.parser import _extract_microdata
        soup = self._soup(
            '<article itemscope itemtype="https://schema.org/Article">'
            '<meta itemprop="datePublished" content="2026-04-17T10:00:00Z"></article>'
        )
        out = _extract_microdata(soup)
        assert out["published_at"] == "2026-04-17T10:00:00Z"

    def test_time_datetime_attribute(self):
        from crawler.parser import _extract_microdata
        soup = self._soup(
            '<article itemscope itemtype="https://schema.org/Article">'
            '<time itemprop="datePublished" datetime="2026-04-17">Apr 17</time>'
            '</article>'
        )
        out = _extract_microdata(soup)
        assert out["published_at"] == "2026-04-17"

    def test_multiple_top_scopes_picks_largest(self):
        """Page has BreadcrumbList (small) + Article (large). Article wins."""
        from crawler.parser import _extract_microdata
        soup = self._soup("""
            <nav itemscope itemtype="https://schema.org/BreadcrumbList">
                <span itemprop="name">Home</span>
            </nav>
            <article itemscope itemtype="https://schema.org/Article">
                <h1 itemprop="name">Real Content Title</h1>
                <p>A long body of text that makes this block the largest by text weight.</p>
            </article>
        """)
        out = _extract_microdata(soup)
        assert out["title"] == "Real Content Title"

    def test_nested_itemscope_does_not_pollute(self):
        """A nested entity's itemprop must not leak into the parent."""
        from crawler.parser import _extract_microdata
        soup = self._soup("""
            <article itemscope itemtype="https://schema.org/Article">
                <h1 itemprop="name">Outer Title</h1>
                <span itemscope itemtype="https://schema.org/Person">
                    <span itemprop="name">Jane Author</span>
                </span>
            </article>
        """)
        out = _extract_microdata(soup)
        assert out["title"] == "Outer Title"

    def test_placeholder_image_rejected(self):
        from crawler.parser import _extract_microdata
        soup = self._soup(
            '<article itemscope itemtype="https://schema.org/Article">'
            '<img itemprop="image" src="https://site/static/default.png">'
            '</article>'
        )
        out = _extract_microdata(soup)
        assert "cover_url" not in out

    def test_stuffed_keywords_rejected(self):
        from crawler.parser import _extract_microdata
        stuffed = ",".join(f"w{i}" for i in range(25))
        soup = self._soup(
            f'<article itemscope itemtype="https://schema.org/Article">'
            f'<meta itemprop="keywords" content="{stuffed}"></article>'
        )
        out = _extract_microdata(soup)
        assert "tags" not in out

    def test_damaged_itemscope_no_itemtype_still_works(self):
        """`itemscope` without `itemtype` fails the selector; graceful
        empty return. (Our selector requires both.)"""
        from crawler.parser import _extract_microdata
        out = _extract_microdata(self._soup(
            '<div itemscope><span itemprop="name">X</span></div>'
        ))
        assert out == {}


# ---------------------------------------------------------------------------
# Plan 005 Unit 4 — JSON-LD extractor (full field coverage)
# ---------------------------------------------------------------------------

class TestJsonLdExtractorFieldCoverage:
    """_extract_jsonld(blocks) consolidates metrics + all structured
    fields from schema.org JSON-LD entities. Input is pre-parsed
    entity list (BS4-independent so priority tests can use dict literals)."""

    def test_video_object_full(self):
        from crawler.parser import _extract_jsonld
        blocks = [{
            "@type": "VideoObject",
            "name": "Grace 029",
            "image": "https://cdn/p.jpg",
            "description": "A video description.",
            "datePublished": "2026-04-17",
            "articleSection": "Roleplay",
            "keywords": "python, web, perf",
            "interactionStatistic": [
                {"@type": "InteractionCounter",
                 "interactionType": {"@type": "WatchAction"},
                 "userInteractionCount": 14143},
                {"@type": "InteractionCounter",
                 "interactionType": {"@type": "LikeAction"},
                 "userInteractionCount": 3096},
            ],
        }]
        out = _extract_jsonld(blocks)
        assert out == {
            "title": "Grace 029",
            "cover_url": "https://cdn/p.jpg",
            "description": "A video description.",
            "published_at": "2026-04-17",
            "category": "Roleplay",
            "tags": ["python", "web", "perf"],
            "views": 14143,
            "likes": 3096,
        }

    def test_no_detail_type_returns_empty(self):
        from crawler.parser import _extract_jsonld
        blocks = [{"@type": "BreadcrumbList", "itemListElement": []}]
        assert _extract_jsonld(blocks) == {}

    def test_empty_blocks(self):
        from crawler.parser import _extract_jsonld
        assert _extract_jsonld([]) == {}

    def test_article_plus_breadcrumb_picks_article(self):
        from crawler.parser import _extract_jsonld
        blocks = [
            {"@type": "BreadcrumbList", "itemListElement": [{"name": "Home"}]},
            {"@type": "Article", "name": "Article Title",
             "image": "https://cdn/a.jpg"},
        ]
        out = _extract_jsonld(blocks)
        assert out["title"] == "Article Title"
        assert out["cover_url"] == "https://cdn/a.jpg"

    def test_image_as_dict(self):
        from crawler.parser import _extract_jsonld
        blocks = [{
            "@type": "Article",
            "name": "X",
            "image": {"@type": "ImageObject", "url": "https://cdn/i.jpg"},
        }]
        assert _extract_jsonld(blocks)["cover_url"] == "https://cdn/i.jpg"

    def test_image_as_list(self):
        from crawler.parser import _extract_jsonld
        blocks = [{
            "@type": "Article",
            "name": "X",
            "image": ["https://cdn/first.jpg", "https://cdn/second.jpg"],
        }]
        assert _extract_jsonld(blocks)["cover_url"] == "https://cdn/first.jpg"

    def test_thumbnail_url_fallback(self):
        from crawler.parser import _extract_jsonld
        blocks = [{
            "@type": "Article",
            "name": "X",
            "thumbnailUrl": "https://cdn/thumb.jpg",
        }]
        assert _extract_jsonld(blocks)["cover_url"] == "https://cdn/thumb.jpg"

    def test_keywords_as_list(self):
        from crawler.parser import _extract_jsonld
        blocks = [{"@type": "Article", "name": "X",
                   "keywords": ["python", "web", "perf"]}]
        assert _extract_jsonld(blocks)["tags"] == ["python", "web", "perf"]

    def test_keywords_cjk_delimiters(self):
        from crawler.parser import _extract_jsonld
        blocks = [{"@type": "Article", "name": "X",
                   "keywords": "偶像，巨乳、痴女;纪录片"}]
        assert _extract_jsonld(blocks)["tags"] == ["偶像", "巨乳", "痴女", "纪录片"]

    def test_keywords_stuffed_dropped(self):
        from crawler.parser import _extract_jsonld
        blocks = [{"@type": "Article", "name": "X",
                   "keywords": ",".join(f"w{i}" for i in range(25))}]
        assert "tags" not in _extract_jsonld(blocks)

    def test_at_type_as_list(self):
        """schema.org allows multiple types on one entity."""
        from crawler.parser import _extract_jsonld
        blocks = [{"@type": ["CreativeWork", "VideoObject"], "name": "X"}]
        assert _extract_jsonld(blocks)["title"] == "X"

    def test_uploaddate_fallback(self):
        from crawler.parser import _extract_jsonld
        blocks = [{"@type": "VideoObject", "name": "X",
                   "uploadDate": "2026-01-15"}]
        assert _extract_jsonld(blocks)["published_at"] == "2026-01-15"

    def test_metrics_schema_url_form(self):
        """Some sites write http://schema.org/WatchAction — must be parsed."""
        from crawler.parser import _extract_jsonld
        blocks = [{
            "@type": "VideoObject",
            "name": "X",
            "interactionStatistic": [{
                "@type": "InteractionCounter",
                "interactionType": "http://schema.org/WatchAction",
                "userInteractionCount": 42,
            }],
        }]
        assert _extract_jsonld(blocks)["views"] == 42

    def test_picks_more_complete_entity(self):
        """When multiple detail entities exist, prefer name+image."""
        from crawler.parser import _extract_jsonld
        blocks = [
            {"@type": "Article", "name": "Poor"},
            {"@type": "Article", "name": "Rich", "image": "https://cdn/i.jpg"},
        ]
        assert _extract_jsonld(blocks)["title"] == "Rich"

    def test_placeholder_image_rejected(self):
        from crawler.parser import _extract_jsonld
        blocks = [{"@type": "Article", "name": "X",
                   "image": "https://cdn/default-cover.png"}]
        assert "cover_url" not in _extract_jsonld(blocks)


# ---------------------------------------------------------------------------
# Plan 005 Unit 5 — merge_by_priority (pure) + _extract_structured (wrapper)
# ---------------------------------------------------------------------------

class TestMergeByPriority:
    """Pure-dict tests for priority/validation/omit semantics — no BS4."""

    def test_single_source(self):
        from crawler.parser import _merge_by_priority
        merged, prov, desc = _merge_by_priority([
            ("jsonld", {"title": "T", "views": 10}),
        ])
        assert merged == {"title": "T", "views": 10}
        assert prov["title"] == "jsonld"
        assert prov["views"] == "jsonld"
        assert prov["tags"] == "missing"
        assert desc == ""

    def test_higher_priority_wins(self):
        from crawler.parser import _merge_by_priority
        merged, prov, _ = _merge_by_priority([
            ("jsonld", {"title": "From JSON-LD"}),
            ("opengraph", {"title": "From OG"}),
        ])
        assert merged["title"] == "From JSON-LD"
        assert prov["title"] == "jsonld"

    def test_fills_missing_from_lower(self):
        from crawler.parser import _merge_by_priority
        merged, prov, _ = _merge_by_priority([
            ("jsonld", {"views": 100}),
            ("opengraph", {"title": "OG Title"}),
        ])
        assert merged == {"views": 100, "title": "OG Title"}
        assert prov["views"] == "jsonld"
        assert prov["title"] == "opengraph"

    def test_description_propagates_separately(self):
        from crawler.parser import _merge_by_priority
        merged, prov, desc = _merge_by_priority([
            ("jsonld", {"title": "T", "description": "desc from jl"}),
        ])
        assert desc == "desc from jl"
        # description is NOT in merged_fields or provenance
        assert "description" not in merged
        assert "description" not in prov

    def test_description_first_source_wins(self):
        from crawler.parser import _merge_by_priority
        _, _, desc = _merge_by_priority([
            ("jsonld", {"description": "jl"}),
            ("opengraph", {"description": "og"}),
        ])
        assert desc == "jl"

    def test_description_falls_through_to_lower_priority(self):
        from crawler.parser import _merge_by_priority
        _, _, desc = _merge_by_priority([
            ("jsonld", {"title": "T"}),
            ("opengraph", {"description": "og desc"}),
        ])
        assert desc == "og desc"

    def test_invalid_views_falls_through(self):
        """JSON-LD returns views as string → invalid, OG doesn't have
        views, so field stays missing (DOM will fill later in Unit 6)."""
        from crawler.parser import _merge_by_priority
        merged, prov, _ = _merge_by_priority([
            ("jsonld", {"views": "not-an-int"}),
        ])
        assert "views" not in merged
        assert prov["views"] == "missing"

    def test_views_zero_is_valid(self):
        """Correctness #2: JSON-LD-declared 0 is a real signal."""
        from crawler.parser import _merge_by_priority
        merged, prov, _ = _merge_by_priority([
            ("jsonld", {"views": 0}),
        ])
        assert merged["views"] == 0
        assert prov["views"] == "jsonld"

    def test_views_negative_rejected(self):
        from crawler.parser import _merge_by_priority
        merged, prov, _ = _merge_by_priority([
            ("jsonld", {"views": -5}),
        ])
        assert "views" not in merged
        assert prov["views"] == "missing"

    def test_views_bool_rejected(self):
        """bool is a subclass of int in Python — explicit reject to
        prevent `{"views": True}` from becoming views=1."""
        from crawler.parser import _merge_by_priority
        merged, _, _ = _merge_by_priority([("jsonld", {"views": True})])
        assert "views" not in merged

    def test_empty_tags_list_rejected(self):
        from crawler.parser import _merge_by_priority
        merged, _, _ = _merge_by_priority([("jsonld", {"tags": []})])
        assert "tags" not in merged

    def test_placeholder_cover_rejected(self):
        from crawler.parser import _merge_by_priority
        merged, _, _ = _merge_by_priority([
            ("jsonld", {"cover_url": "https://site/static/default.png"}),
        ])
        assert "cover_url" not in merged

    def test_non_http_cover_rejected(self):
        from crawler.parser import _merge_by_priority
        merged, _, _ = _merge_by_priority([
            ("jsonld", {"cover_url": "not a url"}),
        ])
        assert "cover_url" not in merged

    def test_fields_outside_whitelist_ignored(self):
        """Defense: unknown fields silently dropped (don't let a future
        extractor typo pollute merged_fields)."""
        from crawler.parser import _merge_by_priority
        merged, _, _ = _merge_by_priority([
            ("jsonld", {"title": "T", "unknown_field": "x"}),
        ])
        assert "unknown_field" not in merged

    def test_all_sources_empty_produces_all_missing(self):
        from crawler.parser import _merge_by_priority
        merged, prov, desc = _merge_by_priority([])
        assert merged == {}
        assert desc == ""
        from crawler.raw_data import PROVENANCE_FIELDS, PROVENANCE_MISSING
        for field in PROVENANCE_FIELDS:
            assert prov[field] == PROVENANCE_MISSING


class TestExtractStructuredIntegration:
    """Thin integration test for the BS4-aware wrapper — priority logic
    is covered by TestMergeByPriority, here we only verify that the four
    source extractors are wired correctly."""

    def test_kissavs_style_jsonld_video_wins(self):
        from crawler.parser import _extract_structured
        html = """
            <meta property="og:title" content="OG Title">
            <script type="application/ld+json">
            {"@type":"VideoObject","name":"JSON-LD Title",
             "interactionStatistic":[{"@type":"InteractionCounter",
                "interactionType":{"@type":"WatchAction"},
                "userInteractionCount":5000}]}
            </script>
        """
        soup = BeautifulSoup(html, "lxml")
        merged, prov, _ = _extract_structured(soup)
        # JSON-LD name wins over OG title
        assert merged["title"] == "JSON-LD Title"
        assert prov["title"] == "jsonld"
        assert merged["views"] == 5000
        assert prov["views"] == "jsonld"

    def test_og_only_when_no_jsonld(self):
        from crawler.parser import _extract_structured
        html = '<meta property="og:title" content="Only OG">'
        soup = BeautifulSoup(html, "lxml")
        merged, prov, _ = _extract_structured(soup)
        assert merged["title"] == "Only OG"
        assert prov["title"] == "opengraph"

    def test_completely_empty_page(self):
        from crawler.parser import _extract_structured
        soup = BeautifulSoup("<p>nothing</p>", "lxml")
        merged, prov, desc = _extract_structured(soup)
        assert merged == {}
        assert desc == ""
        from crawler.raw_data import PROVENANCE_MISSING
        assert prov["title"] == PROVENANCE_MISSING


# ---------------------------------------------------------------------------
# Plan 005 Unit 6 — _extract_detail_resource with structured-first path
# ---------------------------------------------------------------------------

class TestDetailResourceStructuredFirst:
    """Unit 6 — Resource.raw_data carries provenance + description;
    structured fields win; DOM fallback on misses."""

    def _parse(self, html, url="https://example.com/item/1"):
        r = parse_page(html, url)
        assert len(r.resources) == 1, r.page_type
        return r.resources[0]

    def test_jsonld_wins_for_all_fields_when_present(self):
        html = """
        <html><head>
        <meta property="og:title" content="OG Title">
        <script type="application/ld+json">
        {"@type":"VideoObject","name":"JSON-LD Title",
         "image":"https://cdn/j.jpg","description":"JSON-LD desc",
         "datePublished":"2026-04-17",
         "interactionStatistic":[
            {"@type":"InteractionCounter",
             "interactionType":{"@type":"WatchAction"},
             "userInteractionCount":14143},
            {"@type":"InteractionCounter",
             "interactionType":{"@type":"LikeAction"},
             "userInteractionCount":3096}
         ]}
        </script>
        </head><body><article><h1>JSON-LD Title</h1>
        <p>body</p></article></body></html>
        """
        res = self._parse(html, "https://example.com/video/1")
        assert res.title == "JSON-LD Title"
        assert res.views == 14143
        assert res.likes == 3096
        assert res.cover_url == "https://cdn/j.jpg"

        from crawler.raw_data import parse_raw_data
        raw = parse_raw_data(res.raw_data)
        assert raw["provenance"]["title"] == "jsonld"
