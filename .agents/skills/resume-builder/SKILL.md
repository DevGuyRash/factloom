---
name: resume-builder
description: Build or improve a truthful, role-specific resume from a person's existing records and focused interview, current employer research, and review of the delivered files. Use for a first resume, a rebuild, or stronger variants; not for starting applications.
---

# Resume builder

A resume is evidence that this person can do the work the reader needs. Build the strongest supported case, not the longest inventory or highest keyword count. The repository keeps each claim in `people/<person>/resumes/source/facts.yaml`, its source in `evidence.md`, variants selecting facts, themes controlling appearance, and guides explaining targets ([resumes reference](../job-application/references/resumes.md)). For a new person, follow AGENTS.md's private-copy setup first.

## What holds throughout

- Facts come from the person and their authorized records, never from a target posting. Preserve verified skills, customer-facing and business strengths, official titles, chronology, ownership, and earlier corrections. A repository or prototype alone does not establish employment, production use, or business results.
- Reworded or inferred claims keep their exact phrase in the bullet's `confirm` until approved; unresolved non-bullet claims go in the guide's manual `review`. Keep prior confirmations for unchanged claims. Research changes emphasis and language within factual scope. Unsupported requirements stay explicit gaps.
- Read existing records before asking for more. Ask focused, material questions; draft the supported parts while uncertain claims wait. Review copies use `--out` so active files are preserved until the new version is approved. Resume work leaves application permissions and pauses unchanged.

## The work

1. **Frame the target.** Use the person's stated roles, level, field, locations, and constraints. Resolve only material ambiguity. Record the target and a plain-language argument: what they can do, for whom, and what evidence proves it. For a rewrite, identify what is changing and retain the established facts and usable baseline.
2. **Research the decisions** ([research](references/research.md)). Compare current employer requirements with the person's evidence, including work and outcomes beyond tool names. Cover meaningful differences between the requested targets, reuse dated sources, and stop when additional sources no longer change the case, variant boundaries, or material gaps. Record limits honestly.
3. **Recover missing proof** ([interviewing](references/interviewing.md)). Start with the records, then clarify relevant incidents, personal contribution, scale, users, and results. Record source and uncertainty as you go. Concrete work can be persuasive without metrics; never invent them.
4. **Write distinct variants** ([writing](references/writing.md)). Select the strongest evidence for each genuinely different audience while preserving supported search terms and skills. `./resumes variant new <name> --person <slug> --no-build` creates a guide and structure listing all facts; narrow it before rendering. Before revising existing sources, add a manual pending-approval item to every affected guide. Build review copies with `./resumes build-resumes --person <slug> --variant <name> --out <review-dir>`. The build's mechanical floor is neither editorial approval nor an ATS guarantee.
5. **Review and revise** ([review](references/review.md)). Have a fresh reader, when available, assess the built resume against the target before seeing the writer's rationale. Verify concerns against sources, inspect each delivered format's text and rendered pages, correct material defects, and check that corrections introduced none. Stop when remaining items need specific evidence or are optional preferences.
6. **Deliver and settle.** Give the person the reviewed files, each variant's purpose, material changes, and a focused batch of unresolved claims. Keep their theme unless a different layout is useful or requested; offer previews when appearance needs a decision. Update guides from the research rather than repeating it. Preserve review items until resolved.

A draft is deliverable with clearly labeled uncertainties. A variant is sendable only after the person approves it, factual and manual review items are resolved, the final active files pass the file review, and `./resumes check` passes (with any accepted mechanical warnings explained). Approval of a resume does not start an application campaign. Report what was actually built and checked, and any unavailable format or blocked decision.
