import assert from "node:assert";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createCompany, findCompany, listCompanies } from "../src/lib/companies.ts";
import companyCmd from "../src/commands/company.ts";
import { makeFixture } from "./helpers/fixture.ts";

function withRoot<T>(root: string, fn: () => T): T {
  const prev = process.env.RESUMES_ROOT;
  process.env.RESUMES_ROOT = root;
  try {
    return fn();
  } finally {
    if (prev === undefined) delete process.env.RESUMES_ROOT;
    else process.env.RESUMES_ROOT = prev;
  }
}

function captureLog(fn: () => void): string[] {
  const lines: string[] = [];
  const orig = console.log;
  console.log = (...a: unknown[]) => lines.push(a.join(" "));
  try {
    fn();
  } finally {
    console.log = orig;
  }
  return lines;
}

test("createCompany renders the dossier template with the expected sections", () => {
  const fx = makeFixture();
  try {
    const company = createCompany("Acme Corp", { website: "https://acme.example" }, fx.root);
    assert.equal(company.slug, "acme-corp");
    const text = readFileSync(company.path, "utf8");
    assert.match(text, /^---\ntype: company\n/);
    assert.match(text, /company: "Acme Corp"/);
    assert.match(text, /website: https:\/\/acme\.example/);
    for (const h of ["What they build", "AI/tech stack", "Values and culture", "People and teams", "News", "Interview notes", "Sources"]) {
      assert.match(text, new RegExp(`## ${h}`));
    }
  } finally {
    fx.cleanup();
  }
});

test("createCompany refuses to duplicate an existing dossier", () => {
  const fx = makeFixture();
  try {
    createCompany("Acme Corp", {}, fx.root);
    assert.throws(() => createCompany("Acme Corp", {}, fx.root), /already exists/);
  } finally {
    fx.cleanup();
  }
});

test("findCompany matches case- and slug-insensitively; listCompanies sorts by name", () => {
  const fx = makeFixture();
  try {
    createCompany("Zeta Industries", {}, fx.root);
    createCompany("Acme Corp", {}, fx.root);
    const found = findCompany("ACME corp", fx.root);
    assert.ok(found);
    assert.equal(found?.slug, "acme-corp");
    assert.equal(findCompany("Nonexistent Co", fx.root), null);
    const names = listCompanies(fx.root).map((c) => c.data.company);
    assert.deepEqual(names, ["Acme Corp", "Zeta Industries"]);
  } finally {
    fx.cleanup();
  }
});

test("company command: new, find, and list", () => {
  const fx = makeFixture();
  try {
    withRoot(fx.root, () => {
      const code = companyCmd.run(["new", "Acme Corp", "--website", "https://acme.example"]);
      assert.equal(code, 0);
      const findLines = captureLog(() => companyCmd.run(["find", "acme corp"]));
      assert.equal(findLines.length, 1);
      assert.match(findLines[0], /custom[\\/]companies[\\/]acme-corp\.md/);
      const listLines = captureLog(() => companyCmd.run(["list"]));
      assert.ok(listLines.some((l) => l.includes("acme-corp")));
    });
  } finally {
    fx.cleanup();
  }
});
