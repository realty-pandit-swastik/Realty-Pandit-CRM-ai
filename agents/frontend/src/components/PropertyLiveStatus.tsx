import React, { useEffect, useState } from 'react';
import { getInventory, updateInventory } from '../api/client';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';

interface Unit {
  id: string;
  flat_no: string;
  status: string;
  price?: number;
  specs?: any;
  floor_number?: number;
}

const STATUS_COLORS = {
  active: { bg: '#dcfce7', border: '#10b981', text: '#166534', label: 'Available' },
  sold: { bg: '#fee2e2', border: '#ef4444', text: '#991b1b', label: 'Sold' },
  rented: { bg: '#fef3c7', border: '#f59e0b', text: '#92400e', label: 'Rented' },
  withdrawn: { bg: '#f3f4f6', border: '#6b7280', text: '#374151', label: 'Withdrawn' },
  hold: { bg: '#dbeafe', border: '#3b82f6', text: '#1e40af', label: 'On Hold' },
};

export const PropertyLiveStatus: React.FC = () => {
  const { hasPermission } = useAuth();
  const { showToast } = useToast();
  const [properties, setProperties] = useState<Unit[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedUnit, setSelectedUnit] = useState<Unit | null>(null);
  const [filterStatus, setFilterStatus] = useState('');
  const [filterLocation, setFilterLocation] = useState('');
  const [groupBy, setGroupBy] = useState<'all' | 'location' | 'floor'>('all');

  useEffect(() => {
    loadProperties();
  }, []);

  const loadProperties = async () => {
    try {
      setLoading(true);
      const response = await getInventory({ limit: 1000 });
      const data = Array.isArray(response) ? response : response?.data || [];
      setProperties(data);
    } catch (error) {
      console.error('Error loading properties:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleStatusChange = async (unitId: string, newStatus: string) => {
    try {
      await updateInventory(unitId, { status: newStatus });
      await loadProperties();
      setSelectedUnit(null);
    } catch (error) {
      console.error('Error updating status:', error);
      showToast('Failed to update status', 'error');
    }
  };

  const formatPrice = (price: number | null | undefined) => {
    if (!price) return 'Price on request';
    const num = Number(price);
    if (num >= 10000000) return `₹${(num / 10000000).toFixed(1)} Cr`;
    if (num >= 100000) return `₹${(num / 100000).toFixed(1)} Lakh`;
    return `₹${num.toLocaleString('en-IN')}`;
  };

  // Filter and group properties
  let filtered = properties;
  if (filterStatus) {
    filtered = filtered.filter((p) => p.status === filterStatus);
  }
  if (filterLocation) {
    filtered = filtered.filter((p) => {
      const loc = (p as any).locality || (p as any).location || '';
      return loc.toLowerCase().includes(filterLocation.toLowerCase());
    });
  }

  // Group properties
  const grouped: { [key: string]: Unit[] } = {};
  if (groupBy === 'location') {
    filtered.forEach((unit) => {
      const key = (unit as any).locality || (unit as any).location || 'Unknown';
      if (!grouped[key]) grouped[key] = [];
      grouped[key].push(unit);
    });
  } else if (groupBy === 'floor') {
    filtered.forEach((unit) => {
      const key = unit.floor_number ? `Floor ${unit.floor_number}` : 'Ground Floor';
      if (!grouped[key]) grouped[key] = [];
      grouped[key].push(unit);
    });
  } else {
    grouped['All Properties'] = filtered;
  }

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', padding: '40px' }}>
        <p style={{ color: 'var(--text-secondary)' }}>Loading properties...</p>
      </div>
    );
  }

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', backgroundColor: 'var(--bg-primary)' }}>
      {/* Header */}
      <div
        style={{
          padding: '20px 32px',
          borderBottom: '1px solid var(--border-color)',
          backgroundColor: 'var(--bg-primary)',
        }}
      >
        <h2 style={{ fontSize: '20px', fontWeight: '600', margin: '0 0 4px', color: 'var(--text-primary)' }}>
          Property Live Status
        </h2>
        <p style={{ fontSize: '13px', color: 'var(--text-secondary)', margin: 0 }}>
          Real-time inventory status board
        </p>
      </div>

      {/* Stats Bar */}
      <div
        style={{
          display: 'flex',
          gap: '12px',
          padding: '16px 32px',
          borderBottom: '1px solid var(--border-color)',
          backgroundColor: 'var(--bg-secondary)',
          overflowX: 'auto',
        }}
      >
        {Object.entries(STATUS_COLORS).map(([status, config]) => {
          const count = properties.filter((p) => p.status === status).length;
          return (
            <div
              key={status}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '8px 16px',
                borderRadius: '8px',
                border: `1px solid ${config.border}`,
                backgroundColor: config.bg,
                whiteSpace: 'nowrap',
              }}
            >
              <div
                style={{
                  width: '10px',
                  height: '10px',
                  borderRadius: '50%',
                  backgroundColor: config.border,
                }}
              />
              <span style={{ fontSize: '13px', fontWeight: '600', color: config.text }}>
                {config.label}: {count}
              </span>
            </div>
          );
        })}
      </div>

      {/* Filters */}
      <div
        style={{
          display: 'flex',
          gap: '12px',
          padding: '16px 32px',
          borderBottom: '1px solid var(--border-color)',
          backgroundColor: 'var(--bg-primary)',
          flexWrap: 'wrap',
        }}
      >
        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
          style={{
            padding: '8px 12px',
            borderRadius: '6px',
            border: '1px solid var(--border-color)',
            backgroundColor: 'var(--bg-secondary)',
            color: 'var(--text-primary)',
            fontSize: '14px',
          }}
        >
          <option value="">All Status</option>
          <option value="active">Available</option>
          <option value="sold">Sold</option>
          <option value="rented">Rented</option>
          <option value="hold">On Hold</option>
          <option value="withdrawn">Withdrawn</option>
        </select>

        <input
          type="text"
          placeholder="Search by location..."
          value={filterLocation}
          onChange={(e) => setFilterLocation(e.target.value)}
          style={{
            padding: '8px 12px',
            borderRadius: '6px',
            border: '1px solid var(--border-color)',
            backgroundColor: 'var(--bg-secondary)',
            color: 'var(--text-primary)',
            fontSize: '14px',
            minWidth: '200px',
          }}
        />

        <select
          value={groupBy}
          onChange={(e) => setGroupBy(e.target.value as any)}
          style={{
            padding: '8px 12px',
            borderRadius: '6px',
            border: '1px solid var(--border-color)',
            backgroundColor: 'var(--bg-secondary)',
            color: 'var(--text-primary)',
            fontSize: '14px',
          }}
        >
          <option value="all">View All</option>
          <option value="location">Group by Location</option>
          <option value="floor">Group by Floor</option>
        </select>

        <button
          onClick={() => {
            setFilterStatus('');
            setFilterLocation('');
            setGroupBy('all');
          }}
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
          Reset
        </button>
      </div>

      {/* Units Grid */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '24px 32px' }}>
        {Object.entries(grouped).map(([groupName, units]) => (
          <div key={groupName} style={{ marginBottom: '32px' }}>
            <h3 style={{ fontSize: '16px', fontWeight: '600', margin: '0 0 16px', color: 'var(--text-primary)' }}>
              {groupName} ({units.length} units)
            </h3>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))',
                gap: '12px',
              }}
            >
              {units.map((unit) => {
                const statusConfig = STATUS_COLORS[unit.status as keyof typeof STATUS_COLORS] || STATUS_COLORS.active;
                return (
                  <div
                    key={unit.id}
                    onClick={() => setSelectedUnit(unit)}
                    style={{
                      padding: '16px',
                      borderRadius: '8px',
                      border: `2px solid ${statusConfig.border}`,
                      backgroundColor: statusConfig.bg,
                      cursor: 'pointer',
                      transition: 'transform 0.2s, box-shadow 0.2s',
                      textAlign: 'center',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.transform = 'translateY(-2px)';
                      e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.1)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.transform = 'translateY(0)';
                      e.currentTarget.style.boxShadow = 'none';
                    }}
                  >
                    <div style={{ fontSize: '16px', fontWeight: '700', color: statusConfig.text, marginBottom: '4px' }}>
                      {unit.flat_no || 'N/A'}
                    </div>
                    <div style={{ fontSize: '11px', color: statusConfig.text, opacity: 0.8 }}>
                      {unit.specs?.bedrooms && `${unit.specs.bedrooms} BHK`}
                    </div>
                    <div style={{ fontSize: '12px', fontWeight: '600', color: statusConfig.text, marginTop: '8px' }}>
                      {formatPrice(unit.price)}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}

        {filtered.length === 0 && (
          <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--text-secondary)' }}>
            No properties match the current filters
          </div>
        )}
      </div>

      {/* Unit Detail Modal */}
      {selectedUnit && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0,0,0,0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
          }}
          onClick={() => setSelectedUnit(null)}
        >
          <div
            style={{
              backgroundColor: 'var(--bg-primary)',
              borderRadius: '12px',
              padding: '24px',
              maxWidth: '500px',
              width: '90%',
              maxHeight: '80vh',
              overflowY: 'auto',
              boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '20px' }}>
              <div>
                <h3 style={{ fontSize: '20px', fontWeight: '600', margin: 0, color: 'var(--text-primary)' }}>
                  {selectedUnit.flat_no || 'Property Details'}
                </h3>
                <p style={{ fontSize: '13px', color: 'var(--text-secondary)', margin: '4px 0 0' }}>
                  {(selectedUnit as any).locality || (selectedUnit as any).location}
                </p>
              </div>
              <button
                onClick={() => setSelectedUnit(null)}
                style={{
                  background: 'none',
                  border: 'none',
                  fontSize: '24px',
                  cursor: 'pointer',
                  color: 'var(--text-secondary)',
                  padding: 0,
                }}
              >
                ×
              </button>
            </div>

            <div style={{ marginBottom: '20px' }}>
              <div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '4px' }}>Price</div>
              <div style={{ fontSize: '24px', fontWeight: '700', color: 'var(--primary)' }}>
                {formatPrice(selectedUnit.price)}
              </div>
            </div>

            {selectedUnit.specs && (
              <div style={{ marginBottom: '20px' }}>
                <div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '8px' }}>Specifications</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                  {selectedUnit.specs.bedrooms && (
                    <div style={{ fontSize: '14px', color: 'var(--text-primary)' }}>🛏️ {selectedUnit.specs.bedrooms} BHK</div>
                  )}
                  {selectedUnit.specs.bathrooms && (
                    <div style={{ fontSize: '14px', color: 'var(--text-primary)' }}>🚿 {selectedUnit.specs.bathrooms} Bath</div>
                  )}
                  {selectedUnit.specs.area && (
                    <div style={{ fontSize: '14px', color: 'var(--text-primary)' }}>
                      📐 {selectedUnit.specs.area} {selectedUnit.specs.unit || 'sqft'}
                    </div>
                  )}
                </div>
              </div>
            )}

            {hasPermission('manage_inventory') && (
              <div>
                <div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '8px' }}>Change Status</div>
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                  {Object.entries(STATUS_COLORS).map(([status, config]) => (
                    <button
                      key={status}
                      onClick={() => handleStatusChange(selectedUnit.id, status)}
                      disabled={selectedUnit.status === status}
                      style={{
                        padding: '8px 16px',
                        borderRadius: '6px',
                        border: `2px solid ${config.border}`,
                        backgroundColor: selectedUnit.status === status ? config.bg : 'var(--bg-secondary)',
                        color: config.text,
                        fontSize: '13px',
                        fontWeight: '600',
                        cursor: selectedUnit.status === status ? 'default' : 'pointer',
                        opacity: selectedUnit.status === status ? 1 : 0.7,
                      }}
                    >
                      {config.label}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
