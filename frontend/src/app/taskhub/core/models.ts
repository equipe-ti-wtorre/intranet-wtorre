export type Role = 'admin' | 'gestor' | 'membro' | 'convidado';
export type Profile = string;
export type Priority = 'critica' | 'alta' | 'media' | 'baixa';
export type StatusCategory = 'todo' | 'doing' | 'blocked' | 'done' | 'canceled';
export type ProjectRole = 'manage' | 'edit' | 'view' | 'guest' | 'partial';
export type Space = 'profissional' | 'pessoal';
export type Size = 'P' | 'M' | 'G';
export type Period = 'manha' | 'tarde' | 'fim';
export type Load = 'leve' | 'equilibrado' | 'cheio';

export interface User {
  id: number; name: string; email: string; username: string; initials: string; color: string;
  role: Role; is_admin: boolean; is_director: boolean; is_manager: boolean; active: boolean; must_change_password: boolean;
  profiles: Profile[]; profile_labels: string[]; permissions: string[]; effective_permissions: string[]; directed_sectors: number[];
  sector_id: number | null; sector_name?: string | null; team_id: number | null; team_ids?: number[]; team_name?: string | null; can_manage_users: 'all' | 'team' | null;
  daily_capacity_min: number; job_title: string; department: string; from_directory: boolean; away_until: string | null;
  avatar_url: string | null;
}

export interface Person {
  id: number; name: string; username: string; initials: string; color: string; avatar_url?: string | null;
  job_title?: string; away_until?: string | null; role?: string;
  team_id?: number | null; team_name?: string | null; in_team?: boolean;
  sector_id?: number | null; sector_name?: string | null;
  profiles?: string[]; can_coordinate?: boolean; from_directory?: boolean;
}

export interface MyStep { id: number; title: string; due_date: string | null; }

export interface Session { token: string; refresh_token: string; user: User; }

export interface Status {
  id: number; project_id: number; name: string; color: string; category: StatusCategory;
  position: number; wip_limit: number | null;
}

export interface Section { id: number; project_id: number; name: string; position: number; }

// Fase do trabalho: as colunas do Kanban de trabalhos, definidas por setor.
export interface Phase { id: number; team_id: number | null; name: string; color: string; position: number; duration_days?: number; }

export interface Task {
  id: number; title: string; description: string; priority: Priority;
  due_date: string | null; start_date: string | null; estimate_min: number | null; size?: Size | null;
  completed_at: string | null; position: number; is_private: boolean; blocked_reason: string | null;
  space: Space;
  tags: string[];
  project: { id: number; name: string; color: string; team_id: number | null; team_name?: string | null } | null;
  section: { id: number; name: string } | null;
  phase?: { id: number; name: string; color: string } | null;
  status: { id: number | null; name: string; color: string; category: StatusCategory };
  assignee: Person | null;
  created_by: { id: number; name: string } | null;
  subtasks_total: number; subtasks_done: number; comments_count: number;
  access: 'edit' | 'work' | 'view' | 'comment';
  my_steps: MyStep[];
  created_at: string; updated_at: string;
}

export interface Subtask {
  id: number; title: string; done: boolean; position: number; due_date: string | null; assignee_id: number | null;
  assignee_name?: string | null; assignee_initials?: string | null; assignee_color?: string | null; assignee_team?: string | null;
  is_current?: boolean;
  // false: o responsável da etapa não é avisado.
  notify?: boolean;
}

export interface TaskContact { id: number; name: string; initials: string; color: string }

export interface TaskDetail extends Task {
  subtasks: Subtask[]; statuses: Status[]; sections: Section[]; phases?: Phase[]; current_step_id?: number | null;
  // Registro da reunião: com quem foi alinhado (sem aviso nem acesso) e a data.
  contacts?: TaskContact[]; aligned_on?: string | null;
}

export interface CreatableWork {
  id: number; name: string; color: string; project_id: number; project_name: string; space: Space;
  team_id: number | null; team_name: string | null; phase_id: number | null;
}

