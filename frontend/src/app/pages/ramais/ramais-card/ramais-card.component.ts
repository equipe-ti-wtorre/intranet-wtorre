import {
  Component,
  EventEmitter,
  Input,
  OnDestroy,
  OnInit,
  Output,
  inject,
  signal,
} from '@angular/core';
import { Colaborador } from '../../../models/colaborador.model';
import { ColaboradoresService } from '../../../services/colaboradores.service';
import { empresaParaClasse, labelEmpresa } from '../../../utils/empresa-classe.util';
import { corAvatarDeNome, iniciaisDeNome } from '../../../utils/iniciais.util';

@Component({
  selector: 'app-ramais-card',
  standalone: true,
  templateUrl: './ramais-card.component.html',
  styleUrl: './ramais-card.component.scss',
})
export class RamaisCardComponent implements OnInit, OnDestroy {
  private readonly colaboradoresService = inject(ColaboradoresService);

  @Input({ required: true }) colaborador!: Colaborador;
  @Output() copiar = new EventEmitter<{ texto: string; label: string }>();

  readonly fotoUrl = signal<string | null>(null);

  ngOnInit(): void {
    if (this.colaborador.tem_foto === false) return;

    this.colaboradoresService.fotoObjectUrl(this.colaborador.id).then((url) => {
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

  onCopiar(texto: string | null, label: string): void {
    if (!texto) return;
    this.copiar.emit({ texto, label });
  }
}
