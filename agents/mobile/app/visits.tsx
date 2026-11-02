import { object, number } from '../src/api/client';
import { Visit, visitsFrom } from '../src/api/contracts';
import { PagedList } from '../src/components/PagedList';
import { router } from 'expo-router';
export default function Visits() {
  return <PagedList<Visit> resource="visits" path={page => `/api/calendar/appointments?mine=true&page=${page}&limit=25`}
    parse={value => ({ rows: visitsFrom(value), total: number(object(value).total) })} identify={visit => visit.id} title={visit => visit.contact || visit.title}
    subtitle={visit => new Date(visit.date).toLocaleString()} detail={visit => visit.status} onSelect={visit => router.push({ pathname: '/visits/[id]', params: { id: visit.id } })} />;
}