export interface TimelineEntry {
  kind: 'activity' | 'comment'; id: number; type: string | null; from_value: string | null; to_value: string | null;
  body: string | null; user_id: number | null; user_name: string | null; initials: string | null; color: string | null;
  note?: string | null; note_hidden?: boolean;
  created_at: string;
}

export interface Team {
  id: number; name: string; description: string; color: string; can_dashboard?: boolean;
  sector_id?: number; sector_name?: string; can_edit?: boolean; is_member?: boolean;
  managers?: { id: number; name: string; initials: string; color: string }[];
  my_role: 'gestor' | 'membro' | null; members_count?: number; projects_count?: number; board_id?: number | null;
  members?: (Person & { daily_capacity_min: number; profiles?: Profile[]; is_manager?: boolean })[];
}

export interface Work {
  id: number; project_id: number; name: string; description: string; color: string; position: number;
  due_date: string | null; completed_at: string | null; created_at: string;
  owner_id: number | null; owner_name: string | null; owner_initials: string | null; owner_color: string | null;
  // follow: solicitante no quadro da equipe (vê só a fase e o histórico).
  my_role: 'manage' | 'view' | 'follow'; last_visit: string | null;
  tasks_total: number; tasks_done: number; tasks_overdue: number; tasks_blocked: number;
  // No quadro da equipe, members são os solicitantes.
  members: { id: number; name: string; initials: string; color: string }[];
  owners: { id: number; name: string; initials: string; color: string }[];
  duration_days?: number | null;
  start_date?: string | null;
  phase_id?: number | null; phase_name?: string | null; phase_color?: string | null; phase_changed_at?: string | null; board_position?: number | null;
  continues?: { id: number; name: string }[];
  continued_by?: { id: number; name: string }[];
}
export interface WorkPhaseLog {
  id: number; phase_id: number; phase_name: string; phase_color: string; changed_at: string;
  changed_by: number | null; changed_by_name: string | null;
}
export interface WorkPhaseStay {
  phase_id: number; phase_name: string; phase_color: string; changed_at: string;
}
export interface TimelineWork extends Work {
  duration_days: number; duration_saved: boolean;
  tl_start: string; tl_end: string; tl_late: boolean;
  phase_log?: WorkPhaseStay[];
}
export interface ProjectTimeline {
  project_start: string; end_date: string | null; forecast_end: string | null;
  works: TimelineWork[]; can_edit: boolean; phases?: Phase[];
}

export interface ScheduleConflict {
  work_id: number; name: string; owner_ids: number[]; owner_names: string[];
  start: string; end: string; new_start: string; new_end: string; in_progress: boolean;
}
export interface SchedulePreview {
  conflicts: ScheduleConflict[];
  suggestion: { start: string; due: string };
  duration_days: number;
}
export interface WorkDetail extends Work {
  project: { id: number; name: string; color: string; space: Space; sector_id: number | null; sector_name: string | null; my_role: ProjectRole };
  statuses: Status[];
  phases: Phase[];
  team_id: number | null;
  phases_editable: boolean;
}

// Dashboard do trabalho (alimenta a aba Dashboard do trabalho, a apresentação e o PowerPoint).
export interface DashItem {
  id: number; title: string; status: string | null; status_color: string | null; due_date: string | null;
  assignee: string | null; assignee_initials: string | null; assignee_color: string | null;
  blocked_reason: string | null; completed_at: string | null;
}
export type DashHealth = 'no_prazo' | 'em_risco' | 'atrasado' | 'concluido';
export interface WorkDashboard {
  subject: { id: number; name: string; color: string; description: string; health: DashHealth;
    project_id: number; project_name: string; sector_name: string | null; owner_name: string | null;
    start_date: string; end_date: string | null; completed: boolean;
    continues?: string[]; continued_by?: string[] };
  generated_at: string;
  kpis: { total: number; done: number; open: number; doing: number; overdue: number; blocked: number; done_week: number; pct: number; time_pct: number | null };
  by_status: { name: string; color: string; category: string; count: number }[];
  by_person: { id: number; name: string; initials: string; color: string; open: number; overdue: number; done: number }[];
  weekly: { week: string; created: number; done: number }[];
  doing: DashItem[]; upcoming: DashItem[]; overdue: DashItem[]; blocked: DashItem[]; done_week: DashItem[];
}

