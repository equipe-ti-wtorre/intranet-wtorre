import { Component } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';

@Component({
  selector: 'app-massagem-subnav',
  standalone: true,
  imports: [RouterLink, RouterLinkActive],
  template: `
    <nav class="msg-subnav" aria-label="Massagem">
      <a routerLink="/massagem" routerLinkActive="on" [routerLinkActiveOptions]="{ exact: true }">Início</a>
      <a routerLink="/massagem/minhas-reservas" routerLinkActive="on">Minhas reservas</a>
    </nav>
  `,
})
export class MassagemSubnavComponent {}
