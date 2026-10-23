import assert from "node:assert/strict";
import test from "node:test";
import { Document, Packer, Paragraph } from "docx";
import JSZip from "jszip";
import { heading } from "../src/render/docx.ts";
import { HEADING_STYLES, loadTheme } from "../src/render/theme.ts";
import { REAL_ROOT } from "./helpers/fixture.ts";

test("section headings have an outline level without promoting decorations or body text", async () => {
  const theme = loadTheme("classic-blue", REAL_ROOT);
  for (const style of HEADING_STYLES) {
    for (const borders of [false, true]) {
      const document = new Document({ sections: [{ children: [
        ...heading(theme, "Experience", 10000, style, { borders }),
        new Paragraph("Ordinary body text"),
      ] }] });
      const zip = await JSZip.loadAsync(await Packer.toBuffer(document));
      const part = zip.file("word/document.xml");
      assert.ok(part);
      const xml = await part.async("string");
      const paragraphs = xml.match(/<w:p[ >][\s\S]*?<\/w:p>/g) ?? [];
      const title = paragraphs.find((paragraph) => paragraph.includes("EXPERIENCE"));
      assert.ok(title, `${style}/${borders}: title text`);
      assert.match(title, /<w:outlineLvl w:val="0"\s*\/>/, `${style}/${borders}: section outline level`);
      assert.equal(paragraphs.filter((paragraph) => paragraph.includes("<w:outlineLvl")).length, 1,
        `${style}/${borders}: only the section heading belongs in the outline`);
    }
  }
});
