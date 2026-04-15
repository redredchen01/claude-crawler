"""Tests for data transformer."""

import pytest

from src.config import FilterConfig, TransformConfig
from src.transformer import DataTransformer


def test_column_selection():
    """Test extracting specific columns."""
    transformer = DataTransformer()
    data = [
        {"id": 1, "name": "Alice", "email": "alice@example.com"},
        {"id": 2, "name": "Bob", "email": "bob@example.com"},
    ]
    config = TransformConfig(columns=["id", "name"])
    result = transformer.transform(data, config)

    assert result.total_input == 2
    assert result.total_output == 2
    assert set(result.headers) == {"id", "name"}


def test_column_dot_notation():
    """Test column extraction with dot notation for nested fields."""
    transformer = DataTransformer()
    data = [
        {"user": {"name": "Alice", "address": {"city": "NYC"}}, "id": 1},
        {"user": {"name": "Bob", "address": {"city": "LA"}}, "id": 2},
    ]
    config = TransformConfig(columns=["id", "user.name", "user.address.city"])
    result = transformer.transform(data, config)

    assert result.total_output == 2
    assert "Alice" in [row.get("user.name") for row in result.rows]


def test_filter_eq():
    """Test equals filter."""
    transformer = DataTransformer()
    data = [
        {"id": 1, "status": "open"},
        {"id": 2, "status": "closed"},
        {"id": 3, "status": "open"},
    ]
    config = TransformConfig(filters=[FilterConfig(field="status", op="eq", value="open")])
    result = transformer.transform(data, config)

    assert result.total_input == 3
    assert result.total_output == 2
    assert all(row["status"] == "open" for row in result.rows)


def test_filter_ne():
    """Test not equals filter."""
    transformer = DataTransformer()
    data = [
        {"id": 1, "status": "open"},
        {"id": 2, "status": "closed"},
    ]
    config = TransformConfig(filters=[FilterConfig(field="status", op="ne", value="closed")])
    result = transformer.transform(data, config)

    assert result.total_output == 1
    assert result.rows[0]["status"] == "open"


def test_filter_gt():
    """Test greater than filter."""
    transformer = DataTransformer()
    data = [{"id": 1, "value": 10}, {"id": 2, "value": 20}, {"id": 3, "value": 30}]
    config = TransformConfig(filters=[FilterConfig(field="value", op="gt", value=15)])
    result = transformer.transform(data, config)

    assert result.total_output == 2
    assert all(int(row["value"]) > 15 for row in result.rows)


def test_filter_lt():
    """Test less than filter."""
    transformer = DataTransformer()
    data = [{"id": 1, "value": 10}, {"id": 2, "value": 20}, {"id": 3, "value": 30}]
    config = TransformConfig(filters=[FilterConfig(field="value", op="lt", value=25)])
    result = transformer.transform(data, config)

    assert result.total_output == 2


def test_filter_contains():
    """Test contains filter."""
    transformer = DataTransformer()
    data = [
        {"id": 1, "name": "Alice"},
        {"id": 2, "name": "Bob"},
        {"id": 3, "name": "Alicia"},
    ]
    config = TransformConfig(filters=[FilterConfig(field="name", op="contains", value="ali")])
    result = transformer.transform(data, config)

    assert result.total_output == 2


def test_filter_startswith():
    """Test startswith filter."""
    transformer = DataTransformer()
    data = [
        {"id": 1, "name": "Alice"},
        {"id": 2, "name": "Bob"},
        {"id": 3, "name": "Andrew"},
    ]
    config = TransformConfig(filters=[FilterConfig(field="name", op="startswith", value="A")])
    result = transformer.transform(data, config)

    assert result.total_output == 2


def test_filter_regex():
    """Test regex filter."""
    transformer = DataTransformer()
    data = [
        {"id": 1, "email": "alice@example.com"},
        {"id": 2, "email": "bob@test.com"},
        {"id": 3, "email": "charlie@example.com"},
    ]
    config = TransformConfig(
        filters=[FilterConfig(field="email", op="regex", value=r".*@example\.com$")]
    )
    result = transformer.transform(data, config)

    assert result.total_output == 2


def test_filter_multiple():
    """Test multiple filters (AND logic)."""
    transformer = DataTransformer()
    data = [
        {"id": 1, "status": "open", "value": 10},
        {"id": 2, "status": "open", "value": 20},
        {"id": 3, "status": "closed", "value": 30},
    ]
    config = TransformConfig(
        filters=[
            FilterConfig(field="status", op="eq", value="open"),
            FilterConfig(field="value", op="gt", value=15),
        ]
    )
    result = transformer.transform(data, config)

    assert result.total_output == 1
    assert result.rows[0]["id"] == 2


def test_sort_asc():
    """Test ascending sort."""
    transformer = DataTransformer()
    data = [{"id": 3}, {"id": 1}, {"id": 2}]
    config = TransformConfig(sort_by="id", sort_order="asc")
    result = transformer.transform(data, config)

    assert [row["id"] for row in result.rows] == [1, 2, 3]


