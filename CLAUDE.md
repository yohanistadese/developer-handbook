# AI Coding Rules

Follow these rules when working in this repository.

## Before Changes

* Read the relevant files and existing patterns first.
* Reuse existing code and conventions.
* State which files you plan to change and why.

## Keep Changes Focused

* Only change files required for the task.
* Do not make unrelated refactors, renames, dependency updates, or formatting changes.
* Keep changes as small as possible.
* Report unrelated issues instead of fixing them.

## Security

* Never expose, print, log, copy, or commit secrets.
* Never hardcode passwords, API keys, tokens, or private keys.
* Never modify `.env`, SSH keys, Git credentials, or certificate/private-key files unless explicitly requested.
* Never add suspicious, obfuscated, or dynamically executed code.
* Do not add unrequested network calls, telemetry, or dependencies.

## Commands

Before running commands that install, delete, move, deploy, or otherwise change system state:

* Explain what the command does and why it is needed.
* Wait for approval.

Read-only commands such as `ls`, `cat`, searching, `git status`, and `git diff` do not require approval.

## Git Safety

* Review `git status` and the complete diff before committing.
* Never use `git add -A` blindly.
* Never push without explicit confirmation.
* Never force push, reset hard, rebase, amend commits, or delete branches/tags unless explicitly requested.
* Permission to commit does not mean permission to push.

## Unexpected Changes

If you find unexpected code, credentials, Git hooks, network endpoints, or working-tree changes:

* Stop.
* Report the issue and file path.
* Do not delete, modify, stash, or hide it.

## Code Style

* Follow the existing architecture, naming, formatting, imports, validation, and error-handling patterns.
* Reuse existing helpers instead of creating duplicates.
* Keep comments minimal and follow the project's existing comment style.
* Do not disable lint or validation rules to hide problems.

## Final Check

Before finishing:

* Confirm only requested files were changed.
* Review the final diff.
* Mention any remaining issues or limitations.
