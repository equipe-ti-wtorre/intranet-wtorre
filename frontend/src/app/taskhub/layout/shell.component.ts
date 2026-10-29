import { Component, HostListener, OnDestroy, OnInit, computed, effect, inject, signal } from '@angular/core';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { filter } from 'rxjs';
import { AuthService } from '../core/auth.service';
import { Team } from '../core/models';
import { DataService } from '../core/data.service';
import { UiService } from '../core/ui.service';
import { AvatarComponent, IconComponent } from '../shared/ui';
import { TaskDrawerComponent } from './task-drawer.component';
import { QuickAddComponent } from './quick-add.component';
import { PaletteComponent } from './palette.component';
import { ToastsComponent } from './toasts.component';
import { NewProjectComponent } from './new-project.component';
import { ShortcutsComponent } from './shortcuts.component';

const NAV_SECTORS_KEY = 'taskhub.nav.sectors';
const SIDEBAR_HIDDEN_KEY = 'taskhub.sidebar.hidden';

interface SectorNavGroup {
  id: number;
  name: string;
  color: string;
  canDashboard: boolean;
  canCreate: boolean;
  teams: Team[];
}

@Component({
  selector: 'app-shell',
  standalone: true,
  imports: [RouterOutlet, RouterLink, RouterLinkActive, AvatarComponent, IconComponent, TaskDrawerComponent,
    QuickAddComponent, PaletteComponent, ToastsComponent, NewProjectComponent, ShortcutsComponent],
  template: `
    <div class="app wt-layout" [class.menu-open]="menuOpen()" [class.side-hidden]="sideHidden()" [class.theme-nubank]="ui.palette() === 'nubank-parque'">
      <aside class="side wt-sidebar" aria-label="Menu principal">
        <div class="brand">
          <img class="brand-logo" [src]="ui.logoFullSrc()" [alt]="ui.logoAlt()" />
          <a href="/inicio" class="small" style="margin-left: auto">Intranet</a>
        </div>
        <div class="side-actions">
          <button class="btn btn-sm" (click)="ui.openQuickAdd(quickDefaults())"><app-icon name="plus" [size]="14" />Nova tarefa<kbd class="kbd-hint">Q</kbd></button>
          <button class="btn btn-sm btn-icon" (click)="ui.paletteOpen.set(true)" aria-label="Buscar (Ctrl+K)" title="Buscar (Ctrl+K)"><app-icon name="search" [size]="14" /></button>
        </div>
        <nav class="nav">
          <a routerLink="/ti/taskhub/meu-dia" routerLinkActive="active"><app-icon class="ico" name="sun" />Meu Dia</a>
          <a routerLink="/ti/taskhub/caixa-de-entrada" routerLinkActive="active"><app-icon class="ico" name="inbox" />Caixa de entrada
            @if (data.unread()) { <span class="count hot">{{ data.unread() }}</span> }</a>
            <div class="nav-section">Corporativo</div>
            <a routerLink="/ti/taskhub/tarefas" [queryParams]="{ v: 'minhas', space: 'profissional' }" [class.active]="isTasks('minhas', 'profissional')"><app-icon class="ico" name="check" />Minhas tarefas</a>
            @if (auth.user()?.is_manager) {
              <a routerLink="/ti/taskhub/tarefas" [queryParams]="{ v: 'delegadas', space: 'profissional' }" [class.active]="isTasks('delegadas', 'profissional')"><app-icon class="ico" name="send" />Atribuídas por mim</a>
            }
            @for (t of dashTeams(); track t.id) {
              <a [routerLink]="['/ti/taskhub/equipes', t.id, 'painel']" routerLinkActive="active"><app-icon class="ico" name="chart" /><span class="ellipsis">Equipe · {{ t.name }}</span></a>
            }
            <div class="nav-title">Equipes por setor</div>
            @for (group of sectorNav(); track group.id) {
              <div class="nav-sector">
                <button type="button" class="nav-caret" (click)="toggleSector(group.id)" [attr.aria-expanded]="isSectorOpen(group.id)" [attr.aria-label]="(isSectorOpen(group.id) ? 'Recolher ' : 'Expandir ') + group.name">
                  <span class="nav-caret-ico" [class.open]="isSectorOpen(group.id)"><app-icon name="chevron" [size]="14" /></span>
                </button>
                @if (group.canDashboard) {
                  <a class="nav-sector-name" [routerLink]="['/ti/taskhub/setores', group.id]" routerLinkActive="active" title="Abrir o painel do setor">
                    <app-icon class="ico" name="folder" /><span class="ellipsis">{{ group.name }}</span>
                    <span class="count quiet">{{ group.teams.length }}</span>
                  </a>
                } @else {
                  <button type="button" class="nav-sector-name" (click)="toggleSector(group.id)">
                    <app-icon class="ico" name="folder" /><span class="ellipsis">{{ group.name }}</span>
                    <span class="count quiet">{{ group.teams.length }}</span>
                  </button>
                }
              </div>
              @if (isSectorOpen(group.id)) {
                <div class="nav-children">
                  @for (t of group.teams; track t.id) {
                    <a [routerLink]="['/ti/taskhub/equipes', t.id]" routerLinkActive="active" [routerLinkActiveOptions]="{ exact: false }" [title]="'Projetos da equipe ' + t.name">
                      <app-icon class="ico" name="people" [size]="14" /><span class="ellipsis">{{ t.name }}</span>
                      @if (t.projects_count) { <span class="count quiet">{{ t.projects_count }}</span> }
                    </a>
                  } @empty {
                    <div class="muted small nav-empty">Nenhuma equipe sua aqui.</div>
                  }
                  @if (group.canCreate) {
                    <a class="nav-add" routerLink="/ti/taskhub/equipes" [queryParams]="{ nova: group.id }"><app-icon class="ico" name="plus" [size]="14" />Nova equipe</a>
                  }
                </div>
              }
            } @empty {
              <div class="muted small nav-empty">Quando um gestor incluir você numa equipe, ela aparece aqui.</div>
            }
            @if (legacyProjects().length) {
              <div class="nav-title">Outros projetos</div>
              @for (p of legacyProjects(); track p.id) {
                <a [routerLink]="['/ti/taskhub/projetos', p.id]" routerLinkActive="active">
                  <span class="dot" [style.background]="p.color"></span><span class="ellipsis">{{ p.name }}</span>
                  @if (p.overdue_count) { <span class="count" title="Atrasadas">{{ p.overdue_count }}</span> }
                </a>
              }
            }
            @if (data.guestWorks().length) {
              <div class="nav-title">Acompanho</div>
              @for (w of data.guestWorks(); track w.id) {
                <a [routerLink]="['/ti/taskhub/equipes', w.team_id, 'projetos', w.id]" routerLinkActive="active" [title]="'Projeto da equipe ' + w.team_name">
                  <span class="dot" [style.background]="w.color"></span><span class="ellipsis">{{ w.name }}</span>
                  <span class="muted small ellipsis" style="margin-left:auto;max-width:45%">{{ w.team_name }}</span>
                </a>
              }
            }

          <div class="nav-section">Individual</div>
          <a routerLink="/ti/taskhub/tarefas" [queryParams]="{ v: 'minhas', space: 'pessoal' }" [class.active]="isTasks('minhas', 'pessoal')"><app-icon class="ico" name="user" />Minhas tarefas individuais</a>
          <a routerLink="/ti/taskhub/notas" routerLinkActive="active"><app-icon class="ico" name="note" />Notas</a>
          <a routerLink="/ti/taskhub/lembretes" routerLinkActive="active"><app-icon class="ico" name="bell" />Lembretes</a>
          <div class="nav-title">Projetos individuais
            <button (click)="ui.openNewProject('pessoal')" aria-label="Novo projeto individual" title="Novo projeto individual">+</button>
          </div>
          @for (p of personalProjects(); track p.id) {
            <a [routerLink]="['/ti/taskhub/projetos', p.id]" routerLinkActive="active">
              <span class="dot" [style.background]="p.color"></span><span class="ellipsis">{{ p.name }}</span>
              @if (p.overdue_count) { <span class="count" title="Atrasadas">{{ p.overdue_count }}</span> }
            </a>
          } @empty { <div class="muted small" style="padding:4px 10px">Só você vê o que criar aqui.</div> }

          <div class="nav-title">Organização</div>
          <a routerLink="/ti/taskhub/equipes" routerLinkActive="active" [routerLinkActiveOptions]="{ exact: true }"><app-icon class="ico" name="people" />Equipes</a>
          @if (auth.canManageUsers() === 'all') {
            <a routerLink="/ti/taskhub/administracao" routerLinkActive="active"><app-icon class="ico" name="gear" />Administração</a>
          }
        </nav>
        <div class="side-foot">
          <a routerLink="/ti/taskhub/perfil" class="row grow" style="gap:10px" title="Meu perfil">
            <app-avatar [person]="auth.user()" [large]="true" />
            <span class="who"><b class="ellipsis">{{ auth.user()?.name }}</b><span>{{ roleLabel() }}</span></span>
          </a>
        </div>
      </aside>
      <button type="button" class="side-toggle" (click)="toggleSide()" [attr.aria-expanded]="sideHidden() ? 'false' : 'true'" [attr.aria-label]="sideHidden() ? 'Mostrar menu' : 'Ocultar menu'">
        <app-icon name="chevron" [size]="14" />
      </button>
      @if (menuOpen()) { <div class="scrim" style="z-index:44" (click)="menuOpen.set(false)"></div> }

      <main class="main">
        <div class="mobile-bar">
          <button class="btn btn-ghost btn-icon" (click)="menuOpen.set(true)" aria-label="Abrir menu"><app-icon name="menu" /></button>
          <img class="mobile-logo" [src]="ui.logoMarkSrc()" [alt]="ui.logoAlt()" />
          <button class="btn btn-sm" style="margin-left:auto" (click)="ui.openQuickAdd(quickDefaults())"><app-icon name="plus" [size]="14" />Tarefa</button>
        </div>
        <router-outlet />
      </main>
    </div>

    @if (ui.drawerTaskId()) { <app-task-drawer [taskId]="ui.drawerTaskId()!" /> }
    @if (ui.quickAdd()) { <app-quick-add /> }
    @if (ui.paletteOpen()) { <app-palette /> }
    @if (ui.newProjectOpen()) { <app-new-project /> }
    @if (ui.helpOpen()) { <app-shortcuts /> }
    <app-toasts />
  `,
})
export class ShellComponent implements OnInit, OnDestroy {
  auth = inject(AuthService);
  data = inject(DataService);
  ui = inject(UiService);
  private router = inject(Router);
  menuOpen = signal(false);
  sideHidden = signal(readSidebarHidden());
  private url = signal(this.router.url);
  private gPressed = 0;
  private expandedIds = signal<number[]>(readExpandedSectors());
  private revealedUrls = new Set<string>();

