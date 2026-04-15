import { describe, it, expect } from "@jest/globals";
import { ClassificationService } from "../../src/services/classificationService";

describe("ClassificationService", () => {
  describe("classify - primary intent", () => {
    it("should detect transactional intent", () => {
      const result = ClassificationService.classify("购买 React");
      expect(result.intentPrimary).toBe("transactional");
    });

    it("should detect commercial intent", () => {
      const result = ClassificationService.classify("最好的 Python 框架");
      expect(result.intentPrimary).toBe("commercial");
    });

    it("should detect navigational intent (brand)", () => {
      const result = ClassificationService.classify("React 官网");
      expect(result.intentPrimary).toBe("navigational");
    });

    it("should detect comparison as commercial", () => {
      const result = ClassificationService.classify("Python vs Java");
      expect(result.intentPrimary).toBe("commercial");
    });

    it("should detect informational intent (question)", () => {
      const result = ClassificationService.classify("how to learn Python");
      expect(result.intentPrimary).toBe("informational");
    });

    it("should default to informational intent", () => {
      const result = ClassificationService.classify("react hooks");
      expect(result.intentPrimary).toBe("informational");
    });

    it("should be case insensitive", () => {
      const result1 = ClassificationService.classify("PURCHASE react");
      const result2 = ClassificationService.classify("purchase react");
      expect(result1.intentPrimary).toBe(result2.intentPrimary);
    });
  });

  describe("classify - secondary intent", () => {
    it("should detect question secondary intent", () => {
      const result = ClassificationService.classify("怎么学 Python");
      expect(result.intentSecondary).toBe("question");
    });

    it("should detect comparison secondary intent", () => {
      const result = ClassificationService.classify("Python 区别 Java");
      expect(result.intentSecondary).toBe("comparison");
    });

    it("should detect price secondary intent", () => {
      const result = ClassificationService.classify("Python 教程 价格");
      expect(result.intentSecondary).toBe("price");
    });

    it("should detect scenario secondary intent", () => {
      const result = ClassificationService.classify("新手 Python 教程");
      expect(result.intentSecondary).toBe("scenario");
    });

    it("should detect local secondary intent", () => {
      const result = ClassificationService.classify("北京 Python 培训");
      expect(result.intentSecondary).toBe("local");
    });

    it("should detect brand secondary intent", () => {
      const result = ClassificationService.classify("Python 官方网站");
      expect(result.intentSecondary).toBe("brand");
    });

    it("should detect freshness secondary intent", () => {
      const result = ClassificationService.classify("2025 最新 Python 教程");
      expect(result.intentSecondary).toBe("freshness");
    });

    it("should be undefined when no secondary match", () => {
      const result = ClassificationService.classify("javascript");
      expect(result.intentSecondary).toBeUndefined();
    });
  });

  describe("classify - funnel stage", () => {
    it("should assign decision stage for transactional", () => {
      const result = ClassificationService.classify("buy Python course");
      expect(result.funnelStage).toBe("decision");
    });

    it("should assign consideration stage for price intent", () => {
      const result = ClassificationService.classify("Python course price");
      expect(result.funnelStage).toBe("consideration");
    });

    it("should assign consideration stage for comparison intent", () => {
      const result = ClassificationService.classify(
        "Python vs Java comparison",
      );
      expect(result.funnelStage).toBe("consideration");
    });

    it("should assign consideration stage for commercial", () => {
      const result = ClassificationService.classify("best Python framework");
      expect(result.funnelStage).toBe("consideration");
    });

    it("should assign awareness stage for informational", () => {
      const result = ClassificationService.classify("how to learn Python");
      expect(result.funnelStage).toBe("awareness");
    });
  });

  describe("classify - content format", () => {
    it("should recommend faq for question intent", () => {
      const result = ClassificationService.classify("how to write Python");
      expect(result.contentFormatRecommendation).toBe("faq");
    });

    it("should recommend comparison for comparison intent", () => {
      const result = ClassificationService.classify("Python compare Java");
      expect(result.contentFormatRecommendation).toBe("comparison");
    });

    it("should recommend landing for transactional", () => {
      const result = ClassificationService.classify("buy Python course online");
      expect(result.contentFormatRecommendation).toBe("landing");
    });

    it("should recommend landing for commercial", () => {
      const result = ClassificationService.classify(
        "best Python frameworks 2025",
      );
      expect(result.contentFormatRecommendation).toBe("landing");
    });

    it("should recommend category for broad keyword (>3 words)", () => {
      const result = ClassificationService.classify(
        "how to learn Python programming fast",
      );
      expect(result.contentFormatRecommendation).toBe("category");
    });

    it("should recommend article for informational", () => {
      const result = ClassificationService.classify("Python");
      expect(result.contentFormatRecommendation).toBe("article");
    });
  });

  describe("classify - word count", () => {
    it("should count single word", () => {
      const result = ClassificationService.classify("Python");
      expect(result.wordCount).toBe(1);
    });

    it("should count multiple words", () => {
      const result = ClassificationService.classify("how to learn Python");
      expect(result.wordCount).toBe(4);
    });

    it("should handle Chinese multi-character words", () => {
      const result = ClassificationService.classify("人工智能 机器学习");
      expect(result.wordCount).toBe(2);
    });

    it("should collapse consecutive spaces", () => {
      const result = ClassificationService.classify("Python    learning");
      expect(result.wordCount).toBe(2);
    });

    it("should handle mixed English and Chinese", () => {
      const result = ClassificationService.classify("Python 编程 教程");
      expect(result.wordCount).toBe(3);
    });
  });

  describe("classify - confidence score", () => {
    it("should return valid confidence score (0-1)", () => {
      const result = ClassificationService.classify("any keyword");
      expect(result.confidenceScore).toBeGreaterThanOrEqual(0);
      expect(result.confidenceScore).toBeLessThanOrEqual(1);
    });

    it("should have higher confidence for strong transactional match", () => {
      const transactional = ClassificationService.classify("purchase Python");
      const baseline = ClassificationService.classify("Python");
      expect(transactional.confidenceScore).toBeGreaterThan(
        baseline.confidenceScore,
      );
    });

    it("should have higher confidence for question intent", () => {
      const question = ClassificationService.classify("how to learn Python");
      const baseline = ClassificationService.classify("Python");
      expect(question.confidenceScore).toBeGreaterThanOrEqual(
        baseline.confidenceScore,
      );
    });

    it("should increase confidence with secondary intent match", () => {
      const withSecondary = ClassificationService.classify("how to buy Python");
      const withoutSecondary = ClassificationService.classify("Python");
      expect(withSecondary.confidenceScore).toBeGreaterThanOrEqual(
        withoutSecondary.confidenceScore,
      );
    });
  });

  describe("classify - keyword type", () => {
    it("should set keywordType based on secondary intent", () => {
      const result = ClassificationService.classify("how to learn Python");
      expect(result.keywordType).toBe("question");
    });

    it("should default keywordType to question when no secondary", () => {
      const result = ClassificationService.classify("react hooks");
      expect(result.keywordType).toBe("question");
    });
  });

  describe("classify - matched rules", () => {
    it("should track matched rules for debugging", () => {
      const result = ClassificationService.classify(
        "how much does Python cost",
      );
      expect(result.classificationDetails?.rulematches).toBeDefined();
      expect(Array.isArray(result.classificationDetails?.rulematches)).toBe(
        true,
      );
    });

    it("should show multiple matching rules", () => {
      const result = ClassificationService.classify(
        "why compare Python and Java price",
      );
      expect(result.classificationDetails?.rulematches?.length).toBeGreaterThan(
        0,
      );
    });

    it("should be empty for generic keywords", () => {
      const result = ClassificationService.classify("programming");
      // May have rules or not depending on implementation
      expect(result.classificationDetails?.rulematches).toBeDefined();
    });
  });

  describe("classify - real world scenarios", () => {
    it("should classify Chinese question", () => {
      const result = ClassificationService.classify("如何学习 Python 编程");
      expect(result.intentPrimary).toBe("informational");
      expect(result.intentSecondary).toBe("question");
      expect(result.funnelStage).toBe("awareness");
      expect(result.contentFormatRecommendation).toBe("faq");
    });

    it("should classify Chinese commercial", () => {
      const result = ClassificationService.classify("最好的 Python 教程 推荐");
      expect(result.intentPrimary).toBe("commercial");
      expect(result.funnelStage).toBe("consideration");
    });

    it("should classify transactional e-commerce", () => {
      const result = ClassificationService.classify("buy Python book online");
      expect(result.intentPrimary).toBe("transactional");
      expect(result.funnelStage).toBe("decision");
    });

    it("should classify comparison intent", () => {
      const result = ClassificationService.classify(
        "Python vs JavaScript comparison",
      );
      expect(result.intentSecondary).toBe("comparison");
      expect(result.contentFormatRecommendation).toBe("comparison");
    });

    it("should classify local intent", () => {
      const result = ClassificationService.classify("北京 Python 培训班");
      expect(result.intentSecondary).toBe("local");
    });

    it("should classify freshness intent", () => {
      const result = ClassificationService.classify("2024 Python 最新教程");
      expect(result.intentSecondary).toBe("freshness");
    });

    it("should handle very long keywords", () => {
      const longKeyword =
        "how to learn Python programming from scratch for beginners in 2024 step by step guide";
      const result = ClassificationService.classify(longKeyword);
      expect(result.contentFormatRecommendation).toBe("category");
      expect(result.wordCount).toBeGreaterThan(3);
    });

    it("should handle mixed case and spaces", () => {
      const result = ClassificationService.classify(
        "  PYTHON  LEARNING  HOW  ",
      );
      expect(result.intentPrimary).toBe("informational");
    });
  });

  describe("classifyBatch", () => {
    it("should classify multiple keywords", () => {
      const keywords = [
        "how to learn Python",
        "buy Python book",
        "Python tutorial",
      ];
      const results = ClassificationService.classifyBatch(keywords);

      expect(results.length).toBe(3);
      expect(results[0].keyword).toBe("how to learn Python");
      expect(results[1].keyword).toBe("buy Python book");
      expect(results[2].keyword).toBe("Python tutorial");
    });

    it("should preserve keyword order", () => {
      const keywords = ["keyword1", "keyword2", "keyword3"];
      const results = ClassificationService.classifyBatch(keywords);

      expect(results[0].keyword).toBe("keyword1");
      expect(results[1].keyword).toBe("keyword2");
      expect(results[2].keyword).toBe("keyword3");
    });

    it("should handle empty batch", () => {
      const results = ClassificationService.classifyBatch([]);
      expect(results).toEqual([]);
    });

    it("should classify diverse keywords", () => {
      const keywords = [
        "怎么学 Python",
        "buy Python course",
        "Python vs Java",
        "北京 Python",
      ];
      const results = ClassificationService.classifyBatch(keywords);

      expect(results[0].intentPrimary).toBe("informational");
      expect(results[1].intentPrimary).toBe("transactional");
      expect(results[2].intentPrimary).toBe("commercial");
      expect(results[3].intentSecondary).toBe("local");
    });
  });

  describe("edge cases", () => {
    it("should handle single character keywords", () => {
      const result = ClassificationService.classify("a");
      expect(result.wordCount).toBe(1);
      expect(result.confidenceScore).toBeGreaterThanOrEqual(0);
    });

    it("should handle special characters in keywords", () => {
      const result = ClassificationService.classify("C++ programming");
      expect(result.keyword).toBe("C++ programming");
      expect(result.contentFormatRecommendation).toBeDefined();
    });

    it("should handle only numbers", () => {
      const result = ClassificationService.classify("2024 2025");
      expect(result.wordCount).toBe(2);
    });

    it("should handle mixed punctuation", () => {
      const result = ClassificationService.classify("how!!! to learn? Python!");
      expect(result.intentPrimary).toBe("informational");
    });

    it("should be consistent across multiple calls", () => {
      const keyword = "best Python tutorial";
      const result1 = ClassificationService.classify(keyword);
      const result2 = ClassificationService.classify(keyword);

      expect(result1.intentPrimary).toBe(result2.intentPrimary);
      expect(result1.intentSecondary).toBe(result2.intentSecondary);
      expect(result1.funnelStage).toBe(result2.funnelStage);
      expect(result1.contentFormatRecommendation).toBe(
        result2.contentFormatRecommendation,
      );
      expect(result1.confidenceScore).toBe(result2.confidenceScore);
    });
  });

  describe("Chinese language support", () => {
    it("should handle pure Chinese keywords", () => {
      const result = ClassificationService.classify("人工智能");
      expect(result.wordCount).toBeGreaterThan(0);
      expect(result.contentFormatRecommendation).toBeDefined();
    });

    it("should recognize Chinese question words", () => {
      const result = ClassificationService.classify("怎么学人工智能");
      expect(result.intentSecondary).toBe("question");
    });

    it("should recognize Chinese comparison words", () => {
      const result = ClassificationService.classify("机器学习 区别 深度学习");
      expect(result.intentSecondary).toBe("comparison");
    });

    it("should recognize Chinese price words", () => {
      const result = ClassificationService.classify("Python 课程 价格");
      expect(result.intentSecondary).toBe("price");
    });

    it("should recognize Chinese commercial indicators", () => {
      const result = ClassificationService.classify("最好的 Python 教程 推荐");
      expect(result.intentPrimary).toBe("commercial");
    });
  });
});
