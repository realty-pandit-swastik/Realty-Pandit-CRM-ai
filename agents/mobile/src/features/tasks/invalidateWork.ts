import { QueryClient } from '@tanstack/react-query';
export function invalidateWork(cache: QueryClient, scope: string) {
  return Promise.all(['task', 'tasks', 'home-tasks', 'project', 'projects'].map(resource => cache.invalidateQueries({ queryKey: [scope, resource] })));
}
