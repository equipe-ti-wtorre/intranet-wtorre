import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { ApiService, errorMessage } from '../core/api.service';
import { DataService } from '../core/data.service';
import { ToastService } from '../core/toast.service';
import { AccessProfile, Permission, Sector } from '../core/models';
import { AutofocusDirective, IconComponent, LoadingComponent, PersonChipComponent } from '../shared/ui';
import { DialogDirective } from '../shared/dialog.directive';
import { ConfirmService } from '../core/confirm.service';
import { SECTOR_COLORS as COLORS, colorName } from '../core/colors';
import { UsersPage } from './users.page';
import { PersonPickerComponent } from '../shared/person-picker.component';


@Component({
  selector: 'app-admin',
  standalone: true,
  imports: [FormsModule, RouterLink, AutofocusDirective, IconComponent, LoadingComponent, PersonChipComponent, DialogDirective, UsersPage, PersonPickerComponent],
  template: `
    <div class="page">
      <div class="page-head"><div class="page-head__text"><h1>Administração</h1><div class="sub">Setores da empresa, pessoas, perfis de acesso e login Microsoft.</div></div></div>
      <nav class="tabs" aria-label="Seções da administração">
        <button type="button" [class.active]="tab() === 'setores'" [attr.aria-current]="tab() === 'setores' ? 'page' : null" (click)="tab.set('setores')">Setores</button>
        <button type="button" [class.active]="tab() === 'pessoas'" [attr.aria-current]="tab() === 'pessoas' ? 'page' : null" (click)="tab.set('pessoas')">Pessoas</button>
        <button type="button" [class.active]="tab() === 'perfis'" [attr.aria-current]="tab() === 'perfis' ? 'page' : null" (click)="tab.set('perfis')">Perfis de acesso</button>
        <button type="button" [class.active]="tab() === 'microsoft'" [attr.aria-current]="tab() === 'microsoft' ? 'page' : null" (click)="tab.set('microsoft')">Microsoft</button>
      </nav>

      @if (tab() === 'setores') {
        <div class="toolbar">
          <span class="muted small grow">O administrador cria os setores e escolhe gestores com o perfil Gestor. Eles criam as equipes dentro do setor.</span>
          <button type="button" class="btn btn-primary btn-sm" (click)="newSector()"><app-icon name="plus" [size]="14" />Novo setor</button>
        </div>
        <div class="table-scroll"><table class="table">
          <thead><tr><th>Setor</th><th>Gestores do setor</th><th class="num">Equipes</th><th class="num">Pessoas</th><th></th></tr></thead>
          <tbody>
            @for (s of sectors(); track s.id) {
              <tr class="click" tabindex="0" (click)="editSector(s)" (keydown.enter)="editSector(s)">
                <td><div class="row"><span class="dot" [style.background]="s.color"></span><b>{{ s.name }}</b></div>
                  @if (s.description) { <div class="muted small">{{ s.description }}</div> }</td>
                <td><div class="pills">@for (m of s.managers; track m.id) { <app-person-chip [person]="m" [removable]="false" /> } @empty { <span class="muted small">Nenhum</span> }</div></td>
                <td class="num">{{ s.teams_count }}</td>
                <td class="num">{{ s.people_count }}</td>
                <td class="num nowrap">
                  @if (s.can_panel) { <a class="btn btn-ghost btn-sm" [routerLink]="['/ti/taskhub/painel/setores', s.id]" (click)="$event.stopPropagation()"><app-icon name="chart" [size]="14" />Painel</a> }
                  <button type="button" class="btn btn-ghost btn-sm btn-icon" tabindex="-1" (click)="$event.stopPropagation(); editSector(s)" [attr.aria-label]="'Editar ' + s.name" title="Editar"><app-icon name="pencil" [size]="14" /></button>
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
          <button type="button" class="btn btn-primary btn-sm" (click)="newProfile()"><app-icon name="plus" [size]="14" />Novo perfil</button>
        </div>
        <div class="ap-grid">
          @for (p of profiles(); track p.key) {
            <button type="button" class="ap-card" (click)="editProfile(p)">
              <div class="ap-card__top">
                <div class="grow ap-card__main">
                  <div class="pills">
                    <b>{{ p.label }}</b>
                    @if (p.system) { <span class="pill">padrão</span> }
                  </div>
                  @if (p.description) { <p class="ap-card__desc">{{ p.description }}</p> }
                </div>
                <span class="ap-card__count">{{ p.users_count }} {{ p.users_count === 1 ? 'pessoa' : 'pessoas' }}</span>
              </div>
              <div class="ap-card__perms">
                @if (p.key === 'admin') { <span class="pill">Administrar pessoas, setores e perfis</span><span class="pill">Gerencia todos os quadros</span> }
                @else if (p.permissions.length) {
                  @for (k of p.permissions; track k) { <span class="pill">{{ permLabel(k) }}</span> }
                } @else { <span class="pill">Vê o que foi incluído e organiza o Individual</span> }
              </div>
            </button>
          }
        </div>
      }

      @if (tab() === 'microsoft') {
        <div class="card ms-card">
          @if (microsoft(); as ms) {
            <div class="ms-card__row">
              <b>Login com a conta Microsoft</b>
              <span class="pill">{{ ms.enabled ? 'Pronto' : 'Incompleto' }}</span>
            </div>
            <p class="muted small ms-card__intro">
              {{ ms.tenants.length ? 'Usa os tenants ativos da intranet.' : 'Nenhum tenant ativo foi encontrado.' }}
              O segredo não é exibido.
            </p>
            @for (t of ms.tenants; track t.tenantId) {
              <div class="props ms-card__tenant">
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
              <p class="muted small ms-card__note">Este endereço de retorno precisa estar permitido no aplicativo da Microsoft: {{ ms.redirectUri }}</p>
            }
            @if (!ms.directory) {
              <p class="muted small">Sem o segredo do aplicativo, o login pode funcionar, mas a sincronização do diretório fica indisponível.</p>
            }
          } @else {
            <app-loading kind="lines" [rows]="4" />
          }
        </div>
      }
    </div>

    @if (sectorForm) {
      <div class="modal-scrim" (click)="sectorForm = null">
        <div class="modal" appDialog (dialogClose)="sectorForm = null" (click)="$event.stopPropagation()">
          <div class="modal-head"><h2>{{ sectorForm.id ? 'Editar setor' : 'Novo setor' }}</h2><button type="button" class="btn btn-ghost btn-icon btn-sm modal-x" aria-label="Fechar" (click)="sectorForm = null"><app-icon name="x" [size]="16" /></button></div>
          <div class="modal-body">
            <div class="field"><label for="sn">Nome</label><input id="sn" class="input" appAutofocus [(ngModel)]="sectorForm.name" placeholder="Ex.: Financeiro" /></div>
            <div class="field"><label for="sd">Descrição</label><input id="sd" class="input" [(ngModel)]="sectorForm.description" /></div>
            <div class="field"><label>Pessoas do setor</label>
              <div class="pills">
                @for (p of chosenPeople(); track p.id) {
                  <app-person-chip [person]="p" (remove)="togglePerson(p.id)" />
                }
              </div>
              <app-person-picker [people]="peopleOptions()" placeholder="Adicionar pessoa…" (picked)="togglePerson($event ?? 0)" />
              <span class="hint">Cada pessoa fica em um setor. Quem já está em outro não aparece. Ao sair da lista, deixa este setor e as equipes dele.</span>
            </div>
            <div class="field"><label>Gestores do setor</label>
              <div class="pills">
                @for (m of chosenManagers(); track m.id) {
                  <app-person-chip [person]="m" (remove)="toggleManager(m.id)" />
                }
              </div>
              <app-person-picker [people]="managerOptions()" placeholder="Adicionar gestor…" (picked)="toggleManager($event ?? 0)" />
              <span class="hint">O gestor é uma das pessoas do setor e precisa ter o perfil Gestor. Ele acompanha as equipes e cria equipes.</span>
            </div>
            <div class="field"><span class="label" id="sector-color-label">Cor</span>
              <div class="row" role="radiogroup" aria-labelledby="sector-color-label">@for (c of colors; track c) {
                <button type="button" class="swatch" [class.on]="sectorForm.color === c" role="radio" [attr.aria-checked]="sectorForm.color === c"
                  [attr.aria-label]="colorName(c)" [title]="colorName(c)" [style.background]="c" (click)="sectorForm.color = c"></button>
              }</div></div>
            @if (error()) { <div class="error-text" role="alert">{{ error() }}</div> }
          </div>
          <div class="modal-foot">
            @if (sectorForm.id) { <div class="left"><button type="button" class="btn btn-sm btn-danger" (click)="deleteSector()">Excluir setor</button></div> }
            <button type="button" class="btn btn-ghost" [disabled]="saving()" (click)="sectorForm = null">Cancelar</button>
            <button type="button" class="btn btn-primary" [disabled]="saving() || !sectorForm.name?.trim()" [class.btn--loading]="saving()" (click)="saveSector()">Salvar</button>
          </div>
        </div>
      </div>
    }

    @if (profileForm) {
      <div class="modal-scrim" (click)="profileForm = null">
        <div class="modal" appDialog (dialogClose)="profileForm = null" (click)="$event.stopPropagation()">
          <div class="modal-head"><h2>{{ profileForm.key ? 'Editar perfil' : 'Novo perfil' }}</h2><button type="button" class="btn btn-ghost btn-icon btn-sm modal-x" aria-label="Fechar" (click)="profileForm = null"><app-icon name="x" [size]="16" /></button></div>
          <div class="modal-body">
            <div class="field"><label for="pn">Nome</label><input id="pn" class="input" appAutofocus [(ngModel)]="profileForm.label" placeholder="Ex.: Coordenador" /></div>
            <div class="field"><label for="pd">Descrição</label>
              <textarea id="pd" class="textarea ap-desc" [(ngModel)]="profileForm.description" placeholder="O que esta pessoa vê e pode fazer."></textarea>
            </div>
            <div class="form-section">
            <div class="form-section__title">Acessos</div>
            @if (profileForm.key === 'admin') {
              <div class="note-info ap-note">O Administrador cadastra pessoas, setores e perfis, e não vê o trabalho dos setores.</div>
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
            </div>
            @if (error()) { <div class="error-text" role="alert">{{ error() }}</div> }
          </div>
          <div class="modal-foot">
            @if (profileForm.key && !profileForm.system) { <div class="left"><button type="button" class="btn btn-sm btn-danger" (click)="deleteProfile()">Excluir perfil</button></div> }
            <button type="button" class="btn btn-ghost" [disabled]="saving()" (click)="profileForm = null">Cancelar</button>
            <button type="button" class="btn btn-primary" [disabled]="saving() || !profileForm.label?.trim()" [class.btn--loading]="saving()" (click)="saveProfile()">Salvar</button>
          </div>
        </div>
      </div>
    }
  `,
})
export class AdminPage implements OnInit {
  private api = inject(ApiService);
  private toast = inject(ToastService);
  private confirmSvc = inject(ConfirmService);
  data = inject(DataService);
  private route = inject(ActivatedRoute);
  saving = signal(false);
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
  colorName = colorName;

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
    this.saving.set(true);
    (f.id ? this.api.updateSector(f.id, body) : this.api.createSector(body)).subscribe({
      next: () => {
        this.saving.set(false);
        this.sectorForm = null;
        this.load();
        this.data.reloadTeams();
        this.api.directory().subscribe(p => this.data.people.set(p));
        this.toast.show('Setor salvo.');
      },
      error: e => { this.saving.set(false); this.error.set(errorMessage(e)); },
    });
  }
  async deleteSector() {
    const f = this.sectorForm;
    if (!(await this.confirmSvc.confirm({ title: `Excluir o setor ${f.name}?`, message: 'As equipes dele serão excluídas e as pessoas ficarão sem setor até serem realocadas.', confirmLabel: 'Excluir', danger: true }))) return;
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
    this.saving.set(true);
    (f.key ? this.api.updateAccessProfile(f.key, body) : this.api.createAccessProfile(body)).subscribe({
      next: () => { this.saving.set(false); this.profileForm = null; this.load(); this.toast.show('Perfil salvo.'); },
      error: e => { this.saving.set(false); this.error.set(errorMessage(e)); },
    });
  }
  async deleteProfile() {
    const f = this.profileForm;
    if (!(await this.confirmSvc.confirm({ title: `Excluir o perfil ${f.label}?`, message: 'Quem só tinha esse perfil passa a ser Colaborador.', confirmLabel: 'Excluir', danger: true }))) return;
    this.api.deleteAccessProfile(f.key).subscribe({
      next: () => { this.profileForm = null; this.load(); this.toast.show('Perfil excluído.'); },
      error: e => this.error.set(errorMessage(e)),
    });
  }
}
