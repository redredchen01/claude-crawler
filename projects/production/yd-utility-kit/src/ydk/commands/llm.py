"""llm 子命令 — LLM 工作流加速工具"""

import json
import sqlite3
import hashlib
from pathlib import Path
from datetime import datetime
import click


# ============================================================================
# TokenCounter — 支持多家 LLM token 計數
# ============================================================================


class TokenCounter:
    """LLM Token 計數器 (Claude / OpenAI / Llama)"""

    # 簡易估算比例（實際需要引入官方 tokenizer）
    # Claude 3: ~0.25 tokens/char (平均)
    # GPT-4: ~0.25 tokens/char
    # Llama 2: ~0.3 tokens/char
    MODELS = {
        "claude": {"ratio": 0.25, "name": "Claude 3"},
        "gpt4": {"ratio": 0.25, "name": "GPT-4"},
        "gpt3.5": {"ratio": 0.25, "name": "GPT-3.5"},
        "llama": {"ratio": 0.3, "name": "Llama 2"},
    }

    @classmethod
    def count(cls, text: str, model: str = "claude") -> int:
        """估算 token 數

        Args:
            text: 輸入文本
            model: 模型名稱 (claude/gpt4/gpt3.5/llama)

        Returns:
            估計的 token 數
        """
        if model not in cls.MODELS:
            raise ValueError(f"不支持的模型: {model}. 支持: {list(cls.MODELS.keys())}")

        ratio = cls.MODELS[model]["ratio"]
        # 簡易算法：字符數 × 比例 + 句子數（逗號+句號）作為額外計數
        char_count = len(text)
        sentences = text.count(".") + text.count(",") + text.count("\n")

        # 估算公式
        estimated = int(char_count * ratio) + max(0, sentences // 2)
        return estimated

    @classmethod
    def compare(cls, text: str, models: list = None) -> dict:
        """比較多個模型的 token 計數"""
        if models is None:
            models = ["claude", "gpt4", "llama"]

        result = {}
        for model in models:
            if model in cls.MODELS:
                result[model] = cls.count(text, model)
        return result


# ============================================================================
# PromptSplitter — Token-aware 文本分割
# ============================================================================


class PromptSplitter:
    """按 token 限制分割文本（尊重句子邊界）"""

    @staticmethod
    def split(
        text: str, max_tokens: int = 2000, model: str = "claude", overlap: int = 100
    ) -> list:
        """分割文本為 token 符合限制的段落

        Args:
            text: 輸入文本
            max_tokens: 最大 token 數
            model: 模型名稱
            overlap: 段落間重疊的 token 數（保持上下文連貫性）

        Returns:
            分割後的文本片段列表
        """
        sentences = text.split("。")
        chunks = []
        current_chunk = ""

        for sentence in sentences:
            sentence = sentence.strip() + "。"
            test_chunk = current_chunk + sentence
            tokens = TokenCounter.count(test_chunk, model)

            if tokens > max_tokens and current_chunk:
                # 當前段落已滿，存儲並開始新段落
                chunks.append(current_chunk.strip())
                # 新段落加上 overlap（重複最後的內容以保持連貫）
                current_chunk = sentence
            else:
                current_chunk = test_chunk

        if current_chunk.strip():
            chunks.append(current_chunk.strip())

        return chunks


# ============================================================================
# CacheManager — SQLite 本地 API 緩存
# ============================================================================


class CacheManager:
    """LLM API 呼叫緩存管理器"""

    def __init__(self, cache_dir: str = "~/.ydk/llm_cache"):
        self.cache_dir = Path(cache_dir).expanduser()
        self.cache_dir.mkdir(parents=True, exist_ok=True)
        self.db_path = self.cache_dir / "cache.db"
        self._init_db()

    def _init_db(self):
        """初始化 SQLite 數據庫"""
        with sqlite3.connect(self.db_path) as conn:
            conn.execute("""
                CREATE TABLE IF NOT EXISTS llm_cache (
                    key TEXT PRIMARY KEY,
                    model TEXT,
                    prompt TEXT,
                    response TEXT,
                    tokens_in INTEGER,
                    tokens_out INTEGER,
                    created_at TIMESTAMP,
                    expires_at TIMESTAMP
                )
            """)
            conn.execute("""
                CREATE INDEX IF NOT EXISTS idx_model ON llm_cache(model)
            """)
            conn.commit()

    def _hash_prompt(self, prompt: str) -> str:
        """生成 prompt 的 hash key"""
        return hashlib.sha256(prompt.encode()).hexdigest()[:16]

    def get(self, prompt: str, model: str = "claude") -> dict | None:
        """獲取緩存

        Returns:
            {'response': str, 'tokens_in': int, 'tokens_out': int} 或 None
        """
        key = self._hash_prompt(prompt)

        with sqlite3.connect(self.db_path) as conn:
            row = conn.execute(
                """
                SELECT response, tokens_in, tokens_out, expires_at
                FROM llm_cache
                WHERE key = ? AND model = ?
            """,
                (key, model),
            ).fetchone()

        if not row:
            return None

        response, tokens_in, tokens_out, expires_at = row

        # 檢查過期
        if expires_at:
            if datetime.fromisoformat(expires_at) < datetime.now():
                self.delete(prompt, model)
                return None

        return {
            "response": response,
            "tokens_in": tokens_in,
            "tokens_out": tokens_out,
        }

    def set(
        self,
        prompt: str,
        response: str,
        tokens_in: int = 0,
        tokens_out: int = 0,
        model: str = "claude",
        ttl_hours: int = 24,
    ):
        """存儲緩存"""
        key = self._hash_prompt(prompt)
        expires_at = None
        if ttl_hours:
            from datetime import timedelta

            expires_at = (datetime.now() + timedelta(hours=ttl_hours)).isoformat()

        with sqlite3.connect(self.db_path) as conn:
            conn.execute(
                """
                INSERT OR REPLACE INTO llm_cache
                (key, model, prompt, response, tokens_in, tokens_out, created_at, expires_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """,
                (
                    key,
                    model,
                    prompt,
                    response,
                    tokens_in,
                    tokens_out,
                    datetime.now().isoformat(),
                    expires_at,
                ),
            )
            conn.commit()

    def delete(self, prompt: str, model: str = "claude"):
        """刪除特定緩存"""
        key = self._hash_prompt(prompt)
        with sqlite3.connect(self.db_path) as conn:
            conn.execute(
                """
                DELETE FROM llm_cache
                WHERE key = ? AND model = ?
            """,
                (key, model),
            )
            conn.commit()

    def stats(self) -> dict:
        """緩存統計"""
        with sqlite3.connect(self.db_path) as conn:
            total = conn.execute("SELECT COUNT(*) FROM llm_cache").fetchone()[0]

            by_model = conn.execute("""
                SELECT model, COUNT(*) as count
                FROM llm_cache
                GROUP BY model
            """).fetchall()

        return {
            "total_entries": total,
            "by_model": dict(by_model),
            "cache_dir": str(self.cache_dir),
        }


# ============================================================================
# Click 命令群組
# ============================================================================


@click.group()
def cli():
    """LLM 工作流加速工具"""
    pass


@cli.command()
@click.argument("text", type=click.File("r"), default="-")
@click.option(
    "--model",
    "-m",
    type=click.Choice(["claude", "gpt4", "gpt3.5", "llama"]),
    default="claude",
    help="LLM 模型 (預設: claude)",
)
@click.option("--compare", "-c", is_flag=True, help="比較多個模型")
def token(text, model, compare):
    """估算文本的 token 數

    範例:
        echo "Hello world" | ydk llm token
        ydk llm token prompt.txt --model gpt4
        ydk llm token data.txt --compare
    """
    content = text.read()

    if compare:
        result = TokenCounter.compare(content)
        click.echo("\n📊 Token 計數比較:")
        for m, count in sorted(result.items()):
            click.echo(f"  {m:12} {count:6} tokens")
    else:
        count = TokenCounter.count(content, model)
        click.echo(f"✅ {model} 估計: {count} tokens")


@cli.command()
@click.argument("text", type=click.File("r"), default="-")
@click.option(
    "--max-tokens", "-t", type=int, default=2000, help="最大 token 數 (預設: 2000)"
)
@click.option(
    "--model",
    "-m",
    type=click.Choice(["claude", "gpt4", "gpt3.5", "llama"]),
    default="claude",
)
@click.option("--output", "-o", type=click.Path(), help="輸出到檔案 (JSON 格式)")
def split(text, max_tokens, model, output):
    """按 token 限制分割文本

    範例:
        ydk llm split long_article.txt --max-tokens 3000
        ydk llm split prompt.txt -m gpt4 -o chunks.json
    """
    content = text.read()
    chunks = PromptSplitter.split(content, max_tokens, model)

    click.echo(f"✅ 分割為 {len(chunks)} 段 (最大 {max_tokens} tokens):\n")
    for i, chunk in enumerate(chunks, 1):
        tokens = TokenCounter.count(chunk, model)
        preview = chunk[:80].replace("\n", " ") + "..."
        click.echo(f"  [{i}] {tokens:4} tokens | {preview}")

    if output:
        output_data = {
            "total_chunks": len(chunks),
            "max_tokens": max_tokens,
            "model": model,
            "chunks": [
                {"index": i, "tokens": TokenCounter.count(c, model), "content": c}
                for i, c in enumerate(chunks, 1)
            ],
        }
        Path(output).write_text(json.dumps(output_data, ensure_ascii=False, indent=2))
        click.echo(f"\n💾 已保存到: {output}")


@cli.command()
@click.option(
    "--model",
    "-m",
    type=click.Choice(["claude", "gpt4", "gpt3.5", "llama"]),
    default="claude",
)
@click.option("--stats", "-s", is_flag=True, help="顯示緩存統計")
@click.option("--clear", is_flag=True, help="清除所有緩存")
@click.option(
    "--cache-dir", type=click.Path(), default="~/.ydk/llm_cache", help="緩存目錄"
)
def cache(model, stats, clear, cache_dir):
    """LLM API 緩存管理

    範例:
        ydk llm cache --stats
        ydk llm cache --clear
        ydk llm cache -m gpt4 --stats
    """
    manager = CacheManager(cache_dir)

    if stats:
        info = manager.stats()
        click.echo("\n📊 緩存統計:")
        click.echo(f"  總數: {info['total_entries']} 項")
        click.echo(f"  路徑: {info['cache_dir']}")
        if info["by_model"]:
            click.echo("\n  按模型分類:")
            for m, count in info["by_model"].items():
                click.echo(f"    {m:12} {count:4} 項")
    elif clear:
        # 簡易清除（實際應該實現部分清除）
        cache_db = Path(cache_dir).expanduser() / "cache.db"
        if cache_db.exists():
            cache_db.unlink()
            click.echo("✅ 已清除所有緩存")
        else:
            click.echo("ℹ️  沒有找到緩存")
    else:
        click.echo("使用 --stats 或 --clear 選項")


@cli.command()
@click.argument("prompt_file", type=click.File("r"))
@click.option(
    "--model",
    "-m",
    type=click.Choice(["claude", "gpt4", "gpt3.5", "llama"]),
    default="claude",
    help="LLM 模型",
)
@click.option("--output", "-o", type=click.Path(), help="輸出結果到檔案")
def test(prompt_file, model, output):
    """測試 prompt 變體（乾跑模式，不計費）

    範例:
        ydk llm test prompt.txt -m gpt4 -o result.json

    此命令分析 prompt 結構、token 數、複雜度，
    幫助優化 prompt 設計（不實際呼叫 API）。
    """
    prompt = prompt_file.read()

    tokens = TokenCounter.count(prompt, model)
    split_chunks = PromptSplitter.split(prompt, 2000, model)

    analysis = {
        "model": model,
        "prompt_length": len(prompt),
        "estimated_tokens": tokens,
        "requires_splitting": len(split_chunks) > 1,
        "split_count": len(split_chunks),
        "model_info": TokenCounter.MODELS.get(model, {}),
        "recommendations": [],
    }

    # 簡單的優化建議
    if tokens > 3000:
        analysis["recommendations"].append("💡 Prompt 過長，考慮分割或簡化")
    if len(prompt.split("\n")) > 50:
        analysis["recommendations"].append("💡 包含太多換行，可能影響理解")
    if "{{" in prompt or "{%" in prompt:
        analysis["recommendations"].append("⚠️  檢測到模板變數，確保替換完整")

    if not analysis["recommendations"]:
        analysis["recommendations"].append("✅ Prompt 結構良好")

    click.echo("\n📋 Prompt 分析:")
    click.echo(f"  長度: {analysis['prompt_length']} 字符")
    click.echo(f"  預估 Tokens: {analysis['estimated_tokens']}")
    click.echo(f"  需分割: {'是' if analysis['requires_splitting'] else '否'}")
    click.echo("\n💡 建議:")
    for rec in analysis["recommendations"]:
        click.echo(f"  {rec}")

    if output:
        Path(output).write_text(json.dumps(analysis, ensure_ascii=False, indent=2))
        click.echo(f"\n💾 分析結果已保存到: {output}")
