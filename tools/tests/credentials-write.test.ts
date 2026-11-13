// Synthetic credentials only. Instrument actual filesystem writes in a child so
// failure injection and umask changes cannot affect other tests.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

const moduleUrl = new URL("../src/commands/credentials.ts", import.meta.url).href;
for (const scenario of ["create", "replace", "write-failure", "fsync-failure", "rename-failure", "interrupted", "symlink"] as const) {
  test(`credential write: ${scenario}`, { skip: process.platform === "win32" }, () => {
    const root = mkdtempSync(join(tmpdir(), "credential-write-"));
    const dir = join(root, "people", "demo");
    mkdirSync(dir, { recursive: true });
    const destination = join(dir, "accounts.local.md");
    const target = join(root, "unrelated");
    if (scenario !== "create") writeFileSync(destination, "prior credentials", { mode: scenario === "replace" ? 0o666 : 0o600 });
    if (scenario === "symlink") {
      rmSync(destination);
      writeFileSync(target, "unrelated content");
      symlinkSync(target, destination);
    }
    try {
      const result = spawnSync(process.execPath, ["--input-type=module", "-e", `
        import fs from "node:fs";
        import { syncBuiltinESMExports } from "node:module";
        process.umask(0);
        const originalWrite = fs.writeFileSync;
        const originalRename = fs.renameSync;
        fs.writeFileSync = function(fd, content, ...rest) {
          if (typeof fd === "number") {
            if ((fs.fstatSync(fd).mode & 0o777) !== 0o600) throw Error("insecure initial permissions");
            originalWrite(fd, content, ...rest);
            if (${JSON.stringify(scenario)} === "interrupted") process.exit(73);
            if (${JSON.stringify(scenario)} === "write-failure") throw Error("injected write failure");
            return;
          }
          return originalWrite(fd, content, ...rest);
        };
        if (${JSON.stringify(scenario)} === "fsync-failure") fs.fsyncSync = () => { throw Error("injected fsync failure"); };
        fs.renameSync = function(...args) {
          if (${JSON.stringify(scenario)} === "rename-failure") throw Error("injected rename failure");
          return originalRename(...args);
        };
        syncBuiltinESMExports();
        const { saveCredentials } = await import(${JSON.stringify(moduleUrl)});
        saveCredentials("demo", "fictional@example.test", "synthetic-password", ${JSON.stringify(root)});
      `], { encoding: "utf8" });
      const remnants = readdirSync(dir).filter((name) => name !== "accounts.local.md");
      if (scenario === "interrupted") {
        assert.equal(result.status, 73, result.stderr);
        assert.equal(readFileSync(destination, "utf8"), "prior credentials");
        assert.equal(remnants.length, 1);
        assert.match(remnants[0], /\.local\.md$/);
        assert.equal(statSync(join(dir, remnants[0])).mode & 0o777, 0o600);
      } else if (scenario.endsWith("failure")) {
        assert.notEqual(result.status, 0);
        assert.match(result.stderr, /injected (write|fsync|rename) failure/);
        assert.equal(readFileSync(destination, "utf8"), "prior credentials");
        assert.deepEqual(remnants, []);
      } else {
        assert.equal(result.status, 0, result.stderr);
        assert.match(readFileSync(destination, "utf8"), /password: synthetic-password/);
        assert.equal(statSync(destination).mode & 0o777, 0o600);
        assert.deepEqual(remnants, []);
        if (scenario === "symlink") assert.equal(readFileSync(target, "utf8"), "unrelated content");
      }
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
}
