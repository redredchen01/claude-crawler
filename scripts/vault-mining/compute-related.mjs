#!/usr/bin/env node
/**
 * compute-related.mjs
 * 從 TF-IDF 索引計算每篇筆記的 related 建議（餘弦相似度）。
 *
 * Usage:
 *   node compute-related.mjs --index <file> --all --threshold 0.15 --output <file>
 *   node compute-related.mjs --index <file> --note <slug> --threshold 0.15 --top 5
 */

import { readFileSync, writeFileSync } from 'fs';

const args = process.argv.slice(2);
const get  = (flag) => { const i = args.indexOf(flag); return i !== -1 ? args[i + 1] : null; };
const has  = (flag) => args.includes(flag);

const INDEX_FILE = get('--index') || '/tmp/tfidf_index.json';
const OUTPUT     = get('--output') || '/tmp/related_suggestions.json';
const THRESHOLD  = parseFloat(get('--threshold') || '0.15');
const TOP        = parseInt(get('--top') || '5', 10);
const NOTE_SLUG  = get('--note');
const ALL        = has('--all') || !NOTE_SLUG;

// Load index
const { docs } = JSON.parse(readFileSync(INDEX_FILE, 'utf8'));
console.error(`Loaded ${docs.length} docs from index`);

// Cosine similarity (sparse vectors stored as {idx: val})
function cosineSim(a, b) {
  let dot = 0;
  for (const [i, v] of Object.entries(a)) {
    if (b[i] !== undefined) dot += v * b[i];
  }
  return dot; // already L2-normalized in build step
}

function topRelated(slug) {
  const doc = docs.find(d => d.slug === slug);
  if (!doc) { console.error(`Note not found: ${slug}`); return []; }

  return docs
    .filter(d => d.slug !== slug)
    .map(d => ({ slug: d.slug, score: cosineSim(doc.vec, d.vec) }))
    .filter(d => d.score >= THRESHOLD)
    .sort((a, b) => b.score - a.score)
    .slice(0, TOP)
    .map(d => `[[${d.slug}]]`);
}

if (NOTE_SLUG) {
  // Single note mode
  const related = topRelated(NOTE_SLUG);
  console.log(`\n${NOTE_SLUG} → related:`);
  related.forEach(r => console.log(`  ${r}`));
} else {
  // All notes mode
  const suggestions = {};
  let changed = 0;

  for (const doc of docs) {
    const related = topRelated(doc.slug);
    if (related.length > 0) {
      suggestions[doc.slug] = { path: doc.path, related };
      changed++;
    }
  }

  writeFileSync(OUTPUT, JSON.stringify(suggestions, null, 2));
  console.error(`✓ Computed related for ${changed}/${docs.length} notes → ${OUTPUT}`);

  // Preview top 5 changes
  const preview = Object.entries(suggestions).slice(0, 5);
  for (const [slug, { related }] of preview) {
    console.error(`  ${slug}: ${related.join(', ')}`);
  }
  console.log(OUTPUT);
}
