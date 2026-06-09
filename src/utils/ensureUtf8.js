const iconv = require('iconv-lite');
const chardet = require('chardet');
const logger = require('../services/logger');

// Only these encodings are considered for the scoring vote.
// UTF-16 is handled separately via BOM or null-byte patterns.
// Windows-1252 is preferred over ISO-8859-1 because both decode
// identically for printable characters, but Windows-1252 has
// useful typographic symbols (€, ™, ’, " , ") in the 0x80-0x9F
// range where ISO-8859-1 has control characters.
const CANDIDATES = [
  'utf8',
  'windows-1252',
  'iso-8859-1'
];

function ensureUtf8(buffer) {
  // -----------------------------------------------------------------------
  // Guard: reject non-buffers and empty buffers immediately
  // -----------------------------------------------------------------------
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
    logger.debug({ bufferLength: buffer?.length }, 'ensureUtf8: empty or invalid buffer, skipping');
    return buffer;
  }

  logger.debug({ bufferLength: buffer.length }, 'ensureUtf8: start');

  // -----------------------------------------------------------------------
  // Stage 1 — BOM detection (deterministic, no guessing)
  // If the file starts with a UTF-8, UTF-16 LE, or UTF-16 BE byte-order
  // mark, decode it directly and return. This handles the unambiguous
  // cases before any fallible detection runs.
  // -----------------------------------------------------------------------
  const bomResult = decodeFromBom(buffer);

  if (bomResult) {
    logger.debug('ensureUtf8: BOM detected, decoded via BOM');
    return Buffer.from(stripBom(bomResult), 'utf8');
  }

  // -----------------------------------------------------------------------
  // Stage 2 — UTF-16 without BOM (heuristic)
  // UTF-16 text without a BOM has a distinct null-byte pattern: every
  // other byte is 0x00 for ASCII-range characters. We sample the first
  // 4KB and check the zero-byte distribution. If there are enough nulls
  // and they skew heavily toward odd or even positions, we assume UTF-16.
  //
  // We do NOT add UTF-16 LE/BE to CANDIDATES because virtually any
  // random byte sequence can be "decoded" as UTF-16 without error,
  // producing garbage with no syntactic markers. The explicit null-byte
  // heuristic is far more reliable.
  // -----------------------------------------------------------------------
  const utf16Guess = detectUtf16WithoutBom(buffer);

  if (utf16Guess) {
    logger.debug({ encoding: utf16Guess }, 'ensureUtf8: UTF-16 detected without BOM');
    const text = iconv.decode(buffer, utf16Guess);
    return Buffer.from(stripBom(text), 'utf8');
  }

  // -----------------------------------------------------------------------
  // Stage 3 — chardet vote (additional signal, not authority)
  // chardet has one job: look at the raw buffer and guess an encoding.
  // We intentionally treat its output as one vote among many, not as the
  // final answer. chardet can misidentify short Spanish Windows-1252 text
  // as Cyrillic ISO-8859-5, so we never let it decide alone.
  // -----------------------------------------------------------------------
  const detectedEncoding = normalizeEncoding(
    chardet.detect(buffer)
  );

  logger.debug({ detectedEncoding }, 'ensureUtf8: chardet result');

  // -----------------------------------------------------------------------
  // Stage 4 — decode all candidates and score them
  // Each candidate encoding is applied to the raw buffer. The resulting
  // text is scored on: Spanish character presence, subtitle structure
  // (timestamps, dialogue markers), general readability, and absence of
  // mojibake patterns (Ã³, Ã±, â€™, etc.).
  //
  // If chardet agrees with the candidate, the candidate gets a bonus.
  // -----------------------------------------------------------------------
  const candidates = [];

  for (const encoding of CANDIDATES) {
    try {
      let text;

      if (encoding === 'utf8') {
        text = buffer.toString('utf8');
      } else {
        text = iconv.decode(buffer, encoding);
      }

      candidates.push({
        encoding,
        text,
        score:
          scoreText(text) +
          scoreDetectorVote(
            encoding,
            detectedEncoding
          )
      });
    } catch {
      logger.warn({ encoding }, 'ensureUtf8: candidate decode failed, skipping');
    }
  }

  // -----------------------------------------------------------------------
  // Edge case: no candidate decoded successfully — return raw buffer
  // -----------------------------------------------------------------------
  if (candidates.length === 0) {
    logger.warn({ bufferLength: buffer.length }, 'ensureUtf8: no valid candidate, returning raw buffer');
    return buffer;
  }

  // -----------------------------------------------------------------------
  // Pick the highest-scoring encoding and return UTF-8
  // -----------------------------------------------------------------------
  candidates.sort((a, b) => b.score - a.score);

  const winner = candidates[0];

  logger.debug({ encoding: winner.encoding, score: winner.score, candidates: candidates.length }, 'ensureUtf8: best candidate selected');

  return Buffer.from(
    stripBom(winner.text),
    'utf8'
  );
}

