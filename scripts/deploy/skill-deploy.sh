#!/usr/bin/env bash
# skill-deploy.sh — 開發 → 測試 → GitHub → 安裝 → 生效
# 用法: skill-deploy [skill-dir] [--skip-test] [--dry-run]
set -euo pipefail

# ── 顏色 ──
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
CYAN='\033[0;36m'; BOLD='\033[1m'; NC='\033[0m'

SKILLS_DIR="$HOME/.claude/skills"
COMMANDS_DIR="$HOME/.claude/commands"

usage() {
  cat <<'EOF'
skill-deploy — Skill 飛輪部署工具

用法:
  skill-deploy <skill-dir>              # 完整流程
  skill-deploy <skill-dir> --skip-test  # 跳過測試
  skill-deploy <skill-dir> --dry-run    # 只檢查不執行
  skill-deploy --list                   # 列出已安裝 skills
  skill-deploy --status                 # 顯示 dev → installed 對照

流程: 檢查 → 測試 → Git push → GitHub → 安裝到 ~/.claude/skills/ → 驗證
EOF
  exit 0
}

log()  { echo -e "${CYAN}[deploy]${NC} $*"; }
ok()   { echo -e "${GREEN}  ✓${NC} $*"; }
warn() { echo -e "${YELLOW}  ⚠${NC} $*"; }
fail() { echo -e "${RED}  ✗${NC} $*"; exit 1; }

# ── 參數解析 ──
SKILL_DIR=""
SKIP_TEST=false
DRY_RUN=false

for arg in "$@"; do
  case "$arg" in
    --skip-test) SKIP_TEST=true ;;
    --dry-run)   DRY_RUN=true ;;
    --list)      ls -1 "$SKILLS_DIR" 2>/dev/null | grep -v '^\.' | sort; exit 0 ;;
    --status)
      echo -e "${BOLD}Dev → Installed 對照表${NC}"
      echo "──────────────────────────────────"
      for dev in ~/YD\ 2026/projects/tools/*/; do
        name=$(basename "$dev")
        if [ -d "$SKILLS_DIR/$name" ] || [ -L "$SKILLS_DIR/$name" ]; then
          status="${GREEN}已安裝${NC}"
        else
          status="${YELLOW}未安裝${NC}"
        fi
        echo -e "  $name  →  $status"
      done
      exit 0
      ;;
    --help|-h) usage ;;
    *) SKILL_DIR="$arg" ;;
  esac
done

[ -z "$SKILL_DIR" ] && usage

# 支持相對路徑和絕對路徑
if [ ! -d "$SKILL_DIR" ]; then
  # 嘗試在 projects/tools/ 下找
  SKILL_DIR="$HOME/YD 2026/projects/tools/$SKILL_DIR"
fi
[ ! -d "$SKILL_DIR" ] && fail "目錄不存在: $SKILL_DIR"

cd "$SKILL_DIR"
SKILL_NAME=$(basename "$SKILL_DIR")

echo ""
echo -e "${BOLD}═══ Skill Deploy: $SKILL_NAME ═══${NC}"
echo ""

# ══════════════════════════════════
# Phase 1: 檢查
# ══════════════════════════════════
log "Phase 1: 檢查結構"

# 必須有 SKILL.md 或是 command .md
SKILL_TYPE=""
if [ -f "SKILL.md" ]; then
  SKILL_TYPE="skill"
  ok "找到 SKILL.md"
elif ls *.md &>/dev/null && head -5 *.md 2>/dev/null | grep -q "^name:"; then
  SKILL_TYPE="command"
  ok "找到 command .md"
else
  fail "缺少 SKILL.md — 不是有效的 skill 目錄"
fi

# 檢查 git
if [ -d ".git" ]; then
  ok "Git repo 已初始化"
  REMOTE=$(git remote get-url origin 2>/dev/null || echo "")
  if [ -n "$REMOTE" ]; then
    ok "Remote: $REMOTE"
  else
    warn "無 remote — 將跳過 GitHub 推送"
  fi
else
  warn "非 Git repo — 將跳過版本控制步驟"
  REMOTE=""
fi

# 讀取版本
VERSION=""
if [ -f "package.json" ]; then
  VERSION=$(grep '"version"' package.json | head -1 | sed 's/.*"\([0-9][^"]*\)".*/\1/')
  ok "版本: v$VERSION"
elif [ -f "pyproject.toml" ]; then
  VERSION=$(grep '^version' pyproject.toml | head -1 | sed 's/.*"\([0-9][^"]*\)".*/\1/')
  ok "版本: v$VERSION"
fi

