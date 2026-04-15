/**
 * TDK Rules & Validation Engine
 *
 * Defines validation rules for Title, Description, and Keywords.
 * Rules are configurable via environment variables to support different markets.
 */

export type Language = "en" | "zh";
export type ValidationStatus = "pass" | "warn" | "fail" | "info";

/**
 * Configuration thresholds for different languages
 */
export const TDK_CONFIG = {
  title: {
    en: {
      min: parseInt(process.env.TITLE_LENGTH_MIN_EN || "30", 10),
      optimalMin: parseInt(process.env.TITLE_LENGTH_OPTIMAL_MIN_EN || "50", 10),
      optimalMax: parseInt(process.env.TITLE_LENGTH_OPTIMAL_MAX_EN || "60", 10),
      max: parseInt(process.env.TITLE_LENGTH_MAX_EN || "70", 10),
    },
    zh: {
      min: parseInt(process.env.TITLE_LENGTH_MIN_ZH || "15", 10),
      optimalMin: parseInt(process.env.TITLE_LENGTH_OPTIMAL_MIN_ZH || "25", 10),
      optimalMax: parseInt(process.env.TITLE_LENGTH_OPTIMAL_MAX_ZH || "30", 10),
      max: parseInt(process.env.TITLE_LENGTH_MAX_ZH || "40", 10),
    },
  },
  description: {
    en: {
      min: parseInt(process.env.DESC_LENGTH_MIN_EN || "100", 10),
      optimalMin: parseInt(process.env.DESC_LENGTH_OPTIMAL_MIN_EN || "150", 10),
      optimalMax: parseInt(process.env.DESC_LENGTH_OPTIMAL_MAX_EN || "160", 10),
      max: parseInt(process.env.DESC_LENGTH_MAX_EN || "200", 10),
    },
    zh: {
      min: parseInt(process.env.DESC_LENGTH_MIN_ZH || "50", 10),
      optimalMin: parseInt(process.env.DESC_LENGTH_OPTIMAL_MIN_ZH || "75", 10),
      optimalMax: parseInt(process.env.DESC_LENGTH_OPTIMAL_MAX_ZH || "80", 10),
      max: parseInt(process.env.DESC_LENGTH_MAX_ZH || "100", 10),
    },
  },
  stacking: {
    repeatThreshold: parseInt(process.env.STACKING_REPEAT_THRESHOLD || "3", 10),
    densityWarn: parseFloat(process.env.STACKING_DENSITY_WARN || "0.15"),
    densityFail: parseFloat(process.env.STACKING_DENSITY_FAIL || "0.25"),
  },
  consistency: {
    coveragePass: parseFloat(process.env.CONSISTENCY_COVERAGE_PASS || "0.80"),
    coverageWarn: parseFloat(process.env.CONSISTENCY_COVERAGE_WARN || "0.60"),
  },
};

/**
 * Chinese stopwords (common)
 */
const STOPWORDS_ZH = new Set([
  "的",
  "和",
  "是",
  "在",
  "有",
  "被",
  "对",
  "与",
  "还是",
  "也",
  "或",
  "及",
  "但",
  "等",
  "所",
  "这",
  "那",
  "了",
  "着",
  "过",
  "要",
  "会",
  "可",
  "能",
  "为",
  "做",
  "给",
  "把",
  "让",
  "由",
  "从",
  "到",
  "里",
  "向",
  "跟",
  "同",
  "比",
  "如",
  "像",
  "比如",
  "以及",
  "因为",
  "所以",
  "但是",
  "然而",
  "不过",
  "而且",
  "此外",
  "另外",
  "既然",
  "既",
  "才",
  "就",
  "才能",
  "便",
  "只有",
  "只是",
  "无论",
  "是否",
  "倘若",
  "假如",
  "万一",
  "一旦",
]);

/**
 * English stopwords (common)
 */
const STOPWORDS_EN = new Set([
  "the",
  "a",
  "an",
  "and",
  "or",
  "but",
  "in",
  "on",
  "at",
  "to",
  "for",
  "of",
  "with",
  "by",
  "is",
  "are",
  "was",
  "were",
  "be",
  "been",
  "being",
  "have",
  "has",
  "had",
  "do",
  "does",
  "did",
  "will",
  "would",
  "could",
  "should",
  "may",
  "might",
  "can",
  "must",
  "shall",
  "as",
  "if",
  "because",
  "so",
  "while",
  "when",
  "where",
  "why",
  "how",
  "from",
  "about",
  "into",
  "through",
  "during",
  "between",
  "before",
  "after",
  "above",
  "below",
]);

