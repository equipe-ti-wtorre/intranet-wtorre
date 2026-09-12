import {
  Component,
  effect,
  ElementRef,
  forwardRef,
  HostListener,
  Input,
  OnDestroy,
  ViewChild,
  inject,
  signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { MenuItem } from '../../../models/menu.model';
import { DocCatIconeComponent } from '../../documentos/doc-cat-icone.component';
import { isExterno, isInterno, isPlaceholder, temFilhos } from '../menu-link.util';
import { MenuFlyoutService } from '../menu-flyout.service';

const HOVER_DELAY_MS = 150;

@Component({
  selector: 'app-menu-node',
  standalone: true,
  imports: [RouterLink, DocCatIconeComponent, forwardRef(() => MenuNodeComponent)],
  templateUrl: './menu-node.component.html',
  styleUrl: './menu-node.component.scss',
})
export class MenuNodeComponent implements OnDestroy {
  @Input({ required: true }) item!: MenuItem;
  @Input() depth = 0;
  @Input() mobile = false;
  @Input() parentOpen = true;
  @Input() expandedIds = new Set<number>();
  @Input() onToggleMobile: (id: number) => void = () => {};
  @Input() onCloseMenu: () => void = () => {};

  @ViewChild('flyoutPanel') flyoutPanel?: ElementRef<HTMLElement>;
  @ViewChild('triggerBtn') triggerBtn?: ElementRef<HTMLButtonElement>;

  readonly aberto = signal(false);
  readonly flipFlyout = signal(false);

  private closeTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly host = inject(ElementRef<HTMLElement>);
  private readonly flyoutService = inject(MenuFlyoutService);
  private readonly closeSelf = (): void => {
    this.clearCloseTimer();
    if (!this.aberto()) return;
    this.aberto.set(false);
    this.flyoutService.deactivate(this.depth, this.closeSelf);
  };

  constructor() {
    effect(() => {
      if (!this.parentOpen && this.aberto()) {
        this.closeSelf();
      }
    });
  }

  protected readonly temFilhos = temFilhos;
  protected readonly isInterno = isInterno;
  protected readonly isExterno = isExterno;
  protected readonly isPlaceholder = isPlaceholder;

  get mobileExpandido(): boolean {
    return this.expandedIds.has(this.item.id);
  }

  ngOnDestroy(): void {
    this.clearCloseTimer();
    if (!this.mobile) {
      this.flyoutService.deactivate(this.depth, this.closeSelf);
    }
  }

  onMouseEnter(): void {
    if (this.mobile || !this.temFilhos(this.item)) return;
    this.clearCloseTimer();
    this.flyoutService.activate(this.depth, this.closeSelf);
    this.aberto.set(true);
    if (this.depth >= 1) {
      queueMicrotask(() => this.checkFlyoutFlip());
    }
  }

  onMouseLeave(): void {
    if (this.mobile) return;
    this.scheduleClose();
  }

  onTriggerMouseEnter(): void {
    if (this.depth >= 1) this.onMouseEnter();
  }

  onTriggerClick(event: Event): void {
    if (!this.temFilhos(this.item)) return;
    if (this.mobile) {
      event.preventDefault();
      this.onToggleMobile(this.item.id);
    } else {
      event.preventDefault();
    }
  }

  onTriggerKeydown(event: KeyboardEvent): void {
    if (!this.temFilhos(this.item)) return;
    switch (event.key) {
      case 'ArrowRight':
        event.preventDefault();
        this.aberto.set(true);
        if (this.depth >= 1) this.checkFlyoutFlip();
        break;
      case 'ArrowLeft':
        event.preventDefault();
        this.aberto.set(false);
        break;
      case 'Escape':
        event.preventDefault();
        this.aberto.set(false);
        this.triggerBtn?.nativeElement.focus();
        break;
      case 'Enter':
      case ' ':
        if (this.mobile) {
          event.preventDefault();
          this.onToggleMobile(this.item.id);
        }
        break;
    }
  }

  onLeafKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      event.preventDefault();
      this.onCloseMenu();
    }
  }

  private scheduleClose(): void {
    this.clearCloseTimer();
    this.closeTimer = setTimeout(() => this.closeSelf(), HOVER_DELAY_MS);
  }

  private clearCloseTimer(): void {
    if (this.closeTimer) {
      clearTimeout(this.closeTimer);
      this.closeTimer = null;
    }
  }

  private checkFlyoutFlip(): void {
    const trigger = this.triggerBtn?.nativeElement ?? this.host.nativeElement;
    const rect = trigger.getBoundingClientRect();
    const minWidth = 220;
    this.flipFlyout.set(rect.right + minWidth > window.innerWidth);
  }

  @HostListener('window:resize')
  onResize(): void {
    if (this.aberto() && this.depth >= 1) {
      this.checkFlyoutFlip();
    }
  }
}
