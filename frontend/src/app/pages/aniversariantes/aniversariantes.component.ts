import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { PublicChromeComponent } from '../../shared/public-chrome/public-chrome.component';
import { FooterComponent } from '../../shared/footer/footer.component';
import { ColaboradoresService } from '../../services/colaboradores.service';
import { Aniversariante } from '../../models/colaborador.model';
import { AniversariantesCardComponent } from './aniversariantes-card/aniversariantes-card.component';
import { MESES, mesLabel } from './aniversariantes.util';

@Component({
  selector: 'app-aniversariantes',
  standalone: true,
  imports: [PublicChromeComponent, FooterComponent, AniversariantesCardComponent],
  templateUrl: './aniversariantes.component.html',
  styleUrl: './aniversariantes.component.scss',
})
export class AniversariantesComponent implements OnInit {
  private readonly colaboradoresService = inject(ColaboradoresService);

  readonly mesAtual = signal(new Date().getMonth() + 1);
  readonly anoAtual = signal(new Date().getFullYear());
  readonly lista = signal<Aniversariante[]>([]);
  readonly carregando = signal(true);
  readonly erro = signal<string | null>(null);

  readonly mesHoje = new Date().getMonth() + 1;
  readonly diaHoje = new Date().getDate();

  readonly ehMesAtual = computed(() => this.mesAtual() === this.mesHoje);

  readonly hojeList = computed(() => {
    if (!this.ehMesAtual()) return [];
    return this.lista().filter((c) => c.nasc_dia === this.diaHoje);
  });

  readonly mostrarHoje = computed(() => this.hojeList().length > 0);

  readonly secLabel = computed(() => {
    if (this.ehMesAtual()) return 'Todos do mês';
    return `Aniversariantes de ${mesLabel(this.mesAtual()).toLowerCase()}`;
  });

  readonly mesTitulo = computed(() => `${MESES[this.mesAtual() - 1]} de ${this.anoAtual()}`);

  ngOnInit(): void {
    this.carregar();
  }

  carregar(): void {
    this.carregando.set(true);
    this.erro.set(null);
    this.colaboradoresService.getAniversariantes(this.mesAtual()).subscribe({
      next: (res) => {
        this.lista.set(res.aniversariantes);
        this.carregando.set(false);
      },
      error: (err: HttpErrorResponse) => {
        this.erro.set(err.error?.mensagem || 'Não foi possível carregar os aniversariantes.');
        this.carregando.set(false);
      },
    });
  }

  mesAnterior(): void {
    const m = this.mesAtual();
    this.mesAtual.set(((m + 10) % 12) + 1);
    this.carregar();
  }

  mesProximo(): void {
    const m = this.mesAtual();
    this.mesAtual.set((m % 12) + 1);
    this.carregar();
  }

  ehHoje(p: Aniversariante): boolean {
    return this.ehMesAtual() && p.nasc_dia === this.diaHoje;
  }

  mesNome(mes: number): string {
    return mesLabel(mes).toLowerCase();
  }
}
