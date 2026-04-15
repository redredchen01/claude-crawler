#!/bin/bash

# ============================================
# Workspace Vault Exporter (Cloud Sync)
# Exports Obsidian docs to GitHub Pages/Static Site
# ============================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
VAULT_DOC_DIR="$SCRIPT_DIR/../../obsidian/projects/workspace-docs"
EXPORT_DIR="$SCRIPT_DIR/../../dist/vault-site"

echo "🌐 正在準備雲端指揮中心導出 (Cloud Export)..."

# Ensure export directory exists
mkdir -p "$EXPORT_DIR"

# 1. Prepare Content (Copy all docs into a flat structure for static site)
cp -r "$VAULT_DOC_DIR/"* "$EXPORT_DIR/"

# 2. Transform DASHBOARD.md to index.md (The entry point)
if [ -f "$EXPORT_DIR/DASHBOARD.md" ]; then
  mv "$EXPORT_DIR/DASHBOARD.md" "$EXPORT_DIR/index.md"
  # Fix internal links from [[file.md]] to [file.md](file.md) for web
  sed -i '' 's/\[\[\(.*\)\]\]/[\1](\1)/g' "$EXPORT_DIR/index.md"
fi

# 3. Status Reporting
echo "✅ 靜態站點已就緒於: $EXPORT_DIR"

# 4. Git Push (Placeholder for actual GitHub Pages logic)
# Note: In production, we would use: git -C $EXPORT_DIR push origin gh-pages
# For now, we'll log it as ready.
echo "[$(date +'%H:%M:%S')] 🚀 雲端快照已生成。可隨時通過 GitHub Action 部署。" >> "$SCRIPT_DIR/../../workspace-watcher.log"

# Optional: Notify via Telegram
# "$SCRIPT_DIR/tg-notifier.sh" "🌐 <b>雲端指揮中心已更新！</b>\n🔗 快照已生成，可通過瀏覽器查看。"
