/**
 * Deduplication Algorithm Template
 * Pattern extracted from SOP #2: P2 GA4 告警去重
 *
 * 使用場景：
 * - 同日同類型事件只通知一次
 * - 時間窗口內去重
 * - 狀態管理 + 自動清理過期記錄
 */

/**
 * 產生去重簽名（複合鍵）
 * @param {string} date - 日期 (YYYY-MM-DD)
 * @param {string} entityKey - 實體標識符
 * @param {string} type - 事件類型
 * @returns {string} 去重簽名格式: YYYY-MM-DD_entityKey_type
 */
export function dedupSignature(date, entityKey, type) {
  return `${date}_${entityKey}_${type}`;
}

/**
 * 檢查是否已通知過
 * @param {object} state - 狀態對象 { signature: boolean, ... }
 * @param {string} signature - 去重簽名
 * @returns {boolean} 若已通知過，返回 true
 */
export function hasBeenNotified(state, signature) {
  return state[signature] === true;
}

/**
 * 標記為已通知
 * @param {object} state - 狀態對象
 * @param {string} signature - 去重簽名
 */
export function markAsNotified(state, signature) {
  state[signature] = true;
}

/**
 * 清理過期的去重記錄
 * 保留指定天數內的紀錄，刪除更舊的
 *
 * @param {object} state - 狀態對象
 * @param {Date} today - 當前日期
 * @param {number} retentionDays - 保留天數 (預設: 7)
 */
export function cleanDedupHistory(state, today, retentionDays = 7) {
  const cutoffDate = new Date(today);
  cutoffDate.setDate(cutoffDate.getDate() - retentionDays);
  const cutoffStr = cutoffDate.toISOString().split('T')[0];

  Object.keys(state).forEach(key => {
    // 簽名格式: YYYY-MM-DD_entityKey_type
    const match = key.match(/^(\d{4}-\d{2}-\d{2})_/);
    if (match && match[1] < cutoffStr) {
      delete state[key];
    }
  });
}

/**
 * 批次檢查和標記
 * @param {object[]} events - 事件陣列 [{ date, entityKey, type, ... }]
 * @param {object} state - 狀態對象
 * @param {object} options - { retentionDays, today }
 * @returns {object} { toNotify, skipped, stats }
 */
export function checkAndMarkBatch(events, state, options = {}) {
  const { retentionDays = 7, today = new Date() } = options;

  // 清理過期記錄
  cleanDedupHistory(state, today, retentionDays);

  const toNotify = [];
  const skipped = [];

  for (const event of events) {
    const date = event.date || new Date(today).toISOString().split('T')[0];
    const sig = dedupSignature(date, event.entityKey, event.type);

    if (!hasBeenNotified(state, sig)) {
      toNotify.push(event);
      markAsNotified(state, sig);
    } else {
      skipped.push({
        ...event,
        reason: 'already_notified_today'
      });
    }
  }

  return {
    toNotify,
    skipped,
    stats: {
      total: events.length,
      toNotify: toNotify.length,
      skipped: skipped.length,
      dedupRate: (skipped.length / events.length * 100).toFixed(2) + '%'
    }
  };
}

/**
 * 取得狀態統計資訊
 * @param {object} state - 狀態對象
 * @returns {object} { totalRecords, oldestDate, newestDate }
 */
export function getStateStats(state) {
  const keys = Object.keys(state);
  if (keys.length === 0) {
    return {
      totalRecords: 0,
      oldestDate: null,
      newestDate: null
    };
  }

  const dates = keys
    .map(key => {
      const match = key.match(/^(\d{4}-\d{2}-\d{2})_/);
      return match ? match[1] : null;
    })
    .filter(Boolean)
    .sort();

  return {
    totalRecords: keys.length,
    oldestDate: dates[0],
    newestDate: dates[dates.length - 1]
  };
}

// ============================================
// Example Usage (自訂此區塊)
// ============================================

const testState = {};
const today = new Date('2026-03-30');

const events = [
  { date: '2026-03-30', entityKey: 'site-a', type: 'DROP', value: 15 },
  { date: '2026-03-30', entityKey: 'site-a', type: 'DROP', value: 18 }, // 重複
  { date: '2026-03-30', entityKey: 'site-b', type: 'SPIKE', value: 50 },
  { date: '2026-03-29', entityKey: 'site-a', type: 'DROP', value: 12 }  // 不同日期
];

const result = checkAndMarkBatch(events, testState, { today });
console.log('Dedup Results:', JSON.stringify(result, null, 2));
console.log('State Stats:', getStateStats(testState));
