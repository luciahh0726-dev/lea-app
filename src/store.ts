import { useState, useEffect } from 'react';
import { AppState, StudyProject, LifeHabit, WorkEvent, TempTask } from './types';
import { isSameDay, parseISO, format } from 'date-fns';

const STORAGE_KEY = 'dualtrack_schedule_data';

const INITIAL_STATE: AppState = {
  studyProjects: [],
  lifeHabits: [],
  workEvents: [],
  tempTasks: [],
  dailyReviews: [],
};

export function useScheduleStore() {
  const [state, setState] = useState<AppState>(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        return {
          ...INITIAL_STATE,
          ...parsed,
          dailyReviews: parsed.dailyReviews || []
        };
      } catch (e) {
        console.error('Failed to parse saved data', e);
      }
    }
    return INITIAL_STATE;
  });

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }, [state]);

  // Study Actions
  const addStudyProject = (name: string) => {
    const newProject: StudyProject = {
      id: crypto.randomUUID(),
      name,
      stages: [],
    };
    setState(prev => ({ ...prev, studyProjects: [...prev.studyProjects, newProject] }));
  };

  const addStudyStage = (projectId: string, stage: Omit<StudyProject['stages'][0], 'id' | 'tasks' | 'isCompleted'>) => {
    const newStageId = crypto.randomUUID();
    setState(prev => ({
      ...prev,
      studyProjects: prev.studyProjects.map(p => {
        if (p.id !== projectId) return p;
        const newStage = { ...stage, id: newStageId, tasks: [], isCompleted: false };
        return {
          ...p,
          stages: [...p.stages, newStage],
          currentStageId: p.currentStageId || newStage.id
        };
      })
    }));
    return newStageId;
  };

  const addStudyTask = (projectId: string, stageId: string, name: string, repeatDays: number[]) => {
    setState(prev => ({
      ...prev,
      studyProjects: prev.studyProjects.map(p => {
        if (p.id !== projectId) return p;
        return {
          ...p,
          stages: p.stages.map(s => {
            if (s.id !== stageId) return s;
            return {
              ...s,
              tasks: [...s.tasks, { id: crypto.randomUUID(), name, repeatDays, completedDates: [] }]
            };
          })
        };
      })
    }));
  };

  const toggleStudyTask = (projectId: string, stageId: string, taskId: string, dateStr?: string) => {
    const targetDate = dateStr || format(new Date(), 'yyyy-MM-dd');
    setState(prev => ({
      ...prev,
      studyProjects: prev.studyProjects.map(p => {
        if (p.id !== projectId) return p;
        return {
          ...p,
          stages: p.stages.map(s => {
            if (s.id !== stageId) return s;
            return {
              ...s,
              tasks: s.tasks.map(t => {
                if (t.id !== taskId) return t;
                const alreadyDone = t.completedDates.includes(targetDate);
                const newCompletedDates = alreadyDone 
                  ? t.completedDates.filter(d => d !== targetDate)
                  : [...t.completedDates, targetDate];
                return { ...t, completedDates: newCompletedDates };
              })
            };
          })
        };
      })
    }));
  };

  const deleteStudyProject = (id: string) => {
    setState(prev => ({ ...prev, studyProjects: prev.studyProjects.filter(p => p.id !== id) }));
  };

  const deleteStudyStage = (projectId: string, stageId: string) => {
    setState(prev => ({
      ...prev,
      studyProjects: prev.studyProjects.map(p => {
        if (p.id !== projectId) return p;
        return { ...p, stages: p.stages.filter(s => s.id !== stageId) };
      })
    }));
  };

  const deleteStudyTask = (projectId: string, stageId: string, taskId: string) => {
    setState(prev => ({
      ...prev,
      studyProjects: prev.studyProjects.map(p => {
        if (p.id !== projectId) return p;
        return {
          ...p,
          stages: p.stages.map(s => {
            if (s.id !== stageId) return s;
            return { ...s, tasks: s.tasks.filter(t => t.id !== taskId) };
          })
        };
      })
    }));
  };

  // Life Actions
  const addLifeHabit = (name: string, target: number) => {
    const newHabit: LifeHabit = {
      id: crypto.randomUUID(),
      name,
      targetPerDay: target,
      checkIns: [],
      streak: 0,
      totalCount: 0,
    };
    setState(prev => ({ ...prev, lifeHabits: [...prev.lifeHabits, newHabit] }));
  };

  const deleteLifeHabit = (id: string) => {
    setState(prev => ({ ...prev, lifeHabits: prev.lifeHabits.filter(h => h.id !== id) }));
  };

  const checkInLifeHabit = (habitId: string, date: Date = new Date()) => {
    const dateStr = format(date, 'yyyy-MM-dd');
    setState(prev => ({
      ...prev,
      lifeHabits: prev.lifeHabits.map(h => {
        if (h.id !== habitId) return h;
        const alreadyChecked = h.checkIns.includes(dateStr);
        const newCheckIns = alreadyChecked 
          ? h.checkIns.filter(d => d !== dateStr)
          : [...h.checkIns, dateStr];
        
        return {
          ...h,
          checkIns: newCheckIns,
          totalCount: newCheckIns.length,
          // Simple streak calculation could be added here
        };
      })
    }));
  };

  // Work Actions
  const addWorkEvent = (event: Omit<WorkEvent, 'id' | 'isDone'>) => {
    const newEvent: WorkEvent = { ...event, id: crypto.randomUUID(), isDone: false };
    setState(prev => ({ ...prev, workEvents: [...prev.workEvents, newEvent] }));
  };

  const toggleWorkEvent = (id: string) => {
    setState(prev => ({
      ...prev,
      workEvents: prev.workEvents.map(e => e.id === id ? { ...e, isDone: !e.isDone } : e)
    }));
  };

  const deleteWorkEvent = (id: string) => {
    setState(prev => ({
      ...prev,
      workEvents: prev.workEvents.filter(e => e.id !== id)
    }));
  };

  const updateWorkEvent = (id: string, updates: Partial<WorkEvent>) => {
    setState(prev => ({
      ...prev,
      workEvents: prev.workEvents.map(e => e.id === id ? { ...e, ...updates } : e)
    }));
  };

  // Temp Actions
  const addTempTask = (name: string, deadline: string, note?: string) => {
    const newTask: TempTask = {
      id: crypto.randomUUID(),
      name,
      deadline,
      note,
      isDone: false,
    };
    setState(prev => ({ ...prev, tempTasks: [...prev.tempTasks, newTask] }));
  };

  const toggleTempTask = (id: string) => {
    setState(prev => ({
      ...prev,
      tempTasks: prev.tempTasks.map(t => {
        if (t.id !== id) return t;
        const newIsDone = !t.isDone;
        return { 
          ...t, 
          isDone: newIsDone,
          completedAt: newIsDone ? new Date().toISOString() : undefined
        };
      })
    }));
  };

  const deleteTempTask = (id: string) => {
    setState(prev => ({
      ...prev,
      tempTasks: prev.tempTasks.filter(t => t.id !== id)
    }));
  };

  const saveDailyReview = (date: string, aiFeedback: string, userThoughts: string) => {
    setState(prev => {
      const reviews = prev.dailyReviews || [];
      const filtered = reviews.filter(r => r.date !== date);
      return {
        ...prev,
        dailyReviews: [...filtered, { date, aiFeedback, userThoughts }]
      };
    });
  };

  return {
    state,
    addStudyProject,
    addStudyStage,
    addStudyTask,
    toggleStudyTask,
    deleteStudyProject,
    deleteStudyStage,
    deleteStudyTask,
    addLifeHabit,
    checkInLifeHabit,
    deleteLifeHabit,
    addWorkEvent,
    toggleWorkEvent,
    deleteWorkEvent,
    updateWorkEvent,
    addTempTask,
    toggleTempTask,
    deleteTempTask,
    saveDailyReview,
  };
}
