# Shell completion

Tab completes `./resumes` in bash, zsh, fish, and PowerShell: commands, subcommands, flags, and the values flags take, taken from your repository as it is now.

| After | Tab offers |
|---|---|
| `./resumes ` | every command (with what it does, where the shell shows descriptions) |
| `./resumes themes ` | the subcommands: `check list new preview show` |
| `./resumes themes preview --` | the flags that command takes, minus any already on the line |
| `--person ` | the people in `people/` |
| `--variant `, `--theme `, `--themes a,` | that person's resume variants; the themes visible to them (the engine's, yours, theirs); a comma list keeps the items before it |
| `onboarding answer `, `inbox add --id ` | onboarding question ids, from the shared catalog and yours |
| `searches mark `, `template `, `guard allow ` | saved-search ids, document templates, git remotes |
| `--format `, `outcome <dir> `, `run log --kind ` | the fixed choices the command accepts |
| `tailor `, `letter `, `import ` | directories or files, from the shell's own completion |

## Load it

Replace `~/my-job-search` with where your copy lives. Each script works for `./resumes` inside the repository and for `resumes` when it is on your `PATH`.

| Shell | Install once |
|---|---|
| bash | `~/my-job-search/resumes completion bash > ~/.local/share/bash-completion/completions/resumes` (needs the bash-completion package), or add `source <(~/my-job-search/resumes completion bash)` to `~/.bashrc` |
| zsh | `~/my-job-search/resumes completion zsh > ~/.zfunc/_resumes`, with `fpath=(~/.zfunc $fpath)` before `compinit` in `~/.zshrc`; or, after `compinit`, add `source <(~/my-job-search/resumes completion zsh)` |
| fish | `~/my-job-search/resumes completion fish > ~/.config/fish/completions/resumes.fish` |
| PowerShell | add `& $HOME\my-job-search\resumes.cmd completion powershell \| Out-String \| Invoke-Expression` to `$PROFILE` (`pwsh` works as a shell name, too) |

Writing the script to a file once keeps your shell's startup fast; `source <(...)` runs the tools every time a shell starts. Open a new shell afterwards. Nothing here changes when the engine updates: the scripts only ask the tools what to offer, so a new command or flag completes right after `./resumes update`.

## What to expect

- Each Tab press runs the tools once, about a third of a second.
- Values after `--flag=value` are not completed: write `--person pat-lee` with a space.
- Each script runs the command word you typed (`./resumes`) with `__complete`, the same program you are about to run, so completion works wherever the command itself would.
- Completion never installs anything. Until the first `./resumes` run has installed its dependencies, Tab offers nothing.
- nushell, elvish, and xonsh are not covered; the protocol below is all a script for one of them needs.

## How it works

`resumes __complete --cur=<word under the cursor> -- <earlier words>` prints candidates, one per line (`value`, or `value<TAB>description`), then a last line, `:none`, `:files`, or `:dirs`, telling the shell whether to fall back to its own file or directory completion. The command is hidden from `help` and never fails: whatever goes wrong, it answers `:none`. The word under the cursor goes in `--cur=` because it is often empty, and PowerShell drops empty arguments.

The grammar comes from each command's `usage` string, so completion cannot drift from the commands, and a test fails when a command reads a flag its usage does not list. When you write a command, follow these conventions in `usage`:

- `<name>` is a placeholder; a bare lowercase word is a keyword. Keywords right after the command name are subcommands, and `a|b|c` lists alternatives.
- After a flag, the next token is its value (`--format csv|json`); a flag with nothing after it, or closing its bracket, is a switch (`[--force]`). A trailing `...` repeats the item, and parentheses hold notes the parser skips.
- Placeholder names carry meaning: `<variant>`, `<theme>`, `<catalog-id>`, `<search-id>`, `<template>`, and `<remote>` complete from the repository; a name ending in `dir` (or `root`) completes directories; one containing `file`, ending in `.md`, `.json`, and the like, or `path` completes files. `--person`, `--variant`, `--theme`, and `--themes` complete by flag name. Any other placeholder (`<name>`, `TEXT`) offers nothing.

A new kind of value (say, application directories by company) is a case in `providerValues` in `src/lib/complete.ts`, plus a placeholder name for it.
