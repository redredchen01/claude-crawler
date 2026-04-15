/**
 * Multi-Language Service
 * Provides internationalization support for keyword expansion, classification, and content generation
 * Phase 2.7: Enables SEO content system to operate across multiple languages and locales
 */

export type SupportedLanguage =
  | "en"
  | "zh-CN"
  | "zh-TW"
  | "es"
  | "fr"
  | "de"
  | "ja"
  | "ko";
export type Locale =
  | "en-US"
  | "en-GB"
  | "zh-CN"
  | "zh-TW"
  | "es-ES"
  | "es-MX"
  | "fr-FR"
  | "de-DE"
  | "ja-JP"
  | "ko-KR";

export interface LanguageConfig {
  language: SupportedLanguage;
  locale: Locale;
  rtl: boolean; // Right-to-left script
  characterEncoding: "UTF-8" | "UTF-16" | "EUC-JP" | "GB2312";
  stemmerType: "porter" | "snowball" | "custom" | "none"; // Language-specific stemming
  stopwords: Set<string>;
  modifierPatterns: ModifierPatterns;
  contentDirectives: ContentDirectives;
}

export interface ModifierPatterns {
  questionModifiers: string[]; // e.g., ["how", "what", "why"] for English, ["怎样", "什么", "为什么"] for Chinese
  comparisonModifiers: string[]; // e.g., ["vs", "comparison", "versus"]
  commercialModifiers: string[]; // e.g., ["best", "top", "buy", "price"]
  scenarioModifiers: string[]; // e.g., ["for beginners", "tutorial", "guide"]
  locationModifiers: string[]; // e.g., ["near me", "in", "local"]
}

export interface ContentDirectives {
  titleFormat: string; // e.g., "Complete Guide to {keyword}" or "{keyword}完全攻略"
  metaDescFormat: string; // e.g., "Learn about {keyword} with our comprehensive guide"
  h1Format: string;
  introductionFormat: string;
  conclusionFormat: string;
}

export interface MultiLanguageKeyword {
  language: SupportedLanguage;
  locale: Locale;
  originalKeyword: string;
  normalizedKeyword: string;
  transliteratedKeyword?: string; // For CJK languages to Latin script
  englishEquivalent?: string; // Optional English translation
  searchVolumeTierByLocale: Record<Locale, "low" | "medium" | "high">;
  regionalVariations: Record<Locale, string[]>; // "color" vs "colour"
}

export interface LocalizedContent {
  language: SupportedLanguage;
  locale: Locale;
  originalContent: string;
  localizedContent: string;
  culturalAdaptations: string[];
  translationNotes: string[];
}

export class MultiLanguageService {
  private languageConfigs: Map<SupportedLanguage, LanguageConfig>;
  private translationMemory: Map<string, Map<SupportedLanguage, string>>;

  constructor() {
    this.languageConfigs = new Map();
    this.translationMemory = new Map();
    this.initializeLanguageConfigs();
  }

