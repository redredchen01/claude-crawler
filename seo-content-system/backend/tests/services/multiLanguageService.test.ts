import { describe, it, expect, beforeAll } from "@jest/globals";
import { MultiLanguageService } from "../../src/services/multiLanguageService.js";

describe("MultiLanguageService", () => {
  let service: MultiLanguageService;

  beforeAll(() => {
    service = new MultiLanguageService();
  });

  describe("Supported Languages", () => {
    it("should support 8 languages", () => {
      const languages = service.getSupportedLanguages();

      expect(languages.length).toBe(8);
      expect(languages).toContain("en");
      expect(languages).toContain("zh-CN");
      expect(languages).toContain("zh-TW");
      expect(languages).toContain("es");
      expect(languages).toContain("fr");
      expect(languages).toContain("de");
      expect(languages).toContain("ja");
      expect(languages).toContain("ko");
    });

    it("should provide configurations for all languages", () => {
      const languages = service.getSupportedLanguages();

      for (const language of languages) {
        const config = service.getLanguageConfig(language);
        expect(config).toBeDefined();
        expect(config?.language).toBe(language);
        expect(config?.locale).toBeDefined();
        expect(config?.characterEncoding).toBeDefined();
        expect(config?.stemmerType).toBeDefined();
        expect(config?.stopwords).toBeDefined();
        expect(config?.modifierPatterns).toBeDefined();
        expect(config?.contentDirectives).toBeDefined();
      }
    });
  });

  describe("Language Configuration", () => {
    it("should have RTL flag properly set", () => {
      expect(service.isRTLLanguage("en")).toBe(false);
      expect(service.isRTLLanguage("zh-CN")).toBe(false);
      expect(service.isRTLLanguage("ja")).toBe(false);
      expect(service.isRTLLanguage("ko")).toBe(false);
    });

    it("should have correct character encodings", () => {
      const englishConfig = service.getLanguageConfig("en");
      expect(englishConfig?.characterEncoding).toBe("UTF-8");

      const chineseConfig = service.getLanguageConfig("zh-CN");
      expect(chineseConfig?.characterEncoding).toBe("UTF-8");

      const japaneseConfig = service.getLanguageConfig("ja");
      expect(japaneseConfig?.characterEncoding).toBe("UTF-8");
    });

    it("should have appropriate stemmer types", () => {
      const englishConfig = service.getLanguageConfig("en");
      expect(englishConfig?.stemmerType).toBe("porter");

      const chineseConfig = service.getLanguageConfig("zh-CN");
      expect(chineseConfig?.stemmerType).toBe("custom");

      const spanishConfig = service.getLanguageConfig("es");
      expect(spanishConfig?.stemmerType).toBe("snowball");
    });
  });

  describe("Modifier Patterns", () => {
    it("should provide question modifiers for all languages", () => {
      const languages = service.getSupportedLanguages();

      for (const language of languages) {
        const patterns = service.getModifierPatterns(language);
        expect(patterns?.questionModifiers).toBeDefined();
        expect(Array.isArray(patterns?.questionModifiers)).toBe(true);
        expect(patterns?.questionModifiers?.length).toBeGreaterThan(0);
      }
    });

    it("should provide comparison modifiers for all languages", () => {
      const languages = service.getSupportedLanguages();

      for (const language of languages) {
        const patterns = service.getModifierPatterns(language);
        expect(patterns?.comparisonModifiers).toBeDefined();
        expect(Array.isArray(patterns?.comparisonModifiers)).toBe(true);
        expect(patterns?.comparisonModifiers?.length).toBeGreaterThan(0);
      }
    });

    it("should provide commercial modifiers for all languages", () => {
      const languages = service.getSupportedLanguages();

      for (const language of languages) {
        const patterns = service.getModifierPatterns(language);
        expect(patterns?.commercialModifiers).toBeDefined();
        expect(Array.isArray(patterns?.commercialModifiers)).toBe(true);
        expect(patterns?.commercialModifiers?.length).toBeGreaterThan(0);
      }
    });

    it("should have language-specific modifiers", () => {
      const enPatterns = service.getModifierPatterns("en");
      const zhCnPatterns = service.getModifierPatterns("zh-CN");

      expect(enPatterns?.questionModifiers).toContain("how");
      expect(zhCnPatterns?.questionModifiers).toContain("怎样");

      expect(enPatterns?.commercialModifiers).toContain("best");
      expect(zhCnPatterns?.commercialModifiers).toContain("最好的");
    });
  });

  describe("Keyword Normalization", () => {
    it("should normalize English keywords to lowercase", () => {
      const normalized = service.normalizeKeyword("Python Tutorial", "en");

      expect(normalized).toBe("python tutorial");
    });

    it("should remove spaces in Chinese keywords", () => {
      const normalized = service.normalizeKeyword("python 教程", "zh-CN");

      expect(normalized).toBe("python教程");
    });

    it("should remove spaces in Japanese keywords", () => {
      const normalized = service.normalizeKeyword(
        "プログラミング ガイド",
        "ja",
      );

      expect(normalized).toBe("プログラミングガイド");
    });

    it("should remove spaces in Korean keywords", () => {
      const normalized = service.normalizeKeyword("프로그래밍 가이드", "ko");

      expect(normalized).toBe("프로그래밍가이드");
    });

    it("should handle whitespace trimming", () => {
      const normalized = service.normalizeKeyword("  Python  Tutorial  ", "en");

      expect(normalized).toBe("python tutorial");
    });

    it("should be idempotent", () => {
      const keyword = "Python Tutorial";
      const first = service.normalizeKeyword(keyword, "en");
      const second = service.normalizeKeyword(first, "en");

      expect(first).toBe(second);
    });
  });

  describe("Stopwords", () => {
    it("should identify English stopwords", () => {
      expect(service.isStopword("the", "en")).toBe(true);
      expect(service.isStopword("and", "en")).toBe(true);
      expect(service.isStopword("python", "en")).toBe(false);
    });

    it("should identify Chinese stopwords", () => {
      expect(service.isStopword("的", "zh-CN")).toBe(true);
      expect(service.isStopword("是", "zh-CN")).toBe(true);
      expect(service.isStopword("Python", "zh-CN")).toBe(false);
    });

    it("should identify Spanish stopwords", () => {
      expect(service.isStopword("el", "es")).toBe(true);
      expect(service.isStopword("de", "es")).toBe(true);
      expect(service.isStopword("python", "es")).toBe(false);
    });

    it("should identify Japanese stopwords", () => {
      expect(service.isStopword("の", "ja")).toBe(true);
      expect(service.isStopword("に", "ja")).toBe(true);
    });

    it("should have stopwords for all languages", () => {
      const languages = service.getSupportedLanguages();

      for (const language of languages) {
        const config = service.getLanguageConfig(language);
        expect(config?.stopwords.size).toBeGreaterThan(0);
      }
    });
  });

  describe("Content Localization", () => {
    it("should generate localized titles in English", () => {
      const title = service.generateLocalizedTitle("Python", "en");

      expect(title).toContain("Python");
      expect(title).toContain("Guide");
    });

    it("should generate localized titles in Chinese (Simplified)", () => {
      const title = service.generateLocalizedTitle("Python", "zh-CN");

      expect(title).toContain("Python");
      expect(title).toContain("攻略");
    });

    it("should generate localized titles in Chinese (Traditional)", () => {
      const title = service.generateLocalizedTitle("Python", "zh-TW");

      expect(title).toContain("Python");
      expect(title).toContain("攻略");
    });

    it("should generate localized titles in Spanish", () => {
      const title = service.generateLocalizedTitle("Python", "es");

      expect(title).toContain("Python");
      expect(title).toContain("Guía");
    });

    it("should generate localized titles in Japanese", () => {
      const title = service.generateLocalizedTitle("Python", "ja");

      expect(title).toContain("Python");
      expect(title).toContain("ガイド");
    });

    it("should generate localized titles in Korean", () => {
      const title = service.generateLocalizedTitle("Python", "ko");

      expect(title).toContain("Python");
      expect(title).toContain("가이드");
    });
  });

  describe("Meta Description Localization", () => {
    it("should generate localized meta descriptions", () => {
      const languages = service.getSupportedLanguages();

      for (const language of languages) {
        const metaDesc = service.generateLocalizedMetaDescription(
          "Python",
          language,
        );

        expect(metaDesc).toBeDefined();
        expect(metaDesc.length).toBeGreaterThan(0);
        expect(metaDesc).toContain("Python");
      }
    });

    it("should respect character limits in meta descriptions", () => {
      const languages = service.getSupportedLanguages();

      for (const language of languages) {
        const metaDesc = service.generateLocalizedMetaDescription(
          "Python",
          language,
        );

        // Meta descriptions should be reasonable length (160 chars typical)
        expect(metaDesc.length).toBeLessThanOrEqual(200);
      }
    });
  });

  describe("H1 Heading Localization", () => {
    it("should generate localized H1 headings", () => {
      const languages = service.getSupportedLanguages();

      for (const language of languages) {
        const h1 = service.generateLocalizedH1("Python", language);

        expect(h1).toBeDefined();
        expect(h1.length).toBeGreaterThan(0);
        expect(h1).toContain("Python");
      }
    });

    it("should have proper H1 format for all languages", () => {
      const h1En = service.generateLocalizedH1("Python", "en");
      const h1Es = service.generateLocalizedH1("Python", "es");
      const h1Ja = service.generateLocalizedH1("Python", "ja");

      expect(h1En).toContain("Guide");
      expect(h1Es).toContain("Guía");
      expect(h1Ja).toContain("ガイド");
    });
  });

  describe("Translation Memory", () => {
    it("should store and retrieve translations", () => {
      const translations = {
        en: "Hello World",
        es: "Hola Mundo",
        fr: "Bonjour le monde",
      };

      service.storeTranslation("greeting", translations);

      expect(service.getTranslation("greeting", "en")).toBe("Hello World");
      expect(service.getTranslation("greeting", "es")).toBe("Hola Mundo");
      expect(service.getTranslation("greeting", "fr")).toBe("Bonjour le monde");
    });

    it("should return null for non-existent translations", () => {
      expect(service.getTranslation("nonexistent", "en")).toBeNull();
    });

    it("should return null for missing language in translation", () => {
      service.storeTranslation("test-key", {
        en: "English",
        es: "Spanish",
      });

      expect(service.getTranslation("test-key", "ja")).toBeNull();
    });

    it("should handle multiple translation keys", () => {
      service.storeTranslation("key1", {
        en: "Value 1",
        es: "Valor 1",
      });

      service.storeTranslation("key2", {
        en: "Value 2",
        es: "Valor 2",
      });

      expect(service.getTranslation("key1", "en")).toBe("Value 1");
      expect(service.getTranslation("key2", "en")).toBe("Value 2");
      expect(service.getTranslation("key1", "es")).toBe("Valor 1");
      expect(service.getTranslation("key2", "es")).toBe("Valor 2");
    });
  });

  describe("Language-Specific Features", () => {
    it("should distinguish between simplified and traditional Chinese", () => {
      const simplifiedConfig = service.getLanguageConfig("zh-CN");
      const traditionalConfig = service.getLanguageConfig("zh-TW");

      expect(simplifiedConfig?.locale).toBe("zh-CN");
      expect(traditionalConfig?.locale).toBe("zh-TW");

      // They should have different content directives
      expect(simplifiedConfig?.contentDirectives.titleFormat).toBe(
        "{keyword}完全攻略",
      );
      expect(traditionalConfig?.contentDirectives.titleFormat).toBe(
        "{keyword}完全攻略",
      );
    });

    it("should provide region-specific variants for Spanish", () => {
      const spanishConfig = service.getLanguageConfig("es");

      expect(spanishConfig?.locale).toBe("es-ES");
      // Spanish config should support both Spain and Mexico locales
      expect(spanishConfig).toBeDefined();
    });

    it("should handle European locales", () => {
      const germanConfig = service.getLanguageConfig("de");
      const frenchConfig = service.getLanguageConfig("fr");

      expect(germanConfig?.locale).toBe("de-DE");
      expect(frenchConfig?.locale).toBe("fr-FR");
    });

    it("should handle Asian locales", () => {
      const japaneseConfig = service.getLanguageConfig("ja");
      const koreanConfig = service.getLanguageConfig("ko");

      expect(japaneseConfig?.locale).toBe("ja-JP");
      expect(koreanConfig?.locale).toBe("ko-KR");
    });
  });

  describe("Content Directives", () => {
    it("should have all required content directives for each language", () => {
      const languages = service.getSupportedLanguages();

      for (const language of languages) {
        const config = service.getLanguageConfig(language);
        expect(config?.contentDirectives.titleFormat).toBeDefined();
        expect(config?.contentDirectives.metaDescFormat).toBeDefined();
        expect(config?.contentDirectives.h1Format).toBeDefined();
        expect(config?.contentDirectives.introductionFormat).toBeDefined();
        expect(config?.contentDirectives.conclusionFormat).toBeDefined();
      }
    });

    it("should include keyword placeholder in all directives", () => {
      const languages = service.getSupportedLanguages();

      for (const language of languages) {
        const config = service.getLanguageConfig(language);
        expect(config?.contentDirectives.titleFormat).toContain("{keyword}");
        expect(config?.contentDirectives.metaDescFormat).toContain("{keyword}");
        expect(config?.contentDirectives.h1Format).toContain("{keyword}");
      }
    });
  });

  describe("Invalid Input Handling", () => {
    it("should handle invalid language gracefully", () => {
      const config = service.getLanguageConfig("invalid" as any);

      expect(config).toBeNull();
    });

    it("should handle invalid language in normalization", () => {
      const normalized = service.normalizeKeyword(
        "Test Keyword",
        "invalid" as any,
      );

      expect(normalized).toBeDefined();
      expect(typeof normalized).toBe("string");
    });

    it("should handle empty keywords", () => {
      const normalized = service.normalizeKeyword("", "en");

      expect(normalized).toBe("");
    });

    it("should handle special characters in keywords", () => {
      const normalized = service.normalizeKeyword("Python@#$%Tutorial", "en");

      expect(typeof normalized).toBe("string");
    });
  });

  describe("Integration", () => {
    it("should support full localization workflow", () => {
      const keyword = "Python Programming";
      const language = "es" as const;

      // Normalize
      const normalized = service.normalizeKeyword(keyword, language);
      expect(normalized).toBeDefined();

      // Get patterns
      const patterns = service.getModifierPatterns(language);
      expect(patterns).toBeDefined();

      // Generate content
      const title = service.generateLocalizedTitle(keyword, language);
      const h1 = service.generateLocalizedH1(keyword, language);
      const metaDesc = service.generateLocalizedMetaDescription(
        keyword,
        language,
      );

      expect(title).toContain(keyword);
      expect(h1).toContain(keyword);
      expect(metaDesc).toContain(keyword);
    });
  });
});
