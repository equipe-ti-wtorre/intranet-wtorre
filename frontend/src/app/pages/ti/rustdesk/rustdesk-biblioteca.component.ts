import { Component, ElementRef, HostListener, OnInit, computed, inject, signal, viewChild } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { FormsModule } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { AdminModalComponent } from '../../../shared/admin/admin-modal/admin-modal.component';
import { AlertasService } from '../../../services/alertas.service';
import { DocumentosService } from '../../../services/documentos.service';
import { RustdeskService } from '../../../services/rustdesk.service';
import { DocumentoPagina } from '../../../models/documento.model';
import {
  RustdeskDispositivo,
  RustdeskDispositivoPayload,
  RustdeskEstado,
  RustdeskOrfao,
} from '../../../models/rustdesk.model';
import {
  compararVersao,
  labelAcesso,
  labelEstado,
  subtituloMaquina,
  toneAcesso,
  versaoMaisAlta,
} from './rustdesk.utils';

export type EstadoFiltro = '' | RustdeskEstado;
export type IconeMaquina = 'desktop' | 'notebook' | 'servidor' | 'cftv' | 'outro';

@Component({
  selector: 'app-rustdesk-biblioteca',
  standalone: true,
  imports: [FormsModule, ReactiveFormsModule, AdminModalComponent],
  templateUrl: './rustdesk-biblioteca.component.html',
  styleUrl: './rustdesk-biblioteca.component.scss',
})
export class RustdeskBibliotecaComponent implements OnInit {
  private readonly api = inject(RustdeskService);
  private readonly docs = inject(DocumentosService);
  private readonly alertas = inject(AlertasService);
  private readonly fb = inject(FormBuilder);
  private readonly buscaInput = viewChild<ElementRef<HTMLInputElement>>('buscaInput');

  readonly carregando = signal(false);
  readonly importando = signal(false);
  readonly salvando = signal(false);
  readonly inventario = signal<RustdeskDispositivo[]>([]);
  readonly orfaos = signal<RustdeskOrfao[]>([]);
  readonly entidades = signal<DocumentoPagina[]>([]);

  readonly busca = signal('');
  readonly tipoFiltro = signal('');
  readonly estadoFiltro = signal<EstadoFiltro>('');
  readonly entidadeFiltro = signal<number | ''>('');

  readonly modalAberto = signal(false);
  readonly editando = signal<RustdeskDispositivo | null>(null);
  readonly vinculandoId = signal<string | null>(null);

  readonly labelEstado = labelEstado;
  readonly labelAcesso = labelAcesso;
  readonly toneAcesso = toneAcesso;
  readonly subtituloMaquina = subtituloMaquina;

  readonly tiposPadrao = ['Desktop', 'Notebook', 'Servidor', 'Thin Client', 'CFTV', 'Outro'];

  readonly form = this.fb.nonNullable.group({
    rustdesk_id: ['', Validators.required],
    hostname: [''],
    entidade_id: [''],
    setor: [''],
    tipo: [''],
    localizacao: [''],
    modo_acesso: [''],
    cofre_ref: [''],
    servico_estado: ['ativo'],
    versao_cliente: [''],
    observacao: [''],
    ativo: [true],
  });

  readonly versaoAlvo = computed(() => versaoMaisAlta(this.inventario().map((d) => d.versao_cliente)));

  readonly kpis = computed(() => {
    const rows = this.inventario();
    const entidades = new Set(rows.map((d) => d.entidade_id).filter((id): id is number => id != null));
    const noServidor = rows.filter((d) => d.presente_no_hbbs).length;
    const atencao = rows.filter((d) => d.estado === 'sem_servico' || d.estado === 'nunca_registrou').length;
    const alvo = this.versaoAlvo();
    const desatualizados = alvo
      ? rows.filter((d) => d.versao_cliente && compararVersao(d.versao_cliente, alvo) < 0).length
      : 0;
    return {
      inventario: rows.length,
      entidades: entidades.size,
      noServidor,
      atencao,
      desatualizados,
      versaoAlvo: alvo,
    };
  });

