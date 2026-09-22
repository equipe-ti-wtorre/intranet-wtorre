import { Component, OnInit, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { NscAlertaService } from './services/nsc-alerta.service';
import { NscAlertaModalComponent } from './shared/nsc-alerta-modal/nsc-alerta-modal.component';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, NscAlertaModalComponent],
  template: '<router-outlet /><app-nsc-alerta-modal />',
  styles: ':host { display: block; min-height: 100vh; }',
})
export class App implements OnInit {
  private readonly nscAlerta = inject(NscAlertaService);

  ngOnInit(): void {
    this.nscAlerta.start();
  }
}
