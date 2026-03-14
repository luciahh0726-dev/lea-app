/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Calendar, 
  CheckCircle2, 
  Circle, 
  Clock, 
  Home, 
  Layers, 
  Plus, 
  Settings, 
  User,
  BookOpen,
  Heart,
  Briefcase,
  ChevronRight,
  ChevronLeft,
  Trash2,
  MoreVertical,
  ArrowRight,
  Sparkles,
  Loader2
} from 'lucide-react';
import { format, isToday, parseISO, isPast, addDays, subDays, startOfMonth, endOfMonth, eachDayOfInterval, isSameMonth, isSameDay, startOfWeek, endOfWeek } from 'date-fns';
import { useScheduleStore } from './store';
import { cn, StudyProject, StudyStage, StudyTask, LifeHabit, WorkEvent, TempTask } from './types';
import { generateStudyPlan, AISuggestedStage, generateDailyReview } from './services/geminiService';
import Markdown from 'react-markdown';

// --- Components ---

const Modal = ({ isOpen, onClose, title, children }: { isOpen: boolean, onClose: () => void, title: string, children: React.ReactNode }) => (
  <AnimatePresence>
    {isOpen && (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <motion.div 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        />
        <motion.div 
          initial={{ opacity: 0, scale: 0.9, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.9, y: 20 }}
          className="relative w-full max-w-sm bg-white rounded-3xl shadow-2xl overflow-hidden"
        >
          <div className="p-6">
            <h3 className="text-xl font-black text-zinc-900 mb-4">{title}</h3>
            {children}
          </div>
        </motion.div>
      </div>
    )}
  </AnimatePresence>
);

const TabButton = ({ active, onClick, icon: Icon, label }: { active: boolean, onClick: () => void, icon: any, label: string }) => (
  <button 
    onClick={onClick}
    className={cn(
      "flex flex-col items-center justify-center flex-1 py-2 transition-colors",
      active ? "text-emerald-600" : "text-zinc-400 hover:text-zinc-600"
    )}
  >
    <Icon size={20} className={cn("mb-1", active && "animate-in zoom-in-75 duration-300")} />
    <span className="text-[10px] font-medium uppercase tracking-wider">{label}</span>
  </button>
);

const SectionHeader = ({ title, count, total }: { title: string, count?: number, total?: number }) => (
  <div className="flex items-center justify-between mb-3 px-1">
    <h3 className="text-xs font-bold text-zinc-400 uppercase tracking-widest flex items-center gap-2">
      {title}
      {total !== undefined && (
        <span className="text-[10px] bg-zinc-100 text-zinc-500 px-1.5 py-0.5 rounded-full font-mono">
          {count}/{total}
        </span>
      )}
    </h3>
  </div>
);

interface TaskCardProps {
  key?: React.Key;
  title: string;
  subtitle?: string;
  isDone: boolean;
  onToggle: () => void;
  onClick?: () => void;
  onDelete?: () => void;
  type?: 'study' | 'life' | 'work' | 'temp' | 'default';
  deadline?: string;
}

const TaskCard = ({ 
  title, 
  subtitle, 
  isDone, 
  onToggle, 
  onClick,
  onDelete,
  type = 'default',
  deadline
}: TaskCardProps) => {
  const isOverdue = deadline && isPast(parseISO(deadline)) && !isToday(parseISO(deadline)) && !isDone;

  return (
    <motion.div 
      layout
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn(
        "group flex items-center gap-3 p-4 bg-white rounded-2xl border border-zinc-100 mb-2 transition-all hover:shadow-sm active:scale-[0.98]",
        isDone && "opacity-60"
      )}
    >
      <button 
        onClick={(e) => { e.stopPropagation(); onToggle(); }}
        className={cn(
          "shrink-0 w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all",
          isDone ? "bg-emerald-500 border-emerald-500 text-white" : "border-zinc-200 text-transparent hover:border-emerald-400"
        )}
      >
        <CheckCircle2 size={14} />
      </button>
      
      <div className="flex-1 min-w-0 cursor-pointer" onClick={onClick}>
        <h4 className={cn(
          "text-sm font-semibold text-zinc-800 truncate",
          isDone && "line-through text-zinc-400"
        )}>
          {title}
        </h4>
        {subtitle && <p className="text-xs text-zinc-400 truncate">{subtitle}</p>}
        {deadline && (
          <div className={cn(
            "flex items-center gap-1 mt-1 text-[10px] font-medium",
            isOverdue ? "text-rose-500" : "text-zinc-400"
          )}>
            <Clock size={10} />
            {format(parseISO(deadline), 'MMM d, HH:mm')}
          </div>
        )}
      </div>

      <div className="flex items-center gap-1">
        {onDelete && (
          <button 
            onClick={(e) => { e.stopPropagation(); onDelete(); }}
            className="p-2 text-zinc-300 hover:text-rose-500 transition-opacity"
          >
            <Trash2 size={16} />
          </button>
        )}
        {onClick && (
          <ChevronRight size={16} className="text-zinc-300 group-hover:text-zinc-500" />
        )}
      </div>
    </motion.div>
  );
};

// --- Views ---

