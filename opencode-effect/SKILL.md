---
name: opencode-effect
description: Develop and migrate OpenCode V2 plugins, clients, SDK hosts, and HTTP API integrations. Use for the OpenCode plugin API, `@opencode-ai/client`, `@opencode-ai/sdk`, server API, Effect entrypoints, or V1-to-V2 API migration.
---

# OpenCode V2 Development

Use OpenCode V2 and its Effect-native APIs unless the user explicitly asks for
V1, a Promise-only integration, or hybrid compatibility.

## Source Rule

1. Read the relevant current V2 guide before writing code:
   - plugins: <https://opencode.ai/v2/docs/build/plugins/effect>
   - network client: <https://opencode.ai/v2/docs/build/client/effect>
   - embedded SDK: <https://opencode.ai/v2/docs/build/sdk/effect>
   - HTTP API: <https://opencode.ai/v2/docs/api>
   - V1 migration inputs: <https://opencode.ai/v2/docs/migrate-v1>
2. Check the target project's exact pinned OpenCode and Effect package versions.
   Inspect both published metadata and the installed `package.json` `exports`
   map before using a subpath. Confirm that every OpenCode package resolves to
   a mutually compatible release and that Effect platform packages use the
   same Effect release channel.
3. Treat moving tags in installation examples as discovery inputs, not package
   constraints. Resolve and lock exact versions. Do not assume separately
   moving plugin, client, and SDK tags form a compatible set, or replace a
   missing Effect export with a Promise/root entrypoint.
4. Do not infer V2 contracts from V1 docs or from
   `https://opencode.ai/config.json`.

## Defaults

- Write plugins with `@opencode-ai/plugin/effect`, `Plugin.define`, and an
  `effect` function. Use the plugin `Scope` for registrations, finalizers, and
  scoped fibers instead of manual Promise cleanup.
- Connect applications with `@opencode-ai/client/effect`. Compose operations
  with `Effect`, consume subscriptions as `Stream` values, and use
  `@opencode-ai/client/effect/service` for the Node background service.
- Embed OpenCode with `@opencode-ai/sdk/effect`. Own the host with
  `Effect.scoped` or provide it through `OpenCode.layer()`.
- Use the generated client instead of hand-written HTTP calls when an endpoint
  is available. For direct API work, verify the operation and schema in the V2
  API reference or the running server's `/openapi.json`, use Effect's
  `HttpClient`, and decode request and response boundaries with `Schema`.
- Keep decoded branded values such as `AbsolutePath`, `Location.Ref`, and
  resource IDs. Do not cast plain strings or untrusted responses into them.
- Keep expected client failures in the Effect error channel. Use `Effect.orDie`
  only when the surrounding application deliberately treats that failure as a
  defect.

## Plugin Example

```ts
import { Plugin } from "@opencode-ai/plugin/effect"
import { Effect } from "effect"

export default Plugin.define({
  id: "example",
  effect: (ctx) =>
    Effect.gen(function* () {
      yield* ctx.storage.set("loaded", true)
      yield* Effect.addFinalizer(() => ctx.storage.remove("loaded"))
    }),
})
```

Plugin hook callbacks and registered command, tool, integration, or websearch
executors return `Effect` values. Tool inputs and outputs use Effect `Schema`
rather than unchecked JSON Schema casts.

## Client Example

```ts
import { AbsolutePath, Location, OpenCode } from "@opencode-ai/client/effect"
import { Effect } from "effect"
import { FetchHttpClient } from "effect/unstable/http"

const program = Effect.gen(function* () {
  const client = yield* OpenCode.make({ baseUrl: "http://localhost:4096" })
  return yield* client.session.create({
    location: Location.Ref.make({
      directory: AbsolutePath.make("/workspace"),
    }),
  })
})

const session = await Effect.runPromise(
  program.pipe(Effect.provide(FetchHttpClient.layer)),
)
```

Use `Stream` operators for `client.event.subscribe()` and other streaming
operations. Provide the required HTTP, filesystem, and platform layers at the
application boundary, not inside reusable workflows.

## SDK Example

```ts
import { AbsolutePath, Location, OpenCode } from "@opencode-ai/sdk/effect"
import { Effect } from "effect"

const program = Effect.scoped(
  Effect.gen(function* () {
    const opencode = yield* OpenCode.create()
    return yield* opencode.sessions.create({
      location: Location.Ref.make({
        directory: AbsolutePath.make("/workspace"),
      }),
    })
  }),
)

const session = await Effect.runPromise(program)
```

## Promise And V1 Exceptions

- Retain Promise plugin, client, or SDK code only when documenting migration
  input, maintaining a concrete Promise-only consumer, or providing an
  explicitly labelled hybrid compatibility path. Keep the Effect result as the
  recommended V2 output.
- Use `@opencode-ai/client`, `@opencode-ai/client/service`, or the Promise SDK
  only inside that documented exception. Do not present them as the default V2
  starting point.
- Treat V1 plugin and server APIs as migration inputs only. V1 plugins do not
  run on V2, and V1 server integrations must move to the V2 API.
- Preserve supported V1 configuration only when compatibility is the goal;
  new native V2 configuration and code should use V2 shapes and entrypoints.

## Verification

Typecheck examples against the target project's exact locked package set after
verifying every imported subpath in published and installed package metadata.
Exercise plugin load and cleanup, and run one real client or SDK operation. For
direct HTTP work, verify the same operation with `opencode2 api` or the
Effect-native generated client.
