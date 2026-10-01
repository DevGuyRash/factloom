// Job-alert intake: pulls job posting URLs out of free text (an email digest, a pasted page) so they
// can be queued without the person re-finding them. Pure text in; the command does the enqueueing.
export type FoundPosting = { url: string; source: string; company?: string; role?: string };

const ATS_PATTERNS: Array<{ source: string; re: RegExp }> = [
  { source: "linkedin", re: /https?:\/\/[\w.-]*linkedin\.com\/jobs\/view\/\d+[^\s<>()"'\]]*/gi },
  { source: "indeed", re: /https?:\/\/[\w.-]*indeed\.com\/(?:viewjob|rc\/clk)[^\s<>()"'\]]*/gi },
  { source: "ziprecruiter", re: /https?:\/\/[\w.-]*ziprecruiter\.com\/(?:jobs?|c)\/[^\s<>()"'\]]*/gi },
  { source: "hiringcafe", re: /https?:\/\/[\w.-]*hiringcafe\.com\/[^\s<>()"'\]]*/gi },
  { source: "greenhouse", re: /https?:\/\/[\w.-]*greenhouse\.io\/[^\s<>()"'\]]*/gi },
  { source: "lever", re: /https?:\/\/[\w.-]*lever\.co\/[^\s<>()"'\]]*/gi },
  { source: "ashby", re: /https?:\/\/[\w.-]*ashbyhq\.com\/[^\s<>()"'\]]*/gi },
  { source: "workday", re: /https?:\/\/[\w.-]*myworkdayjobs\.com\/[^\s<>()"'\]]*/gi },
  { source: "smartrecruiters", re: /https?:\/\/[\w.-]*smartrecruiters\.com\/[^\s<>()"'\]]*/gi },
  { source: "icims", re: /https?:\/\/[\w.-]*icims\.com\/[^\s<>()"'\]]*/gi },
];

function trimPunctuation(url: string): string {
  return url.replace(/[.,);\]]+$/, "");
}

/** The line containing `index`, and the line immediately before it (URLs are often posted on their own line, with the pairing text just above). */
function linesAround(text: string, index: number): { line: string; prev: string } {
  const start = text.lastIndexOf("\n", index) + 1;
  const end = text.indexOf("\n", index);
  const line = text.slice(start, end < 0 ? text.length : end);
  let prev = "";
  if (start > 0) {
    const prevStart = text.lastIndexOf("\n", start - 2) + 1;
    prev = text.slice(prevStart, start - 1);
  }
  return { line, prev };
}

/** `Role at Company`, `Company - Role`, or `Company: Role` on the line holding the URL. */
function pairOf(line: string): { company?: string; role?: string } {
  const withoutUrl = line.replace(/https?:\/\/\S+/g, "").trim();
  let m = /^(.+?)\s+at\s+(.+?)$/i.exec(withoutUrl);
  if (m) return { role: m[1].trim(), company: m[2].trim() };
  m = /^(.+?)\s*[-–:]\s*(.+?)$/.exec(withoutUrl);
  if (m) return { company: m[1].trim(), role: m[2].trim() };
  return {};
}

/** Every recognized job-posting URL in `text`, deduplicated, with company/role when the text pairs them. */
export function extractPostings(text: string): FoundPosting[] {
  const seen = new Set<string>();
  const out: FoundPosting[] = [];
  for (const { source, re } of ATS_PATTERNS) {
    for (const m of text.matchAll(re)) {
      const url = trimPunctuation(m[0]);
      if (seen.has(url)) continue;
      seen.add(url);
      const { line, prev } = linesAround(text, m.index ?? 0);
      const onOwnLine = !line.replace(/https?:\/\/\S+/g, "").trim();
      const { company, role } = pairOf(onOwnLine && prev.trim() ? prev : line);
      out.push({ url, source, company, role });
    }
  }
  return out;
}
