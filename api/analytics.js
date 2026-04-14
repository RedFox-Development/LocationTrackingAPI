/**
 * Location Tracking Analytics - JavaScript Implementation
 * Computes analytics on-demand from location_updates data
 * 
 * Features:
 * - Team metrics (distance, speed, dwell times)
 * - Dwell point detection (stationary clustering)
 * - Heatmap grid generation
 * - Data exports (GeoJSON, CSV, KML)
 */

/**
 * Calculate distance between two lat/lon points in meters (Haversine formula)
 */
export const haversineDistance = (lat1, lon1, lat2, lon2) => {
  const R = 6371000; // Earth radius in meters
  const toRad = (deg) => (deg * Math.PI) / 180;
  
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
};

/**
 * Compute team metrics from location updates
 * Returns: distance, speed, active duration, stationary duration, coverage bounds
 */
export const computeTeamMetrics = (updates, teamId, teamName, teamColor) => {
  if (!updates || updates.length === 0) {
    return {
      team_id: teamId,
      team_name: teamName,
      team_color: teamColor,
      total_distance_m: 0,
      avg_speed_kmh: 0,
      max_speed_kmh: 0,
      active_duration_s: 0,
      stationary_duration_s: 0,
      num_updates: 0,
      coverage_bounds: null,
      start_time: null,
      end_time: null,
    };
  }

  // Sort by timestamp
  const sorted = [...updates].sort(
    (a, b) => new Date(a.timestamp) - new Date(b.timestamp)
  );

  let totalDistance = 0;
  let totalTime = 0;
  let maxSpeed = 0;
  let activeDuration = 0;
  let stationaryDuration = 0;
  
  const speeds = [];
  const bounds = {
    minLat: Infinity,
    maxLat: -Infinity,
    minLon: Infinity,
    maxLon: -Infinity,
  };

  // Calculate distance between consecutive points
  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1];
    const curr = sorted[i];
    
    const dist = haversineDistance(prev.lat, prev.lon, curr.lat, curr.lon);
    const timeMs = new Date(curr.timestamp) - new Date(prev.timestamp);
    const timeSec = timeMs / 1000;
    
    totalDistance += dist;
    totalTime += timeSec;
    
    // Speed in km/h
    const speedKmh = dist > 0 ? (dist / 1000 / (timeSec / 3600)) : 0;
    speeds.push(speedKmh);
    maxSpeed = Math.max(maxSpeed, speedKmh);
    
    // Dwell detection: < 5 km/h = stationary
    if (speedKmh < 5) {
      stationaryDuration += timeSec;
    } else {
      activeDuration += timeSec;
    }
    
    // Update bounds
    bounds.minLat = Math.min(bounds.minLat, curr.lat, prev.lat);
    bounds.maxLat = Math.max(bounds.maxLat, curr.lat, prev.lat);
    bounds.minLon = Math.min(bounds.minLon, curr.lon, prev.lon);
    bounds.maxLon = Math.max(bounds.maxLon, curr.lon, prev.lon);
  }

  // Bounds for final point
  const last = sorted[sorted.length - 1];
  bounds.minLat = Math.min(bounds.minLat, last.lat);
  bounds.maxLat = Math.max(bounds.maxLat, last.lat);
  bounds.minLon = Math.min(bounds.minLon, last.lon);
  bounds.maxLon = Math.max(bounds.maxLon, last.lon);

  const avgSpeed = speeds.length > 0 ? speeds.reduce((a, b) => a + b) / speeds.length : 0;

  return {
    team_id: teamId,
    team_name: teamName,
    team_color: teamColor,
    total_distance_m: Math.round(totalDistance),
    avg_speed_kmh: Math.round(avgSpeed * 100) / 100,
    max_speed_kmh: Math.round(maxSpeed * 100) / 100,
    active_duration_s: Math.round(activeDuration),
    stationary_duration_s: Math.round(stationaryDuration),
    num_updates: sorted.length,
    coverage_bounds: bounds,
    start_time: sorted[0]?.timestamp,
    end_time: sorted[sorted.length - 1]?.timestamp,
  };
};