  readonly chipsEntidade = computed(() => {
    const rows = this.inventario();
    const counts = new Map<number, { id: number; nome: string; qtd: number }>();
    for (const d of rows) {
      if (d.entidade_id == null) continue;
      const cur = counts.get(d.entidade_id);
      if (cur) cur.qtd += 1;
      else counts.set(d.entidade_id, { id: d.entidade_id, nome: d.entidade_nome || `Entidade ${d.entidade_id}`, qtd: 1 });
    }
    return [...counts.values()].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
  });

  readonly filtrados = computed(() => {
    const q = this.busca().trim().toLowerCase();
    const tipo = this.tipoFiltro();
    const estado = this.estadoFiltro();
    const ent = this.entidadeFiltro();
    return this.inventario().filter((d) => {
      if (tipo && (d.tipo || '') !== tipo) return false;
      if (estado && d.estado !== estado) return false;
      if (ent !== '' && d.entidade_id !== ent) return false;
      if (!q) return true;
      const blob = [d.hostname, d.rustdesk_id, d.localizacao, d.setor, d.entidade_nome, d.tipo]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return blob.includes(q);
    });
  });

  ngOnInit(): void {
    this.docs.listarPaginas().subscribe({
      next: (p) => this.entidades.set(p.filter((x) => x.ativo !== false)),
      error: () => this.entidades.set([]),
    });
    this.carregar();
    this.carregarOrfaos();
  }

