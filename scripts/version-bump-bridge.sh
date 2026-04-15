#!/bin/bash
# version-bump-bridge.sh
# 自動檢測 ydk 版本變化，執行 git tag 和發佈流程

set -e

PROJECT_ROOT="$HOME/YD 2026"
YDK_DIR="$PROJECT_ROOT/projects/production/yd-utility-kit"
PYPROJECT="$YDK_DIR/pyproject.toml"

# 配置
ENABLE_AUTO_BUMP=0  # 0=檢測版本，1=自動遞增
PUBLISH_TARGETS="github npm pypi"  # 發佈目標
DRY_RUN=0

# 顏色
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log_info() { echo -e "${BLUE}ℹ️  $1${NC}"; }
log_success() { echo -e "${GREEN}✅ $1${NC}"; }
log_warning() { echo -e "${YELLOW}⚠️  $1${NC}"; }
log_error() { echo -e "${RED}❌ $1${NC}"; }

# 步驟 1：讀取當前版本
get_current_version() {
  grep '^version = ' "$PYPROJECT" | cut -d'"' -f2
}

# 步驟 2：檢測 Git 變化（自上次 tag 以來）
detect_version_bump_type() {
  local last_tag=$(git -C "$YDK_DIR" describe --tags --abbrev=0 2>/dev/null || echo "v0.0.0")
  local commit_count=$(git -C "$YDK_DIR" rev-list --count "$last_tag"..HEAD 2>/dev/null || echo 0)

  if [ "$commit_count" -eq 0 ]; then
    echo "none"
    return
  fi

  # 分析 commit 類型（基於 conventional commits）
  local has_breaking=0
  local has_feature=0
  local has_fix=0

  git -C "$YDK_DIR" log "$last_tag"..HEAD --oneline 2>/dev/null | while read -r line; do
    if [[ "$line" =~ "BREAKING" ]] || [[ "$line" =~ "!" ]]; then
      has_breaking=1
    elif [[ "$line" =~ "^feat:" ]]; then
      has_feature=1
    elif [[ "$line" =~ "^fix:" ]]; then
      has_fix=1
    fi
  done

  if [ "$has_breaking" -eq 1 ]; then
    echo "major"
  elif [ "$has_feature" -eq 1 ]; then
    echo "minor"
  elif [ "$has_fix" -eq 1 ]; then
    echo "patch"
  else
    echo "none"
  fi
}

# 步驟 3：計算新版本號
bump_version() {
  local current=$1
  local bump_type=$2

  IFS='.' read -r major minor patch <<< "$current"

  case "$bump_type" in
    major)
      ((major++))
      minor=0
      patch=0
      ;;
    minor)
      ((minor++))
      patch=0
      ;;
    patch)
      ((patch++))
      ;;
    *)
      echo "$current"
      return
      ;;
  esac

  echo "$major.$minor.$patch"
}

# 步驟 4：驗證環境
check_environment() {
  log_info "檢查環境..."

  if [ ! -f "$PYPROJECT" ]; then
    log_error "pyproject.toml 未找到: $PYPROJECT"
    return 1
  fi

  if ! command -v git &> /dev/null; then
    log_error "Git 未安裝"
    return 1
  fi

  # 檢查是否在 git repo 中
  if ! git -C "$YDK_DIR" rev-parse --git-dir &> /dev/null; then
    log_error "ydk 不在 git repo 中"
    return 1
  fi

  log_success "環境檢查通過"
  return 0
}

# 步驟 5：生成 Git Tag
create_git_tag() {
  local version=$1
  local tag="ydk-v$version"

  if [ $DRY_RUN -eq 1 ]; then
    log_warning "預演模式：跳過 git tag 創建"
    return 0
  fi

  log_info "創建 git tag: $tag"

  if git -C "$YDK_DIR" tag -a "$tag" -m "Release ydk v$version" 2>/dev/null; then
    log_success "Tag 已創建: $tag"
    return 0
  else
    log_warning "Tag 可能已存在"
    return 0
  fi
}

# 步驟 6：調用 triple-publish
call_triple_publish() {
  local version=$1

  if [ $DRY_RUN -eq 1 ]; then
    log_warning "預演模式：跳過 triple-publish 調用"
    return 0
  fi

  log_info "調用 /triple-publish..."

  # 如果有 /triple-publish skill，調用它
  # 否則執行手動發佈
  if command -v triple-publish &> /dev/null; then
    triple-publish --version "$version" --targets "$PUBLISH_TARGETS"
  else
    log_warning "triple-publish 命令未找到，請手動執行發佈"
    log_info "手動執行命令："
    echo "  cd $YDK_DIR"
    echo "  npm publish"
    echo "  python3 -m twine upload dist/*"
  fi

  return 0
}

# 步驟 7：更新 Obsidian 記錄
update_vault_record() {
  local version=$1

  if [ $DRY_RUN -eq 1 ]; then
    log_warning "預演模式：跳過 Vault 更新"
    return 0
  fi

  log_info "更新 Obsidian 記錄..."

  local vault_path="$PROJECT_ROOT/obsidian/projects/yd-utility-kit.md"

  if [ -f "$vault_path" ]; then
    local timestamp=$(date "+%Y-%m-%d %H:%M:%S")

    # 更新最後發佈版本
    if [[ "$OSTYPE" == "darwin"* ]]; then
      sed -i '' "s/last_published_version:.*/last_published_version: $version/" "$vault_path"
      sed -i '' "s/last_published_date:.*/last_published_date: $timestamp/" "$vault_path"
    else
      sed -i "s/last_published_version:.*/last_published_version: $version/" "$vault_path"
      sed -i "s/last_published_date:.*/last_published_date: $timestamp/" "$vault_path"
    fi

    log_success "Vault 記錄已更新"
  fi

  return 0
}

# 主函數
main() {
  echo "🚀 version-bump-bridge — ydk 版本號自動橋接"
  echo ""

  if ! check_environment; then
    return 1
  fi

  echo ""

  # 讀取當前版本
  local current_version=$(get_current_version)
  log_info "當前版本: $current_version"

  echo ""

  # 檢測版本變化
  log_info "檢測自上次發佈以來的變化..."
  local bump_type=$(detect_version_bump_type)

  if [ "$bump_type" == "none" ]; then
    log_warning "未檢測到版本變化（無新 commit 或沒有版本號變化）"
    return 0
  fi

  log_success "檢測到 $bump_type 類型的版本變化"

  echo ""

  # 計算新版本
  local new_version=$(bump_version "$current_version" "$bump_type")
  log_info "計畫版本號: $current_version → $new_version"

  echo ""

  # 創建 git tag
  create_git_tag "$new_version"

  echo ""

  # 調用發佈
  call_triple_publish "$new_version"

  echo ""

  # 更新 Vault
  update_vault_record "$new_version"

  echo ""
  log_success "✨ 版本號橋接完成"

  return 0
}

# 解析參數
while [ $# -gt 0 ]; do
  case "$1" in
    --dry-run)
      DRY_RUN=1
      shift
      ;;
    --auto-bump)
      ENABLE_AUTO_BUMP=1
      shift
      ;;
    *)
      log_error "未知參數: $1"
      shift
      ;;
  esac
done

# 執行主函數
main
