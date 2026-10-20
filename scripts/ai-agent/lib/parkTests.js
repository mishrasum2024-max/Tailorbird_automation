/*
 * ============================================================
 * PARK FAILING TESTS (single-PR mode, shared)
 * ============================================================
 *
 * Used by publish-ticket-pr.js: removes THIS batch's failing tests
 * from a spec's text, so the ticket PR only ever holds passing
 * tests. The full attempt is kept on the ticket's wip branch.
 *
 * Only a `test(...)` / `test.only|skip|fixme|fail|slow(...)` call is
 * removed, and only when ALL of these hold:
 *   - its title (first argument, a string literal) contains
 *     "<TICKET>-<ID>" for a failing case of this batch,
 *   - its title contains no "<TICKET>-<ID>" of a passing case,
 *   - that title is not in the base version of the file (an earlier,
 *     committed test is never removed — existing lines stay).
 * Anything the scanner cannot read with certainty is left in place
 * (and reported), never guessed.
 *
 * No dependencies: a small scanner skips strings, template
 * literals, comments and regex literals to find the call's closing
 * parenthesis. Literal regexes only (semgrep).
 * ============================================================
 */

const TEST_CALL_PATTERN = /^[ \t]*test(?:\.(?:only|skip|fixme|fail|slow))?[ \t]*\(/gm;
const TICKET_CASE_PATTERN = /([A-Za-z0-9]{0,20}-\d{1,9})-(TC\d{1,5})(?!\d)/g;
const WORD_BEFORE_PATTERN = /([A-Za-z_$][\w$]*)$/;
const REGEX_PREV_CHARS = new Set([..."(,=:[!&|?{};+-*%<>~^"]);
const REGEX_PREV_WORDS = new Set(["return", "typeof", "case", "in", "of", "delete", "void", "throw", "new", "else", "do"]);
const CLOSERS = { "(": ")", "[": "]", "{": "}" };

function skipQuoted(text, start, quote) {
  for (let i = start + 1; i < text.length; i++) {
    const ch = text[i];

    if (ch === "\\") i++;
    else if (ch === quote) return i + 1;
    else if (ch === "\n") return -1;
  }

  return -1;
}

function skipTemplate(text, start) {
  let i = start + 1;

  while (i < text.length) {
    const ch = text[i];

    if (ch === "\\") i += 2;
    else if (ch === "`") return i + 1;
    else if (ch === "$" && text[i + 1] === "{") {
      i = scanCode(text, i + 2, "}");
      if (i < 0) return -1;
    } else i++;
  }

  return -1;
}

function skipRegex(text, start) {
  let inClass = false;

  for (let i = start + 1; i < text.length; i++) {
    const ch = text[i];

    if (ch === "\\") i++;
    else if (ch === "\n") return -1;
    else if (ch === "[") inClass = true;
    else if (ch === "]") inClass = false;
    else if (ch === "/" && !inClass) {
      let end = i + 1;

      while (end < text.length && /[a-z]/.test(text[end])) end++;
      return end;
    }
  }

  return -1;
}

function slashStartsRegex(text, index) {
  let j = index - 1;

  while (j >= 0 && /\s/.test(text[j])) j--;
  if (j < 0) return true;
  if (REGEX_PREV_CHARS.has(text[j])) return true;

  const word = text.slice(Math.max(0, j - 15), j + 1).match(WORD_BEFORE_PATTERN);

  return Boolean(word && REGEX_PREV_WORDS.has(word[1]));
}

// Scans code from `start` (just after an opener) to the matching
// `closer`; returns the index after it, or -1 when unsure.
function scanCode(text, start, closer) {
  const stack = [closer];
  let i = start;

  while (i < text.length) {
    const ch = text[i];
    const next = text[i + 1];

    if (ch === "/" && next === "/") {
      const newline = text.indexOf("\n", i);

      if (newline === -1) return -1;
      i = newline + 1;
    } else if (ch === "/" && next === "*") {
      const end = text.indexOf("*/", i + 2);

      if (end === -1) return -1;
      i = end + 2;
    } else if (ch === "'" || ch === '"') {
      i = skipQuoted(text, i, ch);
      if (i < 0) return -1;
    } else if (ch === "`") {
      i = skipTemplate(text, i);
      if (i < 0) return -1;
    } else if (ch === "/") {
      i = slashStartsRegex(text, i) ? skipRegex(text, i) : i + 1;
      if (i < 0) return -1;
    } else if (CLOSERS[ch]) {
      stack.push(CLOSERS[ch]);
      i++;
    } else if (ch === ")" || ch === "]" || ch === "}") {
      if (stack.pop() !== ch) return -1;
      i++;
      if (!stack.length) return i;
    } else i++;
  }

  return -1;
}

// Every test(...) call: { start, end, title } (start = its line start,
// end = after the call, its `;` and the rest of that line).
function findTestCalls(text) {
  const calls = [];

  TEST_CALL_PATTERN.lastIndex = 0;

  for (let match = TEST_CALL_PATTERN.exec(text); match; match = TEST_CALL_PATTERN.exec(text)) {
    const open = match.index + match[0].length - 1;
    let titleStart = open + 1;

    while (titleStart < text.length && /\s/.test(text[titleStart])) titleStart++;

    const quote = text[titleStart];
    const titleEnd =
      quote === "'" || quote === '"'
        ? skipQuoted(text, titleStart, quote)
        : quote === "`"
          ? skipTemplate(text, titleStart)
          : -1;
    const close = scanCode(text, open + 1, ")");

    if (titleEnd < 0 || close < 0) {
      calls.push({ start: match.index, end: -1, title: null });
      continue;
    }

    let end = close;

    while (end < text.length && (text[end] === " " || text[end] === "\t")) end++;
    if (text[end] === ";") end++;
    while (end < text.length && (text[end] === " " || text[end] === "\t")) end++;
    if (text[end] === "\r") end++;
    if (text[end] === "\n") end++;

    calls.push({ start: match.index, end, title: text.slice(titleStart + 1, titleEnd - 1) });
    TEST_CALL_PATTERN.lastIndex = close;
  }

  return calls;
}

// "<TICKET>-TC014" IDs of this ticket in a title, as "TC014".
function ticketCaseIds(title, ticketId) {
  const ids = [];
  const ticket = String(ticketId).toUpperCase();

  TICKET_CASE_PATTERN.lastIndex = 0;

  for (let match = TICKET_CASE_PATTERN.exec(title); match; match = TICKET_CASE_PATTERN.exec(title)) {
    if (match[1].toUpperCase() === ticket) ids.push(match[2].toUpperCase());
  }

  return ids;
}

/*
 * Returns { text, parked: [{ id, title }], unsure: [{ id, reason }] }.
 * `baseText` is the file at the batch's base commit ("" if new).
 */
function parkFailingTests({ text, baseText, ticketId, failingIds, passingIds }) {
  const failing = new Set(failingIds.map(id => id.toUpperCase()));
  const passing = new Set(passingIds.map(id => id.toUpperCase()));
  const parked = [];
  const unsure = [];
  const removals = [];

  findTestCalls(text).forEach(call => {
    if (call.title === null) {
      // Could not read this call: if it might be a failing case's
      // test, say so (it stays in the file).
      const line = text.slice(call.start, text.indexOf("\n", call.start));
      ticketCaseIds(line, ticketId)
        .filter(id => failing.has(id))
        .forEach(id => unsure.push({ id, reason: "test could not be parsed" }));
      return;
    }

    const ids = ticketCaseIds(call.title, ticketId);
    const failingHere = ids.filter(id => failing.has(id));

    if (!failingHere.length) return;

    if (ids.some(id => passing.has(id))) {
      failingHere.forEach(id => unsure.push({ id, reason: "same test also covers a passing case" }));
      return;
    }

    if (baseText && baseText.includes(call.title)) {
      failingHere.forEach(id => unsure.push({ id, reason: "test was already committed before this batch" }));
      return;
    }

    removals.push(call);
    failingHere.forEach(id => parked.push({ id, title: call.title }));
  });

  let result = text;

  removals
    .sort((a, b) => b.start - a.start)
    .forEach(call => {
      result = result.slice(0, call.start) + result.slice(call.end);
    });

  return { text: result, parked, unsure };
}

// True when the text still has at least one test(...) call.
function hasTestCalls(text) {
  return findTestCalls(text).length > 0;
}

// ------------------------------------------------------------
// Unused new page-object methods (after parking)
// ------------------------------------------------------------
//
// A method a parked (failing) test needed is often added to a page
// object in the same batch; once the test is parked nothing calls it.
// Only removed when ALL hold: it is new in this batch (`name(` is not
// in the base file), its signature fits on one line ending in `{`,
// and its name appears nowhere else in the given corpus (any file, any
// context — strings included). Iterates, so a helper used only by a
// removed method goes too. Anything unclear stays.

const METHOD_DEF_PATTERN = /^[ \t]*(?:static[ \t]+)?(?:async[ \t]+)?([A-Za-z_$][\w$]*)[ \t]*\([^()\n]*\)[ \t]*\{[ \t]*\r?$/gm;
const NOT_METHODS = new Set(["if", "for", "while", "switch", "catch", "function", "with", "return", "constructor", "else", "do", "try"]);
const IDENTIFIER_CHAR = /[A-Za-z0-9_$]/;

function countWord(text, word) {
  let count = 0;

  for (let index = text.indexOf(word); index !== -1; index = text.indexOf(word, index + word.length)) {
    const before = index > 0 ? text[index - 1] : "";
    const after = text[index + word.length] || "";

    if (!IDENTIFIER_CHAR.test(before) && !IDENTIFIER_CHAR.test(after)) count++;
  }

  return count;
}

// { name, start, end } for each removable-shaped method definition.
function findMethodDefs(text) {
  const defs = [];

  METHOD_DEF_PATTERN.lastIndex = 0;

  for (let match = METHOD_DEF_PATTERN.exec(text); match; match = METHOD_DEF_PATTERN.exec(text)) {
    const name = match[1];

    if (NOT_METHODS.has(name)) continue;

    const brace = text.lastIndexOf("{", match.index + match[0].length);
    const close = scanCode(text, brace + 1, "}");

    if (close < 0) continue;

    let end = close;

    while (end < text.length && (text[end] === " " || text[end] === "\t" || text[end] === ";")) end++;
    if (text[end] === "\r") end++;
    if (text[end] === "\n") end++;

    defs.push({ name, start: match.index, end });
    METHOD_DEF_PATTERN.lastIndex = close;
  }

  return defs;
}

// Start of the comment block directly above `start` (line-start index),
// or `start` itself when there is none.
function commentBlockStart(text, start) {
  let blockStart = start;

  while (blockStart > 0) {
    const prevEnd = blockStart - 1;
    const prevStart = text.lastIndexOf("\n", prevEnd - 1) + 1;
    const line = text.slice(prevStart, prevEnd).trim();

    if (!(line.startsWith("//") || line.startsWith("/*") || line.startsWith("*"))) break;
    blockStart = prevStart;
  }

  return blockStart;
}

/*
 * files:  [{ key, text, baseText }]  page-object files changed in this batch
 * corpus: { key: text }              every other file a call could be in
 * Returns { texts: { key: newText }, removed: [{ key, name }] }.
 */
function pruneUnusedNewMethods({ files, corpus }) {
  const texts = Object.fromEntries(files.map(file => [file.key, file.text]));
  const bases = Object.fromEntries(files.map(file => [file.key, file.baseText || ""]));
  const removed = [];

  for (let pass = 0; pass < 5; pass++) {
    const all = [...Object.values(corpus), ...Object.values(texts)];
    let changed = false;

    Object.keys(texts).forEach(key => {
      const candidates = findMethodDefs(texts[key]).filter(def => !bases[key].includes(`${def.name}(`));

      candidates
        .filter(def => all.reduce((sum, text) => sum + countWord(text, def.name), 0) === 1)
        .sort((a, b) => b.start - a.start)
        .forEach(def => {
          let start = def.start;
          const commentStart = commentBlockStart(texts[key], def.start);
          const comment = texts[key].slice(commentStart, def.start);

          if (comment && !bases[key].includes(comment.trim())) start = commentStart;

          let next = texts[key].slice(0, start) + texts[key].slice(def.end);

          // Do not leave two blank lines where the method was.
          if (next.slice(start - 2, start) === "\n\n" && next[start] === "\n") next = next.slice(0, start) + next.slice(start + 1);
          // ...nor a blank line right before the class's closing brace.
          if (next.slice(start - 2, start) === "\n\n" && /^[ \t]*\}/.test(next.slice(start))) next = next.slice(0, start - 1) + next.slice(start);

          texts[key] = next;
          removed.push({ key, name: def.name });
          changed = true;
        });
    });

    if (!changed) break;
  }

  return { texts, removed };
}

module.exports = {
  parkFailingTests,
  findTestCalls,
  ticketCaseIds,
  hasTestCalls,
  scanCode,
  pruneUnusedNewMethods,
  findMethodDefs,
};
