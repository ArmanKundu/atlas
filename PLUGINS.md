# Atlas plugins

> **Status:** this describes the plugin format Atlas is being built toward. The loader, the permission checks and the three example plugins arrive with the plugin system; nothing here is loaded by the app yet. The format may change until then.

A plugin is a folder or a GitHub repository with an `atlas-plugin.json` manifest at its root. Plugins extend Atlas without a server: they run on the user's computer with only the permissions the user approved.

## Manifest

```json
{
  "id": "formula-sheet-builder",
  "name": "Formula sheet builder",
  "version": "1.0.0",
  "description": "Collects formulas from your notes into a printable sheet.",
  "author": "Your name",
  "permissions": ["read:subjects", "read:questions", "write:notes"],
  "entry": {
    "agents": ["agents/formula-coach.md"],
    "skills": ["skills/formula-sheet"],
    "panels": [{ "id": "sheet", "title": "Formula sheet", "page": "panel/index.html" }],
    "mediaTemplates": ["templates/derivation.scene.js"]
  }
}
```

## Permissions

A plugin gets nothing by default. The user sees the list and approves it before the plugin is enabled.

| Permission         | Allows                                                |
| ------------------ | ----------------------------------------------------- |
| `read:subjects`    | Read subjects and topic trees                         |
| `read:questions`   | Read questions, answers and tags                      |
| `write:notes`      | Create and edit notes                                 |
| `ai`               | Send prompts through the user's connected AI provider |
| `network:<domain>` | Make requests to that one domain                      |
| `files`            | Read files the user explicitly picks                  |

## Entry points

- **Agents and modes.** Markdown prompt files that add assistant agents or Ask modes.
- **Skills.** `SKILL.md` folders in Claude's skill format. With Claude as the provider they are loaded as skills; with other providers the Markdown is passed as instructions.
- **Panels.** A page shown in a sandboxed iframe. It talks to Atlas only through a `postMessage` API limited to the granted permissions.
- **Media templates.** Scene templates for the media studio's scene API.

## Installing

In Settings → Plugins: paste a GitHub URL (Atlas downloads a release zip, shows the permissions and asks for approval), or pick a local folder while developing. Plugins can be enabled, disabled, removed and updated there.

## Rules for plugin authors

- No copyrighted study material inside a plugin.
- Ask for the fewest permissions that work.
- A plugin must never help complete assessed work dishonestly.
