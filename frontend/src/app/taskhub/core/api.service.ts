import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { environment } from '../environments/environment';
import {
  AccessProfile, DayData, Note, Notification, Permission, Person, Project, Sector, Reminder, ReminderRepeat, RoutineBlock, Section, Status, Task, TaskDetail, Work, WorkDashboard, WorkDetail,
  Team, TeamDashboard, TimelineEntry, User, Subtask, ProjectTimeline,
} from './models';

const U = environment.apiUrl;

@Injectable({ providedIn: 'root' })
export class ApiService {
  constructor(private http: HttpClient) {}

  private params(obj: Record<string, unknown> = {}) {
    let p = new HttpParams();
    for (const [k, v] of Object.entries(obj)) if (v !== undefined && v !== null && v !== '') p = p.set(k, String(v));
    return p;
  }

  // Tarefas
  tasks(filters: Record<string, unknown>) { return this.http.get<Task[]>(`${U}/tasks`, { params: this.params(filters) }); }
  task(id: number) { return this.http.get<TaskDetail>(`${U}/tasks/${id}`); }
  createTask(body: Record<string, unknown>) { return this.http.post<Task>(`${U}/tasks`, body); }
  updateTask(id: number, body: Record<string, unknown>) { return this.http.patch<Task>(`${U}/tasks/${id}`, body); }
  deleteTask(id: number) { return this.http.delete(`${U}/tasks/${id}`); }
  addSubtask(id: number, title: string, extra: Partial<Subtask> = {}) { return this.http.post<Subtask>(`${U}/tasks/${id}/subtasks`, { title, ...extra }); }
  updateSubtask(id: number, sid: number, body: Record<string, unknown>) { return this.http.patch<Subtask>(`${U}/tasks/${id}/subtasks/${sid}`, body); }
  deleteSubtask(id: number, sid: number) { return this.http.delete(`${U}/tasks/${id}/subtasks/${sid}`); }
  timeline(id: number) { return this.http.get<TimelineEntry[]>(`${U}/tasks/${id}/timeline`); }
  comment(id: number, body: string) { return this.http.post<TimelineEntry>(`${U}/tasks/${id}/comments`, { body }); }

  // Meu Dia
  day(date: string) { return this.http.get<DayData>(`${U}/me/day`, { params: this.params({ date }) }); }
  planAdd(task_id: number, date: string, position?: number, period?: string) { return this.http.post(`${U}/me/day/items`, { task_id, date, position, period }); }
  planRemove(task_id: number, date: string) { return this.http.delete(`${U}/me/day/items/${task_id}`, { params: this.params({ date }) }); }
  distributeDay(date: string) { return this.http.post<{ added: number }>(`${U}/me/day/distribute`, { date }); }
  closeDay(body: Record<string, unknown>) { return this.http.post<{ summary: string; done: number; moved: number }>(`${U}/me/day/close`, body); }
  routineDay(date: string) { return this.http.get<RoutineBlock[]>(`${U}/routine/day`, { params: this.params({ date }) }); }
  routineCheck(routineBlockId: number, date: string, done: boolean) { return this.http.post(`${U}/routine/checks`, { routineBlockId, date, done }); }
  addRoutineBlock(body: { weekday: number; startTime: string; endTime?: string | null; label: string }) { return this.http.post(`${U}/routine/blocks`, body); }
  deleteRoutineBlock(id: number) { return this.http.delete(`${U}/routine/blocks/${id}`); }
  reminders(filters: { date?: string } = {}) { return this.http.get<Reminder[]>(`${U}/reminders`, { params: this.params(filters) }); }
  addReminder(body: { date: string; time: string; title: string; repeat?: ReminderRepeat }) { return this.http.post<Reminder>(`${U}/reminders`, body); }
  updateReminder(id: number, body: Partial<Reminder>) { return this.http.put<Reminder>(`${U}/reminders/${id}`, body); }
  deleteReminder(id: number) { return this.http.delete(`${U}/reminders/${id}`); }
  notes() { return this.http.get<Note[]>(`${U}/notes`); }
  createNote(body: Partial<Pick<Note, 'title' | 'body' | 'color' | 'pinned'>> = {}) { return this.http.post<Note>(`${U}/notes`, body); }
  updateNote(id: number, body: Partial<Pick<Note, 'title' | 'body' | 'color' | 'pinned'>>) { return this.http.patch<Note>(`${U}/notes/${id}`, body); }
  deleteNote(id: number) { return this.http.delete(`${U}/notes/${id}`); }

