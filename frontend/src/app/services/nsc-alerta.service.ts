import { Injectable, inject, signal } from '@angular/core';
import { NavigationEnd, Router } from '@angular/router';
import { catchError, filter, finalize, of, switchMap } from 'rxjs';
import { NscMeu } from '../models/nsc.model';
import { AuthService } from './auth.service';
import { NscService } from './nsc.service';

export type NscAlertaVariante = 'pendente' | 'vencido' | 'a_vencer';

export interface NscAlertaEstado {
  variante: NscAlertaVariante;
  dados: NscMeu;
}

export const NSC_ALERTA_FORCE_LOGIN = 'nsc_alerta_force_login';

const SNOOZE_PREFIX = 'nsc_alerta_snooze_';
const INTERVAL_MS = 60 * 60 * 1000;
const AVENCER_MAX_DIAS = 7;

@Injectable({ providedIn: 'root' })
export class NscAlertaService {
  private readonly api = inject(NscService);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  readonly aberto = signal(false);
  readonly estado = signal<NscAlertaEstado | null>(null);

  private timer: ReturnType<typeof setInterval> | null = null;
  private started = false;
  private checando = false;

  start(): void {
    if (this.started) return;
    this.started = true;
    this.checar();
    this.timer = setInterval(() => this.checar(), INTERVAL_MS);
    this.router.events.pipe(filter((e): e is NavigationEnd => e instanceof NavigationEnd)).subscribe(() => {
      if (sessionStorage.getItem(NSC_ALERTA_FORCE_LOGIN) === '1') {
        this.checar();
      }
    });
  }

  stop(): void {
    this.started = false;
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.fechar();
  }

  lembrarDepois(): void {
    const ad = this.estado()?.dados.ad_object_id;
    if (ad) {
      localStorage.setItem(SNOOZE_PREFIX + ad, String(Date.now() + INTERVAL_MS));
    }
    this.fechar();
  }

  irParaEnvio(): void {
    this.fechar();
    void this.router.navigateByUrl('/nao-se-cale');
  }

  fechar(): void {
    this.aberto.set(false);
    this.estado.set(null);
  }

  checar(): void {
    if (!this.auth.temSessao() || !this.auth.temAccessValido()) return;
    if (this.rotaBloqueada()) return;
    if (this.aberto() || this.checando) return;

    const forceLogin = sessionStorage.getItem(NSC_ALERTA_FORCE_LOGIN) === '1';

    this.checando = true;
    this.api
      .podeVisualizar()
      .pipe(
        switchMap((a) => (a.pode_visualizar ? this.api.meu() : of(null))),
        catchError(() => of(null)),
        finalize(() => {
          this.checando = false;
        })
      )
      .subscribe((meu) => {
        if (!meu?.obrigatorio_efetivo) return;
        const variante = this.resolverVariante(meu);
        if (!variante) return;
        if (!forceLogin && !this.snoozeExpirado(meu.ad_object_id)) return;
        if (forceLogin) sessionStorage.removeItem(NSC_ALERTA_FORCE_LOGIN);
        this.estado.set({ variante, dados: meu });
        this.aberto.set(true);
      });
  }

  private rotaBloqueada(): boolean {
    const url = this.router.url.split('?')[0];
    return url === '/login' || url.startsWith('/login/') || url === '/nao-se-cale';
  }

  private snoozeExpirado(adObjectId: string): boolean {
    const raw = localStorage.getItem(SNOOZE_PREFIX + adObjectId);
    if (!raw) return true;
    const until = Number(raw);
    if (!Number.isFinite(until)) return true;
    return Date.now() >= until;
  }

  private resolverVariante(meu: NscMeu): NscAlertaVariante | null {
    if (meu.status === 'pendente') return 'pendente';
    if (meu.status === 'vencido') return 'vencido';
    const dias = meu.dias_restantes;
    if (dias != null && dias >= 0 && dias <= AVENCER_MAX_DIAS) return 'a_vencer';
    return null;
  }
}
