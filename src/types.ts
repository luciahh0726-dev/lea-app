import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export type TaskStatus = 'todo' | 'done';

export interface StudyTask {
  id: string;
  name: string;
  repeatDays: number[]; // 0-6 for Sun-Sat
  completedDates: string[]; // Array of ISO date strings (YYYY-MM-DD)
}

export interface StudyStage {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  tasks: StudyTask[];
  isCompleted: boolean;
}

export interface StudyProject {
  id: string;
  name: string;
  stages: StudyStage[];
  currentStageId?: string;
}

export interface LifeHabit {
  id: string;
  name: string;
  targetPerDay: number;
  checkIns: string[]; // Array of ISO date strings
  streak: number;
  totalCount: number;
}

export interface WorkEvent {
  id: string;
  title: string;
  date: string; // ISO date string (YYYY-MM-DD)
  startTime?: string; // HH:mm
  endTime?: string;
  isAllDay: boolean;
  isDone: boolean;
}

export interface TempTask {
  id: string;
  name: string;
  deadline: string; // ISO string
  note?: string;
  isDone: boolean;
  completedAt?: string; // ISO string
}

export interface DailyReview {
  date: string; // YYYY-MM-DD
  aiFeedback: string;
  userThoughts: string;
}

export interface AppState {
  studyProjects: StudyProject[];
  lifeHabits: LifeHabit[];
  workEvents: WorkEvent[];
  tempTasks: TempTask[];
  dailyReviews: DailyReview[];
}
