import { Component, ViewEncapsulation, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { UiService } from './core/ui.service';

@Component({
  selector: 'app-taskhub-root',
  standalone: true,
  imports: [RouterOutlet],
  template: `
    <div class="taskhub-root" [attr.data-theme]="ui.palette()">
      <router-outlet />
    </div>
  `,
  styleUrls: ['./styles/taskhub.scss'],
  encapsulation: ViewEncapsulation.None,
})
export class TaskhubRootComponent {
  readonly ui = inject(UiService);
}
