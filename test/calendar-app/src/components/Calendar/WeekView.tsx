import { useState, useCallback } from 'react';
import {
  format,
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  startOfDay,
  endOfDay,
  isToday,
  getHours,
  getMinutes,
  differenceInDays,
  addDays,
  parseISO,
  isBefore,
  isAfter,
} from 'date-fns';
import { ko } from 'date-fns/locale';
import type { Schedule } from '../../types';
import { SCHEDULE_COLORS } from '../../types';

interface WeekViewProps {
  currentDate: Date;
  schedules: Schedule[];
  onDateClick: (date: Date) => void;
  onScheduleClick: (schedule: Schedule) => void;
  onMoveSchedule?: (scheduleId: string, newStartDate: Date, newEndDate: Date) => void;
  onCreateScheduleRange?: (startDate: Date, endDate: Date) => void;
}

export function WeekView({
  currentDate,
  schedules,
  onDateClick,
  onScheduleClick,
  onMoveSchedule,
  onCreateScheduleRange,
}: WeekViewProps) {
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

      if (differenceInDays(end, start) === 0) {
        onDateClick(start);
      } else if (onCreateScheduleRange) {
        onCreateScheduleRange(startOfDay(start), endOfDay(end));
      }
    }

    setIsSelecting(false);
    setSelectionStart(null);
    setSelectionEnd(null);
  }, [isSelecting, selectionStart, selectionEnd, onDateClick, onCreateScheduleRange]);
  // 주간 날짜 생성
  const weekStart = startOfWeek(currentDate, { weekStartsOn: 0 });
  const weekEnd = endOfWeek(currentDate, { weekStartsOn: 0 });
  const days = eachDayOfInterval({ start: weekStart, end: weekEnd });

  // 시간대 생성 (0시 ~ 23시)
  const hours = Array.from({ length: 24 }, (_, i) => i);

  // 특정 날짜의 스케줄 가져오기
  const getSchedulesForDate = (date: Date): Schedule[] => {
    return schedules.filter((schedule) => {
      const scheduleStart = new Date(schedule.startDate);
      const scheduleEnd = new Date(schedule.endDate);
      const dayStart = startOfDay(date);
      const dayEnd = endOfDay(date);

      return scheduleStart <= dayEnd && scheduleEnd >= dayStart;
    });
  };

  // 스케줄 위치 계산
  const getSchedulePosition = (schedule: Schedule, date: Date) => {
    const scheduleStart = new Date(schedule.startDate);
    const scheduleEnd = new Date(schedule.endDate);
    const dayStart = startOfDay(date);
    const dayEnd = endOfDay(date);

    const effectiveStart = scheduleStart < dayStart ? dayStart : scheduleStart;
    const effectiveEnd = scheduleEnd > dayEnd ? dayEnd : scheduleEnd;

    const startMinutes =
      getHours(effectiveStart) * 60 + getMinutes(effectiveStart);
    const endMinutes = getHours(effectiveEnd) * 60 + getMinutes(effectiveEnd);
    const duration = endMinutes - startMinutes;

    return {
      top: `${(startMinutes / 1440) * 100}%`,
      height: `${Math.max((duration / 1440) * 100, 2)}%`,
    };
  };

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* 요일 헤더 */}
      <div className="flex border-b border-slate-100 bg-white sticky top-0 z-10">
        {/* 시간 열 공간 */}
        <div className="w-16 flex-shrink-0" />

        {/* 요일 */}
        <div className="flex-1 grid grid-cols-7">
          {days.map((day) => {
            const today = isToday(day);
            const dayOfWeek = day.getDay();

            return (
              <div
                key={day.toISOString()}
                className="py-3 text-center border-l border-slate-100 first:border-l-0"
              >
                <div
                  className={`text-xs font-medium ${
                    dayOfWeek === 0
                      ? 'text-rose-400'
                      : dayOfWeek === 6
                      ? 'text-indigo-400'
                      : 'text-slate-500'
                  }`}
                >
                  {format(day, 'EEE', { locale: ko })}
                </div>
                <div
                  className={`
                    mt-1 w-8 h-8 mx-auto flex items-center justify-center rounded-full text-lg font-semibold
                    ${today ? 'bg-slate-900 text-white' : 'text-slate-700'}
                  `}
                >
                  {format(day, 'd')}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* 시간 그리드 */}
      <div
        className="flex-1 flex overflow-y-auto select-none"
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      >
        {/* 시간 레이블 */}
        <div className="w-16 flex-shrink-0 bg-white">
          {hours.map((hour) => (
            <div
              key={hour}
              className="h-14 border-b border-slate-50 pr-2 flex items-start justify-end"
            >
              <span className="text-xs text-slate-400 -mt-2">
                {hour === 0 ? '' : `${hour.toString().padStart(2, '0')}:00`}
              </span>
            </div>
          ))}
        </div>

        {/* 날짜 열 */}
        <div className="flex-1 grid grid-cols-7">
          {days.map((day) => {
            const daySchedules = getSchedulesForDate(day);
            const isDragOver = dragOverDate && startOfDay(dragOverDate).getTime() === startOfDay(day).getTime();
            const isSelected = isDateInSelection(day);

            return (
              <div
                key={day.toISOString()}
                className={`relative border-l border-slate-100 first:border-l-0 ${isDragOver ? 'bg-indigo-50' : ''} ${isSelected ? 'bg-indigo-100' : ''}`}
                onMouseDown={(e) => handleMouseDown(e, day)}
                onMouseEnter={() => handleMouseEnter(day)}
                onDragOver={handleDragOver}
                onDragEnter={(e) => handleDragEnter(e, day)}
                onDrop={(e) => handleDrop(e, day)}
              >
                {/* 시간 그리드 라인 */}
                {hours.map((hour) => (
                  <div
                    key={hour}
                    className="h-14 border-b border-slate-50 hover:bg-slate-50/50 cursor-pointer transition-colors"
                  />
                ))}

                {/* 스케줄 표시 */}
                <div className="absolute inset-0 pointer-events-none">
                  {daySchedules.map((schedule) => {
                    const position = getSchedulePosition(schedule, day);
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
                          absolute left-1 right-1 rounded px-1.5 py-0.5
                          text-xs truncate cursor-grab pointer-events-auto
                          transition-all hover:scale-[1.02] hover:z-10
                          active:cursor-grabbing active:opacity-70
                          ${colors.bg} ${colors.text}
                          ${isDraggingSchedule ? 'pointer-events-none' : ''}
                        `}
                        style={{
                          top: position.top,
                          height: position.height,
                          minHeight: '20px',
                        }}
                      >
                        <div className="font-medium truncate">
                          {schedule.title}
                        </div>
                        <div className="text-[10px] opacity-80 truncate">
                          {format(new Date(schedule.startDate), 'HH:mm')}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
