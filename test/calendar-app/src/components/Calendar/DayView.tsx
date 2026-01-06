import {
  format,
  startOfDay,
  endOfDay,
  getHours,
  getMinutes,
  isToday,
} from 'date-fns';
import { ko } from 'date-fns/locale';
import type { Schedule } from '../../types';
import { SCHEDULE_COLORS } from '../../types';

interface DayViewProps {
  currentDate: Date;
  schedules: Schedule[];
  onTimeClick: (date: Date, hour: number) => void;
  onScheduleClick: (schedule: Schedule) => void;
}

export function DayView({
  currentDate,
  schedules,
  onTimeClick,
  onScheduleClick,
}: DayViewProps) {
  // 시간대 생성 (0시 ~ 23시)
  const hours = Array.from({ length: 24 }, (_, i) => i);
  const today = isToday(currentDate);

  // 해당 날짜의 스케줄 가져오기
  const getSchedulesForDate = (): Schedule[] => {
    return schedules.filter((schedule) => {
      const scheduleStart = new Date(schedule.startDate);
      const scheduleEnd = new Date(schedule.endDate);
      const dayStart = startOfDay(currentDate);
      const dayEnd = endOfDay(currentDate);

      return scheduleStart <= dayEnd && scheduleEnd >= dayStart;
    });
  };

  // 스케줄 위치 계산
  const getSchedulePosition = (schedule: Schedule) => {
    const scheduleStart = new Date(schedule.startDate);
    const scheduleEnd = new Date(schedule.endDate);
    const dayStart = startOfDay(currentDate);
    const dayEnd = endOfDay(currentDate);

    const effectiveStart = scheduleStart < dayStart ? dayStart : scheduleStart;
    const effectiveEnd = scheduleEnd > dayEnd ? dayEnd : scheduleEnd;

    const startMinutes =
      getHours(effectiveStart) * 60 + getMinutes(effectiveStart);
    const endMinutes = getHours(effectiveEnd) * 60 + getMinutes(effectiveEnd);
    const duration = endMinutes - startMinutes;

    return {
      top: `${(startMinutes / 1440) * 100}%`,
      height: `${Math.max((duration / 1440) * 100, 3)}%`,
    };
  };

  const daySchedules = getSchedulesForDate();
  const dayOfWeek = currentDate.getDay();

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* 날짜 헤더 */}
      <div className="flex items-center justify-center py-4 border-b border-slate-100 bg-white">
        <div className="text-center">
          <div
            className={`text-sm font-medium ${
              dayOfWeek === 0
                ? 'text-rose-400'
                : dayOfWeek === 6
                ? 'text-indigo-400'
                : 'text-slate-500'
            }`}
          >
            {format(currentDate, 'EEEE', { locale: ko })}
          </div>
          <div
            className={`
              mt-1 w-12 h-12 mx-auto flex items-center justify-center rounded-full text-2xl font-bold
              ${today ? 'bg-slate-900 text-white' : 'text-slate-700'}
            `}
          >
            {format(currentDate, 'd')}
          </div>
        </div>
      </div>

      {/* 시간 그리드 */}
      <div className="flex-1 flex overflow-y-auto">
        {/* 시간 레이블 */}
        <div className="w-20 flex-shrink-0 bg-white">
          {hours.map((hour) => (
            <div
              key={hour}
              className="h-16 border-b border-slate-50 pr-3 flex items-start justify-end"
            >
              <span className="text-sm text-slate-400 -mt-2">
                {hour === 0 ? '' : `${hour.toString().padStart(2, '0')}:00`}
              </span>
            </div>
          ))}
        </div>

        {/* 일정 영역 */}
        <div
          className="flex-1 relative border-l border-slate-100"
          onClick={(e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            const y = e.clientY - rect.top;
            const hour = Math.floor((y / rect.height) * 24);
            onTimeClick(currentDate, hour);
          }}
        >
          {/* 시간 그리드 라인 */}
          {hours.map((hour) => (
            <div
              key={hour}
              className="h-16 border-b border-slate-50 hover:bg-slate-50/50 cursor-pointer transition-colors"
            />
          ))}

          {/* 현재 시간 표시 (오늘인 경우) */}
          {today && (
            <div
              className="absolute left-0 right-0 h-0.5 bg-rose-400 z-20"
              style={{
                top: `${((new Date().getHours() * 60 + new Date().getMinutes()) / 1440) * 100}%`,
              }}
            >
              <div className="absolute -left-1 -top-1.5 w-3 h-3 rounded-full bg-rose-400" />
            </div>
          )}

          {/* 스케줄 표시 */}
          <div className="absolute inset-0 pointer-events-none px-2">
            {daySchedules.map((schedule) => {
              const position = getSchedulePosition(schedule);
              const colors = SCHEDULE_COLORS[schedule.color];

              return (
                <div
                  key={schedule.id}
                  onClick={(e) => {
                    e.stopPropagation();
                    onScheduleClick(schedule);
                  }}
                  className={`
                    absolute left-2 right-2 rounded-lg px-3 py-2
                    cursor-pointer pointer-events-auto overflow-hidden
                    transition-transform hover:scale-[1.01] hover:z-10
                    shadow-sm
                    ${colors.bg} ${colors.text}
                  `}
                  style={{
                    top: position.top,
                    height: position.height,
                    minHeight: '40px',
                  }}
                >
                  <div className="font-semibold truncate">{schedule.title}</div>
                  <div className="text-sm opacity-80 mt-0.5">
                    {format(new Date(schedule.startDate), 'HH:mm')} -{' '}
                    {format(new Date(schedule.endDate), 'HH:mm')}
                  </div>
                  {schedule.description && (
                    <div className="text-sm opacity-70 mt-1 line-clamp-2">
                      {schedule.description}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
