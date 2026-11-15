# FieldShift brand usage (site integration)

## Assets (`src/assets/brand/`)

| File | Use |
| --- | --- |
| `fieldshift-logo-horizontal.svg` | Master horizontal lockup (light UI) |
| `fieldshift-logo-light.svg` | Light / cloud backgrounds |
| `fieldshift-logo-dark.svg` | Dark header / cinematic overlays |
| `fieldshift-mark.svg` | Header, footer, app icon source |
| `fieldshift-mark-mono.svg` | Print / single-color |
| `favicon.svg` | Browser tab; pair with PNG exports below |

## Tokens

- JSON: `brand-tokens.json`
- CSS variables: `src/brand-tokens.css` (imported by `src/style.css`)

Primary `#0B5D3B`, ink `#1F2933`, accent `#A3E635` (sparingly). Do not use lime for PASS states — evidence status colors stay semantic.

## Wordmark

Exact product name: **FieldShift** (no space). Header uses mark + styled wordmark; marketing copy may still say “Know your land.”

## PNG / OG exports

Run with dev server up and `playwright-core` installed:

```bash
node scripts/export-brand-assets.mjs node_modules/playwright-core
```

Writes `icon-16.png`, `icon-32.png`, `icon-192.png`, `icon-512.png`, `og-fieldshift.png` under `src/assets/brand/`.

## Preview

Open `src/assets/brand/brand-preview.html` locally to check 32/48px marks and horizontal logos on light/dark panels.

## Notes

- SVGs are hand-built vectors inspired by `references/01-primary-logo-concept.png`; arrow geometry is simplified for small sizes.
- No NASA insignia in logo assets.
- Do not embed raster images inside SVGs.