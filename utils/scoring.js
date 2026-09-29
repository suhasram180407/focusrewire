// utils/scoring.js
// Keyword scoring engine — runs entirely in the browser, no API calls

const STOPWORDS = new Set([
  "the","a","an","is","in","it","of","to","and","or","for","on","with",
  "this","that","how","what","why","when","who","which","be","are","was",
  "were","has","have","had","do","does","did","will","would","could",
  "should","may","might","by","at","from","up","about","into","through","i"
]);

function normalizeText(text) {
  if (!text) return "";
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(w => w.length > 1 && !STOPWORDS.has(w))
    .join(" ");
}

/**
 * Checks if a candidate keyword/phrase matches the video title.
 * Checks both raw lowercased title (preserving punctuation & full phrasing)
 * and normalized title (stripped stopwords & punctuation).
 */
function titleMatchesKeyword(rawTitleLower, normTitle, keyword) {
  if (!keyword) return false;
  const kwLower = keyword.toLowerCase().trim();
  if (!kwLower) return false;

  // 1. Exact raw match (whole word or phrase)
  if (rawTitleLower.includes(kwLower)) {
    return true;
  }

  // 2. Normalized match (without stopwords/symbols)
  const kwNorm = normalizeText(kwLower);
  if (kwNorm && normTitle.includes(kwNorm)) {
    return true;
  }

  // 3. For single-word keywords, ensure word boundary match in raw title
  if (!kwLower.includes(" ")) {
    const escaped = kwLower.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const regex = new RegExp(`(^|[^a-z0-9])${escaped}([^a-z0-9]|$)`, "i");
    if (regex.test(rawTitleLower)) {
      return true;
    }
  }

  return false;
}

/**
 * Score a title against the active focus profile.
 * Returns positiveHits and negativeHits counts.
 */
function scoreContent(title, profile) {
  if (!title || !profile) return { positiveHits: 0, negativeHits: 0 };

  const rawTitleLower = title.toLowerCase();
  const normalized = normalizeText(title);
  let positiveHits = 0;
  let negativeHits = 0;

  // 1. Topic name itself — strongest positive signal
  const topic = profile.topic || "";
  if (topic && titleMatchesKeyword(rawTitleLower, normalized, topic)) {
    positiveHits += 3;
  }

  // 2. Positive keyword matches
  for (const kw of (profile.positive_keywords || [])) {
    if (titleMatchesKeyword(rawTitleLower, normalized, kw)) {
      positiveHits += kw.includes(" ") ? 2 : 1;
    }
  }

  // 3. Subtopic matches
  for (const sub of (profile.subtopics || [])) {
    if (titleMatchesKeyword(rawTitleLower, normalized, sub)) {
      positiveHits += 2;
    }
  }

  // 4. Negative keyword matches (clear indicators of distraction/clickbait)
  for (const kw of (profile.negative_keywords || [])) {
    if (titleMatchesKeyword(rawTitleLower, normalized, kw)) {
      negativeHits++;
    }
  }

  return { positiveHits, negativeHits };
}

/**
 * THE CORE FILTERING RULE:
 * 1. If any negative keyword matches (negativeHits > 0) -> immediately BLOCK.
 *    Negative keywords take priority on clear negative match (clickbait, gaming, vlog, entertainment, etc.).
 * 2. If no positive keywords match (positiveHits === 0) -> BLOCK.
 *    Only videos relevant to the focus topic are allowed.
 * 3. Only if positiveHits > 0 and negativeHits === 0 -> ALLOW.
 */
function shouldBlock(title, profile) {
  if (!title || !profile) return false;
  if (!profile.positive_keywords || profile.positive_keywords.length === 0) return false;

  const { positiveHits, negativeHits } = scoreContent(title, profile);

  // Negative keyword matches take strict priority — immediately BLOCK
  if (negativeHits > 0) return true;

  // Zero positive matches → BLOCK (feed stays on-topic)
  if (positiveHits === 0) return true;

  // Has positive matches and zero negative matches → ALLOW
  return false;
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = { scoreContent, shouldBlock, normalizeText, titleMatchesKeyword };
}

