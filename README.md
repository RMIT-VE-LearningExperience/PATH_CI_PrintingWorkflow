# PrinterApp

Minimal Next.js (App Router + TypeScript) app at repository root, configured for Firebase App Hosting.

## Requirements

- Node.js `20.x`
- npm `10+` (recommended)

## Local development

```bash
npm install
npm run dev
```

## Build and run

```bash
npm run build
npm start
```

The app serves a single page that renders **Printing App**.

## Firebase App Hosting notes

- `apphosting.yaml` must live at the repository root.
- App Hosting framework detection requires `package.json` at the repository root.
- Node version is set using `package.json` `engines.node` (`20.x`).
- Build/start commands are configured in `apphosting.yaml` under `scripts`.

## Deploy checklist

1. Commit all root files (`package.json`, `apphosting.yaml`, `app/` directory, TypeScript and ESLint config).
2. In Firebase App Hosting backend setup, set root directory to `/` (repo root).
3. Push to the backend's live branch to trigger rollout.
