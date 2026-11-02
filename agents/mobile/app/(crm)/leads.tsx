import { router } from 'expo-router';
import { PagedList } from '../../src/components/PagedList';
import { Lead, leadsFrom } from '../../src/api/contracts';
export default function Leads() {
  return <PagedList<Lead> resource="leads" path={(page, search) => `/api/leads/recent-external?page=${page}&limit=25&search=${encodeURIComponent(search)}`}
    parse={leadsFrom} identify={lead => lead.phone} title={lead => lead.name} subtitle={lead => [lead.stage, lead.location].filter(Boolean).join(' · ')}
    detail={lead => lead.assignee ? `Assigned to ${lead.assignee}` : undefined} searchLabel="Search leads" onSelect={lead => router.push({ pathname: '/lead/[phone]', params: { phone: lead.phone } })} />;
}
