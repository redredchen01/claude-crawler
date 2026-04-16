#!/usr/bin/env python3
"""Minimal GA4 Data API example."""

import argparse
import csv
import os
import sys
import warnings
from collections import defaultdict
from typing import Any

warnings.filterwarnings(
    "ignore",
    message=r".*RequestsDependencyWarning: urllib3.*doesn't match a supported version!",
)

from google.analytics.data_v1beta import BetaAnalyticsDataClient
from google.analytics.data_v1beta.types import DateRange, Dimension, Metric, RunReportRequest


DEFAULT_PROPERTY_ID = "524298631"
DEFAULT_CREDENTIALS = "openclaw-ga4-488308-b099b607405b.json"
DEFAULT_DIMENSIONS = ["date"]
DEFAULT_METRICS = ["activeUsers", "newUsers", "sessions"]
PRESETS = {
    "daily-channel-report": {
        "dimensions": ["date", "sessionDefaultChannelGroup"],
        "metrics": ["activeUsers", "newUsers", "sessions"],
        "sort_by": "date",
        "desc": False,
    }
}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Fetch a minimal GA4 report and print it as a table."
    )
    parser.add_argument(
        "--property-id",
        default=os.getenv("GA4_PROPERTY_ID", DEFAULT_PROPERTY_ID),
        help="GA4 property ID. Default: env GA4_PROPERTY_ID or built-in demo value.",
    )
    parser.add_argument(
        "--credentials",
        default=os.getenv("GA4_CREDENTIALS", DEFAULT_CREDENTIALS),
        help="Service account JSON path. Default: env GA4_CREDENTIALS or local JSON file.",
    )
    parser.add_argument(
        "--start-date",
        default="7daysAgo",
        help="GA4 start date, for example 7daysAgo or 2026-04-01.",
    )
    parser.add_argument(
        "--end-date",
        default="today",
        help="GA4 end date, for example today or 2026-04-02.",
    )
    parser.add_argument(
        "--csv",
        help="Optional CSV output path.",
    )
    parser.add_argument(
        "--dimension",
        action="append",
        dest="dimensions",
        help="GA4 dimension to include. Repeatable. Default: date.",
    )
    parser.add_argument(
        "--metric",
        action="append",
        dest="metrics",
        help="GA4 metric to include. Repeatable. Default: activeUsers, newUsers, sessions.",
    )
    parser.add_argument(
        "--preset",
        choices=sorted(PRESETS.keys()),
        help="Apply a named query preset.",
    )
    parser.add_argument(
        "--sort-by",
        help="Sort output by a selected dimension or metric name.",
    )
    parser.add_argument(
        "--desc",
        action="store_true",
        help="Sort descending. Only applies with --sort-by.",
    )
    parser.add_argument(
        "--limit",
        type=int,
        help="Limit output rows after sorting and filtering.",
    )
    parser.add_argument(
        "--where",
        action="append",
        default=[],
        help="Filter rows locally using key=value. Repeatable.",
    )
    parser.add_argument(
        "--markdown",
        help="Optional Markdown output path for a human-readable summary.",
    )
    return parser.parse_args()


def build_client(credentials_path: str) -> BetaAnalyticsDataClient:
    if not os.path.exists(credentials_path):
        raise FileNotFoundError(
            f"Credentials file not found: {credentials_path}"
        )
    return BetaAnalyticsDataClient.from_service_account_json(credentials_path)


def run_report(
    client: BetaAnalyticsDataClient,
    property_id: str,
    start_date: str,
    end_date: str,
    dimensions: list[str],
    metrics: list[str],
):
    request = RunReportRequest(
        property=f"properties/{property_id}",
        date_ranges=[DateRange(start_date=start_date, end_date=end_date)],
        dimensions=[Dimension(name=name) for name in dimensions],
        metrics=[Metric(name=name) for name in metrics],
    )
    return client.run_report(request)


def format_date(value: str) -> str:
    if len(value) == 8 and value.isdigit():
        return f"{value[:4]}-{value[4:6]}-{value[6:]}"
    return value


