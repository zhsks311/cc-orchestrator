import { useState, useEffect } from 'react';
import { format } from 'date-fns';
import { Modal } from '../UI/Modal';
import { Button } from '../UI/Button';
import type { Schedule, ScheduleFormData, ScheduleColor } from '../../types';
import { SCHEDULE_COLORS } from '../../types';

interface ScheduleModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (data: ScheduleFormData) => void;
  onDelete?: () => void;
  schedule?: Schedule | null;
  initialDate?: Date | null;
  initialEndDate?: Date | null;
}

const COLOR_OPTIONS: ScheduleColor[] = [
  'blue',
  'green',
  'red',
  'yellow',
  'purple',
  'pink',
  'indigo',
  'orange',
];

export function ScheduleModal({
  isOpen,
  onClose,
  onSave,
  onDelete,
  schedule,
  initialDate,
  initialEndDate,
}: ScheduleModalProps) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [startDate, setStartDate] = useState('');
  const [startTime, setStartTime] = useState('09:00');
  const [endDate, setEndDate] = useState('');
  const [endTime, setEndTime] = useState('10:00');
  const [color, setColor] = useState<ScheduleColor>('blue');

  // 폼 초기화
  useEffect(() => {
    if (isOpen) {
      if (schedule) {
        // 수정 모드
        setTitle(schedule.title);
        setDescription(schedule.description || '');
        const start = new Date(schedule.startDate);
        const end = new Date(schedule.endDate);
        setStartDate(format(start, 'yyyy-MM-dd'));
        setStartTime(format(start, 'HH:mm'));
        setEndDate(format(end, 'yyyy-MM-dd'));
        setEndTime(format(end, 'HH:mm'));
        setColor(schedule.color);
      } else if (initialDate && initialEndDate) {
        // 새 일정 (다중 날짜 범위 선택)
        setTitle('');
        setDescription('');
        setStartDate(format(initialDate, 'yyyy-MM-dd'));
        setStartTime('09:00');
        setEndDate(format(initialEndDate, 'yyyy-MM-dd'));
        setEndTime('18:00');
        setColor('blue');
      } else if (initialDate) {
        // 새 일정 (단일 날짜 지정)
        setTitle('');
        setDescription('');
        setStartDate(format(initialDate, 'yyyy-MM-dd'));
        setStartTime(format(initialDate, 'HH:mm'));
        const endDateTime = new Date(initialDate);
        endDateTime.setHours(endDateTime.getHours() + 1);
        setEndDate(format(endDateTime, 'yyyy-MM-dd'));
        setEndTime(format(endDateTime, 'HH:mm'));
        setColor('blue');
      } else {
        // 새 일정 (기본)
        const now = new Date();
        setTitle('');
        setDescription('');
        setStartDate(format(now, 'yyyy-MM-dd'));
        setStartTime('09:00');
        setEndDate(format(now, 'yyyy-MM-dd'));
        setEndTime('10:00');
        setColor('blue');
      }
    }
  }, [isOpen, schedule, initialDate, initialEndDate]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!title.trim()) {
      alert('제목을 입력해주세요.');
      return;
    }

    const startDateTime = new Date(`${startDate}T${startTime}`);
    const endDateTime = new Date(`${endDate}T${endTime}`);

    if (endDateTime <= startDateTime) {
      alert('종료 시간은 시작 시간 이후여야 합니다.');
      return;
    }

    onSave({
      title: title.trim(),
      description: description.trim() || undefined,
      startDate: startDateTime.toISOString(),
      endDate: endDateTime.toISOString(),
      color,
    });

    onClose();
  };

  const isEditMode = !!schedule;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={isEditMode ? '일정 수정' : '새 일정'}
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* 제목 */}
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">
            제목
          </label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-400 transition-colors"
            placeholder="일정 제목을 입력하세요"
            autoFocus
          />
        </div>

        {/* 설명 */}
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">
            설명
          </label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
            className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-400 transition-colors resize-none"
            placeholder="일정에 대한 설명 (선택사항)"
          />
        </div>

        {/* 시작 날짜/시간 */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              시작 날짜
            </label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-400 transition-colors"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              시작 시간
            </label>
            <input
              type="time"
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-400 transition-colors"
            />
          </div>
        </div>

        {/* 종료 날짜/시간 */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              종료 날짜
            </label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-400 transition-colors"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              종료 시간
            </label>
            <input
              type="time"
              value={endTime}
              onChange={(e) => setEndTime(e.target.value)}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-400 transition-colors"
            />
          </div>
        </div>

        {/* 색상 선택 */}
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-2">
            색상
          </label>
          <div className="flex gap-2">
            {COLOR_OPTIONS.map((c) => {
              const colors = SCHEDULE_COLORS[c];
              return (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColor(c)}
                  className={`
                    w-8 h-8 rounded-full transition-all
                    ${colors.bg}
                    ${
                      color === c
                        ? 'ring-2 ring-offset-2 ring-slate-400 scale-110'
                        : 'hover:scale-105'
                    }
                  `}
                />
              );
            })}
          </div>
        </div>

        {/* 버튼 */}
        <div className="flex justify-between pt-2">
          {isEditMode && onDelete ? (
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                if (confirm('정말 이 일정을 삭제하시겠습니까?')) {
                  onDelete();
                  onClose();
                }
              }}
              className="text-rose-500 hover:text-rose-600 hover:bg-rose-50"
            >
              삭제
            </Button>
          ) : (
            <div />
          )}

          <div className="flex gap-2">
            <Button type="button" variant="secondary" onClick={onClose}>
              취소
            </Button>
            <Button type="submit">{isEditMode ? '수정' : '저장'}</Button>
          </div>
        </div>
      </form>
    </Modal>
  );
}
