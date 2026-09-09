import { Component, ViewEncapsulation } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { PublicChromeComponent } from '../../shared/public-chrome/public-chrome.component';

@Component({
  selector: 'app-pesquisas-shell',
  standalone: true,
  imports: [PublicChromeComponent, RouterOutlet],
  templateUrl: './pesquisas-shell.component.html',
  styleUrls: ['./pesquisas-shell.component.scss'],
  encapsulation: ViewEncapsulation.None,
})
export class PesquisasShellComponent {}
