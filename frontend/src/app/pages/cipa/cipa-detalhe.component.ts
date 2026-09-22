import { HttpErrorResponse } from '@angular/common/http';
import { Component, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { CipaEvento, CipaSlot, CipaTextoCampo } from '../../models/cipa.model';
import { AlertasService } from '../../services/alertas.service';
import { AuthService } from '../../services/auth.service';
import { CipaService } from '../../services/cipa.service';
import { formatarDataCipaExtenso } from '../../utils/cipa-admin.util';
import {
  cipaFlexFromPos,
  clampCipaAltura,
  clampCipaTamanho,
  estiloCampoCss,
  parseEstilosTexto,
} from '../../utils/cipa-card-layout.util';
import { formatCpfMask, isValidCpf, onlyCpfDigits } from '../../utils/cpf';
import { AdminModalComponent } from '../../shared/admin/admin-modal/admin-modal.component';
import { FooterComponent } from '../../shared/footer/footer.component';
import { PublicChromeComponent } from '../../shared/public-chrome/public-chrome.component';

@Component({
  selector: 'app-cipa-detalhe',
  standalone: true,
  imports: [
    PublicChromeComponent,
    FooterComponent,
    FormsModule,
    RouterLink,
    AdminModalComponent,
  ],
  templateUrl: './cipa-detalhe.component.html',
  styleUrl: './cipa-detalhe.component.scss',
})
export class CipaDetalheComponent implements OnInit, OnDestroy {
  private readonly api = inject(CipaService);
  private readonly route = inject(ActivatedRoute);
  private readonly auth = inject(AuthService);
  private readonly alertas = inject(AlertasService);
  private blobUrl: string | null = null;

  readonly carregando = signal(true);
  readonly enviando = signal(false);
  readonly erro = signal('');
  readonly evento = signal<CipaEvento | null>(null);
  readonly imagemUrl = signal<string | null>(null);
  readonly modalAberto = signal(false);
  readonly slotSelecionado = signal<CipaSlot | null>(null);
  readonly cpf = signal('');
  readonly guestNome = signal('');
  readonly guestEmail = signal('');

  readonly imagemTamanho = computed(() => clampCipaTamanho(this.evento()?.imagem_tamanho));
  readonly imagemAltura = computed(() => clampCipaAltura(this.evento()?.imagem_altura));
  readonly imagemRecortada = computed(() => this.imagemAltura() > 0);
  readonly imagemJustifyCss = computed(() => cipaFlexFromPos(this.evento()?.imagem_pos_x ?? 50));
  readonly imagemAlignCss = computed(() => cipaFlexFromPos(this.evento()?.imagem_pos_y ?? 50));
  readonly estilosTexto = computed(() => {
    const ev = this.evento();
    return parseEstilosTexto(ev?.texto_estilos, {
      tamanho: ev?.texto_tamanho,
      alinhamento: ev?.texto_alinhamento,
    });
  });
  readonly logado = computed(() => this.auth.temSessao());
  readonly nome = computed(
    () => this.auth.usuario()?.nome_completo || this.auth.usuario()?.nome || this.guestNome()
  );
  readonly email = computed(() => this.auth.usuario()?.email || this.guestEmail());
  readonly cpfValido = computed(() => isValidCpf(this.cpf()));
  readonly emailValido = computed(() =>
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(this.email().trim())
  );
  readonly formInscricaoValido = computed(() => {
    if (!this.cpfValido()) return false;
    if (this.logado()) return true;
    return this.guestNome().trim().length >= 2 && this.emailValido();
  });

  ngOnInit(): void {
    const codigo = String(this.route.snapshot.paramMap.get('codigo') || '').trim();
    if (!/^[a-f0-9]{24}$/i.test(codigo)) {
      this.erro.set('Evento não encontrado.');
      this.carregando.set(false);
      return;
    }
    this.carregar(codigo.toLowerCase());
  }

  ngOnDestroy(): void {
    if (this.blobUrl) URL.revokeObjectURL(this.blobUrl);
  }

  carregar(codigo: string): void {
    this.carregando.set(true);
    this.erro.set('');
    this.api.obter(codigo).subscribe({
      next: (ev) => {
        this.evento.set(ev);
        this.carregando.set(false);
        if (ev.tem_imagem) {
          this.api.imagem(ev.codigo, ev.atualizado_em).subscribe({
            next: (blob) => {
              if (this.blobUrl) URL.revokeObjectURL(this.blobUrl);
              this.blobUrl = URL.createObjectURL(blob);
              this.imagemUrl.set(this.blobUrl);
            },
            error: () => this.imagemUrl.set(null),
          });
        }
      },
      error: (err: HttpErrorResponse) => {
        this.erro.set(err.error?.mensagem || 'Evento não encontrado.');
        this.carregando.set(false);
      },
    });
  }

  formatarData(iso: string): string {
    return formatarDataCipaExtenso(iso);
  }

  estilo(campo: CipaTextoCampo) {
    return estiloCampoCss(this.estilosTexto(), campo);
  }

  percentualOcupacao(slot: CipaSlot): number {
    if (!slot.vagas) return slot.inscritos > 0 ? 100 : 0;
    return Math.min(100, Math.round((slot.inscritos / slot.vagas) * 100));
  }

  vagasMaximas(ev: CipaEvento): number {
    return (ev.slots || []).reduce((max, slot) => Math.max(max, Number(slot.vagas) || 0), 0);
  }

  slotIndisponivel(slot: CipaSlot, ev: CipaEvento): boolean {
    return slot.vagas_restantes <= 0 || ev.estado === 'encerrado';
  }

  onCpfInput(value: string): void {
    this.cpf.set(formatCpfMask(value));
  }

  abrirInscricao(slot: CipaSlot): void {
    if (slot.vagas_restantes <= 0) {
      this.alertas.erro('Não há vagas neste horário.');
      return;
    }
    this.slotSelecionado.set(slot);
    this.cpf.set('');
    if (!this.logado()) {
      this.guestNome.set('');
      this.guestEmail.set('');
    }
    this.modalAberto.set(true);
  }

  fecharModal(): void {
    if (this.enviando()) return;
    this.modalAberto.set(false);
    this.slotSelecionado.set(null);
  }

  confirmar(): void {
    const ev = this.evento();
    const slot = this.slotSelecionado();
    if (!ev || !slot) return;
    if (!this.formInscricaoValido()) {
      this.alertas.erro(
        this.logado() ? 'Informe um CPF válido.' : 'Informe nome, e-mail e CPF válidos.'
      );
      return;
    }
    this.enviando.set(true);
    const body: { slot_id: number; cpf: string; nome?: string; email?: string } = {
      slot_id: slot.id,
      cpf: onlyCpfDigits(this.cpf()),
    };
    if (!this.logado()) {
      body.nome = this.guestNome().trim();
      body.email = this.guestEmail().trim();
    }
    this.api.inscrever(ev.codigo, body).subscribe({
      next: (res) => {
        this.enviando.set(false);
        this.modalAberto.set(false);
        this.alertas.sucesso(res.message || 'Inscrição confirmada.');
        this.carregar(ev.codigo);
      },
      error: (err: HttpErrorResponse) => {
        this.enviando.set(false);
        this.alertas.erro(err.error?.mensagem || 'Não foi possível concluir a inscrição.');
      },
    });
  }
}
