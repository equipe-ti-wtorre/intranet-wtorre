import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { ApiService, errorMessage } from '../core/api.service';
import { DataService } from '../core/data.service';
import { ToastService } from '../core/toast.service';
import { AccessProfile, Permission, Sector } from '../core/models';
import { AutofocusDirective, AvatarComponent, IconComponent } from '../shared/ui';
import { UsersPage } from './users.page';

const COLORS = ['#3b82f6', '#2fbf71', '#c9a84c', '#a78bfa', '#f97316', '#14b8a6', '#ec4899', '#e5534b'];

@Component({
  selector: 'app-admin',
  standalone: true,
  imports: [FormsModule, RouterLink, AutofocusDirective, AvatarComponent, IconComponent, UsersPage],
  template: `
    <div class="page">
      <div class="page-head"><div><h1>Administração</h1><div class="sub">Setores da empresa, pessoas, perfis de acesso e login Microsoft.</div></div></div>
      <nav class="tabs">
        <button [class.active]="tab() === 'setores'" (click)="tab.set('setores')">Setores</button>
        <button [class.active]="tab() === 'pessoas'" (click)="tab.set('pessoas')">Pessoas</button>
        <button [class.active]="tab() === 'perfis'" (click)="tab.set('perfis')">Perfis de acesso</button>
        <button [class.active]="tab() === 'microsoft'" (click)="tab.set('microsoft')">Microsoft</button>
      </nav>

      @if (tab() === 'setores') {
        <div class="toolbar">
          <span class="muted small grow">O administrador cria os setores e escolhe gestores com o perfil Gestor. Eles criam as equipes dentro do setor.</span>
          <button class="btn btn-primary btn-sm" (click)="newSector()"><app-icon name="plus" [size]="14" />Novo setor</button>
        </div>
        <div class="table-scroll"><table class="table">
          <thead><tr><th>Setor</th><th>Gestores do setor</th><th class="num">Equipes</th><th class="num">Pessoas</th><th></th></tr></thead>
          <tbody>
            @for (s of sectors(); track s.id) {
              <tr class="click" (click)="editSector(s)">
                <td><div class="row"><span class="dot" style="width:9px;height:9px;border-radius:3px" [style.background]="s.color"></span><b>{{ s.name }}</b></div>
                  @if (s.description) { <div class="muted small">{{ s.description }}</div> }</td>
                <td><div class="row" style="flex-wrap:wrap;gap:4px">@for (m of s.managers; track m.id) { <span class="pill"><app-avatar [person]="m" />{{ m.name }}</span> } @empty { <span class="muted small">Nenhum</span> }</div></td>
                <td class="num">{{ s.teams_count }}</td>
                <td class="num">{{ s.people_count }}</td>
                <td class="num" style="white-space:nowrap">
                  @if (s.can_dashboard) { <a class="btn btn-ghost btn-sm" [routerLink]="['/ti/taskhub/setores', s.id]" (click)="$event.stopPropagation()">Painel</a> }
                  <button class="btn btn-ghost btn-sm" (click)="$event.stopPropagation(); editSector(s)">Editar</button>
                </td>
              </tr>
            }
          </tbody>
        </table></div>
      }

      @if (tab() === 'pessoas') {
        <app-users [embedded]="true" />
      }

      @if (tab() === 'perfis') {
        <div class="toolbar">
          <span class="muted small grow">Uma pessoa pode ter mais de um perfil; os acessos se somam. Os perfis padrão podem ter os acessos ajustados, mas não são excluídos.</span>
          <button class="btn btn-primary btn-sm" (click)="newProfile()"><app-icon name="plus" [size]="14" />Novo perfil</button>
        </div>
        <div class="ap-grid">
          @for (p of profiles(); track p.key) {
            <button type="button" class="ap-card" (click)="editProfile(p)">
              <div class="ap-card__top">
                <div class="grow" style="min-width:0">
                  <div class="row" style="gap:8px;flex-wrap:wrap">
                    <b>{{ p.label }}</b>
                    @if (p.system) { <span class="pill">padrão</span> }
                  </div>
                  @if (p.description) { <p class="ap-card__desc">{{ p.description }}</p> }
                </div>
                <span class="ap-card__count">{{ p.users_count }} {{ p.users_count === 1 ? 'pessoa' : 'pessoas' }}</span>
              </div>
              <div class="ap-card__perms">
                @if (p.key === 'admin') { <span class="pill">Todos</span> }
                @else if (p.permissions.length) {
                  @for (k of p.permissions; track k) { <span class="pill">{{ permLabel(k) }}</span> }
                } @else { <span class="pill">Vê o que foi incluído e organiza o Individual</span> }
              </div>
            </button>
          }
        </div>
      }

      @if (tab() === 'microsoft') {
        <div class="card" style="max-width: 720px; padding: 18px 20px">
          @if (microsoft(); as ms) {
            <div class="row" style="justify-content: space-between; margin-bottom: 12px">
              <b>Login com a conta Microsoft</b>
              <span class="pill">{{ ms.enabled ? 'Pronto' : 'Incompleto' }}</span>
            </div>
            <p class="muted small" style="margin-bottom: 14px">
              {{ ms.tenants.length ? 'Usa os tenants ativos da intranet.' : 'Nenhum tenant ativo foi encontrado.' }}
              O segredo não é exibido.
            </p>
            @for (t of ms.tenants; track t.tenantId) {
              <div class="props" style="margin-bottom: 16px">
                <div class="k">Nome</div><div class="v">{{ t.nome || '—' }} @if (t.principal) { <span class="muted small">· principal</span> }</div>
                <div class="k">Tenant</div><div class="v">{{ t.tenantId }}</div>
                <div class="k">Aplicativo</div><div class="v">{{ t.clientId }}</div>
                <div class="k">Segredo</div><div class="v">{{ t.hasSecret ? 'Cadastrado na intranet' : 'Ausente' }}</div>
              </div>
            }
            <div class="props">
              <div class="k">Retorno</div><div class="v">{{ ms.redirectUri || '—' }}</div>
            </div>
            @if (ms.redirectUri) {
              <p class="muted small" style="margin-top: 12px">Este endereço de retorno precisa estar permitido no aplicativo da Microsoft: {{ ms.redirectUri }}</p>
            }
            @if (!ms.directory) {
              <p class="muted small">Sem o segredo do aplicativo, o login pode funcionar, mas a sincronização do diretório fica indisponível.</p>
            }
          } @else {
            <div class="muted">Carregando…</div>
          }
        </div>
      }
    </div>

    @if (sectorForm) {
      <div class="modal-scrim" (click)="sectorForm = null">
        <div class="modal" (click)="$event.stopPropagation()">
          <div class="modal-head">{{ sectorForm.id ? 'Editar setor' : 'Novo setor' }}</div>
          <div class="modal-body">
            <div class="field"><label for="sn">Nome</label><input id="sn" class="input" appAutofocus [(ngModel)]="sectorForm.name" placeholder="Ex.: Financeiro" /></div>
            <div class="field"><label for="sd">Descrição</label><input id="sd" class="input" [(ngModel)]="sectorForm.description" /></div>
            <div class="field"><label>Pessoas do setor</label>
              <div class="row" style="flex-wrap:wrap;gap:6px">
                @for (p of chosenPeople(); track p.id) {
                  <span class="pill"><app-avatar [person]="p" />{{ p.name }}<button type="button" (click)="togglePerson(p.id)" [attr.aria-label]="'Remover ' + p.name"><app-icon name="x" [size]="12" /></button></span>
                }
              </div>
              <select #pp class="select" (change)="togglePerson(+pp.value); pp.value = ''" aria-label="Adicionar pessoa">
                <option value="">Adicionar pessoa…</option>
                @for (p of peopleOptions(); track p.id) { <option [value]="p.id">{{ p.name }}</option> }
              </select>
              <span class="hint">Cada pessoa fica em um setor. Quem já está em outro não aparece. Ao sair da lista, deixa este setor e as equipes dele.</span>
            </div>
            <div class="field"><label>Gestores do setor</label>
              <div class="row" style="flex-wrap:wrap;gap:6px">
                @for (m of chosenManagers(); track m.id) {
                  <span class="pill"><app-avatar [person]="m" />{{ m.name }}<button type="button" (click)="toggleManager(m.id)" [attr.aria-label]="'Remover ' + m.name"><app-icon name="x" [size]="12" /></button></span>
                }
              </div>
              <select #pk class="select" (change)="toggleManager(+pk.value); pk.value = ''" aria-label="Adicionar gestor">
                <option value="">Adicionar gestor…</option>
                @for (p of managerOptions(); track p.id) { <option [value]="p.id">{{ p.name }}</option> }
              </select>
              <span class="hint">O gestor é uma das pessoas do setor e precisa ter o perfil Gestor. Ele acompanha as equipes e cria equipes.</span>
            </div>
            <div class="field"><label>Cor</label>
              <div class="row">@for (c of colors; track c) {
                <button type="button" (click)="sectorForm.color = c" [attr.aria-label]="'Cor ' + c" [style.background]="c"
                  style="width:24px;height:24px;border-radius:6px;outline-offset:2px" [style.outline]="sectorForm.color === c ? '2px solid var(--tx)' : 'none'"></button>
              }</div></div>
            @if (error()) { <div class="error-text">{{ error() }}</div> }
          </div>
          <div class="modal-foot">
            @if (sectorForm.id) { <button class="btn btn-sm btn-danger" style="margin-right:auto" (click)="deleteSector()">Excluir setor</button> }
            <button class="btn btn-ghost" (click)="sectorForm = null">Cancelar</button>
            <button class="btn btn-primary" [disabled]="!sectorForm.name?.trim()" (click)="saveSector()">Salvar</button>
          </div>
        </div>
      </div>
    }

    @if (profileForm) {
      <div class="modal-scrim" (click)="profileForm = null">
        <div class="modal" (click)="$event.stopPropagation()">
          <div class="modal-head">{{ profileForm.key ? 'Editar perfil' : 'Novo perfil' }}</div>
          <div class="modal-body">
            <div class="field"><label for="pn">Nome</label><input id="pn" class="input" appAutofocus [(ngModel)]="profileForm.label" placeholder="Ex.: Coordenador" /></div>
            <div class="field"><label for="pd">Descrição</label>
              <textarea id="pd" class="textarea" style="min-height:72px" [(ngModel)]="profileForm.description" placeholder="O que esta pessoa vê e pode fazer."></textarea>
            </div>
            <div class="section-label">Acessos</div>
            @if (profileForm.key === 'admin') {
              <div class="note-info" style="margin-top:0">O Administrador cadastra pessoas, setores e perfis, e não vê o trabalho dos setores.</div>
            } @else {
              <div class="ap-perms">
                @for (perm of assignablePerms(); track perm.key) {
                  <label class="ap-perm" [class.on]="profileForm.permissions.includes(perm.key)">
                    <span class="grow">
                      <b>{{ perm.label }}</b>
                      <span class="muted small">{{ perm.hint }}</span>
                    </span>
                    <input type="checkbox" class="switch" [checked]="profileForm.permissions.includes(perm.key)" (change)="togglePerm(perm.key)" [attr.aria-label]="perm.label" />
                  </label>
                }
              </div>
            }
            @if (error()) { <div class="error-text">{{ error() }}</div> }
          </div>
          <div class="modal-foot">
            @if (profileForm.key && !profileForm.system) { <button class="btn btn-sm btn-danger" style="margin-right:auto" (click)="deleteProfile()">Excluir perfil</button> }
            <button class="btn btn-ghost" (click)="profileForm = null">Cancelar</button>
            <button class="btn btn-primary" [disabled]="!profileForm.label?.trim()" (click)="saveProfile()">Salvar</button>
          </div>
        </div>
      </div>
    }
  `,
})
export class AdminPage implements OnInit {
  private api = inject(ApiService);
  private toast = inject(ToastService);
  data = inject(DataService);
  private route = inject(ActivatedRoute);
  tab = signal<'setores' | 'pessoas' | 'perfis' | 'microsoft'>('setores');
  microsoft = signal<{
    enabled: boolean; directory: boolean; redirectUri: string;
    tenants: { nome: string; tenantId: string; clientId: string; hasSecret: boolean; principal: boolean }[];
  } | null>(null);
  sectors = signal<Sector[]>([]);
  profiles = signal<AccessProfile[]>([]);
  permissions = signal<Permission[]>([]);
  error = signal('');
  sectorForm: any = null;
  profileForm: any = null;
  colors = COLORS;
  private managerIds = signal<number[]>([]);
  private peopleIds = signal<number[]>([]);

