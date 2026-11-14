import { parse } from "acorn";

export type QualityCheck = { id: string; label: string; passed: boolean; detail: string };
export type WebQualityReport = {
  scope: "static-source";
  passed: boolean;
  checks: QualityCheck[];
  sourceBytes: number;
  note: string;
};

const has = (code: string, pattern: RegExp): boolean => pattern.test(code);
function condition(id: string, label: string, passed: boolean, failure: string): QualityCheck {
  return { id, label, passed, detail: passed ? "Source check passed" : failure };
}

export function isSingleFileWebTask(prompt: string): boolean {
  return /minesweeper|single[\s-]*file.{0,35}html|html.{0,35}single[\s-]*file/i.test(prompt);
}
export function isMinesweeperTask(prompt: string): boolean {
  return /minesweeper|mine[\s-]*sweeper/i.test(prompt);
}
function hasSuspiciousStartupLoss(js: string): boolean {
  // Known regression: checkGameOver returns true while a mine is still HIDDEN.
  // This is a narrow heuristic, not proof of logical correctness.
  const entry = /\bfunction\s+(?:checkGameOver|isGameOver|gameOver)\s*\([^)]*\)\s*\{/ig;
  for (const match of js.matchAll(entry)) {
    const area = js.slice(match.index, match.index + 1800);
    const checks = [...area.matchAll(/\bif\s*\(([\s\S]{0,320}?)\)\s*(?:\{\s*)?return\s+true\b/g)];
    for (const check of checks) {
      if (/mine|ismine/i.test(check[1]) && /!\s*[\w.()[\]]*(?:revealed|opened|uncovered)/i.test(check[1])) {
        return true;
      }
    }
  }
  return false;
}
function inlineScripts(source: string): { attributes: string; content: string }[] {
  return [...source.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi)]
    .map(match => ({ attributes: match[1], content: match[2] }));
}
function scriptHasSyntaxErrors(scripts: {attributes:string;content:string}[]): string[] {
  const errors: string[] = [];
  scripts.forEach((script, index) => {
    if (/\bsrc\s*=/i.test(script.attributes) || !script.content.trim()) return;
    if (/\btype\s*=\s*["'](?:application\/ld\+json|application\/json)["']/i.test(script.attributes)) return;
    try {
      parse(script.content, {ecmaVersion: "latest", sourceType: /\btype\s*=\s*["']module["']/i.test(script.attributes) ? "module" : "script"});
    } catch (err) {
      errors.push("Inline script " + (index+1) + ": " + String(err).slice(0, 200));
    }
  });
  return errors;
}

export function inspectWebSource(source: string, prompt: string): WebQualityReport {
  const checks: QualityCheck[] = [];
  const documentComplete = has(source, /<html\b/i) && has(source, /<\/html\s*>/i)
    && has(source, /<body\b/i) && has(source, /<\/body\s*>/i);
  checks.push(condition("html-document", "Complete HTML document", documentComplete,
    "The file needs html/body opening and closing tags."));
  const scripts = inlineScripts(source);
  const errors = scriptHasSyntaxErrors(scripts);
  const js = scripts.filter(script => !/\bsrc\s*=/i.test(script.attributes)).map(s => s.content).join("\n");
  const hasScript = scripts.some(s => s.content.trim().length > 0);
  checks.push(condition("javascript-syntax", "Parseable inline JavaScript", hasScript && errors.length === 0,
    errors.length ? errors.join("; ") : "No runnable inline JavaScript was found."));
  if (isSingleFileWebTask(prompt)) {
    const external = /<script\b[^>]*\bsrc\s*=/i.test(source)
      || /<link\b[^>]*\brel\s*=\s*["']stylesheet["'][^>]*\bhref\s*=/i.test(source);
    checks.push(condition("self-contained", "No required external script or stylesheet", !external,
      "A single-file app must not rely on another script or stylesheet."));
  }
  if (isMinesweeperTask(prompt)) {
    const hasBoard = has(source, /(?:id|class)\s*=\s*["'][^"']*(?:game-board|minefield|board|grid)[^"']*["']/i)
      || has(js, /\bcreateElement\s*\(\s*["'](?:div|button|table)["']\s*\)/i);
    const actualTiles = [...source.matchAll(/<(?:div|button|td)\b[^>]*(?:class|data-cell|role)\s*=\s*["'][^"']*(?:cell|tile|gridcell)[^"']*["']/gi)].length;
    const canInsertTiles = has(js, /(?:createElement\s*\(|\.innerHTML\s*=|insertAdjacentHTML\s*\(|appendChild\s*\(|replaceChildren\s*\(|\.append\s*\()/i);
    checks.push(condition("render-board", "Code creates visible board tiles", hasBoard && (actualTiles >= 9 || canInsertTiles),
      "A board container alone is not enough. The game must create or insert clickable tile elements."));
    checks.push(condition("cell-clicks", "Cell click event is connected", has(js, /addEventListener\s*\(\s*["']click["']|\.onclick\s*=|onmousedown\s*=|addEventListener\s*\(\s*["']pointerdown["']/i)
      || has(source, /\bonclick\s*=/i),
      "No event handler connects a player click to the game."));
    checks.push(condition("startup-loss", "No known hidden-mine instant-loss bug",
      !hasSuspiciousStartupLoss(js) && !/<(?:span|p|div)[^>]*>\s*(?:game over|you lose|you lost)\s*<\/(?:span|p|div)>/i.test(source),
      "checkGameOver appears to end the game because mines remain hidden, or the initial page already displays defeat."));
    checks.push(condition("flags", "Right-click flag interaction", has(js, /contextmenu|oncontextmenu/i)
      && has(js, /\bflag(?:ged|s)?\b/i),
      "Minesweeper needs a right-click flag handler and a flag state."));
    checks.push(condition("restart", "Restart/reset mechanism", has(js, /\b(?:restart|resetGame|newGame|initGame|startGame)\b/i)
      && has(source, /restart|reset|new game/i),
      "No identifiable restart control and game reset routine were found."));
    checks.push(condition("mine-numbers", "Neighboring mine counts can render",
      has(js, /neighbor|neighbour|adjacent|around|count/i)
      && has(js, /textContent|innerText|innerHTML/i),
      "The game must calculate nearby mines and display the count on revealed tiles."));
    if (/timer|stopwatch|countdown/i.test(prompt)) {
      checks.push(condition("timer", "Working timer mechanism", has(js, /setInterval|requestAnimationFrame|setTimeout/i)
        && has(source, /timer|time|seconds/i),
        "The requested timer needs a display and an update mechanism."));
    }
  }
  const passed = checks.every(check => check.passed);
  return {
    scope: "static-source",
    passed,
    checks,
    sourceBytes: new TextEncoder().encode(source).length,
    note: passed
      ? "Static source checks passed. Actual browser behavior has NOT been tested in LocalForge."
      : "Static checks found problems. The file is NOT verified or ready to approve automatically."
  };
}

export function failedChecks(report: WebQualityReport): QualityCheck[] {
  return report.checks.filter(check => !check.passed);
}

export function buildRepairRequest(original: string, source: string, report: WebQualityReport, maxChars = 10500): string {
  const problems = failedChecks(report).map((item, i) => (i+1) + ". " + item.label + ": " + item.detail).join("\n");
  const budget = Math.max(1200, maxChars - original.length - problems.length - 850);
  const previous = source.length > budget ? source.slice(0, budget) + "\n[prior file excerpt truncated]" : source;
  return "You are REPAIRING an existing implementation, not describing a future fix.\n"
    + "ORIGINAL REQUEST:\n" + original.slice(0, 1800)
    + "\n\nAUTOMATED SOURCE CHECK FAILURES:\n" + problems
    + "\n\nPREVIOUS FILE CONTENTS:\n" + previous
    + "\n\nReturn one COMPLETE corrected HTML file in a fenced html block. "
    + "It must create actual visible cells, connect click/right-click events, start without defeat, "
    + "implement flagging, win/loss, neighboring counts and restart. "
    + "Do not claim to have executed or browser-tested it.";
}
