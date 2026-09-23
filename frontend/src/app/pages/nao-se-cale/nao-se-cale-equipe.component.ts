import { DatePipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, OnInit, computed, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  NscAcesso,
  NscCertificadoDetalhe,
  NscColaboradorAdmin,
  NscEquipeKpis,
  NscStatus,
} from '../../models/nsc.model';
import { AlertasService } from '../../services/alertas.service';
import { NscService } from '../../services/nsc.service';
import { baixarBlob } from '../../utils/cipa-admin.util';
import {
  formatarDataNsc,
  iniciaisNsc,
  labelStatusNsc,
  toneStatusNsc,
} from '../../utils/nsc-admin.util';

const PAGE_SIZE = 10;

@Component({
  selector: 'app-nao-se-cale-equipe',
  standalone: true,
  imports: [FormsModule, DatePipe],
  templateUrl: './nao-se-cale-equipe.component.html',
  styleUrl: './nao-se-cale-equipe.component.scss',
})
export class NaoSeCaleEquipeComponent implements OnInit {
  private readonly api = inject(NscService);
  private readonly alertas = inject(AlertasService);

  readonly acesso = input.required<NscAcesso>();

  readonly carregando = signal(true);
  readonly erro = signal('');
  readonly busca = signal('');
  readonly departamento = signal('');
  readonly statusFiltro = signal<NscStatus | ''>('');
  readonly pagina = signal(1);
  readonly kpis = signal<NscEquipeKpis | null>(null);
  readonly departamentos = signal<string[]>([]);
  readonly colaboradores = signal<NscColaboradorAdmin[]>([]);
  readonly exportando = signal(false);
  readonly lembrando = signal(false);
  readonly detalhe = signal<NscCertificadoDetalhe | null>(null);
  readonly detalheAberto = signal(false);

  readonly permissoes = computed(() => this.acesso().permissoes || {
    baixar: false,
    exportar: false,
    lembrar: false,
    aprovar: false,
  });

  readonly filtrados = computed(() => {
    const q = this.busca().trim().toLowerCase();
    const depto = this.departamento();
    const st = this.statusFiltro();
    return this.colaboradores().filter((c) => {
      if (depto && c.departamento !== depto) return false;
      if (st && c.status !== st) return false;
      if (!q) return true;
      const hay = `${c.nome} ${c.cargo || ''} ${c.departamento || ''}`.toLowerCase();
      return hay.includes(q);
    });
  });

  readonly totalFiltrado = computed(() => this.filtrados().length);
  readonly totalPaginas = computed(() => Math.max(1, Math.ceil(this.totalFiltrado() / PAGE_SIZE)));
  readonly paginaAtual = computed(() => {
    const list = this.filtrados();
    const page = Math.min(this.pagina(), this.totalPaginas());
    const start = (page - 1) * PAGE_SIZE;
    return list.slice(start, start + PAGE_SIZE);
  });

  readonly chips = computed(() => {
    const all = this.colaboradores();
    const count = (s: NscStatus) => all.filter((c) => c.status === s).length;
    return [
      { id: '' as const, label: 'Todos', n: all.length },
      { id: 'vencido' as const, label: 'Vencido', n: count('vencido') },
      { id: 'a_vencer' as const, label: 'A vencer', n: count('a_vencer') },
      { id: 'pendente' as const, label: 'Pendente', n: count('pendente') },
      { id: 'aguardando_aprovacao' as const, label: 'Em análise', n: count('aguardando_aprovacao') },
      { id: 'valido' as const, label: 'Vigente', n: count('valido') },
    ];
  });

  ngOnInit(): void {
    this.carregar();
  }

  carregar(): void {
    this.carregando.set(true);
    this.erro.set('');
    this.api.listarEquipe().subscribe({
      next: (res) => {
        this.kpis.set(res.kpis);
        this.departamentos.set(res.departamentos);
        this.colaboradores.set(res.colaboradores);
        this.carregando.set(false);
      },
      error: (err: HttpErrorResponse) => {
        this.erro.set(err.error?.mensagem || 'Não foi possível carregar a equipe.');
        this.carregando.set(false);
      },
    });
  }

  setStatus(id: NscStatus | ''): void {
    this.statusFiltro.set(id);
    this.pagina.set(1);
  }

  onBusca(value: string): void {
    this.busca.set(value);
    this.pagina.set(1);
  }

  onDepto(value: string): void {
    this.departamento.set(value);
    this.pagina.set(1);
  }

  iniciais(nome: string): string {
    return iniciaisNsc(nome);
  }

