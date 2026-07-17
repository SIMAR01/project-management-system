import React, { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../../../context/AuthContext";
import {
  useProjectTasksQuery,
  useCreateTaskMutation,
  useUpdateTaskMutation,
  useDeleteTaskMutation,
  useTaskEventsQuery,
  useBulkDeleteTasksMutation,
} from "../hooks/useTaskQueries";
import { useWorkspaceQuery } from "../../projects/hooks/useProjectQueries";
import { useTaskSocketSync } from "../hooks/useTaskSocketSync";
import { Task, TaskStatus } from "../types/task.types";
import {
  Kanban,
  Plus,
  MoreVertical,
  ArrowRight,
  Clock,
  Trash2,
  CheckCircle2,
  Loader2,
  ArrowLeft,
  X,
  AlertCircle,
  History,
  User,
  FileText,
  CheckSquare,
  Square,
  Filter,
} from "lucide-react";

const COLUMNS: { id: TaskStatus; label: string; color: string }[] = [
  { id: "todo", label: "To Do", color: "text-slate-400 bg-slate-500/10 border-slate-500/20" },
  { id: "inprogress", label: "In Progress", color: "text-brand-400 bg-brand-500/10 border-brand-500/20" },
  { id: "underreview", label: "Review", color: "text-amber-400 bg-amber-500/10 border-amber-500/20" },
  { id: "done", label: "Done", color: "text-emerald-400 bg-emerald-500/10 border-emerald-500/20" },
];

export const KanbanBoard: React.FC = () => {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();

  // Initialize Socket.IO sync for this specific project board
  useTaskSocketSync(projectId!);

  const { data: tasks = [], isLoading, error } = useProjectTasksQuery(projectId!);

  const { data: project } = useWorkspaceQuery(projectId!);
  const createMutation = useCreateTaskMutation(projectId!);
  const updateMutation = useUpdateTaskMutation(projectId!);
  const deleteMutation = useDeleteTaskMutation(projectId!);
  const bulkDeleteMutation = useBulkDeleteTasksMutation(projectId!);

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [newTaskTitle, setNewTaskTitle] = useState("");
  const [newTaskDesc, setNewTaskDesc] = useState("");
  const [createError, setCreateError] = useState<string | null>(null);
  const [boardError, setBoardError] = useState<string | null>(null);

  const [selectedTaskForEdit, setSelectedTaskForEdit] = useState<Task | null>(null);
  const [taskToDelete, setTaskToDelete] = useState<Task | null>(null);

  // Filters state
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [assigneeFilter, setAssigneeFilter] = useState<string>("all");

  // Bulk Mode state
  const [isBulkMode, setIsBulkMode] = useState(false);
  const [selectedTaskIds, setSelectedTaskIds] = useState<string[]>([]);
  const [bulkConfirmOpen, setBulkConfirmOpen] = useState(false);

  // Compile member list options for assignee filtering
  const members = project ? [
    { userId: project.owner, name: project.ownerName || "Owner", username: project.ownerUsername || "owner" },
    ...(project.members || [])
      .filter((m) => m.userId !== project.owner)
      .map((m) => ({ userId: m.userId, name: m.name || "Member", username: m.username || "member" }))
  ] : [];

  // Filter tasks locally based on filters selection
  const filteredTasks = tasks.filter((t) => {
    // 1. Status column filter (only filter column lists if statusFilter is not 'all')
    if (statusFilter !== "all" && t.status !== statusFilter) {
      return false;
    }
    // 2. Assignee filter
    if (assigneeFilter !== "all") {
      if (assigneeFilter === "unassigned") {
        if (t.assigneeId) return false;
      } else {
        if (t.assigneeId !== assigneeFilter) {
          return false;
        }
      }
    }
    return true;
  });

  const triggerBoardError = (msg: string) => {
    setBoardError(msg);
    setTimeout(() => {
      setBoardError((prev) => (prev === msg ? null : prev));
    }, 5000);
  };

  const handleCreateSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setCreateError(null);

    const title = newTaskTitle.trim();
    const desc = newTaskDesc.trim();

    if (!title) {
      setCreateError("Task title cannot be empty");
      return;
    }
    if (title.length > 200) {
      setCreateError("Task title cannot exceed 200 characters");
      return;
    }
    if (desc.length > 2000) {
      setCreateError("Description cannot exceed 2000 characters");
      return;
    }

    createMutation.mutate(
      { title, description: desc || undefined, status: "todo" },
      {
        onSuccess: () => {
          setIsCreateOpen(false);
          setNewTaskTitle("");
          setNewTaskDesc("");
        },
        onError: (err: any) => {
          setCreateError(err.response?.data?.message || "Failed to create task");
        },
      }
    );
  };

  const handleMoveTask = (task: Task) => {
    const next = getNextStatus(task.status);
    if (!next) return;

    updateMutation.mutate(
      { taskId: task.taskId, updates: { status: next } },
      {
        onError: (err: any) => {
          triggerBoardError(err.response?.data?.message || "Failed to update task status");
        },
      }
    );
  };



  const getNextStatus = (current: TaskStatus): TaskStatus | null => {
    const idx = COLUMNS.findIndex(c => c.id === current);
    if (idx < COLUMNS.length - 1) return COLUMNS[idx + 1].id;
    return null;
  };

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center min-h-[50vh]">
        <Loader2 className="w-8 h-8 text-brand-500 animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center min-h-[50vh] text-center">
        <AlertCircle className="w-10 h-10 text-red-500 mb-4" />
        <h3 className="text-lg font-bold text-slate-200">Failed to load board</h3>
        <button onClick={() => navigate("/dashboard")} className="mt-4 text-brand-400 hover:underline">
          Return to Dashboard
        </button>
      </div>
    );
  }

  // Find latest state of selectedTaskForEdit from the query list to allow live updates
  const activeTask = selectedTaskForEdit
    ? tasks.find((t) => t.taskId === selectedTaskForEdit.taskId) || selectedTaskForEdit
    : null;

  return (
    <div className="flex flex-col h-full space-y-6">
      {/* Board Error Notification Banner */}
      {boardError && (
        <div className="bg-red-500/10 border border-red-500/30 text-red-200 p-4 rounded-xl text-sm flex items-center justify-between animate-fade-in">
          <div className="flex items-center gap-2.5">
            <AlertCircle className="w-5 h-5 text-red-400 shrink-0" />
            <span>{boardError}</span>
          </div>
          <button
            onClick={() => setBoardError(null)}
            className="text-slate-400 hover:text-slate-200 transition-colors p-1 hover:bg-slate-800/50 rounded-lg"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <button
            onClick={() => navigate("/dashboard")}
            className="flex items-center gap-1.5 text-xs font-semibold text-slate-400 hover:text-slate-200 transition-colors mb-2"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Back to Dashboard</span>
          </button>
          <h2 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2">
            <Kanban className="w-6 h-6 text-brand-500" />
            <span>Task Board</span>
          </h2>
        </div>

        <button
          onClick={() => setIsCreateOpen(true)}
          className="flex items-center justify-center gap-1.5 bg-gradient-to-tr from-brand-600 to-violet-500 hover:from-brand-500 hover:to-violet-400 active:scale-98 text-white font-medium py-2 px-4 rounded-lg text-sm transition-all shadow-md shadow-brand-500/10 shrink-0"
        >
          <Plus className="w-4 h-4" />
          <span>New Task</span>
        </button>
      </div>

      {/* Controls: Filters + Bulk Mode Actions */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 p-4 rounded-xl bg-slate-900/30 border border-slate-800/80 backdrop-blur-sm">

        {/* Left Side: Local Filters */}
        <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
          <div className="flex items-center gap-1.5 text-slate-400 text-xs font-bold uppercase tracking-wider">
            <Filter className="w-3.5 h-3.5 text-brand-400" />
            <span>Filters:</span>
          </div>

          {/* Status Filter */}
          <div className="flex items-center gap-1">
            <label className="text-[10px] text-slate-500 font-semibold uppercase">Status</label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-slate-300 focus:outline-none focus:border-brand-500 cursor-pointer"
            >
              <option value="all">All</option>
              <option value="todo">To Do</option>
              <option value="inprogress">In Progress</option>
              <option value="underreview">Review</option>
              <option value="done">Done</option>
            </select>
          </div>

          {/* Assignee Filter */}
          <div className="flex items-center gap-1">
            <label className="text-[10px] text-slate-500 font-semibold uppercase">Assignee</label>
            <select
              value={assigneeFilter}
              onChange={(e) => setAssigneeFilter(e.target.value)}
              className="bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-slate-300 focus:outline-none focus:border-brand-500 cursor-pointer"
            >
              <option value="all">All</option>
              <option value="unassigned">Unassigned</option>
              {members.map((m) => (
                <option key={m.userId} value={m.userId}>
                  {m.name} (@{m.username})
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Right Side: Bulk Actions Mode toggles */}
        <div className="flex items-center gap-3 w-full md:w-auto justify-end">
          {isBulkMode ? (
            <div className="flex items-center gap-2 w-full justify-between md:justify-end">
              <span className="text-xs text-brand-400 font-semibold">
                {selectedTaskIds.length} selected
              </span>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    // Toggle Select All / Deselect All
                    if (selectedTaskIds.length === filteredTasks.length) {
                      setSelectedTaskIds([]);
                    } else {
                      setSelectedTaskIds(filteredTasks.map((t) => t.taskId));
                    }
                  }}
                  className="px-3 py-1.5 text-xs bg-slate-800 hover:bg-slate-700 text-slate-200 font-medium rounded-lg border border-slate-700 transition-all"
                >
                  {selectedTaskIds.length === filteredTasks.length ? "Deselect All" : "Select All"}
                </button>
                <button
                  disabled={selectedTaskIds.length === 0 || bulkDeleteMutation.isPending}
                  onClick={() => setBulkConfirmOpen(true)}
                  className="px-3 py-1.5 text-xs bg-red-600 hover:bg-red-500 disabled:opacity-50 text-white font-medium rounded-lg transition-all flex items-center gap-1"
                >
                  {bulkDeleteMutation.isPending && <Loader2 className="w-3 animate-spin" />}
                  <span>Delete Selected</span>
                </button>
                <button
                  onClick={() => {
                    setIsBulkMode(false);
                    setSelectedTaskIds([]);
                  }}
                  className="px-3 py-1.5 text-xs text-slate-400 hover:text-slate-200 transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setIsBulkMode(true)}
              className="flex items-center gap-1 px-3.5 py-1.5 text-xs bg-slate-900 border border-slate-800 hover:border-slate-700 text-slate-300 hover:text-slate-100 font-medium rounded-lg transition-all"
            >
              <CheckSquare className="w-3.5 h-3.5 text-slate-500" />
              <span>Bulk Action Select</span>
            </button>
          )}
        </div>
      </div>

      {/* Kanban Grid */}
      <div className="flex-1 overflow-x-auto overflow-y-hidden pb-4">
        <div className="flex gap-6 h-full min-w-max">
          {COLUMNS.map((col) => {
            const columnTasks = filteredTasks.filter((t) => t.status === col.id);
            return (
              <div key={col.id} className="w-80 flex flex-col h-[calc(100vh-260px)] min-h-[400px] shrink-0">
                {/* Column Header */}
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-sm font-bold uppercase tracking-wider text-slate-200 flex items-center gap-2">
                    <span className={`w-2 h-2 rounded-full bg-current ${col.color.split(' ')[0]}`} />
                    {col.label}
                  </h3>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${col.color}`}>
                    {columnTasks.length}
                  </span>
                </div>

                {/* Task List */}
                <div className="flex-1 overflow-y-auto space-y-3 pr-2 scrollbar-thin scrollbar-thumb-slate-800 scrollbar-track-transparent">
                  {columnTasks.map((task) => (
                    <TaskCard
                      key={task.taskId}
                      task={task}
                      onMove={() => handleMoveTask(task)}
                      onDelete={() => setTaskToDelete(task)}
                      onClick={() => setSelectedTaskForEdit(task)}
                      isBulkMode={isBulkMode}
                      isSelected={selectedTaskIds.includes(task.taskId)}
                      onSelectToggle={() => {
                        setSelectedTaskIds((prev) =>
                          prev.includes(task.taskId)
                            ? prev.filter((id) => id !== task.taskId)
                            : [...prev, task.taskId]
                        );
                      }}
                    />
                  ))}
                  {columnTasks.length === 0 && (
                    <div className="h-24 rounded-xl border-2 border-dashed border-slate-800/60 flex items-center justify-center text-xs text-slate-500 font-medium">
                      No tasks
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Create Task Modal */}
      {isCreateOpen && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="glass-card w-full max-w-md rounded-2xl shadow-2xl overflow-hidden border border-slate-800/80">
            <div className="px-6 py-4 bg-slate-900/40 border-b border-slate-800/80 flex items-center justify-between">
              <h3 className="font-bold text-slate-100">Create Task</h3>
              <button onClick={() => setIsCreateOpen(false)} className="text-slate-400 hover:text-slate-200">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleCreateSubmit} className="p-6 space-y-4">
              {createError && (
                <div className="bg-red-500/10 border border-red-500/30 text-red-200 p-3 rounded-lg text-xs flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                  <span>{createError}</span>
                </div>
              )}
              <div>
                <div className="flex justify-between items-center mb-1.5">
                  <label className="block text-xs font-bold uppercase text-slate-400 tracking-wider">
                    Title <span className="text-red-500">*</span>
                  </label>
                  <span className={`text-[10px] ${newTaskTitle.length > 200 ? 'text-red-400 font-bold' : 'text-slate-500'}`}>
                    {newTaskTitle.length}/200
                  </span>
                </div>
                <input
                  type="text"
                  required
                  autoFocus
                  placeholder="What needs to be done?"
                  value={newTaskTitle}
                  onChange={(e) => {
                    setNewTaskTitle(e.target.value);
                    if (e.target.value.trim().length === 0) {
                      setCreateError("Task title is required");
                    } else if (e.target.value.length > 200) {
                      setCreateError("Task title cannot exceed 200 characters");
                    } else {
                      setCreateError(null);
                    }
                  }}
                  className={`w-full px-3.5 py-2 bg-slate-900 border rounded-lg text-sm text-slate-200 focus:outline-none focus:border-brand-500 ${newTaskTitle.length > 200 ? 'border-red-500' : 'border-slate-800'
                    }`}
                />
              </div>
              <div>
                <div className="flex justify-between items-center mb-1.5">
                  <label className="block text-xs font-bold uppercase text-slate-400 tracking-wider">
                    Description <span className="text-slate-600 font-normal capitalize">(Optional)</span>
                  </label>
                  <span className={`text-[10px] ${newTaskDesc.length > 2000 ? 'text-red-400 font-bold' : 'text-slate-500'}`}>
                    {newTaskDesc.length}/2000
                  </span>
                </div>
                <textarea
                  placeholder="Add details..."
                  value={newTaskDesc}
                  onChange={(e) => {
                    setNewTaskDesc(e.target.value);
                    if (e.target.value.length > 2000) {
                      setCreateError("Description cannot exceed 2000 characters");
                    } else {
                      setCreateError(null);
                    }
                  }}
                  rows={3}
                  className={`w-full px-3.5 py-2 bg-slate-900 border rounded-lg text-sm text-slate-200 focus:outline-none focus:border-brand-500 resize-none ${newTaskDesc.length > 2000 ? 'border-red-500' : 'border-slate-800'
                    }`}
                />
              </div>
              <div className="pt-2 flex justify-end gap-2 text-sm font-semibold">
                <button
                  type="button"
                  onClick={() => setIsCreateOpen(false)}
                  className="px-4 py-2 text-slate-400 hover:text-slate-200 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={createMutation.isPending || !newTaskTitle.trim() || newTaskTitle.length > 200 || newTaskDesc.length > 2000}
                  className="px-4 py-2 bg-brand-600 hover:bg-brand-500 active:scale-98 text-white rounded-lg transition-all flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {createMutation.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
                  <span>Add Task</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Bulk Delete Tasks Confirmation Modal */}
      {bulkConfirmOpen && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="glass-card w-full max-w-sm rounded-2xl shadow-2xl overflow-hidden border border-slate-800/80">
            <div className="px-6 py-4 bg-slate-900/40 border-b border-slate-800/80 flex items-center justify-between">
              <h3 className="font-bold text-slate-100 flex items-center gap-2 text-sm">
                <AlertCircle className="w-4 h-4 text-red-450" />
                <span>Confirm Bulk Delete</span>
              </h3>
              <button
                onClick={() => setBulkConfirmOpen(false)}
                className="text-slate-400 hover:text-slate-200 p-1 hover:bg-slate-800/50 rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <p className="text-xs text-slate-300 leading-relaxed">
                Are you sure you want to permanently delete the <span className="text-white font-bold">{selectedTaskIds.length}</span> selected tasks? This action cannot be undone.
              </p>

              <div className="flex justify-end gap-2 text-xs font-semibold pt-2">
                <button
                  type="button"
                  onClick={() => setBulkConfirmOpen(false)}
                  className="px-4 py-2 border border-slate-700 text-slate-300 hover:text-white rounded-lg transition-colors hover:bg-slate-800"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setBulkConfirmOpen(false);
                    bulkDeleteMutation.mutate(selectedTaskIds, {
                      onSuccess: () => {
                        setSelectedTaskIds([]);
                        setIsBulkMode(false);
                      },
                      onError: (err: any) => {
                        triggerBoardError(err.response?.data?.message || "Failed to bulk delete tasks");
                      },
                    });
                  }}
                  className="px-4 py-2 bg-red-650 hover:bg-red-650 active:scale-98 text-white rounded-lg transition-all"
                >
                  Confirm Delete
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Delete Task Confirmation Modal */}
      {taskToDelete && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="glass-card w-full max-w-sm rounded-2xl shadow-2xl overflow-hidden border border-slate-800/80">
            <div className="px-6 py-4 bg-slate-900/40 border-b border-slate-800/80 flex items-center justify-between">
              <h3 className="font-bold text-slate-100 flex items-center gap-2 text-sm">
                <AlertCircle className="w-4 h-4 text-red-450" />
                <span>Confirm Delete</span>
              </h3>
              <button
                onClick={() => setTaskToDelete(null)}
                className="text-slate-400 hover:text-slate-200 p-1 hover:bg-slate-800/50 rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <p className="text-xs text-slate-300 leading-relaxed">
                Are you sure you want to permanently delete the task <span className="text-white font-semibold">"{taskToDelete.title}"</span>? This action cannot be undone.
              </p>

              <div className="flex justify-end gap-2 text-xs font-semibold pt-2">
                <button
                  type="button"
                  onClick={() => setTaskToDelete(null)}
                  className="px-4 py-2 border border-slate-700 text-slate-300 hover:text-white rounded-lg transition-colors hover:bg-slate-800"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const taskId = taskToDelete.taskId;
                    setTaskToDelete(null);
                    deleteMutation.mutate(taskId, {
                      onError: (err: any) => {
                        triggerBoardError(err.response?.data?.message || "Failed to delete task");
                      },
                    });
                  }}
                  className="px-4 py-2 bg-red-650 hover:bg-red-650 active:scale-98 text-white rounded-lg transition-all"
                >
                  Confirm Delete
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Task Details & Edit Modal */}
      {activeTask && (
        <TaskDetailsModal
          task={activeTask}
          projectId={projectId!}
          onClose={() => setSelectedTaskForEdit(null)}
        />
      )}
    </div>
  );
};

const TaskCard: React.FC<{
  task: Task;
  onMove: () => void;
  onDelete: () => void;
  onClick: () => void;
  isBulkMode?: boolean;
  isSelected?: boolean;
  onSelectToggle?: () => void;
}> = ({ task, onMove, onDelete, onClick, isBulkMode = false, isSelected = false, onSelectToggle }) => {
  const [showMenu, setShowMenu] = useState(false);

  const handleCardClick = (e: React.MouseEvent) => {
    if (isBulkMode) {
      e.stopPropagation();
      if (onSelectToggle) onSelectToggle();
    } else {
      onClick();
    }
  };

  return (
    <div
      onClick={handleCardClick}
      className={`cursor-pointer glass-card p-4 rounded-xl border transition-all relative bg-slate-900/50 ${isBulkMode
        ? isSelected
          ? "border-brand-500/80 bg-brand-500/5 shadow-md shadow-brand-500/5"
          : "border-slate-800/80 hover:border-slate-700 hover:bg-slate-900/40"
        : "border-slate-800/80 hover:border-slate-700 hover:bg-slate-900/40"
        }`}
    >
      {/* Top row: Status/Time + Menu */}
      <div className="flex items-start justify-between mb-2">
        <div className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-slate-500">
          {isBulkMode && (
            <span className="mr-1 mt-0.5 shrink-0 text-brand-400">
              {isSelected ? (
                <CheckSquare className="w-3.5 h-3.5" />
              ) : (
                <Square className="w-3.5 h-3.5" />
              )}
            </span>
          )}
          <Clock className="w-3 h-3" />
          <span>{new Date(task.createdAt).toLocaleDateString()}</span>
        </div>

        {!isBulkMode && (
          <div className="relative">
            <button
              onClick={(e) => {
                e.stopPropagation();
                setShowMenu(!showMenu);
              }}
              className="p-1 rounded-md text-slate-500 hover:text-slate-300 hover:bg-slate-800 transition-colors"
            >
              <MoreVertical className="w-4 h-4" />
            </button>

            {showMenu && (
              <>
                {/* Invisible overlay to close dropdown safely on click outside */}
                <div
                  className="fixed inset-0 z-10 cursor-default"
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowMenu(false);
                  }}
                />
                <div className="absolute right-0 top-full mt-1 w-32 bg-slate-800 border border-slate-700 rounded-lg shadow-xl py-1 z-20">
                  <button
                    onMouseDown={(e) => {
                      e.stopPropagation();
                      onDelete();
                      setShowMenu(false);
                    }}
                    className="w-full text-left px-3 py-1.5 text-xs text-red-400 hover:bg-slate-700 flex items-center gap-2"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    Delete
                  </button>
                </div>
              </>
            )}
          </div>
        )}
      </div>

      <h4 className="text-sm font-semibold text-slate-200 mb-1 leading-snug break-words">
        {task.title}
      </h4>

      {task.description && (
        <p className="text-xs text-slate-400 line-clamp-2 mb-3">
          {task.description}
        </p>
      )}

      {/* Bottom actions */}
      <div className="flex items-center justify-between mt-3 pt-3 border-t border-slate-800/60">
        <div className="text-[10px] text-slate-500 truncate max-w-[200px]" title={task.assignee?.name || "Unassigned"}>
          {task.assignee?.name ? `Assignee: ${task.assignee.name}` : task.assigneeId ? `Assignee ID: ${task.assigneeId.substring(0, 8)}...` : 'Unassigned'}
        </div>

        {task.status !== "done" ? (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onMove();
            }}
            title="Move to next stage"
            className="p-1.5 rounded-lg bg-slate-800 hover:bg-brand-500/20 text-slate-400 hover:text-brand-400 border border-slate-700 hover:border-brand-500/30 transition-all"
          >
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        ) : (
          <div className="p-1.5 rounded-lg text-emerald-400 bg-emerald-500/10 border border-emerald-500/20">
            <CheckCircle2 className="w-3.5 h-3.5" />
          </div>
        )}
      </div>
    </div>
  );
};

/**
 * Details and editing Modal for a single Task.
 * Provides text field saves, status/assignee selection, and event activity log feeds.
 */
const TaskDetailsModal: React.FC<{
  task: Task;
  projectId: string;
  onClose: () => void;
}> = ({ task, projectId, onClose }) => {
  const queryClient = useQueryClient();
  const { data: project } = useWorkspaceQuery(projectId);
  const updateMutation = useUpdateTaskMutation(projectId);

  const [title, setTitle] = useState(task.title);
  const [desc, setDesc] = useState(task.description || "");
  const [status, setStatus] = useState(task.status);
  const [assigneeId, setAssigneeId] = useState(task.assigneeId || "");

  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [showTimeline, setShowTimeline] = useState(false);

  // Read latest task fields directly from the local list cache to react to real-time socket events instantly
  const cachedTasks = queryClient.getQueryData<Task[]>(["project-tasks", projectId]) || [];
  const currentTask = cachedTasks.find((t) => t.taskId === task.taskId) || task;

  useEffect(() => {
    setTitle(currentTask.title);
    setDesc(currentTask.description || "");
    setStatus(currentTask.status);
    setAssigneeId(currentTask.assigneeId || "");
  }, [currentTask.title, currentTask.description, currentTask.status, currentTask.assigneeId]);

  const { data: events = [], isLoading: isEventsLoading } = useTaskEventsQuery(
    projectId,
    task.taskId,
    showTimeline
  );

  const handleUpdateField = (updates: any) => {
    setError(null);
    setSuccess(null);
    updateMutation.mutate(
      { taskId: task.taskId, updates },
      {
        onSuccess: () => {
          setSuccess("Updated successfully");
          setTimeout(() => setSuccess(null), 2000);
        },
        onError: (err: any) => {
          setError(err.response?.data?.message || "Failed to update task");
        },
      }
    );
  };

  const handleSaveTextChanges = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanTitle = title.trim();
    const cleanDesc = desc.trim();

    if (!cleanTitle) {
      setError("Title cannot be empty");
      return;
    }
    if (cleanTitle.length > 200) {
      setError("Title cannot exceed 200 characters");
      return;
    }
    if (cleanDesc.length > 2000) {
      setError("Description cannot exceed 2000 characters");
      return;
    }

    handleUpdateField({
      title: cleanTitle,
      description: cleanDesc || null,
    });
  };

  const getTimelineEventDescription = (ev: any) => {
    const actor = ev.actor?.name || ev.actor?.username || "Someone";
    switch (ev.eventType) {
      case "TASK_CREATED":
        return `${actor} created this task`;
      case "STATUS_CHANGED":
        return `${actor} changed status from "${ev.payload?.previousStatus}" to "${ev.payload?.newStatus}"`;
      case "ASSIGNEE_CHANGED":
        const newAssignee = ev.payload?.newAssigneeId ? "a team member" : "unassigned";
        return `${actor} changed assignee to ${newAssignee}`;
      case "TASK_UPDATED":
        return `${actor} updated task ${ev.payload?.field || "details"}`;
      case "TASK_DELETED":
        return `${actor} deleted this task`;
      default:
        return `${actor} triggered event: ${ev.eventType}`;
    }
  };

  // Compile member options
  const members = project ? [
    { userId: project.owner, name: project.ownerName || "Owner", username: project.ownerUsername || "owner" },
    ...(project.members || [])
      .filter((m) => m.userId !== project.owner)
      .map((m) => ({ userId: m.userId, name: m.name || "Member", username: m.username || "member" }))
  ] : [];

  return (
    <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="glass-card w-full max-w-2xl rounded-2xl shadow-2xl overflow-hidden border border-slate-800/80 flex flex-col max-h-[90vh]">

        {/* Header */}
        <div className="px-6 py-4 bg-slate-900/40 border-b border-slate-800/80 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold bg-slate-800 text-slate-300 px-2 py-0.5 rounded border border-slate-700">
              Task Details
            </span>
            {success && (
              <span className="text-xs text-emerald-400 font-medium animate-pulse">
                {success}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowTimeline(!showTimeline)}
              title="Task History Timeline"
              className={`p-1.5 rounded-lg border transition-all ${showTimeline
                ? "bg-brand-500/20 text-brand-400 border-brand-500/40"
                : "bg-slate-800 text-slate-400 border-slate-700 hover:text-slate-200"
                }`}
            >
              <History className="w-4 h-4" />
            </button>
            <button onClick={onClose} className="text-slate-400 hover:text-slate-200 p-1 hover:bg-slate-800/50 rounded-lg">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-6 flex flex-col md:flex-row gap-6">
          {/* Left panel: Editable Text info */}
          <form onSubmit={handleSaveTextChanges} className="flex-1 space-y-4">
            {error && (
              <div className="bg-red-500/10 border border-red-500/30 text-red-200 p-3 rounded-lg text-xs flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}

            <div>
              <div className="flex justify-between items-center mb-1.5">
                <label className="block text-xs font-bold uppercase text-slate-400 tracking-wider">
                  Title
                </label>
                <span className={`text-[10px] ${title.length > 200 ? 'text-red-400 font-bold' : 'text-slate-500'}`}>
                  {title.length}/200
                </span>
              </div>
              <input
                type="text"
                value={title}
                onChange={(e) => {
                  setTitle(e.target.value);
                  if (e.target.value.trim().length === 0) {
                    setError("Title cannot be empty");
                  } else if (e.target.value.length < 5) {
                    setError("Title cannot be less than 5 characters");
                  } else if (e.target.value.length > 200) {
                    setError("Title cannot exceed 200 characters");
                  } else {
                    setError(null);
                  }
                }}
                className={`w-full px-3.5 py-2 bg-slate-900 border rounded-lg text-sm text-slate-200 focus:outline-none focus:border-brand-500 ${title.length > 200 ? 'border-red-500' : 'border-slate-800'
                  }`}
              />
            </div>

            <div>
              <div className="flex justify-between items-center mb-1.5">
                <label className="block text-xs font-bold uppercase text-slate-400 tracking-wider">
                  Description
                </label>
                <span className={`text-[10px] ${desc.length > 2000 ? 'text-red-400 font-bold' : 'text-slate-500'}`}>
                  {desc.length}/2000
                </span>
              </div>
              <textarea
                value={desc}
                onChange={(e) => {
                  setDesc(e.target.value);
                  if (e.target.value.length > 2000) {
                    setError("Description cannot exceed 2000 characters");
                  } else {
                    setError(null);
                  }
                }}
                rows={5}
                placeholder="Add details about this task..."
                className={`w-full px-3.5 py-2 bg-slate-900 border rounded-lg text-sm text-slate-200 focus:outline-none focus:border-brand-500 resize-none ${desc.length > 2000 ? 'border-red-500' : 'border-slate-800'
                  }`}
              />
            </div>

            <div className="flex justify-end pt-2">
              <button
                type="submit"
                disabled={
                  updateMutation.isPending ||
                  !title.trim() ||
                  title.length < 5 ||
                  title.length > 200 ||
                  desc.length > 2000 ||
                  (title === currentTask.title && desc === (currentTask.description || ""))
                }
                className="px-4 py-2 bg-brand-600 hover:bg-brand-500 disabled:opacity-50 disabled:cursor-not-allowed active:scale-98 text-white text-xs font-semibold rounded-lg transition-all flex items-center gap-1.5"
              >
                {updateMutation.isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                <span>Save Changes</span>
              </button>
            </div>
          </form>

          {/* Right panel: Meta controls */}
          <div className="w-full md:w-56 space-y-5 shrink-0 border-t md:border-t-0 md:border-l border-slate-850 pt-5 md:pt-0 md:pl-6">

            {/* Status Selector */}
            <div>
              <label className="block text-xs font-bold uppercase text-slate-400 tracking-wider mb-1.5">
                Status
              </label>
              <select
                value={status}
                onChange={(e) => {
                  const val = e.target.value as TaskStatus;
                  setStatus(val);
                  handleUpdateField({ status: val });
                }}
                className="w-full px-3 py-1.5 bg-slate-900 border border-slate-800 rounded-lg text-xs text-slate-200 focus:outline-none focus:border-brand-500 cursor-pointer"
              >
                <option value="todo">To Do</option>
                <option value="inprogress">In Progress</option>
                <option value="underreview">Review</option>
                <option value="done">Done</option>
              </select>
            </div>

            {/* Assignee Selector */}
            <div>
              <label className="block text-xs font-bold uppercase text-slate-400 tracking-wider mb-1.5">
                Assignee
              </label>
              <select
                value={assigneeId}
                onChange={(e) => {
                  const val = e.target.value;
                  setAssigneeId(val);
                  handleUpdateField({ assigneeId: val || null });
                }}
                className="w-full px-3 py-1.5 bg-slate-900 border border-slate-800 rounded-lg text-xs text-slate-200 focus:outline-none focus:border-brand-500 cursor-pointer"
              >
                <option value="">Unassigned</option>
                {members.map((m) => (
                  <option key={m.userId} value={m.userId}>
                    {m.name} (@{m.username})
                  </option>
                ))}
              </select>
            </div>

            {/* Task Info Dates */}
            <div className="text-[10px] text-slate-500 space-y-1.5 pt-4 border-t border-slate-800/80">
              <div className="flex items-center gap-1">
                <Clock className="w-3.5 h-3.5 text-slate-600" />
                <span>Created: {new Date(currentTask.createdAt).toLocaleString()}</span>
              </div>
              <div className="flex items-center gap-1">
                <Clock className="w-3.5 h-3.5 text-slate-600" />
                <span>Updated: {new Date(currentTask.updatedAt).toLocaleString()}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Timeline Panel */}
        {showTimeline && (
          <div className="border-t border-slate-800 bg-slate-950/20 flex-1 overflow-y-auto max-h-[35vh] p-6 flex flex-col shrink-0">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-4 flex items-center gap-1.5 shrink-0">
              <History className="w-3.5 h-3.5 text-brand-400" />
              <span>Task History Timeline</span>
            </h4>

            <div className="flex-1 overflow-y-auto min-h-0 space-y-4">
              {isEventsLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-5 h-5 text-brand-500 animate-spin" />
                </div>
              ) : events.length === 0 ? (
                <div className="text-center py-6 text-xs text-slate-600">
                  No logged events for this task.
                </div>
              ) : (
                <div className="relative border-l border-slate-800/60 pl-3 ml-2 space-y-4 py-1">
                  {events.map((ev: any) => (
                    <div key={ev.eventId || ev._id} className="relative text-xs">
                      {/* Timeline dot */}
                      <span className="absolute -left-[19px] top-1 w-2.5 h-2.5 rounded-full bg-slate-800 border border-slate-700" />
                      <div>
                        <p className="text-slate-300 font-medium leading-relaxed">
                          {getTimelineEventDescription(ev)}
                        </p>
                        <span className="text-[9px] text-slate-500 block mt-0.5">
                          {new Date(ev.timestamp).toLocaleString()}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
