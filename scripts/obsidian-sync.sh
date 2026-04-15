#!/bin/bash
# Obsidian → Claude Memory 真正同步
set -e

WORKSPACE="/Users/dex/YD 2026"
VAULT="$WORKSPACE/obsidian"
MEMORY="/Users/dex/.claude/projects/-Users-dex-YD-2026/memory"
export PATH="/Users/dex/.local/bin:/usr/local/bin:/usr/bin:/bin:$PATH"

mkdir -p "$MEMORY"

synced=0
skipped=0

extract_notes() {
    cd "$VAULT" && clausidian list --type "$1" 2>/dev/null \
        | grep '\[\[' | sed -E 's/.*\[\[([^]|]+).*/\1/' || true
}

echo "🔄 Obsidian → Memory 同步開始"

for type in project area resource idea; do
    echo "📁 ${type}s..."
    prefix="${type}_"
    for note in $(extract_notes "$type"); do
        mem_file="$MEMORY/${prefix}${note}.md"
        content=$(cd "$VAULT" && clausidian read "$note" 2>/dev/null) || { ((skipped++)); continue; }
        [ -z "$content" ] && { ((skipped++)); continue; }
        {
            echo "---
source: obsidian/${note}.md
synced: $(date -u +%Y-%m-%dT%H:%M:%SZ)
---
"
            echo "$content"
        } > "$mem_file"
        ((synced++))
    done
done

echo "📊 生成 vault 摘要..."
cd "$VAULT" && {
    echo "---
source: vault-stats
synced: $(date -u +%Y-%m-%dT%H:%M:%SZ)
---

$(clausidian stats 2>/dev/null)

## 最近更新 (7 天)

$(clausidian recent 7 2>/dev/null)
" > "$MEMORY/_vault_summary.md"
}

echo "🧹 清理 orphan memory..."
cleaned=0
for mem_file in "$MEMORY"/project_*.md "$MEMORY"/area_*.md "$MEMORY"/resource_*.md "$MEMORY"/idea_*.md; do
    [ -f "$mem_file" ] || continue
    note_name=$(basename "$mem_file" | sed -E 's/^(project_|area_|resource_|idea_)//' | sed 's/\.md$//')
    (cd "$VAULT" && clausidian read "$note_name" >/dev/null 2>&1) || { rm "$mem_file"; ((cleaned++)); }
done

echo ""
echo "✅ 同步完成: $synced 同步 / $skipped 跳過 / $cleaned 清理"
