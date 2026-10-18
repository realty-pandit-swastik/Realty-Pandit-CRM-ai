import { useQuery } from '@tanstack/react-query';
import { useApi, useSession } from '../auth/SessionProvider';

export function useRecord<T>(resource: string, id: string, path: string, parse: (value: unknown) => T) {
  const api = useApi(), { scope } = useSession();
  return useQuery({ queryKey: [scope, resource, id], queryFn: async ({ signal }) => parse(await api.request(path, { signal })) });
}