  /**
   * Initialize language configurations
   */
  private initializeLanguageConfigs(): void {
    // English configuration
    this.languageConfigs.set("en", {
      language: "en",
      locale: "en-US",
      rtl: false,
      characterEncoding: "UTF-8",
      stemmerType: "porter",
      stopwords: this.getEnglishStopwords(),
      modifierPatterns: {
        questionModifiers: ["how", "what", "why", "when", "where", "which"],
        comparisonModifiers: [
          "vs",
          "versus",
          "comparison",
          "difference",
          "compared to",
        ],
        commercialModifiers: [
          "best",
          "top",
          "buy",
          "price",
          "cost",
          "cheap",
          "discount",
        ],
        scenarioModifiers: [
          "for beginners",
          "tutorial",
          "guide",
          "step by step",
          "for dummies",
        ],
        locationModifiers: ["near me", "local", "in", "close to"],
      },
      contentDirectives: {
        titleFormat: "Complete Guide to {keyword}",
        metaDescFormat:
          "Learn everything about {keyword}. Expert guide with tips, best practices, and comprehensive coverage.",
        h1Format: "{keyword}: Complete Guide",
        introductionFormat:
          "Welcome to our comprehensive guide about {keyword}. Whether you're a beginner or experienced, this resource covers everything you need to know.",
        conclusionFormat:
          "We hope this guide has provided valuable insights into {keyword}. Continue learning and exploring to master this topic.",
      },
    });

    // Simplified Chinese configuration
    this.languageConfigs.set("zh-CN", {
      language: "zh-CN",
      locale: "zh-CN",
      rtl: false,
      characterEncoding: "UTF-8",
      stemmerType: "custom",
      stopwords: this.getChineseStopwords(),
      modifierPatterns: {
        questionModifiers: [
          "怎样",
          "怎么",
          "如何",
          "什么",
          "为什么",
          "哪个",
          "谁",
        ],
        comparisonModifiers: ["对比", "比较", "区别", "vs", "versus", "哪个好"],
        commercialModifiers: [
          "最好的",
          "推荐",
          "购买",
          "价格",
          "便宜",
          "优惠",
          "折扣",
        ],
        scenarioModifiers: [
          "教程",
          "入门",
          "指南",
          "初学者",
          "新手",
          "步骤",
          "方法",
        ],
        locationModifiers: ["附近", "本地", "在", "靠近"],
      },
      contentDirectives: {
        titleFormat: "{keyword}完全攻略",
        metaDescFormat:
          "了解{keyword}的全面指南。包含专业建议、最佳实践和深入覆盖。",
        h1Format: "{keyword}：完整指南",
        introductionFormat:
          "欢迎查看我们关于{keyword}的全面指南。无论您是初学者还是有经验的用户，本资源涵盖了您需要了解的一切。",
        conclusionFormat:
          "希望本指南对您了解{keyword}有所帮助。继续学习和探索，掌握这个话题。",
      },
    });

    // Traditional Chinese configuration
    this.languageConfigs.set("zh-TW", {
      language: "zh-TW",
      locale: "zh-TW",
      rtl: false,
      characterEncoding: "UTF-8",
      stemmerType: "custom",
      stopwords: this.getChineseStopwords(),
      modifierPatterns: {
        questionModifiers: [
          "怎樣",
          "怎麼",
          "如何",
          "什麼",
          "為什麼",
          "哪個",
          "誰",
        ],
        comparisonModifiers: ["對比", "比較", "區別", "vs", "versus", "哪個好"],
        commercialModifiers: [
          "最好的",
          "推薦",
          "購買",
          "價格",
          "便宜",
          "優惠",
          "折扣",
        ],
        scenarioModifiers: [
          "教程",
          "入門",
          "指南",
          "初學者",
          "新手",
          "步驟",
          "方法",
        ],
        locationModifiers: ["附近", "本地", "在", "靠近"],
      },
      contentDirectives: {
        titleFormat: "{keyword}完全攻略",
        metaDescFormat:
          "瞭解{keyword}的全面指南。包含專業建議、最佳實踐和深入涵蓋。",
        h1Format: "{keyword}：完整指南",
        introductionFormat:
          "歡迎查看我們關於{keyword}的全面指南。無論您是初學者還是有經驗的使用者，本資源涵蓋了您需要瞭解的一切。",
        conclusionFormat:
          "希望本指南對您瞭解{keyword}有所幫助。繼續學習和探索，掌握這個話題。",
      },
    });

    // Spanish configuration
    this.languageConfigs.set("es", {
      language: "es",
      locale: "es-ES",
      rtl: false,
      characterEncoding: "UTF-8",
      stemmerType: "snowball",
      stopwords: this.getSpanishStopwords(),
      modifierPatterns: {
        questionModifiers: ["cómo", "qué", "por qué", "cuándo", "dónde"],
        comparisonModifiers: ["vs", "comparación", "diferencia", "versus"],
        commercialModifiers: [
          "mejor",
          "top",
          "comprar",
          "precio",
          "barato",
          "descuento",
        ],
        scenarioModifiers: [
          "tutorial",
          "guía",
          "para principiantes",
          "paso a paso",
        ],
        locationModifiers: ["cerca de mí", "local", "en", "cercano"],
      },
      contentDirectives: {
        titleFormat: "Guía Completa de {keyword}",
        metaDescFormat:
          "Aprende todo sobre {keyword}. Guía de expertos con consejos, mejores prácticas y cobertura completa.",
        h1Format: "{keyword}: Guía Completa",
        introductionFormat:
          "Bienvenido a nuestra guía completa sobre {keyword}. Tanto si eres principiante como experimentado, este recurso cubre todo lo que necesitas saber.",
        conclusionFormat:
          "Esperamos que esta guía te haya proporcionado información valiosa sobre {keyword}. Continúa aprendiendo para dominar este tema.",
      },
    });

    // French configuration
    this.languageConfigs.set("fr", {
      language: "fr",
      locale: "fr-FR",
      rtl: false,
      characterEncoding: "UTF-8",
      stemmerType: "snowball",
      stopwords: this.getFrenchStopwords(),
      modifierPatterns: {
        questionModifiers: ["comment", "quoi", "pourquoi", "quand", "où"],
        comparisonModifiers: ["vs", "comparaison", "différence", "versus"],
        commercialModifiers: [
          "meilleur",
          "top",
          "acheter",
          "prix",
          "bon marché",
          "réduction",
        ],
        scenarioModifiers: [
          "tutoriel",
          "guide",
          "pour les débutants",
          "étape par étape",
        ],
        locationModifiers: ["près de moi", "local", "en", "proche"],
      },
      contentDirectives: {
        titleFormat: "Guide Complet de {keyword}",
        metaDescFormat:
          "Apprenez tout sur {keyword}. Guide d'expert avec conseils, bonnes pratiques et couverture complète.",
        h1Format: "{keyword}: Guide Complet",
        introductionFormat:
          "Bienvenue dans notre guide complet sur {keyword}. Que vous soyez débutant ou expérimenté, cette ressource couvre tout ce que vous devez savoir.",
        conclusionFormat:
          "Nous espérons que ce guide vous a fourni des informations précieuses sur {keyword}. Continuez à apprendre pour maîtriser ce sujet.",
      },
    });

    // Japanese configuration
    this.languageConfigs.set("ja", {
      language: "ja",
      locale: "ja-JP",
      rtl: false,
      characterEncoding: "UTF-8",
      stemmerType: "custom",
      stopwords: this.getJapaneseStopwords(),
      modifierPatterns: {
        questionModifiers: ["どのように", "何", "なぜ", "いつ", "どこ"],
        comparisonModifiers: ["対比", "比較", "違い", "vs"],
        commercialModifiers: ["最高", "人気", "購入", "価格", "安い", "割引"],
        scenarioModifiers: [
          "チュートリアル",
          "ガイド",
          "初心者向け",
          "ステップバイステップ",
        ],
        locationModifiers: ["近く", "ローカル", "近所"],
      },
      contentDirectives: {
        titleFormat: "{keyword}完全ガイド",
        metaDescFormat:
          "{keyword}について学びましょう。エキスパートガイド、ヒント、ベストプラクティス、包括的なカバレッジ。",
        h1Format: "{keyword}：完全ガイド",
        introductionFormat:
          "{keyword}に関する包括的なガイドへようこそ。初心者から経験者まで、必要なすべてをカバーしています。",
        conclusionFormat:
          "このガイドが{keyword}についての貴重な情報を提供できたことを願っています。学習を続けてこのトピックをマスターしてください。",
      },
    });

    // Korean configuration
    this.languageConfigs.set("ko", {
      language: "ko",
      locale: "ko-KR",
      rtl: false,
      characterEncoding: "UTF-8",
      stemmerType: "custom",
      stopwords: this.getKoreanStopwords(),
      modifierPatterns: {
        questionModifiers: ["어떻게", "무엇", "왜", "언제", "어디"],
        comparisonModifiers: ["비교", "차이", "vs"],
        commercialModifiers: ["최고", "인기", "구매", "가격", "저렴", "할인"],
        scenarioModifiers: ["튜토리얼", "가이드", "초보자", "단계별"],
        locationModifiers: ["근처", "현지", "지역"],
      },
      contentDirectives: {
        titleFormat: "{keyword} 완벽 가이드",
        metaDescFormat:
          "{keyword}에 대해 알아보세요. 전문가 가이드, 팁, 모범 사례 및 포괄적 범위.",
        h1Format: "{keyword}: 완벽 가이드",
        introductionFormat:
          "{keyword}에 대한 포괄적인 가이드에 오신 것을 환영합니다. 초보자든 전문가든 필요한 모든 것을 다룹니다.",
        conclusionFormat:
          "이 가이드가 {keyword}에 대한 유용한 정보를 제공하기를 바랍니다. 계속 학습하여 이 주제를 마스터하세요.",
      },
    });

    // German configuration
    this.languageConfigs.set("de", {
      language: "de",
      locale: "de-DE",
      rtl: false,
      characterEncoding: "UTF-8",
      stemmerType: "snowball",
      stopwords: this.getGermanStopwords(),
      modifierPatterns: {
        questionModifiers: ["wie", "was", "warum", "wann", "wo"],
        comparisonModifiers: ["vs", "vergleich", "unterschied", "versus"],
        commercialModifiers: [
          "bester",
          "top",
          "kaufen",
          "preis",
          "günstig",
          "rabatt",
        ],
        scenarioModifiers: [
          "tutorial",
          "anleitung",
          "für anfänger",
          "schritt für schritt",
        ],
        locationModifiers: ["in meiner nähe", "lokal", "in", "nah"],
      },
      contentDirectives: {
        titleFormat: "Vollständiger Leitfaden zu {keyword}",
        metaDescFormat:
          "Erfahren Sie alles über {keyword}. Expertenleitfaden mit Tipps, Best Practices und umfassender Abdeckung.",
        h1Format: "{keyword}: Vollständiger Leitfaden",
        introductionFormat:
          "Willkommen zu unserem umfassenden Leitfaden zu {keyword}. Egal ob Anfänger oder erfahren, diese Ressource deckt alles ab, das Sie wissen müssen.",
        conclusionFormat:
          "Wir hoffen, dieser Leitfaden hat Ihnen wertvolle Informationen zu {keyword} gegeben. Lernen Sie weiter, um dieses Thema zu meistern.",
      },
    });
  }

