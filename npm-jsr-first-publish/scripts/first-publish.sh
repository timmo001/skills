#!/usr/bin/env bash
# Prepare new npm and JSR packages for their first OIDC release:
# publish a 0.0.0 npm placeholder, add the npm trusted publisher,
# then create and link the JSR package.
set -euo pipefail

usage() {
  cat <<'EOF'
Usage: first-publish.sh --repo OWNER/NAME [options] PACKAGE_DIR...

List package directories in dependency order.

Options:
  --workflow FILE     Release workflow filename (default: release.yml)
  --environment NAME  GitHub Actions environment the publish job uses
  --skip-jsr          Only set up npm
  --dry-run           Pack and rewrite placeholders, publish nothing
  -h, --help          Show this help
EOF
}

die() {
  printf 'Error: %s\n' "$*" >&2
  exit 1
}

repo=""
workflow="release.yml"
environment=""
jsr=1
dry_run=0
package_dirs=()

while (($#)); do
  case "$1" in
    --repo) repo="${2:?--repo needs a value}"; shift 2 ;;
    --workflow) workflow="${2:?--workflow needs a value}"; shift 2 ;;
    --environment) environment="${2:?--environment needs a value}"; shift 2 ;;
    --skip-jsr) jsr=0; shift ;;
    --dry-run) dry_run=1; shift ;;
    -h | --help) usage; exit 0 ;;
    -*) usage >&2; die "unknown option $1" ;;
    *) package_dirs+=("$(realpath "$1")"); shift ;;
  esac
done

[[ -n $repo && ${#package_dirs[@]} -gt 0 ]] || { usage >&2; exit 2; }
[[ $repo == */* ]] || die "--repo must be OWNER/NAME"

for command in npm jq curl tar git; do
  command -v "$command" >/dev/null || die "$command is required"
done

npm_version="$(npm --version)"
if [[ "$(printf '%s\n' 11.15.0 "$npm_version" | sort -V | head -n1)" != 11.15.0 ]]; then
  die "npm $npm_version is too old for npm trust; need 11.15.0 or later"
fi

if ((!dry_run)) && [[ ! -t 0 ]]; then
  die "run this in an interactive terminal; npm and JSR need browser sign-in"
fi

open_url() {
  printf '  %s\n' "$1"
  if command -v xdg-open >/dev/null; then
    xdg-open "$1" >/dev/null 2>&1 || true
  fi
}

names=()
for dir in "${package_dirs[@]}"; do
  [[ -f $dir/package.json ]] || die "$dir has no package.json"
  name="$(jq -r .name "$dir/package.json")"
  version="$(jq -r .version "$dir/package.json")"
  [[ $version != 0.0.0 ]] || die "$name is at 0.0.0, which the placeholder needs"
  if [[ -f $dir/jsr.json ]] && [[ "$(jq -r .version "$dir/jsr.json")" != "$version" ]]; then
    die "$name: jsr.json and package.json versions differ"
  fi
  root="$(git -C "$dir" rev-parse --show-toplevel)"
  [[ -f $root/.github/workflows/$workflow ]] || die "$root/.github/workflows/$workflow does not exist"
  names+=("$name")
done

work="$(mktemp -d "${TMPDIR:-/tmp}/first-publish.XXXXXX")"
printf 'Working in %s\n' "$work"

if ((!dry_run)); then
  npm whoami >/dev/null 2>&1 || npm login
  printf 'npm user: %s\n' "$(npm whoami)"
fi

names_json="$(printf '%s\n' "${names[@]}" | jq -R . | jq -s .)"

printf '\n== npm placeholders\n'
for dir in "${package_dirs[@]}"; do
  name="$(jq -r .name "$dir/package.json")"
  if npm view "$name" name >/dev/null 2>&1; then
    printf '%s is already on npm, skipping its placeholder\n' "$name"
    continue
  fi

  target="$work/$(basename "$dir")"
  mkdir -p "$target"
  (cd "$dir" && npm pack --pack-destination "$target" >&2)
  tarballs=("$target"/*.tgz)
  tar -xzf "${tarballs[0]}" -C "$target"

  (
    cd "$target/package"
    jq --argjson names "$names_json" '
      def placeholder: with_entries(if (.key | IN($names[])) then .value = "0.0.0" else . end);
      .version = "0.0.0"
      | del(.scripts.prepack, .scripts.prepare, .scripts.prepublishOnly, .scripts.postpack)
      | del(.publishConfig.provenance)
      | if .dependencies then .dependencies |= placeholder else . end
      | if .peerDependencies then .peerDependencies |= placeholder else . end
      | if .optionalDependencies then .optionalDependencies |= placeholder else . end
    ' package.json >package.json.tmp
    mv package.json.tmp package.json
    if grep -q '"workspace:' package.json; then
      die "$name still has workspace: dependencies after packing"
    fi
    jq '{name, version, dependencies, peerDependencies}' package.json
    if ((dry_run)); then
      npm publish --access public --provenance=false --ignore-scripts --dry-run
    else
      npm publish --access public --provenance=false --ignore-scripts
    fi
  )
done

printf '\n== npm trusted publishers\n'
for name in "${names[@]}"; do
  trust_args=(trust github "$name" --repo "$repo" --file "$workflow" --allow-publish --yes)
  [[ -z $environment ]] || trust_args+=(--env "$environment")
  if ((dry_run)); then
    printf 'Would run: npm %s\n' "${trust_args[*]}"
    continue
  fi

  # npm only prompts for 2FA when attached to the terminal, so don't capture its output.
  until npm "${trust_args[@]}"; do
    printf '\nnpm trust failed for %s. A new package can take over 10 minutes to reach the registry,\n' "$name"
    printf 'and npm allows one trusted publisher per package, so an existing one also fails.\n'
    read -rp "Press Enter to retry in 30 seconds, or type s to skip: " answer
    [[ $answer != s ]] || break
    sleep 30
  done
  npm trust list "$name" || true
  sleep 2
done

if ((jsr)); then
  printf '\n== JSR packages\n'
  for dir in "${package_dirs[@]}"; do
    [[ -f $dir/jsr.json ]] || continue
    jsr_name="$(jq -r .name "$dir/jsr.json")"
    scope="${jsr_name#@}"
    scope="${scope%%/*}"
    package="${jsr_name#*/}"
    response="$work/jsr-$scope-$package.json"

    while true; do
      status="$(curl -sS -o "$response" -w '%{http_code}' "https://api.jsr.io/scopes/$scope/packages/$package")"
      if [[ $status == 404 ]]; then
        printf 'Create %s (scope @%s, package %s) on JSR, then link it to %s in its Settings tab:\n' "$jsr_name" "$scope" "$package" "$repo"
        if ((dry_run)); then break; fi
        open_url "https://jsr.io/new"
        read -rp "Press Enter once it is created and linked... "
        continue
      fi
      [[ $status == 200 ]] || die "JSR API returned $status for $jsr_name"

      linked="$(jq -r '.githubRepository // empty | "\(.owner)/\(.name)"' "$response")"
      if [[ ${linked,,} == "${repo,,}" ]]; then
        printf '%s exists and is linked to %s\n' "$jsr_name" "$repo"
        break
      fi
      printf '%s is linked to "%s". Link it to %s in its settings:\n' "$jsr_name" "${linked:-nothing}" "$repo"
      if ((dry_run)); then break; fi
      open_url "https://jsr.io/$jsr_name/settings"
      read -rp "Press Enter once it is linked... "
    done
  done
fi

printf '\nDone. Release versions must match the release tag; the first GitHub release publishes the real versions.\n'
