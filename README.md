# hughman

A single-page personal site whose hero is a fluid-smoke ASCII effect that continuously coalesces into the letters **HUGH** and dissolves back into drifting smoke. Forked from [Somnai's pretext fluid-smoke demo](https://somnai-dreams.github.io/pretext-demos/fluid-smoke.html) and recolored neon pink on black, with a letterform mask blended into the density field.

## Run locally

```sh
npm install         # fetches @chenglou/pretext and esbuild as devDeps
npm run vendor      # bundles pretext into vendor/pretext.js (one-shot, committed)
npm run serve       # python3 -m http.server 8000 — open http://localhost:8000
```

The vendored `vendor/pretext.js` is committed, so after a fresh clone you can skip straight to `npm run serve` (or any other static file server) without `npm install` or `npm run vendor`. Re-run `npm run vendor` only when bumping the pretext version.

## Where to edit

- **Tagline** — [index.html](index.html), look for `<!-- TODO: replace tagline below -->`.
- **Nav links** — [index.html](index.html), the three `<a>` tags inside `nav.overlay-r`.
- **Color ramp** — [index.html](index.html), the `.a1`…`.a10` rules.
- **Letter timing / form factor** — [main.js](main.js), `formFactor()` and the `LOOP`/`ATTRACT_K` constants.
- **Word being formed** — [main.js](main.js), the `WORD` constant (default `"HUGH"`).

## Stats overlay

Append `?stats` to the URL to show grid dimensions, palette size, fps, and current form factor.
