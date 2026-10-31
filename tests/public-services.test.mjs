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
  assert.equal(detectService('Search GitHub for local voice assistant projects'), 'github');
  assert.equal(detectService('Tell me about the GitHub repo open-jarvis/OpenJarvis'), 'github');
  assert.equal(detectService('Write a poem about dragons'), '');
  assert.equal(detectService('What is my CPU temperature?'), '');
  assert.equal(publicServiceCatalog().every((item) => item.keyRequired === false), true);
});

test('returns bounded keyless GitHub repository research with citations', async () => {
  const result = await runPublicService('Search GitHub for local voice assistant projects', { lookup, fetchImpl: async (url, options) => {
    assert.match(String(url), /api\.github\.com\/search\/repositories\?q=local%20voice%20assistant/);
    assert.equal(options.headers.Accept, 'application/vnd.github+json');
    assert.equal(options.headers['User-Agent'], 'jarvis-local-read-only');
    return response({ items: [
      { name: 'example-assistant', full_name: 'example/example-assistant', description: 'Local assistant', stargazers_count: 42, forks_count: 3, language: 'Python', html_url: 'https://github.com/example/example-assistant', updated_at: '2026-10-30T00:00:00Z' },
      { name: 'unsafe', full_name: 'unsafe/repository', description: 'No URL', stargazers_count: 1, html_url: 'javascript:alert(1)' }
    ] });
  } });
  assert.equal(result.service, 'github');
  assert.equal(result.result.repositories.length, 1);
  assert.equal(result.result.repositories[0].fullName, 'example/example-assistant');
  assert.equal(result.result.repositories[0].stars, 42);
  assert.ok(result.citations.includes('https://github.com/example/example-assistant'));
  assert.match(result.context, /UNTRUSTED PUBLIC API EVIDENCE/);
});

