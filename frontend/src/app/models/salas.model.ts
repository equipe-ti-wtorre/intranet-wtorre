export interface Sala {
  name: string;
  email: string;
  capacity: number;
  apiLocalidade?: string;
}

export interface SalasTab {
  id?: string;
  label: string;
  localidade: string;
  value?: string;
  logoKey?: string;
  logoFile?: string | null;
  domains?: string[];
}

export interface SalasUiConfig {
  tabs?: SalasTab[];
  roomOrder?: string[];
  roomOrderByTab?: Record<string, string[]>;
  roomTabOverrides?: Record<string, string>;
  roomDisplayNames?: Record<string, string>;
  domainLocalidadeMap?: Record<string, string>;
  domainToApiLocalidade?: Record<string, string>;
  domainToLocalidade?: Record<string, string>;
  localidadePadrao?: string;
  apiLocalidades?: string[];
}

export interface ScheduleItem {
  start: string;
  end: string;
  status?: string;
  subject?: string;
  organizer?: string;
  organizerEmail?: string;
  title?: string;
}

export interface SalaSchedule {
  roomEmail: string;
  isAvailable?: boolean;
  scheduleItems: ScheduleItem[];
}

export interface ScheduleResponse {
  schedule: SalaSchedule[];
}

export interface RoomsResponse {
  rooms: Sala[];
}

export interface Reserva {
  eventId?: string;
  id?: string;
  title?: string;
  subject?: string;
  start: string;
  end: string;
  roomEmail?: string;
  room?: string;
  organizer?: string;
  organizerEmail?: string;
  requesterEmail?: string;
}

export interface BookingsResponse {
  bookings?: Reserva[];
}

export interface BookPayload {
  roomEmail: string;
  title: string;
  start: string;
  end: string;
  requesterEmail?: string;
  participants?: string[];
  allowRequesterConflict?: boolean;
  allowParticipantConflict?: boolean;
}

export interface PreviewPayload {
  roomEmail: string;
  participants?: string[];
  start: string;
  end: string;
}

export interface AvailabilityConflict {
  start: string;
  end: string;
  subject?: string;
  status: string;
}

export interface AvailabilityItem {
  email: string;
  isAvailable: boolean;
  availabilityStatus?: 'available' | 'busy' | 'unknown' | 'not_validated_contact';
  conflicts: AvailabilityConflict[];
}

export interface AvailabilityPreview {
  start: string;
  end: string;
  room: AvailabilityItem;
  participants: AvailabilityItem[];
}

export interface AvailabilityPreviewResponse {
  preview: AvailabilityPreview;
}

export interface PreviewConflict {
  type?: string;
  email?: string;
  message?: string;
}

export interface PreviewResult {
  available?: boolean;
  roomAvailable?: boolean;
  requesterAvailable?: boolean;
  participantsAvailable?: boolean;
  conflicts?: PreviewConflict[];
  message?: string;
}

export interface DirectoryUser {
  displayName?: string;
  name?: string;
  email: string;
}

export interface DirectoryUsersResponse {
  users?: DirectoryUser[];
}

export type SalasView = 'dashboard' | 'agenda' | 'reservas';

export type SlotStatus = 'past' | 'free' | 'occupied';

export interface TimeSlot {
  start: Date;
  end: Date;
  status: SlotStatus;
  label: string;
  subject?: string;
  organizer?: string;
  /** Identidade da reserva (eventId/id+start) para limitar o merge visual. */
  bookingKey?: string;
  colspan?: number;
  merged?: boolean;
  skip?: boolean;
  partial?: boolean;
}

export interface SlotPeriod {
  id: string;
  label: string;
  range: string;
  slots: TimeSlot[];
}

export interface SalaComOcupacao extends Sala {
  occupancyPercent: number;
}
