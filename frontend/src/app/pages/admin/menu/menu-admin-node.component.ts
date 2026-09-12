import { CdkDragDrop, DragDropModule, moveItemInArray } from '@angular/cdk/drag-drop';
import { Component, EventEmitter, Input, Output, ViewEncapsulation, forwardRef } from '@angular/core';
import { MENU_MAX_DEPTH, MenuItem } from '../../../models/menu.model';
import { DocCatIconeComponent } from '../../../shared/documentos/doc-cat-icone.component';

export interface MenuAdminNodeAction {
  type: 'edit' | 'remove' | 'addChild' | 'toggle';
  item: MenuItem;
  parentId: number | null;
}

type UrlTipo = 'interno' | 'externo' | 'placeholder';

@Component({
  selector: 'app-menu-admin-node',
  standalone: true,
  imports: [DragDropModule, DocCatIconeComponent, forwardRef(() => MenuAdminNodeComponent)],
  templateUrl: './menu-admin-node.component.html',
  styleUrl: './menu-admin-node.component.scss',
  encapsulation: ViewEncapsulation.None,
  host: { class: 'menu-admin-node-host' },
})
export class MenuAdminNodeComponent {
  @Input({ required: true }) items!: MenuItem[];
  @Input() depth = 0;
  @Input() parentId: number | null = null;
  @Input() recolhidos = new Set<number>();
  @Input() tipoUrl!: (url: string | null | undefined) => UrlTipo;

  @Output() action = new EventEmitter<MenuAdminNodeAction>();
  @Output() reordered = new EventEmitter<void>();

  onDrop(event: CdkDragDrop<MenuItem[]>): void {
    if (event.previousContainer !== event.container) return;
    moveItemInArray(event.container.data, event.previousIndex, event.currentIndex);
    this.reordered.emit();
  }

  emit(type: MenuAdminNodeAction['type'], item: MenuItem): void {
    this.action.emit({ type, item, parentId: this.parentId });
  }

  onChevronClick(event: Event, item: MenuItem): void {
    event.stopPropagation();
    if (!this.temSubmenu(item)) return;
    this.toggleRecolher(item.id);
  }

  toggleRecolher(id: number): void {
    this.action.emit({ type: 'toggle', item: { id } as MenuItem, parentId: this.parentId });
  }

  estaRecolhido(id: number): boolean {
    return this.recolhidos.has(id);
  }

  temSubmenu(item: MenuItem): boolean {
    return (item.children?.length ?? 0) > 0;
  }

  podeAdicionarSubitem(): boolean {
    return this.depth < MENU_MAX_DEPTH - 1;
  }

  badgeClass(url: string | null | undefined): string {
    const map: Record<UrlTipo, string> = {
      interno: 'int',
      externo: 'ext',
      placeholder: 'ph',
    };
    return map[this.tipoUrl(url)] ?? 'ph';
  }

  badgeLabel(url: string | null | undefined): string {
    const map: Record<UrlTipo, string> = {
      interno: 'INTERNO',
      externo: 'EXTERNO',
      placeholder: 'PLACEHOLDER',
    };
    return map[this.tipoUrl(url)] ?? 'PLACEHOLDER';
  }
}
