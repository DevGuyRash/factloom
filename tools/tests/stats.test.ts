import assert from "node:assert/strict";
import test from "node:test";
import command from "../src/commands/stats.ts";
import { computeStats } from "../src/lib/stats.ts";
import { makeFixture } from "./helpers/fixture.ts";

function withFixture(files: Record<string, string>, fn: (fx: ReturnType<typeof makeFixture>) => Promise<void> | void) {
  return async () => {
    const fx = makeFixture(files);
    const prev = process.env.RESUMES_ROOT;
    process.env.RESUMES_ROOT = fx.root;
    try {
      await fn(fx);
    } finally {
      if (prev === undefined) delete process.env.RESUMES_ROOT;
      else process.env.RESUMES_ROOT = prev;
      fx.cleanup();
    }
  };
}

test(
  "stats counts responses and interviews by resume variant, with sample size visible",
  withFixture(
    {
      "people/pat-lee/applications/2026-01-01_a_role/record.md":
        '---\ntype: application\nperson: pat-lee\ncompany: "A"\nrole: "Role"\nstatus: interviewing\nresume: ai-engineer\nupdated: "2026-01-01"\n---\n',
      "people/pat-lee/applications/2026-01-02_b_role/record.md":
        '---\ntype: application\nperson: pat-lee\ncompany: "B"\nrole: "Role"\nstatus: drafted\nresume: ai-engineer\nupdated: "2026-01-02"\n---\n',
      "people/pat-lee/applications/2026-01-03_c_role/record.md":
        '---\ntype: application\nperson: pat-lee\ncompany: "C"\nrole: "Role"\nstatus: skipped\nresume: ai-engineer\nupdated: "2026-01-03"\n---\n',
      "people/pat-lee/applications/2026-01-04_d_role/record.md":
        '---\ntype: application\nperson: pat-lee\ncompany: "D"\nrole: "Role"\nstatus: submitted\nresume: ai-engineer\nsource: https://www.board.example/view/1\nupdated: "2026-01-04"\n---\n',
      "people/pat-lee/applications/2026-01-05_e_role/record.md":
        '---\ntype: application\nperson: pat-lee\ncompany: "E"\nrole: "Role"\nstatus: rejected\nresume: ai-engineer\nsource: https://board.example/view/2\nupdated: "2026-01-05"\n---\n',
    },
    async (fx) => {
      const report = computeStats("pat-lee", fx.root);
      // Only applications that went to the employer count: the drafted and skipped ones never did.
      assert.equal(report.byVariant["ai-engineer"].total, 3);
      assert.equal(report.byVariant["ai-engineer"].interview, 1);
      assert.equal(report.byVariant["ai-engineer"].responded, 2);
      // Sources group by the site they were found on, not one bucket per link.
      assert.deepEqual(report.bySource["board.example"], { total: 2, responded: 1, interview: 0 });

      assert.equal(await command.run(["--person", "pat-lee"]), 0);
    },
  ),
);
