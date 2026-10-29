import test from 'node:test';
import assert from 'node:assert/strict';
import { detectService, isPublicServicePrompt, publicServiceCatalog, runPublicService } from '../lib/public-services.mjs';

const lookup = async () => [{ address: '8.8.8.8', family: 4 }];

function response(body, status = 200) {
  const text = typeof body === 'string' ? body : JSON.stringify(body);
  return { ok: status >= 200 && status < 300, status, headers: { get: () => null }, async text() { return text; } };
}

test('routes only explicit public-information requests', () => {
  assert.equal(isPublicServicePrompt('What is the weather in Dubai?'), true);
  assert.equal(detectService('Show me a map of Berlin'), 'map');
  assert.equal(detectService('Convert 20 USD to EUR'), 'exchange');
  assert.equal(detectService('map of Dubai'), 'map');
  assert.equal(detectService('Write a poem about dragons'), '');
  assert.equal(detectService('What is my CPU temperature?'), '');
  assert.equal(publicServiceCatalog().every((item) => item.keyRequired === false), true);
});

test('normalizes a keyless weather lookup and preserves source citations', async () => {
  const fetchImpl = async (url) => {
    const value = String(url);
    if (value.includes('geocoding-api.open-meteo.com')) return response({ results: [{ name: 'Dubai', country: 'United Arab Emirates', country_code: 'AE', latitude: 25.2, longitude: 55.3, timezone: 'Asia/Dubai' }] });
    if (value.includes('api.open-meteo.com/v1/forecast')) return response({ timezone: 'Asia/Dubai', current: { temperature_2m: 31, relative_humidity_2m: 40, apparent_temperature: 33, is_day: 1, precipitation: 0, weather_code: 0, wind_speed_10m: 12, wind_direction_10m: 120 }, daily: { time: ['2026-10-28'], weather_code: [1], temperature_2m_max: [34], temperature_2m_min: [25], precipitation_probability_max: [0], sunrise: ['2026-10-28T06:00'], sunset: ['2026-10-28T17:45'] } });
    throw new Error(`unexpected URL ${value}`);
  };
  const result = await runPublicService('What is the weather in Dubai?', { lookup, fetchImpl });
  assert.equal(result.used, true); assert.equal(result.service, 'weather'); assert.equal(result.result.location.countryCode, 'AE');
  assert.equal(result.result.current.temperatureC, 31); assert.equal(result.result.current.condition, 'clear sky');
  assert.equal(result.citations.length, 2); assert.match(result.context, /UNTRUSTED PUBLIC API EVIDENCE/);
});

test('normalizes currency conversion without accepting an API key', async () => {
  const fetchImpl = async (url) => {
    assert.match(String(url), /api\.frankfurter\.dev\/v1\/latest\?base=USD&symbols=EUR/);
    return response({ amount: 1, base: 'USD', date: '2026-10-28', rates: { EUR: 0.92 } });
  };
  const result = await runPublicService('Convert 20 USD to EUR', { lookup, fetchImpl });
  assert.equal(result.result.converted, 18.4); assert.equal(result.result.to, 'EUR'); assert.equal(result.citations.length, 1);
});

test('handles an empty public-holiday dataset as a normal unavailable result', async () => {
  const result = await runPublicService('public holidays in AE 2026', { lookup, fetchImpl: async (url) => { assert.match(String(url), /date\.nager\.at\/api\/v3\/PublicHolidays\/2026\/AE/); return response('', 204); } });
  assert.equal(result.used, true); assert.equal(result.service, 'holiday'); assert.equal(result.result.available, false); assert.deepEqual(result.result.holidays, []);
});

test('returns OpenStreetMap geocoding with an OpenFreeMap MapLibre style', async () => {
  const result = await runPublicService('Show a map of Berlin', { lookup, fetchImpl: async (url) => {
    assert.match(String(url), /nominatim\.openstreetmap\.org\/search/);
    return response([{ name: 'Berlin', display_name: 'Berlin, Germany', lat: '52.52', lon: '13.405', address: { country: 'Germany', country_code: 'de' } }]);
  } });
  assert.equal(result.service, 'map'); assert.equal(result.result.location.countryCode, 'DE');
  assert.equal(result.result.openFreeMap.styleUrl, 'https://tiles.openfreemap.org/styles/liberty');
  assert.match(result.result.openStreetMapUrl, /mlat=52\.52/);
});

test('finds nearby places through a bounded Overpass lookup', async () => {
  const result = await runPublicService('Find nearby restaurants in Dubai', { lookup, fetchImpl: async (url) => {
    const value = String(url);
    if (value.includes('nominatim.openstreetmap.org/search')) return response([{ name: 'Dubai', display_name: 'Dubai, UAE', lat: '25.2', lon: '55.3', address: { country: 'United Arab Emirates', country_code: 'ae' } }]);
    assert.match(value, /overpass-api\.de\/api\/interpreter\?data=/);
    return response({ elements: [{ type: 'node', id: 1, lat: 25.21, lon: 55.31, tags: { name: 'Example Kitchen', amenity: 'restaurant', 'addr:street': 'Main Road' } }] });
  } });
  assert.equal(result.service, 'places'); assert.equal(result.result.places[0].name, 'Example Kitchen');
  assert.equal(result.result.openFreeMap.center[0], 55.3); assert.ok(result.citations.some((url) => url.includes('overpass-api.de')));
});

test('returns a clear non-US result for the US-only weather alert feed', async () => {
  const result = await runPublicService('Are there weather alerts in Dubai?', { lookup, fetchImpl: async (url) => {
    assert.match(String(url), /geocoding-api\.open-meteo\.com/);
    return response({ results: [{ name: 'Dubai', country: 'United Arab Emirates', country_code: 'AE', latitude: 25.2, longitude: 55.3, timezone: 'Asia/Dubai' }] });
  } });
  assert.equal(result.service, 'weather_alerts'); assert.equal(result.result.available, false); assert.equal(result.result.countryCode, 'AE');
});

test('normalizes active NWS alerts for a US location', async () => {
  const result = await runPublicService('Are there weather warnings in Miami?', { lookup, fetchImpl: async (url, options) => {
    const value = String(url);
    if (value.includes('geocoding-api.open-meteo.com')) return response({ results: [{ name: 'Miami', country: 'United States', country_code: 'US', latitude: 25.77, longitude: -80.19, timezone: 'America/New_York' }] });
    assert.match(value, /api\.weather\.gov\/alerts\/active\?point=/); assert.equal(options.headers.Accept, 'application/geo+json');
    return response({ features: [{ id: 'alert-1', properties: { event: 'Heat Advisory', headline: 'Heat advisory in effect', severity: 'Moderate', areaDesc: 'Miami-Dade', expires: '2026-10-29T23:00:00Z' } }] });
  } });
  assert.equal(result.service, 'weather_alerts'); assert.equal(result.result.alerts[0].event, 'Heat Advisory');
});