  assignablePerms = computed(() => this.permissions().filter(p => p.key !== 'gerenciar_pessoas_todas'));
  chosenPeople = computed(() => this.peopleIds().map(id => this.data.people().find(p => p.id === id)!).filter(Boolean));
  chosenManagers = computed(() => this.managerIds().map(id => this.data.people().find(p => p.id === id)!).filter(Boolean));
  peopleOptions = computed(() => {
    const sectorId = this.sectorForm?.id ?? null;
    const chosen = new Set(this.peopleIds());
    return this.data.people().filter(p => !chosen.has(p.id) && (p.sector_id == null || p.sector_id === sectorId));
  });
  managerOptions = computed(() => {
    const chosen = new Set(this.peopleIds());
    return this.data.people().filter(p => chosen.has(p.id) && !this.managerIds().includes(p.id) && (p.profiles || []).includes('gestor'));
  });

  ngOnInit() {
    const aba = this.route.snapshot.queryParamMap.get('aba');
    if (aba === 'pessoas' || aba === 'perfis' || aba === 'microsoft' || aba === 'setores') this.tab.set(aba);
    this.load();
  }
  load() {
    this.api.sectors().subscribe(s => this.sectors.set(s));
    this.api.accessProfiles().subscribe(r => { this.profiles.set(r.profiles); this.permissions.set(r.permissions); });
    this.api.microsoftAdmin().subscribe({
      next: ms => this.microsoft.set(ms),
      error: e => this.toast.error(errorMessage(e, 'Não foi possível ler a configuração da Microsoft.')),
    });
  }
  permLabel(key: string) { return this.permissions().find(p => p.key === key)?.label || key; }

