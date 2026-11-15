# Visual V4B — V4A vs V4B comparison

All images are raw headless-Chrome captures of the running app (1440×900 unless noted). Nothing is composited or retouched.
V4B images come from `npm run qa:visual-v4b` (213/213 checks, `report.json`).

| View | V4A | V4B |
|---|---|---|
| Desktop 2D map | `../visual-v4a/screenshots/01-2d-default.png` | `screenshots/01-desktop-2d.png` |
| Desktop 3D terrain | `../visual-v4a/screenshots/03-3d-terrain-on.png` | `screenshots/02-desktop-3d.png` |
| Camera fit after selection | `../visual-v4a/screenshots/02-2d-demo-fit.png` | `screenshots/03-post-selection-fit.png` |
| Field selected in 3D | `../visual-v4a/screenshots/07-fit-3d-satellite.png` | `screenshots/04-selected-field-3d.png` |
| Back to 2D | `../visual-v4a/screenshots/05-2d-terrain-off.png` | `screenshots/05-2d-after-toggle.png` |
| Relief in 3D | `../visual-v4a/screenshots/06-relief-3d.png` | `screenshots/06-relief-3d.png` |
| Satellite in 3D | `../visual-v4a/screenshots/07-fit-3d-satellite.png` | `screenshots/07-satellite-3d.png` |
| Inspector collapsed | `../visual-v4a/screenshots/08-inspector-collapsed-3d.png` | `screenshots/08-inspector-collapsed.png` |
| Arabic RTL | `../visual-v4a/screenshots/09-ar-rtl-map.png` | `screenshots/09-arabic-rtl.png` |
| Tablet 3D (820×1180) | — | `screenshots/10-tablet-3d.png` |
| Mobile 3D (375×812) | `../visual-v4a/screenshots/11-mobile-3d.png` | `screenshots/11-mobile-3d.png` |
| Reduced motion | — | `screenshots/12-reduced-motion.png` |

## What differs

- **Imagery sharpness.** V4A framed the field at zoom 15 and beyond, magnifying Sentinel-2 tiles (source maxzoom 14). V4B never auto-fits past zoom 14, so the ground is as sharp as the source allows.
- **Field size on screen.** The cost of that cap: the 22 ha demo field is roughly 160 px wide on a 1042 px desktop map, clearly smaller than in V4A. Manual zoom is unchanged.
- **Boundary.** V4A: thick glowing line with vertex dots. V4B: thin light line on a dark casing, vertices only while drawing, faint fill.
- **Orientation.** V4A rotated the view to the parcel's longest edge. V4B keeps 45° pitch and −18° bearing, so 2D and 3D read the same way up.
- **Relief shading.** V4B adds a hillshade layer from the same Terrarium DEM while terrain is on. On this near-flat field the effect is slight; it is stronger near real relief.
- **Stability.** V4B fixes a case where turning 3D on a second time left the field off the top edge and over-magnified (MapLibre 5.3 kept the camera aimed at sea level over ~1184 m ground).

## Real vs visual emphasis

- Real: Sentinel-2 imagery, Terrarium DEM at 1× vertical scale, proposed boundary geometry.
- Visual emphasis: boundary line styling and one-off reveal, camera tilt and motion, sky colour, strength of the relief shading.
