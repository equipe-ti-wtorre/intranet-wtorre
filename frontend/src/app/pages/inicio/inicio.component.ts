import { Component, OnDestroy, OnInit, inject } from '@angular/core';
import { DOCUMENT } from '@angular/common';
import { PublicChromeComponent } from '../../shared/public-chrome/public-chrome.component';
import { HomeCarrosselComponent } from './home-carrossel/home-carrossel.component';
import { BidPremioCardComponent } from './bid-premio-card/bid-premio-card.component';
import { BidCarouselComponent } from './bid-carousel/bid-carousel.component';
import { SistemasComponent } from './sistemas/sistemas.component';
import { FooterComponent } from '../../shared/footer/footer.component';
import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'app-inicio',
  standalone: true,
  imports: [
    PublicChromeComponent,
    HomeCarrosselComponent,
    BidPremioCardComponent,
    BidCarouselComponent,
    SistemasComponent,
    FooterComponent,
  ],
  templateUrl: './inicio.component.html',
  styleUrl: './inicio.component.scss',
})
export class InicioComponent implements OnInit, OnDestroy {
  private readonly auth = inject(AuthService);
  private readonly document = inject(DOCUMENT);

  ngOnInit(): void {
    this.document.body.classList.add('pagina-inicio');
    this.auth.carregarPerfil().subscribe();
  }

  ngOnDestroy(): void {
    this.document.body.classList.remove('pagina-inicio');
  }
}
