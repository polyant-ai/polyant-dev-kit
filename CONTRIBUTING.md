# Contributing to polyant-dev-kit

Thank you for helping improve the workspace. Most contributions are changes to a
skill under `.claude/skills/`, to the example agent under `agents/acme/`, or to the
plugin template under `templates/plugin/`.

## Before you open a pull request

1. Install and run the guard suite from the repository root:

       npm ci
       npm test

   It checks that every skill has valid frontmatter, that the two skill directories
   are identical, and that no tracked file contains a reference the deny-list in
   `tests/denylist.mjs` rejects.

2. If you changed a skill, change it in **both** `.claude/skills/` and
   `.agents/skills/` — or edit one and copy it across. Different coding agents read
   different paths, and the test fails when the copies diverge.

3. If you changed the plugin template, run its own tests too:

       cd templates/plugin
       npm ci
       npm test

4. Keep a skill about a decision, not an inventory. Commands and fields that the CLI
   or the product documentation already list are better left there; a skill earns
   its place with the judgement those listings cannot carry. Mark anything that
   exists only on Polyant Enterprise as **Enterprise**.

## Sign your work (DCO)

This project uses the [Developer Certificate of Origin](https://developercertificate.org/)
instead of a Contributor License Agreement. Every commit must carry a
`Signed-off-by` line, which `git commit -s` adds from your `user.name` and
`user.email`:

    git commit -s -m "docs(skills): clarify when a tool should gate"

If you forgot it on your last commit, amend it with `git commit --amend -s --no-edit`.

## Pull requests

- Open the pull request against `develop`.
- Use a [Conventional Commits](https://www.conventionalcommits.org/) title, for
  example `docs(cli-workflows): …` or `fix(template): …`.
- Say what changed and why. CI runs `npm ci && npm test` and must pass.

By contributing you agree that your contribution is licensed under the
[Apache License 2.0](LICENSE), the license of this repository.
