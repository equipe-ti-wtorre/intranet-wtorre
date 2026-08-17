import { Aniversariante } from '../models/colaborador.model';
import { Comunicado } from '../models/comunicado.model';
import { MuralNoticiaItem } from '../models/mural.model';
import { mesAbbr } from '../pages/aniversariantes/aniversariantes.util';

const ANIVERSARIO_COR = '#e0a52e';
const ANIVERSARIOS_LINK = '/aniversariantes';

export interface DataReferencia {
  mes: number;
  dia: number;
}

export function aniversariantesDoDia(
  lista: Aniversariante[],
  hoje: DataReferencia
): Aniversariante[] {
  return lista.filter((p) => p.nasc_mes === hoje.mes && p.nasc_dia === hoje.dia);
}

export function aniversarianteParaMuralItem(
  pessoa: Aniversariante,
  hoje: DataReferencia
): MuralNoticiaItem {
  return {
    trackId: `aniv-${pessoa.id}`,
    origem: 'aniversariante',
    titulo: `Parabéns, ${pessoa.nome}!`,
    categoriaLabel: 'Aniversário',
    catClasse: 'aniversario',
    categoriaCor: ANIVERSARIO_COR,
    dia: String(hoje.dia).padStart(2, '0'),
    mes: mesAbbr(hoje.mes),
    link: ANIVERSARIOS_LINK,
  };
}

function comunicadoParaMuralItem(comunicado: Comunicado): MuralNoticiaItem {
  return {
    trackId: `com-${comunicado.id}`,
    origem: 'comunicado',
    titulo: comunicado.titulo,
    categoriaLabel: comunicado.categoriaLabel,
    catClasse: comunicado.catClasse,
    categoriaCor: comunicado.categoriaCor,
    dia: comunicado.dia,
    mes: comunicado.mes,
  };
}

export function mesclarNoticiasMural(
  comunicados: Comunicado[],
  aniversariantes: Aniversariante[],
  hoje: DataReferencia = {
    mes: new Date().getMonth() + 1,
    dia: new Date().getDate(),
  }
): MuralNoticiaItem[] {
  const doDia = aniversariantesDoDia(aniversariantes, hoje).map((p) =>
    aniversarianteParaMuralItem(p, hoje)
  );
  const avisos = comunicados.map(comunicadoParaMuralItem);
  return [...doDia, ...avisos];
}