/**
 * Simple clustering to find dwell points (stationary locations)
 * Uses grid-based clustering: groups updates within 50m radius and minimum 5 minutes
 */
export const identifyStationaryPoints = (updates, radiusM = 50, minDurationMin = 5) => {
  if (!updates || updates.length < 2) {
    return { dwell_points: [] };
  }

  const sorted = [...updates].sort(
    (a, b) => new Date(a.timestamp) - new Date(b.timestamp)
  );

  const clusters = [];
  let currentCluster = [sorted[0]];

  for (let i = 1; i < sorted.length; i++) {
    const point = sorted[i];
    const clusterCenter = currentCluster[0];
    
    const dist = haversineDistance(
      clusterCenter.lat,
      clusterCenter.lon,
      point.lat,
      point.lon
    );
    const timeSpanMin = (new Date(point.timestamp) - new Date(clusterCenter.timestamp)) / (1000 * 60);

    // Within radius and time window: add to current cluster
    if (dist < radiusM) {
      currentCluster.push(point);
    } else {
      // Start new cluster if current one is long enough
      if (timeSpanMin >= minDurationMin) {
        clusters.push(currentCluster);
      }
      currentCluster = [point];
    }
  }

  // Don't forget the last cluster
  const timeSpanMin = (new Date(currentCluster[currentCluster.length - 1].timestamp) - 
                       new Date(currentCluster[0].timestamp)) / (1000 * 60);
  if (timeSpanMin >= minDurationMin) {
    clusters.push(currentCluster);
  }

  // Convert clusters to dwell points
  const dwellPoints = clusters.map((cluster) => {
    const avgLat = cluster.reduce((sum, p) => sum + p.lat, 0) / cluster.length;
    const avgLon = cluster.reduce((sum, p) => sum + p.lon, 0) / cluster.length;
    const durationMin = (new Date(cluster[cluster.length - 1].timestamp) - 
                         new Date(cluster[0].timestamp)) / (1000 * 60);
    
    return {
      latitude: Math.round(avgLat * 1000000) / 1000000,
      longitude: Math.round(avgLon * 1000000) / 1000000,
      duration_minutes: Math.round(durationMin * 10) / 10,
      cluster_size: cluster.length,
      first_update: cluster[0].timestamp,
      last_update: cluster[cluster.length - 1].timestamp,
    };
  });

  return { dwell_points: dwellPoints };
};

/**
 * Generate heatmap grid cells (100m x 100m)
 * Groups location updates into grid cells and calculates intensity
 */
