# Cribl Pipeline Visualizer

A Cribl App that opens an existing pipeline (in a pack or directly in a worker group) in an editor that looks and works like Cribl's own, and adds one thing Cribl lacks: a **before and after preview for each function**. Click any function to see the events just before it (IN) and just after it (OUT), with the changes highlighted. Then step through the pipeline one function at a time with ‹ ›.

## When to use this app

It is useful for demoing what a single function does, and for finding the function that breaks your data.

## How to use

- **Start screen.** It shows how the preview works and asks what to open: **Open packs** for Worker Group → Pack → Pipeline, or **Open pipelines** for the worker group's own pipelines. Click the app title to return to it.
- **Pick a pipeline.** Switch any time with the **Source** toggle (**Packs** | **Pipelines**) at the top. Only Stream groups are listed.
- **Pipelines overview.** Once a pack (or worker group) is chosen, its pipelines are listed as on Cribl's Pipelines page: Route / Source, f(x), Destination, Description and the In / Out / Err event counts of the last 15 minutes. Filter the list, then click a pipeline to open it. **← Pipelines** (or the browser's Back button) returns to the list, so you can work through a pack one pipeline at a time.
- **Links into the app.** The current place is kept in the URL, so you can bookmark or share it, and other tools can link straight to a pack or a pipeline (see [Deep links](#deep-links)).
- **Edit it like in Cribl.** You get:
  - Numbered function list, comment rows, enable toggles, Final marker and Filter column.
  - Drag to reorder, plus Insert / Copy / Disable / Delete from the ⋯ menu.
  - Add Function ▾ and a { } JSON view.
- **Function settings forms.** These are generated from each function's schema, so they match Cribl's own forms. That includes the Parser library picker, Code editor and Advanced sections.
- **Preview.** The right pane has:
  - Sample data file picker and Run button. Picking another function, or switching between one function and the whole pipeline, runs the preview straight away.
  - **Before & after one function** (the default): IN │ OUT side by side, highlighted diff (added / removed / changed / dropped) and per-function stats.
  - **Whole pipeline**: Cribl's Simple Preview, with field and byte % stats.
- **Draggable splitter** between the editor and the preview. Double-click it to reset.
- **Save / Cancel** at the bottom of the editor. Your edits stay in the app until you press Save. Save writes the pipeline to the pack or worker group, but nothing is committed or deployed. Commit and deploy from Cribl when you are ready.

### How preview works

Cribl's preview API only runs saved pipelines. So when you press Run, the app writes your edits to a scratch pipeline called `ppc_scratch_preview` in the same pack (or worker group, for a group pipeline), and previews that. The real pipeline isn't touched until you press Save. You can remove the scratch pipeline from the preview pane. If you don't, the next Run reuses it.

## Before you install

You need a Cribl Cloud workspace (or a Leader) on version 4.19 or later, with App Platform enabled, and a Cribl role that can read (and, to save, edit) pipelines in the worker group.

## Installation

1. In Cribl, open **Apps** and find **Cribl Pipeline Visualizer** in the app catalog. Or, under **Add App → Import from Git**, use `https://github.com/Cribl-Community/cc-pipeline-visualizer` with the ref `latest`. A `.tgz` from the [latest release](https://github.com/Cribl-Community/cc-pipeline-visualizer/releases/latest) works with **Import from File** too.
2. Review the API permissions it asks for (listed below) and install.
3. Grant access under **Apps → Cribl Pipeline Visualizer → Settings → Members & Teams**.
4. Open the app, choose **Open packs** or **Open pipelines**, pick a worker group (and pack), click a pipeline, choose a sample file and press **Run**.

## Configuration

None. The app has no settings; what you can open and save follows your Cribl role.

### Deep links

Open the app at a specific pack or pipeline by adding a path to its URL. The paths follow Cribl's own URLs:

| Link | Opens |
|---|---|
| `/apps/a/cc-pipeline-visualizer/groups/<group>/packs/<pack>` | The pipelines overview of a pack |
| `/apps/a/cc-pipeline-visualizer/groups/<group>/packs/<pack>/pipelines/<pipeline>` | That pipeline in the pack |
| `/apps/a/cc-pipeline-visualizer/groups/<group>/pipelines` | The worker group's own pipelines |
| `/apps/a/cc-pipeline-visualizer/groups/<group>/pipelines/<pipeline>` | One of the worker group's own pipelines |

Pack ids are matched case-insensitively. From another Cribl App, open the link with `<a href="/apps/a/cc-pipeline-visualizer/groups/…" target="_blank">`. Pressing the browser's Back button in a pipeline returns to the overview. The place is kept in the path, not the query string, because Cribl passes only the path to the app when the user goes Back. The older `?group=<group>&pack=<pack>&pipeline=<pipeline>` links still work and are rewritten to the path form.

## Permissions and external access

These are declared in [config/policies.yml](https://github.com/Cribl-Community/cc-pipeline-visualizer/blob/main/config/policies.yml):

| API | Why |
|---|---|
| `GET /master/groups`, `GET /m/*/packs` | Worker group and pack pickers |
| `GET/POST /m/*/p/*/pipelines`, `GET/PATCH/DELETE /m/*/p/*/pipelines/*` | Open and save the pipeline. Create and remove the scratch pipeline |
| `GET /m/*/p/*/functions`, `GET /m/*/p/*/lib/parsers` | Function catalogue, schemas and the Parser library |
| `GET /m/*/p/*/lib/breakers`, `/m/*/p/*/system/lookups`, `/m/*/system/certificates`, `/timezoneInfo` | Dropdown choices in function settings (read-only) |
| `GET /m/*/system/samples…`, `GET /m/*/p/*/system/samples…` | Sample data files (group and pack) |
| The same paths without `/p/*` (`/m/*/pipelines…`, `/m/*/functions`, `/m/*/preview`, …) | The worker group's own pipelines, when **Source** is **Pipelines** |
| `POST /m/*/p/*/preview` | Run the preview |
| `GET /m/*/p/*/routes`, `GET /m/*/p/*/system/inputs` (and without `/p/*`) | Route / Source and Destination columns of the pipelines overview (read-only) |
| `POST /system/metrics/query` | In / Out / Err counts of the overview (read-only query) |

External hosts: none. The app declares no proxies and makes no external calls.

## Data and storage

- The app stores nothing of its own: no settings, no app KV store, nothing in the browser.
- Your edits stay in the page until you press **Save**, which writes the pipeline to its pack or worker group. Nothing is committed or deployed.
- **Run** writes your edits to the scratch pipeline `ppc_scratch_preview` in the same pack or worker group. It stays there until you remove it from the preview pane, and the next Run reuses it.
- Sample events are read from the worker group's sample files and sent only to your Cribl preview API.

## Development

Requirements: Node 20+ and npm.

```bash
npm install
cp local.env.example local.env   # fill in your workspace URL and an API client ID/secret
npm run dev:standalone           # http://127.0.0.1:5190
```

In standalone mode, a Vite plugin ([scripts/standalone-plugin.mjs](https://github.com/Cribl-Community/cc-pipeline-visualizer/blob/main/scripts/standalone-plugin.mjs)) proxies API calls to your workspace. It uses the OAuth client in `local.env`, which never leaves your machine and is git-ignored.

| Script | What it does |
|---|---|
| `npm run dev:standalone` | Dev server against the workspace in `local.env` |
| `npm test` | Unit tests (schema form logic, pipeline and overview helpers, deep links) |
| `npm run lint` | ESLint |
| `npm run package` | Type-check, build and write `build/cc-pipeline-visualizer-<version>.tgz`. Bumps the patch version (`-- --minor`, `-- --major`, `-- --version X.Y.Z`) |

The code lives in `src/`:

- [src/App.tsx](https://github.com/Cribl-Community/cc-pipeline-visualizer/blob/main/src/App.tsx): layout, pickers, save and preview orchestration.
- [src/components/](https://github.com/Cribl-Community/cc-pipeline-visualizer/blob/main/src/components/): pipelines overview, function list, settings forms, preview pane.
- [src/lib/](https://github.com/Cribl-Community/cc-pipeline-visualizer/blob/main/src/lib/): API client, schema → form logic, pipeline and overview helpers, URL state.


## Known limitations and troubleshooting

- The app opens existing pipelines only; it doesn't create new ones.
- Save doesn't commit or deploy.
- Preview needs at least one sample file in the worker group.
- Only Stream worker groups are listed; Edge fleets are not supported.
- A 403 when you open or save a pipeline means your Cribl role cannot read or edit pipelines in that worker group.

## Support

Open an issue in [Cribl-Community/cc-pipeline-visualizer](https://github.com/Cribl-Community/cc-pipeline-visualizer/issues). It is maintained by Wilfred van der Linde (Cribl Solutions Engineering), who aims to fix critical security issues within 10 days and high ones within 4 weeks.

## Release notes

- **1.4.9**: README covers support, data and storage, and limitations.
- **1.4.6**: start screen that shows how the before-and-after preview works.
- **1.4.0**: deep links to a pack or pipeline, and a pipelines overview with In / Out / Err counts.
- **1.1.0**: worker group pipelines as well as pack pipelines.

## Contributing

This repository is generated from the app's development repository, so pull requests are ported there by a maintainer and ship in the next release. See [CONTRIBUTING.md](https://github.com/Cribl-Community/cc-pipeline-visualizer/blob/main/CONTRIBUTING.md).
