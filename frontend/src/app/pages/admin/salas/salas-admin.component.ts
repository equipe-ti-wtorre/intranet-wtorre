import { CommonModule } from '@angular/common';
import { Component, OnInit, effect, inject, signal } from '@angular/core';
import { FormBuilder, FormsModule, ReactiveFormsModule } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { forkJoin } from 'rxjs';
import { SalasConfigService } from '../../../services/salas-config.service';
import { AlertasService } from '../../../services/alertas.service';
import {
  BUILTIN_LOGO_OPTIONS,
  SalasAdminRoom,
  SalasAdminTab,
  SalasAdminUiConfig,
  SalasRegisteredLogo,
} from '../../../models/salas-config.model';
import { extractEmailDomain } from '../../salas/salas.utils';
import { isBuiltinLogoPreview, resolveTabLogoUrl } from './salas-logos.utils';

@Component({
  selector: 'app-salas-admin',
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule],
  templateUrl: './salas-admin.component.html',
  styleUrl: './salas-admin.component.scss',
})
export class SalasAdminComponent implements OnInit {
  private readonly api = inject(SalasConfigService);
  private readonly fb = inject(FormBuilder);
  private readonly alertas = inject(AlertasService);

  readonly carregando = signal(true);
  readonly salvandoConexao = signal(false);
  readonly salvandoUi = signal(false);
  readonly testando = signal(false);
  readonly mensagem = signal('');
  readonly erro = signal('');

  readonly config = signal<SalasAdminUiConfig | null>(null);
  readonly rooms = signal<SalasAdminRoom[]>([]);
  readonly domainInputs = signal<Record<string, string>>({});
  readonly logoUploadingTabId = signal('');
  readonly registeredLogos = signal<SalasRegisteredLogo[]>([]);

  readonly apiLocalidadeOptions = signal<string[]>(['Allianz', 'WTorre']);
  readonly builtinLogoOptions = BUILTIN_LOGO_OPTIONS;
  readonly abaAtiva = signal<'conexao' | 'dominios' | 'mapeamento' | 'salas' | 'ordem'>('conexao');

