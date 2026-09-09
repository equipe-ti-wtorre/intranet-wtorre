import {
  AfterViewInit,
  Component,
  computed,
  ElementRef,
  inject,
  OnDestroy,
  OnInit,
  signal,
  ViewChild,
  ViewEncapsulation,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { forkJoin } from 'rxjs';
import { MassagemService } from '../../services/massagem.service';
import { AlertasService } from '../../services/alertas.service';
import { MassagemEmpresa, MassagemEvento, MassagemLayout } from '../../models/massagem.model';
import { MsgIconComponent } from './shared/msg-icon.component';
import { MassagemSubnavComponent } from './shared/massagem-subnav.component';
import { DocCatIconeComponent } from '../../shared/documentos/doc-cat-icone.component';
import {
  corEmpresaFromHex,
  faixaHorario,
  formatData,
  ocupacaoBadgeClass,
} from './shared/massagem-ui.utils';

const RING_R = 34;
const RING_C = 2 * Math.PI * RING_R;

type ParticleType = 'dot' | 'sparkle' | 'cross';

interface Particle {
  x: number;
  y: number;
  size: number;
  speedX: number;
  speedY: number;
  op: number;
  maxOp: number;
  fadeIn: number;
  life: number;
  maxLife: number;
  type: ParticleType;
  wobble: number;
  wobbleSpd: number;
  wobbleAmp: number;
}

const PARTICLE_TYPES: ParticleType[] = ['dot', 'dot', 'dot', 'dot', 'sparkle', 'sparkle', 'cross'];

const DEFAULT_LAYOUT: MassagemLayout = {
  brandNome: 'Bem-estar · Massagem',
  brandIcone: 'lucide:leaf',
  home: {
    eyebrow: 'Programa ativo',
    titulo: 'Reserve sua sessão',
    tituloComplemento: 'de',
    tituloDestaque: 'bem-estar',
    subtitulo: 'Escolha o evento e garanta seu horário. Totalmente confidencial.',
    chips: [
      { icone: 'lucide:zap', texto: 'Confirmação imediata' },
      { icone: 'lucide:refresh-cw', texto: 'Troca de horário livre' },
    ],
  },
};

@Component({
  selector: 'app-massagem-home',
  standalone: true,
  imports: [RouterLink, MsgIconComponent, MassagemSubnavComponent, DocCatIconeComponent],
  templateUrl: './massagem-home.component.html',
  styleUrl: './massagem-home.component.scss',
  encapsulation: ViewEncapsulation.None,
})
export class MassagemHomeComponent implements OnInit, AfterViewInit, OnDestroy {
  @ViewChild('particleCanvas') particleCanvas?: ElementRef<HTMLCanvasElement>;

  private readonly api = inject(MassagemService);
  private readonly alertas = inject(AlertasService);

  readonly loading = signal(true);
  readonly eventos = signal<MassagemEvento[]>([]);
  readonly empresas = signal<MassagemEmpresa[]>([]);
  readonly layout = signal<MassagemLayout>(DEFAULT_LAYOUT);
  readonly unidadeSel = signal('');
  readonly ringC = RING_C;

  readonly unidadesTabs = computed(() => {
    const presets = this.empresas().map((e) => e.nm);
    const presetSet = new Set(presets);
    const customs = this.eventos()
      .map((e) => e.unidade)
      .filter((u): u is string => !!u && !presetSet.has(u));
    return [...presets, ...Array.from(new Set(customs))];
  });

  readonly eventosFiltrados = computed(() =>
    this.eventos().filter((e) => (e.unidade || '') === this.unidadeSel())
  );

  private rafId = 0;
  private particles: Particle[] = [];
  private resizeHandler = () => this.resizeCanvas();
  private running = false;

  ngOnInit(): void {
    forkJoin({
      eventos: this.api.listEventos(),
      empresas: this.api.listEmpresas(),
      layout: this.api.getLayout(),
    }).subscribe({
      next: ({ eventos, empresas, layout }) => {
        this.eventos.set(eventos);
        this.empresas.set(empresas);
        this.layout.set(layout || DEFAULT_LAYOUT);
        this.pickInitialUnidade(eventos, empresas);
        this.loading.set(false);
      },
      error: (err: HttpErrorResponse) => {
        this.alertas.erro(err.error?.mensagem || 'Erro ao carregar massagem.');
        this.loading.set(false);
      },
    });
  }

  ngAfterViewInit(): void {
    if (typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      return;
    }
    setTimeout(() => this.startParticles(), 0);
  }

  ngOnDestroy(): void {
    this.stopParticles();
  }

  selecionarUnidade(u: string): void {
    this.unidadeSel.set(u);
  }

  formatData = formatData;
  faixaHorario = faixaHorario;
  badgeClass = ocupacaoBadgeClass;

  corEmpresa(nome: string) {
    const emp = this.empresas().find((e) => e.nm === nome);
    return corEmpresaFromHex(emp?.cor);
  }

  ringOffset(pct: number): number {
    return RING_C - (Math.min(100, Math.max(0, pct)) / 100) * RING_C;
  }

  ringColor(pct: number): string {
    if (pct < 50) return '#0F6E56';
    if (pct < 80) return '#BA7517';
    return '#A32D2D';
  }

  private pickInitialUnidade(eventos: MassagemEvento[], empresas: MassagemEmpresa[]): void {
    const presets = empresas.map((e) => e.nm);
    const withEvents = presets.find((u) => eventos.some((e) => e.unidade === u));
    if (withEvents) {
      this.unidadeSel.set(withEvents);
      return;
    }
    const firstCustom = eventos.find((e) => e.unidade)?.unidade;
    this.unidadeSel.set(firstCustom || presets[0] || '');
  }

  private startParticles(): void {
    const canvas = this.particleCanvas?.nativeElement;
    if (!canvas) return;
    this.running = true;
    this.resizeCanvas();
    window.addEventListener('resize', this.resizeHandler);
    this.loop();
  }

  private stopParticles(): void {
    this.running = false;
    if (this.rafId) cancelAnimationFrame(this.rafId);
    this.rafId = 0;
    if (typeof window !== 'undefined') {
      window.removeEventListener('resize', this.resizeHandler);
    }
    this.particles = [];
  }

  private resizeCanvas(): void {
    const canvas = this.particleCanvas?.nativeElement;
    if (!canvas) return;
    const band = canvas.parentElement;
    canvas.width = band?.offsetWidth || window.innerWidth;
    canvas.height = band?.offsetHeight || 280;
    this.spawnAll();
  }

  private mkParticle(forceY?: number): Particle {
    const canvas = this.particleCanvas!.nativeElement;
    const W = canvas.width;
    const H = canvas.height;
    const size = Math.random() * 2.2 + 0.8;
    return {
      x: Math.random() * W,
      y: forceY !== undefined ? forceY : H + 10,
      size,
      speedX: (Math.random() - 0.5) * 0.35,
      speedY: -(Math.random() * 0.55 + 0.25),
      op: 0,
      maxOp: Math.random() * 0.55 + 0.2,
      fadeIn: Math.random() * 0.6 + 0.3,
      life: 0,
      maxLife: Math.random() * 220 + 120,
      type: PARTICLE_TYPES[Math.floor(Math.random() * PARTICLE_TYPES.length)],
      wobble: Math.random() * Math.PI * 2,
      wobbleSpd: (Math.random() - 0.5) * 0.04,
      wobbleAmp: Math.random() * 1.2 + 0.3,
    };
  }

  private spawnAll(): void {
    const canvas = this.particleCanvas?.nativeElement;
    if (!canvas) return;
    const count = Math.floor(canvas.width / 18);
    this.particles = Array.from({ length: count }, () => this.mkParticle(Math.random() * canvas.height));
  }

  private loop = (): void => {
    if (!this.running) return;
    const canvas = this.particleCanvas?.nativeElement;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const W = canvas.width;
    const H = canvas.height;
    ctx.clearRect(0, 0, W, H);

    if (this.particles.length < Math.floor(W / 14)) {
      this.particles.push(this.mkParticle());
    }

    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life++;
      p.wobble += p.wobbleSpd;
      p.x += p.speedX + Math.sin(p.wobble) * p.wobbleAmp * 0.12;
      p.y += p.speedY;
      const lr = p.life / p.maxLife;
      p.op =
        lr < p.fadeIn
          ? p.maxOp * (lr / p.fadeIn)
          : p.maxOp * (1 - (lr - p.fadeIn) / (1 - p.fadeIn));
      p.op = Math.max(0, p.op);

      const grd = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.size * 5);
      grd.addColorStop(0, `rgba(94,255,168,${p.op * 0.2})`);
      grd.addColorStop(1, 'rgba(94,255,168,0)');
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * 5, 0, Math.PI * 2);
      ctx.fillStyle = grd;
      ctx.fill();

      if (p.type === 'dot') this.drawDot(ctx, p.x, p.y, p.size, p.op);
      else if (p.type === 'sparkle') this.drawSparkle(ctx, p.x, p.y, p.size, p.op);
      else this.drawCross(ctx, p.x, p.y, p.size, p.op);

      if (p.life >= p.maxLife || p.y < -20 || p.x < -20 || p.x > W + 20) {
        this.particles.splice(i, 1);
      }
    }

    this.rafId = requestAnimationFrame(this.loop);
  };

  private drawDot(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, op: number): void {
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(94,255,168,${op})`;
    ctx.fill();
  }

  private drawSparkle(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    r: number,
    op: number
  ): void {
    ctx.save();
    ctx.translate(x, y);
    ctx.fillStyle = `rgba(200,255,220,${op})`;
    for (let i = 0; i < 4; i++) {
      ctx.rotate(Math.PI / 2);
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.quadraticCurveTo(r * 0.4, r * 0.4, 0, r * 2.2);
      ctx.quadraticCurveTo(-r * 0.4, r * 0.4, 0, 0);
      ctx.fill();
    }
    ctx.restore();
    ctx.beginPath();
    ctx.arc(x, y, r * 0.5, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(255,255,255,${op * 0.8})`;
    ctx.fill();
  }

  private drawCross(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, op: number): void {
    ctx.strokeStyle = `rgba(94,255,168,${op})`;
    ctx.lineWidth = r * 0.7;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(x - r * 1.4, y);
    ctx.lineTo(x + r * 1.4, y);
    ctx.moveTo(x, y - r * 1.4);
    ctx.lineTo(x, y + r * 1.4);
    ctx.stroke();
  }
}