/**
 * Result interfaces
 */
export interface LengthCheckResult {
  status: ValidationStatus;
  message: string;
  length: number;
  optimalRange: string;
  min: number;
  max: number;
}

export interface StackingIssue {
  word: string;
  count: number;
  density: number;
  reason: "repeat" | "density";
}

export interface StackingCheckResult {
  status: ValidationStatus;
  issues: StackingIssue[];
  message: string;
}

export interface ConsistencyCheckResult {
  status: ValidationStatus;
  coverage: number;
  matchedWords: string[];
  missingWords: string[];
  message: string;
}

export interface ValidationResult {
  titleLength: LengthCheckResult;
  descriptionLength: LengthCheckResult;
  keywordStacking: StackingCheckResult;
  contentConsistency: ConsistencyCheckResult;
}

/**
 * Utility: Count characters/words based on language
 */
export function countChars(text: string, language: Language): number {
  if (language === "zh") {
    // For Chinese, count only Chinese characters (汉字)
    const chineseChars = text.match(/[\u4e00-\u9fff]/g);
    return chineseChars ? chineseChars.length : 0;
  }
  // For English, count all characters
  return text.length;
}

/**
 * Utility: Get stopwords for a language
 */
function getStopwords(language: Language): Set<string> {
  return language === "zh" ? STOPWORDS_ZH : STOPWORDS_EN;
}

/**
 * Tokenize text into words
 */
function tokenize(text: string, language: Language): string[] {
  if (language === "zh") {
    // For Chinese: extract both Chinese characters and English words
    // In production, use a proper segmenter like jieba
    const tokens: string[] = [];

    // Extract Chinese characters
    const chineseChars = text.match(/[\u4e00-\u9fff]/g) || [];
    tokens.push(...chineseChars);

    // Extract English words (useful for mixed content)
    const englishWords = text.match(/[a-zA-Z]+/g) || [];
    tokens.push(...englishWords.map((w) => w.toLowerCase()));

    return tokens;
  }
  // For English, split by word boundaries
  return text
    .toLowerCase()
    .split(/\s+/)
    .filter((word) => /^[a-z0-9]+$/.test(word));
}

/**
 * Check if two tokens should be considered the same word
 * (handles singular/plural and case variations)
 */
function normalizeToken(token: string, language: Language): string {
  const normalized = token.toLowerCase().trim();
  // Could add stemming logic here in the future
  return normalized;
}

/**
 * Validate title length
 */
export function validateTitleLength(
  title: string,
  language: Language,
): LengthCheckResult {
  const length = countChars(title, language);
  const config = TDK_CONFIG.title[language];

  if (length < config.min) {
    return {
      status: "fail",
      message: `标题过短（${length} ${language === "zh" ? "汉字" : "字符"}），建议 ${config.min}-${config.max} ${language === "zh" ? "汉字" : "字符"}`,
      length,
      optimalRange: `${config.optimalMin}-${config.optimalMax}`,
      min: config.min,
      max: config.max,
    };
  }

  if (length > config.max) {
    return {
      status: "fail",
      message: `标题过长（${length} ${language === "zh" ? "汉字" : "字符"}），将被截断，建议 ${config.min}-${config.max} ${language === "zh" ? "汉字" : "字符"}`,
      length,
      optimalRange: `${config.optimalMin}-${config.optimalMax}`,
      min: config.min,
      max: config.max,
    };
  }

  if (length >= config.optimalMin && length <= config.optimalMax) {
    return {
      status: "pass",
      message: `标题长度理想（${length} ${language === "zh" ? "汉字" : "字符"}）✓`,
      length,
      optimalRange: `${config.optimalMin}-${config.optimalMax}`,
      min: config.min,
      max: config.max,
    };
  }

  // Slightly long but acceptable
  return {
    status: "warn",
    message: `标题略长（${length} ${language === "zh" ? "汉字" : "字符"}），可能被截断，最优 ${config.optimalMin}-${config.optimalMax} ${language === "zh" ? "汉字" : "字符"}`,
    length,
    optimalRange: `${config.optimalMin}-${config.optimalMax}`,
    min: config.min,
    max: config.max,
  };
}

