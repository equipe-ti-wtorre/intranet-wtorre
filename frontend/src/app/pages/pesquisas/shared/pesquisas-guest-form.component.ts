import { Component, computed, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  CapaLayout,
  PesquisasPergunta,
  PesquisasTemplateVisual,
} from '../../../models/pesquisas.model';
import { PesqIconComponent } from './pesq-icon.component';
import { PesquisasMarcaLogosComponent } from './pesquisas-marca-logos.component';
import { PESQUISAS_TPL_WTORRE } from './pesquisas-marca.util';

export interface GuestReorderEvent {
  keys: number[];
  novaLinha: Record<number, boolean>;
}

@Component({
  selector: 'app-pesquisas-guest-form',
  standalone: true,
  imports: [FormsModule, PesqIconComponent, PesquisasMarcaLogosComponent],
  templateUrl: './pesquisas-guest-form.component.html',
})
export class PesquisasGuestFormComponent {
  readonly titulo = input('');
  readonly descricao = input('');
  readonly capaUrl = input<string | null>(null);
  readonly capaLayout = input<CapaLayout>('top');
  readonly capaFocoX = input(50);
  readonly capaFocoY = input(50);
  readonly template = input<PesquisasTemplateVisual | null>(null);
  readonly perguntas = input<PesquisasPergunta[]>([]);
  readonly secoes = input(false);
  readonly respostas = input<Record<string, string>>({});
  readonly mode = input<'preview' | 'answer'>('answer');
  readonly enviando = input(false);
  readonly submitLabel = input('Enviar respostas');

  readonly valorChange = output<{ key: string; valor: string }>();
  readonly arquivoChange = output<{ key: string; file: File | null }>();
  readonly blocosReorder = output<GuestReorderEvent>();
  readonly enviar = output<void>();
  readonly ampliarCapa = output<void>();
  readonly capaFocoChange = output<{ x: number; y: number }>();

  readonly escala = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
  readonly rows = computed(() => this.groupRows(this.perguntas()));

  readonly tpl = computed(() => this.template() || PESQUISAS_TPL_WTORRE);
  readonly capaQuebrouUrl = signal<string | null>(null);
  readonly capaSrc = computed(() => (this.capaUrl() || '').trim() || null);
  readonly mostraCapa = computed(() => {
    const url = this.capaSrc();
    return !!url && this.capaQuebrouUrl() !== url;
  });
  readonly podeArrastarFoco = computed(() => {
    const layout = this.capaLayout();
    return this.mode() === 'preview' && (layout === 'top' || layout === 'bottom');
  });
  readonly focoCss = computed(() => `${this.focoPct(this.capaFocoX())}% ${this.focoPct(this.capaFocoY())}%`);

  private focoDrag: { id: number; x: number; y: number; focoX: number; focoY: number; w: number; h: number } | null =
    null;

  private lastDrop: { targetKey: number; insertBefore: boolean; joinRow: boolean } | null = null;
  private dragKey: number | null = null;
  readonly dropHint = signal<{ targetKey: number; insertBefore: boolean; joinRow: boolean } | null>(
    null
  );

  onCapaError(): void {
    const url = this.capaSrc();
    if (url) this.capaQuebrouUrl.set(url);
  }

  onCapaClick(event: Event): void {
    if (this.mode() !== 'answer') return;
    event.preventDefault();
    event.stopPropagation();
    this.ampliarCapa.emit();
  }

  onFocoDown(event: PointerEvent): void {
    if (!this.podeArrastarFoco()) return;
    const zone = event.currentTarget;
    if (!(zone instanceof HTMLElement)) return;
    event.preventDefault();
    zone.setPointerCapture(event.pointerId);
    this.focoDrag = {
      id: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      focoX: this.focoPct(this.capaFocoX()),
      focoY: this.focoPct(this.capaFocoY()),
      w: zone.clientWidth || 1,
      h: zone.clientHeight || 1,
    };
  }

  onFocoMove(event: PointerEvent): void {
    const drag = this.focoDrag;
    if (!drag || event.pointerId !== drag.id) return;
    const x = this.focoPct(drag.focoX - ((event.clientX - drag.x) / drag.w) * 100);
    const y = this.focoPct(drag.focoY - ((event.clientY - drag.y) / drag.h) * 100);
    this.capaFocoChange.emit({ x, y });
  }

