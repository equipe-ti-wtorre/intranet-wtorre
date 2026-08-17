import { Component, input, output, ViewEncapsulation } from '@angular/core';
import { DocCatIconeComponent } from '../../documentos/doc-cat-icone.component';

export type AdminModalIcon = 'folder' | 'tenant';
export type AdminModalSize = 'default' | 'wide' | 'xlarge';

@Component({
  selector: 'app-admin-modal',
  standalone: true,
  imports: [DocCatIconeComponent],
  templateUrl: './admin-modal.component.html',
  styleUrl: './admin-modal.component.scss',
  encapsulation: ViewEncapsulation.None,
})
export class AdminModalComponent {
  readonly open = input(false);
  readonly title = input('');
  readonly subtitle = input('');
  readonly icon = input<AdminModalIcon>('folder');
  readonly headerIcon = input<string | null>(null);
  readonly salvando = input(false);
  readonly saveDisabled = input(false);
  readonly saveLabel = input('Salvar');
  readonly size = input<AdminModalSize>('default');

  readonly save = output<void>();
  readonly cancel = output<void>();

  private backdropGuardUntil = 0;

  onBodyPointerDown(event: PointerEvent): void {
    const target = event.target;
    if (target instanceof HTMLInputElement && target.type === 'file') {
      this.backdropGuardUntil = Date.now() + 800;
    }
  }

  onBackdropClick(event: MouseEvent): void {
    if (event.target !== event.currentTarget) return;
    if (Date.now() < this.backdropGuardUntil) return;
    this.cancel.emit();
  }

  onSave(): void {
    this.save.emit();
  }

  onCancel(): void {
    this.cancel.emit();
  }
}