/**
 * Validate description length
 */
export function validateDescriptionLength(
  description: string,
  language: Language,
): LengthCheckResult {
  const length = countChars(description, language);
  const config = TDK_CONFIG.description[language];

  if (length < config.min) {
    return {
      status: "fail",
      message: `摘要过短（${length} ${language === "zh" ? "汉字" : "字符"}），建议 ${config.min}-${config.max} ${language === "zh" ? "汉字" : "字符"}`,
      length,
      optimalRange: `${config.optimalMin}-${config.optimalMax}`,
      min: config.min,
      max: config.max,
    };
  }

  if (length > config.max) {
    return {
      status: "fail",
      message: `摘要过长（${length} ${language === "zh" ? "汉字" : "字符"}），将被截断，建议 ${config.min}-${config.max} ${language === "zh" ? "汉字" : "字符"}`,
      length,
      optimalRange: `${config.optimalMin}-${config.optimalMax}`,
      min: config.min,
      max: config.max,
    };
  }

  if (length >= config.optimalMin && length <= config.optimalMax) {
    return {
      status: "pass",
      message: `摘要长度理想（${length} ${language === "zh" ? "汉字" : "字符"}）✓`,
      length,
      optimalRange: `${config.optimalMin}-${config.optimalMax}`,
      min: config.min,
      max: config.max,
    };
  }

  return {
    status: "warn",
    message: `摘要略长（${length} ${language === "zh" ? "汉字" : "字符"}），可能被截断，最优 ${config.optimalMin}-${config.optimalMax} ${language === "zh" ? "汉字" : "字符"}`,
    length,
    optimalRange: `${config.optimalMin}-${config.optimalMax}`,
    min: config.min,
    max: config.max,
  };
}

/**
 * Detect keyword stacking in text
 */
export function detectKeywordStacking(
  text: string,
  keywords: string[],
  language: Language,
): StackingCheckResult {
  const issues: StackingIssue[] = [];

  // Tokenize text
  const tokens = tokenize(text, language);
  const stopwords = getStopwords(language);

  // Filter out stopwords for stacking analysis
  const contentTokens = tokens.filter((t) => !stopwords.has(t));

  // Normalize keywords for comparison
  const normalizedKeywords = keywords.map((kw) => normalizeToken(kw, language));

  // Check each keyword
  for (const keyword of normalizedKeywords) {
    if (!keyword || keyword.length === 0) continue;

    // Count occurrences of the keyword in tokenized content
    const keywordTokens = tokenize(keyword, language);
    const keywordPattern = keywordTokens.join("");

    let count = 0;
    for (let i = 0; i < contentTokens.length; i++) {
      if (normalizeToken(contentTokens[i], language) === keyword) {
        count++;
      }
    }

    if (count === 0) continue;

    // Calculate density
    const density = contentTokens.length > 0 ? count / contentTokens.length : 0;

    // Check for repetition
    const repeatThreshold = TDK_CONFIG.stacking.repeatThreshold;
    if (count >= repeatThreshold) {
      issues.push({
        word: keyword,
        count,
        density,
        reason: "repeat",
      });
    }

    // Check for density
    if (density > TDK_CONFIG.stacking.densityFail) {
      issues.push({
        word: keyword,
        count,
        density,
        reason: "density",
      });
    }
  }

  // Determine status
  let status: ValidationStatus = "pass";
  let message = "无关键词堆砌 ✓";

  if (issues.length > 0) {
    const failIssues = issues.filter(
      (issue) =>
        issue.count >= TDK_CONFIG.stacking.repeatThreshold ||
        issue.density > TDK_CONFIG.stacking.densityFail,
    );

    if (failIssues.length > 0) {
      status = "fail";
      const failWords = failIssues.map(
        (i) =>
          `"${i.word}"（出现 ${i.count} 次，密度 ${(i.density * 100).toFixed(1)}%）`,
      );
      message = `检测到关键词堆砌: ${failWords.join("；")}`;
    } else {
      status = "warn";
      const warnWords = issues.map((i) => `"${i.word}"（出现 ${i.count} 次）`);
      message = `可能存在关键词堆砌: ${warnWords.join("；")}`;
    }
  }

  return {
    status,
    issues,
    message,
  };
}
/**
 * Static IDF dictionary for English (common high-frequency words → low IDF)
 * Source: Common English corpus analysis
 */
