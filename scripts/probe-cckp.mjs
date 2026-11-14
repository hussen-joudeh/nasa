// Explores the World Bank Climate Change Knowledge Portal (CCKP) API shape.
// Usage: node scripts/probe-cckp.mjs
const ORIGIN = 'http://localhost:5173';
const base = 'https://cckpapi.worldbank.org/cckp/v1/';
const variants = [
  // product variants
  'cmip6-x0.25_climatology_tas_anomaly_annual_2040-2059_median_ssp245_ensemble_all_mean/USA',
  'cmip6-x0.25_climatology_tas_climatology_annual_1995-2014_median_historical_ensemble_all_mean/USA',
  'cmip6-x0.25_climatology_tas_climatology_annual_2040-2059_p10_ssp245_ensemble_all_mean/USA',
  'cmip6-x0.25_climatology_tas_climatology_annual_2040-2059_p90_ssp245_ensemble_all_mean/USA',
  // monthly
  'cmip6-x0.25_climatology_tas,pr_climatology_monthly_2040-2059_median_ssp245_ensemble_all_mean/USA',
  // other scenarios / periods
  'cmip6-x0.25_climatology_tas_climatology_annual_2080-2099_median_ssp585_ensemble_all_mean/USA,EGY',
  'cmip6-x0.25_climatology_tas_climatology_annual_2020-2039_median_ssp126_ensemble_all_mean/EGY',
  'cmip6-x0.25_climatology_tas_climatology_annual_2060-2079_median_ssp370_ensemble_all_mean/EGY',
  'cmip6-x0.25_climatology_tas_climatology_annual_2040-2059_median_ssp119_ensemble_all_mean/EGY',
  // indices
  'cmip6-x0.25_climatology_hd35,fd,cdd,tasmax,tasmin_climatology_annual_2040-2059_median_ssp245_ensemble_all_mean/EGY',
  // timeseries
  'cmip6-x0.25_timeseries_tas_timeseries_annual_2015-2100_median_ssp245_ensemble_all_mean/EGY',
  // subnational guesses
  'cmip6-x0.25_climatology_tas_climatology_annual_2040-2059_median_ssp245_ensemble_all_mean/USA.2593214',
  'cmip6-x0.25_climatology_tas_climatology_annual_2040-2059_median_ssp245_ensemble_all_mean/all_countries',
  // era5 observed baseline
  'era5-x0.25_climatology_tas,pr_climatology_annual_1991-2020_mean_historical_era5_x0.25_mean/EGY',
];
for (const v of variants) {
  const url = `${base}${v}?_format=json`;
  const t0 = Date.now();
  try {
    const res = await fetch(url, { headers: { Origin: ORIGIN }, signal: AbortSignal.timeout(60000) });
    const text = await res.text();
    console.log(`\n# ${v}\n  status=${res.status} cors=${res.headers.get('access-control-allow-origin')} ${Date.now() - t0}ms bytes=${text.length}`);
    console.log('  ' + text.replace(/\s+/g, ' ').slice(0, 420));
  } catch (e) {
    console.log(`\n# ${v}\n  ERROR ${e.name} ${e.message}`);
  }
}
