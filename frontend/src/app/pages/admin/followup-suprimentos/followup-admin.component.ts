import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DatePipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { AlertasService } from '../../../services/alertas.service';
import { FollowupService } from '../../../services/followup.service';
import { FollowupConfig, FollowupStatusSync, FollowupTestePasso } from '../../../models/followup.model';

export type FollowupAdminAba = 'sharepoint' | 'sincronizacao';

@Component({
  selector: 'app-followup-admin',
  standalone: true,
  imports: [FormsModule, DatePipe],
  templateUrl: './followup-admin.component.html',
  styleUrl: './followup-admin.component.scss',
})
export class FollowupAdminComponent implements OnInit {
  private readonly followup = inject(FollowupService);
  private readonly alertas = inject(AlertasService);

  readonly abaAtiva = signal<FollowupAdminAba>('sharepoint');
  readonly carregando = signal(false);
  readonly salvando = signal(false);
  readonly testando = signal(false);
  readonly sincronizando = signal(false);

  readonly sharepointUrl = signal('');
  readonly abaRm = signal('Requisição');
  readonly abaMatriz = signal('TblMatrizMensagens');
  readonly syncAutomatica = signal(false);
  readonly syncIntervaloMin = signal(60);
  readonly configSalva = signal<FollowupConfig | null>(null);

  readonly status = signal<FollowupStatusSync | null>(null);
  readonly testePassos = signal<FollowupTestePasso[]>([]);
  readonly testeOk = signal<boolean | null>(null);

  readonly ultimaSyncLabel = computed(() => {
    const s = this.status()?.ultima_sync;
    if (!s) return 'Nunca';
    return new Date(s).toLocaleString('pt-BR');
  });

  ngOnInit(): void {
    this.carregar();
  }

  selecionarAba(aba: FollowupAdminAba): void {
    this.abaAtiva.set(aba);
    if (aba === 'sincronizacao') {
      this.recarregarStatus();
    }
  }

  carregar(): void {
    this.carregando.set(true);
    this.followup.obterConfig().subscribe({
      next: (cfg) => {
        this.applyConfig(cfg);
        this.carregando.set(false);
      },
      error: (err: HttpErrorResponse) => {
        this.alertas.erro(err.error?.mensagem || 'Erro ao carregar configuração.');
        this.carregando.set(false);
      },
    });
    this.recarregarStatus();
  }

  private applyConfig(cfg: FollowupConfig): void {
    this.configSalva.set(cfg);
    this.sharepointUrl.set(cfg.sharepoint_url || '');
    this.abaRm.set(cfg.aba_rm || 'Requisição');
    this.abaMatriz.set(cfg.aba_matriz || 'TblMatrizMensagens');
    this.syncAutomatica.set(!!cfg.sync_automatica);
    this.syncIntervaloMin.set(cfg.sync_intervalo_min || 60);
  }

  recarregarStatus(): void {
    this.followup.statusSync().subscribe({
      next: (s) => this.status.set(s),
      error: () => this.status.set(null),
    });
  }

  salvar(): void {
    this.salvando.set(true);
    this.followup
      .salvarConfig({
        sharepoint_url: this.sharepointUrl().trim() || null,
        aba_rm: this.abaRm().trim() || 'Requisição',
        aba_matriz: this.abaMatriz().trim() || 'TblMatrizMensagens',
        sync_automatica: this.syncAutomatica(),
        sync_intervalo_min: Number(this.syncIntervaloMin()) || 60,
      })
      .subscribe({
        next: (cfg) => {
          this.applyConfig(cfg);
          this.alertas.sucesso('Configuração salva.');
          this.salvando.set(false);
          this.recarregarStatus();
        },
        error: (err: HttpErrorResponse) => {
          this.alertas.erro(err.error?.mensagem || 'Não foi possível salvar.');
          this.salvando.set(false);
        },
      });
  }

  testar(): void {
    this.testando.set(true);
    this.testePassos.set([]);
    this.testeOk.set(null);
    this.followup.testarConexao().subscribe({
      next: (r) => {
        this.testePassos.set(r.passos || []);
        this.testeOk.set(!!r.ok);
        if (r.ok) {
          this.alertas.sucesso('Conexão OK.');
        } else {
          this.alertas.erro(r.erro || 'Falha no diagnóstico.');
        }
        this.testando.set(false);
      },
      error: (err: HttpErrorResponse) => {
        const body = err.error;
        if (body?.passos) {
          this.testePassos.set(body.passos);
          this.testeOk.set(false);
        }
        this.alertas.erro(body?.mensagem || body?.erro || 'Falha ao testar conexão.');
        this.testando.set(false);
      },
    });
  }

  async sincronizar(): Promise<void> {
    const ok = await this.alertas.confirmar({
      titulo: 'Sincronizar agora?',
      texto: 'A planilha será baixada do SharePoint e as solicitações no MySQL serão substituídas.',
      confirmar: 'Sincronizar',
    });
    if (!ok) return;

    this.sincronizando.set(true);
    this.followup.sincronizar().subscribe({
      next: (r) => {
        this.alertas.sucesso(`Sincronizado: ${r.linhas_importadas} solicitações.`);
        this.sincronizando.set(false);
        this.recarregarStatus();
      },
      error: (err: HttpErrorResponse) => {
        this.alertas.erro(err.error?.mensagem || 'Erro na sincronização.');
        this.sincronizando.set(false);
        this.recarregarStatus();
      },
    });
  }
}
