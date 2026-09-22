import { HttpClient } from '@angular/common/http';
import {
  Component,
  ElementRef,
  HostListener,
  OnDestroy,
  OnInit,
  ViewChild,
  inject,
  signal,
} from '@angular/core';
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
import { AuthService } from '../../../services/auth.service';
import { ContentRefreshService } from '../../../services/content-refresh.service';

@Component({
  selector: 'app-admin-layout',
  standalone: true,
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  templateUrl: './admin-layout.component.html',
  styleUrl: './admin-layout.component.scss',
})
export class AdminLayoutComponent implements OnInit, OnDestroy {
  readonly auth = inject(AuthService);
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly contentRefresh = inject(ContentRefreshService);

  readonly sidebarOpen = signal(false);
  readonly avatarMenuAberto = signal(false);
  readonly fotoUrl = signal<string | null>(null);

  @ViewChild('avatarWrap') avatarWrapRef?: ElementRef<HTMLElement>;

  readonly pageTitle = toSignal(
    this.router.events.pipe(
      filter((e) => e instanceof NavigationEnd),
      map(() => this.getTitleFromRoute())
    ),
    { initialValue: 'Administração' }
  );

  ngOnInit(): void {
    this.contentRefresh.start();
    if (this.auth.usuario()?.is_ad_user) {
      this.http.get(this.auth.getProfilePhotoUrl(), { responseType: 'blob' }).subscribe({
        next: (blob) => this.fotoUrl.set(URL.createObjectURL(blob)),
        error: () => {
          /* mantém iniciais */
        },
      });
    }
  }

  ngOnDestroy(): void {
    this.contentRefresh.stop();
    const url = this.fotoUrl();
    if (url) URL.revokeObjectURL(url);
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

  toggleAvatarMenu(): void {
    this.avatarMenuAberto.update((v) => !v);
  }

  fecharAvatarMenu(): void {
    this.avatarMenuAberto.set(false);
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    if (!this.avatarMenuAberto()) return;
    const target = event.target as Node;
    if (this.avatarWrapRef?.nativeElement.contains(target)) return;
    this.fecharAvatarMenu();
  }

  @HostListener('document:keydown.escape')
  onAvatarMenuEscape(): void {
    if (this.avatarMenuAberto()) this.fecharAvatarMenu();
  }

  sair(): void {
    this.fecharAvatarMenu();
    this.auth.logout();
  }
}
