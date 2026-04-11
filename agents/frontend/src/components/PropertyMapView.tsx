import React, { useState, useEffect, useCallback, useRef } from 'react';
import { GoogleMap, useJsApiLoader, Marker, InfoWindow, MarkerClusterer } from '@react-google-maps/api';
import { getInventory } from '../api/client';

const GOOGLE_MAPS_API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || '';
const LIBRARIES: ('places')[] = ['places']; // Must be stable ref outside component

// Default center: India (will auto-zoom to properties)
const defaultCenter = {
  lat: 28.6139, // Delhi
  lng: 77.2090,
};

interface Property {
  id: string;
  flat_property_type_id?: string;
  category?: string;
  type?: string;
  status: string;
  intent: string;
  price?: number;
  latitude?: number;
  longitude?: number;
  location?: string;
  locality?: string;
  city?: string;
  state?: string;
  full_address?: string;
  specs?: any;
  media_urls?: string[];
  owner_phone?: string;
}

interface Filters {
  intent: string;
  type: string;
  priceMin: string;
  priceMax: string;
  status: string;
  location: string;
}

const getMarkerColor = (status: string): string => {
  switch (status.toLowerCase()) {
    case 'active':
      return '#10b981'; // Green
    case 'sold':
    case 'rented':
      return '#ef4444'; // Red
    case 'withdrawn':
      return '#6b7280'; // Gray
    default:
      return '#f59e0b'; // Yellow/Orange for hold/pending
  }
};

const formatPrice = (price: number | null | undefined, intent: string): string => {
  if (!price || price === 0) return 'Price on request';
  const num = Number(price);
  if (intent === 'rent') {
    return `₹${num.toLocaleString('en-IN')}/month`;
  }
  if (num >= 10000000) {
    return `₹${(num / 10000000).toFixed(1)} Cr`;
  }
  if (num >= 100000) {
    return `₹${(num / 100000).toFixed(1)} Lakh`;
  }
  return `₹${num.toLocaleString('en-IN')}`;
};

