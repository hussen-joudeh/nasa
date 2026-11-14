import {it,expect} from 'vitest';
import {fetchJson,parseWeather,parseClimate,climateUrl} from './domain.mjs';
it('retrieves and parses actual Open-Meteo weather',async()=>{
 const data=await fetchJson('https://api.open-meteo.com/v1/forecast?latitude=36.78&longitude=-119.95&current=temperature_2m,precipitation,wind_speed_10m,relative_humidity_2m&timezone=auto&forecast_days=1');
 const weather=parseWeather(data);expect(weather.time).toMatch(/^\d{4}-/);expect(weather.temperature).not.toBeNull();
});
it('retrieves an actual CCKP national anomaly',async()=>{expect(Number.isFinite(parseClimate(await fetchJson(climateUrl('USA','ssp245','2040-2059')),'USA'))).toBe(true);});
