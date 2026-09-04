export type FrontmatterParse = {
  fields: Map<string, string>;
  failures: string[];
};

const unquote = (value: string) => {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  )
    return value.slice(1, -1);
  return value;
};

const foldBlock = (lines: string[], keepNewlines: boolean) => {
  const trimmed = lines.map((line) => line.replace(/^\s+/, ""));
  if (keepNewlines) return trimmed.join("\n").trim();
  return trimmed.join(" ").replace(/\s+/g, " ").trim();
};

/** Parse Agent Skills YAML frontmatter, including folded `>` / `>-` scalars. */
export const parseFrontmatter = (text: string): FrontmatterParse => {
  const lines = text.split(/\r?\n/);
  const failures: string[] = [];
  if (lines[0] !== "---")
    return {
      fields: new Map<string, string>(),
      failures: ["missing opening frontmatter delimiter"],
    };
  const end = lines.indexOf("---", 1);
  if (end < 0)
    return {
      fields: new Map<string, string>(),
      failures: ["missing closing frontmatter delimiter"],
    };

  const fields = new Map<string, string>();
  const body = lines.slice(1, end);
  for (let index = 0; index < body.length; index += 1) {
    const line = body[index] ?? "";
    if (!line || line.trimStart().startsWith("#")) continue;
    if (/^\s/.test(line)) {
      failures.push(
        `unexpected indented frontmatter line: ${JSON.stringify(line)}`,
      );
      continue;
    }
    const match = line.match(/^([a-z][a-z0-9-]*):(.*)$/);
    if (!match) {
      failures.push(
        `invalid top-level frontmatter line: ${JSON.stringify(line)}`,
      );
      continue;
    }
    const key = match[1] ?? "";
    const rest = (match[2] ?? "").trim();
    if (rest === ">" || rest === ">-" || rest === "|" || rest === "|-") {
      const block: string[] = [];
      while (index + 1 < body.length) {
        const next = body[index + 1] ?? "";
        if (!/^\s/.test(next)) break;
        index += 1;
        if (next.trimStart().startsWith("#")) continue;
        block.push(next);
      }
      fields.set(key, foldBlock(block, rest === "|" || rest === "|-"));
      continue;
    }
    fields.set(key, unquote(rest));
  }
  return { fields, failures };
};
