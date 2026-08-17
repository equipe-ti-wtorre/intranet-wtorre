import { Component, Input, Output, EventEmitter, computed, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AssinaturaItem } from '../../../models/assinatura.model';
import { resolverDominio } from '../../../utils/assinatura-domains';
import { AssinaturaPreviewComponent } from '../assinatura-preview/assinatura-preview.component';

@Component({
  selector: 'app-assinatura-card',
  standalone: true,
  imports: [FormsModule, AssinaturaPreviewComponent],
  templateUrl: './assinatura-card.component.html',
  styleUrl: './assinatura-card.component.scss',
})
export class AssinaturaCardComponent {
  private readonly itemSig = signal<AssinaturaItem | null>(null);

  @Input({ required: true })
  set item(value: AssinaturaItem) {
    this.itemSig.set(value);
  }
  get item(): AssinaturaItem {
    return this.itemSig()!;
  }

  @Input() editavel = true;
  @Input() mostrarCheckbox = true;
  @Input() isPadrao = false;

  @Output() itemChange = new EventEmitter<AssinaturaItem>();
  @Output() selecaoChange = new EventEmitter<boolean>();
  @Output() padraoChange = new EventEmitter<void>();
  @Output() remover = new EventEmitter<void>();
  @Output() copiarOwa = new EventEmitter<void>();

  readonly dominioCfg = computed(() => {
    const it = this.itemSig();
    if (!it) return null;
    return resolverDominio(it.email);
  });

  readonly dominioDesconhecido = computed(() => !this.dominioCfg());

  readonly payload = computed(() => {
    const it = this.itemSig();
    if (!it) return null;
    return {
      email: it.email,
      tipo: it.tipo,
      nome: it.nome,
      cargo: it.cargo,
      telefone: it.telefone,
      celular: it.celular,
      dominioEstilo: it.dominioEstilo,
    };
  });

  emitChange(patch: Partial<AssinaturaItem>): void {
    const current = this.itemSig();
    if (!current) return;
    const updated = { ...current, ...patch };
    this.itemSig.set(updated);
    this.itemChange.emit(updated);
  }

  onSelecao(checked: boolean): void {
    this.emitChange({ selecionada: checked });
    this.selecaoChange.emit(checked);
  }

  onPadrao(checked: boolean): void {
    if (!checked) return;
    if (!this.item.selecionada) {
      this.emitChange({ selecionada: true });
      this.selecaoChange.emit(true);
    }
    this.padraoChange.emit();
  }

  onRemover(): void {
    this.remover.emit();
  }

  onCopiarOwa(): void {
    this.copiarOwa.emit();
  }
}
