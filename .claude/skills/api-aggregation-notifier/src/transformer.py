"""Data transformation pipeline: filter, sort, deduplicate, format."""

import csv
import io
import json
import logging
import re
from dataclasses import dataclass, field
from datetime import datetime
from typing import Any, Dict, List

from .config import FilterConfig, TransformConfig

logger = logging.getLogger(__name__)


@dataclass
class TransformResult:
    """Result of data transformation."""

    rows: List[Dict[str, Any]] = field(default_factory=list)
    headers: List[str] = field(default_factory=list)
    total_input: int = 0
    total_output: int = 0
    format: str = "table"


class DataTransformer:
    """Transform and format data from fetched sources."""

    def transform(
        self, data: List[Dict[str, Any]], config: TransformConfig
    ) -> TransformResult:
        """Apply transformation pipeline.

        Pipeline order:
        1. Apply filters
        2. Deduplicate
        3. Sort
        4. Limit
        5. Extract columns (for output)
        6. Rename fields

        Args:
            data: Input data list
            config: Transformation configuration

        Returns:
            TransformResult with processed data
        """
        total_input = len(data)
        rows = data.copy()

        # 1. Apply filters
        if config.filters:
            rows = self._apply_filters(rows, config.filters)

        # 2. Deduplicate
        if config.deduplicate_by:
            rows = self._deduplicate(rows, config.deduplicate_by)

        # 3. Sort
        if config.sort_by:
            rows = self._sort(rows, config.sort_by, config.sort_order)

        # 4. Limit
        if config.limit > 0:
            rows = self._limit(rows, config.limit)

        # 5. Extract columns (for output)
        if config.columns:
            rows = self._extract_columns(rows, config.columns)

        # 6. Rename fields
        if config.rename:
            rows = self._rename(rows, config.rename)

        # Determine headers from first row
        headers = list(rows[0].keys()) if rows else []

        return TransformResult(
            rows=rows,
            headers=headers,
            total_input=total_input,
            total_output=len(rows),
            format=config.type,
        )

    def _extract_columns(
        self, rows: List[Dict[str, Any]], columns: List[str]
    ) -> List[Dict[str, Any]]:
        """Keep only specified columns (supports dot notation for nested).

        Args:
            rows: Input rows
            columns: Column names to keep

        Returns:
            Rows with only specified columns
        """
        result = []

        for row in rows:
            new_row = {}
            for col in columns:
                value = self._get_nested(row, col)
                new_row[col] = value

            result.append(new_row)

        return result

    def _apply_filters(
        self, rows: List[Dict[str, Any]], filters: List[FilterConfig]
    ) -> List[Dict[str, Any]]:
        """Apply filters to rows.

        Supported operations: eq, ne, gt, lt, contains, startswith, regex

        Args:
            rows: Input rows
            filters: Filter configurations

        Returns:
            Filtered rows (all filters must match)
        """
        result = []

        for row in rows:
            matches_all = True

            for f in filters:
                value = self._get_nested(row, f.field)

                if f.op == "eq":
                    if value != f.value:
                        matches_all = False
                        break
                elif f.op == "ne":
                    if value == f.value:
                        matches_all = False
                        break
                elif f.op == "gt":
                    try:
                        if not (self._to_comparable(value) > self._to_comparable(f.value)):
                            matches_all = False
                            break
                    except Exception:
                        matches_all = False
                        break
                elif f.op == "lt":
                    try:
                        if not (self._to_comparable(value) < self._to_comparable(f.value)):
                            matches_all = False
                            break
                    except Exception:
                        matches_all = False
                        break
                elif f.op == "contains":
                    if not str(value).lower().__contains__(str(f.value).lower()):
                        matches_all = False
                        break
                elif f.op == "startswith":
                    if not str(value).lower().startswith(str(f.value).lower()):
                        matches_all = False
                        break
                elif f.op == "regex":
                    try:
                        if not re.search(f.value, str(value)):
                            matches_all = False
                            break
                    except Exception:
                        matches_all = False
                        break

            if matches_all:
                result.append(row)

        return result

    def _deduplicate(
        self, rows: List[Dict[str, Any]], field: str
    ) -> List[Dict[str, Any]]:
        """Remove duplicates based on field value.

        Args:
            rows: Input rows
            field: Field to deduplicate by

        Returns:
            Deduplicated rows (first occurrence kept)
        """
        seen = set()
        result = []

        for row in rows:
            value = self._get_nested(row, field)
            value_key = str(value) if value is not None else "None"

            if value_key not in seen:
                seen.add(value_key)
                result.append(row)

        return result

    def _sort(
        self, rows: List[Dict[str, Any]], field: str, order: str = "desc"
    ) -> List[Dict[str, Any]]:
        """Sort rows by field.

        Handles dates, numbers, and strings. Date format: YYYY-MM-DD or ISO 8601.

        Args:
            rows: Input rows
            field: Field to sort by
            order: "asc" or "desc"

        Returns:
            Sorted rows
        """

        def sort_key(row: Dict[str, Any]) -> Any:
            value = self._get_nested(row, field)

            if value is None:
                return (1, 0)  # None values go to end

            # Try to parse as date
            if isinstance(value, str):
                try:
                    # ISO 8601 or YYYY-MM-DD
                    if "T" in value:
                        dt = datetime.fromisoformat(value.replace("Z", "+00:00"))
                    else:
                        dt = datetime.strptime(value, "%Y-%m-%d")
                    return (0, dt)
                except Exception:
                    pass

                # Try to parse as number
                try:
                    num = float(value)
                    return (0, num)
                except Exception:
                    pass

                # String comparison
                return (0, value.lower() if isinstance(value, str) else value)

            # Direct comparison for numbers
            if isinstance(value, (int, float)):
                return (0, value)

            return (0, value)

        reverse = order == "desc"
        return sorted(rows, key=sort_key, reverse=reverse)

    def _limit(self, rows: List[Dict[str, Any]], limit: int) -> List[Dict[str, Any]]:
        """Limit rows to count.

        Args:
            rows: Input rows
            limit: Maximum rows to keep

        Returns:
            Limited rows
        """
        return rows[:limit]

    def _rename(
        self, rows: List[Dict[str, Any]], rename_map: Dict[str, str]
    ) -> List[Dict[str, Any]]:
        """Rename fields in rows.

        Args:
            rows: Input rows
            rename_map: Mapping of old name -> new name

        Returns:
            Rows with renamed fields
        """
        result = []

        for row in rows:
            new_row = {}
            for old_key, value in row.items():
                new_key = rename_map.get(old_key, old_key)
                new_row[new_key] = value

            result.append(new_row)

        return result

    def to_markdown(self, result: TransformResult) -> str:
        """Format result as Markdown table.

        Args:
            result: Transformation result

        Returns:
            Markdown table string
        """
        if not result.rows or not result.headers:
            return "No data"

        # Build table
        lines = []
        lines.append("| " + " | ".join(result.headers) + " |")
        lines.append("|" + "|".join(["---"] * len(result.headers)) + "|")

        for row in result.rows:
            values = [str(row.get(h, "")).replace("|", "\\|") for h in result.headers]
            lines.append("| " + " | ".join(values) + " |")

        return "\n".join(lines)

    def to_csv(self, result: TransformResult) -> str:
        """Format result as CSV.

        Args:
            result: Transformation result

        Returns:
            CSV string
        """
        if not result.rows and not result.headers:
            return ""

        output = io.StringIO()
        writer = csv.DictWriter(output, fieldnames=result.headers)
        writer.writeheader()
        writer.writerows(result.rows)

        return output.getvalue()

    def to_json(self, result: TransformResult) -> str:
        """Format result as JSON.

        Args:
            result: Transformation result

        Returns:
            JSON string
        """
        return json.dumps(result.rows, indent=2, default=str)

    def _get_nested(self, obj: Any, path: str) -> Any:
        """Get nested value using dot notation.

        Args:
            obj: Object to traverse
            path: Dot notation path (e.g., "user.address.city")

        Returns:
            Value at path or None
        """
        if not isinstance(obj, dict):
            return None

        parts = path.split(".")
        current = obj

        for part in parts:
            if isinstance(current, dict):
                current = current.get(part)
            elif isinstance(current, list):
                try:
                    index = int(part)
                    current = current[index]
                except (ValueError, IndexError):
                    return None
            else:
                return None

            if current is None:
                return None

        return current

    def _to_comparable(self, value: Any) -> Any:
        """Convert value to comparable type for gt/lt operations.

        Args:
            value: Value to convert

        Returns:
            Comparable value (number or string)
        """
        if isinstance(value, (int, float)):
            return value

        if isinstance(value, str):
            try:
                return float(value)
            except Exception:
                return value

        return value