  /**
   * Get language configuration
   */
  getLanguageConfig(language: SupportedLanguage): LanguageConfig | null {
    return this.languageConfigs.get(language) || null;
  }

  /**
   * Get all supported languages
   */
  getSupportedLanguages(): SupportedLanguage[] {
    return Array.from(this.languageConfigs.keys());
  }

  /**
   * Normalize keyword for given language
   */
  normalizeKeyword(keyword: string, language: SupportedLanguage): string {
    const config = this.getLanguageConfig(language);
    if (!config) {
      return keyword.trim().toLowerCase();
    }

    let normalized = keyword.trim();

    // Language-specific normalization
    if (language.startsWith("zh")) {
      // Chinese: remove spaces between characters
      normalized = normalized.replace(/\s+/g, "");
    } else if (language === "ja") {
      // Japanese: remove spaces
      normalized = normalized.replace(/\s+/g, "");
    } else if (language === "ko") {
      // Korean: remove spaces
      normalized = normalized.replace(/\s+/g, "");
    } else {
      // Latin-based: lowercase
      normalized = normalized.toLowerCase();
    }

    // Remove leading/trailing whitespace
    normalized = normalized.trim();

    return normalized;
  }

  /**
   * Check if keyword is in stopwords
   */
  isStopword(keyword: string, language: SupportedLanguage): boolean {
    const config = this.getLanguageConfig(language);
    if (!config) return false;

    const normalized = this.normalizeKeyword(keyword, language);
    return config.stopwords.has(normalized);
  }

