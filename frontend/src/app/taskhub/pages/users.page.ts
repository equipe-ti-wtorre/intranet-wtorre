import { Component, OnInit, computed, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiService, errorMessage } from '../core/api.service';
import { ToastService } from '../core/toast.service';
import { DataService } from '../core/data.service';
import { AuthService } from '../core/auth.service';
import { fileToAvatarJpeg } from '../core/avatar';
import { Profile, User } from '../core/models';
import { relativeTime } from '../core/format';
import { AutofocusDirective, AvatarComponent, IconComponent } from '../shared/ui';

type Row = User & { last_login_at: string | null };
interface Catalog { profiles: { key: string; label: string; description: string; permissions: string[] }[]; permissions: { key: string; label: string; hint: string }[]; }

function tempPassword() {
  const chars = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ';
  let s = '';
  for (let i = 0; i < 7; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return `${s}${Math.floor(10 + Math.random() * 89)}`;
}

@Component({
  selector: 'app-users',
  standalone: true,
  imports: [FormsModule, AutofocusDirective, AvatarComponent, IconComponent],
  template: `
    <div [class.page]="!embedded()">
      <div [class.page-head]="!embedded()" [class.toolbar]="embedded()">
        @if (!embedded()) {
          <div><h1>Pessoas</h1>
            <div class="sub">{{ full() ? activeCount() + ' pessoas ativas.' : 'Pessoas dos setores e equipes que você gerencia.' }} @if (full()) { Novas contas recebem senha temporária e trocam no primeiro acesso. }</div></div>
        }
        <div class="actions">
          <input class="input" style="width:220px;height:30px" placeholder="Buscar pessoa" [ngModel]="q()" (ngModelChange)="q.set($event)" aria-label="Buscar" />
          @if (full()) {
            <button class="btn btn-sm" (click)="syncDirectory()" [disabled]="syncing()">{{ syncing() ? 'Sincronizando...' : 'Sincronizar com o AD' }}</button>
            <button class="btn btn-primary btn-sm" (click)="openNew()"><app-icon name="plus" [size]="14" />Nova pessoa</button>
          }
        </div>
      </div>
      <div style="overflow-x:auto">
        <table class="table">
          <thead><tr><th>Pessoa</th><th>Usuário</th><th>E-mail</th><th>{{ full() ? 'Departamento' : 'Departamento · equipe' }}</th><th>Perfis</th><th>Acessos extras</th><th>Último acesso</th><th>Situação</th><th></th></tr></thead>
          <tbody>
            @for (u of filtered(); track u.id) {
              <tr class="click" [style.opacity]="u.active ? 1 : .5" (click)="openEdit(u)">
                <td><div class="row"><app-avatar [person]="u" /><div>{{ u.name }}</div></div></td>
                <td class="muted">{{ u.username }}</td>
                <td class="muted">{{ u.email }}</td>
                <td>{{ u.department || '—' }}@if (!full() && u.team_name) { <span class="muted"> · {{ u.team_name }}</span> }</td>
                <td><div class="row" style="flex-wrap:wrap;gap:4px">@for (p of u.profiles; track p) { <span class="pill">{{ profileLabel(p) }}</span> }</div></td>
                <td class="small muted">{{ u.permissions.length ? u.permissions.length + (u.permissions.length === 1 ? ' acesso' : ' acessos') : '—' }}</td>
                <td class="muted small">{{ u.last_login_at ? rel(u.last_login_at) : 'nunca' }}</td>
                <td class="small">{{ u.active ? (u.must_change_password ? 'Aguardando 1º acesso' : 'Ativa') : 'Desativada' }}</td>
                <td class="num"><button class="btn btn-ghost btn-sm" (click)="$event.stopPropagation(); openEdit(u)">Editar</button></td>
              </tr>
            }
          </tbody>
        </table>
      </div>
    </div>

    @if (editing(); as e) {
      <div class="modal-scrim" (click)="close()">
        <div class="modal wide" (click)="$event.stopPropagation()" role="dialog" [attr.aria-label]="e.id ? 'Editar pessoa' : 'Nova pessoa'">
          <div class="modal-head">{{ e.id ? e.name : 'Nova pessoa' }}</div>
          <div class="modal-body" style="max-height:68vh;overflow-y:auto">
            @if (e.id) {
              <div class="row" style="align-items:center;gap:14px;margin-bottom:14px">
                <app-avatar [person]="{ name: e.name || '', initials: e.initials || '?', id: e.id, avatar_url: e.avatar_url }" [large]="true" />
                <div class="stack" style="gap:8px">
                  <input #personPhoto type="file" accept="image/jpeg,image/png" hidden (change)="onPhoto($event)" />
                  <button type="button" class="btn btn-sm" (click)="personPhoto.click()" [disabled]="photoBusy()">Escolher foto</button>
                  @if (e.avatar_url) {
                    <button type="button" class="btn btn-sm" (click)="removePhoto()" [disabled]="photoBusy()">Remover foto</button>
                  }
                </div>
              </div>
            }
            <div class="fields">
              <div class="field"><label for="un">Nome completo</label><input id="un" class="input" appAutofocus [(ngModel)]="form.name" (ngModelChange)="suggestUsername()" [readonly]="form.from_directory" /></div>
              <div class="field"><label for="uu">Usuário</label><input id="uu" class="input" [(ngModel)]="form.username" (input)="usernameTouched = true" [readonly]="form.from_directory" /></div>
              <div class="field"><label for="ue">E-mail (opcional)</label><input id="ue" class="input" type="email" [(ngModel)]="form.email" [readonly]="form.from_directory" /></div>
              <div class="field"><label for="ud">Departamento</label><input id="ud" class="input" [value]="form.department || '—'" readonly /></div>
              @if (!full()) {
                <div class="field"><label for="ut">Equipe</label><select id="ut" class="select" [(ngModel)]="form.team_id">
                  <option [ngValue]="null">Sem equipe</option>
                  @for (t of teamOptions(); track t.id) { <option [ngValue]="t.id">{{ t.name }}</option> }</select></div>
              }
              @if (!e.id) { <div class="field"><label for="up">Senha temporária</label><input id="up" class="input" [(ngModel)]="form.password" /></div> }
            </div>

            @if (full()) {
              <div class="section-label" style="margin-top:8px">Perfis <span class="muted small" style="font-weight:400">pode marcar mais de um</span></div>
              <div class="stack" style="gap:8px">
                @for (p of catalog()?.profiles || []; track p.key) {
                  <label class="check-label" style="align-items:flex-start">
                    <input type="checkbox" style="margin-top:3px" [checked]="form.profiles.includes(p.key)" (change)="toggleProfile(p.key)" />
                    <span><b>{{ p.label }}</b><br /><span class="muted small">{{ p.description }}</span></span>
                  </label>
                }
              </div>

              @if (form.profiles.includes('diretoria')) {
                <div class="section-label">Setores que a diretoria acompanha</div>
                <div class="row" style="flex-wrap:wrap;gap:6px 16px">
                  @for (t of data.sectors(); track t.id) {
                    <label class="check-label"><input type="checkbox" [checked]="form.directed_sectors.includes(t.id)" (change)="toggleTeam(t.id)" /> {{ t.name }}</label>
                  }
                </div>
                <span class="muted small">Para acompanhar a empresa inteira, marque "Ver todos os setores e equipes" nos acessos abaixo.</span>
              }

              <div class="section-label">Acessos <span class="muted small" style="font-weight:400">os do perfil já vêm marcados; marque extras se precisar</span></div>
              <div class="stack" style="gap:8px">
                @for (perm of extraPerms(); track perm.key) {
                  <label class="check-label" style="align-items:flex-start" [style.opacity]="fromProfile(perm.key) ? .75 : 1">
                    <input type="checkbox" style="margin-top:3px" [checked]="fromProfile(perm.key) || form.permissions.includes(perm.key)"
                           [disabled]="fromProfile(perm.key)" (change)="togglePerm(perm.key)" />
                    <span>{{ perm.label }} @if (fromProfile(perm.key)) { <span class="muted small">· pelo perfil</span> }
                      <br /><span class="muted small">{{ perm.hint }}</span></span>
                  </label>
                }
              </div>
            } @else {
              <div class="note-info">Contas criadas por você entram como <b>Colaborador</b> na equipe escolhida. Perfis e acessos extras são definidos pelo administrador.</div>
            }
            @if (error()) { <div class="error-text">{{ error() }}</div> }
          </div>
          <div class="modal-foot">
            @if (e.id) {
              @if (!e.from_directory) { <button class="btn btn-sm left" style="margin-right:auto" (click)="reset(e)">Gerar senha temporária</button> }
              @if (e.id !== meId()) { <button class="btn btn-sm btn-danger" (click)="remove(e)">Excluir</button> }
              @if (e.id !== meId()) { <button class="btn btn-sm btn-ghost" (click)="toggleActive(e)">{{ e.active ? 'Desativar' : 'Reativar' }}</button> }
            }
            <button class="btn btn-ghost" (click)="close()">Cancelar</button>
            <button class="btn btn-primary" [disabled]="saving()" (click)="save()">{{ e.id ? 'Salvar' : 'Criar conta' }}</button>
          </div>
        </div>
      </div>
    }

    @if (shownPassword()) {
      <div class="modal-scrim" (click)="shownPassword.set(null)">
        <div class="modal" (click)="$event.stopPropagation()">
          <div class="modal-head">Senha temporária de {{ shownPassword()!.name }}</div>
          <div class="modal-body">
            <div class="row"><code style="font-size:18px;letter-spacing:.5px">{{ shownPassword()!.password }}</code>
              <button class="btn btn-sm" (click)="copy(shownPassword()!.password)">Copiar</button></div>
            <span class="muted small">Entregue pessoalmente ou por um canal seguro. A pessoa vai criar a própria senha no primeiro acesso. Esta senha não aparece de novo.</span>
          </div>
          <div class="modal-foot"><button class="btn btn-primary" (click)="shownPassword.set(null)">Entendi</button></div>
        </div>
      </div>
    }
  `,
})
export class UsersPage implements OnInit {
  embedded = input(false);
  private api = inject(ApiService);
  private toast = inject(ToastService);
  private auth = inject(AuthService);
  data = inject(DataService);

  users = signal<Row[]>([]);
  catalog = signal<Catalog | null>(null);
  q = signal('');
  editing = signal<Partial<Row> | null>(null);
  saving = signal(false);
  photoBusy = signal(false);
  syncing = signal(false);
  directoryEnabled = signal<boolean | null>(null);
  error = signal('');
  shownPassword = signal<{ name: string; password: string } | null>(null);
  form: any = {};
  usernameTouched = false;

  full = computed(() => this.auth.canManageUsers() === 'all');
  meId = computed(() => this.auth.user()?.id);
  extraPerms = computed(() => (this.catalog()?.permissions || []).filter(p => p.key !== 'gerenciar_pessoas_todas'));
  teamOptions() {
    return this.data.teams().filter(t => this.full() || t.can_edit);
  }
  filtered = computed(() => {
    const q = this.q().trim().toLowerCase();
    return this.users().filter(u => !q || u.name.toLowerCase().includes(q) || u.username?.includes(q) || u.email?.toLowerCase().includes(q));
  });
  activeCount = computed(() => this.users().filter(u => u.active).length);

  ngOnInit() {
    this.load();
    this.api.accessProfiles().subscribe(c => this.catalog.set(c));
    this.auth.microsoftConfig().subscribe({
      next: c => this.directoryEnabled.set(!!c.directory),
      error: () => this.directoryEnabled.set(false),
    });
  }
  load() { this.api.users().subscribe({ next: u => this.users.set(u), error: e => this.toast.error(errorMessage(e)) }); }

  profileLabel(p: string) { return this.catalog()?.profiles.find(x => x.key === p)?.label || p; }
  fromProfile(perm: string) {
    return (this.form.profiles || []).some((p: string) => this.catalog()?.profiles.find(x => x.key === p)?.permissions.includes(perm));
  }
  toggleProfile(p: Profile | string) {
    const l: string[] = this.form.profiles;
    this.form.profiles = l.includes(p) ? l.filter(x => x !== p) : [...l, p];
  }
  togglePerm(k: string) {
    const l: string[] = this.form.permissions;
    this.form.permissions = l.includes(k) ? l.filter(x => x !== k) : [...l, k];
  }
  toggleTeam(id: number) {
    const l: number[] = this.form.directed_sectors;
    this.form.directed_sectors = l.includes(id) ? l.filter(x => x !== id) : [...l, id];
  }

  openNew() {
    this.form = { name: '', username: '', email: '', department: '', team_id: null,
      password: tempPassword(), profiles: ['colaborador'], permissions: [], directed_sectors: [], from_directory: false };
    this.usernameTouched = false; this.error.set(''); this.editing.set({});
  }
  openEdit(u: Row) {
    this.form = { name: u.name, username: u.username, email: u.email, department: u.department, team_id: u.team_id,
      profiles: [...u.profiles], permissions: [...u.permissions], directed_sectors: [...(u.directed_sectors || [])],
      from_directory: u.from_directory };
    this.usernameTouched = true; this.error.set(''); this.editing.set(u);
  }
  close() { this.editing.set(null); }

  private applyAvatar(u: User) {
    this.users.update(list => list.map(row => row.id === u.id ? { ...row, avatar_url: u.avatar_url } : row));
    const current = this.editing();
    if (current?.id === u.id) this.editing.set({ ...current, avatar_url: u.avatar_url });
    this.data.people.update(list => list.map(p => p.id === u.id ? { ...p, avatar_url: u.avatar_url } : p));
    if (u.id === this.auth.user()?.id) this.auth.setUser(u);
  }

  onPhoto(ev: Event) {
    const input = ev.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    const id = this.editing()?.id;
    if (!file || !id) return;
    this.photoBusy.set(true);
    fileToAvatarJpeg(file).then(image => {
      this.api.uploadUserAvatar(id, image).subscribe({
        next: u => { this.applyAvatar(u); this.photoBusy.set(false); this.toast.show('Foto atualizada.'); },
        error: e => { this.photoBusy.set(false); this.toast.error(errorMessage(e)); },
      });
    }).catch(err => { this.photoBusy.set(false); this.toast.error(err?.message || 'Não foi possível ler a foto.'); });
  }

  removePhoto() {
    const id = this.editing()?.id;
    if (!id) return;
    this.photoBusy.set(true);
    this.api.deleteUserAvatar(id).subscribe({
      next: u => { this.applyAvatar(u); this.photoBusy.set(false); this.toast.show('Foto removida.'); },
      error: e => { this.photoBusy.set(false); this.toast.error(errorMessage(e)); },
    });
  }

  suggestUsername() {
    if (this.usernameTouched) return;
    const parts = String(this.form.name).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim().split(/\s+/).filter(Boolean);
    this.form.username = parts.length > 1 ? `${parts[0]}.${parts.at(-1)}` : parts[0] || '';
  }

  save() {
    const e = this.editing(); if (!e) return;
    if (this.full() && !this.form.profiles.length) { this.error.set('Escolha ao menos um perfil.'); return; }
    // Colaborador junto com outro perfil é redundante: o outro já inclui o que o colaborador faz.
    const body = { ...this.form };
    const fromDirectory = !!body.from_directory;
    delete body.department;
    delete body.from_directory;
    delete body.sector_id;
    delete body.job_title;
    if (fromDirectory) {
      delete body.name;
      delete body.username;
      delete body.email;
      delete body.active;
    }
    if (body.profiles.length > 1) body.profiles = body.profiles.filter((p: string) => p !== 'colaborador');
    if (!body.profiles.includes('diretoria')) body.directed_sectors = [];
    if (!this.full()) { delete body.profiles; delete body.permissions; delete body.directed_sectors; }
    else delete body.team_id;
    this.saving.set(true);
    const req = e.id ? this.api.updateUser(e.id, body) : this.api.createUser(body);
    req.subscribe({
      next: u => {
        this.saving.set(false); this.close(); this.load(); this.data.start();
        if (!e.id) this.shownPassword.set({ name: u.name, password: this.form.password });
        else this.toast.show('Pessoa atualizada.');
        if (e.id === this.auth.user()?.id) this.auth.loadMe().subscribe();
      },
      error: err => { this.saving.set(false); this.error.set(errorMessage(err)); },
    });
  }

  remove(e: Partial<Row>) {
    if (!e.id || !confirm(`Excluir ${e.name}? A conta sai do sistema. As tarefas e os comentários continuam, sem essa pessoa.`)) return;
    this.api.deleteUser(e.id).subscribe({
      next: () => { this.close(); this.load(); this.data.start(); this.toast.show('Pessoa excluída.'); },
      error: err => this.error.set(errorMessage(err)),
    });
  }

  toggleActive(e: Partial<Row>) {
    this.api.updateUser(e.id!, { active: !e.active }).subscribe({
      next: () => { this.close(); this.load(); this.toast.show(e.active ? 'Conta desativada.' : 'Conta reativada.'); },
      error: err => this.error.set(errorMessage(err)),
    });
  }

  reset(e: Partial<Row>) {
    const password = tempPassword();
    this.api.resetPassword(e.id!, password).subscribe({
      next: () => { this.close(); this.shownPassword.set({ name: e.name!, password }); this.load(); },
      error: err => this.error.set(errorMessage(err)),
    });
  }

  syncDirectory() {
    if (!this.directoryEnabled()) {
      this.toast.error('O diretório Microsoft não está configurado neste ambiente.');
      return;
    }
    this.syncing.set(true);
    this.api.syncDirectory().subscribe({
      next: r => {
        this.syncing.set(false);
        this.load();
        this.toast.show(`Diretório sincronizado. ${r.created} novas, ${r.updated} atualizadas.`);
      },
      error: err => { this.syncing.set(false); this.toast.error(errorMessage(err)); },
    });
  }

  copy(v: string) { navigator.clipboard?.writeText(v).then(() => this.toast.show('Copiado.')); }
  rel(iso: string) { return relativeTime(iso); }
}
