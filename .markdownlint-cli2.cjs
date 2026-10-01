module.exports = {
  // Structural rules are enforced; noisy stylistic rules are disabled with a
  // reason.
  config: {
    default: true,
    // Off: long lines are unavoidable in docs, tables, and code samples.
    MD013: false,
    // Off: docs and skills use inline HTML intentionally.
    MD033: false,
    // Off: reference and skill docs legitimately repeat section headings.
    MD024: false,
    // Off: emphasis is used as pseudo-headings in docs and skill callouts.
    MD036: false,
    // Off: skill docs open with --- frontmatter, not an h1.
    MD041: false,
    // Off: table pipe spacing style is noise across skill tables.
    MD060: false,
  },
  gitignore: true,
  globs: ["**/*.md"],
  ignores: [
    "**/node_modules",
    "**/node_modules/**",
  ],
};
