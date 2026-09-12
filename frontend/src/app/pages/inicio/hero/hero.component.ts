import { Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { QUICKTAGS } from '../../../data/quicktags.data';
import { AuthService } from '../../../services/auth.service';

@Component({
  selector: 'app-hero',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './hero.component.html',
  styleUrl: './hero.component.scss',
})
export class HeroComponent {
  readonly auth = inject(AuthService);
  readonly quicktags = QUICKTAGS;

  quicktagLink(tag: string): string | null {
    if (tag === 'Reservar sala') return '/salas';
    return null;
  }
}
