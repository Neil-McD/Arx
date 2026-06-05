# PolyNet Codex Blaxel Runtime Image

This image is the immutable Codex capability layer for Blaxel sandboxes.

It intentionally contains:

- a pinned `@openai/codex` install available as `codex`
- Blaxel's `sandbox-api` binary
- an entrypoint that starts `sandbox-api` before the idle command
- a default Codex config with no approvals and full sandbox access
- basic coding tools: `git`, `ripgrep`, `jq`, `curl`, `python3`, `sudo`, and `bubblewrap`

It intentionally does not contain:

- user ChatGPT/Codex OAuth tokens
- OpenAI API keys
- PolyNet bridge tokens
- project or community memory

Runtime ownership stays split:

- image: Codex binary and default full-access harness config
- Blaxel volume: mutable workspace state
- PolyNet: auth, context ledger, community lens, event stream, and memory candidates
- Codex app-server: native agent loop and thread continuity

## Local smoke

```sh
docker build \
  -t polynet-codex-runtime:0.137.0 \
  --build-arg CODEX_NPM_VERSION=0.137.0 \
  infra/blaxel/codex-runtime

docker run --rm polynet-codex-runtime:0.137.0 \
  bash -lc 'command -v codex && codex --version && grep -q "danger-full-access" "$CODEX_HOME/config.toml"'
```

## Staging use

Push the image to Blaxel:

```sh
npm run push:codex-blaxel-image
```

The push wrapper runs from this image directory with a minimal environment and
sanitizes failure output before printing it.

By default the wrapper requires `BL_WORKSPACE` and `BL_API_KEY` from the shell
or `.env.blaxel.local`. To intentionally use the currently logged-in Blaxel CLI
workspace instead:

```sh
POLYNET_CODEX_BLAXEL_PUSH_ALLOW_CLI_AUTH=true npm run push:codex-blaxel-image
```

Set the Blaxel workspace image env to the deployed custom image name:

```sh
BLAXEL_WORKSPACE_IMAGE=<deployed-polynet-codex-runtime-image>
```

The external app-server auth bridge must still apply fresh user auth at run time.
Do not bake auth into this image.
