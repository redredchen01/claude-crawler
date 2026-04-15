#!/bin/bash

set -euo pipefail

# 配置
PERF_LOG="$HOME/.cache/skx_sfx_perf.csv"
SKILL_NAME="${1:-default-skill}"
TEMP_DIR=$(mktemp -d)
trap "rm -rf $TEMP_DIR" EXIT

# 初始化日誌頭
if [ ! -f "$PERF_LOG" ]; then
  mkdir -p "$(dirname "$PERF_LOG")"
  echo "timestamp,skx_ms,sfx_ms,total_ms,cache_hits" > "$PERF_LOG"
fi

# 時間計測函數
measure_time() {
  local start=$(date +%s%N)
  "$@"
  local end=$(date +%s%N)
  echo $(( (end - start) / 1000000 ))
}

# 執行 skx（skill export）並計測
echo "⏱️  Running /skx..."
skx_ms=$(measure_time /skx 2>&1 | tee "$TEMP_DIR/skx_output.log" > /dev/null; cat "$TEMP_DIR/skx_output.log" | grep -oP '(?<=took )\d+' || echo 0)

# 執行 sfx 並計測
echo "⏱️  Running /sfx --pick $SKILL_NAME..."
sfx_ms=$(measure_time /sfx --pick "$SKILL_NAME" 2>&1 | tee "$TEMP_DIR/sfx_output.log" > /dev/null; cat "$TEMP_DIR/sfx_output.log" | grep -oP '(?<=took )\d+' || echo 0)

# 計算總時間
total_ms=$((skx_ms + sfx_ms))

# 檢測快取命中數
cache_hits=$(grep -c "cache hit" "$TEMP_DIR"/* 2>/dev/null || echo "0")

# 時間戳
timestamp=$(date +%Y-%m-%d_%H:%M:%S)

# 記錄結果
echo "$timestamp,$skx_ms,$sfx_ms,$total_ms,$cache_hits" >> "$PERF_LOG"

# 顯示結果
echo ""
echo "════════════════════════════════════════"
echo "📊 Performance Report"
echo "════════════════════════════════════════"
echo "Timestamp:      $timestamp"
echo "Skill:          $SKILL_NAME"
echo "SKX Time:       ${skx_ms}ms"
echo "SFX Time:       ${sfx_ms}ms"
echo "Total Time:     ${total_ms}ms"
echo "Cache Hits:     $cache_hits"
echo "Log Location:   $PERF_LOG"
echo "════════════════════════════════════════"
echo ""

# 顯示最近10條記錄統計
echo "📈 Recent Executions (Last 10):"
tail -10 "$PERF_LOG" | awk -F, '
  NR==1 { next }
  {
    total+=$4; count++
  }
  END {
    if (count > 0) printf "  Average Total Time: %.0fms (n=%d)\n", total/count, count
  }
'
