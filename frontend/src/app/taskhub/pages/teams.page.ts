import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { ApiService, errorMessage } from '../core/api.service';
import { AuthService } from '../core/auth.service';
import { DataService } from '../core/data.service';
import { ToastService } from '../core/toast.service';
import { Team } from '../core/models';
import { AutofocusDirective, AvatarComponent, EmptyComponent, IconComponent } from '../shared/ui';

@Component({
  selector: 'app-teams',
  standalone: true,
  imports: [FormsModule, RouterLink, AutofocusDirective, AvatarComponent, IconComponent, EmptyComponent],
  template: `
    <div class="page">
      <div class="page-head">
        <div><h1>Equipes</h1><div class="sub">Cada equipe pertence a um setor. Gestores do setor e quem tem o acesso "Criar equipes" montam as suas.</div></div>
        @if (data.creatableSectors().length) {
          <div class="actions"><button class="btn btn-primary btn-sm" (click)="openNew()"><app-icon name="plus" [size]="14" />Nova equipe</button></div>
        }
      </div>

      <div style="display:grid;grid-template-columns:minmax(220px,300px) 1fr;gap:28px;align-items:start">
        <div>
          @for (g of grouped(); track g.sector) {
            <div class="team-name" style="padding:12px 8px 4px">{{ g.sector }}</div>
            <div class="tlist">
              @for (t of g.teams; track t.id) {
                <div class="trow" [class.selected]="selected()?.id === t.id" (click)="select(t.id)">
                  <span class="dot" style="width:9px;height:9px;border-radius:3px" [style.background]="t.color"></span>
                  <span class="t-title">{{ t.name }}</span>
                  <span class="muted small">{{ t.members_count }}</span>
                </div>
              }
            </div>
          } @empty {
            <app-empty title="Nenhuma equipe" [text]="data.creatableSectors().length ? 'Crie a primeira equipe do seu setor.' : 'Quando você entrar em uma equipe, ela aparece aqui.'" />
          }
        </div>

        @if (selected(); as t) {
          <div>
            <div class="row" style="margin-bottom:4px">
              <h2 style="font-size:18px">{{ t.name }}</h2>
              <span class="muted">· {{ t.sector_name }}</span>
              <span class="grow"></span>
              @if (t.can_dashboard) { <a class="btn btn-sm" [routerLink]="['/ti/taskhub/equipes', t.id]"><app-icon name="chart" [size]="14" />Painel</a> }
              @if (t.can_edit) {
                <button class="btn btn-sm" (click)="openEdit(t)">Editar</button>
                <button class="btn btn-sm btn-danger" (click)="remove(t)">Excluir</button>
              }
            </div>
            @if (t.description) { <p class="muted" style="margin-bottom:12px">{{ t.description }}</p> }

            <div class="block-title" style="margin-top:16px">Gestores da equipe</div>
            <div class="row" style="flex-wrap:wrap;gap:6px;margin:6px 0 4px">
              @for (m of t.managers || []; track m.id) {
                <span class="pill"><app-avatar [person]="m" />{{ m.name }}
                  @if (t.can_edit && (t.managers?.length || 0) > 1) { <button (click)="removeManager(m.id)" [attr.aria-label]="'Remover ' + m.name"><app-icon name="x" [size]="12" /></button> }</span>
              }
              @if (t.can_edit) {
                <select #mg class="select" style="width:220px;height:28px" (change)="addManager(+mg.value); mg.value = ''" aria-label="Adicionar gestor">
                  <option value="">Adicionar gestor…</option>
                  @for (p of managerCandidates(); track p.id) { <option [value]="p.id">{{ p.name }}</option> }
                </select>
              }
            </div>

            <div class="block-title" style="margin-top:18px">Membros</div>
            <table class="table">
              <thead><tr><th>Pessoa</th><th>Cargo</th><th>Capacidade diária</th><th></th></tr></thead>
              <tbody>
                @for (m of t.members || []; track m.id) {
                  <tr>
                    <td><div class="row"><app-avatar [person]="m" />{{ m.name }} @if (m.is_manager) { <span class="muted small">gestor</span> }</div></td>
                    <td class="muted">{{ m.job_title }}</td>
                    <td class="muted">{{ m.daily_capacity_min / 60 }} h</td>
                    <td class="num">@if (t.can_edit) { <button class="btn btn-ghost btn-sm btn-icon" (click)="removeMember(m.id)" aria-label="Tirar da equipe"><app-icon name="x" [size]="14" /></button> }</td>
                  </tr>
                }
              </tbody>
            </table>
            @if (!(t.members || []).length) { <div class="muted small" style="padding:10px 8px">Nenhum membro ainda.</div> }
            @if (t.can_edit) {
              <div class="mini-form" style="max-width:520px">
                <select class="select" [(ngModel)]="newMember" aria-label="Pessoa">
                  <option [ngValue]="null">Adicionar pessoa do setor {{ t.sector_name }}</option>
                  @for (u of memberCandidates(); track u.id) { <option [ngValue]="u.id">{{ u.name }}{{ u.team_name ? ' · hoje em ' + u.team_name : '' }}</option> }
                </select>
                <button class="btn btn-sm" [disabled]="!newMember" (click)="addMember()">Adicionar</button>
              </div>
              <div class="muted small" style="margin-top:6px">Aparecem as pessoas do setor. Cada pessoa fica em uma equipe; adicionar aqui tira a pessoa da equipe anterior.</div>
            }

            <div class="block-title" style="margin-top:22px">Projetos da equipe que você vê</div>
            <div class="tlist">
              @for (p of teamProjects(); track p.id) {
                <a class="trow" [routerLink]="['/ti/taskhub/projetos', p.id]">
                  <span class="dot" style="width:8px;height:8px;border-radius:3px" [style.background]="p.color"></span>
                  <span class="t-title">{{ p.name }}</span>
                  <span class="muted small">{{ p.open_count }} abertas</span>
                </a>
              } @empty { <div class="muted small" style="padding:10px 8px">Nenhum projeto visível para você.</div> }
            </div>
          </div>
        }
      </div>
    </div>

    @if (form) {
      <div class="modal-scrim" (click)="form = null">
        <div class="modal" (click)="$event.stopPropagation()">
          <div class="modal-head">{{ form.id ? 'Editar equipe' : 'Nova equipe' }}</div>
          <div class="modal-body">
            <div class="field"><label for="tn">Nome</label><input id="tn" class="input" appAutofocus [(ngModel)]="form.name" placeholder="Ex.: Contas a pagar" /></div>
            @if (!form.id) {
              <div class="field"><label for="ts">Setor</label>
                <select id="ts" class="select" [(ngModel)]="form.sector_id">
                  @for (s of creatable(); track s.id) { <option [ngValue]="s.id">{{ s.name }}</option> }
                </select></div>
            }
            <div class="field"><label for="td">Descrição</label><input id="td" class="input" [(ngModel)]="form.description" /></div>
            @if (!form.id) { <span class="muted small">Você será gestor da equipe e poderá incluir outros gestores e os membros do setor.</span> }
            @if (error()) { <div class="error-text">{{ error() }}</div> }
          </div>
          <div class="modal-foot"><button class="btn btn-ghost" (click)="form = null">Cancelar</button>
            <button class="btn btn-primary" [disabled]="!form.name?.trim() || (!form.id && !form.sector_id)" (click)="save()">{{ form.id ? 'Salvar' : 'Criar equipe' }}</button></div>
        </div>
      </div>
    }
  `,
})
export class TeamsPage implements OnInit {
  auth = inject(AuthService);
  data = inject(DataService);
  private api = inject(ApiService);
  private toast = inject(ToastService);
  private route = inject(ActivatedRoute);
  selected = signal<Team | null>(null);
  error = signal('');
  form: any = null;
  newMember: number | null = null;