export const computeEventHeatmap = (allUpdates, gridSizeM = 100) => {
  if (!allUpdates || allUpdates.length === 0) {
    return {
      grid_cells: [],
      num_cells: 0,
      max_intensity: 0,
      min_intensity: 0,
      total_non_stationary_updates: 0,
      event_centroid: null,
      cellSizeMeters: gridSizeM,
    };
  }

  // Filter out stationary points (speed < 5 km/h)
  const sorted = [...allUpdates].sort(
    (a, b) => new Date(a.timestamp) - new Date(b.timestamp)
  );

  const nonStationary = [];
  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1];
    const curr = sorted[i];
    const dist = haversineDistance(prev.lat, prev.lon, curr.lat, curr.lon);
    const timeMin = (new Date(curr.timestamp) - new Date(prev.timestamp)) / (1000 * 60);
    const speedKmh = dist > 0 ? (dist / 1000 / (timeMin / 60)) : 0;
    
    if (speedKmh >= 5) {
      nonStationary.push(curr);
    }
  }

  if (nonStationary.length === 0) {
    return {
      grid_cells: [],
      num_cells: 0,
      max_intensity: 0,
      min_intensity: 0,
      total_non_stationary_updates: 0,
      event_centroid: null,
      cellSizeMeters: gridSizeM,
    };
  }

  // Group into grid cells
  const cells = new Map();
  let minLat = Infinity, maxLat = -Infinity, minLon = Infinity, maxLon = -Infinity;
  let sumLat = 0, sumLon = 0;

  nonStationary.forEach((update) => {
    // Grid cell key: floor(lat / cellSize) + floor(lon / cellSize)
    const degreesPerMeter = 1 / 111000; // Approximate: 1 degree ≈ 111 km
    const cellSizeDegrees = (gridSizeM * degreesPerMeter);
    
    const cellLat = Math.floor(update.lat / cellSizeDegrees);
    const cellLon = Math.floor(update.lon / cellSizeDegrees);
    const key = `${cellLat},${cellLon}`;

    if (!cells.has(key)) {
      cells.set(key, {
        updates: [],
        cellLat,
        cellLon,
      });
    }

    cells.get(key).updates.push(update);
    minLat = Math.min(minLat, update.lat);
    maxLat = Math.max(maxLat, update.lat);
    minLon = Math.min(minLon, update.lon);
    maxLon = Math.max(maxLon, update.lon);
    sumLat += update.lat;
    sumLon += update.lon;
  });

  // Convert to grid cells with intensity
  const gridCells = Array.from(cells.values()).map((cell) => {
    const degreesPerMeter = 1 / 111000;
    const cellSizeDegrees = gridSizeM * degreesPerMeter;
    
    return {
      latitude: Math.round(cell.cellLat * cellSizeDegrees * 1000000) / 1000000,
      longitude: Math.round(cell.cellLon * cellSizeDegrees * 1000000) / 1000000,
      update_count: cell.updates.length,
      intensity: 0, // Will normalize below
    };
  });

  // Normalize intensity (0-1)
  const maxCount = Math.max(...gridCells.map((c) => c.update_count));
  gridCells.forEach((cell) => {
    cell.intensity = Math.round((cell.update_count / maxCount) * 100) / 100;
  });

  const eventCentroid = {
    latitude: Math.round((sumLat / nonStationary.length) * 1000000) / 1000000,
    longitude: Math.round((sumLon / nonStationary.length) * 1000000) / 1000000,
  };

  const intensities = gridCells.map((c) => c.intensity);
  
  return {
    grid_cells: gridCells,
    num_cells: gridCells.length,
    max_intensity: Math.max(...intensities),
    min_intensity: Math.min(...intensities),
    total_non_stationary_updates: nonStationary.length,
    event_centroid: eventCentroid,
    cellSizeMeters: gridSizeM,
  };
};

/**
 * Export analytics as GeoJSON FeatureCollection
 */
export const exportGeoJSON = (eventName, teamMetricsList, heatmapData, dwellPointsByTeam) => {
  const features = [];

  // Add team routes as LineStrings
  teamMetricsList.forEach((team) => {
    if (team.coverage_bounds) {
      const bounds = team.coverage_bounds;
      features.push({
        type: 'Feature',
        properties: {
          type: 'team_coverage',
          team_name: team.team_name,
          team_color: team.team_color,
          total_distance_m: team.total_distance_m,
          avg_speed_kmh: team.avg_speed_kmh,
        },
        geometry: {
          type: 'Polygon',
          coordinates: [[
            [bounds.minLon, bounds.minLat],
            [bounds.maxLon, bounds.minLat],
            [bounds.maxLon, bounds.maxLat],
            [bounds.minLon, bounds.maxLat],
            [bounds.minLon, bounds.minLat],
          ]],
        },
      });
    }
  });

  // Add dwell points
  Object.entries(dwellPointsByTeam || {}).forEach(([teamId, points]) => {
    points.forEach((point) => {
      features.push({
        type: 'Feature',
        properties: {
          type: 'dwell_point',
          team_id: teamId,
          duration_minutes: point.duration_minutes,
        },
        geometry: {
          type: 'Point',
          coordinates: [point.longitude, point.latitude],
        },
      });
    });
  });

  // Add heatmap grid cells
  heatmapData.grid_cells?.forEach((cell) => {
    features.push({
      type: 'Feature',
      properties: {
        type: 'heatmap_cell',
        intensity: cell.intensity,
        update_count: cell.update_count,
      },
      geometry: {
        type: 'Point',
        coordinates: [cell.longitude, cell.latitude],
      },
    });
  });

  return {
    type: 'FeatureCollection',
    name: eventName,
    features,
  };
};

