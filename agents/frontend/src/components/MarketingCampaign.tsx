/**
 * Marketing Campaign Builder - Phase 3.2
 * Template management, audience segmentation, scheduling, analytics
 */

import { useState, useEffect } from 'react';
import { Send, Save, Calendar, Users, FileText, Play, Trash2, Plus, X, Copy } from 'lucide-react';
import { API_BASE_URL, authedFetch } from '../lib/api';
import { useConfirm } from '../contexts/ConfirmContext';

interface CampaignTemplate {
  id?: string;
  name: string;
  channel: string;
  category?: string;
  subject?: string;
  body: string;
  variables: Array<{ name: string; required: boolean; default?: string }>;
  avg_score?: number;
  times_used?: number;
  created_at?: string;
}

interface Campaign {
  id?: string;
  name: string;
  type: string;
  channel: string;
  template_id?: string;
  template?: { id: string; name: string };
  audience: any;
  message: string;
  subject?: string;
  status: string;
  sent_count: number;
  delivered: number;
  responded: number;
  failed_count: number;
  scheduled_at?: string;
  recurrence_rule?: string;
  ab_test_config?: any;
  created_at?: string;
}

const CHANNELS = [
  { value: 'whatsapp', label: 'WhatsApp', icon: '💬' },
  { value: 'email', label: 'Email', icon: '📧' },
  { value: 'sms', label: 'SMS', icon: '📱' },
  { value: 'voice', label: 'Voice Call', icon: '📞' },
];

const CAMPAIGN_TYPES = [
  { value: 'broadcast', label: 'Broadcast', desc: 'One-time message to audience' },
  { value: 'drip', label: 'Drip Campaign', desc: 'Automated series over time' },
  { value: 'launch_promo', label: 'Launch Promo', desc: 'Property launch announcement' },
  { value: 'follow_up', label: 'Follow-up', desc: 'Nurture existing leads' },
];

const TEMPLATE_CATEGORIES = [
  'welcome', 'followup', 'promotional', 'reminder', 'transactional', 'event', 'feedback'
];