# ══════════════════════════════════
# Phase 2: 測試
# ══════════════════════════════════
if [ "$SKIP_TEST" = false ]; then
  log "Phase 2: 測試"

  TESTED=false

  # npm test
  if [ -f "package.json" ] && grep -q '"test"' package.json; then
    log "  執行 npm test..."
    if [ "$DRY_RUN" = true ]; then
      warn "DRY RUN — 跳過 npm test"
    else
      if npm test 2>&1 | tail -5; then
        ok "npm test 通過"
        TESTED=true
      else
        fail "npm test 失敗 — 中止部署"
      fi
    fi
  fi

  # pytest
  if [ -f "pyproject.toml" ] && [ -d "tests" ]; then
    log "  執行 pytest..."
    if [ "$DRY_RUN" = true ]; then
      warn "DRY RUN — 跳過 pytest"
    else
      if python3 -m pytest tests/ 2>&1 | tail -5; then
        ok "pytest 通過"
        TESTED=true
      else
        fail "pytest 失敗 — 中止部署"
      fi
    fi
  fi

  # SKILL.md 結構驗證
  if [ "$SKILL_TYPE" = "skill" ] && [ -f "SKILL.md" ]; then
    if head -1 SKILL.md | grep -q "^---"; then
      if grep -q "^name:" SKILL.md && grep -q "^description:" SKILL.md; then
        ok "SKILL.md frontmatter 格式正確"
      else
        warn "SKILL.md 缺少 name/description frontmatter"
      fi
    else
      warn "SKILL.md 沒有 YAML frontmatter (---)"
    fi
  fi

  [ "$TESTED" = false ] && warn "沒有找到測試框架，跳過測試"
else
  log "Phase 2: 測試（已跳過 --skip-test）"
fi

# ══════════════════════════════════
# Phase 3: Git 推送到 GitHub
# ══════════════════════════════════
log "Phase 3: Git → GitHub"

if [ -d ".git" ]; then
  # 檢查是否有未提交的更改
  if ! git diff --quiet 2>/dev/null || ! git diff --cached --quiet 2>/dev/null; then
    warn "有未提交的更改:"
    git status --short
    echo ""
    if [ "$DRY_RUN" = true ]; then
      warn "DRY RUN — 跳過 commit"
    else
      read -p "  自動 commit 並推送? (y/n) " -n 1 -r
      echo ""
      if [[ $REPLY =~ ^[Yy]$ ]]; then
        git add -A
        MSG="chore: deploy $SKILL_NAME"
        [ -n "$VERSION" ] && MSG="release: $SKILL_NAME v$VERSION"
        git commit -m "$MSG"
        ok "已 commit: $MSG"
      else
        fail "有未提交更改 — 請先處理"
      fi
    fi
  else
    ok "工作區乾淨"
  fi

  # 推送
  if [ -n "$REMOTE" ]; then
    BRANCH=$(git branch --show-current)
    if [ "$DRY_RUN" = true ]; then
      warn "DRY RUN — 跳過 git push"
    else
      git push -u origin "$BRANCH" 2>&1 | tail -3
      ok "已推送到 GitHub ($BRANCH)"
    fi
  fi
else
  warn "非 Git repo — 跳過"
fi

# ══════════════════════════════════
# Phase 4: 安裝到 ~/.claude/skills/
# ══════════════════════════════════
log "Phase 4: 安裝到全局"

TARGET="$SKILLS_DIR/$SKILL_NAME"

if [ "$DRY_RUN" = true ]; then
  warn "DRY RUN — 將安裝到 $TARGET"
else
  mkdir -p "$TARGET"

  # 複製 SKILL.md（必要）
  if [ -f "SKILL.md" ]; then
    cp SKILL.md "$TARGET/SKILL.md"
    ok "SKILL.md → $TARGET/"
  fi

  # 複製附帶資源（如果有）
  for dir in references scripts bin src dist; do
    if [ -d "$dir" ]; then
      cp -r "$dir" "$TARGET/"
      ok "$dir/ → $TARGET/"
    fi
  done

  # 複製 package.json（如果有 bin）
  if [ -f "package.json" ] && grep -q '"bin"' package.json; then
    cp package.json "$TARGET/"
    ok "package.json → $TARGET/"
  fi

  # 複製 pyproject.toml（如果有）
  [ -f "pyproject.toml" ] && cp pyproject.toml "$TARGET/" && ok "pyproject.toml → $TARGET/"

  ok "已安裝到 $TARGET"
fi

# ══════════════════════════════════
# Phase 5: 驗證
# ══════════════════════════════════
log "Phase 5: 驗證安裝"

if [ "$DRY_RUN" = false ]; then
  if [ -f "$TARGET/SKILL.md" ]; then
    ok "SKILL.md 存在 ($(wc -c < "$TARGET/SKILL.md" | tr -d ' ') bytes)"
  else
    fail "安裝驗證失敗 — SKILL.md 不存在"
  fi

  # 檢查 skill 名稱是否會被 Claude 識別
  SKILL_NAME_IN_MD=$(grep "^name:" "$TARGET/SKILL.md" 2>/dev/null | head -1 | sed 's/name: *//')
  if [ -n "$SKILL_NAME_IN_MD" ]; then
    ok "Skill 名稱: $SKILL_NAME_IN_MD"
  fi
fi

# ══════════════════════════════════
# 完成
# ══════════════════════════════════
echo ""
echo -e "${GREEN}${BOLD}═══ 部署完成！ ═══${NC}"
echo ""
echo -e "  Skill:    ${BOLD}$SKILL_NAME${NC}"
[ -n "$VERSION" ] && echo -e "  版本:    v$VERSION"
[ -n "$REMOTE" ] && echo -e "  GitHub:  $REMOTE"
echo -e "  安裝位置: $TARGET"
echo ""
echo -e "  下次開啟 Claude Code 即可使用 ${CYAN}/$SKILL_NAME${NC}"
echo ""
