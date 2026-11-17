import { AfterViewInit, Directive, ElementRef, OnDestroy, inject, input, output } from '@angular/core';

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
let seq = 0;

// Caixa de diálogo acessível: role/aria, foco preso dentro, Esc fecha só ela e o foco
// volta para quem a abriu. Usar no elemento .modal ou .drawer:
//   <div class="modal" appDialog (dialogClose)="close()">
@Directive({ selector: '[appDialog]', standalone: true })
export class DialogDirective implements AfterViewInit, OnDestroy {
  private host = inject<ElementRef<HTMLElement>>(ElementRef);
  // Sem rótulo explícito, usa o primeiro .modal-head / h2 / .drawer-title de dentro.
  dialogLabel = input<string>('', { alias: 'appDialog' });
  dialogClose = output<void>();
  private opener: HTMLElement | null = null;
  private keydown = (e: KeyboardEvent) => this.onKey(e);

  ngAfterViewInit() {
    const el = this.host.nativeElement;
    this.opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    if (!el.getAttribute('role')) el.setAttribute('role', 'dialog');
    el.setAttribute('aria-modal', 'true');
    if (!el.hasAttribute('tabindex')) el.setAttribute('tabindex', '-1');
    if (this.dialogLabel()) el.setAttribute('aria-label', this.dialogLabel());
    else if (!el.hasAttribute('aria-label') && !el.hasAttribute('aria-labelledby')) {
      const head = el.querySelector<HTMLElement>('.modal-head h2, .modal-head__title, .modal-head, .drawer-title, h2, h1');
      if (head) {
        if (!head.id) head.id = `dlg-title-${++seq}`;
        el.setAttribute('aria-labelledby', head.id);
      }
    }
    el.addEventListener('keydown', this.keydown);
    // Quem usa appAutofocus já focou; senão vai para o primeiro campo ou botão.
    setTimeout(() => {
      if (!el.contains(document.activeElement)) {
        const first = this.focusables().find(f => !f.classList.contains('modal-x') && !f.classList.contains('dh-close')) || this.focusables()[0];
        (first || el).focus({ preventScroll: true });
      }
    }, 0);
  }

  ngOnDestroy() {
    this.host.nativeElement.removeEventListener('keydown', this.keydown);
    const back = this.opener;
    if (back && document.contains(back)) setTimeout(() => { if (document.contains(back)) back.focus({ preventScroll: true }); }, 0);
  }

  private focusables() {
    return Array.from(this.host.nativeElement.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(f => f.offsetParent !== null || f === document.activeElement);
  }

  private onKey(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      // Um select/menu aberto fecha primeiro; a janela só fecha no Esc seguinte.
      const t = e.target as HTMLElement | null;
      if (t?.closest('[aria-expanded="true"], .pp-panel')) return;
      e.preventDefault();
      e.stopPropagation();
      this.dialogClose.emit();
      return;
    }
    if (e.key !== 'Tab') return;
    const list = this.focusables();
    if (!list.length) { e.preventDefault(); return; }
    const first = list[0], last = list[list.length - 1];
    const active = document.activeElement as HTMLElement | null;
    if (e.shiftKey && (active === first || !this.host.nativeElement.contains(active))) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && active === last) { e.preventDefault(); first.focus(); }
  }
}
