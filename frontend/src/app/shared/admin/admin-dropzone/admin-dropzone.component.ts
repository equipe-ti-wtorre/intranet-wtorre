import { Component, ElementRef, input, output, viewChild } from '@angular/core';

@Component({
  selector: 'app-admin-dropzone',
  standalone: true,
  templateUrl: './admin-dropzone.component.html',
  styleUrl: './admin-dropzone.component.scss',
})
export class AdminDropzoneComponent {
  readonly disabled = input(false);
  readonly compact = input(false);
  readonly multiple = input(false);
  readonly accept = input('image/jpeg,image/png,image/webp,image/gif');
  readonly hint = input('Arraste arquivos aqui ou');
  readonly hintLink = input('clique para selecionar');
  readonly subhint = input('');

  readonly fileSelected = output<File>();
  readonly filesSelected = output<File[]>();

  readonly dragOver = output<boolean>();

  private readonly fileInput = viewChild<ElementRef<HTMLInputElement>>('fileInput');

  isDragover = false;

  private resetInput(): void {
    const input = this.fileInput()?.nativeElement;
    if (input) input.value = '';
  }

  private emitFiles(files: FileList | File[] | null | undefined): void {
    const list = files ? Array.from(files) : [];
    if (!list.length) return;

    if (this.multiple()) {
      this.filesSelected.emit(list);
    } else {
      this.fileSelected.emit(list[0]);
    }
    this.resetInput();
  }

  onDragOver(event: DragEvent): void {
    event.preventDefault();
    if (this.disabled()) return;
    this.isDragover = true;
    this.dragOver.emit(true);
  }

  onDragLeave(): void {
    this.isDragover = false;
    this.dragOver.emit(false);
  }

  onDrop(event: DragEvent): void {
    event.preventDefault();
    this.isDragover = false;
    this.dragOver.emit(false);
    if (this.disabled()) return;
    this.emitFiles(event.dataTransfer?.files);
  }

  openFilePicker(): void {
    this.onClick();
  }

  onClick(): void {
    if (this.disabled()) return;
    this.fileInput()?.nativeElement.click();
  }

  onInputChange(event: Event): void {
    this.emitFiles((event.target as HTMLInputElement).files);
  }
}
