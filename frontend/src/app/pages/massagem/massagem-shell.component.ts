import { Component, ViewEncapsulation } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { PublicChromeComponent } from '../../shared/public-chrome/public-chrome.component';

@Component({
  selector: 'app-massagem-shell',
  standalone: true,
  imports: [PublicChromeComponent, RouterOutlet],
  templateUrl: './massagem-shell.component.html',
  styleUrls: ['./shared/massagem-theme.scss', './massagem-shell.component.scss'],
  encapsulation: ViewEncapsulation.None,
})
export class MassagemShellComponent {}
