import {
  AfterViewInit,
  Component,
  ElementRef,
  OnDestroy,
  effect,
  input,
  output,
  viewChild,
} from '@angular/core';
import tinymce, { Editor } from 'tinymce';

let editorSeq = 0;

@Component({
  selector: 'app-tinymce-editor',
  standalone: true,
  template: `<textarea #host class="tinymce-host" [attr.id]="editorId"></textarea>`,
  styles: [
    `
      :host {
        display: block;
        width: 100%;
        min-height: 480px;
      }
      .tinymce-host {
        visibility: hidden;
        width: 100%;
        min-height: 480px;
      }
    `,
  ],
})
export class TinymceEditorComponent implements AfterViewInit, OnDestroy {
  readonly value = input<string>('');
  readonly disabled = input(false);
  readonly valueChange = output<string>();
  readonly ready = output<void>();

  private readonly host = viewChild<ElementRef<HTMLTextAreaElement>>('host');
  readonly editorId = `massagem-tinymce-${++editorSeq}`;
  private editor: Editor | null = null;
  private skipEmit = false;
  private pendingValue = '';
  private headInner = '';
  private isFullDocument = false;
  private destroyed = false;

  constructor() {
    effect(() => {
      const next = this.value() ?? '';
      this.pendingValue = next;
      if (this.editor) {
        this.applyValue(next);
      }
    });
    effect(() => {
      const dis = this.disabled();
      if (this.editor) {
        this.editor.mode.set(dis ? 'readonly' : 'design');
      }
    });
  }

  ngAfterViewInit(): void {
    const el = this.host()?.nativeElement;
    if (!el) return;

    void tinymce
      .init({
        target: el,
        base_url: '/tinymce',
        suffix: '.min',
        license_key: 'gpl',
        height: 560,
        menubar: true,
        branding: false,
        promotion: false,
        plugins: 'code link lists table image',
        toolbar:
          'undo redo | styles | bold italic underline strikethrough | forecolor backcolor | alignleft aligncenter alignright alignjustify | bullist numlist | outdent indent | link image table | code',
        content_style:
          'body{font-family:Arial,Helvetica,sans-serif;font-size:14px;margin:16px}',
        valid_elements: '*[*]',
        extended_valid_elements: '*[*]',
        verify_html: false,
        convert_urls: false,
        relative_urls: false,
        setup: (editor) => {
          editor.on('init', () => {
            if (this.destroyed) {
              editor.destroy();
              return;
            }
            this.editor = editor;
            this.applyValue(this.pendingValue || this.value() || '');
            if (this.disabled()) editor.mode.set('readonly');
            this.ready.emit();
          });
          editor.on('change keyup setcontent Undo Redo', () => {
            if (this.skipEmit || !this.editor) return;
            this.valueChange.emit(this.composeHtml());
          });
        },
      })
      .catch((err) => console.error('[tinymce]', err));
  }

  ngOnDestroy(): void {
    this.destroyed = true;
    if (this.editor) {
      this.editor.destroy();
      this.editor = null;
    } else {
      tinymce.remove(`#${this.editorId}`);
    }
  }

  insertText(text: string): void {
    if (!this.editor || this.disabled()) return;
    this.editor.focus();
    this.editor.insertContent(text);
    this.valueChange.emit(this.composeHtml());
  }

  focus(): void {
    this.editor?.focus();
  }

  private applyValue(html: string): void {
    if (!this.editor) return;
    const parsed = this.splitHtml(html);
    this.isFullDocument = parsed.isFull;
    this.headInner = parsed.head;
    const current = this.editor.getContent({ format: 'html' });
    if (current === parsed.body) {
      this.injectHeadStyles();
      return;
    }
    this.skipEmit = true;
    this.editor.setContent(parsed.body || '');
    this.skipEmit = false;
    this.injectHeadStyles();
  }

  private injectHeadStyles(): void {
    if (!this.editor || !this.headInner) return;
    const doc = this.editor.getDoc();
    if (!doc) return;
    doc.querySelectorAll('style[data-massagem-tpl]').forEach((n) => n.remove());
    const re = /<style[^>]*>([\s\S]*?)<\/style>/gi;
    let m: RegExpExecArray | null;
    while ((m = re.exec(this.headInner))) {
      const style = doc.createElement('style');
      style.setAttribute('data-massagem-tpl', '1');
      style.textContent = m[1];
      doc.head.appendChild(style);
    }
  }

  private composeHtml(): string {
    const body = this.editor?.getContent({ format: 'html' }) || '';
    if (!this.isFullDocument) return body;
    return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0">
${this.headInner}
</head>
<body>
${body}
</body>
</html>`;
  }

  private splitHtml(html: string): { head: string; body: string; isFull: boolean } {
    const raw = html || '';
    const bodyMatch = raw.match(/<body[^>]*>([\s\S]*)<\/body>/i);
    if (!bodyMatch) {
      return { head: '', body: raw, isFull: false };
    }
    const headMatch = raw.match(/<head[^>]*>([\s\S]*)<\/head>/i);
    return {
      head: headMatch?.[1]?.trim() || '',
      body: bodyMatch[1] || '',
      isFull: true,
    };
  }
}
