export interface HomeCarrosselSlide {
  id: string;
  url: string;
  alt: string;
  legenda: string | null;
  link: string | null;
  ordem: number;
}

export interface HomeCarrosselConfig {
  autoplay: boolean;
  intervaloMs: number;
  alturaPx: number;
  slides: HomeCarrosselSlide[];
}

export interface HomeCarrosselUploadResponse {
  url: string;
  compactado: boolean;
  largura: number | null;
  altura: number | null;
}

export const HOME_CARROSSEL_DEFAULTS: HomeCarrosselConfig = {
  autoplay: true,
  intervaloMs: 5000,
  alturaPx: 420,
  slides: [],
};
