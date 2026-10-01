// Converts a .docx to a PDF beside it with LibreOffice.
import { spawnSync } from "node:child_process";
import { existsSync, statSync } from "node:fs";
import { dirname } from "node:path";

/**
 * Returns the PDF path, or null when no working LibreOffice binary exists (the .docx is still
 * usable on its own). /usr/bin/soffice is tried before /usr/local/bin/soffice because on this
 * host /usr/local/bin/soffice is a firejail wrapper that cannot read files under /tmp.
 */
export function toPdf(docxPath: string): string | null {
  const candidates = [process.env.SOFFICE, "/usr/bin/soffice", "/usr/lib/libreoffice/program/soffice",
    "/Applications/LibreOffice.app/Contents/MacOS/soffice", "soffice", "libreoffice"]
    .filter((x): x is string => Boolean(x));
  const pdf = docxPath.replace(/\.docx$/i, ".pdf");
  for (const bin of candidates) {
    const r = spawnSync(bin, ["--headless", "--convert-to", "pdf", "--outdir", dirname(docxPath), docxPath], { stdio: "ignore" });
    if (r.status === 0 && existsSync(pdf) && statSync(pdf).mtimeMs >= statSync(docxPath).mtimeMs) return pdf;
  }
  return null;
}
