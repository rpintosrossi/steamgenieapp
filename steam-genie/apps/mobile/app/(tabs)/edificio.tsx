import { useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import { useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useBuildingStore, PeriodicTaskCached } from '../../src/stores/building.store';
import { SyncStatusBar } from '../../src/components/SyncStatusBar';
import { BrandedScreenHeader } from '../../src/components/BrandedScreenHeader';
import { COLORS } from '../../src/constants/colors';

const FREQ_LABELS: Record<string, string> = {
  DAILY: 'Diaria',
  MON_FRI: 'Lun–Vie',
  WEEKLY: 'Semanal',
  BIWEEKLY: 'Quincenal',
  MONTHLY: 'Mensual',
  QUARTERLY: 'Trimestral',
  BIANNUAL: 'Semestral',
  ANNUAL: 'Anual',
  EVENTUAL: 'Eventual',
};

export default function EdificioScreen() {
  const {
    selectedBuilding,
    prefetchData,
    refreshPrefetch,
    isLoadingPrefetch,
  } = useBuildingStore();

  useFocusEffect(
    useCallback(() => {
      refreshPrefetch();
    }, [refreshPrefetch]),
  );

  const floors = prefetchData?.floors ?? [];
  const zones = prefetchData?.zones ?? [];
  const subzones = prefetchData?.subzones ?? [];
  const tasks = prefetchData?.periodicTasks ?? [];

  const isLoading = isLoadingPrefetch && !prefetchData;

  return (
    <View style={styles.container}>
      <SyncStatusBar />

      <BrandedScreenHeader
        title="Edificio"
        subtitle={selectedBuilding?.name ?? undefined}
      />

      <View style={styles.summaryRow}>
        <SummaryChip icon="layers-outline" label="Plantas" value={floors.length} />
        <SummaryChip icon="grid-outline" label="Zonas" value={zones.length} />
        <SummaryChip icon="git-branch-outline" label="Subzonas" value={subzones.length} />
        <SummaryChip icon="checkbox-outline" label="Tareas" value={tasks.length} />
      </View>

      {isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={COLORS.primary} />
          <Text style={styles.loadingText}>Cargando estructura...</Text>
        </View>
      ) : floors.length === 0 ? (
        <View style={styles.center}>
          <Ionicons name="business-outline" size={48} color={COLORS.disabled} />
          <Text style={styles.emptyTitle}>Sin estructura cargada</Text>
          <Text style={styles.emptyText}>
            Tirá hacia abajo para sincronizar los datos del edificio.
          </Text>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.content}
          refreshControl={
            <RefreshControl refreshing={isLoadingPrefetch} onRefresh={refreshPrefetch} />
          }
        >
          {floors.map((floor) => (
            <FloorSection
              key={floor.id}
              floorName={floor.name}
              zones={zones.filter((z) => z.floorId === floor.id)}
              subzones={subzones}
              tasks={tasks}
            />
          ))}
        </ScrollView>
      )}
    </View>
  );
}

function SummaryChip({
  icon,
  label,
  value,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: number;
}) {
  return (
    <View style={styles.chip}>
      <Ionicons name={icon} size={14} color={COLORS.primary} />
      <Text style={styles.chipValue}>{value}</Text>
      <Text style={styles.chipLabel}>{label}</Text>
    </View>
  );
}

function FloorSection({
  floorName,
  zones,
  subzones,
  tasks,
}: {
  floorName: string;
  zones: { id: string; name: string; floorId: string }[];
  subzones: { id: string; name: string; zoneId: string }[];
  tasks: PeriodicTaskCached[];
}) {
  return (
    <View style={styles.floorBlock}>
      <View style={styles.floorHeader}>
        <Ionicons name="layers" size={18} color={COLORS.primary} />
        <Text style={styles.floorTitle}>{floorName}</Text>
        <Text style={styles.floorMeta}>{zones.length} zonas</Text>
      </View>

      {zones.map((zone) => {
        const zoneSubzones = subzones.filter((s) => s.zoneId === zone.id);
        const zoneTasksDirect = tasks.filter((t) => t.zoneId === zone.id && !t.subzoneId);

        return (
          <View key={zone.id} style={styles.zoneBlock}>
            <View style={styles.zoneHeader}>
              <Ionicons name="grid-outline" size={16} color={COLORS.text} />
              <Text style={styles.zoneTitle}>{zone.name}</Text>
            </View>

            {zoneSubzones.map((sub) => {
              const subTasks = tasks.filter((t) => t.subzoneId === sub.id);
              return (
                <View key={sub.id} style={styles.subzoneBlock}>
                  <Text style={styles.subzoneTitle}>{sub.name}</Text>
                  {subTasks.length === 0 ? (
                    <Text style={styles.noTasks}>Sin tareas configuradas</Text>
                  ) : (
                    subTasks.map((task) => (
                      <View key={task.id} style={styles.taskRow}>
                        <Ionicons name="ellipse" size={6} color={COLORS.primary} />
                        <Text style={styles.taskName}>{task.name}</Text>
                        <Text style={styles.taskFreq}>
                          {FREQ_LABELS[task.frequency] ?? task.frequency}
                        </Text>
                      </View>
                    ))
                  )}
                </View>
              );
            })}

            {zoneTasksDirect.map((task) => (
              <View key={task.id} style={styles.taskRowIndented}>
                <Ionicons name="ellipse" size={6} color={COLORS.primary} />
                <Text style={styles.taskName}>{task.name}</Text>
              </View>
            ))}
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  summaryRow: {
    flexDirection: 'row',
    backgroundColor: COLORS.surface,
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  chip: { flex: 1, alignItems: 'center', gap: 2 },
  chipValue: { fontSize: 18, fontWeight: '800', color: COLORS.primary },
  chipLabel: { fontSize: 10, color: COLORS.textMuted, textAlign: 'center' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32, gap: 10 },
  loadingText: { color: COLORS.textMuted, fontSize: 14 },
  emptyTitle: { fontSize: 16, fontWeight: '700', color: COLORS.text },
  emptyText: { fontSize: 13, color: COLORS.textMuted, textAlign: 'center' },
  content: { padding: 16, gap: 16, paddingBottom: 32 },
  floorBlock: {
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  floorHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 14,
    backgroundColor: '#eff6ff',
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  floorTitle: { flex: 1, fontSize: 16, fontWeight: '700', color: COLORS.text },
  floorMeta: { fontSize: 12, color: COLORS.textMuted },
  zoneBlock: { paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  zoneHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  zoneTitle: { fontSize: 14, fontWeight: '700', color: COLORS.text },
  subzoneBlock: {
    marginLeft: 12,
    marginBottom: 8,
    paddingLeft: 10,
    borderLeftWidth: 2,
    borderLeftColor: COLORS.primaryLight,
  },
  subzoneTitle: { fontSize: 13, fontWeight: '600', color: COLORS.text, marginBottom: 4 },
  noTasks: { fontSize: 12, color: COLORS.textMuted, fontStyle: 'italic', marginLeft: 4 },
  taskRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 3,
    paddingLeft: 4,
  },
  taskRowIndented: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 3,
    marginLeft: 12,
  },
  taskName: { flex: 1, fontSize: 12, color: COLORS.text },
  taskFreq: { fontSize: 10, color: COLORS.textMuted },
});
