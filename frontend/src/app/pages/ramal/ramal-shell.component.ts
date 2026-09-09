import { Component, computed, inject } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { RamalAuthService } from '../../services/ramal-auth.service';

@Component({
  selector: 'app-ramal-shell',
  standalone: true,
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  templateUrl: './ramal-shell.component.html',
  styleUrl: './ramal-shell.component.scss',
})
export class RamalShellComponent {
  private readonly auth = inject(RamalAuthService);

  readonly nome = computed(() => this.auth.usuario()?.nome || this.auth.usuario()?.username || '');
  readonly isAdmin = computed(() => this.auth.isAdmin());

  sair(): void {
    this.auth.logout().subscribe();
  }
}
