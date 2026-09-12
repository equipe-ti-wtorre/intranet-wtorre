import { Component, Input, computed, inject, signal } from '@angular/core';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { AssinaturaPayload } from '../../../models/assinatura.model';
import { buildAssinaturaHtml } from '../../../utils/assinatura-html.util';

@Component({
  selector: 'app-assinatura-preview',
  standalone: true,
  templateUrl: './assinatura-preview.component.html',
  styleUrl: './assinatura-preview.component.scss',
})
export class AssinaturaPreviewComponent {
  private readonly sanitizer = inject(DomSanitizer);

  private readonly sig = signal<AssinaturaPayload | null>(null);

  @Input({ required: true })
  set assinatura(value: AssinaturaPayload) {
    this.sig.set(value);
  }

  readonly html = computed<SafeHtml | null>(() => {
    const payload = this.sig();
    if (!payload) return null;
    const raw = buildAssinaturaHtml(payload);
    if (!raw) return null;
    return this.sanitizer.bypassSecurityTrustHtml(raw);
  });
}
