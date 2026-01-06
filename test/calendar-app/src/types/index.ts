export interface Schedule {
  id: string;
  title: string;
  description?: string;
  startDate: string;  // ISO 8601 format
  endDate: string;    // ISO 8601 format
  color: ScheduleColor;
}

export type ViewMode = 'day' | 'week' | 'month';

export type ScheduleColor =
  | 'blue'
  | 'green'
  | 'red'
  | 'yellow'
  | 'purple'
  | 'pink'
  | 'indigo'
  | 'orange';

export const SCHEDULE_COLORS: Record<ScheduleColor, { bg: string; text: string }> = {
  blue: { bg: 'bg-blue-500', text: 'text-white' },
  green: { bg: 'bg-green-500', text: 'text-white' },
  red: { bg: 'bg-red-500', text: 'text-white' },
  yellow: { bg: 'bg-yellow-400', text: 'text-gray-900' },
  purple: { bg: 'bg-purple-500', text: 'text-white' },
  pink: { bg: 'bg-pink-500', text: 'text-white' },
  indigo: { bg: 'bg-indigo-500', text: 'text-white' },
  orange: { bg: 'bg-orange-500', text: 'text-white' },
};

export interface ScheduleFormData {
  title: string;
  description?: string;
  startDate: string;
  endDate: string;
  color: ScheduleColor;
}