def response_to_records(
    response,
    dimensions: list[str],
    metrics: list[str],
) -> list[dict[str, Any]]:
    records = []
    for row in response.rows:
        record = {}
        for index, dimension_name in enumerate(dimensions):
            raw_value = row.dimension_values[index].value
            if dimension_name == "date":
                record[dimension_name] = format_date(raw_value)
            else:
                record[dimension_name] = raw_value

        for index, metric_name in enumerate(metrics):
            metric_value = row.metric_values[index].value
            try:
                record[metric_name] = int(metric_value)
            except ValueError:
                try:
                    record[metric_name] = float(metric_value)
                except ValueError:
                    record[metric_name] = metric_value

        records.append(record)

    return sorted(
        records,
        key=lambda item: tuple(str(item.get(column, "")) for column in dimensions),
    )


def parse_filter(expression: str) -> tuple[str, str]:
    if "=" not in expression:
        raise ValueError(f"Invalid filter {expression!r}. Expected key=value.")
    key, value = expression.split("=", 1)
    key = key.strip()
    value = value.strip()
    if not key:
        raise ValueError(f"Invalid filter {expression!r}. Key cannot be empty.")
    return key, value


def normalize_for_compare(value: Any) -> str:
    return str(value).strip().lower()


def apply_filters(records: list[dict[str, Any]], filters: list[str]) -> list[dict[str, Any]]:
    filtered_records = records
    for expression in filters:
        key, expected = parse_filter(expression)
        filtered_records = [
            record
            for record in filtered_records
            if normalize_for_compare(record.get(key, "")) == normalize_for_compare(expected)
        ]
    return filtered_records


def apply_sort(
    records: list[dict[str, Any]],
    sort_by: str | None,
    descending: bool,
) -> list[dict[str, Any]]:
    if not sort_by:
        return records

    def sort_key(record: dict[str, Any]) -> tuple[int, Any]:
        value = record.get(sort_by)
        if isinstance(value, (int, float)):
            return (0, value)
        return (1, str(value))

    return sorted(records, key=sort_key, reverse=descending)


def apply_limit(records: list[dict[str, Any]], limit: int | None) -> list[dict[str, Any]]:
    if limit is None:
        return records
    if limit < 0:
        raise ValueError("--limit must be >= 0.")
    return records[:limit]


def to_column_name(name: str) -> str:
    output = []
    for index, char in enumerate(name):
        if char.isupper() and index > 0 and name[index - 1].islower():
            output.append("_")
        output.append(char.lower())
    return "".join(output)


def print_report(records: list[dict[str, Any]], columns: list[str]) -> None:
    headers = [to_column_name(column) for column in columns]
    widths = []
    for index, column in enumerate(columns):
        max_value_width = max(len(str(record.get(column, ""))) for record in records)
        widths.append(max(len(headers[index]), max_value_width))

    print("  ".join(f"{headers[index]:<{widths[index]}}" for index in range(len(columns))))
    print("  ".join("-" * widths[index] for index in range(len(columns))))
    for record in records:
        cells = []
        for index, column in enumerate(columns):
            value = record.get(column, "")
            align = ">" if isinstance(value, (int, float)) else "<"
            cells.append(f"{str(value):{align}{widths[index]}}")
        print("  ".join(cells))


def print_summary(records: list[dict[str, Any]], metrics: list[str]) -> None:
    print()
    print("summary")
    print("-------")
    print(f"rows: {len(records)}")
    for metric_name in metrics:
        values = [record[metric_name] for record in records if isinstance(record[metric_name], (int, float))]
        if not values:
            continue
        print(f"total_{to_column_name(metric_name)}: {round(sum(values), 2)}")
        print(f"avg_{to_column_name(metric_name)}_per_row: {round(sum(values) / len(values), 2)}")


def write_csv(records: list[dict[str, Any]], columns: list[str], output_path: str) -> None:
    with open(output_path, "w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(
            handle,
            fieldnames=columns,
        )
        writer.writeheader()
        writer.writerows(records)


def format_number(value: Any) -> str:
    if isinstance(value, int):
        return f"{value:,}"
    if isinstance(value, float):
        return f"{value:,.2f}"
    return str(value)


