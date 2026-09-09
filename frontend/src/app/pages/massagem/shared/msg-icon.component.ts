import { Component, Input } from '@angular/core';

/** Catálogo de ícones disponíveis em `MsgIconComponent` (slugs do @switch). */
export const MSG_ICON_NAMES = [
  'leaf',
  'plant',
  'calendar',
  'calendar-check',
  'calendar-x',
  'calendar-minus',
  'buildings',
  'user',
  'users',
  'map-pin',
  'clock',
  'clock-counter-clockwise',
  'arrow-right',
  'arrow-left',
  'arrows-clockwise',
  'arrows-left-right',
  'bell',
  'check',
  'check-circle',
  'lightning',
  'plus',
  'x',
  'gear',
  'pencil-simple',
  'eye',
  'file-csv',
  'info',
  'star',
  'list',
  'envelope',
  'floppy-disk',
] as const;

export type MsgIconName = (typeof MSG_ICON_NAMES)[number];

/** Ícones SVG leves (equivalente visual ao Phosphor do protótipo). */
@Component({
  selector: 'app-msg-icon',
  standalone: true,
  template: `
    <svg
      [attr.width]="size"
      [attr.height]="size"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
    >
      @switch (iconName) {
        @case ('leaf') {
          <path d="M5 21c8-2 12-8 14-16-6 1-11 5-13 12" />
          <path d="M5 21c3-5 7-8 12-9" />
        }
        @case ('calendar') {
          <rect x="3" y="5" width="18" height="16" rx="2" />
          <path d="M3 10h18M8 3v4M16 3v4" />
        }
        @case ('buildings') {
          <path d="M4 21V5a1 1 0 011-1h8a1 1 0 011 1v16M14 10h5a1 1 0 011 1v10M9 9h.01M9 13h.01M9 17h.01" />
        }
        @case ('user') {
          <circle cx="12" cy="8" r="4" />
          <path d="M4 21c1.5-4 5-6 8-6s6.5 2 8 6" />
        }
        @case ('map-pin') {
          <path d="M12 21s7-5.5 7-11a7 7 0 10-14 0c0 5.5 7 11 7 11z" />
          <circle cx="12" cy="10" r="2.5" />
        }
        @case ('clock') {
          <circle cx="12" cy="12" r="9" />
          <path d="M12 7v6l4 2" />
        }
        @case ('arrow-right') {
          <path d="M5 12h14M13 6l6 6-6 6" />
        }
        @case ('arrow-left') {
          <path d="M19 12H5M11 6l-6 6 6 6" />
        }
        @case ('bell') {
          <path d="M6 9a6 6 0 1112 0c0 7 3 7 3 7H3s3 0 3-7" />
          <path d="M10 19a2 2 0 004 0" />
        }
        @case ('check-circle') {
          <circle cx="12" cy="12" r="9" />
          <path d="M8 12l2.5 2.5L16 9" />
        }
        @case ('check') {
          <path d="M5 13l4 4L19 7" />
        }
        @case ('lightning') {
          <path d="M13 2L4 14h7l-1 8 10-14h-7z" />
        }
        @case ('arrows-clockwise') {
          <path d="M21 12a9 9 0 11-3-6.7" />
          <path d="M21 3v6h-6" />
        }
        @case ('plus') {
          <path d="M12 5v14M5 12h14" />
        }
        @case ('x') {
          <path d="M6 6l12 12M18 6L6 18" />
        }
        @case ('gear') {
          <circle cx="12" cy="12" r="3" />
          <path
            d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"
          />
        }
        @case ('pencil-simple') {
          <path d="M12 20h9" />
          <path d="M16.5 3.5a2.1 2.1 0 013 3L7 19l-4 1 1-4L16.5 3.5z" />
        }
        @case ('eye') {
          <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" />
          <circle cx="12" cy="12" r="3" />
        }
        @case ('file-csv') {
          <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
          <path d="M14 2v6h6M8 13h2M8 17h8" />
        }
        @case ('users') {
          <circle cx="9" cy="8" r="3.5" />
          <path d="M2 20c.8-3.5 3.5-5 7-5s6.2 1.5 7 5" />
        }
        @case ('info') {
          <circle cx="12" cy="12" r="9" />
          <path d="M12 10v6M12 7h.01" />
        }
        @case ('star') {
          <path d="M12 3l2.5 5.5L20 10l-4 4 1 6-5-3-5 3 1-6-4-4 5.5-1.5L12 3z" />
        }
        @case ('list') {
          <path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" />
        }
        @case ('plant') {
          <path d="M12 22V10" />
          <path d="M12 10c-4-1-6-4-6-7 4 0 6 2 6 5" />
          <path d="M12 10c4-1 6-4 6-7-4 0-6 2-6 5" />
        }
        @case ('calendar-x') {
          <rect x="3" y="5" width="18" height="16" rx="2" />
          <path d="M3 10h18M8 3v4M16 3v4M10 14l4 4M14 14l-4 4" />
        }
        @case ('calendar-minus') {
          <rect x="3" y="5" width="18" height="16" rx="2" />
          <path d="M3 10h18M8 3v4M16 3v4M9 16h6" />
        }
        @case ('arrows-left-right') {
          <path d="M7 8l-4 4 4 4M17 8l4 4-4 4M3 12h18" />
        }
        @case ('calendar-check') {
          <rect x="3" y="5" width="18" height="16" rx="2" />
          <path d="M3 10h18M8 3v4M16 3v4M9 16l2 2 4-4" />
        }
        @case ('clock-counter-clockwise') {
          <path d="M3 12a9 9 0 109-9" />
          <path d="M3 5v5h5M12 7v5l3 2" />
        }
        @case ('envelope') {
          <rect x="3" y="5" width="18" height="14" rx="2" />
          <path d="M3 7l9 7 9-7" />
        }
        @case ('floppy-disk') {
          <path d="M5 3h12l4 4v14H5V3z" />
          <path d="M8 3v6h8V3M8 17h8" />
        }
        @default {
          <circle cx="12" cy="12" r="8" />
        }
      }
    </svg>
  `,
  styles: [
    `
      :host {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        line-height: 0;
        vertical-align: middle;
        color: inherit;
      }
      :host svg {
        display: block;
      }
    `,
  ],
})
export class MsgIconComponent {
  @Input() name = 'circle';
  @Input() weight: 'regular' | 'fill' | 'thin' | 'light' | 'bold' | 'duotone' = 'fill';
  @Input() size: string | number = 16;

  get iconName(): string {
    return String(this.name || 'circle')
      .trim()
      .replace(/^ph-/i, '')
      .replace(/^fa-(solid|regular|brands)\s+/i, '')
      .replace(/^fa-/i, '');
  }
}