export const PropertyMapView: React.FC = () => {
  const [properties, setProperties] = useState<Property[]>([]);
  const [filteredProperties, setFilteredProperties] = useState<Property[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedProperty, setSelectedProperty] = useState<Property | null>(null);
  const [showFilters, setShowFilters] = useState(true);
  const [filters, setFilters] = useState<Filters>({
    intent: '',
    type: '',
    priceMin: '',
    priceMax: '',
    status: '',
    location: '',
  });

  const mapContainerRef = useRef<HTMLDivElement>(null);

  const { isLoaded, loadError } = useJsApiLoader({
    id: 'google-map-script',
    googleMapsApiKey: GOOGLE_MAPS_API_KEY,
    libraries: LIBRARIES,
  });

  const [map, setMap] = useState<google.maps.Map | null>(null);
  const [containerReady, setContainerReady] = useState(false);

  // Wait for container to be in the DOM before rendering GoogleMap
  useEffect(() => {
    if (isLoaded && mapContainerRef.current) {
      setContainerReady(true);
    }
  }, [isLoaded]);

  const onLoad = useCallback((map: google.maps.Map) => {
    setMap(map);
  }, []);

  const onUnmount = useCallback(() => {
    setMap(null);
  }, []);

  // Load properties from API
  useEffect(() => {
    loadProperties();
  }, []);

  const loadProperties = async () => {
    try {
      setLoading(true);
      const response = await getInventory({ page: 1, limit: 1000 }); // Load all properties
      const data = Array.isArray(response) ? response : response?.data || [];

      // Filter properties that have geocoordinates
      const geoProperties = data.filter(
        (p: Property) => p.latitude != null && p.longitude != null
      );

      setProperties(geoProperties);
      setFilteredProperties(geoProperties);

      // Auto-zoom to fit all markers
      if (map && geoProperties.length > 0) {
        const bounds = new google.maps.LatLngBounds();
        geoProperties.forEach((p: Property) => {
          if (p.latitude && p.longitude) {
            bounds.extend({ lat: p.latitude, lng: p.longitude });
          }
        });
        map.fitBounds(bounds);
      }
    } catch (error) {
      console.error('Error loading properties:', error);
    } finally {
      setLoading(false);
    }
  };

  // Apply filters
  useEffect(() => {
    let filtered = [...properties];

    if (filters.intent) {
      filtered = filtered.filter((p) => p.intent === filters.intent);
    }

    if (filters.type) {
      filtered = filtered.filter((p) => p.type === filters.type);
    }

    if (filters.status) {
      filtered = filtered.filter((p) => p.status === filters.status);
    }

    if (filters.location) {
      const searchLower = filters.location.toLowerCase();
      filtered = filtered.filter(
        (p) =>
          p.location?.toLowerCase().includes(searchLower) ||
          p.locality?.toLowerCase().includes(searchLower) ||
          p.city?.toLowerCase().includes(searchLower) ||
          p.state?.toLowerCase().includes(searchLower)
      );
    }

    if (filters.priceMin) {
      const minPrice = parseFloat(filters.priceMin);
      filtered = filtered.filter((p) => (p.price || 0) >= minPrice);
    }

    if (filters.priceMax) {
      const maxPrice = parseFloat(filters.priceMax);
      filtered = filtered.filter((p) => (p.price || 0) <= maxPrice);
    }

    setFilteredProperties(filtered);

    // Update map bounds to fit filtered properties
    if (map && filtered.length > 0) {
      const bounds = new google.maps.LatLngBounds();
      filtered.forEach((p) => {
        if (p.latitude && p.longitude) {
          bounds.extend({ lat: p.latitude, lng: p.longitude });
        }
      });
      map.fitBounds(bounds);
    }
  }, [filters, properties, map]);

  const handleFilterChange = (key: keyof Filters, value: string) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
  };

  const resetFilters = () => {
    setFilters({
      intent: '',
      type: '',
      priceMin: '',
      priceMax: '',
      status: '',
      location: '',
    });
  };

  if (loadError) {
    return (
      <div style={{ padding: '20px', textAlign: 'center' }}>
        <p style={{ color: 'var(--error)' }}>
          Error loading Google Maps. Please check your API key configuration.
        </p>
      </div>
    );
  }

  if (!GOOGLE_MAPS_API_KEY) {
    return (
      <div style={{ padding: '20px', textAlign: 'center' }}>
        <p style={{ color: 'var(--error)' }}>
          Google Maps API key not configured. Please add VITE_GOOGLE_MAPS_API_KEY to your .env file.
        </p>
      </div>
    );
  }

  return (
    <div style={{ position: 'relative', width: '100%', height: 'calc(100vh - 60px)' }}>
      {/* Header */}
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          zIndex: 10,
          backgroundColor: 'var(--bg-primary)',
          padding: '12px 20px',
          borderBottom: '1px solid var(--border-color)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <h2 style={{ margin: 0, fontSize: '18px', fontWeight: '600' }}>
          Property Map View
          <span style={{ marginLeft: '12px', fontSize: '14px', color: 'var(--text-secondary)' }}>
            ({filteredProperties.length} properties)
          </span>
        </h2>
        <button
          onClick={() => setShowFilters(!showFilters)}
          style={{
            padding: '8px 16px',
            backgroundColor: showFilters ? 'var(--primary)' : 'var(--bg-secondary)',
            color: showFilters ? 'white' : 'var(--text-primary)',
            border: '1px solid var(--border-color)',
            borderRadius: '6px',
            cursor: 'pointer',
            fontSize: '14px',
          }}
        >
          {showFilters ? 'Hide Filters' : 'Show Filters'}
        </button>
      </div>

      {/* Filters Sidebar */}
      {showFilters && (
        <div
          style={{
            position: 'absolute',
            top: '61px',
            left: 0,
            zIndex: 10,
            width: '280px',
            height: 'calc(100% - 61px)',
            backgroundColor: 'var(--bg-primary)',
            borderRight: '1px solid var(--border-color)',
            overflowY: 'auto',
            padding: '16px',
          }}
        >
          <h3 style={{ marginTop: 0, fontSize: '16px', fontWeight: '600', marginBottom: '16px' }}>
            Filters
          </h3>

          {/* Intent Filter */}
          <div style={{ marginBottom: '16px' }}>
            <label style={{ display: 'block', marginBottom: '6px', fontSize: '14px', fontWeight: '500' }}>
              Intent
            </label>
            <select
              value={filters.intent}
              onChange={(e) => handleFilterChange('intent', e.target.value)}
              style={{
                width: '100%',
                padding: '8px',
                border: '1px solid var(--border-color)',
                borderRadius: '6px',
                fontSize: '14px',
                backgroundColor: 'var(--bg-secondary)',
                color: 'var(--text-primary)',
              }}
            >
              <option value="">All</option>
              <option value="sell">Sale</option>
              <option value="rent">Rent</option>
              <option value="lease">Lease</option>
            </select>
          </div>

          {/* Type Filter */}
          <div style={{ marginBottom: '16px' }}>
            <label style={{ display: 'block', marginBottom: '6px', fontSize: '14px', fontWeight: '500' }}>
              Property Type
            </label>
            <select
              value={filters.type}
              onChange={(e) => handleFilterChange('type', e.target.value)}
              style={{
                width: '100%',
                padding: '8px',
                border: '1px solid var(--border-color)',
                borderRadius: '6px',
                fontSize: '14px',
                backgroundColor: 'var(--bg-secondary)',
                color: 'var(--text-primary)',
              }}
            >
              <option value="">All Types</option>
              <option value="flat">Flat</option>
              <option value="house">House</option>
              <option value="plot">Plot</option>
              <option value="office">Office</option>
              <option value="shop">Shop</option>
              <option value="warehouse">Warehouse</option>
            </select>
          </div>

          {/* Status Filter */}
          <div style={{ marginBottom: '16px' }}>
            <label style={{ display: 'block', marginBottom: '6px', fontSize: '14px', fontWeight: '500' }}>
              Status
            </label>
            <select
              value={filters.status}
              onChange={(e) => handleFilterChange('status', e.target.value)}
              style={{
                width: '100%',
                padding: '8px',
                border: '1px solid var(--border-color)',
                borderRadius: '6px',
                fontSize: '14px',
                backgroundColor: 'var(--bg-secondary)',
                color: 'var(--text-primary)',
              }}
            >
              <option value="">All Status</option>
              <option value="active">Available</option>
              <option value="sold">Sold</option>
              <option value="rented">Rented</option>
              <option value="withdrawn">Withdrawn</option>
            </select>
          </div>

          {/* Price Range */}
          <div style={{ marginBottom: '16px' }}>
            <label style={{ display: 'block', marginBottom: '6px', fontSize: '14px', fontWeight: '500' }}>
              Price Range (₹)
            </label>
            <div style={{ display: 'flex', gap: '8px' }}>
              <input
                type="number"
                placeholder="Min"
                value={filters.priceMin}
                onChange={(e) => handleFilterChange('priceMin', e.target.value)}
                style={{
                  flex: 1,
                  padding: '8px',
                  border: '1px solid var(--border-color)',
                  borderRadius: '6px',
                  fontSize: '14px',
                  backgroundColor: 'var(--bg-secondary)',
                  color: 'var(--text-primary)',
                }}
              />
              <input
                type="number"
                placeholder="Max"
                value={filters.priceMax}
                onChange={(e) => handleFilterChange('priceMax', e.target.value)}
                style={{
                  flex: 1,
                  padding: '8px',
                  border: '1px solid var(--border-color)',
                  borderRadius: '6px',
                  fontSize: '14px',
                  backgroundColor: 'var(--bg-secondary)',
                  color: 'var(--text-primary)',
                }}
              />
            </div>
          </div>

          {/* Location Search */}
          <div style={{ marginBottom: '16px' }}>
            <label style={{ display: 'block', marginBottom: '6px', fontSize: '14px', fontWeight: '500' }}>
              Location Search
            </label>
            <input
              type="text"
              placeholder="City, locality, area..."
              value={filters.location}
              onChange={(e) => handleFilterChange('location', e.target.value)}
              style={{
                width: '100%',
                padding: '8px',
                border: '1px solid var(--border-color)',
                borderRadius: '6px',
                fontSize: '14px',
                backgroundColor: 'var(--bg-secondary)',
                color: 'var(--text-primary)',
              }}
            />
          </div>

          {/* Reset Button */}
          <button
            onClick={resetFilters}
            style={{
              width: '100%',
              padding: '10px',
              backgroundColor: 'var(--bg-secondary)',
              color: 'var(--text-primary)',
              border: '1px solid var(--border-color)',
              borderRadius: '6px',
              cursor: 'pointer',
              fontSize: '14px',
              fontWeight: '500',
            }}
          >
            Reset Filters
          </button>

          {/* Legend */}
          <div style={{ marginTop: '24px', paddingTop: '16px', borderTop: '1px solid var(--border-color)' }}>
            <h4 style={{ fontSize: '14px', fontWeight: '600', marginBottom: '12px' }}>Legend</h4>
            <div style={{ fontSize: '13px' }}>
              <div style={{ display: 'flex', alignItems: 'center', marginBottom: '8px' }}>
                <div
                  style={{
                    width: '12px',
                    height: '12px',
                    borderRadius: '50%',
                    backgroundColor: '#10b981',
                    marginRight: '8px',
                  }}
                />
                <span>Available</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', marginBottom: '8px' }}>
                <div
                  style={{
                    width: '12px',
                    height: '12px',
                    borderRadius: '50%',
                    backgroundColor: '#ef4444',
                    marginRight: '8px',
                  }}
                />
                <span>Sold/Rented</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', marginBottom: '8px' }}>
                <div
                  style={{
                    width: '12px',
                    height: '12px',
                    borderRadius: '50%',
                    backgroundColor: '#f59e0b',
                    marginRight: '8px',
                  }}
                />
                <span>On Hold</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center' }}>
                <div
                  style={{
                    width: '12px',
                    height: '12px',
                    borderRadius: '50%',
                    backgroundColor: '#6b7280',
                    marginRight: '8px',
                  }}
                />
                <span>Withdrawn</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Map Container */}
      <div
        ref={mapContainerRef}
        style={{
          position: 'absolute',
          top: '61px',
          left: showFilters ? '280px' : 0,
          right: 0,
          bottom: 0,
        }}
      >
        {loading && (
          <div
            style={{
              position: 'absolute',
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
              zIndex: 1,
            }}
          >
            <p>Loading properties...</p>
          </div>
        )}

        {!loading && filteredProperties.length === 0 && properties.length === 0 && (
          <div
            style={{
              position: 'absolute',
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
              zIndex: 1,
              textAlign: 'center',
              padding: '40px',
              backgroundColor: 'var(--bg-primary)',
              borderRadius: '12px',
              boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
              maxWidth: '400px',
            }}
          >
            <p style={{ fontSize: '18px', fontWeight: '600', marginBottom: '8px' }}>No Properties on Map</p>
            <p style={{ color: 'var(--text-secondary)', fontSize: '14px' }}>
              Properties need latitude and longitude coordinates to appear on the map.
              Add coordinates to your inventory properties to see them here.
            </p>
          </div>
        )}

        {isLoaded && containerReady && (
          <GoogleMap
            mapContainerStyle={{ width: '100%', height: '100%' }}
            center={defaultCenter}
            zoom={10}
            onLoad={onLoad}
            onUnmount={onUnmount}
            options={{
              streetViewControl: false,
              mapTypeControl: true,
              fullscreenControl: true,
              zoomControl: true,
            }}
          >
            <MarkerClusterer>
              {(clusterer) => (
                <>
                  {filteredProperties.map((property) => {
                    if (!property.latitude || !property.longitude) return null;

                    return (
                      <Marker
                        key={property.id}
                        position={{ lat: property.latitude, lng: property.longitude }}
                        clusterer={clusterer}
                        onClick={() => setSelectedProperty(property)}
                        icon={{
                          path: google.maps.SymbolPath.CIRCLE,
                          scale: 8,
                          fillColor: getMarkerColor(property.status),
                          fillOpacity: 0.9,
                          strokeColor: '#ffffff',
                          strokeWeight: 2,
                        }}
                      />
                    );
                  })}
                </>
              )}
            </MarkerClusterer>

            {/* Info Window */}
            {selectedProperty && selectedProperty.latitude && selectedProperty.longitude && (
              <InfoWindow
                position={{ lat: selectedProperty.latitude, lng: selectedProperty.longitude }}
                onCloseClick={() => setSelectedProperty(null)}
              >
                <div style={{ maxWidth: '280px', padding: '8px' }}>
                  {selectedProperty.media_urls && selectedProperty.media_urls.length > 0 && (
                    <img
                      src={selectedProperty.media_urls[0]}
                      alt="Property"
                      style={{
                        width: '100%',
                        height: '150px',
                        objectFit: 'cover',
                        borderRadius: '6px',
                        marginBottom: '12px',
                      }}
                    />
                  )}
                  <h3 style={{ margin: '0 0 8px 0', fontSize: '16px', fontWeight: '600' }}>
                    {selectedProperty.type?.toUpperCase()} for{' '}
                    {selectedProperty.intent === 'sell' ? 'Sale' : 'Rent'}
                  </h3>
                  <p style={{ margin: '0 0 8px 0', fontSize: '14px', color: '#666' }}>
                    {selectedProperty.locality || selectedProperty.location}, {selectedProperty.city}
                  </p>
                  <p style={{ margin: '0 0 8px 0', fontSize: '16px', fontWeight: '600', color: '#059669' }}>
                    {formatPrice(selectedProperty.price, selectedProperty.intent)}
                  </p>
                  {selectedProperty.specs && (
                    <p style={{ margin: '0 0 12px 0', fontSize: '13px', color: '#666' }}>
                      {selectedProperty.specs.bedrooms && `${selectedProperty.specs.bedrooms} BHK`}
                      {selectedProperty.specs.area && ` • ${selectedProperty.specs.area} ${selectedProperty.specs.unit || 'sqft'}`}
                    </p>
                  )}
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <span
                      style={{
                        display: 'inline-block',
                        padding: '4px 8px',
                        fontSize: '12px',
                        borderRadius: '4px',
                        backgroundColor: getMarkerColor(selectedProperty.status),
                        color: 'white',
                      }}
                    >
                      {selectedProperty.status?.toUpperCase()}
                    </span>
                  </div>
                </div>
              </InfoWindow>
            )}
          </GoogleMap>
        )}
      </div>
    </div>
  );
};