  /**
   * Generate localized content title
   */
  generateLocalizedTitle(keyword: string, language: SupportedLanguage): string {
    const config = this.getLanguageConfig(language);
    if (!config) return keyword;

    return config.contentDirectives.titleFormat.replace("{keyword}", keyword);
  }

  /**
   * Generate localized meta description
   */
  generateLocalizedMetaDescription(
    keyword: string,
    language: SupportedLanguage,
  ): string {
    const config = this.getLanguageConfig(language);
    if (!config) return `Learn about ${keyword}`;

    return config.contentDirectives.metaDescFormat.replace(
      "{keyword}",
      keyword,
    );
  }

  /**
   * Generate localized H1 heading
   */
  generateLocalizedH1(keyword: string, language: SupportedLanguage): string {
    const config = this.getLanguageConfig(language);
    if (!config) return keyword;

    return config.contentDirectives.h1Format.replace("{keyword}", keyword);
  }

  /**
   * Get modifier patterns for language
   */
  getModifierPatterns(language: SupportedLanguage): ModifierPatterns | null {
    const config = this.getLanguageConfig(language);
    return config ? config.modifierPatterns : null;
  }

  /**
   * Store translation in memory
   */
  storeTranslation(
    sourceKey: string,
    translations: Record<SupportedLanguage, string>,
  ): void {
    const existing = this.translationMemory.get(sourceKey) || new Map();
    Object.entries(translations).forEach(([lang, text]) => {
      existing.set(lang as SupportedLanguage, text);
    });
    this.translationMemory.set(sourceKey, existing);
  }