def build_daily_channel_markdown(
    records: list[dict[str, Any]],
    property_id: str,
    start_date: str,
    end_date: str,
) -> str:
    latest_date = max(record["date"] for record in records)
    latest_rows = [record for record in records if record["date"] == latest_date]
    top_channels = sorted(
        latest_rows,
        key=lambda row: row["sessions"],
        reverse=True,
    )[:5]

    totals_by_date: dict[str, dict[str, int]] = defaultdict(
        lambda: {"activeUsers": 0, "newUsers": 0, "sessions": 0}
    )
    for record in records:
        date_key = record["date"]
        totals_by_date[date_key]["activeUsers"] += int(record.get("activeUsers", 0))
        totals_by_date[date_key]["newUsers"] += int(record.get("newUsers", 0))
        totals_by_date[date_key]["sessions"] += int(record.get("sessions", 0))

    date_totals_lines = []
    for date_key in sorted(totals_by_date):
        totals = totals_by_date[date_key]
        date_totals_lines.append(
            f"- {date_key}: activeUsers={totals['activeUsers']}, "
            f"newUsers={totals['newUsers']}, sessions={totals['sessions']}"
        )

    top_channel_lines = []
    for row in top_channels:
        top_channel_lines.append(
            f"- {row['sessionDefaultChannelGroup']}: "
            f"activeUsers={row['activeUsers']}, "
            f"newUsers={row['newUsers']}, "
            f"sessions={row['sessions']}"
        )

    return "\n".join(
        [
            f"# GA4 Daily Channel Report",
            "",
            f"- Property ID: `{property_id}`",
            f"- Date range: `{start_date}` to `{end_date}`",
            f"- Latest date in result: `{latest_date}`",
            f"- Rows: `{len(records)}`",
            "",
            "## Daily Totals",
            *date_totals_lines,
            "",
            f"## Top Channels On {latest_date}",
            *top_channel_lines,
        ]
    )


def build_markdown_report(
    records: list[dict[str, Any]],
    args: argparse.Namespace,
    preset_name: str | None,
) -> str:
    if preset_name == "daily-channel-report":
        return build_daily_channel_markdown(
            records=records,
            property_id=args.property_id,
            start_date=args.start_date,
            end_date=args.end_date,
        )

    lines = [
        "# GA4 Report",
        "",
        f"- Property ID: `{args.property_id}`",
        f"- Date range: `{args.start_date}` to `{args.end_date}`",
        f"- Rows: `{len(records)}`",
    ]
    return "\n".join(lines)


def write_markdown(markdown: str, output_path: str) -> None:
    with open(output_path, "w", encoding="utf-8") as handle:
        handle.write(markdown)
        handle.write("\n")


def main() -> int:
    args = parse_args()
    preset = PRESETS.get(args.preset, {})
    dimensions = args.dimensions or preset.get("dimensions") or DEFAULT_DIMENSIONS
    metrics = args.metrics or preset.get("metrics") or DEFAULT_METRICS
    sort_by = args.sort_by or preset.get("sort_by")
    descending = args.desc or preset.get("desc", False)
    columns = [*dimensions, *metrics]
    known_columns = set(columns)

    if sort_by and sort_by not in known_columns:
        print(f"Unknown --sort-by column: {sort_by}", file=sys.stderr)
        return 1

    for expression in args.where:
        try:
            key, _ = parse_filter(expression)
        except ValueError as exc:
            print(str(exc), file=sys.stderr)
            return 1
        if key not in known_columns:
            print(f"Unknown filter column in --where: {key}", file=sys.stderr)
            return 1

    try:
        client = build_client(args.credentials)
        response = run_report(
            client=client,
            property_id=args.property_id,
            start_date=args.start_date,
            end_date=args.end_date,
            dimensions=dimensions,
            metrics=metrics,
        )
    except Exception as exc:
        print(f"GA4 request failed: {exc}", file=sys.stderr)
        return 1

    if not response.rows:
        print("No GA4 rows returned.")
        return 0

    try:
        records = response_to_records(response, dimensions=dimensions, metrics=metrics)
        filtered_records = apply_filters(records, args.where)
        records_for_output = apply_sort(filtered_records, sort_by, descending)
        records_for_output = apply_limit(records_for_output, args.limit)
    except ValueError as exc:
        print(str(exc), file=sys.stderr)
        return 1

    if not records_for_output:
        print("No rows matched the requested filters.")
        return 0

    print_report(records_for_output, columns=columns)
    print_summary(records_for_output, metrics=metrics)

    if args.csv:
        write_csv(records_for_output, columns=columns, output_path=args.csv)
        print()
        print(f"csv_written: {args.csv}")

    if args.markdown:
        markdown = build_markdown_report(filtered_records, args=args, preset_name=args.preset)
        write_markdown(markdown, args.markdown)
        print(f"markdown_written: {args.markdown}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
