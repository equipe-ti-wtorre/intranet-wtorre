/** Máscara DD/MM ou DD/MM/AAAA — apenas dígitos, barras automáticas. */
export function maskAniversarioInput(value: string): string {
  const digits = value.replace(/\D/g, '').slice(0, 8);
  if (!digits.length) return '';
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
}

export function applyAniversarioMaskToInput(input: HTMLInputElement): void {
  const cursor = input.selectionStart ?? input.value.length;
  const digitsBeforeCursor = input.value.slice(0, cursor).replace(/\D/g, '').length;
  const masked = maskAniversarioInput(input.value);

  if (input.value === masked) return;

  input.value = masked;

  let pos = 0;
  let count = 0;
  while (pos < masked.length && count < digitsBeforeCursor) {
    if (/\d/.test(masked[pos])) count++;
    pos++;
  }
  input.setSelectionRange(pos, pos);
}
