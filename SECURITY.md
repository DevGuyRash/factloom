# Security

factloom handles people's resumes, contact details, and application answers, and drives a browser in their accounts. Please report vulnerabilities privately: use GitHub's "Report a vulnerability" button on this repository's Security tab, not a public issue.

Helpful reports include the affected command or file, steps to reproduce, and the impact (for example, a way personal data could reach a public repository, or page text that could steer an agent).

Design notes that matter for security:

- Personal data stays in `people/` and `custom/` in each person's private repository; the pre-push guard (`tools/src/commands/guard.ts`) enforces it.
- Government ID numbers, dates of birth, and bank details are never stored; the agent holds those steps for the person. Passwords never go in tracked files: a password manager fills them, or a person may type one into a hidden prompt for a single session; it is kept in a git-ignored file and cleared afterwards.
- Text on job sites that addresses agents is treated as page content, never as instructions (see `AGENTS.md`).
