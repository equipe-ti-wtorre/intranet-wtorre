import { DatePipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { NscAcesso, NscMeu, NscStatus, NscValidacao } from '../../models/nsc.model';
import { AlertasService } from '../../services/alertas.service';
import { NscService } from '../../services/nsc.service';
import { AdminDropzoneComponent } from '../../shared/admin/admin-dropzone/admin-dropzone.component';
import { FooterComponent } from '../../shared/footer/footer.component';
import { PublicChromeComponent } from '../../shared/public-chrome/public-chrome.component';
import { NaoSeCaleEquipeComponent } from './nao-se-cale-equipe.component';

type HeroTone = 'ok' | 'wait' | 'bad' | 'neutral';

@Component({
  selector: 'app-nao-se-cale',
  standalone: true,
  imports: [
    PublicChromeComponent,
    FooterComponent,
    FormsModule,
    DatePipe,
    AdminDropzoneComponent,
    NaoSeCaleEquipeComponent,
  ],
  templateUrl: './nao-se-cale.component.html',
  styleUrl: './nao-se-cale.component.scss',
})
export class NaoSeCaleComponent implements OnInit, OnDestroy {
  private readonly api = inject(NscService);
  private readonly alertas = inject(AlertasService);
  private previewUrl: string | null = null;

  readonly carregando = signal(true);
  readonly enviando = signal(false);
  readonly erro = signal('');
  readonly acesso = signal<NscAcesso | null>(null);
  readonly aba = signal<'meu' | 'equipe'>('meu');
  readonly dados = signal<NscMeu | null>(null);
  readonly arquivo = signal<File | null>(null);
  readonly validadeManual = signal('');
  readonly dataEmissaoManual = signal('');
  readonly lendo = signal(false);
  readonly previa = signal<NscValidacao | null>(null);
  readonly previaErro = signal('');
  readonly motivoAprovacao = signal('');
  readonly removendo = signal(false);
  private validarSeq = 0;

  readonly status = computed(() => this.dados()?.status ?? 'pendente');
  readonly hero = computed(() => this.heroDe(this.status(), this.dados()));

  ngOnInit(): void {
    this.carregar();
  }

  ngOnDestroy(): void {
    this.revokePreview();
  }

  carregar(): void {
    this.carregando.set(true);
    this.erro.set('');
    this.api.podeVisualizar().subscribe({
      next: (acesso) => {
        this.acesso.set(acesso);
        this.api.meu().subscribe({
          next: (res) => {
            this.dados.set(res);
            this.validadeManual.set(res.validade_manual || '');
            this.carregando.set(false);
          },
          error: (err: HttpErrorResponse) => {
            if (acesso.pode_ver_equipe && err.status === 404) {
              this.dados.set(null);
              this.aba.set('equipe');
              this.carregando.set(false);
              return;
            }
            this.erro.set(err.error?.mensagem || 'Não foi possível carregar seu certificado.');
            this.carregando.set(false);
          },
        });
      },
      error: (err: HttpErrorResponse) => {
        this.erro.set(err.error?.mensagem || 'Não foi possível carregar seu certificado.');
        this.carregando.set(false);
      },
    });
  }

  onFile(file: File): void {
    this.arquivo.set(file);
    this.previa.set(null);
    this.previaErro.set('');
    this.motivoAprovacao.set('');
    this.dataEmissaoManual.set('');
    this.lendo.set(true);
    const seq = ++this.validarSeq;
    const fd = new FormData();
    fd.append('arquivo', file);
    if (this.dados()?.permitir_validade_manual && this.validadeManual()) {
      fd.append('validade_manual', this.validadeManual());
    }
    this.api.validar(fd).subscribe({
      next: (res) => {
        if (seq !== this.validarSeq) return;
        this.previa.set(res);
        this.lendo.set(false);
      },
      error: (err: HttpErrorResponse) => {
        if (seq !== this.validarSeq) return;
        this.previa.set(null);
        this.previaErro.set(err.error?.mensagem || 'Não foi possível ler o certificado.');
        this.lendo.set(false);
      },
    });
  }

  podeEnviar(): boolean {
    const p = this.previa();
    if (!p) return false;
    if (p.requer_data_manual && !this.dataEmissaoManual()) return false;
    if (!p.ok && !p.requer_data_manual) return false;
    if (p.requer_aprovacao && !this.motivoAprovacao().trim()) return false;
    return true;
  }

  onDataEmissaoManual(value: string): void {
    this.dataEmissaoManual.set(value);
    const p = this.previa();
    if (!p?.requer_data_manual) return;
    this.previa.set({
      ...p,
      data_emissao: value || null,
      validade: value ? this.addMonthsIso(value, 12) : null,
    });
  }

  private addMonthsIso(iso: string, meses: number): string | null {
    const [y, m, d] = iso.split('-').map(Number);
    if (!y || !m || !d) return null;
    const dt = new Date(Date.UTC(y, m - 1, d));
    dt.setUTCMonth(dt.getUTCMonth() + meses);
    const yy = dt.getUTCFullYear();
    const mm = String(dt.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(dt.getUTCDate()).padStart(2, '0');
    return `${yy}-${mm}-${dd}`;
  }

  enviar(): void {
    const file = this.arquivo();
    if (!file) {
      this.alertas.erro('Selecione o arquivo do certificado.');
      return;
    }
    const previa = this.previa();
    if (!previa || (!previa.ok && !previa.requer_data_manual)) {
      this.alertas.erro(this.previaErro() || 'Aguarde a leitura do certificado.');
      return;
    }
    if (previa.requer_data_manual && !this.dataEmissaoManual()) {
      this.alertas.erro('Informe a data de emissão que aparece no certificado.');
      return;
    }
    const motivo = this.motivoAprovacao().trim();
    if (previa.requer_aprovacao && !motivo) {
      this.alertas.erro('Informe o motivo para o RH aprovar o certificado.');
      return;
    }
    const fd = new FormData();
    fd.append('arquivo', file);
    if (previa.requer_data_manual && this.dataEmissaoManual()) {
      fd.append('data_emissao', this.dataEmissaoManual());
    }
    if (motivo) fd.append('motivo', motivo);
    if (this.dados()?.permitir_validade_manual && this.validadeManual()) {
      fd.append('validade_manual', this.validadeManual());
    }
    this.enviando.set(true);
    this.api.enviar(fd).subscribe({
      next: (res) => {
        this.dados.set(res);
        this.arquivo.set(null);
        this.previa.set(null);
        this.previaErro.set('');
        this.motivoAprovacao.set('');
        this.dataEmissaoManual.set('');
        this.enviando.set(false);
        this.alertas.sucesso(
          res.pedido_aprovacao
            ? 'Certificado enviado para aprovação do RH.'
            : 'Certificado enviado.'
        );
      },
      error: (err: HttpErrorResponse) => {
        this.enviando.set(false);
        this.alertas.erro(err.error?.mensagem || 'Falha ao enviar o certificado.');
      },
    });
  }

  async removerCertificado(envioId?: number | null): Promise<void> {
    const ok = await this.alertas.confirmarExclusao({
      titulo: 'Remover certificado',
      texto: 'O arquivo será excluído. Você poderá enviar outro depois.',
    });
    if (!ok) return;
    this.removendo.set(true);
    this.api.removerMeu(envioId || undefined).subscribe({
      next: (res) => {
        this.dados.set(res);
        this.removendo.set(false);
        this.alertas.sucesso('Certificado removido.');
      },
      error: (err: HttpErrorResponse) => {
        this.removendo.set(false);
        this.alertas.erro(err.error?.mensagem || 'Não foi possível remover o certificado.');
      },
    });
  }

  verCertificado(download = false): void {
    this.api.baixarMeu(download).subscribe({
      next: (blob) => {
        this.revokePreview();
        const url = URL.createObjectURL(blob);
        this.previewUrl = url;
        if (download) {
          const a = document.createElement('a');
          a.href = url;
          a.download = this.dados()?.historico.find((h) => h.vigente)?.nome_arquivo || 'certificado';
          a.click();
        } else {
          window.open(url, '_blank', 'noopener');
        }
      },
      error: (err: HttpErrorResponse) => {
        this.alertas.erro(err.error?.mensagem || 'Não foi possível abrir o certificado.');
      },
    });
  }

  formatDate(iso: string | null | undefined): string {
    if (!iso) return '—';
    const [y, m, d] = iso.slice(0, 10).split('-');
    if (!y || !m || !d) return '—';
    return `${d}/${m}/${y}`;
  }

  hojeIso(): string {
    return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
  }

  private heroDe(status: NscStatus, dados: NscMeu | null) {
    const dias = dados?.dias_restantes;
    const validade = dados?.validade_efetiva ? this.formatDate(dados.validade_efetiva) : '—';

    if (status === 'valido') {
      return {
        tone: 'ok' as HeroTone,
        icone: '✅',
        titulo: 'Certificado válido',
        texto: 'Você está regular para atuar em eventos.',
        validade,
        sub: dias != null ? `faltam ${dias} dias` : 'regular',
      };
    }
    if (status === 'aguardando_aprovacao') {
      const nomeLido = dados?.pedido_aprovacao?.nome_lido || dados?.nome_lido_pendente;
      const motivo = dados?.pedido_aprovacao?.motivo_aprovacao;
      return {
        tone: 'wait' as HeroTone,
        icone: '⏳',
        titulo: 'Aguardando aprovação do RH',
        texto: nomeLido
          ? `O certificado está em nome de ${nomeLido}. O RH precisa confirmar que é o seu.${
              motivo ? ` Motivo: ${motivo}` : ''
            }`
          : 'O RH vai conferir o nome do certificado antes de validar.',
        validade,
        sub: 'aguardando aprovação',
      };
    }
    if (status === 'a_vencer') {
      return {
        tone: 'wait' as HeroTone,
        icone: '⏳',
        titulo: 'Seu certificado vence em breve',
        texto: 'Renove para não perder a validade e continuar escalável em eventos.',
        validade,
        sub: dias != null ? `faltam ${dias} dias` : 'a vencer',
      };
    }
    if (status === 'vencido') {
      const atraso = dias != null ? Math.abs(dias) : null;
      return {
        tone: 'bad' as HeroTone,
        icone: '⚠️',
        titulo: 'Certificado vencido',
        texto: 'Refaça o curso e envie o novo certificado o quanto antes.',
        validade,
        sub: atraso != null ? `vencido há ${atraso} dias` : 'vencido',
      };
    }
    if (status === 'nao_obrigatorio') {
      return {
        tone: 'neutral' as HeroTone,
        icone: '📄',
        titulo: 'Certificado não obrigatório',
        texto: 'O RH não marcou esta certificação como obrigatória para você.',
        validade,
        sub: 'não obrigatório',
      };
    }
    return {
      tone: 'neutral' as HeroTone,
      icone: '📄',
      titulo: 'Nenhum certificado enviado',
      texto: 'Você foi marcado como obrigatório pelo RH. Faça o curso gratuito e envie seu certificado.',
      validade: '—',
      sub: 'pendente',
    };
  }

  private revokePreview(): void {
    if (this.previewUrl) {
      URL.revokeObjectURL(this.previewUrl);
      this.previewUrl = null;
    }
  }
}
