import { Component, Input } from '@angular/core';
import { Empresa } from '../../data/empresas.data';

@Component({
  selector: 'app-company-card',
  standalone: true,
  templateUrl: './company-card.component.html',
  styleUrl: './company-card.component.scss',
})
export class CompanyCardComponent {
  @Input({ required: true }) empresa!: Empresa;
}
