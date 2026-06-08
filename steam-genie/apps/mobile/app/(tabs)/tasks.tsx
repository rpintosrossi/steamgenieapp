import { View, Text } from 'react-native';

export default function TasksScreen() {
  // TODO: list today's work orders with assigned tasks
  // Important: tasks here come from work_order_tasks snapshots (not taskId directly)
  return (
    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
      <Text>Tareas</Text>
    </View>
  );
}
