import { Component, OnInit, computed, inject, input, signal } from '@angular/core';
import { Router } from '@angular/router';
import { ApiService } from '../core/api.service';
import { PERSONAL_VIEWS, PersonalView, personalProjectLink, readPersonalProject } from '../core/corp-views';
import { UiService } from '../core/ui.service';
import { IconComponent } from '../shared/ui';

// Individual sem projeto escolhido: abre o último projeto individual usado, ou o primeiro.
@Component({
  selector: 'app-personal-picker',
  standalone: true,
  imports: [IconComponent],
  template: `
    <div class="page vp-page">
      @if (empty()) {
        <div class="page-head vp-head">
          <div class="vp-title">
            <span class="vp-title__ico"><app-icon [name]="meta().icon" [size]="20" /></span>
            <div>
              <h1>{{ meta().label }}</h1>
              <div class="sub">Seus projetos individuais. Só você vê o que criar aqui.</div>
            </div>
          </div>
        </div>
        <div class="vp-empty">
          <app-icon name="folder" [size]="28" />
          <b>Nenhum projeto individual ainda</b>
          <span>Crie o primeiro para montar o Kanban, a lista de projetos e a linha do tempo.</span>
          <button type="button" class="btn btn-primary btn-sm" style="margin-top: 8px" (click)="ui.openNewProject('pessoal')">
            <app-icon name="plus" [size]="14" />Novo projeto individual
          </button>
        </div>
      } @else if (error()) {
        <div class="muted" style="padding: 40px 0">{{ error() }}</div>
      } @else {
        <div class="muted" style="padding: 40px 0">Carregando…</div>
      }
    </div>
  `,
})
export class PersonalPickerPage implements OnInit {
  view = input<PersonalView>('kanban');
  private api = inject(ApiService);
  private router = inject(Router);
  ui = inject(UiService);
  meta = computed(() => PERSONAL_VIEWS[this.view()] || PERSONAL_VIEWS.kanban);
  empty = signal(false);
  error = signal('');

  ngOnInit() {
    this.api.projects({ space: 'pessoal' }).subscribe({
      next: list => {
        const mine = list.filter(p => p.space === 'pessoal');
        if (!mine.length) { this.empty.set(true); return; }
        const last = readPersonalProject();
        const id = mine.some(p => p.id === last) ? last! : mine[0].id;
        void this.router.navigate(personalProjectLink(this.view(), id), { replaceUrl: true });
      },
      error: () => this.error.set('Não foi possível carregar os projetos individuais.'),
    });
  }
}