  newSector() { this.error.set(''); this.peopleIds.set([]); this.managerIds.set([]); this.sectorForm = { name: '', description: '', color: COLORS[0] }; }
  editSector(s: Sector) {
    this.error.set('');
    const managers = s.managers.map(m => m.id);
    const ids = this.data.people().filter(p => p.sector_id === s.id).map(p => p.id);
    this.sectorForm = { id: s.id, name: s.name, description: s.description, color: s.color };
    this.peopleIds.set([...new Set([...ids, ...managers])]);
    this.managerIds.set(managers);
  }
  togglePerson(id: number) {
    if (!id) return;
    const remove = this.peopleIds().includes(id);
    this.peopleIds.update(l => (remove ? l.filter(x => x !== id) : [...l, id]));
    if (remove) this.managerIds.update(l => l.filter(x => x !== id));
  }
  toggleManager(id: number) { if (!id) return; this.managerIds.update(l => (l.includes(id) ? l.filter(x => x !== id) : [...l, id])); }
  saveSector() {
    const f = this.sectorForm;
    const body = { name: f.name.trim(), description: f.description, color: f.color, people: this.peopleIds(), managers: this.managerIds() };
    (f.id ? this.api.updateSector(f.id, body) : this.api.createSector(body)).subscribe({
      next: () => {
        this.sectorForm = null;
        this.load();
        this.data.reloadTeams();
        this.api.directory().subscribe(p => this.data.people.set(p));
        this.toast.show('Setor salvo.');
      },
      error: e => this.error.set(errorMessage(e)),
    });
  }
  deleteSector() {
    const f = this.sectorForm;
    if (!confirm(`Excluir o setor ${f.name}? As equipes dele serão excluídas e as pessoas ficarão sem setor até serem realocadas.`)) return;
    this.api.deleteSector(f.id).subscribe({
      next: () => { this.sectorForm = null; this.load(); this.data.reloadTeams(); this.toast.show('Setor excluído.'); },
      error: e => this.error.set(errorMessage(e)),
    });
  }

