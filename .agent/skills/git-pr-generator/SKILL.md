---
name: git-pr-generator
description: Generates a standardized Pull Request title and description from git commit history. Use this whenever the user asks to create a PR title and description, or to merge one branch into another.
---

# Git PR Generator Skill

When the user asks to create a PR title and description, you MUST follow this exact process and output format — no exceptions.

---

## Step 1: Gather Commits

Run the following command to get all commits that will be included in the PR:

```bash
git log <base-branch>..<head-branch> --oneline
```

- `<base-branch>` is typically `main`
- `<head-branch>` is typically `dev`

---

## Step 2: Generate the PR Title

The PR title MUST follow the Conventional Commits format:

```
<type>(<scope>): <short description> (v<version>)
```

Rules:
- Use the **dominant type** across all commits (e.g., if most commits are `feat`, use `feat`)
- `scope` is optional — use it only when changes are clearly scoped to one module
- `short description` must be in **English**, imperative mood, max 72 characters
- Append the current package version at the end as `(v<version>)`

Example:
```
feat(chat): add bot contact sync and LINE rich media support (v0.0.13)
```

---

## Step 3: Generate the PR Description

The PR description MUST use the **exact fixed section structure** below. Do not rename, reorder, or add new sections.

```markdown
## Summary

<One short paragraph describing the overall goal of this PR.>

---

## Changes

### 🔧 Refactors & Architecture
<bullet list — leave empty / remove if no relevant commits>

### ✨ New Features
<bullet list — leave empty / remove if no relevant commits>

### 🐛 Bug Fixes
<bullet list — leave empty / remove if no relevant commits>

### 🚀 CI/CD & Infrastructure
<bullet list — leave empty / remove if no relevant commits>

### 📦 Dependencies & Version
<bullet list — leave empty / remove if no relevant commits>

---

## Version
`v<version>`
```

### Section Assignment Rules

Map commit types to sections using this fixed table:

| Commit type | → Section |
|---|---|
| `feat` | ✨ New Features |
| `fix` | 🐛 Bug Fixes |
| `refactor`, `perf`, `style` | 🔧 Refactors & Architecture |
| `chore` (CI/CD, workflow, docker) | 🚀 CI/CD & Infrastructure |
| `chore` (version bump, deps) | 📦 Dependencies & Version |
| `docs`, `test` | omit from description |

### Bullet Point Format

Each bullet point under a section MUST follow this format:

```
- <Capitalized short description of the change>
```

- Write in English
- Imperative mood (e.g., "Add bot info caching" not "Added bot info caching")
- Keep each bullet to one line, max ~100 characters
- Group closely related commits into a single bullet (do not list every single commit separately)

---

## Step 4: Output

Output the PR title and description in a single markdown code block, separated clearly:

```
**Title:**
<title here>

---

**Description:**
<description here>
```

Do NOT output anything else — no extra commentary, no alternative formats.
