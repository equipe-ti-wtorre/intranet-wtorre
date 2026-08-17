import { Component, OnDestroy, OnInit, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { HeaderComponent } from '../header/header.component';
import { TopbarComponent } from '../topbar/topbar.component';
import { ContentRefreshService } from '../../services/content-refresh.service';
import { MenuService } from '../../services/menu.service';

@Component({
  selector: 'app-public-chrome',
  standalone: true,
  imports: [HeaderComponent, TopbarComponent],
  templateUrl: './public-chrome.component.html',
  styleUrl: './public-chrome.component.scss',
})
export class PublicChromeComponent implements OnInit, OnDestroy {
  private readonly contentRefresh = inject(ContentRefreshService);
  private readonly menuService = inject(MenuService);

  constructor() {
    this.contentRefresh.menuChanged$
      .pipe(takeUntilDestroyed())
      .subscribe(() => this.menuService.invalidarCache());
  }

  ngOnInit(): void {
    this.contentRefresh.start();
  }

  ngOnDestroy(): void {
    this.contentRefresh.stop();
  }
}
