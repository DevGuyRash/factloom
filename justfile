# Optional shortcuts for those who use `just`; every task is a ./resumes command underneath.
set shell := ["bash", "-euo", "pipefail", "-c"]

default:
    @just --list

# First-time setup: dependencies, git hooks (including the privacy guard), diff drivers, doctor
bootstrap:
    ./resumes setup

# Typecheck, repository check (and the demo), and tests
verify:
    cd tools && npm run typecheck
    ./resumes check
    RESUMES_ROOT=examples/demo ./resumes check
    cd tools && npm test

# Rebuild resumes from their sources, e.g. `just build --person <slug>`
build *args:
    ./resumes build-resumes {{args}}

# Bring in the newest engine
update:
    ./resumes update

# Anything else: `just run status`, `just run help`
run *args:
    ./resumes {{args}}
