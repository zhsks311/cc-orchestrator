import { useState, useCallback } from 'react';
import {
  addMonths,
  subMonths,
  addWeeks,
  subWeeks,
  addDays,
  subDays,
} from 'date-fns';
import type { ViewMode, Schedule } from '../../types';
import { CalendarHeader } from './CalendarHeader';
import { MonthView } from './MonthView';
import { WeekView } from './WeekView';
import { DayView } from './DayView';

interface CalendarProps {
  schedules: Schedule[];
  onAddEvent: (date?: Date) => void;
  onEditEvent: (schedule: Schedule) => void;
  onMoveSchedule?: (scheduleId: string, newStartDate: Date, newEndDate: Date) => void;
  onCreateScheduleRange?: (startDate: Date, endDate: Date) => void;
}

export function Calendar({ schedules, onAddEvent, onEditEvent, onMoveSchedule, onCreateScheduleRange }: CalendarProps) {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [viewMode, setViewMode] = useState<ViewMode>('month');

  // 이전으로 이동
  const handlePrev = useCallback(() => {
    switch (viewMode) {
      case 'month':
        setCurrentDate((prev) => subMonths(prev, 1));
        break;
      case 'week':
        setCurrentDate((prev) => subWeeks(prev, 1));
        break;
      case 'day':
        setCurrentDate((prev) => subDays(prev, 1));
        break;
    }
  }, [viewMode]);

  // 다음으로 이동
  const handleNext = useCallback(() => {
    switch (viewMode) {
      case 'month':
        setCurrentDate((prev) => addMonths(prev, 1));
        break;
      case 'week':
        setCurrentDate((prev) => addWeeks(prev, 1));
        break;
      case 'day':
        setCurrentDate((prev) => addDays(prev, 1));
        break;
    }
  }, [viewMode]);

  // 오늘로 이동
  const handleToday = useCallback(() => {
    setCurrentDate(new Date());
  }, []);

  // 날짜 클릭 핸들러
  const handleDateClick = useCallback(
    (date: Date) => {
      if (viewMode === 'month') {
        setCurrentDate(date);
        setViewMode('day');
      } else {
        onAddEvent(date);
      }
    },
    [viewMode, onAddEvent]
  );

  // 시간 클릭 핸들러 (일간 뷰)
  const handleTimeClick = useCallback(
    (date: Date, hour: number) => {
      const newDate = new Date(date);
      newDate.setHours(hour, 0, 0, 0);
      onAddEvent(newDate);
    },
    [onAddEvent]
  );

  // 스케줄 클릭 핸들러
  const handleScheduleClick = useCallback(
    (schedule: Schedule) => {
      onEditEvent(schedule);
    },
    [onEditEvent]
  );

  // 뷰 렌더링
  const renderView = () => {
    switch (viewMode) {
      case 'month':
        return (
          <MonthView
            currentDate={currentDate}
            schedules={schedules}
            onDateClick={handleDateClick}
            onScheduleClick={handleScheduleClick}
            onMoveSchedule={onMoveSchedule}
            onCreateScheduleRange={onCreateScheduleRange}
          />
        );
      case 'week':
        return (
          <WeekView
            currentDate={currentDate}
            schedules={schedules}
            onDateClick={handleDateClick}
            onScheduleClick={handleScheduleClick}
            onMoveSchedule={onMoveSchedule}
            onCreateScheduleRange={onCreateScheduleRange}
          />
        );
      case 'day':
        return (
          <DayView
            currentDate={currentDate}
            schedules={schedules}
            onTimeClick={handleTimeClick}
            onScheduleClick={handleScheduleClick}
          />
        );
    }
  };

  return (
    <div className="h-full flex flex-col bg-white rounded-2xl shadow-[0_20px_50px_-12px_rgba(0,0,0,0.03)] overflow-hidden border border-slate-100">
      <CalendarHeader
        currentDate={currentDate}
        viewMode={viewMode}
        onPrev={handlePrev}
        onNext={handleNext}
        onToday={handleToday}
        onViewModeChange={setViewMode}
        onAddEvent={() => onAddEvent()}
      />
      {renderView()}
    </div>
  );
}
