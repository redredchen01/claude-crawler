#!/usr/bin/env node
/**
 * apply-related.mjs
 * 把 compute-related 的建議寫回 vault 筆記的 frontmatter related 欄位。
 *
 * Usage:
 *   node apply-related.mjs --suggestions <file> --vault <path> [--backup] [--dry-run]
 */

import { readFileSync, writeFileSync, mkdirSync, copyFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';

const args = process.argv.slice(2);
const get  = (flag) => { const i = args.indexOf(flag); return i !== -1 ? args[i + 1] : null; };
const has  = (flag) => args.includes(flag);

const SUGGESTIONS = get('--suggestions') || '/tmp/related_suggestions.json';
const VAULT       = get('--vault') || process.env.VAULT || '/Users/dex/YD 2026/obsidian';
const DRY_RUN     = has('--dry-run');
const BACKUP      = has('--backup');

const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
const BACKUP_DIR  = join(VAULT, '.backups', `related_${today}`);

const suggestions = JSON.parse(readFileSync(SUGGESTIONS, 'utf8'));
console.error(`Loaded ${Object.keys(suggestions).length} suggestions`);

if (BACKUP && !DRY_RUN) {
  mkdirSync(BACKUP_DIR, { recursive: true });
  console.error(`Backup dir: ${BACKUP_DIR}`);
}

let applied = 0, skipped = 0;

for (const [slug, { path: relPath, related }] of Object.entries(suggestions)) {
  const fullPath = join(VAULT, relPath);
  if (!existsSync(fullPath)) { skipped++; continue; }

  const raw = readFileSync(fullPath, 'utf8');

  // Parse frontmatter
  const fmMatch = raw.match(/^(---\n[\s\S]*?\n---\n)([\s\S]*)$/);
  if (!fmMatch) { skipped++; continue; }

  const [, fm, body] = fmMatch;
  const relatedStr = `related: [${related.map(r => `"${r}"`).join(', ')}]`;

  let newFm;
  if (/^related:/m.test(fm)) {
    // Replace existing
    newFm = fm.replace(/^related:.*$/m, relatedStr);
  } else {
    // Insert before closing ---
    newFm = fm.replace(/\n---\n$/, `\n${relatedStr}\n---\n`);
  }

  if (newFm === fm) { skipped++; continue; } // no change

  if (DRY_RUN) {
    console.log(`[dry-run] ${slug}: ${related.join(', ')}`);
  } else {
    if (BACKUP) copyFileSync(fullPath, join(BACKUP_DIR, `${slug}.md`));
    writeFileSync(fullPath, newFm + body);
  }
  applied++;
}

const mode = DRY_RUN ? 'Dry run' : 'Applied';
console.error(`✓ ${mode}: ${applied} notes updated, ${skipped} skipped`);
