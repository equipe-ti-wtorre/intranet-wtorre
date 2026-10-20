import { Component, OnInit, inject, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { AuthService } from '../core/auth.service';
import { errorMessage } from '../core/api.service';
import { UiService } from '../core/ui.service';
import { environment } from '../environments/environment';

import { AutofocusDirective } from '../shared/ui';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [AutofocusDirective, ReactiveFormsModule],
  template: `
    <div class="login-split" [class.login-split--nubank]="nubank()">
      <section class="login-hero" aria-hidden="true">
        <div class="login-hero__orb login-hero__orb--a"></div>
        <div class="login-hero__orb login-hero__orb--b"></div>
        <div class="login-hero__grid"></div>

        <div class="login-hero__copy">
          <img class="login-hero__logo" [src]="ui.logoFullSrc()" alt="" />
          <h2 class="login-hero__title">Seu dia de trabalho,<br />organizado.</h2>
          <p class="login-hero__sub">Projetos do setor, tarefas da equipe e o que é só seu, num lugar só.</p>
        </div>

        <div class="login-hero__stage">
          <div class="hero-card hero-day">
            <div class="hero-day__head"><span class="hero-dot"></span>Meu Dia<span class="hero-day__hours">4h30 de 7h</span></div>
            <div class="hero-ruler"><span class="hero-ruler__fill"></span></div>
            @for (t of heroTasks; track t.title; let i = $index) {
              <div class="hero-task" [style.--i]="i">
                <span class="hero-task__tick"></span>
                <span class="hero-task__title">{{ t.title }}</span>
                <span class="hero-task__tag">{{ t.tag }}</span>
              </div>
            }
          </div>

          <div class="hero-card hero-toast hero-toast--a">
            <span class="hero-avatar">CM</span>
            <span><b>Carla</b> atribuiu uma tarefa a você</span>
          </div>
          <div class="hero-card hero-toast hero-toast--b">
            <span class="hero-avatar hero-avatar--b">AS</span>
            <span><b>Ana</b> concluiu a etapa “Validar plano”</span>
          </div>

          <div class="hero-card hero-kanban">
            @for (c of [0, 1, 2]; track c) {
              <div class="hero-kanban__col">
                <span class="hero-kanban__head"></span>
                <span class="hero-kanban__item"></span>
                @if (c !== 2) { <span class="hero-kanban__item hero-kanban__item--short"></span> }
              </div>
            }
            <span class="hero-kanban__moving"></span>
          </div>
        </div>
      </section>

      <section class="login-side">
        <div [class]="nubank() ? 'login-nubank' : 'login-card'">
          <div [class]="nubank() ? 'login-nubank__brand' : 'login-card__brand'">
            <img [src]="nubank() ? ui.logoWordmarkSrc() : ui.logoFullSrc()" [alt]="ui.logoAlt()" />
            <div [class]="nubank() ? 'login-nubank__underline' : 'login-card__underline'"></div>
          </div>
          <h1 [class]="nubank() ? 'login-nubank__title' : 'login-card__title'">Entrar no TaskHub</h1>
          <p [class]="nubank() ? 'login-nubank__sub' : 'login-card__sub'">Tarefas, projetos e o seu dia de trabalho em um só lugar.</p>
          <p class="small" style="margin: 0 0 12px"><a href="/inicio">Voltar à intranet</a></p>

          @if (notice()) { <div [class]="msg(noticeKind())" role="status">{{ notice() }}</div> }

          <button type="button" [class]="nubank() ? 'login-nubank__ms' : 'login-ms'" [disabled]="loading()" (click)="microsoft()">
            <span [class]="nubank() ? 'login-nubank__chip' : 'login-chip'" aria-hidden="true"><i></i><i></i><i></i><i></i></span>
            Entrar com Microsoft
          </button>

          <button type="button" class="login-toggle" (click)="showLocal.set(!showLocal())">{{ showLocal() ? 'Ocultar login admin' : 'Login sem Microsoft' }}</button>

          @if (showLocal()) {
            <div [class]="nubank() ? 'login-nubank__divider' : 'login-divider'">ou</div>
            <form class="stack" [formGroup]="form" (ngSubmit)="submit()">
              <div class="field">
                <label class="form-label" for="l">Usuário ou e-mail</label>
                <input id="l" [class]="nubank() ? 'form-field login-nubank__input' : 'form-field'" formControlName="login" autocomplete="username" appAutofocus />
              </div>
              <div class="field">
                <label class="form-label" for="p">Senha</label>
                <input id="p" [class]="nubank() ? 'form-field login-nubank__input' : 'form-field'" type="password" formControlName="password" autocomplete="current-password" />
              </div>
              @if (error()) { <div [class]="msg('error')" role="alert">{{ error() }}</div> }
              <button type="submit" [class]="nubank() ? 'login-nubank__submit' : 'login-ms'" [disabled]="loading()">{{ loading() ? 'Processando...' : 'Entrar' }}</button>
            </form>
            @if (!demo) {
              <span class="login-foot">Esqueceu a senha? Peça ao administrador uma senha temporária.</span>
            }
          }

          @if (demo) {
            <div class="login-demo">
              <b class="login-demo__title">Demonstração</b>
              <span class="login-demo__hint">Os dados ficam só neste navegador. Senha de todos: <b>demo1234</b></span>
              @for (u of demoUsers; track u.login) {
                <button type="button" class="login-demo__user" (click)="fillDemo(u.login)">
                  <b>{{ u.login }}</b><span>{{ u.desc }}</span>
                </button>
              }
            </div>
          }

          <div class="login-foot">Ambiente seguro · acesso corporativo</div>
        </div>
      </section>
    </div>
  `,
})
export class LoginPage implements OnInit {
  ui = inject(UiService);
  private auth = inject(AuthService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  private fb = inject(NonNullableFormBuilder);
  form = this.fb.group({
    login: ['', Validators.required],
    password: ['', Validators.required],
  });
  demo = environment.demo;
  demoUsers = [
    { login: 'admin', desc: 'Administrador: setores, perfis e tudo mais' },
    { login: 'carla', desc: 'Gestora do setor TI e da equipe Sistemas' },
    { login: 'marcos', desc: 'Gestor do RH + Diretoria (acompanha TI e Financeiro)' },
    { login: 'ana', desc: 'Colaboradora da equipe Sistemas' },
    { login: 'fernanda', desc: 'Gestora do setor Financeiro' },
  ];
  heroTasks = [
    { title: 'Revisar contrato de licenças', tag: 'TI' },
    { title: 'Configurar plano de contas', tag: 'ERP' },
    { title: 'Aprovar orçamento do trimestre', tag: 'Financeiro' },
    { title: 'Preparar integração dos novos', tag: 'RH' },
  ];
  loading = signal(false);
  error = signal('');
  notice = signal('');
  noticeKind = signal<'warn' | 'info'>('info');
  showLocal = signal(false);
  nubank = () => this.ui.palette() === 'nubank-parque';

  ngOnInit() {
    if (this.route.snapshot.queryParamMap.get('reason') === 'idle') {
      this.noticeKind.set('info');
      this.notice.set('Sua sessão expirou por inatividade. Faça login novamente.');
    }
    this.auth.completeMicrosoftLogin().subscribe({
      next: session => {
        if (!session) return;
        this.router.navigate([session.user.must_change_password ? '/ti/taskhub/trocar-senha' : '/ti/taskhub/meu-dia']);
      },
      error: e => {
        if (!this.returningFromMicrosoft()) return;
        this.loading.set(false);
        this.noticeKind.set('warn');
        this.notice.set(errorMessage(e, 'Não foi possível concluir o login da Microsoft.'));
      },
    });
  }

  msg(kind: 'warn' | 'info' | 'error') {
    if (this.nubank()) return kind === 'info' ? 'login-nubank__msg--info' : 'login-nubank__msg--warn';
    return `login-msg login-msg--${kind}`;
  }

  microsoft() {
    this.loading.set(true);
    this.error.set('');
    this.auth.loginWithMicrosoft().subscribe({
      error: e => {
        this.loading.set(false);
        this.noticeKind.set('warn');
        this.notice.set(errorMessage(e, e?.message || 'Não foi possível abrir o login da Microsoft.'));
      },
    });
  }

  fillDemo(login: string) {
    this.form.setValue({ login, password: 'demo1234' });
    this.submit();
  }

  submit() {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.error.set('Informe usuário e senha.');
      return;
    }
    const { login, password } = this.form.getRawValue();
    this.loading.set(true); this.error.set('');
    this.auth.login(login.trim(), password).subscribe({
      next: s => this.router.navigate([s.user.must_change_password ? '/ti/taskhub/trocar-senha' : '/ti/taskhub/meu-dia']),
      error: e => { this.loading.set(false); this.error.set(errorMessage(e, 'Não foi possível entrar.')); },
    });
  }

  private returningFromMicrosoft() {
    const query = new URLSearchParams(location.search);
    const hash = new URLSearchParams(location.hash.replace(/^#/, ''));
    return ['code', 'error', 'id_token'].some(key => query.has(key) || hash.has(key));
  }
}
