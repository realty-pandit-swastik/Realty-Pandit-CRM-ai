/**
 * Task & Project Management Board - Phase 3.3
 * Kanban, List, and Calendar views with drag-and-drop
 */

import { useState, useEffect } from 'react';
import { Calendar, List, LayoutGrid, Plus, X, Save } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useIsMobile } from '../hooks/useIsMobile';
import { API_BASE_URL, authedFetch } from '../lib/api';
import { useConfirm } from '../contexts/ConfirmContext';
import { defaultReminderDate } from '../lib/defaultReminder';
import './AdvancedAnalytics.css';

interface Project {
  id: string;
  name: string;
  description?: string;
  status: string;
  start_date: string;
  end_date?: string;
  owner_id?: string;
  _count?: { tasks: number };
}

interface Task {
  id: string;
  project_id?: string;
  project?: { id: string; name: string };
  title: string;
  description?: string;
  assigned_to: string;
  due_date: string;
  priority: string;
  status: string;
  contact_phone?: string;
  property_id?: string;
  tags: string[];
  completed_at?: string;
  created_at: string;
}

const STATUSES = ['TODO', 'IN_PROGRESS', 'DONE', 'BLOCKED'];
const PRIORITIES = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'];
const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  TODO: { label: 'To Do', color: 'bg-gray-100 text-gray-700' },
  IN_PROGRESS: { label: 'In Progress', color: 'bg-blue-100 text-blue-700' },
  DONE: { label: 'Done', color: 'bg-green-100 text-green-700' },
  BLOCKED: { label: 'Blocked', color: 'bg-red-100 text-red-700' },
};

const PRIORITY_COLORS: Record<string, string> = {
  LOW: 'text-gray-500',
  MEDIUM: 'text-yellow-600',
  HIGH: 'text-orange-600',
  URGENT: 'text-red-600',
};

