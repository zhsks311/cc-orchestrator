import { format, getWeek } from 'date-fns';
import { ko } from 'date-fns/locale';
import type { ViewMode } from '../../types';
import { Button } from '../UI/Button';

interface CalendarHeaderProps {
  currentDate: Date;
  viewMode: ViewMode;
  onPrev: () => void;
  onNext: () => void;
  onToday: () => void;
  onViewModeChange: (mode: ViewMode) => void;
  onAddEvent: () => void;
}

export function CalendarHeader({
  currentDate,
  viewMode,
  onPrev,
  onNext,
  onToday,
  onViewModeChange,
  onAddEvent,
}: CalendarHeaderProps) {
  const getTitle = () => {
    switch (viewMode) {
      case 'month':
        return format(currentDate, 'yyyy년 M월', { locale: ko });
      case 'week': {
        const weekNum = getWeek(currentDate, { weekStartsOn: 0 });
        return `${format(currentDate, 'yyyy년 M월', { locale: ko })} ${weekNum}주차`;
      }
      case 'day':
        return format(currentDate, 'yyyy년 M월 d일 (E)', { locale: ko });
    }
  };

  return (
    <header className="flex flex-col md:flex-row items-center justify-between px-8 py-6 border-b border-slate-50">
      {/* Title & Navigation */}
      <div className="flex items-center gap-6">
        <h1 className="text-3xl font-bold text-slate-900 tracking-tight">
          {getTitle()}
        </h1>

        <div className="flex items-center gap-1 bg-slate-50 rounded-full p-1 border border-slate-100">
          <button
            onClick={onPrev}
            className="p-2 rounded-full hover:bg-white hover:shadow-sm text-slate-400 hover:text-slate-800 transition-all duration-300"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <button
            onClick={onToday}
            className="px-3 py-1 text-sm font-medium text-slate-600 hover:text-slate-900 transition-colors"
          >
            오늘
          </button>
          <button
            onClick={onNext}
            className="p-2 rounded-full hover:bg-white hover:shadow-sm text-slate-400 hover:text-slate-800 transition-all duration-300"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-4 mt-4 md:mt-0">
        {/* View Switcher */}
        <div className="flex bg-slate-50 p-1 rounded-xl border border-slate-100">
          {(['month', 'week', 'day'] as ViewMode[]).map((mode) => (
            <button
              key={mode}
              onClick={() => onViewModeChange(mode)}
              className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all ${
                viewMode === mode
                  ? 'bg-white text-slate-800 shadow-sm'
                  : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              {mode === 'month' ? '월' : mode === 'week' ? '주' : '일'}
            </button>
          ))}
        </div>

        {/* Add Event Button */}
        <Button onClick={onAddEvent} className="flex items-center gap-2">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
          </svg>
          <span>일정 추가</span>
        </Button>
      </div>
    </header>
  );
}
