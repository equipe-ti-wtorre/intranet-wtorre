import { Component, input, output } from '@angular/core';
import { AdminModalComponent } from '../../../shared/admin/admin-modal/admin-modal.component';
import { PesquisasHistoricoItem } from '../../../models/pesquisas.model';

const ACAO_LABEL: Record<string, string> = {
  compartilhou: 'Compartilhou o acesso',
  revogou: 'Removeu o acesso',
  mudou_papel: 'Alterou o papel',
  salvou: 'Salvou o formulário',
  publicou: 'Publicou',
  despublicou: 'Despublicou',
  ativou: 'Ativou o evento',
  desativou: 'Desativou o evento',
  encerrou: 'Encerrou',
  convidado_add: 'Incluiu convidado',
  convidado_upd: 'Atualizou convidado',
  convidado_del: 'Removeu convidado',
  convidados_lote: 'Importou convidados',
  capa_up: 'Atualizou a capa',
  capa_del: 'Removeu a capa',
};

@Component({
  selector: 'app-pesquisas-historico-modal',
  standalone: true,
  imports: [AdminModalComponent],
  templateUrl: './pesquisas-historico-modal.component.html',
  styleUrl: './pesquisas-historico-modal.component.scss',
})
export class PesquisasHistoricoModalComponent {
  readonly open = input(false);
  readonly itens = input<PesquisasHistoricoItem[]>([]);
  readonly carregando = input(false);
  readonly fechar = output<void>();

  rotulo(acao: string): string {
    return ACAO_LABEL[acao] || acao;
  }

  quando(iso: string | null | undefined): string {
    if (!iso) return '';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return String(iso);
    return d.toLocaleString('pt-BR');
  }
}