  labelStatus(status: NscStatus): string {
    return labelStatusNsc(status);
  }

  tone(status: NscStatus): 'ok' | 'wait' | 'bad' | 'neutral' {
    return toneStatusNsc(status);
  }

  formatDate(iso: string | null | undefined): string {
    return formatarDataNsc(iso);
  }

  pctRegulares(k: NscEquipeKpis): number {
    if (!k.obrigatorios) return 0;
    return Math.round((k.validos / k.obrigatorios) * 100);
  }

  validadeSub(c: NscColaboradorAdmin): string {
    if (c.status === 'aguardando_aprovacao') return 'aguardando validação';
    if (c.status === 'pendente') return 'nenhum envio';
    if (c.dias_restantes == null) return '';
    if (c.dias_restantes < 0) return `venceu há ${Math.abs(c.dias_restantes)} dia${Math.abs(c.dias_restantes) === 1 ? '' : 's'}`;
    return `faltam ${c.dias_restantes} dia${c.dias_restantes === 1 ? '' : 's'}`;
  }

  exportar(): void {
    this.exportando.set(true);
    this.api.exportarEquipeXlsx(this.departamento() || undefined).subscribe({
      next: (blob) => {
        baixarBlob(blob, 'nsc-equipe.xlsx');
        this.exportando.set(false);
      },
      error: (err: HttpErrorResponse) => {
        this.exportando.set(false);
        this.alertas.erro(err.error?.mensagem || 'Falha ao exportar a planilha.');
      },
    });
  }

  lembrar(adObjectId?: string): void {
    this.lembrando.set(true);
    this.api
      .lembrarEquipe({
        ad_object_id: adObjectId,
        departamento: this.departamento() || undefined,
      })
      .subscribe({
        next: (r) => {
          this.lembrando.set(false);
          this.alertas.sucesso(
            r.enviados
              ? `${r.enviados} lembrete(s) enviado(s).`
              : 'Nenhum lembrete enviado (já notificado hoje ou sem e-mail).'
          );
        },
        error: (err: HttpErrorResponse) => {
          this.lembrando.set(false);
          this.alertas.erro(err.error?.mensagem || 'Falha ao enviar lembretes.');
        },
      });
  }

  baixar(c: NscColaboradorAdmin, download = true): void {
    if (!c.arquivo_id) {
      this.alertas.erro('Este colaborador ainda não enviou certificado.');
      return;
    }
    this.api.baixarEquipe(c.ad_object_id, download).subscribe({
      next: (blob) => {
        if (download) {
          baixarBlob(blob, `${c.nome || 'certificado'}.pdf`);
        } else {
          const url = URL.createObjectURL(blob);
          window.open(url, '_blank', 'noopener');
        }
      },
      error: (err: HttpErrorResponse) => {
        this.alertas.erro(err.error?.mensagem || 'Não foi possível abrir o certificado.');
      },
    });
  }

  abrirDetalhe(c: NscColaboradorAdmin): void {
    this.api.detalheEquipe(c.ad_object_id).subscribe({
      next: (d) => {
        this.detalhe.set(d);
        this.detalheAberto.set(true);
      },
      error: (err: HttpErrorResponse) => {
        this.alertas.erro(err.error?.mensagem || 'Não foi possível abrir os detalhes.');
      },
    });
  }

  fecharDetalhe(): void {
    this.detalheAberto.set(false);
    this.detalhe.set(null);
  }

  aprovar(envioId: number): void {
    const motivo = window.prompt('Motivo da aprovação')?.trim();
    if (!motivo) return;
    this.api.aprovarEquipe(envioId, motivo).subscribe({
      next: () => {
        this.alertas.sucesso('Certificado aprovado.');
        this.fecharDetalhe();
        this.carregar();
      },
      error: (err: HttpErrorResponse) => {
        this.alertas.erro(err.error?.mensagem || 'Falha ao aprovar.');
      },
    });
  }

  rejeitar(envioId: number): void {
    const motivo = window.prompt('Motivo da recusa')?.trim();
    if (!motivo) return;
    this.api.rejeitarEquipe(envioId, motivo).subscribe({
      next: () => {
        this.alertas.sucesso('Certificado recusado.');
        this.fecharDetalhe();
        this.carregar();
      },
      error: (err: HttpErrorResponse) => {
        this.alertas.erro(err.error?.mensagem || 'Falha ao recusar.');
      },
    });
  }

  anterior(): void {
    this.pagina.set(Math.max(1, this.pagina() - 1));
  }

  proxima(): void {
    this.pagina.set(Math.min(this.totalPaginas(), this.pagina() + 1));
  }
}
