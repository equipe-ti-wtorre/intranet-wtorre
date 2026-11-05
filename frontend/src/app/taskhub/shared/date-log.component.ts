import { Component, OnChanges, inject, input, signal } from '@angular/core';
import { ApiService, errorMessage } from '../core/api.service';
import { WorkDateLog } from '../core/models';

const KIND: Record<WorkDateLog['kind'], string> = {
  criacao: 'Datas definidas', manual: 'Alteração manual', reajuste: 'Reajuste automático', pausa: 'Pausa', fases: 'Roteiro de fases',
};
const pad2 = (n: number) => String(n).padStart(2, '0');
const dm = (iso: string | null) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}` : '—');
const when = (v: string) => { const d = new Date(v); return `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}/${d.getFullYear()} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`; };

/** Histórico de datas de um projeto. O backend já filtra o que o solicitante pode ver. */
@Component({
  selector: 'app-date-log',
  standalone: true,
  template: `
    @if (loading()) { <p class="muted small">Carregando…</p> }
    @else if (error()) { <p class="muted small">{{ error() }}</p> }
    @else if (!items().length) { <p class="muted small">Nenhuma alteração de datas registrada.</p> }
    @else {
      <ul class="date-log">
        @for (l of items(); track l.id) {
          <li [class]="'date-log__item date-log__item--' + l.kind">
            <div class="date-log__head"><b>{{ kind[l.kind] }}</b><span class="muted small">{{ when(l.created_at) }}@if (l.created_by_name) { · {{ l.created_by_name }} }</span></div>
            <div class="small">
              @if (l.kind === 'criacao') {
                @if (l.new_start) { Início {{ dm(l.new_start) }} }
                @if (l.new_due) { · Entrega {{ dm(l.new_due) }} }
              } @else {
                @if (l.old_start !== l.new_start) { Início {{ dm(l.old_start) }} → <b>{{ dm(l.new_start) }}</b> }
                @if (l.old_due !== l.new_due && (l.old_due || l.new_due)) { @if (l.old_start !== l.new_start) { · } Entrega {{ dm(l.old_due) }} → <b>{{ dm(l.new_due) }}</b> }
              }
            </div>
            @if (l.reason) { <div class="small date-log__reason">{{ l.reason }}</div> }
          </li>
        }
      </ul>
    }
  `,
})
export class DateLogComponent implements OnChanges {
  workId = input.required<number>();
  /** Mude o valor para recarregar depois de salvar. */
  version = input(0);
  private api = inject(ApiService);
  items = signal<WorkDateLog[]>([]);
  loading = signal(false);
  error = signal('');
  kind = KIND;
  dm = dm;
  when = when;

  ngOnChanges() { this.reload(); }
  reload() {
    this.loading.set(true); this.error.set('');
    this.api.workDateLog(this.workId()).subscribe({
      next: l => { this.items.set(l); this.loading.set(false); },
      error: e => { this.loading.set(false); this.error.set(errorMessage(e, 'Não foi possível carregar o histórico de datas.')); },
    });
  }
}
