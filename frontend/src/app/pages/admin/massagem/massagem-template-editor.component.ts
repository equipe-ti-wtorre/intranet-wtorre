import { Component, OnInit, computed, inject, signal, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { MassagemService } from '../../../services/massagem.service';
import { AlertasService } from '../../../services/alertas.service';
import { MassagemEmailTemplateMetaItem } from '../../../models/massagem.model';
import { TinymceEditorComponent } from './tinymce-editor.component';

@Component({
  selector: 'app-massagem-template-editor',
  standalone: true,
  imports: [FormsModule, RouterLink, TinymceEditorComponent],
  templateUrl: './massagem-template-editor.component.html',
  styleUrl: './massagem-template-editor.component.scss',
})
export class MassagemTemplateEditorComponent implements OnInit {
  private readonly api = inject(MassagemService);
  private readonly alertas = inject(AlertasService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly sanitizer = inject(DomSanitizer);
  private readonly editor = viewChild(TinymceEditorComponent);

  readonly loading = signal(true);
  readonly saving = signal(false);
  readonly editId = signal<string | null>(null);
  readonly templateMeta = signal<MassagemEmailTemplateMetaItem[]>([]);
  readonly previewAberto = signal(false);
  readonly previewHtml = signal<SafeHtml | ''>('');
  readonly previewAssunto = signal('');
  readonly focusAlvo = signal<'assunto' | 'html'>('html');

  form = {
    codigo: '' as string,
    nome: '',
    assunto: '',
    html: '',
    texto: '',
    ativo: true,
  };

  readonly isNovo = computed(() => !this.editId());
  readonly pageTitle = computed(() =>
    this.isNovo() ? 'Novo template' : 'Editar template'
  );
  readonly placeholders = computed(() => {
    const codigo = this.form.codigo;
    return this.templateMeta().find((m) => m.codigo === codigo)?.placeholders || [];
  });
  readonly codigosDisponiveis = computed(() => this.templateMeta());

  ngOnInit(): void {
    const id = this.route.snapshot.paramMap.get('id');
    this.api.getEmailTemplateMeta().subscribe({
      next: (meta) => {
        this.templateMeta.set(meta.codigos || []);
        this.api.listEmailTemplates().subscribe({
          next: (list) => {
            if (id && id !== 'novo') {
              this.editId.set(id);
              const found = list.find((t) => t.id === id);
              if (!found) {
                this.alertas.erro('Template não encontrado.');
                void this.router.navigate(['/admin/massagem'], {
                  queryParams: { aba: 'email', sub: 'templates' },
                });
                return;
              }
              this.form = {
                codigo: found.codigo,
                nome: found.nome,
                assunto: found.assunto,
                html: found.html,
                texto: found.texto || '',
                ativo: !!found.ativo,
              };
            } else {
              this.form = {
                codigo: '',
                nome: '',
                assunto: '',
                html: '',
                texto: '',
                ativo: true,
              };
            }
            this.loading.set(false);
          },
          error: (err: HttpErrorResponse) => {
            this.alertas.erro(err.error?.mensagem || 'Erro ao carregar templates.');
            this.loading.set(false);
          },
        });
      },
      error: () => {
        this.templateMeta.set([]);
        this.loading.set(false);
      },
    });
  }

  onCodigoChange(codigo: string): void {
    this.form.codigo = codigo;
  }

  onHtmlChange(html: string): void {
    this.form.html = html;
  }

  inserirChave(chave: string): void {
    const token = `{{${chave}}}`;
    if (this.focusAlvo() === 'assunto') {
      this.form.assunto = `${this.form.assunto || ''}${token}`;
      return;
    }
    this.editor()?.insertText(token);
  }

  podeSalvar(): boolean {
    return !!(
      this.form.codigo &&
      this.form.nome.trim() &&
      this.form.assunto.trim() &&
      this.form.html.trim()
    );
  }

  salvar(): void {
    if (!this.podeSalvar()) {
      this.alertas.erro('Preencha nome, tipo, assunto e corpo do e-mail.');
      return;
    }
    const body = {
      codigo: this.form.codigo,
      nome: this.form.nome.trim(),
      assunto: this.form.assunto.trim(),
      html: this.form.html.trim(),
      texto: this.form.texto.trim(),
      ativo: this.form.ativo,
    };
    const id = this.editId();
    this.saving.set(true);
    const req = id
      ? this.api.updateEmailTemplate(id, body)
      : this.api.createEmailTemplate(body);
    req.subscribe({
      next: () => {
        this.saving.set(false);
        this.alertas.sucesso(id ? 'Template atualizado.' : 'Template criado.');
        void this.router.navigate(['/admin/massagem'], {
          queryParams: { aba: 'email', sub: 'templates' },
        });
      },
      error: (err: HttpErrorResponse) => {
        this.saving.set(false);
        this.alertas.erro(err.error?.mensagem || 'Erro ao salvar template.');
      },
    });
  }

  visualizar(): void {
    if (!this.form.codigo || !this.form.assunto.trim() || !this.form.html.trim()) {
      this.alertas.erro('Preencha tipo, assunto e HTML para visualizar.');
      return;
    }
    this.api
      .previewEmailTemplate({
        id: this.editId() || undefined,
        codigo: this.form.codigo,
        assunto: this.form.assunto,
        html: this.form.html,
        texto: this.form.texto,
      })
      .subscribe({
        next: (res) => {
          this.previewAssunto.set(res.assunto || '');
          this.previewHtml.set(this.sanitizer.bypassSecurityTrustHtml(res.html || ''));
          this.previewAberto.set(true);
        },
        error: (err: HttpErrorResponse) => {
          this.alertas.erro(err.error?.mensagem || 'Erro ao gerar preview.');
        },
      });
  }

  fecharPreview(): void {
    this.previewAberto.set(false);
    this.previewHtml.set('');
    this.previewAssunto.set('');
  }

  cancelar(): void {
    void this.router.navigate(['/admin/massagem'], {
      queryParams: { aba: 'email', sub: 'templates' },
    });
  }
}
