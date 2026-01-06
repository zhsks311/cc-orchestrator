import { useState, useCallback } from 'react';
import {
  format,
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  isSameMonth,
  isToday,
  differenceInDays,
  addDays,
  parseISO,
  isBefore,
  isAfter,
  startOfDay,
  endOfDay,
} from 'date-fns';
import type { Schedule } from '../../types';
import { SCHEDULE_COLORS } from '../../types';

interface MonthViewProps {
  currentDate: Date;
  schedules: Schedule[];
  onDateClick: (date: Date) => void;
  onScheduleClick: (schedule: Schedule) => void;
  onMoveSchedule?: (scheduleId: string, newStartDate: Date, newEndDate: Date) => void;
  onCreateScheduleRange?: (startDate: Date, endDate: Date) => void;
}

export function MonthView({
  currentDate,
  schedules,
  onDateClick,
  onScheduleClick,
  onMoveSchedule,
  onCreateScheduleRange,
}: MonthViewProps) {
  // 드래그 상태
  const [dragOverDate, setDragOverDate] = useState<Date | null>(null);
  const [isDraggingSchedule, setIsDraggingSchedule] = useState(false);

  // 다중 날짜 선택 상태
  const [selectionStart, setSelectionStart] = useState<Date | null>(null);
  const [selectionEnd, setSelectionEnd] = useState<Date | null>(null);
  const [isSelecting, setIsSelecting] = useState(false);

  // 날짜가 선택 범위 내에 있는지 확인
  const isDateInSelection = useCallback((date: Date): boolean => {
    if (!selectionStart || !selectionEnd) return false;
    const start = isBefore(selectionStart, selectionEnd) ? selectionStart : selectionEnd;
    const end = isAfter(selectionStart, selectionEnd) ? selectionStart : selectionEnd;
    const dayStart = startOfDay(date);
    return dayStart >= startOfDay(start) && dayStart <= startOfDay(end);
  }, [selectionStart, selectionEnd]);

  // 스케줄 드래그 시작
  const handleDragStart = useCallback((e: React.DragEvent, schedule: Schedule) => {
    e.dataTransfer.setData('scheduleId', schedule.id);
    e.dataTransfer.setData('startDate', schedule.startDate);
    e.dataTransfer.setData('endDate', schedule.endDate);
    e.dataTransfer.effectAllowed = 'move';
    setIsDraggingSchedule(true);
  }, []);

  // 스케줄 드래그 종료
  const handleDragEnd = useCallback(() => {
    setIsDraggingSchedule(false);
    setDragOverDate(null);
  }, []);

  // 날짜 셀 드래그 오버
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  }, []);

  // 날짜 셀 드래그 진입
  const handleDragEnter = useCallback((e: React.DragEvent, date: Date) => {
    e.preventDefault();
    setDragOverDate(date);
  }, []);

  // 날짜 셀 드래그 이탈
  const handleDragLeave = useCallback(() => {
    setDragOverDate(null);
  }, []);

  // 날짜 셀에 드롭
  const handleDrop = useCallback((e: React.DragEvent, targetDate: Date) => {
    e.preventDefault();
    const scheduleId = e.dataTransfer.getData('scheduleId');
    const originalStartDate = e.dataTransfer.getData('startDate');
    const originalEndDate = e.dataTransfer.getData('endDate');

    if (scheduleId && originalStartDate && onMoveSchedule) {
      const daysDiff = differenceInDays(targetDate, parseISO(originalStartDate));
      const newStartDate = addDays(parseISO(originalStartDate), daysDiff);
      const newEndDate = addDays(parseISO(originalEndDate), daysDiff);
      onMoveSchedule(scheduleId, newStartDate, newEndDate);
    }

    setDragOverDate(null);
    setIsDraggingSchedule(false);
  }, [onMoveSchedule]);

  // 다중 날짜 선택 - 마우스 다운
  const handleMouseDown = useCallback((e: React.MouseEvent, date: Date) => {
    // 스케줄을 클릭한 경우 선택 시작하지 않음
    if ((e.target as HTMLElement).closest('[data-schedule]')) return;

    setSelectionStart(date);
    setSelectionEnd(date);
    setIsSelecting(true);
  }, []);

  // 다중 날짜 선택 - 마우스 이동
  const handleMouseEnter = useCallback((date: Date) => {
    if (isSelecting) {
      setSelectionEnd(date);
    }
  }, [isSelecting]);

  // 다중 날짜 선택 - 마우스 업
  const handleMouseUp = useCallback(() => {
    if (isSelecting && selectionStart && selectionEnd) {
      const start = isBefore(selectionStart, selectionEnd) ? selectionStart : selectionEnd;
      const end = isAfter(selectionStart, selectionEnd) ? selectionStart : selectionEnd;

      // 같은 날짜면 일반 클릭으로 처리
      if (differenceInDays(end, start) === 0) {
        onDateClick(start);
      } else if (onCreateScheduleRange) {
        // 다중 날짜 선택 시 범위로 일정 생성
        onCreateScheduleRange(startOfDay(start), endOfDay(end));
      }
    }

    setIsSelecting(false);
    setSelectionStart(null);
    setSelectionEnd(null);
  }, [isSelecting, selectionStart, selectionEnd, onDateClick, onCreateScheduleRange]);

  // 월간 캘린더 날짜 생성
  const generateMonthCalendar = (): Date[] => {
    const monthStart = startOfMonth(currentDate);
    const monthEnd = endOfMonth(currentDate);
    const calendarStart = startOfWeek(monthStart, { weekStartsOn: 0 });
    const calendarEnd = endOfWeek(monthEnd, { weekStartsOn: 0 });
    return eachDayOfInterval({ start: calendarStart, end: calendarEnd });
  };

  const days = generateMonthCalendar();
  const weekDays = ['일', '월', '화', '수', '목', '금', '토'];

  // 특정 날짜의 스케줄 가져오기
  const getSchedulesForDate = (date: Date): Schedule[] => {
    return schedules.filter((schedule) => {
      const scheduleStart = new Date(schedule.startDate);
      const scheduleEnd = new Date(schedule.endDate);
      const dayStart = new Date(date);
      dayStart.setHours(0, 0, 0, 0);
      const dayEnd = new Date(date);
      dayEnd.setHours(23, 59, 59, 999);

      return scheduleStart <= dayEnd && scheduleEnd >= dayStart;
    });
  };

  return (
    <div className="flex-1 flex flex-col">
      {/* 요일 헤더 */}
      <div className="grid grid-cols-7 bg-slate-50 border-b border-slate-100">
        {weekDays.map((day, index) => (
          <div
            key={day}
            className={`py-3 text-center text-sm font-medium ${
              index === 0
                ? 'text-rose-400'
                : index === 6
                ? 'text-indigo-400'
                : 'text-slate-500'
            }`}
          >
            {day}
          </div>
        ))}
      </div>

      {/* 날짜 그리드 */}
      <div
        className="flex-1 grid grid-cols-7 bg-slate-100 gap-px select-none"
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      >
        {days.map((day) => {
          const daySchedules = getSchedulesForDate(day);
          const isCurrentMonth = isSameMonth(day, currentDate);
          const today = isToday(day);
          const dayOfWeek = day.getDay();
          const isDragOver = dragOverDate && startOfDay(dragOverDate).getTime() === startOfDay(day).getTime();
          const isSelected = isDateInSelection(day);

          return (
            <div
              key={day.toISOString()}
              onMouseDown={(e) => handleMouseDown(e, day)}
              onMouseEnter={() => handleMouseEnter(day)}
              onDragOver={handleDragOver}
              onDragEnter={(e) => handleDragEnter(e, day)}
              onDragLeave={handleDragLeave}
              onDrop={(e) => handleDrop(e, day)}
              className={`
                min-h-[120px] bg-white p-2 cursor-pointer
                transition-colors duration-200
                hover:bg-slate-50
                ${!isCurrentMonth ? 'opacity-40' : ''}
                ${isDragOver ? 'bg-indigo-50 ring-2 ring-indigo-300 ring-inset' : ''}
                ${isSelected ? 'bg-indigo-100' : ''}
              `}
            >
              {/* 날짜 숫자 */}
              <div className="flex justify-center mb-1">
                <span
                  className={`
                    w-7 h-7 flex items-center justify-center text-sm font-medium rounded-full
                    ${today ? 'bg-slate-900 text-white' : ''}
                    ${
                      !today && dayOfWeek === 0
                        ? 'text-rose-400'
                        : !today && dayOfWeek === 6
                        ? 'text-indigo-400'
                        : !today
                        ? 'text-slate-700'
                        : ''
                    }
                  `}
                >
                  {format(day, 'd')}
                </span>
              </div>

              {/* 스케줄 목록 */}
              <div className="space-y-1">
                {daySchedules.slice(0, 3).map((schedule) => {
                  const colors = SCHEDULE_COLORS[schedule.color];
                  return (
                    <div
                      key={schedule.id}
                      data-schedule="true"
                      draggable
                      onDragStart={(e) => handleDragStart(e, schedule)}
                      onDragEnd={handleDragEnd}
                      onClick={(e) => {
                        e.stopPropagation();
                        onScheduleClick(schedule);
                      }}
                      className={`
                        px-2 py-0.5 text-xs rounded truncate cursor-grab
                        transition-all hover:scale-[1.02]
                        active:cursor-grabbing active:opacity-70
                        ${colors.bg} ${colors.text}
                        ${isDraggingSchedule ? 'pointer-events-none' : ''}
                      `}
                    >
                      {schedule.title}
                    </div>
                  );
                })}
                {daySchedules.length > 3 && (
                  <div className="text-xs text-slate-400 text-center">
                    +{daySchedules.length - 3}개 더보기
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
