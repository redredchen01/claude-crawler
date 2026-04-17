"""Tests for crawler.core.url.normalize — the canonical URL normalizer."""

import pytest

from crawler.core.url import normalize


class TestNormalize:
    def test_lowercases_scheme_and_netloc(self):
        assert normalize("HTTPS://Example.COM/Foo") == "https://example.com/Foo"

    def test_preserves_path_case(self):
        assert normalize("https://example.com/FooBar") == "https://example.com/FooBar"

    def test_preserves_root_slash(self):
        assert normalize("https://example.com/") == "https://example.com/"

    def test_adds_root_slash_for_empty_path(self):
        # Empty path and "/" normalize to the same canonical form.
        assert normalize("https://example.com") == normalize("https://example.com/")

    def test_strips_trailing_slash_on_non_root(self):
        assert normalize("https://example.com/foo/") == "https://example.com/foo"

    def test_strips_fragment(self):
        assert normalize("https://a.com/p#frag") == "https://a.com/p"

    def test_preserves_query_string(self):
        assert normalize("https://a.com/p?x=1&y=2") == "https://a.com/p?x=1&y=2"

    def test_strips_fragment_but_keeps_query(self):
        assert normalize("https://a.com/p?x=1#frag") == "https://a.com/p?x=1"

    def test_query_case_is_preserved(self):
        # Query params are case-sensitive per RFC 3986.
        assert normalize("https://a.com/p?X=A") == "https://a.com/p?X=A"

    def test_deeper_paths_strip_trailing_slash(self):
        assert normalize("https://a.com/a/b/c/") == "https://a.com/a/b/c"

    def test_http_scheme_lowercased(self):
        assert normalize("HTTP://a.com/x") == "http://a.com/x"

    def test_port_preserved(self):
        assert normalize("https://a.com:8443/x/") == "https://a.com:8443/x"

    def test_userinfo_preserved_in_netloc(self):
        # urllib keeps userinfo in netloc; lowercasing netloc lowercases user@host too.
        result = normalize("https://USER@A.com/x")
        assert result.startswith("https://user@a.com")

    def test_idempotent(self):
        url = "https://example.com/foo?bar=baz"
        assert normalize(normalize(url)) == normalize(url)

    def test_differentiates_query_variants(self):
        # Different queries must not collide after normalization.
        assert normalize("https://a.com/p?x=1") != normalize("https://a.com/p?x=2")


@pytest.mark.parametrize(
    "raw,expected",
    [
        ("https://Example.com/", "https://example.com/"),
        ("https://example.com", "https://example.com/"),
        ("HTTPS://Example.COM/Path/", "https://example.com/Path"),
        ("https://a.com/p?x=1#top", "https://a.com/p?x=1"),
        ("https://a.com:443/x/y/", "https://a.com:443/x/y"),
        ("https://a.com/a/b/c", "https://a.com/a/b/c"),
        ("http://SUB.Example.com/Foo", "http://sub.example.com/Foo"),
        ("https://例え.jp/path/", "https://例え.jp/path"),
        ("https://a.com/?empty=1", "https://a.com/?empty=1"),
        ("https://a.com/#only-frag", "https://a.com/"),
        ("https://a.com/one-trailing/", "https://a.com/one-trailing"),
        ("https://a.com/deep/path/segment/", "https://a.com/deep/path/segment"),
        ("https://a.com/with%20encoded/", "https://a.com/with%20encoded"),
        ("https://a.com/x?multi=a&multi=b", "https://a.com/x?multi=a&multi=b"),
        ("https://a.com:8080/", "https://a.com:8080/"),
        ("https://a.com:8080/x#y", "https://a.com:8080/x"),
        ("https://a.com/segment?q=Q#frag", "https://a.com/segment?q=Q"),
        ("http://a.com/simple", "http://a.com/simple"),
        ("HTTPS://SECURE.EXAMPLE.com/Login/", "https://secure.example.com/Login"),
        ("https://a.com/x/", "https://a.com/x"),
    ],
)
def test_golden_url_corpus(raw, expected):
    """Golden-file test: 20 canonical (input, expected) pairs the normalizer must honor.

    Resume correctness depends on this staying deterministic across releases.
    """
    assert normalize(raw) == expected


class TestEngineFrontierAlignment:
    """Engine and Frontier must call the same normalizer."""

    def test_engine_and_frontier_share_implementation(self):
        """Both modules import normalize from crawler.core.url — not duplicated."""
        from crawler.core import engine as engine_mod
        from crawler.core import frontier as frontier_mod

        # Both modules bind the shared normalize function under `_normalize_url`.
        assert engine_mod._normalize_url is frontier_mod._normalize_url