const IDF_EN: Record<string, number> = {
  // Most common: very low IDF (should not be keywords)
  the: 0.1,
  a: 0.15,
  an: 0.15,
  and: 0.2,
  or: 0.2,
  but: 0.25,
  in: 0.3,
  on: 0.3,
  at: 0.3,
  to: 0.35,
  for: 0.35,
  of: 0.35,
  with: 0.4,
  is: 0.4,
  are: 0.4,
  be: 0.4,
  by: 0.45,
  from: 0.45,
  as: 0.45,
  this: 0.5,
  that: 0.5,
  use: 0.6,
  get: 0.6,
  make: 0.65,
  way: 0.7,
  time: 0.7,
  have: 0.7,
  best: 0.75,
  help: 0.8,
  guide: 0.85,
  learn: 0.9,
  tutorial: 0.95,
  how: 0.8,
  what: 0.75,
  which: 0.7,
  where: 0.75,
  when: 0.75,
  why: 0.8,
  complete: 0.8,
  full: 0.75,
  all: 0.5,
  any: 0.5,
  some: 0.6,
  more: 0.6,
  most: 0.65,
  very: 0.6,
  too: 0.65,
  also: 0.5,
  just: 0.55,
  right: 0.6,
  new: 0.85,
  good: 0.85,
  great: 0.9,
};

/**
 * Static IDF dictionary for Chinese (common high-frequency words → low IDF)
 * Source: Common Chinese corpus analysis
 */
const IDF_ZH: Record<string, number> = {
  // Most common: very low IDF
  的: 0.1,
  一: 0.15,
  是: 0.2,
  在: 0.25,
  了: 0.15,
  和: 0.2,
  人: 0.4,
  这: 0.35,
  中: 0.35,
  大: 0.4,
  为: 0.35,
  上: 0.35,
  个: 0.25,
  国: 0.4,
  我: 0.3,
  以: 0.35,
  要: 0.4,
  他: 0.3,
  时: 0.45,
  来: 0.35,
  用: 0.5,
  们: 0.25,
  生: 0.5,
  到: 0.35,
  作: 0.45,
  地: 0.25,
  于: 0.3,
  出: 0.4,
  就: 0.35,
  分: 0.45,
  对: 0.35,
  成: 0.45,
  会: 0.4,
  可: 0.4,
  主: 0.5,
  发: 0.45,
  年: 0.45,
  动: 0.5,
  同: 0.45,
  工: 0.5,
  也: 0.35,
  经: 0.45,
  事: 0.5,
  后: 0.4,
  多: 0.4,
  行: 0.5,
  其: 0.35,
  然: 0.35,
  方: 0.45,
  我们: 0.5,
  你们: 0.5,
  他们: 0.5,
  它们: 0.5,
  别人: 0.55,
  自己: 0.6,
  方法: 0.75,
  如何: 0.7,
  使用: 0.7,
  介绍: 0.75,
  教程: 0.9,
  指南: 0.85,
  完整: 0.8,
  全面: 0.8,
  最好: 0.85,
  最佳: 0.9,
};

/**
 * Default IDF for unknown words (considered rare/important)
 */
const DEFAULT_IDF = 3.0;

/**
 * Calculate IDF value for a word
 */
function getIdf(word: string, language: Language): number {
  const lowerWord = word.toLowerCase();
  const idfDict = language === "en" ? IDF_EN : IDF_ZH;
  return idfDict[lowerWord] ?? DEFAULT_IDF;
}

/**
 * Extract core words from content snippet
 * Using TF-IDF scoring: score = tf(word) * idf(word)
 * Words with higher TF-IDF scores are more likely to be good keywords
 */
