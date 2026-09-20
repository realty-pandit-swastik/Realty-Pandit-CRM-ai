/**
 * Workflow Builder - Phase 3.1 Frontend
 * Visual workflow automation creator for Panditji AI
 */

import { useState, useEffect } from 'react';
import { Save, Plus, Trash2, Power, PowerOff, TestTube, X, Play, ChevronRight } from 'lucide-react';
import { API_BASE_URL, authedFetch } from '../lib/api';
import { useConfirm } from '../contexts/ConfirmContext';

interface WorkflowCondition {
  field: string;
  operator: 'equals' | 'not_equals' | 'contains' | 'greater_than' | 'less_than' | 'in' | 'not_in';
  value: string | number | string[];
}

interface WorkflowAction {
  type: 'ASSIGN_AGENT' | 'SEND_WHATSAPP' | 'SEND_EMAIL' | 'CREATE_TASK' | 'UPDATE_STATUS' | 'SEND_VOICE_CALL' | 'UPDATE_FIELD';
  params: Record<string, any>;
}

interface Workflow {
  id?: string;
  name: string;
  description?: string;
  trigger: string;
  conditions: WorkflowCondition[];
  actions: WorkflowAction[];
  delay_minutes: number;
  priority: number;
  max_executions_per_day?: number;
  enabled: boolean;
  created_at?: string;
  updated_at?: string;
  _count?: { executions: number };
}

interface WorkflowExecution {
  id: string;
  workflow_id: string;
  trigger_data: any;
  status: string;
  error_message?: string;
  actions_log: any[];
  executed_at: string;
  duration_ms?: number;
}

const TRIGGERS = [
  { value: 'LEAD_CREATED', label: 'Lead Created', desc: 'When a new lead enters the system' },
  { value: 'STATUS_CHANGED', label: 'Lead Status Changed', desc: 'When lead status updates' },
  { value: 'PROPERTY_ADDED', label: 'Property Added', desc: 'When new inventory is added' },
  { value: 'APPOINTMENT_SCHEDULED', label: 'Appointment Scheduled', desc: 'When site visit is booked' },
  { value: 'APPOINTMENT_COMPLETED', label: 'Appointment Completed', desc: 'After site visit completes' },
  { value: 'INTERACTION_RECEIVED', label: 'Interaction Received', desc: 'When contact sends message' },
  { value: 'LIFECYCLE_STAGE_CHANGED', label: 'Lifecycle Stage Changed', desc: 'When lead progresses in funnel' },
];

const ACTION_TYPES = [
  { value: 'ASSIGN_AGENT', label: 'Assign to Agent', icon: '👤', fields: ['agent_id'] },
  { value: 'SEND_WHATSAPP', label: 'Send WhatsApp', icon: '💬', fields: ['message', 'template'] },
  { value: 'SEND_EMAIL', label: 'Send Email', icon: '📧', fields: ['to', 'subject', 'body'] },
  { value: 'CREATE_TASK', label: 'Create Task', icon: '✅', fields: ['notes', 'priority', 'due_date'] },
  { value: 'UPDATE_STATUS', label: 'Update Status', icon: '🔄', fields: ['status'] },
  { value: 'UPDATE_FIELD', label: 'Update Field', icon: '✏️', fields: ['field', 'value'] },
];

const CONDITION_OPERATORS = [
  { value: 'equals', label: 'Equals' },
  { value: 'not_equals', label: 'Not Equals' },
  { value: 'contains', label: 'Contains' },
  { value: 'greater_than', label: 'Greater Than' },
  { value: 'less_than', label: 'Less Than' },
  { value: 'in', label: 'In List' },
  { value: 'not_in', label: 'Not In List' },
];

const COMMON_FIELDS = [
  'phone_number', 'contact_type', 'lead_status', 'lifecycle_stage', 'lead_source',
  'assigned_to', 'intent', 'budget_min', 'budget_max', 'location', 'property_type'
];

