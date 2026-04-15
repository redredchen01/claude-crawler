#!/bin/bash

# ============================================
# Project & Skill Foundry for YD 2026
# Instantly spawns new projects or skills with full governance
# ============================================

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECTS_ROOT="$SCRIPT_DIR/../../projects/production"
SKILLS_ROOT="$SCRIPT_DIR"
DASHBOARD="$SCRIPT_DIR/../../obsidian/projects/workspace-docs/DASHBOARD.md"

TYPE="$1"
NAME="$2"
DESC="$3"

if [ "$TYPE" == "skill" ]; then
  if [ -z "$NAME" ] || [ -z "$DESC" ]; then
    echo "Usage: project-foundry.sh skill <skill-name> \"<description>\""
    exit 1
  fi
  
  TARGET_FILE="$SKILLS_ROOT/${NAME}.sh"
  echo "🏗️ 正在孵化新技能: $NAME..."
  
  cat <<EOF > "$TARGET_FILE"
#!/bin/bash
# scripts/agent/${NAME}.sh — $DESC
# @docs [${NAME}.md]

set -euo pipefail

WORKSPACE_ROOT="\${YD_WORKSPACE:-/Users/dex/YD 2026}"
source "\$WORKSPACE_ROOT/scripts/lib/core.sh"
source "\$WORKSPACE_ROOT/scripts/lib/cache.sh"

log_info "🚀 Running Skill: $NAME..."

# --- Skill Logic Starts Here ---

# --- Skill Logic Ends Here ---

log_info "✅ $NAME complete."
EOF
  chmod +x "$TARGET_FILE"
  
  # Register in tasks
  "$SCRIPT_DIR/agent-tasks.sh" add "skill-${NAME}-impl" "實裝 $NAME 技能的核心邏輯"
  
  echo "✅ 技能 $NAME 孵化完成！"
  echo "📍 位置: $TARGET_FILE"
  exit 0
fi

# Default project logic (if TYPE is not skill, assume TYPE is NAME for backward compat)
if [ "$TYPE" != "skill" ] && [ -z "$DESC" ]; then
  NAME="$TYPE"
  DESC="$2"
else
  NAME="$2"
  DESC="$3"
fi

if [ -z "$NAME" ] || [ -z "$DESC" ]; then
  echo "Usage: project-foundry.sh <project-name> \"<description>\""
  echo "   or: project-foundry.sh skill <skill-name> \"<description>\""
  exit 1
fi

TARGET_DIR="$PROJECTS_ROOT/$NAME"

echo "🏗️ 正在孵化新專案: $NAME..."

# 1. 建立物理結構
mkdir -p "$TARGET_DIR"/{src,tests,docs,bin}

# 2. 注入 CLAUDE.md (繼承規範)
cat <<EOF > "$TARGET_DIR/CLAUDE.md"
# Project: $NAME
$DESC

## 繼承規範
- **語言**: 繁體中文
- **全域治理**: 遵循根目錄 \`CLAUDE.md\` 與 \`scripts/agent/\` 工具鏈。
- **任務管理**: 使用 \`agent-tasks\` 進行追蹤。
EOF

# 3. 注入 README.md
echo "# $NAME" > "$TARGET_DIR/README.md"
echo "$DESC" >> "$TARGET_DIR/README.md"

# 4. 註冊初始化任務
"$SCRIPT_DIR/agent-tasks.sh" add "${NAME}-setup" "完成 $NAME 專案的初步環境配置"

# 5. 更新 DASHBOARD
sed -i '' "s/## 📂 快速分類入庫/## 📂 快速分類入庫\\n- **$NAME**: $DESC/" "$DASHBOARD"

echo "✅ 專案 $NAME 孵化完成！"
echo "📍 位置: $TARGET_DIR"
chmod +x "$0"
