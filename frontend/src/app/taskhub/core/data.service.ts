import { Injectable, signal } from '@angular/core';
import { ApiService } from './api.service';
import { Person, Project, Sector, Team } from './models';

export interface GuestWork { id: number; name: string; color: string; project_id: number; team_id: number; team_name: string; }

// Dados compartilhados pelo menu lateral, seletores e captura rápida.
@Injectable({ providedIn: 'root' })
export class DataService {
  readonly projects = signal<Project[]>([]);
  readonly teams = signal<Team[]>([]);
  readonly sectors = signal<Sector[]>([]);
  readonly creatableSectors = signal<number[]>([]);
  readonly people = signal<Person[]>([]);
  readonly unread = signal(0);
  readonly guestWorks = signal<GuestWork[]>([]);
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(private api: ApiService) {}

  start() {
    this.reloadProjects();
    this.reloadTeams();
    this.api.directory().subscribe(p => this.people.set(p));
    this.pollInbox();
    if (!this.timer) this.timer = setInterval(() => this.pollInbox(), 60_000);
  }

  stop() { if (this.timer) clearInterval(this.timer); this.timer = null; }

  reloadProjects() {
    this.api.projects().subscribe(p => this.projects.set(p));
    this.api.guestWorks().subscribe({ next: w => this.guestWorks.set(w), error: () => {} });
  }
  reloadTeams() {
    this.api.teams().subscribe(r => { this.teams.set(r.teams); this.creatableSectors.set(r.creatable_sectors); });
    this.api.sectors().subscribe(s => this.sectors.set(s));
  }
  pollInbox() { this.api.inboxCount().subscribe({ next: r => this.unread.set(r.unread), error: () => {} }); }

  editableProjects(space?: 'profissional' | 'pessoal') {
    return this.projects().filter(p => (p.my_role === 'edit' || p.my_role === 'manage') && (!space || p.space === space));
  }
}
