// Smoke test for the theme-driven docx renderer.
import assert from "node:assert";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import test from "node:test";
import { tmpdir } from "node:os";
import { join } from "node:path";
import JSZip from "jszip";
import { render } from "../src/render/docx.ts";
import { loadTheme } from "../src/render/theme.ts";
import { REAL_ROOT } from "./helpers/fixture.ts";

async function documentXml(file: string): Promise<string> {
  const zip = await JSZip.loadAsync(readFileSync(file));
  const entry = zip.file("word/document.xml");
  if (!entry) throw new Error(`${file}: word/document.xml missing`);
  return entry.async("string");
}
const textOf = (xml: string) => xml.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");

test("resume renderer writes header, sections, and bullets", async () => {
  const dir = mkdtempSync(join(tmpdir(), "resume-"));
  try {
    const theme = loadTheme("classic-blue", REAL_ROOT);
    const out = join(dir, "r.docx");
    await render(theme, {
      name: "Pat Lee", headline: "Data Analyst",
      contact: [{ text: "Phoenix, AZ" }, { text: "pat@example.com", url: "mailto:pat@example.com" }],
      sections: [{ title: "Experience", entries: [{ title: "Analyst", sub: "Acme | Remote", dates: "2024 – Present", bullets: ["Built **dashboards** for finance."] }] }],
    }, out);
    const text = textOf(await documentXml(out));
    for (const s of ["Pat Lee", "Data Analyst", "pat@example.com", "EXPERIENCE", "Acme | Remote", "dashboards for finance"]) assert.ok(text.includes(s), s);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("theme controls style, not content: a different theme renders the same text", async () => {
  const dir = mkdtempSync(join(tmpdir(), "resume-"));
  try {
    const theme = loadTheme("classic-blue", REAL_ROOT);
    const altTheme = { ...theme, font: "Calibri", colors: { ...theme.colors, accent: "000000" } };
    const out = join(dir, "r.docx");
    const content = { name: "Pat Lee", contact: [{ text: "Phoenix, AZ" }], sections: [{ title: "Summary", paragraph: "Builds things." }] };
    await render(altTheme, content, out);
    const text = textOf(await documentXml(out));
    assert.ok(text.includes("Pat Lee") && text.includes("Builds things."));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
