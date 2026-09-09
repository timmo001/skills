# Commands

Run the applicable sections in order in Bash. Replace uppercase input values with the selected destination and observed evidence. Set `SKILL_DIR` to the directory containing the loaded `SKILL.md`. All API calls use explicit repositories. Keep the work directory private and retain it for the report. Stop on a failed command; a payload validation failure is not permission to weaken the baseline.

## 1. Snapshot and select

```bash
set -euo pipefail
export GH_HOST='github.com'
REPO='OWNER/REPO'
SKILL_DIR='ABSOLUTE_PATH_TO_LOADED_SKILL'
WORK="$(mktemp -d "${TMPDIR:-/tmp}/github-ruleset.XXXXXX")"
jq '.' "$SKILL_DIR/references/development.json" > "$WORK/development.json"
gh --version
gh ruleset --help
gh api --method GET "repos/$REPO" \
  --jq '{full_name,visibility,default_branch,html_url}' > "$WORK/repository.json"
gh api --method GET --paginate --slurp \
  "repos/$REPO/rulesets?per_page=100&includes_parents=true" > "$WORK/rulesets.pages.json"
jq 'add' "$WORK/rulesets.pages.json" > "$WORK/rulesets.json"
jq '.[] | {id,name,target,enforcement,source_type,source}' "$WORK/rulesets.json"
```

Select a repository-owned branch ruleset by ID, or choose creation. With multiple candidates, ask which to use and include a create-new option. Existing rulesets may have different names. To compare an existing candidate, save its full detail:

```bash
RULESET_ID='SELECTED_ID'
gh api --method GET \
  "repos/$REPO/rulesets/$RULESET_ID?includes_parents=false" > "$WORK/before.json"
jq -e --arg repo "$REPO" --argjson id "$RULESET_ID" \
  '.source_type == "Repository" and .source == $repo and .id == $id
    and .target == "branch" and (.bypass_actors | type) == "array"' \
  "$WORK/before.json"
jq --slurpfile baseline "$WORK/development.json" '
  def policy: {name,target,enforcement,bypass_actors,conditions,rules}
    | (.rules[] | select(.type == "required_status_checks") | .parameters) |= del(.required_status_checks)
    | .rules |= sort_by(.type)
    | .bypass_actors |= sort_by([.actor_type,.actor_id,.bypass_mode]);
  {id, name, matches_baseline: ((. | policy) == ($baseline[0] | policy)),
   existing_policy: (. | policy), development_policy: ($baseline[0] | policy)}
' "$WORK/before.json" > "$WORK/policy-comparison.json"
jq '.' "$WORK/policy-comparison.json"
```

The comparison excludes required-check identities and ignores rule/bypass ordering. Review any remaining ordering or API-default differences for semantic equivalence. If the policy matches, use `update`. If it differs, show the differences and ask whether to migrate this ID to the bundled policy or create a new ruleset. Use the question tool when available, otherwise ask in chat. Record the answer before continuing.

For a selected existing ruleset, set `MODE` to `update` or `migrate`:

```bash
MODE='SELECTED_EXISTING_OPERATION'
[[ "$MODE" == update || "$MODE" == migrate ]]
cp "$WORK/before.json" "$WORK/source.json"
```

For **creation**, use the bundled baseline. Creating alongside existing rulesets must be the user's explicit choice. Review overlapping and inherited rules because they continue to apply; creating a new ruleset does not replace them.

```bash
MODE='create'
cp "$WORK/development.json" "$WORK/source.json"
```

The bundled baseline contains writable policy fields and built-in repository-role bypass entries. Its required-check list starts empty. Populate it from destination CI before creating the ruleset.

## 2. Observe checks

Set `BRANCH` to the selected pushed CI branch, not a guessed default. Resolve its current remote SHA, then inspect CI without filtering away failures:

