#!/usr/bin/env node
/**
 * build-tfidf-index.mjs
 * 掃描 Obsidian vault，建立 TF-IDF 索引並輸出 JSON。
 *
 * Usage:
 *   node build-tfidf-index.mjs --vault <path> [--output <file>] [--min-df <n>] [--max-df <f>]
 */

import { readFileSync, writeFileSync, readdirSync, statSync } from 'fs';
import { join, basename, relative } from 'path';

// --- CLI args ---
const args = process.argv.slice(2);
const get = (flag) => { const i = args.indexOf(flag); return i !== -1 ? args[i + 1] : null; };

const VAULT  = get('--vault')  || process.env.VAULT || '/Users/dex/YD 2026/obsidian';
const OUTPUT = get('--output') || '/tmp/tfidf_index.json';
const MIN_DF = parseFloat(get('--min-df') || '2');
const MAX_DF = parseFloat(get('--max-df') || '0.85');

// --- Stop words ---
const STOP = new Set([
  'the','a','an','and','or','but','in','on','at','to','for','of','with','by','from',
  'is','are','was','were','be','been','being','have','has','had','do','does','did',
  'will','would','could','should','may','might','shall','can','need','must',
  'this','that','these','those','it','its','i','we','you','he','she','they',
  'not','no','nor','so','yet','both','either','each','few','more','most',
  'other','some','such','only','own','same','than','too','very','just',
  // 中文停詞（常見）
  '的','了','在','是','我','有','和','就','不','人','都','一','一個','上','也','很',
  '到','說','要','去','你','會','著','沒有','看','好','自己','這',
]);

// --- Helpers ---
function walkMd(dir, files = []) {
  for (const entry of readdirSync(dir)) {
    if (entry.startsWith('.') || entry === 'templates' || entry === 'archive') continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walkMd(full, files);
    else if (entry.endsWith('.md') && !entry.startsWith('_')) files.push(full);
  }
  return files;
}

function parseFrontmatter(text) {
  const m = text.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!m) return { meta: {}, body: text };
  const meta = {};
  for (const line of m[1].split('\n')) {
    const [k, ...v] = line.split(':');
    if (k && v.length) meta[k.trim()] = v.join(':').trim();
  }
  return { meta, body: m[2] };
}

function tokenize(text) {
  return text
    .toLowerCase()
    .replace(/```[\s\S]*?```/g, ' ')   // 移除代碼塊
    .replace(/\[\[([^\]]+)\]\]/g, '$1') // wikilink → 文字
    .replace(/[^a-z0-9\u4e00-\u9fff\s-]/g, ' ')
    .split(/\s+/)
    .filter(t => t.length > 1 && !STOP.has(t));
}

function termFreq(tokens) {
  const tf = {};
  for (const t of tokens) tf[t] = (tf[t] || 0) + 1;
  const len = tokens.length || 1;
  for (const t in tf) tf[t] /= len;
  return tf;
}

// --- Main ---
const paths = walkMd(VAULT);
console.error(`Scanning ${paths.length} notes...`);

// Build corpus
const docs = paths.map(p => {
  const raw = readFileSync(p, 'utf8');
  const { meta, body } = parseFrontmatter(raw);
  const slug = basename(p, '.md');
  const rel  = relative(VAULT, p);
  const tokens = tokenize((meta.title || slug) + ' ' + (meta.summary || '') + ' ' + (meta.tags || '') + ' ' + body);
  return { slug, path: rel, meta, tokens };
});

// DF (document frequency)
const df = {};
for (const { tokens } of docs) {
  for (const t of new Set(tokens)) df[t] = (df[t] || 0) + 1;
}

const N = docs.length;
const minDf = MIN_DF >= 1 ? MIN_DF : Math.ceil(MIN_DF * N);
const maxDf = MAX_DF <= 1 ? Math.floor(MAX_DF * N) : MAX_DF;

// Vocab = terms within df bounds
const vocab = Object.keys(df).filter(t => df[t] >= minDf && df[t] <= maxDf);
console.error(`Vocabulary: ${vocab.length} terms (min_df=${minDf}, max_df=${maxDf})`);

const vocabIdx = {};
vocab.forEach((t, i) => { vocabIdx[t] = i; });

// IDF
const idf = vocab.map(t => Math.log((N + 1) / (df[t] + 1)) + 1);

// TF-IDF vectors (sparse: only nonzero)
const index = docs.map(({ slug, path, meta, tokens }) => {
  const tf = termFreq(tokens);
  const vec = {};
  for (const [t, tfv] of Object.entries(tf)) {
    const i = vocabIdx[t];
    if (i !== undefined) vec[i] = tfv * idf[i];
  }
  // L2 normalize
  const norm = Math.sqrt(Object.values(vec).reduce((s, v) => s + v * v, 0)) || 1;
  for (const i in vec) vec[i] /= norm;
  return { slug, path, meta: { title: meta.title, type: meta.type, tags: meta.tags }, vec };
});

const output = { vocab, idf, docs: index, built: new Date().toISOString() };
writeFileSync(OUTPUT, JSON.stringify(output));
console.error(`✓ Index built: ${index.length} docs → ${OUTPUT} (${Math.round(JSON.stringify(output).length / 1024)}KB)`);
console.log(OUTPUT);