  readonly conexaoForm = this.fb.nonNullable.group({
    ativo: [false],
    api_base_url: [''],
    localidade_padrao: [''],
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
    this.api.getConfig().subscribe({
      next: (cfg) => {
        this.conexaoForm.patchValue({
          ativo: cfg.ativo,
          api_base_url: cfg.api_base_url,
          localidade_padrao: cfg.localidade_padrao,
        });
        if (cfg.ativo && cfg.api_base_url) {
          this.carregarPainel();
        } else {
          this.carregando.set(false);
        }
      },
      error: (err: HttpErrorResponse) => {
        this.erro.set(err.error?.mensagem || 'Erro ao carregar configuração.');
        this.carregando.set(false);
      },
    });
  }

  get painelPronto(): boolean {
    return !!this.config();
  }

  selecionarAba(aba: 'conexao' | 'dominios' | 'mapeamento' | 'salas' | 'ordem'): void {
    this.abaAtiva.set(aba);
  }

  salvarConexao(): void {
    this.salvandoConexao.set(true);
    this.erro.set('');
    this.mensagem.set('');
    const value = this.conexaoForm.getRawValue();
    this.api
      .saveConfig({
        ativo: value.ativo,
        api_base_url: value.api_base_url.trim(),
        localidade_padrao: value.localidade_padrao.trim(),
      })
      .subscribe({
        next: (cfg) => {
          this.mensagem.set('Conexão salva.');
          this.salvandoConexao.set(false);
          if (cfg.ativo && cfg.api_base_url) {
            this.carregarPainel();
          }
        },
        error: (err: HttpErrorResponse) => {
          this.erro.set(err.error?.mensagem || 'Erro ao salvar conexão.');
          this.salvandoConexao.set(false);
        },
      });
  }

  testarConexao(): void {
    this.testando.set(true);
    this.erro.set('');
    const value = this.conexaoForm.getRawValue();
    this.api
      .testarConexao({
        ativo: true,
        api_base_url: value.api_base_url.trim(),
        localidade_padrao: value.localidade_padrao.trim(),
      })
      .subscribe({
        next: (res) => {
          this.mensagem.set(res.mensagem || 'Conexão estabelecida.');
          this.testando.set(false);
        },
        error: (err: HttpErrorResponse) => {
          this.erro.set(err.error?.mensagem || 'Falha ao testar conexão.');
          this.testando.set(false);
        },
      });
  }

  salvarUiConfig(): void {
    const cfg = this.config();
    if (!cfg) return;
    this.salvandoUi.set(true);
    this.erro.set('');
    this.mensagem.set('');
    this.api.saveAdminUiConfig(cfg).subscribe({
      next: (res) => {
        this.config.set(this.normalizeConfig(res.config));
        this.mensagem.set('Configuração salva com sucesso.');
        this.salvandoUi.set(false);
        this.carregarPainel();
      },
      error: (err: HttpErrorResponse) => {
        this.erro.set(err.error?.mensagem || 'Falha ao salvar configuração.');
        this.salvandoUi.set(false);
      },
    });
  }

  private carregarPainel(): void {
    this.carregando.set(true);
    forkJoin({
      ui: this.api.getAdminUiConfig(),
      rooms: this.api.getAdminRooms(),
      logos: this.api.getAdminLogos(),
    }).subscribe({
      next: ({ ui, rooms, logos }) => {
        this.config.set(this.normalizeConfig(ui.config));
        this.rooms.set(rooms.rooms);
        this.registeredLogos.set(
          (logos.files || []).map((file) => ({
            name: file.name,
            url: this.api.logoUrl(file.name),
          }))
        );
        this.syncDomainInputs(ui.config.tabs);
        this.syncApiLocalidadeOptions(ui.config);
        const tabs = ui.config.tabs || [];
        if (tabs.length && !this.conexaoForm.controls.localidade_padrao.value) {
          this.conexaoForm.controls.localidade_padrao.setValue(tabs[0].id);
        }
        this.carregando.set(false);
      },
      error: (err: HttpErrorResponse) => {
        this.erro.set(err.error?.mensagem || 'Erro ao carregar painel de salas.');
        this.carregando.set(false);
      },
    });
  }

  private normalizeConfig(config: SalasAdminUiConfig): SalasAdminUiConfig {
    return {
      ...config,
      roomOrderByTab: config.roomOrderByTab ?? {},
      roomDisplayNames: config.roomDisplayNames ?? {},
      tabs: (config.tabs || []).map((tab) => ({
        ...tab,
        logoFile: tab.logoFile ?? null,
      })),
    };
  }

  private syncDomainInputs(tabs: SalasAdminTab[]): void {
    const inputs: Record<string, string> = {};
    for (const tab of tabs) inputs[tab.id] = '';
    this.domainInputs.set(inputs);
  }

  private syncApiLocalidadeOptions(config: SalasAdminUiConfig): void {
    const values = Array.from(new Set(Object.values(config.domainToApiLocalidade || {})));
    if (values.length) this.apiLocalidadeOptions.set(values.sort());
  }

  getDomainMappings(): { domain: string; apiLocalidade: string }[] {
    const cfg = this.config();
    if (!cfg) return [];
    return Object.entries(cfg.domainToApiLocalidade)
      .map(([domain, apiLocalidade]) => ({ domain, apiLocalidade }))
      .sort((a, b) => a.domain.localeCompare(b.domain));
  }

  getTabLogoUrl(tab: SalasAdminTab): string | null {
    return resolveTabLogoUrl(tab, (file) => this.api.logoUrl(file));
  }

  isBuiltinLogo(tab: SalasAdminTab): boolean {
    return isBuiltinLogoPreview(this.getTabLogoUrl(tab));
  }

  assignRegisteredLogo(tab: SalasAdminTab, fileName: string): void {
    tab.logoFile = fileName.trim() || null;
  }

  private refreshRegisteredLogos(): void {
    this.api.getAdminLogos().subscribe({
      next: (res) => {
        this.registeredLogos.set(
          (res.files || []).map((file) => ({
            name: file.name,
            url: this.api.logoUrl(file.name),
          }))
        );
      },
    });
  }

  addDomain(tab: SalasAdminTab): void {
    const cfg = this.config();
    if (!cfg) return;
    const inputs = { ...this.domainInputs() };
    const domain = (inputs[tab.id] ?? '').trim().toLowerCase();
    if (!domain || domain.includes(' ')) return;
    if (!tab.domains.includes(domain)) {
      tab.domains = [...tab.domains, domain];
      if (!cfg.domainToApiLocalidade[domain]) {
        cfg.domainToApiLocalidade[domain] = this.apiLocalidadeOptions()[0] || 'Allianz';
      }
    }
    inputs[tab.id] = '';
    this.domainInputs.set(inputs);
  }

  removeDomain(tab: SalasAdminTab, domain: string): void {
    tab.domains = tab.domains.filter((entry) => entry !== domain);
  }

  onLogoSelected(tab: SalasAdminTab, event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    this.logoUploadingTabId.set(tab.id);
    this.api.uploadTabLogo(tab.id, file).subscribe({
      next: (res) => {
        this.config.set(this.normalizeConfig(res.config));
        this.mensagem.set(`Logo da aba "${tab.label}" atualizado.`);
        this.logoUploadingTabId.set('');
        this.refreshRegisteredLogos();
      },
      error: (err: HttpErrorResponse) => {
        this.erro.set(err.error?.mensagem || 'Falha ao enviar logo.');
        this.logoUploadingTabId.set('');
      },
    });
  }

  removeCustomLogo(tab: SalasAdminTab): void {
    if (!tab.logoFile) return;
    this.logoUploadingTabId.set(tab.id);
    this.api.deleteTabLogo(tab.id).subscribe({
      next: (res) => {
        this.config.set(this.normalizeConfig(res.config));
        this.mensagem.set(`Logo customizado da aba "${tab.label}" removido.`);
        this.logoUploadingTabId.set('');
        this.refreshRegisteredLogos();
      },
      error: (err: HttpErrorResponse) => {
        this.erro.set(err.error?.mensagem || 'Falha ao remover logo.');
        this.logoUploadingTabId.set('');
      },
    });
  }

  setRoomTab(email: string, tabId: string): void {
    const cfg = this.config();
    if (!cfg) return;
    const normalized = email.trim().toLowerCase();
    if (!tabId) delete cfg.roomTabOverrides[normalized];
    else cfg.roomTabOverrides[normalized] = tabId;
    this.refreshRoomAssignments();
    this.syncRoomOrders();
  }

  clearRoomOverride(email: string): void {
    const cfg = this.config();
    if (!cfg) return;
    delete cfg.roomTabOverrides[email.trim().toLowerCase()];
    this.refreshRoomAssignments();
    this.syncRoomOrders();
  }

  private refreshRoomAssignments(): void {
    const cfg = this.config();
    if (!cfg) return;
    this.rooms.set(
      this.rooms().map((room) => {
        const override = cfg.roomTabOverrides[room.email];
        if (override) {
          return { ...room, tabId: override, tabSource: 'override' as const };
        }
        const domain = extractEmailDomain(room.email);
        const tab = domain ? cfg.tabs.find((entry) => entry.domains.includes(domain)) : undefined;
        return {
          ...room,
          tabId: tab?.id ?? null,
          tabSource: tab ? ('domain' as const) : ('unassigned' as const),
        };
      })
    );
  }

  getOrderedRoomsForTab(tabId: string): SalasAdminRoom[] {
    const cfg = this.config();
    if (!cfg) return [];
    const order = cfg.roomOrderByTab[tabId] ?? [];
    const tabRooms = this.rooms().filter((room) => room.tabId === tabId);
    const byEmail = new Map(tabRooms.map((room) => [room.email, room]));
    const ordered: SalasAdminRoom[] = [];
    for (const email of order) {
      const room = byEmail.get(email);
      if (room) {
        ordered.push(room);
        byEmail.delete(email);
      }
    }
    for (const room of byEmail.values()) ordered.push(room);
    return ordered;
  }

  moveRoom(tabId: string, email: string, direction: -1 | 1): void {
    const cfg = this.config();
    if (!cfg) return;
    const order = [
      ...(cfg.roomOrderByTab[tabId] ?? this.getOrderedRoomsForTab(tabId).map((r) => r.email)),
    ];
    const index = order.indexOf(email);
    if (index < 0) return;
    const target = index + direction;
    if (target < 0 || target >= order.length) return;
    [order[index], order[target]] = [order[target], order[index]];
    cfg.roomOrderByTab[tabId] = order;
  }

  private syncRoomOrders(): void {
    const cfg = this.config();
    if (!cfg) return;
    const next: Record<string, string[]> = { ...cfg.roomOrderByTab };
    for (const tab of cfg.tabs) {
      const tabRooms = this.rooms().filter((room) => room.tabId === tab.id);
      const tabEmails = new Set(tabRooms.map((room) => room.email));
      const existing = (next[tab.id] ?? []).filter((email) => tabEmails.has(email));
      for (const room of tabRooms) {
        if (!existing.includes(room.email)) existing.push(room.email);
      }
      next[tab.id] = existing;
    }
    cfg.roomOrderByTab = next;
  }

  tabLabel(tabId: string | null): string {
    if (!tabId) return '—';
    return this.config()?.tabs.find((t) => t.id === tabId)?.label || tabId;
  }

  getRoomDisplayName(email: string): string {
    const cfg = this.config();
    const normalized = email.trim().toLowerCase();
    const override = cfg?.roomDisplayNames?.[normalized];
    if (override) return override;
    return this.rooms().find((room) => room.email.toLowerCase() === normalized)?.name ?? '';
  }

  setRoomDisplayName(email: string, name: string): void {
    const cfg = this.config();
    if (!cfg) return;
    const normalized = email.trim().toLowerCase();
    const trimmed = name.trim();
    const original =
      this.rooms().find((room) => room.email.toLowerCase() === normalized)?.name?.trim() ?? '';
    if (!cfg.roomDisplayNames) cfg.roomDisplayNames = {};
    if (!trimmed || trimmed === original) {
      delete cfg.roomDisplayNames[normalized];
    } else {
      cfg.roomDisplayNames[normalized] = trimmed.slice(0, 120);
    }
  }

  hasRoomDisplayNameOverride(email: string): boolean {
    const cfg = this.config();
    return !!cfg?.roomDisplayNames?.[email.trim().toLowerCase()];
  }

  getRoomApiName(email: string): string {
    return this.rooms().find((room) => room.email.toLowerCase() === email.toLowerCase())?.name ?? email;
  }

  updateDomainInput(tabId: string, value: string): void {
    this.domainInputs.set({ ...this.domainInputs(), [tabId]: value });
  }
}