```bash
BRANCH='SELECTED_BRANCH'
BRANCH_ESCAPED="$(jq -rn --arg value "$BRANCH" '$value | @uri')"
gh api --method GET "repos/$REPO/branches/$BRANCH_ESCAPED" > "$WORK/branch.json"
SHA="$(jq -er '.commit.sha' "$WORK/branch.json")"
gh run list --repo "$REPO" --commit "$SHA" --event push --limit 100 \
  --json databaseId,headSha,status,conclusion,event,url,workflowName > "$WORK/push-runs.json"
jq '.' "$WORK/push-runs.json"
gh api --method GET --paginate --slurp \
  "repos/$REPO/commits/$SHA/check-runs?per_page=100&filter=latest" > "$WORK/push-checks.pages.json"
```

`run list` is a bounded overview. Increase its limit if reached. Check-run discovery must paginate independently. Verify every selected gate succeeded on this revision and is emitted before the protected update. GitHub documents successful completion in the repository within the past seven days for required checks. Do not choose an older green revision to hide a newer failure.

For an existing representative **open PR**, collect head and test-merge evidence as well. Run this branch only with a selected PR number; do not create a PR as a side effect of ruleset setup.

```bash
PR='SELECTED_PR_NUMBER'
gh api --method GET "repos/$REPO/pulls/$PR" > "$WORK/pr.json"
jq -e '.state == "open"' "$WORK/pr.json"
jq -r '[.head.sha,.merge_commit_sha] | map(select(. != null)) | unique[]' \
  "$WORK/pr.json" > "$WORK/pr-shas.txt"
while IFS= read -r PR_SHA; do
  gh api --method GET --paginate --slurp \
    "repos/$REPO/commits/$PR_SHA/check-runs?per_page=100&filter=latest" \
    > "$WORK/pr-$PR_SHA-checks.pages.json"
done < "$WORK/pr-shas.txt"
```

A null merge SHA, missing PR, or empty result is a coverage gap, not proof of equivalent push/PR checks. Inspect the workflow configuration at the observed revision and relevant run events. When names differ, select the identity that is actually emitted for the protected operation; requiring both event-specific names can deadlock merging. Fork PR checks may need inspection through their suites/runs rather than the commit-ref endpoint.

Compile a readable identity inventory:

```bash
jq -s '[.[][] | .check_runs[] | {
  context: .name, integration_id: .app.id, app: .app.slug,
  sha: .head_sha, status, conclusion, url: .html_url
}]' "$WORK/"*-checks.pages.json > "$WORK/observed.json"
jq '.' "$WORK/observed.json"
```

Resolve the optional-test and unfamiliar-check questions from the skill workflow before selecting exact contexts for additions:

```bash
jq -n --arg context 'EXACT_EMITTED_CHECK_NAME' '[$context]' > "$WORK/selected-contexts.json"
# Add further names from the resolved selection after reviewing their coverage.
jq --slurpfile names "$WORK/selected-contexts.json" '
  [.[] | select(.context as $c | $names[0] | index($c))
   | select(.status == "completed" and .conclusion == "success")
   | {context,integration_id}] | unique_by([.context,.integration_id])
' "$WORK/observed.json" > "$WORK/add-checks.json"
jq -e --slurpfile names "$WORK/selected-contexts.json" '
  (map(.context) | sort) == ($names[0] | unique | sort)
  and all(.[]; (.integration_id | type) == "number")
' "$WORK/add-checks.json"
```

This validates observed names and app IDs, not workflow coverage. Review which SHA/event supplied each identity. Duplicate names from different apps fail the name comparison and need explicit resolution.

When current requirements are missing from check runs or may overlap legacy commit statuses, fetch these for each relevant SHA:

```bash
gh api --method GET --paginate --slurp \
  "repos/$REPO/commits/$SHA/statuses?per_page=100" > "$WORK/statuses.pages.json"
jq 'add | map({context,state,creator: .creator.login,target_url,created_at})' \
  "$WORK/statuses.pages.json"
```

Retain valid legacy requirements. Their creator ID is not an integration ID. If adding a legacy status, select its exact successful context using this evidence and omit a source binding unless independently verified. A check and legacy status sharing a required name must both pass.

## 3. Build and review

Validate the source, then project only writable top-level fields. Check-only updates preserve nested rule parameters even when newer than an example in documentation. Migration uses the bundled policy and carries forward the existing check list for reconciliation.

