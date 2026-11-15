# FieldShift validation

Proposed field scottsbluff_gering_ne:csb1825:311825012125041 covers 22.220372 ha. Its centroid is -103.609455511° longitude, 41.806147751° latitude.
The field overlaps a mapped 2005 center pivot by 98.98%. Current irrigation and 2019 canal service are pending.

## Passed

Reopened all four ZIPs. Checked ZIP integrity, UTF-8 JSONL and CSV parsing, unique IDs per export, dataset-to-collection mappings, links and asset hashes, dates, area, coverage, temperature ordering and units.
NASA POWER includes 1096 calendar dates, with 1096 complete rows, in explicit LST. Archived UTC midpoint data retain their original standard.
Both seasonal summaries were independently recomputed from the reopened daily JSONL.

| May–September | Complete dates | Precipitation (mm) | Days with Tmax ≥35 °C |
|---|---:|---:|---:|
| 2023 | 153/153 | 406.64 | 20 |
| 2024 | 153/153 | 164.88 | 33 |

USDA crop classes agree with the independent CDL subset majorities for all three years.
- 2023 Alfalfa, CDL code 36, 96.36% of valid clip pixels.
- 2024 Corn, CDL code 1, 92.95% of valid clip pixels.
- 2025 Dry Beans, CDL code 42, 93.73% of valid clip pixels.
- SSURGO has 26 component/horizon rows across 6 map units, totaling 100.0000% field coverage.
- PRISM has 306 centroid comparison days. The 12:00 UTC ending day is preserved.

## Open gaps

- The NASA Space Apps challenge resources tab was inaccessible through web retrieval. Official providers were used directly.
- The shared field is proposed and team approval is pending. Historical center-pivot overlap supports historical irrigation evidence. The state permitted-acres service timed out and current irrigation is unverified.
- Engine crop catalog, plan definitions and agreed criterion taxonomy were unavailable. Actual crop history classifications are present; crop_id is null and draft profiles use proposed IDs. Criteria rows are flagged for review.
- The illustrative pitch shows generic wheat, lentil, barley, chickpea, irrigated vegetables and fallow/cover. Winter wheat is a proposed local interpretation. The last two plan categories have no species-level identity. Barley, lentil and chickpea ranges carry their original regional or experimental scope.
- The farmer’s actual irrigation budget and this field’s 2019 district service remain unverified.
- OpenET polygon API returned 403 (Not authenticated); Earth Engine alternative returned 401. Original 70-month custom polygon series remains available in the third source archive.
- GEDI CMR found 27 candidate granules intersecting the region. The HDF5 GET returned HTTP 401 after redirect and shot coverage and quality remain unknown.
- SMAP, GPM, MODIS, VIIRS, SRTM and ECOSTRESS candidate science reads returned 401. The ORNL MODIS subset check timed out. USGS Landsat STAC returned scene metadata, and its band request returned sign-in HTML. USDA Ag Data Commons remains a catalog pointer.
- GAEZ RES05-SXX is a continuous native 0–10000 index. RES05-SIX has native categorical codes and nodata 0. Exact class captions remain pending for SIX.
- Historical PRISM and POWER midpoint responses and regional CDL evidence are in the original evidence directories of the source archives.

MongoDB loading awaits backend review. File checks used the v1.1 contract and ran locally.
