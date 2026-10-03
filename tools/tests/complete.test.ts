// Tab completion: the grammar read from usage strings, values from the repository, the
// `resumes __complete` protocol, usage strings staying complete, and the four shell scripts.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";
import { SHELLS } from "../src/commands/completion.ts";
import type { Command } from "../src/lib/command.ts";
import { loadCommands } from "../src/lib/commands.ts";
import { complete, parseUsage } from "../src/lib/complete.ts";
import { makeFixture, REAL_ROOT } from "./helpers/fixture.ts";

const commands = await loadCommands();
const values = (words: string[]): string[] => complete(words, commands).candidates.map((c) => c.value);
const fallback = (words: string[]): string => complete(words, commands).fallback;

const SAM = "---\ntype: profile\nperson: sam-ortiz\nname: Sam Ortiz\napply: disabled\n---\n";
const SEARCHES = (person: string) => `---\ntype: searches\nperson: ${person}\nitems:\n- id: ai-engineer\n  variant: data-analyst\n  site: hiring.cafe\n  url: https://example.com/\n  query: q\n  every_days: 3\n  last_run: null\n- id: ops\n  variant: operations\n  site: hiring.cafe\n  url: https://example.com/\n  query: q\n  every_days: 3\n  last_run: null\n---\n`;

function withRepo<T>(fn: () => T): T {
  const fx = makeFixture({
    "people/pat-lee/resumes/source/variants/data-analyst.yaml": "variant: data-analyst\n",
    "people/pat-lee/resumes/source/variants/operations.yaml": "variant: operations\n",
    "people/pat-lee/searches.md": SEARCHES("pat-lee"),
    "people/sam-ortiz/profile.md": SAM,
    "people/sam-ortiz/resumes/source/variants/designer.yaml": "variant: designer\n",
    "custom/templates/themes/mine.yaml": "extends: classic-blue\n",
  });
  process.env.RESUMES_ROOT = fx.root;
  try {
    return fn();
  } finally {
    delete process.env.RESUMES_ROOT;
    fx.cleanup();
  }
}

test("usage strings become grammar: subcommand forms, flags with their values, positionals, notes skipped", () => {
  const company = parseUsage("resumes company new <Name> [--website <URL>] | resumes company find <Name> | resumes company list", "company");
  assert.deepEqual(company.map((f) => f.words), [["new"], ["find"], ["list"]]);
  assert.deepEqual(company[0].flags, [{ name: "website", value: { kind: "text" }, repeatable: false }]);

  // A note in parentheses is skipped, so the flags it mentions are not counted twice.
  const update = parseUsage("resumes update [--dry-run] [--link]   (--link connects a copy that does not share the engine's history yet, once)", "update");
  assert.deepEqual(update[0].flags.map((f) => [f.name, f.value]), [["dry-run", null], ["link", null]]);

  // A switch next to a nested optional flag keeps its own meaning.
  const setup = parseUsage("resumes setup [--private-repo <name>] [--engine [--private-copy <path>]]", "setup")[0];
  assert.deepEqual(setup.flags.map((f) => [f.name, f.value?.kind ?? null]), [["private-repo", "text"], ["engine", null], ["private-copy", "path"]]);

  const inbox = parseUsage('resumes inbox [list] [--person p] | inbox add --company X --question "..." [--decided person|derived:<source>] [--id <catalog-id>] [--headline "..."]', "inbox");
  assert.deepEqual(inbox.map((f) => f.words), [["list"], ["add"]]);
  const flag = (n: string) => inbox[1].flags.find((f) => f.name === n);
  assert.deepEqual(flag("decided")?.value, { kind: "choices", values: ["person"] }, "an alternative with a placeholder inside is open-ended and left out");
  assert.deepEqual(flag("id")?.value, { kind: "provider", provider: "catalog-id" });
  assert.deepEqual(flag("question")?.value, { kind: "text" });
  assert.deepEqual(inbox[0].flags[0].value, { kind: "provider", provider: "person" }, "--person completes people whatever its placeholder");

  const outcome = parseUsage("resumes outcome <dir> rejected|interviewing|offer [--note TEXT]", "outcome")[0];
  assert.deepEqual(outcome.positionals.map((p) => p.spec), [{ kind: "path", dirs: true }, { kind: "choices", values: ["rejected", "interviewing", "offer"] }]);

  const checkOnly = parseUsage("resumes themes check [<theme> ...] [--set key=value ...]", "themes")[0];
  assert.deepEqual(checkOnly.words, ["check"]);
  assert.deepEqual(checkOnly.positionals, [{ spec: { kind: "provider", provider: "theme" }, repeatable: true }]);
  assert.equal(checkOnly.flags[0].repeatable, true);
});