/**
 * Export analytics as CSV
 */
export const exportCSV = (teamMetricsList, dwellPointsByTeam, heatmapData) => {
  // Team metrics CSV
  const teamHeaders = ['Team Name', 'Distance (m)', 'Avg Speed (km/h)', 'Max Speed (km/h)', 
                       'Active Duration (s)', 'Stationary Duration (s)', 'Updates'];
  const teamRows = teamMetricsList.map((team) => [
    team.team_name,
    team.total_distance_m,
    team.avg_speed_kmh,
    team.max_speed_kmh,
    team.active_duration_s,
    team.stationary_duration_s,
    team.num_updates,
  ]);
  
  const teamCSV = [teamHeaders, ...teamRows]
    .map((row) => row.map((cell) => `"${cell}"`).join(','))
    .join('\n');

  // Dwell points CSV
  const dwellHeaders = ['Team ID', 'Latitude', 'Longitude', 'Duration (min)', 'Cluster Size'];
  const dwellRows = [];
  Object.entries(dwellPointsByTeam || {}).forEach(([teamId, points]) => {
    points.forEach((point) => {
      dwellRows.push([teamId, point.latitude, point.longitude, point.duration_minutes, point.cluster_size]);
    });
  });
  
  const dwellCSV = [dwellHeaders, ...dwellRows]
    .map((row) => row.map((cell) => `"${cell}"`).join(','))
    .join('\n');

  // Heatmap grid CSV
  const heatmapHeaders = ['Latitude', 'Longitude', 'Intensity', 'Update Count'];
  const heatmapRows = heatmapData.grid_cells?.map((cell) => [
    cell.latitude,
    cell.longitude,
    cell.intensity,
    cell.update_count,
  ]) || [];
  
  const heatmapCSV = [heatmapHeaders, ...heatmapRows]
    .map((row) => row.map((cell) => `"${cell}"`).join(','))
    .join('\n');

  return {
    csv_exports: {
      team_metrics: teamCSV,
      dwell_analysis: dwellCSV,
      heatmap_cells: heatmapCSV,
    },
  };
};

/**
 * Export as KML (Google Earth format)
 */
export const exportKML = (eventName, teamMetricsList, dwellPointsByTeam) => {
  const placemarks = [];

  // Team coverage
  teamMetricsList.forEach((team) => {
    if (team.coverage_bounds) {
      const bounds = team.coverage_bounds;
      placemarks.push(`
    <Placemark>
      <name>${team.team_name} Coverage</name>
      <description>
        Distance: ${team.total_distance_m}m
        Avg Speed: ${team.avg_speed_kmh} km/h
        Active Duration: ${team.active_duration_s}s
      </description>
      <Polygon>
        <outerBoundaryIs>
          <LinearRing>
            <coordinates>
              ${bounds.minLon},${bounds.minLat},0
              ${bounds.maxLon},${bounds.minLat},0
              ${bounds.maxLon},${bounds.maxLat},0
              ${bounds.minLon},${bounds.maxLat},0
              ${bounds.minLon},${bounds.minLat},0
            </coordinates>
          </LinearRing>
        </outerBoundaryIs>
      </Polygon>
    </Placemark>`);
    }
  });

  // Dwell points
  Object.entries(dwellPointsByTeam || {}).forEach(([teamId, points]) => {
    points.forEach((point, idx) => {
      placemarks.push(`
    <Placemark>
      <name>Dwell Point ${idx + 1} - Team ${teamId}</name>
      <description>Duration: ${point.duration_minutes} min</description>
      <Point>
        <coordinates>${point.longitude},${point.latitude},0</coordinates>
      </Point>
    </Placemark>`);
    });
  });

  const kml = `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <name>${eventName} Analytics</name>
    <description>Location tracking analytics export</description>
${placemarks.join('')}
  </Document>
</kml>`;

  return { kml };
};
