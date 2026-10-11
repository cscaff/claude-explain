// Claude Explain: hover inside a selection (or press Cmd+Alt+E) and Claude Code explains
// what the selected lines do and how they fit the rest of the file, with doc links.
//
// Each explanation is one `claude -p` call (tools off, so it answers from the file it is
// given), cached per (file contents, selection). A hover that is dismissed while Claude is
// still answering does not cancel the call: the next hover over the same selection shows
// the cached answer at once.

const vscode = require("vscode");
const { spawn } = require("child_process");
const crypto = require("crypto");
const fs = require("fs");
const os = require("os");
const path = require("path");

const cache = new Map();          // key -> Promise<string>
const CACHE_MAX = 200;

function cfg() {
  return vscode.workspace.getConfiguration("claudeExplain");
}

function claudeBin() {
  const set = cfg().get("claudePath");
  if (set) return set;
  const local = path.join(os.homedir(), ".local", "bin", "claude");
  return fs.existsSync(local) ? local : "claude";
}

function sha(s) {
  return crypto.createHash("sha1").update(s).digest("hex");
}

// The file with line numbers, cut to a window around the selection if it is long.
function numberedSource(doc, sel) {
  const max = cfg().get("maxFileChars");
  let first = 0, last = doc.lineCount - 1;
  if (doc.getText().length > max) {
    const span = Math.max(50, Math.floor(max / 80));     // ~80 chars per line
    first = Math.max(0, sel.start.line - span);
    last = Math.min(doc.lineCount - 1, sel.end.line + span);
  }
  const out = [];
  for (let i = first; i <= last; i++) out.push(`${String(i + 1).padStart(5)}  ${doc.lineAt(i).text}`);
  const note = first > 0 || last < doc.lineCount - 1
    ? `(lines ${first + 1}-${last + 1} of ${doc.lineCount}; the rest is omitted)\n` : "";
  return note + out.join("\n");
}

function buildPrompt(doc, sel) {
  const rel = vscode.workspace.asRelativePath(doc.uri);
  const a = sel.start.line + 1, b = sel.end.line + 1;
  return `Someone reading this code has highlighted part of it and wants to understand it.
Explain the highlighted code for them.

File: ${rel}  (language: ${doc.languageId})
Highlighted: line${a === b ? ` ${a}` : `s ${a}-${b}`}
\`\`\`
${doc.getText(sel)}
\`\`\`

Full file:
\`\`\`
${numberedSource(doc, sel)}
\`\`\`

Write Markdown for a small hover card, at most ~170 words, no preamble, no headings:
1. One or two sentences: what the highlighted code does, concretely (name the actual values involved).
2. How it fits the program: where its inputs come from and what later code uses its result, citing line numbers ("used by \`select()\` at line 99").
3. One line starting "**Concepts:**" listing the language or library features it relies on, each as a Markdown link to the official documentation (e.g. docs.python.org, developer.mozilla.org). Only link URLs you are confident exist.
Do not restate the code. Do not use tools.`;
}

function runClaude(prompt) {
  return new Promise((resolve, reject) => {
    const args = ["-p", "--model", cfg().get("model"), "--tools", "", "--output-format", "text",
                  "--no-session-persistence"];
    const p = spawn(claudeBin(), args, { env: process.env });
    let out = "", err = "";
    p.stdout.on("data", d => (out += d));
    p.stderr.on("data", d => (err += d));
    p.on("error", e => reject(new Error(`could not start ${claudeBin()}: ${e.message}`)));
    p.on("close", code => code === 0 && out.trim()
      ? resolve(out.trim())
      : reject(new Error(err.trim() || `claude exited with code ${code}`)));
    p.stdin.end(prompt);
  });
}

function explain(doc, sel) {
  const key = sha(doc.uri.toString() + "\0" + doc.getText() + "\0" + sel.start.line + ":" +
                  sel.start.character + "-" + sel.end.line + ":" + sel.end.character);
  if (!cache.has(key)) {
    if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value);
    const job = runClaude(buildPrompt(doc, sel));
    job.catch(() => cache.delete(key));          // don't cache failures
    cache.set(key, job);
  }
  return cache.get(key);
}

function card(text) {
  const md = new vscode.MarkdownString(text + "\n\n---\n*Claude Explain*");
  md.supportHtml = false;
  md.isTrusted = false;
  return md;
}

let status;

async function explainWithStatus(doc, sel) {
  status.text = "$(loading~spin) Claude is explaining…";
  status.show();
  try {
    return await explain(doc, sel);
  } finally {
    status.hide();
  }
}

function activate(context) {
  status = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 0);
  const pending = new Set();       // documents whose next hover the command asked for
  context.subscriptions.push(status);

  context.subscriptions.push(vscode.languages.registerHoverProvider({ scheme: "file" }, {
    async provideHover(doc, pos) {
      const ed = vscode.window.activeTextEditor;
      if (!ed || ed.document !== doc) return;
      const sel = ed.selection;
      if (sel.isEmpty || !sel.contains(pos)) return;          // only inside a selection
      if (!cfg().get("explainOnHover") && !pending.has(doc.uri.toString())) return;
      pending.delete(doc.uri.toString());
      try {
        return new vscode.Hover(card(await explainWithStatus(doc, sel)), sel);
      } catch (e) {
        return new vscode.Hover(card(`Claude Explain failed: ${e.message}`), sel);
      }
    },
  }));

  // Command / keybinding: start the explanation, then open the hover at the cursor.
  context.subscriptions.push(vscode.commands.registerCommand("claudeExplain.explainSelection", async () => {
    const ed = vscode.window.activeTextEditor;
    if (!ed || ed.selection.isEmpty) return;
    pending.add(ed.document.uri.toString());   // lets the hover through when hover mode is off
    try {
      await explainWithStatus(ed.document, ed.selection);
    } catch (e) {
      vscode.window.showErrorMessage(`Claude Explain: ${e.message}`);
      return;
    }
    await vscode.commands.executeCommand("editor.action.showHover");
  }));

  context.subscriptions.push(vscode.commands.registerCommand("claudeExplain.clearCache", () => cache.clear()));
}

function deactivate() {}

module.exports = { activate, deactivate };
