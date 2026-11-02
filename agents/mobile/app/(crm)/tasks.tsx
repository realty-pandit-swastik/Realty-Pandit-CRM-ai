import { useState } from 'react';
import { router } from 'expo-router';
import { Task, tasksFrom } from '../../src/api/contracts';
import { Button } from '../../src/components/Controls';
import { useSession } from '../../src/features/auth/SessionProvider';
import { Choice } from '../../src/features/tasks/Choice';
import { label, priorities, taskStatuses } from '../../src/features/tasks/contracts';
import { RecordList } from '../../src/features/tasks/RecordList';
export default function Tasks() {
  const { session, offline } = useSession();
  const [status, setStatus] = useState('ALL'), [priority, setPriority] = useState('ALL'), [assignment, setAssignment] = useState('MINE');
  const filters = new URLSearchParams({ view: 'calendar', limit: '25' });
  if (assignment === 'MINE') filters.set('assigned_to', session!.agent.id);
  if (status !== 'ALL') filters.set('status', status);
  if (priority !== 'ALL') filters.set('priority', priority);
  return <RecordList<Task> resource="tasks" filters={filters.toString()} path={page => `/api/tasks?${filters}&page=${page}`}
    parse={tasksFrom} identify={task => task.id} title={task => task.title} subtitle={task => `${label(task.status)} · ${label(task.priority)}`}
    detail={task => `Due ${new Date(task.due_date).toLocaleDateString()}`} extra={<>
      <Button title="New task" disabled={offline} onPress={() => router.push('/task/new')} />
      {session!.agent.role !== 'employee' && <Choice title="Assignment" value={assignment} options={['MINE', 'MY_TEAM']} onChange={setAssignment} />}
      <Choice title="Status" value={status} options={['ALL', ...taskStatuses]} onChange={setStatus} />
      <Choice title="Priority" value={priority} options={['ALL', ...priorities]} onChange={setPriority} />
    </>} onSelect={task => router.push({ pathname: '/task/[id]', params: { id: task.id } })} />;
}
