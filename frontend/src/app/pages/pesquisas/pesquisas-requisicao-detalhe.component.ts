import { Component, OnInit, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { PesquisasService } from '../../services/pesquisas.service';
import { AlertasService } from '../../services/alertas.service';
import { AuthService } from '../../services/auth.service';
import { PesquisasRequisicao } from '../../models/pesquisas.model';
import { PesqIconComponent } from './shared/pesq-icon.component';

const TIPO_LABEL: Record<string, string> = {
  compra: 'Compra',
  ti: 'TI / Suporte',
  rh: 'RH',
  manutencao: 'Manutenção',
  outro: 'Outro',
};
const PRIO_LABEL: Record<string, string> = { baixa: 'Baixa', media: 'Média', alta: 'Alta' };
const STATUS_LABEL: Record<string, string> = {
  rascunho: 'Rascunho',
  pendente: 'Pendente',
  em_andamento: 'Em andamento',
  concluida: 'Concluída',
  rejeitada: 'Rejeitada',
};

@Component({
  selector: 'app-pesquisas-requisicao-detalhe',
  standalone: true,
  imports: [PesqIconComponent],
  templateUrl: './pesquisas-requisicao-detalhe.component.html',
})
export class PesquisasRequisicaoDetalheComponent implements OnInit {
  private readonly api = inject(PesquisasService);
  private readonly alertas = inject(AlertasService);
  private readonly auth = inject(AuthService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  readonly loading = signal(true);
  readonly agindo = signal(false);
  readonly rec = signal<PesquisasRequisicao | null>(null);
  readonly tipoLabel = TIPO_LABEL;
  readonly prioLabel = PRIO_LABEL;
  readonly statusLabel = STATUS_LABEL;

  ngOnInit(): void {
    const id = Number(this.route.snapshot.paramMap.get('id'));
    this.api.getRequisicao(id).subscribe({
      next: (r) => {
        this.rec.set(r);
        this.loading.set(false);
      },
      error: (err: HttpErrorResponse) => {
        this.alertas.erro(err.error?.mensagem || 'Requisição não encontrada.');
        this.loading.set(false);
        void this.router.navigate(['/pesquisas']);
      },
    });
  }

  podeDecidir(): boolean {
    const r = this.rec();
    const uid = this.auth.usuario()?.id;
    if (!r || !uid) return false;
    return (
      r.aprovadorUsuarioId === uid &&
      (r.status === 'pendente' || r.status === 'em_andamento')
    );
  }

  decidir(acao: 'aprovar' | 'rejeitar'): void {
    const r = this.rec();
    if (!r) return;
    const titulo = acao === 'aprovar' ? 'Aprovar esta requisição?' : 'Rejeitar esta requisição?';
    void this.alertas.confirmar({ titulo, confirmar: acao === 'aprovar' ? 'Aprovar' : 'Rejeitar' }).then((ok) => {
      if (!ok) return;
      this.agindo.set(true);
      this.api.decidirRequisicao(r.id, acao).subscribe({
        next: (upd) => {
          this.rec.set(upd);
          this.agindo.set(false);
          this.alertas.sucesso(acao === 'aprovar' ? 'Requisição aprovada.' : 'Requisição rejeitada.');
        },
        error: (err: HttpErrorResponse) => {
          this.alertas.erro(err.error?.mensagem || 'Não foi possível registrar a decisão.');
          this.agindo.set(false);
        },
      });
    });
  }

  abrirAnexo(): void {
    const r = this.rec();
    if (!r) return;
    this.api.anexoRequisicao(r.id).subscribe({
      next: (s) => window.open(s.url, '_blank', 'noopener'),
      error: (err: HttpErrorResponse) => {
        this.alertas.erro(err.error?.mensagem || 'Não foi possível abrir o anexo.');
      },
    });
  }

  voltar(): void {
    void this.router.navigate(['/pesquisas']);
  }
}
