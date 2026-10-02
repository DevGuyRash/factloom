// Resume intake: drop/ by default, any format, originals archived, duplicates skipped by content,
// unreadable files marked for the agent, and personal-detail lines held out of git.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import importCommand from "../src/commands/import.ts";
import { parse } from "../src/lib/frontmatter.ts";
import { htmlToText, importedNotes, readText, splitPersonalLines } from "../src/lib/intake.ts";
import { pendingSnapshot } from "../src/lib/stats.ts";
import { sofficeCandidates } from "../src/render/pdf.ts";
import { makeFixture } from "./helpers/fixture.ts";

const RESUME = "Pat Lee\nData Analyst, Example Co., 2022 to now\n- Built weekly sales dashboards in SQL and Python\n";

function capture(fn: () => unknown): Promise<string> {
  const lines: string[] = [];
  const [log, err] = [console.log, console.error];
  console.log = (...args: unknown[]) => { lines.push(args.join(" ")); };
  console.error = (...args: unknown[]) => { lines.push(args.join(" ")); };
  return Promise.resolve().then(fn).finally(() => { console.log = log; console.error = err; }).then(() => lines.join("\n"));
}

function withRoot<T>(fx: { root: string }, fn: () => Promise<T>): Promise<T> {
  process.env.RESUMES_ROOT = fx.root;
  return fn().finally(() => { delete process.env.RESUMES_ROOT; });
}

test("import with no paths reads drop/: text is extracted, unreadable files are marked for the agent, originals move to the archive", async () => {
  const fx = makeFixture();
  try {
    fx.write("drop/README.md", "# drop\n");
    fx.write("drop/Pat Lee Resume.txt", RESUME);
    fx.write("drop/old/pat-2019.html", "<html><head><title>x</title></head><body><h1>Pat Lee</h1><ul><li>Clerk &amp; cashier at Corner Market, 2018 to 2019</li></ul></body></html>");
    fx.write("drop/scan.png", "\x89PNG not really an image");
    const out = await withRoot(fx, () => capture(() => importCommand.run(["--person", "pat-lee"])));
    assert.match(out, /2 imported, 1 need reading by the agent, 0 already imported/);
    assert.deepEqual(readdirSync(join(fx.root, "drop")).sort(), ["README.md", "old"], "imported files leave drop/; its README stays");

    const notes = importedNotes("pat-lee", fx.root);
    assert.deepEqual(notes.map((n) => n.status).sort(), ["extracted", "extracted", "needs-reading"]);
    const txt = notes.find((n) => n.name === "Pat Lee Resume.txt")!;
    assert.match(readFileSync(txt.path, "utf8"), /Built weekly sales dashboards in SQL and Python/);
    assert.ok(existsSync(join(fx.root, txt.source!)) && txt.source!.includes("resumes/archive/"), "the original is archived");
    const html = notes.find((n) => n.name === "pat-2019.html")!;
    assert.match(readFileSync(html.path, "utf8"), /Pat Lee\n\n?- Clerk & cashier at Corner Market/);
    const png = notes.find((n) => n.name === "scan.png")!;
    assert.match(png.source!, /\.local\.png$/, "an unreadable original stays out of git until the agent has read it");
    assert.match(readFileSync(png.path, "utf8"), /needs reading/);
  } finally { fx.cleanup(); }
});

test("a file already imported is recognized by its content, and --keep leaves originals in place", async () => {
  const fx = makeFixture();
  try {
    const outside = fx.write("elsewhere/resume.md", RESUME);
    fx.write("drop/copy-of-resume.txt", RESUME);
    await withRoot(fx, () => capture(() => importCommand.run([outside, "--person", "pat-lee"])));
    assert.ok(existsSync(outside), "files outside drop/ are copied, never moved");
    const out = await withRoot(fx, () => capture(() => importCommand.run(["--person", "pat-lee", "--keep"])));
    assert.match(out, /0 imported, 0 need reading by the agent, 1 already imported/);
    assert.ok(existsSync(join(fx.root, "drop/copy-of-resume.txt")), "--keep leaves the dropped file");
    await withRoot(fx, () => capture(() => importCommand.run(["--person", "pat-lee"])));
    assert.ok(!existsSync(join(fx.root, "drop/copy-of-resume.txt")), "a duplicate leaves drop/ (the archive holds the same bytes)");
    assert.equal(importedNotes("pat-lee", fx.root).length, 1);
  } finally { fx.cleanup(); }
});