test("every command's usage parses into a grammar", () => {
  for (const c of commands.values()) assert.ok(parseUsage(c.usage, c.name).length > 0, `${c.name}: usage does not start with "resumes ${c.name}"`);
});

test("every flag a command reads is in its usage, because completion offers only what usage lists", async () => {
  const dir = join(REAL_ROOT, "tools", "src", "commands");
  for (const file of readdirSync(dir).filter((f) => f.endsWith(".ts"))) {
    const command = ((await import(pathToFileURL(join(dir, file)).href)) as { default: Command }).default;
    const src = readFileSync(join(dir, file), "utf8");
    const read = new Set<string>();
    for (const m of src.matchAll(/(?:flag|has)\(\s*\w+\s*,\s*"([a-z][a-z-]*)"/g)) read.add(m[1]);
    for (const m of src.matchAll(/parseArgs\(\s*\w+\s*,\s*\[([^\]]*)\]/g)) for (const b of m[1].matchAll(/"([a-z][a-z-]*)"/g)) read.add(b[1]);
    const documented = new Set(parseUsage(command.usage, command.name).flatMap((f) => f.flags.map((x) => x.name)));
    const missing = [...read].filter((f) => !documented.has(f));
    assert.deepEqual(missing, [], `${command.name} reads --${missing.join(", --")} but its usage does not list it`);
  }
});

test("command names come with their summaries, and internal commands stay out", () => {
  const all = complete([""], commands).candidates;
  assert.ok(all.some((c) => c.value === "themes" && /theme/i.test(c.description ?? "")));
  assert.ok(all.some((c) => c.value === "help"));
  assert.ok(!all.some((c) => c.value === "__complete"), "hidden");
  assert.deepEqual(values(["th"]), ["themes"]);
  assert.deepEqual(values(["xyz"]), []);
  assert.ok(values(["help", ""]).includes("themes"), "help takes a command name");
  assert.deepEqual(values(["help", "themes", ""]), [], "and only one");
  assert.deepEqual(values(["nonsense", ""]), []);
});

test("subcommands and flags come from usage", () => {
  assert.deepEqual(values(["themes", ""]), ["check", "list", "new", "preview", "show"]);
  assert.deepEqual(values(["credentials", "s"]), ["set", "status"]);
  assert.deepEqual(values(["themes", "preview", "--"]).slice(0, 4), ["--dpi", "--fit", "--out", "--person"]);
  assert.deepEqual(values(["queue", "add", "--s"]), ["--score", "--source"]);
  // Nothing else to offer after a word: the flags show what the command takes.
  assert.deepEqual(values(["status", ""]), ["--person"]);
  // A flag already on the line is not offered again, except one that repeats.
  assert.deepEqual(values(["themes", "preview", "--png", "--p"]), ["--person"]);
  assert.ok(values(["person", "new", "Pat", "--link", "https://x.example", "--l"]).includes("--link"));
  assert.ok(!values(["person", "new", "Pat", "--email", "a@b.c", "--e"]).includes("--email"));
  // The form picked by the subcommand decides which flags apply.
  assert.ok(values(["import", "status", "--"]).includes("--person"));
  assert.ok(!values(["import", "status", "--"]).includes("--keep"));
  assert.ok(values(["import", "--"]).includes("--keep"));
});

test("values come from the repository: people, variants, themes", () => withRepo(() => {
  assert.deepEqual(values(["variant", "new", "x", "--person", ""]).sort(), ["pat-lee", "sam-ortiz"]);
  assert.deepEqual(values(["variant", "new", "x", "--person", "s"]), ["sam-ortiz"]);
  // The one person with applying enabled is the default; --person says otherwise.
  assert.deepEqual(values(["build-resumes", "--variant", ""]), ["data-analyst", "operations"]);
  assert.deepEqual(values(["build-resumes", "--person", "sam-ortiz", "--variant", ""]), ["designer"]);
  assert.deepEqual(values(["variant", "new", "x", "--from", ""]), ["data-analyst", "operations"], "--from <variant> takes variants");
  assert.ok(values(["themes", "new", "x", "--from", ""]).includes("classic-blue"), "--from theme takes themes");
  assert.ok(values(["themes", "show", ""]).includes("mine"), "custom themes show up");
  assert.deepEqual(values(["themes", "show", "cl"]), ["classic-blue"]);
  assert.deepEqual(values(["build-resumes", "--theme", "mi"]), ["mine"]);
  // A comma list completes its last item and keeps the rest.
  assert.deepEqual(values(["themes", "preview", "--themes", "mine,cl"]), ["mine,classic-blue"]);
  assert.ok(!values(["themes", "preview", "--themes", "mine,mi"]).includes("mine,mine"), "an item already listed is not offered again");
}));

test("values come from the repository: onboarding ids, saved searches, templates", () => withRepo(() => {
  assert.ok(values(["onboarding", "answer", "work-auth.s"]).includes("work-auth.sponsorship"));
  assert.ok(!values(["onboarding", "answer", ""]).some((id) => id.includes("<")), "a pattern id is not a typeable id");
  assert.ok(values(["inbox", "add", "--id", "work-auth.s"]).includes("work-auth.sponsorship"));
  assert.deepEqual(values(["searches", "mark", ""]), ["ai-engineer", "ops"]);
  assert.ok(values(["template", ""]).includes("list") && values(["template", ""]).includes("cover-letter"), "the subcommand and the templates");
  assert.deepEqual(values(["guard", "allow", ""]), ["--force", "--remote"], "no remotes in a plain folder, so the flags show, and no error");
}));

test("fixed choices from usage", () => {
  assert.deepEqual(values(["export", "--format", ""]), ["csv", "json"]);
  assert.deepEqual(values(["pay", "--by", "r"]), ["role"]);
  assert.deepEqual(values(["run", "log", "--kind", ""]), ["applied", "held", "skipped", "error", "note"]);
  assert.deepEqual(values(["outcome", "people/x/applications/y", ""]), ["rejected", "interviewing", "offer", "withdrawn", "closed"]);
  assert.deepEqual(values(["draft", ""]), ["follow-up", "thank-you", "interview-prep"]);
  assert.deepEqual(values(["onboarding", "answer", "prefs.min-fit", "65", "--policy", ""]), ["auto", "confirm", "ask", "person"]);
});

test("paths are left to the shell: directories, files, or both a subcommand and files", () => {
  assert.equal(fallback(["tailor", ""]), "dirs");
  assert.equal(fallback(["trials", "prepare", ""]), "dirs");
  assert.equal(fallback(["build-resumes", "--out", ""]), "dirs");
  assert.equal(fallback(["letter", ""]), "files");
  assert.equal(fallback(["email", "classify", ""]), "files");
  assert.equal(fallback(["setup", "--engine", "--private-copy", ""]), "files");
  assert.equal(fallback(["trials", "grade", ""]), "files", "files cover the directory form too");
  const imp = complete(["import", ""], commands);
  assert.deepEqual([imp.candidates.map((c) => c.value), imp.fallback], [["status"], "files"]);
  assert.equal(fallback(["themes", "show", ""]), "none");
  assert.equal(fallback(["tailor", "people/x/applications/y", ""]), "none", "a second positional the usage does not have");
});

test("completion never throws: a repository that cannot be read just offers nothing", () => {
  process.env.RESUMES_ROOT = join(tmpdir(), "factloom-no-such-repository");
  try {
    assert.deepEqual(values(["build-resumes", "--person", ""]), []);
    assert.ok(values(["build-resumes", "--theme", ""]).includes("classic-blue"), "the engine's own themes still load");
    assert.ok(values(["onboarding", "answer", ""]).length > 0, "so does the shared catalog");
  } finally { delete process.env.RESUMES_ROOT; }
});

const CLI = join(REAL_ROOT, "tools", "src", "cli.ts");
function cli(args: string[], env: Record<string, string> = {}) {
  return spawnSync(process.execPath, ["--disable-warning=ExperimentalWarning", CLI, ...args], { encoding: "utf8", env: { ...process.env, ...env } });
}

test("`resumes __complete` speaks the protocol: candidates, then a last line saying what the shell does next", () => {
  const fx = makeFixture({ "people/pat-lee/resumes/source/variants/data-analyst.yaml": "variant: data-analyst\n" });
  try {
    const env = { RESUMES_ROOT: fx.root };
    let r = cli(["__complete", "--cur=th", "--"], env);
    assert.equal(r.status, 0);
    const lines = r.stdout.trimEnd().split("\n");
    assert.match(lines[0], /^themes\t.+/, "a description follows a tab");
    assert.equal(lines[lines.length - 1], ":none");
    r = cli(["__complete", "--cur=", "--", "build-resumes", "--variant"], env);
    assert.equal(r.stdout, "data-analyst\n:none\n", "an empty word arrives as --cur=, which no shell drops");
    assert.equal(cli(["__complete", "--cur=", "--", "tailor"], env).stdout, ":dirs\n");
    assert.equal(cli(["__complete", "--cur=", "--", "letter"], env).stdout, ":files\n");
    assert.equal(cli(["__complete", "--cur=zz", "--", "nonsense"], env).stdout, ":none\n");
    assert.equal(cli(["__complete"], env).status, 0, "no words at all is still an answer");
    const help = cli(["help"], env).stdout;
    assert.doesNotMatch(help, /__complete/, "hidden from help");
    assert.match(help, /completion\s+Print the tab-completion script/);
  } finally { fx.cleanup(); }
});

test("`resumes completion <shell>` prints each script and refuses anything else", () => {
  for (const [shell, file] of Object.entries(SHELLS)) {
    const r = cli(["completion", shell]);
    assert.equal(r.status, 0, shell);
    assert.equal(r.stdout, readFileSync(join(REAL_ROOT, "tools", "completions", file), "utf8"));
    assert.match(r.stdout, /__complete/);
  }
  assert.equal(cli(["completion", "pwsh"]).stdout, cli(["completion", "powershell"]).stdout, "pwsh is accepted");
  for (const args of [["completion"], ["completion", "tcsh"]]) {
    const r = cli(args);
    assert.equal(r.status, 2);
    assert.equal(r.stdout, "", "nothing on stdout, so sourcing a mistake loads nothing");
    assert.match(r.stderr, /usage: resumes completion bash\|zsh\|fish\|powershell/);
  }
});

test("a Tab press never starts the first-run install: the launchers answer __complete silently until the tools exist", () => {
  const sh = readFileSync(join(REAL_ROOT, "resumes"), "utf8");
  assert.ok(sh.indexOf('[ "$1" = "__complete" ] && exit 0') > sh.indexOf("tools/node_modules") && sh.indexOf('[ "$1" = "__complete" ] && exit 0') < sh.indexOf("npm ci"));
  const cmd = readFileSync(join(REAL_ROOT, "resumes.cmd"), "utf8");
  assert.ok(cmd.indexOf('"%~1"=="__complete" exit /b 0') > cmd.indexOf("tools\\node_modules") && cmd.indexOf('"%~1"=="__complete" exit /b 0') < cmd.indexOf("npm ci"));
});

test("the docs say how to load every script", () => {
  const docs = readFileSync(join(REAL_ROOT, "docs", "completion.md"), "utf8");
  for (const shell of Object.keys(SHELLS)) assert.match(docs, new RegExp(`completion ${shell}`), shell);
});

// The scripts, run in the shells themselves. A shell that is not installed is skipped here; CI installs
// them all. Each runs the real launcher from the repository root, against a throwaway repository.
const present = (bin: string, args: string[] = ["--version"]) => spawnSync(bin, args, { stdio: "ignore" }).status === 0;
function inShell(bin: string, args: string[], env: Record<string, string> = {}) {
  const fx = makeFixture({
    "people/pat-lee/resumes/source/variants/data-analyst.yaml": "variant: data-analyst\n",
    "people/pat-lee/resumes/source/variants/operations.yaml": "variant: operations\n",
  });
  try {
    const r = spawnSync(bin, args, { cwd: REAL_ROOT, encoding: "utf8", env: { ...process.env, RESUMES_ROOT: fx.root, ...env } });
    return { out: r.stdout.trim().split("\n").filter(Boolean), err: r.stderr, status: r.status };
  } finally { fx.cleanup(); }
}

test("bash: the function completes commands, flags, and values, and leaves --flag=value alone", { skip: present("bash") ? false : "bash is not installed" }, () => {
  const script = [
    "source <(./resumes completion bash)",
    'try() { local idx=$1; shift; COMP_WORDS=("$@"); COMP_CWORD=$idx; _resumes_complete; echo "$*  =>  ${COMPREPLY[*]}"; }',
    'try 1 ./resumes th',
    'try 2 ./resumes themes ""',
    'try 3 ./resumes build-resumes --variant ""',
    "try 2 ./resumes export --f",
    "try 2 ./resumes import dr",
    "try 3 ./resumes build-resumes --person =",
    "try 4 ./resumes build-resumes --person = pat",
    "complete -p resumes ./resumes",
  ].join("\n");
  const { out, status } = inShell("bash", ["-c", script]);
  assert.equal(status, 0);
  assert.ok(out.includes("./resumes th  =>  themes"), out.join("\n"));
  assert.ok(out.includes("./resumes themes   =>  check list new preview show"), out.join("\n"));
  assert.ok(out.includes("./resumes build-resumes --variant   =>  data-analyst operations"), out.join("\n"));
  assert.ok(out.includes("./resumes export --f  =>  --format"), out.join("\n"));
  assert.ok(out.some((l) => /^\.\/resumes import dr {2}=> {2}drop$/.test(l)), "files come from the shell's own completion: " + out.join("\n"));
  assert.ok(out.includes("./resumes build-resumes --person =  =>  "), "nothing after =");
  assert.ok(out.includes("./resumes build-resumes --person = pat  =>  "), "nothing after =");
  assert.ok(out.includes("complete -F _resumes_complete resumes") && out.includes("complete -F _resumes_complete ./resumes"));
});

test("zsh: the function turns the answer into described matches and file completion", { skip: present("zsh") ? false : "zsh is not installed" }, () => {
  const dump = mkdtempSync(join(tmpdir(), "factloom-zdump-"));
  try {
    const script = [
      `autoload -Uz compinit && compinit -u -d "${dump}/zcompdump"`,
      "source <(./resumes completion zsh)",
      '_describe() { print -r -- "DESCRIBE ${(j: :)${(P)2}}" }',
      '_files() { print -r -- "FILES[$*]" }',
      'try() { words=("$@"); CURRENT=$#words; _resumes; print -r -- "-- $*"; }',
      "try ./resumes th",
      'try ./resumes themes ""',
      'try ./resumes build-resumes --variant ""',
      'try ./resumes import ""',
      'try ./resumes tailor ""',
      'print "registered: ${_comps[resumes]} ${_comps[./resumes]}"',
    ].join("\n");
    const { out, status, err } = inShell("zsh", ["-f", "-c", script]);
    assert.equal(status, 0, err);
    const text = out.join("\n");
    assert.match(text, /DESCRIBE themes:List, show, check, preview, and create resume themes[^\n]*\n-- \.\/resumes th\n/, text);
    assert.match(text, /DESCRIBE check list new preview show\n-- \.\/resumes themes \n/, text);
    assert.match(text, /DESCRIBE data-analyst operations\n-- \.\/resumes build-resumes --variant /, text);
    assert.match(text, /DESCRIBE status\nFILES\[\]\n-- \.\/resumes import /, text);
    assert.match(text, /FILES\[-\/\]\n-- \.\/resumes tailor /, text);
    assert.match(text, /registered: _resumes _resumes/, text);
  } finally { rmSync(dump, { recursive: true, force: true }); }
});

test("fish: the function completes through the shell's own machinery", { skip: present("fish") ? false : "fish is not installed (CI installs it)" }, () => {
  const { out, err } = inShell("fish", ["--no-config", "-c", "./resumes completion fish | source; complete -C './resumes th'; echo --; complete -C './resumes themes '; echo --; complete -C './resumes build-resumes --variant '"]);
  const text = out.join("\n");
  assert.match(text, /^themes\t/m, err + text);
  for (const sub of ["check", "list", "new", "preview", "show"]) assert.match(text, new RegExp(`^${sub}$`, "m"), text);
  assert.match(text, /^data-analyst$/m, text);
  assert.match(text, /^operations$/m, text);
});

test("PowerShell: the argument completer returns completion results", { skip: present("pwsh", ["-NoProfile", "-Command", "$PSVersionTable.PSVersion"]) ? false : "pwsh is not installed (CI has it)" }, () => {
  const complete = (line: string) => `((TabExpansion2 '${line}' ${line.length}).CompletionMatches | ForEach-Object { $_.CompletionText }) -join ' '`;
  const script = `./resumes completion powershell | Out-String | Invoke-Expression; ${complete("./resumes th")}; ${complete("./resumes themes ")}; ${complete("./resumes build-resumes --variant ")}`;
  const { out, err } = inShell("pwsh", ["-NoProfile", "-Command", script]);
  assert.equal(out[0], "themes", err + out.join("\n"));
  assert.equal(out[1], "check list new preview show", out.join("\n"));
  assert.equal(out[2], "data-analyst operations", out.join("\n"));
});

// A program named resumes that does not speak the protocol (an older engine, which prints its help for an
// unknown command) must yield no completions. It exits 0 here, so only the answer's shape can tell.
function withOlderEngine<T>(fn: (dir: string) => T): T {
  const dir = mkdtempSync(join(tmpdir(), "factloom-older-"));
  try {
    writeFileSync(join(dir, "resumes"), "#!/bin/sh\necho 'usage: resumes <command> [args]'\necho '  themes   List, show, check'\necho '  th       Not a completion'\n", { mode: 0o755 });
    return fn(dir);
  } finally { rmSync(dir, { recursive: true, force: true }); }
}
const asked = (bin: string, args: string[], cwd: string) => spawnSync(bin, args, { cwd, encoding: "utf8", env: { ...process.env, RESUMES_ROOT: cwd } });

test("bash and zsh ignore an answer that is not a protocol answer", { skip: present("bash") && present("zsh") ? false : "bash or zsh is not installed" }, () => withOlderEngine((dir) => {
  const completions = join(REAL_ROOT, "tools", "completions");
  const bash = asked("bash", ["-c", `source ${completions}/resumes.bash; COMP_WORDS=(${dir}/resumes th); COMP_CWORD=1; _resumes_complete; echo "[\${COMPREPLY[*]}]"`], dir);
  assert.equal(bash.stdout.trim(), "[]", bash.stderr);
  const zsh = asked("zsh", ["-f", "-c", `autoload -Uz compinit && compinit -u -d ${dir}/zd; source ${completions}/resumes.zsh; _describe() { print DESCRIBED }; _files() { print FILES }; words=(${dir}/resumes th); CURRENT=2; _resumes; print "status $?"`], dir);
  assert.equal(zsh.stdout.trim(), "status 1", zsh.stderr + zsh.stdout);
}));

test("fish ignores an answer that is not a protocol answer", { skip: present("fish") ? false : "fish is not installed (CI installs it)" }, () => withOlderEngine((dir) => {
  const r = asked("fish", ["--no-config", "-c", `${join(REAL_ROOT, "resumes")} completion fish | source; complete -C './resumes th'`], dir);
  assert.equal(r.stdout.trim(), "", r.stderr + r.stdout);
}));

test("PowerShell ignores an answer that is not a protocol answer", { skip: present("pwsh", ["-NoProfile", "-Command", "$PSVersionTable.PSVersion"]) ? false : "pwsh is not installed (CI has it)" }, () => withOlderEngine((dir) => {
  const script = `${join(REAL_ROOT, "tools", "completions", "resumes.ps1")}`;
  const r = asked("pwsh", ["-NoProfile", "-Command", `. '${script}'; ((TabExpansion2 './resumes th' 12).CompletionMatches | ForEach-Object { $_.CompletionText }) -join ' '`], dir);
  assert.equal(r.stdout.trim(), "", r.stderr + r.stdout);
}));
