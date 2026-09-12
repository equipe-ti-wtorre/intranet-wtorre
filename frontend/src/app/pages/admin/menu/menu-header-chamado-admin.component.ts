import { Component, OnDestroy, OnInit, effect, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { forkJoin } from 'rxjs';
import { MenuService } from '../../../services/menu.service';
import { DocumentosService } from '../../../services/documentos.service';
import { PaginasService } from '../../../services/paginas.service';
import { AuthService } from '../../../services/auth.service';
import { AlertasService } from '../../../services/alertas.service';
import { PaginaInterna, buildPaginasInternasLista } from '../../../data/paginas-internas';

@Component({
  selector: 'app-menu-header-chamado-admin',
  standalone: true,
  imports: [ReactiveFormsModule],
  templateUrl: './menu-header-chamado-admin.component.html',
  styleUrl: './menu-header-chamado-admin.component.scss',
})
export class MenuHeaderChamadoAdminComponent implements OnInit, OnDestroy {
  private readonly menuService = inject(MenuService);
  private readonly documentosService = inject(DocumentosService);
  private readonly paginasService = inject(PaginasService);
  private readonly auth = inject(AuthService);
  private readonly fb = inject(FormBuilder);
  private readonly alertas = inject(AlertasService);

  readonly paginasInternas = signal<PaginaInterna[]>(buildPaginasInternasLista());
  readonly mensagem = signal('');
  readonly erro = signal('');
  readonly salvando = signal(false);
  readonly carregando = signal(true);

  readonly form = this.fb.nonNullable.group({
    label: ['Abrir Chamado', Validators.required],
    tipo_destino: ['interna' as 'interna' | 'externa'],
    pagina_interna: [''],
    url_externa: [''],
    ativo: [false],
    abrir_nova_aba: [true],
  });

  constructor() {
    effect(() => {
      const msg = this.mensagem();
      if (msg) this.alertas.sucesso(msg);
    });
    effect(() => {
      const err = this.erro();
      if (err) this.alertas.erro(err);
    });
  }

  ngOnInit(): void {
    if (!this.auth.estaLogado()) {
      this.erro.set('Sessão não encontrada. Faça login novamente.');
      this.carregando.set(false);
      return;
    }

    this.carregarPaginasInternas();
    this.auth.carregarPerfil().subscribe({
      next: () => this.carregar(),
      error: () => {
        if (this.auth.estaLogado()) this.carregar();
        else {
          this.erro.set('Sessão expirada. Faça login novamente.');
          this.carregando.set(false);
        }
      },
    });
  }

  ngOnDestroy(): void {}

  salvar(): void {
    if (this.form.invalid) return;

    const raw = this.form.getRawValue();
    const tipo = raw.tipo_destino;
    const url =
      tipo === 'interna' ? raw.pagina_interna.trim() : raw.url_externa.trim() || null;

    if (raw.ativo && !url) {
      this.erro.set('Informe o destino antes de ativar o botão.');
      return;
    }

    this.salvando.set(true);
    this.erro.set('');
    this.mensagem.set('');

    this.menuService
      .salvarHeaderChamado({
        label: raw.label.trim(),
        url: url || null,
        ativo: raw.ativo,
        abrir_nova_aba: raw.abrir_nova_aba,
        tipo_destino: tipo,
      })
      .subscribe({
        next: () => {
          this.mensagem.set('Botão do header salvo.');
          this.salvando.set(false);
        },
        error: (err: HttpErrorResponse) => {
          if (err.status === 401) {
            this.erro.set('Sessão expirada. Faça login novamente.');
            void this.auth.logout(true, false);
          } else if (err.status === 403) {
            this.erro.set('Sem permissão para editar o botão do header.');
          } else {
            this.erro.set(err.error?.mensagem || 'Erro ao salvar.');
          }
          this.salvando.set(false);
        },
      });
  }

  private carregarPaginasInternas(): void {
    forkJoin({
      paginasDocumentos: this.documentosService.listarPaginas(),
      paginas: this.paginasService.listarPublicadas(),
    }).subscribe({
      next: ({ paginasDocumentos, paginas }) =>
        this.paginasInternas.set(buildPaginasInternasLista(paginasDocumentos, paginas)),
      error: () => this.paginasInternas.set(buildPaginasInternasLista()),
    });
  }

  private carregar(): void {
    this.menuService.getHeaderChamado().subscribe({
      next: (c) => {
        const isInterna = c.tipo_destino === 'interna';
        this.form.patchValue({
          label: c.label,
          tipo_destino: c.tipo_destino,
          pagina_interna: isInterna && c.url ? c.url : '',
          url_externa: !isInterna && c.url ? c.url : '',
          ativo: c.ativo,
          abrir_nova_aba: c.abrir_nova_aba,
        });
        this.carregando.set(false);
      },
      error: (err: HttpErrorResponse) => {
        if (err.status === 401) {
          this.erro.set('Sessão expirada. Faça login novamente.');
          void this.auth.logout(true, false);
        } else {
          this.erro.set(err.error?.mensagem || 'Erro ao carregar botão do header.');
        }
        this.carregando.set(false);
      },
    });
  }
}
