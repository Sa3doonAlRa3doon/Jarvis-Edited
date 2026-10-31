function clean(value, limit = 260) {
  return String(value ?? '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').replace(/\s+/g, ' ').trim().slice(0, limit);
}

function locationLabel(result) {
  return clean(result?.location?.name || result?.location?.displayName || result?.query || 'the requested location', 120);
}

function number(value, fallback = 'n/a') {
  return value == null || value === '' || !Number.isFinite(Number(value)) ? fallback : Number(value);
}

function displayDate(value) {
  const source = String(value || '').trim();
  if (!source) return '';
  const parsed = new Date(source);
  return Number.isNaN(parsed.getTime()) ? clean(source, 80) : parsed.toLocaleString('en-GB', { timeZone: 'Asia/Dubai', dateStyle: 'medium', timeStyle: 'short' });
}

function unavailableMessage(api) {
  return `I couldn't get ${clean(api?.service || 'that public data', 80)} right now. ${clean(api?.context || 'The provider did not return a result.', 260)}`;
}

export function summarizePublicResult(api) {
  if (!api?.used) return '';
  if (!api.result) return unavailableMessage(api);
  const result = api.result;
  switch (api.service) {
    case 'weather': {
      const current = result.current || {};
      return `Weather for ${locationLabel(result)}: ${number(current.temperatureC)}°C, ${clean(current.condition || 'conditions unavailable', 100)}; feels like ${number(current.feelsLikeC)}°C, humidity ${number(current.humidityPercent)}%, wind ${number(current.windKph)} km/h.${result.daily?.length ? ` Forecast: ${result.daily.slice(0, 3).map((day) => `${clean(day.date, 30)} ${clean(day.condition, 60)} ${number(day.highC)}°/${number(day.lowC)}°C`).join(' · ')}` : ''}`;
    }
    case 'air_quality': {
      const current = result.current || {};
      return `Air quality for ${locationLabel(result)}: US AQI ${number(current.usAqi)}, PM2.5 ${number(current.pm2_5)} µg/m³, PM10 ${number(current.pm10)} µg/m³.`;
    }
    case 'map':
      return `Map ready for ${locationLabel(result)}. OpenStreetMap: ${clean(result.openStreetMapUrl, 500)}. This is a location lookup, not turn-by-turn navigation.`;
    case 'places': {
      const places = Array.isArray(result.places) ? result.places : [];
      return places.length ? `Nearby places around ${locationLabel(result)}: ${places.slice(0, 8).map((place) => `${clean(place.name, 100)}${clean(place.address, 140) ? ` (${clean(place.address, 140)})` : ''}`).join('; ')}.` : `No matching nearby places were found around ${locationLabel(result)}.`;
    }
    case 'weather_alerts':
      return result.available ? (result.alerts?.length ? `Weather alerts for ${locationLabel(result)}: ${result.alerts.slice(0, 6).map((alert) => clean(alert.headline || alert.event, 180)).join('; ')}.` : `No active weather alerts were returned for ${locationLabel(result)}.`) : `The US National Weather Service feed does not cover ${locationLabel(result)}.`;
    case 'time':
      return `Local time in ${locationLabel(result)}: ${clean(result.localTime, 180)}.`;
    case 'sun':
      return `Sun times for ${locationLabel(result)}: sunrise ${displayDate(result.sunrise) || clean(result.sunrise, 80)}, sunset ${displayDate(result.sunset) || clean(result.sunset, 80)}.`;
    case 'exchange':
      return `${number(result.amount)} ${clean(result.from, 8)} is ${number(result.converted)} ${clean(result.to, 8)} at a rate of ${number(result.rate)}${result.date ? ` on ${clean(result.date, 30)}` : ''}.`;
    case 'holiday': {
      const holidays = Array.isArray(result.holidays) ? result.holidays : [];
      return holidays.length ? `Public holidays for ${clean(result.countryCode, 8)} ${number(result.year)}: ${holidays.slice(0, 10).map((item) => `${clean(item.date, 20)} ${clean(item.name || item.localName, 140)}`).join('; ')}.` : `No public-holiday dataset was returned for ${clean(result.countryCode, 8)} ${number(result.year)}.`;
    }
    case 'earthquake': {
      const events = Array.isArray(result.events) ? result.events : [];
      return events.length ? `${number(result.count, events.length)} earthquakes were reported in the last day. Strongest listed: ${events.slice(0, 5).map((event) => `M${number(event.magnitude)} ${clean(event.place, 160)}`).join('; ')}.` : 'No earthquake events were returned for the last day.';
    }
    case 'iss':
      return `The ISS is at latitude ${number(result.latitude)}, longitude ${number(result.longitude)}, altitude ${number(result.altitudeKm)} km, moving at ${number(result.velocityKph)} km/h; visibility: ${clean(result.visibility || 'unknown', 40)}.`;
    case 'dictionary': {
      const meanings = Array.isArray(result.meanings) ? result.meanings : [];
      const definitions = meanings.flatMap((meaning) => (meaning.definitions || []).slice(0, 2).map((definition) => `${clean(meaning.partOfSpeech, 40)}: ${clean(definition, 220)}`)).slice(0, 4);
      return definitions.length ? `${clean(result.word, 80)} — ${definitions.join(' · ')}` : `No definition was returned for ${clean(result.word, 80)}.`;
    }
    case 'wikipedia':
      return `${clean(result.title, 160)}: ${clean(result.description, 260)}${clean(result.extract, 1800) ? ` ${clean(result.extract, 1800)}` : ''} Read more: ${clean(result.page, 500)}`;
    case 'crypto': {
      const prices = Object.entries(result.prices || {});
      return prices.length ? `Crypto prices: ${prices.map(([name, value]) => `${clean(name, 40)} $${number(value.usd)} / €${number(value.eur)}${value.change24hPercent == null ? '' : ` (${number(value.change24hPercent)}% 24h)`}`).join('; ')}.` : 'No crypto prices were returned.';
    }
    case 'github': {
      const repositories = Array.isArray(result.repositories) ? result.repositories : [];
      return repositories.length ? `Public GitHub results for “${clean(api.query, 160)}”: ${repositories.map((repo) => `${clean(repo.fullName || repo.name, 120)} (${number(repo.stars, 0)} stars) — ${clean(repo.description, 180)}`).join('; ')}.` : 'No public GitHub repositories were returned.';
    }
    default:
      return `Public ${clean(api.service || 'API', 80)} data is ready: ${clean(JSON.stringify(result), 900)}`;
  }
}
