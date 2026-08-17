import { Component, inject, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '../../../services/auth.service';

@Component({
  selector: 'app-admin-redirect',
  standalone: true,
  template: '',
})
export class AdminRedirectComponent implements OnInit {
  private readonly router = inject(Router);
  private readonly auth = inject(AuthService);

  ngOnInit(): void {
    if (this.auth.isAdmin()) {
      void this.router.navigate(['/admin', 'menu'], { replaceUrl: true });
      return;
    }

    const rota = this.auth.primeiraRotaAdmin();
    if (rota) {
      void this.router.navigate(['/admin', rota], { replaceUrl: true });
      return;
    }

    void this.router.navigate(['/inicio'], { replaceUrl: true });
  }
}
