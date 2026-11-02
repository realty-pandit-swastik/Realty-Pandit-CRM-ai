import { Fragment } from 'react';
import { Ban, KeyRound, Sofa, Construction, BriefcaseBusiness, Lightbulb, Ruler, Bath, ThumbsDown, ThumbsUp, Video, X, Circle } from 'lucide-react';
import { Phone, PhoneOff, CalendarDays, Clock3, Users, Camera, House, Target, Zap, ChartNoAxesCombined, CheckCircle2, IndianRupee, Dot, Send, Flame, Snowflake, Search, Building2, Plus, MapPin, BedDouble, NotebookPen, Thermometer, CircleAlert, Info, Handshake, MessageCircle, Mail, Globe, Link, Save, RefreshCw, FolderOpen, Eye, Settings, LockKeyhole, Bot, UserRound, ArrowRight, Play, Pause, ClipboardList, Repeat2, Download, Trash2, Pencil, Bell, FileText, Image, Paperclip, Tag, Hammer, type LucideIcon } from 'lucide-react';

// Compatibility keys are descriptive strings, never rendered glyphs. Existing UI-only labels
// can retain their meaning while using the same outline set as navigation.
const icons: Record<string, LucideIcon> = {
  phone: Phone, 'phone-off': PhoneOff, calendar: CalendarDays, clock: Clock3,
  camera: Camera, users: Users, 'check-circle': CheckCircle2,
  'indian-rupee': IndianRupee, zap: Zap, house: House, target: Target, 'chart-no-axes-combined': ChartNoAxesCombined,
  send: Send, flame: Flame, snowflake: Snowflake, thermometer: Thermometer,
  'check-circle-2': CheckCircle2,
  'building-2': Building2, plus: Plus,
  'check-circle-3': CheckCircle2,
  'chart-no-axes-combined-2': ChartNoAxesCombined,
  search: Search,
  'user-round': UserRound, info: Info, 'circle-alert': CircleAlert, 'map-pin': MapPin,
  handshake: Handshake, 'message-circle': MessageCircle, mail: Mail, globe: Globe,
  'link': Link, save: Save, 'refresh-cw': RefreshCw, 'folder-open': FolderOpen,
  eye: Eye, settings: Settings, 'lock-keyhole': LockKeyhole,
  bot: Bot, 'arrow-right': ArrowRight, play: Play, pause: Pause,
  'clipboard-list': ClipboardList, 'calendar-days': CalendarDays,
  'repeat': Repeat2, download: Download, 'trash-2': Trash2, pencil: Pencil,
  bell: Bell, 'file-text': FileText, image: Image, paperclip: Paperclip,
  tag: Tag, hammer: Hammer,
  sofa: Sofa, 'key-round': KeyRound, construction: Construction, 'briefcase-business': BriefcaseBusiness,
  ban: Ban, 'thumbs-up': ThumbsUp, 'thumbs-down': ThumbsDown, x: X, circle: Circle,
  lightbulb: Lightbulb, 'bed-double': BedDouble, bath: Bath, ruler: Ruler,
  video: Video, 'notebook-pen': NotebookPen,
};

export function PresentationIcon({ value, size = 16 }: { value: string; size?: number }) {
  const Icon = icons[value] || Dot;
  return <Icon size={size} strokeWidth={1.7} aria-hidden="true" style={{ verticalAlign: 'middle', flexShrink: 0 }} />;
}

const glyph = /(\p{Extended_Pictographic}(?:\uFE0F|\p{Emoji_Modifier})?(?:\u200D\p{Extended_Pictographic}(?:\uFE0F|\p{Emoji_Modifier})?)*)/gu;

/** Presentation-only adapter for application-authored labels. Do not use for
 * customer messages, provider payloads, submitted values, or other business data. */
export function IconText({ children }: { children: string }) {
  return <>{children.split(glyph).map((part, i) => <Fragment key={i}>{i % 2 ? <PresentationIcon value={part} /> : part}</Fragment>)}</>;
}
