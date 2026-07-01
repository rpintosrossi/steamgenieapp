import { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Keyboard,
  Platform,
  ScrollView,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { loginSchema } from '@steam-genie/shared-validators';
import { useAuthStore } from '../../src/stores/auth.store';
import { BrandLogo } from '../../src/components/BrandLogo';
import { COLORS } from '../../src/constants/colors';

export default function LoginScreen() {
  const insets = useSafeAreaInsets();
  const scrollRef = useRef<ScrollView>(null);
  const [dni, setDni] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const login = useAuthStore((s) => s.login);

  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';

    const showSub = Keyboard.addListener(showEvent, (event) => {
      setKeyboardHeight(event.endCoordinates.height);
    });
    const hideSub = Keyboard.addListener(hideEvent, () => {
      setKeyboardHeight(0);
    });

    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  useEffect(() => {
    if (keyboardHeight > 0) {
      scrollToSubmitButton();
    }
  }, [keyboardHeight]);

  function scrollToSubmitButton() {
    requestAnimationFrame(() => {
      scrollRef.current?.scrollToEnd({ animated: true });
    });
  }

  async function handleLogin() {
    const parsed = loginSchema.safeParse({ dni, password });
    if (!parsed.success) {
      setError(parsed.error.errors[0].message);
      return;
    }
    setIsSubmitting(true);
    setError(null);
    try {
      await login(dni, password);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al iniciar sesión');
    } finally {
      setIsSubmitting(false);
    }
  }

  const keyboardPadding =
    keyboardHeight > 0 ? Math.max(24, keyboardHeight - insets.bottom + 16) : 32;

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <ScrollView
        ref={scrollRef}
        style={styles.flex}
        contentContainerStyle={[styles.scroll, { paddingBottom: keyboardPadding }]}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        showsVerticalScrollIndicator={false}
        bounces={false}
      >
        <View style={styles.hero}>
          <BrandLogo variant="login" />
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Iniciar sesión</Text>
          <Text style={styles.cardSubtitle}>Ingresá con tu DNI y contraseña</Text>

          <Text style={styles.label}>DNI</Text>
          <TextInput
            style={styles.input}
            placeholder="Ej: 12345678"
            placeholderTextColor={COLORS.disabled}
            keyboardType="numeric"
            autoCapitalize="none"
            returnKeyType="next"
            value={dni}
            onChangeText={setDni}
            onFocus={scrollToSubmitButton}
          />

          <Text style={styles.label}>Contraseña</Text>
          <TextInput
            style={styles.input}
            placeholder="Tu contraseña"
            placeholderTextColor={COLORS.disabled}
            secureTextEntry
            returnKeyType="done"
            value={password}
            onChangeText={setPassword}
            onFocus={scrollToSubmitButton}
            onSubmitEditing={() => void handleLogin()}
          />

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <TouchableOpacity
            style={[styles.primaryBtn, isSubmitting && styles.primaryBtnDisabled]}
            onPress={handleLogin}
            disabled={isSubmitting}
          >
            {isSubmitting ? (
              <>
                <ActivityIndicator color="#fff" />
                <Text style={styles.submittingHint}>Conectando con el servidor…</Text>
              </>
            ) : (
              <Text style={styles.primaryBtnText}>Ingresar</Text>
            )}
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.bg },
  flex: { flex: 1 },
  scroll: {
    paddingHorizontal: 24,
    paddingTop: 24,
    gap: 28,
  },
  hero: {
    alignItems: 'center',
    paddingBottom: 4,
  },
  card: {
    backgroundColor: COLORS.surface,
    borderRadius: 16,
    padding: 24,
    borderWidth: 1,
    borderColor: COLORS.border,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.06,
    shadowRadius: 12,
    elevation: 2,
    gap: 4,
  },
  cardTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: COLORS.text,
  },
  cardSubtitle: {
    fontSize: 13,
    color: COLORS.textMuted,
    marginBottom: 12,
  },
  label: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.textMuted,
    marginTop: 10,
    marginBottom: 6,
  },
  input: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    color: COLORS.text,
    backgroundColor: COLORS.bg,
  },
  error: {
    color: COLORS.error,
    fontSize: 13,
    marginTop: 10,
  },
  primaryBtn: {
    marginTop: 20,
    backgroundColor: COLORS.primary,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    gap: 8,
  },
  primaryBtnDisabled: { opacity: 0.7 },
  primaryBtnText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  submittingHint: {
    color: 'rgba(255,255,255,0.9)',
    fontSize: 12,
    fontWeight: '500',
  },
});
