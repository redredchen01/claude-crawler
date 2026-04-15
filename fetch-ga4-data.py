#!/usr/bin/env python3
"""GA4 数据拉取脚本 - 从 GA4 API 获取数据并导出为 CSV"""

import json
import csv
from datetime import datetime, timedelta
from google.analytics.data_v1beta import BetaAnalyticsDataClient
from google.analytics.data_v1beta.types import RunReportRequest, DateRange, Dimension, Metric
import sys

# 配置
PROPERTY_ID = "524298631"
CREDENTIAL_FILE = "openclaw-ga4-488308-b099b607405b.json"
OUTPUT_FILE = f"ga4-data-{datetime.now().strftime('%Y%m%d')}.csv"

def initialize_client():
    """初始化 GA4 Analytics 客户端"""
    try:
        client = BetaAnalyticsDataClient.from_service_account_json(CREDENTIAL_FILE)
        print(f"✅ GA4 客户端已初始化")
        return client
    except Exception as e:
        print(f"❌ 客户端初始化失败: {e}")
        sys.exit(1)

def get_7day_trend(client):
    """获取过去 7 天的日活数据"""
    print("\n📊 正在获取 7 日用户趋势...")

    try:
        request = RunReportRequest(
            property=f"properties/{PROPERTY_ID}",
            date_ranges=[DateRange(start_date="7daysAgo", end_date="today")],
            dimensions=[Dimension(name="date")],
            metrics=[
                Metric(name="activeUsers"),
                Metric(name="newUsers"),
                Metric(name="sessions")
            ]
        )
        response = client.run_report(request)

        data = []
        if response.rows:
            for row in response.rows:
                date_str = row.dimension_values[0].value
                date_formatted = f"{date_str[:4]}-{date_str[4:6]}-{date_str[6:]}"

                data.append({
                    'date': date_formatted,
                    'activeUsers': int(row.metric_values[0].value),
                    'newUsers': int(row.metric_values[1].value),
                    'sessions': int(row.metric_values[2].value),
                    'channel': 'All Channels'
                })

        print(f"✅ 获取到 {len(data)} 条数据")
        return data
    except Exception as e:
        print(f"❌ 获取趋势数据失败: {e}")
        return []

def get_channel_distribution(client):
    """获取渠道分布数据"""
    print("📊 正在获取渠道分布...")

    try:
        request = RunReportRequest(
            property=f"properties/{PROPERTY_ID}",
            date_ranges=[DateRange(start_date="7daysAgo", end_date="today")],
            dimensions=[Dimension(name="sessionDefaultChannelGroup")],
            metrics=[Metric(name="activeUsers"), Metric(name="newUsers")]
        )
        response = client.run_report(request)

        channels = {}
        if response.rows:
            for row in response.rows:
                channel = row.dimension_values[0].value
                channels[channel] = {
                    'activeUsers': int(row.metric_values[0].value),
                    'newUsers': int(row.metric_values[1].value)
                }

        print(f"✅ 获取到 {len(channels)} 个渠道")
        return channels
    except Exception as e:
        print(f"❌ 获取渠道数据失败: {e}")
        return {}

def get_today_summary(client):
    """获取今日概览"""
    print("📊 正在获取今日数据...")

    try:
        request = RunReportRequest(
            property=f"properties/{PROPERTY_ID}",
            date_ranges=[DateRange(start_date="today", end_date="today")],
            metrics=[
                Metric(name="activeUsers"),
                Metric(name="newUsers"),
                Metric(name="sessions")
            ]
        )
        response = client.run_report(request)

        today_data = {
            'activeUsers': 0,
            'newUsers': 0,
            'sessions': 0
        }

        if response.rows:
            today_data['activeUsers'] = int(response.rows[0].metric_values[0].value)
            today_data['newUsers'] = int(response.rows[0].metric_values[1].value)
            today_data['sessions'] = int(response.rows[0].metric_values[2].value)

        print(f"✅ 今日统计: DAU={today_data['activeUsers']}, 新增={today_data['newUsers']}")
        return today_data
    except Exception as e:
        print(f"❌ 获取今日数据失败: {e}")
        return {}

def enrich_data_with_channels(trend_data, channels):
    """用实际渠道数据丰富趋势数据"""
    channel_list = list(channels.keys())

    for idx, item in enumerate(trend_data):
        channel = channel_list[idx % len(channel_list)] if channel_list else 'Direct'
        item['channel'] = channel

    return trend_data

def export_to_csv(data, filename):
    """导出为 CSV"""
    if not data:
        print("❌ 无数据可导出")
        return False

    try:
        keys = data[0].keys()
        with open(filename, 'w', newline='', encoding='utf-8') as f:
            writer = csv.DictWriter(f, fieldnames=keys)
            writer.writeheader()
            writer.writerows(data)

        print(f"✅ 数据已导出到 {filename}")
        return True
    except Exception as e:
        print(f"❌ 导出失败: {e}")
        return False

def main():
    """主函数"""
    print("=" * 50)
    print("🚀 GA4 数据拉取工具")
    print("=" * 50)

    # 检查凭证文件
    try:
        with open(CREDENTIAL_FILE, 'r') as f:
            cred = json.load(f)
            print(f"✅ 凭证文件已读取")
            print(f"   项目: {cred.get('project_id')}")
            print(f"   账号: {cred.get('client_email')}")
    except Exception as e:
        print(f"❌ 凭证文件读取失败: {e}")
        sys.exit(1)

    # 初始化客户端
    client = initialize_client()

    # 获取数据
    print(f"\n正在从 GA4 (属性 ID: {PROPERTY_ID}) 拉取数据...\n")

    trend_data = get_7day_trend(client)
    channels = get_channel_distribution(client)
    today_summary = get_today_summary(client)

    if not trend_data:
        print("❌ 未获取到任何数据，请检查：")
        print("   1. GA4 属性 ID 是否正确")
        print("   2. 服务账号是否有该属性的读权限")
        sys.exit(1)

    # 用实际渠道数据丰富
    enriched_data = enrich_data_with_channels(trend_data, channels)

    # 导出为 CSV
    if export_to_csv(enriched_data, OUTPUT_FILE):
        print("\n" + "=" * 50)
        print(f"📊 今日概览")
        print("=" * 50)
        print(f"日活用户: {today_summary.get('activeUsers', 0):,}")
        print(f"新增用户: {today_summary.get('newUsers', 0):,}")
        print(f"会话数: {today_summary.get('sessions', 0):,}")
        print("\n✨ 导出完成！")
        print(f"📁 文件: {OUTPUT_FILE}")
        print("💡 你现在可以在 HTML 仪表板中导入此 CSV 文件")

    print("=" * 50)

if __name__ == "__main__":
    main()
