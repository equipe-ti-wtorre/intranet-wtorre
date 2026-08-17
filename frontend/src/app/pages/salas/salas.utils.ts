import {
  Reserva,
  Sala,
  SalasUiConfig,
  ScheduleItem,
  SlotPeriod,
  SlotStatus,
  TimeSlot,
} from '../../models/salas.model';
import { isBusyScheduleStatus, overlapsInterval } from './salas-schedule-overlap';

const PERIODS: { id: string; label: string; range: string; startH: number; endH: number }[] = [
  { id: 'madrugada', label: 'Madrugada', range: '00:00 – 06:00', startH: 0, endH: 6 },
  { id: 'manha', label: 'Manhã', range: '06:00 – 12:00', startH: 6, endH: 12 },
  { id: 'tarde', label: 'Tarde', range: '12:00 – 18:00', startH: 12, endH: 18 },
  { id: 'noite', label: 'Noite', range: '18:00 – 23:59', startH: 18, endH: 24 },
];

export function isoDateOnly(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function parseIsoDate(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function dayBoundsUtc(isoDate: string): { start: string; end: string } {
  const local = parseIsoDate(isoDate);
  const start = new Date(local);
  start.setHours(0, 0, 0, 0);
  const end = new Date(local);
  end.setHours(23, 59, 59, 999);
  return { start: start.toISOString(), end: end.toISOString() };
}

export function formatDateBr(isoDate: string): string {
  const d = parseIsoDate(isoDate);
  return d.toLocaleDateString('pt-BR');
}

export function formatDateTimeBr(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatTimeBr(date: Date): string {
  return date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

export function calcOccupancyPercent(
  items: ScheduleItem[],
  dayIso: string,
  bookings: Reserva[] = []
): number {
  const slots = buildDayTimeSlots(dayIso, items, bookings);
  const bookable = slots.filter((s) => s.status !== 'past');
  if (!bookable.length) return 0;
  const occupied = bookable.filter((s) => s.status === 'occupied').length;
  return Math.round((occupied / bookable.length) * 100);
}

function findOverlappingBooking(
  startIso: string,
  endIso: string,
  bookings: Reserva[]
): Reserva | undefined {
  // Preferir a booking cujo início bate com o slot (mais específica em overlaps).
  let best: Reserva | undefined;
  let bestStart = Number.POSITIVE_INFINITY;
  for (const booking of bookings) {
    if (!overlapsInterval(startIso, endIso, booking.start, booking.end)) continue;
    const bookingStart = new Date(booking.start).getTime();
    if (bookingStart < bestStart) {
      best = booking;
      bestStart = bookingStart;
    }
  }
  return best;
}

function bookingSubject(booking: Reserva): string | undefined {
  return booking.title || booking.subject || undefined;
}

function bookingOrganizer(booking: Reserva): string | undefined {
  return booking.organizer || booking.organizerEmail || booking.requesterEmail || undefined;
}

function resolveBookingKey(booking: Reserva): string {
  const id = (booking.eventId || booking.id || '').trim();
  if (id) return id;
  return `${booking.start}|${booking.end}|${bookingOrganizer(booking) || ''}`;
}

function slotStatus(
  start: Date,
  end: Date,
  items: ScheduleItem[],
  bookings: Reserva[],
  now: Date
): {
  status: SlotStatus;
  subject?: string;
  organizer?: string;
  bookingKey?: string;
} {
  if (end <= now) return { status: 'past' };

  const startIso = start.toISOString();
  const endIso = end.toISOString();
  const booking = findOverlappingBooking(startIso, endIso, bookings);

  for (const item of items) {
    if (!isBusyScheduleStatus(item.status ?? 'busy')) continue;
    if (overlapsInterval(startIso, endIso, item.start, item.end)) {
      const fromScheduleSubject = item.subject || item.title;
      const fromScheduleOrganizer = item.organizer || item.organizerEmail;
      // Booking é a fonte de verdade para rótulo/organizador (o schedule Graph
      // frequentemente cobre várias reservas num único busy, com o 1º organizador).
      return {
        status: 'occupied',
        subject: (booking ? bookingSubject(booking) : undefined) || fromScheduleSubject,
        organizer: (booking ? bookingOrganizer(booking) : undefined) || fromScheduleOrganizer,
        bookingKey: booking ? resolveBookingKey(booking) : undefined,
      };
    }
  }

  if (booking) {
    return {
      status: 'occupied',
      subject: bookingSubject(booking),
      organizer: bookingOrganizer(booking),
      bookingKey: resolveBookingKey(booking),
    };
  }

  return { status: 'free' };
}

export function buildDayTimeSlots(
  dayIso: string,
  items: ScheduleItem[],
  bookings: Reserva[] = [],
  now = new Date()
): TimeSlot[] {
  const base = parseIsoDate(dayIso);
  const slots: TimeSlot[] = [];

  for (let h = 0; h < 24; h++) {
    for (const min of [0, 30]) {
      const start = new Date(base);
      start.setHours(h, min, 0, 0);
      const end = new Date(start);
      end.setMinutes(end.getMinutes() + 30);
      const { status, subject, organizer, bookingKey } = slotStatus(start, end, items, bookings, now);
      slots.push({
        start,
        end,
        status,
        label: formatTimeBr(start),
        subject,
        organizer,
        bookingKey,
      });
    }
  }

  return slots;
}

export function buildSlotPeriods(
  dayIso: string,
  items: ScheduleItem[],
  bookings: Reserva[] = [],
  now = new Date()
): SlotPeriod[] {
  const allSlots = buildDayTimeSlots(dayIso, items, bookings, now);

  return PERIODS.map((period) => {
    const slots = allSlots.filter((slot) => {
      const hour = slot.start.getHours();
      return hour >= period.startH && hour < period.endH;
    });
    return {
      id: period.id,
      label: period.label,
      range: period.range,
      slots: mergeAdjacentOccupied(slots),
    };
  });
}

export function buildCurrentPartialSlot(
  slots: TimeSlot[],
  now: Date,
  dayIso: string
): TimeSlot | null {
  if (isoDateOnly(now) !== dayIso) return null;

  const totalMinutes = now.getHours() * 60 + now.getMinutes();
  const blockStartMinute = Math.floor(totalMinutes / 30) * 30;

  const blockSlot = slots.find((slot) => {
    const slotMinute = slot.start.getHours() * 60 + slot.start.getMinutes();
    return slotMinute === blockStartMinute;
  });
  if (!blockSlot || blockSlot.status !== 'free') return null;
  if (now.getTime() >= blockSlot.end.getTime()) return null;

  const partialStart = new Date(now);
  partialStart.setSeconds(0, 0);

  return {
    start: partialStart,
    end: blockSlot.end,
    status: 'free',
    label: formatTimeBr(partialStart),
    partial: true,
  };
}

export function getBookableSlots(slots: TimeSlot[], now: Date, dayIso: string): TimeSlot[] {
  const nowMs = now.getTime();
  const partial = buildCurrentPartialSlot(slots, now, dayIso);
  const blockStartMinute = partial
    ? Math.floor((partial.start.getHours() * 60 + partial.start.getMinutes()) / 30) * 30
    : null;

  const future = slots.filter((slot) => {
    if (slot.status !== 'free') return false;
    const slotStartMs = slot.start.getTime();
    if (slotStartMs < nowMs) return false;
    if (blockStartMinute != null) {
      const slotBlockMinute = slot.start.getHours() * 60 + slot.start.getMinutes();
      if (slotBlockMinute === blockStartMinute) return false;
    }
    return true;
  });

  return partial ? [partial, ...future] : future;
}

export function resolveBookableSlotClick(clicked: TimeSlot, bookable: TimeSlot[]): TimeSlot {
  const clickedBlockMinute =
    Math.floor((clicked.start.getHours() * 60 + clicked.start.getMinutes()) / 30) * 30;
  const partial = bookable.find((slot) => {
    const blockMinute =
      Math.floor((slot.start.getHours() * 60 + slot.start.getMinutes()) / 30) * 30;
    return blockMinute === clickedBlockMinute && slot.partial;
  });
  if (partial) return partial;
  return bookable.find((slot) => slot.start.getTime() === clicked.start.getTime()) ?? clicked;
}

function canMergeOccupied(current: TimeSlot, next: TimeSlot): boolean {
  const currentKey = (current.bookingKey || '').trim();
  const nextKey = (next.bookingKey || '').trim();
  // Reservas distintas nunca se unem — mesmo com o mesmo organizador.
  if (currentKey || nextKey) return !!currentKey && currentKey === nextKey;

  const currentOrganizer = (current.organizer || '').trim();
  const nextOrganizer = (next.organizer || '').trim();
  // Sem booking: só une se ambos tiverem o mesmo organizador não vazio.
  return !!currentOrganizer && currentOrganizer === nextOrganizer;
}

function mergeAdjacentOccupied(slots: TimeSlot[]): TimeSlot[] {
  const result: TimeSlot[] = [];
  let i = 0;
  while (i < slots.length) {
    const slot = slots[i];
    if (slot.status !== 'occupied') {
      result.push({ ...slot });
      i++;
      continue;
    }

    let j = i + 1;
    let end = slot.end;
    let subject = slot.subject;
    let organizer = slot.organizer;
    const key = slot.bookingKey;
    while (j < slots.length) {
      const next = slots[j];
      if (next.status !== 'occupied') break;
      if (next.start.getTime() !== end.getTime()) break;
      if (!canMergeOccupied({ ...slot, subject, organizer, bookingKey: key }, next)) break;
      end = next.end;
      if (!subject) subject = next.subject;
      if (!organizer) organizer = next.organizer;
      j++;
    }

    result.push({
      start: slot.start,
      end,
      status: 'occupied',
      label: `${formatTimeBr(slot.start)} - ${formatTimeBr(end)}`,
      subject,
      organizer,
      bookingKey: key,
      colspan: j - i,
      merged: j - i > 1,
    });
    i = j;
  }
  return result;
}

export function resolveRoomDisplayName(
  email: string,
  apiName: string,
  roomDisplayNames?: Record<string, string>
): string {
  const override = roomDisplayNames?.[email.trim().toLowerCase()];
  return override?.trim() || apiName;
}

export function applyRoomDisplayNames(rooms: Sala[], config: Pick<SalasUiConfig, 'roomDisplayNames'>): Sala[] {
  const names = config.roomDisplayNames;
  if (!names || !Object.keys(names).length) return rooms;
  return rooms.map((room) => ({
    ...room,
    name: resolveRoomDisplayName(room.email, room.name, names),
  }));
}

export function orderRooms(rooms: Sala[], roomOrder?: string[]): Sala[] {
  if (!roomOrder?.length) return [...rooms];
  const map = new Map(rooms.map((r) => [r.email.toLowerCase(), r]));
  const ordered: Sala[] = [];
  for (const email of roomOrder) {
    const room = map.get(email.toLowerCase());
    if (room) {
      ordered.push(room);
      map.delete(email.toLowerCase());
    }
  }
  return [...ordered, ...map.values()];
}

export function extractEmailDomain(email: string): string | null {
  const normalized = email.trim().toLowerCase();
  const at = normalized.lastIndexOf('@');
  if (at < 0 || at === normalized.length - 1) return null;
  return normalized.slice(at + 1);
}

export function resolveRoomTab(
  email: string,
  config: Pick<SalasUiConfig, 'tabs' | 'roomTabOverrides'>
): { tabId: string | null; source: 'override' | 'domain' | 'unassigned' } {
  const normalizedEmail = email.trim().toLowerCase();
  const override = config.roomTabOverrides?.[normalizedEmail];
  if (override) {
    const tabExists = (config.tabs || []).some((tab) => tab.id === override || tab.value === override);
    return { tabId: tabExists ? override : null, source: 'override' };
  }

  const domain = extractEmailDomain(normalizedEmail);
  if (!domain) return { tabId: null, source: 'unassigned' };

  const tab = (config.tabs || []).find((entry) => entry.domains?.includes(domain));
  if (!tab) return { tabId: null, source: 'unassigned' };
  return { tabId: tab.id || tab.value || null, source: 'domain' };
}

export function sortRoomsByTabOrder(rooms: Sala[], tabId: string, config: SalasUiConfig): Sala[] {
  const order = config.roomOrderByTab?.[tabId];
  if (!order?.length) return rooms;
  const indexByEmail = new Map(order.map((email, index) => [email.toLowerCase(), index]));
  return [...rooms].sort((a, b) => {
    const aIndex = indexByEmail.get(a.email.toLowerCase());
    const bIndex = indexByEmail.get(b.email.toLowerCase());
    if (aIndex === undefined && bIndex === undefined) return 0;
    if (aIndex === undefined) return 1;
    if (bIndex === undefined) return -1;
    return aIndex - bIndex;
  });
}

export function todasLocalidadesGraph(cfg: SalasUiConfig): string[] {
  if (cfg.apiLocalidades?.length) return cfg.apiLocalidades;
  return Array.from(
    new Set(
      (cfg.tabs || [])
        .map((t) => t.localidade)
        .filter((v): v is string => !!v?.trim())
    )
  );
}

export function salasPorAba(tabId: string, cfg: SalasUiConfig, rooms: Sala[]): Sala[] {
  if (!tabId || !cfg) return [];
  return rooms.filter((room) => resolveRoomTab(room.email, cfg).tabId === tabId);
}

export function localidadesDasSalas(rooms: Sala[]): string[] {
  return Array.from(new Set(rooms.map((r) => r.apiLocalidade).filter((v): v is string => !!v)));
}

export function agruparEmailsPorLocalidade(rooms: Sala[]): Map<string, string[]> {
  const map = new Map<string, string[]>();
  for (const room of rooms) {
    const loc = room.apiLocalidade || '';
    if (!loc) continue;
    const list = map.get(loc) || [];
    list.push(room.email);
    map.set(loc, list);
  }
  return map;
}

export function scheduleCacheKey(localidade: string, dayIso: string, emails: string[]): string {
  const sorted = [...emails].map((e) => e.toLowerCase()).sort();
  return `${localidade}:${dayIso}:${sorted.join(',')}`;
}

export function resolveApiLocalidade(emailOrDomain: string, config: SalasUiConfig): string | null {
  const mapping =
    config.domainToApiLocalidade ||
    config.domainLocalidadeMap ||
    config.domainToLocalidade ||
    {};
  const domain = emailOrDomain.includes('@')
    ? extractEmailDomain(emailOrDomain)
    : emailOrDomain.trim().toLowerCase();
  if (!domain) return null;
  return mapping[domain] ?? null;
}

export function reservaTitulo(r: Reserva): string {
  return r.title || r.subject || 'Reserva';
}

export function reservaEventId(r: Reserva): string {
  return r.eventId || r.id || '';
}

export function reservaOrganizer(r: Reserva): string {
  return r.organizer || r.organizerEmail || r.requesterEmail || '';
}

export function filtrarReservasDoDia(reservas: Reserva[], dayIso: string, roomEmails?: string[]): Reserva[] {
  const dayStart = parseIsoDate(dayIso);
  dayStart.setHours(0, 0, 0, 0);
  const dayEnd = new Date(dayStart);
  dayEnd.setHours(23, 59, 59, 999);
  const emails = roomEmails?.map((e) => e.toLowerCase());

  return reservas
    .filter((r) => {
      const start = new Date(r.start);
      if (start < dayStart || start > dayEnd) return false;
      if (emails?.length && r.roomEmail) {
        return emails.includes(r.roomEmail.toLowerCase());
      }
      return true;
    })
    .sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());
}

export function nomeSalaPorEmail(
  rooms: Sala[],
  email: string,
  roomDisplayNames?: Record<string, string>
): string {
  const room = rooms.find((r) => r.email.toLowerCase() === email.toLowerCase());
  if (!room) return email;
  return resolveRoomDisplayName(room.email, room.name, roomDisplayNames);
}

export function duracaoMinutos(start: Date, end: Date): number {
  return Math.round((end.getTime() - start.getTime()) / 60000);
}

export interface EndTimeOption {
  label: string;
  end: Date;
  minutos: number;
}

function findAnchorSlotIndex(sorted: TimeSlot[], start: Date): number {
  const startMs = start.getTime();
  for (let index = 0; index < sorted.length; index += 1) {
    const slot = sorted[index];
    if (slot.status !== 'free') continue;
    const slotStartMs = slot.start.getTime();
    const slotEndMs = slot.end.getTime();
    if (startMs >= slotStartMs && startMs < slotEndMs) return index;
    if (startMs === slotStartMs) return index;
  }
  return -1;
}

export function buildAvailableEndTimeOptions(start: Date, slots: TimeSlot[]): EndTimeOption[] {
  if (!start || !slots.length) return [];

  const sorted = [...slots].sort((a, b) => a.start.getTime() - b.start.getTime());
  const startIndex = findAnchorSlotIndex(sorted, start);
  if (startIndex < 0) return [];

  const options: EndTimeOption[] = [];
  const startMs = start.getTime();

  for (let index = startIndex; index < sorted.length; index += 1) {
    const current = sorted[index];
    if (!current || current.status === 'occupied' || current.status === 'past') break;
    if (index > startIndex) {
      const previous = sorted[index - 1];
      if (!previous || previous.end.getTime() !== current.start.getTime()) break;
    }

    const minutos = Math.round((current.end.getTime() - startMs) / 60000);
    if (minutos <= 0) continue;

    options.push({
      label: `${formatTimeBr(current.end)} (${minutos} min)`,
      end: current.end,
      minutos,
    });
  }

  return options;
}