const TodayView = ({ store, setTab }: { store: any, setTab: (t: string) => void }) => {
  const today = new Date();
  const todayStr = format(today, 'yyyy-MM-dd');
  const dayOfWeek = today.getDay();

  const [isReviewing, setIsReviewing] = useState(false);
  const [reviewText, setReviewText] = useState('');
  const [userThoughts, setUserThoughts] = useState('');
  const [showReviewModal, setShowReviewModal] = useState(false);

  const todayTasks = useMemo(() => {
    const study = store.state.studyProjects.flatMap((p: StudyProject) => {
      const stage = p.stages.find(s => s.id === p.currentStageId);
      if (!stage) return [];
      return stage.tasks
        .filter(t => t.repeatDays.includes(dayOfWeek))
        .map(t => ({ 
          id: t.id, 
          name: t.name, 
          completedDates: t.completedDates, 
          projectId: p.id, 
          stageId: stage.id, 
          projectTitle: p.name 
        }));
    });

    const life = store.state.lifeHabits.map((h: LifeHabit) => ({
      id: h.id,
      name: h.name,
      checkInsCount: h.checkIns.length,
      isDone: h.checkIns.includes(todayStr)
    }));

    const work = store.state.workEvents.filter((e: WorkEvent) => isSameDay(parseISO(e.date), today));

    const temp = store.state.tempTasks.filter((t: TempTask) => 
      !t.isDone && (isSameDay(parseISO(t.deadline), today) || isPast(parseISO(t.deadline)))
    );

    return { study, life, work, temp };
  }, [store.state, todayStr, dayOfWeek]);

  const totalCount = todayTasks.study.length + todayTasks.life.length + todayTasks.work.length + todayTasks.temp.length;
  const doneCount = 
    todayTasks.study.filter(t => t.completedDates.includes(todayStr)).length +
    todayTasks.life.filter(t => t.isDone).length +
    todayTasks.work.filter(e => e.isDone).length +
    todayTasks.temp.filter(t => t.isDone).length;

  const handleReview = async () => {
    const completed = [
      ...todayTasks.study.filter(t => t.completedDates.includes(todayStr)).map(t => ({ name: t.name, type: 'Study' })),
      ...todayTasks.life.filter(t => t.isDone).map(h => ({ name: h.name, type: 'Habit' })),
      ...todayTasks.work.filter(e => e.isDone).map(e => ({ name: e.title, type: 'Work' })),
      ...todayTasks.temp.filter(t => t.isDone).map(t => ({ name: t.name, type: 'Task' }))
    ];

    if (completed.length === 0) {
      setReviewText("You haven't completed any tasks yet today. Keep going!");
      setShowReviewModal(true);
      return;
    }

    setIsReviewing(true);
    try {
      const review = await generateDailyReview(completed);
      setReviewText(review);
      setShowReviewModal(true);
    } catch (error) {
      console.error("Review failed", error);
    } finally {
      setIsReviewing(false);
    }
  };

  const handleSaveReview = () => {
    store.saveDailyReview(todayStr, reviewText, userThoughts);
    setShowReviewModal(false);
    setUserThoughts('');
  };

  return (
    <div className="p-6 pb-24">
      <header className="mb-8">
        <div className="flex items-center justify-between mb-1">
          <p className="text-xs font-bold text-emerald-600 uppercase tracking-widest">
            {format(today, 'EEEE, MMMM do')}
          </p>
          <button 
            onClick={handleReview}
            disabled={isReviewing}
            className="flex items-center gap-1.5 text-[10px] font-black bg-zinc-900 text-white px-3 py-1.5 rounded-full hover:bg-zinc-800 disabled:opacity-50 transition-all"
          >
            {isReviewing ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} className="text-amber-400" />}
            REVIEW
          </button>
        </div>
        <h1 className="text-3xl font-black text-zinc-900 tracking-tight">Today</h1>
        <div className="mt-4 flex items-center gap-2">
          <div className="flex-1 h-1.5 bg-zinc-100 rounded-full overflow-hidden">
            <motion.div 
              initial={{ width: 0 }}
              animate={{ width: `${(doneCount / (totalCount || 1)) * 100}%` }}
              className="h-full bg-emerald-500"
            />
          </div>
          <span className="text-[10px] font-mono font-bold text-zinc-400">
            {doneCount}/{totalCount}
          </span>
        </div>
      </header>

      {totalCount === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-zinc-300">
          <CheckCircle2 size={48} strokeWidth={1} className="mb-4 opacity-20" />
          <p className="text-sm font-medium">No tasks for today</p>
        </div>
      ) : (
        <div className="space-y-8">
          {todayTasks.study.length > 0 && (
            <section>
              <SectionHeader title="Study" />
              {todayTasks.study.map(t => (
                <TaskCard 
                  key={t.id}
                  title={t.name}
                  subtitle={t.projectTitle}
                  isDone={t.completedDates.includes(todayStr)}
                  onToggle={() => store.toggleStudyTask(t.projectId, t.stageId, t.id)}
                  onClick={() => setTab('fixed')}
                  onDelete={() => {
                    store.deleteStudyTask(t.projectId, t.stageId, t.id);
                  }}
                />
              ))}
            </section>
          )}

          {todayTasks.life.length > 0 && (
            <section>
              <SectionHeader title="Life Habits" />
              {todayTasks.life.map(h => (
                <TaskCard 
                  key={h.id}
                  title={h.name}
                  subtitle={`${h.checkInsCount} total check-ins`}
                  isDone={h.isDone}
                  onToggle={() => store.checkInLifeHabit(h.id)}
                  onClick={() => setTab('fixed')}
                  onDelete={() => {
                    store.deleteLifeHabit(h.id);
                  }}
                />
              ))}
            </section>
          )}

          {todayTasks.work.length > 0 && (
            <section>
              <SectionHeader title="Work Schedule" />
              {todayTasks.work.map(e => (
                <TaskCard 
                  key={e.id}
                  title={e.title}
                  subtitle={e.isAllDay ? 'All Day' : `${e.startTime} - ${e.endTime}`}
                  isDone={e.isDone}
                  onToggle={() => store.toggleWorkEvent(e.id)}
                  onClick={() => setTab('fixed')}
                  onDelete={() => {
                    store.deleteWorkEvent(e.id);
                  }}
                />
              ))}
            </section>
          )}

          {todayTasks.temp.length > 0 && (
            <section>
              <SectionHeader title="Temporary Tasks" />
              {todayTasks.temp.map(t => (
                <TaskCard 
                  key={t.id}
                  title={t.name}
                  deadline={t.deadline}
                  isDone={t.isDone}
                  onToggle={() => store.toggleTempTask(t.id)}
                  onClick={() => setTab('temp')}
                  onDelete={() => {
                    store.deleteTempTask(t.id);
                  }}
                />
              ))}
            </section>
          )}
        </div>
      )}

      <Modal isOpen={showReviewModal} onClose={() => setShowReviewModal(false)} title="Daily Review">
        <div className="prose prose-sm max-h-[70vh] overflow-y-auto pr-2">
          <div className="bg-emerald-50 rounded-2xl p-4 mb-6 border border-emerald-100">
            <div className="text-emerald-800 leading-relaxed text-sm">
              <Markdown>{reviewText}</Markdown>
            </div>
          </div>

          {reviewText && !reviewText.includes("You haven't completed") && (
            <div className="space-y-4">
              <div>
                <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest block mb-2">Your Thoughts</label>
                <textarea 
                  value={userThoughts}
                  onChange={(e) => setUserThoughts(e.target.value)}
                  placeholder="How was your day? What are you proud of?"
                  className="w-full bg-zinc-100 border-none rounded-2xl px-4 py-3 text-sm focus:ring-2 focus:ring-emerald-500 transition-all min-h-[100px] resize-none"
                />
              </div>
              <button 
                onClick={handleSaveReview}
                className="w-full bg-emerald-500 text-white font-bold py-4 rounded-2xl shadow-lg shadow-emerald-100 hover:bg-emerald-600 transition-all"
              >
                Save & Finish Day
              </button>
            </div>
          )}
          
          {(reviewText.includes("You haven't completed") || !reviewText) && (
            <button 
              onClick={() => setShowReviewModal(false)}
              className="w-full bg-zinc-900 text-white font-bold py-4 rounded-2xl mt-4"
            >
              Got it
            </button>
          )}
        </div>
      </Modal>
    </div>
  );
};

