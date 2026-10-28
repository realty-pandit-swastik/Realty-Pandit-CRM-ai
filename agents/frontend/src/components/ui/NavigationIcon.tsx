import { LayoutDashboard, ListTodo, Search, CalendarDays, ContactRound, Inbox, GitBranch, House, Map, Activity, Network, Mail, Phone, UserRound, Users, Handshake, ChartNoAxesCombined, Bot, ScrollText, ShieldCheck, Workflow, Megaphone } from 'lucide-react';

const icons: Record<string, typeof House> = {
  dashboard: LayoutDashboard, tasks: ListTodo, sourcing: Search, calendar: CalendarDays,
  contacts: ContactRound, leads: Inbox, deals: GitBranch, inventory: House,
  'property-map': Map, 'live-status': Activity, taxonomy: Network, emails: Mail,
  calls: Phone, 'my-profile': UserRound, 'my-team': Users, partners: Handshake,
  team: Users, reports: ChartNoAxesCombined, 'ai-dashboard': Bot,
  'agent-logs': ScrollText, override: ShieldCheck, workflows: Workflow,
  marketing: Megaphone, analytics: ChartNoAxesCombined, 'buyer-chat': Search,
};

export function NavigationIcon({ view, size = 18 }: { view: string; size?: number }) {
  const Icon = icons[view] || House;
  return <Icon size={size} strokeWidth={1.7} aria-hidden="true" style={{ flexShrink: 0 }} />;
}
