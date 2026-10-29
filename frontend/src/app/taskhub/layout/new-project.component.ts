import { Component, computed, effect, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { ApiService, errorMessage } from '../core/api.service';
import { DataService } from '../core/data.service';
import { UiService } from '../core/ui.service';
import { ToastService } from '../core/toast.service';
import { AuthService } from '../core/auth.service';
import { AutofocusDirective, AvatarComponent, IconComponent } from '../shared/ui';

const COLORS = ['#c9a84c', '#4c8dff', '#2fbf71', '#a78bfa', '#f97316', '#14b8a6', '#ec4899', '#e5534b'];

@Component({
  selector: 'app-new-project',
  standalone: true,
  imports: [FormsModule, AutofocusDirective, AvatarComponent, IconComponent],
  template: `
    <div class="modal-scrim" (click)="close()">
      <div class="modal" (click)="$event.stopPropagation()" role="dialog" aria-label="Novo projeto">
        <div class="modal-head">{{ space === 'pessoal' ? 'Novo projeto individual' : 'Novo projeto corporativo' }}</div>
        <div class="modal-body">
          <div class="field"><label for="np-n">Nome</label>
            <input id="np-n" class="input" appAutofocus [(ngModel)]="name" placeholder="Ex.: Implantação do novo ERP" /></div>
          <div class="fields">
            <div class="field"><label for="np-s">Início</label><input id="np-s" type="date" class="input" [(ngModel)]="start" /></div>
            <div class="field"><label for="np-e">Entrega</label><input id="np-e" type="date" class="input" [(ngModel)]="end" /></div>
          </div>

          @if (space === 'pessoal') {
            <div class="note-info" style="margin-top:0">Projeto individual: só você vê. Não aparece para o gestor nem no painel da equipe.</div>
          } @else {
          <div class="field"><label for="np-sec">Setor</label>
            <select id="np-sec" class="select" [ngModel]="sectorId()" (ngModelChange)="sectorId.set($event ? +$event : null)">
              @if (managedSectors().length !== 1) { <option [ngValue]="null">Escolha o setor</option> }
              @for (s of managedSectors(); track s.id) { <option [ngValue]="s.id">{{ s.name }}</option> }
            </select>
          </div>
          @if (!managedSectors().length) {
            <div class="note-info" style="margin-top:0">Você ainda não gerencia um setor.</div>
          }
          @if (sectorId() && sectorTeams().length > 1) {
            <div class="field"><label for="np-t">Equipe</label>
              <select id="np-t" class="select" [ngModel]="teamId()" (ngModelChange)="teamId.set(+$event)">
                @for (t of sectorTeams(); track t.id) { <option [ngValue]="t.id">{{ t.name }}</option> }
              </select>
            </div>
          }
          @if (sectorId() && !sectorTeams().length) {
            <div class="note-info" style="margin-top:0">Este setor ainda não tem equipe.</div>
          }
          <div class="field"><label>Quem participa</label>
            <div class="row" style="flex-wrap:wrap;gap:6px">
              <span class="pill"><app-avatar [person]="auth.user()" />Você (dono)</span>
              @for (m of chosen(); track m.id) {
                <span class="pill"><app-avatar [person]="m" />{{ m.name }}
                  @if (m.can_coordinate) {
                    <select class="inline" style="height:20px;font-size:12px" [ngModel]="roles[m.id] || 'leitor'" (ngModelChange)="roles[m.id] = $event" aria-label="Papel">
                      <option value="leitor">Colaborador</option><option value="editor">Coordena</option>
                    </select>
                  }
                  <button type="button" (click)="remove(m.id)" [attr.aria-label]="'Remover ' + m.name"><app-icon name="x" [size]="12" /></button></span>
              }
            </div>
            <select #pick class="select" (change)="add(+pick.value); pick.value = ''" aria-label="Incluir pessoa">
              <option value="" selected>Incluir pessoa…</option>
              @for (p of available(); track p.id) { <option [value]="p.id">{{ p.name }}{{ p.team_name ? ' · ' + p.team_name : '' }}</option> }
            </select>
            <span class="hint"><b>Colaborador</b> vê o projeto e atualiza as tarefas que estão com ele. <b>Coordena</b> (outro gestor) também cria e edita tarefas. Para alguém participar só de uma tarefa, basta atribuí-la a ele.</span>
          </div>
          }

          <div class="field"><label>Cor</label>
            <div class="row">@for (c of colors; track c) {
              <button type="button" (click)="color = c" [attr.aria-label]="'Cor ' + c"
                [style.background]="c" style="width:24px;height:24px;border-radius:6px;outline-offset:2px"
                [style.outline]="color === c ? '2px solid var(--tx)' : 'none'"></button>
            }</div>
          </div>
          <div class="field"><label for="np-d">Objetivo</label>
            <textarea id="np-d" class="textarea" style="min-height:70px" [(ngModel)]="description" placeholder="O que este projeto entrega e para quem."></textarea></div>
          @if (error()) { <div class="error-text">{{ error() }}</div> }
        </div>
        <div class="modal-foot">
          <button class="btn btn-ghost" (click)="close()">Cancelar</button>
          <button class="btn btn-primary" [disabled]="!name.trim() || saving() || !canSave()" (click)="save()">Criar projeto</button>
        </div>
      </div>
    </div>
  `,
})
export class NewProjectComponent {
  private api = inject(ApiService);
  private data = inject(DataService);
  private ui = inject(UiService);
  private router = inject(Router);
  private toast = inject(ToastService);
  auth = inject(AuthService);

  colors = COLORS;
  name = ''; description = ''; color = COLORS[0];
  space: 'profissional' | 'pessoal' = this.ui.newProjectOpen() || 'pessoal';
  roles: Record<number, string> = {};
  start: string | null = null; end: string | null = null;
  ids = signal<number[]>([]);
  sectorId = signal<number | null>(this.ui.newProjectSectorId());
  teamId = signal<number | null>(null);
  saving = signal(false);
  error = signal('');
  managedSectors = computed(() => this.data.sectors().filter(s => s.can_dashboard));
  sectorTeams = computed(() => {
    const id = this.sectorId();
    return id ? this.data.teams().filter(t => t.sector_id === id) : [];
  });

  constructor() {
    effect(() => {
      if (this.space !== 'profissional') return;
      const managed = this.managedSectors();
      const current = this.sectorId();
      if (!current && managed.length === 1) this.sectorId.set(managed[0].id);
      const teams = this.sectorTeams();
      const team = this.teamId();
      if (team && teams.some(t => t.id === team)) return;
      const mine = this.auth.user()?.team_id;
      this.teamId.set(mine && teams.some(t => t.id === mine) ? mine : teams[0]?.id ?? null);
    }, { allowSignalWrites: true });
  }

  chosen = computed(() => this.ids().map(id => this.data.people().find(p => p.id === id)!).filter(Boolean));
  available = computed(() => this.data.people().filter(p => p.id !== this.auth.user()?.id && !this.ids().includes(p.id)));

  add(id: number | null) { if (id) this.ids.update(l => [...l, id]); }
  remove(id: number) { this.ids.update(l => l.filter(x => x !== id)); }
  close() { this.ui.closeNewProject(); }
  canSave() { return this.space === 'pessoal' || !!this.teamId(); }

  save() {
    if (!this.name.trim() || !this.canSave()) return;
    this.saving.set(true);
    this.api.createProject({
      name: this.name.trim(), description: this.description, color: this.color, space: this.space,
      start_date: this.start || null, end_date: this.end || null,
      ...(this.space === 'profissional' && this.teamId() ? { team_id: this.teamId() } : {}),
      members: this.space === 'pessoal' ? [] : this.ids().map(user_id => {
        const person = this.data.people().find(p => p.id === user_id);
        const role = person?.can_coordinate && this.roles[user_id] === 'editor' ? 'editor' : 'leitor';
        return { user_id, role };
      }),
    }).subscribe({
      next: p => { this.data.reloadProjects(); this.close(); this.toast.show('Projeto criado.'); this.router.navigate(['/ti/taskhub/projetos', p.id]); },
      error: e => { this.saving.set(false); this.error.set(errorMessage(e)); },
    });
  }
}
