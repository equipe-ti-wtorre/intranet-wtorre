export function iniciaisDeNome(nome: string): string {
  return nome
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase();
}

const PALETTE = [
  '#1d54e6',
  '#8a05be',
  '#0e8da0',
  '#e07a1f',
  '#1c9e62',
  '#d8453d',
  '#7a52c7',
  '#0f766e',
];

export function corAvatarDeNome(nome: string): string {
  return PALETTE[nome.length % PALETTE.length];
}
