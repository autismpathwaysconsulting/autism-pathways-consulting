# Video-rule projection maintenance

The canonical authority is the private APC-AI-OS master. This public repository
contains only its explicitly marked active-rule block, source identity and SHA-256.
Historical examples, inventories and other private master sections are not exports.

## Update and verify

Use an authorized, up-to-date APC-AI-OS checkout outside this repository. Do not copy
the full master into this repository or into public CI artifacts or logs.

```sh
export APC_VIDEO_RULES_MASTER_PATH=/absolute/path/to/APC-AI-OS/02_CONTENT_SYSTEM/APC_Video_Rules_and_Winning_Examples.md
npm run check:video-rules
npm run sync:video-rules
npm run check:video-rules
npm run test:video-rules
npm run build
npm run test:site-build
```

Alternatively, pass the absolute master path after `--` to either npm command.
Check mode fails closed when the source is missing or the generated projection
differs. It never rewrites the projection. The SHA-256 covers exact full-master bytes,
so a private historical-section edit can also require a refresh without changing
active rules. Verify the source file's repository blob identity before generating.

Review the generated diff before opening a draft PR. If a new active-rule label is
needed, review its publication scope before extending the generator's allowlist.
Update the explicit version/hash pin in the projection regression test only after
checking the authorized source; do not merely change the expected value to pass CI.

## Existing episodes and Founder choices

New prompts and imported production packs require the current exact version/hash.
The server's explicit stored-pack identity list retains the previously deployed
2026-09-06.1 identity only for already stored immutable packs. Their script-lock,
filming, editing and review paths still require the existing prompt binding and QA
gates. This does not permit new imports or prompt revisions under an old identity,
and it does not rewrite episode IDs, prompt artifacts, pack hashes or history.
An old in-progress prompt needs a new current-master prompt revision and a newly
audited pack before a new import can succeed.

Existing scoped Founder-approved v0.5 creative overrides remain after the master
defaults in generated prompts. This refresh does not remove or expand those overrides.

## CI and freshness boundary

`Content video rules QA` runs public projection, generator, privacy-boundary and
workflow regression checks plus the public build allowlist test without private
access or new credentials. It catches accidental changes against the reviewed pin.
It cannot discover a later change inside APC-AI-OS by itself. The mandatory
`check:video-rules` command against an up-to-date authorized master checkout is the
cross-repository freshness gate before approving a master update or releasing this
projection. A green public CI run alone is not proof of live private-master freshness.

The 2026-10-05 refresh was verified against master version 2026-09-27.2, repository
blob `d9798ab5753861eee6d9dc934cfd49d194ef606d`, full-file SHA-256
`b61858a9bbe12cd9b437aefb62b13c2d276d145804e06f6463132f7fe140a97a`.
