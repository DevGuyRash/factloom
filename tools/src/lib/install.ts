// Plans (and, on request, creates) the symlinks that expose this repo's job-application skill to
// hosts that look for skills under ~/.agents or ~/.claude. Never touches anything that isn't
// already a link to the same target, so a real directory or an unrelated link is always left alone.
import { existsSync, lstatSync, mkdirSync, readlinkSync, rmSync, symlinkSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

export type LinkAction = "create" | "already-linked" | "blocked" | "remove" | "already-absent";
export type LinkPlan = { link: string; target: string; action: LinkAction; detail: string };

/** What `link` currently is, relative to the `target` it should point to. */
function describe(link: string, target: string, remove: boolean): LinkPlan {
  let st;
  try {
    st = lstatSync(link);
  } catch {
    return { link, target, action: remove ? "already-absent" : "create", detail: "does not exist" };
  }
  if (st.isSymbolicLink()) {
    const raw = readlinkSync(link);
    const resolved = resolve(dirname(link), raw);
    if (resolved === resolve(target)) {
      return { link, target, action: remove ? "remove" : "already-linked", detail: `already links to ${target}` };
    }
    return { link, target, action: "blocked", detail: `links elsewhere (${raw}); refusing to touch it` };
  }
  return { link, target, action: "blocked", detail: `${st.isDirectory() ? "a real directory" : "a real file"} exists there; refusing to overwrite it` };
}

/** The two conventional skill-link locations and the repo's real skill directory they should point to. */
export function linkTargets(repoRoot: string, home: string): { links: string[]; target: string } {
  const target = join(repoRoot, ".agents", "skills", "job-application");
  return { links: [join(home, ".agents", "skills", "job-application"), join(home, ".claude", "skills", "job-application")], target };
}

export function planLinks(repoRoot: string, home: string, remove = false): LinkPlan[] {
  const { links, target } = linkTargets(repoRoot, home);
  return links.map((link) => describe(link, target, remove));
}

export type ApplyResult = LinkPlan & { applied: boolean };

/** Creates (or removes) the links a plan calls for; never touches a `blocked` entry. */
export function applyLinks(plans: LinkPlan[]): ApplyResult[] {
  return plans.map((p) => {
    if (p.action === "create") {
      mkdirSync(dirname(p.link), { recursive: true });
      symlinkSync(p.target, p.link, "dir");
      return { ...p, applied: true };
    }
    if (p.action === "remove") {
      rmSync(p.link);
      return { ...p, applied: true };
    }
    return { ...p, applied: false };
  });
}
