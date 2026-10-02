---
name: wrangler
description: Use the project's Wrangler CLI for Cloudflare development, configuration, and deployment. Load before running Wrangler or changing its configuration; retrieve exact flags and binding shapes from current docs and installed schemas.
compatibility: Requires the project's Wrangler dependency and supported Node.js runtime. Remote operations require Cloudflare authentication.
license: Apache-2.0
# origin: https://github.com/cloudflare/skills/tree/main/skills/wrangler
# upstream-sha: 41e0d19858946d18af9ee2c2feebbe2e11d829ff
# local-edits:
#   - SKILL.md: replaced the bundled CLI manual with project-local version, source lookup, and scoped verification guidance
---

# Wrangler

If the project has a `cloudflare.config.ts` file, or the user has asked you to use the `cf` CLI, do not use this skill. Follow the [Cloudflare CLI documentation](https://developers.cloudflare.com/cf/index.md) instead.

1. Inspect the project's package manifest, lockfile, scripts, and Wrangler configuration. Run its existing task or local binary. A missing global command does not mean the project dependency is absent.
2. Check the local version and relevant subcommand's `--help`. Do not silently install or upgrade Wrangler during a read, review, or deployment. If installation is needed, follow the repository's package manager and dependency policy.
3. Retrieve only the documentation needed for the operation. Prefer Cloudflare's documentation search and use the installed `node_modules/wrangler/config-schema.json` for the project's accepted configuration shape.
4. Confirm the target config, account, environment, resource, and local-versus-remote mode before a state-changing command. Follow the user's requested scope; listing resources does not authorise mutation or deployment.
5. Use existing build, type-generation, validation, or dry-run tasks where relevant. A successful dry run verifies packaging, not deployed behaviour. Report the actual result and any remaining verification limit.

## Configuration

- Preserve the project's existing format and pinned compatibility date unless changing them is part of the task. New configurations may use `wrangler.jsonc`.
- Framework-generated configuration belongs to its generator. Use the build output the framework's deployment script selects; do not hand-edit generated files.
- Keep secrets in the project's supported secret mechanism, never in tracked config or command output.
- Check environment inheritance in the current configuration reference rather than assuming bindings or variables carry across environments.
- Reconcile dashboard changes before deploying because Wrangler can overwrite
  dashboard variables and routes. Verify existing resource identifiers;
  omitted identifiers can trigger automatic provisioning.
- With the Cloudflare Vite plugin, select the environment at dev or build time.
  Setting an environment only at deploy time does not retarget flattened build
  configuration.
- Prefer types matching the project's installed dependencies and compatibility settings. Newer published types alone are not a reason to change its runtime contract.

## Previews

- Workers Previews requires project-local Wrangler 4.135.0 or later. Check the
  project's pinned version and make any required dependency upgrade explicit.
- Use Previews for branch and pull request environments under one Worker,
  Version URLs for a specific uploaded version with production resources, and
  Wrangler environments for persistent separate Workers.
- Follow the project's existing configuration and deployment approach for
  Preview domains and deployments. Mirror the management approach, not
  production resource bindings or data.
- Follow current configuration placement and resource-isolation guidance. A
  Preview name does not prove its resources are isolated; treat missing
  bindings and shared production resources as validation gaps.
- Preview URLs are public unless access controls are configured. Tell the user
  and let them decide whether to protect the URLs. Confirm the intended Worker
  or Wrangler environment and pass the same `--env` value to every Preview
  command.
- Do not test destructive writes without explicit authorisation. A returned
  Preview URL does not validate behaviour that depends on missing bindings.

## Authentication and secrets

- Retrieve the current role and API token scope for the exact remote operation.
  Prefer narrow account-owned API tokens when granular access is required.
- Keep secret values out of command arguments, source, logs, and chat. Treat
  `wrangler secret put` and `secret delete` as deployments because they create
  and deploy a version immediately.
- Use authentication profiles when the project requires account separation.
  Claim deployments are for eligible unauthenticated prototypes, not
  production or CI.

## Sources

- [Install and update](https://developers.cloudflare.com/workers/wrangler/install-and-update/index.md): project-local installation and package-manager invocation.
- [Commands](https://developers.cloudflare.com/workers/wrangler/commands/index.md): exact subcommands, flags, and remote effects.
- [Configuration](https://developers.cloudflare.com/workers/wrangler/configuration/index.md): environment inheritance and binding fields.
- [Workers Previews](https://developers.cloudflare.com/workers/previews/index.md): [configuration](https://developers.cloudflare.com/workers/previews/configuration/index.md), [resource isolation](https://developers.cloudflare.com/workers/previews/resources/index.md), and [workflow comparison](https://developers.cloudflare.com/workers/previews/compare-workflows/index.md).
- [Preview custom domains and access](https://developers.cloudflare.com/workers/previews/custom-domains/index.md): URL access controls.

Use `workers-best-practices` for Worker implementation concerns. This skill does not replace that guidance with a copied API manual.
