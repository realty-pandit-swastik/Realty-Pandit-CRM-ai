/**
 * Comprehensive Reports View - Phase 2.1
 * 8 Report Categories with 26+ Report Types
 */

import { useState, useEffect } from 'react';
import * as api from '../api/client';
import { exportToCSV, exportToExcel, exportToPDF, exportSummaryToCSV, exportSummaryToExcel } from '../utils/exportHelpers';
import { useToast } from '../contexts/ToastContext';

// Report Definitions
interface ReportDefinition {
  id: string;
  label: string;
  hasDateFilter?: boolean;
  hasStatusFilter?: boolean;
  hasSourceFilter?: boolean;
  hasTypeFilter?: boolean;
}

const REPORT_CATEGORIES = [
  {
    id: 'account',
    label: 'Account Reports',
    icon: '💰',
    reports: [
      { id: 'customer-outstanding', label: 'Customer Outstanding (Sales)', hasDateFilter: true },
      { id: 'vendor-outstanding', label: 'Vendor Outstanding (Purchase)', hasDateFilter: true },
      { id: 'monthly-sales', label: 'Monthly Sales by Customer', hasDateFilter: true },
      { id: 'monthly-purchase', label: 'Monthly Purchase by Vendor', hasDateFilter: true },
    ] as ReportDefinition[],
  },
  {
    id: 'user',
    label: 'User Reports',
    icon: '👥',
    reports: [
      { id: 'performance', label: 'User Performance', hasDateFilter: true },
      { id: 'task-completion', label: 'User Task Completion', hasDateFilter: true },
    ] as ReportDefinition[],
  },
  {
    id: 'call',
    label: 'Call Reports',
    icon: '📞',
    reports: [
      { id: 'all-logs', label: 'All Call Logs', hasDateFilter: true, hasTypeFilter: true },
      { id: 'by-date', label: 'Date Wise Call Log', hasDateFilter: true },
      { id: 'by-month', label: 'Month Wise Call Summary', hasDateFilter: true },
    ] as ReportDefinition[],
  },
  {
    id: 'lead',
    label: 'Lead Reports',
    icon: '🎯',
    reports: [
      { id: 'all-leads', label: 'All Leads', hasDateFilter: true, hasStatusFilter: true, hasSourceFilter: true },
      { id: 'last-contact', label: 'Lead Last Contact Date With Days', hasDateFilter: false },
      { id: 'summary', label: 'Lead Overall Summary', hasDateFilter: true },
      { id: 'cancelled-reasons', label: 'Lead Cancelled Reason Analysis', hasDateFilter: true },
    ] as ReportDefinition[],
  },
  {
    id: 'sold',
    label: 'Sold Reports',
    icon: '✅',
    reports: [
      { id: 'by-property', label: 'Sold By Property', hasDateFilter: true },
      { id: 'by-area', label: 'Sold By Area', hasDateFilter: true },
      { id: 'by-unit-type', label: 'Sold By Unit Type', hasDateFilter: true },
    ] as ReportDefinition[],
  },
  {
    id: 'visit',
    label: 'Visit Reports',
    icon: '🏠',
    reports: [
      { id: 'all-visits', label: 'All Site Visits', hasDateFilter: true, hasStatusFilter: true },
      { id: 'property-count', label: 'Property Visit Count', hasDateFilter: true },
    ] as ReportDefinition[],
  },
  {
    id: 'customer',
    label: 'Customer Reports',
    icon: '🤝',
    reports: [
      { id: 'converted-not-sold', label: 'Customers Converted But Not Sold', hasDateFilter: false },
    ] as ReportDefinition[],
  },
  {
    id: 'property',
    label: 'Property Reports',
    icon: '🏢',
    reports: [
      { id: 'all-properties', label: 'All Properties', hasDateFilter: false, hasStatusFilter: true, hasTypeFilter: true },
      { id: 'on-hold', label: 'Hold Properties', hasDateFilter: false },
      { id: 'availability-summary', label: 'Property Availability Summary', hasDateFilter: false },
    ] as ReportDefinition[],
  },
];