  onFocoUp(event: PointerEvent): void {
    if (this.focoDrag?.id !== event.pointerId) return;
    this.focoDrag = null;
  }

  private focoPct(value: number): number {
    const n = Number(value);
    if (!Number.isFinite(n)) return 50;
    return Math.max(0, Math.min(100, Math.round(n)));
  }

  keyOf(q: PesquisasPergunta, idx = 0): string {
    return String(q.id ?? `p${idx}`);
  }

  keyNum(q: PesquisasPergunta): number {
    return Number(q.id ?? 0);
  }

  rowKey(row: PesquisasPergunta[]): string {
    return row.map((q) => this.keyNum(q)).join('-');
  }

  joinGhostBefore(q: PesquisasPergunta): boolean {
    const hint = this.dropHint();
    return !!hint && hint.joinRow && hint.insertBefore && hint.targetKey === this.keyNum(q);
  }

  joinGhostAfter(q: PesquisasPergunta): boolean {
    const hint = this.dropHint();
    return !!hint && hint.joinRow && !hint.insertBefore && hint.targetKey === this.keyNum(q);
  }

  lineGhostBefore(row: PesquisasPergunta[]): boolean {
    const hint = this.dropHint();
    return !!hint && !hint.joinRow && hint.insertBefore && this.rowHasTarget(row, hint.targetKey);
  }

  lineGhostAfter(row: PesquisasPergunta[]): boolean {
    const hint = this.dropHint();
    return !!hint && !hint.joinRow && !hint.insertBefore && this.rowHasTarget(row, hint.targetKey);
  }

  private rowHasTarget(row: PesquisasPergunta[], targetKey: number): boolean {
    return row.some((q) => this.keyNum(q) === targetKey);
  }

  blocoTipo(q: PesquisasPergunta): string {
    return q.blocoTipo || 'pergunta';
  }

  textoEstilo(q: PesquisasPergunta): string {
    if (q.textoEstilo === 'titulo') return 'titulo';
    return (q.opcoes || [])[0] === 'titulo' ? 'titulo' : 'paragrafo';
  }

  setValor(key: string, valor: string): void {
    this.valorChange.emit({ key, valor });
  }

  escalaPintada(key: string, n: number): boolean {
    const atual = Number(this.respostas()[key]);
    return Number.isFinite(atual) && atual >= n;
  }

  onFile(key: string, ev: Event): void {
    const input = ev.target as HTMLInputElement;
    const file = input.files?.[0] || null;
    this.arquivoChange.emit({ key, file });
    this.valorChange.emit({ key, valor: file ? file.name : '' });
  }

  onSubmit(): void {
    this.enviar.emit();
  }

  onPreviewDragStart(ev: DragEvent, el: HTMLElement): void {
    if (this.mode() !== 'preview') return;
    el.classList.add('dragging');
    this.dragKey = Number(el.getAttribute('data-bid'));
    this.lastDrop = null;
    this.dropHint.set(null);
    if (ev.dataTransfer) {
      ev.dataTransfer.effectAllowed = 'move';
      try {
        ev.dataTransfer.setData('text/plain', '');
      } catch {
        /* ignore */
      }
    }
  }

  onPreviewDragOver(ev: DragEvent, layer: HTMLElement): void {
    if (this.mode() !== 'preview') return;
    ev.preventDefault();
    const dragging = layer.querySelector('.canvas-block.dragging') as HTMLElement | null;
    const info = this.computeDropInfo(layer, ev.clientX, ev.clientY);
    if (!info || info.targetEl === dragging) return;
    this.lastDrop = {
      targetKey: Number(info.targetEl.getAttribute('data-bid')),
      insertBefore: info.insertBefore,
      joinRow: info.joinRow,
    };
    this.dropHint.set(this.lastDrop);
  }

  onPreviewDragLeave(ev: DragEvent, layer: HTMLElement): void {
    if (this.mode() !== 'preview') return;
    const next = ev.relatedTarget as Node | null;
    if (next && layer.contains(next)) return;
    this.dropHint.set(null);
  }