  /**
   * Retrieve translation from memory
   */
  getTranslation(
    sourceKey: string,
    language: SupportedLanguage,
  ): string | null {
    const translations = this.translationMemory.get(sourceKey);
    return translations ? translations.get(language) || null : null;
  }

  /**
   * Check if language uses RTL script
   */
  isRTLLanguage(language: SupportedLanguage): boolean {
    const config = this.getLanguageConfig(language);
    return config ? config.rtl : false;
  }

  // Stopword datasets
  private getEnglishStopwords(): Set<string> {
    return new Set([
      "a",
      "an",
      "and",
      "are",
      "as",
      "at",
      "be",
      "by",
      "for",
      "from",
      "has",
      "he",
      "in",
      "is",
      "it",
      "its",
      "of",
      "on",
      "that",
      "the",
      "to",
      "was",
      "will",
      "with",
    ]);
  }

  private getChineseStopwords(): Set<string> {
    return new Set([
      "的",
      "一",
      "是",
      "在",
      "不",
      "了",
      "有",
      "和",
      "人",
      "这",
      "中",
      "大",
      "为",
      "上",
      "个",
      "国",
      "我",
      "以",
      "要",
      "他",
    ]);
  }

  private getSpanishStopwords(): Set<string> {
    return new Set([
      "el",
      "la",
      "de",
      "que",
      "y",
      "a",
      "en",
      "un",
      "ser",
      "se",
      "no",
      "haber",
      "por",
      "con",
      "su",
      "para",
      "es",
      "al",
      "lo",
      "como",
    ]);
  }

  private getFrenchStopwords(): Set<string> {
    return new Set([
      "le",
      "de",
      "un",
      "et",
      "à",
      "être",
      "en",
      "que",
      "ne",
      "sur",
      "se",
      "pas",
      "plus",
      "pouvoir",
      "par",
      "ce",
      "avec",
      "tout",
      "nous",
      "ou",
    ]);
  }

  private getJapaneseStopwords(): Set<string> {
    return new Set([
      "の",
      "に",
      "は",
      "を",
      "た",
      "が",
      "で",
      "て",
      "と",
      "し",
      "も",
      "や",
      "を",
      "つ",
      "へ",
      "か",
      "わ",
      "る",
      "さ",
      "な",
    ]);
  }

  private getKoreanStopwords(): Set<string> {
    return new Set([
      "이",
      "그",
      "저",
      "것",
      "수",
      "등",
      "들",
      "및",
      "있다",
      "하다",
      "되다",
      "같다",
      "있으면",
      "없다",
      "아니다",
      "보다",
      "맞다",
      "같이",
      "함께",
      "더",
    ]);
  }

  private getGermanStopwords(): Set<string> {
    return new Set([
      "der",
      "die",
      "und",
      "in",
      "den",
      "von",
      "zu",
      "das",
      "mit",
      "sich",
      "des",
      "auf",
      "für",
      "ist",
      "im",
      "dem",
      "nicht",
      "ein",
      "eine",
      "als",
    ]);
  }
}