export function ReportsView() {
  const { showToast } = useToast();
  const [selectedCategory, setSelectedCategory] = useState('account');
  const [selectedReport, setSelectedReport] = useState('customer-outstanding');
  const [reportData, setReportData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showExportMenu, setShowExportMenu] = useState(false);

  // Filters
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [sourceFilter, setSourceFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');

  useEffect(() => {
    loadReport();
  }, [selectedCategory, selectedReport, dateFrom, dateTo, statusFilter, sourceFilter, typeFilter]);

  const loadReport = async () => {
    setLoading(true);
    setError(null);
    setReportData(null);

    try {
      const params: any = {};
      if (dateFrom) params.from = dateFrom;
      if (dateTo) params.to = dateTo;
      if (statusFilter && statusFilter !== 'all') params.status = statusFilter;
      if (sourceFilter && sourceFilter !== 'all') params.source = sourceFilter;
      if (typeFilter && typeFilter !== 'all') params.type = typeFilter;

      let data;
      const reportKey = `${selectedCategory}-${selectedReport}`;

      switch (reportKey) {
        // Account Reports
        case 'account-customer-outstanding':
          data = await api.getCustomerOutstanding(params);
          break;
        case 'account-vendor-outstanding':
          data = await api.getVendorOutstanding(params);
          break;
        case 'account-monthly-sales':
          data = await api.getMonthlySales(params);
          break;
        case 'account-monthly-purchase':
          data = await api.getMonthlyPurchase(params);
          break;

        // User Reports
        case 'user-performance':
          data = await api.getUserPerformanceReport(params);
          break;
        case 'user-task-completion':
          data = await api.getUserTaskCompletion(params);
          break;

        // Call Reports
        case 'call-all-logs':
          data = await api.getAllCallLogs(params);
          break;
        case 'call-by-date':
          data = await api.getCallsByDate(params);
          break;
        case 'call-by-month':
          data = await api.getCallsByMonth(params);
          break;

        // Lead Reports
        case 'lead-all-leads':
          data = await api.getAllLeadsReport(params);
          break;
        case 'lead-last-contact':
          data = await api.getLeadLastContact();
          break;
        case 'lead-summary':
          data = await api.getLeadSummary(params);
          break;
        case 'lead-cancelled-reasons':
          data = await api.getLeadCancelledReasons(params);
          break;

        // Sold Reports
        case 'sold-by-property':
          data = await api.getSoldByProperty(params);
          break;
        case 'sold-by-area':
          data = await api.getSoldByArea(params);
          break;
        case 'sold-by-unit-type':
          data = await api.getSoldByUnitType(params);
          break;

        // Visit Reports
        case 'visit-all-visits':
          data = await api.getAllVisitsReport(params);
          break;
        case 'visit-property-count':
          data = await api.getPropertyVisitCount(params);
          break;

        // Customer Reports
        case 'customer-converted-not-sold':
          data = await api.getConvertedNotSold();
          break;

        // Property Reports
        case 'property-all-properties':
          data = await api.getAllPropertiesReport(params);
          break;
        case 'property-on-hold':
          data = await api.getPropertiesOnHold();
          break;
        case 'property-availability-summary':
          data = await api.getPropertyAvailabilitySummary();
          break;

        default:
          throw new Error('Unknown report type');
      }

      setReportData(data);
    } catch (err: any) {
      console.error('Failed to load report:', err);
      setError(err.message || 'Failed to load report');
    } finally {
      setLoading(false);
    }
  };

  const handleCategorySelect = (categoryId: string) => {
    setSelectedCategory(categoryId);
    const category = REPORT_CATEGORIES.find((c) => c.id === categoryId);
    if (category && category.reports.length > 0) {
      setSelectedReport(category.reports[0].id);
    }
  };

  const currentCategory = REPORT_CATEGORIES.find((c) => c.id === selectedCategory);
  const currentReport = currentCategory?.reports.find((r) => r.id === selectedReport);

  // Export handlers
  const handleExport = (format: 'csv' | 'pdf' | 'excel') => {
    if (!reportData) {
      showToast('No data to export', 'info');
      return;
    }

    const reportTitle = `${currentCategory?.label} - ${currentReport?.label}`;
    const filename = `${selectedCategory}_${selectedReport}`;

    const filters = {
      from: dateFrom,
      to: dateTo,
      status: statusFilter,
      source: sourceFilter,
      type: typeFilter,
    };

    try {
      // For reports with data arrays
      if (reportData.data && Array.isArray(reportData.data)) {
        switch (format) {
          case 'csv':
            exportToCSV(reportData.data, filename);
            break;
          case 'excel':
            exportToExcel(reportData.data, filename);
            break;
          case 'pdf':
            exportToPDF(reportData.data, filename, reportTitle, filters);
            break;
        }
      } else {
        // For summary reports
        // Convert summary to flat array for export
        const flatSummary: Record<string, any>[] = [];
        Object.entries(reportData).forEach(([key, value]: [string, any]) => {
          if (Array.isArray(value)) {
            value.forEach((item: any) => flatSummary.push({ category: key, ...item }));
          }
        });

        switch (format) {
          case 'csv':
            exportSummaryToCSV(reportData, filename);
            break;
          case 'excel':
            exportSummaryToExcel(reportData, filename);
            break;
          case 'pdf':
            if (flatSummary.length > 0) {
              exportToPDF(flatSummary, filename, reportTitle, filters);
            } else {
              showToast('No data available for PDF export', 'info');
            }
            break;
        }
      }
    } catch (err: any) {
      showToast(err.message || 'Export failed', 'error');
    }
  };

  const [showSidebar, setShowSidebar] = useState(false);

  return (
    <div style={{ display: 'flex', height: '100%', backgroundColor: 'var(--bg-primary)', position: 'relative' }}>
      {/* Mobile sidebar toggle */}
      <button
        onClick={() => setShowSidebar(!showSidebar)}
        style={{
          display: 'none',
          position: 'fixed', bottom: '20px', right: '20px', zIndex: 30,
          width: '48px', height: '48px', borderRadius: '50%', border: 'none',
          backgroundColor: 'var(--primary)', color: '#fff', fontSize: '20px', cursor: 'pointer',
          boxShadow: '0 4px 12px rgba(0,0,0,0.2)',
        }}
        className="mobile-sidebar-toggle"
      >
        {showSidebar ? 'X' : '\u2630'}
      </button>
      <style>{`
        @media (max-width: 768px) {
          .mobile-sidebar-toggle { display: block !important; }
          .reports-sidebar { display: ${showSidebar ? 'flex' : 'none'} !important; position: fixed !important; left: 0; top: 0; bottom: 0; z-index: 25 !important; }
        }
      `}</style>

      {/* Sidebar - Categories */}
      <div
        className="reports-sidebar"
        style={{
          width: '220px',
          backgroundColor: 'var(--bg-secondary)',
          borderRight: '1px solid var(--border-color)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'auto',
        }}
      >
        <div style={{ padding: '20px 16px', borderBottom: '1px solid var(--border-color)' }}>
          <h3 style={{ fontSize: '16px', fontWeight: '600', margin: 0, color: 'var(--text-primary)' }}>
            Report Categories
          </h3>
        </div>
        {REPORT_CATEGORIES.map((category) => (
          <button
            key={category.id}
            onClick={() => handleCategorySelect(category.id)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              padding: '12px 16px',
              backgroundColor: selectedCategory === category.id ? 'var(--bg-active)' : 'transparent',
              border: 'none',
              borderLeft: selectedCategory === category.id ? '3px solid var(--primary)' : '3px solid transparent',
              color: selectedCategory === category.id ? 'var(--text-primary)' : 'var(--text-secondary)',
              fontSize: '14px',
              fontWeight: selectedCategory === category.id ? '600' : '400',
              textAlign: 'left',
              cursor: 'pointer',
              transition: 'all 0.2s',
            }}
          >
            <span style={{ fontSize: '18px' }}>{category.icon}</span>
            {category.label}
          </button>
        ))}
      </div>

      {/* Main Content */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        {/* Header with Report Selector */}
        <div
          style={{
            padding: '20px 32px',
            borderBottom: '1px solid var(--border-color)',
            backgroundColor: 'var(--bg-primary)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px' }}>
            <select
              value={selectedReport}
              onChange={(e) => setSelectedReport(e.target.value)}
              style={{
                padding: '8px 12px',
                borderRadius: '6px',
                border: '1px solid var(--border-color)',
                backgroundColor: 'var(--bg-secondary)',
                color: 'var(--text-primary)',
                fontSize: '14px',
                fontWeight: '600',
                cursor: 'pointer',
                minWidth: '200px', maxWidth: '100%',
              }}
            >
              {currentCategory?.reports.map((report) => (
                <option key={report.id} value={report.id}>
                  {report.label}
                </option>
              ))}
            </select>
            <button
              onClick={loadReport}
              style={{
                padding: '8px 16px',
                borderRadius: '6px',
                border: '1px solid var(--border-color)',
                backgroundColor: 'var(--bg-secondary)',
                color: 'var(--text-primary)',
                fontSize: '14px',
                cursor: 'pointer',
              }}
            >
              🔄 Refresh
            </button>

            {/* Export Button with Dropdown */}
            <div style={{ position: 'relative' }}>
              <button
                onClick={() => setShowExportMenu(!showExportMenu)}
                disabled={!reportData || loading}
                style={{
                  padding: '8px 16px',
                  borderRadius: '6px',
                  border: '1px solid var(--border-color)',
                  backgroundColor: reportData && !loading ? 'var(--primary)' : 'var(--bg-secondary)',
                  color: reportData && !loading ? '#fff' : 'var(--text-secondary)',
                  fontSize: '14px',
                  cursor: reportData && !loading ? 'pointer' : 'not-allowed',
                  opacity: reportData && !loading ? 1 : 0.6,
                }}
              >
                📥 Export
              </button>

              {showExportMenu && reportData && (
                <>
                  {/* Backdrop to close menu */}
                  <div
                    onClick={() => setShowExportMenu(false)}
                    style={{
                      position: 'fixed',
                      inset: 0,
                      zIndex: 10,
                    }}
                  />
                  {/* Export Menu */}
                  <div
                    style={{
                      position: 'absolute',
                      top: '100%',
                      right: 0,
                      marginTop: '4px',
                      backgroundColor: 'var(--bg-secondary)',
                      border: '1px solid var(--border-color)',
                      borderRadius: '8px',
                      boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                      zIndex: 20,
                      minWidth: '160px',
                      overflow: 'hidden',
                    }}
                  >
                    <button
                      onClick={() => {
                        handleExport('csv');
                        setShowExportMenu(false);
                      }}
                      style={{
                        width: '100%',
                        padding: '10px 16px',
                        border: 'none',
                        backgroundColor: 'transparent',
                        color: 'var(--text-primary)',
                        fontSize: '14px',
                        textAlign: 'left',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'var(--bg-active)')}
                      onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
                    >
                      📄 Export as CSV
                    </button>
                    <button
                      onClick={() => {
                        handleExport('excel');
                        setShowExportMenu(false);
                      }}
                      style={{
                        width: '100%',
                        padding: '10px 16px',
                        border: 'none',
                        backgroundColor: 'transparent',
                        color: 'var(--text-primary)',
                        fontSize: '14px',
                        textAlign: 'left',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'var(--bg-active)')}
                      onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
                    >
                      📊 Export as Excel
                    </button>
                    <button
                      onClick={() => {
                        handleExport('pdf');
                        setShowExportMenu(false);
                      }}
                      style={{
                        width: '100%',
                        padding: '10px 16px',
                        border: 'none',
                        backgroundColor: 'transparent',
                        color: 'var(--text-primary)',
                        fontSize: '14px',
                        textAlign: 'left',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'var(--bg-active)')}
                      onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
                    >
                      📑 Export as PDF
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Filters */}
          <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
            {currentReport?.hasDateFilter && (
              <>
                <input
                  type="date"
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                  placeholder="From Date"
                  style={{
                    padding: '6px 10px',
                    borderRadius: '6px',
                    border: '1px solid var(--border-color)',
                    backgroundColor: 'var(--bg-secondary)',
                    color: 'var(--text-primary)',
                    fontSize: '13px',
                  }}
                />
                <input
                  type="date"
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                  placeholder="To Date"
                  style={{
                    padding: '6px 10px',
                    borderRadius: '6px',
                    border: '1px solid var(--border-color)',
                    backgroundColor: 'var(--bg-secondary)',
                    color: 'var(--text-primary)',
                    fontSize: '13px',
                  }}
                />
              </>
            )}

            {currentReport?.hasStatusFilter && (
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                style={{
                  padding: '6px 10px',
                  borderRadius: '6px',
                  border: '1px solid var(--border-color)',
                  backgroundColor: 'var(--bg-secondary)',
                  color: 'var(--text-primary)',
                  fontSize: '13px',
                }}
              >
                <option value="all">All Status</option>
                <option value="active">Active</option>
                <option value="hot">Hot</option>
                <option value="warm">Warm</option>
                <option value="cold">Cold</option>
                <option value="completed">Completed</option>
                <option value="cancelled">Cancelled</option>
              </select>
            )}

            {currentReport?.hasSourceFilter && (
              <select
                value={sourceFilter}
                onChange={(e) => setSourceFilter(e.target.value)}
                style={{
                  padding: '6px 10px',
                  borderRadius: '6px',
                  border: '1px solid var(--border-color)',
                  backgroundColor: 'var(--bg-secondary)',
                  color: 'var(--text-primary)',
                  fontSize: '13px',
                }}
              >
                <option value="all">All Sources</option>
                <option value="website">Website</option>
                <option value="99acres">99acres</option>
                <option value="magicbricks">MagicBricks</option>
                <option value="housing">Housing.com</option>
                <option value="facebook">Facebook</option>
                <option value="referral">Referral</option>
              </select>
            )}

            {currentReport?.hasTypeFilter && selectedCategory === 'call' && (
              <select
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value)}
                style={{
                  padding: '6px 10px',
                  borderRadius: '6px',
                  border: '1px solid var(--border-color)',
                  backgroundColor: 'var(--bg-secondary)',
                  color: 'var(--text-primary)',
                  fontSize: '13px',
                }}
              >
                <option value="all">All Calls</option>
                <option value="inbound">Inbound</option>
                <option value="outbound">Outbound</option>
              </select>
            )}

            {currentReport?.hasTypeFilter && selectedCategory === 'property' && (
              <select
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value)}
                style={{
                  padding: '6px 10px',
                  borderRadius: '6px',
                  border: '1px solid var(--border-color)',
                  backgroundColor: 'var(--bg-secondary)',
                  color: 'var(--text-primary)',
                  fontSize: '13px',
                }}
              >
                <option value="all">All Types</option>
                <option value="flat">Flat</option>
                <option value="house">House</option>
                <option value="plot">Plot</option>
                <option value="villa">Villa</option>
                <option value="commercial">Commercial</option>
              </select>
            )}

            {(dateFrom || dateTo || statusFilter !== 'all' || sourceFilter !== 'all' || typeFilter !== 'all') && (
              <button
                onClick={() => {
                  setDateFrom('');
                  setDateTo('');
                  setStatusFilter('all');
                  setSourceFilter('all');
                  setTypeFilter('all');
                }}
                style={{
                  padding: '6px 12px',
                  borderRadius: '6px',
                  border: '1px solid var(--border-color)',
                  backgroundColor: 'var(--bg-secondary)',
                  color: 'var(--text-secondary)',
                  fontSize: '13px',
                  cursor: 'pointer',
                }}
              >
                Clear Filters
              </button>
            )}
          </div>
        </div>

        {/* Report Content */}
        <div style={{ flex: 1, overflow: 'auto', padding: '32px' }}>
          {loading && (
            <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--text-secondary)' }}>
              Loading report...
            </div>
          )}

          {error && (
            <div
              style={{
                textAlign: 'center',
                padding: '40px 20px',
                color: '#ef4444',
                backgroundColor: 'var(--error-bg)',
                borderRadius: '8px',
              }}
            >
              Error: {error}
            </div>
          )}

          {!loading && !error && reportData && <ReportRenderer data={reportData} />}
        </div>
      </div>
    </div>
  );
}

