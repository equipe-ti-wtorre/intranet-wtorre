import { Component, OnDestroy, OnInit, inject, signal } from '@angular/core';
import {
  ActivatedRoute,
  NavigationEnd,
  Router,
  RouterLink,
  RouterLinkActive,
  RouterOutlet,
} from '@angular/router';
import { filter, map } from 'rxjs';
import { toSignal } from '@angular/core/rxjs-interop';
import { LogoWComponent } from '../../logo-w/logo-w.component';
import { AuthService } from '../../../services/auth.service';
import { ContentRefreshService } from '../../../services/content-refresh.service';

@Component({
  selector: 'app-admin-layout',
  standalone: true,
  imports: [RouterOutlet, RouterLink, RouterLinkActive, LogoWComponent],
  templateUrl: './admin-layout.component.html',
  styleUrl: './admin-layout.component.scss',
})
export class AdminLayoutComponent implements OnInit, OnDestroy {
  readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly contentRefresh = inject(ContentRefreshService);

  readonly sidebarOpen = signal(false);

  readonly pageTitle = toSignal(
    this.router.events.pipe(
      filter((e) => e instanceof NavigationEnd),
      map(() => this.getTitleFromRoute())
    ),
    { initialValue: 'Administração' }
  );

  ngOnInit(): void {
    this.contentRefresh.start();
  }

  ngOnDestroy(): void {
    this.contentRefresh.stop();
  }

  private getTitleFromRoute(): string {
    let route: ActivatedRoute = this.route;
    while (route.firstChild) {
      route = route.firstChild;
    }
    return (route.snapshot.data['adminTitle'] as string | undefined) ?? 'Administração';
  }

  toggleSidebar(): void {
    this.sidebarOpen.update((v) => !v);
  }

  closeSidebar(): void {
    this.sidebarOpen.set(false);
  }

  sair(): void {
    this.auth.logout();
  }
}
