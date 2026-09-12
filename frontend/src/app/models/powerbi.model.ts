export interface PowerBiReportListItem {
  reportId: string;
  titulo: string;
  descricao: string | null;
  datasetId: string | null;
  ordem: number;
}

export interface PowerBiEmbedToken {
  embedUrl: string;
  embedToken: string;
  tokenExpiration: string;
  reportId: string;
}
