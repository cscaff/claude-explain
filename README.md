# Claude Explain

Highlight code in VS Code, hover over it, and get a short explanation from
[Claude Code](https://code.claude.com): what the lines do, how they fit the rest
of the file (with line numbers), and links to the documentation for the
concepts they use.

```python
rows = list(csv.DictReader(open(MANIFEST)))
```

> Reads every row of `Benchmark/manifest.csv` (path set on line 49) into a list of
> dicts, one per benchmark instance. Each dict is keyed by the CSV header, such as
> `id`, `tier` and `file`. Every value is a string until converted.
>
> `main()` passes this list to `select()` at line 212, which filters and sorts the
> rows. The same list goes to `summarize()` at line 257. …
>
> **Concepts:** [csv.DictReader](https://docs.python.org/3/library/csv.html#csv.DictReader),
> [open()](https://docs.python.org/3/library/functions.html#open),
> [list()](https://docs.python.org/3/library/stdtypes.html#list)

It is meant for reading code you didn't write yourself, including code an AI
assistant just wrote for you.

## Requirements

- VS Code 1.90 or later
- The [Claude Code CLI](https://code.claude.com/docs/en/setup), installed and
  logged in (`claude` runs in a terminal). The extension uses your existing Claude
  Code login; it needs no API key of its own.

## Install

No build step, no dependencies. Clone the repo and link it into VS Code's
extensions folder:

```sh
git clone https://github.com/cscaff/claude-explain
ln -s "$PWD/claude-explain" ~/.vscode/extensions/cscaff.claude-explain-0.1.0
```

Then run **Developer: Reload Window** from the command palette.

## Use

- **Hover:** select code, then rest the mouse over the selection. The status bar
  shows "Claude is explaining…" while it works (a few seconds with Haiku).
- **Keyboard:** select code and press `Cmd+Alt+E` (`Ctrl+Alt+E` on Windows/Linux),
  or right-click → **Claude Explain: Explain Selection**.

Answers are cached per file contents and selection, so hovering the same selection
again is instant. Editing the file asks again.

## Settings

| Setting | Default | |
|---|---|---|
| `claudeExplain.model` | `haiku` | Model passed to `claude --model`. `sonnet` or `opus` explain more carefully, but slower. |
| `claudeExplain.explainOnHover` | `true` | Off: only the command or keybinding explains, so a stray hover never makes a call. |
| `claudeExplain.claudePath` | | Path to `claude`. Empty: `~/.local/bin/claude` if present, else `claude` on `PATH`. |
| `claudeExplain.maxFileChars` | `60000` | Longer files are sent as a window around the selection. |

## How it works

Each explanation is one `claude -p` call with tools turned off. The prompt holds
the selection and the open file with line numbers, so Claude answers from that
file alone: it is fast, but it cannot see other files in your project. A hover you
dismiss early doesn't cancel the call; its answer is cached for the next hover.

**Privacy:** the open file (or a window of it) is sent to Anthropic through Claude
Code, as with any Claude Code request. Don't use it on code you are not allowed to
share with Anthropic.

## License

MIT