test('looks up one explicit public GitHub repository without accepting a write operation', async () => {
  const result = await runPublicService('Tell me about the GitHub repo open-jarvis/OpenJarvis', { lookup, fetchImpl: async (url, options) => {
    assert.equal(String(url), 'https://api.github.com/repos/open-jarvis/OpenJarvis');
    assert.equal(options.method, 'GET');
    return response({ name: 'OpenJarvis', full_name: 'open-jarvis/OpenJarvis', description: 'Local assistant', stargazers_count: 100, forks_count: 10, language: 'Python', html_url: 'https://github.com/open-jarvis/OpenJarvis', license: { spdx_id: 'Apache-2.0' } });
  } });
  assert.equal(result.result.repositories[0].fullName, 'open-jarvis/OpenJarvis');
  assert.equal(result.result.repositories[0].license, 'Apache-2.0');
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

test('uses the saved country and city for location-free weather language', async () => {
  const fetchImpl = async (url) => {
    const value = String(url);
    if (value.includes('geocoding-api.open-meteo.com')) {
      assert.match(value, /name=Dubai/); assert.match(value, /countryCode=ae/);
      return response({ results: [{ name: 'Dubai', country: 'United Arab Emirates', country_code: 'AE', latitude: 25.2, longitude: 55.3, timezone: 'Asia/Dubai' }] });
    }
    if (value.includes('api.open-meteo.com/v1/forecast')) return response({ timezone: 'Asia/Dubai', current: { temperature_2m: 30, relative_humidity_2m: 40, apparent_temperature: 31, is_day: 1, precipitation: 0, weather_code: 0, wind_speed_10m: 10, wind_direction_10m: 90 }, daily: { time: [], weather_code: [], temperature_2m_max: [], temperature_2m_min: [], precipitation_probability_max: [], sunrise: [], sunset: [] } });
    throw new Error(`unexpected URL ${value}`);
  };
  const result = await runPublicService('What is the weather outside?', { lookup, fetchImpl, defaultLocation: 'Dubai', defaultCountry: 'AE' });
  assert.equal(result.service, 'weather'); assert.equal(result.query, 'Dubai'); assert.equal(result.result.location.countryCode, 'AE');
});

test('keeps an explicit location ahead of the saved default', async () => {
  const fetchImpl = async (url) => {
    const value = String(url);
    if (value.includes('geocoding-api.open-meteo.com')) {
      assert.match(value, /name=London/); assert.doesNotMatch(value, /name=Dubai/);
      return response({ results: [{ name: 'London', country: 'United Kingdom', country_code: 'GB', latitude: 51.5, longitude: -0.12, timezone: 'Europe/London' }] });
    }
    if (value.includes('api.open-meteo.com/v1/forecast')) return response({ timezone: 'Europe/London', current: { temperature_2m: 12, relative_humidity_2m: 70, apparent_temperature: 11, is_day: 1, precipitation: 0, weather_code: 2, wind_speed_10m: 8, wind_direction_10m: 270 }, daily: { time: [], weather_code: [], temperature_2m_max: [], temperature_2m_min: [], precipitation_probability_max: [], sunrise: [], sunset: [] } });
    throw new Error(`unexpected URL ${value}`);
  };
  const result = await runPublicService('What is the weather in London?', { lookup, fetchImpl, defaultLocation: 'Dubai', defaultCountry: 'AE' });
  assert.equal(result.query, 'London'); assert.equal(result.result.location.countryCode, 'GB');
});

test('normalizes currency conversion without accepting an API key', async () => {
  const fetchImpl = async (url) => {
    assert.match(String(url), /api\.frankfurter\.dev\/v1\/latest\?base=USD&symbols=EUR/);
    return response({ amount: 1, base: 'USD', date: '2026-10-28', rates: { EUR: 0.92 } });
  };
  const result = await runPublicService('Convert 20 USD to EUR', { lookup, fetchImpl });
  assert.equal(result.result.converted, 18.4); assert.equal(result.result.to, 'EUR'); assert.equal(result.citations.length, 1);
});

test('falls back to a keyless dictionary source when the primary provider is unavailable', async () => {
  const result = await runPublicService('define resilient', { lookup, fetchImpl: async (url) => {
    const value = String(url);
    if (value.includes('api.dictionaryapi.dev')) return response({ message: 'temporary outage' }, 503);
    assert.match(value, /api\.datamuse\.com\/words\?sp=resilient/);
    return response([{ word: 'resilient', defs: ['adj\table to recover quickly from difficulty'] }]);
  } });
  assert.equal(result.service, 'dictionary'); assert.equal(result.result.word, 'resilient');
  assert.equal(result.result.meanings[0].partOfSpeech, 'adj'); assert.match(result.result.meanings[0].definitions[0], /recover quickly/);
  assert.equal(result.provider, 'Datamuse'); assert.equal(result.citations.length, 2);
});

test('handles an empty public-holiday dataset as a normal unavailable result', async () => {
  const result = await runPublicService('public holidays in AE 2026', { lookup, fetchImpl: async (url) => { assert.match(String(url), /date\.nager\.at\/api\/v3\/PublicHolidays\/2026\/AE/); return response('', 204); } });
  assert.equal(result.used, true); assert.equal(result.service, 'holiday'); assert.equal(result.result.available, false); assert.deepEqual(result.result.holidays, []);
});

test('falls back to the keyless worldwide holiday feed after a transient Nager outage', async () => {
  const result = await runPublicService('public holidays in AE 2026', { lookup, fetchImpl: async (url) => {
    const value = String(url);
    if (value.includes('/PublicHolidays/2026/AE')) return response({ message: 'temporary outage' }, 502);
    assert.match(value, /date\.nager\.at\/api\/v3\/NextPublicHolidaysWorldwide/);
    return response([{ countryCode: 'AE', date: '2026-12-02', name: 'National Day', localName: 'National Day', global: true, counties: null }, { countryCode: 'US', date: '2026-11-26', name: 'Thanksgiving' }]);
  } });
  assert.equal(result.used, true); assert.equal(result.service, 'holiday'); assert.equal(result.result.available, true);
  assert.equal(result.result.holidays.length, 1); assert.equal(result.result.holidays[0].name, 'National Day');
  assert.equal(result.provider, 'Nager.Date fallback'); assert.equal(result.citations.length, 2);
});

test('keeps holiday queries useful when both keyless feeds are temporarily down', async () => {
  const result = await runPublicService('public holidays in AE 2026', { lookup, fetchImpl: async () => response({ error: 'temporary outage' }, 503) });
  assert.equal(result.used, true); assert.equal(result.service, 'holiday'); assert.equal(result.result.available, false);
  assert.deepEqual(result.result.holidays, []); assert.equal(result.provider, 'Nager.Date unavailable');
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

