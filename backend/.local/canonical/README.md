# FieldShift MongoDB import handoff

Start with manifest.json and validation_report.md. Review the proposed field and profile IDs with the backend team. Load the seven root JSONL files into the manifest’s target collections using repeatable upserts by _id. Import fields and crop_profiles before their dependent collections. Keep the GeoJSON and raster files beside the extracted package to resolve references. The criteria CSV is a review handoff. Field-specific supplemental PRISM and scoped regional records are in the corrected source archives.
