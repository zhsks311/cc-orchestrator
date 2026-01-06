import { format } from 'date-fns';
import { ko } from 'date-fns/locale';
import type { Schedule } from '../../types';
import { SCHEDULE_COLORS } from '../../types';

interface ScheduleItemProps {
  schedule: Schedule;
  onClick?: () => void;
  compact?: boolean;
}

export function ScheduleItem({
  schedule,
  onClick,
  compact = false,
}: ScheduleItemProps) {
  const colors = SCHEDULE_COLORS[schedule.color];
  const startDate = new Date(schedule.startDate);
  const endDate = new Date(schedule.endDate);

  if (compact) {
    return (
      <div
        onClick={onClick}
        className={`
          px-2 py-0.5 text-xs rounded truncate cursor-pointer
          transition-transform hover:scale-[1.02]
          ${colors.bg} ${colors.text}
        `}
      >
        {schedule.title}
      </div>
    );
  }

  return (
    <div
      onClick={onClick}
      className={`
        p-3 rounded-lg cursor-pointer
        transition-all hover:scale-[1.01] hover:shadow-md
        ${colors.bg} ${colors.text}
      `}
    >
      <div className="font-semibold">{schedule.title}</div>
      <div className="text-sm opacity-80 mt-1">
        {format(startDate, 'M월 d일 (E) HH:mm', { locale: ko })} -{' '}
        {format(endDate, 'HH:mm')}
      </div>
      {schedule.description && (
        <div className="text-sm opacity-70 mt-2 line-clamp-2">
          {schedule.description}
        </div>
      )}
    </div>
  );
}
