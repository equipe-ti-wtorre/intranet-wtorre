import { Injectable } from '@angular/core';
import { Evento } from '../models/evento.model';

const TTL_MS = 60 * 60 * 1000;
const PREFIX = 'intranet_eventos_';

export interface EventosAgendaCacheEntry {
  eventos: Evento[];
  atualizadoEm: string;
  expiresAt: number;
}

@Injectable({ providedIn: 'root' })
export class EventosAgendaCacheService {
  static mesKey(ano: number, mes: number): string {
    const m = String(mes).padStart(2, '0');
    return `${PREFIX}mes_${ano}-${m}`;
  }

  static intervaloKey(de: string, ate: string): string {
    return `${PREFIX}range_${de}_${ate}`;
  }

  get(key: string): EventosAgendaCacheEntry | null {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return null;
      const entry = JSON.parse(raw) as EventosAgendaCacheEntry;
      if (!entry?.expiresAt || entry.expiresAt <= Date.now()) {
        localStorage.removeItem(key);
        return null;
      }
      return entry;
    } catch {
      return null;
    }
  }

  set(key: string, eventos: Evento[], atualizadoEm: string): void {
    const entry: EventosAgendaCacheEntry = {
      eventos,
      atualizadoEm,
      expiresAt: Date.now() + TTL_MS,
    };
    try {
      localStorage.setItem(key, JSON.stringify(entry));
    } catch {
      // quota exceeded — ignora persistência
    }
  }

  isValid(key: string): boolean {
    return this.get(key) != null;
  }

  invalidateAll(): void {
    const keys: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k?.startsWith(PREFIX)) keys.push(k);
    }
    keys.forEach((k) => localStorage.removeItem(k));
  }
}
