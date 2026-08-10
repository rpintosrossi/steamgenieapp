import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  RefreshControl,
  Modal,
  Pressable,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import {
  calendarDateKeyFromStored,
  calendarDateKeyInBusinessTz,
} from '@steam-genie/shared-constants';
import { BrandedScreenHeader } from '../../src/components/BrandedScreenHeader';
import { COLORS } from '../../src/constants/colors';
import {
  adminApi,
  type AdminBuilding,
  type EventualCalendarReservation,
  type EventualCalendarResponse,
  type EventualCalendarService,
} from '../../src/services/admin-api';
import { formatScheduledTime } from '../../src/utils/schedule';

const WEEKDAY_LABELS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];

const STATUS_LABELS: Record<string, string> = {
  UNASSIGNED: 'Sin asignar',
  QUOTE_ACCEPTED: 'Presupuesto aceptado',
  ASSIGNED: 'Asignado',
  ACCEPTED: 'Aceptado',
  IN_PROGRESS: 'En curso',
  COMPLETED: 'Completado',
  REJECTED: 'Rechazado',
  CANCELLED: 'Cancelado',
};

interface CalendarDay {
  key: string;
  inMonth: boolean;
  label: number;
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

function calendarKeyFromParts(y: number, m: number, d: number): string {
  return `${y}-${pad2(m)}-${pad2(d)}`;
}

function monthInputValue(year: number, month: number): string {
  return `${year}-${pad2(month)}`;
}

function currentMonthInput(): string {
  const now = new Date();
  return monthInputValue(now.getFullYear(), now.getMonth() + 1);
}

function parseMonthInput(value: string): { year: number; month: number } {
  const [y, m] = value.split('-').map(Number);
  return { year: y, month: m };
}

function monthRangeKeys(monthValue: string): { from: string; to: string } {
  const { year, month } = parseMonthInput(monthValue);
  const from = calendarKeyFromParts(year, month, 1);
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const to = calendarKeyFromParts(year, month, lastDay);
  return { from, to };
}

function buildMonthGrid(monthValue: string): CalendarDay[] {
  const { year, month } = parseMonthInput(monthValue);
  const firstOfMonth = new Date(Date.UTC(year, month - 1, 1));
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const weekday = (firstOfMonth.getUTCDay() + 6) % 7;
  const cells: CalendarDay[] = [];

  for (let i = weekday - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(year, month - 1, 1 - (i + 1)));
    cells.push({
      key: calendarKeyFromParts(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate()),
      inMonth: false,
      label: d.getUTCDate(),
    });
  }

  for (let day = 1; day <= lastDay; day++) {
    cells.push({
      key: calendarKeyFromParts(year, month, day),
      inMonth: true,
      label: day,
    });
  }

  while (cells.length % 7 !== 0) {
    const last = cells[cells.length - 1]!;
    const [y, m, d] = last.key.split('-').map(Number);
    const next = new Date(Date.UTC(y, m - 1, d + 1));
    cells.push({
      key: calendarKeyFromParts(next.getUTCFullYear(), next.getUTCMonth() + 1, next.getUTCDate()),
      inMonth: false,
      label: next.getUTCDate(),
    });
  }

  return cells;
}

function shiftMonth(monthValue: string, delta: number): string {
  const { year, month } = parseMonthInput(monthValue);
  const d = new Date(Date.UTC(year, month - 1 + delta, 1));
  return monthInputValue(d.getUTCFullYear(), d.getUTCMonth() + 1);
}

function monthTitle(monthValue: string): string {
  const { year, month } = parseMonthInput(monthValue);
  const label = new Date(year, month - 1, 1).toLocaleDateString('es-AR', {
    month: 'long',
    year: 'numeric',
  });
  return label.charAt(0).toUpperCase() + label.slice(1);
}

function overlapsDay(checkinAt: string, checkoutAt: string, dayKey: string): boolean {
  const start = calendarDateKeyFromStored(checkinAt);
  const end = calendarDateKeyFromStored(checkoutAt);
  return dayKey >= start && dayKey <= end;
}

