import { Component, HostListener, OnDestroy, OnInit, computed, effect, inject, signal } from '@angular/core';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { filter } from 'rxjs';
import { AuthService } from '../core/auth.service';
import { Project } from '../core/models';
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
  projects: Project[];
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
              <a [routerLink]="['/ti/taskhub/equipes', t.id]" routerLinkActive="active"><app-icon class="ico" name="chart" /><span class="ellipsis">Equipe · {{ t.name }}</span></a>
            }
            <div class="nav-title">Projetos por setor
              @if (auth.user()?.is_manager) {
                <button type="button" (click)="ui.openNewProject('profissional')" aria-label="Novo projeto corporativo" title="Novo projeto corporativo">+</button>
              }
            </div>
            @for (group of sectorNav(); track group.id) {
              <div class="nav-sector">
                <button type="button" class="nav-caret" (click)="toggleSector(group.id)" [attr.aria-expanded]="isSectorOpen(group.id)" [attr.aria-label]="(isSectorOpen(group.id) ? 'Recolher ' : 'Expandir ') + group.name">
                  <span class="nav-caret-ico" [class.open]="isSectorOpen(group.id)"><app-icon name="chevron" [size]="14" /></span>
                </button>
                @if (group.canDashboard) {
                  <a class="nav-sector-name" [routerLink]="['/ti/taskhub/setores', group.id]" routerLinkActive="active" title="Abrir o painel do setor">
                    <app-icon class="ico" name="folder" /><span class="ellipsis">{{ group.name }}</span>
                    <span class="count quiet">{{ group.projects.length }}</span>
                  </a>
                } @else {
                  <button type="button" class="nav-sector-name" (click)="toggleSector(group.id)">
                    <app-icon class="ico" name="folder" /><span class="ellipsis">{{ group.name }}</span>
                    <span class="count quiet">{{ group.projects.length }}</span>
                  </button>
                }
              </div>
              @if (isSectorOpen(group.id)) {
                <div class="nav-children">
                  @for (p of group.projects; track p.id) {
                    <a [routerLink]="['/ti/taskhub/projetos', p.id]" routerLinkActive="active">
                      <span class="dot" [style.background]="p.color"></span><span class="ellipsis">{{ p.name }}</span>
                      @if (p.overdue_count) { <span class="count" title="Atrasadas">{{ p.overdue_count }}</span> }
                    </a>
                  } @empty {
                    <div class="muted small nav-empty">Nenhum projeto seu aqui.</div>
                  }
                </div>
              }
            } @empty {
              <div class="muted small nav-empty">{{ auth.user()?.is_manager ? 'Crie um projeto no +.' : 'Quando um gestor incluir você, os projetos aparecem aqui.' }}</div>
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
    // O setor do projeto aberto começa expandido. Recolher depois disso permanece até outra visita.
    effect(() => {
      const url = this.url();
      const projects = this.data.projects();
      const match = url.match(/^\/projetos\/(\d+)/);
      if (!match) return;
      const path = url.split('?')[0];
      if (this.revealedUrls.has(path)) return;
      const project = projects.find(x => x.id === Number(match[1]));
      if (!project || project.space !== 'profissional') return;
      this.revealedUrls.add(path);
      const id = project.sector_id ?? 0;
      if (this.expandedIds().includes(id)) return;
      this.expandedIds.update(ids => [...ids, id]);
      this.persistExpanded();
    }, { allowSignalWrites: true });
  }

  personalProjects = computed(() => this.data.projects().filter(p => p.space === 'pessoal'));
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

  private buildSectorNav(): SectorNavGroup[] {
    const sectors = this.data.sectors();
    const teams = this.data.teams();
    const projects = this.data.projects().filter(p => p.space === 'profissional');
    const bySector = new Map<number, Project[]>();
    const loose: Project[] = [];
    for (const project of projects) {
      if (project.sector_id) {
        const list = bySector.get(project.sector_id) ?? [];
        list.push(project);
        bySector.set(project.sector_id, list);
      } else loose.push(project);
    }
    const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name, 'pt');
    const sortProjects = (list: Project[]) => list.slice().sort(byName);

    // O administrador recebe todos os setores para cadastrar pessoas. No Corporativo
    // ele só vê os setores que gerencia e os em que tem projeto.
    const catalog = this.auth.isAdmin() ? sectors.filter(s => s.can_dashboard) : sectors;
    const rows: SectorNavGroup[] = catalog.map(s => ({
      id: s.id,
      name: s.name,
      color: s.color,
      canDashboard: s.can_dashboard,
      projects: sortProjects(bySector.get(s.id) ?? []),
    }));
    const known = new Set(rows.map(r => r.id));
    const sectorOf = (id: number) => sectors.find(s => s.id === id);
    for (const [sectorId, items] of bySector) {
      if (known.has(sectorId)) continue;
      const sector = sectorOf(sectorId);
      const team = teams.find(t => t.sector_id === sectorId);
      rows.push({
        id: sectorId,
        name: sector?.name || items[0]?.sector_name || team?.sector_name || 'Setor',
        color: sector?.color || team?.color || '#94a3b8',
        canDashboard: !!sector?.can_dashboard,
        projects: sortProjects(items),
      });
      known.add(sectorId);
    }
    rows.sort(byName);
    if (loose.length) {
      rows.push({ id: 0, name: 'Sem setor', color: '#94a3b8', canDashboard: false, projects: sortProjects(loose) });
    }
    return rows;
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
    const m = this.router.url.match(/^\/projetos\/(\d+)(?:\/trabalhos\/(\d+))?/);
    if (m) {
      const p = this.data.projects().find(x => x.id === Number(m[1]));
      return { project_id: Number(m[1]), section_id: m[2] ? Number(m[2]) : null, space: p?.space };
    }
    if (this.router.url.includes('space=pessoal') || this.router.url.startsWith('/notas') || this.router.url.startsWith('/lembretes')) return { space: 'pessoal' as const };
    if (this.router.url.startsWith('/meu-dia')) return { plan_today: true };
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
