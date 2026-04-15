#!/bin/bash
# 統一 Sub-Agent 登入腳本

set -e

echo "🔐 開始 Sub-Agent 登入流程..."
echo ""

# 1️⃣ Codex
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "1️⃣  Codex 登入"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
if command -v codex &> /dev/null; then
    echo "✅ Codex 已安裝，檢查認證狀態..."
    if codex auth status &> /dev/null; then
        echo "✅ Codex 已認證"
    else
        echo "🔄 進行 Codex 登入..."
        codex auth login
    fi
else
    echo "⚠️  Codex 未安裝"
fi
echo ""

# 2️⃣ Cline
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "2️⃣  Cline 登入"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
if command -v cline &> /dev/null; then
    echo "✅ Cline 已安裝"
    echo "📌 選擇: Sign in with Cline (推薦)"
    cline
else
    echo "⚠️  Cline 未安裝"
fi
echo ""

# 3️⃣ Kilo
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "3️⃣  Kilo 登入"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
if command -v kilo &> /dev/null; then
    echo "✅ Kilo 已安裝"
    echo "📌 選擇: Kilo Gateway (推薦)"
    kilo auth login
else
    echo "⚠️  Kilo 未安裝"
fi
echo ""

# 4️⃣ OpenCode
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "4️⃣  OpenCode 登入"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
if command -v opencode &> /dev/null; then
    echo "✅ OpenCode 已安裝"
    cd /Users/dex
    opencode auth login
    cd - > /dev/null
else
    echo "⚠️  OpenCode 未安裝"
fi
echo ""

# 5️⃣ Gemini
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "5️⃣  Gemini CLI 配置"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
if command -v gemini &> /dev/null; then
    echo "✅ Gemini CLI 已安裝"
    if [ -z "$GOOGLE_API_KEY" ]; then
        echo "⚠️  需要設置 GOOGLE_API_KEY"
        read -p "輸入你的 Google API Key (https://aistudio.google.com/apikey): " -s API_KEY
        echo ""
        export GOOGLE_API_KEY="$API_KEY"
        echo "✅ GOOGLE_API_KEY 已設置"
        echo ""
        echo "要永久保存，執行:"
        echo "echo 'export GOOGLE_API_KEY=\"$API_KEY\"' >> ~/.zshrc"
    else
        echo "✅ GOOGLE_API_KEY 已設置"
    fi
else
    echo "⚠️  Gemini CLI 未安裝"
fi
echo ""

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✅ 登入流程完成！"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "Claude 現在可以調用這些 agents:"
echo "  /codex       — Codex 代碼審查"
echo "  /cline       — Cline AI 編碼助手"
echo "  /gemini      — Gemini CLI"
echo "  /kilo        — Kilo AI"
echo "  /opencode    — OpenCode"
echo ""
