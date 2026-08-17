import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, of } from 'rxjs';
import { tap } from 'rxjs/operators';
import { environment } from '../../environments/environment';
import {
  AvailabilityPreviewResponse,
  BookPayload,
  BookingsResponse,
  DirectoryUsersResponse,
  PreviewPayload,
  RoomsResponse,
  SalasUiConfig,
  ScheduleResponse,
} from '../models/salas.model';
import { scheduleCacheKey } from '../pages/salas/salas.utils';

export interface SalasFetchOptions {
  forceRefresh?: boolean;
}

interface CacheEntry<T> {
  data: T;
  expiresAt: number;
}

const TTL_ROOMS_MS = 10 * 60 * 1000;
const TTL_SCHEDULE_MS = 60 * 1000;
const TTL_BOOKINGS_MS = 60 * 1000;

@Injectable({ providedIn: 'root' })
export class SalasService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiBaseUrl}/salas`;
  private readonly cache = new Map<string, CacheEntry<unknown>>();

  private params(localidade: string, extra?: Record<string, string | undefined>): HttpParams {
    let p = new HttpParams().set('localidade', localidade);
    if (extra) {
      for (const [key, value] of Object.entries(extra)) {
        if (value != null && value !== '') p = p.set(key, value);
      }
    }
    return p;
  }

  private readCache<T>(key: string): CacheEntry<T> | null {
    const entry = this.cache.get(key) as CacheEntry<T> | undefined;
    return entry ?? null;
  }

  private writeCache<T>(key: string, data: T, ttlMs: number): void {
    this.cache.set(key, { data, expiresAt: Date.now() + ttlMs });
  }

  private isFresh(entry: CacheEntry<unknown>): boolean {
    return entry.expiresAt > Date.now();
  }

  private fetchWithCache<T>(
    key: string,
    ttlMs: number,
    fetch: () => Observable<T>,
    options?: SalasFetchOptions
  ): Observable<T> {
    if (!options?.forceRefresh) {
      const hit = this.readCache<T>(key);
      if (hit) {
        if (!this.isFresh(hit)) {
          fetch().subscribe({
            next: (data) => this.writeCache(key, data, ttlMs),
          });
        }
        return of(hit.data);
      }
    }

    return fetch().pipe(tap((data) => this.writeCache(key, data, ttlMs)));
  }

  invalidateCache(): void {
    this.cache.clear();
  }

  invalidateScheduleAndBookingsCache(dayIso?: string): void {
    for (const key of [...this.cache.keys()]) {
      if (key.startsWith('schedule:') || key.startsWith('bookings:')) {
        if (!dayIso || key.includes(`:${dayIso}:`) || key.endsWith(`:${dayIso}`)) {
          this.cache.delete(key);
        }
      }
    }
  }

  getUiConfig(): Observable<SalasUiConfig> {
    return this.http.get<SalasUiConfig>(`${this.base}/ui-config`);
  }

  getRooms(localidade: string, options?: SalasFetchOptions): Observable<RoomsResponse> {
    const key = `rooms:${localidade}`;
    return this.fetchWithCache(
      key,
      TTL_ROOMS_MS,
      () =>
        this.http.get<RoomsResponse>(`${this.base}/rooms`, {
          params: this.params(localidade),
        }),
      options
    );
  }

  getSchedule(
    localidade: string,
    body: { rooms: string[]; start: string; end: string },
    options?: SalasFetchOptions
  ): Observable<ScheduleResponse> {
    const dayIso = body.start.slice(0, 10);
    const key = `schedule:${scheduleCacheKey(localidade, dayIso, body.rooms)}`;
    return this.fetchWithCache(
      key,
      TTL_SCHEDULE_MS,
      () =>
        this.http.post<ScheduleResponse>(`${this.base}/schedule`, body, {
          params: this.params(localidade),
        }),
      options
    );
  }

  previewAvailability(localidade: string, body: PreviewPayload): Observable<AvailabilityPreviewResponse> {
    return this.http.post<AvailabilityPreviewResponse>(`${this.base}/availability/preview`, body, {
      params: this.params(localidade),
    });
  }

  book(localidade: string, body: BookPayload): Observable<{ eventId?: string; localidade?: string }> {
    return this.http.post<{ eventId?: string; localidade?: string }>(`${this.base}/book`, body, {
      params: this.params(localidade),
    });
  }

  getBookings(
    localidade: string,
    start?: string,
    end?: string,
    options?: SalasFetchOptions
  ): Observable<BookingsResponse> {
    const dayIso = start?.slice(0, 10) || '';
    const key = `bookings:${localidade}:${dayIso}`;
    return this.fetchWithCache(
      key,
      TTL_BOOKINGS_MS,
      () =>
        this.http.get<BookingsResponse>(`${this.base}/bookings`, {
          params: this.params(localidade, { start, end }),
        }),
      options
    );
  }

  cancelBooking(
    localidade: string,
    eventId: string,
    query?: { start?: string; end?: string; roomEmail?: string; title?: string; organizer?: string }
  ): Observable<void> {
    return this.http.delete<void>(`${this.base}/bookings/${encodeURIComponent(eventId)}`, {
      params: this.params(localidade, query),
    });
  }

  searchUsers(localidade: string, query: string): Observable<DirectoryUsersResponse> {
    return this.http.get<DirectoryUsersResponse>(`${this.base}/directory/users`, {
      params: this.params(localidade, { query }),
    });
  }
}
