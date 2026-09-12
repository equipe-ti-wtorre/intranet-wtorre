import { Component } from '@angular/core';

@Component({
  selector: 'app-logo-w',
  standalone: true,
  template: `
    <span class="logo-w">
      <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path
          d="M2 4l3 16 4-11 4 11 3-16"
          stroke="#fff"
          stroke-width="2.4"
          stroke-linejoin="round"
          stroke-linecap="round"
        />
        <circle cx="19.5" cy="6" r="2.2" fill="#fff" />
      </svg>
    </span>
  `,
  styles: `
    .logo-w {
      display: grid;
      place-items: center;
      flex-shrink: 0;
    }
    .logo-w svg {
      width: 100%;
      height: 100%;
    }
  `,
})
export class LogoWComponent {}
