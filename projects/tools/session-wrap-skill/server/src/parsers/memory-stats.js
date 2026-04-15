const fs = require('fs');
const path = require('path');
const { MEMORY_DIR } = require('../config');

let cache = null;
let cacheTime = 0;
const CACHE_TTL = 30000; // 30 seconds

const CATEGORIES = ['tasks', 'decisions', 'knowledge', 'checkpoints', 'agents', 'archive'];

async function getDirStats(dirPath) {
  try {
    const entries = await fs.promises.readdir(dirPath, { withFileTypes: true });
    let totalSize = 0;
    let fileCount = 0;

    for (const entry of entries) {
      if (entry.isFile()) {
        try {
          const stat = await fs.promises.stat(path.join(dirPath, entry.name));
          totalSize += stat.size;
          fileCount++;
        } catch { /* skip unreadable files */ }
      }
    }

    return { size_bytes: totalSize, file_count: fileCount };
  } catch {
    return { size_bytes: 0, file_count: 0 };
  }
}

async function readMemoryStats() {
  const now = Date.now();
  if (cache && (now - cacheTime) < CACHE_TTL) return cache;

  const stats = await Promise.all(
    CATEGORIES.map(async (category) => {
      const dirPath = path.join(MEMORY_DIR, category);
      const { size_bytes, file_count } = await getDirStats(dirPath);
      return { category, size_bytes, file_count };
    })
  );

  cache = stats;
  cacheTime = now;
  return stats;
}

module.exports = { readMemoryStats };
