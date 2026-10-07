---
name: npm-jsr-first-publish
license: Apache-2.0
compatibility: Requires npm 11.15 or later, jq, curl, Git, an npm account with two-factor authentication, a JSR account, and a GitHub Actions release workflow that publishes to npm and JSR with OIDC.
description: Prepare a brand-new npm and JSR package for its first release from GitHub Actions. The bundled script publishes an npm 0.0.0 placeholder, adds the npm trusted publisher, and creates and links the JSR package. Use before a new package's first release, or when its release fails because the npm package doesn't exist, has no trusted publisher, or the JSR package isn't linked.
---

# npm and JSR First Publish

npm trusted publishing (OIDC) only works for a package that already exists, and JSR's OIDC publishing needs the package created and linked to its GitHub repository first. Neither can happen from a release workflow, so the first publish needs a one-off human run of [first-publish.sh](scripts/first-publish.sh).

The script publishes a `0.0.0` placeholder instead of the real version. The shared npm publish workflow doesn't skip versions that already exist, so publishing the real version by hand makes the release's npm job fail as a duplicate.

## Workflow

1. **Check the package is releasable.** Before any human step:
   - The caller release workflow exists, runs on `release: published`, and grants `id-token: write` to the publish jobs. Note its filename and any `environment:` on the publish jobs, since the trusted publisher must match both.
   - Release tags equal the version (`0.1.0`, no `v` prefix), and `package.json` and `jsr.json` versions match.
   - JSR resolves bare imports from `dependencies` and `devDependencies`, not `peerDependencies`. List every peer in `devDependencies` as well, or JSR's server rejects the publish even though `jsr publish --dry-run` passes locally.
   - Dependencies between packages in the same repository use exact versions, not `workspace:`.
   - The repository's checks, `npm pack --dry-run` and `jsr publish --dry-run` pass, and the changes are pushed.
2. **Prepare the script in tmp.** Copy [first-publish.sh](scripts/first-publish.sh) to `/tmp/opencode/<repository>/first-publish.sh`, keep it executable, and run it yourself with `--dry-run` and the real arguments. Package directories go in dependency order. Fix anything the dry run reports.
3. **Hand it to the user.** Give the exact command without `--dry-run`, to run in their own terminal. Don't run it for them: `npm login`, npm's browser 2FA, and creating and linking on jsr.io are human-only. The script:
   - signs in to npm if needed;
   - packs each package (running its own build), rewrites the copy to `0.0.0` without pack scripts or provenance (provenance only works in CI), points sibling dependencies at `0.0.0`, and publishes it;
   - runs `npm trust github <package> --repo <owner/name> --file <workflow> --allow-publish` attached to the terminal, so npm can ask for 2FA, and offers a retry if it fails while the new package reaches the registry;
   - opens jsr.io to create each JSR package and link it to the repository, then confirms through the JSR API.
4. **Verify without waiting on the registries.** Both registries are likely to look missing for a while, and that's safe to continue past:
   - npm returns 404 to `npm view` and signed-out requests for 10 minutes or more after a first publish, even though the website already shows the package and `npm trust` works straight away.
   - JSR's package page has no versions until the first release, and new versions take a while to appear.

   Take the script's output as evidence: `+ <package>@0.0.0`, "Trust configuration created successfully" (`npm trust list` needs an npm login), and the JSR check confirming the link. Confirm the link with `curl https://api.jsr.io/scopes/<scope>/packages/<name>`, where `githubRepository` should be set. Move on to the next step and check `npm view <package> versions` in a background shell instead of blocking on it.
5. **First release, only when asked.** Publish the GitHub release for the real version and watch its run. `dot git-releases` can't create a repository's first release (its refresh gets a 404 for the missing latest release), so use `gh release create <version> --title <version> --notes-file <file>` instead. The new versions can take minutes to appear on npm and JSR; a green run with "+ <package>@<version>" in the npm job is enough to continue.

## Traps

- npm prompts for 2FA only when attached to a terminal. Never capture or pipe the output of `npm publish` or `npm trust` in the script.
- npm allows one trusted publisher per package. If one exists with the wrong repository, workflow or environment, the user replaces it with `npm trust revoke --id <id> <package>`, then reruns the script.
- Allow publishing, not only staged publishing. A staged-only trusted publisher leaves releases waiting for approval.
- A failed release job reruns against the same tag. If a fix needs a code change, release a patch version, or have the user run `jsr publish` locally from a clean checkout of that version.
- Leave the placeholder at `0.0.0`. The first real release becomes `latest` because it's higher.
