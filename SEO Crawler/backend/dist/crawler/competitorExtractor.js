/**
 * 竞争对手页面提取器
 * 从竞争对手 URL 提取关键词：title, meta description, h1, h2, body phrases
 */
import PQueue from "p-queue";
/**
 * 从 HTML 提取竞争对手关键词
 */
export class CompetitorExtractor {
  /**
   * 延迟指定毫秒数
   */
  delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
  /**
   * 随机延迟（1000-2000ms）
   */
  randomDelay() {
    const ms = 1000 + Math.random() * 1000;
    return this.delay(ms);
  }
  /**
   * 从 HTML 提取标签内容
   */
  extractTag(html, tag) {
    const regex = new RegExp(`<${tag}[^>]*>([^<]*)</${tag}>`, "i");
    const match = html.match(regex);
    return match ? match[1].trim() : null;
  }
  /**
   * 从 HTML 提取所有特定标签的内容
   */
  extractAllTags(html, tag) {
    const regex = new RegExp(`<${tag}[^>]*>([^<]*)</${tag}>`, "gi");
    const results = [];
    let match;
    while ((match = regex.exec(html)) !== null) {
      const text = match[1].trim();
      if (text.length > 0 && text.length < 200) {
        results.push(text);
      }
    }
    return results;
  }
  /**
   * 从 HTML 提取 meta 标签属性值
   */
  extractMetaAttribute(html, name, attr = "content") {
    const regex = new RegExp(
      `<meta\\s+name="${name}"\\s+${attr}="([^"]*)"`,
      "i",
    );
    const match = html.match(regex);
    if (match) return match[1].trim();
    // 尝试不同的顺序
    const regex2 = new RegExp(
      `<meta\\s+${attr}="([^"]*)"\\s+name="${name}"`,
      "i",
    );
    const match2 = html.match(regex2);
    return match2 ? match2[1].trim() : null;
  }
  /**
   * 从正文提取 2-3 词短语
   */
  extractBodyPhrases(html, limit = 10) {
    // 移除脚本和样式标签
    let text = html
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ");
    // 提取单词
    const words = text
      .toLowerCase()
      .split(/\s+/)
      .filter((w) => w.length > 2 && !/^\d+$/.test(w))
      .slice(0, 200); // 限制以避免内存爆炸
    const phrases = [];
    const seen = new Set();
    // 滑动窗口提取 2-3 词短语
    for (let i = 0; i < words.length - 1; i++) {
      // 2-word phrase
      const phrase2 = `${words[i]} ${words[i + 1]}`;
      if (phrase2.length < 50 && !seen.has(phrase2)) {
        phrases.push(phrase2);
        seen.add(phrase2);
      }
      // 3-word phrase
      if (i < words.length - 2) {
        const phrase3 = `${words[i]} ${words[i + 1]} ${words[i + 2]}`;
        if (phrase3.length < 50 && !seen.has(phrase3)) {
          phrases.push(phrase3);
          seen.add(phrase3);
        }
      }
      if (phrases.length >= limit) break;
    }
    return phrases.slice(0, limit);
  }
  /**
   * 从竞争对手 URL 提取关键词（带重试）
   */
  async extractFromUrl(url) {
    const maxRetries = 2;
    const delays = [3000, 10000];
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        // 随机延迟，避免反爬
        await this.randomDelay();
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000);
        const response = await fetch(url, {
          headers: {
            "User-Agent":
              "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            "Accept-Language": "en-US,en;q=0.9",
            Accept:
              "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          },
          signal: controller.signal,
        });
        clearTimeout(timeoutId);
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
        const html = await response.text();
        // 提取各部分
        const title = this.extractTag(html, "title");
        const metaDescription = this.extractMetaAttribute(html, "description");
        const h1 = this.extractAllTags(html, "h1");
        const h2 = this.extractAllTags(html, "h2");
        const bodyPhrases = this.extractBodyPhrases(html, 10);
        // 合并所有关键词
        const allKeywords = [
          ...(title ? [title] : []),
          ...(metaDescription ? [metaDescription] : []),
          ...h1,
          ...h2,
          ...bodyPhrases,
        ];
        console.log(
          `[Competitor] Extracted ${allKeywords.length} keywords from ${url}`,
        );
        return {
          url,
          title,
          metaDescription,
          h1,
          h2,
          bodyPhrases,
          allKeywords,
        };
      } catch (error) {
        console.warn(
          `[Competitor] Attempt ${attempt + 1}/${maxRetries} failed for ${url}:`,
          error instanceof Error ? error.message : String(error),
        );
        if (attempt < maxRetries - 1) {
          const delayMs = delays[attempt];
          console.log(`[Competitor] Retrying in ${delayMs}ms...`);
          await this.delay(delayMs);
        }
      }
    }
    console.warn(
      `[Competitor] Failed to extract from ${url} after ${maxRetries} attempts`,
    );
    return null;
  }
  /**
   * 从多个竞争对手 URL 批量提取关键词（使用 p-queue 进行并发处理）
   */
  async extractFromUrls(urls) {
    const queue = new PQueue({ concurrency: 3 }); // 同时处理 3 个 URL
    const allKeywords = [];
    const seen = new Set();

    const promises = urls.map((url) =>
      queue.add(async () => {
        try {
          return await this.extractFromUrl(url);
        } catch (err) {
          console.error(
            `Failed to extract from ${url}:`,
            err instanceof Error ? err.message : String(err),
          );
          return null;
        }
      }),
    );

    const results = await Promise.all(promises);

    // 合并所有结果
    for (const result of results) {
      if (result) {
        for (const keyword of result.allKeywords) {
          const normalized = keyword.toLowerCase().trim();
          if (normalized.length > 0 && !seen.has(normalized)) {
            allKeywords.push(keyword);
            seen.add(normalized);
          }
        }
      }
    }

    return allKeywords;
  }
}
//# sourceMappingURL=competitorExtractor.js.map
