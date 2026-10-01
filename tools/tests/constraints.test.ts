// Constraints: onboarding asks for them up front, and a block catches other forms of an employer's name.
import assert from "node:assert/strict";
import test from "node:test";
import { blockEmployer, isBlocked } from "../src/lib/employers.ts";
import { loadCatalog, openCoreQuestions } from "../src/lib/catalog.ts";
import { makeFixture, REAL_ROOT } from "./helpers/fixture.ts";

test("onboarding asks what rules a job out and which employers to avoid", () => {
  const core = new Map(loadCatalog(REAL_ROOT).filter((e) => e.core).map((e) => [e.id, e]));
  for (const id of ["prefs.constraints", "employers.avoid", "prefs.work-arrangement", "prefs.relocation", "prefs.travel", "comp.minimum", "employment.type", "work-auth.sponsorship"]) {
    assert.ok(core.has(id), `${id} is asked up front`);
  }
  assert.match(core.get("prefs.constraints")!.ask, /commute[\s\S]*physical demands[\s\S]*prefs\.schedule/, "it covers what the other questions miss, and files schedule limits where forms look");
  const fx = makeFixture();
  try {
    const open = openCoreQuestions("pat-lee", fx.root).map((e) => e.id);
    assert.ok(open.includes("prefs.constraints") && open.includes("employers.avoid"), "a new person is asked both");
  } finally {
    fx.cleanup();
  }
});

test("a blocked employer is caught under a shorter or longer form of its name, by whole words only", () => {
  const fx = makeFixture();
  try {
    blockEmployer("pat-lee", "SWCA Environmental Consultants", "current employer", fx.root);
    blockEmployer("pat-lee", "Meta", "personal choice", fx.root);
    for (const name of ["SWCA Environmental Consultants", "SWCA Environmental Consultants, Inc.", "SWCA", "swca"]) assert.ok(isBlocked("pat-lee", name, fx.root), name);
    for (const name of ["Meta Platforms", "META"]) assert.ok(isBlocked("pat-lee", name, fx.root), name);
    for (const name of ["SWCAM Labs", "Metabolic Labs", "Environmental Consultants Group", "Acme"]) assert.ok(!isBlocked("pat-lee", name, fx.root), name);
  } finally {
    fx.cleanup();
  }
});
