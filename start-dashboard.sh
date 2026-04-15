#!/bin/bash

# GA4 Dashboard 启动脚本

echo "🚀 GA4 Dashboard 启动中..."
echo ""

# 检查 node
if ! command -v node &> /dev/null; then
    echo "❌ Node.js 未安装，请先安装 Node.js"
    exit 1
fi

# 检查凭证文件
if [ ! -f "openclaw-ga4-488308-b099b607405b.json" ]; then
    echo "❌ GA4 凭证文件不存在"
    echo "   请将凭证文件放在 /Users/dex/YD 2026/ 目录下"
    exit 1
fi

# 检查依赖
if [ ! -d "node_modules" ]; then
    echo "📦 安装依赖中..."
    npm install --save @google-analytics/data
fi

# 启动服务
export GA4_PROPERTY_ID=524298631
export PORT=${PORT:-3000}

echo "✅ 配置就绪"
echo "   属性 ID: $GA4_PROPERTY_ID"
echo "   端口: $PORT"
echo ""
echo "🌐 访问地址: http://localhost:$PORT"
echo "🛑 停止服务: Ctrl+C"
echo ""

node ga4-server.js
