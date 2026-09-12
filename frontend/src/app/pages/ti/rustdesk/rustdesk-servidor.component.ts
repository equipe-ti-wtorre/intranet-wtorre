import { Component, OnInit, inject, signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { AlertasService } from '../../../services/alertas.service';
import { RustdeskService } from '../../../services/rustdesk.service';
import { RustdeskResumo, RustdeskSyncLog } from '../../../models/rustdesk.model';
import {
  formatDateTimeBr,
  formatDefasagem,
  formatEgressGb,
  formatUptime,
} from './rustdesk.utils';

@Component({
  selector: 'app-rustdesk-servidor',
  standalone: true,
  templateUrl: './rustdesk-servidor.component.html',
  styleUrl: './rustdesk-servidor.component.scss',
})
export class RustdeskServidorComponent implements OnInit {
  private readonly api = inject(RustdeskService);
  private readonly alertas = inject(AlertasService);

  readonly carregando = signal(true);
  readonly sincronizando = signal(false);
  readonly resumo = signal<RustdeskResumo | null>(null);
  readonly logs = signal<RustdeskSyncLog[]>([]);

  readonly formatDateTimeBr = formatDateTimeBr;
  readonly formatDefasagem = formatDefasagem;
  readonly formatEgressGb = formatEgressGb;
  readonly formatUptime = formatUptime;

  ngOnInit(): void {
    this.carregar();
  }

  carregar(): void {
    this.carregando.set(true);
    this.api.resumo().subscribe({
      next: (r) => {
        this.resumo.set(r);
        this.carregando.set(false);
      },
      error: (err: HttpErrorResponse) => {
        this.alertas.erro(err.error?.mensagem || 'Erro ao carregar o servidor RustDesk.');
        this.carregando.set(false);
      },
    });
    this.api.listarSyncLog(8).subscribe({
      next: (logs) => this.logs.set(logs),
      error: () => this.logs.set([]),
    });
  }

  async sincronizar(): Promise<void> {
    const ok = await this.alertas.confirmar({
      titulo: 'Sincronizar agora',
      texto: 'Consultar o servidor RustDesk e atualizar cadastro e órfãos?',
      confirmar: 'Sincronizar',
    });
    if (!ok) return;

    this.sincronizando.set(true);
    this.api.sincronizar().subscribe({
      next: (r) => {
        this.alertas.sucesso(r.mensagem || 'Sincronização concluída.');
        this.sincronizando.set(false);
        this.carregar();
      },
      error: (err: HttpErrorResponse) => {
        this.alertas.erro(err.error?.mensagem || 'Erro na sincronização.');
        this.sincronizando.set(false);
      },
    });
  }

  labelAtivo(v: boolean | null | undefined): string {
    if (v === true) return 'Ativo';
    if (v === false) return 'Inativo';
    return 'Desconhecido';
  }

  labelSessoes(n: number | null | undefined): string {
    if (n === 0) return 'Nenhuma sessão';
    if (n == null) return 'Sem dados';
    return String(n);
  }

  formatCarga(n: number | null | undefined): string {
    return n == null || !Number.isFinite(n) ? '—' : n.toFixed(2);
  }

  formatMemMb(n: number | null | undefined): string {
    return n == null || !Number.isFinite(n) ? '—' : `${n} MB`;
  }
}
