import { Component, OnInit, ViewEncapsulation, computed, inject } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { TabletAuthService } from '../../services/tablet-auth.service';

@Component({
  selector: 'app-tablet-shell',
  standalone: true,
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  templateUrl: './tablet-shell.component.html',
  styleUrls: ['../massagem/shared/massagem-theme.scss', './tablet-shell.component.scss'],
  encapsulation: ViewEncapsulation.None,
})
export class TabletShellComponent implements OnInit {
  private readonly auth = inject(TabletAuthService);

  readonly nome = computed(() => this.auth.usuario()?.nome || this.auth.usuario()?.username || '');
  readonly isAdmin = computed(() => this.auth.isAdmin());

  ngOnInit(): void {
    this.auth.recarregarMe();
  }

  sair(): void {
    this.auth.logout().subscribe();
  }
}
