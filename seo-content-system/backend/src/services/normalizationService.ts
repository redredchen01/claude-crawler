/**
 * Keyword Normalization Service
 * Cleans and standardizes keywords
 */

export interface NormalizationLog {
  originalKeyword: string;
  normalizedKeyword: string;
  steps: Array<{
    step: string;
    before: string;
    after: string;
  }>;
  executionTimeMs: number;
}

export class NormalizationService {
  /**
   * Normalize a keyword through multiple cleaning steps
   */
  static normalize(keyword: string): NormalizationLog {
    const startTime = Date.now();
    const steps: Array<{ step: string; before: string; after: string }> = [];
    let current = keyword;

    // Step 1: Trim whitespace
    const trimmed = current.trim();
    if (trimmed !== current) {
      steps.push({ step: "trim_whitespace", before: current, after: trimmed });
      current = trimmed;
    }

    // Step 2: Convert to lowercase
    const lowercased = current.toLowerCase();
    if (lowercased !== current) {
      steps.push({
        step: "lowercase",
        before: current,
        after: lowercased,
      });
      current = lowercased;
    }

    // Step 3: Normalize punctuation and symbols
    const normalized = this.normalizePunctuation(current);
    if (normalized !== current) {
      steps.push({
        step: "normalize_punctuation",
        before: current,
        after: normalized,
      });
      current = normalized;
    }

    // Step 4: Collapse consecutive whitespace
    const collapsed = this.collapseWhitespace(current);
    if (collapsed !== current) {
      steps.push({
        step: "collapse_whitespace",
        before: current,
        after: collapsed,
      });
      current = collapsed;
    }

    // Step 5: Remove leading/trailing whitespace again (after transformations)
    const finalTrimmed = current.trim();
    if (finalTrimmed !== current) {
      steps.push({
        step: "final_trim",
        before: current,
        after: finalTrimmed,
      });
      current = finalTrimmed;
    }

    const executionTimeMs = Date.now() - startTime;

    return {
      originalKeyword: keyword,
      normalizedKeyword: current,
      steps,
      executionTimeMs,
    };
  }

  /**
   * Normalize punctuation and special characters
   * Keep alphanumeric and CJK characters, convert symbols to spaces
   */
  private static normalizePunctuation(text: string): string {
    // Replace common punctuation with space
    let result = text
      .replace(/[，。！？；：—\-～·]/g, " ") // Chinese punctuation
      .replace(/[,\.\!?;:\-~`]/g, " ") // English punctuation
      .replace(/[\/\\|()（）\[\]【】{}]/g, " "); // Brackets and slashes

    // Preserve alphanumeric, CJK, and basic spaces
    // Allow: a-z, 0-9, CJK (U+4E00-U+9FFF), spaces
    result = result
      .split("")
      .filter((char) => {
        const code = char.charCodeAt(0);
        // Allow: lowercase letters, digits, spaces, CJK characters
        return (
          (code >= 0x0030 && code <= 0x0039) || // 0-9
          (code >= 0x0061 && code <= 0x007a) || // a-z
          (code >= 0x4e00 && code <= 0x9fff) || // CJK
          char === " "
        );
      })
      .join("");

    return result;
  }

  /**
   * Collapse multiple consecutive spaces into one
   */
  private static collapseWhitespace(text: string): string {
    return text.replace(/\s+/g, " ");
  }

  /**
   * Check if two keywords are similar (for near-duplicate detection)
   * Uses simple character overlap heuristic for MVP
   * TODO: Implement TF-IDF or edit distance for Phase 2
   */
  static calculateSimilarity(keyword1: string, keyword2: string): number {
    if (keyword1 === keyword2) return 1.0;
    if (keyword1.length === 0 || keyword2.length === 0) return 0;

    // Simple character overlap heuristic
    const chars1 = new Set(keyword1.split(""));
    const chars2 = new Set(keyword2.split(""));

    const intersection = new Set([...chars1].filter((c) => chars2.has(c))).size;
    const union = new Set([...chars1, ...chars2]).size;

    return union > 0 ? intersection / union : 0;
  }

  /**
   * Detect potential near-duplicates in a list of keywords
   * Returns pairs with similarity score > threshold
   */
  static findNearDuplicates(
    keywords: string[],
    threshold: number = 0.7,
  ): Array<{
    keyword1: string;
    keyword2: string;
    similarity: number;
  }> {
    const duplicates: Array<{
      keyword1: string;
      keyword2: string;
      similarity: number;
    }> = [];

    for (let i = 0; i < keywords.length; i++) {
      for (let j = i + 1; j < keywords.length; j++) {
        const similarity = this.calculateSimilarity(keywords[i], keywords[j]);
        if (similarity >= threshold) {
          duplicates.push({
            keyword1: keywords[i],
            keyword2: keywords[j],
            similarity,
          });
        }
      }
    }

    return duplicates;
  }

  /**
   * Validate keyword after normalization
   */
  static isValid(keyword: string): boolean {
    // Check if empty
    if (keyword.length === 0) return false;

    // Check if contains at least one alphanumeric or CJK character
    const hasContent = /[\da-z\u4e00-\u9fff]/i.test(keyword);
    if (!hasContent) return false;

    // Check reasonable length (> 0 and < 500 characters)
    if (keyword.length > 500) return false;

    return true;
  }

  /**
   * Batch normalize keywords
   */
  static normalizeBatch(keywords: string[]): Array<{
    original: string;
    normalized: string;
    isValid: boolean;
  }> {
    return keywords.map((keyword) => {
      const result = this.normalize(keyword);
      return {
        original: result.originalKeyword,
        normalized: result.normalizedKeyword,
        isValid: this.isValid(result.normalizedKeyword),
      };
    });
  }
}
