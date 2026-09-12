import {
  Component,
  Input,
  OnDestroy,
  OnInit,
  inject,
  signal,
} from '@angular/core';
import { Aniversariante } from '../../../models/colaborador.model';
import { ColaboradoresService } from '../../../services/colaboradores.service';
import { empresaParaClasse, labelEmpresa } from '../../../utils/empresa-classe.util';
import { corAvatarDeNome, iniciaisDeNome } from '../../../utils/iniciais.util';
import { mesAbbr } from '../aniversariantes.util';

@Component({
  selector: 'app-aniversariantes-card',
  standalone: true,
  templateUrl: './aniversariantes-card.component.html',
  styleUrl: './aniversariantes-card.component.scss',
})
export class AniversariantesCardComponent implements OnInit, OnDestroy {
  private readonly colaboradoresService = inject(ColaboradoresService);

  @Input({ required: true }) pessoa!: Aniversariante;
  @Input() ehHoje = false;
  @Input() variant: 'grid' | 'hoje' = 'grid';

  readonly fotoUrl = signal<string | null>(null);

  ngOnInit(): void {
    if (this.pessoa.tem_foto === false) return;
    this.colaboradoresService.fotoObjectUrl(this.pessoa.id).then((url) => {
      if (url) this.fotoUrl.set(url);
    });
  }

  ngOnDestroy(): void {
    const url = this.fotoUrl();
    if (url) URL.revokeObjectURL(url);
  }

  iniciais(nome: string): string {
    return iniciaisDeNome(nome);
  }

  corAvatar(nome: string): string {
    return corAvatarDeNome(nome);
  }

  classeEmpresa(empresa: string | null): string {
    return empresaParaClasse(empresa);
  }

  badgeLabel(empresa: string | null): string {
    return labelEmpresa(empresa);
  }

  abrevMes(): string {
    return mesAbbr(this.pessoa.nasc_mes);
  }
}
