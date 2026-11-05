import { Routes } from '@angular/router';
import { adminGuard, authGuard, fullAdminGuard, guestGuard, passwordGuard } from './core/guards';

export const TASKHUB_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () => import('./taskhub-root.component').then((m) => m.TaskhubRootComponent),
    children: [
      {
        path: 'entrar',
        canActivate: [guestGuard],
        loadComponent: () => import('./pages/login.page').then((m) => m.LoginPage),
      },
      {
        path: 'trocar-senha',
        loadComponent: () => import('./pages/change-password.page').then((m) => m.ChangePasswordPage),
      },
      {
        path: '',
        canActivate: [authGuard, passwordGuard],
        loadComponent: () => import('./layout/shell.component').then((m) => m.ShellComponent),
        children: [
          { path: '', pathMatch: 'full', redirectTo: 'meu-dia' },
          { path: 'meu-dia', loadComponent: () => import('./pages/my-day.page').then((m) => m.MyDayPage) },
          { path: 'caixa-de-entrada', loadComponent: () => import('./pages/inbox.page').then((m) => m.InboxPage) },
          { path: 'notas', loadComponent: () => import('./pages/notes.page').then((m) => m.NotesPage) },
          { path: 'lembretes', loadComponent: () => import('./pages/reminders.page').then((m) => m.RemindersPage) },
          { path: 'tarefas', loadComponent: () => import('./pages/tasks.page').then((m) => m.TasksPage) },
          { path: 'projetos/:id', loadComponent: () => import('./pages/project-works.page').then((m) => m.ProjectWorksPage) },
          ...([['kanban', 'kanban'], ['projetos', 'quadro'], ['linha-do-tempo', 'linha']] as const).flatMap(([path, view]) => [
            {
              path: `individual/${path}`,
              data: { view },
              loadComponent: () => import('./pages/personal-picker.page').then((m) => m.PersonalPickerPage),
            },
            {
              path: `individual/${path}/:id`,
              data: { lockedView: view, personal: true },
              loadComponent: () => import('./pages/project-works.page').then((m) => m.ProjectWorksPage),
            },
          ]),
          { path: 'projetos/:id/trabalhos/:workId', loadComponent: () => import('./pages/project.page').then((m) => m.ProjectPage) },
          {
            path: 'projetos/:id/configuracoes',
            data: { mode: 'config' },
            loadComponent: () => import('./pages/project.page').then((m) => m.ProjectPage),
          },
          { path: 'equipes', loadComponent: () => import('./pages/teams.page').then((m) => m.TeamsPage) },
          { path: 'equipes/:teamId/projetos/:workId', loadComponent: () => import('./pages/project.page').then((m) => m.ProjectPage) },
          {
            path: 'equipes/:id/painel',
            redirectTo: ({ params }) => `/ti/taskhub/painel/equipes/${params['id']}`,
          },
          {
            path: 'equipes/:teamId',
            redirectTo: ({ params, queryParams }) => {
              const v = String(queryParams['vista'] || queryParams['v'] || '');
              const dest = v === 'linha' ? 'linha-do-tempo' : v === 'cards' ? 'quadro' : 'kanban';
              return `/ti/taskhub/${dest}/equipes/${params['teamId']}`;
            },
          },
          {
            path: 'setores/:id',
            redirectTo: ({ params }) => `/ti/taskhub/painel/setores/${params['id']}`,
          },
          {
            path: 'kanban',
            data: { view: 'kanban' },
            loadComponent: () => import('./pages/view-picker.page').then((m) => m.ViewPickerPage),
          },
          {
            path: 'kanban/equipes/:teamId',
            data: { lockedView: 'kanban' },
            loadComponent: () => import('./pages/project-works.page').then((m) => m.ProjectWorksPage),
          },
          {
            path: 'quadro',
            data: { view: 'quadro' },
            loadComponent: () => import('./pages/view-picker.page').then((m) => m.ViewPickerPage),
          },
          {
            path: 'quadro/equipes/:teamId',
            data: { lockedView: 'quadro' },
            loadComponent: () => import('./pages/project-works.page').then((m) => m.ProjectWorksPage),
          },
          {
            path: 'linha-do-tempo',
            loadComponent: () => import('./pages/timeline-all.page').then((m) => m.TimelineAllPage),
          },
          {
            path: 'linha-do-tempo/equipes/:teamId',
            data: { lockedView: 'linha' },
            loadComponent: () => import('./pages/project-works.page').then((m) => m.ProjectWorksPage),
          },
          {
            path: 'painel',
            data: { view: 'painel' },
            loadComponent: () => import('./pages/view-picker.page').then((m) => m.ViewPickerPage),
          },
          {
            path: 'painel/equipes/:id',
            data: { kind: 'team' },
            loadComponent: () => import('./pages/team-dashboard.page').then((m) => m.TeamDashboardPage),
          },
          {
            path: 'painel/setores/:id',
            data: { kind: 'sector' },
            loadComponent: () => import('./pages/team-dashboard.page').then((m) => m.TeamDashboardPage),
          },
          { path: 'perfil', loadComponent: () => import('./pages/profile.page').then((m) => m.ProfilePage) },
          {
            path: 'pessoas',
            canActivate: [adminGuard],
            loadComponent: () => import('./pages/users.page').then((m) => m.UsersPage),
          },
          {
            path: 'administracao',
            canActivate: [fullAdminGuard],
            loadComponent: () => import('./pages/admin.page').then((m) => m.AdminPage),
          },
        ],
      },
    ],
  },
];
