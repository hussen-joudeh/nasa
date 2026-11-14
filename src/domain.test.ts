import { describe, it, expect } from 'vitest';
import { parseCoordinates, areaHa, validatePolygon, rotationSummary, parseWeather, parseClimate, climateUrl } from './domain.mjs';
describe('geographic selection', () => {
 it('parses latitude, longitude and refuses invalid bounds',()=>{expect(parseCoordinates('31.5, 35.1')).toEqual([35.1,31.5]);expect(()=>parseCoordinates('95, 10')).toThrow();});
 it('calculates a real spherical hectare area independent of winding',()=>{const p: [number,number][]=[[0,0],[0.01,0],[0.01,0.01],[0,0.01]];expect(areaHa(p)).toBeCloseTo(123.64,1);expect(areaHa([...p].reverse())).toBeCloseTo(areaHa(p),6);});
 it('rejects crossing, duplicate and degenerate boundaries',()=>{expect(()=>validatePolygon([[0,0],[1,1],[0,1],[1,0]])).toThrow();expect(()=>validatePolygon([[0,0],[0,0],[1,1]])).toThrow();});
});
describe('honest analysis',()=>{
 it('compares user rotations by family transitions without yield scores',()=>{expect(rotationSummary(['wheat','maize','wheat']).repeats).toBe(2);expect(rotationSummary(['wheat','soy','wheat']).repeats).toBe(0);expect(rotationSummary(['wheat','soy','wheat']).legumes).toBe(1);});
 it('preserves missing weather values instead of coercing to zero',()=>{expect(parseWeather({current:{time:'2026-01-01',temperature_2m:null,precipitation:0},current_units:{temperature_2m:'°C',precipitation:'mm'}}).temperature).toBeNull();expect(()=>parseWeather({error:true})).toThrow();});
 it('requires finite climate data for the requested country',()=>{expect(parseClimate({data:{tas:{USA:{'2040-07':2.1}}}},'USA')).toBe(2.1);expect(()=>parseClimate({data:{tas:{USA:{'2040-07':null}}}},'USA')).toThrow();expect(()=>parseClimate({data:{tas:{USA:{'2040-07':2}}}},'EGY')).toThrow();});
 it('changes actual source queries with scenario, horizon and country',()=>{expect(climateUrl('EGY','ssp585','2080-2099')).toContain('2080-2099_median_ssp585');expect(climateUrl('USA','ssp245','2040-2059')).toContain('/USA?');});
});