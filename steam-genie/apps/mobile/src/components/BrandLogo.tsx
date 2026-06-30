import { Image, ImageStyle, StyleProp, View, ViewStyle } from 'react-native';
import { BRAND_IMAGES, BrandLogoVariant } from '../constants/brand';

const VARIANTS: Record<
  BrandLogoVariant,
  { source: number; width: number; height: number }
> = {
  login: {
    source: BRAND_IMAGES.logoOnWhiteTransparent,
    width: 400,
    height: 200,
  },
  onBlue: {
    source: BRAND_IMAGES.logoOnBlue,
    width: 220,
    height: 220,
  },
  onWhite: {
    source: BRAND_IMAGES.logoOnWhite,
    width: 240,
    height: 120,
  },
  compact: {
    source: BRAND_IMAGES.logoCompact,
    width: 140,
    height: 48,
  },
  icon: {
    source: BRAND_IMAGES.icon,
    width: 40,
    height: 40,
  },
  wordmark: {
    source: BRAND_IMAGES.wordmark,
    width: 120,
    height: 36,
  },
};

interface BrandLogoProps {
  variant?: BrandLogoVariant;
  size?: number;
  style?: StyleProp<ViewStyle>;
  imageStyle?: StyleProp<ImageStyle>;
}

export function BrandLogo({
  variant = 'icon',
  size,
  style,
  imageStyle,
}: BrandLogoProps) {
  const config = VARIANTS[variant];
  const scaledStyle =
    size != null
      ? {
          width: size,
          height: size * (config.height / config.width),
        }
      : { width: config.width, height: config.height };

  return (
    <View style={style}>
      <Image
        source={config.source}
        style={[scaledStyle, imageStyle]}
        resizeMode="contain"
      />
    </View>
  );
}
