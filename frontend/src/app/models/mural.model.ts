export interface MuralNoticiaItem {
  trackId: string;
  origem: 'comunicado' | 'aniversariante';
  titulo: string;
  categoriaLabel: string;
  catClasse: string;
  categoriaCor: string;
  dia: string;
  mes: string;
  link?: string;
}
