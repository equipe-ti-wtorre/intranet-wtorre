import { Component, OnInit, inject, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { MassagemService } from '../../../services/massagem.service';
import { AlertasService } from '../../../services/alertas.service';
import { MassagemLayout, MassagemLayoutChip } from '../../../models/massagem.model';
import { AdminModalComponent } from '../../../shared/admin/admin-modal/admin-modal.component';
import { DocCatIconeComponent } from '../../../shared/documentos/doc-cat-icone.component';
import { DocCatIconePickerComponent } from '../../../shared/documentos/doc-cat-icone-picker.component';
import { DocCatIconeService } from '../../../shared/documentos/doc-cat-icone.service';
import { ICONE_PADRAO } from '../../../models/documento.model';

type IconeAlvo = 'brand' | { chip: number };

const ICONE_MARCA_PADRAO = 'lucide:leaf';
const ICONE_CHIP_PADRAO = 'lucide:zap';

@Component({
  selector: 'app-massagem-layout-admin',
  standalone: true,
  imports: [FormsModule, AdminModalComponent, DocCatIconeComponent, DocCatIconePickerComponent],
  templateUrl: './massagem-layout-admin.component.html',
  styleUrl: './massagem-layout-admin.component.scss',
})
export class MassagemLayoutAdminComponent implements OnInit {
  private readonly api = inject(MassagemService);
  private readonly alertas = inject(AlertasService);
  private readonly iconeService = inject(DocCatIconeService);

  readonly carregando = signal(true);
  readonly salvando = signal(false);
  readonly salvandoConfig = signal(false);
  readonly emailsTeste = input<string[]>([]);
  readonly emailsTesteChange = output<string[]>();
  readonly modalIconeAberto = signal(false);
  readonly iconTemp = signal(ICONE_MARCA_PADRAO);
  readonly iconeAlvo = signal<IconeAlvo | null>(null);

  emailTesteInput = '';

  layout: MassagemLayout = {
    brandNome: 'Bem-estar · Massagem',
    brandIcone: ICONE_MARCA_PADRAO,
    home: {
      eyebrow: '',
      titulo: '',
      tituloComplemento: '',
      tituloDestaque: '',
      subtitulo: '',
      chips: [],
    },
  };

  ngOnInit(): void {
    this.carregar();
  }

  private aplicarLayout(lay: MassagemLayout): void {
    this.layout = {
      ...lay,
      brandIcone: this.iconeService.normalizarParaLeitura(lay.brandIcone || ICONE_MARCA_PADRAO),
      home: {
        ...lay.home,
        chips: (lay.home.chips || []).map((c) => ({
          ...c,
          icone: this.iconeService.normalizarParaLeitura(c.icone || ICONE_CHIP_PADRAO),
        })),
      },
    };
  }

  carregar(): void {
    this.carregando.set(true);
    this.api.getLayout().subscribe({
      next: (lay) => {
        this.aplicarLayout(lay);
        this.carregando.set(false);
      },
      error: (err: HttpErrorResponse) => {
        this.alertas.erro(err.error?.mensagem || 'Erro ao carregar layout.');
        this.carregando.set(false);
      },
    });
  }

  addChip(): void {
    this.layout.home.chips = [...this.layout.home.chips, { icone: ICONE_CHIP_PADRAO, texto: '' }];
  }

  removeChip(i: number): void {
    this.layout.home.chips = this.layout.home.chips.filter((_, idx) => idx !== i);
  }

  moverChip(i: number, delta: number): void {
    const next = i + delta;
    const chips = this.layout.home.chips;
    if (next < 0 || next >= chips.length) return;
    const copy = [...chips];
    const [item] = copy.splice(i, 1);
    copy.splice(next, 0, item);
    this.layout.home.chips = copy;
  }

  trackChip(_i: number, c: MassagemLayoutChip): string {
    return `${c.icone}-${c.texto}-${_i}`;
  }

  abrirModalIconeBrand(): void {
    this.iconeAlvo.set('brand');
    this.iconTemp.set(
      this.iconeService.normalizarParaLeitura(this.layout.brandIcone || ICONE_MARCA_PADRAO)
    );
    this.modalIconeAberto.set(true);
  }

  abrirModalIconeChip(index: number): void {
    const chip = this.layout.home.chips[index];
    this.iconeAlvo.set({ chip: index });
    this.iconTemp.set(this.iconeService.normalizarParaLeitura(chip?.icone || ICONE_CHIP_PADRAO));
    this.modalIconeAberto.set(true);
  }

  fecharModalIcone(): void {
    this.modalIconeAberto.set(false);
    this.iconeAlvo.set(null);
  }

  selecionarIconTemp(value: string): void {
    this.iconTemp.set(value);
  }

  confirmarIcone(): void {
    const alvo = this.iconeAlvo();
    if (alvo === null) return;
    const valor = this.iconeService.normalizarParaSalvar(this.iconTemp()) ?? ICONE_PADRAO;
    if (alvo === 'brand') {
      this.layout.brandIcone = valor;
    } else {
      const chip = this.layout.home.chips[alvo.chip];
      if (chip) chip.icone = valor;
    }
    this.fecharModalIcone();
  }

  salvarLayout(): void {
    this.salvando.set(true);
    const payload: MassagemLayout = {
      ...this.layout,
      brandIcone:
        this.iconeService.normalizarParaSalvar(this.layout.brandIcone) ?? ICONE_MARCA_PADRAO,
      home: {
        ...this.layout.home,
        chips: this.layout.home.chips.map((c) => ({
          ...c,
          icone: this.iconeService.normalizarParaSalvar(c.icone) ?? ICONE_CHIP_PADRAO,
        })),
      },
    };
    this.api.saveLayout(payload).subscribe({
      next: (lay) => {
        this.aplicarLayout(lay);
        this.alertas.sucesso('Layout salvo.');
        this.salvando.set(false);
      },
      error: (err: HttpErrorResponse) => {
        this.alertas.erro(err.error?.mensagem || 'Erro ao salvar layout.');
        this.salvando.set(false);
      },
    });
  }

  private emailValido(email: string): boolean {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  }

  adicionarEmailTeste(): void {
    const email = this.emailTesteInput.trim().toLowerCase();
    if (!email) return;
    if (!this.emailValido(email)) {
      this.alertas.erro('Informe um e-mail válido.');
      return;
    }
    if (this.emailsTeste().includes(email)) {
      this.alertas.erro('Este e-mail já está na lista.');
      return;
    }
    this.emailsTesteChange.emit([...this.emailsTeste(), email]);
    this.emailTesteInput = '';
  }

  removerEmailTeste(email: string): void {
    this.emailsTesteChange.emit(this.emailsTeste().filter((e) => e !== email));
  }

  salvarConfigEmails(): void {
    const pendente = this.emailTesteInput.trim().toLowerCase();
    let lista = this.emailsTeste();
    if (pendente) {
      if (!this.emailValido(pendente)) {
        this.alertas.erro('Informe um e-mail válido antes de salvar.');
        return;
      }
      if (!lista.includes(pendente)) {
        lista = [...lista, pendente];
        this.emailsTesteChange.emit(lista);
      }
      this.emailTesteInput = '';
    }
    this.salvandoConfig.set(true);
    this.api.saveConfig({ emailsTeste: lista }).subscribe({
      next: (cfg) => {
        this.emailsTesteChange.emit(cfg.emailsTeste || []);
        this.alertas.sucesso('E-mails de teste salvos.');
        this.salvandoConfig.set(false);
      },
      error: (err: HttpErrorResponse) => {
        this.alertas.erro(err.error?.mensagem || 'Erro ao salvar e-mails de teste.');
        this.salvandoConfig.set(false);
      },
    });
  }
}
