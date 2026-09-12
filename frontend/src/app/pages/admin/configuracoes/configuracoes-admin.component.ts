import { Component, OnInit, effect, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { forkJoin } from 'rxjs';
import { ConfiguracoesService } from '../../../services/configuracoes.service';
import { AlertasService } from '../../../services/alertas.service';
import { AuthService } from '../../../services/auth.service';
import { EmailProvider } from '../../../models/configuracoes.model';

@Component({
  selector: 'app-configuracoes-admin',
  standalone: true,
  imports: [ReactiveFormsModule],
  templateUrl: './configuracoes-admin.component.html',
  styleUrl: './configuracoes-admin.component.scss',
})
export class ConfiguracoesAdminComponent implements OnInit {
  private readonly api = inject(ConfiguracoesService);
  private readonly auth = inject(AuthService);
  private readonly fb = inject(FormBuilder);
  private readonly alertas = inject(AlertasService);

  readonly mensagem = signal('');
  readonly erro = signal('');
  readonly salvandoEmail = signal(false);
  readonly verificandoEmail = signal(false);
  readonly enviandoTesteEmail = signal(false);
  readonly salvandoBid = signal(false);
  readonly testandoBid = signal(false);
  readonly sincronizandoBid = signal(false);
  readonly bidSyncStatus = signal<string | null>(null);
  readonly carregando = signal(true);
  readonly smtpHasPassword = signal(false);
  readonly acsHasConnectionString = signal(false);
  readonly bidHasApiKey = signal(false);
  readonly mostrarSenhaSmtp = signal(false);
  readonly mostrarAcsConnection = signal(false);
  readonly mostrarBidApiKey = signal(false);
  readonly providerSelecionado = signal<EmailProvider>('smtp');

  readonly emailForm = this.fb.nonNullable.group({
    provider: ['smtp' as EmailProvider],
    host: [''],
    port: [587, [Validators.required, Validators.min(1), Validators.max(65535)]],
    secure: [false],
    user: [''],
    password: [''],
    from_email: [''],
    from_name: [''],
    acs_connection_string: [''],
    acs_sender: [''],
    ocultar_para: [false],
    ativo: [false],
    destinatario_teste: [''],
  });

  readonly bidForm = this.fb.nonNullable.group({
    ativo: [false],
    api_base_url: [''],
    api_key: [''],
    app_url: ['https://bid.nubankparque.com'],
    cache_ttl_min: [15, [Validators.required, Validators.min(1), Validators.max(15)]],
    sync_automatica: [true],
    sync_intervalo_min: [15, [Validators.required, Validators.min(5), Validators.max(60)]],
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
    forkJoin({
      email: this.api.getEmail(),
      bid: this.api.getBidIntegracao(),
    }).subscribe({
      next: ({ email, bid }) => {
        this.smtpHasPassword.set(email.has_password);
        this.acsHasConnectionString.set(email.has_acs_connection_string);
        this.providerSelecionado.set(email.provider);
        this.emailForm.patchValue({
          provider: email.provider,
          host: email.host,
          port: email.port,
          secure: email.secure,
          user: email.user,
          password: '',
          from_email: email.from_email,
          from_name: email.from_name,
          acs_connection_string: '',
          acs_sender: email.acs_sender,
          ocultar_para: email.ocultar_para,
          ativo: email.ativo,
          destinatario_teste: this.auth.usuario()?.email || '',
        });

        this.bidHasApiKey.set(bid.has_api_key);
        this.bidForm.patchValue({
          ativo: bid.ativo,
          api_base_url: bid.api_base_url,
          api_key: '',
          app_url: bid.app_url || 'https://bid.nubankparque.com',
          cache_ttl_min: bid.cache_ttl_min ?? 15,
          sync_automatica: bid.sync_automatica ?? true,
          sync_intervalo_min: bid.sync_intervalo_min ?? 15,
        });
        this.bidSyncStatus.set(this.formatarBidSyncStatus(bid));

        this.carregando.set(false);
      },
      error: (err: HttpErrorResponse) => {
        this.erro.set(err.error?.mensagem || 'Erro ao carregar configurações.');
        this.carregando.set(false);
      },
    });
  }

  setProvider(provider: EmailProvider): void {
    this.providerSelecionado.set(provider);
    this.emailForm.controls.provider.setValue(provider);
  }

  salvarEmail(): void {
    if (this.emailForm.invalid) return;

    const raw = this.emailForm.getRawValue();
    this.salvandoEmail.set(true);
    this.erro.set('');

    this.api
      .salvarEmail({
        provider: raw.provider,
        host: raw.host.trim(),
        port: Number(raw.port),
        secure: raw.secure,
        user: raw.user.trim(),
        password: raw.password.trim() || undefined,
        from_email: raw.from_email.trim(),
        from_name: raw.from_name.trim(),
        acs_connection_string: raw.acs_connection_string.trim() || undefined,
        acs_sender: raw.acs_sender.trim(),
        ocultar_para: raw.ocultar_para,
        ativo: raw.ativo,
      })
      .subscribe({
        next: (email) => {
          this.smtpHasPassword.set(email.has_password);
          this.acsHasConnectionString.set(email.has_acs_connection_string);
          this.providerSelecionado.set(email.provider);
          this.emailForm.patchValue({ password: '', acs_connection_string: '', provider: email.provider });
          this.mostrarSenhaSmtp.set(false);
          this.mostrarAcsConnection.set(false);
          this.mensagem.set('Configurações de e-mail salvas.');
          this.salvandoEmail.set(false);
        },
        error: (err: HttpErrorResponse) => {
          this.erro.set(err.error?.mensagem || 'Erro ao salvar configurações de e-mail.');
          this.salvandoEmail.set(false);
        },
      });
  }

  verificarEmail(): void {
    this.verificandoEmail.set(true);
    this.erro.set('');

    this.api.verificarEmail().subscribe({
      next: (res) => {
        this.mensagem.set(res.mensagem || 'Conexão SMTP verificada com sucesso.');
        this.verificandoEmail.set(false);
      },
      error: (err: HttpErrorResponse) => {
        this.erro.set(err.error?.mensagem || 'Falha ao verificar conexão SMTP.');
        this.verificandoEmail.set(false);
      },
    });
  }

  enviarTesteEmail(): void {
    const destinatario = this.emailForm.controls.destinatario_teste.value.trim();
    this.enviandoTesteEmail.set(true);
    this.erro.set('');

    this.api.enviarTesteEmail(destinatario || undefined).subscribe({
      next: (res) => {
        this.mensagem.set(res.mensagem || 'E-mail de teste enviado.');
        this.enviandoTesteEmail.set(false);
      },
      error: (err: HttpErrorResponse) => {
        this.erro.set(err.error?.mensagem || 'Falha ao enviar e-mail de teste.');
        this.enviandoTesteEmail.set(false);
      },
    });
  }

  toggleSenhaSmtp(): void {
    this.mostrarSenhaSmtp.update((v) => !v);
  }

  toggleAcsConnection(): void {
    this.mostrarAcsConnection.update((v) => !v);
  }

  salvarBid(): void {
    if (this.bidForm.invalid) return;

    const raw = this.bidForm.getRawValue();
    this.salvandoBid.set(true);
    this.erro.set('');

    this.api
      .salvarBidIntegracao({
        ativo: raw.ativo,
        api_base_url: raw.api_base_url.trim(),
        api_key: raw.api_key.trim() || undefined,
        app_url: raw.app_url.trim(),
        cache_ttl_min: Number(raw.cache_ttl_min),
        sync_automatica: raw.sync_automatica,
        sync_intervalo_min: Number(raw.sync_intervalo_min),
      })
      .subscribe({
        next: (bid) => {
          this.bidHasApiKey.set(bid.has_api_key);
          this.bidForm.patchValue({ api_key: '' });
          this.mostrarBidApiKey.set(false);
          this.bidSyncStatus.set(this.formatarBidSyncStatus(bid));
          this.mensagem.set('Configurações de integração BID salvas.');
          this.salvandoBid.set(false);
        },
        error: (err: HttpErrorResponse) => {
          this.erro.set(err.error?.mensagem || 'Erro ao salvar integração BID.');
          this.salvandoBid.set(false);
        },
      });
  }

  testarBid(): void {
    this.testandoBid.set(true);
    this.erro.set('');

    this.api.testarBidIntegracao().subscribe({
      next: (res) => {
        this.mensagem.set(res.mensagem || 'Conexão com API BID verificada.');
        this.testandoBid.set(false);
      },
      error: (err: HttpErrorResponse) => {
        this.erro.set(err.error?.mensagem || 'Falha ao testar integração BID.');
        this.testandoBid.set(false);
      },
    });
  }


  formatarBidSyncStatus(bid: {
    ultima_sync?: string | null;
    ultima_sync_erro?: string | null;
    snapshot_status?: string | null;
  }): string | null {
    if (bid.ultima_sync_erro) {
      return `Última sync com erro: ${bid.ultima_sync_erro}`;
    }
    if (bid.ultima_sync) {
      const quando = new Date(bid.ultima_sync).toLocaleString('pt-BR');
      const status = bid.snapshot_status === 'ok' ? 'OK' : bid.snapshot_status || '—';
      return `Última sync: ${quando} (${status})`;
    }
    return 'Nenhuma sincronização realizada ainda.';
  }

  sincronizarBid(): void {
    this.sincronizandoBid.set(true);
    this.erro.set('');

    this.api.sincronizarBidIntegracao().subscribe({
      next: (res) => {
        this.mensagem.set(res.mensagem || 'Sincronização BID concluída.');
        this.api.getBidIntegracao().subscribe({
          next: (bid) => this.bidSyncStatus.set(this.formatarBidSyncStatus(bid)),
        });
        this.sincronizandoBid.set(false);
      },
      error: (err: HttpErrorResponse) => {
        this.erro.set(err.error?.mensagem || 'Falha ao sincronizar dados BID.');
        this.sincronizandoBid.set(false);
      },
    });
  }

  toggleBidApiKey(): void {
    this.mostrarBidApiKey.update((v) => !v);
  }
}
