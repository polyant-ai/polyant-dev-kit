import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * References that do not belong in this workspace. Each entry carries the reason
 * so a failing test explains itself.
 *
 * Every rule here is generic: it names a class of mistake any workspace built on
 * Polyant can make. Names that are private to you — your own customers, internal
 * repositories, product codenames — go in an extra list that stays on your machine
 * (see `loadExtraDenylist` below), so the check still runs without publishing them.
 */
export const DENYLIST = [
  { pattern: /packages\/(engine|web)/, why: "engine source path — this workspace has no engine checkout" },
  { pattern: /\btsx watch\b/, why: "engine development workflow, not an agent-building one" },
  { pattern: /npm run \S+ -w /, why: "monorepo workspace command — this workspace is not a monorepo" },
  { pattern: /\bregisterTool\b/, why: "legacy tool contract — only defineTool is public" },
  { pattern: /strict-mode\.test\.ts/, why: "engine test file — this workspace has none" },
  // Naming ANOTHER repo's instruction file leaks its layout, and a skill that
  // says "see CLAUDE.md" sends the reader to a file this workspace does not have.
  // But this workspace has its own at the root — it is what a Claude Code session
  // loads — and the three files below are exactly the ones that must be able to
  // say so. Everywhere else, including every skill, the reference stays banned.
  {
    pattern: /\bCLAUDE\.md\b/,
    why: "instruction file of another repo — this workspace's own is named only in README.md, AGENTS.md and CLAUDE.md",
    allowIn: ["README.md", "AGENTS.md", "CLAUDE.md"],
  },
  { pattern: /docs\/plugins\.md/, why: "engine doc — this repo has no docs/ tree" },
  { pattern: /\/Users\//, why: "absolute local path" },
  { pattern: /\.claude\/worktrees/, why: "local session artefact" },

  // Internal schema and framework-maintainer rules. A reader of this workspace
  // cannot act on either: they have no database access, and no way to change the
  // framework.
  {
    pattern: /\binstance_(tools|prompts|skills|secrets|channels|hooks|room|skill_env|retention_policies)\b/,
    why: "internal database table",
  },
  {
    pattern: /general-purpose framework/i,
    why: "framework-first constraint — a rule for framework maintainers, not agent builders",
  },

  // A declarative sync that does not exist. This repo shipped for a while
  // promising `polyant pull` / `diff` / `push`; the CLI that was actually built
  // is imperative and has none of them. Naming them again sends a coding agent
  // to invent a command and report a tooling failure when it exits 2.
  {
    pattern: /\bpolyant(-cli)? (pull|push|diff)\b/,
    why: "no declarative sync exists — configuration is read and written one field at a time",
  },

  // A relative link climbing two or more levels escapes .claude/skills/ and lands
  // somewhere this repo does not have. It is how a link to another repo's docs
  // tree survives a copy: the text names no forbidden path, but the target is gone.
  {
    pattern: /\]\(\.\.\/\.\.\//,
    why: "relative link escaping the skills directory — the target does not exist here",
  },
];

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

/** Where the private list is read from unless `DENYLIST_EXTRA_FILE` names another path. */
export const DEFAULT_EXTRA_FILE = "tests/denylist.local.txt";

/**
 * An optional, private extra list: one case-insensitive regular expression per
 * line, `#` starting a comment. It is read from `DENYLIST_EXTRA_FILE` when that
 * variable is set, and otherwise from `tests/denylist.local.txt`, which is
 * gitignored. A missing default file means no extra rules; a path set in the
 * variable that does not exist is an error, so a typo cannot pass silently.
 */
export function loadExtraDenylist(env = process.env) {
  const configured = env.DENYLIST_EXTRA_FILE;
  const path = configured ? configured : join(ROOT, DEFAULT_EXTRA_FILE);
  if (!existsSync(path)) {
    if (configured) throw new Error(`DENYLIST_EXTRA_FILE points to a missing file: ${configured}`);
    return [];
  }
  return readFileSync(path, "utf8")
    .split("\n")
    .map((line) => line.replace(/#.*$/, "").trim())
    .filter(Boolean)
    .map((source) => ({ pattern: new RegExp(source, "i"), why: "private extra deny-list" }));
}
