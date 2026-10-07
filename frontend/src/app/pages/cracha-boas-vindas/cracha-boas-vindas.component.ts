import { Component, ElementRef, ViewChild, computed, signal } from '@angular/core';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { PublicChromeComponent } from '../../shared/public-chrome/public-chrome.component';
import { FooterComponent } from '../../shared/footer/footer.component';
import { AlertasService } from '../../services/alertas.service';
import { PhotoAdjusterComponent } from '../../shared/cracha-boas-vindas/components/photo-adjuster/photo-adjuster.component';
import { BRANDS, BRAND_ORDER } from '../../shared/cracha-boas-vindas/data/brands.data';
import { ColaboradorCracha, FotoAjuste, novoColaboradorCracha } from '../../shared/cracha-boas-vindas/models/colaborador-cracha.model';
import {
  photoCircleMarkup,
  renderBoasVindasCard,
  renderCrachaSVG,
  standalonePhotoSVG,
} from '../../shared/cracha-boas-vindas/utils/render.util';
import { exportBoasVindasJPEG, exportCrachaJPEG, fileSafeName } from '../../shared/cracha-boas-vindas/utils/export.util';
import { clampPan, diametroFotoAlvo } from '../../shared/cracha-boas-vindas/utils/photo.util';

type Ferramenta = 'cracha' | 'boas';

const STORAGE_KEY = 'intranet_cracha_boas_vindas_v1';

interface CampoObrigatorio {
  chave: 'nomeCompleto' | 'area' | 'cargo' | 'email' | 'bio';
  label: string;
}

const CAMPOS_OBRIGATORIOS: Record<Ferramenta, CampoObrigatorio[]> = {
  cracha: [{ chave: 'nomeCompleto', label: 'Nome completo' }],
  boas: [
    { chave: 'nomeCompleto', label: 'Nome completo' },
    { chave: 'area', label: 'Área / Time' },
    { chave: 'cargo', label: 'Cargo' },
    { chave: 'email', label: 'E-mail' },
    { chave: 'bio', label: 'Texto de apresentação' },
  ],
};

function isVazio(colab: ColaboradorCracha, chave: CampoObrigatorio['chave']): boolean {
  const v = colab[chave];
  return !v || !String(v).trim();
}

