import { router } from 'expo-router';
import { Deal, dealsFrom } from '../../src/api/contracts';
import { PagedList } from '../../src/components/PagedList';
export default function Deals() {
  return <PagedList<Deal> resource="deals" path={(page, search) => `/api/deals?page=${page}&limit=25&search=${encodeURIComponent(search)}`}
    parse={dealsFrom} identify={deal => deal.id} title={deal => deal.name} subtitle={deal => deal.status} searchLabel="Search deals" onSelect={deal => router.push({ pathname: '/deals/[id]', params: { id: deal.id } })} />;
}
