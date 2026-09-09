import { Component, DestroyRef, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { TabletAuthService } from '../../services/tablet-auth.service';

const DIAS = ['Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado'];
const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

@Component({
  selector: 'app-tablet-login',
  standalone: true,
  imports: [ReactiveFormsModule],
  templateUrl: './tablet-login.component.html',
  styleUrl: './tablet-login.component.scss',
})
export class TabletLoginComponent {
  private readonly fb = inject(FormBuilder);
  private readonly auth = inject(TabletAuthService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  readonly autenticando = signal(false);
  readonly mensagemErro = signal('');
  readonly hora = signal('00:00');
  readonly data = signal('—');
  mostrarSenha = false;

  readonly particulas = Array.from({ length: 20 }, () => ({
    size: Math.round(Math.random() * 60 + 20),
    left: Math.round(Math.random() * 100),
    duration: Math.round(Math.random() * 20 + 15),
    delay: Math.round(Math.random() * 20),
  }));

  readonly form = this.fb.nonNullable.group({
    username: ['', Validators.required],
    senha: ['', Validators.required],
  });

  constructor() {
    this.tick();
    const id = setInterval(() => this.tick(), 1000);
    this.destroyRef.onDestroy(() => clearInterval(id));
  }

  entrar(): void {
    if (this.form.invalid || this.autenticando()) return;
    this.mensagemErro.set('');
    this.autenticando.set(true);
    const { username, senha } = this.form.getRawValue();
    this.auth.login(username.trim(), senha).subscribe({
      next: () => {
        this.autenticando.set(false);
        void this.router.navigateByUrl('/tablet');
      },
      error: (err: HttpErrorResponse) => {
        this.autenticando.set(false);
        this.mensagemErro.set(err.error?.mensagem || 'Não foi possível entrar.');
      },
    });
  }

  private tick(): void {
    const n = new Date();
    this.hora.set(
      `${String(n.getHours()).padStart(2, '0')}:${String(n.getMinutes()).padStart(2, '0')}`,
    );
    this.data.set(`${DIAS[n.getDay()]}, ${n.getDate()} de ${MESES[n.getMonth()]}`);
  }
}
