import { useState, useCallback } from 'react';
import { Calendar } from './components/Calendar';
import { ScheduleModal } from './components/Schedule/ScheduleModal';
import { useSchedules } from './hooks/useSchedules';
import type { Schedule, ScheduleFormData } from './types';
import './index.css';

function App() {
  const {
    schedules,
    addSchedule,
    updateSchedule,
    deleteSchedule,
  } = useSchedules();

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedSchedule, setSelectedSchedule] = useState<Schedule | null>(null);
  const [initialDate, setInitialDate] = useState<Date | null>(null);
  const [initialEndDate, setInitialEndDate] = useState<Date | null>(null);

  // 새 일정 추가 모달 열기
  const handleAddEvent = useCallback((date?: Date) => {
    setSelectedSchedule(null);
    setInitialDate(date || null);
    setInitialEndDate(null);
    setIsModalOpen(true);
  }, []);

  // 일정 이동 (드래그 앤 드롭)
  const handleMoveSchedule = useCallback(
    (scheduleId: string, newStartDate: Date, newEndDate: Date) => {
      updateSchedule(scheduleId, {
        startDate: newStartDate.toISOString(),
        endDate: newEndDate.toISOString(),
      });
    },
    [updateSchedule]
  );

  // 다중 날짜 범위로 일정 생성
  const handleCreateScheduleRange = useCallback((startDate: Date, endDate: Date) => {
    setSelectedSchedule(null);
    setInitialDate(startDate);
    setInitialEndDate(endDate);
    setIsModalOpen(true);
  }, []);

  // 일정 수정 모달 열기
  const handleEditEvent = useCallback((schedule: Schedule) => {
    setSelectedSchedule(schedule);
    setInitialDate(null);
    setIsModalOpen(true);
  }, []);

  // 일정 저장 (추가/수정)
  const handleSaveSchedule = useCallback(
    (data: ScheduleFormData) => {
      if (selectedSchedule) {
        updateSchedule(selectedSchedule.id, data);
      } else {
        addSchedule(data);
      }
    },
    [selectedSchedule, addSchedule, updateSchedule]
  );

  // 일정 삭제
  const handleDeleteSchedule = useCallback(() => {
    if (selectedSchedule) {
      deleteSchedule(selectedSchedule.id);
    }
  }, [selectedSchedule, deleteSchedule]);

  // 모달 닫기
  const handleCloseModal = useCallback(() => {
    setIsModalOpen(false);
    setSelectedSchedule(null);
    setInitialDate(null);
    setInitialEndDate(null);
  }, []);

  return (
    <div className="min-h-screen bg-slate-50 p-4 md:p-8">
      <div className="max-w-7xl mx-auto h-[calc(100vh-4rem)]">
        <Calendar
          schedules={schedules}
          onAddEvent={handleAddEvent}
          onEditEvent={handleEditEvent}
          onMoveSchedule={handleMoveSchedule}
          onCreateScheduleRange={handleCreateScheduleRange}
        />
      </div>

      <ScheduleModal
        isOpen={isModalOpen}
        onClose={handleCloseModal}
        onSave={handleSaveSchedule}
        onDelete={selectedSchedule ? handleDeleteSchedule : undefined}
        schedule={selectedSchedule}
        initialDate={initialDate}
        initialEndDate={initialEndDate}
      />
    </div>
  );
}

export default App;
