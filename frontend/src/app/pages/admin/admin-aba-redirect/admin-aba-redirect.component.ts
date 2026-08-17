import { Component, inject, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';

@Component({
  selector: 'app-admin-aba-redirect',
  standalone: true,
  template: '',
})
export class AdminAbaRedirectComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  ngOnInit(): void {
    const dest = String(this.route.snapshot.data['dest'] || 'menu');
    const aba = String(this.route.snapshot.data['aba'] || '');
    void this.router.navigate(['/admin', dest], {
      queryParams: aba ? { aba } : {},
      replaceUrl: true,
    });
  }
}