```bash
[[ "$MODE" == create || "$MODE" == update || "$MODE" == migrate ]]
jq -e '
  (.name | type) == "string" and (.name | length) > 0 and .target == "branch"
  and (.enforcement | type) == "string"
  and (.bypass_actors | type) == "array"
  and (.conditions | type) == "object" and (.rules | type) == "array"
  and ([.rules[] | select(.type == "required_status_checks")] | length <= 1)
' "$WORK/source.json"
jq --arg mode "$MODE" --slurpfile baseline "$WORK/development.json" '
  if $mode == "migrate" then
    [.rules[] | select(.type == "required_status_checks") | .parameters.required_status_checks[]] as $checks
    | $baseline[0]
    | (.rules[] | select(.type == "required_status_checks") | .parameters.required_status_checks) = $checks
  else {name,target,enforcement,bypass_actors,conditions,rules} end
' \
  "$WORK/source.json" > "$WORK/base.json"
```

If `base.json` lacks a status-check rule, copy just that rule and its flags from the bundled baseline:

```bash
if jq -e '[.rules[] | select(.type == "required_status_checks")] | length == 0' "$WORK/base.json"; then
  jq -e '[.rules[] | select(.type == "required_status_checks")] | length == 1' "$WORK/development.json"
  jq --slurpfile baseline "$WORK/development.json" '
    .rules += [$baseline[0].rules[] | select(.type == "required_status_checks")
      | .parameters.required_status_checks = []]
  ' "$WORK/base.json" > "$WORK/base-with-checks.json"
  mv "$WORK/base-with-checks.json" "$WORK/base.json"
fi
jq -e '[.rules[] | select(.type == "required_status_checks")] | length == 1' "$WORK/base.json"
jq -e '.rules[] | select(.type == "required_status_checks") | .parameters
  | (.strict_required_status_checks_policy | type) == "boolean"
    and (.required_status_checks | type) == "array"' "$WORK/base.json"
jq -n '[]' > "$WORK/remove-checks.json"
```

For an update or migration, leave removals empty unless retirement/replacement is evidenced and included in the authorised change. If needed, put the exact original check objects in `remove-checks.json` and record the reason for each. For creation, leave removals empty and add the selected destination checks.

```bash
jq --arg mode "$MODE" --slurpfile additions "$WORK/add-checks.json" \
  --slurpfile removals "$WORK/remove-checks.json" '
  (.rules[] | select(.type == "required_status_checks")
    | .parameters.required_status_checks) |= (
      (if $mode == "create" then [] else . end) as $existing
      | if ($removals[0] - $existing | length) != 0
        then error("Removal does not match an existing requirement")
        else ($existing - $removals[0] + $additions[0])
          | unique_by([.context,.integration_id]) end
    )
' "$WORK/base.json" > "$WORK/reviewed-payload.json"
jq -e '.rules[] | select(.type == "required_status_checks")
  | .parameters.required_status_checks
  | length > 0 and all(.[]; (.context | type) == "string" and (.context | length) > 0)
    and (group_by(.context) | all(.[]; length == 1))' "$WORK/reviewed-payload.json"
jq -e -s '
  def unrelated: (.rules[] | select(.type == "required_status_checks")
    | .parameters) |= del(.required_status_checks);
  (.[0] | unrelated) == (.[1] | unrelated)
' "$WORK/base.json" "$WORK/reviewed-payload.json"
jq -s '
  def checks: [.rules[] | select(.type == "required_status_checks")
    | .parameters.required_status_checks[]];
  (.[0] | checks) as $old | (.[1] | checks) as $new
  | {added: ($new - $old), removed: ($old - $new), retained: ($old - ($old - $new))}
' "$WORK/base.json" "$WORK/reviewed-payload.json" > "$WORK/check-diff.json"
jq '.' "$WORK/check-diff.json"
jq -s '
  def writable: {name,target,enforcement,bypass_actors,conditions,rules};
  {before: (.[0] | writable), proposed: (.[1] | writable)}
' "$WORK/source.json" "$WORK/reviewed-payload.json" > "$WORK/configuration-review.json"
jq '.' "$WORK/configuration-review.json"
```

