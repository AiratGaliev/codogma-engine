import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const [baseSha, headSha] = process.argv.slice(2);
if (!baseSha || !headSha) {
  console.error("Usage: node scripts/check-markdown.mjs <base-sha> <head-sha>");
  process.exit(2);
}

const run = (args) => execFileSync("git", args, { encoding: "utf8" });
const changedFiles = run(["diff", "--name-only", `${baseSha}...${headSha}`])
  .split(/\r?\n/)
  .filter((file) => /\.(?:md|mdx|rst)$/i.test(file));

if (changedFiles.length === 0) {
  console.log("No changed Markdown files; documentation checks passed.");
  process.exit(0);
}

const errors = [];
const root = process.cwd();

function report(file, line, message) {
  errors.push(`${file}:${line}: ${message}`);
}

function codeFenceLines(lines) {
  const result = new Set();
  let fence = null;

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (fence === null) {
      const opening = line.match(/^ {0,3}(`{3,}|~{3,})(.*)$/);
      if (opening) {
        fence = { character: opening[1][0], length: opening[1].length, start: index + 1 };
        result.add(index + 1);
      }
      continue;
    }

    result.add(index + 1);
    const closing = new RegExp(
      `^ {0,3}${fence.character === "`" ? "\\\`" : "~"}{${fence.length},}[\\t ]*$`,
    );
    if (closing.test(line)) fence = null;
  }

  if (fence !== null) {
    report(currentFile, fence.start, "незакрытый fenced code block");
  }

  return result;
}

function validateAddedLinks(file, sourceLines, fencedLines, addedLines) {
  const linkPattern = /!?\\[[^\\]]*\\]\\(\\s*(?:<([^>]+)>|((?:\\\\.|[^\\s)])+))/g;

  for (const lineNumber of addedLines) {
    if (fencedLines.has(lineNumber)) continue;
    const line = sourceLines[lineNumber - 1] ?? "";
    for (const match of line.matchAll(linkPattern)) {
      let destination = (match[1] ?? match[2] ?? "").trim();
      if (!destination || destination.startsWith("#") || /^(?:[a-z][a-z0-9+.-]*:|\\/\\/)/i.test(destination)) continue;

      destination = destination.split(/[?#]/, 1)[0];
      if (!destination) continue;
      try {
        destination = decodeURIComponent(destination);
      } catch {
        report(file, lineNumber, `некорректное URL-кодирование ссылки: ${destination}`);
        continue;
      }

      const targetPath = destination.startsWith("/")
        ? path.resolve(root, `.${destination}`)
        : path.resolve(path.dirname(path.resolve(root, file)), destination);

      if (targetPath !== root && !targetPath.startsWith(`${root}${path.sep}`)) {
        report(file, lineNumber, `ссылка выходит за пределы репозитория: ${destination}`);
      } else if (!existsSync(targetPath)) {
        report(file, lineNumber, `локальная цель ссылки не существует: ${destination}`);
      }
    }
  }
}

let currentFile = "";
let newLine = 0;
const addedLinesByFile = new Map();
const diff = run(["diff", "--unified=0", `${baseSha}...${headSha}`, "--", "*.md", "*.mdx", "*.rst"]);
for (const line of diff.split(/\r?\n/)) {
  if (line.startsWith("+++ b/")) {
    currentFile = line.slice("+++ b/".length);
    if (!addedLinesByFile.has(currentFile)) addedLinesByFile.set(currentFile, []);
    continue;
  }
  const hunk = line.match(/^@@ -\\d+(?:,\\d+)? \\+(\\d+)(?:,\\d+)? @@/);
  if (hunk) {
    newLine = Number(hunk[1]);
    continue;
  }
  if (line.startsWith("+") && !line.startsWith("+++")) {
    addedLinesByFile.get(currentFile)?.push(newLine);
    newLine += 1;
  } else if (line.startsWith(" ")) {
    newLine += 1;
  }
}

for (const file of changedFiles) {
  let content;
  try {
    content = readFileSync(file, "utf8");
  } catch (error) {
    report(file, 1, `не удалось прочитать Markdown: ${error.message}`);
    continue;
  }

  if (!content.endsWith("\n")) report(file, content.split("\n").length, "нет завершающего LF");
  if (content.includes("\r")) report(file, 1, "обнаружен CR/CRLF; репозиторий использует LF");

  const sourceLines = content.split("\n");
  const previousFile = currentFile;
  currentFile = file;
  const fencedLines = codeFenceLines(sourceLines);
  currentFile = previousFile;

  validateAddedLinks(file, sourceLines, fencedLines, addedLinesByFile.get(file) ?? []);
}

if (errors.length > 0) {
  for (const error of errors) console.error(`::error::${error}`);
  process.exit(1);
}

console.log(`Validated ${changedFiles.length} changed Markdown file(s): LF, final newline, fenced blocks and newly added relative links.`);
