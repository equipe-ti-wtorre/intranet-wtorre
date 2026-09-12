import { Directive, ElementRef, HostListener, inject } from '@angular/core';
import { NgControl } from '@angular/forms';
import { applyAniversarioMaskToInput } from '../../utils/aniversario-mask.util';

@Directive({
  selector: '[appAniversarioMask]',
  standalone: true,
})
export class AniversarioMaskDirective {
  private readonly el = inject(ElementRef<HTMLInputElement>);
  private readonly ngControl = inject(NgControl, { optional: true, self: true });

  @HostListener('input')
  onInput(): void {
    this.syncMask();
  }

  @HostListener('blur')
  onBlur(): void {
    this.syncMask();
  }

  private syncMask(): void {
    const input = this.el.nativeElement;
    applyAniversarioMaskToInput(input);
    const masked = input.value;
    const ctrl = this.ngControl?.control;
    if (ctrl && ctrl.value !== masked) {
      ctrl.setValue(masked, { emitEvent: true });
    }
  }
}
