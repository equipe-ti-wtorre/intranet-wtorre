import { Component, OnInit, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { forkJoin } from 'rxjs';
import { ComunicadosService } from '../../../services/comunicados.service';
import { ColaboradoresService } from '../../../services/colaboradores.service';
import { ContentRefreshService } from '../../../services/content-refresh.service';
import { EventosService } from '../../../services/eventos.service';
import { MuralNoticiaItem } from '../../../models/mural.model';
import { Evento } from '../../../models/evento.model';
import { mesclarNoticiasMural } from '../../../utils/mural-noticias.util';

@Component({
  selector: 'app-mural',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './mural.component.html',
  styleUrl: './mural.component.scss',
})
export class MuralComponent implements OnInit {
  private readonly comunicadosService = inject(ComunicadosService);
  private readonly colaboradoresService = inject(ColaboradoresService);
  private readonly eventosService = inject(EventosService);
  private readonly contentRefresh = inject(ContentRefreshService);

  readonly noticias = signal<MuralNoticiaItem[]>([]);
  readonly carregandoNoticias = signal(true);
  readonly eventos = signal<Evento[]>([]);
  readonly carregandoEventos = signal(true);
  readonly imagemFalhou = signal<Set<string>>(new Set());

  constructor() {
    this.contentRefresh.comunicadosChanged$
      .pipe(takeUntilDestroyed())
      .subscribe(() => this.carregarNoticias());
  }

  ngOnInit(): void {
    this.carregarNoticias();
    this.carregarEventos();
  }

  carregarNoticias(): void {
    this.carregandoNoticias.set(true);
    const mesAtual = new Date().getMonth() + 1;

    forkJoin({
      comunicados: this.comunicadosService.listar(),
      aniversariantes: this.colaboradoresService.getAniversariantes(mesAtual),
    }).subscribe({
      next: ({ comunicados, aniversariantes }) => {
        this.noticias.set(mesclarNoticiasMural(comunicados, aniversariantes.aniversariantes));
        this.carregandoNoticias.set(false);
      },
      error: () => {
        this.noticias.set([]);
        this.carregandoNoticias.set(false);
      },
    });
  }

  carregarEventos(): void {
    this.carregandoEventos.set(true);
    this.eventosService.listarProximos().subscribe({
      next: (res) => {
        this.eventos.set(res.eventos);
        this.carregandoEventos.set(false);
      },
      error: () => {
        this.eventos.set([]);
        this.carregandoEventos.set(false);
      },
    });
  }

  rotuloEvento(ev: Evento): string {
    return (ev.rotulo || ev.tipo || '').trim();
  }

  tituloEvento(ev: Evento): string {
    const rotulo = this.rotuloEvento(ev);
    return rotulo ? `${rotulo} · ${ev.titulo}` : ev.titulo;
  }

  subtituloEvento(ev: Evento): string {
    const partes = [ev.dataTexto, ev.subtitulo].filter(Boolean);
    return partes.join(' · ');
  }

  mostrarImagem(ev: Evento): boolean {
    return Boolean(ev.imagemUrl) && !this.imagemFalhou().has(ev.titulo);
  }

  onImagemErro(ev: Evento): void {
    this.imagemFalhou.update((set) => {
      const next = new Set(set);
      next.add(ev.titulo);
      return next;
    });
  }
}
