import { Component, input } from '@angular/core';
import { Sistema } from '../../../data/sistemas.data';

@Component({
  selector: 'app-sistema-icon',
  standalone: true,
  template: `
    @switch (icon()) {
      @case ('user') {
        <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M12 12a4 4 0 100-8 4 4 0 000 8zM4 21a8 8 0 0116 0" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
        </svg>
      }
      @case ('wallet') {
        <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M3 7h18v12H3z" stroke="currentColor" stroke-width="2"/>
          <path d="M7 7V5h10v2M3 12h18" stroke="currentColor" stroke-width="2"/>
        </svg>
      }
      @case ('badge') {
        <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <rect x="4" y="3" width="16" height="18" rx="2" stroke="currentColor" stroke-width="2"/>
          <path d="M9 8h6M9 12h6M9 16h3" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
        </svg>
      }
      @case ('database') {
        <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <ellipse cx="12" cy="6" rx="8" ry="3" stroke="currentColor" stroke-width="2"/>
          <path d="M4 6v12c0 1.7 3.6 3 8 3s8-1.3 8-3V6M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3" stroke="currentColor" stroke-width="2"/>
        </svg>
      }
      @case ('cloud') {
        <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M7 18a5 5 0 01-1-9.9A6 6 0 0118 9a4 4 0 01-1 8H7z" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>
        </svg>
      }
      @case ('check') {
        <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M5 12l4 4 10-10" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      }
      @case ('task') {
        <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <rect x="3" y="4" width="18" height="16" rx="2" stroke="currentColor" stroke-width="2"/>
          <path d="M8 9h8M8 13h5" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
        </svg>
      }
      @case ('building') {
        <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M3 21V8l9-5 9 5v13" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>
          <path d="M9 21v-6h6v6" stroke="currentColor" stroke-width="2"/>
        </svg>
      }
      @case ('phone') {
        <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M5 4h4l2 5-3 2a13 13 0 006 6l2-3 5 2v4a2 2 0 01-2 2A17 17 0 013 6a2 2 0 012-2z" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>
        </svg>
      }
    }
  `,
  styles: `:host { display: contents; } svg { width: 19px; height: 19px; }`,
})
export class SistemaIconComponent {
  readonly icon = input.required<Sistema['icon']>();
}