  grouped = computed(() => {
    const map = new Map<string, Team[]>();
    for (const t of this.data.teams()) {
      const k = t.sector_name || 'Sem setor';
      map.set(k, [...(map.get(k) || []), t]);
    }
    return [...map.entries()].map(([sector, teams]) => ({ sector, teams }));
  });
  creatable = computed(() => this.data.sectors().filter(s => this.data.creatableSectors().includes(s.id)));
  teamProjects = computed(() => this.data.projects().filter(p => p.team_id === this.selected()?.id && p.space === 'profissional'));
  memberCandidates = computed(() => {
    const t = this.selected(); if (!t) return [];
    const ids = new Set((t.members || []).map(m => m.id));
    return this.data.people().filter(p => p.from_directory && p.sector_id === t.sector_id && !ids.has(p.id));
  });
  managerCandidates = computed(() => {
    const t = this.selected(); if (!t) return [];
    const ids = new Set((t.managers || []).map(m => m.id));
    return this.data.people().filter(p => !ids.has(p.id) && p.sector_id === t.sector_id);
  });

  ngOnInit() {
    const q = Number(this.route.snapshot.queryParamMap.get('equipe'));
    if (q) this.select(q);
    else this.api.teams().subscribe(r => { if (r.teams[0]) this.select(r.teams[0].id); });
  }