def test_sort_desc():
    """Test descending sort."""
    transformer = DataTransformer()
    data = [{"id": 1}, {"id": 3}, {"id": 2}]
    config = TransformConfig(sort_by="id", sort_order="desc")
    result = transformer.transform(data, config)

    assert [row["id"] for row in result.rows] == [3, 2, 1]


def test_sort_dates():
    """Test sorting date strings."""
    transformer = DataTransformer()
    data = [
        {"id": 1, "date": "2026-03-01"},
        {"id": 2, "date": "2026-03-03"},
        {"id": 3, "date": "2026-03-02"},
    ]
    config = TransformConfig(sort_by="date", sort_order="asc")
    result = transformer.transform(data, config)

    assert [row["id"] for row in result.rows] == [1, 3, 2]


def test_sort_strings():
    """Test sorting strings."""
    transformer = DataTransformer()
    data = [{"id": 1, "name": "Charlie"}, {"id": 2, "name": "Alice"}, {"id": 3, "name": "Bob"}]
    config = TransformConfig(sort_by="name", sort_order="asc")
    result = transformer.transform(data, config)

    assert [row["name"] for row in result.rows] == ["Alice", "Bob", "Charlie"]


def test_deduplicate():
    """Test deduplication."""
    transformer = DataTransformer()
    data = [{"id": 1, "name": "Alice"}, {"id": 2, "name": "Alice"}, {"id": 3, "name": "Bob"}]
    config = TransformConfig(deduplicate_by="name")
    result = transformer.transform(data, config)

    assert result.total_output == 2
    assert [row["name"] for row in result.rows] == ["Alice", "Bob"]


def test_limit():
    """Test limiting rows."""
    transformer = DataTransformer()
    data = [{"id": i} for i in range(10)]
    config = TransformConfig(limit=5)
    result = transformer.transform(data, config)

    assert result.total_output == 5


def test_full_pipeline():
    """Test complete transformation pipeline."""
    transformer = DataTransformer()
    data = [
        {"id": 5, "status": "open", "value": 10, "name": "E"},
        {"id": 4, "status": "closed", "value": 20, "name": "D"},
        {"id": 3, "status": "open", "value": 30, "name": "C"},
        {"id": 2, "status": "open", "value": 15, "name": "B"},
        {"id": 1, "status": "open", "value": 5, "name": "A"},
    ]
    config = TransformConfig(
        columns=["id", "name"],
        filters=[
            FilterConfig(field="status", op="eq", value="open"),
            FilterConfig(field="value", op="gt", value=8),
        ],
        sort_by="id",
        sort_order="asc",
        deduplicate_by="id",
        limit=2,
    )
    result = transformer.transform(data, config)

    assert result.total_input == 5
    assert result.total_output == 2
    assert result.rows[0]["id"] == 2
    assert result.rows[1]["id"] == 3


def test_to_markdown_table():
    """Test Markdown table formatting."""
    transformer = DataTransformer()
    data = [{"id": 1, "name": "Alice"}, {"id": 2, "name": "Bob"}]
    config = TransformConfig(columns=["id", "name"])
    result = transformer.transform(data, config)

    markdown = transformer.to_markdown(result)
    assert "|" in markdown
    assert "---" in markdown
    assert "Alice" in markdown


def test_to_markdown_pipe_escape():
    """Test Markdown table escapes pipe characters."""
    transformer = DataTransformer()
    data = [{"id": 1, "text": "a|b"}]
    config = TransformConfig()
    result = transformer.transform(data, config)

    markdown = transformer.to_markdown(result)
    assert "a\\|b" in markdown


def test_to_csv():
    """Test CSV formatting."""
    transformer = DataTransformer()
    data = [{"id": 1, "name": "Alice"}, {"id": 2, "name": "Bob"}]
    config = TransformConfig()
    result = transformer.transform(data, config)

    csv = transformer.to_csv(result)
    assert "id,name" in csv
    assert "Alice" in csv


def test_to_json():
    """Test JSON formatting."""
    transformer = DataTransformer()
    data = [{"id": 1, "name": "Alice"}]
    config = TransformConfig()
    result = transformer.transform(data, config)

    json_str = transformer.to_json(result)
    assert '"id": 1' in json_str or '"id":1' in json_str
    assert "Alice" in json_str


def test_rename_fields():
    """Test field renaming."""
    transformer = DataTransformer()
    data = [{"old_name": "Alice", "id": 1}]
    config = TransformConfig(rename={"old_name": "full_name"})
    result = transformer.transform(data, config)

    assert "full_name" in result.rows[0]
    assert result.rows[0]["full_name"] == "Alice"


def test_empty_data():
    """Test transformation with empty data."""
    transformer = DataTransformer()
    data = []
    config = TransformConfig()
    result = transformer.transform(data, config)

    assert result.total_input == 0
    assert result.total_output == 0
    assert len(result.rows) == 0
