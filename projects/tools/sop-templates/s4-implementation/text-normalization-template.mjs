/**
 * Text Normalization Template
 * Pattern extracted from SOP #3: P1 幫助文本規範化
 *
 * 使用場景：
 * - CLI 幫助文本限制（80 字符上限）
 * - 描述文本格式標準化
 * - 命令行輸出換行處理
 */

/**
 * 檢查文本是否符合字符限制
 * @param {string} text - 待檢查文本
 * @param {number} maxChars - 最大字符數 (預設: 80)
 * @returns {object} { compliant, length, excess }
 */
export function checkTextCompliance(text, maxChars = 80) {
  const length = text.length;
  const excess = Math.max(0, length - maxChars);
  return {
    compliant: excess === 0,
    length,
    maxChars,
    excess
  };
}

/**
 * 標準化文本：移除多餘空白、格式統一
 * @param {string} text - 原始文本
 * @returns {string} 標準化後的文本
 */
export function normalizeText(text) {
  return text
    .trim()
    .replace(/\s+/g, ' ')        // 多個空白→單一空白
    .replace(/\s+([,.;:!?])/g, '$1') // 移除標點前的空白
    .replace(/([.!?])\s{2,}/g, '$1 '); // 句末空白正規化
}

/**
 * 縮短文本至指定長度（優雅斷句）
 * 優先在句子邊界或單詞邊界處斷句
 *
 * @param {string} text - 原始文本
 * @param {number} maxChars - 目標長度 (預設: 80)
 * @param {object} options - { breakAtWord: true, ellipsis: '...' }
 * @returns {string} 縮短後的文本
 */
export function truncateText(text, maxChars = 80, options = {}) {
  const { breakAtWord = true, ellipsis = '...' } = options;

  if (text.length <= maxChars) {
    return text;
  }

  let truncated = text.substring(0, maxChars - ellipsis.length);

  if (breakAtWord) {
    const lastSpace = truncated.lastIndexOf(' ');
    if (lastSpace > 0) {
      truncated = truncated.substring(0, lastSpace);
    }
  }

  return truncated + ellipsis;
}

/**
 * 分割文本為多行，每行不超過指定寬度
 * @param {string} text - 原始文本
 * @param {number} width - 每行最大字符數 (預設: 80)
 * @returns {string[]} 分割後的行陣列
 */
export function wrapText(text, width = 80) {
  const words = text.split(/\s+/);
  const lines = [];
  let currentLine = '';

  for (const word of words) {
    if (currentLine.length === 0) {
      currentLine = word;
    } else if ((currentLine + ' ' + word).length <= width) {
      currentLine += ' ' + word;
    } else {
      lines.push(currentLine);
      currentLine = word;
    }
  }

  if (currentLine.length > 0) {
    lines.push(currentLine);
  }

  return lines;
}

/**
 * 驗證並清理幫助文本
 * 返回檢查結果和建議修改
 *
 * @param {string} text - 原始幫助文本
 * @param {number} maxChars - 最大字符數 (預設: 80)
 * @returns {object} { original, normalized, compliant, suggestion }
 */
export function validateHelpText(text, maxChars = 80) {
  const normalized = normalizeText(text);
  const compliance = checkTextCompliance(normalized, maxChars);

  return {
    original: text,
    normalized,
    compliant: compliance.compliant,
    length: compliance.length,
    excess: compliance.excess,
    suggestion: compliance.compliant
      ? null
      : truncateText(normalized, maxChars)
  };
}

/**
 * 批次驗證多個文本項目
 * @param {object[]} items - 項目陣列 [{ id, text }, ...]
 * @param {number} maxChars - 最大字符數 (預設: 80)
 * @returns {object} { valid, invalid, stats }
 */
export function validateTextBatch(items, maxChars = 80) {
  const valid = [];
  const invalid = [];

  for (const item of items) {
    const result = validateHelpText(item.text, maxChars);
    if (result.compliant) {
      valid.push(item);
    } else {
      invalid.push({
        ...item,
        validation: result
      });
    }
  }

  return {
    valid,
    invalid,
    stats: {
      total: items.length,
      compliant: valid.length,
      nonCompliant: invalid.length,
      complianceRate: (valid.length / items.length * 100).toFixed(2) + '%'
    }
  };
}

/**
 * 生成修復建議清單
 * @param {object[]} invalidItems - 不符合的項目
 * @returns {object[]} 修復建議
 */
export function generateFixSuggestions(invalidItems) {
  return invalidItems.map(item => ({
    id: item.id,
    current: item.text,
    suggestion: item.validation.suggestion,
    excess: item.validation.excess,
    priority: item.validation.excess > 20 ? 'high' : 'medium'
  }));
}

// ============================================
// Example Usage (自訂此區塊)
// ============================================

const testItems = [
  {
    id: 'cmd-1',
    text: 'Send an email message with attachments to recipients'
  },
  {
    id: 'cmd-2',
    text: 'This is a very long help text that definitely exceeds the eighty character limit and should be truncated appropriately'
  },
  {
    id: 'cmd-3',
    text: 'Query Gmail inbox for unread messages'
  }
];

const results = validateTextBatch(testItems, 80);
console.log('Text Validation Results:', JSON.stringify(results, null, 2));

if (results.invalid.length > 0) {
  const fixes = generateFixSuggestions(results.invalid);
  console.log('\nFix Suggestions:', JSON.stringify(fixes, null, 2));
}
