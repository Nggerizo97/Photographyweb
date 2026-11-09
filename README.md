# Light, Measured

Photography portfolio. Vite, React, TypeScript, Tailwind and Motion, deployed as a static site.

## Develop

```bash
npm install
npm run dev
```

## Change the selection

The originals live in `./image` and are gitignored. Edit `data/curation.json`, then:

```bash
npm run photos
```

That encodes AVIF and WebP at three sizes into `public/photos/`, strips all file metadata, and rewrites
`src/data/manifest.json`. Commit those two outputs. Deploys only need them, never the originals.
Add `-- --force` to re-encode files that already exist.

## Deploy

```bash
npm run build
```

Serve `dist/`. Build-time settings:

| Variable | Purpose |
| --- | --- |
| `VITE_ENGINEERING_URL` | Overrides the header and footer link to the engineering portfolio (default in `src/config.ts`). |
| `VITE_BASE` | Set to e.g. `/photography/` when served from a route instead of a subdomain. |