test("lines with a street address are held in a git-ignored sidecar and the original is archived as .local", async () => {
  const fx = makeFixture();
  try {
    fx.write("drop/resume.txt", `Pat Lee\n1234 Desert Willow Lane, Phoenix, AZ\n${RESUME}`);
    await withRoot(fx, () => capture(() => importCommand.run(["--person", "pat-lee"])));
    const [note] = importedNotes("pat-lee", fx.root);
    const text = readFileSync(note.path, "utf8");
    assert.doesNotMatch(text, /Desert Willow/);
    assert.match(text, /\[line kept out of git: street-address\]/);
    const fm = parse(text).data as Record<string, string>;
    assert.match(fm.held_lines, /\.local\.md$/);
    assert.match(readFileSync(join(fx.root, fm.held_lines), "utf8"), /1234 Desert Willow Lane/);
    assert.match(fm.source, /\.local\.txt$/);
  } finally { fx.cleanup(); }
});

test("status and import status show intake until each note is merged", async () => {
  const fx = makeFixture();
  try {
    fx.write("drop/a.txt", RESUME);
    fx.write("drop/b.txt", RESUME.replace("2022", "2021"));
    await withRoot(fx, () => capture(() => importCommand.run(["--person", "pat-lee", "drop/a.txt"].map((p) => (p.startsWith("drop") ? join(fx.root, p) : p)))));
    let snap = pendingSnapshot("pat-lee", fx.root);
    assert.equal(snap.intake.dropWaiting, 1);
    assert.equal(snap.intake.pending.length, 1);
    const status = await withRoot(fx, () => capture(() => importCommand.run(["status", "--person", "pat-lee"])));
    assert.match(status, /drop\/: 1 file\(s\) waiting/);
    assert.match(status, /extracted/);
    const note = snap.intake.pending[0].path;
    writeFileSync(note, readFileSync(note, "utf8").replace("status: extracted", "status: merged"));
    snap = pendingSnapshot("pat-lee", fx.root);
    assert.equal(snap.intake.pending.length, 0);
  } finally { fx.cleanup(); }
});

test("import names the person when only one exists, and says how to start when nobody does", async () => {
  const fx = makeFixture();
  try {
    fx.write("drop/a.txt", RESUME);
    const out = await withRoot(fx, () => capture(() => importCommand.run([])));
    assert.match(out, /1 imported/);
    const empty = makeFixture();
    try {
      empty.write("drop/a.txt", RESUME);
      const { rmSync } = await import("node:fs");
      rmSync(join(empty.root, "people", "pat-lee"), { recursive: true });
      const msg = await withRoot(empty, () => capture(() => importCommand.run([])));
      assert.match(msg, /nobody is set up yet: run \.\/resumes person new/);
    } finally { empty.cleanup(); }
  } finally { fx.cleanup(); }
});

test("Word files keep their paragraph breaks", async () => {
  const fx = makeFixture();
  try {
    const { Document, Packer, Paragraph } = await import("docx");
    const file = join(fx.root, "r.docx");
    writeFileSync(file, await Packer.toBuffer(new Document({ sections: [{ children: [new Paragraph("Pat Lee"), new Paragraph("Data Analyst at Example Co. & Partners, 2022 to now")] }] })));
    const read = await readText(file);
    assert.match(read!.text, /Pat Lee\nData Analyst at Example Co\. & Partners, 2022 to now/);
  } finally { fx.cleanup(); }
});

test("HTML becomes plain text; allowlisted strings are not held", () => {
  assert.equal(htmlToText("<p>One&nbsp;two</p><script>x()</script><p>&#x41;&#66;</p>"), "One two\nAB");
  const fx = makeFixture({ "shared/pii-allow.yaml": "strings:\n  - 100 Main Street\n" });
  try {
    const r = splitPersonalLines("Office: 100 Main Street\nHome: 22 Elm Street", "people/pat-lee/x.md", fx.root);
    assert.deepEqual(r.held, ["Home: 22 Elm Street"]);
  } finally { fx.cleanup(); }
});

