# Security

## Reporting a problem

Please report security problems privately, not in a public issue. Use GitHub's "Report a vulnerability" button on the repository's Security tab. Include what you found, how to reproduce it, and which version you used. You will get a reply within a week.

Please do not include real study content, credentials or personal data in a report.

## How Atlas is built to be safe

- **No server.** Atlas has no backend, accounts, telemetry or analytics. Data stays in the app's data folder on the user's computer.
- **Sandboxed interface.** The renderer runs with `contextIsolation`, `sandbox` and no Node integration. It can reach the main process only through a small bridge whose every call is validated with zod on the main side, and only from the app's own page.
- **Strict content policy.** The packaged interface is served from a private `atlas://` origin with a Content Security Policy that allows only that origin. It cannot load remote scripts, styles or frames, navigate away, open windows or request device permissions.
- **Network calls only from the main process**, and only for: the AI provider the user connected, the update check, the optional public library index, and the school calendar sync if enabled.
- **Secrets in the OS keychain.** API keys and school portal credentials are stored with Electron `safeStorage`, never in the database, logs, exports or packs.
- **AI sign-ins stay with the provider.** Subscription sign-ins go through the provider's official CLI or SDK. Atlas never reads or stores their tokens or session files.
- **Logs hold no content.** The local log records what the app did and what failed, not study material, prompts or answers.

## Supported versions

Only the latest release receives fixes.