// ---------------------------------------------------------------------------
// BOM detection
// Checks the first bytes of the buffer for UTF-8 BOM (EF BB BF),
// UTF-16 LE BOM (FF FE), or UTF-16 BE BOM (FE FF). If found, the
// buffer is decoded directly with the correct encoding and the text
// is returned. Otherwise returns null so the caller falls through to
// the heuristic stages.
// ---------------------------------------------------------------------------
function decodeFromBom(buffer) {
  if (
    buffer.length >= 3 &&
    buffer[0] === 0xef &&
    buffer[1] === 0xbb &&
    buffer[2] === 0xbf
  ) {
    return buffer.subarray(3).toString('utf8');
  }

  if (
    buffer.length >= 2 &&
    buffer[0] === 0xff &&
    buffer[1] === 0xfe
  ) {
    return iconv.decode(buffer, 'utf16-le');
  }

  if (
    buffer.length >= 2 &&
    buffer[0] === 0xfe &&
    buffer[1] === 0xff
  ) {
    return iconv.decode(buffer, 'utf16-be');
  }

  return null;
}

// ---------------------------------------------------------------------------
// Strip BOM character from decoded text
// Some decoders (especially UTF-16) leave the BOM as a zero-width
// non-breaking space (U+FEFF) at position 0. This removes it if present.
// ---------------------------------------------------------------------------
function stripBom(text) {
  if (
    text &&
    text.length > 0 &&
    text.charCodeAt(0) === 0xfeff
  ) {
    return text.slice(1);
  }

  return text;
}

// ---------------------------------------------------------------------------
// UTF-16 detection without BOM
// UTF-16 encodes ASCII-range characters as two bytes where every other
// byte is 0x00. By sampling the first 4KB and counting null bytes at even
// vs. odd positions, we can infer UTF-16 LE or BE.
//
// Thresholds:
//   - At least 10 null bytes total (avoids random false positives)
//   - Nulls must account for at least 20% of the sample (UTF-16 text
//     with mostly ASCII has ~50% nulls; plain ANSI has <1%)
//   - One side must dominate 2:1 to determine LE vs BE
// ---------------------------------------------------------------------------
function detectUtf16WithoutBom(buffer) {
  const sampleLength = Math.min(
    buffer.length,
    4096
  );

  let evenZeros = 0;
  let oddZeros = 0;

  for (let i = 0; i < sampleLength; i++) {
    if (buffer[i] === 0x00) {
      if (i % 2 === 0) {
        evenZeros++;
      } else {
        oddZeros++;
      }
    }
  }

  const totalZeros =
    evenZeros + oddZeros;

  if (totalZeros < 10) {
    return null;
  }

  const ratio =
    totalZeros / sampleLength;

  if (ratio < 0.2) {
    return null;
  }

  if (oddZeros > evenZeros * 2) {
    return 'utf16-le';
  }

  if (evenZeros > oddZeros * 2) {
    return 'utf16-be';
  }

  return null;
}

// ---------------------------------------------------------------------------
// Normalise chardet output to one of our CANDIDATES
// chardet returns strings like "UTF-8", "ISO-8859-1", "Windows-1252",
// or null if it couldn't guess. We map those to our canonical names.
// ---------------------------------------------------------------------------
function normalizeEncoding(value) {
  if (!value) {
    return null;
  }

  const normalized =
    value.toLowerCase();

  if (
    normalized.includes('1252') ||
    normalized.includes('windows-1252')
  ) {
    return 'windows-1252';
  }

  if (
    normalized.includes('8859') ||
    normalized.includes('latin1')
  ) {
    return 'iso-8859-1';
  }

  if (
    normalized.includes('utf-8') ||
    normalized === 'utf8'
  ) {
    return 'utf8';
  }

  return null;
}

// ---------------------------------------------------------------------------
// Scoring: chardet agreement bonus
// If chardet's guess matches the candidate, award +10. This is a
// helpful tiebreaker but not strong enough to override good text
// evidence (e.g., Spanish chars + subtitle timestamps).
// ---------------------------------------------------------------------------
function scoreDetectorVote(
  encoding,
  detectedEncoding
) {
  if (!detectedEncoding) {
    return 0;
  }

  if (encoding === detectedEncoding) {
    return 10;
  }

  return 0;
}

