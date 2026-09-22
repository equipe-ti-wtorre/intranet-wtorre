import { Component, computed, inject } from '@angular/core';
import { NscAlertaService, NscAlertaVariante } from '../../services/nsc-alerta.service';

@Component({
  selector: 'app-nsc-alerta-modal',
  standalone: true,
  templateUrl: './nsc-alerta-modal.component.html',
  styleUrl: './nsc-alerta-modal.component.scss',
})
export class NscAlertaModalComponent {
  readonly alerta = inject(NscAlertaService);

  readonly copy = computed(() => {
    const estado = this.alerta.estado();
    if (!estado) return null;
    return copyDaVariante(estado.variante);
  });

  readonly validadeChip = computed(() => {
    const estado = this.alerta.estado();
    if (!estado) return null;
    const validade = formatarDataNsc(estado.dados.validade_efetiva);
    const dias = estado.dados.dias_restantes;
    if (estado.variante === 'vencido') {
      const atraso = dias != null ? Math.abs(dias) : null;
      return atraso != null
        ? `Validade: ${validade} · vencido há ${atraso} dia${atraso === 1 ? '' : 's'}`
        : `Validade: ${validade}`;
    }
    if (estado.variante === 'a_vencer') {
      return dias != null
        ? `Validade: ${validade} · faltam ${dias} dia${dias === 1 ? '' : 's'}`
        : `Validade: ${validade}`;
    }
    return null;
  });

  abrirCurso(): void {
    const url = this.alerta.estado()?.dados.link_renovacao;
    if (url) window.open(url, '_blank', 'noopener');
  }

  abrirPortal(): void {
    const url = this.alerta.estado()?.dados.link_portal;
    if (url) window.open(url, '_blank', 'noopener');
  }

  enviarCertificado(): void {
    this.alerta.irParaEnvio();
  }

  lembrarDepois(): void {
    this.alerta.lembrarDepois();
  }
}

function formatarDataNsc(iso: string | null | undefined): string {
  if (!iso) return '—';
  const [y, m, d] = iso.slice(0, 10).split('-');
  if (!y || !m || !d) return '—';
  return `${d}/${m}/${y}`;
}

function copyDaVariante(variante: NscAlertaVariante) {
  if (variante === 'vencido') {
    return {
      kicker: 'Certificado vencido',
      titulo: 'Seu certificado Não se Cale está vencido',
      texto:
        'Enquanto estiver vencido, você fica irregular para ser escalado em eventos. Renove a capacitação e envie o novo certificado para regularizar.',
      primario: 'Renovar certificado',
      secundario: 'Já renovei — enviar certificado',
    };
  }
  if (variante === 'a_vencer') {
    return {
      kicker: 'Vence em breve',
      titulo: 'Seu certificado Não se Cale vence em breve',
      texto:
        'Renove com antecedência para não ficar irregular e continuar apto a atuar em eventos.',
      primario: 'Renovar agora',
      secundario: 'Enviar novo certificado',
    };
  }
  return {
    kicker: 'Ação necessária',
    titulo: 'Você ainda não enviou seu certificado Não se Cale',
    texto:
      'A capacitação do Protocolo Não se Cale é obrigatória por lei para atuar em eventos. É gratuita e online. Faça o curso e envie seu certificado para continuar apto a ser escalado.',
    primario: 'Fazer o curso gratuito',
    secundario: 'Já fiz — enviar certificado',
  };
}
