# Visual V4A — root cause

## Confirmed

The 2D **field-mask** spotlight (`kind: mask`, world polygon with parcel hole) drapes on MapLibre terrain. At pitched 3D views it covered the viewport as a dark sheet, producing a nearly black map while terrain status still read “Real DEM · 1×”.

Aborted Terrarium tile requests (`net::ERR_ABORTED`) during camera moves are normal cancellation noise; they were not the primary blank-canvas cause.

## Fix (presentation only)

- `shouldShowFieldMask()` + `syncFieldMaskVisibility()` — hide mask while real DEM terrain is active and field exists; restore in 2D.
- `waitMapIdle()` before `composeMode()` after toggling 3D (bounded timeout).
- `map.setLight()` after `setTerrain` for readable hillshade.
- DEM `map.on('error')` — only fall back on decode/unavailable errors, not every tile abort.

## Evidence

See `screenshots/03-3d-terrain-on.png` (before fix: black), re-captured after fix with visible relief and boundary.