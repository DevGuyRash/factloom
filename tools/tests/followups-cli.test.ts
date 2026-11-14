import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import test from "node:test";
import { makeFixture, REAL_ROOT, verifyFixtureApplication } from "./helpers/fixture.ts";

test("followups CLI rejects invalid horizons without listing applications", () => {
  const fx = makeFixture({
    "people/pat-lee/applications/2099-01-01_future_role/record.md":
      '---\ntype: application\nperson: pat-lee\ncompany: Future\nrole: Role\nstatus: submitted\nfollow_up: "2099-01-08"\nupdated: "2099-01-01"\n---\n',
  });
  try {
    verifyFixtureApplication(fx.root, "2099-01-01_future_role");
    for (const args of [["--days"], ...["", " ", "bogus", "Infinity", "-Infinity", "NaN", "100000000000", "3000000", "-3000000"].map((v) => [`--days=${v}`])]) {
      const result = spawnSync(process.execPath, [join(REAL_ROOT, "tools/src/cli.ts"), "followups", "--person", "pat-lee", ...args], {
        env: { ...process.env, RESUMES_ROOT: fx.root, TZ: "UTC" }, encoding: "utf8",
      });
      assert.equal(result.status, 1, JSON.stringify({ args, ...result }));
      assert.equal(result.stdout, "");
      assert.match(result.stderr, /--days (takes a finite number|must produce a follow-up horizon)/);
    }
  } finally { fx.cleanup(); }
});

test("followups CLI preserves valid offsets and four-digit year boundaries", () => {
  // Fix only the subprocess clock; exercise the real CLI and date arithmetic without
  // a midnight boundary changing the expected horizon between invocations.
  const fixedNow = "2026-11-14T12:00:00Z";
  const clock = `data:text/javascript,${encodeURIComponent(`const OriginalDate = Date;
    globalThis.Date = class extends OriginalDate {
      constructor(...args) { super(...(args.length ? args : [${JSON.stringify(fixedNow)}])); }
      static now() { return new OriginalDate(${JSON.stringify(fixedNow)}).getTime(); }
    };`)}`;
  const now = new Date(fixedNow);
  const today = new Date(`${now.toISOString().slice(0, 10)}T00:00:00Z`);
  const dateAt = (offset: number) => new Date(today.getTime() + offset * 86400000).toISOString().slice(0, 10);
  const dates = { Past: dateAt(-1), Today: dateAt(0), Tomorrow: dateAt(1), Last: "9999-12-31", First: "0000-01-01" };
  const fx = makeFixture();
  try {
    for (const [company, date] of Object.entries(dates)) {
      const ref = `2020-01-01_${company.toLowerCase()}_role`;
      fx.write(`people/pat-lee/applications/${ref}/record.md`, `---\ntype: application\nperson: pat-lee\ncompany: ${company}\nrole: Role\nstatus: submitted\nfollow_up: "${date}"\nupdated: "2020-01-01"\n---\n`);
      verifyFixtureApplication(fx.root, ref);
    }
    // An unreviewed application remains held rather than becoming eligible.
    fx.write("people/pat-lee/applications/2020-01-01_held_role/record.md", `---\ntype: application\nperson: pat-lee\ncompany: Held\nrole: Role\nstatus: submitted\nfollow_up: "${dateAt(0)}"\nupdated: "2020-01-01"\n---\n`);
    const offsetTo = (date: string) => (new Date(`${date}T00:00:00Z`).getTime() - today.getTime()) / 86400000;
    const cases: [string[], string[]][] = [
      [[], ["Past", "Today", "First"]],
      [["--days=0"], ["Past", "Today", "First"]],
      [["--days=1"], ["Past", "Today", "Tomorrow", "First"]],
      [["--days=-1"], ["Past", "First"]],
      [["--days=1.5"], ["Past", "Today", "Tomorrow", "First"]],
      [[`--days=${offsetTo("9999-12-31")}`], Object.keys(dates)],
      [[`--days=${offsetTo("0000-01-01")}`], ["First"]],
    ];
    for (const [args, expected] of cases) {
      const result = spawnSync(process.execPath, ["--import", clock, join(REAL_ROOT, "tools/src/cli.ts"), "followups", "--person", "pat-lee", ...args], {
        env: { ...process.env, RESUMES_ROOT: fx.root, TZ: "UTC" }, encoding: "utf8",
      });
      assert.equal(result.status, 0, result.stderr);
      const eligible = result.stdout.split("\n").filter((line) => line.includes(" — follow up by "));
      for (const company of Object.keys(dates)) assert.equal(eligible.some((line) => line.includes(`(${company} — Role)`)), expected.includes(company), `${args}: ${company}\n${result.stdout}`);
      assert.ok(!eligible.some((line) => line.includes("(Held — Role)")));
    }
    for (const days of [offsetTo("9999-12-31") + 1, offsetTo("0000-01-01") - 1]) {
      const result = spawnSync(process.execPath, ["--import", clock, join(REAL_ROOT, "tools/src/cli.ts"), "followups", "--person", "pat-lee", `--days=${days}`], {
        env: { ...process.env, RESUMES_ROOT: fx.root, TZ: "UTC" }, encoding: "utf8",
      });
      assert.equal(result.status, 1);
      assert.equal(result.stdout, "");
      assert.match(result.stderr, /horizon between 0000-01-01 and 9999-12-31/);
    }
  } finally { fx.cleanup(); }
});
