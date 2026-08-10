import { ActivityIndicator, Image, ImageStyle, StyleProp, StyleSheet, View } from 'react-native';
import { useAuthenticatedImage } from '../hooks/useAuthenticatedImage';
import { COLORS } from '../constants/colors';

interface Props {
  pathOrUrl: string | null | undefined;
  style?: StyleProp<ImageStyle>;
}

export function AuthenticatedImage({ pathOrUrl, style }: Props) {
  const source = useAuthenticatedImage(pathOrUrl);

  if (!pathOrUrl) {
    return <View style={[styles.placeholder, style]} />;
  }

  if (!source) {
    return (
      <View style={[styles.placeholder, style]}>
        <ActivityIndicator size="small" color={COLORS.primary} />
      </View>
    );
  }

  return <Image source={source} style={style} resizeMode="cover" />;
}

const styles = StyleSheet.create({
  placeholder: {
    backgroundColor: COLORS.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