export default function MarketingCampaign() {
  const confirm = useConfirm();
  const [activeTab, setActiveTab] = useState<'campaigns' | 'templates'>('campaigns');
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [templates, setTemplates] = useState<CampaignTemplate[]>([]);
  const [selectedCampaign, setSelectedCampaign] = useState<Campaign | null>(null);
  const [selectedTemplate, setSelectedTemplate] = useState<CampaignTemplate | null>(null);
  const [isEditingCampaign, setIsEditingCampaign] = useState(false);
  const [isEditingTemplate, setIsEditingTemplate] = useState(false);
  const [audiencePreview, setAudiencePreview] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const [campaignForm, setCampaignForm] = useState<Campaign>({
    name: '',
    type: 'broadcast',
    channel: 'whatsapp',
    audience: {},
    message: '',
    status: 'draft',
    sent_count: 0,
    delivered: 0,
    responded: 0,
    failed_count: 0,
  });

  const [templateForm, setTemplateForm] = useState<CampaignTemplate>({
    name: '',
    channel: 'whatsapp',
    category: 'promotional',
    body: '',
    variables: [],
  });

  useEffect(() => {
    fetchCampaigns();
    fetchTemplates();
  }, []);

  const fetchCampaigns = async () => {
    try {
      setLoading(true);
      const response = await authedFetch(`${API_BASE_URL}/api/marketing/campaigns`);
      const data = await response.json();
      setCampaigns(data.campaigns || []);
    } catch {
      setError('Failed to load campaigns');
    } finally {
      setLoading(false);
    }
  };

  const fetchTemplates = async () => {
    try {
      const response = await authedFetch(`${API_BASE_URL}/api/marketing/templates`);
      const data = await response.json();
      setTemplates(data.templates || []);
    } catch {
      setError('Failed to load templates');
    }
  };

  const fetchAudiencePreview = async (audience: any) => {
    try {
      const response = await authedFetch(`${API_BASE_URL}/api/marketing/audience/preview`, {
        method: 'POST',
        body: JSON.stringify({ audience }),
      });
      const data = await response.json();
      setAudiencePreview(data);
    } catch (err: any) {
      console.error('Audience preview error:', err);
    }
  };

  const handleSaveCampaign = async () => {
    try {
      if (!campaignForm.name || !campaignForm.channel) {
        setError('Name and channel are required');
        return;
      }

      const url = selectedCampaign
        ? `${API_BASE_URL}/api/marketing/campaigns/${selectedCampaign.id}`
        : `${API_BASE_URL}/api/marketing/campaigns`;

      const method = selectedCampaign ? 'PATCH' : 'POST';

      const response = await authedFetch(url, {
        method,
        body: JSON.stringify(campaignForm),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to save campaign');
      }

      setSuccess(`Campaign ${selectedCampaign ? 'updated' : 'created'} successfully`);
      setIsEditingCampaign(false);
      fetchCampaigns();
      setTimeout(() => setSuccess(''), 3000);
    } catch (err: any) {
      setError(err.message);
      setTimeout(() => setError(''), 5000);
    }
  };

  const handleSaveTemplate = async () => {
    try {
      if (!templateForm.name || !templateForm.channel || !templateForm.body) {
        setError('Name, channel, and body are required');
        return;
      }

      const url = selectedTemplate
        ? `${API_BASE_URL}/api/marketing/templates/${selectedTemplate.id}`
        : `${API_BASE_URL}/api/marketing/templates`;

      const method = selectedTemplate ? 'PATCH' : 'POST';

      const response = await authedFetch(url, {
        method,
        body: JSON.stringify(templateForm),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to save template');
      }

      setSuccess(`Template ${selectedTemplate ? 'updated' : 'created'} successfully`);
      setIsEditingTemplate(false);
      fetchTemplates();
      setTimeout(() => setSuccess(''), 3000);
    } catch (err: any) {
      setError(err.message);
      setTimeout(() => setError(''), 5000);
    }
  };

  const handleDeleteCampaign = async (id: string) => {
    const ok = await confirm('Are you sure you want to delete this campaign?');
    if (!ok) return;

    try {
      const response = await authedFetch(`${API_BASE_URL}/api/marketing/campaigns/${id}`, { method: 'DELETE' });

      if (!response.ok) throw new Error('Failed to delete campaign');

      setSuccess('Campaign deleted successfully');
      fetchCampaigns();
      setTimeout(() => setSuccess(''), 3000);
    } catch (err: any) {
      setError(err.message);
      setTimeout(() => setError(''), 5000);
    }
  };

  const handleDeleteTemplate = async (id: string) => {
    const ok = await confirm('Are you sure you want to delete this template?');
    if (!ok) return;

    try {
      const response = await authedFetch(`${API_BASE_URL}/api/marketing/templates/${id}`, { method: 'DELETE' });

      if (!response.ok) throw new Error('Failed to delete template');

      setSuccess('Template deleted successfully');
      fetchTemplates();
      setTimeout(() => setSuccess(''), 3000);
    } catch (err: any) {
      setError(err.message);
      setTimeout(() => setError(''), 5000);
    }
  };

  const handleLaunchCampaign = async (id: string) => {
    const ok = await confirm('Launch this campaign now?');
    if (!ok) return;

    try {
      const response = await authedFetch(`${API_BASE_URL}/api/marketing/campaigns/${id}/launch`, { method: 'POST' });

      const data = await response.json();

      if (!response.ok) throw new Error(data.error || 'Failed to launch campaign');

      setSuccess(`Campaign launched! Estimated ${data.estimated_recipients} recipients`);
      fetchCampaigns();
      setTimeout(() => setSuccess(''), 5000);
    } catch (err: any) {
      setError(err.message);
      setTimeout(() => setError(''), 5000);
    }
  };

  const handleCreateFromTemplate = (template: CampaignTemplate) => {
    setCampaignForm({
      name: `Campaign from ${template.name}`,
      type: 'broadcast',
      channel: template.channel,
      template_id: template.id,
      audience: {},
      message: template.body,
      subject: template.subject,
      status: 'draft',
      sent_count: 0,
      delivered: 0,
      responded: 0,
      failed_count: 0,
    });
    setSelectedCampaign(null);
    setIsEditingCampaign(true);
  };

  const handleAddVariable = () => {
    setTemplateForm({
      ...templateForm,
      variables: [...templateForm.variables, { name: '', required: false, default: '' }],
    });
  };

  const updateVariable = (index: number, field: string, value: any) => {
    const newVariables = [...templateForm.variables];
    newVariables[index] = { ...newVariables[index], [field]: value };
    setTemplateForm({ ...templateForm, variables: newVariables });
  };

  const removeVariable = (index: number) => {
    setTemplateForm({
      ...templateForm,
      variables: templateForm.variables.filter((_, i) => i !== index),
    });
  };

  if (loading) {
    return <div className="p-6">Loading...</div>;
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900">📢 Marketing Campaign Builder</h1>
        <p className="text-gray-600 mt-1">Create targeted campaigns and reusable templates for Panditji AI</p>
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

      {/* Tabs */}
      <div className="mb-6 flex gap-2 border-b">
        <button
          onClick={() => setActiveTab('campaigns')}
          className={`px-6 py-3 font-medium ${
            activeTab === 'campaigns'
              ? 'border-b-2 border-blue-600 text-blue-600'
              : 'text-gray-600 hover:text-gray-900'
          }`}
        >
          <Send className="w-4 h-4 inline mr-2" />
          Campaigns ({campaigns.length})
        </button>
        <button
          onClick={() => setActiveTab('templates')}
          className={`px-6 py-3 font-medium ${
            activeTab === 'templates'
              ? 'border-b-2 border-blue-600 text-blue-600'
              : 'text-gray-600 hover:text-gray-900'
          }`}
        >
          <FileText className="w-4 h-4 inline mr-2" />
          Templates ({templates.length})
        </button>
      </div>

      {/* CAMPAIGNS TAB */}
      {activeTab === 'campaigns' && (
        <div>
          <div className="mb-4 flex justify-end">
            <button
              onClick={() => {
                setCampaignForm({
                  name: '',
                  type: 'broadcast',
                  channel: 'whatsapp',
                  audience: {},
                  message: '',
                  status: 'draft',
                  sent_count: 0,
                  delivered: 0,
                  responded: 0,
                  failed_count: 0,
                });
                setSelectedCampaign(null);
                setIsEditingCampaign(true);
              }}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              <Plus className="w-5 h-5" />
              Create Campaign
            </button>
          </div>

          {/* Campaigns List */}
          <div className="bg-white rounded-lg shadow divide-y">
            {campaigns.length === 0 ? (
              <div className="p-8 text-center text-gray-500">
                <p className="text-lg mb-2">No campaigns yet</p>
                <p className="text-sm">Create your first marketing campaign to engage your leads</p>
              </div>
            ) : (
              campaigns.map((campaign) => (
                <div key={campaign.id} className="p-4 hover:bg-gray-50">
                  <div className="flex justify-between items-start">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <h3 className="text-lg font-semibold">{campaign.name}</h3>
                        <span className={`px-2 py-1 rounded text-xs font-medium ${
                          campaign.status === 'draft' ? 'bg-gray-100 text-gray-700' :
                          campaign.status === 'sending' ? 'bg-blue-100 text-blue-700' :
                          campaign.status === 'completed' ? 'bg-green-100 text-green-700' :
                          'bg-yellow-100 text-yellow-700'
                        }`}>
                          {campaign.status.toUpperCase()}
                        </span>
                        <span className="px-2 py-1 bg-purple-100 text-purple-700 rounded text-xs">
                          {CHANNELS.find(c => c.value === campaign.channel)?.icon} {campaign.channel}
                        </span>
                      </div>
                      <div className="flex gap-6 text-sm text-gray-600">
                        <span>Sent: {campaign.sent_count}</span>
                        <span>Delivered: {campaign.delivered}</span>
                        <span>Responded: {campaign.responded}</span>
                        {campaign.sent_count > 0 && (
                          <span className="text-green-600 font-medium">
                            {((campaign.responded / campaign.delivered) * 100).toFixed(1)}% response rate
                          </span>
                        )}
                      </div>
                      {campaign.scheduled_at && (
                        <div className="mt-2 text-sm text-gray-600">
                          <Calendar className="w-4 h-4 inline mr-1" />
                          Scheduled: {new Date(campaign.scheduled_at).toLocaleString()}
                        </div>
                      )}
                    </div>
                    <div className="flex gap-2 ml-4">
                      {campaign.status === 'draft' && (
                        <button
                          onClick={() => handleLaunchCampaign(campaign.id!)}
                          className="p-2 text-green-600 hover:bg-green-50 rounded"
                          title="Launch campaign"
                        >
                          <Play className="w-5 h-5" />
                        </button>
                      )}
                      <button
                        onClick={() => {
                          setCampaignForm(campaign);
                          setSelectedCampaign(campaign);
                          setIsEditingCampaign(true);
                        }}
                        className="px-3 py-2 text-sm border rounded hover:bg-gray-100"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleDeleteCampaign(campaign.id!)}
                        className="p-2 text-red-600 hover:bg-red-50 rounded"
                      >
                        <Trash2 className="w-5 h-5" />
                      </button>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Campaign Editor Modal */}
          {isEditingCampaign && (
            <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 overflow-y-auto p-4">
              <div className="bg-white rounded-lg shadow-xl w-full max-w-4xl max-h-[90vh] overflow-y-auto">
                <div className="p-6 border-b sticky top-0 bg-white z-10">
                  <div className="flex justify-between items-center">
                    <h2 className="text-2xl font-bold">
                      {selectedCampaign ? 'Edit Campaign' : 'Create New Campaign'}
                    </h2>
                    <button onClick={() => setIsEditingCampaign(false)} className="text-gray-500 hover:text-gray-700">
                      <X className="w-6 h-6" />
                    </button>
                  </div>
                </div>

                <div className="p-6 space-y-6">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Campaign Name *</label>
                      <input
                        type="text"
                        value={campaignForm.name}
                        onChange={(e) => setCampaignForm({ ...campaignForm, name: e.target.value })}
                        className="w-full px-3 py-2 border rounded-lg"
                        placeholder="e.g., Noida Flat Launch"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Type</label>
                      <select
                        value={campaignForm.type}
                        onChange={(e) => setCampaignForm({ ...campaignForm, type: e.target.value })}
                        className="w-full px-3 py-2 border rounded-lg"
                      >
                        {CAMPAIGN_TYPES.map((t) => (
                          <option key={t.value} value={t.value}>{t.label}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Channel *</label>
                    <div className="flex gap-2">
                      {CHANNELS.map((ch) => (
                        <button
                          key={ch.value}
                          onClick={() => setCampaignForm({ ...campaignForm, channel: ch.value })}
                          className={`px-4 py-2 rounded-lg ${
                            campaignForm.channel === ch.value
                              ? 'bg-blue-600 text-white'
                              : 'border hover:bg-gray-50'
                          }`}
                        >
                          {ch.icon} {ch.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {campaignForm.channel === 'email' && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Email Subject</label>
                      <input
                        type="text"
                        value={campaignForm.subject || ''}
                        onChange={(e) => setCampaignForm({ ...campaignForm, subject: e.target.value })}
                        className="w-full px-3 py-2 border rounded-lg"
                        placeholder="Exclusive Property Launch in Noida"
                      />
                    </div>
                  )}

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Message *</label>
                    <textarea
                      value={campaignForm.message}
                      onChange={(e) => setCampaignForm({ ...campaignForm, message: e.target.value })}
                      className="w-full px-3 py-2 border rounded-lg"
                      rows={6}
                      placeholder="Hi {{name}}, we have exciting new properties in {{location}}..."
                    />
                    <p className="text-xs text-gray-500 mt-1">Use {'{{variable}}'} for personalization</p>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-3">
                      <Users className="w-4 h-4 inline mr-1" />
                      Target Audience
                    </label>
                    <div className="grid grid-cols-3 gap-3">
                      <div>
                        <label className="block text-xs text-gray-600 mb-1">Contact Type</label>
                        <select
                          value={campaignForm.audience.contact_type || ''}
                          onChange={(e) => {
                            const newAudience = { ...campaignForm.audience, contact_type: e.target.value };
                            setCampaignForm({ ...campaignForm, audience: newAudience });
                            fetchAudiencePreview(newAudience);
                          }}
                          className="w-full px-2 py-1 border rounded text-sm"
                        >
                          <option value="">All</option>
                          <option value="BUYER">Buyers</option>
                          <option value="TENANT">Tenants</option>
                          <option value="LANDLORD">Landlords</option>
                          <option value="PARTNER_AGENT">Partner Agents</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs text-gray-600 mb-1">Lead Source</label>
                        <input
                          type="text"
                          value={campaignForm.audience.lead_source || ''}
                          onChange={(e) => {
                            const newAudience = { ...campaignForm.audience, lead_source: e.target.value };
                            setCampaignForm({ ...campaignForm, audience: newAudience });
                            fetchAudiencePreview(newAudience);
                          }}
                          className="w-full px-2 py-1 border rounded text-sm"
                          placeholder="99Acres"
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-gray-600 mb-1">Location</label>
                        <input
                          type="text"
                          value={campaignForm.audience.location || ''}
                          onChange={(e) => {
                            const newAudience = { ...campaignForm.audience, location: e.target.value };
                            setCampaignForm({ ...campaignForm, audience: newAudience });
                            fetchAudiencePreview(newAudience);
                          }}
                          className="w-full px-2 py-1 border rounded text-sm"
                          placeholder="Noida"
                        />
                      </div>
                    </div>
                    {audiencePreview && (
                      <div className="mt-2 p-3 bg-blue-50 border border-blue-200 rounded text-sm">
                        <strong className="text-blue-900">Audience Size: {audiencePreview.total_count} contacts</strong>
                      </div>
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        <Calendar className="w-4 h-4 inline mr-1" />
                        Schedule (Optional)
                      </label>
                      <input
                        type="datetime-local"
                        value={campaignForm.scheduled_at || ''}
                        onChange={(e) => setCampaignForm({ ...campaignForm, scheduled_at: e.target.value })}
                        className="w-full px-3 py-2 border rounded-lg"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Recurrence (Cron)</label>
                      <input
                        type="text"
                        value={campaignForm.recurrence_rule || ''}
                        onChange={(e) => setCampaignForm({ ...campaignForm, recurrence_rule: e.target.value })}
                        className="w-full px-3 py-2 border rounded-lg"
                        placeholder="0 9 * * 1 (Every Monday 9am)"
                      />
                    </div>
                  </div>
                </div>

                <div className="p-6 border-t bg-gray-50 flex justify-end gap-3">
                  <button
                    onClick={() => setIsEditingCampaign(false)}
                    className="px-4 py-2 border rounded-lg hover:bg-gray-100"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleSaveCampaign}
                    className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                  >
                    <Save className="w-4 h-4" />
                    Save Campaign
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* TEMPLATES TAB */}
      {activeTab === 'templates' && (
        <div>
          <div className="mb-4 flex justify-end">
            <button
              onClick={() => {
                setTemplateForm({
                  name: '',
                  channel: 'whatsapp',
                  category: 'promotional',
                  body: '',
                  variables: [],
                });
                setSelectedTemplate(null);
                setIsEditingTemplate(true);
              }}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              <Plus className="w-5 h-5" />
              Create Template
            </button>
          </div>

          {/* Templates Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {templates.length === 0 ? (
              <div className="col-span-full p-8 text-center text-gray-500 bg-white rounded-lg shadow">
                <p className="text-lg mb-2">No templates yet</p>
                <p className="text-sm">Create reusable templates for faster campaign creation</p>
              </div>
            ) : (
              templates.map((template) => (
                <div key={template.id} className="bg-white rounded-lg shadow p-4 hover:shadow-lg transition">
                  <div className="flex justify-between items-start mb-3">
                    <div>
                      <h3 className="font-semibold">{template.name}</h3>
                      <div className="flex gap-2 mt-1">
                        <span className="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded">
                          {CHANNELS.find(c => c.value === template.channel)?.icon} {template.channel}
                        </span>
                        {template.category && (
                          <span className="text-xs bg-gray-100 text-gray-700 px-2 py-1 rounded">
                            {template.category}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  <p className="text-sm text-gray-600 mb-3 line-clamp-3">{template.body}</p>
                  <div className="flex justify-between items-center text-xs text-gray-500 mb-3">
                    <span>Used {template.times_used || 0} times</span>
                    {template.avg_score && (
                      <span className="text-green-600">⭐ {template.avg_score.toFixed(1)}</span>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleCreateFromTemplate(template)}
                      className="flex-1 px-3 py-1 text-sm bg-blue-600 text-white rounded hover:bg-blue-700"
                    >
                      <Copy className="w-3 h-3 inline mr-1" />
                      Use Template
                    </button>
                    <button
                      onClick={() => {
                        setTemplateForm(template);
                        setSelectedTemplate(template);
                        setIsEditingTemplate(true);
                      }}
                      className="px-3 py-1 text-sm border rounded hover:bg-gray-100"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => handleDeleteTemplate(template.id!)}
                      className="p-1 text-red-600 hover:bg-red-50 rounded"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Template Editor Modal */}
          {isEditingTemplate && (
            <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 overflow-y-auto p-4">
              <div className="bg-white rounded-lg shadow-xl w-full max-w-3xl max-h-[90vh] overflow-y-auto">
                <div className="p-6 border-b sticky top-0 bg-white z-10">
                  <div className="flex justify-between items-center">
                    <h2 className="text-2xl font-bold">
                      {selectedTemplate ? 'Edit Template' : 'Create New Template'}
                    </h2>
                    <button onClick={() => setIsEditingTemplate(false)} className="text-gray-500 hover:text-gray-700">
                      <X className="w-6 h-6" />
                    </button>
                  </div>
                </div>

                <div className="p-6 space-y-6">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Template Name *</label>
                      <input
                        type="text"
                        value={templateForm.name}
                        onChange={(e) => setTemplateForm({ ...templateForm, name: e.target.value })}
                        className="w-full px-3 py-2 border rounded-lg"
                        placeholder="Welcome Message"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
                      <select
                        value={templateForm.category}
                        onChange={(e) => setTemplateForm({ ...templateForm, category: e.target.value })}
                        className="w-full px-3 py-2 border rounded-lg"
                      >
                        {TEMPLATE_CATEGORIES.map((cat) => (
                          <option key={cat} value={cat}>{cat}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Channel *</label>
                    <div className="flex gap-2">
                      {CHANNELS.map((ch) => (
                        <button
                          key={ch.value}
                          onClick={() => setTemplateForm({ ...templateForm, channel: ch.value })}
                          className={`px-4 py-2 rounded-lg ${
                            templateForm.channel === ch.value
                              ? 'bg-blue-600 text-white'
                              : 'border hover:bg-gray-50'
                          }`}
                        >
                          {ch.icon} {ch.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {templateForm.channel === 'email' && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Email Subject</label>
                      <input
                        type="text"
                        value={templateForm.subject || ''}
                        onChange={(e) => setTemplateForm({ ...templateForm, subject: e.target.value })}
                        className="w-full px-3 py-2 border rounded-lg"
                        placeholder="Welcome to Realty Pandit"
                      />
                    </div>
                  )}

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Template Body *</label>
                    <textarea
                      value={templateForm.body}
                      onChange={(e) => setTemplateForm({ ...templateForm, body: e.target.value })}
                      className="w-full px-3 py-2 border rounded-lg font-mono text-sm"
                      rows={8}
                      placeholder="Hi {{name}}, welcome to Realty Pandit! We specialize in {{property_type}} properties in {{location}}."
                    />
                    <p className="text-xs text-gray-500 mt-1">Use {'{{variable}}'} syntax for dynamic content</p>
                  </div>

                  <div>
                    <div className="flex justify-between items-center mb-2">
                      <label className="block text-sm font-medium text-gray-700">Variables</label>
                      <button
                        onClick={handleAddVariable}
                        className="text-sm text-blue-600 hover:text-blue-700"
                      >
                        + Add Variable
                      </button>
                    </div>
                    {templateForm.variables.map((variable, idx) => (
                      <div key={idx} className="flex gap-2 mb-2">
                        <input
                          type="text"
                          value={variable.name}
                          onChange={(e) => updateVariable(idx, 'name', e.target.value)}
                          className="flex-1 px-3 py-2 border rounded-lg text-sm"
                          placeholder="Variable name (e.g., name, location)"
                        />
                        <input
                          type="text"
                          value={variable.default || ''}
                          onChange={(e) => updateVariable(idx, 'default', e.target.value)}
                          className="flex-1 px-3 py-2 border rounded-lg text-sm"
                          placeholder="Default value"
                        />
                        <label className="flex items-center gap-1 px-2">
                          <input
                            type="checkbox"
                            checked={variable.required}
                            onChange={(e) => updateVariable(idx, 'required', e.target.checked)}
                            className="w-4 h-4"
                          />
                          <span className="text-xs">Required</span>
                        </label>
                        <button
                          onClick={() => removeVariable(idx)}
                          className="p-2 text-red-600 hover:bg-red-50 rounded"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="p-6 border-t bg-gray-50 flex justify-end gap-3">
                  <button
                    onClick={() => setIsEditingTemplate(false)}
                    className="px-4 py-2 border rounded-lg hover:bg-gray-100"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleSaveTemplate}
                    className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                  >
                    <Save className="w-4 h-4" />
                    Save Template
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
