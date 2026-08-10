import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  Alert,
} from 'react-native';
import { WebView } from 'react-native-webview';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as FileSystem from 'expo-file-system/legacy';
import { COLORS } from '../constants/colors';
import { shareLocalPdf } from '../utils/download-pdf';

type Props = {
  visible: boolean;
  uri: string | null;
  title?: string;
  onClose: () => void;
};

export function PdfViewerModal({ visible, uri, title = 'Presupuesto', onClose }: Props) {
  const insets = useSafeAreaInsets();
  const [sourceUri, setSourceUri] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function prepare() {
      if (!visible || !uri) {
        setSourceUri(null);
        setError(null);
        return;
      }

      setLoading(true);
      setError(null);
      try {
        if (Platform.OS === 'android') {
          // Android WebView no abre bien file:// locales; usar data URI.
          const base64 = await FileSystem.readAsStringAsync(uri, {
            encoding: FileSystem.EncodingType.Base64,
          });
          if (!cancelled) {
            setSourceUri(`data:application/pdf;base64,${base64}`);
          }
        } else if (!cancelled) {
          setSourceUri(uri);
        }
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : 'No se pudo abrir el PDF');
          setSourceUri(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void prepare();
    return () => {
      cancelled = true;
    };
  }, [visible, uri]);

  async function handleShare() {
    if (!uri) return;
    setSharing(true);
    try {
      await shareLocalPdf(uri);
    } catch (e) {
      Alert.alert(
        'Error',
        e instanceof Error ? e.message : 'No se pudo compartir el PDF',
      );
    } finally {
      setSharing(false);
    }
  }

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <View style={styles.header}>
          <TouchableOpacity onPress={onClose} hitSlop={12} style={styles.iconBtn}>
            <Ionicons name="close" size={24} color={COLORS.text} />
          </TouchableOpacity>
          <Text style={styles.title} numberOfLines={1}>
            {title}
          </Text>
          <TouchableOpacity
            onPress={() => void handleShare()}
            hitSlop={12}
            style={styles.iconBtn}
            disabled={!uri || sharing}
          >
            {sharing ? (
              <ActivityIndicator size="small" color={COLORS.primary} />
            ) : (
              <Ionicons name="share-outline" size={22} color={COLORS.primary} />
            )}
          </TouchableOpacity>
        </View>

        {loading ? (
          <View style={styles.center}>
            <ActivityIndicator color={COLORS.primary} size="large" />
            <Text style={styles.hint}>Preparando PDF…</Text>
          </View>
        ) : error ? (
          <View style={styles.center}>
            <Text style={styles.error}>{error}</Text>
            {uri ? (
              <TouchableOpacity style={styles.shareFallback} onPress={() => void handleShare()}>
                <Text style={styles.shareFallbackText}>Compartir / abrir con otra app</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        ) : sourceUri ? (
          <WebView
            source={{ uri: sourceUri }}
            style={styles.webview}
            originWhitelist={['*']}
            allowFileAccess
            allowUniversalAccessFromFileURLs
            mixedContentMode="always"
            startInLoadingState
            renderLoading={() => (
              <View style={styles.webviewLoading}>
                <ActivityIndicator color={COLORS.primary} />
              </View>
            )}
          />
        ) : (
          <View style={styles.center}>
            <Text style={styles.hint}>Sin documento</Text>
          </View>
        )}

        <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 12) }]}>
          <TouchableOpacity
            style={styles.shareBtn}
            onPress={() => void handleShare()}
            disabled={!uri || sharing}
          >
            {sharing ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <>
                <Ionicons name="share-social-outline" size={18} color="#fff" />
                <Text style={styles.shareBtnText}>Compartir PDF</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 10,
    backgroundColor: COLORS.surface,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    gap: 4,
  },
  iconBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    flex: 1,
    textAlign: 'center',
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.text,
  },
  webview: { flex: 1, backgroundColor: COLORS.bg },
  webviewLoading: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.bg,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    gap: 12,
  },
  hint: { fontSize: 13, color: COLORS.textMuted },
  error: { fontSize: 14, color: COLORS.error, textAlign: 'center' },
  shareFallback: {
    marginTop: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.primary,
  },
  shareFallbackText: { color: COLORS.primary, fontWeight: '600' },
  footer: {
    paddingHorizontal: 16,
    paddingTop: 12,
    backgroundColor: COLORS.surface,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  shareBtn: {
    backgroundColor: COLORS.primary,
    borderRadius: 10,
    paddingVertical: 13,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  shareBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
});
