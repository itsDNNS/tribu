import { useCallback, useEffect, useState } from 'react';
import { CloudSun, MapPin, Search } from 'lucide-react';
import { t } from '../../lib/i18n';
import * as api from '../../lib/api';

// Family-wide place for the weather shown on every shared display.
export default function DisplayWeatherPanel({ familyId, messages, lang }) {
  const [place, setPlace] = useState(null);
  const [searching, setSearching] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState(null);
  const [status, setStatus] = useState(null); // busy | unavailable | error
  const load = useCallback(async () => {
    const { ok, data } = await api.apiGetWeatherLocation(familyId);
    if (ok) setPlace(data?.name ? data : null);
  }, [familyId]);

  useEffect(() => { load(); }, [load]);

  async function search(event) {
    event.preventDefault();
    if (query.trim().length < 2) return;
    setStatus('busy');
    const { ok, data } = await api.apiSearchWeatherLocation(familyId, query.trim(), lang || 'en');
    setStatus(ok ? null : 'unavailable');
    setResults(ok && Array.isArray(data) ? data : []);
  }

  async function choose(result) {
    setStatus('busy');
    const name = [result.name, result.region && result.region !== result.name ? result.region : null].filter(Boolean).join(', ');
    const { ok, data } = await api.apiSetWeatherLocation(familyId, { name, latitude: result.latitude, longitude: result.longitude });
    if (!ok) return setStatus('error');
    setPlace(data);
    setSearching(false);
    setResults(null);
    setQuery('');
    setStatus(null);
  }

  async function clear() {
    setStatus('busy');
    const { ok } = await api.apiClearWeatherLocation(familyId);
    if (!ok) return setStatus('error');
    setPlace(null);
    setStatus(null);
  }

  return (
    <section className="ad-weather-panel" data-testid="display-weather-panel" aria-labelledby="display-weather-title">
      <div className="ad-weather-head">
        <span className="ad-weather-icon" aria-hidden="true"><CloudSun size={20} /></span>
        <div>
          <h3 id="display-weather-title">{t(messages, 'display_weather_title')}</h3>
          <p data-testid="display-weather-place">
            {place ? (
              <>
                <MapPin size={14} aria-hidden="true" /> {place.name}
              </>
            ) : (
              t(messages, 'display_weather_off')
            )}
          </p>
        </div>
        <div className="ad-weather-actions">
          <button type="button" className="ad-button" onClick={() => setSearching((value) => !value)} data-testid="display-weather-choose">
            {t(messages, place ? 'display_weather_change' : 'display_weather_choose')}
          </button>
          {place && (
            <button type="button" className="ad-button" disabled={status === 'busy'} onClick={clear} data-testid="display-weather-remove">
              {t(messages, 'display_weather_remove')}
            </button>
          )}
        </div>
      </div>
      {searching && (
        <form className="ad-weather-search" onSubmit={search}>
          <label className="form-field">
            <span>{t(messages, 'display_weather_search_label')}</span>
            <input
              className="form-input"
              value={query}
              minLength={2}
              maxLength={80}
              onChange={(event) => setQuery(event.target.value)}
              data-testid="display-weather-query"
              autoComplete="off"
            />
          </label>
          <button type="submit" className="ad-button primary" disabled={status === 'busy' || query.trim().length < 2} data-testid="display-weather-search">
            <Search size={15} aria-hidden="true" /> {t(messages, 'display_weather_search')}
          </button>
          {results && (
            <ul className="ad-weather-results">
              {results.length === 0 && status !== 'unavailable' && <li className="ad-weather-empty">{t(messages, 'display_weather_no_results')}</li>}
              {results.map((result) => (
                <li key={`${result.latitude},${result.longitude}`}>
                  <button type="button" onClick={() => choose(result)} disabled={status === 'busy'}>
                    <b>{result.name}</b>
                    <span>{[result.region, result.country].filter(Boolean).join(', ')}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </form>
      )}
      {status === 'unavailable' && <p className="ad-weather-error" role="alert">{t(messages, 'display_weather_unavailable')}</p>}
      {status === 'error' && <p className="ad-weather-error" role="alert">{t(messages, 'toast.error')}</p>}
      <p className="ad-weather-privacy">{t(messages, 'display_weather_privacy')}</p>
    </section>
  );
}