  newProfile() { this.error.set(''); this.profileForm = { label: '', description: '', permissions: [] }; }
  editProfile(p: AccessProfile) { this.error.set(''); this.profileForm = { ...p, permissions: [...p.permissions] }; }
  togglePerm(k: string) {
    const l: string[] = this.profileForm.permissions;
    this.profileForm.permissions = l.includes(k) ? l.filter(x => x !== k) : [...l, k];
  }
  saveProfile() {
    const f = this.profileForm;
    const body: Record<string, unknown> = { label: f.label.trim(), description: f.description };
    if (f.key !== 'admin') body['permissions'] = f.permissions;
    (f.key ? this.api.updateAccessProfile(f.key, body) : this.api.createAccessProfile(body)).subscribe({
      next: () => { this.profileForm = null; this.load(); this.toast.show('Perfil salvo.'); },
      error: e => this.error.set(errorMessage(e)),
    });
  }
  deleteProfile() {
    const f = this.profileForm;
    if (!confirm(`Excluir o perfil ${f.label}? Quem só tinha esse perfil passa a ser Colaborador.`)) return;
    this.api.deleteAccessProfile(f.key).subscribe({
      next: () => { this.profileForm = null; this.load(); this.toast.show('Perfil excluído.'); },
      error: e => this.error.set(errorMessage(e)),
    });
  }
}