  constructor() {
    // O setor da equipe aberta começa expandido. Recolher depois disso permanece até outra visita.
    effect(() => {
      const url = this.url();
      const match = url.match(/^\/equipes\/(\d+)/);
      if (!match) return;
      const path = url.split('?')[0];
      if (this.revealedUrls.has(path)) return;
      const team = this.data.teams().find(x => x.id === Number(match[1]));
      if (!team?.sector_id) return;
      this.revealedUrls.add(path);
      const id = team.sector_id;
      if (this.expandedIds().includes(id)) return;
      this.expandedIds.update(ids => [...ids, id]);
      this.persistExpanded();
    }, { allowSignalWrites: true });
  }

  personalProjects = computed(() => this.data.projects().filter(p => p.space === 'pessoal'));
  // Projetos corporativos de antes das equipes terem quadro próprio.
  legacyProjects = computed(() => this.data.projects()
    .filter(p => p.space === 'profissional' && !p.is_board)
    .sort((a, b) => a.name.localeCompare(b.name, 'pt')));
  // Equipe com painel cujo setor a pessoa não acompanha: fica acima de "Projetos por setor".
  dashTeams = computed(() => {
    const followed = new Set(this.data.sectors().filter(s => s.can_dashboard).map(s => s.id));
    return this.data.teams()
      .filter(t => t.can_dashboard && !followed.has(t.sector_id ?? -1))
      .slice()
      .sort((a, b) => a.name.localeCompare(b.name, 'pt'));
  });
  sectorNav = computed(() => this.buildSectorNav());
  roleLabel = computed(() => {
    const u = this.auth.user();
    if (!u) return '';
    return u.job_title || (u.profile_labels || []).join(' · ');
  });