function camposFaltando(colab: ColaboradorCracha, ferramenta: Ferramenta): string[] {
  const faltando = CAMPOS_OBRIGATORIOS[ferramenta].filter((c) => isVazio(colab, c.chave)).map((c) => c.label);
  if (!colab.foto) faltando.push('Foto');
  return faltando;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

@Component({
  selector: 'app-cracha-boas-vindas',
  standalone: true,
  imports: [PublicChromeComponent, FooterComponent, PhotoAdjusterComponent],
  templateUrl: './cracha-boas-vindas.component.html',
  styleUrl: './cracha-boas-vindas.component.scss',
})
export class CrachaBoasVindasComponent {
  @ViewChild('previewCanvas') previewCanvasRef?: ElementRef<HTMLDivElement>;

  readonly brands = BRANDS;
  readonly brandOrder = BRAND_ORDER;

  readonly ferramenta = signal<Ferramenta>('cracha');
  readonly colaboradores = signal<ColaboradorCracha[]>([]);
  readonly activeId = signal<string>('');
  readonly exportando = signal(false);
  readonly exportandoTodos = signal(false);
  readonly progressoLote = signal<string | null>(null);

  readonly ativo = computed(() => this.colaboradores().find((c) => c.id === this.activeId()) ?? null);

  readonly faltando = computed(() => {
    const colab = this.ativo();
    if (!colab) return [] as string[];
    return camposFaltando(colab, this.ferramenta());
  });

  readonly previewHtml = computed<SafeHtml | null>(() => {
    const colab = this.ativo();
    if (!colab) return null;
    if (this.ferramenta() === 'cracha') {
      const brand = this.brands[colab.empresaId] ?? this.brands[this.brandOrder[0]];
      return this.sanitizer.bypassSecurityTrustHtml(renderCrachaSVG(colab, brand));
    }
    return this.sanitizer.bypassSecurityTrustHtml(renderBoasVindasCard(colab));
  });

  private saveTimer: ReturnType<typeof setTimeout> | null = null;
  private autosaveAtivo = false;
  showRestoreBanner = false;
  private restoreSnapshot: { ferramenta: Ferramenta; activeId: string; colaboradores: ColaboradorCracha[] } | null =
    null;

  constructor(private readonly sanitizer: DomSanitizer, private readonly alertas: AlertasService) {
    const primeiro = novoColaboradorCracha();
    this.colaboradores.set([primeiro]);
    this.activeId.set(primeiro.id);
    this.carregarRascunhoSalvo();
    this.autosaveAtivo = true;
  }

  // ===================== Persistência local (rascunho) =====================

  private carregarRascunhoSalvo(): void {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const payload = JSON.parse(raw);
      if (!payload?.colaboradores?.length) return;
      this.restoreSnapshot = payload;
      this.showRestoreBanner = true;
    } catch {
      /* localStorage indisponível (ex.: navegação privada) - ignora e segue com formulário em branco */
    }
  }

  restaurarRascunho(): void {
    if (!this.restoreSnapshot) return;
    this.colaboradores.set(this.restoreSnapshot.colaboradores);
    this.activeId.set(this.restoreSnapshot.activeId || this.restoreSnapshot.colaboradores[0].id);
    this.ferramenta.set(this.restoreSnapshot.ferramenta === 'boas' ? 'boas' : 'cracha');
    this.showRestoreBanner = false;
  }

  descartarRascunho(): void {
    localStorage.removeItem(STORAGE_KEY);
    this.showRestoreBanner = false;
  }

  private agendarSalvamento(): void {
    if (!this.autosaveAtivo) return;
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => {
      try {
        localStorage.setItem(
          STORAGE_KEY,
          JSON.stringify({
            ferramenta: this.ferramenta(),
            activeId: this.activeId(),
            colaboradores: this.colaboradores(),
          })
        );
      } catch {
        this.alertas.erro('Não foi possível salvar automaticamente (armazenamento do navegador cheio). Exporte o que já fez para não arriscar perder.');
      }
    }, 500);
  }

  /**
   * Substitui o colaborador ativo por uma CÓPIA mutada (em vez de mutar o objeto em memória
   * e só trocar a referência do array). Necessário porque `ativo` e `faltando`/`previewHtml`
   * são computed signals encadeados: se o objeto do colaborador mantém a mesma referência,
   * `ativo()` é considerado "sem mudança" por igualdade referencial e os signals que dependem
   * dele (validação de campos obrigatórios, pré-visualização) não recalculam.
   */
  private commit(mutator: (colab: ColaboradorCracha) => void): void {
    const id = this.activeId();
    this.colaboradores.update((lista) =>
      lista.map((c) => {
        if (c.id !== id) return c;
        const copia = { ...c };
        mutator(copia);
        return copia;
      })
    );
    this.agendarSalvamento();
  }

  // ===================== Navegação (abas, colaboradores, marca) =====================

  selecionarFerramenta(f: Ferramenta): void {
    this.ferramenta.set(f);
    this.agendarSalvamento();
  }

  selecionarColaborador(id: string): void {
    this.activeId.set(id);
  }

  adicionarColaborador(): void {
    const atual = this.ativo();
    const novo = novoColaboradorCracha(atual?.empresaId);
    if (atual) novo.genero = atual.genero;
    this.colaboradores.update((lista) => [...lista, novo]);
    this.activeId.set(novo.id);
    this.agendarSalvamento();
  }

  async removerColaborador(id: string, event: Event): Promise<void> {
    event.stopPropagation();
    const alvo = this.colaboradores().find((c) => c.id === id);
    const ok = await this.alertas.confirmarExclusao({
      titulo: `Remover ${alvo?.nomeCompleto || 'este colaborador'}?`,
      texto: 'Essa ação não pode ser desfeita.',
    });
    if (!ok) return;
    const restantes = this.colaboradores().filter((c) => c.id !== id);
    this.colaboradores.set(restantes);
    if (this.activeId() === id && restantes.length) this.activeId.set(restantes[0].id);
    this.agendarSalvamento();
  }

  async limparTudo(): Promise<void> {
    const ok = await this.alertas.confirmar({
      titulo: 'Limpar tudo?',
      texto: 'Isso vai apagar todos os colaboradores cadastrados nesta ferramenta e não pode ser desfeito.',
      icon: 'warning',
      confirmar: 'Limpar tudo',
    });
    if (!ok) return;
    localStorage.removeItem(STORAGE_KEY);
    const primeiro = novoColaboradorCracha();
    this.colaboradores.set([primeiro]);
    this.activeId.set(primeiro.id);
  }

  selecionarMarca(brandId: string): void {
    this.commit((c) => (c.empresaId = brandId));
  }

  // ===================== Campos do formulário =====================

  onNomeCompleto(v: string): void {
    this.commit((c) => (c.nomeCompleto = v));
  }
  onNomeCurto(v: string): void {
    this.commit((c) => (c.nomeCurto = v));
  }
  onArea(v: string): void {
    this.commit((c) => (c.area = v));
  }
  onCargo(v: string): void {
    this.commit((c) => (c.cargo = v));
  }
  onEmail(v: string): void {
    this.commit((c) => (c.email = v));
  }
  onBio(v: string): void {
    this.commit((c) => (c.bio = v));
  }
  onGenero(v: 'M' | 'F' | 'N'): void {
    this.commit((c) => (c.genero = v));
  }
  onFotoChange(foto: FotoAjuste | null): void {
    this.commit((c) => (c.foto = foto));
  }

  // ===================== Arrastar direto na pré-visualização grande =====================
  // Além do círculo pequeno de ajuste na barra lateral, também dá pra arrastar a foto direto
  // em cima do crachá/boas-vindas exibido em tamanho real. Como os dois usam a mesma `foto`
  // do colaborador, ajustar em um já reflete no outro na hora.
  // Mesma lógica (diametroFotoAlvo) usada na Solicitação de Colaborador, pra o comportamento
  // de arraste ser idêntico nas duas telas.
  //
  // Durante o arraste, a foto é mutada direto (sem passar pelo signal/computed) e só o
  // círculo da foto é repintado no DOM - igual ao círculo pequeno de ajuste faz, e igual a
  // ferramenta original fazia (updateLivePhoto). Recalcular o card inteiro como string a cada
  // pixel de movimento (via o computed `previewHtml`) é pesado e deixava o arraste com atraso
  // perceptível. O `commit()` (que atualiza o signal de verdade) só roda ao soltar o mouse.
  private previewDragOrigin: { x: number; y: number; panX: number; panY: number; diametro: number } | null = null;

  onPreviewDragStart(event: MouseEvent | TouchEvent): void {
    const foto = this.ativo()?.foto;
    if (!foto) return;
    const diametro = diametroFotoAlvo(event.target as HTMLElement);
    if (!diametro) return;
    const point = 'touches' in event ? event.touches[0] : event;
    if (!point) return;
    this.previewDragOrigin = { x: point.clientX, y: point.clientY, panX: foto.panX, panY: foto.panY, diametro };
    if (event instanceof MouseEvent) event.preventDefault();
  }

  onPreviewDragMove(event: MouseEvent | TouchEvent): void {
    if (!this.previewDragOrigin) return;
    const colab = this.ativo();
    if (!colab?.foto) return;
    const point = 'touches' in event ? event.touches[0] : event;
    if (!point) return;
    colab.foto.panX = this.previewDragOrigin.panX + (point.clientX - this.previewDragOrigin.x) / this.previewDragOrigin.diametro;
    colab.foto.panY = this.previewDragOrigin.panY + (point.clientY - this.previewDragOrigin.y) / this.previewDragOrigin.diametro;
    clampPan(colab.foto);
    this.atualizarFotoNaPreviewGrande(colab);
  }

  onPreviewDragEnd(): void {
    if (this.previewDragOrigin) {
      const colab = this.ativo();
      if (colab?.foto) {
        const fotoFinal = { ...colab.foto };
        this.commit((c) => (c.foto = fotoFinal));
      }
    }
    this.previewDragOrigin = null;
  }

  /** Repinta só o círculo da foto na pré-visualização grande (crachá ou boas-vindas), sem re-renderizar o card inteiro. */
  private atualizarFotoNaPreviewGrande(colab: ColaboradorCracha): void {
    const container = this.previewCanvasRef?.nativeElement;
    if (!container) return;
    if (this.ferramenta() === 'cracha') {
      const group = container.querySelector('#photoGroup');
      if (!group) return;
      const brand = this.brands[colab.empresaId] ?? this.brands[this.brandOrder[0]];
      group.innerHTML = photoCircleMarkup(76.54, 121.67, 46.1, colab.foto, brand.color, 3, 'cracha');
    } else {
      const wrap = container.querySelector('.bv-photo-wrap');
      if (!wrap) return;
      wrap.innerHTML = standalonePhotoSVG(200, colab.foto, '#ffffff', 6, 'bv');
    }
  }

  // ===================== Exportação =====================

  async exportarAtivo(): Promise<void> {
    const colab = this.ativo();
    if (!colab) return;
    const faltam = this.faltando();
    if (faltam.length) {
      this.alertas.erro(`Preencha antes de exportar: ${faltam.join(', ')}.`);
      return;
    }
    this.exportando.set(true);
    try {
      if (this.ferramenta() === 'cracha') {
        const brand = this.brands[colab.empresaId] ?? this.brands[this.brandOrder[0]];
        const blob = await exportCrachaJPEG(colab, brand);
        downloadBlob(blob, `Cracha_${fileSafeName(colab.nomeCompleto)}.jpg`);
      } else {
        const blob = await exportBoasVindasJPEG(renderBoasVindasCard(colab));
        downloadBlob(blob, `Boas_vindas_${fileSafeName(colab.nomeCompleto)}.jpg`);
      }
    } catch (err) {
      console.error(err);
      this.alertas.erro('Ocorreu um erro ao exportar. Veja o console para detalhes.');
    } finally {
      this.exportando.set(false);
    }
  }

  async exportarTodos(): Promise<void> {
    const ferramenta = this.ferramenta();
    const lista = this.colaboradores();
    this.exportandoTodos.set(true);
    const pulados: string[] = [];
    try {
      for (let i = 0; i < lista.length; i++) {
        const colab = lista[i];
        const faltam = camposFaltando(colab, ferramenta);
        if (faltam.length) {
          pulados.push(`${colab.nomeCompleto || 'Colaborador ' + (i + 1)} (falta: ${faltam.join(', ')})`);
          continue;
        }
        this.progressoLote.set(`Gerando ${i + 1}/${lista.length}...`);
        if (ferramenta === 'cracha') {
          const brand = this.brands[colab.empresaId] ?? this.brands[this.brandOrder[0]];
          const blob = await exportCrachaJPEG(colab, brand);
          downloadBlob(blob, `Cracha_${fileSafeName(colab.nomeCompleto)}.jpg`);
        } else {
          const blob = await exportBoasVindasJPEG(renderBoasVindasCard(colab));
          downloadBlob(blob, `Boas_vindas_${fileSafeName(colab.nomeCompleto)}.jpg`);
        }
        await sleep(350);
      }
      if (pulados.length) {
        this.alertas.erro(`Pulados por falta de dados obrigatórios: ${pulados.join(' | ')}`);
      } else {
        this.alertas.sucesso('Exportação em lote concluída.');
      }
    } catch (err) {
      console.error(err);
      this.alertas.erro('Ocorreu um erro ao exportar em lote. Veja o console para detalhes.');
    } finally {
      this.exportandoTodos.set(false);
      this.progressoLote.set(null);
    }
  }

  nomeMarca(id: string): string {
    return this.brands[id]?.name ?? id;
  }
}