  select(id: number) { this.api.team(id).subscribe({ next: t => this.selected.set(t), error: e => this.toast.error(errorMessage(e)) }); }
  private reload() { const t = this.selected(); if (t) this.select(t.id); this.data.reloadTeams(); this.data.start(); }

  openNew() { this.error.set(''); this.form = { name: '', description: '', sector_id: this.creatable()[0]?.id ?? null }; }
  openEdit(t: Team) { this.error.set(''); this.form = { id: t.id, name: t.name, description: t.description }; }

  save() {
    const f = this.form;
    const req = f.id ? this.api.updateTeam(f.id, { name: f.name.trim(), description: f.description }) : this.api.createTeam({ name: f.name.trim(), description: f.description, sector_id: f.sector_id });
    req.subscribe({
      next: t => { this.form = null; this.data.reloadTeams(); this.select(t.id); this.toast.show(f.id ? 'Equipe atualizada.' : 'Equipe criada.'); },
      error: e => this.error.set(errorMessage(e)),
    });
  }

  remove(t: Team) {
    if (!confirm(`Excluir a equipe ${t.name}? As pessoas continuam no setor, só saem da equipe.`)) return;
    this.api.deleteTeam(t.id).subscribe({
      next: () => { this.selected.set(null); this.data.reloadTeams(); this.toast.show('Equipe excluída.'); },
      error: e => this.toast.error(errorMessage(e)),
    });
  }

  addMember() {
    if (!this.newMember) return;
    const person = this.data.people().find(p => p.id === this.newMember);
    if (person?.team_name && !confirm(`${person.name} sairá da equipe ${person.team_name}. Continuar?`)) return;
    this.api.setTeamMember(this.selected()!.id, this.newMember, 'membro').subscribe({
      next: () => { this.newMember = null; this.reload(); }, error: e => this.toast.error(errorMessage(e)),
    });
  }
  removeMember(userId: number) { this.api.removeTeamMember(this.selected()!.id, userId).subscribe({ next: () => this.reload(), error: e => this.toast.error(errorMessage(e)) }); }
  addManager(userId: number) { if (userId) this.api.setTeamManager(this.selected()!.id, userId).subscribe({ next: () => this.reload(), error: e => this.toast.error(errorMessage(e)) }); }
  removeManager(userId: number) { this.api.removeTeamManager(this.selected()!.id, userId).subscribe({ next: () => this.reload(), error: e => this.toast.error(errorMessage(e)) }); }
}
