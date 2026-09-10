import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { PesquisasService } from '../../services/pesquisas.service';
import { AlertasService } from '../../services/alertas.service';
import { PesquisasPergunta, PesquisasResponderPayload } from '../../models/pesquisas.model';
import { PesqIconComponent } from './shared/pesq-icon.component';
import { PesquisasGuestFormComponent } from './shared/pesquisas-guest-form.component';

@Component({
  selector: 'app-pesquisas-responder',
  standalone: true,
  imports: [FormsModule, PesqIconComponent, PesquisasGuestFormComponent],
  templateUrl: './pesquisas-responder.component.html',
})
export class PesquisasResponderComponent implements OnInit {
  private readonly api = inject(PesquisasService);
  private readonly alertas = inject(AlertasService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  readonly loading = signal(true);
  readonly enviando = signal(false);
  readonly payload = signal<PesquisasResponderPayload | null>(null);
  readonly respostas = signal<Record<number, string>>({});
  readonly anexos = signal<Record<number, File>>({});
  readonly respostasGuest = computed(() => {
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(this.respostas())) out[k] = v;
    return out;
  });

  readonly visiveis = computed(() => {
    const p = this.payload();
    if (!p) return [];
    const map = new Map(Object.entries(this.respostas()).map(([k, v]) => [Number(k), v]));
    return p.perguntas.filter((q) => this.visivel(q, p.perguntas, map));
  });

  ngOnInit(): void {
    const id = Number(this.route.snapshot.paramMap.get('id'));
    this.api.payloadResponder(id).subscribe({
      next: (p) => {
        this.payload.set(p);
        this.loading.set(false);
      },
      error: (err: HttpErrorResponse) => {
        this.alertas.erro(err.error?.mensagem || 'Não foi possível abrir o formulário.');
        this.loading.set(false);
        void this.router.navigate(['/pesquisas']);
      },
    });
  }

  setValor(id: number, valor: string): void {
    this.respostas.update((r) => ({ ...r, [id]: valor }));
  }

  onGuestValor(ev: { key: string; valor: string }): void {
    const id = Number(ev.key);
    if (!Number.isFinite(id)) return;
    this.setValor(id, ev.valor);
  }

  onGuestArquivo(ev: { key: string; file: File | null }): void {
    const id = Number(ev.key);
    if (!Number.isFinite(id)) return;
    this.anexos.update((m) => {
      const next = { ...m };
      if (ev.file) next[id] = ev.file;
      else delete next[id];
      return next;
    });
    this.setValor(id, ev.file?.name || '');
  }

  enviar(): void {
    const p = this.payload();
    if (!p) return;
    const itens = this.visiveis()
      .filter((q) => q.id && q.blocoTipo !== 'texto')
      .map((q) => ({
        perguntaId: q.id as number,
        valor: q.blocoTipo === 'anexo' ? '' : this.respostas()[q.id as number] || '',
      }));
    this.enviando.set(true);
    this.api.enviarResposta(p.id, itens, this.anexos()).subscribe({
      next: () => {
        this.alertas.sucesso('Resposta enviada com sucesso.');
        this.enviando.set(false);
        void this.router.navigate(['/pesquisas']);
      },
      error: (err: HttpErrorResponse) => {
        this.alertas.erro(err.error?.mensagem || 'Não foi possível enviar a resposta.');
        this.enviando.set(false);
      },
    });
  }

  voltar(): void {
    void this.router.navigate(['/pesquisas']);
  }

  private visivel(
    pergunta: PesquisasPergunta,
    todas: PesquisasPergunta[],
    map: Map<number, string>
  ): boolean {
    if (!pergunta.logica) return true;
    const alvo = todas.find((x) => x.ordem === pergunta.logica?.perguntaOrdem);
    if (!alvo?.id) return true;
    const valor = map.get(alvo.id);
    const c = pergunta.logica.condicao;
    if (c === 'qualquer') return true;
    if (c === 'sim') return valor === 'Sim';
    if (c === 'nao') return valor === 'Não';
    if (c === 'escala_gte_4') return Number(valor) >= 4;
    return true;
  }
}
