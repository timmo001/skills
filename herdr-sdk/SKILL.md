---
name: herdr-sdk
description: Use dmmulroy/herdr-ts-sdk (@herdr/sdk) for Effect TypeScript integrations with Herdr. Use when adding, migrating, debugging, or reviewing SDK consumers; read current upstream docs and installed contracts before coding. For terminal or workspace control, use the herdr skill.
license: Apache-2.0
compatibility: Requires a TypeScript project with @herdr/sdk and compatible Effect/platform packages, an SDK-supported runtime, access to current upstream docs, and a compatible Herdr local socket server for live integration checks.
---

# Herdr SDK

Use [`@herdr/sdk` from dmmulroy/herdr-ts-sdk](https://github.com/dmmulroy/herdr-ts-sdk)
for Effect integrations. Prefer its supported operations over hand-written socket
clients or CLI wrappers. Use the separate `herdr` skill when operating terminals,
panes, tabs, or workspaces as an agent.

1. **Read current docs first.** Read the upstream [README](https://github.com/dmmulroy/herdr-ts-sdk/blob/main/README.md)
   and [package metadata](https://github.com/dmmulroy/herdr-ts-sdk/blob/main/package.json).
   Follow their current installation and compatibility guidance; do not assume
   registry availability or reuse remembered API signatures.
2. **Check the consumer.** Inspect its manifest, lockfile, installed SDK and Effect
   packages, overrides, and patches. Establish the resolved SDK revision, public
   exports, and runtime/Herdr protocol requirements before choosing APIs. Treat
   declarations or lock entries as unverified installations when packages are absent.
3. **Resolve differences at source.** Compare current docs with the installed
   revision's [public source](https://github.com/dmmulroy/herdr-ts-sdk/tree/main/src)
   and declarations. Use contracts supported by that consumer; make any required
   dependency upgrade explicit. Retrieve examples from upstream instead of keeping
   a copied API reference here.
4. **Keep the integration Effect-native.** Apply the `effect` skill alongside the
   SDK docs. Compose SDK services and layers at the application boundary, preserve
   typed failures, and keep streams and resources within their owning scope.
5. **Verify the change.** Run the consumer's typecheck and relevant tests against
   its resolved packages. For live checks, target the intended Herdr server and
   exercise the changed operation and resource cleanup. Report checked revisions,
   docs used, and any verification blocked by unavailable dependencies or runtime.