export default function AdminCalendarioScreen() {
  const router = useRouter();
  const todayKey = calendarDateKeyInBusinessTz(new Date());
  const [month, setMonth] = useState(currentMonthInput);
  const [buildings, setBuildings] = useState<AdminBuilding[]>([]);
  const [selectedBuildingIds, setSelectedBuildingIds] = useState<string[]>([]);
  const [showBuildingPicker, setShowBuildingPicker] = useState(false);
  const [data, setData] = useState<EventualCalendarResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedDay, setSelectedDay] = useState(todayKey);

  const gridDays = useMemo(() => buildMonthGrid(month), [month]);
  const { from, to } = useMemo(() => monthRangeKeys(month), [month]);

  const eventsByDay = useMemo(() => {
    const map = new Map<
      string,
      { reservations: EventualCalendarReservation[]; services: EventualCalendarService[] }
    >();
    for (const day of gridDays) {
      map.set(day.key, { reservations: [], services: [] });
    }
    if (!data) return map;

    for (const r of data.reservations) {
      for (const day of gridDays) {
        if (overlapsDay(r.checkinAt, r.checkoutAt, day.key)) {
          map.get(day.key)?.reservations.push(r);
        }
      }
    }
    for (const s of data.services) {
      if (!s.scheduledDate) continue;
      const dayKey = calendarDateKeyFromStored(s.scheduledDate);
      map.get(dayKey)?.services.push(s);
    }
    return map;
  }, [data, gridDays]);

  // Al cambiar de mes, si el día elegido queda fuera del rango, usar hoy o el 1º.
  useEffect(() => {
    if (selectedDay >= from && selectedDay <= to) return;
    const todayInMonth = todayKey >= from && todayKey <= to;
    setSelectedDay(todayInMonth ? todayKey : from);
  }, [from, to, selectedDay, todayKey]);

  const dayDetail = eventsByDay.get(selectedDay) ?? { reservations: [], services: [] };
  const selectedDayLabel = new Date(selectedDay + 'T12:00:00').toLocaleDateString('es-AR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });
  const sortedServices = useMemo(
    () =>
      [...dayDetail.services].sort((a, b) =>
        formatScheduledTime(a.scheduledTime).localeCompare(
          formatScheduledTime(b.scheduledTime),
        ),
      ),
    [dayDetail.services],
  );

  const loadBuildings = useCallback(async () => {
    const list = await adminApi.listBuildings();
    setBuildings(list);
    setSelectedBuildingIds((prev) => {
      if (prev.length > 0) {
        const valid = prev.filter((id) => list.some((b) => b.id === id));
        if (valid.length > 0) return valid;
      }
      return list.map((b) => b.id);
    });
  }, []);

  const loadCalendar = useCallback(async () => {
    if (selectedBuildingIds.length === 0) {
      setData(null);
      setError(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await adminApi.queryCalendar({
        from,
        to,
        buildingIds: selectedBuildingIds,
        includeReservations: true,
        includeServices: true,
      });
      setData(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo cargar el calendario');
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [from, to, selectedBuildingIds]);

  useEffect(() => {
    void loadBuildings().catch((e) => {
      setError(e instanceof Error ? e.message : 'No se pudieron cargar los edificios');
    });
  }, [loadBuildings]);

  useEffect(() => {
    void loadCalendar();
  }, [loadCalendar]);

  async function onRefresh() {
    setRefreshing(true);
    try {
      await loadBuildings();
      await loadCalendar();
    } finally {
      setRefreshing(false);
    }
  }

  function toggleBuilding(id: string) {
    setSelectedBuildingIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }

  const buildingFilterLabel =
    selectedBuildingIds.length === 0
      ? 'Ningún edificio'
      : selectedBuildingIds.length === buildings.length
        ? 'Todos los edificios'
        : `${selectedBuildingIds.length} edificio${selectedBuildingIds.length === 1 ? '' : 's'}`;

  return (
    <View style={styles.container}>
      <BrandedScreenHeader
        title="Calendario"
        subtitle="Servicios confirmados y reservas"
        right={
          <TouchableOpacity
            style={styles.filterBtn}
            onPress={() => setShowBuildingPicker(true)}
          >
            <Ionicons name="filter-outline" size={18} color={COLORS.primary} />
            <Text style={styles.filterBtnText} numberOfLines={1}>
              {buildingFilterLabel}
            </Text>
          </TouchableOpacity>
        }
      />

      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        <View style={styles.monthNav}>
          <TouchableOpacity onPress={() => setMonth((m) => shiftMonth(m, -1))} hitSlop={12}>
            <Ionicons name="chevron-back" size={24} color={COLORS.text} />
          </TouchableOpacity>
          <Text style={styles.monthTitle}>{monthTitle(month)}</Text>
          <TouchableOpacity onPress={() => setMonth((m) => shiftMonth(m, 1))} hitSlop={12}>
            <Ionicons name="chevron-forward" size={24} color={COLORS.text} />
          </TouchableOpacity>
        </View>

        <View style={styles.weekHeader}>
          {WEEKDAY_LABELS.map((d) => (
            <Text key={d} style={styles.weekLabel}>
              {d}
            </Text>
          ))}
        </View>

        {loading && !data ? (
          <ActivityIndicator style={{ marginTop: 40 }} color={COLORS.primary} />
        ) : error ? (
          <Text style={styles.errorText}>{error}</Text>
        ) : (
          <View style={styles.grid}>
            {gridDays.map((day) => {
              const events = eventsByDay.get(day.key);
              const serviceCount = events?.services.length ?? 0;
              const reservationCount = events?.reservations.length ?? 0;
              const isToday = day.key === todayKey;
              const isSelected = day.key === selectedDay;
              return (
                <TouchableOpacity
                  key={day.key}
                  style={[
                    styles.dayCell,
                    !day.inMonth && styles.dayCellMuted,
                    isToday && !isSelected && styles.dayCellToday,
                    isSelected && styles.dayCellSelected,
                  ]}
                  onPress={() => setSelectedDay(day.key)}
                >
                  <Text
                    style={[
                      styles.dayNumber,
                      !day.inMonth && styles.dayNumberMuted,
                      isToday && !isSelected && styles.dayNumberToday,
                      isSelected && styles.dayNumberSelected,
                    ]}
                  >
                    {day.label}
                  </Text>
                  {(serviceCount > 0 || reservationCount > 0) && (
                    <View style={styles.dots}>
                      {serviceCount > 0 && (
                        <View
                          style={[
                            styles.dot,
                            styles.dotService,
                            isSelected && styles.dotOnSelected,
                          ]}
                        />
                      )}
                      {reservationCount > 0 && (
                        <View
                          style={[
                            styles.dot,
                            styles.dotReservation,
                            isSelected && styles.dotOnSelected,
                          ]}
                        />
                      )}
                    </View>
                  )}
                  {serviceCount > 0 && (
                    <Text style={[styles.countText, isSelected && styles.countTextSelected]}>
                      {serviceCount}
                    </Text>
                  )}
                </TouchableOpacity>
              );
            })}
          </View>
        )}

        {data?.truncated.services || data?.truncated.reservations ? (
          <Text style={styles.hint}>
            Resultados truncados. Probá filtrar menos edificios.
          </Text>
        ) : null}

        <View style={styles.legend}>
          <View style={styles.legendItem}>
            <View style={[styles.dot, styles.dotService]} />
            <Text style={styles.legendText}>Servicios</Text>
          </View>
          <View style={styles.legendItem}>
            <View style={[styles.dot, styles.dotReservation]} />
            <Text style={styles.legendText}>Reservas</Text>
          </View>
        </View>

        {/* Listado del día seleccionado */}
        <View style={styles.dayList}>
          <Text style={styles.dayListTitle}>{selectedDayLabel}</Text>
          <Text style={styles.dayListSubtitle}>
            {sortedServices.length} servicio
            {sortedServices.length === 1 ? '' : 's'}
            {dayDetail.reservations.length > 0
              ? ` · ${dayDetail.reservations.length} reserva${dayDetail.reservations.length === 1 ? '' : 's'}`
              : ''}
          </Text>

          {sortedServices.length === 0 && dayDetail.reservations.length === 0 ? (
            <Text style={styles.emptyText}>Sin eventos este día</Text>
          ) : null}

          {sortedServices.length > 0 && <Text style={styles.sectionLabel}>Servicios</Text>}
          {sortedServices.map((s) => (
            <TouchableOpacity
              key={s.id}
              style={styles.eventCard}
              onPress={() =>
                router.push({
                  pathname: '/admin/service/[id]',
                  params: { id: s.id },
                })
              }
            >
              <View style={styles.eventTop}>
                <Text style={styles.eventTime}>
                  {formatScheduledTime(s.scheduledTime)}
                </Text>
                <Text
                  style={[styles.badge, s.unassigned ? styles.badgeWarn : styles.badgeOk]}
                >
                  {STATUS_LABELS[s.status] ?? s.status}
                </Text>
              </View>
              <Text style={styles.eventTitle}>{s.title}</Text>
              <Text style={styles.eventMeta}>
                {s.building?.name ?? 'Edificio'}
                {s.zone?.name ? ` · ${s.zone.name}` : ''}
              </Text>
              {s.activeAssignments?.length ? (
                <Text style={styles.eventMeta}>
                  {s.activeAssignments
                    .map((a) => a.user?.fullName)
                    .filter(Boolean)
                    .join(', ')}
                </Text>
              ) : (
                <Text style={[styles.eventMeta, { color: COLORS.warning }]}>Sin asignar</Text>
              )}
            </TouchableOpacity>
          ))}

          {dayDetail.reservations.length > 0 && (
            <Text style={[styles.sectionLabel, { marginTop: 8 }]}>Reservas</Text>
          )}
          {dayDetail.reservations.map((r) => (
            <View key={r.id} style={[styles.eventCard, styles.reservationCard]}>
              <Text style={styles.eventTitle}>{r.guestName?.trim() || 'Reserva'}</Text>
              <Text style={styles.eventMeta}>
                {r.building?.name ?? 'Edificio'}
                {r.zone?.name ? ` · ${r.zone.name}` : ''}
              </Text>
            </View>
          ))}
        </View>
      </ScrollView>

      {/* Building picker */}
      <Modal visible={showBuildingPicker} animationType="slide" transparent>
        <Pressable style={styles.modalOverlay} onPress={() => setShowBuildingPicker(false)}>
          <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>Edificios</Text>
              <TouchableOpacity onPress={() => setShowBuildingPicker(false)}>
                <Ionicons name="close" size={24} color={COLORS.text} />
              </TouchableOpacity>
            </View>
            <View style={styles.pickerActions}>
              <TouchableOpacity onPress={() => setSelectedBuildingIds(buildings.map((b) => b.id))}>
                <Text style={styles.link}>Todos</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setSelectedBuildingIds([])}>
                <Text style={styles.link}>Ninguno</Text>
              </TouchableOpacity>
            </View>
            <ScrollView style={styles.sheetBody}>
              {buildings.map((b) => {
                const checked = selectedBuildingIds.includes(b.id);
                return (
                  <TouchableOpacity
                    key={b.id}
                    style={styles.checkRow}
                    onPress={() => toggleBuilding(b.id)}
                  >
                    <Ionicons
                      name={checked ? 'checkbox' : 'square-outline'}
                      size={22}
                      color={checked ? COLORS.primary : COLORS.disabled}
                    />
                    <Text style={styles.checkLabel}>{b.name}</Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
            <TouchableOpacity
              style={styles.applyBtn}
              onPress={() => {
                setShowBuildingPicker(false);
                void loadCalendar();
              }}
            >
              <Text style={styles.applyBtnText}>Aplicar</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  content: { padding: 16, paddingBottom: 40 },
  filterBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    maxWidth: 140,
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.bg,
  },
  filterBtnText: { fontSize: 12, color: COLORS.primary, fontWeight: '600', flexShrink: 1 },
  monthNav: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  monthTitle: { fontSize: 18, fontWeight: '700', color: COLORS.text },
  weekHeader: { flexDirection: 'row', marginBottom: 4 },
  weekLabel: {
    flex: 1,
    textAlign: 'center',
    fontSize: 11,
    fontWeight: '600',
    color: COLORS.textMuted,
  },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  dayCell: {
    width: `${100 / 7}%`,
    aspectRatio: 1,
    padding: 4,
    alignItems: 'center',
    justifyContent: 'flex-start',
    borderRadius: 8,
  },
  dayCellMuted: { opacity: 0.35 },
  dayCellToday: { backgroundColor: '#e8f0fe' },
  dayCellSelected: { backgroundColor: COLORS.primary },
  dayNumber: { fontSize: 14, fontWeight: '600', color: COLORS.text },
  dayNumberMuted: { color: COLORS.textMuted },
  dayNumberToday: { color: COLORS.primary },
  dayNumberSelected: { color: '#fff' },
  dots: { flexDirection: 'row', gap: 3, marginTop: 4 },
  dot: { width: 6, height: 6, borderRadius: 3 },
  dotService: { backgroundColor: COLORS.primary },
  dotReservation: { backgroundColor: COLORS.warning },
  dotOnSelected: { backgroundColor: '#fff' },
  countText: { fontSize: 10, color: COLORS.textMuted, marginTop: 2 },
  countTextSelected: { color: '#fff' },
  legend: { flexDirection: 'row', gap: 16, marginTop: 16 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendText: { fontSize: 12, color: COLORS.textMuted },
  hint: { marginTop: 12, fontSize: 12, color: COLORS.warning },
  errorText: { marginTop: 24, color: COLORS.error, textAlign: 'center' },
  dayList: {
    marginTop: 20,
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  dayListTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.text,
    textTransform: 'capitalize',
  },
  dayListSubtitle: { fontSize: 12, color: COLORS.textMuted, marginTop: 2, marginBottom: 10 },
  modalOverlay: {
    flex: 1,
    backgroundColor: COLORS.overlay,
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: COLORS.surface,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    maxHeight: '80%',
    paddingBottom: 24,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  sheetTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.text,
    textTransform: 'capitalize',
    flex: 1,
    marginRight: 8,
  },
  sheetBody: { paddingHorizontal: 16, paddingTop: 8 },
  sectionLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.textMuted,
    marginBottom: 8,
    marginTop: 4,
  },
  emptyText: { color: COLORS.textMuted, paddingVertical: 16, textAlign: 'center' },
  eventCard: {
    backgroundColor: COLORS.bg,
    borderRadius: 10,
    padding: 12,
    marginBottom: 8,
    borderLeftWidth: 3,
    borderLeftColor: COLORS.primary,
  },
  reservationCard: { borderLeftColor: COLORS.warning },
  eventTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  eventTime: { fontSize: 13, fontWeight: '700', color: COLORS.primary },
  eventTitle: { fontSize: 15, fontWeight: '600', color: COLORS.text },
  eventMeta: { fontSize: 12, color: COLORS.textMuted, marginTop: 2 },
  badge: {
    fontSize: 11,
    fontWeight: '600',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 999,
    overflow: 'hidden',
  },
  badgeOk: { backgroundColor: '#dcfce7', color: COLORS.success },
  badgeWarn: { backgroundColor: '#fef3c7', color: COLORS.warning },
  pickerActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 16,
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  link: { color: COLORS.primary, fontWeight: '600', fontSize: 14 },
  checkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: COLORS.border,
  },
  checkLabel: { fontSize: 15, color: COLORS.text, flex: 1 },
  applyBtn: {
    marginHorizontal: 16,
    marginTop: 12,
    backgroundColor: COLORS.primary,
    borderRadius: 10,
    padding: 14,
    alignItems: 'center',
  },
  applyBtnText: { color: '#fff', fontWeight: '700', fontSize: 16 },
});
