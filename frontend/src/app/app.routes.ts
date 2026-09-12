import { inject } from '@angular/core';
import { Routes, Router } from '@angular/router';
import { authGuard } from './guards/auth.guard';
import { adminGuard } from './guards/admin.guard';
import { guestGuard } from './guards/guest.guard';
import { moduloGuard, moduloGuardFromRoute } from './guards/modulo.guard';
import { menuHubGuard } from './guards/menu-hub.guard';
import { documentosHubGuard } from './guards/documentos-hub.guard';
import { superAdminGuard } from './guards/super-admin.guard';
import { camarotesViewerGuard } from './guards/camarotes-viewer.guard';
import { solicitacaoViewerGuard } from './guards/solicitacao-viewer.guard';
import {
  tabletAuthGuard,
  tabletGuestGuard,
  tabletAdminCanMatch,
  tabletUserCanMatch,
} from './guards/tablet.guard';
import { ramalAuthGuard, ramalGuestGuard, ramalAdminGuard } from './guards/ramal.guard';
import { rustdeskGuard, rustdeskRouteMatch } from './guards/rustdesk.guard';

export const routes: Routes = [
  {
    path: 'login',
    canActivate: [guestGuard],
    loadComponent: () =>
      import('./pages/login/login.component').then((m) => m.LoginComponent),
  },
  {
    path: 'inicio',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./pages/inicio/inicio.component').then((m) => m.InicioComponent),
  },
  {
    path: 'documentos',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./pages/documentos/documentos-index.component').then((m) => m.DocumentosIndexComponent),
  },
  {
    path: 'documentos/:slug',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./pages/documentos/documento-categoria.component').then((m) => m.DocumentoCategoriaComponent),
  },
  {
    path: 'ramais',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./pages/ramais/ramais.component').then((m) => m.RamaisComponent),
  },
  {
    path: 'aniversariantes',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./pages/aniversariantes/aniversariantes.component').then(
        (m) => m.AniversariantesComponent
      ),
  },
  {
    path: 'agendas',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./pages/agendas/agendas.component').then((m) => m.AgendasComponent),
  },
  {
    path: 'salas',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./pages/salas/salas.component').then((m) => m.SalasComponent),
  },
  {
    path: 'assinaturas',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./pages/assinaturas/assinaturas.component').then(
        (m) => m.AssinaturasComponent
      ),
  },
  {
    path: 'plaquinhas-camarote',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./pages/plaquinhas-camarote/plaquinhas-camarote.component').then(
        (m) => m.PlaquinhasCamaroteComponent
      ),
  },
  {
    path: 'ferramentas/pdf',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./features/pdf-tools/pdf-tools.component').then((m) => m.PdfToolsComponent),
  },
  {
    path: 'treinamentos',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./pages/treinamentos/treinamentos.component').then(
        (m) => m.TreinamentosComponent
      ),
  },
  {
    path: 'treinamentos/:paginaSlug',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./pages/treinamentos/treinamentos.component').then(
        (m) => m.TreinamentosComponent
      ),
  },
  {
    path: 'bi/camarotes',
    canActivate: [authGuard, camarotesViewerGuard],
    loadComponent: () =>
      import('./pages/bi/camarotes/camarotes-view.component').then(
        (m) => m.CamarotesViewComponent
      ),
  },
  {
    path: 'followup-suprimentos',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./pages/followup-suprimentos/followup-suprimentos.component').then(
        (m) => m.FollowupSuprimentosComponent
      ),
  },
  {
    path: 'massagem',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./pages/massagem/massagem-shell.component').then((m) => m.MassagemShellComponent),
    children: [
      {
        path: '',
        loadComponent: () =>
          import('./pages/massagem/massagem-home.component').then((m) => m.MassagemHomeComponent),
      },
      {
        path: 'evento/:id',
        loadComponent: () =>
          import('./pages/massagem/massagem-detalhe.component').then((m) => m.MassagemDetalheComponent),
      },
      {
        path: 'minhas-reservas',
        loadComponent: () =>
          import('./pages/massagem/massagem-minhas.component').then((m) => m.MassagemMinhasComponent),
      },
      {
        path: 'admin',
        pathMatch: 'full',
        redirectTo: () =>
          inject(Router).createUrlTree(['/admin/massagem'], { queryParams: { aba: 'eventos' } }),
      },
    ],
  },
  {
    path: 'f/:token',
    loadComponent: () =>
      import('./pages/pesquisas/pesquisas-publico.component').then(
        (m) => m.PesquisasPublicoComponent
      ),
  },
  {
    path: 'pesquisas/e/:slug',
    redirectTo: ({ params }) => `/f/${params['slug']}`,
  },
  {
    path: 'pesquisas',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./pages/pesquisas/pesquisas-shell.component').then((m) => m.PesquisasShellComponent),
    children: [
      {
        path: '',
        loadComponent: () =>
          import('./pages/pesquisas/pesquisas-home.component').then((m) => m.PesquisasHomeComponent),
      },
      {
        path: 'lista/:tipo',
        loadComponent: () =>
          import('./pages/pesquisas/pesquisas-lista.component').then((m) => m.PesquisasListaComponent),
      },
      {
        path: 'formulario/novo',
        loadComponent: () =>
          import('./pages/pesquisas/pesquisas-builder.component').then(
            (m) => m.PesquisasBuilderComponent
          ),
      },
      {
        path: 'formulario/:id/editar',
        loadComponent: () =>
          import('./pages/pesquisas/pesquisas-builder.component').then(
            (m) => m.PesquisasBuilderComponent
          ),
      },
      {
        path: 'formulario/:id/responder',
        loadComponent: () =>
          import('./pages/pesquisas/pesquisas-responder.component').then(
            (m) => m.PesquisasResponderComponent
          ),
      },
      {
        path: 'formulario/:id/resultados',
        loadComponent: () =>
          import('./pages/pesquisas/pesquisas-resultados.component').then(
            (m) => m.PesquisasResultadosComponent
          ),
      },
      {
        path: 'requisicao/nova',
        pathMatch: 'full',
        redirectTo: '',
      },
      {
        path: 'requisicao/:id',
        redirectTo: '',
      },
      {
        path: 'admin',
        pathMatch: 'full',
        redirectTo: () => inject(Router).createUrlTree(['/admin/pesquisas']),
      },
    ],
  },
  {
    path: 'tablet/login',
    canActivate: [tabletGuestGuard],
    loadComponent: () =>
      import('./pages/tablet/tablet-login.component').then((m) => m.TabletLoginComponent),
  },
  {
    path: 'tablet',
    canActivate: [tabletAuthGuard],
    loadComponent: () =>
      import('./pages/tablet/tablet-shell.component').then((m) => m.TabletShellComponent),
    children: [
      {
        path: '',
        canMatch: [tabletAdminCanMatch],
        loadComponent: () =>
          import('./pages/tablet/tablet-usuarios.component').then((m) => m.TabletUsuariosComponent),
      },
      {
        path: '',
        canMatch: [tabletUserCanMatch],
        loadComponent: () =>
          import('./pages/tablet/tablet-checkin.component').then((m) => m.TabletCheckinComponent),
      },
      { path: 'config/usuarios', pathMatch: 'full', redirectTo: '' },
      { path: 'config', pathMatch: 'full', redirectTo: '' },
    ],
  },
  {
    path: 'ramal/login',
    canActivate: [ramalGuestGuard],
    loadComponent: () =>
      import('./pages/ramal/ramal-login.component').then((m) => m.RamalLoginComponent),
  },
  {
    path: 'ramal',
    canActivate: [ramalAuthGuard],
    loadComponent: () =>
      import('./pages/ramal/ramal-shell.component').then((m) => m.RamalShellComponent),
    children: [
      {
        path: '',
        loadComponent: () =>
          import('./pages/ramal/ramal-lista.component').then((m) => m.RamalListaComponent),
      },
      {
        path: 'config/usuarios',
        canActivate: [ramalAdminGuard],
        loadComponent: () =>
          import('./pages/ramal/ramal-usuarios.component').then((m) => m.RamalUsuariosComponent),
      },
      { path: 'config', pathMatch: 'full', redirectTo: 'config/usuarios' },
    ],
  },
  {
    matcher: rustdeskRouteMatch,
    canActivate: [authGuard, rustdeskGuard],
    loadComponent: () =>
      import('./pages/ti/rustdesk/rustdesk.component').then((m) => m.RustdeskComponent),
  },
  {
    path: 'dashboards',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./pages/dashboards/dashboards-index.component').then(
        (m) => m.DashboardsIndexComponent
      ),
  },
  {
    path: 'dashboards/:reportId',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./pages/dashboards/dashboards-view.component').then(
        (m) => m.DashboardsViewComponent
      ),
  },
  {
    path: 'solicitacao-colaborador',
    canActivate: [authGuard, solicitacaoViewerGuard],
    loadComponent: () =>
      import('./pages/solicitacao-colaborador/solicitacao-colaborador.component').then(
        (m) => m.SolicitacaoColaboradorComponent
      ),
  },
  {
    path: 'p/:slug',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./pages/pagina-publica/pagina-publica.component').then(
        (m) => m.PaginaPublicaComponent
      ),
  },
  {
    path: 'admin',
    canActivate: [authGuard, adminGuard],
    loadComponent: () =>
      import('./shared/admin/admin-layout/admin-layout.component').then(
        (m) => m.AdminLayoutComponent
      ),
    children: [
      {
        path: '',
        loadComponent: () =>
          import('./pages/admin/admin-redirect/admin-redirect.component').then(
            (m) => m.AdminRedirectComponent
          ),
      },
      {
        path: 'menu',
        canActivate: [menuHubGuard],
        loadComponent: () =>
          import('./pages/admin/menu/menu-admin.component').then((m) => m.MenuAdminComponent),
        data: { adminTitle: 'Gestão do Menu' },
      },
      {
        path: 'rodape',
        loadComponent: () =>
          import('./pages/admin/admin-aba-redirect/admin-aba-redirect.component').then(
            (m) => m.AdminAbaRedirectComponent
          ),
        data: { dest: 'menu', aba: 'rodape' },
      },
      {
        path: 'documentos',
        canActivate: [documentosHubGuard],
        loadComponent: () =>
          import('./pages/admin/documentos/documentos-admin.component').then(
            (m) => m.DocumentosAdminComponent
          ),
        data: { adminTitle: 'Documentos' },
      },
      {
        path: 'tenants',
        canActivate: [moduloGuardFromRoute],
        loadComponent: () =>
          import('./pages/admin/tenants/tenants-admin.component').then(
            (m) => m.TenantsAdminComponent
          ),
        data: { adminTitle: 'Tenants Azure' },
      },
      {
        path: 'colaboradores',
        canActivate: [moduloGuardFromRoute],
        loadComponent: () =>
          import('./pages/admin/colaboradores/colaboradores-admin.component').then(
            (m) => m.ColaboradoresAdminComponent
          ),
        data: { adminTitle: 'Gestão de Usuários' },
      },
      {
        path: 'treinamentos',
        loadComponent: () =>
          import('./pages/admin/admin-aba-redirect/admin-aba-redirect.component').then(
            (m) => m.AdminAbaRedirectComponent
          ),
        data: { dest: 'documentos', aba: 'treinamentos' },
      },
      {
        path: 'comunicados',
        loadComponent: () =>
          import('./pages/admin/admin-aba-redirect/admin-aba-redirect.component').then(
            (m) => m.AdminAbaRedirectComponent
          ),
        data: { dest: 'menu', aba: 'comunicados' },
      },
      {
        path: 'eventos',
        loadComponent: () =>
          import('./pages/admin/admin-aba-redirect/admin-aba-redirect.component').then(
            (m) => m.AdminAbaRedirectComponent
          ),
        data: { dest: 'menu', aba: 'eventos' },
      },
      {
        path: 'containers',
        canActivate: [moduloGuardFromRoute],
        loadComponent: () =>
          import('./pages/admin/containers-admin/containers-admin.component').then(
            (m) => m.ContainersAdminComponent
          ),
        data: { adminTitle: 'Containers' },
      },
      {
        path: 'paginas',
        canActivate: [moduloGuardFromRoute],
        loadComponent: () =>
          import('./pages/admin/paginas/paginas-lista.component').then((m) => m.PaginasListaComponent),
        data: { adminTitle: 'Páginas' },
      },
      {
        path: 'paginas/nova',
        canActivate: [moduloGuardFromRoute],
        loadComponent: () =>
          import('./pages/admin/paginas/pagina-editor.component').then((m) => m.PaginaEditorComponent),
        data: { adminTitle: 'Nova página' },
      },
      {
        path: 'paginas/:id/editar',
        canActivate: [moduloGuardFromRoute],
        loadComponent: () =>
          import('./pages/admin/paginas/pagina-editor.component').then((m) => m.PaginaEditorComponent),
        data: { adminTitle: 'Editar página' },
      },
      {
        path: 'configuracoes',
        canActivate: [moduloGuardFromRoute],
        loadComponent: () =>
          import('./pages/admin/configuracoes/configuracoes-admin.component').then(
            (m) => m.ConfiguracoesAdminComponent
          ),
        data: { adminTitle: 'Configurações' },
      },
      {
        path: 'salas',
        canActivate: [moduloGuardFromRoute],
        loadComponent: () =>
          import('./pages/admin/salas/salas-admin.component').then((m) => m.SalasAdminComponent),
        data: { adminTitle: 'Reservas de Salas' },
      },
      {
        path: 'camarotes',
        canActivate: [moduloGuardFromRoute],
        loadComponent: () =>
          import('./pages/admin/camarotes/camarotes-admin.component').then(
            (m) => m.CamarotesAdminComponent
          ),
        data: { adminTitle: 'Configuração de Camarotes' },
      },
      {
        path: 'followup-suprimentos',
        canActivate: [moduloGuardFromRoute],
        loadComponent: () =>
          import('./pages/admin/followup-suprimentos/followup-admin.component').then(
            (m) => m.FollowupAdminComponent
          ),
        data: { adminTitle: 'Follow-up de Suprimentos' },
      },
      {
        path: 'massagem',
        canActivate: [moduloGuardFromRoute],
        loadComponent: () =>
          import('./pages/admin/massagem/massagem-admin.component').then(
            (m) => m.MassagemAdminComponent
          ),
        data: { adminTitle: 'Configurações de Massagem' },
      },
      {
        path: 'pesquisas',
        canActivate: [moduloGuardFromRoute],
        loadComponent: () =>
          import('./pages/admin/pesquisas/pesquisas-admin.component').then(
            (m) => m.PesquisasAdminComponent
          ),
        data: { adminTitle: 'Central de Pesquisas' },
      },
      {
        path: 'massagem/templates/novo',
        canActivate: [moduloGuardFromRoute],
        loadComponent: () =>
          import('./pages/admin/massagem/massagem-template-editor.component').then(
            (m) => m.MassagemTemplateEditorComponent
          ),
        data: { adminTitle: 'Novo template', adminModulo: 'massagem' },
      },
      {
        path: 'massagem/templates/:id',
        canActivate: [moduloGuardFromRoute],
        loadComponent: () =>
          import('./pages/admin/massagem/massagem-template-editor.component').then(
            (m) => m.MassagemTemplateEditorComponent
          ),
        data: { adminTitle: 'Editar template', adminModulo: 'massagem' },
      },
      {
        path: 'solicitacao-colaborador',
        canActivate: [moduloGuardFromRoute],
        loadComponent: () =>
          import('./pages/admin/solicitacao-colaborador/solicitacao-colaborador-admin.component').then(
            (m) => m.SolicitacaoColaboradorAdminComponent
          ),
        data: { adminTitle: 'Solicitação de Colaborador' },
      },
      {
        path: 'perfis',
        loadComponent: () =>
          import('./pages/admin/admin-aba-redirect/admin-aba-redirect.component').then(
            (m) => m.AdminAbaRedirectComponent
          ),
        data: { dest: 'acessos', aba: 'perfis' },
      },
      {
        path: 'acessos',
        canActivate: [superAdminGuard],
        loadComponent: () =>
          import('./pages/admin/acessos/acessos-admin.component').then(
            (m) => m.AcessosAdminComponent
          ),
        data: { adminTitle: 'Gestão de Acessos' },
      },
    ],
  },
  { path: '', redirectTo: 'inicio', pathMatch: 'full' },
  { path: '**', redirectTo: 'inicio' },
];
