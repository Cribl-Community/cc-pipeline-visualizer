# Contributing

Issues and pull requests are welcome here.

## This repository is generated

Every file here is generated from the Pipeline Visualizer's development repository, and each release replaces the whole tree. So a pull request is not merged here directly. A maintainer ports the change to the source, and it ships in the next release, with you credited as co-author. The pull request gets a comment that links to that release.

## Before you open a pull request

```bash
npm ci
npm run lint
npm test
npm run build
```

`npm test` runs the unit tests in `src/lib/` (schema form logic, pipeline and overview helpers, deep links). They run on every pull request.

To try a change against a real workspace, copy `local.env.example` to `local.env`, fill in your workspace URL and an API client, and run `npm run dev:standalone`. `local.env` is git-ignored; never commit it.

## Reporting a problem

Open an issue with your Cribl version, the worker group type, what you clicked and what you expected. If you attach a pipeline or sample events, **de-identify them first**: replace host names, user names, IP addresses and anything else that identifies your environment.