  onPreviewDragEnd(ev: DragEvent): void {
    if (this.mode() !== 'preview') return;
    const el = (ev.target as HTMLElement).closest('.canvas-block') as HTMLElement | null;
    el?.classList.remove('dragging');
    el?.removeAttribute('draggable');
    const dragKey = this.dragKey ?? Number(el?.getAttribute('data-bid'));
    this.dragKey = null;
    if (!Number.isFinite(dragKey) || !dragKey) {
      this.lastDrop = null;
      this.dropHint.set(null);
      return;
    }
    const novaLinha: Record<number, boolean> = {};
    for (const q of this.perguntas()) {
      novaLinha[this.keyNum(q)] = q.novaLinha !== false;
    }
    if (this.lastDrop && this.lastDrop.joinRow) {
      const target = this.perguntas().find((q) => this.keyNum(q) === this.lastDrop!.targetKey);
      if (this.lastDrop.insertBefore && target) {
        novaLinha[dragKey] = target.novaLinha !== false;
        novaLinha[this.lastDrop.targetKey] = false;
      } else {
        novaLinha[dragKey] = false;
      }
    } else {
      novaLinha[dragKey] = true;
    }
    const keys = this.orderFromDrop(dragKey);
    this.lastDrop = null;
    this.dropHint.set(null);
    this.blocosReorder.emit({ keys, novaLinha });
  }

  enableDrag(el: HTMLElement): void {
    if (this.mode() !== 'preview') return;
    el.setAttribute('draggable', 'true');
  }

  disableDrag(layer: HTMLElement): void {
    layer.querySelectorAll('.canvas-block[draggable="true"]:not(.dragging)').forEach((n) => {
      n.setAttribute('draggable', 'false');
    });
  }

  private uniqueKeys(keys: number[]): number[] {
    const seen = new Set<number>();
    const out: number[] = [];
    for (const k of keys) {
      if (!Number.isFinite(k) || !k || seen.has(k)) continue;
      seen.add(k);
      out.push(k);
    }
    return out;
  }

  private orderFromDrop(dragKey: number): number[] {
    const keys = this.uniqueKeys(this.perguntas().map((q) => this.keyNum(q)));
    const without = keys.filter((k) => k !== dragKey);
    const drop = this.lastDrop;
    if (!drop) return keys;
    const targetIdx = without.indexOf(drop.targetKey);
    if (targetIdx < 0) return this.uniqueKeys([...without, dragKey]);
    without.splice(drop.insertBefore ? targetIdx : targetIdx + 1, 0, dragKey);
    return this.uniqueKeys(without);
  }

  private groupRows(list: PesquisasPergunta[]): PesquisasPergunta[][] {
    const rows: PesquisasPergunta[][] = [];
    for (const q of list) {
      if (q.novaLinha !== false || !rows.length) rows.push([q]);
      else rows[rows.length - 1].push(q);
    }
    return rows;
  }

  private computeDropInfo(
    row: HTMLElement,
    x: number,
    y: number
  ): { targetEl: HTMLElement; insertBefore: boolean; joinRow: boolean } | null {
    const candidates = Array.from(row.querySelectorAll('.canvas-block:not(.dragging)')) as HTMLElement[];
    if (!candidates.length) return null;
    let best: { el: HTMLElement; box: DOMRect } | null = null;
    let bestScore = Infinity;
    for (const el of candidates) {
      const box = el.getBoundingClientRect();
      const score = Math.abs(y - (box.top + box.height / 2)) * 3 + Math.abs(x - (box.left + box.width / 2)) * 0.4;
      if (score < bestScore) {
        bestScore = score;
        best = { el, box };
      }
    }
    if (!best) return null;
    const rel = (x - best.box.left) / best.box.width;
    if (rel < 0.3) return { targetEl: best.el, insertBefore: true, joinRow: true };
    if (rel > 0.7) return { targetEl: best.el, insertBefore: false, joinRow: true };
    const after = y > best.box.top + best.box.height / 2;
    return { targetEl: best.el, insertBefore: !after, joinRow: false };
  }
}