// Generic Report Renderer
function ReportRenderer({ data }: { data: any }) {
  // For reports with data arrays
  if (data.data && Array.isArray(data.data)) {
    if (data.data.length === 0) {
      return (
        <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--text-secondary)' }}>
          No data found for this report
        </div>
      );
    }

    return (
      <div>
        {data.summary && (
          <div style={{ marginBottom: '24px', display: 'flex', gap: '16px' }}>
            {Object.entries(data.summary).map(([key, value]: [string, any]) => (
              <div
                key={key}
                style={{
                  padding: '16px 20px',
                  backgroundColor: 'var(--bg-secondary)',
                  borderRadius: '8px',
                  border: '1px solid var(--border-color)',
                }}
              >
                <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginBottom: '4px', textTransform: 'uppercase' }}>
                  {key.replace(/_/g, ' ')}
                </div>
                <div style={{ fontSize: '24px', fontWeight: '700', color: 'var(--primary)' }}>
                  {typeof value === 'number' ? value.toLocaleString() : value}
                </div>
              </div>
            ))}
          </div>
        )}

        <div style={{ backgroundColor: 'var(--bg-secondary)', borderRadius: '8px', border: '1px solid var(--border-color)', overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead style={{ backgroundColor: 'var(--bg-primary)' }}>
                <tr style={{ borderBottom: '1px solid var(--border-color)' }}>
                  {data.data.length > 0 &&
                    Object.keys(data.data[0]).map((key) => (
                      <th
                        key={key}
                        style={{
                          padding: '12px 16px',
                          textAlign: 'left',
                          fontSize: '11px',
                          fontWeight: '600',
                          color: 'var(--text-secondary)',
                          textTransform: 'uppercase',
                          letterSpacing: '0.05em',
                        }}
                      >
                        {key.replace(/_/g, ' ')}
                      </th>
                    ))}
                </tr>
              </thead>
              <tbody>
                {data.data.map((row: any, idx: number) => (
                  <tr key={idx} style={{ borderBottom: '1px solid var(--bg-primary)' }}>
                    {Object.values(row).map((value: any, cellIdx) => (
                      <td
                        key={cellIdx}
                        style={{
                          padding: '12px 16px',
                          fontSize: '13px',
                          color: 'var(--text-primary)',
                        }}
                      >
                        {formatCellValue(value)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {data.total && (
          <div style={{ marginTop: '16px', textAlign: 'right', color: 'var(--text-secondary)', fontSize: '13px' }}>
            Total: {data.total.toLocaleString()} records
          </div>
        )}
      </div>
    );
  }

  // For summary-only reports (like lead summary, property availability)
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {Object.entries(data).map(([key, value]: [string, any]) => {
        if (Array.isArray(value)) {
          return (
            <div key={key}>
              <h3 style={{ fontSize: '16px', fontWeight: '600', margin: '0 0 16px', color: 'var(--text-primary)', textTransform: 'capitalize' }}>
                {key.replace(/_/g, ' ')}
              </h3>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '12px' }}>
                {value.map((item: any, idx: number) => {
                  const label = item[Object.keys(item)[0]];
                  const count = item._count?.id || item._count || item.count || 0;
                  return (
                    <div
                      key={idx}
                      style={{
                        padding: '16px',
                        backgroundColor: 'var(--bg-secondary)',
                        borderRadius: '8px',
                        border: '1px solid var(--border-color)',
                      }}
                    >
                      <div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '6px' }}>
                        {String(label || 'Unknown')}
                      </div>
                      <div style={{ fontSize: '24px', fontWeight: '700', color: 'var(--primary)' }}>{count}</div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        }
        return null;
      })}
    </div>
  );
}

function formatCellValue(value: any): string {
  if (value === null || value === undefined) return '-';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (typeof value === 'object') {
    if (value instanceof Date) return value.toLocaleDateString();
    // Check if it's a date string
    if (typeof value === 'string' && !isNaN(Date.parse(value))) {
      return new Date(value).toLocaleDateString();
    }
    return JSON.stringify(value);
  }
  return String(value);
}
