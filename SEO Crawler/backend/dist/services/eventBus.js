/**
 * EventBus - 事件发射系统
 *
 * 标准 Node.js EventEmitter 模式
 * 支持事件：
 * - job:created
 * - job:started
 * - job:progress
 * - job:completed
 * - job:failed
 */

class EventBus {
  constructor() {
    this.listeners = new Map();
  }

  /**
   * 订阅事件
   * @param {string} event - 事件名称
   * @param {function} callback - 回调函数
   */
  on(event, callback) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    this.listeners.get(event).push(callback);
    return this; // 支持链式调用
  }

  /**
   * 一次性订阅事件
   * @param {string} event - 事件名称
   * @param {function} callback - 回调函数
   */
  once(event, callback) {
    const onceWrapper = (...args) => {
      callback(...args);
      this.off(event, onceWrapper);
    };
    return this.on(event, onceWrapper);
  }

  /**
   * 取消订阅事件
   * @param {string} event - 事件名称
   * @param {function} callback - 回调函数
   */
  off(event, callback) {
    if (!this.listeners.has(event)) return this;

    const callbacks = this.listeners.get(event);
    const index = callbacks.indexOf(callback);
    if (index > -1) {
      callbacks.splice(index, 1);
    }

    if (callbacks.length === 0) {
      this.listeners.delete(event);
    }
    return this;
  }

  /**
   * 触发事件
   * @param {string} event - 事件名称
   * @param {*} data - 事件数据
   */
  emit(event, data) {
    if (!this.listeners.has(event)) {
      return this; // 返回 this 支持链式调用
    }

    const callbacks = this.listeners.get(event);
    for (const callback of callbacks) {
      try {
        callback(data);
      } catch (err) {
        console.error(`[EventBus] Error in listener for '${event}':`, err);
      }
    }

    return this; // 返回 this 支持链式调用
  }

  /**
   * 获取事件监听器数量
   * @param {string} event - 事件名称
   */
  listenerCount(event) {
    if (!this.listeners.has(event)) return 0;
    return this.listeners.get(event).length;
  }

  /**
   * 获取所有事件名称
   */
  eventNames() {
    return Array.from(this.listeners.keys());
  }

  /**
   * 移除所有监听器
   * @param {string} event - 事件名称（可选，不指定则清空所有）
   */
  removeAllListeners(event) {
    if (event) {
      this.listeners.delete(event);
    } else {
      this.listeners.clear();
    }
    return this;
  }
}

// 导出单例
export default new EventBus();
//# sourceMappingURL=eventBus.js.map