const hasSoffice = sofficeCandidates().some((bin) => spawnSync(bin, ["--version"], { stdio: "ignore" }).status === 0);
test("older word-processor formats are converted through LibreOffice", { skip: hasSoffice ? false : "LibreOffice is not installed" }, async () => {
  const fx = makeFixture();
  try {
    const file = fx.write("drop/resume.rtf", "{\\rtf1\\ansi Pat Lee\\par Data Analyst at Example Co., 2022 to now\\par}");
    const read = await readText(file);
    assert.equal(read?.method, "libreoffice");
    assert.match(read!.text, /Data Analyst at Example Co\., 2022 to now/);
  } finally { fx.cleanup(); }
});

test("a re-dropped file whose archived original is gone (a fresh clone of .local originals) restores it instead of deleting it", async () => {
  const fx = makeFixture();
  try {
    fx.write("drop/resume.txt", `Pat Lee\n1234 Desert Willow Lane, Phoenix, AZ\n${RESUME}`);
    await withRoot(fx, () => capture(() => importCommand.run(["--person", "pat-lee"])));
    const [note] = importedNotes("pat-lee", fx.root);
    const archived = join(fx.root, note.source!);
    const { rmSync } = await import("node:fs");
    rmSync(archived);
    fx.write("drop/resume.txt", `Pat Lee\n1234 Desert Willow Lane, Phoenix, AZ\n${RESUME}`);
    const out = await withRoot(fx, () => capture(() => importCommand.run(["--person", "pat-lee"])));
    assert.match(out, /archived original was missing and is back/);
    assert.ok(existsSync(archived), "the original is back in the archive");
  } finally { fx.cleanup(); }
});

test("links in drop/: a linked file's bytes are archived and its target is never moved; a linked folder is skipped", async () => {
  const fx = makeFixture();
  try {
    const { symlinkSync, lstatSync } = await import("node:fs");
    const target = fx.write("outside/master.txt", RESUME);
    fx.write("drop/README.md", "# drop\n");
    symlinkSync(target, join(fx.root, "drop", "link.txt"));
    symlinkSync(join(fx.root, "outside"), join(fx.root, "drop", "my-resumes"));
    const out = await withRoot(fx, () => capture(() => importCommand.run(["--person", "pat-lee"])));
    assert.match(out, /my-resumes: skipped \(a link to a folder/);
    assert.ok(existsSync(target), "the link's target stays where it was");
    const [note] = importedNotes("pat-lee", fx.root);
    assert.ok(!lstatSync(join(fx.root, note.source!)).isSymbolicLink(), "the archive holds the bytes, not a link");
    assert.ok(!existsSync(join(fx.root, "drop", "link.txt")), "the link itself leaves drop/");
  } finally { fx.cleanup(); }
});

test("text in UTF-16, HTML table cells, and LaTeX ties is still checked for personal details", async () => {
  const fx = makeFixture();
  try {
    const body = `Pat Lee\r\n1234 Desert Willow Lane, Phoenix, AZ\r\n${RESUME}`;
    writeFileSync(join(fx.root, "u16.txt"), Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(body, "utf16le")]));
    fx.write("cells.html", `<table><tr><td>Pat Lee</td><td>Data Analyst at Example Co. since 2022</td></tr><tr><td>1234</td><td>Desert Willow Lane</td></tr></table>`);
    fx.write("cv.tex", `Pat Lee, Data Analyst at Example Co. since 2022\\\\\n1234~Desert~Willow~Lane\n`);
    for (const f of ["u16.txt", "cells.html", "cv.tex"]) {
      const read = await readText(join(fx.root, f));
      assert.ok(read, `${f} is read`);
      const split = splitPersonalLines(read!.text, "people/pat-lee/x.md", fx.root);
      assert.ok(split.kinds.includes("street-address"), `${f}: the address is found`);
    }
  } finally { fx.cleanup(); }
});

