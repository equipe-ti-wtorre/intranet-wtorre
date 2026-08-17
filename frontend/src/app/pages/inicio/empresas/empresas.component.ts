import { Component } from '@angular/core';
import { RevealOnScrollDirective } from '../../../shared/directives/reveal-on-scroll.directive';
import { CompanyCardComponent } from '../../../shared/company-card/company-card.component';
import { EMPRESAS } from '../../../data/empresas.data';

@Component({
  selector: 'app-empresas',
  standalone: true,
  imports: [RevealOnScrollDirective, CompanyCardComponent],
  templateUrl: './empresas.component.html',
  styleUrl: './empresas.component.scss',
})
export class EmpresasComponent {
  readonly empresas = EMPRESAS;
}
