import { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
  Alert,
} from 'react-native';
import { useAuthStore } from '../src/stores/auth.store';
import { useBuildingStore, Building } from '../src/stores/building.store';
import { apiService } from '../src/services/api.service';
import { COLORS } from '../src/constants/colors';

interface BuildingsResponse {
  data: Building[];
  total: number;
}

export default function BuildingSelectScreen() {
  const [buildings, setBuildings] = useState<Building[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectingId, setSelectingId] = useState<string | null>(null);

  const { user, logout } = useAuthStore();
  const { selectBuilding, isLoadingPrefetch } = useBuildingStore();

  const loadBuildings = useCallback(async () => {
    try {
      const res = await apiService.get<BuildingsResponse>('/buildings');
      setBuildings(res.data);
    } catch (e) {
      Alert.alert('Error', e instanceof Error ? e.message : 'No se pudieron cargar los edificios');
    } finally {
      setIsLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadBuildings();
  }, [loadBuildings]);

  async function handleSelect(building: Building) {
    setSelectingId(building.id);
    try {
      await selectBuilding(building);
      // Navigation handled by _layout.tsx guard
    } catch (e) {
      Alert.alert('Error', e instanceof Error ? e.message : 'No se pudo seleccionar el edificio');
    } finally {
      setSelectingId(null);
    }
  }

  function renderBuilding({ item }: { item: Building }) {
    const isSelecting = selectingId === item.id;
    const hasGPS = item.latitude && item.longitude;

    return (
      <TouchableOpacity
        style={styles.card}
        onPress={() => handleSelect(item)}
        disabled={!!selectingId || isLoadingPrefetch}
      >
        <View style={styles.cardContent}>
          <Text style={styles.cardTitle}>{item.name}</Text>
          {item.address && <Text style={styles.cardAddress}>{item.address}</Text>}
          <View style={styles.cardMeta}>
            <View style={[styles.badge, hasGPS ? styles.badgeOk : styles.badgeWarn]}>
              <Text style={styles.badgeText}>
                {hasGPS ? `GPS ${item.gpsRadiusM}m` : 'Sin GPS'}
              </Text>
            </View>
          </View>
        </View>
        {isSelecting ? (
          <ActivityIndicator color={COLORS.primary} />
        ) : (
          <Text style={styles.arrow}>›</Text>
        )}
      </TouchableOpacity>
    );
  }

  if (isLoading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={COLORS.primary} />
        <Text style={styles.loadingText}>Cargando edificios...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View>
          <Text style={styles.greeting}>Hola, {user?.fullName ?? 'usuario'}</Text>
          <Text style={styles.subtitle}>Seleccioná un edificio para comenzar</Text>
        </View>
        <TouchableOpacity onPress={logout} style={styles.logoutBtn}>
          <Text style={styles.logoutText}>Salir</Text>
        </TouchableOpacity>
      </View>

      <FlatList
        data={buildings}
        keyExtractor={(item) => item.id}
        renderItem={renderBuilding}
        contentContainerStyle={styles.list}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => {
            setRefreshing(true);
            loadBuildings();
          }} />
        }
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyText}>No hay edificios disponibles</Text>
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12 },
  loadingText: { color: COLORS.textMuted, fontSize: 14 },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    padding: 20,
    paddingTop: 60,
    backgroundColor: COLORS.primary,
  },
  greeting: { fontSize: 18, fontWeight: '700', color: '#fff' },
  subtitle: { fontSize: 13, color: 'rgba(255,255,255,0.8)', marginTop: 2 },
  logoutBtn: { paddingVertical: 6, paddingHorizontal: 12, backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 6 },
  logoutText: { color: '#fff', fontSize: 13, fontWeight: '600' },
  list: { padding: 16, gap: 12 },
  card: {
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  cardContent: { flex: 1 },
  cardTitle: { fontSize: 16, fontWeight: '700', color: COLORS.text },
  cardAddress: { fontSize: 13, color: COLORS.textMuted, marginTop: 2 },
  cardMeta: { flexDirection: 'row', marginTop: 8, gap: 8 },
  badge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 12 },
  badgeOk: { backgroundColor: '#dcfce7' },
  badgeWarn: { backgroundColor: '#fef3c7' },
  badgeText: { fontSize: 11, fontWeight: '600', color: COLORS.text },
  arrow: { fontSize: 24, color: COLORS.disabled, marginLeft: 8 },
  empty: { padding: 32, alignItems: 'center' },
  emptyText: { color: COLORS.textMuted, fontSize: 15 },
});
