import { Component, OnDestroy, OnInit, effect, inject, signal } from '@angular/core';
import {
  FormArray,
  AbstractControl,
  FormBuilder,
  FormGroup,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { Subscription } from 'rxjs';
import { RodapeService } from '../../../services/rodape.service';
import { DocumentosService } from '../../../services/documentos.service';
import { AuthService } from '../../../services/auth.service';
import { PaginaInterna, buildPaginasInternasLista } from '../../../data/paginas-internas';
import { AlertasService } from '../../../services/alertas.service';
import {
  FooterColunaId,
  FooterConfig,
  FooterLink,
  FooterSponsor,
  FOOTER_DEFAULTS,
} from '../../../models/rodape.model';
import {
  buildUrlFromDestino,
  destinoFromUrl,
  paginaInternaOpcionalValidator,
  urlExternaOpcionalValidator,
} from '../menu/menu-destino.util';

const COLUNA_IDS: FooterColunaId[] = ['empresas', 'atalhos', 'suporte'];

@Component({
  selector: 'app-rodape-admin',
  standalone: true,
  imports: [ReactiveFormsModule],
  templateUrl: './rodape-admin.component.html',
  styleUrl: './rodape-admin.component.scss',
})
export class RodapeAdminComponent implements OnInit, OnDestroy {
  private readonly api = inject(RodapeService);
  private readonly documentosService = inject(DocumentosService);
  private readonly auth = inject(AuthService);
  private readonly fb = inject(FormBuilder);
  private readonly alertas = inject(AlertasService);
  private linkSubs: Subscription[] = [];

  readonly paginasInternas = signal<PaginaInterna[]>(buildPaginasInternasLista());
  readonly mensagem = signal('');
  readonly erro = signal('');
  readonly salvando = signal(false);
  readonly carregando = signal(true);

  readonly form = this.fb.nonNullable.group({
    marca_titulo: ['', Validators.required],
    marca_descricao: [''],
    colunas: this.fb.array<FormGroup>([]),
    sponsors: this.fb.array<FormGroup>([]),
    legal_copyright: [''],
    legal_links_texto: [''],
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

    this.auth.carregarPerfil().subscribe({
      next: () => this.inicializar(),
      error: () => {
        if (this.auth.estaLogado()) {
          this.inicializar();
        } else {
          this.erro.set('Sessão expirada. Faça login novamente.');
          this.carregando.set(false);
        }
      },
    });
  }

  ngOnDestroy(): void {
    for (const sub of this.linkSubs) sub.unsubscribe();
    this.linkSubs = [];
  }

  private inicializar(): void {
    this.documentosService.listarPaginas().subscribe({
      next: (paginasDocumentos) => this.paginasInternas.set(buildPaginasInternasLista(paginasDocumentos)),
      error: () => this.paginasInternas.set(buildPaginasInternasLista()),
    });

    this.api.getFooter().subscribe({
      next: (config) => {
        this.patchForm(config);
        this.carregando.set(false);
      },
      error: (err: HttpErrorResponse) => this.tratarErroCarregar(err),
    });
  }

  private tratarErroCarregar(err: HttpErrorResponse): void {
    if (err.status === 401) {
      this.erro.set('Sessão expirada. Faça login novamente.');
      void this.auth.logout(true, false);
    } else {
      this.erro.set(err.error?.mensagem || 'Erro ao carregar rodapé.');
    }
    this.patchForm(FOOTER_DEFAULTS);
    this.carregando.set(false);
  }

  private tratarErroSalvar(err: HttpErrorResponse): void {
    if (err.status === 401) {
      this.erro.set('Sessão expirada. Faça login novamente.');
      void this.auth.logout(true, false);
      return;
    }
    if (err.status === 403) {
      this.erro.set('Sem permissão para editar o rodapé.');
      return;
    }
    this.erro.set(err.error?.mensagem || 'Erro ao salvar.');
  }

  colunasArray(): FormArray<FormGroup> {
    return this.form.controls.colunas;
  }

  linksArray(colIndex: number): FormArray<FormGroup> {
    return this.colunasArray().at(colIndex).get('links') as FormArray<FormGroup>;
  }

  sponsorsArray(): FormArray<FormGroup> {
    return this.form.controls.sponsors;
  }

  adicionarSponsor(): void {
    this.sponsorsArray().push(this.criarSponsorGroup());
  }

  removerSponsor(index: number): void {
    this.sponsorsArray().removeAt(index);
  }

  colunaLabel(id: FooterColunaId | string | null | undefined): string {
    const labels: Record<FooterColunaId, string> = {
      empresas: 'Empresas',
      atalhos: 'Atalhos',
      suporte: 'Suporte',
    };
    if (id && id in labels) return labels[id as FooterColunaId];
    return 'Coluna';
  }

  tipoDestino(link: FormGroup): string {
    return String(link.get('tipo_destino')?.value ?? 'interna');
  }

  campoInvalido(control: AbstractControl | null): boolean {
    return !!control && control.invalid && control.touched;
  }

  erroCampo(control: AbstractControl | null): string {
    if (!control?.errors) return '';
    if (control.hasError('required')) return 'Campo obrigatório.';
    if (control.hasError('paginaDesconhecida')) return 'Página interna não reconhecida.';
    if (control.hasError('urlInvalida')) return 'URL deve começar com http:// ou https://.';
    return 'Valor inválido.';
  }

  adicionarLink(colIndex: number): void {
    this.linksArray(colIndex).push(this.criarLinkGroup());
  }

  removerLink(colIndex: number, linkIndex: number): void {
    this.linksArray(colIndex).removeAt(linkIndex);
  }

  moverLink(colIndex: number, linkIndex: number, dir: -1 | 1): void {
    const arr = this.linksArray(colIndex);
    const target = linkIndex + dir;
    if (target < 0 || target >= arr.length) return;
    const ctrl = arr.at(linkIndex);
    arr.removeAt(linkIndex);
    arr.insert(target, ctrl);
  }

  salvar(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      const erros = this.coletarErrosValidacao();
      this.erro.set(
        erros.length
          ? `Preencha os campos: ${erros.join('; ')}.`
          : 'Verifique os campos obrigatórios.'
      );
      return;
    }

    this.salvando.set(true);
    this.erro.set('');

    this.api.salvar(this.buildConfig()).subscribe({
      next: (config) => {
        this.patchForm(config);
        this.mensagem.set('Rodapé salvo.');
        this.salvando.set(false);
      },
      error: (err: HttpErrorResponse) => {
        this.tratarErroSalvar(err);
        this.salvando.set(false);
      },
    });
  }

  private patchForm(config: FooterConfig): void {
    for (const sub of this.linkSubs) sub.unsubscribe();
    this.linkSubs = [];
    this.colunasArray().clear();

    for (const colId of COLUNA_IDS) {
      const col = config.colunas.find((c) => c.id === colId) ?? {
        id: colId,
        titulo: this.colunaLabel(colId),
        links: [],
      };
      this.colunasArray().push(this.criarColunaGroup(col.id, col.titulo, col.links));
    }

    this.sponsorsArray().clear();
    for (const sponsor of config.sponsors ?? []) {
      this.sponsorsArray().push(this.criarSponsorGroup(sponsor));
    }

    this.form.patchValue({
      marca_titulo: config.marca.titulo,
      marca_descricao: config.marca.descricao,
      legal_copyright: config.legal.copyright,
      legal_links_texto: config.legal.links_texto,
    });
  }

  private criarColunaGroup(id: FooterColunaId, titulo: string, links: FooterLink[]): FormGroup {
    const linksArray = this.fb.array<FormGroup>(
      links.map((link) => this.criarLinkGroup(link))
    );
    return this.fb.group({
      id: [id],
      titulo: [titulo, Validators.required],
      links: linksArray,
    });
  }

  private criarLinkGroup(link?: FooterLink): FormGroup {
    const dest = destinoFromUrl(link?.url);
    const tipo = link?.tipo_destino ?? dest.tipo;
    const isInterna = tipo === 'interna';

    const group = this.fb.group({
      label: [link?.label ?? '', Validators.required],
      tipo_destino: [isInterna ? 'interna' : tipo === 'externa' ? 'externa' : 'interna'],
      pagina_interna: [isInterna ? dest.paginaInterna : '', paginaInternaOpcionalValidator()],
      url_externa: [dest.urlExterna, urlExternaOpcionalValidator()],
      nova_aba: [link?.nova_aba ?? false],
    });

    this.linkSubs.push(
      group.get('tipo_destino')!.valueChanges.subscribe((tipo) => {
        group.get('pagina_interna')?.updateValueAndValidity();
        group.get('url_externa')?.updateValueAndValidity();
        if (tipo === 'externa' && !group.get('nova_aba')?.value) {
          group.patchValue({ nova_aba: true }, { emitEvent: false });
        }
      })
    );

    return group;
  }

  private criarSponsorGroup(sponsor?: FooterSponsor): FormGroup {
    return this.fb.group({
      label: [sponsor?.label ?? '', Validators.required],
      tipo_destino: ['externa'],
      url_externa: [sponsor?.url ?? '', urlExternaOpcionalValidator()],
      nova_aba: [sponsor?.nova_aba ?? true],
    });
  }

  private buildConfig(): FooterConfig {
    const raw = this.form.getRawValue();

    return {
      marca: {
        titulo: raw.marca_titulo.trim(),
        descricao: raw.marca_descricao.trim(),
      },
      colunas: raw.colunas.map((col) => ({
        id: col['id'] as FooterColunaId,
        titulo: String(col['titulo'] ?? '').trim(),
        links: (col['links'] as Array<Record<string, unknown>>).map((link) => {
          const tipo = (link['tipo_destino'] as 'interna' | 'externa') ?? 'interna';
          const url = buildUrlFromDestino(
            tipo,
            String(link['pagina_interna'] ?? ''),
            String(link['url_externa'] ?? '')
          );
          return {
            label: String(link['label'] ?? '').trim(),
            url,
            tipo_destino: tipo,
            nova_aba: !!link['nova_aba'],
          };
        }),
      })),
      sponsors: raw.sponsors.map((s) => ({
        label: String(s['label'] ?? '').trim(),
        url: String(s['url_externa'] ?? '').trim() || null,
        nova_aba: !!s['nova_aba'],
      })),
      legal: {
        copyright: raw.legal_copyright.trim(),
        links_texto: raw.legal_links_texto.trim(),
      },
    };
  }

  private coletarErrosValidacao(): string[] {
    const erros: string[] = [];

    const marcaTitulo = this.form.controls.marca_titulo;
    if (marcaTitulo.invalid) {
      erros.push('Marca — Título');
    }

    this.colunasArray().controls.forEach((coluna) => {
      const colNome = this.colunaLabel(coluna.get('id')?.value);

      const titulo = coluna.get('titulo');
      if (titulo?.invalid) {
        erros.push(`Coluna ${colNome} — Título da coluna`);
      }

      const links = coluna.get('links') as FormArray<FormGroup>;
      links.controls.forEach((link, li) => {
        const n = li + 1;
        const prefix = `Coluna ${colNome} — Link ${n}`;

        const label = link.get('label');
        if (label?.invalid) {
          erros.push(`${prefix} — Rótulo`);
        }

        const tipo = link.get('tipo_destino')?.value;
        if (tipo === 'interna') {
          const pagina = link.get('pagina_interna');
          if (pagina?.invalid) {
            erros.push(
              pagina.hasError('paginaDesconhecida')
                ? `${prefix} — Página interna inválida`
                : `${prefix} — Página interna`
            );
          }
        }
        if (tipo === 'externa') {
          const url = link.get('url_externa');
          if (url?.invalid) {
            erros.push(
              url.hasError('urlInvalida')
                ? `${prefix} — URL externa inválida`
                : `${prefix} — URL externa`
            );
          }
        }
      });
    });

    this.sponsorsArray().controls.forEach((sponsor, si) => {
      const label = sponsor.get('label');
      if (label?.invalid) {
        erros.push(`Barra de empresas — Item ${si + 1} — Nome`);
      }
      const url = sponsor.get('url_externa');
      if (url?.invalid) {
        erros.push(
          url.hasError('urlInvalida')
            ? `Barra de empresas — Item ${si + 1} — URL externa inválida`
            : `Barra de empresas — Item ${si + 1} — URL externa`
        );
      }
    });

    return erros;
  }
}
