---
name: github-repository-setup
license: Apache-2.0
description: Create GitHub repositories with the preferred feature and squash-merge settings, offer CI and automerge workflows, and finish first-push setup with a Development ruleset. Use when creating a GitHub repository, using gh repo create, applying repository defaults, or completing a new repository's initial GitHub setup.
compatibility: Requires authenticated GitHub CLI, Git, jq, repository creation or settings write access, and the shared-workflows and github-development-rulesets skills for their setup steps.
---

# GitHub Repository Setup

Use these defaults for personal repositories. Resolve the authenticated account and destination owner at runtime. For organisation repositories, follow the owner's policy rather than automatically imposing personal settings.

## Workflow

1. **Resolve the destination and visibility before creation.** Establish the host, owner, repository name and local source. Use an explicitly requested public/private choice, or infer it only from unambiguous task context such as a stated private project. An account's other repositories, a local directory, or GitHub's defaults do not establish visibility. If visibility is unspecified and cannot be inferred, ask public or private with the question tool before creating anything; fall back to chat when unavailable. Record the chosen visibility and its basis.
2. **Create the repository and apply the defaults.** Check current `gh repo create --help` and `gh repo edit --help`. Pass the resolved owner/name and an explicit visibility flag to creation, with `--disable-wiki`. For an existing local repository, use its actual source and selected remote without overwriting another remote. A creation request alone does not authorise committing or pushing: use `--push` only when a push was explicitly requested. Apply the settings below as part of the requested setup and read them back. Report unsupported settings or policy/plan restrictions rather than claiming success.
3. **Offer missing workflows using relevant evidence.** Inspect the destination's workflows, language, package manager, build/test commands, deployment targets and Renovate configuration. If CI is missing, offer to set it up. Base the recommendation on a small sample of related or heavily used repositories in the user's personal account: prefer matching stacks and release/deployment needs, recent successful runs and sustained maintenance. Show the source repositories, workflow paths and why they fit. A recent timestamp or high star count alone is not evidence of personal use. Resolve candidates dynamically rather than maintaining a hardcoded repository list. Keep private repository details and configuration out of public files.
   - Apply `shared-workflows` for reusable workflow selection and caller setup. Inspect the selected contracts at their pinned revisions and adapt to the destination's real commands. Offer relevant lint, build, test and release/deployment workflows, without copying unrelated jobs or inventing required secrets. Implement the accepted selection and validate it locally.
   - Inspect existing automerge workflows by behaviour, including `.github/workflows/renovate-automerge.yml`, reusable workflow calls and other workflows using `gh pr merge --auto --squash`. If missing, offer the matching automation. For personal setup using `timmo001/workflows`, source Renovate automation from its maintained [reusable Renovate automerge workflow](https://github.com/timmo001/workflows/blob/master/.github/workflows/renovate-automerge.yml). Resolve the current default-branch SHA, inspect the contract at that exact revision and create a minimal job-level `uses:` caller pinned to it. Do not bundle a snapshot of its implementation in this skill. Confirm Renovate is configured or include its setup in the offer. Other automerge workflows should follow the owner-selected shared source's eligibility rules, triggers and token requirements. Reuse an existing shared caller; migrate an inline equivalent when replacing it is in scope.
4. **Complete the first push and Development ruleset in order.** When a push is authorised, push the initial code and selected CI workflows, then establish successful CI on the pushed revision. Apply `github-development-rulesets` for ruleset selection, permissions, observed required-check identities and verification. If the first push already happened, resume here using the latest pushed revision. If CI is absent, make the workflow offer first; defer CI-backed enforcement until real checks exist. Keep test-check selection and policy decisions with the ruleset skill. Do not copy required-check names from another repository.
5. **Activate and verify selected automerge automation.** The repository's auto-merge switch enables the capability; workflows opt eligible PRs into it. Put required checks and the Development ruleset in place before activating a new automerge workflow. `--auto` waits for merge requirements, not every workflow merely present in the repository. Preserve squash merging, bot/PR eligibility checks and required permissions. For the reusable Renovate workflow, use a `pull_request_target` caller with `contents: write` and `pull-requests: write`; its current contract needs no inputs or extra secrets. Let the shared workflow own bot filtering, merge commands and concurrency. Verify these details against the selected revision. Keep this privileged workflow metadata-only: no checkout or execution of PR code. Validate the selected workflows and confirm their behaviour on the next eligible PR when one is available; do not create or merge a PR just to test setup.
6. **Report the result.** Include repository URL and visibility, verified settings, workflows added or retained with source refs, first-push/CI evidence, ruleset result, and any declined or deferred setup. If no push was authorised, clearly identify the post-push steps still pending.

## Repository Defaults

These are the requested baseline, so do not ask the user to reconfirm each switch.

| Setting | Value |
| --- | --- |
| Wikis | Disabled |
| Projects | Disabled |
| Discussions | Disabled |
| Allow merge commits | Disabled |
| Allow rebase merging | Disabled |
| Allow squash merging | Enabled |
| Squash default commit message | Pull request title and commit details |
| Always suggest updating pull request branches | Enabled |
| Allow auto-merge | Enabled, supporting the selected automerge workflows |
| Automatically delete head branches | Enabled |

Apply to the explicitly resolved repository URL (`REPO_URL`):

```bash
gh repo edit "$REPO_URL" \
  --enable-wiki=false \
  --enable-projects=false \
  --enable-discussions=false \
  --enable-merge-commit=false \
  --enable-rebase-merge=false \
  --enable-squash-merge \
  --squash-merge-commit-message=pr-title-commits \
  --allow-update-branch \
  --enable-auto-merge \
  --delete-branch-on-merge
```

Read back from the selected `HOST` and `OWNER/REPO`:

```bash
gh api --hostname "$HOST" "repos/$REPO" --jq '{
  full_name, visibility, has_wiki, has_projects, has_discussions,
  allow_merge_commit, allow_rebase_merge, allow_squash_merge,
  squash_merge_commit_title, squash_merge_commit_message,
  allow_update_branch, allow_auto_merge, delete_branch_on_merge
}'
```

Compare every field with the table. The squash setting must read back as `squash_merge_commit_title: "PR_TITLE"` and `squash_merge_commit_message: "COMMIT_MESSAGES"`. Missing fields are unverified, not false. Scope the edit to these settings; repository visibility is resolved separately before creation.

## Sources

- [GitHub CLI repository creation](https://cli.github.com/manual/gh_repo_create)
- [GitHub CLI repository settings](https://cli.github.com/manual/gh_repo_edit)
- [GitHub repository API](https://docs.github.com/en/rest/repos/repos#update-a-repository)
- [GitHub CLI PR merging](https://cli.github.com/manual/gh_pr_merge)
