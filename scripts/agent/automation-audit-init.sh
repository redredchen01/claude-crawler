#!/bin/bash
# automation-audit-init.sh — Hook Audit Log 初始化
# 初始化 ~/.claude/hook-audit.log，处理日志轮转

set -e

AUDIT_LOG="${HOME}/.claude/hook-audit.log"
MAX_SIZE=$((10 * 1024 * 1024))  # 10MB
KEEP_VERSIONS=5

# 创建日志文件（如果不存在）
if [ ! -f "$AUDIT_LOG" ]; then
  touch "$AUDIT_LOG"
  chmod 600 "$AUDIT_LOG"
  echo "✓ Initialized $AUDIT_LOG"
  exit 0
fi

# 检查文件大小，如果超过限制则轮转
SIZE=$(stat -f%z "$AUDIT_LOG" 2>/dev/null || stat -c%s "$AUDIT_LOG" 2>/dev/null || echo "0")

if [ "$SIZE" -gt "$MAX_SIZE" ]; then
  TIMESTAMP=$(date +%Y%m%d-%H%M%S)
  ARCHIVE="${AUDIT_LOG}.${TIMESTAMP}"

  # 备份当前日志
  cp "$AUDIT_LOG" "$ARCHIVE"

  # 清空日志文件
  > "$AUDIT_LOG"

  # 删除旧备份（保留最后 N 个版本）
  ls -t "${AUDIT_LOG}."* 2>/dev/null | tail -n +$((KEEP_VERSIONS + 1)) | xargs rm -f

  echo "✓ Rotated audit log to $ARCHIVE"
fi

# 验证权限
chmod 600 "$AUDIT_LOG"
echo "✓ Audit log is ready: $AUDIT_LOG ($(stat -f%z "$AUDIT_LOG" 2>/dev/null || stat -c%s "$AUDIT_LOG") bytes)"
