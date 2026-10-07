import { Component, ElementRef, HostBinding, OnInit, ViewChild, computed, effect, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { HttpErrorResponse, HttpEventType } from '@angular/common/http';
import { PublicChromeComponent } from '../../shared/public-chrome/public-chrome.component';
import { FooterComponent } from '../../shared/footer/footer.component';
import { AlertasService } from '../../services/alertas.service';
import { AuthService } from '../../services/auth.service';
import { SolicitacaoColaboradorService } from '../../services/solicitacao-colaborador.service';
import {
  SolicitacaoEquipamento,
  SolicitacaoTipo,
} from '../../models/solicitacao-colaborador.model';
import { BRANDS, BRAND_ORDER, EMPRESA_PARA_BRAND } from '../../shared/cracha-boas-vindas/data/brands.data';
import { ColaboradorCracha, FotoAjuste } from '../../shared/cracha-boas-vindas/models/colaborador-cracha.model';
import {
  photoCircleMarkup,
  renderBoasVindasCard,
  renderCrachaSVG,
  standalonePhotoSVG,
} from '../../shared/cracha-boas-vindas/utils/render.util';
import { resizeImageFile, novaFotoAjuste, clampPan, diametroFotoAlvo } from '../../shared/cracha-boas-vindas/utils/photo.util';
import { blobToFile, exportBoasVindasJPEG, exportCrachaJPEG, fileSafeName } from '../../shared/cracha-boas-vindas/utils/export.util';
import { PhotoAdjusterComponent } from '../../shared/cracha-boas-vindas/components/photo-adjuster/photo-adjuster.component';

// Nem crachá nem boas-vindas têm upload manual: os dois são sempre gerados automaticamente a
// partir dos campos do formulário (nome, gênero, departamento, cargo, empresa, foto e o texto
// de apresentação). O crachá porque tem formato fixo de impressão (54×86mm, 300dpi); o
// boas-vindas porque agora o texto que aparece nele é digitado direto aqui.
type CampoArquivo = 'foto' | 'credencial_veiculo';

@Component({
  selector: 'app-solicitacao-colaborador',
  standalone: true,
  imports: [PublicChromeComponent, FooterComponent, FormsModule, PhotoAdjusterComponent],
  templateUrl: './solicitacao-colaborador.component.html',
  styleUrl: './solicitacao-colaborador.component.scss',
})
export class SolicitacaoColaboradorComponent implements OnInit {
  @ViewChild('previewStack') previewStackRef?: ElementRef<HTMLDivElement>;

  private readonly service = inject(SolicitacaoColaboradorService);
  private readonly auth = inject(AuthService);
  private readonly alertas = inject(AlertasService);

  readonly empresas = [
    'Nubank Parque',
    'WTorre',
    'Base Coworking',
    'Real Arenas',
    'Viva o Vale',
    'PNU',
  ];

  readonly carregando = signal(false);
  readonly enviando = signal(false);
  readonly progresso = signal(0);

  readonly solicitante = signal('');
  readonly solicitanteEmail = signal('');
  readonly tipo = signal<SolicitacaoTipo>('novo');
  readonly nome = signal('');
  readonly sobrenome = signal('');
  readonly genero = signal<'M' | 'F' | ''>('');
  // Texto que aparece no balão de fala do cartão de boas-vindas gerado automaticamente
  // (mesmo campo "Texto de apresentação" da ferramenta /cracha-boas-vindas).
  readonly bio = signal('');
  readonly emailNovo = signal('');
  readonly dataNascimento = signal('');
  readonly cpf = signal('');
  readonly rg = signal('');
  readonly departamento = signal('');
  readonly cargo = signal('');
  readonly supervisor = signal('');
  readonly centroCusto = signal('');
  readonly empresa = signal('');
  readonly localTrabalho = signal('');
  readonly precisaRamal = signal(true);
  readonly precisaCelular = signal(false);
  readonly equipamento = signal<SolicitacaoEquipamento>('notebook');
  readonly credencialEstacionamento = signal(false);
  readonly dataInicio = signal('');

  readonly fotoFile = signal<File | null>(null);
  // Ajuste (zoom/rotação/posição) derivado automaticamente da foto acima, editável via
  // <app-photo-adjuster> — é o que efetivamente entra no crachá/boas-vindas gerados.
  // O arquivo original enviado ao servidor continua sendo o `fotoFile` (sem corte).
  readonly fotoAjuste = signal<FotoAjuste | null>(null);
  readonly boasVindasFile = signal<File | null>(null);
  readonly crachaFile = signal<File | null>(null);
  readonly credencialVeiculoFile = signal<File | null>(null);

  readonly fotoDragover = signal(false);
  readonly credDragover = signal(false);

  // ---- Geração automática de crachá + boas-vindas (reaproveita a ferramenta Crachá & Boas-vindas) ----
  readonly gerandoAuto = signal(false);
  readonly crachaPreview = signal<SafeHtml | null>(null);
  readonly boasVindasPreview = signal<SafeHtml | null>(null);

  readonly podeGerarAuto = computed(
    () => !!this.fotoAjuste() && !!this.nome().trim() && !!this.sobrenome().trim() && !!this.empresa()
  );

  /** Cor da marca selecionada, pro círculo de ajuste ficar com o mesmo anel do crachá - igual ao padrão usado em /cracha-boas-vindas. */
  readonly corDaMarcaAtual = computed(() => {
    const brandId = EMPRESA_PARA_BRAND[this.empresa()] ?? BRAND_ORDER[0];
    return (BRANDS[brandId] ?? BRANDS[BRAND_ORDER[0]]).color;
  });

  // Botões, bordas e outros destaques da página (var(--wtorre)) seguem a cor da marca
  // selecionada - pra maioria das empresas isso continua azul (suas cores de marca também são
  // tons de azul), mas na Nubank Parque (roxo) tudo que usa --wtorre acompanha e vira roxo.
  @HostBinding('style.--wtorre') get corDeDestaqueVar(): string {
    return this.corDaMarcaAtual();
  }

  private autoGeracaoTimer: ReturnType<typeof setTimeout> | null = null;
  // Token de geração: incrementado sempre que uma geração em andamento deve ser descartada
  // (foto trocada, "Limpar", etc). Evita que uma geração lenta (html2canvas) que já estava
  // rodando termine DEPOIS de uma mudança mais recente e sobrescreva o resultado atual.
  private geracaoToken = 0;

  readonly mostrarCredencialVeiculo = computed(() => this.credencialEstacionamento());

  constructor(private readonly sanitizer: DomSanitizer) {
    // A pré-visualização (SVG/HTML - barato, só montagem de string) atualiza na hora, a cada
    // mudança de nome, sobrenome, gênero, departamento, cargo, empresa, texto de apresentação
    // ou foto - pra ficar dinâmico igual a ferramenta /cracha-boas-vindas (sem esperar nenhum
    // debounce). Só a geração dos ARQUIVOS finais (JPEG via html2canvas - caro) continua com
    // um pequeno debounce, já que isso não afeta o que a pessoa vê, só o que vai ser enviado.
    effect(() => {
      this.nome();
      this.sobrenome();
      this.genero();
      this.departamento();
      this.cargo();
      this.empresa();
      this.bio();
      this.fotoAjuste();

      if (!this.podeGerarAuto()) return;

      this.atualizarPreviewInstantaneo();

      if (this.autoGeracaoTimer) clearTimeout(this.autoGeracaoTimer);
      this.autoGeracaoTimer = setTimeout(() => this.gerarArquivosFinais(), 500);
    });
  }

  /** Monta o colaborador atual a partir dos campos do formulário - usado tanto pela pré-visualização instantânea quanto pela geração dos arquivos finais. */
  private montarColaborador(): ColaboradorCracha {
    const brandId = EMPRESA_PARA_BRAND[this.empresa()] ?? BRAND_ORDER[0];
    return {
      id: 'solicitacao',
      nomeCompleto: `${this.nome().trim()} ${this.sobrenome().trim()}`.trim(),
      nomeCurto: this.nome().trim(),
      genero: this.genero() || 'N',
      empresaId: brandId,
      area: this.departamento().trim(),
      cargo: this.cargo().trim(),
      email: this.emailNovo().trim(),
      bio: this.bio().trim(),
      foto: { ...this.fotoAjuste()! },
    };
  }

  /**
   * Atualiza a pré-visualização (crachá + boas-vindas) na hora, sem debounce - só monta as
   * strings de SVG/HTML (renderCrachaSVG/renderBoasVindasCard), sem passar pelo html2canvas.
   * É o que faz o crachá/boas-vindas parecerem "dinâmicos" ao digitar ou mexer no zoom, igual
   * a ferramenta /cracha-boas-vindas (que também só remonta a string, sem exportar nada, até
   * a pessoa clicar em "Exportar").
   */
  private atualizarPreviewInstantaneo(): void {
    const colab = this.montarColaborador();
    const brand = BRANDS[colab.empresaId] ?? BRANDS[BRAND_ORDER[0]];
    this.crachaPreview.set(this.sanitizer.bypassSecurityTrustHtml(renderCrachaSVG(colab, brand)));
    this.boasVindasPreview.set(this.sanitizer.bypassSecurityTrustHtml(renderBoasVindasCard(colab)));
  }

  ngOnInit(): void {
    this.preencherSolicitante();
    this.carregando.set(true);
    this.service.listarCampos().subscribe({
      next: () => this.carregando.set(false),
      error: () => this.carregando.set(false),
    });
  }

  private preencherSolicitante(): void {
    const u = this.auth.usuario();
    if (u) {
      this.solicitante.set(u.nome_completo || u.nome || '');
      this.solicitanteEmail.set(u.email || '');
    }
  }

  onCredencialEstacionamentoChange(val: boolean): void {
    this.credencialEstacionamento.set(val);
    if (!val) this.credencialVeiculoFile.set(null);
  }

  onFotoAjusteChange(foto: FotoAjuste | null): void {
    // <app-photo-adjuster> muta o objeto em vez de trocar a referência - clona aqui pra
    // garantir que o signal notifique o effect reativo (que depende de igualdade referencial).
    this.fotoAjuste.set(foto ? { ...foto } : null);
  }

  // ===================== Arrastar direto no crachá/boas-vindas da pré-visualização =====================
  // Além do círculo pequeno em "Documentos", também dá pra arrastar a foto direto em cima do
  // crachá ou do card de boas-vindas mostrados no painel de pré-visualização (à direita).
  // Mesma função (diametroFotoAlvo) usada na ferramenta standalone /cracha-boas-vindas, pra o
  // comportamento de arraste ser idêntico nas duas telas.
  //
  // Durante o arraste, a foto é mutada direto (mesmo objeto que <app-photo-adjuster> também
  // usa - por isso o círculo pequeno em "Documentos" acompanha em tempo real) e só o círculo
  // no painel de pré-visualização é repintado no DOM - sem passar pelo signal `fotoAjuste`,
  // que dispara a geração automática completa (debounce + html2canvas). Ir por ali a cada
  // pixel de movimento deixava o arraste com atraso perceptível. Só ao soltar o mouse o signal
  // é atualizado de verdade, disparando a regeneração (e o arquivo final) com a posição definitiva.
  private previewDragOrigin: { x: number; y: number; panX: number; panY: number; diametro: number } | null = null;

  onPreviewDragStart(event: MouseEvent | TouchEvent): void {
    const foto = this.fotoAjuste();
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
    const foto = this.fotoAjuste();
    if (!foto) return;
    const point = 'touches' in event ? event.touches[0] : event;
    if (!point) return;
    foto.panX = this.previewDragOrigin.panX + (point.clientX - this.previewDragOrigin.x) / this.previewDragOrigin.diametro;
    foto.panY = this.previewDragOrigin.panY + (point.clientY - this.previewDragOrigin.y) / this.previewDragOrigin.diametro;
    clampPan(foto);
    this.atualizarFotoNaPreview(foto);
  }

  onPreviewDragEnd(): void {
    if (this.previewDragOrigin) {
      const foto = this.fotoAjuste();
      if (foto) this.fotoAjuste.set({ ...foto });
    }
    this.previewDragOrigin = null;
  }

  /** Repinta só os círculos da foto (crachá e boas-vindas) no painel de pré-visualização, sem re-renderizar os cards inteiros. */
  private atualizarFotoNaPreview(foto: FotoAjuste): void {
    const container = this.previewStackRef?.nativeElement;
    if (!container) return;
    const group = container.querySelector('#photoGroup');
    if (group) {
      const brandId = EMPRESA_PARA_BRAND[this.empresa()] ?? BRAND_ORDER[0];
      const brand = BRANDS[brandId] ?? BRANDS[BRAND_ORDER[0]];
      group.innerHTML = photoCircleMarkup(76.54, 121.67, 46.1, foto, brand.color, 3, 'cracha');
    }
    const wrap = container.querySelector('.bv-photo-wrap');
    if (wrap) {
      wrap.innerHTML = standalonePhotoSVG(200, foto, '#ffffff', 6, 'bv');
    }
  }

  onGeneroChange(val: 'M' | 'F' | ''): void {
    this.genero.set(val);
    // A geração automática (efeito reativo no construtor) recalcula sozinha quando o gênero muda.
    // Se a pessoa já anexou boas-vindas/crachá manualmente, não mexe no anexo dela.
  }

  onDragOver(event: DragEvent, campo: CampoArquivo): void {
    event.preventDefault();
    this.setDragover(campo, true);
  }

  onDragLeave(campo: CampoArquivo): void {
    this.setDragover(campo, false);
  }

  onDrop(event: DragEvent, campo: CampoArquivo): void {
    event.preventDefault();
    this.setDragover(campo, false);
    const file = event.dataTransfer?.files?.[0];
    if (file) this.setArquivo(campo, file);
  }

  onFileInput(event: Event, campo: CampoArquivo): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (file) this.setArquivo(campo, file);
    input.value = '';
  }

  private setDragover(campo: CampoArquivo, val: boolean): void {
    if (campo === 'foto') this.fotoDragover.set(val);
    else this.credDragover.set(val);
  }

  private setArquivo(campo: CampoArquivo, file: File): void {
    if (campo === 'foto') {
      this.fotoFile.set(file);
      // Foto trocada: o preview antigo fica desatualizado até a geração automática (reativa) recalcular.
      this.crachaPreview.set(null);
      this.boasVindasPreview.set(null);
      this.fotoAjuste.set(null);
      // descarta qualquer geração em andamento baseada na foto anterior
      this.geracaoToken++;
      resizeImageFile(file, 900).then((resized) => {
        // se a pessoa trocou a foto de novo enquanto isso processava, `fotoFile` já não bate mais - ignora
        if (this.fotoFile() !== file) return;
        this.fotoAjuste.set(novaFotoAjuste(resized.dataUrl, resized.width, resized.height));
      });
    } else this.credencialVeiculoFile.set(file);
  }

  /** Clique explícito no botão "Gerar agora": pula o debounce e gera os arquivos finais na hora. */
  gerarAgora(): void {
    if (this.autoGeracaoTimer) clearTimeout(this.autoGeracaoTimer);
    this.gerarArquivosFinais();
  }

  /**
   * Gera os ARQUIVOS finais (JPEG via html2canvas) do crachá e do cartão de boas-vindas a
   * partir dos dados já preenchidos neste formulário (nome, sobrenome, departamento, cargo,
   * empresa, texto de apresentação e foto — já com o zoom/rotação/posição ajustados em
   * <app-photo-adjuster>), reaproveitando o mesmo motor de renderização da ferramenta "Crachá &
   * Boas-vindas". Evita que quem preenche a solicitação precise montar essas peças manualmente
   * em outra ferramenta e anexar aqui. A pré-visualização em si já está em dia antes disso rodar
   * (ver atualizarPreviewInstantaneo) - isso aqui só produz o arquivo que vai no envio.
   * Como este formulário não coleta gênero, o texto de boas-vindas usa uma redação neutra.
   */
  async gerarArquivosFinais(): Promise<void> {
    if (!this.fotoAjuste() || !this.podeGerarAuto()) return;

    // Identifica esta chamada: se a foto mudar (ou "Limpar") invalidar o token enquanto este
    // processamento (lento, principalmente o html2canvas) ainda está rodando, o resultado é
    // descartado em vez de sobrescrever um resultado mais recente.
    const meuToken = ++this.geracaoToken;

    this.gerandoAuto.set(true);
    try {
      const colab = this.montarColaborador();
      const brand = BRANDS[colab.empresaId] ?? BRANDS[BRAND_ORDER[0]];
      const nomeArquivo = fileSafeName(colab.nomeCompleto);

      const boasHtml = renderBoasVindasCard(colab);
      const [crachaBlob, boasBlob] = await Promise.all([
        exportCrachaJPEG(colab, brand),
        exportBoasVindasJPEG(boasHtml),
      ]);

      if (meuToken === this.geracaoToken) {
        this.crachaFile.set(blobToFile(crachaBlob, `Cracha_${nomeArquivo}.jpg`));
        this.boasVindasFile.set(blobToFile(boasBlob, `Boas_vindas_${nomeArquivo}.jpg`));
      }
    } catch (err) {
      console.error(err);
      this.alertas.erro('Não foi possível gerar automaticamente. Tente novamente.');
    } finally {
      this.gerandoAuto.set(false);
    }
  }

  limpar(): void {
    this.tipo.set('novo');
    this.nome.set('');
    this.sobrenome.set('');
    this.genero.set('');
    this.bio.set('');
    this.emailNovo.set('');
    this.dataNascimento.set('');
    this.cpf.set('');
    this.rg.set('');
    this.departamento.set('');
    this.cargo.set('');
    this.supervisor.set('');
    this.centroCusto.set('');
    this.empresa.set('');
    this.localTrabalho.set('');
    this.precisaRamal.set(true);
    this.precisaCelular.set(false);
    this.equipamento.set('notebook');
    this.credencialEstacionamento.set(false);
    this.dataInicio.set('');
    this.fotoFile.set(null);
    this.fotoAjuste.set(null);
    this.boasVindasFile.set(null);
    this.crachaFile.set(null);
    this.credencialVeiculoFile.set(null);
    this.crachaPreview.set(null);
    this.boasVindasPreview.set(null);
    this.geracaoToken++;
    if (this.autoGeracaoTimer) clearTimeout(this.autoGeracaoTimer);
    this.preencherSolicitante();
  }

  private validarCliente(): string | null {
    if (!this.solicitante().trim()) return 'Informe o solicitante.';
    if (!this.solicitanteEmail().trim()) return 'Informe o e-mail do solicitante.';
    if (!this.nome().trim()) return 'Informe o nome.';
    if (!this.sobrenome().trim()) return 'Informe o sobrenome.';
    if (!this.dataNascimento()) return 'Informe a data de nascimento.';
    if (!this.cpf().trim()) return 'Informe o CPF.';
    if (!this.departamento().trim()) return 'Informe o departamento.';
    if (!this.cargo().trim()) return 'Informe o cargo.';
    if (!this.supervisor().trim()) return 'Informe o supervisor.';
    if (!this.centroCusto().trim()) return 'Informe o centro de custo.';
    if (!this.empresa()) return 'Selecione a empresa.';
    if (!this.localTrabalho().trim()) return 'Informe o local de trabalho.';
    if (this.tipo() !== 'efetivacao' && this.tipo() !== 'mudanca' && !this.fotoFile()) {
      return 'Envie a foto do colaborador.';
    }
    if (!this.dataInicio()) return 'Informe a data de início.';
    if (this.credencialEstacionamento() && !this.credencialVeiculoFile()) {
      return 'Credencial do veículo é obrigatória quando estacionamento = Sim.';
    }
    return null;
  }

  enviar(): void {
    const erro = this.validarCliente();
    if (erro) {
      this.alertas.erro(erro);
      return;
    }

    const fd = new FormData();
    fd.append('solicitante', this.solicitante().trim());
    fd.append('solicitante_email', this.solicitanteEmail().trim());
    fd.append('tipo', this.tipo());
    fd.append('nome', this.nome().trim());
    fd.append('sobrenome', this.sobrenome().trim());
    if (this.genero()) fd.append('genero', this.genero());
    if (this.emailNovo().trim()) fd.append('email_novo', this.emailNovo().trim());
    fd.append('data_nascimento', this.dataNascimento());
    fd.append('cpf', this.cpf().trim());
    if (this.rg().trim()) fd.append('rg', this.rg().trim());
    fd.append('departamento', this.departamento().trim());
    fd.append('cargo', this.cargo().trim());
    fd.append('supervisor', this.supervisor().trim());
    fd.append('centro_custo', this.centroCusto().trim());
    fd.append('empresa', this.empresa());
    fd.append('local_trabalho', this.localTrabalho().trim());
    fd.append('precisa_ramal', this.precisaRamal() ? '1' : '0');
    fd.append('precisa_celular', this.precisaCelular() ? '1' : '0');
    fd.append('equipamento', this.equipamento());
    fd.append('credencial_estacionamento', this.credencialEstacionamento() ? '1' : '0');
    fd.append('data_inicio', this.dataInicio());

    const foto = this.fotoFile();
    const boas = this.boasVindasFile();
    const cracha = this.crachaFile();
    const cred = this.credencialVeiculoFile();
    if (foto) fd.append('foto', foto);
    if (boas) fd.append('boas_vindas', boas);
    if (cracha) fd.append('cracha', cracha);
    if (cred) fd.append('credencial_veiculo', cred);

    this.enviando.set(true);
    this.progresso.set(0);

    this.service.criar(fd).subscribe({
      next: (event) => {
        if (event.type === HttpEventType.UploadProgress && event.total) {
          this.progresso.set(Math.round((100 * event.loaded) / event.total));
        }
        if (event.type === HttpEventType.Response) {
          this.enviando.set(false);
          this.progresso.set(100);
          const body = event.body;
          const grupos = body?.envio?.grupos?.length
            ? body.envio.grupos.map((g) => g.grupo_nome).join(', ')
            : null;
          const msg = grupos
            ? `Solicitação enviada. Grupos notificados: ${grupos}.`
            : body?.envio?.aviso || 'Solicitação registrada com sucesso.';
          this.alertas.sucesso(msg);
          this.limpar();
        }
      },
      error: (err: HttpErrorResponse) => {
        this.enviando.set(false);
        this.alertas.erro(err.error?.mensagem || 'Erro ao enviar solicitação.');
      },
    });
  }
}
