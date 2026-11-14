# Field Shift — Greenfield Product Brief

**Status:** New independent local project. The user explicitly said to start from zero and create it under `C:/Users/husse/Downloads/field-shift`. Do not reuse or modify another repository.

## Product goal
Build a polished, credible agricultural land-analysis experience inspired by the two images in `references/`. Treat those images as visual references, not as app screenshots or usable data assets. The original acceptance/review prompt is preserved at `requirements/original-review-prompt.txt`.

The previous wording about an application “just built” is superseded: there is no existing Field Shift source project to repair. Create and run the first local version in this folder, then review the real rendered app against both references.

## Visual direction
- Premium, cinematic, modern agricultural intelligence product; dark navy/teal foundation, vivid but restrained green accents, high-contrast readable type, layered satellite/terrain imagery and clean data panels.
- Recreate the references’ hierarchy and density: strong brand/hero, prominent geographic canvas, visible region/field selection, compact analysis panels, and a clear step-by-step journey. Do not copy the reference screenshots into the UI or use them as fake backgrounds.
- Use original interface work and real map/terrain layers, not emoji, generic dashboard cards, unrelated stock imagery, or a static screenshot masquerading as an interactive map.
- English is the default to match the images; add a functional Arabic language switch with correctly mirrored RTL layout and localized content.

## Required journey and behavior
1. Search for a place or enter coordinates; show understandable loading, empty, invalid, and service-error states.
2. Navigate a real interactive geographic view; when suitable data is available, render 3D terrain from a documented elevation source. Support actual zoom, pan/orbit as appropriate, layer switching, and drawing/selecting a land polygon.
3. Calculate selected-area geometry/area from the actual polygon and display units clearly. Do not present a simulated parcel as a real user's land.
4. Analyze environmental data only when retrieved from a real source. Show provenance, timestamp/period, units, spatial/temporal resolution, and uncertainty/limitations near the relevant data. Clearly separate measured/observed data, modeled projections, user inputs, and unavailable fields.
5. Make crop-rotation comparison interactive and explain the comparison method and inputs. Never invent yields, soil scores, crop suitability numbers, or economic returns. If credible data for a metric is unavailable, remove it or mark it unavailable instead of filling in a plausible number.
6. Make climate-scenario simulation respond to user-selected scenario/time horizon/location and use a real, documented climate source. Display model/scenario/period and label projections as projections, not forecasts or observations. Expose formulas/assumptions and handle missing data honestly.
7. Provide a complete, understandable path from location selection through analysis, comparison and a saved/shareable local result, without requiring account credentials or paid service keys.

## Data and safety requirements
- The example figures visible in the references (e.g. acreage, moisture, temperature, NDVI, elevation, yield, drought probability) are visual placeholders. Do not copy them as facts about any real land.
- Research primary/official documentation for every external map, terrain, soil, weather, climate, or agricultural dataset/API. Verify CORS, attribution/license requirements, units, query limits and whether a key is needed. Record sources in the UI and README.
- Prefer sources usable without secrets. Do not fabricate fallback data. If a service is unavailable or requires unprovided credentials, the UI must say so and remain usable where possible.
- No production deployment, domain connection, account creation, paid signup, credential collection, or Git commit. Keep all work local in this new folder.

## Responsive, accessibility, performance
- Deliberate desktop and mobile layouts, not just a shrunken desktop dashboard; test narrow phones and desktop.
- Keyboard-operable map controls/forms, visible focus, semantic labels, accessible status/errors, sensible contrast and reduced-motion support.
- Verify Arabic RTL, bidirectional coordinates/numbers, headings, menus, controls and chart labels.
- Lazy-load heavy map/3D code where practical; show loading/progress and recoverable failure states. Avoid external fonts/trackers unless justified and documented.

## Completion gates
- Actual app starts locally; include exact start/test/build commands.
- Tests cover calculations, data parsing/failures and core interactions.
- Open and inspect the running website in a real browser at desktop and mobile sizes. Exercise location search, real map/terrain navigation, field drawing/selection, data loading/errors, crop comparison, and climate scenario changes. Check browser console/network errors.
- Compare painted screenshots and interaction hierarchy with both references; save QA screenshots and a concise report outside generated/build output.
- Final report separates completed, partially working, unverified, and blocked features; list data sources, API-key limitations and any remaining defects. Do not call a feature complete based only on a mock or passing unit test.
