import { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  ScrollView,
  FlatList,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '../constants/colors';

export interface TaskCustomFieldOption {
  id: string;
  label: string;
  sortOrder: number;
}

export interface TaskCustomField {
  id: string;
  label: string;
  fieldType: string;
  isRequired: boolean;
  showInReport: boolean;
  sortOrder: number;
  options: TaskCustomFieldOption[];
}

export type TaskFieldValueInput = {
  fieldId: string;
  selectedOptionIds: string[];
};

type CustomFieldPickerModalProps = {
  visible: boolean;
  taskName: string;
  fields: TaskCustomField[];
  initialValues?: TaskFieldValueInput[];
  onCancel: () => void;
  onConfirm: (values: TaskFieldValueInput[]) => void;
};

function buildInitialSelection(
  fields: TaskCustomField[],
  initialValues?: TaskFieldValueInput[],
): Record<string, Set<string>> {
  const map: Record<string, Set<string>> = {};
  for (const field of fields) {
    const existing = initialValues?.find((value) => value.fieldId === field.id);
    map[field.id] = new Set(existing?.selectedOptionIds ?? []);
  }
  return map;
}

function selectionToValues(
  fields: TaskCustomField[],
  selection: Record<string, Set<string>>,
): TaskFieldValueInput[] {
  return fields.map((field) => ({
    fieldId: field.id,
    selectedOptionIds: Array.from(selection[field.id] ?? []),
  }));
}

export function hasTaskCustomFields(fields: TaskCustomField[] | undefined): boolean {
  return (fields ?? []).length > 0;
}

export function hasRequiredCustomFields(fields: TaskCustomField[] | undefined): boolean {
  return (fields ?? []).some((field) => field.isRequired);
}

export function CustomFieldPickerModal({
  visible,
  taskName,
  fields,
  initialValues,
  onCancel,
  onConfirm,
}: CustomFieldPickerModalProps) {
  const sortedFields = useMemo(
    () => [...fields].sort((a, b) => a.sortOrder - b.sortOrder),
    [fields],
  );
  const [selection, setSelection] = useState<Record<string, Set<string>>>({});
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) return;
    setSelection(buildInitialSelection(sortedFields, initialValues));
    setError(null);
  }, [visible, sortedFields, initialValues]);

  function toggleOption(fieldId: string, optionId: string) {
    setSelection((prev) => {
      const next = { ...prev };
      const current = new Set(next[fieldId] ?? []);
      if (current.has(optionId)) current.delete(optionId);
      else current.add(optionId);
      next[fieldId] = current;
      return next;
    });
    setError(null);
  }

  function handleConfirm() {
    for (const field of sortedFields) {
      if (!field.isRequired) continue;
      const selected = selection[field.id];
      if (!selected || selected.size === 0) {
        setError(`Seleccioná al menos una opción en "${field.label}".`);
        return;
      }
    }
    onConfirm(selectionToValues(sortedFields, selection));
  }

  if (fields.length === 0) return null;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onCancel}>
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          <Text style={styles.title}>Campos de la tarea</Text>
          <Text style={styles.subtitle} numberOfLines={2}>
            {taskName}
          </Text>

          <ScrollView style={styles.body} contentContainerStyle={styles.bodyContent}>
            {sortedFields.map((field) => (
              <View key={field.id} style={styles.fieldBlock}>
                <Text style={styles.fieldLabel}>
                  {field.label}
                  {field.isRequired ? <Text style={styles.required}> *</Text> : null}
                </Text>
                <FlatList
                  data={[...field.options].sort((a, b) => a.sortOrder - b.sortOrder)}
                  keyExtractor={(item) => item.id}
                  scrollEnabled={false}
                  renderItem={({ item }) => {
                    const selected = selection[field.id]?.has(item.id) ?? false;
                    return (
                      <TouchableOpacity
                        style={[styles.optionRow, selected && styles.optionRowSelected]}
                        onPress={() => toggleOption(field.id, item.id)}
                      >
                        <Ionicons
                          name={selected ? 'checkbox' : 'square-outline'}
                          size={20}
                          color={selected ? COLORS.primary : COLORS.disabled}
                        />
                        <Text style={styles.optionText}>{item.label}</Text>
                      </TouchableOpacity>
                    );
                  }}
                />
              </View>
            ))}
          </ScrollView>

          {error ? <Text style={styles.errorText}>{error}</Text> : null}

          <View style={styles.actions}>
            <TouchableOpacity style={styles.cancelBtn} onPress={onCancel}>
              <Text style={styles.cancelText}>Cancelar</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.confirmBtn} onPress={handleConfirm}>
              <Text style={styles.confirmText}>Confirmar</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: COLORS.surface,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    padding: 20,
    maxHeight: '80%',
    gap: 8,
  },
  title: { fontSize: 18, fontWeight: '700', color: COLORS.text },
  subtitle: { fontSize: 13, color: COLORS.textMuted, marginBottom: 4 },
  body: { maxHeight: 360 },
  bodyContent: { gap: 14, paddingBottom: 8 },
  fieldBlock: { gap: 6 },
  fieldLabel: { fontSize: 14, fontWeight: '700', color: COLORS.text },
  required: { color: COLORS.error },
  optionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginTop: 6,
  },
  optionRowSelected: {
    borderColor: COLORS.primary,
    backgroundColor: '#eff6ff',
  },
  optionText: { flex: 1, fontSize: 14, color: COLORS.text },
  errorText: { color: COLORS.error, fontSize: 13, marginTop: 4 },
  actions: { flexDirection: 'row', gap: 10, marginTop: 8 },
  cancelBtn: {
    flex: 1,
    alignItems: 'center',
    padding: 14,
    borderRadius: 10,
    backgroundColor: COLORS.bg,
  },
  cancelText: { fontSize: 15, fontWeight: '600', color: COLORS.textMuted },
  confirmBtn: {
    flex: 1,
    alignItems: 'center',
    padding: 14,
    borderRadius: 10,
    backgroundColor: COLORS.primary,
  },
  confirmText: { fontSize: 15, fontWeight: '700', color: '#fff' },
});
