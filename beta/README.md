# Beta workshop publish

Files used by `.github/workflows/publish-beta.yml` to publish a chosen branch
to the **pre-release** Steam Workshop entry (separate from the main release).
The branch is selected each time you trigger the workflow from the Actions UI.

- `mod.xml` — beta version of `mod/mod.xml`. Replaces the production file in the
  uploaded content. Owns the workshop title, description, author, and `ugcId`.
- `preview.jpg` — Steam Workshop preview image (the thumbnail on the workshop page).
- `build.py` — stages `mod/` to a temp dir, swaps in `beta/mod.xml`, and emits
  `workshop.vdf` for `steamcmd workshop_build_item`.
- `totp.py` — generates a Steam Guard TOTP code from `STEAM_SHARED_SECRET`. Run
  in CI before every login so steamcmd doesn't need a stored session.

## Running the workflow

Actions → "Publish to Beta Workshop" → "Run workflow" → pick a branch → Run.
Whatever's in `mod/` on that branch gets uploaded to the beta workshop entry,
with `beta/mod.xml` swapped in as `mod.xml`.

The main workshop entry is unaffected; it stays manual via the in-game uploader.

## Required GitHub secrets

| Secret | What it is |
| --- | --- |
| `STEAM_USERNAME` | The bot Steam account's username. |
| `STEAM_PASSWORD` | The bot account's password. |
| `STEAM_SHARED_SECRET` | Base64 shared_secret from the bot's mobile authenticator. Lets CI compute a valid 2FA code every run. |

## One-time bot account setup

The bot account needs Steam Guard configured as a **software TOTP authenticator**
that we control, so CI can generate codes without a phone. The tool that handles
this on Linux is `steamguard-cli`.

### 1. Install `steamguard-cli`

Arch:

```
yay -S steamguard-cli
```

Or download a release binary from
<https://github.com/dyc3/steamguard-cli/releases>.

### 2. Pair the bot account

```
steamguard setup
```

Follow the prompts. You'll need:

- The bot's username and password.
- Access to the bot's email — Steam sends a verification code for login and a
  second one to finalise the authenticator pairing.

It will also show you a **revocation code (R…)**. Save that somewhere safe; it's
the only way to detach the authenticator later if you lose the `maFile`.

When this completes, `steamguard-cli` writes a `maFile` for the account at
`~/.config/steamguard-cli/maFiles/<username>.maFile`. That file contains the
`shared_secret` we need.

### 3. Extract `shared_secret`

```
jq -r .shared_secret ~/.config/steamguard-cli/maFiles/<steamid>.maFile
```

That base64 string is the value for `STEAM_SHARED_SECRET`.

### 4. Add the three GitHub secrets

Repo Settings → Secrets and variables → Actions → New repository secret. Add
`STEAM_USERNAME`, `STEAM_PASSWORD`, and `STEAM_SHARED_SECRET`.

### 5. Keep the `maFile` somewhere safe

If you ever lose it without saving the revocation code, you can't remove the
authenticator from the account. Back it up to a password manager.
