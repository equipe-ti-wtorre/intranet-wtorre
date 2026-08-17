import { Component, OnInit, inject } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';

const DEFAULT_PAGINA = 'wtorre';

/** Redireciona URLs legadas /treinamentos/:slug para Documentos. */
@Component({
  selector: 'app-treinamentos',
  standalone: true,
  template: '',
})
export class TreinamentosComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  ngOnInit(): void {
    const slug = this.route.snapshot.paramMap.get('paginaSlug') ?? DEFAULT_PAGINA;
    void this.router.navigate(['/documentos', slug], {
      queryParams: { cat: 'treinamentos' },
      replaceUrl: true,
    });
  }
}
