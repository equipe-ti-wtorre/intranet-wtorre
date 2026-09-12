import { Injectable } from '@angular/core';
import Swal from 'sweetalert2';

@Injectable({ providedIn: 'root' })
export class AlertasService {
  private readonly toast = Swal.mixin({
    toast: true,
    position: 'top-end',
    showConfirmButton: false,
    timer: 3500,
    timerProgressBar: true,
    customClass: { popup: 'swal-wtorre-toast' },
  });

  sucesso(mensagem: string): void {
    this.toast.fire({ icon: 'success', title: mensagem });
  }

  erro(mensagem: string): void {
    this.toast.fire({ icon: 'error', title: mensagem, timer: 5000 });
  }

  async confirmar(opts: {
    titulo: string;
    texto?: string;
    html?: string;
    confirmar?: string;
    cancelar?: string;
    icon?: 'warning' | 'question';
  }): Promise<boolean> {
    const r = await Swal.fire({
      title: opts.titulo,
      text: opts.texto,
      html: opts.html,
      icon: opts.icon ?? 'question',
      showCancelButton: true,
      confirmButtonText: opts.confirmar ?? 'Confirmar',
      cancelButtonText: opts.cancelar ?? 'Cancelar',
      focusCancel: true,
      customClass: {
        popup: 'swal-wtorre',
        confirmButton: 'swal-wtorre-confirm',
        cancelButton: 'swal-wtorre-cancel',
      },
    });
    return r.isConfirmed;
  }

  async confirmarExclusao(opts: {
    titulo?: string;
    texto?: string;
    html?: string;
  }): Promise<boolean> {
    const r = await Swal.fire({
      title: opts.titulo ?? 'Confirmar exclusão',
      text: opts.texto,
      html: opts.html,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Excluir',
      cancelButtonText: 'Cancelar',
      focusCancel: true,
      customClass: {
        popup: 'swal-wtorre',
        confirmButton: 'swal-wtorre-danger',
        cancelButton: 'swal-wtorre-cancel',
      },
    });
    return r.isConfirmed;
  }
}