  // Caixa de entrada
  inbox(filter: 'all' | 'unread') { return this.http.get<Notification[]>(`${U}/inbox`, { params: this.params({ filter }) }); }
  inboxCount() { return this.http.get<{ unread: number }>(`${U}/inbox/count`); }
  inboxRead(id: number) { return this.http.post(`${U}/inbox/${id}/read`, {}); }
  inboxUnread(id: number) { return this.http.post(`${U}/inbox/${id}/unread`, {}); }
  inboxArchive(id: number) { return this.http.post(`${U}/inbox/${id}/archive`, {}); }
  inboxSnooze(id: number, until: Date) { return this.http.post(`${U}/inbox/${id}/snooze`, { until }); }
  inboxReadAll() { return this.http.post(`${U}/inbox/read-all`, {}); }

  // Projetos
  projects(params: Record<string, unknown> = {}) { return this.http.get<Project[]>(`${U}/projects`, { params: this.params(params) }); }
  project(id: number) { return this.http.get<Project>(`${U}/projects/${id}`); }
  projectPeople(id: number) { return this.http.get<Person[]>(`${U}/projects/${id}/people`); }
  workDashboard(id: number) { return this.http.get<WorkDashboard>(`${U}/works/${id}/dashboard`); }
  works(projectId: number) { return this.http.get<{ works: Work[]; can_create: boolean }>(`${U}/projects/${projectId}/works`); }
  work(id: number) { return this.http.get<WorkDetail>(`${U}/works/${id}`); }
  createWork(projectId: number, body: Record<string, unknown>) { return this.http.post<Work>(`${U}/projects/${projectId}/works`, body); }
  updateWork(id: number, body: Record<string, unknown>) { return this.http.patch<Work>(`${U}/works/${id}`, body); }
  deleteWork(id: number) { return this.http.delete(`${U}/works/${id}`); }
  projectTimeline(projectId: number) { return this.http.get<ProjectTimeline>(`${U}/projects/${projectId}/timeline`); }
  saveTimeline(projectId: number, body: { items: { id?: number; name?: string; color?: string; duration_days: number; start_date?: string | null }[]; remove: number[] }) {
    return this.http.put<ProjectTimeline>(`${U}/projects/${projectId}/timeline`, body);
  }
  visitWork(id: number) { return this.http.post(`${U}/works/${id}/visit`, {}); }
  createProject(body: Record<string, unknown>) { return this.http.post<Project>(`${U}/projects`, body); }
  updateProject(id: number, body: Record<string, unknown>) { return this.http.patch<Project>(`${U}/projects/${id}`, body); }
  deleteProject(id: number) { return this.http.delete(`${U}/projects/${id}`); }
  setProjectMember(id: number, userId: number, role: string) { return this.http.put(`${U}/projects/${id}/members/${userId}`, { role }); }
  removeProjectMember(id: number, userId: number) { return this.http.delete(`${U}/projects/${id}/members/${userId}`); }
  createStatus(id: number, body: Partial<Status>) { return this.http.post<Status>(`${U}/projects/${id}/statuses`, body); }
  updateStatus(id: number, sid: number, body: Partial<Status>) { return this.http.patch<Status>(`${U}/projects/${id}/statuses/${sid}`, body); }
  deleteStatus(id: number, sid: number, moveTo: number) { return this.http.delete(`${U}/projects/${id}/statuses/${sid}`, { params: this.params({ move_to: moveTo }) }); }
  orderStatuses(id: number, ids: number[]) { return this.http.put(`${U}/projects/${id}/statuses/order`, { ids }); }
  createSection(id: number, name: string) { return this.http.post<Section>(`${U}/projects/${id}/sections`, { name }); }
  updateSection(id: number, sid: number, body: Partial<Section>) { return this.http.patch<Section>(`${U}/projects/${id}/sections/${sid}`, body); }
  deleteSection(id: number, sid: number) { return this.http.delete(`${U}/projects/${id}/sections/${sid}`); }

