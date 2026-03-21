/**
 * NLP Parser for South African multi-language order text.
 *
 * Handles:
 *  - English
 *  - isiZulu  (e.g. "ngifuna pap and wors")
 *  - Sepedi   (e.g. "ke kgopela two breads le milk")
 *  - Setswana (overlaps heavily with Sepedi)
 *
 * Extraction strategy:
 *  1. Normalise input (lowercase, remove punctuation)
 *  2. Replace SA-language "want/give me" phrases with a marker so we know
 *     everything after is the item list
 *  3. Split on conjunctions (and / le / na / ni) and commas
 *  4. For each segment, extract optional quantity word/digit + item name
 *  5. Return structured [ { quantity, raw, name } ]
 */

import type { ParsedItem, CategoryKeywordEntry } from '../types';

// ── Number word maps ──────────────────────────────────────────────────────────

const NUMBER_WORDS: Record<string, number> = {
  one: 1,
  a: 1,
  an: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  // Zulu
  kunye: 1,
  kubili: 2,
  kuthathu: 3,
  // Sepedi / Setswana
  nngwe: 1,
  pedi: 2,
  tharo: 3,
  nne: 4,
  hlano: 5,
};

// ── "I want" / "give me" phrases to strip ─────────────────────────────────────

const WANT_PHRASES: RegExp[] = [
  // Zulu
  /\bngifuna\b/gi,
  /\bngicela\b/gi,
  /\bngidinga\b/gi,
  // Sepedi / Setswana
  /\bke kgopela\b/gi,
  /\bke batla\b/gi,
  /\bke rata\b/gi,
  /\bnka kopa\b/gi,
  // English
  /\bi want\b/gi,
  /\bgive me\b/gi,
  /\bplease give me\b/gi,
  /\bi('d| would) like\b/gi,
  /\bcan i (get|have)\b/gi,
  /\blemme (get|have)\b/gi,
  /\blet me (get|have)\b/gi,
  /\bi need\b/gi,
];

// ── Ordinal/noise words to drop ───────────────────────────────────────────────

const NOISE_RE =
  /\b(please|asseblief|ngiyabonga|ke a leboga|thanks|thank you)\b/gi;

/**
 * Normalise a raw order string.
 * @param text
 * @returns Normalised string
 */
export function normalise(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ') // strip punctuation
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Strip "I want / give me" opener phrases.
 * @param text  Already normalised
 * @returns Cleaned string
 */
function stripWantPhrases(text: string): string {
  let result = text;
  for (const re of WANT_PHRASES) {
    result = result.replace(re, '');
  }
  return result.replace(/\s+/g, ' ').trim();
}

/**
 * Parse a single item segment like "2 breads", "two milk", "pap", "a coke".
 * @param segment
 * @returns Parsed item or null
 */
function parseSegment(
  segment: string
): { quantity: number; name: string } | null {
  const trimmed = segment.trim();
  if (!trimmed) return null;

  // Try leading digit
  const digitMatch = trimmed.match(/^(\d+)\s+(.+)$/);
  if (digitMatch) {
    return {
      quantity: parseInt(digitMatch[1], 10),
      name: digitMatch[2].trim(),
    };
  }

  // Try leading number word
  const words = trimmed.split(/\s+/);
  const first = words[0];
  if (NUMBER_WORDS[first] !== undefined) {
    const name = words.slice(1).join(' ').trim();
    if (name) {
      return { quantity: NUMBER_WORDS[first], name };
    }
  }

  // No quantity prefix — default to 1
  return { quantity: 1, name: trimmed };
}

/**
 * Extract ordered items from a WhatsApp message.
 *
 * @param text  Raw message text (any supported SA language), or null/undefined
 * @returns Array of parsed items
 *
 * @example
 * parseOrderText("ke kgopela two breads le milk")
 * // → [{ quantity: 2, name: "breads", raw: "two breads" },
 * //    { quantity: 1, name: "milk", raw: "milk" }]
 */
export function parseOrderText(text: string | null | undefined): ParsedItem[] {
  if (!text || typeof text !== 'string') return [];

  // Work on lowercased text to simplify regex matching
  let processed = text.toLowerCase().trim();

  // Remove noise words first
  processed = processed.replace(NOISE_RE, '');

  // Strip "I want / give me" opener phrases
  processed = stripWantPhrases(processed);

  // Split on commas/semicolons AND conjunctions (and / le / na / ni)
  const rawSegments = processed
    .split(/[,;]+|\s+(and|le|na|ni)\s+/gi)
    .filter(Boolean);

  const results: ParsedItem[] = [];
  for (const seg of rawSegments) {
    // Skip bare conjunction words that appear as captured groups
    if (/^(and|le|na|ni)$/i.test(seg.trim())) continue;

    const cleaned = normalise(seg);
    if (!cleaned) continue;

    const parsed = parseSegment(cleaned);
    if (parsed?.name) {
      results.push({ ...parsed, raw: seg.trim() });
    }
  }

  return results;
}

/**
 * Detect which SA language the text is likely in.
 * Returns 'zulu' | 'sepedi' | 'setswana' | 'english' | 'unknown'.
 * @param text
 */
export function detectLanguage(
  text: string
): 'zulu' | 'sepedi' | 'setswana' | 'english' | 'unknown' {
  const lower = text.toLowerCase();

  if (/\b(ngifuna|ngicela|ngidinga|ngiyabonga)\b/.test(lower)) return 'zulu';
  if (/\b(ke kgopela|ke batla|ke a leboga|le|nka kopa)\b/.test(lower))
    return 'sepedi';
  if (/\b(ke batla|ke rata|ke a leboga)\b/.test(lower)) return 'setswana';
  if (/\b(i want|give me|i need|please)\b/.test(lower)) return 'english';

  return 'unknown';
}

/**
 * Detect which category/sub-category IDs are relevant to the given text
 * based on keyword matching.
 *
 * @param text  Raw or normalised order text
 * @param entries  Array of category keyword entries (from DB)
 * @returns  Array of matched sub-category IDs (or category IDs if no sub-category)
 */
export function detectCategories(
  text: string,
  entries: CategoryKeywordEntry[]
): string[] {
  const lower = normalise(text);
  const matchedIds: Set<string> = new Set();

  for (const entry of entries) {
    for (const keyword of entry.keywords) {
      const kw = keyword.toLowerCase();
      // Word-boundary match: keyword appears as a standalone word/phrase
      const re = new RegExp(`\\b${kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`);
      if (re.test(lower)) {
        matchedIds.add(entry.subCategoryId ?? entry.categoryId);
        break; // one keyword hit per entry is enough
      }
    }
  }

  return Array.from(matchedIds);
}
