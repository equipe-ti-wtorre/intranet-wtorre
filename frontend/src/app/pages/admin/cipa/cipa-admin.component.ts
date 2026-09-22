import { HttpErrorResponse } from '@angular/common/http';
import { Component, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { Subject, debounceTime, distinctUntilChanged, of, switchMap } from 'rxjs';
import {
  CipaEvento,
  CipaSlot,
  CipaTextoAlinhamento,
  CipaTextoCampo,
} from '../../../models/cipa.model';
import { ColaboradorBusca } from '../../../models/perfil-acesso.model';
import { AlertasService } from '../../../services/alertas.service';
import { CipaService } from '../../../services/cipa.service';
import { AdminModalComponent } from '../../../shared/admin/admin-modal/admin-modal.component';
import {
  baixarBlob,
  formatarDataCipaExtenso,
  formatarDataCipaLonga,
  gerarPdfInscritosCipa,
  hojeIsoLocal,
  isMesAtual,
} from '../../../utils/cipa-admin.util';
import {
  CIPA_ALTURA_AUTO,
  CIPA_ALTURA_MAX,
  CIPA_POS_DEFAULT,
  CIPA_TAMANHO_DEFAULT,
  CIPA_TEXTO_CAMPO_META,
  CIPA_TEXTO_CAMPOS,
  CIPA_ZOOM_DEFAULT,
  cipaFlexFromPos,
  clampCampoTamanho,
  clampCipaAltura,
  clampCipaPos,
  clampCipaTamanho,
  clampCipaZoom,
  estiloCampoCss,
  estiloDefaultCampo,
  estilosTextoDefault,
  parseEstilosTexto,
} from '../../../utils/cipa-card-layout.util';

interface SlotForm {
  horario: string;
  vagas: number | string;
}

interface ViewerChip {
  colaborador_id: number;
  usuario_id?: number | null;
  nome: string;
  email: string;
  departamento?: string | null;
}

@Component({
  selector: 'app-cipa-admin',
  standalone: true,
  imports: [FormsModule, AdminModalComponent],
  templateUrl: './cipa-admin.component.html',
  styleUrl: './cipa-admin.component.scss',
})
export class CipaAdminComponent implements OnInit, OnDestroy {
  private readonly api = inject(CipaService);
  private readonly alertas = inject(AlertasService);
  private readonly router = inject(Router);
  private readonly busca$ = new Subject<string>();
  private previewUrl: string | null = null;

  readonly carregando = signal(true);
  readonly salvando = signal(false);
  readonly eventos = signal<CipaEvento[]>([]);
  readonly modalAberto = signal(false);
  readonly editandoCodigo = signal<string | null>(null);

  readonly titulo = signal('');
  readonly data = signal('');
  readonly categoria = signal('');
  readonly localizacao = signal('');
  readonly texto = signal('');
  readonly estado = signal<'aberto' | 'encerrado'>('aberto');
  readonly duracao = signal(60);
  readonly ocultoLista = signal(false);
  readonly linkPublico = signal(false);
  readonly slots = signal<SlotForm[]>([{ horario: '09:00', vagas: 10 }]);
  readonly visualizadores = signal<ViewerChip[]>([]);
  readonly arquivo = signal<File | null>(null);
  readonly preview = signal<string | null>(null);
  readonly temImagemAtual = signal(false);
  readonly removerImagem = signal(false);
  readonly imagemZoom = signal(CIPA_ZOOM_DEFAULT);
  readonly imagemTamanho = signal(CIPA_TAMANHO_DEFAULT);
  readonly imagemAltura = signal(CIPA_ALTURA_AUTO);
  readonly imagemPosX = signal(CIPA_POS_DEFAULT);
  readonly imagemPosY = signal(CIPA_POS_DEFAULT);
  readonly textoEstilos = signal(estilosTextoDefault());
  readonly textoCampo = signal<CipaTextoCampo>('titulo');
  readonly arrastando = signal(false);
  readonly buscaTexto = signal('');
  readonly resultadosBusca = signal<ColaboradorBusca[]>([]);
  readonly textoCampos = CIPA_TEXTO_CAMPOS;
  readonly textoCampoMeta = CIPA_TEXTO_CAMPO_META;
  readonly alinhamentos: { id: CipaTextoAlinhamento; label: string }[] = [
    { id: 'esquerda', label: 'Esquerda' },
    { id: 'centro', label: 'Centro' },
    { id: 'direita', label: 'Direita' },
  ];
  private drag: { x: number; y: number; posX: number; posY: number; w: number; h: number } | null =
    null;

  readonly totalEventos = computed(() => this.eventos().length);
  readonly novosMes = computed(() => this.eventos().filter((e) => isMesAtual(e.criado_em)).length);
  readonly totalInscricoes = computed(() =>
    this.eventos().reduce((acc, e) => acc + (e.inscritos || 0), 0)
  );
  readonly eventosAtivos = computed(() => {
    const hoje = hojeIsoLocal();
    return this.eventos().filter((e) => e.estado === 'aberto' && e.data >= hoje).length;
  });

  readonly modalTitulo = computed(() => (this.editandoCodigo() ? 'Editar evento' : 'Novo evento'));
  readonly modalSaveLabel = computed(() =>
    this.editandoCodigo() ? 'Guardar alterações' : 'Criar evento'
  );
  readonly imagemJustifyCss = computed(() => cipaFlexFromPos(this.imagemPosX()));
  readonly imagemAlignCss = computed(() => cipaFlexFromPos(this.imagemPosY()));
  readonly imagemRecortada = computed(() => this.imagemAltura() > 0);
  readonly imagemAlturaMax = CIPA_ALTURA_MAX;
  readonly estiloSelecionado = computed(() => this.textoEstilos()[this.textoCampo()]);
  readonly campoMeta = computed(() => CIPA_TEXTO_CAMPO_META[this.textoCampo()]);
  readonly previewTitulo = computed(() => this.titulo().trim() || 'Título do evento');
  readonly previewData = computed(() =>
    this.data() ? formatarDataCipaExtenso(this.data()) : 'Data do evento'
  );
  readonly previewVagas = computed(() =>
    this.slots().reduce((max, slot) => Math.max(max, Number(slot.vagas) || 0), 0)
  );

  readonly formValido = computed(() => {
    if (!this.titulo().trim() || !this.data()) return false;
    if (!this.categoria().trim() || !this.localizacao().trim()) return false;
    const slots = this.slots();
    if (!slots.length) return false;
    const slotsOk = slots.every(
      (s) => /^\d{2}:\d{2}$/.test(String(s.horario).slice(0, 5)) && Number(s.vagas) >= 1
    );
    if (!slotsOk) return false;
    if (!(this.duracao() >= 5)) return false;
    if (!this.editandoCodigo() && !this.arquivo()) return false;
    return true;
  });

  ngOnInit(): void {
    this.carregar();
    this.busca$
      .pipe(
        debounceTime(300),
        distinctUntilChanged(),
        switchMap((q) => (q.trim().length >= 2 ? this.api.buscarColaboradores(q.trim()) : of([])))
      )
      .subscribe({
        next: (list) => this.resultadosBusca.set(list),
        error: () => this.resultadosBusca.set([]),
      });
  }

  ngOnDestroy(): void {
    this.busca$.complete();
    this.revokePreview();
  }

  carregar(): void {
    this.carregando.set(true);
    this.api.listarAdmin().subscribe({
      next: (lista) => {
        this.eventos.set(lista);
        this.carregando.set(false);
      },
      error: (err: HttpErrorResponse) => {
        this.carregando.set(false);
        this.alertas.erro(err.error?.mensagem || 'Não foi possível carregar os eventos.');
      },
    });
  }

  formatarData(iso: string): string {
    return formatarDataCipaLonga(iso);
  }

  novo(): void {
    this.editandoCodigo.set(null);
    this.titulo.set('');
    this.data.set('');
    this.categoria.set('');
    this.localizacao.set('');
    this.texto.set('');
    this.estado.set('aberto');
    this.duracao.set(60);
    this.ocultoLista.set(false);
    this.linkPublico.set(false);
    this.slots.set([{ horario: '09:00', vagas: 10 }]);
    this.visualizadores.set([]);
    this.arquivo.set(null);
    this.temImagemAtual.set(false);
    this.removerImagem.set(false);
    this.resetImagemLayout();
    this.resetTodosTextos();
    this.revokePreview();
    this.preview.set(null);
    this.buscaTexto.set('');
    this.resultadosBusca.set([]);
    this.modalAberto.set(true);
  }

  editar(ev: CipaEvento): void {
    this.api.obterAdmin(ev.codigo).subscribe({
      next: (full) => {
        this.editandoCodigo.set(full.codigo);
        this.titulo.set(full.titulo);
        this.data.set(full.data);
        this.categoria.set(full.categoria || '');
        this.localizacao.set(full.localizacao || '');
        this.texto.set(full.texto || '');
        this.estado.set(full.estado);
        this.duracao.set(full.duracao_slot_min || 60);
        this.ocultoLista.set(!!full.oculto_lista);
        this.linkPublico.set(!!full.link_publico);
        const slots = full.slots ?? [];
        this.slots.set(
          slots.length
            ? slots.map((s: CipaSlot) => ({ horario: s.horario, vagas: s.vagas }))
            : [{ horario: '09:00', vagas: 10 }]
        );
        this.visualizadores.set(
          (full.visualizadores || []).map((v) => ({
            colaborador_id: v.colaborador_id || 0,
            usuario_id: v.usuario_id,
            nome: v.nome_completo,
            email: v.email,
            departamento: v.departamento,
          }))
        );
        this.arquivo.set(null);
        this.temImagemAtual.set(!!full.tem_imagem);
        this.removerImagem.set(false);
        this.imagemZoom.set(clampCipaZoom(full.imagem_zoom));
        this.imagemTamanho.set(clampCipaTamanho(full.imagem_tamanho));
        this.imagemAltura.set(clampCipaAltura(full.imagem_altura));
        this.imagemPosX.set(clampCipaPos(full.imagem_pos_x));
        this.imagemPosY.set(clampCipaPos(full.imagem_pos_y));
        this.textoEstilos.set(
          parseEstilosTexto(full.texto_estilos, {
            tamanho: full.texto_tamanho,
            alinhamento: full.texto_alinhamento,
          })
        );
        this.textoCampo.set('titulo');
        this.buscaTexto.set('');
        this.resultadosBusca.set([]);
        if (full.tem_imagem) {
          this.api.imagem(full.codigo, full.atualizado_em).subscribe({
            next: (blob) => {
              this.revokePreview();
              this.previewUrl = URL.createObjectURL(blob);
              this.preview.set(this.previewUrl);
            },
            error: () => this.preview.set(null),
          });
        } else {
          this.revokePreview();
          this.preview.set(null);
        }
        this.modalAberto.set(true);
      },
      error: (err: HttpErrorResponse) => {
        this.alertas.erro(err.error?.mensagem || 'Não foi possível abrir o evento.');
      },
    });
  }

  fecharModal(): void {
    if (this.salvando()) return;
    this.modalAberto.set(false);
  }

  addSlot(): void {
    const list = this.slots();
    const last = list[list.length - 1];
    const step = Math.max(5, Number(this.duracao()) || 60);
    this.slots.update((cur) => [
      ...cur,
      {
        horario: last ? this.somarMinutos(String(last.horario), step) : '09:00',
        vagas: last ? Number(last.vagas) || 10 : 10,
      },
    ]);
  }

  private somarMinutos(hhmm: string, minutos: number): string {
    const [h, m] = String(hhmm || '').slice(0, 5).split(':').map(Number);
    if (!Number.isFinite(h) || !Number.isFinite(m)) return '10:00';
    const total = (h * 60 + m + minutos + 24 * 60) % (24 * 60);
    const nh = Math.floor(total / 60);
    const nm = total % 60;
    return `${String(nh).padStart(2, '0')}:${String(nm).padStart(2, '0')}`;
  }

  removeSlot(idx: number): void {
    this.slots.update((list) => list.filter((_, i) => i !== idx));
  }

  patchSlot(idx: number, patch: Partial<SlotForm>): void {
    this.slots.update((list) => list.map((s, i) => (i === idx ? { ...s, ...patch } : s)));
  }

  onBuscaInput(q: string): void {
    this.buscaTexto.set(q);
    this.busca$.next(q);
  }

  addVisualizador(c: ColaboradorBusca): void {
    if (!c.email) {
      this.alertas.erro('Colaborador sem e-mail no AD não pode ser adicionado.');
      return;
    }
    const ja = this.visualizadores().some(
      (v) =>
        v.colaborador_id === c.id ||
        (v.email && c.email && v.email.toLowerCase() === c.email.toLowerCase())
    );
    if (ja) {
      this.alertas.erro('Este colaborador já está na lista.');
      return;
    }
    this.visualizadores.update((list) => [
      ...list,
      {
        colaborador_id: c.id,
        usuario_id: c.usuario_id,
        nome: c.nome,
        email: c.email || '',
        departamento: c.departamento,
      },
    ]);
    this.buscaTexto.set('');
    this.resultadosBusca.set([]);
  }

  removeVisualizador(chip: ViewerChip): void {
    this.visualizadores.update((list) =>
      list.filter((v) => v.colaborador_id !== chip.colaborador_id || v.email !== chip.email)
    );
  }

  iniciais(nome: string): string {
    const parts = String(nome || '')
      .trim()
      .split(/\s+/)
      .filter(Boolean);
    const a = parts[0]?.[0] || '';
    const b = parts.length > 1 ? parts[parts.length - 1][0] : '';
    return (a + b).toUpperCase();
  }

  onArquivo(ev: Event): void {
    const input = ev.target as HTMLInputElement;
    const file = input.files?.[0] || null;
    if (file && file.size > 5 * 1024 * 1024) {
      this.alertas.erro('A imagem deve ter no máximo 5 MB.');
      input.value = '';
      return;
    }
    this.arquivo.set(file);
    this.removerImagem.set(false);
    this.temImagemAtual.set(!!file);
    this.resetImagemLayout();
    const anterior = this.previewUrl;
    if (file) {
      this.previewUrl = URL.createObjectURL(file);
      this.preview.set(this.previewUrl);
    } else {
      this.previewUrl = null;
      this.preview.set(null);
    }
    if (anterior) URL.revokeObjectURL(anterior);
    input.value = '';
  }

  onZoomInput(value: string | number): void {
    this.imagemZoom.set(clampCipaZoom(Number(value)));
  }

  onTamanhoInput(value: string | number): void {
    this.imagemTamanho.set(clampCipaTamanho(Number(value)));
  }

  onAlturaInput(value: string | number): void {
    this.imagemAltura.set(clampCipaAltura(Number(value)));
  }

  onPosXInput(value: string | number): void {
    this.imagemPosX.set(clampCipaPos(Number(value)));
  }

  onPosYInput(value: string | number): void {
    this.imagemPosY.set(clampCipaPos(Number(value)));
  }

  estiloCss(campo: CipaTextoCampo) {
    return estiloCampoCss(this.textoEstilos(), campo);
  }

  selecionarTexto(campo: CipaTextoCampo, ev?: Event): void {
    ev?.stopPropagation();
    this.textoCampo.set(campo);
  }

  onTextoTamanhoInput(value: string | number): void {
    const campo = this.textoCampo();
    this.patchEstilo(campo, { tamanho: clampCampoTamanho(campo, Number(value)) });
  }

  setAlinhamento(alinhamento: CipaTextoAlinhamento): void {
    this.patchEstilo(this.textoCampo(), { alinhamento });
  }

  private patchEstilo(campo: CipaTextoCampo, patch: { tamanho?: number; alinhamento?: CipaTextoAlinhamento }): void {
    this.textoEstilos.update((atuais) => ({
      ...atuais,
      [campo]: { ...atuais[campo], ...patch },
    }));
  }

  resetImagemLayout(): void {
    this.imagemZoom.set(CIPA_ZOOM_DEFAULT);
    this.imagemTamanho.set(CIPA_TAMANHO_DEFAULT);
    this.imagemAltura.set(CIPA_ALTURA_AUTO);
    this.imagemPosX.set(CIPA_POS_DEFAULT);
    this.imagemPosY.set(CIPA_POS_DEFAULT);
  }

  resetTextoLayout(): void {
    const campo = this.textoCampo();
    this.patchEstilo(campo, estiloDefaultCampo(campo));
  }

  resetTodosTextos(): void {
    this.textoEstilos.set(estilosTextoDefault());
    this.textoCampo.set('titulo');
  }

  onBannerPointerDown(ev: PointerEvent): void {
    if (!this.preview()) return;
    const el = ev.currentTarget as HTMLElement;
    el.setPointerCapture(ev.pointerId);
    this.arrastando.set(true);
    this.drag = {
      x: ev.clientX,
      y: ev.clientY,
      posX: this.imagemPosX(),
      posY: this.imagemPosY(),
      w: el.clientWidth || 1,
      h: el.clientHeight || 1,
    };
  }

  onBannerPointerMove(ev: PointerEvent): void {
    if (!this.drag) return;
    const zoom = this.imagemZoom() / 100;
    const dx = ev.clientX - this.drag.x;
    const dy = ev.clientY - this.drag.y;
    this.imagemPosX.set(clampCipaPos(this.drag.posX - (dx / this.drag.w) * (100 / zoom)));
    this.imagemPosY.set(clampCipaPos(this.drag.posY - (dy / this.drag.h) * (100 / zoom)));
  }

  onBannerPointerUp(): void {
    this.drag = null;
    this.arrastando.set(false);
  }

  limparImagem(): void {
    this.arquivo.set(null);
    this.removerImagem.set(true);
    this.temImagemAtual.set(false);
    this.revokePreview();
    this.preview.set(null);
  }

  salvar(): void {
    if (!this.formValido()) return;
    const fd = new FormData();
    fd.append('titulo', this.titulo().trim());
    fd.append('data', this.data());
    fd.append('categoria', this.categoria().trim());
    fd.append('localizacao', this.localizacao().trim());
    fd.append('texto', this.texto().trim());
    fd.append('estado', this.estado());
    fd.append('duracao_slot_min', String(this.duracao() || 60));
    fd.append('oculto_lista', this.ocultoLista() ? '1' : '0');
    fd.append('link_publico', this.linkPublico() ? '1' : '0');
    fd.append(
      'slots',
      JSON.stringify(this.slots().map((s) => ({ horario: String(s.horario).slice(0, 5), vagas: Number(s.vagas) })))
    );
    const ids = this.visualizadores()
      .map((v) => v.colaborador_id)
      .filter((id) => id > 0);
    fd.append('colaborador_ids', JSON.stringify(ids));
    if (this.arquivo()) fd.append('imagem', this.arquivo() as File);
    if (this.removerImagem()) fd.append('remover_imagem', '1');
    fd.append('imagem_zoom', String(this.imagemZoom()));
    fd.append('imagem_tamanho', String(this.imagemTamanho()));
    fd.append('imagem_altura', String(this.imagemAltura()));
    fd.append('imagem_pos_x', String(this.imagemPosX()));
    fd.append('imagem_pos_y', String(this.imagemPosY()));
    const tituloEstilo = this.textoEstilos().titulo;
    fd.append('texto_estilos', JSON.stringify(this.textoEstilos()));
    fd.append('texto_tamanho', String(tituloEstilo.tamanho));
    fd.append('texto_alinhamento', tituloEstilo.alinhamento);

    this.salvando.set(true);
    const codigo = this.editandoCodigo();
    const req = codigo ? this.api.atualizar(codigo, fd) : this.api.criar(fd);
    req.subscribe({
      next: () => {
        this.salvando.set(false);
        this.modalAberto.set(false);
        this.alertas.sucesso(codigo ? 'Evento atualizado.' : 'Evento criado.');
        this.carregar();
      },
      error: (err: HttpErrorResponse) => {
        this.salvando.set(false);
        this.alertas.erro(err.error?.mensagem || 'Não foi possível salvar o evento.');
      },
    });
  }

  async excluir(ev: CipaEvento): Promise<void> {
    const ok = await this.alertas.confirmarExclusao({
      titulo: `Excluir “${ev.titulo}”?`,
      texto: 'Inscrições e horários deste evento serão removidos.',
    });
    if (!ok) return;
    this.api.excluir(ev.codigo).subscribe({
      next: () => {
        this.alertas.sucesso('Evento excluído.');
        this.carregar();
      },
      error: (err: HttpErrorResponse) => {
        this.alertas.erro(err.error?.mensagem || 'Não foi possível excluir.');
      },
    });
  }

  irInscritos(ev: CipaEvento, print = false): void {
    void this.router.navigate(['/admin/agenda_rh', ev.codigo, 'inscritos'], {
      queryParams: print ? { print: '1' } : {},
    });
  }

  exportarXlsx(ev: CipaEvento): void {
    this.api.exportarXlsx(ev.codigo).subscribe({
      next: (blob) => baixarBlob(blob, `cipa-inscritos-${ev.codigo}.xlsx`),
      error: (err: HttpErrorResponse) => {
        this.alertas.erro(err.error?.mensagem || 'Não foi possível exportar o Excel.');
      },
    });
  }

  exportarPdf(ev: CipaEvento): void {
    this.api.inscritos(ev.codigo).subscribe({
      next: (res) => gerarPdfInscritosCipa(res.evento, res.inscritos),
      error: (err: HttpErrorResponse) => {
        this.alertas.erro(err.error?.mensagem || 'Não foi possível gerar o PDF.');
      },
    });
  }

  async copiarLink(ev: CipaEvento): Promise<void> {
    const url = this.api.linkPublico(ev);
    try {
      await navigator.clipboard.writeText(url);
      this.alertas.sucesso('Link copiado.');
    } catch {
      this.alertas.erro('Não foi possível copiar o link.');
    }
  }

  private revokePreview(): void {
    if (this.previewUrl) {
      URL.revokeObjectURL(this.previewUrl);
      this.previewUrl = null;
    }
  }
}
