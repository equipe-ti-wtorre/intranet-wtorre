import { Component, computed, input, output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { PesquisasPergunta, PesquisasTemplateVisual } from '../../../models/pesquisas.model';
import { PesqIconComponent } from './pesq-icon.component';

@Component({
  selector: 'app-pesquisas-guest-form',
  standalone: true,
  imports: [FormsModule, PesqIconComponent],
  templateUrl: './pesquisas-guest-form.component.html',
})
export class PesquisasGuestFormComponent {
  readonly titulo = input('');
  readonly descricao = input('');
  readonly capaUrl = input<string | null>(null);
  readonly template = input<PesquisasTemplateVisual | null>(null);
  readonly perguntas = input<PesquisasPergunta[]>([]);
  readonly secoes = input(false);
  readonly respostas = input<Record<string, string>>({});
  readonly mode = input<'preview' | 'answer'>('answer');
  readonly enviando = input(false);
  readonly submitLabel = input('Enviar respostas');

  readonly valorChange = output<{ key: string; valor: string }>();
  readonly enviar = output<void>();

  readonly escala = [1, 2, 3, 4, 5];

  readonly tpl = computed(
    () =>
      this.template() || {
        codigo: 'wtorre',
        nome: 'WTorre',
        wordmark: 'WTORRE',
        corPrimaria: '#0f1e3d',
        corPrimariaEscura: '#080e1e',
        raioPx: 10,
      }
  );

  keyOf(q: PesquisasPergunta, idx: number): string {
    return String(q.id ?? `p${idx}`);
  }

  setValor(key: string, valor: string): void {
    this.valorChange.emit({ key, valor });
  }

  onSubmit(): void {
    if (this.mode() === 'preview') {
      this.enviar.emit();
      return;
    }
    this.enviar.emit();
  }
}
