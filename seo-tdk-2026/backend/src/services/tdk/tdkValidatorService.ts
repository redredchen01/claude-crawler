/**
 * TDK Validator Service
 *
 * Applies validation rules to TDK candidates using the rules defined in tdkRules.
 */

import {
  detectKeywordStacking,
  validateTitleLength,
  validateDescriptionLength,
  checkContentConsistency,
  type ValidationResult,
  type Language,
} from "./tdkRules";
import type { TdkCandidate } from "./tdkGeneratorService";

/**
 * Complete validation result for a TDK candidate with all details
 */
export interface TdkValidationReport {
  isValid: boolean;
  severity: "pass" | "warn" | "fail"; // pass, warn, fail
  validations: ValidationResult;
  summary: string;
  issues: ValidationIssue[];
}

/**
 * A specific validation issue
 */
export interface ValidationIssue {
  field: "title" | "description" | "keywords" | "consistency";
  severity: "info" | "warn" | "fail";
  message: string;
  suggestion?: string;
}

/**
 * TDK Validator Service
 *
 * Validates TDK candidates against rules and generates detailed reports.
 */
export class TdkValidatorService {
  /**
   * Validate a single TDK candidate
   */
  validate(
    candidate: TdkCandidate,
    contentSnippet: string | undefined,
    language: Language = "en",
  ): TdkValidationReport {
    // Run all validation checks
    const titleCheck = validateTitleLength(candidate.title, language);
    const descCheck = validateDescriptionLength(
      candidate.description,
      language,
    );

    // Combine title and description for stacking/consistency analysis
    const combinedText = `${candidate.title}. ${candidate.description}`;

    const stackingCheck = detectKeywordStacking(
      combinedText,
      candidate.keywords,
      language,
    );
    const consistencyCheck = checkContentConsistency(
      combinedText,
      contentSnippet,
      language,
    );

    const validations: ValidationResult = {
      titleLength: titleCheck,
      descriptionLength: descCheck,
      keywordStacking: stackingCheck,
      contentConsistency: consistencyCheck,
    };

    // Determine overall validity
    const isValid =
      titleCheck.status === "pass" &&
      descCheck.status === "pass" &&
      stackingCheck.status !== "fail" &&
      consistencyCheck.status !== "warn";

    // Determine severity
    const severityMap = { pass: 0, info: 0, warn: 1, fail: 2 };
    const severities = [
      severityMap[titleCheck.status],
      severityMap[descCheck.status],
      severityMap[stackingCheck.status],
      severityMap[consistencyCheck.status],
    ];
    const maxSeverity = Math.max(...severities);
    const severity: "pass" | "warn" | "fail" =
      maxSeverity === 2 ? "fail" : maxSeverity === 1 ? "warn" : "pass";

    // Collect issues
    const issues: ValidationIssue[] = [];

    if (titleCheck.status !== "pass") {
      issues.push({
        field: "title",
        severity: titleCheck.status === "fail" ? "fail" : "warn",
        message: titleCheck.message,
        suggestion: this.suggestTitleFix(candidate.title, language),
      });
    }

    if (descCheck.status !== "pass") {
      issues.push({
        field: "description",
        severity: descCheck.status === "fail" ? "fail" : "warn",
        message: descCheck.message,
        suggestion: this.suggestDescriptionFix(candidate.description, language),
      });
    }

    if (stackingCheck.status === "fail") {
      issues.push({
        field: "keywords",
        severity: "fail",
        message: stackingCheck.message,
        suggestion: "请修改重复关键词或调整关键词密度",
      });
    } else if (stackingCheck.status === "warn") {
      issues.push({
        field: "keywords",
        severity: "warn",
        message: stackingCheck.message,
        suggestion: "可考虑优化关键词分布",
      });
    }

    if (consistencyCheck.status === "warn") {
      issues.push({
        field: "consistency",
        severity: "warn",
        message: consistencyCheck.message,
        suggestion: `建议补充内容核心词："${consistencyCheck.missingWords.join("、")}"`,
      });
    }

    // Generate summary
    const summary = this.generateSummary(severity, issues);

    return {
      isValid,
      severity,
      validations,
      summary,
      issues,
    };
  }

