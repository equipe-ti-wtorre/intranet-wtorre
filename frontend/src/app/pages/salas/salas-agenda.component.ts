import { Component, computed, input, output } from '@angular/core';
import { Sala, SlotPeriod } from '../../models/salas.model';
import { TimeSlot } from '../../models/salas.model';
import { getBookableSlots, resolveBookableSlotClick } from './salas.utils';

@Component({
  selector: 'app-salas-agenda',
  standalone: true,
  templateUrl: './salas-agenda.component.html',
  styleUrl: './salas.component.scss',
})
export class SalasAgendaComponent {
  readonly sala = input.required<Sala>();
  readonly localidadeLabel = input('');
  readonly occupancyPercent = input(0);
  readonly periods = input<SlotPeriod[]>([]);
  readonly daySlots = input<TimeSlot[]>([]);
  readonly dataIso = input('');
  readonly carregando = input(false);

  readonly slotSelecionado = input<TimeSlot | null>(null);

  readonly voltar = output<void>();
  readonly dataChange = output<string>();
  readonly slotClick = output<TimeSlot>();

  readonly statusMsg = computed(
    () => `Status atual: ${this.occupancyPercent()}% do tempo do dia está ocupado.`
  );

  readonly bookableSlots = computed(() =>
    getBookableSlots(this.daySlots(), new Date(), this.dataIso())
  );

  isSelected(slot: TimeSlot): boolean {
    const sel = this.slotSelecionado();
    if (!sel) return false;
    if (sel.start.getTime() === slot.start.getTime()) return true;
    if (sel.partial && slot.status === 'free') {
      const selBlock =
        Math.floor((sel.start.getHours() * 60 + sel.start.getMinutes()) / 30) * 30;
      const slotBlock =
        Math.floor((slot.start.getHours() * 60 + slot.start.getMinutes()) / 30) * 30;
      return selBlock === slotBlock;
    }
    return false;
  }

  onDataInput(ev: Event): void {
    const el = ev.target as HTMLInputElement;
    if (el.value) this.dataChange.emit(el.value);
  }

  onSlotClick(slot: TimeSlot): void {
    if (slot.status !== 'free') return;
    const effective = resolveBookableSlotClick(slot, this.bookableSlots());
    this.slotClick.emit(effective);
  }
}