For creation the diff shows checks added to the bundled baseline. For migration, review every policy difference from the existing `source.json`, including name, enforcement, conditions, bypass actors, status flags and removed rules. When adding a missing status-check rule, review the copied rule and flags too. The preservation assertion only proves that payload generation preserved the prepared base; it does not approve migration differences.

## 4. Authorised write and independent verification

Run **only the chosen operation**, after permission for this destination/change. For updates and migrations, re-read to detect concurrent edits before sending the full payload:

```bash
gh api --method GET "repos/$REPO/rulesets/$RULESET_ID?includes_parents=false" > "$WORK/prewrite.json"
jq -e -s '.[0] == .[1]' "$WORK/before.json" "$WORK/prewrite.json"
gh api --method PUT "repos/$REPO/rulesets/$RULESET_ID" \
  --input "$WORK/reviewed-payload.json" > "$WORK/write-response.json"
```

For creation, recheck the destination-owned inventory against the one used for the create-new decision. Stop and revisit that choice if it changed. This permits explicitly chosen creation alongside existing rulesets:

```bash
gh api --method GET --paginate --slurp \
  "repos/$REPO/rulesets?per_page=100&includes_parents=false" > "$WORK/precreate.pages.json"
jq 'add' "$WORK/precreate.pages.json" > "$WORK/precreate.json"
jq -e -s --arg repo "$REPO" '
  def inventory: map(select(.source_type == "Repository" and .source == $repo)) | sort_by(.id);
  (.[0] | inventory) == (.[1] | inventory)
' "$WORK/rulesets.json" "$WORK/precreate.json"
gh api --method POST "repos/$REPO/rulesets" \
  --input "$WORK/reviewed-payload.json" > "$WORK/write-response.json"
RULESET_ID="$(jq -er '.id' "$WORK/write-response.json")"
```

These rechecks narrow the race window; they are not atomic conditional writes. After an ambiguous timeout, inspect the destination before retrying, especially for POST.

For either operation:

```bash
gh api --method GET "repos/$REPO/rulesets/$RULESET_ID?includes_parents=false" > "$WORK/after.json"
jq -e --arg repo "$REPO" --argjson id "$RULESET_ID" \
  '.source_type == "Repository" and .source == $repo and .id == $id' "$WORK/after.json"
jq -e -s '
  def writable: {name,target,enforcement,bypass_actors,conditions,rules};
  (.[0] | writable) == (.[1] | writable)
' "$WORK/reviewed-payload.json" "$WORK/after.json"
gh ruleset check "$BRANCH" --repo "$REPO"
jq '{id,name,enforcement,url: ._links.html.href}' "$WORK/after.json"
```

Run `gh ruleset check` for each selected protected branch, not just the CI branch if they differ. It includes effective inherited rules. If GitHub normalises order or inserts defaults and the strict comparison fails, inspect the exact diff and establish semantic equivalence before declaring success. Do not automatically restore a snapshot over possible concurrent changes.

## Sources

Verified on 2026-09-09 with `gh 2.100.0` help and GitHub's current documentation:

- [Repository ruleset REST contracts](https://docs.github.com/en/rest/repos/rules): GET detail, optional visibility of bypass actors, writable POST/PUT fields and status-check parameters.
- [JSON import](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/managing-rulesets-for-a-repository#importing-a-ruleset): the web import creates a ruleset; CLI automation uses the REST create contract.
- [Check runs for a Git reference](https://docs.github.com/en/rest/checks/runs#list-check-runs-for-a-git-reference): emitted names/apps, pagination, `filter=latest`, fork and suite-count limitations.
- [Required-check troubleshooting](https://docs.github.com/en/pull-requests/collaborating-with-pull-requests/collaborating-on-repositories-with-code-quality-features/troubleshooting-required-status-checks): recent successful checks, head/test-merge SHA, skipped workflows/jobs, source identity and merge queues.
- [Pull request REST data](https://docs.github.com/en/rest/pulls/pulls#get-a-pull-request) and [commit statuses](https://docs.github.com/en/rest/commits/statuses#list-commit-statuses-for-a-reference).
- [GitHub CLI API](https://cli.github.com/manual/gh_api) and [ruleset commands](https://cli.github.com/manual/gh_ruleset).