export interface Sector {
  id: number; name: string; description: string; color: string; can_dashboard: boolean;
  people_count: number; teams_count: number; managers: { id: number; name: string; initials: string; color: string }[];
}

export interface AccessProfile { key: string; label: string; description: string; permissions: string[]; system: boolean; users_count: number; }
export interface Permission { key: string; label: string; hint: string; }

export interface Project {
  id: number; team_id: number | null; team_name: string | null; sector_id?: number | null; sector_name?: string | null; space: Space; members_count?: number; is_member?: boolean; is_board?: boolean; name: string; description: string; color: string;
  owner_id: number | null; owner_name: string | null; start_date: string | null; end_date: string | null;
  health: 'no_prazo' | 'em_risco' | 'atrasado';
  archived: boolean; my_role: ProjectRole;
  open_count?: number; overdue_count?: number; done_count?: number; total_count?: number;
  statuses?: Status[]; sections?: Section[]; members?: (Person & { role: 'editor' | 'leitor'; team_name?: string | null; can_coordinate?: boolean })[];
}

export interface DayItem { id: number; title: string; done: boolean; period: Period; time?: string; }

export interface DayData {
  date: string; current_period: Period | null; capacity_min: number; load: Load;
  planned_min: number; remaining_min: number;
  plan: (Task & { period: Period })[];
  periods: { key: Period; load: Load; total: number; done: number }[];
  routine: DayItem[]; reminders: DayItem[];
  suggestions: { overdue: Task[]; today: Task[]; carryover: Task[]; week: Task[]; recent: Task[]; backlog: Task[] };
  counts: { overdue: number; today: number; waiting_me: number };
  waiting: {
    for_me: { task_id: number; task: string; step: string; from: string | null }[];
    by_me: { id: number; step: string; task_id: number; task: string; person: string; due_date: string | null; days: number }[];
  };
  tomorrow: { date: string; planned: number; due: number };
  closure: { summary: string; closed_at: string } | null;
}

export interface Notification {
  id: number; type: string; title: string; body: string; task_id: number | null; project_id: number | null;
  task_title: string | null; project_name: string | null; actor_name: string | null;
  actor_initials: string | null; actor_color: string | null; read_at: string | null; created_at: string;
}

export interface RoutineBlock { id: number; startTime: string; endTime: string | null; label: string; icon: string | null; done?: boolean; }
export type ReminderRepeat = 'none' | 'daily' | 'weekdays' | 'weekly' | 'monthly';
export interface Reminder { id: number; date: string; time: string; title: string; done: boolean; repeat: ReminderRepeat; notified?: boolean; }
export type NoteColor = 'none' | 'yellow' | 'blue' | 'green' | 'purple' | 'orange' | 'red';
export interface Note {
  id: number; title: string; body: string; color: NoteColor; pinned: boolean;
  created_at: string; updated_at: string;
}

export interface TeamDashboard {
  team: { id: number; name: string; color: string };
  generated_at: string;
  kpis: {
    open: number; doing: number; blocked: number; overdue: number; done_week: number; done_prev_week: number;
    created_week: number; done_with_due_30d: number; on_time_30d: number; lead_time_days: number | null;
  };
  people: (Person & { is_manager?: boolean; open: number; doing: number; blocked: number; overdue: number; done_7d: number;
    load_week_min: number; hidden_load_min: number; capacity_week_min: number; load_pct: number; other_teams: number })[];
  blocked: (Task & { blocked_since: string })[];
  due_soon: Task[]; overdue: Task[]; triage: Task[];
  waiting_other: (Task & { waiting_on: { name: string; team: string; step: string | null }[] })[];
  teams?: { id: number; name: string; color: string; members_count: number; open: number; overdue: number }[];
}

export interface SearchResult {
  tasks: Task[]; projects: Project[]; people: Person[];
  works: { id: number; name: string; color: string; project_id: number; team_id: number; team_name: string }[];
}
