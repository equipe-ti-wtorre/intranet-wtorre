import { AfterViewInit, Component, ElementRef, forwardRef, viewChild } from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';

@Component({
  selector: 'app-texto-rico-editor',
  standalone: true,
  templateUrl: './texto-rico-editor.component.html',
  styleUrl: './texto-rico-editor.component.scss',
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => TextoRicoEditorComponent),
      multi: true,
    },
  ],
})
export class TextoRicoEditorComponent implements ControlValueAccessor, AfterViewInit {
  private readonly editorRef = viewChild<ElementRef<HTMLDivElement>>('editor');

  disabled = false;
  private pendingValue = '';
  private onChange: (v: string) => void = () => {};
  private onTouched: () => void = () => {};

  ngAfterViewInit(): void {
    const el = this.editorRef()?.nativeElement;
    if (el) el.innerHTML = this.pendingValue;
  }

  writeValue(value: string | null): void {
    this.pendingValue = value || '';
    const el = this.editorRef()?.nativeElement;
    if (el) el.innerHTML = this.pendingValue;
  }

  registerOnChange(fn: (v: string) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  setDisabledState(isDisabled: boolean): void {
    this.disabled = isDisabled;
  }

  emitChange(): void {
    const html = this.editorRef()?.nativeElement?.innerHTML || '';
    this.onChange(html);
    this.onTouched();
  }

  exec(cmd: string, value?: string): void {
    if (this.disabled) return;
    document.execCommand(cmd, false, value);
    this.emitChange();
    this.editorRef()?.nativeElement?.focus();
  }

  inserirLink(): void {
    if (this.disabled) return;
    const url = window.prompt('URL do link (http(s):// ou /caminho):');
    if (!url?.trim()) return;
    this.exec('createLink', url.trim());
  }
}