function extractCoreWords(
  contentSnippet: string,
  language: Language,
  topN: number = 5,
): string[] {
  const tokens = tokenize(contentSnippet, language);
  const stopwords = getStopwords(language);

  // Filter out stopwords and count frequency
  const wordFreq = new Map<string, number>();
  const totalTokens = tokens.length;

  for (const token of tokens) {
    if (stopwords.has(token) || token.length === 0) continue;
    const normalized = normalizeToken(token, language);
    wordFreq.set(normalized, (wordFreq.get(normalized) || 0) + 1);
  }

  // Calculate TF-IDF scores for each word
  const tfIdfScores: Array<[string, number]> = [];
  for (const [word, freq] of wordFreq.entries()) {
    const tf = freq / totalTokens; // Term Frequency
    const idf = getIdf(word, language); // Inverse Document Frequency
    const tfidfScore = tf * idf;
    tfIdfScores.push([word, tfidfScore]);
  }

  // Sort by TF-IDF score and return top N
  return tfIdfScores
    .sort((a, b) => b[1] - a[1])
    .slice(0, topN)
    .map((entry) => entry[0]);
}

/**
 * Check consistency between Title/Description and content
 */
export function checkContentConsistency(
  titleAndDescription: string,
  contentSnippet: string | undefined,
  language: Language,
): ConsistencyCheckResult {
  // If no content snippet provided, skip consistency check
  if (!contentSnippet || contentSnippet.trim().length === 0) {
    return {
      status: "info",
      coverage: 1.0,
      matchedWords: [],
      missingWords: [],
      message: "未提供页面内容摘要，跳过一致性检查",
    };
  }

  // Extract core words from content
  const coreWords = extractCoreWords(contentSnippet, language, 5);
  if (coreWords.length === 0) {
    return {
      status: "info",
      coverage: 1.0,
      matchedWords: [],
      missingWords: [],
      message: "无法从内容提取关键词，跳过检查",
    };
  }

  // Tokenize title and description
  const tdkTokens = tokenize(titleAndDescription, language);

  // Check which core words appear in title+description
  const matchedWords: string[] = [];
  const missingWords: string[] = [];

  for (const word of coreWords) {
    if (tdkTokens.some((token) => normalizeToken(token, language) === word)) {
      matchedWords.push(word);
    } else {
      missingWords.push(word);
    }
  }

  const coverage =
    coreWords.length > 0 ? matchedWords.length / coreWords.length : 0;

  let status: ValidationStatus = "pass";
  let message = "标题和摘要与内容一致 ✓";

  if (coverage < TDK_CONFIG.consistency.coverageWarn) {
    status = "warn";
    message = `一致性 ${(coverage * 100).toFixed(0)}% 较低。建议补充关键词："${missingWords.join("、")}"`;
  } else if (coverage < TDK_CONFIG.consistency.coveragePass) {
    status = "warn";
    message = `一致性 ${(coverage * 100).toFixed(0)}%。可考虑补充关键词："${missingWords.join("、")}"`;
  }

  return {
    status,
    coverage,
    matchedWords,
    missingWords,
    message,
  };
}

/**
 * Comprehensive validation for a TDK candidate
 */
export function validate(
  title: string,
  description: string,
  titleAndDescription: string,
  contentSnippet: string | undefined,
  language: Language,
): ValidationResult {
  // Extract keywords from title+description for stacking analysis
  const extractedKeywords = extractCoreWords(titleAndDescription, language, 3);

  return {
    titleLength: validateTitleLength(title, language),
    descriptionLength: validateDescriptionLength(description, language),
    keywordStacking: detectKeywordStacking(
      titleAndDescription,
      extractedKeywords,
      language,
    ),
    contentConsistency: checkContentConsistency(
      titleAndDescription,
      contentSnippet,
      language,
    ),
  };
}

/**
 * Validation helper: Check if all checks pass
 */
export function isValid(result: ValidationResult): boolean {
  return (
    result.titleLength.status === "pass" &&
    result.descriptionLength.status === "pass" &&
    result.keywordStacking.status !== "fail" &&
    result.contentConsistency.status !== "warn"
  );
}

/**
 * Validation helper: Get severity level (0 = pass, 1 = warn, 2 = fail)
 */
export function getSeverity(result: ValidationResult): number {
  const statusMap = { pass: 0, info: 0, warn: 1, fail: 2 };
  const severities = [
    statusMap[result.titleLength.status],
    statusMap[result.descriptionLength.status],
    statusMap[result.keywordStacking.status],
    statusMap[result.contentConsistency.status],
  ];
  return Math.max(...severities);
}
