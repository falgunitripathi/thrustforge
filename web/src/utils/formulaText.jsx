/**
 * Turns this project's own formula strings (e.g. "T = mdot_a*[(1+f)*V9 -
 * U] + A9*(p9-p_a) (Ref §3) — the core stream's thrust...") into a
 * plain-language explanation plus a formula line typeset with real
 * subscripts/superscripts and Greek letters, instead of code-style
 * identifiers (mdot_a, T04, eta_b) — meant to read closer to how the
 * same formula appears printed in the textbook this project cites,
 * not like a line of code. Used by FormulaModal for every "click a
 * result/parameter to see its formula" spot across every engine.
 */

const GREEK = {
  eta: "η", gamma: "γ", beta: "β", lambda: "λ", pi: "π", alpha: "α",
  delta: "δ", Delta: "Δ", sigma: "σ", phi: "φ", theta: "θ",
  omega: "ω", Omega: "Ω", mu: "μ", rho: "ρ",
};
// Identifiers in these formulas glue a Greek/mdot name straight onto its
// own subscript with "_" (e.g. "eta_b", "mdot_a") — "_" counts as a
// word character in JS regex, so a plain \b...\b match never fires
// there. Lookaround on "not a letter" (allowing a following "_" or
// digit through) finds the name without matching it as a substring of
// an unrelated word (e.g. "eta" inside "beta"/"theta": the character
// immediately before it there is a letter, so the lookbehind rejects it).
const GREEK_RE = new RegExp(`(?<![A-Za-z])(${Object.keys(GREEK).join("|")})(?![A-Za-z])`, "g");

function replaceSymbols(s) {
  let out = s
    // Bare "T04", "V9", "A11", "p9" — a letter directly followed by 1-3
    // digits with no underscore — read as an implicit subscript, the
    // same way the source's own station numbering does.
    .replace(/([A-Za-z])([0-9]{1,3})(?![0-9])/g, (_m, letter, digits) => `${letter}_{${digits}}`)
    .replace(GREEK_RE, (m) => GREEK[m] || m)
    .replace(/(?<![A-Za-z])mdot(?![A-Za-z])/g, "ṁ")
    .replace(/\*/g, "·")
    .replace(/>=/g, "≥")
    .replace(/<=/g, "≤")
    .replace(/!=/g, "≠")
    .replace(/(?<![A-Za-z])sqrt(?![A-Za-z])/g, "√");
  return out;
}

/**
 * Splits a formula string into three parts: the bare equation, its
 * citation (this project's own convention — a parenthetical containing
 * "§", "Ref", or "NPTEL"), and the plain-English explanation after it.
 * Keeping the citation out of the equation itself means the "paper"
 * display shows pure math, the way a textbook would, with the citation
 * as a small reference tag instead of sitting inside the formula.
 */
export function splitFormula(raw) {
  const match = /\(([^()]*(§|Ref|NPTEL|reference\/)[^()]*)\)/.exec(raw);
  if (!match) return { equation: raw.trim(), citation: "", explanation: "" };
  const equation = raw.slice(0, match.index).trim();
  const citation = match[1].trim();
  let explanation = raw.slice(match.index + match[0].length).trim();
  explanation = explanation.replace(/^[.\s—-]+/, "").trim();
  return { equation, citation, explanation };
}

/**
 * Renders a formula string as an array of React nodes with real
 * subscripts (`_x` or `_{xy}`) and superscripts (`^x`, `^{xy}`, or
 * `^(...)`) instead of plain underscores/carets, plus Greek letters and
 * a few symbol substitutions (see replaceSymbols above).
 */
export function renderFormulaText(raw) {
  const s = replaceSymbols(raw);
  const nodes = [];
  let i = 0;
  let key = 0;
  while (i < s.length) {
    const ch = s[i];
    if (ch === "_" || ch === "^") {
      i += 1;
      let content = "";
      if (s[i] === "{") {
        const end = s.indexOf("}", i);
        if (end !== -1) {
          content = s.slice(i + 1, end);
          i = end + 1;
        } else {
          content = s.slice(i + 1);
          i = s.length;
        }
      } else if (s[i] === "(") {
        let depth = 0;
        let j = i;
        for (; j < s.length; j += 1) {
          if (s[j] === "(") depth += 1;
          else if (s[j] === ")") {
            depth -= 1;
            if (depth === 0) {
              j += 1;
              break;
            }
          }
        }
        content = s.slice(i, j);
        i = j;
      } else {
        const m = /^[A-Za-zΑ-Ωα-ω0-9]+/.exec(s.slice(i));
        if (m) {
          content = m[0];
          i += m[0].length;
        } else {
          content = ch;
        }
      }
      const Tag = ch === "_" ? "sub" : "sup";
      nodes.push(<Tag key={key++}>{content}</Tag>);
    } else {
      let j = i;
      while (j < s.length && s[j] !== "_" && s[j] !== "^") j += 1;
      nodes.push(s.slice(i, j));
      i = j;
    }
  }
  return nodes;
}
