import { Component, computed, inject, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { PersonalView, personalProjectLink, savePersonalProject } from '../core/corp-views';
import { DataService } from '../core/data.service';
import { UiService } from '../core/ui.service';
import { IconComponent } from './ui';

// Barra de projetos individuais: o equivalente da barra de equipes do Corporativo.
@Component({
  selector: 'app-project-bar',
  standalone: true,
  imports: [RouterLink, IconComponent],
  template: `
    <div class="wk-teambar" role="group" aria-label="Projeto individual">
      <span class="wk-teambar__label">Projeto</span>
      <div class="wk-teambar__list">
        @for (p of projects(); track p.id) {
          <a [routerLink]="personalProjectLink(view(), p.id)" [class.on]="p.id === current()" [attr.aria-current]="p.id === current() ? 'page' : null"
             (click)="remember(p.id)" [title]="(p.open_count || 0) + ' tarefas abertas'">
            <span class="wk-teambar__dot" [style.background]="p.color"></span>
            {{ p.name }}
            <span class="wk-teambar__n">{{ p.open_count || 0 }}</span>
          </a>
        }
        <a class="wk-teambar__new" role="button" tabindex="0" (click)="ui.openNewProject('pessoal')" (keydown.enter)="ui.openNewProject('pessoal')" title="Novo projeto individual">
          <app-icon name="plus" [size]="14" />Novo
        </a>
      </div>
    </div>
  `,
})
export class ProjectBarComponent {
  view = input.required<PersonalView>();
  current = input<number | null>(null);
  private data = inject(DataService);
  ui = inject(UiService);
  personalProjectLink = personalProjectLink;
  projects = computed(() => this.data.projects().filter(p => p.space === 'pessoal'));
  remember(id: number) { savePersonalProject(id); }
}