  // Equipes e pessoas
  teams() { return this.http.get<{ teams: Team[]; creatable_sectors: number[] }>(`${U}/teams`); }
  deleteTeam(id: number) { return this.http.delete(`${U}/teams/${id}`); }
  setTeamManager(id: number, userId: number) { return this.http.put(`${U}/teams/${id}/managers/${userId}`, {}); }
  removeTeamManager(id: number, userId: number) { return this.http.delete(`${U}/teams/${id}/managers/${userId}`); }
  sectors() { return this.http.get<Sector[]>(`${U}/sectors`); }
  createSector(body: Record<string, unknown>) { return this.http.post<Sector>(`${U}/sectors`, body); }
  updateSector(id: number, body: Record<string, unknown>) { return this.http.patch<Sector>(`${U}/sectors/${id}`, body); }
  deleteSector(id: number) { return this.http.delete(`${U}/sectors/${id}`); }
  accessProfiles() { return this.http.get<{ profiles: AccessProfile[]; permissions: Permission[] }>(`${U}/access-profiles`); }
  microsoftAdmin() {
    return this.http.get<{
      enabled: boolean; directory: boolean; redirectUri: string;
      tenants: { nome: string; tenantId: string; clientId: string; hasSecret: boolean; principal: boolean }[];
    }>(`${U}/microsoft`);
  }
  createAccessProfile(body: Record<string, unknown>) { return this.http.post<AccessProfile>(`${U}/access-profiles`, body); }
  updateAccessProfile(key: string, body: Record<string, unknown>) { return this.http.patch<AccessProfile>(`${U}/access-profiles/${key}`, body); }
  deleteAccessProfile(key: string) { return this.http.delete(`${U}/access-profiles/${key}`); }
  team(id: number) { return this.http.get<Team>(`${U}/teams/${id}`); }
  createTeam(body: Record<string, unknown>) { return this.http.post<Team>(`${U}/teams`, body); }
  updateTeam(id: number, body: Record<string, unknown>) { return this.http.patch<Team>(`${U}/teams/${id}`, body); }
  setTeamMember(id: number, userId: number, role: string) { return this.http.put(`${U}/teams/${id}/members/${userId}`, { role }); }
  removeTeamMember(id: number, userId: number) { return this.http.delete(`${U}/teams/${id}/members/${userId}`); }
  teamDashboard(id: number, kind: 'team' | 'sector' = 'team') { return this.http.get<TeamDashboard>(`${U}/dashboard/${kind}/${id}`); }
  directory() { return this.http.get<Person[]>(`${U}/users/directory`); }
  updateMe(body: Record<string, unknown>) { return this.http.patch<User>(`${U}/users/me`, body); }
  uploadMyAvatar(image: string) { return this.http.post<User>(`${U}/users/me/avatar`, { image }); }
  deleteMyAvatar() { return this.http.delete<User>(`${U}/users/me/avatar`); }
  users() { return this.http.get<(User & { last_login_at: string | null })[]>(`${U}/users`); }
  createUser(body: Record<string, unknown>) { return this.http.post<User>(`${U}/users`, body); }
  updateUser(id: number, body: Record<string, unknown>) { return this.http.patch<User>(`${U}/users/${id}`, body); }
  uploadUserAvatar(id: number, image: string) { return this.http.post<User>(`${U}/users/${id}/avatar`, { image }); }
  deleteUserAvatar(id: number) { return this.http.delete<User>(`${U}/users/${id}/avatar`); }
  deleteUser(id: number) { return this.http.delete(`${U}/users/${id}`); }
  resetPassword(id: number, password: string) { return this.http.post(`${U}/users/${id}/reset-password`, { password }); }
  syncDirectory() {
    return this.http.post<{ created: number; updated: number; deactivated: number; skipped: number }>(`${U}/users/sync-directory`, {});
  }

  search(q: string) { return this.http.get<{ tasks: Task[]; projects: Project[]; people: Person[] }>(`${U}/search`, { params: this.params({ q }) }); }
}

// Mensagem legível de um erro HTTP.
export function errorMessage(err: any, fallback = 'Não foi possível concluir a ação.'): string {
  if (err?.status === 0) return 'Sem conexão com o servidor. Verifique a rede e tente de novo.';
  return err?.error?.message || fallback;
}
