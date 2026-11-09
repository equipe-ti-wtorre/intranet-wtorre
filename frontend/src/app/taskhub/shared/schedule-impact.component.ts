import { Component, input, output } from '@angular/core';
import { SchedulePreview, ScheduleConflict } from '../core/models';

// Aviso de datas coincidentes: cada projeto implicado pode aceitar o reajuste ou ficar junto.
@Component({
  selector: 'app-schedule-impact',
  standalone: true,
  template: `
    @if (impact(); as imp) {
      <div class="wk-impact">
        <p>Estas datas coincidem com outros {{ many() }} do mesmo responsável. Marque os que aceitam reajuste; os desmarcados ficam ao mesmo tempo que este.</p>
        <ul class="wk-impact__list">
          @for (c of imp.conflicts; track c.work_id) {
            <li>
              <label class="wk-impact__item">
                <input type="checkbox" [checked]="c.accepted" (change)="toggle.emit(c.work_id)" [attr.aria-label]="'Aceitar reajuste de ' + c.name" />
                <span class="wk-impact__body">
                  <span><b>{{ c.name }}</b>
                    @if (c.requester_names.length) { <span class="muted"> · Solicitante: {{ c.requester_names.join(', ') }}</span> }
                    @if (c.owner_names.length) { <span class="muted"> · Responsável: {{ c.owner_names.join(', ') }}</span> }
                  </span>
                  <span class="muted small">Hoje: início {{ fmt(c.start) }} · previsão final {{ fmt(c.end) }}@if (c.in_progress) { · já começou }</span>
                  @if (c.accepted) {
                    <span class="small">Novo: início <b>{{ fmt(c.new_start) }}</b> · previsão final <b>{{ fmt(c.new_end) }}</b></span>
                    @if (c.pause; as p) {
                      <span class="small wk-impact__pause">Fica em pausa de {{ fmt(p.start) }} a {{ fmt(p.end) }}. Avisamos o solicitante e o responsável.</span>
                    }
                  } @else {
                    <span class="small muted">{{ stayText(c) }}</span>
                  }
                </span>
              </label>
            </li>
          }
        </ul>
        @if (imp.suggestion) {
          <p class="small wk-impact__sug">Sugiro começar em <b>{{ fmt(imp.suggestion.start) }}</b> (previsão final {{ fmt(imp.suggestion.due) }}) para não reajustar nenhum projeto.
            <button type="button" class="btn btn-sm" (click)="useSuggested.emit()">Usar data sugerida</button></p>
        }
      </div>
    }
  `,
})
export class ScheduleImpactComponent {
  impact = input<SchedulePreview | null>(null);
  many = input('projetos');
  toggle = output<number>();
  useSuggested = output<void>();

  stayText(c: ScheduleConflict) {
    return c.overlaps ? 'Fica como está, ao mesmo tempo que este.' : 'Fica como está.';
  }
  fmt(iso: string | null | undefined) {
    if (!iso) return '—';
    const [y, m, d] = iso.slice(0, 10).split('-');
    return `${d}/${m}/${y}`;
  }
}

/** Nenhum projeto implicado aceitou o reajuste: salvar deixa todos juntos. */
export function noneAccepted(imp: SchedulePreview | null) {
  return !!imp?.conflicts.length && imp.conflicts.every(c => !c.accepted);
}
