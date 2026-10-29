import { Injectable, signal } from '@angular/core';

export interface LocalWeather {
  temp: number;
  place: string;
}

const CACHE_KEY = 'taskhub.weather';
const CACHE_MS = 30 * 60 * 1000;

// Clima público do ponto em que o navegador está. Usa fetch de propósito:
// o interceptor de autenticação não pode anexar o token nessas URLs.
@Injectable({ providedIn: 'root' })
export class WeatherService {
  readonly local = signal<LocalWeather | null>(readCache());

  load() {
    const cached = readCache();
    if (cached) {
      this.local.set(cached);
      return;
    }
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      pos => { void this.fetchAt(pos.coords.latitude, pos.coords.longitude); },
      () => { /* sem permissão a saudação segue sem a temperatura */ },
      { enableHighAccuracy: false, timeout: 8000, maximumAge: CACHE_MS },
    );
  }

  private async fetchAt(latitude: number, longitude: number) {
    try {
      const forecast = new URL('https://api.open-meteo.com/v1/forecast');
      forecast.searchParams.set('latitude', String(latitude));
      forecast.searchParams.set('longitude', String(longitude));
      forecast.searchParams.set('current', 'temperature_2m');
      forecast.searchParams.set('timezone', 'auto');

      const placeUrl = new URL('https://api.bigdatacloud.net/data/reverse-geocode-client');
      placeUrl.searchParams.set('latitude', String(latitude));
      placeUrl.searchParams.set('longitude', String(longitude));
      placeUrl.searchParams.set('localityLanguage', 'pt');

      const [weatherRes, placeRes] = await Promise.all([fetch(forecast), fetch(placeUrl)]);
      if (!weatherRes.ok) return;
      const weather = await weatherRes.json() as { current?: { temperature_2m?: number } };
      const raw = weather.current?.temperature_2m;
      if (typeof raw !== 'number') return;

      let place = '';
      if (placeRes.ok) {
        const geo = await placeRes.json() as {
          city?: string; locality?: string;
          localityInfo?: { administrative?: { name?: string; adminLevel?: number }[] };
        };
        const town = geo.localityInfo?.administrative?.find(a => a.adminLevel === 8)?.name;
        place = (town || geo.locality || geo.city || '').trim();
      }
      const value: LocalWeather = { temp: Math.round(raw), place };
      this.local.set(value);
      try { sessionStorage.setItem(CACHE_KEY, JSON.stringify({ ...value, at: Date.now() })); } catch { /* navegador sem armazenamento */ }
    } catch { /* rede indisponível: o Meu Dia continua sem a temperatura */ }
  }
}

function readCache(): LocalWeather | null {
  try {
    const raw = sessionStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { temp?: number; place?: string; at?: number };
    if (typeof parsed.temp !== 'number' || typeof parsed.at !== 'number') return null;
    if (Date.now() - parsed.at > CACHE_MS) return null;
    return { temp: parsed.temp, place: parsed.place || '' };
  } catch {
    return null;
  }
}
