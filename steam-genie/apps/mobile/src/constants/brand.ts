export const BRAND = {
  navy: '#0a1628',
  accent: '#2f6fed',
} as const;

export const BRAND_IMAGES = {
  logoOnBlue: require('../../assets/images/logo-fondoazul.jpeg'),
  /** Logo completo sin fondo — login */
  logoOnWhiteTransparent: require('../../assets/images/logo-fondoblanco-sinfondo.png'),
  logoOnWhite: require('../../assets/images/logo-fondoblanco.jpeg'),
  logoCompact: require('../../assets/images/logo-maschico-fondoblanco.jpeg'),
  /** Ícono SG sin texto — headers */
  icon: require('../../assets/images/logo-sinletras.png'),
  wordmark: require('../../assets/images/letras-fondoblanco.png'),
} as const;

export type BrandLogoVariant =
  | 'login'
  | 'onBlue'
  | 'onWhite'
  | 'compact'
  | 'icon'
  | 'wordmark';
