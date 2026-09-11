import { Component, Input } from '@angular/core';

@Component({
  selector: 'app-pesq-icon',
  standalone: true,
  template: `
    <svg [attr.width]="size" [attr.height]="size" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      @switch (name) {
        @case ('plus') {
          <path d="M12 5v14M5 12h14" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
        }
        @case ('clock') {
          <circle cx="12" cy="12" r="8.5" stroke="currentColor" stroke-width="1.8" />
          <path d="M12 7.3v5l3.3 1.8" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" />
        }
        @case ('check') {
          <path d="M5 12.5 9.5 17 19 6.5" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round" />
        }
        @case ('edit') {
          <path d="M4.5 19.5h4L19 9l-4-4L4.5 15.5z" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round" />
          <path d="M13.7 6.3l4 4" stroke="currentColor" stroke-width="1.7" />
        }
        @case ('file-text') {
          <path d="M6.5 3h8l3.5 3.5V21h-11.5z" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round" />
          <path d="M9 10h6M9 13.5h6M9 17h3.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
        }
        @case ('file-plus') {
          <path d="M6.5 3h6.5l4 4v14h-10.5z" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round" />
          <path d="M13 3v4h4" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" />
          <path d="M12 12.3v5M9.4 14.8h5.2" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" />
        }
        @case ('list-checks') {
          <path d="M4.5 6.5h1.6M4.5 12h1.6M4.5 17.5h1.6" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" />
          <path d="M9.3 6.5h10.2M9.3 12h10.2M9.3 17.5h10.2" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" />
        }
        @case ('layers') {
          <path d="M12 3.3 3 8.3l9 5 9-5z" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round" />
          <path d="M3 13.3l9 5 9-5" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round" />
        }
        @case ('chevron-right') {
          <path d="M9 5.5l6.5 6.5-6.5 6.5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
        }
        @case ('arrow-left') {
          <path d="M19 12H5.2M11 6l-6 6 6 6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
        }
        @case ('search') {
          <circle cx="11" cy="11" r="6.5" stroke="currentColor" stroke-width="1.9" />
          <path d="M20.5 20.5 16 16" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" />
        }
        @case ('x') {
          <path d="M6 6l12 12M18 6 6 18" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
        }
        @case ('eye') {
          <path d="M2.3 12s3.8-6.7 9.7-6.7 9.7 6.7 9.7 6.7-3.8 6.7-9.7 6.7-9.7-6.7-9.7-6.7z" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round" />
          <circle cx="12" cy="12" r="2.8" stroke="currentColor" stroke-width="1.7" />
        }
        @case ('bar') {
          <path d="M4.5 20V10.5M11.3 20V4.5M18 20V13" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" />
          <path d="M3.5 20h17" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" />
        }
        @case ('upload') {
          <path d="M12 15.5V4.3M8.2 8.1 12 4.3l3.8 3.8" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" />
          <path d="M4.3 15.5v3.2c0 1.1.9 2 2 2h11.4c1.1 0 2-.9 2-2v-3.2" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" />
        }
        @case ('users') {
          <circle cx="9" cy="8" r="3" stroke="currentColor" stroke-width="1.8" />
          <path d="M4 20c0-3 2.2-5.2 5-5.2s5 2.2 5 5.2" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" />
        }
        @case ('monitor') {
          <rect x="3.2" y="4.5" width="17.6" height="12" rx="1.6" stroke="currentColor" stroke-width="1.8" />
          <path d="M8.3 20h7.4M12 16.5V20" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" />
        }
        @case ('alert') {
          <path d="M12 3.3 2.4 20h19.2z" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round" />
          <path d="M12 9.3v4.6M12 17h.01" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
        }
        @case ('link') {
          <path d="M9.2 14.8 14.8 9.2" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" />
          <path d="M8 12.8 6.2 14.6a2.9 2.9 0 0 0 4.1 4.1L12 17" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" />
        }
        @case ('copy') {
          <rect x="8.2" y="8.2" width="11" height="11" rx="2" stroke="currentColor" stroke-width="1.7" />
          <path d="M6.2 15.2V6.8c0-1 .8-1.8 1.8-1.8h8.4" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" />
        }
        @case ('megaphone') {
          <path d="M3 10.5v3a1 1 0 0 0 1 1h1.4l6.6 3.4V6.1L5.4 9.5H4a1 1 0 0 0-1 1z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" />
          <path d="M15 8.3a3.2 3.2 0 0 1 0 7.4" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" />
          <path d="M6.6 14.5 7.3 18.5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" />
        }
        @case ('download') {
          <path d="M12 4v10.5M8.3 11.2 12 14.9l3.7-3.7" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" />
          <path d="M4.5 16v3a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2v-3" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" />
        }
        @case ('lock') {
          <rect x="5" y="10.5" width="14" height="9.5" rx="2.2" stroke="currentColor" stroke-width="1.7" />
          <path d="M8 10.5V7.6a4 4 0 0 1 8 0v2.9" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" />
        }
        @case ('user') {
          <circle cx="12" cy="8.3" r="3.6" stroke="currentColor" stroke-width="1.7" />
          <path d="M5 20c0-3.6 3.1-6.3 7-6.3s7 2.7 7 6.3" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" />
        }
        @case ('inbox') {
          <path d="M4 12.5 6.3 5.2h11.4L20 12.5" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round" />
          <path d="M4 12.5v5.3c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2v-5.3h-4.7c0 1.4-1.2 2.5-3.3 2.5s-3.3-1.1-3.3-2.5z" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round" />
        }
        @case ('image') {
          <rect x="3.5" y="4.5" width="17" height="15" rx="2" stroke="currentColor" stroke-width="1.7" />
          <circle cx="9" cy="10" r="1.8" stroke="currentColor" stroke-width="1.5" />
          <path d="M5 17l4.5-5 3.5 4 2.5-3 3.5 4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />
        }
        @case ('grip') {
          <circle cx="9" cy="6" r="1.4" fill="currentColor" />
          <circle cx="9" cy="12" r="1.4" fill="currentColor" />
          <circle cx="9" cy="18" r="1.4" fill="currentColor" />
          <circle cx="15" cy="6" r="1.4" fill="currentColor" />
          <circle cx="15" cy="12" r="1.4" fill="currentColor" />
          <circle cx="15" cy="18" r="1.4" fill="currentColor" />
        }
        @case ('grid') {
          <rect x="3.5" y="3.5" width="7.5" height="7.5" rx="1.5" stroke="currentColor" stroke-width="1.6" />
          <rect x="13" y="3.5" width="7.5" height="7.5" rx="1.5" stroke="currentColor" stroke-width="1.6" />
          <rect x="3.5" y="13" width="7.5" height="7.5" rx="1.5" stroke="currentColor" stroke-width="1.6" />
          <rect x="13" y="13" width="7.5" height="7.5" rx="1.5" stroke="currentColor" stroke-width="1.6" />
        }
        @case ('table') {
          <rect x="3.3" y="4.5" width="17.4" height="15" rx="2" stroke="currentColor" stroke-width="1.6" />
          <path d="M3.3 9.5h17.4M9 4.5v15" stroke="currentColor" stroke-width="1.5" />
        }
        @case ('expand') {
          <path d="M9 4H4v5M15 4h5v5M4 15v5h5M20 15v5h-5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" />
        }
        @case ('collapse') {
          <path d="M4 9h5V4M20 9h-5V4M4 15h5v5M20 15h-5v5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" />
        }
        @case ('text') {
          <path d="M4.5 5.5h15M12 5.5V19M8.5 19h7" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" />
        }
        @case ('trash') {
          <path d="M5 7.5h14" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" />
          <path d="M9 7.5V5.4c0-.5.4-.9.9-.9h4.2c.5 0 .9.4.9.9v2.1" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" />
          <path d="M7.2 7.5 8 19.2c.1.8.7 1.3 1.5 1.3h5c.8 0 1.4-.5 1.5-1.3L17.8 7.5" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round" />
          <path d="M10.2 11v5.5M13.8 11v5.5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" />
        }
        @default {
          <path d="M5 12.5 9.5 17 19 6.5" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round" />
        }
      }
    </svg>
  `,
})
export class PesqIconComponent {
  @Input() name = 'check';
  @Input() size = 18;
}
