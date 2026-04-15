/**
 * JSON Schema Validator Template
 * Pattern extracted from SOP #1: P2 task-results 規範化
 *
 * 使用場景：
 * - 結構化資料驗證（輸入/輸出）
 * - 資料清理與標準化
 * - API response validation
 */

import Ajv from 'ajv';
import addFormats from 'ajv-formats';

/**
 * 建立 schema validator
 * @param {object} schema - JSON Schema v7 definition
 * @returns {object} { validate, getErrors }
 */
export function createSchemaValidator(schema) {
  const ajv = new Ajv({ useDefaults: true, coerceTypes: true });
  addFormats(ajv);

  const validate = ajv.compile(schema);

  return {
    validate(data) {
      const valid = validate(data);
      if (!valid) {
        return {
          success: false,
          errors: validate.errors,
          data: null
        };
      }
      return {
        success: true,
        errors: null,
        data: data // data with defaults applied
      };
    },

    getErrors() {
      return validate.errors || [];
    },

    getSchema() {
      return schema;
    }
  };
}

/**
 * 驗證多筆資料並收集錯誤
 * @param {object[]} records - 待驗證記錄陣列
 * @param {object} validator - 來自 createSchemaValidator
 * @returns {object} { valid, invalid, summary }
 */
export function validateBatch(records, validator) {
  const valid = [];
  const invalid = [];

  for (const record of records) {
    const result = validator.validate(record);
    if (result.success) {
      valid.push(result.data);
    } else {
      invalid.push({
        record,
        errors: result.errors
      });
    }
  }

  return {
    valid,
    invalid,
    summary: {
      total: records.length,
      passed: valid.length,
      failed: invalid.length,
      passRate: (valid.length / records.length * 100).toFixed(2) + '%'
    }
  };
}

/**
 * 格式化驗證錯誤為可讀訊息
 * @param {object[]} errors - AJV errors array
 * @returns {string[]} 格式化錯誤訊息
 */
export function formatValidationErrors(errors) {
  return errors.map(err => {
    const path = err.instancePath || 'root';
    const keyword = err.keyword;
    const message = err.message;
    return `${path} ${keyword}: ${message}`;
  });
}

// ============================================
// Example Usage (自訂此區塊)
// ============================================

const exampleSchema = {
  $schema: 'http://json-schema.org/draft-07/schema#',
  type: 'object',
  required: ['id', 'name', 'value'],
  additionalProperties: false,
  properties: {
    id: {
      type: 'string',
      minLength: 1
    },
    name: {
      type: 'string',
      minLength: 1
    },
    value: {
      type: 'number',
      minimum: 0
    },
    timestamp: {
      type: 'string',
      format: 'date-time'
    }
  }
};

// 建立驗證器
const validator = createSchemaValidator(exampleSchema);

// 測試
const testData = [
  { id: 'rec-1', name: 'Record 1', value: 10 },
  { id: 'rec-2', name: 'Record 2', value: -5 }, // 將失敗驗證
  { id: '', name: 'Record 3', value: 20 }        // 將失敗驗證
];

const results = validateBatch(testData, validator);
console.log('Validation Results:', JSON.stringify(results, null, 2));