export default function TaskBoard() {
  const { agent } = useAuth();
  const confirm = useConfirm();
  const isMobile = useIsMobile();
  const [viewMode, setViewMode] = useState<'kanban' | 'list' | 'calendar'>('kanban');
  const [mobileStatusTab, setMobileStatusTab] = useState<string>('TODO');
  const [tasks, setTasks] = useState<Task[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [stats, setStats] = useState<any>(null);
  const [selectedProject, setSelectedProject] = useState<string | null>(null);
  const [isCreatingTask, setIsCreatingTask] = useState(false);
  const [isCreatingProject, setIsCreatingProject] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const [taskForm, setTaskForm] = useState<Partial<Task>>({
    title: '',
    description: '',
    assigned_to: agent?.id || '',
    due_date: defaultReminderDate(),
    priority: 'MEDIUM',
    status: 'TODO',
    tags: [],
  });

  const [projectForm, setProjectForm] = useState<Partial<Project>>({
    name: '',
    description: '',
    status: 'ACTIVE',
    start_date: new Date().toISOString().split('T')[0],
  });

  useEffect(() => {
    fetchTasks();
    fetchProjects();
    fetchStats();
  }, [selectedProject]);

  const fetchTasks = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (selectedProject) params.append('project_id', selectedProject);

      const response = await authedFetch(`${API_BASE_URL}/api/tasks?${params}`);
      const data = await response.json();
      setTasks(data.tasks || []);
    } catch {
      setError('Failed to load tasks');
    } finally {
      setLoading(false);
    }
  };

  const fetchProjects = async () => {
    try {
      const response = await authedFetch(`${API_BASE_URL}/api/projects`);
      const data = await response.json();
      setProjects(data.projects || []);
    } catch (err: any) {
      console.error('Failed to load projects:', err);
    }
  };

  const fetchStats = async () => {
    try {
      const response = await authedFetch(`${API_BASE_URL}/api/tasks/stats/summary`);
      const data = await response.json();
      setStats(data);
    } catch (err: any) {
      console.error('Failed to load stats:', err);
    }
  };

  const handleSaveTask = async () => {
    try {
      if (!taskForm.title || !taskForm.assigned_to || !taskForm.due_date) {
        setError('Title, assigned to, and due date are required');
        return;
      }

      const url = editingTask
        ? `${API_BASE_URL}/api/tasks/${editingTask.id}`
        : `${API_BASE_URL}/api/tasks`;

      const method = editingTask ? 'PATCH' : 'POST';

      const response = await authedFetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...taskForm,
          project_id: selectedProject,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to save task');
      }

      setSuccess(`Task ${editingTask ? 'updated' : 'created'} successfully`);
      setIsCreatingTask(false);
      setEditingTask(null);
      fetchTasks();
      fetchStats();
      setTimeout(() => setSuccess(''), 3000);
    } catch (err: any) {
      setError(err.message);
      setTimeout(() => setError(''), 5000);
    }
  };

  const handleSaveProject = async () => {
    try {
      if (!projectForm.name) {
        setError('Project name is required');
        return;
      }

      const response = await authedFetch(`${API_BASE_URL}/api/projects`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(projectForm),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to create project');
      }

      setSuccess('Project created successfully');
      setIsCreatingProject(false);
      fetchProjects();
      setTimeout(() => setSuccess(''), 3000);
    } catch (err: any) {
      setError(err.message);
      setTimeout(() => setError(''), 5000);
    }
  };

  const handleDeleteTask = async (id: string) => {
    const ok = await confirm('Are you sure you want to delete this task?');
    if (!ok) return;

    try {
      const response = await authedFetch(`${API_BASE_URL}/api/tasks/${id}`, {
        method: 'DELETE',
      });

      if (!response.ok) throw new Error('Failed to delete task');

      setSuccess('Task deleted successfully');
      fetchTasks();
      fetchStats();
      setTimeout(() => setSuccess(''), 3000);
    } catch (err: any) {
      setError(err.message);
      setTimeout(() => setError(''), 5000);
    }
  };

  const handleStatusChange = async (taskId: string, newStatus: string) => {
    try {
      const response = await authedFetch(`${API_BASE_URL}/api/tasks/${taskId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });

      if (!response.ok) throw new Error('Failed to update task status');

      fetchTasks();
      fetchStats();
    } catch (err: any) {
      setError(err.message);
      setTimeout(() => setError(''), 5000);
    }
  };

  const handleDragStart = (e: React.DragEvent, taskId: string) => {
    e.dataTransfer.setData('taskId', taskId);
  };

  const handleDrop = (e: React.DragEvent, newStatus: string) => {
    e.preventDefault();
    const taskId = e.dataTransfer.getData('taskId');
    if (taskId) {
      handleStatusChange(taskId, newStatus);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const getTasksByStatus = (status: string) => {
    return tasks.filter(task => task.status === status);
  };

  const renderKanbanView = () => {
    if (isMobile) {
      const activeTasks = getTasksByStatus(mobileStatusTab);
      return (
        <div className="space-y-3">
          {/* Mobile Status Segmented Tabs */}
          <div className="flex gap-1.5 overflow-x-auto pb-1.5 scrollbar-none">
            {STATUSES.map(status => {
              const count = getTasksByStatus(status).length;
              const isActive = mobileStatusTab === status;
              const cfg = STATUS_LABELS[status];
              return (
                <button
                  key={status}
                  onClick={() => setMobileStatusTab(status)}
                  className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors flex-shrink-0 ${
                    isActive ? 'bg-blue-600 text-white shadow-sm' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  <span>{cfg.label}</span>
                  <span className={`px-1.5 py-0.5 rounded-full text-[10px] ${isActive ? 'bg-white/25 text-white' : 'bg-gray-300 text-gray-700'}`}>
                    {count}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Cards for active status */}
          <div className="space-y-2.5">
            {activeTasks.map(task => (
              <div
                key={task.id}
                className="bg-white p-3.5 rounded-xl shadow-sm border border-gray-200"
              >
                <div className="flex justify-between items-start gap-2 mb-1.5">
                  <h4 className="font-semibold text-sm text-gray-900 flex-1 leading-snug">{task.title}</h4>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <button
                      onClick={() => {
                        setTaskForm(task);
                        setEditingTask(task);
                        setIsCreatingTask(true);
                      }}
                      className="text-blue-600 p-1 text-xs"
                      title="Edit task"
                    >
                      ✎
                    </button>
                    <button
                      onClick={() => handleDeleteTask(task.id)}
                      className="text-red-500 p-1 text-xs"
                      title="Delete task"
                    >
                      ✕
                    </button>
                  </div>
                </div>

                {task.description && (
                  <p className="text-xs text-gray-600 mb-2 line-clamp-2">{task.description}</p>
                )}

                <div className="flex items-center justify-between text-xs pt-2 border-t border-gray-100 gap-2 flex-wrap">
                  <div className="flex items-center gap-2">
                    <span className={`font-semibold ${PRIORITY_COLORS[task.priority]}`}>
                      {task.priority}
                    </span>
                    <span className="text-gray-500">
                      📅 {new Date(task.due_date).toLocaleDateString()}
                    </span>
                    {task.project && (
                      <span className="text-gray-500 truncate max-w-[120px]">
                        📁 {task.project.name}
                      </span>
                    )}
                  </div>

                  {/* Status switcher right on card for touch */}
                  <select
                    value={task.status}
                    onChange={(e) => handleStatusChange(task.id, e.target.value)}
                    className="text-xs font-semibold px-2 py-1 rounded bg-gray-100 border border-gray-200 text-gray-700"
                  >
                    {STATUSES.map(s => (
                      <option key={s} value={s}>{STATUS_LABELS[s].label}</option>
                    ))}
                  </select>
                </div>

                {task.tags.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {task.tags.map((tag, idx) => (
                      <span key={idx} className="text-[10px] bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded">
                        {tag}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            ))}

            {activeTasks.length === 0 && (
              <div className="text-center py-10 text-gray-400 text-sm bg-gray-50 rounded-xl border border-dashed border-gray-200">
                No tasks in {STATUS_LABELS[mobileStatusTab].label}
              </div>
            )}
          </div>
        </div>
      );
    }

    return (
      <div className="flex gap-4 overflow-x-auto pb-4">
        {STATUSES.map(status => {
          const statusTasks = getTasksByStatus(status);
          const statusConfig = STATUS_LABELS[status];

          return (
            <div
              key={status}
              className="flex-shrink-0 w-80 bg-gray-50 rounded-lg"
              onDrop={(e) => handleDrop(e, status)}
              onDragOver={handleDragOver}
            >
              <div className="p-4 border-b bg-white rounded-t-lg">
                <div className="flex justify-between items-center">
                  <h3 className="font-semibold text-gray-900">
                    {statusConfig.label}
                    <span className="ml-2 text-sm text-gray-500">({statusTasks.length})</span>
                  </h3>
                </div>
              </div>
              <div className="p-3 space-y-3 max-h-[calc(100vh-300px)] overflow-y-auto">
                {statusTasks.map(task => (
                  <div
                    key={task.id}
                    draggable
                    onDragStart={(e) => handleDragStart(e, task.id)}
                    className="bg-white p-3 rounded-lg shadow-sm border hover:shadow-md transition cursor-move"
                  >
                    <div className="flex justify-between items-start mb-2">
                      <h4 className="font-medium text-sm flex-1">{task.title}</h4>
                      <button
                        onClick={() => {
                          setTaskForm(task);
                          setEditingTask(task);
                          setIsCreatingTask(true);
                        }}
                        className="text-gray-400 hover:text-gray-600 ml-2"
                      >
                        ✎
                      </button>
                    </div>
                    {task.description && (
                      <p className="text-xs text-gray-600 mb-2 line-clamp-2">{task.description}</p>
                    )}
                    <div className="flex items-center gap-2 text-xs">
                      <span className={`font-medium ${PRIORITY_COLORS[task.priority]}`}>
                        {task.priority}
                      </span>
                      <span className="text-gray-500">
                        {new Date(task.due_date).toLocaleDateString()}
                      </span>
                    </div>
                    {task.tags.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1">
                        {task.tags.map((tag, idx) => (
                          <span key={idx} className="text-xs bg-blue-50 text-blue-600 px-2 py-0.5 rounded">
                            {tag}
                          </span>
                        ))}
                      </div>
                    )}
                    {task.project && (
                      <div className="mt-2 text-xs text-gray-500">
                        📁 {task.project.name}
                      </div>
                    )}
                  </div>
                ))}
                {statusTasks.length === 0 && (
                  <div className="text-center text-gray-400 text-sm py-8">
                    No tasks
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  const renderListView = () => {
    if (isMobile) {
      return (
        <div className="space-y-2.5">
          {tasks.map(task => (
            <div key={task.id} className="bg-white p-3.5 rounded-xl shadow-sm border border-gray-200">
              <div className="flex justify-between items-start gap-2 mb-1.5">
                <h4 className="font-semibold text-sm text-gray-900 flex-1 leading-snug">{task.title}</h4>
                <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${STATUS_LABELS[task.status].color}`}>
                  {STATUS_LABELS[task.status].label}
                </span>
              </div>
              {task.description && (
                <p className="text-xs text-gray-600 mb-2 line-clamp-2">{task.description}</p>
              )}
              <div className="flex items-center justify-between text-xs pt-2 border-t border-gray-100 gap-2 flex-wrap">
                <div className="flex items-center gap-2">
                  <span className={`font-semibold ${PRIORITY_COLORS[task.priority]}`}>
                    {task.priority}
                  </span>
                  <span className="text-gray-500">
                    📅 {new Date(task.due_date).toLocaleDateString()}
                  </span>
                  {task.project && (
                    <span className="text-gray-500 truncate max-w-[120px]">
                      📁 {task.project.name}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => {
                      setTaskForm(task);
                      setEditingTask(task);
                      setIsCreatingTask(true);
                    }}
                    className="text-blue-600 text-xs font-semibold"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => handleDeleteTask(task.id)}
                    className="text-red-600 text-xs font-semibold"
                  >
                    Delete
                  </button>
                </div>
              </div>
            </div>
          ))}
          {tasks.length === 0 && (
            <div className="text-center py-12 text-gray-500 bg-white rounded-xl shadow">
              No tasks found
            </div>
          )}
        </div>
      );
    }
    return (
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-50 border-b">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Title</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Priority</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Due Date</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Project</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Tags</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {tasks.map(task => (
              <tr key={task.id} className="hover:bg-gray-50">
                <td className="px-4 py-3">
                  <div className="font-medium text-sm">{task.title}</div>
                  {task.description && (
                    <div className="text-xs text-gray-500 line-clamp-1">{task.description}</div>
                  )}
                </td>
                <td className="px-4 py-3">
                  <select
                    value={task.status}
                    onChange={(e) => handleStatusChange(task.id, e.target.value)}
                    className={`text-xs px-2 py-1 rounded ${STATUS_LABELS[task.status].color}`}
                  >
                    {STATUSES.map(s => (
                      <option key={s} value={s}>{STATUS_LABELS[s].label}</option>
                    ))}
                  </select>
                </td>
                <td className="px-4 py-3">
                  <span className={`text-xs font-medium ${PRIORITY_COLORS[task.priority]}`}>
                    {task.priority}
                  </span>
                </td>
                <td className="px-4 py-3 text-sm text-gray-600">
                  {new Date(task.due_date).toLocaleDateString()}
                </td>
                <td className="px-4 py-3 text-sm text-gray-600">
                  {task.project?.name || '-'}
                </td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap gap-1">
                    {task.tags.slice(0, 2).map((tag, idx) => (
                      <span key={idx} className="text-xs bg-blue-50 text-blue-600 px-2 py-0.5 rounded">
                        {tag}
                      </span>
                    ))}
                    {task.tags.length > 2 && (
                      <span className="text-xs text-gray-400">+{task.tags.length - 2}</span>
                    )}
                  </div>
                </td>
                <td className="px-4 py-3 text-right">
                  <button
                    onClick={() => {
                      setTaskForm(task);
                      setEditingTask(task);
                      setIsCreatingTask(true);
                    }}
                    className="text-blue-600 hover:text-blue-700 mr-3 text-sm"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => handleDeleteTask(task.id)}
                    className="text-red-600 hover:text-red-700 text-sm"
                  >
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {tasks.length === 0 && (
          <div className="text-center py-12 text-gray-500">
            No tasks found
          </div>
        )}
      </div>
    );
  };

  const renderCalendarView = () => {
    const groupedByDate = tasks.reduce((acc, task) => {
      const date = new Date(task.due_date).toLocaleDateString();
      if (!acc[date]) acc[date] = [];
      acc[date].push(task);
      return acc;
    }, {} as Record<string, Task[]>);

    const sortedDates = Object.keys(groupedByDate).sort((a, b) =>
      new Date(a).getTime() - new Date(b).getTime()
    );

    return (
      <div className="bg-white rounded-lg shadow p-6">
        <div className="space-y-6">
          {sortedDates.map(date => (
            <div key={date}>
              <h3 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
                <Calendar className="w-4 h-4" />
                {date}
                <span className="text-sm text-gray-500">({groupedByDate[date].length} tasks)</span>
              </h3>
              <div className="space-y-2">
                {groupedByDate[date].map(task => (
                  <div
                    key={task.id}
                    className="flex items-center gap-3 p-3 border rounded-lg hover:bg-gray-50"
                  >
                    <span className={`w-2 h-2 rounded-full ${
                      task.status === 'DONE' ? 'bg-green-500' :
                      task.status === 'IN_PROGRESS' ? 'bg-blue-500' :
                      task.status === 'BLOCKED' ? 'bg-red-500' :
                      'bg-gray-400'
                    }`}></span>
                    <div className="flex-1">
                      <div className="font-medium text-sm">{task.title}</div>
                      <div className="flex gap-2 text-xs text-gray-500 mt-1">
                        <span className={PRIORITY_COLORS[task.priority]}>{task.priority}</span>
                        <span>•</span>
                        <span>{STATUS_LABELS[task.status].label}</span>
                        {task.project && (
                          <>
                            <span>•</span>
                            <span>{task.project.name}</span>
                          </>
                        )}
                      </div>
                    </div>
                    <button
                      onClick={() => {
                        setTaskForm(task);
                        setEditingTask(task);
                        setIsCreatingTask(true);
                      }}
                      className="text-blue-600 hover:text-blue-700 text-sm"
                    >
                      Edit
                    </button>
                  </div>
                ))}
              </div>
            </div>
          ))}
          {sortedDates.length === 0 && (
            <div className="text-center py-12 text-gray-500">
              No tasks scheduled
            </div>
          )}
        </div>
      </div>
    );
  };

  if (loading) {
    return <div className="p-6">Loading tasks...</div>;
  }

  return (
    <div className="p-3 md:p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="mb-4 md:mb-6 flex justify-between items-center">
        <div>
          <h1 className="text-xl md:text-3xl font-bold text-gray-900">📋 Task Management</h1>
          {!isMobile && <p className="text-gray-600 mt-1">Organize and track all tasks with AI-powered automation</p>}
        </div>
        {isMobile && (
          <button
            onClick={() => {
              setTaskForm({
                title: '',
                description: '',
                assigned_to: agent?.id || '',
                due_date: defaultReminderDate(),
                priority: 'MEDIUM',
                status: 'TODO',
                tags: [],
              });
              setEditingTask(null);
              setIsCreatingTask(true);
            }}
            className="flex items-center gap-1 px-3 py-2 bg-blue-600 text-white text-xs font-bold rounded-lg shadow-sm"
          >
            <Plus className="w-4 h-4" />
            New Task
          </button>
        )}
      </div>

      {/* Alerts */}
      {error && (
        <div className="mb-4 p-3 md:p-4 bg-red-50 border border-red-200 text-red-700 text-xs md:text-sm rounded-lg">
          {error}
        </div>
      )}
      {success && (
        <div className="mb-4 p-3 md:p-4 bg-green-50 border border-green-200 text-green-700 text-xs md:text-sm rounded-lg">
          {success}
        </div>
      )}

      {/* Stats Cards */}
      {stats && (
        <div className="flex gap-2 overflow-x-auto pb-2 mb-4 scrollbar-none md:grid md:grid-cols-5 md:gap-4 md:mb-6">
          <div className="bg-white p-3 md:p-4 rounded-xl shadow-sm border border-gray-100 flex-shrink-0 min-w-[110px] md:min-w-0">
            <div className="text-xl md:text-2xl font-bold text-gray-900">{stats.total}</div>
            <div className="text-xs md:text-sm text-gray-600">Total Tasks</div>
          </div>
          <div className="bg-blue-50 p-3 md:p-4 rounded-xl shadow-sm border border-blue-100 flex-shrink-0 min-w-[110px] md:min-w-0">
            <div className="text-xl md:text-2xl font-bold text-blue-600">{stats?.by_status?.IN_PROGRESS ?? 0}</div>
            <div className="text-xs md:text-sm text-blue-700">In Progress</div>
          </div>
          <div className="bg-green-50 p-3 md:p-4 rounded-xl shadow-sm border border-green-100 flex-shrink-0 min-w-[110px] md:min-w-0">
            <div className="text-xl md:text-2xl font-bold text-green-600">{stats?.by_status?.DONE ?? 0}</div>
            <div className="text-xs md:text-sm text-green-700">Completed</div>
          </div>
          <div className="bg-red-50 p-3 md:p-4 rounded-xl shadow-sm border border-red-100 flex-shrink-0 min-w-[110px] md:min-w-0">
            <div className="text-xl md:text-2xl font-bold text-red-600">{stats?.overdue ?? 0}</div>
            <div className="text-xs md:text-sm text-red-700">Overdue</div>
          </div>
          <div className="bg-orange-50 p-3 md:p-4 rounded-xl shadow-sm border border-orange-100 flex-shrink-0 min-w-[110px] md:min-w-0">
            <div className="text-xl md:text-2xl font-bold text-orange-600">{stats?.high_priority ?? 0}</div>
            <div className="text-xs md:text-sm text-orange-700">High Priority</div>
          </div>
        </div>
      )}

      {/* Toolbar */}
      <div className="mb-4 md:mb-6 flex flex-col md:flex-row md:justify-between md:items-center gap-2.5">
        <div className="flex gap-1.5 w-full md:w-auto">
          <button
            onClick={() => setViewMode('kanban')}
            className={`flex-1 md:flex-initial flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs md:text-sm font-semibold transition-colors ${
              viewMode === 'kanban'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'bg-white border border-gray-200 text-gray-700 hover:bg-gray-50'
            }`}
          >
            <LayoutGrid className="w-4 h-4" />
            Kanban
          </button>
          <button
            onClick={() => setViewMode('list')}
            className={`flex-1 md:flex-initial flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs md:text-sm font-semibold transition-colors ${
              viewMode === 'list'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'bg-white border border-gray-200 text-gray-700 hover:bg-gray-50'
            }`}
          >
            <List className="w-4 h-4" />
            List
          </button>
          <button
            onClick={() => setViewMode('calendar')}
            className={`flex-1 md:flex-initial flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs md:text-sm font-semibold transition-colors ${
              viewMode === 'calendar'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'bg-white border border-gray-200 text-gray-700 hover:bg-gray-50'
            }`}
          >
            <Calendar className="w-4 h-4" />
            Calendar
          </button>
        </div>

        <div className="flex gap-2 w-full md:w-auto">
          <select
            value={selectedProject || ''}
            onChange={(e) => setSelectedProject(e.target.value || null)}
            className="flex-1 md:flex-initial px-3 py-2 border border-gray-200 rounded-lg text-xs md:text-sm bg-white text-gray-800"
          >
            <option value="">All Projects</option>
            {projects.map(p => (
              <option key={p.id} value={p.id}>
                {p.name} ({p._count?.tasks || 0})
              </option>
            ))}
          </select>

          <button
            onClick={() => setIsCreatingProject(true)}
            className="px-3 py-2 border border-gray-200 rounded-lg text-xs md:text-sm bg-white hover:bg-gray-50 flex-shrink-0 text-gray-700 font-medium"
          >
            + Project
          </button>

          {!isMobile && (
            <button
              onClick={() => {
                setTaskForm({
                  title: '',
                  description: '',
                  assigned_to: agent?.id || '',
                  due_date: defaultReminderDate(),
                  priority: 'MEDIUM',
                  status: 'TODO',
                  tags: [],
                });
                setEditingTask(null);
                setIsCreatingTask(true);
              }}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-semibold shadow-sm"
            >
              <Plus className="w-5 h-5" />
              New Task
            </button>
          )}
        </div>
      </div>

      {/* View Content */}
      {viewMode === 'kanban' && renderKanbanView()}
      {viewMode === 'list' && renderListView()}
      {viewMode === 'calendar' && renderCalendarView()}

      {/* Task Editor Modal */}
      {isCreatingTask && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-2 md:p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[92vh] overflow-y-auto flex flex-col">
            <div className="p-4 md:p-6 border-b sticky top-0 bg-white z-10 flex justify-between items-center">
              <h2 className="text-lg md:text-2xl font-bold text-gray-900">
                {editingTask ? 'Edit Task' : 'Create New Task'}
              </h2>
              <button onClick={() => setIsCreatingTask(false)} className="text-gray-500 hover:text-gray-700 p-1">
                <X className="w-5 h-5 md:w-6 md:h-6" />
              </button>
            </div>

            <div className="p-4 md:p-6 space-y-4 flex-1">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Title *</label>
                <input
                  type="text"
                  value={taskForm.title}
                  onChange={(e) => setTaskForm({ ...taskForm, title: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg text-sm"
                  placeholder="Complete property documentation"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                <textarea
                  value={taskForm.description || ''}
                  onChange={(e) => setTaskForm({ ...taskForm, description: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg text-sm"
                  rows={3}
                  placeholder="Additional details..."
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Priority</label>
                  <select
                    value={taskForm.priority}
                    onChange={(e) => setTaskForm({ ...taskForm, priority: e.target.value })}
                    className="w-full px-3 py-2 border rounded-lg text-sm bg-white"
                  >
                    {PRIORITIES.map(p => (
                      <option key={p} value={p}>{p}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
                  <select
                    value={taskForm.status}
                    onChange={(e) => setTaskForm({ ...taskForm, status: e.target.value })}
                    className="w-full px-3 py-2 border rounded-lg text-sm bg-white"
                  >
                    {STATUSES.map(s => (
                      <option key={s} value={s}>{STATUS_LABELS[s].label}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Due Date *</label>
                <input
                  type="date"
                  value={taskForm.due_date}
                  onChange={(e) => setTaskForm({ ...taskForm, due_date: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg text-sm"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Assigned To *</label>
                <input
                  type="text"
                  value={taskForm.assigned_to}
                  onChange={(e) => setTaskForm({ ...taskForm, assigned_to: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg text-sm"
                  placeholder="Agent ID"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Tags (comma-separated)</label>
                <input
                  type="text"
                  value={taskForm.tags?.join(', ') || ''}
                  onChange={(e) => setTaskForm({ ...taskForm, tags: e.target.value.split(',').map(t => t.trim()).filter(Boolean) })}
                  className="w-full px-3 py-2 border rounded-lg text-sm"
                  placeholder="follow-up, urgent, payment"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Contact Phone</label>
                  <input
                    type="text"
                    value={taskForm.contact_phone || ''}
                    onChange={(e) => setTaskForm({ ...taskForm, contact_phone: e.target.value })}
                    className="w-full px-3 py-2 border rounded-lg text-sm"
                    placeholder="+911234567890"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Property ID</label>
                  <input
                    type="text"
                    value={taskForm.property_id || ''}
                    onChange={(e) => setTaskForm({ ...taskForm, property_id: e.target.value })}
                    className="w-full px-3 py-2 border rounded-lg text-sm"
                    placeholder="property-id"
                  />
                </div>
              </div>
            </div>

            <div className="p-4 md:p-6 border-t bg-gray-50 flex justify-end gap-3 sticky bottom-0">
              <button
                onClick={() => setIsCreatingTask(false)}
                className="px-4 py-2 border rounded-lg hover:bg-gray-100 text-sm font-medium text-gray-700"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveTask}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-semibold shadow-sm"
              >
                <Save className="w-4 h-4" />
                Save Task
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Project Creator Modal */}
      {isCreatingProject && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-2 md:p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-xl max-h-[92vh] overflow-y-auto flex flex-col">
            <div className="p-4 md:p-6 border-b flex justify-between items-center sticky top-0 bg-white z-10">
              <h2 className="text-lg md:text-2xl font-bold text-gray-900">Create New Project</h2>
              <button onClick={() => setIsCreatingProject(false)} className="text-gray-500 hover:text-gray-700 p-1">
                <X className="w-5 h-5 md:w-6 md:h-6" />
              </button>
            </div>

            <div className="p-4 md:p-6 space-y-4 flex-1">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Project Name *</label>
                <input
                  type="text"
                  value={projectForm.name}
                  onChange={(e) => setProjectForm({ ...projectForm, name: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg text-sm"
                  placeholder="Noida Phase 1 Launch"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                <textarea
                  value={projectForm.description || ''}
                  onChange={(e) => setProjectForm({ ...projectForm, description: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg text-sm"
                  rows={3}
                  placeholder="Project details..."
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Start Date</label>
                  <input
                    type="date"
                    value={projectForm.start_date}
                    onChange={(e) => setProjectForm({ ...projectForm, start_date: e.target.value })}
                    className="w-full px-3 py-2 border rounded-lg text-sm"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">End Date</label>
                  <input
                    type="date"
                    value={projectForm.end_date || ''}
                    onChange={(e) => setProjectForm({ ...projectForm, end_date: e.target.value })}
                    className="w-full px-3 py-2 border rounded-lg text-sm"
                  />
                </div>
              </div>
            </div>

            <div className="p-4 md:p-6 border-t bg-gray-50 flex justify-end gap-3 sticky bottom-0">
              <button
                onClick={() => setIsCreatingProject(false)}
                className="px-4 py-2 border rounded-lg hover:bg-gray-100 text-sm font-medium text-gray-700"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveProject}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-semibold shadow-sm"
              >
                <Save className="w-4 h-4" />
                Create Project
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
