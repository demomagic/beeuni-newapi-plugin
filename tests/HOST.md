# New API runtime checks

The Node.js tests check the direct Beeuni plugin without sending live requests.
The golden fixture also runs inside New API's JavaScript engine.
It checks request descriptors, native presenters, billing facts, and rejected inputs.
It does not create Beeuni sessions or start a server.

Use a New API executable that supports Task Plugin API v1 and its plugin CLI.
Set `NEW_API_BIN` to that executable's absolute path. From this repository root:

```sh
"$NEW_API_BIN" plugin lint plugin.js
"$NEW_API_BIN" plugin test plugin.js --fixture tests/host.fixture.json
```

The CLI compiles the source and validates its manifest before running fixtures.
Do not replace these checks with a JSON-schema check alone.

The initial implementation was checked against New API source commit
`c9c6da2786b6a0912215127e78e28fbc6650c85f`.
The plugin contract reference is
[Task Plugin API v1](https://github.com/QuantumNous/new-api/blob/c9c6da2786b6a0912215127e78e28fbc6650c85f/docs/plugin-api/v1.md).

If building the full executable is unnecessary, a Go entry point can call
the official `github.com/QuantumNous/new-api/pkg/jsplugin.RunCLI` function.
Build it against the same New API checkout and module dependencies.
Pass `lint plugin.js` or `test plugin.js --fixture tests/host.fixture.json`
to that entry point. This runs the same validator without starting New API.

All credentials, task identifiers, and addresses in the fixture are synthetic.
Do not add live credentials, account identifiers, or customer prompts.

## Documentation review

The English and Chinese guides and release notes were reviewed against
`new-api-plugins` commit `278e92ee46c26801e4e9007409e31869bd33debc` on
2026-11-14, using the Usage guide and Changelog sections of
`docs/plugin-api/v1.md`. `tests/distribution.test.js` checks selected format
and content invariants; it is not the marketplace's Markdown validator.

On the same date, the 0.1.0 plugin request builders and response parsers were
exercised against the hosted Beeuni API: session creation, running/completed
results, native result rendering, and replay with the same idempotency key.
Replay reused the session. This was a direct API test, not a full New API
gateway deployment or marketplace review. No live identifiers or credentials
are included in the fixtures or distribution archive.

The 0.2.0 continuation changes have local unit tests and official-runtime
fixtures, including origin-task resolution and prompt-scoped result checks.
They have not been verified against the hosted API or a deployed New API
gateway. The earlier 0.1.0 live checks do not establish continuation support.
