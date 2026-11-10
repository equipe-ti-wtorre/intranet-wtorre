import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { forkJoin } from 'rxjs';
import { ApiService, errorMessage } from '../core/api.service';
import { AuthService } from '../core/auth.service';
import { DataService } from '../core/data.service';
import { ToastService } from '../core/toast.service';
import { Person, Team } from '../core/models';
import { AutofocusDirective, AvatarComponent, EmptyComponent, IconComponent } from '../shared/ui';
import { ConfirmDeleteComponent } from '../shared/confirm-delete.component';
import { PersonPickerComponent } from '../shared/person-picker.component';

@Component({
  selector: 'app-teams',
  standalone: true,
  imports: [FormsModule, RouterLink, AutofocusDirective, AvatarComponent, IconComponent, EmptyComponent, ConfirmDeleteComponent, PersonPickerComponent],
  template: `
    <div class="page">
      <div class="page-head">
        <div><h1>Equipes</h1><div class="sub">Cada equipe pertence a um setor. Gestores do setor e quem tem o acesso "Criar equipes" montam as suas.</div></div>
        @if (data.creatableSectors().length) {
          <div class="actions"><button class="btn btn-primary btn-sm" (click)="openNew()"><app-icon name="plus" [size]="14" />Nova equipe</button></div>
        }
      </div>

      <div class="teams-split">
        <div>
          @for (g of grouped(); track g.sector) {
            <div class="team-name" style="padding:12px 8px 4px">{{ g.sector }}</div>
            <div class="tlist">
              @for (t of g.teams; track t.id) {
                <div class="trow" [class.selected]="selected()?.id === t.id" (click)="select(t.id)">
                  <span class="dot" style="width:9px;height:9px;border-radius:3px" [style.background]="t.color"></span>
                  <span class="t-title">{{ t.name }}</span>
                  <span class="muted small" [title]="countTitle(t)">{{ t.people_count ?? t.members_count }}</span>
                </div>
              }
            </div>
          } @empty {
            <app-empty title="Nenhuma equipe" [text]="data.creatableSectors().length ? 'Crie a primeira equipe do seu setor.' : 'Quando você entrar em uma equipe, ela aparece aqui.'" />
          }
        </div>

        @if (selected(); as t) {
          <div class="teams-detail">
            <div class="row" style="margin-bottom:4px;flex-wrap:wrap">
              <h2 style="font-size:18px">{{ t.name }}</h2>
              <span class="muted">· {{ t.sector_name }}</span>
              <span class="grow"></span>
              <a class="btn btn-sm" [routerLink]="['/ti/taskhub/kanban/equipes', t.id]"><app-icon name="board" [size]="14" />Projetos</a>
              @if (t.can_panel) { <a class="btn btn-sm" [routerLink]="['/ti/taskhub/painel/equipes', t.id]"><app-icon name="chart" [size]="14" />Painel</a> }
              @if (t.can_edit) {
                <button class="btn btn-sm" (click)="openEdit(t)">Editar</button>
                <button class="btn btn-sm btn-danger" (click)="deleting.set(t)">Excluir</button>
              }
            </div>
            <div class="muted small team-counts">{{ countLine(t) }}</div>
            @if (t.description) { <p class="muted" style="margin-bottom:12px">{{ t.description }}</p> }

            <section class="team-block">
              <h3 class="team-block__title">Quem gerencia</h3>

              <div class="team-block__sub">Gestores da equipe</div>
              <div class="muted small">Veem e editam todos os projetos e tarefas desta equipe.</div>
              <div class="row" style="flex-wrap:wrap;gap:6px;margin:8px 0 4px">
                @for (m of t.managers || []; track m.id) {
                  <span class="pill"><app-avatar [person]="m" />{{ m.name }}
                    @if (t.can_edit && (t.managers?.length || 0) > 1) { <button (click)="removeManager(m.id)" [attr.aria-label]="'Remover ' + m.name"><app-icon name="x" [size]="12" /></button> }</span>
                }
                @if (t.can_edit) {
                  <app-person-picker class="pp-toolbar" [people]="managerCandidates()" placeholder="Adicionar gestor…" (picked)="addManager($event ?? 0)" />
                }
              </div>

              @if (t.sector_managers?.length) {
                <div class="team-block__sub" style="margin-top:14px">Gestores do setor {{ t.sector_name }}</div>
                <div class="muted small">Mandam em todas as equipes do setor. Para mudar, use Administração › Setores.</div>
                <div class="row" style="flex-wrap:wrap;gap:6px;margin:8px 0 4px">
                  @for (m of t.sector_managers; track m.id) {
                    <span class="pill"><app-avatar [person]="m" />{{ m.name }}</span>
                  }
                </div>
              }
            </section>

            <section class="team-block">
              <h3 class="team-block__title">Quem trabalha</h3>
              <div class="muted small">Veem só os projetos em que estão e as próprias tarefas. Podem ser escolhidos como responsáveis.</div>
              @if (t.can_edit && managersOutside().length) {
                <button type="button" class="btn btn-ghost btn-sm" style="margin-top:6px" (click)="addManagersAsMembers()">
                  <app-icon name="plus" [size]="14" />Incluir os gestores como membros ({{ managersOutside().length }})
                </button>
              }
            <div class="table-scroll"><table class="table">
              <thead><tr><th>Pessoa</th><th>Cargo</th><th></th></tr></thead>
              <tbody>
                @for (m of t.members || []; track m.id) {
                  <tr>
                    <td><div class="row"><app-avatar [person]="m" />{{ m.name }} @if (m.is_manager) { <span class="muted small">também gestor</span> }</div></td>
                    <td class="muted">{{ m.job_title }}</td>
                    <td class="num">@if (t.can_edit) { <button class="btn btn-ghost btn-sm btn-icon" (click)="removeMember(m.id)" aria-label="Tirar da equipe"><app-icon name="x" [size]="14" /></button> }</td>
                  </tr>
                }
              </tbody>
            </table></div>
            @if (!(t.members || []).length) { <div class="muted small" style="padding:10px 8px">Nenhum membro ainda.</div> }
            @if (t.can_edit) {
              <div class="mini-form" style="max-width:520px">
                <app-person-picker class="grow" [people]="memberCandidates()" [placeholder]="'Adicionar pessoa do setor ' + t.sector_name + '…'"
                                   [subOf]="alsoIn" (picked)="addMember($event)" />
              </div>
              <div class="muted small" style="margin-top:6px">Aparecem as pessoas do setor. A mesma pessoa pode estar em várias equipes.</div>
            }
            </section>

            <h3 class="team-block__title team-block">Projetos da equipe</h3>
            <div class="tlist">
              <a class="trow" [routerLink]="['/ti/taskhub/kanban/equipes', t.id]">
                <span class="dot" style="width:8px;height:8px;border-radius:3px" [style.background]="t.color"></span>
                <span class="t-title">Abrir o quadro de projetos</span>
                <span class="muted small">{{ t.projects_count || 0 }} {{ t.projects_count === 1 ? 'projeto em andamento' : 'projetos em andamento' }}</span>
              </a>
              @for (p of teamProjects(); track p.id) {
                <a class="trow" [routerLink]="['/ti/taskhub/projetos', p.id]">
                  <span class="dot" style="width:8px;height:8px;border-radius:3px" [style.background]="p.color"></span>
                  <span class="t-title">{{ p.name }} <span class="muted small">· projeto antigo</span></span>
                  <span class="muted small">{{ p.open_count }} abertas</span>
                </a>
              }
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

    @if (deleting(); as t) {
      <app-confirm-delete title="Excluir equipe" [name]="t.name" [busy]="removing()"
                          [message]="'A equipe ' + t.name + ' e os ' + (t.projects_count || 0) + ' projetos dela, com todas as tarefas, serão apagados. As pessoas continuam no setor.'"
                          (cancel)="deleting.set(null)" (confirm)="remove(t)" />
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
  grouped = computed(() => {
    const map = new Map<string, Team[]>();
    for (const t of this.data.teams()) {
      const k = t.sector_name || 'Sem setor';
      map.set(k, [...(map.get(k) || []), t]);
    }
    return [...map.entries()].map(([sector, teams]) => ({ sector, teams }));
  });
  creatable = computed(() => this.data.sectors().filter(s => this.data.creatableSectors().includes(s.id)));
  teamProjects = computed(() => this.data.projects().filter(p => p.team_id === this.selected()?.id && p.space === 'profissional' && !p.is_board));
  deleting = signal<Team | null>(null);
  removing = signal(false);
  memberCandidates = computed(() => {
    const t = this.selected(); if (!t) return [];
    const ids = new Set((t.members || []).map(m => m.id));
    return this.data.people().filter(p => p.sector_id === t.sector_id && !ids.has(p.id));
  });
  managerCandidates = computed(() => {
    const t = this.selected(); if (!t) return [];
    const ids = new Set((t.managers || []).map(m => m.id));
    return this.data.people().filter(p => !ids.has(p.id) && p.sector_id === t.sector_id);
  });

  ngOnInit() {
    const q = Number(this.route.snapshot.queryParamMap.get('equipe'));
    const nova = Number(this.route.snapshot.queryParamMap.get('nova'));
    if (nova) { this.openNew(); this.form.sector_id = nova; }
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
    this.removing.set(true);
    this.api.deleteTeam(t.id).subscribe({
      next: () => {
        this.removing.set(false); this.deleting.set(null); this.selected.set(null);
        this.data.reloadTeams(); this.data.reloadProjects(); this.toast.show('Equipe excluída.');
      },
      error: e => { this.removing.set(false); this.toast.error(errorMessage(e)); },
    });
  }

  managersOutside = computed(() => {
    const t = this.selected(); if (!t) return [];
    const members = new Set((t.members || []).map(m => m.id));
    return (t.managers || []).filter(m => !members.has(m.id));
  });
  addManagersAsMembers() {
    const t = this.selected(); const list = this.managersOutside();
    if (!t || !list.length) return;
    forkJoin(list.map(m => this.api.setTeamMember(t.id, m.id, 'membro'))).subscribe({
      next: () => { this.reload(); this.toast.show(list.length === 1 ? 'Gestor incluído como membro.' : 'Gestores incluídos como membros.'); },
      error: e => { this.toast.error(errorMessage(e)); this.reload(); },
    });
  }
  countLine(t: Team) {
    const g = t.managers?.length || 0; const m = t.members?.length ?? t.members_count ?? 0; const p = t.projects_count || 0;
    return `${g} ${g === 1 ? 'gestor' : 'gestores'} · ${m} ${m === 1 ? 'membro' : 'membros'} · ${p} ${p === 1 ? 'projeto em andamento' : 'projetos em andamento'}`;
  }
  countTitle(t: Team) {
    const g = t.managers?.length || 0; const m = t.members_count || 0;
    return `${g} ${g === 1 ? 'gestor' : 'gestores'} · ${m} ${m === 1 ? 'membro' : 'membros'}`;
  }

  alsoIn = (p: Person) => [p.team_name ? `também em ${p.team_name}` : '', p.department || ''].filter(Boolean).join(' · ');
  addMember(userId: number | null) {
    if (!userId) return;
    this.api.setTeamMember(this.selected()!.id, userId, 'membro').subscribe({
      next: () => this.reload(), error: e => this.toast.error(errorMessage(e)),
    });
  }
  removeMember(userId: number) { this.api.removeTeamMember(this.selected()!.id, userId).subscribe({ next: () => this.reload(), error: e => this.toast.error(errorMessage(e)) }); }
  addManager(userId: number) { if (userId) this.api.setTeamManager(this.selected()!.id, userId).subscribe({ next: () => this.reload(), error: e => this.toast.error(errorMessage(e)) }); }
  removeManager(userId: number) { this.api.removeTeamManager(this.selected()!.id, userId).subscribe({ next: () => this.reload(), error: e => this.toast.error(errorMessage(e)) }); }
}
