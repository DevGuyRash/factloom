import { existsSync } from "node:fs";
import type { Command } from "../lib/command.ts";
import { extractDocumentText } from "../lib/pii.ts";

/**
 * Prints the text software reads from a resume or letter, in the order it reads it: a Word file on any computer, and a
 * PDF where a PDF text reader (pdftotext, from poppler) is installed. It is how a reviewer sees what a parser sees.
 */
const command: Command = {
  name: "text",
  summary: "Print the text a parser reads from a .docx or .pdf file",
  usage: "resumes text <file.docx|file.pdf>",
  async run(argv) {
    const file = argv[0];
    if (!file) { console.error("usage: resumes text <file.docx|file.pdf>"); return 2; }
    if (!existsSync(file)) { console.error(`${file}: not found`); return 1; }
    if (!/\.(docx|pdf)$/i.test(file)) { console.error(`${file}: text reads .docx and .pdf files`); return 2; }
    const text = await extractDocumentText(file);
    if (text === null) {
      console.error(/\.pdf$/i.test(file)
        ? `${file}: this computer has no PDF text reader (pdftotext, from poppler); read the Word file built beside it instead`
        : `${file}: could not be read as a Word file`);
      return 1;
    }
    process.stdout.write(text.endsWith("\n") ? text : `${text}\n`);
    return 0;
  },
};
export default command;
