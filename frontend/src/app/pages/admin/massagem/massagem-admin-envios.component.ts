import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { MassagemService } from '../../../services/massagem.service';
import { AlertasService } from '../../../services/alertas.service';
import { MassagemEmailEnvio } from '../../../models/massagem.model';

const TIPOS = [
  { codigo: '', nome: 'Todos os tipos' },
  { codigo: 'disparo_evento', nome: 'Disparo' },
  { codigo: 'reserva_confirmada', nome: 'Confirmação' },
  { codigo: 'cancelamento', nome: 'Cancelamento' },
  { codigo: 'fila_vaga', nome: 'Fila' },
  { codigo: 'falta_admin', nome: 'Falta' },
  { codigo: 'lembrete', nome: 'Lembrete' },
] as const;

@Component({
  selector: 'app-massagem-admin-envios',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './massagem-admin-envios.component.html',
  styleUrl: './massagem-admin-envios.component.scss',
})
export class MassagemAdminEnviosComponent implements OnInit {
  private readonly api = inject(MassagemService);
  private readonly alertas = inject(AlertasService);

  readonly tiposFiltro = TIPOS;
  readonly loading = signal(true);
  readonly envios = signal<MassagemEmailEnvio[]>([]);
  readonly expandido = signal<Record<string, boolean>>({});
  tipoFiltro = '';
  buscaInput = '';
  private buscaTimer: ReturnType<typeof setTimeout> | null = null;

  ngOnInit(): void {
    this.carregar();
  }

  carregar(): void {
    this.loading.set(true);
    this.api
      .listEmailEnvios({
        email: this.buscaInput.trim(),
        tipo: this.tipoFiltro,
      })
      .subscribe({
        next: (list) => {
          this.envios.set(list);
          this.loading.set(false);
        },
        error: (err: HttpErrorResponse) => {
          this.alertas.erro(err.error?.mensagem || 'Erro ao carregar envios.');
          this.envios.set([]);
          this.loading.set(false);
        },
      });
  }

  onBusca(valor: string): void {
    this.buscaInput = valor;
    if (this.buscaTimer) clearTimeout(this.buscaTimer);
    this.buscaTimer = setTimeout(() => this.carregar(), 300);
  }

  onTipo(valor: string): void {
    this.tipoFiltro = valor;
    this.carregar();
  }

  toggleDestinos(id: string): void {
    const atual = this.expandido();
    this.expandido.set({ ...atual, [id]: !atual[id] });
  }

  labelTipo(tipo: string): string {
    return TIPOS.find((t) => t.codigo === tipo)?.nome || tipo;
  }

  labelModo(modo: string): string {
    if (modo === 'lista') return 'Lista';
    if (modo === 'teste') return 'Teste';
    return 'Direto';
  }

  labelStatus(status: string): string {
    if (status === 'ok') return 'Enviado';
    if (status === 'parcial') return 'Parcial';
    if (status === 'enviando') return 'Enviando';
    if (status === 'erro') return 'Falha';
    return status;
  }

  statusClass(status: string): string {
    if (status === 'ok' || status === 'enviado') return '';
    if (status === 'parcial' || status === 'enviando') return 'warn';
    return 'off';
  }

  formatQuando(iso: string | Date | undefined): string {
    if (!iso) return '—';
    const d = iso instanceof Date ? iso : new Date(iso);
    if (Number.isNaN(d.getTime())) return '—';
    return d.toLocaleString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  resumo(envio: MassagemEmailEnvio): string {
    const ok = envio.enviados;
    const falhas = envio.falhas;
    if (falhas > 0) return `${ok} enviado(s), ${falhas} falha(s)`;
    return `${ok} enviado(s)`;
  }

  eventoLabel(envio: MassagemEmailEnvio): string {
    if (!envio.eventoNm && !envio.eventoData) return '—';
    if (envio.eventoNm && envio.eventoData) {
      const [y, m, d] = envio.eventoData.split('-');
      if (y && m && d) return `${envio.eventoNm} · ${d}/${m}/${y}`;
      return `${envio.eventoNm} · ${envio.eventoData}`;
    }
    return envio.eventoNm || envio.eventoData;
  }
}
