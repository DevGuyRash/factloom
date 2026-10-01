// Themes: lookup layers, `extends`, overrides, validation, contrast, layouts, shapes, and page fitting.
import assert from "node:assert";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import test from "node:test";
import { tmpdir } from "node:os";
import { join } from "node:path";
import JSZip from "jszip";
import { contrast, contrastProblems } from "../src/commands/themes.ts";
import { render } from "../src/render/docx.ts";
import { FIT_STEPS, tighten } from "../src/render/fit.ts";
import { loadFacts, loadVariant, resolveContent } from "../src/render/spec.ts";
import { DEFAULTS, listThemes, loadTheme } from "../src/render/theme.ts";
import { makeFixture, REAL_ROOT } from "./helpers/fixture.ts";

const DEMO = join(REAL_ROOT, "examples", "demo");
const BUNDLED = ["classic-blue", "compact", "executive", "modern", "plain", "sidebar"];

async function documentXml(theme: ReturnType<typeof loadTheme>): Promise<string> {
  const dir = mkdtempSync(join(tmpdir(), "theme-"));
  try {
    const content = resolveContent(loadFacts("jordan-rivera", DEMO), loadVariant("jordan-rivera", "data-analyst", DEMO));
    const out = join(dir, "r.docx");
    await render(theme, content, out);
    const zip = await JSZip.loadAsync(readFileSync(out));
    const parts = await Promise.all(Object.keys(zip.files).filter((f) => /^word\/(document|header\d*)\.xml$/.test(f)).sort().map((f) => zip.file(f)!.async("string")));
    return parts.join("\n");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
const textOf = (xml: string) => [...xml.matchAll(/<w:t(?: [^>]*)?>([^<]*)<\/w:t>/g)].map((m) => m[1]).join(" ");

test("every bundled theme loads, passes the contrast checks, and is listed", () => {
  for (const name of BUNDLED) {
    const t = loadTheme(name, DEMO);
    assert.deepStrictEqual(contrastProblems(t), [], `${name} has readable colors`);
  }
  const listed = listThemes(DEMO, "jordan-rivera").map((t) => t.name);
  for (const name of [...BUNDLED, "modern-teal", "executive-burgundy"]) assert.ok(listed.includes(name), `${name} is listed`);
  assert.ok(!listThemes(DEMO).some((t) => t.name === "executive-burgundy"), "a person's own theme is listed only for that person");
  for (const [name, person] of [["modern-teal", undefined], ["executive-burgundy", "jordan-rivera"]] as const) {
    assert.deepStrictEqual(contrastProblems(loadTheme(name, DEMO, { person })), [], `${name} has readable colors`);
  }
});

test("defaults fill every role: one font covers body, headings, and name; rule and link colors follow the accent", () => {
  const fx = makeFixture({ "custom/templates/themes/bare.yaml": "font: Georgia\ncolors: { accent: \"#0f766e\" }\n" });
  try {
    const t = loadTheme("bare", fx.root);
    assert.deepStrictEqual(t.fonts, { body: "Georgia", heading: "Georgia", name: "Georgia" });
    assert.strictEqual(t.colors.accent, "0F766E", "hex is normalized: no #, upper case");
    assert.strictEqual(t.colors.rule, "0F766E");
    assert.strictEqual(t.colors.link, "0F766E");
    assert.strictEqual(t.bulletList.char, "▪", "auto bullet: square corners give a square bullet");
  } finally {
    fx.cleanup();
  }
});

test("extends applies the parent first; custom/ overrides shared/ and a person's theme overrides both; variant style wins last", () => {
  const fx = makeFixture({
    "custom/templates/themes/modern.yaml": "extends: classic-blue\ndescription: custom modern\ncolors: { accent: \"0F766E\" }\n",
    "people/pat-lee/templates/themes/modern.yaml": "extends: classic-blue\ndescription: pat's modern\ncorners: rounded\n",
  });
  try {
    const custom = loadTheme("modern", fx.root);
    assert.strictEqual(custom.description, "custom modern");
    assert.strictEqual(custom.colors.accent, "0F766E");
    assert.strictEqual(custom.font, "Arial", "everything else comes from the parent");
    const pat = loadTheme("modern", fx.root, { person: "pat-lee" });
    assert.strictEqual(pat.description, "pat's modern");
    assert.strictEqual(pat.corners, "rounded");
    const styled = loadTheme("modern", fx.root, { person: "pat-lee", overrides: { colors: { accent: "7C3AED" }, headings: { style: "band" } } });
    assert.strictEqual(styled.colors.accent, "7C3AED");
    assert.strictEqual(styled.headings.style, "band");
    assert.strictEqual(styled.headings.case, "upper", "a partial override keeps the rest of the group");
    const listed = listThemes(fx.root, "pat-lee").find((t) => t.name === "modern")!;
    assert.match(listed.path, /people\/pat-lee\/templates\/themes\/modern\.yaml$/);
    assert.strictEqual(listed.shadows.length, 2, "it overrides custom/ and shared/ copies");
  } finally {
    fx.cleanup();
  }
});

test("validation reports every problem at once, with the fix", () => {
  const fx = makeFixture({
    "custom/templates/themes/broken.yaml": "colours: { accent: red }\nlayout: grid\nheadings: { style: wavy, color: purple }\ncolors: { muted: 123E45 }\n",
    "custom/templates/themes/loop-a.yaml": "extends: loop-b\n",
    "custom/templates/themes/loop-b.yaml": "extends: loop-a\n",
    "custom/templates/themes/digits.yaml": "colors: { ink: 404040, accent: 000000 }\n",
  });
  try {
    assert.throws(() => loadTheme("broken", fx.root), (e: Error) => {
      for (const s of ["unknown setting colours", "layout is \"grid\"", "headings.style is \"wavy\"", "headings.color is \"purple\"", "colors.muted", "put it in quotes"]) assert.ok(e.message.includes(s), `mentions ${s}: ${e.message}`);
      return true;
    });
    assert.throws(() => loadTheme("loop-a", fx.root), /extends itself \(loop-a -> loop-b -> loop-a\)/);
    assert.throws(() => loadTheme("missing", fx.root), /theme not found: missing/);
    const digits = loadTheme("digits", fx.root);
    assert.strictEqual(digits.colors.ink, "404040", "an unquoted all-digit color still works");
    assert.strictEqual(digits.colors.accent, "000000");
  } finally {
    fx.cleanup();
  }
});

test("contrast follows WCAG: black on white is 21:1; a pale accent is flagged", () => {
  assert.strictEqual(Math.round(contrast("000000", "FFFFFF")), 21);
  const pale = loadTheme("classic-blue", DEMO, { overrides: { colors: { accent: "9ECAE1" } } });
  assert.ok(contrastProblems(pale).some((p) => p.startsWith("links")), "pale links are flagged");
});

test("the classic layout writes no shapes; rounded themes draw rounded shapes and square ones plain rectangles", async () => {
  const classic = await documentXml(loadTheme("classic-blue", DEMO));
  assert.ok(!classic.includes("<wp:anchor"), "classic-blue has no floating shapes");
  const modern = await documentXml(loadTheme("modern", DEMO));
  assert.match(modern, /prst="roundRect"/, "modern draws a rounded header panel and bars");
  const square = await documentXml(loadTheme("modern", DEMO, { overrides: { corners: "square" } }));
  assert.ok(!square.includes('prst="roundRect"') && square.includes('prst="rect"'), "square corners draw rectangles");
  for (const xml of [classic, modern, square]) assert.match(textOf(xml), /Jordan Rivera.*Juniper Freight Co\..*Lakeside State University/s);
});

test("the sidebar layout puts name and contact first in reading order and draws its bars as borders", async () => {
  const xml = await documentXml(loadTheme("sidebar", DEMO));
  assert.match(xml, /<w:tbl>/, "one table holds both columns");
  const text = textOf(xml);
  const at = (s: string) => text.indexOf(s);
  assert.ok(at("Jordan Rivera") < at("jordan.rivera@example.com"), "name before contact");
  assert.ok(at("jordan.rivera@example.com") < at("Summary".toUpperCase()), "contact before the main column");
  assert.ok(at("Analytics") < at("Juniper Freight Co."), "side column (skills) before the main column (experience)");
  const body = xml.split("\n")[0];
  assert.ok(!body.includes("<wp:anchor"), "no shapes in the body: bars are paragraph borders");
  assert.match(xml, /sidebar panel/, "the panel is a shape in the page header");
});

test("tightening scales spacing and type for page fitting but never takes body text below 9 pt", () => {
  const t = loadTheme("compact", DEMO);
  const tightest = tighten(t, FIT_STEPS[FIT_STEPS.length - 1]);
  assert.ok(tightest.sizes.body >= 18, "body stays at 9 pt or more");
  assert.ok(tightest.spacing.sectionHeading.before < t.spacing.sectionHeading.before);
  assert.ok(tightest.page.marginX < t.page.marginX);
  assert.strictEqual(tighten(t, FIT_STEPS[0]), t, "the first step is the theme as designed");
});

test("docs/themes.md documents every theme setting", () => {
  const doc = readFileSync(join(REAL_ROOT, "docs", "themes.md"), "utf8");
  const styleKeys = new Set(["case", "bold", "italic", "tracking", "color"]);
  const missing: string[] = [];
  const walk = (obj: Record<string, unknown>, prefix = "") => {
    for (const [k, v] of Object.entries(obj)) {
      const path = prefix ? `${prefix}.${k}` : k;
      const isStyle = v !== null && typeof v === "object" && !Array.isArray(v) && Object.keys(v).every((x) => styleKeys.has(x));
      if (v !== null && typeof v === "object" && !Array.isArray(v) && !isStyle) walk(v as Record<string, unknown>, path);
      else if (!doc.includes(`\`${path}\``)) missing.push(path);
    }
  };
  walk(DEFAULTS as unknown as Record<string, unknown>);
  assert.deepStrictEqual(missing, [], "add these settings to docs/themes.md");
});

test("an engine run against another copy uses its own defaults, while that copy's custom/ themes still apply", () => {
  const fx = makeFixture({
    "shared/templates/themes/modern.yaml": "description: an older modern from another copy\n",
    "custom/templates/themes/mine.yaml": "extends: modern\ncolors: { accent: \"0F766E\" }\n",
  });
  try {
    assert.match(loadTheme("modern", fx.root).description, /^Clean sans-serif/, "the running engine's modern, not the copy's older one");
    const mine = loadTheme("mine", fx.root);
    assert.strictEqual(mine.colors.accent, "0F766E", "the copy's own theme applies");
    assert.strictEqual(mine.fonts.body, "Calibri", "and it extends the running engine's modern");
  } finally {
    fx.cleanup();
  }
});
