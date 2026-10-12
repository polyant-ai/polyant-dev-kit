# Security Policy

## Reporting a vulnerability

**Please do not open a public GitHub issue to report a security vulnerability.**

Use GitHub's private vulnerability reporting instead:

1. Go to the repository's **Security** tab.
2. Click **Report a vulnerability**.
3. Describe the issue, the steps to reproduce it, the affected version or commit,
   and the impact you expect.

We acknowledge reports within a few working days and coordinate disclosure with you.

## Scope

This repository is a workspace: skills, an example agent configuration, a plugin
template and a test suite. A report belongs here when the vulnerability is in one of
those — for example, guidance or template code that leads a reader to expose a
credential or to build an exploitable tool.

A vulnerability in the Polyant engine or admin panel belongs to the
[Polyant repository](https://github.com/polyant-ai/polyant), and one in `polyant-cli`
or the plugin SDK to their own repositories; please report it there, through the same
private channel.

## Supported versions

Fixes land on `develop` and ship with the next release. Only the latest release is
supported.
