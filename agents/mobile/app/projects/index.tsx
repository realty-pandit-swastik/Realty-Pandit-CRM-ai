import { useState } from 'react';
import { router } from 'expo-router';
import { Button } from '../../src/components/Controls';
import { useSession } from '../../src/features/auth/SessionProvider';
import { Choice } from '../../src/features/tasks/Choice';
import { label, Project, projectsFrom, projectStatuses } from '../../src/features/tasks/contracts';
import { RecordList } from '../../src/features/tasks/RecordList';
export default function Projects() {
  const { offline } = useSession(), [status, setStatus] = useState('ALL');
  const filters = new URLSearchParams({ limit: '25' });
  if (status !== 'ALL') filters.set('status', status);
  return <RecordList<Project> resource="projects" filters={filters.toString()} path={page => `/api/projects?${filters}&page=${page}`} parse={projectsFrom}
    identify={project => project.id} title={project => project.name} subtitle={project => `${label(project.status)} · ${project.taskCount ?? 0} tasks in your scope`}
    detail={project => `Started ${new Date(project.start_date).toLocaleDateString()}${project.end_date ? ` · Ends ${new Date(project.end_date).toLocaleDateString()}` : ''}`}
    onSelect={project => router.push({ pathname: '/projects/[id]', params: { id: project.id } })}
    extra={<><Button title="New project" disabled={offline} onPress={() => router.push('/projects/new')} /><Choice title="Status" value={status} options={['ALL', ...projectStatuses]} onChange={setStatus} /></>} />;
}