const StudyModule = ({ store }: { store: any }) => {
  const [nav, setNav] = useState<{
    view: 'projects' | 'stages' | 'calendar' | 'day';
    projectId?: string;
    stageId?: string;
    date?: string;
  }>({ view: 'projects' });

  const [showAddProject, setShowAddProject] = useState(false);
  const [showAddStage, setShowAddStage] = useState(false);
  const [showAddTask, setShowAddTask] = useState(false);

  const [newProjectName, setNewProjectName] = useState('');
  const [newStageName, setNewStageName] = useState('');
  const [newTaskName, setNewTaskName] = useState('');

  const [isGeneratingPlan, setIsGeneratingPlan] = useState(false);
  const [suggestedPlan, setSuggestedPlan] = useState<AISuggestedStage[] | null>(null);
  const [showAIPreview, setShowAIPreview] = useState(false);
  const [showAIInputModal, setShowAIInputModal] = useState(false);
  const [aiUserDescription, setAiUserDescription] = useState('');

  const handleGeneratePlan = async () => {
    if (!selectedProject) return;
    setIsGeneratingPlan(true);
    setShowAIInputModal(false);
    try {
      const plan = await generateStudyPlan(selectedProject.name, aiUserDescription);
      setSuggestedPlan(plan);
      setShowAIPreview(true);
      setAiUserDescription('');
    } catch (error) {
      console.error("AI Generation failed", error);
    } finally {
      setIsGeneratingPlan(false);
    }
  };

  const applySuggestedPlan = () => {
    if (!selectedProject || !suggestedPlan) return;
    
    let currentStartDate = new Date();
    
    suggestedPlan.forEach(stage => {
      const endDate = addDays(currentStartDate, stage.durationDays);
      const stageId = store.addStudyStage(selectedProject.id, {
        name: stage.name,
        startDate: currentStartDate.toISOString(),
        endDate: endDate.toISOString()
      });
      
      stage.tasks.forEach(taskName => {
        store.addStudyTask(selectedProject.id, stageId, taskName, [0,1,2,3,4,5,6]);
      });
      
      currentStartDate = endDate;
    });
    
    setShowAIPreview(false);
    setSuggestedPlan(null);
  };

  const selectedProject = store.state.studyProjects.find((p: StudyProject) => p.id === nav.projectId);
  const selectedStage = selectedProject?.stages.find((s: StudyStage) => s.id === nav.stageId);

  const renderProjects = () => (
    <div className="space-y-4 relative pb-20">
      {store.state.studyProjects.length === 0 && (
        <div className="text-center py-12 text-zinc-400 text-sm">No study projects yet</div>
      )}
      {store.state.studyProjects.map((p: StudyProject) => (
        <div 
          key={p.id} 
          onClick={() => setNav({ view: 'stages', projectId: p.id })}
          className="w-full text-left bg-white rounded-2xl border border-zinc-100 p-5 flex items-center justify-between group hover:border-emerald-200 transition-all cursor-pointer"
        >
          <div>
            <h3 className="font-bold text-zinc-800 text-lg">{p.name}</h3>
            <p className="text-xs text-zinc-400 mt-1">{p.stages.length} Stages</p>
          </div>
          <div className="flex items-center gap-2">
            <button 
              onClick={(e) => {
                e.stopPropagation();
                store.deleteStudyProject(p.id);
              }}
              className="p-2 text-zinc-300 hover:text-rose-500 opacity-0 group-hover:opacity-100 transition-opacity"
            >
              <Trash2 size={18} />
            </button>
            <ChevronRight size={20} className="text-zinc-300" />
          </div>
        </div>
      ))}

      <button 
        onClick={() => setShowAddProject(true)}
        className="fixed bottom-24 right-6 w-14 h-14 bg-emerald-600 text-white rounded-full shadow-lg flex items-center justify-center hover:scale-110 active:scale-95 transition-all z-10"
      >
        <Plus size={24} />
      </button>

      <Modal isOpen={showAddProject} onClose={() => setShowAddProject(false)} title="New Study Project">
        <div className="space-y-4">
          <input 
            type="text" 
            placeholder="Project Name (e.g. Law Exam)"
            className="w-full p-4 bg-zinc-50 rounded-xl border-none focus:ring-2 focus:ring-emerald-500"
            value={newProjectName}
            onChange={(e) => setNewProjectName(e.target.value)}
          />
          <button 
            onClick={() => {
              if (newProjectName) {
                store.addStudyProject(newProjectName);
                setNewProjectName('');
                setShowAddProject(false);
              }
            }}
            className="w-full bg-emerald-500 text-white font-bold py-4 rounded-xl shadow-lg shadow-emerald-200"
          >
            Create Project
          </button>
        </div>
      </Modal>
    </div>
  );

  const renderStages = () => (
    <div className="space-y-4">
      <button 
        onClick={() => setNav({ view: 'projects' })}
        className="flex items-center gap-2 text-xs font-bold text-zinc-400 uppercase tracking-widest mb-4 hover:text-zinc-600"
      >
        <ArrowRight size={14} className="rotate-180" /> Back to Projects
      </button>
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-xl font-black text-zinc-900">{selectedProject?.name}</h2>
        <div className="flex items-center gap-2">
          <button 
            onClick={() => setShowAIInputModal(true)}
            disabled={isGeneratingPlan}
            className="bg-zinc-900 text-white p-2 rounded-xl shadow-sm hover:bg-zinc-800 disabled:opacity-50 transition-all flex items-center gap-2 px-3"
          >
            {isGeneratingPlan ? (
              <Loader2 size={18} className="animate-spin" />
            ) : (
              <Sparkles size={18} className="text-amber-400" />
            )}
            <span className="text-xs font-bold">AI Plan</span>
          </button>
          <button 
            onClick={() => setShowAddStage(true)}
            className="bg-emerald-500 text-white p-2 rounded-xl shadow-sm"
          >
            <Plus size={20} />
          </button>
        </div>
      </div>
      {selectedProject?.stages.map((s: StudyStage) => (
        <div 
          key={s.id}
          onClick={() => setNav({ ...nav, view: 'calendar', stageId: s.id })}
          className="w-full text-left bg-white rounded-2xl border border-zinc-100 p-5 flex items-center justify-between group hover:border-emerald-200 transition-all cursor-pointer"
        >
          <div>
            <h3 className="font-bold text-zinc-800">{s.name}</h3>
            <p className="text-xs text-zinc-400 mt-1">
              {format(parseISO(s.startDate), 'MMM d')} - {format(parseISO(s.endDate), 'MMM d')}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button 
              onClick={(e) => {
                e.stopPropagation();
                store.deleteStudyStage(selectedProject!.id, s.id);
              }}
              className="p-2 text-zinc-300 hover:text-rose-500 opacity-0 group-hover:opacity-100 transition-opacity"
            >
              <Trash2 size={18} />
            </button>
            <ChevronRight size={20} className="text-zinc-300" />
          </div>
        </div>
      ))}

      <Modal isOpen={showAddStage} onClose={() => setShowAddStage(false)} title="New Study Stage">
        <div className="space-y-4">
          <input 
            type="text" 
            placeholder="Stage Name (e.g. Basic Theory)"
            className="w-full p-4 bg-zinc-50 rounded-xl border-none focus:ring-2 focus:ring-emerald-500"
            value={newStageName}
            onChange={(e) => setNewStageName(e.target.value)}
          />
          <div className="text-xs text-zinc-400 px-1">Default: 30 days starting today</div>
          <button 
            onClick={() => {
              if (newStageName && selectedProject) {
                store.addStudyStage(selectedProject.id, { 
                  name: newStageName, 
                  startDate: new Date().toISOString(), 
                  endDate: addDays(new Date(), 30).toISOString() 
                });
                setNewStageName('');
                setShowAddStage(false);
              }
            }}
            className="w-full bg-emerald-500 text-white font-bold py-4 rounded-xl shadow-lg shadow-emerald-200"
          >
            Create Stage
          </button>
        </div>
      </Modal>

      <Modal isOpen={showAIInputModal} onClose={() => setShowAIInputModal(false)} title="AI Study Planner">
        <div className="space-y-4">
          <p className="text-xs text-zinc-500 leading-relaxed">
            Describe your study goals or list the specific tasks you need to complete. 
            AI will analyze and distribute them into a structured timeline.
          </p>
          <textarea 
            placeholder="e.g. I need to finish reading 10 chapters of Law, do 5 practice exams, and review all notes. I want to finish in 2 weeks."
            className="w-full p-4 bg-zinc-50 rounded-xl border-none focus:ring-2 focus:ring-emerald-500 min-h-[120px] text-sm"
            value={aiUserDescription}
            onChange={(e) => setAiUserDescription(e.target.value)}
          />
          <button 
            onClick={handleGeneratePlan}
            disabled={isGeneratingPlan}
            className="w-full bg-zinc-900 text-white font-bold py-4 rounded-xl shadow-lg flex items-center justify-center gap-2 hover:bg-zinc-800 transition-all"
          >
            {isGeneratingPlan ? (
              <Loader2 size={18} className="animate-spin" />
            ) : (
              <Sparkles size={18} className="text-amber-400" />
            )}
            Generate Plan
          </button>
        </div>
      </Modal>

      <Modal isOpen={showAIPreview} onClose={() => setShowAIPreview(false)} title="AI Suggested Plan">
        <div className="space-y-6 max-h-[60vh] overflow-y-auto pr-2">
          {suggestedPlan?.map((stage, idx) => (
            <div key={idx} className="p-4 bg-zinc-50 rounded-2xl border border-zinc-100">
              <div className="flex items-center justify-between mb-2">
                <h4 className="font-bold text-zinc-900">{stage.name}</h4>
                <span className="text-[10px] font-black bg-zinc-200 text-zinc-600 px-2 py-0.5 rounded-full uppercase">
                  {stage.durationDays} Days
                </span>
              </div>
              <div className="space-y-1">
                {stage.tasks.map((task, tIdx) => (
                  <div key={tIdx} className="flex items-center gap-2 text-xs text-zinc-500">
                    <div className="w-1 h-1 rounded-full bg-emerald-400" />
                    {task}
                  </div>
                ))}
              </div>
            </div>
          ))}
          <div className="sticky bottom-0 pt-4 bg-white">
            <button 
              onClick={applySuggestedPlan}
              className="w-full bg-zinc-900 text-white font-bold py-4 rounded-xl shadow-xl flex items-center justify-center gap-2 hover:bg-zinc-800 transition-all"
            >
              <Sparkles size={18} className="text-amber-400" />
              Apply Plan
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );

  const renderCalendar = () => {
    if (!selectedStage) return null;
    const start = parseISO(selectedStage.startDate);
    const end = parseISO(selectedStage.endDate);
    const days = eachDayOfInterval({ start, end });

    return (
      <div className="space-y-6">
        <button 
          onClick={() => setNav({ view: 'stages', projectId: selectedProject!.id })}
          className="flex items-center gap-2 text-xs font-bold text-zinc-400 uppercase tracking-widest mb-4 hover:text-zinc-600"
        >
          <ArrowRight size={14} className="rotate-180" /> Back to Stages
        </button>
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-black text-zinc-900">{selectedStage.name}</h2>
            <p className="text-xs text-zinc-400">Select a date to see tasks</p>
          </div>
          <button 
            onClick={() => setShowAddTask(true)}
            className="text-emerald-600 p-2 hover:bg-emerald-50 rounded-xl flex items-center gap-1 text-xs font-bold"
          >
            <Plus size={16} /> Add Task
          </button>
        </div>

        <div className="grid grid-cols-7 gap-2">
          {['S','M','T','W','T','F','S'].map((d, idx) => (
            <div key={`${d}-${idx}`} className="text-[10px] font-bold text-zinc-300 text-center py-2">{d}</div>
          ))}
          {days.map(date => {
            const dateStr = format(date, 'yyyy-MM-dd');
            const dayOfWeek = date.getDay();
            const dayTasks = selectedStage.tasks.filter(t => t.repeatDays.includes(dayOfWeek));
            const tasksCount = dayTasks.length;
            const doneCount = dayTasks.filter(t => t.completedDates.includes(dateStr)).length;
            const isAllDone = tasksCount > 0 && doneCount === tasksCount;
            
            return (
              <button 
                key={dateStr}
                onClick={() => setNav({ ...nav, view: 'day', date: dateStr })}
                className={cn(
                  "aspect-square rounded-xl flex flex-col items-center justify-center relative transition-all",
                  isToday(date) 
                    ? "bg-emerald-500 text-white shadow-lg shadow-emerald-200" 
                    : isAllDone 
                      ? "bg-emerald-50 text-emerald-600 border border-emerald-100"
                      : "bg-white border border-zinc-100 hover:border-emerald-200"
                )}
              >
                <span className="text-xs font-bold">{format(date, 'd')}</span>
                {tasksCount > 0 && !isAllDone && (
                  <div className={cn(
                    "w-1 h-1 rounded-full mt-1",
                    isToday(date) ? "bg-white" : "bg-emerald-400"
                  )} />
                )}
                {isAllDone && !isToday(date) && (
                  <CheckCircle2 size={10} className="mt-1" />
                )}
              </button>
            );
          })}
        </div>

        <Modal isOpen={showAddTask} onClose={() => setShowAddTask(false)} title="New Study Task">
          <div className="space-y-4">
            <input 
              type="text" 
              placeholder="Task Name (e.g. Read Chapter 1)"
              className="w-full p-4 bg-zinc-50 rounded-xl border-none focus:ring-2 focus:ring-emerald-500"
              value={newTaskName}
              onChange={(e) => setNewTaskName(e.target.value)}
            />
            <div className="text-xs text-zinc-400 px-1">Task will repeat every day in this stage</div>
            <button 
              onClick={() => {
                if (newTaskName && selectedProject && selectedStage) {
                  store.addStudyTask(selectedProject.id, selectedStage.id, newTaskName, [0,1,2,3,4,5,6]);
                  setNewTaskName('');
                  setShowAddTask(false);
                }
              }}
              className="w-full bg-emerald-500 text-white font-bold py-4 rounded-xl shadow-lg shadow-emerald-200"
            >
              Add Task
            </button>
          </div>
        </Modal>
      </div>
    );
  };

  const renderDayTasks = () => {
    if (!selectedStage || !nav.date) return null;
    const date = parseISO(nav.date);
    const dayOfWeek = date.getDay();
    const tasks = selectedStage.tasks.filter(t => t.repeatDays.includes(dayOfWeek));

    return (
      <div className="space-y-6">
        <button 
          onClick={() => setNav({ ...nav, view: 'calendar' })}
          className="flex items-center gap-2 text-xs font-bold text-zinc-400 uppercase tracking-widest mb-4 hover:text-zinc-600"
        >
          <ArrowRight size={14} className="rotate-180" /> Back to Calendar
        </button>
        <header>
          <h2 className="text-xl font-black text-zinc-900">{format(date, 'MMMM do')}</h2>
          <p className="text-xs text-zinc-400">{selectedStage.name} • {tasks.length} Tasks</p>
        </header>

        <div className="space-y-2">
          {tasks.length === 0 ? (
            <div className="text-center py-12 text-zinc-400 text-sm">No tasks for this day</div>
          ) : (
            tasks.map(t => (
              <div key={t.id} className="flex items-center justify-between p-4 bg-white rounded-2xl border border-zinc-100 group">
                <div className="flex items-center gap-3">
                  <button 
                    onClick={() => store.toggleStudyTask(selectedProject!.id, selectedStage.id, t.id, nav.date)}
                    className={cn(
                      "w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all",
                      t.completedDates.includes(nav.date!) 
                        ? "bg-emerald-500 border-emerald-500 text-white" 
                        : "border-zinc-200 text-transparent hover:border-emerald-500"
                    )}
                  >
                    <CheckCircle2 size={14} />
                  </button>
                  <span className={cn(
                    "text-sm font-semibold transition-all",
                    t.completedDates.includes(nav.date!) ? "text-zinc-400 line-through" : "text-zinc-700"
                  )}>
                    {t.name}
                  </span>
                </div>
                <button 
                  onClick={() => {
                    store.deleteStudyTask(selectedProject!.id, selectedStage.id, t.id);
                  }}
                  className="opacity-0 group-hover:opacity-100 text-zinc-300 hover:text-rose-500 transition-opacity"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            ))
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="pb-24">
      {nav.view === 'projects' && renderProjects()}
      {nav.view === 'stages' && renderStages()}
      {nav.view === 'calendar' && renderCalendar()}
      {nav.view === 'day' && renderDayTasks()}
    </div>
  );
};

const HabitCalendar = ({ habit, onToggle }: { habit: LifeHabit, onToggle: (date: Date) => void }) => {
  const [currentMonth, setCurrentMonth] = useState(new Date());
  
  const daysInMonth = eachDayOfInterval({
    start: startOfMonth(currentMonth),
    end: endOfMonth(currentMonth),
  });

  const startDay = startOfWeek(daysInMonth[0]);
  const endDay = endOfWeek(daysInMonth[daysInMonth.length - 1]);
  
  const calendarDays = eachDayOfInterval({ start: startDay, end: endDay });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-black text-zinc-900">{format(currentMonth, 'MMMM yyyy')}</h3>
        <div className="flex gap-2">
          <button 
            onClick={() => setCurrentMonth(addDays(startOfMonth(currentMonth), -1))}
            className="p-2 hover:bg-zinc-100 rounded-lg transition-colors"
          >
            <ChevronLeft size={16} />
          </button>
          <button 
            onClick={() => setCurrentMonth(addDays(endOfMonth(currentMonth), 1))}
            className="p-2 hover:bg-zinc-100 rounded-lg transition-colors"
          >
            <ChevronRight size={16} />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-7 gap-1">
        {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map(d => (
          <div key={d} className="text-[10px] font-black text-zinc-300 text-center py-2">{d}</div>
        ))}
        {calendarDays.map((day, i) => {
          const dateStr = format(day, 'yyyy-MM-dd');
          const isChecked = habit.checkIns.includes(dateStr);
          const isCurrentMonth = isSameMonth(day, currentMonth);
          const isTodayDate = isToday(day);

          return (
            <button
              key={i}
              onClick={() => onToggle(day)}
              className={cn(
                "aspect-square rounded-xl flex flex-col items-center justify-center relative transition-all",
                !isCurrentMonth && "opacity-20",
                isChecked ? "bg-emerald-500 text-white shadow-lg shadow-emerald-100" : "hover:bg-zinc-50",
                isTodayDate && !isChecked && "border-2 border-emerald-500/20"
              )}
            >
              <span className={cn(
                "text-xs font-bold",
                isChecked ? "text-white" : isTodayDate ? "text-emerald-600" : "text-zinc-600"
              )}>
                {format(day, 'd')}
              </span>
              {isChecked && <div className="w-1 h-1 bg-white rounded-full mt-0.5" />}
            </button>
          );
        })}
      </div>
    </div>
  );
};

const FixedTasksView = ({ store }: { store: any }) => {
  const [subTab, setSubTab] = useState<'study' | 'life' | 'work'>('study');
  const [showAddModal, setShowAddModal] = useState(false);
  const [selectedHabitId, setSelectedHabitId] = useState<string | null>(null);
  const [newItemName, setNewItemName] = useState('');
  const [selectedWorkDate, setSelectedWorkDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [newWorkDate, setNewWorkDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [newWorkTime, setNewWorkTime] = useState(format(new Date(), 'HH:mm'));

  const selectedHabit = store.state.lifeHabits.find((h: any) => h.id === selectedHabitId);

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newItemName.trim()) return;

    if (subTab === 'study') {
      store.addStudyProject(newItemName);
    } else if (subTab === 'life') {
      store.addLifeHabit(newItemName, 1);
    } else {
      store.addWorkEvent({ 
        title: newItemName, 
        date: newWorkDate, 
        startTime: newWorkTime,
        isAllDay: false 
      });
    }
    setNewItemName('');
    // Keep the date as the selected one for convenience
    setNewWorkTime(format(new Date(), 'HH:mm'));
    setShowAddModal(false);
  };

  // Work Calendar Logic
  const workMonthStart = startOfMonth(parseISO(selectedWorkDate));
  const workMonthEnd = endOfMonth(workMonthStart);
  const workCalendarDays = eachDayOfInterval({
    start: startOfWeek(workMonthStart),
    end: endOfWeek(workMonthEnd)
  });

  const filteredWorkEvents = store.state.workEvents.filter((e: WorkEvent) => e.date === selectedWorkDate);

  return (
    <div className="flex flex-col h-full">
      <div className="p-6 pb-0">
        <h1 className="text-2xl font-black text-zinc-900 mb-6">Fixed Tasks</h1>
        <div className="flex bg-zinc-100 p-1 rounded-xl mb-6">
          {(['study', 'life', 'work'] as const).map(tab => (
            <button
              key={tab}
              onClick={() => setSubTab(tab)}
              className={cn(
                "flex-1 py-2 text-xs font-bold uppercase tracking-wider rounded-lg transition-all",
                subTab === tab ? "bg-white text-emerald-600 shadow-sm" : "text-zinc-400"
              )}
            >
              {tab}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-6 pb-24">
        {subTab === 'study' && <StudyModule store={store} />}

        {subTab === 'life' && (
          <div className="grid grid-cols-1 gap-4">
            {store.state.lifeHabits.length === 0 && (
              <div className="text-center py-12 text-zinc-400 text-sm">No habits yet</div>
            )}
            {store.state.lifeHabits.map((h: LifeHabit) => {
              const now = new Date();
              const monthStart = startOfMonth(now);
              const monthEnd = endOfMonth(now);
              const daysInMonth = monthEnd.getDate();
              const currentMonthStr = format(now, 'yyyy-MM');
              const checkInsThisMonth = h.checkIns.filter(d => d.startsWith(currentMonthStr)).length;

              return (
                <div 
                  key={h.id} 
                  onClick={() => setSelectedHabitId(h.id)}
                  className="bg-white rounded-2xl border border-zinc-100 p-5 relative group cursor-pointer hover:border-emerald-200 hover:shadow-xl hover:shadow-emerald-500/5 transition-all"
                >
                  <div className="flex items-center justify-between mb-6">
                    <div>
                      <h3 className="font-black text-zinc-900 text-lg">{h.name}</h3>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-[10px] font-black text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full uppercase tracking-wider">
                          {checkInsThisMonth}/{daysInMonth} This Month
                        </span>
                        <span className="text-[10px] text-zinc-400 font-bold uppercase tracking-widest">
                          {h.totalCount} Total
                        </span>
                      </div>
                    </div>
                    <button 
                      onClick={(e) => {
                        e.stopPropagation();
                        store.deleteLifeHabit(h.id);
                      }} 
                      className="opacity-0 group-hover:opacity-100 text-zinc-300 p-2 hover:text-rose-500 transition-opacity"
                    >
                      <Trash2 size={18} />
                    </button>
                  </div>
                  
                  <div className="flex flex-wrap gap-1.5">
                    {Array.from({ length: daysInMonth }).map((_, i) => (
                      <div 
                        key={i} 
                        className={cn(
                          "w-2.5 h-2.5 rounded-[3px] transition-all duration-500",
                          i < checkInsThisMonth 
                            ? "bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.3)]" 
                            : "bg-zinc-100"
                        )} 
                        style={{ transitionDelay: `${i * 20}ms` }}
                      />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <Modal 
          isOpen={!!selectedHabitId} 
          onClose={() => setSelectedHabitId(null)} 
          title={selectedHabit?.name || 'Habit Calendar'}
        >
          {selectedHabit && (
            <HabitCalendar 
              habit={selectedHabit} 
              onToggle={(date) => store.checkInLifeHabit(selectedHabit.id, date)} 
            />
          )}
        </Modal>

        {subTab === 'work' && (
          <div className="space-y-4">
            <div className="bg-white rounded-2xl border border-zinc-100 p-4">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-black text-zinc-900">{format(workMonthStart, 'MMMM yyyy')}</h3>
                <div className="flex gap-2">
                  <button 
                    onClick={() => setSelectedWorkDate(format(addDays(workMonthStart, -1), 'yyyy-MM-dd'))}
                    className="p-1 hover:bg-zinc-100 rounded-lg text-zinc-400"
                  >
                    <ChevronLeft size={16} />
                  </button>
                  <button 
                    onClick={() => setSelectedWorkDate(format(addDays(workMonthEnd, 1), 'yyyy-MM-dd'))}
                    className="p-1 hover:bg-zinc-100 rounded-lg text-zinc-400"
                  >
                    <ChevronRight size={16} />
                  </button>
                </div>
              </div>
              <div className="grid grid-cols-7 gap-1">
                {['S','M','T','W','T','F','S'].map(d => (
                  <div key={d} className="text-[10px] font-bold text-zinc-300 text-center py-1">{d}</div>
                ))}
                {workCalendarDays.map((day, i) => {
                  const dateStr = format(day, 'yyyy-MM-dd');
                  const isSelected = dateStr === selectedWorkDate;
                  const isCurrentMonth = isSameMonth(day, workMonthStart);
                  const hasTasks = store.state.workEvents.some((e: WorkEvent) => e.date === dateStr);
                  
                  return (
                    <button 
                      key={i} 
                      onClick={() => {
                        setSelectedWorkDate(dateStr);
                        setNewWorkDate(dateStr);
                      }}
                      className={cn(
                        "aspect-square flex flex-col items-center justify-center text-xs rounded-xl relative transition-all",
                        !isCurrentMonth && "opacity-20",
                        isSelected ? "bg-emerald-500 text-white font-bold shadow-lg shadow-emerald-500/30" : "text-zinc-600 hover:bg-zinc-50"
                      )}
                    >
                      {format(day, 'd')}
                      {hasTasks && !isSelected && (
                        <div className="absolute bottom-1 w-1 h-1 bg-emerald-400 rounded-full" />
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="flex items-center justify-between px-1">
              <h3 className="text-[10px] font-black text-zinc-400 uppercase tracking-widest">
                Tasks for {format(parseISO(selectedWorkDate), 'MMM d, yyyy')}
              </h3>
              <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full">
                {filteredWorkEvents.length} Tasks
              </span>
            </div>

            <div className="space-y-2">
              {filteredWorkEvents.length === 0 && (
                <div className="text-center py-12 bg-zinc-50/50 rounded-2xl border border-dashed border-zinc-200">
                  <p className="text-zinc-400 text-xs font-medium">No tasks for this day</p>
                  <button 
                    onClick={() => setShowAddModal(true)}
                    className="mt-2 text-emerald-600 text-[10px] font-bold uppercase tracking-wider hover:underline"
                  >
                    + Add Task
                  </button>
                </div>
              )}
              {filteredWorkEvents.map((e: WorkEvent) => (
                <div key={e.id} className="flex items-center gap-3 p-3 bg-white rounded-xl border border-zinc-100 group hover:border-emerald-200 transition-all">
                  <div className="w-1 h-8 bg-emerald-400 rounded-full" />
                  <div className="flex-1">
                    <h4 className="text-sm font-bold text-zinc-800">{e.title}</h4>
                    <div className="flex items-center gap-2 mt-0.5">
                      {e.startTime && (
                        <p className="text-[10px] text-emerald-600 font-bold">{e.startTime}</p>
                      )}
                    </div>
                  </div>
                  <button onClick={() => store.deleteWorkEvent(e.id)} className="opacity-0 group-hover:opacity-100 text-zinc-300 hover:text-rose-500 p-2 transition-opacity">
                    <Trash2 size={16} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {subTab !== 'study' && (
          <button 
            onClick={() => setShowAddModal(true)}
            className="fixed bottom-24 right-6 w-14 h-14 bg-zinc-900 text-white rounded-full shadow-lg flex items-center justify-center hover:scale-110 active:scale-95 transition-all"
          >
            <Plus size={24} />
          </button>
        )}

        <Modal 
          isOpen={showAddModal} 
          onClose={() => setShowAddModal(false)} 
          title={`Add ${subTab}`}
        >
          <form onSubmit={handleAdd} className="space-y-4">
            <div>
              <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest block mb-1">Name / Title</label>
              <input 
                autoFocus
                type="text" 
                value={newItemName}
                onChange={(e) => setNewItemName(e.target.value)}
                className="w-full bg-zinc-100 border-none rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-emerald-500 transition-all"
                placeholder={`Enter ${subTab} name...`}
              />
            </div>

            {subTab === 'work' && (
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest block mb-1">Date</label>
                  <input 
                    type="date" 
                    value={newWorkDate}
                    onChange={(e) => setNewWorkDate(e.target.value)}
                    className="w-full bg-zinc-100 border-none rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-emerald-500 transition-all"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest block mb-1">Time</label>
                  <input 
                    type="time" 
                    value={newWorkTime}
                    onChange={(e) => setNewWorkTime(e.target.value)}
                    className="w-full bg-zinc-100 border-none rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-emerald-500 transition-all"
                  />
                </div>
              </div>
            )}
            <button 
              type="submit"
              className="w-full bg-emerald-500 text-white font-bold py-3 rounded-xl hover:bg-emerald-600 transition-colors"
            >
              Save {subTab}
            </button>
          </form>
        </Modal>
      </div>
    </div>
  );
};

const TempTasksView = ({ store }: { store: any }) => {
  const [filter, setFilter] = useState<'todo' | 'done'>('todo');
  const [showAddModal, setShowAddModal] = useState(false);
  const [newItemName, setNewItemName] = useState('');
  const [newDate, setNewDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [newTime, setNewTime] = useState(format(new Date(), 'HH:mm'));

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newItemName.trim()) return;
    
    // Combine date and time into ISO string
    const deadline = new Date(`${newDate}T${newTime}`).toISOString();
    
    store.addTempTask(newItemName, deadline);
    setNewItemName('');
    setNewDate(format(new Date(), 'yyyy-MM-dd'));
    setNewTime(format(new Date(), 'HH:mm'));
    setShowAddModal(false);
  };

  const tasks = store.state.tempTasks.filter((t: TempTask) => filter === 'todo' ? !t.isDone : t.isDone);

  const groupedTasks = useMemo(() => {
    if (filter === 'todo') {
      // Sort pending by deadline ascending
      return { 'Pending': [...tasks].sort((a, b) => a.deadline.localeCompare(b.deadline)) };
    }
    
    const groups: { [key: string]: TempTask[] } = {};
    tasks.forEach((t: TempTask) => {
      const date = t.completedAt ? parseISO(t.completedAt) : new Date();
      const month = format(date, 'MMMM yyyy');
      if (!groups[month]) groups[month] = [];
      groups[month].push(t);
    });
    
    // Sort tasks within each month by completion date descending
    Object.keys(groups).forEach(month => {
      groups[month].sort((a, b) => (b.completedAt || '').localeCompare(a.completedAt || ''));
    });

    return groups;
  }, [tasks, filter]);

  return (
    <div className="flex flex-col h-full">
      <div className="p-6 pb-0">
        <h1 className="text-2xl font-black text-zinc-900 mb-6">Task Box</h1>
        <div className="flex bg-zinc-100 p-1 rounded-xl mb-6">
          <button
            onClick={() => setFilter('todo')}
            className={cn(
              "flex-1 py-2 text-xs font-bold uppercase tracking-wider rounded-lg transition-all",
              filter === 'todo' ? "bg-white text-emerald-600 shadow-sm" : "text-zinc-400"
            )}
          >
            Pending
          </button>
          <button
            onClick={() => setFilter('done')}
            className={cn(
              "flex-1 py-2 text-xs font-bold uppercase tracking-wider rounded-lg transition-all",
              filter === 'done' ? "bg-white text-emerald-600 shadow-sm" : "text-zinc-400"
            )}
          >
            Completed
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-6 pb-24">
        {tasks.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-zinc-300">
            <Layers size={48} strokeWidth={1} className="mb-4 opacity-20" />
            <p className="text-sm font-medium">No {filter} tasks</p>
          </div>
        ) : (
          <div className="space-y-6">
            {Object.entries(groupedTasks).map(([month, monthTasks]) => (
              <div key={month} className="space-y-3">
                {filter === 'done' && (
                  <div className="flex items-center gap-3">
                    <div className="h-px flex-1 bg-zinc-100" />
                    <span className="text-[10px] font-black text-zinc-400 uppercase tracking-widest">{month}</span>
                    <div className="h-px flex-1 bg-zinc-100" />
                  </div>
                )}
                <div className="space-y-2">
                  {monthTasks.map((t: TempTask) => (
                    <TaskCard 
                      key={t.id}
                      title={t.name}
                      deadline={t.deadline}
                      isDone={t.isDone}
                      onToggle={() => store.toggleTempTask(t.id)}
                      onDelete={() => {
                        store.deleteTempTask(t.id);
                      }}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        <button 
          onClick={() => setShowAddModal(true)}
          className="fixed bottom-24 right-6 w-14 h-14 bg-zinc-900 text-white rounded-full shadow-lg flex items-center justify-center hover:scale-110 active:scale-95 transition-all"
        >
          <Plus size={24} />
        </button>

        <Modal 
          isOpen={showAddModal} 
          onClose={() => setShowAddModal(false)} 
          title="Add Temporary Task"
        >
          <form onSubmit={handleAdd} className="space-y-4">
            <div>
              <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest block mb-1">Task Name</label>
              <input 
                autoFocus
                type="text" 
                value={newItemName}
                onChange={(e) => setNewItemName(e.target.value)}
                className="w-full bg-zinc-100 border-none rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-emerald-500 transition-all"
                placeholder="What needs to be done?"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest block mb-1">Deadline Date</label>
                <input 
                  type="date" 
                  value={newDate}
                  onChange={(e) => setNewDate(e.target.value)}
                  className="w-full bg-zinc-100 border-none rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-emerald-500 transition-all"
                />
              </div>
              <div>
                <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest block mb-1">Time</label>
                <input 
                  type="time" 
                  value={newTime}
                  onChange={(e) => setNewTime(e.target.value)}
                  className="w-full bg-zinc-100 border-none rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-emerald-500 transition-all"
                />
              </div>
            </div>

            <button 
              type="submit"
              className="w-full bg-emerald-500 text-white font-bold py-3 rounded-xl hover:bg-emerald-600 transition-colors"
            >
              Save Task
            </button>
          </form>
        </Modal>
      </div>
    </div>
  );
};

const CalendarView = ({ store }: { store: any }) => {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedEvent, setSelectedEvent] = useState<WorkEvent | null>(null);
  const [showModal, setShowModal] = useState(false);
  
  // Modal form state
  const [title, setTitle] = useState('');
  const [date, setDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [startTime, setStartTime] = useState('09:00');
  const [endTime, setEndTime] = useState('10:00');

  const weekStart = startOfWeek(currentDate, { weekStartsOn: 1 });
  const days = eachDayOfInterval({ 
    start: weekStart, 
    end: endOfWeek(currentDate, { weekStartsOn: 1 }) 
  });

  const hours = Array.from({ length: 24 }, (_, i) => i);

  const handleAddOrUpdate = (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedEvent) {
      store.updateWorkEvent(selectedEvent.id, { title, date, startTime, endTime });
    } else {
      store.addWorkEvent({ title, date, startTime, endTime, isAllDay: false });
    }
    setShowModal(false);
    setSelectedEvent(null);
  };

  const openAddModal = (day: Date, hour: number) => {
    setSelectedEvent(null);
    setTitle('');
    setDate(format(day, 'yyyy-MM-dd'));
    setStartTime(`${hour.toString().padStart(2, '0')}:00`);
    setEndTime(`${(hour + 1).toString().padStart(2, '0')}:00`);
    setShowModal(true);
  };

  const openEditModal = (event: WorkEvent) => {
    setSelectedEvent(event);
    setTitle(event.title);
    setDate(event.date);
    setStartTime(event.startTime || '09:00');
    setEndTime(event.endTime || '10:00');
    setShowModal(true);
  };

  return (
    <div className="flex flex-col h-full bg-white">
      {/* Header */}
      <div className="p-4 border-b border-zinc-100">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-xl font-black text-zinc-900">{format(currentDate, 'MMMM yyyy')}</h1>
          <div className="flex gap-2">
            <button onClick={() => setCurrentDate(subDays(currentDate, 7))} className="p-2 hover:bg-zinc-100 rounded-full transition-colors">
              <ChevronLeft size={20} />
            </button>
            <button onClick={() => setCurrentDate(new Date())} className="px-3 py-1 text-xs font-bold bg-zinc-100 rounded-full">Today</button>
            <button onClick={() => setCurrentDate(addDays(currentDate, 7))} className="p-2 hover:bg-zinc-100 rounded-full transition-colors">
              <ChevronRight size={20} />
            </button>
          </div>
        </div>
        <div className="grid grid-cols-[50px_1fr] gap-2">
          <div />
          <div className="grid grid-cols-7 text-center">
            {days.map(day => (
              <div key={day.toString()} className="flex flex-col items-center">
                <span className="text-[10px] font-bold text-zinc-400 uppercase">{format(day, 'EEE')}</span>
                <span className={cn(
                  "w-7 h-7 flex items-center justify-center text-sm font-black rounded-full mt-1",
                  isToday(day) ? "bg-emerald-500 text-white" : "text-zinc-900"
                )}>
                  {format(day, 'd')}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Grid */}
      <div className="flex-1 overflow-y-auto relative pb-24">
        <div className="grid grid-cols-[50px_1fr] min-h-[1440px]">
          {/* Time column */}
          <div className="border-r border-zinc-50">
            {hours.map(hour => (
              <div key={hour} className="h-[60px] relative">
                <span className="absolute -top-2 right-2 text-[10px] font-bold text-zinc-300">
                  {hour === 0 ? '' : `${hour}:00`}
                </span>
              </div>
            ))}
          </div>

          {/* Days columns */}
          <div className="grid grid-cols-7 relative">
            {/* Horizontal lines */}
            {hours.map(hour => (
              <div key={hour} className="absolute left-0 right-0 border-t border-zinc-50" style={{ top: hour * 60 }} />
            ))}
            
            {/* Vertical lines */}
            {days.map((_, i) => (
              <div key={i} className="absolute top-0 bottom-0 border-r border-zinc-50" style={{ left: `${(i + 1) * (100 / 7)}%` }} />
            ))}

            {/* Event slots (clickable areas) */}
            {days.map((day, dayIdx) => (
              <div key={day.toString()} className="relative h-full">
                {hours.map(hour => (
                  <div 
                    key={hour} 
                    className="h-[60px] cursor-pointer hover:bg-emerald-50/30 transition-colors"
                    onClick={() => openAddModal(day, hour)}
                  />
                ))}
                
                {/* Render events for this day */}
                {store.state.workEvents
                  .filter((e: WorkEvent) => e.date === format(day, 'yyyy-MM-dd'))
                  .map((event: WorkEvent) => {
                    const start = event.startTime || '00:00';
                    const end = event.endTime || '23:59';
                    const [startH, startM] = start.split(':').map(Number);
                    const [endH, endM] = end.split(':').map(Number);
                    const top = startH * 60 + (startM / 60) * 60;
                    const height = (endH * 60 + (endM / 60) * 60) - top;

                    return (
                      <div
                        key={event.id}
                        onClick={(e) => { e.stopPropagation(); openEditModal(event); }}
                        className={cn(
                          "absolute left-1 right-1 rounded-lg p-2 text-[10px] font-bold overflow-hidden shadow-sm border-l-4 transition-all hover:scale-[1.02] cursor-pointer",
                          event.isDone ? "bg-zinc-100 border-zinc-300 text-zinc-400" : "bg-emerald-50 border-emerald-500 text-emerald-700"
                        )}
                        style={{ top, height: Math.max(height, 20) }}
                      >
                        <div className="truncate">{event.title}</div>
                        <div className="opacity-60">{start} - {end}</div>
                      </div>
                    );
                  })}
              </div>
            ))}
          </div>
        </div>
      </div>

      <Modal 
        isOpen={showModal} 
        onClose={() => { setShowModal(false); setSelectedEvent(null); }} 
        title={selectedEvent ? "Edit Event" : "Add Event"}
      >
        <form onSubmit={handleAddOrUpdate} className="space-y-4">
          <div>
            <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest block mb-1">Event Title</label>
            <input 
              autoFocus
              type="text" 
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full bg-zinc-100 border-none rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-emerald-500 transition-all"
              placeholder="What's happening?"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest block mb-1">Start Time</label>
              <input 
                type="time" 
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                className="w-full bg-zinc-100 border-none rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-emerald-500 transition-all"
              />
            </div>
            <div>
              <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest block mb-1">End Time</label>
              <input 
                type="time" 
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
                className="w-full bg-zinc-100 border-none rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-emerald-500 transition-all"
              />
            </div>
          </div>
          <div className="flex gap-3">
            {selectedEvent && (
              <button 
                type="button"
                onClick={() => { store.deleteWorkEvent(selectedEvent.id); setShowModal(false); setSelectedEvent(null); }}
                className="flex-1 bg-rose-50 text-rose-600 font-bold py-3 rounded-xl hover:bg-rose-100 transition-colors"
              >
                Delete
              </button>
            )}
            <button 
              type="submit"
              className="flex-[2] bg-emerald-500 text-white font-bold py-3 rounded-xl hover:bg-emerald-600 transition-colors"
            >
              {selectedEvent ? "Update Event" : "Save Event"}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
};

const MeView = ({ store }: { store: any }) => {
  const [showHistory, setShowHistory] = useState(false);
  const stats = useMemo(() => {
    const totalDone = 
      store.state.tempTasks.filter((t: any) => t.isDone).length +
      store.state.workEvents.filter((e: any) => e.isDone).length +
      store.state.lifeHabits.reduce((acc: number, h: any) => acc + h.totalCount, 0);
    
    return { totalDone };
  }, [store.state]);

  return (
    <div className="p-6 pb-24">
      <h1 className="text-2xl font-black text-zinc-900 mb-8">My Profile</h1>
      
      <div className="bg-white rounded-3xl border border-zinc-100 p-6 mb-8 flex items-center gap-4">
        <div className="w-16 h-16 bg-emerald-100 rounded-2xl flex items-center justify-center text-emerald-600">
          <User size={32} />
        </div>
        <div>
          <h2 className="text-lg font-bold text-zinc-800">User</h2>
          <p className="text-xs text-zinc-400">Schedule Master</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 mb-8">
        <div className="bg-zinc-900 rounded-3xl p-6 text-white">
          <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-500 mb-1">Total Done</p>
          <p className="text-3xl font-black">{stats.totalDone}</p>
        </div>
        <div className="bg-emerald-500 rounded-3xl p-6 text-white">
          <p className="text-[10px] font-bold uppercase tracking-widest text-emerald-100 mb-1">Active Habits</p>
          <p className="text-3xl font-black">{store.state.lifeHabits.length}</p>
        </div>
      </div>

      <div className="space-y-2">
        <button 
          onClick={() => setShowHistory(true)}
          className="w-full flex items-center justify-between p-4 bg-white rounded-2xl border border-zinc-100 hover:bg-zinc-50 transition-colors"
        >
          <div className="flex items-center gap-3">
            <Clock size={18} className="text-zinc-400" />
            <span className="text-sm font-semibold text-zinc-700">Review History</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-bold text-zinc-300 bg-zinc-50 px-2 py-0.5 rounded-full">
              {store.state.dailyReviews.length}
            </span>
            <ChevronRight size={16} className="text-zinc-300" />
          </div>
        </button>
        <button className="w-full flex items-center justify-between p-4 bg-white rounded-2xl border border-zinc-100 hover:bg-zinc-50 transition-colors">
          <div className="flex items-center gap-3">
            <Settings size={18} className="text-zinc-400" />
            <span className="text-sm font-semibold text-zinc-700">Settings</span>
          </div>
          <ChevronRight size={16} className="text-zinc-300" />
        </button>
        <button 
          onClick={() => {
            if (confirm('Clear all data?')) {
              localStorage.removeItem('dualtrack_schedule_data');
              window.location.reload();
            }
          }}
          className="w-full flex items-center justify-between p-4 bg-white rounded-2xl border border-zinc-100 hover:bg-rose-50 transition-colors group"
        >
          <div className="flex items-center gap-3">
            <Trash2 size={18} className="text-zinc-400 group-hover:text-rose-500" />
            <span className="text-sm font-semibold text-zinc-700 group-hover:text-rose-600">Clear Data</span>
          </div>
          <ChevronRight size={16} className="text-zinc-300" />
        </button>
      </div>

      <Modal isOpen={showHistory} onClose={() => setShowHistory(false)} title="Review History">
        <div className="space-y-6 max-h-[70vh] overflow-y-auto pr-2">
          {store.state.dailyReviews.length === 0 ? (
            <div className="text-center py-12 text-zinc-400 text-sm">No history yet</div>
          ) : (
            [...store.state.dailyReviews].reverse().map((r: any) => (
              <div key={r.date} className="border-l-2 border-emerald-100 pl-4 py-1">
                <div className="text-[10px] font-black text-emerald-600 uppercase tracking-widest mb-2">{r.date}</div>
                <div className="bg-zinc-50 rounded-2xl p-4 mb-3 text-xs text-zinc-600 leading-relaxed italic">
                  <Markdown>{r.aiFeedback}</Markdown>
                </div>
                {r.userThoughts && (
                  <div className="bg-white rounded-2xl border border-zinc-100 p-4 text-xs text-zinc-800">
                    <p className="font-bold text-[10px] text-zinc-400 uppercase mb-1">My Thoughts</p>
                    {r.userThoughts}
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </Modal>
    </div>
  );
};

// --- Main App ---

export default function App() {
  const [activeTab, setActiveTab] = useState('today');
  const store = useScheduleStore();

  return (
    <div className="min-h-screen bg-zinc-50 text-zinc-900 font-sans selection:bg-emerald-100 selection:text-emerald-900">
      <main className="max-w-md mx-auto h-screen relative overflow-hidden flex flex-col">
        <div className="flex-1 overflow-y-auto">
          <AnimatePresence mode="wait">
            <motion.div
              key={activeTab}
              initial={{ opacity: 0, x: 10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -10 }}
              transition={{ duration: 0.2 }}
              className="h-full"
            >
              {activeTab === 'today' && <TodayView store={store} setTab={setActiveTab} />}
              {activeTab === 'fixed' && <FixedTasksView store={store} />}
              {activeTab === 'calendar' && <CalendarView store={store} />}
              {activeTab === 'temp' && <TempTasksView store={store} />}
              {activeTab === 'me' && <MeView store={store} />}
            </motion.div>
          </AnimatePresence>
        </div>

        {/* Navigation */}
        <nav className="absolute bottom-0 left-0 right-0 bg-white/80 backdrop-blur-xl border-t border-zinc-100 flex px-4 pb-safe">
          <TabButton 
            active={activeTab === 'today'} 
            onClick={() => setActiveTab('today')} 
            icon={Home} 
            label="Today" 
          />
          <TabButton 
            active={activeTab === 'fixed'} 
            onClick={() => setActiveTab('fixed')} 
            icon={Layers} 
            label="Fixed" 
          />
          <TabButton 
            active={activeTab === 'calendar'} 
            onClick={() => setActiveTab('calendar')} 
            icon={Calendar} 
            label="Calendar" 
          />
          <TabButton 
            active={activeTab === 'temp'} 
            onClick={() => setActiveTab('temp')} 
            icon={Clock} 
            label="Temp" 
          />
          <TabButton 
            active={activeTab === 'me'} 
            onClick={() => setActiveTab('me')} 
            icon={User} 
            label="Me" 
          />
        </nav>
      </main>
    </div>
  );
}