  /**
   * Validate multiple TDK candidates
   */
  validateBatch(
    candidates: TdkCandidate[],
    contentSnippet: string | undefined,
    language: Language = "en",
  ): TdkValidationReport[] {
    return candidates.map((candidate) =>
      this.validate(candidate, contentSnippet, language),
    );
  }

  /**
   * Generate a suggestion for fixing title length
   */
  private suggestTitleFix(title: string, language: Language): string {
    const isEnglish = language === "en";
    const currentLength = isEnglish
      ? title.length
      : title.match(/[\u4e00-\u9fff]/g)?.length || 0;

    if (currentLength < (isEnglish ? 30 : 15)) {
      return `标题过短，请补充内容至 ${isEnglish ? "30-60" : "15-30"} 个${isEnglish ? "字符" : "汉字"}`;
    }

    if (currentLength > (isEnglish ? 70 : 40)) {
      return `标题过长，请删除不必要的词汇至 ${isEnglish ? "50-60" : "25-30"} 个${isEnglish ? "字符" : "汉字"}`;
    }

    return `调整到最优范围 ${isEnglish ? "50-60" : "25-30"} 个${isEnglish ? "字符" : "汉字"}`;
  }

  /**
   * Generate a suggestion for fixing description length
   */
  private suggestDescriptionFix(
    description: string,
    language: Language,
  ): string {
    const isEnglish = language === "en";
    const currentLength = isEnglish
      ? description.length
      : description.match(/[\u4e00-\u9fff]/g)?.length || 0;

    if (currentLength < (isEnglish ? 100 : 50)) {
      return `摘要过短，请补充内容至 ${isEnglish ? "100-160" : "50-80"} 个${isEnglish ? "字符" : "汉字"}`;
    }

    if (currentLength > (isEnglish ? 200 : 100)) {
      return `摘要过长，请精简至 ${isEnglish ? "150-160" : "75-80"} 个${isEnglish ? "字符" : "汉字"}`;
    }

    return `调整到最优范围 ${isEnglish ? "150-160" : "75-80"} 个${isEnglish ? "字符" : "汉字"}`;
  }

  /**
   * Generate a summary message
   */
  private generateSummary(
    severity: "pass" | "warn" | "fail",
    issues: ValidationIssue[],
  ): string {
    if (severity === "fail") {
      const failCount = issues.filter((i) => i.severity === "fail").length;
      return `❌ 验证失败：${failCount} 个重大问题需要修复`;
    }

    if (severity === "warn") {
      const warnCount = issues.filter((i) => i.severity === "warn").length;
      return `⚠️ 验证警告：${warnCount} 个项目需要注意`;
    }

    return "✅ 验证通过：此 TDK 候选符合所有规范";
  }

  /**
   * Get the best candidate from a list (by fewest issues)
   */
  getBestCandidate(
    candidates: TdkCandidate[],
    contentSnippet: string | undefined,
    language: Language = "en",
  ): { candidate: TdkCandidate; report: TdkValidationReport } {
    const reports = this.validateBatch(candidates, contentSnippet, language);

    let best = { candidate: candidates[0], report: reports[0] };

    for (let i = 1; i < reports.length; i++) {
      const current = { candidate: candidates[i], report: reports[i] };

      // Compare by severity first
      const severityOrder = { pass: 0, warn: 1, fail: 2 };
      if (
        severityOrder[current.report.severity] <
        severityOrder[best.report.severity]
      ) {
        best = current;
      } else if (
        severityOrder[current.report.severity] ===
        severityOrder[best.report.severity]
      ) {
        // Same severity, compare by issue count
        if (current.report.issues.length < best.report.issues.length) {
          best = current;
        }
      }
    }

    return best;
  }
}

/**
 * Create a singleton instance
 */
let serviceInstance: TdkValidatorService | null = null;

export function getTdkValidatorService(): TdkValidatorService {
  if (!serviceInstance) {
    serviceInstance = new TdkValidatorService();
  }
  return serviceInstance;
}
