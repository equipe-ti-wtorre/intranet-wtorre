import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { RamalAuthService } from '../../services/ramal-auth.service';

@Component({
  selector: 'app-ramal-login',
  standalone: true,
  imports: [ReactiveFormsModule],
  templateUrl: './ramal-login.component.html',
  styleUrl: './ramal-login.component.scss',
})
export class RamalLoginComponent {
  private readonly fb = inject(FormBuilder);
  private readonly auth = inject(RamalAuthService);
  private readonly router = inject(Router);

  readonly autenticando = signal(false);
  readonly mensagemErro = signal('');
  mostrarSenha = false;

  readonly form = this.fb.nonNullable.group({
    username: ['', Validators.required],
    senha: ['', Validators.required],
  });

  entrar(): void {
    if (this.form.invalid || this.autenticando()) return;
    this.mensagemErro.set('');
    this.autenticando.set(true);
    const { username, senha } = this.form.getRawValue();
    this.auth.login(username.trim(), senha).subscribe({
      next: () => {
        this.autenticando.set(false);
        void this.router.navigateByUrl('/ramal');
      },
      error: (err: HttpErrorResponse) => {
        this.autenticando.set(false);
        this.mensagemErro.set(err.error?.mensagem || 'Não foi possível entrar.');
      },
    });
  }
}