  ngOnInit() {
    this.data.start();
    this.router.events.pipe(filter(e => e instanceof NavigationEnd)).subscribe(() => {
      this.url.set(this.router.url);
      this.menuOpen.set(false);
    });
  }

  ngOnDestroy() { this.data.stop(); }

  toggleSide() {
    this.sideHidden.update(hidden => !hidden);
    try { localStorage.setItem(SIDEBAR_HIDDEN_KEY, this.sideHidden() ? '1' : '0'); } catch { /* navegador sem armazenamento */ }
  }

  isSectorOpen(id: number) { return this.expandedIds().includes(id); }

  toggleSector(id: number) {
    this.expandedIds.update(ids => ids.includes(id) ? ids.filter(x => x !== id) : [...ids, id]);
    this.persistExpanded();
  }

  isTasks(v: string, space: string) { const u = this.url(); return u.startsWith('/tarefas') && u.includes(`v=${v}`) && u.includes(`space=${space}`); }

  private persistExpanded() {
    try { localStorage.setItem(NAV_SECTORS_KEY, JSON.stringify(this.expandedIds())); } catch { /* navegador sem armazenamento */ }
  }

  // Setor > equipes: quem é da equipe vê as suas; gestor vê as que acompanha.
  private buildSectorNav(): SectorNavGroup[] {
    const sectors = this.data.sectors();
    const creatable = new Set(this.data.creatableSectors());
    const admin = this.auth.isAdmin();
    const bySector = new Map<number, Team[]>();
    for (const team of this.data.teams()) {
      if (!team.sector_id) continue;
      if (admin && !team.is_member && !team.can_dashboard) continue;
      const list = bySector.get(team.sector_id) ?? [];
      list.push(team);
      bySector.set(team.sector_id, list);
    }
    const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name, 'pt');
    const ids = new Set<number>([...bySector.keys(), ...creatable]);
    for (const s of sectors) if (s.can_dashboard && !admin) ids.add(s.id);
    const rows: SectorNavGroup[] = [...ids].map(id => {
      const sector = sectors.find(s => s.id === id);
      const teams = (bySector.get(id) ?? []).slice().sort(byName);
      return {
        id,
        name: sector?.name || teams[0]?.sector_name || 'Setor',
        color: sector?.color || teams[0]?.color || '#94a3b8',
        canDashboard: !!sector?.can_dashboard,
        canCreate: creatable.has(id),
        teams,
      };
    });
    return rows.sort(byName);
  }

  @HostListener('document:keydown', ['$event'])
  onKey(e: KeyboardEvent) {
    const target = e.target as HTMLElement;
    const typing = ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) || target.isContentEditable;
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault(); this.ui.paletteOpen.set(true); return;
    }
    if (e.key === 'Escape') {
      if (this.ui.paletteOpen()) this.ui.paletteOpen.set(false);
      else if (this.ui.quickAdd()) this.ui.quickAdd.set(null);
      else if (this.ui.helpOpen()) this.ui.helpOpen.set(false);
      else if (this.ui.newProjectOpen()) this.ui.closeNewProject();
      else if (this.ui.drawerTaskId()) this.ui.closeTask();
      return;
    }
    if (typing || e.ctrlKey || e.metaKey || e.altKey) return;
    const k = e.key.toLowerCase();
    if (Date.now() - this.gPressed < 1000) {
      this.gPressed = 0;
      const go: Record<string, string> = { h: '/meu-dia', i: '/caixa-de-entrada', m: '/tarefas?v=minhas&space=profissional', p: '/tarefas?v=minhas&space=pessoal', a: '/tarefas?v=delegadas&space=profissional', e: '/equipes', n: '/notas', l: '/lembretes' };
      if (!this.auth.user()?.is_manager && k === 'a') return;
      if (go[k]) { e.preventDefault(); this.router.navigateByUrl(go[k]); }
      return;
    }
    if (k === 'g') { this.gPressed = Date.now(); return; }
    if (k === 'q' || k === 'n') { e.preventDefault(); this.ui.openQuickAdd(this.quickDefaults()); }
    if (e.key === '?') { e.preventDefault(); this.ui.helpOpen.set(true); }
    if (k === '/') { e.preventDefault(); this.ui.paletteOpen.set(true); }
  }

  // Administrador sem perfil Gestor não cria no Corporativo. Para os outros, dentro de um projeto a tarefa já nasce nele.
  quickDefaults() {
    if (this.auth.user()?.is_admin && !this.auth.user()?.is_manager) {
      const personal = this.contextDefaults();
      if ('space' in personal && personal.space === 'pessoal') return personal;
      return { space: 'pessoal' as const };
    }
    return this.contextDefaults();
  }
  private contextDefaults() {
    const url = this.router.url.replace(/^\/ti\/taskhub/, '');
    const t = url.match(/^\/equipes\/(\d+)(?:\/projetos\/(\d+))?(?:[/?]|$)/);
    const board = t ? this.data.teams().find(x => x.id === Number(t[1]))?.board_id : null;
    if (t && board) return { project_id: board, section_id: t[2] ? Number(t[2]) : null, space: 'profissional' as const };
    const m = url.match(/^\/projetos\/(\d+)(?:\/trabalhos\/(\d+))?/);
    if (m) {
      const p = this.data.projects().find(x => x.id === Number(m[1]));
      return { project_id: Number(m[1]), section_id: m[2] ? Number(m[2]) : null, space: p?.space };
    }
    if (url.includes('space=pessoal') || url.startsWith('/notas') || url.startsWith('/lembretes')) return { space: 'pessoal' as const };
    if (url.startsWith('/meu-dia')) return { plan_today: true };
    return {};
  }
}

function readSidebarHidden(): boolean {
  try { return localStorage.getItem(SIDEBAR_HIDDEN_KEY) === '1'; } catch { return false; }
}

function readExpandedSectors(): number[] {
  try {
    const raw = localStorage.getItem(NAV_SECTORS_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((id): id is number => typeof id === 'number') : [];
  } catch {
    return [];
  }
}
