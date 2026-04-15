#!/bin/bash

# MVP Verification Script
echo "🧪 Prompt Optimizer MVP Verification"
echo "===================================="
echo ""

PASS=0
FAIL=0

# Test 1: Project structure
echo "Test 1: Project structure..."
required_files=(
  "package.json"
  "tsconfig.json"
  "prisma/schema.prisma"
  "app/page.tsx"
  "app/api/score/route.ts"
  "app/api/optimize-full/route.ts"
  "app/api/demo/route.ts"
  "lib/llm/client.ts"
  "lib/llm/prompts.ts"
  "lib/llm/types.ts"
  "lib/services/scoring.ts"
  "lib/services/optimization.ts"
  "lib/db.ts"
  "lib/api-client.ts"
  "docker-compose.yml"
  "README.md"
  "docs/api.md"
)

for file in "${required_files[@]}"; do
  if [ -f "$file" ]; then
    echo "  ✓ $file"
    ((PASS++))
  else
    echo "  ✗ $file MISSING"
    ((FAIL++))
  fi
done

echo ""
echo "Test 2: Dependencies..."
if [ -f "node_modules/@anthropic-ai/sdk/package.json" ]; then
  echo "  ✓ Anthropic SDK"
  ((PASS++))
fi

if [ -f "node_modules/@prisma/client/package.json" ]; then
  echo "  ✓ Prisma Client"
  ((PASS++))
fi

if [ -f "node_modules/next/package.json" ]; then
  echo "  ✓ Next.js"
  ((PASS++))
fi

echo ""
echo "Test 3: Build status..."
if npm run build > /tmp/build.log 2>&1; then
  echo "  ✓ Build successful"
  ((PASS++))
else
  echo "  ✗ Build failed"
  ((FAIL++))
fi

echo ""
echo "===================================="
echo "Results: $PASS passed, $FAIL failed"
echo ""

if [ $FAIL -eq 0 ]; then
  echo "✅ MVP structure verified!"
  exit 0
else
  echo "⚠️  Some issues found"
  exit 1
fi