export default function WorkflowBuilder() {
  const confirm = useConfirm();
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [selectedWorkflow, setSelectedWorkflow] = useState<Workflow | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [executionHistory, setExecutionHistory] = useState<WorkflowExecution[]>([]);
  const [showExecutions, setShowExecutions] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Form state
  const [formData, setFormData] = useState<Workflow>({
    name: '',
    description: '',
    trigger: '',
    conditions: [],
    actions: [],
    delay_minutes: 0,
    priority: 0,
    enabled: true,
  });

  const API_BASE = API_BASE_URL;

  useEffect(() => {
    fetchWorkflows();
  }, []);

  const fetchWorkflows = async () => {
    try {
      setLoading(true);
      const response = await authedFetch(`${API_BASE}/api/workflows`);
      const data = await response.json();
      setWorkflows(data.workflows || []);
    } catch {
      setError('Failed to load workflows');
    } finally {
      setLoading(false);
    }
  };

  const fetchExecutions = async (workflowId: string) => {
    try {
      const response = await authedFetch(`${API_BASE}/api/workflows/${workflowId}/executions`);
      const data = await response.json();
      setExecutionHistory(data.executions || []);
      setShowExecutions(true);
    } catch {
      setError('Failed to load execution history');
    }
  };

  const handleCreateNew = () => {
    setFormData({
      name: '',
      description: '',
      trigger: '',
      conditions: [],
      actions: [],
      delay_minutes: 0,
      priority: 0,
      enabled: true,
    });
    setSelectedWorkflow(null);
    setIsEditing(true);
  };

  const handleEdit = (workflow: Workflow) => {
    setFormData(workflow);
    setSelectedWorkflow(workflow);
    setIsEditing(true);
  };

  const handleSave = async () => {
    try {
      // Validation
      if (!formData.name || !formData.trigger || formData.actions.length === 0) {
        setError('Name, trigger, and at least one action are required');
        return;
      }

      const url = selectedWorkflow
        ? `${API_BASE}/api/workflows/${selectedWorkflow.id}`
        : `${API_BASE}/api/workflows`;

      const method = selectedWorkflow ? 'PATCH' : 'POST';

      const response = await authedFetch(url, {
        method,
        body: JSON.stringify(formData),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to save workflow');
      }

      setSuccess(`Workflow ${selectedWorkflow ? 'updated' : 'created'} successfully`);
      setIsEditing(false);
      fetchWorkflows();
      setTimeout(() => setSuccess(''), 3000);
    } catch (err: any) {
      setError(err.message);
      setTimeout(() => setError(''), 5000);
    }
  };

  const handleDelete = async (id: string) => {
    const ok = await confirm('Are you sure you want to delete this workflow?');
    if (!ok) return;

    try {
      const response = await authedFetch(`${API_BASE}/api/workflows/${id}`, { method: 'DELETE' });

      if (!response.ok) throw new Error('Failed to delete workflow');

      setSuccess('Workflow deleted successfully');
      fetchWorkflows();
      setTimeout(() => setSuccess(''), 3000);
    } catch (err: any) {
      setError(err.message);
      setTimeout(() => setError(''), 5000);
    }
  };

  const handleToggle = async (id: string) => {
    try {
      const response = await authedFetch(`${API_BASE}/api/workflows/${id}/toggle`, { method: 'POST' });

      if (!response.ok) throw new Error('Failed to toggle workflow');

      setSuccess('Workflow toggled successfully');
      fetchWorkflows();
      setTimeout(() => setSuccess(''), 3000);
    } catch (err: any) {
      setError(err.message);
      setTimeout(() => setError(''), 5000);
    }
  };

  const handleTest = async (id: string) => {
    const testData = prompt('Enter test data (JSON format):');
    if (!testData) return;

    try {
      const parsedData = JSON.parse(testData);
      const response = await authedFetch(`${API_BASE}/api/workflows/${id}/test`, {
        method: 'POST',
        body: JSON.stringify({ test_data: parsedData }),
      });

      if (!response.ok) throw new Error('Test failed');

      setSuccess('Workflow test triggered successfully');
      setTimeout(() => setSuccess(''), 3000);
    } catch (err: any) {
      setError(err.message || 'Invalid JSON or test failed');
      setTimeout(() => setError(''), 5000);
    }
  };

  const addCondition = () => {
    setFormData({
      ...formData,
      conditions: [...formData.conditions, { field: '', operator: 'equals', value: '' }],
    });
  };

  const updateCondition = (index: number, field: keyof WorkflowCondition, value: any) => {
    const newConditions = [...formData.conditions];
    newConditions[index] = { ...newConditions[index], [field]: value };
    setFormData({ ...formData, conditions: newConditions });
  };

  const removeCondition = (index: number) => {
    setFormData({
      ...formData,
      conditions: formData.conditions.filter((_, i) => i !== index),
    });
  };

  const addAction = () => {
    setFormData({
      ...formData,
      actions: [...formData.actions, { type: 'SEND_WHATSAPP', params: {} }],
    });
  };

  const updateAction = (index: number, field: 'type' | 'params', value: any) => {
    const newActions = [...formData.actions];
    if (field === 'type') {
      newActions[index] = { type: value, params: {} };
    } else {
      newActions[index] = { ...newActions[index], params: value };
    }
    setFormData({ ...formData, actions: newActions });
  };

  const removeAction = (index: number) => {
    setFormData({
      ...formData,
      actions: formData.actions.filter((_, i) => i !== index),
    });
  };

  if (loading) {
    return <div className="p-6">Loading workflows...</div>;
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="mb-6 flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">🤖 AI Workflow Automation</h1>
          <p className="text-gray-600 mt-1">Configure Panditji to automate lead handling, assignments, and follow-ups</p>
        </div>
        <button
          onClick={handleCreateNew}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
        >
          <Plus className="w-5 h-5" />
          Create Workflow
        </button>
      </div>

      {/* Alerts */}
      {error && (
        <div className="mb-4 p-4 bg-red-50 border border-red-200 text-red-700 rounded-lg">
          {error}
        </div>
      )}
      {success && (
        <div className="mb-4 p-4 bg-green-50 border border-green-200 text-green-700 rounded-lg">
          {success}
        </div>
      )}

      {/* Edit Form Modal */}
      {isEditing && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 overflow-y-auto p-4">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-4xl max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b sticky top-0 bg-white z-10">
              <div className="flex justify-between items-center">
                <h2 className="text-2xl font-bold">
                  {selectedWorkflow ? 'Edit Workflow' : 'Create New Workflow'}
                </h2>
                <button onClick={() => setIsEditing(false)} className="text-gray-500 hover:text-gray-700">
                  <X className="w-6 h-6" />
                </button>
              </div>
            </div>

            <div className="p-6 space-y-6">
              {/* Basic Info */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Workflow Name *</label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className="w-full px-3 py-2 border rounded-lg"
                    placeholder="e.g., Auto-assign 99Acres leads"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Trigger Event *</label>
                  <select
                    value={formData.trigger}
                    onChange={(e) => setFormData({ ...formData, trigger: e.target.value })}
                    className="w-full px-3 py-2 border rounded-lg"
                  >
                    <option value="">Select trigger...</option>
                    {TRIGGERS.map((t) => (
                      <option key={t.value} value={t.value}>
                        {t.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                <textarea
                  value={formData.description || ''}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg"
                  rows={2}
                  placeholder="Optional description of what this workflow does"
                />
              </div>

              {/* Conditions */}
              <div>
                <div className="flex justify-between items-center mb-3">
                  <label className="text-sm font-medium text-gray-700">Conditions (All must match)</label>
                  <button onClick={addCondition} className="text-blue-600 hover:text-blue-700 text-sm">
                    + Add Condition
                  </button>
                </div>
                {formData.conditions.length === 0 && (
                  <p className="text-sm text-gray-500 italic">No conditions (workflow runs for all triggers)</p>
                )}
                {formData.conditions.map((condition, idx) => (
                  <div key={idx} className="flex gap-2 mb-2">
                    <select
                      value={condition.field}
                      onChange={(e) => updateCondition(idx, 'field', e.target.value)}
                      className="flex-1 px-3 py-2 border rounded-lg text-sm"
                    >
                      <option value="">Select field...</option>
                      {COMMON_FIELDS.map((f) => (
                        <option key={f} value={f}>{f}</option>
                      ))}
                    </select>
                    <select
                      value={condition.operator}
                      onChange={(e) => updateCondition(idx, 'operator', e.target.value)}
                      className="px-3 py-2 border rounded-lg text-sm"
                    >
                      {CONDITION_OPERATORS.map((op) => (
                        <option key={op.value} value={op.value}>{op.label}</option>
                      ))}
                    </select>
                    <input
                      type="text"
                      value={condition.value as string}
                      onChange={(e) => updateCondition(idx, 'value', e.target.value)}
                      className="flex-1 px-3 py-2 border rounded-lg text-sm"
                      placeholder="Value"
                    />
                    <button
                      onClick={() => removeCondition(idx)}
                      className="p-2 text-red-600 hover:bg-red-50 rounded"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>

              {/* Actions */}
              <div>
                <div className="flex justify-between items-center mb-3">
                  <label className="text-sm font-medium text-gray-700">Actions * (Executed in order)</label>
                  <button onClick={addAction} className="text-blue-600 hover:text-blue-700 text-sm">
                    + Add Action
                  </button>
                </div>
                {formData.actions.length === 0 && (
                  <p className="text-sm text-red-500">At least one action is required</p>
                )}
                {formData.actions.map((action, idx) => (
                  <div key={idx} className="border rounded-lg p-4 mb-3 bg-gray-50">
                    <div className="flex justify-between items-start mb-3">
                      <select
                        value={action.type}
                        onChange={(e) => updateAction(idx, 'type', e.target.value)}
                        className="px-3 py-2 border rounded-lg bg-white"
                      >
                        {ACTION_TYPES.map((at) => (
                          <option key={at.value} value={at.value}>
                            {at.icon} {at.label}
                          </option>
                        ))}
                      </select>
                      <button
                        onClick={() => removeAction(idx)}
                        className="p-2 text-red-600 hover:bg-red-100 rounded"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>

                    {/* Action Parameters */}
                    <div className="space-y-2">
                      {action.type === 'ASSIGN_AGENT' && (
                        <input
                          type="text"
                          value={action.params.agent_id || ''}
                          onChange={(e) => updateAction(idx, 'params', { ...action.params, agent_id: e.target.value })}
                          className="w-full px-3 py-2 border rounded-lg text-sm"
                          placeholder="Agent ID"
                        />
                      )}
                      {action.type === 'SEND_WHATSAPP' && (
                        <>
                          <input
                            type="text"
                            value={action.params.message || ''}
                            onChange={(e) => updateAction(idx, 'params', { ...action.params, message: e.target.value })}
                            className="w-full px-3 py-2 border rounded-lg text-sm"
                            placeholder="Message text or template name"
                          />
                        </>
                      )}
                      {action.type === 'SEND_EMAIL' && (
                        <>
                          <input
                            type="text"
                            value={action.params.subject || ''}
                            onChange={(e) => updateAction(idx, 'params', { ...action.params, subject: e.target.value })}
                            className="w-full px-3 py-2 border rounded-lg text-sm"
                            placeholder="Email subject"
                          />
                          <textarea
                            value={action.params.body || ''}
                            onChange={(e) => updateAction(idx, 'params', { ...action.params, body: e.target.value })}
                            className="w-full px-3 py-2 border rounded-lg text-sm"
                            placeholder="Email body"
                            rows={3}
                          />
                        </>
                      )}
                      {action.type === 'CREATE_TASK' && (
                        <>
                          <input
                            type="text"
                            value={action.params.notes || ''}
                            onChange={(e) => updateAction(idx, 'params', { ...action.params, notes: e.target.value })}
                            className="w-full px-3 py-2 border rounded-lg text-sm"
                            placeholder="Task notes"
                          />
                          <select
                            value={action.params.priority || 'medium'}
                            onChange={(e) => updateAction(idx, 'params', { ...action.params, priority: e.target.value })}
                            className="w-full px-3 py-2 border rounded-lg text-sm"
                          >
                            <option value="low">Low Priority</option>
                            <option value="medium">Medium Priority</option>
                            <option value="high">High Priority</option>
                          </select>
                        </>
                      )}
                      {action.type === 'UPDATE_STATUS' && (
                        <input
                          type="text"
                          value={action.params.status || ''}
                          onChange={(e) => updateAction(idx, 'params', { ...action.params, status: e.target.value })}
                          className="w-full px-3 py-2 border rounded-lg text-sm"
                          placeholder="New status value"
                        />
                      )}
                      {action.type === 'UPDATE_FIELD' && (
                        <>
                          <input
                            type="text"
                            value={action.params.field || ''}
                            onChange={(e) => updateAction(idx, 'params', { ...action.params, field: e.target.value })}
                            className="w-full px-3 py-2 border rounded-lg text-sm"
                            placeholder="Field name"
                          />
                          <input
                            type="text"
                            value={action.params.value || ''}
                            onChange={(e) => updateAction(idx, 'params', { ...action.params, value: e.target.value })}
                            className="w-full px-3 py-2 border rounded-lg text-sm"
                            placeholder="New value"
                          />
                        </>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              {/* Settings */}
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Delay (minutes)</label>
                  <input
                    type="number"
                    value={formData.delay_minutes}
                    onChange={(e) => setFormData({ ...formData, delay_minutes: parseInt(e.target.value) })}
                    className="w-full px-3 py-2 border rounded-lg"
                    min="0"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Priority</label>
                  <input
                    type="number"
                    value={formData.priority}
                    onChange={(e) => setFormData({ ...formData, priority: parseInt(e.target.value) })}
                    className="w-full px-3 py-2 border rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Max/Day</label>
                  <input
                    type="number"
                    value={formData.max_executions_per_day || ''}
                    onChange={(e) => setFormData({ ...formData, max_executions_per_day: parseInt(e.target.value) || undefined })}
                    className="w-full px-3 py-2 border rounded-lg"
                    placeholder="Unlimited"
                  />
                </div>
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={formData.enabled}
                  onChange={(e) => setFormData({ ...formData, enabled: e.target.checked })}
                  className="w-4 h-4"
                />
                <label className="text-sm font-medium text-gray-700">Enable workflow immediately</label>
              </div>
            </div>

            {/* Footer */}
            <div className="p-6 border-t bg-gray-50 flex justify-end gap-3">
              <button
                onClick={() => setIsEditing(false)}
                className="px-4 py-2 border rounded-lg hover:bg-gray-100"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
              >
                <Save className="w-4 h-4" />
                Save Workflow
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Execution History Modal */}
      {showExecutions && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-5xl max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b flex justify-between items-center">
              <h2 className="text-2xl font-bold">Execution History</h2>
              <button onClick={() => setShowExecutions(false)} className="text-gray-500 hover:text-gray-700">
                <X className="w-6 h-6" />
              </button>
            </div>
            <div className="p-6">
              {executionHistory.length === 0 ? (
                <p className="text-gray-500 text-center py-8">No executions yet</p>
              ) : (
                <div className="space-y-3">
                  {executionHistory.map((exec) => (
                    <div key={exec.id} className="border rounded-lg p-4">
                      <div className="flex justify-between items-start mb-2">
                        <span className={`px-2 py-1 rounded text-sm font-medium ${
                          exec.status === 'SUCCESS' ? 'bg-green-100 text-green-700' :
                          exec.status === 'FAILED' ? 'bg-red-100 text-red-700' :
                          'bg-gray-100 text-gray-700'
                        }`}>
                          {exec.status}
                        </span>
                        <span className="text-sm text-gray-500">
                          {new Date(exec.executed_at).toLocaleString()}
                        </span>
                      </div>
                      <div className="text-sm text-gray-600">
                        Duration: {exec.duration_ms}ms
                      </div>
                      {exec.error_message && (
                        <div className="mt-2 text-sm text-red-600">Error: {exec.error_message}</div>
                      )}
                      <div className="mt-2">
                        <details className="text-sm">
                          <summary className="cursor-pointer text-blue-600">View Details</summary>
                          <pre className="mt-2 p-2 bg-gray-50 rounded overflow-x-auto text-xs">
                            {JSON.stringify({ trigger_data: exec.trigger_data, actions_log: exec.actions_log }, null, 2)}
                          </pre>
                        </details>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Workflows List */}
      <div className="bg-white rounded-lg shadow">
        <div className="p-4 border-b">
          <h2 className="text-xl font-semibold">Active Workflows ({workflows.length})</h2>
        </div>
        {workflows.length === 0 ? (
          <div className="p-8 text-center text-gray-500">
            <p className="text-lg mb-2">No workflows configured yet</p>
            <p className="text-sm">Create your first workflow to start automating with Panditji AI</p>
          </div>
        ) : (
          <div className="divide-y">
            {workflows.map((workflow) => (
              <div key={workflow.id} className="p-4 hover:bg-gray-50">
                <div className="flex justify-between items-start">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <h3 className="text-lg font-semibold">{workflow.name}</h3>
                      <span className={`px-2 py-1 rounded text-xs font-medium ${
                        workflow.enabled ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
                      }`}>
                        {workflow.enabled ? 'ENABLED' : 'DISABLED'}
                      </span>
                      <span className="px-2 py-1 bg-blue-100 text-blue-700 rounded text-xs">
                        Priority: {workflow.priority}
                      </span>
                    </div>
                    {workflow.description && (
                      <p className="text-sm text-gray-600 mb-2">{workflow.description}</p>
                    )}
                    <div className="flex flex-wrap gap-2 text-sm text-gray-600">
                      <span className="flex items-center gap-1">
                        <ChevronRight className="w-4 h-4" />
                        Trigger: <strong>{TRIGGERS.find(t => t.value === workflow.trigger)?.label}</strong>
                      </span>
                      <span>•</span>
                      <span>{workflow.conditions.length} condition(s)</span>
                      <span>•</span>
                      <span>{workflow.actions.length} action(s)</span>
                      {workflow.delay_minutes > 0 && (
                        <>
                          <span>•</span>
                          <span>Delay: {workflow.delay_minutes}m</span>
                        </>
                      )}
                      {workflow._count && (
                        <>
                          <span>•</span>
                          <span>{workflow._count.executions} executions</span>
                        </>
                      )}
                    </div>
                  </div>
                  <div className="flex gap-2 ml-4">
                    <button
                      onClick={() => handleToggle(workflow.id!)}
                      className={`p-2 rounded hover:bg-gray-100 ${
                        workflow.enabled ? 'text-green-600' : 'text-gray-400'
                      }`}
                      title={workflow.enabled ? 'Disable' : 'Enable'}
                    >
                      {workflow.enabled ? <Power className="w-5 h-5" /> : <PowerOff className="w-5 h-5" />}
                    </button>
                    <button
                      onClick={() => fetchExecutions(workflow.id!)}
                      className="p-2 rounded hover:bg-gray-100 text-blue-600"
                      title="View executions"
                    >
                      <Play className="w-5 h-5" />
                    </button>
                    <button
                      onClick={() => handleTest(workflow.id!)}
                      className="p-2 rounded hover:bg-gray-100 text-purple-600"
                      title="Test workflow"
                    >
                      <TestTube className="w-5 h-5" />
                    </button>
                    <button
                      onClick={() => handleEdit(workflow)}
                      className="px-3 py-2 text-sm border rounded hover:bg-gray-100"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => handleDelete(workflow.id!)}
                      className="p-2 rounded hover:bg-red-50 text-red-600"
                      title="Delete"
                    >
                      <Trash2 className="w-5 h-5" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Example Workflows Guide */}
      <div className="mt-6 bg-blue-50 border border-blue-200 rounded-lg p-6">
        <h3 className="text-lg font-semibold mb-3 text-blue-900">💡 Example Automation Workflows</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
          <div className="bg-white p-3 rounded">
            <strong className="text-blue-700">Auto-assign 99Acres leads</strong>
            <div className="mt-1 text-gray-600">
              Trigger: Lead Created<br />
              Condition: lead_source = "99Acres"<br />
              Action: Assign to Agent "agent-123"
            </div>
          </div>
          <div className="bg-white p-3 rounded">
            <strong className="text-blue-700">Send welcome WhatsApp</strong>
            <div className="mt-1 text-gray-600">
              Trigger: Lead Created<br />
              Action: Send WhatsApp "Welcome! Our team will contact you soon."
            </div>
          </div>
          <div className="bg-white p-3 rounded">
            <strong className="text-blue-700">Follow-up after 24h</strong>
            <div className="mt-1 text-gray-600">
              Trigger: Appointment Scheduled<br />
              Delay: 1440 minutes (24h)<br />
              Action: Send WhatsApp reminder
            </div>
          </div>
          <div className="bg-white p-3 rounded">
            <strong className="text-blue-700">Create task for high-value leads</strong>
            <div className="mt-1 text-gray-600">
              Trigger: Lead Created<br />
              Condition: budget_max greater_than 5000000<br />
              Action: Create Task (priority: high)
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
