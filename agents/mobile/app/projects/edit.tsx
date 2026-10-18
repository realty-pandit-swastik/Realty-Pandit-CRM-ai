import { useLocalSearchParams } from 'expo-router';
import { useRecord } from '../../src/features/crm/useRecord';
import { RecordLoading } from '../../src/features/crm/RecordLoading';
import { Failure } from '../../src/components/Controls';
import { projectFrom } from '../../src/features/tasks/contracts';
import { ProjectForm } from '../../src/features/tasks/ProjectForm';
export default function EditProject() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const query = useRecord('project', id, `/api/projects/${encodeURIComponent(id)}?include_tasks=false`, projectFrom);
  if (query.isPending) return <RecordLoading />;
  if (!query.data) return <Failure error={query.error || new Error('Project unavailable.')} retry={() => { void query.refetch(); }} />;
  return <ProjectForm key={id} project={query.data} />;
}
