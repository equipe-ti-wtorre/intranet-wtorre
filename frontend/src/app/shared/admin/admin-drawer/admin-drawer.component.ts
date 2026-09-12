import { Component, input, output } from '@angular/core';

@Component({
  selector: 'app-admin-drawer',
  standalone: true,
  templateUrl: './admin-drawer.component.html',
  styleUrl: './admin-drawer.component.scss',
})
export class AdminDrawerComponent {
  readonly open = input(false);
  readonly title = input('');
  readonly salvando = input(false);
  readonly saveLabel = input('Salvar');

  readonly save = output<void>();
  readonly cancel = output<void>();

  onBackdropClick(): void {
    this.cancel.emit();
  }

  onSave(): void {
    this.save.emit();
  }

  onCancel(): void {
    this.cancel.emit();
  }
}
