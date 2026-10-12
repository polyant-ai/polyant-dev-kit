import { describe, it, expect } from "vitest";
import { execSync } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { DENYLIST, loadExtraDenylist } from "./denylist.mjs";

const SKILLS_DIR = ".claude/skills";
// The same skills, for a coding agent that reads `.agents/` instead of
// `.claude/`. Two copies exist because the harnesses disagree on the path, not
// because the knowledge differs — so they must stay byte-identical.
const MIRROR_SKILLS_DIR = ".agents/skills";
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

const skillDirs = readdirSync(SKILLS_DIR).filter((entry) =>
  statSync(join(SKILLS_DIR, entry)).isDirectory(),
);

// Extensions worth scanning for a reference that does not belong here. Restricted
// to text the DENYLIST patterns make sense against — a lockfile is
// machine-generated noise, never authored prose, so it is excluded even though
// it matches ".json".
const TEXT_EXTENSIONS = [".md", ".yaml", ".yml", ".json", ".ts", ".mjs"];
const TEXT_BASENAMES = new Set([".gitignore"]);
const isLockfile = (name) => /(^|[-.])lock(file)?\.(json|ya?ml)$/i.test(name) || name === "yarn.lock";

// The denylist's own source is necessarily full of the literal strings it
// checks for (that's what a pattern IS) — it would fail against itself, not
// because of a leak, but because it is the definition. It is enforcement
// machinery, not prose for the reader, so it is exempt from its own scan.
const SELF_EXEMPT = new Set(["tests/denylist.mjs"]);

function isScannableText(path) {
  if (SELF_EXEMPT.has(path)) return false;
  const name = path.split("/").pop();
  if (isLockfile(name)) return false;
  if (TEXT_BASENAMES.has(name) || name.endsWith(".example")) return true;
  return TEXT_EXTENSIONS.some((ext) => name.endsWith(ext));
}

// Every file *tracked by git* is fair game for a leaked internal reference —
// the guard used to only walk .claude/skills, so README.md, AGENTS.md,
// polyant.yaml, .gitignore and everything under templates/ were never
// scanned. `git ls-files` also means node_modules/.git and the private extra
// list need no explicit exclusion: they aren't tracked (or are gitignored) already.
function trackedTextFiles() {
  return execSync("git ls-files", { cwd: ROOT, encoding: "utf8" })
    .split("\n")
    .filter(Boolean)
    .filter(isScannableText);
}

const RULES = [...DENYLIST, ...loadExtraDenylist()];

function denylistHits(paths) {
  const hits = [];
  for (const path of paths) {
    readFileSync(join(ROOT, path), "utf8")
      .split("\n")
      .forEach((line, index) => {
        for (const { pattern, why, allowIn } of RULES) {
          // `allowIn` names the few files where a pattern is legitimate. It is
          // per-rule and per-file on purpose: a blanket exemption for a whole
          // file would silence every other rule in it too.
          if (allowIn?.includes(path)) continue;
          if (pattern.test(line)) hits.push(`${path}:${index + 1} — ${pattern} (${why})`);
        }
      });
  }
  return hits;
}

describe("skills directory", () => {
  it("is not empty", () => {
    expect(skillDirs.length).toBeGreaterThan(0);
  });
});

describe("skills mirror", () => {
  // Editing one copy and forgetting the other is silent: each harness reads only
  // its own path, so half the users keep the stale skill and nothing complains.
  it("carries the same skills in both harness directories, byte for byte", () => {
    const mirrored = readdirSync(MIRROR_SKILLS_DIR).filter((entry) =>
      statSync(join(MIRROR_SKILLS_DIR, entry)).isDirectory(),
    );
    expect(mirrored.sort()).toEqual([...skillDirs].sort());

    const diverged = skillDirs.filter(
      (dir) =>
        readFileSync(join(SKILLS_DIR, dir, "SKILL.md"), "utf8") !==
        readFileSync(join(MIRROR_SKILLS_DIR, dir, "SKILL.md"), "utf8"),
    );
    expect(diverged).toEqual([]);
  });
});

describe("repo-wide denylist scan", () => {
  it("contains no denied reference in any tracked text file", () => {
    expect(denylistHits(trackedTextFiles())).toEqual([]);
  });
});

describe("private extra deny-list", () => {
  it("reads one case-insensitive pattern per line and skips comments", () => {
    const file = join(mkdtempSync(join(tmpdir(), "denylist-")), "extra.txt");
    writeFileSync(file, "# a comment\n\nsecret-codename  # trailing comment\n");
    const rules = loadExtraDenylist({ DENYLIST_EXTRA_FILE: file });
    expect(rules).toHaveLength(1);
    expect(rules[0].pattern.test("Secret-Codename")).toBe(true);
  });

  it("refuses a configured path that does not exist", () => {
    expect(() => loadExtraDenylist({ DENYLIST_EXTRA_FILE: "/nonexistent/extra.txt" })).toThrow(/missing file/);
  });
});

describe.each(skillDirs)("skill: %s", (dir) => {
  it("has valid frontmatter", () => {
    const raw = readFileSync(join(SKILLS_DIR, dir, "SKILL.md"), "utf8");
    const match = raw.match(/^---\n([\s\S]*?)\n---/);
    expect(match, "SKILL.md must start with a frontmatter block").toBeTruthy();
    const frontmatter = match[1];
    // Compare as a string rather than building a RegExp from the directory name:
    // a name carrying a regex metacharacter would either widen the match or throw.
    const declaredName = frontmatter.match(/^name:\s*(.+?)\s*$/m)?.[1];
    expect(declaredName).toBe(dir);
    expect(frontmatter).toMatch(/^description:\s*Use when /m);
  });
});
