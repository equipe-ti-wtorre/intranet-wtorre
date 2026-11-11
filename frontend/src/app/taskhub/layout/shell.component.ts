import { Component, HostListener, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { filter } from 'rxjs';
import { AuthService } from '../core/auth.service';
import { CORP_VIEWS, PERSONAL_VIEWS } from '../core/corp-views';
import { DataService } from '../core/data.service';
import { UiService } from '../core/ui.service';
import { AvatarComponent, IconComponent } from '../shared/ui';
import { TaskDrawerComponent } from './task-drawer.component';
import { QuickAddComponent } from './quick-add.component';
import { PaletteComponent } from './palette.component';
import { ToastsComponent } from './toasts.component';
import { NewProjectComponent } from './new-project.component';
import { ShortcutsComponent } from './shortcuts.component';

const SIDEBAR_HIDDEN_KEY = 'taskhub.sidebar.hidden';
type NavGroup = 'corporativo' | 'individual' | 'organizacao';
const NAV_GROUP_KEY = (g: NavGroup) => `taskhub.nav.${g}`;

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
          <a href="/inicio" class="side-intranet" style="margin-left: auto" title="Voltar para a Intranet"><app-icon name="back" [size]="13" />Intranet</a>
        </div>
        <div class="side-actions">
          <button class="btn btn-sm" (click)="ui.openQuickAdd(quickDefaults())"><app-icon name="plus" [size]="14" />Nova tarefa<kbd class="kbd-hint">Q</kbd></button>
          <button class="btn btn-sm btn-icon" (click)="ui.paletteOpen.set(true)" aria-label="Buscar (Ctrl+K)" title="Buscar (Ctrl+K)"><app-icon name="search" [size]="14" /></button>
        </div>
        <nav class="nav">
          <a routerLink="/ti/taskhub/meu-dia" routerLinkActive="active"><app-icon class="ico" name="sun" />Meu Dia</a>
          <a routerLink="/ti/taskhub/caixa-de-entrada" routerLinkActive="active"><app-icon class="ico" name="inbox" />Caixa de entrada
            @if (data.unread()) { <span class="count hot">{{ data.unread() }}</span> }</a>
          <div class="nav-section nav-section--toggle">
            Corporativo
            <button type="button" class="nav-section__arrow" (click)="toggleGroup('corporativo')"
                    [attr.aria-expanded]="groupOpen().corporativo" aria-controls="nav-corporativo"
                    [attr.aria-label]="(groupOpen().corporativo ? 'Recolher ' : 'Expandir ') + 'Corporativo'"
                    [title]="(groupOpen().corporativo ? 'Recolher ' : 'Expandir ') + 'Corporativo'">
              <app-icon name="chevron" [size]="12" [class.open]="groupOpen().corporativo" />
            </button>
          </div>
          @if (groupOpen().corporativo) {
            <div id="nav-corporativo">
              <a routerLink="/ti/taskhub/tarefas" [queryParams]="{ v: 'minhas', space: 'profissional' }" [class.active]="isTasks('minhas', 'profissional')"><app-icon class="ico" name="check" />Minhas tarefas</a>
              @if (auth.user()?.is_manager) {
                <a routerLink="/ti/taskhub/tarefas" [queryParams]="{ v: 'delegadas', space: 'profissional' }" [class.active]="isTasks('delegadas', 'profissional')"><app-icon class="ico" name="send" />Atribuídas por mim</a>
              }
              @for (v of corpViews(); track v.path) {
                <a [routerLink]="['/ti/taskhub', v.path]" routerLinkActive="active"><app-icon class="ico" [name]="v.icon" />{{ v.label }}</a>
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
            </div>
          }

          <div class="nav-section nav-section--toggle">
            Individual
            <button type="button" class="nav-section__arrow" (click)="toggleGroup('individual')"
                    [attr.aria-expanded]="groupOpen().individual" aria-controls="nav-individual"
                    [attr.aria-label]="(groupOpen().individual ? 'Recolher ' : 'Expandir ') + 'Individual'"
                    [title]="(groupOpen().individual ? 'Recolher ' : 'Expandir ') + 'Individual'">
              <app-icon name="chevron" [size]="12" [class.open]="groupOpen().individual" />
            </button>
          </div>
          @if (groupOpen().individual) {
            <div id="nav-individual">
              <a routerLink="/ti/taskhub/tarefas" [queryParams]="{ v: 'minhas', space: 'pessoal' }" [class.active]="isTasks('minhas', 'pessoal')"><app-icon class="ico" name="user" />Minhas tarefas individuais</a>
              <a routerLink="/ti/taskhub/notas" routerLinkActive="active"><app-icon class="ico" name="note" />Notas</a>
              <a routerLink="/ti/taskhub/lembretes" routerLinkActive="active"><app-icon class="ico" name="bell" />Lembretes</a>
              @for (v of personalViews; track v.path) {
                <a [routerLink]="'/ti/taskhub/' + v.path" routerLinkActive="active"><app-icon class="ico" [name]="v.icon" />{{ v.label }}</a>
              }
            </div>
          }

          <div class="nav-section nav-section--toggle">
            Organização
            <button type="button" class="nav-section__arrow" (click)="toggleGroup('organizacao')"
                    [attr.aria-expanded]="groupOpen().organizacao" aria-controls="nav-organizacao"
                    [attr.aria-label]="(groupOpen().organizacao ? 'Recolher ' : 'Expandir ') + 'Organização'"
                    [title]="(groupOpen().organizacao ? 'Recolher ' : 'Expandir ') + 'Organização'">
              <app-icon name="chevron" [size]="12" [class.open]="groupOpen().organizacao" />
            </button>
          </div>
          @if (groupOpen().organizacao) {
            <div id="nav-organizacao">
              <a routerLink="/ti/taskhub/equipes" routerLinkActive="active" [routerLinkActiveOptions]="{ exact: true }"><app-icon class="ico" name="people" />Equipes</a>
              @if (auth.canManageUsers() === 'all') {
                <a routerLink="/ti/taskhub/administracao" routerLinkActive="active"><app-icon class="ico" name="gear" />Administração</a>
              }
            </div>
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
  groupOpen = signal<Record<NavGroup, boolean>>({ corporativo: readGroupOpen('corporativo'), individual: readGroupOpen('individual'), organizacao: readGroupOpen('organizacao') });
  private url = signal(this.router.url);
  private gPressed = 0;
  corpViews = computed(() => [CORP_VIEWS.kanban, CORP_VIEWS.quadro, CORP_VIEWS.linha, ...(this.data.hasPanel() ? [CORP_VIEWS.painel] : [])]);

  readonly personalViews = [PERSONAL_VIEWS.kanban, PERSONAL_VIEWS.quadro, PERSONAL_VIEWS.linha];
  // Projetos corporativos de antes das equipes terem quadro próprio.
  legacyProjects = computed(() => this.data.projects()
    .filter(p => p.space === 'profissional' && !p.is_board)
    .sort((a, b) => a.name.localeCompare(b.name, 'pt')));
  roleLabel = computed(() => {
    const u = this.auth.user();
    if (!u) return '';
    return u.job_title || (u.profile_labels || []).join(' · ');
  });

  ngOnInit() {
    this.data.start();
    this.openActiveGroup();
    this.router.events.pipe(filter(e => e instanceof NavigationEnd)).subscribe(() => {
      this.url.set(this.router.url);
      this.menuOpen.set(false);
      this.openActiveGroup();
    });
  }

  ngOnDestroy() { this.data.stop(); }

  toggleSide() {
    this.sideHidden.update(hidden => !hidden);
    try { localStorage.setItem(SIDEBAR_HIDDEN_KEY, this.sideHidden() ? '1' : '0'); } catch { /* navegador sem armazenamento */ }
  }

  toggleGroup(g: NavGroup) {
    this.groupOpen.update(open => ({ ...open, [g]: !open[g] }));
    try { localStorage.setItem(NAV_GROUP_KEY(g), this.groupOpen()[g] ? '1' : '0'); } catch { /* navegador sem armazenamento */ }
  }
  // Fechado não esconde a página em que a pessoa está.
  private openActiveGroup() {
    const u = this.router.url.replace(/^\/ti\/taskhub/, '');
    const g: NavGroup | null =
      u.includes('space=pessoal') || /^\/(notas|lembretes|individual)(\/|\?|$)/.test(u) ? 'individual'
      : u.includes('space=profissional') || /^\/(kanban|quadro|linha-do-tempo|painel|projetos)(\/|\?|$)/.test(u) || /^\/equipes\/\d+\//.test(u) ? 'corporativo'
      : /^\/(equipes|administracao)(\/?(\?|$)|\/)/.test(u) ? 'organizacao'
      : null;
    if (g && !this.groupOpen()[g]) this.groupOpen.update(open => ({ ...open, [g]: true }));
  }

  isTasks(v: string, space: string) {
    const u = this.url().replace(/^\/ti\/taskhub/, '');
    return u.startsWith('/tarefas') && u.includes(`v=${v}`) && u.includes(`space=${space}`);
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
    const t = url.match(/^\/(?:kanban|quadro|linha-do-tempo|painel)\/equipes\/(\d+)(?:[/?]|$)/)
      || url.match(/^\/equipes\/(\d+)(?:\/projetos\/(\d+))?(?:[/?]|$)/);
    const board = t ? this.data.teams().find(x => x.id === Number(t[1]))?.board_id : null;
    if (t && board) return { project_id: board, section_id: t[2] ? Number(t[2]) : null, space: 'profissional' as const };
    const m = url.match(/^\/projetos\/(\d+)(?:\/trabalhos\/(\d+))?/);
    if (m) {
      const p = this.data.projects().find(x => x.id === Number(m[1]));
      return { project_id: Number(m[1]), section_id: m[2] ? Number(m[2]) : null, space: p?.space };
    }
    if (url.startsWith('/individual')) {
      const board = this.data.personalBoardId();
      const work = url.match(/^\/individual\/projeto\/(\d+)/);
      return {
        space: 'pessoal' as const,
        ...(board ? { project_id: board } : {}),
        ...(work ? { section_id: Number(work[1]) } : {}),
      };
    }
    if (url.includes('space=pessoal') || url.startsWith('/notas') || url.startsWith('/lembretes')) return { space: 'pessoal' as const };
    if (url.startsWith('/meu-dia')) return { plan_today: true };
    return {};
  }
}

function readGroupOpen(g: NavGroup): boolean {
  try { return localStorage.getItem(NAV_GROUP_KEY(g)) !== '0'; } catch { return true; }
}

function readSidebarHidden(): boolean {
  try { return localStorage.getItem(SIDEBAR_HIDDEN_KEY) === '1'; } catch { return false; }
}