test("CSV rows under a personal column are held; resumes in any script count as text; system leftovers are skipped", async () => {
  const fx = makeFixture();
  try {
    fx.write("drop/Profile.csv", "First Name,Last Name,Birth Date,Headline\nPat,Lee,03/14/1990,Data Analyst at Example Co. and more\n");
    fx.write("drop/cv-ru.txt", "Пэт Ли — аналитик данных в компании Пример с 2022 года, дашборды и отчёты\n");
    fx.write("drop/~$Resume.docx", "owner file");
    fx.write("drop/Thumbs.db", "x");
    const out = await withRoot(fx, () => capture(() => importCommand.run(["--person", "pat-lee"])));
    assert.match(out, /2 imported, 0 need reading/);
    const csv = importedNotes("pat-lee", fx.root).find((n) => n.name === "Profile.csv")!;
    assert.doesNotMatch(readFileSync(csv.path, "utf8"), /1990/);
    assert.match(readFileSync(csv.path, "utf8"), /personal column/);
  } finally { fx.cleanup(); }
});

test("after an import, check passes: Markdown originals and held-line files never read as repository documents", async () => {
  const fx = makeFixture();
  try {
    fx.write("drop/resume.md", `---\ntitle: My resume\n---\n\nPat Lee\n1234 Desert Willow Lane, Phoenix, AZ\n${RESUME}`);
    await withRoot(fx, () => capture(() => importCommand.run(["--person", "pat-lee"])));
    const [note] = importedNotes("pat-lee", fx.root);
    assert.match(note.source!, /\.local\.md\.txt$/);
    const { run } = await import("../src/commands/check.ts");
    const { errors } = await run(fx.root);
    assert.deepEqual(errors.filter((e) => /imported|archive/.test(e)), []);
  } finally { fx.cleanup(); }
});

test("notes from the earlier importer count as merged and still catch a re-dropped file", async () => {
  const fx = makeFixture();
  try {
    fx.write("people/pat-lee/resumes/archive/2025-01-01_resume.txt", RESUME);
    fx.write("people/pat-lee/resumes/source/imported/2025-01-01_resume.md", "---\ntype: notes\nperson: pat-lee\nsource: people/pat-lee/resumes/archive/2025-01-01_resume.txt\nimported: 2025-01-01\n---\n\ntext\n");
    assert.deepEqual(importedNotes("pat-lee", fx.root).map((n) => n.status), ["merged"]);
    fx.write("drop/again.txt", RESUME);
    const out = await withRoot(fx, () => capture(() => importCommand.run(["--person", "pat-lee"])));
    assert.match(out, /= drop\/again\.txt: already imported/);
  } finally { fx.cleanup(); }
});

test("drop/<person>/ belongs to that person: another person's import and status leave it alone", async () => {
  const fx = makeFixture();
  try {
    fx.write("people/sam-ortiz/profile.md", "---\ntype: profile\nperson: sam-ortiz\nname: Sam Ortiz\napply: disabled\n---\n");
    fx.write("drop/sam-ortiz/sam.txt", RESUME.replace("Pat Lee", "Sam Ortiz"));
    fx.write("drop/pat.txt", RESUME);
    assert.equal(pendingSnapshot("pat-lee", fx.root).intake.dropWaiting, 1);
    await withRoot(fx, () => capture(() => importCommand.run(["--person", "pat-lee"])));
    assert.ok(existsSync(join(fx.root, "drop/sam-ortiz/sam.txt")), "Sam's file stays for Sam");
    const bad = await withRoot(fx, () => capture(() => importCommand.run(["status", "--person", "nobody"])));
    assert.match(bad, /no person directory people\/nobody/);
  } finally { fx.cleanup(); }
});

test("a Word file with a floating shape yields no false card number", async () => {
  const fx = makeFixture();
  try {
    const { Document, Packer, Paragraph, TextRun } = await import("docx");
    const { ShapeRun } = await import("docx/shapes" as string).catch(() => ({ ShapeRun: null }));
    const children = ShapeRun
      ? [new Paragraph({ children: [new ShapeRun({ type: "rectangle", transformation: { width: 50, height: 10 }, floating: { horizontalPosition: { offset: 1562100 }, verticalPosition: { offset: 254000 } } } as never)] }), new Paragraph({ children: [new TextRun("Pat Lee")] })]
      : [new Paragraph("Pat Lee")];
    const file = join(fx.root, "shape.docx");
    writeFileSync(file, await Packer.toBuffer(new Document({ sections: [{ children }] })));
    const { scanFile, loadAllowlist } = await import("../src/lib/pii.ts");
    assert.deepEqual(await scanFile(file, "shape.docx", loadAllowlist(fx.root)), []);
  } finally { fx.cleanup(); }
});
