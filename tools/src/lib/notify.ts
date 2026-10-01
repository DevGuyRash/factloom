// Notifications for long-running sessions: ntfy when configured, else a desktop notify-send, else
// print. Network/exec are injected so tests never touch the real network or desktop.
import { spawnSync } from "node:child_process";

export type NotifyVia = "ntfy" | "notify-send" | "print";
export type NotifyResult = { via: NotifyVia; dryRun: boolean };
export type NotifyOptions = { title?: string; dryRun?: boolean };
export type NotifyDeps = {
  env?: Record<string, string | undefined>;
  post?: (url: string, message: string, title?: string) => Promise<void> | void;
  sendDesktop?: (message: string, title?: string) => boolean;
  log?: (line: string) => void;
};

async function defaultPost(url: string, message: string, title?: string): Promise<void> {
  await fetch(url, { method: "POST", body: message, headers: title ? { Title: title } : undefined });
}

function defaultSendDesktop(message: string, title?: string): boolean {
  try {
    const args = title ? [title, message] : [message];
    const r = spawnSync("notify-send", args, { stdio: "ignore" });
    return r.status === 0;
  } catch {
    return false;
  }
}

/** Posts to `RESUMES_NTFY_URL` when set, else tries a desktop notify-send, else prints. */
export async function notify(message: string, opts: NotifyOptions = {}, deps: NotifyDeps = {}): Promise<NotifyResult> {
  const env = deps.env ?? process.env;
  const log = deps.log ?? ((line: string) => console.log(line));
  const url = env.RESUMES_NTFY_URL;
  const prefix = opts.title ? `${opts.title}: ` : "";
  if (opts.dryRun) {
    const via: NotifyVia = url ? "ntfy" : "print";
    log(`[dry run] would notify via ${via}: ${prefix}${message}`);
    return { via, dryRun: true };
  }
  if (url) {
    const post = deps.post ?? defaultPost;
    await post(url, message, opts.title);
    return { via: "ntfy", dryRun: false };
  }
  const sendDesktop = deps.sendDesktop ?? defaultSendDesktop;
  if (sendDesktop(message, opts.title)) return { via: "notify-send", dryRun: false };
  log(`${prefix}${message}`);
  return { via: "print", dryRun: false };
}