// ---------------------------------------------------------------------------
// Scoring: text quality
// The final score is the sum of Spanish character presence, subtitle
// structure markers, general readability, and mojibake penalties.
// ---------------------------------------------------------------------------
function scoreText(text) {
  let score = 0;

  score += scoreSpanish(text);
  score += scoreSubtitleStructure(text);
  score += scoreReadability(text);
  score += scoreMojibake(text);

  return score;
}

// ---------------------------------------------------------------------------
// Scoring: Spanish characters (+2 each)
// Accented vowels (áéíóú), ñ, ü, and inverted punctuation (¿¡) are
// strong signals that the encoding is correct, because these characters
// appear as different byte sequences in UTF-8 vs Windows-1252. The
// correct encoding will show the actual characters; a wrong encoding
// will show their mis-decoded equivalents (which look like garbage)
// and won't match the regex pattern in scoreMojibake.
// ---------------------------------------------------------------------------
function scoreSpanish(text) {
  let score = 0;

  const chars = [
    'á',
    'é',
    'í',
    'ó',
    'ú',
    'ñ',
    'ü',
    '¿',
    '¡'
  ];

  for (const c of chars) {
    score += count(text, c) * 2;
  }

  return score;
}

// ---------------------------------------------------------------------------
// Scoring: subtitle structure markers
// SRT timestamps (+20), arrow separators (+10), subtitle numbers (+5),
// ASS headers (+20), ASS dialogue lines (+20), and Karaoke tags (+20)
// are unmistakable signs that this is a subtitle file. Bonus is large
// because subtitle structure is almost never produced by encoding errors.
// ---------------------------------------------------------------------------
function scoreSubtitleStructure(text) {
  let score = 0;

  if (
    /\d{2}:\d{2}:\d{2}[,.]\d{3}/.test(text)
  ) {
    score += 20;
  }

  if (
    /-->/.test(text)
  ) {
    score += 10;
  }

  if (
    /^\d+\s*$/m.test(text)
  ) {
    score += 5;
  }

  if (
    /^\[Script Info\]/mi.test(text)
  ) {
    score += 20;
  }

  if (
    /^Dialogue:/mi.test(text)
  ) {
    score += 20;
  }

  if (
    /\{\d+\}\{\d+\}/.test(text)
  ) {
    score += 20;
  }

  return score;
}

// ---------------------------------------------------------------------------
// Scoring: readability (+0.5 per clean word-like line)
// Lines consisting only of letters, numbers, spaces, and common
// punctuation are likely proper text. Encoding errors almost always
// produce non-letter characters (like Ã, ±, etc.) that fail this regex.
// ---------------------------------------------------------------------------
function scoreReadability(text) {
  let score = 0;

  const lines =
    text.split(/\r?\n/);

  for (const line of lines) {
    if (
      /^[\p{L}\p{N}\s.,;:!?¿¡'"()\-]+$/u.test(line)
    ) {
      score += 0.5;
    }
  }

  return score;
}

// ---------------------------------------------------------------------------
// Scoring: mojibake penalty (-25 per occurrence)
// Mojibake happens when UTF-8 bytes are decoded as if they were
// Windows-1252 or ISO-8859-1. Common UTF-8 multi-byte sequences
// produce recognizable garbage:
//
//   UTF-8 bytes   →  Misread as Latin-1
//   C3 A1 (á)     →  Ã¡
//   C3 B1 (ñ)     →  Ã±
//   C3 B3 (ó)     →  Ã³
//   E2 80 99 (')  →  â€™
//
// These patterns are heavily penalized (-25 each) so that the
// correct encoding (which produces clean text) wins even if the
// wrong encoding happens to produce some valid-looking words.
//
// Additionally, control characters other than tab, LF, and CR are
// penalized (-5 each), as they are never expected in subtitle text.
// ---------------------------------------------------------------------------
function scoreMojibake(text) {
  let score = 0;

  const badPatterns = [
    'Ã',
    'Â',
    'â€',
    'â€™',
    'â€œ',
    'â€\u009d',
    'ï»¿',
    '�'
  ];

  for (const pattern of badPatterns) {
    score -=
      count(text, pattern) * 25;
  }

  for (let i = 0; i < text.length; i++) {
    const code =
      text.charCodeAt(i);

    if (
      code < 32 &&
      code !== 9 &&
      code !== 10 &&
      code !== 13
    ) {
      score -= 5;
    }
  }

  return score;
}

// ---------------------------------------------------------------------------
// Utility: count occurrences of a substring (non-overlapping)
// ---------------------------------------------------------------------------
function count(text, pattern) {
  let total = 0;
  let pos = 0;

  while (true) {
    pos = text.indexOf(
      pattern,
      pos
    );

    if (pos === -1) {
      break;
    }

    total++;
    pos += pattern.length;
  }

  return total;
}

module.exports = {
  ensureUtf8
};