  @HostListener('document:keydown', ['$event'])
  onAtalho(ev: KeyboardEvent): void {
    if (ev.key !== '/' || ev.ctrlKey || ev.metaKey || ev.altKey) return;
    const t = ev.target as HTMLElement | null;
    if (t && ['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName)) return;
    ev.preventDefault();
    this.buscaInput()?.nativeElement.focus();
  }

  carregar(): void {
    this.carregando.set(true);
    this.api
      .listarDispositivos({ ativo: '1', page: 1, page_size: 100 })
      .subscribe({
        next: (r) => {
          this.inventario.set(r.itens);
          this.carregando.set(false);
        },
        error: (err: HttpErrorResponse) => {
          this.alertas.erro(err.error?.mensagem || 'Erro ao carregar dispositivos.');
          this.carregando.set(false);
        },
      });
  }

  carregarOrfaos(): void {
    this.api.listarOrfaos().subscribe({
      next: (o) => this.orfaos.set(o),
      error: () => this.orfaos.set([]),
    });
  }

  selecionarEntidade(id: number | ''): void {
    this.entidadeFiltro.set(id);
  }

  iconeMaquina(tipo: string | null): IconeMaquina {
    const t = (tipo || '').toLowerCase();
    if (t.includes('note') || t.includes('laptop')) return 'notebook';
    if (t.includes('serv')) return 'servidor';
    if (t.includes('cftv') || t.includes('camera') || t.includes('câmera')) return 'cftv';
    if (t.includes('desk') || t.includes('estação') || t.includes('estacao')) return 'desktop';
    return 'outro';
  }

  urlConectar(id: string): string {
    const clean = String(id || '').trim();
    return clean ? `rustdesk://connection/new/${encodeURIComponent(clean)}` : '';
  }

  conectar(id: string, ev: Event): void {
    ev.stopPropagation();
    if (!String(id || '').trim()) {
      ev.preventDefault();
      this.alertas.erro('ID RustDesk ausente.');
    }
  }

  async copiarId(id: string, ev: Event): Promise<void> {
    ev.stopPropagation();
    try {
      await navigator.clipboard.writeText(id);
      this.alertas.sucesso('ID copiado.');
    } catch {
      this.alertas.erro('Não foi possível copiar o ID.');
    }
  }

  novo(): void {
    this.editando.set(null);
    this.vinculandoId.set(null);
    this.form.reset({
      rustdesk_id: '',
      hostname: '',
      entidade_id: '',
      setor: '',
      tipo: '',
      localizacao: '',
      modo_acesso: '',
      cofre_ref: '',
      servico_estado: 'ativo',
      versao_cliente: '',
      observacao: '',
      ativo: true,
    });
    this.form.controls.rustdesk_id.enable();
    this.modalAberto.set(true);
  }

  editar(item: RustdeskDispositivo, ev?: Event): void {
    ev?.stopPropagation();
    this.editando.set(item);
    this.vinculandoId.set(null);
    this.form.reset({
      rustdesk_id: item.rustdesk_id,
      hostname: item.hostname || '',
      entidade_id: item.entidade_id != null ? String(item.entidade_id) : '',
      setor: item.setor || '',
      tipo: item.tipo || '',
      localizacao: item.localizacao || '',
      modo_acesso: item.modo_acesso || '',
      cofre_ref: item.cofre_ref || '',
      servico_estado: item.servico_estado || 'ativo',
      versao_cliente: item.versao_cliente || '',
      observacao: item.observacao || '',
      ativo: item.ativo,
    });
    this.form.controls.rustdesk_id.disable();
    this.modalAberto.set(true);
  }

  vincular(orfao: RustdeskOrfao): void {
    this.editando.set(null);
    this.vinculandoId.set(orfao.rustdesk_id);
    this.form.reset({
      rustdesk_id: orfao.rustdesk_id,
      hostname: '',
      entidade_id: '',
      setor: '',
      tipo: '',
      localizacao: '',
      modo_acesso: '',
      cofre_ref: '',
      servico_estado: 'ativo',
      versao_cliente: '',
      observacao: '',
      ativo: true,
    });
    this.form.controls.rustdesk_id.disable();
    this.modalAberto.set(true);
  }

  fecharModal(): void {
    this.modalAberto.set(false);
    this.editando.set(null);
    this.vinculandoId.set(null);
    this.form.controls.rustdesk_id.enable();
  }

  tituloModal(): string {
    if (this.vinculandoId()) return 'Vincular órfão';
    return this.editando() ? 'Editar máquina' : 'Nova máquina';
  }

  private payload(): RustdeskDispositivoPayload {
    const v = this.form.getRawValue();
    return {
      rustdesk_id: v.rustdesk_id.trim(),
      hostname: v.hostname.trim() || null,
      entidade_id: v.entidade_id ? Number(v.entidade_id) : null,
      setor: v.setor.trim() || null,
      tipo: v.tipo.trim() || null,
      localizacao: v.localizacao.trim() || null,
      modo_acesso: v.modo_acesso.trim() || null,
      cofre_ref: v.cofre_ref.trim() || null,
      servico_estado: v.servico_estado || null,
      versao_cliente: v.versao_cliente.trim() || null,
      observacao: v.observacao.trim() || null,
      ativo: v.ativo,
    };
  }

  salvar(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const body = this.payload();
    this.salvando.set(true);

    const done = () => {
      this.salvando.set(false);
      this.fecharModal();
      this.carregar();
      this.carregarOrfaos();
    };

    const fail = (err: HttpErrorResponse) => {
      this.salvando.set(false);
      this.alertas.erro(err.error?.mensagem || 'Não foi possível salvar.');
    };

    const vinculo = this.vinculandoId();
    if (vinculo) {
      this.api.vincularOrfao(vinculo, body).subscribe({
        next: () => {
          this.alertas.sucesso('Máquina vinculada.');
          done();
        },
        error: fail,
      });
      return;
    }

    const edit = this.editando();
    if (edit) {
      this.api.atualizarDispositivo(edit.id, body).subscribe({
        next: () => {
          this.alertas.sucesso('Máquina atualizada.');
          done();
        },
        error: fail,
      });
      return;
    }

    this.api.criarDispositivo(body).subscribe({
      next: () => {
        this.alertas.sucesso('Máquina cadastrada.');
        done();
      },
      error: fail,
    });
  }

  onCsvSelecionado(ev: Event): void {
    const input = ev.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    this.importando.set(true);
    this.api.importarCsv(file).subscribe({
      next: (r) => {
        this.importando.set(false);
        const extra = r.erros.length ? ` ${r.erros.length} linha(s) com erro.` : '';
        this.alertas.sucesso(
          `CSV: ${r.criados} criado(s), ${r.atualizados} atualizado(s), ${r.ignorados} ignorado(s).${extra}`
        );
        this.carregar();
        this.carregarOrfaos();
      },
      error: (err: HttpErrorResponse) => {
        this.importando.set(false);
        this.alertas.erro(err.error?.mensagem || 'Falha ao importar CSV.');
      },
    });
  }
}
