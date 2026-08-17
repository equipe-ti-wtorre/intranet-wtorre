import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { AuthService } from '../../services/auth.service';
import { MsalConfigService } from '../../services/msal-config.service';
import { MenuService } from '../../services/menu.service';
import { SiteBrandingService } from '../../services/site-branding.service';
import { LoginConfig, LOGIN_DEFAULTS } from '../../models/login.model';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [ReactiveFormsModule],
  templateUrl: './login.component.html',
  styleUrl: './login.component.scss',
})
export class LoginComponent implements OnInit {
  private readonly fb = inject(FormBuilder);
  readonly auth = inject(AuthService);
  readonly msalConfig = inject(MsalConfigService);
  private readonly route = inject(ActivatedRoute);
  private readonly menuService = inject(MenuService);
  private readonly siteBranding = inject(SiteBrandingService);

  readonly config = signal<LoginConfig>(structuredClone(LOGIN_DEFAULTS));
  readonly empresas = computed(() =>
    [...this.config().empresas].sort((a, b) => a.ordem - b.ordem)
  );

  readonly form = this.fb.nonNullable.group({
    email: ['', [Validators.required, Validators.email]],
    senha: ['', Validators.required],
    manterConectado: [true],
  });

  mostrarSenha = false;
  mostrarLoginLocal = false;
  autenticando = signal(false);
  mensagemErro = signal('');
  avisoMsal = signal('');
  sessaoExpirada = signal(false);

  ngOnInit(): void {
    if (typeof window !== 'undefined') {
      ['localStorage', 'sessionStorage'].forEach((s) => {
        const store = window[s as 'localStorage' | 'sessionStorage'];
        Object.keys(store)
          .filter((k) => k.includes('interaction.status'))
          .forEach((k) => store.removeItem(k));
      });
    }

    this.menuService.getLoginPublic().subscribe({
      next: (cfg) => {
        this.config.set(cfg);
        this.siteBranding.applyFavicon(cfg.favicon_url);
      },
    });

    this.route.queryParams.subscribe((params) => {
      this.sessaoExpirada.set(params['reason'] === 'idle');
    });

    const msalErr = this.msalConfig.getLoadError();
    if (msalErr) {
      this.avisoMsal.set(msalErr);
    }

    const erroPendente = this.auth.consumirErroLoginMicrosoft();
    if (erroPendente) {
      this.mensagemErro.set(erroPendente);
    }

    void firstValueFrom(this.auth.ensureSession()).then((ok) => {
      if (ok) {
        this.auth.completarLogin();
      } else if (this.auth.temSessao()) {
        this.auth.limparSessaoJwt();
      }
    });
  }

  enviarLogin(): void {
    if (this.autenticando()) return;

    const { email, senha, manterConectado } = this.form.getRawValue();
    if (!email.trim() || !senha.trim()) {
      this.mensagemErro.set('Preencha e-mail e senha para continuar.');
      return;
    }

    this.mensagemErro.set('');
    this.autenticando.set(true);

    this.auth.loginLocal(email.trim(), senha, manterConectado).subscribe({
      next: () => {
        this.autenticando.set(false);
        this.auth.completarLogin();
      },
      error: (err: unknown) => {
        const http = err as HttpErrorResponse;
        const msg =
          http.error?.mensagem ||
          (err instanceof Error ? err.message : null) ||
          'Credenciais inválidas.';
        this.mensagemErro.set(msg);
        this.autenticando.set(false);
      },
    });
  }

  async entrarMicrosoft(): Promise<void> {
    if (this.autenticando() || this.auth.msalBusy()) return;
    if (!this.msalConfig.hasClientId()) {
      this.mensagemErro.set(
        this.msalConfig.getLoadError() || 'Microsoft SSO não configurado. Contate o administrador.'
      );
      return;
    }

    this.mensagemErro.set('');
    this.autenticando.set(true);
    try {
      await this.auth.loginMicrosoft();
    } catch (err) {
      this.autenticando.set(false);
      this.mensagemErro.set(
        err instanceof Error ? err.message : 'Erro ao iniciar login Microsoft.'
      );
    }
  }

  alternarSenha(): void {
    this.mostrarSenha = !this.mostrarSenha;
  }

  toggleLoginLocal(): void {
    this.mostrarLoginLocal = !this.mostrarLoginLocal;
  }

  onSenhaEnter(event: Event): void {
    event.preventDefault();
    this.enviarLogin();
  }
}
