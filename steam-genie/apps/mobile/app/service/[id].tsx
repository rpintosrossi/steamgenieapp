import { useLocalSearchParams, useRouter } from 'expo-router';
import { View, Text, Button } from 'react-native';

export default function ServiceExecutionScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();

  // TODO: load work_order by id (from local DB first, then API)
  // TODO: display work_order_tasks for execution
  // IMPORTANT: marking a task done uses workOrderTaskId (not taskId)
  // for periodic tasks, use periodicTaskInstanceId

  return (
    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
      <Text>Orden de Trabajo #{id}</Text>
      <Button title="Volver" onPress={() => router.back()} />
    </View>
  );
}
