import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../core/auth.service';
import { errorMessage } from '../core/api.service';

@Component({
  selector: 'app-change-password',
  standalone: true,
  imports: [FormsModule],
  template: `
    <div class="auth-wrap">
      <form class="auth-card" (ngSubmit)="submit()">
        <h1>{{ forced() ? 'Crie sua senha' : 'Trocar senha' }}</h1>
        @if (forced()) { <p class="muted">Sua senha atual é temporária. Escolha uma senha só sua para continuar.</p> }
        <div class="field"><label for="c">Senha atual</label>
          <input id="c" class="input" name="current" type="password" autocomplete="current-password" [(ngModel)]="current" required /></div>
        <div class="field"><label for="n">Nova senha</label>
          <input id="n" class="input" name="next" type="password" autocomplete="new-password" [ngModel]="next()" (ngModelChange)="next.set($event)" required />
          <div class="strength" aria-hidden="true">@for (i of [0,1,2]; track i) { <i [class.on]="score() > i"></i> }</div>
          <span class="hint">Pelo menos 8 caracteres, com letras e números.</span></div>
        <div class="field"><label for="r">Repita a nova senha</label>
          <input id="r" class="input" name="repeat" type="password" autocomplete="new-password" [(ngModel)]="repeat" required /></div>
        @if (error()) { <div class="error-text" role="alert">{{ error() }}</div> }
        <button class="btn btn-primary" style="height:38px;justify-content:center" [disabled]="loading()">Salvar senha</button>
        <button type="button" class="btn btn-ghost" (click)="forced() ? auth.logout() : back()">{{ forced() ? 'Sair' : 'Voltar' }}</button>
      </form>
    </div>
  `,
})
export class ChangePasswordPage {
  auth = inject(AuthService);
  private router = inject(Router);
  current = ''; repeat = '';
  next = signal('');
  loading = signal(false);
  error = signal('');
  forced = computed(() => !!this.auth.user()?.must_change_password);
  score = computed(() => {
    const p = this.next();
    return (p.length >= 8 ? 1 : 0) + (/[A-Za-z]/.test(p) && /\d/.test(p) ? 1 : 0) + (p.length >= 12 || /[^A-Za-z0-9]/.test(p) ? 1 : 0);
  });

  constructor() { if (!this.auth.isLoggedIn()) this.router.navigate(['/ti/taskhub/entrar']); }

  back() { this.router.navigate(['/ti/taskhub/perfil']); }

  submit() {
    if (this.next() !== this.repeat) { this.error.set('As duas senhas novas não são iguais.'); return; }
    this.loading.set(true); this.error.set('');
    this.auth.changePassword(this.current, this.next()).subscribe({
      next: () => this.router.navigate(['/ti/taskhub/meu-dia']),
      error: e => { this.loading.set(false); this.error.set(errorMessage(e)); },
    });
  }
}
