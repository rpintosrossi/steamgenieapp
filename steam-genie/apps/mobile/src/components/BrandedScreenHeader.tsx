import { View, Text, StyleSheet } from 'react-native';
import { ReactNode } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import { BrandLogo } from './BrandLogo';
import { COLORS } from '../constants/colors';

interface BrandedScreenHeaderProps {
  title?: string;
  subtitle?: string;
  right?: ReactNode;
  showLogo?: boolean;
  iconSize?: number;
}

export function BrandedScreenHeader({
  title,
  subtitle,
  right,
  showLogo = true,
  iconSize = 40,
}: BrandedScreenHeaderProps) {
  return (
    <View style={styles.wrapper}>
      <SafeAreaView edges={['top']} style={styles.safe}>
        <View style={styles.inner}>
          <View style={styles.main}>
            {showLogo && <BrandLogo variant="icon" size={iconSize} />}
            {(title || subtitle) && (
              <View style={styles.textWrap}>
                {title ? <Text style={styles.title}>{title}</Text> : null}
                {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
              </View>
            )}
          </View>
          {right}
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    backgroundColor: COLORS.surface,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  safe: {
    paddingHorizontal: 20,
    paddingBottom: 16,
  },
  inner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
  },
  main: {
    flex: 1,
    gap: 12,
  },
  textWrap: {
    gap: 4,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: COLORS.text,
  },
  subtitle: {
    fontSize: 13,
    color: COLORS.textMuted,
    lineHeight: 18,
  },
});
