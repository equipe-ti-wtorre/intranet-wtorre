import {
  Directive,
  ElementRef,
  Input,
  OnDestroy,
  OnInit,
  inject,
  PLATFORM_ID,
} from '@angular/core';
import { DOCUMENT, isPlatformBrowser } from '@angular/common';

@Directive({
  selector: '[appTextTooltip]',
  standalone: true,
})
export class TextTooltipDirective implements OnInit, OnDestroy {
  @Input('appTextTooltip') text = '';

  private readonly el = inject(ElementRef<HTMLElement>);
  private readonly document = inject(DOCUMENT);
  private readonly platformId = inject(PLATFORM_ID);
  private tipEl: HTMLDivElement | null = null;
  private readonly onEnter = () => this.show();
  private readonly onLeave = () => this.hide();

  ngOnInit(): void {
    if (!isPlatformBrowser(this.platformId)) return;
    const host = this.el.nativeElement;
    host.addEventListener('mouseenter', this.onEnter);
    host.addEventListener('mouseleave', this.onLeave);
    host.addEventListener('focus', this.onEnter);
    host.addEventListener('blur', this.onLeave);
  }

  ngOnDestroy(): void {
    this.hide();
    const host = this.el.nativeElement;
    host.removeEventListener('mouseenter', this.onEnter);
    host.removeEventListener('mouseleave', this.onLeave);
    host.removeEventListener('focus', this.onEnter);
    host.removeEventListener('blur', this.onLeave);
  }

  private isTruncated(): boolean {
    const el = this.el.nativeElement;
    return el.scrollHeight > el.clientHeight + 1 || el.scrollWidth > el.clientWidth + 1;
  }

  private show(): void {
    const content = (this.text || this.el.nativeElement.textContent || '').trim();
    if (!content || !this.isTruncated()) return;

    this.hide();
    const tip = this.document.createElement('div');
    tip.className = 'app-text-tooltip';
    tip.setAttribute('role', 'tooltip');
    tip.textContent = content;
    this.document.body.appendChild(tip);

    const hostRect = this.el.nativeElement.getBoundingClientRect();
    const tipRect = tip.getBoundingClientRect();
    const gap = 8;
    const margin = 8;

    let top = hostRect.top - tipRect.height - gap;
    if (top < margin) {
      top = hostRect.bottom + gap;
    }

    let left = hostRect.left;
    if (left + tipRect.width > window.innerWidth - margin) {
      left = window.innerWidth - tipRect.width - margin;
    }
    left = Math.max(margin, left);

    tip.style.top = `${top}px`;
    tip.style.left = `${left}px`;
    this.tipEl = tip;
  }

  private hide(): void {
    this.tipEl?.remove();
    this.tipEl = null;
  }
}
