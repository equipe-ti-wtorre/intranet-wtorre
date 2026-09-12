import { Directive, ElementRef, inject, AfterViewInit, OnDestroy } from '@angular/core';

/** Revela seção ao entrar no viewport (IntersectionObserver). */
@Directive({
  selector: '[appRevealOnScroll]',
})
export class RevealOnScrollDirective implements AfterViewInit, OnDestroy {
  private readonly el = inject(ElementRef<HTMLElement>);
  private observer?: IntersectionObserver;

  ngAfterViewInit(): void {
    const element = this.el.nativeElement;
    element.classList.add('reveal');

    this.observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('in');
            this.observer?.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.12 }
    );

    this.observer.observe(element);
  }

  ngOnDestroy(): void {
    this.observer?.disconnect();
  }
}
