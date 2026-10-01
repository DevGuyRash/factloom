// Smoke tests for the cover-letter builder, run against a throwaway fixture repository.
import assert from "node:assert";
import { readFileSync } from "node:fs";
import test from "node:test";
import { join } from "node:path";
import JSZip from "jszip";
import { buildLetter } from "../src/commands/letter.ts";
import { makeFixture, REAL_ROOT } from "./helpers/fixture.ts";

async function documentXml(file: string): Promise<string> {
  const zip = await JSZip.loadAsync(readFileSync(file));
  const entry = zip.file("word/document.xml");
  if (!entry) throw new Error(`${file}: word/document.xml missing`);
  return entry.async("string");
}
const textOf = (xml: string) => xml.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");

type Fixture = ReturnType<typeof makeFixture>;

// makeFixture() only seeds shared/templates/documents; the letter builder also needs a theme.
function withTheme(fx: Fixture): Fixture {
  const theme = readFileSync(join(REAL_ROOT, "shared", "templates", "themes", "classic-blue.json"), "utf8");
  fx.write("shared/templates/themes/classic-blue.json", theme);
  return fx;
}

const APP_DIR = "people/pat-lee/applications/2026-10-01_acme_ai-engineer";

function letterFile(fx: Fixture, frontmatter: string, body = "Dear Hiring Team,\n\nFirst paragraph about Acme with **emphasis**.\n\nSincerely,\nPat Lee\n"): string {
  fx.write(`${APP_DIR}/record.md`, `---\ntype: application\nperson: pat-lee\ncompany: "Acme"\nrole: "AI Engineer"\nstatus: drafted\nupdated: 2026-10-01\n---\n`);
  return fx.write(`${APP_DIR}/cover-letter.md`, `---\ntype: cover-letter\n${frontmatter}\ncompany: "Acme"\nrole: "AI Engineer"\n---\n${body}`);
}

test("cover letter takes its header from the profile of the person whose directory holds it", async () => {
  const fx = withTheme(makeFixture());
  try {
    const file = letterFile(fx, "person: pat-lee\ndate: 2026-10-01");
    const files = await buildLetter(file, fx.root);
    assert.match(files[0].split("/").pop() ?? "", /^Pat_Lee_Cover_Letter\.docx$/);
    const xml = await documentXml(files[0]);
    const text = textOf(xml);
    for (const s of ["Pat Lee", "pat@example.com", "github.com/example", "October 1, 2026", "Re: AI Engineer", "First paragraph about Acme with emphasis"]) assert.ok(text.includes(s), s);
    assert.match(xml, /Sincerely,<\/w:t>[\s\S]*?<w:br\/>[\s\S]*?Pat Lee<\/w:t>/, "sign-off keeps its line break");
  } finally {
    fx.cleanup();
  }
});

test("cover letter naming another person is rejected", async () => {
  const fx = withTheme(makeFixture());
  try {
    const file = letterFile(fx, "person: someone-else\ndate: 2026-10-01");
    await assert.rejects(buildLetter(file, fx.root), /does not match its directory/);
  } finally {
    fx.cleanup();
  }
});

test("cover letter with an unparseable date is rejected", async () => {
  const fx = withTheme(makeFixture());
  try {
    const file = letterFile(fx, "person: pat-lee\ndate: October 1, 2026");
    await assert.rejects(buildLetter(file, fx.root), /YYYY-MM-DD/);
  } finally {
    fx.cleanup();
  }
});

test("a letter that check would reject is not rendered", async () => {
  const fx = withTheme(makeFixture());
  try {
    const unwritten = letterFile(fx, "person: pat-lee\ndate: 2026-10-01", "Dear Hiring Team,\n\nSincerely,\nPat Lee\n");
    await assert.rejects(buildLetter(unwritten, fx.root), /does not mention Acme/);
    fx.write("people/pat-lee/resumes/source/facts.yaml", "projects:\n  ops:\n    title: Ops\n    bullets:\n      - text: Cut ticket time by about 30%\n        confirm: [\"about 30%\"]\njobs: {}\n");
    const unconfirmed = letterFile(fx, "person: pat-lee\ndate: 2026-10-01", "Dear Acme team,\n\nI cut ticket time by about 30%.\n\nSincerely,\nPat Lee\n");
    await assert.rejects(buildLetter(unconfirmed, fx.root), /unconfirmed phrase 'about 30%'/);
  } finally {
    fx.cleanup();
  }
});
