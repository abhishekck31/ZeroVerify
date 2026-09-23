/**
 * Matching requested field values against text extracted from a PDF.
 *
 * The original checks were `page.toLowerCase().includes(value.toLowerCase())`,
 * which accepts a value appearing anywhere for any reason, and the shared
 * normaliser stripped punctuation - so a CGPA of "9.1" became "91" and matched
 * inside "19.15". These helpers match whole values only, and for fields that
 * carry a label in the document they require the value to appear next to it.
 */

/** Characters that may not sit directly against a match. */
const VALUE_CHARS = "a-z0-9.";

/**
 * Lowercases, folds unicode, and reduces everything that is not a value
 * character to a single space. Dots survive because they carry meaning in a
 * CGPA; everything else becomes a separator.
 */
export function normalizeForMatch(text: string): string {
  return text
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9.]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Builds a pattern that matches `value` as a whole value.
 *
 * Internal whitespace is allowed to vary, since PDF extraction spaces words
 * unpredictably, but the match may not run into adjacent letters, digits or
 * dots - which is what stops "9.1" matching inside "19.15".
 */
function valuePattern(value: string): RegExp | null {
  const normalized = normalizeForMatch(value);
  if (!normalized) return null;

  const body = normalized.split(" ").map(escapeRegExp).join("\\s+");
  return new RegExp(`(?<![${VALUE_CHARS}])${body}(?![${VALUE_CHARS}])`);
}

/** True when any page contains `value` as a whole value. */
export function containsValue(pages: string[], value: string): boolean {
  const pattern = valuePattern(value);
  if (!pattern) return false;
  return pages.some((page) => pattern.test(normalizeForMatch(page)));
}

/**
 * True when `value` appears shortly after one of `labels`.
 *
 * Keeps a PAN-shaped string elsewhere in the document from satisfying the PAN
 * field. `window` is how many characters after the label still count as part
 * of that field, which has to tolerate the spacing PDF extraction produces.
 */
export function containsValueNearLabel(
  pages: string[],
  value: string,
  labels: string[],
  window = 80
): boolean {
  const pattern = valuePattern(value);
  if (!pattern) return false;

  const normalizedLabels = labels.map(normalizeForMatch).filter(Boolean);

  return pages.some((page) => {
    const text = normalizeForMatch(page);

    for (const label of normalizedLabels) {
      let from = text.indexOf(label);
      while (from !== -1) {
        const start = from + label.length;
        if (pattern.test(text.slice(start, start + window))) return true;
        from = text.indexOf(label, from + 1);
      }
    }
    return false;
  });
}

/** A person's name, matched as a whole name. */
export function matchesName(pages: string[], name: string): boolean {
  return containsValue(pages, name);
}

/** An institute name, matched as a whole name. */
export function matchesInstitute(pages: string[], institute: string): boolean {
  return containsValue(pages, institute);
}

/** A roll or registration number. */
export function matchesAcademicId(pages: string[], id: string): boolean {
  return containsValue(pages, id);
}

/**
 * A PAN, which must sit next to its label. A ten-character PAN-shaped token
 * can appear in a document for other reasons, so position matters.
 */
export function matchesPan(pages: string[], pan: string): boolean {
  return containsValueNearLabel(pages, pan, [
    "pan",
    "permanent account number",
  ]);
}

/**
 * A CGPA, which must sit next to its label. Bare numbers are far too common
 * for a whole-value match on its own to mean anything.
 */
export function matchesCgpa(pages: string[], cgpa: string): boolean {
  return containsValueNearLabel(pages, cgpa, [
    "cgpa",
    "gpa",
    "grade point average",
    "cumulative grade point average",
  ]);
}
