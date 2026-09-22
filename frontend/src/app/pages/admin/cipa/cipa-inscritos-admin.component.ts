import { HttpErrorResponse } from '@angular/common/http';
import { Component, OnInit, ViewEncapsulation, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { CipaEvento, CipaInscricao } from '../../../models/cipa.model';
import { AlertasService } from '../../../services/alertas.service';
import { CipaService } from '../../../services/cipa.service';
import {
  baixarBlob,
  formatarCpfCipa,
  formatarDataCipaLonga,
  formatarDataHoraPt,
  gerarPdfInscritosCipa,
} from '../../../utils/cipa-admin.util';

@Component({
  selector: 'app-cipa-inscritos-admin',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './cipa-inscritos-admin.component.html',
  styleUrl: './cipa-inscritos-admin.component.scss',
  encapsulation: ViewEncapsulation.None,
})
export class CipaInscritosAdminComponent implements OnInit {
  private readonly api = inject(CipaService);
  private readonly alertas = inject(AlertasService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  readonly carregando = signal(true);
  readonly evento = signal<CipaEvento | null>(null);
  readonly inscritos = signal<CipaInscricao[]>([]);

  ngOnInit(): void {
    const codigo = String(this.route.snapshot.paramMap.get('codigo') || '')
      .trim()
      .toLowerCase();
    if (!/^[a-f0-9]{24}$/.test(codigo)) {
      void this.router.navigate(['/admin/agenda_rh']);
      return;
    }
    this.carregar(codigo);
  }

  formatarData(iso: string): string {
    return formatarDataCipaLonga(iso);
  }

  formatarCpf(cpf: string): string {
    return formatarCpfCipa(cpf);
  }

  formatarInscricao(iso: string): string {
    return formatarDataHoraPt(iso);
  }

  imprimir(): void {
    window.print();
  }

  exportarXlsx(): void {
    const ev = this.evento();
    if (!ev) return;
    this.api.exportarXlsx(ev.codigo).subscribe({
      next: (blob) => baixarBlob(blob, `cipa-inscritos-${ev.codigo}.xlsx`),
      error: (err: HttpErrorResponse) => {
        this.alertas.erro(err.error?.mensagem || 'Não foi possível exportar o Excel.');
      },
    });
  }

  exportarPdf(): void {
    const ev = this.evento();
    if (!ev) return;
    gerarPdfInscritosCipa(ev, this.inscritos());
  }

  async excluir(item: CipaInscricao): Promise<void> {
    const ev = this.evento();
    if (!ev) return;
    const ok = await this.alertas.confirmarExclusao({
      titulo: `Excluir inscrição de ${item.nome_completo}?`,
      texto: 'A vaga deste horário será liberada.',
    });
    if (!ok) return;
    this.api.excluirInscricao(ev.codigo, item.id).subscribe({
      next: () => {
        this.alertas.sucesso('Inscrição excluída.');
        this.carregar(ev.codigo);
      },
      error: (err: HttpErrorResponse) => {
        this.alertas.erro(err.error?.mensagem || 'Não foi possível excluir a inscrição.');
      },
    });
  }

  private carregar(codigo: string): void {
    this.carregando.set(true);
    this.api.inscritos(codigo).subscribe({
      next: (res) => {
        this.evento.set(res.evento);
        this.inscritos.set(res.inscritos || []);
        this.carregando.set(false);
        if (this.route.snapshot.queryParamMap.get('print') === '1') {
          void this.router.navigate([], { relativeTo: this.route, queryParams: {}, replaceUrl: true });
          setTimeout(() => window.print(), 350);
        }
      },
      error: (err: HttpErrorResponse) => {
        this.carregando.set(false);
        this.alertas.erro(err.error?.mensagem || 'Não foi possível carregar as inscrições.');
        void this.router.navigate(['/admin/agenda_rh']);
      },
    });
  }
}
