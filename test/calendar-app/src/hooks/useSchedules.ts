import { useCallback, useMemo } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { isWithinInterval, parseISO } from 'date-fns';
import type { Schedule, ScheduleFormData } from '../types';
import { useLocalStorage } from './useLocalStorage';

const STORAGE_KEY = 'calendar-schedules';

export function useSchedules() {
  const [schedules, setSchedules] = useLocalStorage<Schedule[]>(STORAGE_KEY, []);

  // Create
  const addSchedule = useCallback(
    (data: ScheduleFormData): Schedule => {
      const newSchedule: Schedule = {
        id: uuidv4(),
        ...data,
      };
      setSchedules((prev) => [...prev, newSchedule]);
      return newSchedule;
    },
    [setSchedules]
  );

  // Update
  const updateSchedule = useCallback(
    (id: string, data: Partial<ScheduleFormData>): Schedule | null => {
      let updated: Schedule | null = null;
      setSchedules((prev) =>
        prev.map((schedule) => {
          if (schedule.id === id) {
            updated = { ...schedule, ...data };
            return updated;
          }
          return schedule;
        })
      );
      return updated;
    },
    [setSchedules]
  );

  // Delete
  const deleteSchedule = useCallback(
    (id: string): void => {
      setSchedules((prev) => prev.filter((schedule) => schedule.id !== id));
    },
    [setSchedules]
  );

  // Get by ID
  const getSchedule = useCallback(
    (id: string): Schedule | undefined => {
      return schedules.find((schedule) => schedule.id === id);
    },
    [schedules]
  );

  // Get schedules in date range
  const getSchedulesInRange = useCallback(
    (start: Date, end: Date): Schedule[] => {
      return schedules.filter((schedule) => {
        const scheduleStart = parseISO(schedule.startDate);
        const scheduleEnd = parseISO(schedule.endDate);

        // 일정이 범위와 겹치는지 확인
        return (
          isWithinInterval(scheduleStart, { start, end }) ||
          isWithinInterval(scheduleEnd, { start, end }) ||
          (scheduleStart <= start && scheduleEnd >= end)
        );
      });
    },
    [schedules]
  );

  // Get schedules for a specific date
  const getSchedulesForDate = useCallback(
    (date: Date): Schedule[] => {
      const dayStart = new Date(date);
      dayStart.setHours(0, 0, 0, 0);
      const dayEnd = new Date(date);
      dayEnd.setHours(23, 59, 59, 999);

      return getSchedulesInRange(dayStart, dayEnd);
    },
    [getSchedulesInRange]
  );

  // Sorted schedules
  const sortedSchedules = useMemo(() => {
    return [...schedules].sort(
      (a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime()
    );
  }, [schedules]);

  return {
    schedules: sortedSchedules,
    addSchedule,
    updateSchedule,
    deleteSchedule,
    getSchedule,
    getSchedulesInRange,
    getSchedulesForDate,
  };
}
