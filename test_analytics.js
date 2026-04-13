#!/usr/bin/env node
/**
 * Local Analytics Testing Script
 * Tests Python analytics module locally before deployment
 * 
 * Usage: node test_analytics.js
 */

const path = require('path');
const { executePythonAnalytics } = require('./api/_pythonBridge.js');

// Test data - sample location updates
const testUpdates = [
  { lat: 60.1670, lon: 24.9427, timestamp: '2024-01-01T10:00:00Z' },
  { lat: 60.1671, lon: 24.9428, timestamp: '2024-01-01T10:05:00Z' },
  { lat: 60.1672, lon: 24.9429, timestamp: '2024-01-01T10:10:00Z' },
  { lat: 60.1673, lon: 24.9430, timestamp: '2024-01-01T10:15:00Z' },
  { lat: 60.1674, lon: 24.9431, timestamp: '2024-01-01T10:20:00Z' },
  { lat: 60.1674, lon: 24.9431, timestamp: '2024-01-01T10:25:00Z' }, // Stationary
  { lat: 60.1674, lon: 24.9431, timestamp: '2024-01-01T10:30:00Z' }, // Stationary
  { lat: 60.1675, lon: 24.9432, timestamp: '2024-01-01T10:35:00Z' },
];

const log = (title, data) => {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`📊 ${title}`);
  console.log('='.repeat(60));
  console.log(JSON.stringify(data, null, 2));
};

const logError = (title, error) => {
  console.error(`\n${'='.repeat(60)}`);
  console.error(`❌ ${title}`);
  console.error('='.repeat(60));
  console.error(error.message);
};

async function runTests() {
  console.log('\n🚀 Starting Analytics Module Tests\n');

  try {
    // Test 1: Compute Team Metrics
    console.log('Test 1: Computing team metrics...');
    const metrics = await executePythonAnalytics('compute_team_metrics', {
      updates: testUpdates,
      team_id: 1,
      team_name: 'Test Team',
      team_color: '#3b82f6',
    });

    log('Team Metrics', {
      team_name: metrics.team_name,
      total_distance_m: metrics.total_distance_m.toFixed(1),
      avg_speed_kmh: metrics.avg_speed_kmh.toFixed(2),
      max_speed_kmh: metrics.max_speed_kmh.toFixed(2),
      active_duration_h: (metrics.active_duration_s / 3600).toFixed(2),
      stationary_duration_h: (metrics.stationary_duration_s / 3600).toFixed(2),
      num_updates: metrics.num_updates,
    });

    // Test 2: Identify Stationary Clusters
    console.log('\nTest 2: Identifying stationary clusters...');
    const clusters = await executePythonAnalytics('identify_stationary_clusters', {
      updates: testUpdates,
      radius_meters: 50,
      min_duration_minutes: 5,
    });

    log('Dwell Points Identified', {
      count: clusters.dwell_points.length,
      dwell_points: clusters.dwell_points.map(d => ({
        latitude: d.latitude.toFixed(6),
        longitude: d.longitude.toFixed(6),
        duration_minutes: d.duration_minutes.toFixed(1),
      })),
    });

    // Test 3: Compute Event Heatmap
    console.log('\nTest 3: Generating event heatmap...');
    
    // Simulate multiple teams
    const multiTeamUpdates = [
      ...testUpdates,
      ...testUpdates.map(u => ({
        lat: u.lat + 0.001,
        lon: u.lon + 0.001,
        timestamp: u.timestamp,
      })),
      ...testUpdates.map(u => ({
        lat: u.lat - 0.001,
        lon: u.lon - 0.001,
        timestamp: u.timestamp,
      })),
    ];

    const heatmap = await executePythonAnalytics('compute_event_heatmap', {
      all_updates: multiTeamUpdates,
      grid_size_m: 100,
    });

    log('Event Heatmap', {
      grid_cells: heatmap.num_cells,
      total_non_stationary_updates: heatmap.total_non_stationary_updates,
      max_intensity: heatmap.max_intensity,
      min_intensity: heatmap.min_intensity,
      event_centroid: {
        latitude: heatmap.event_centroid.latitude.toFixed(6),
        longitude: heatmap.event_centroid.longitude.toFixed(6),
      },
      cell_size_meters: heatmap.cellSizeMeters,
      sample_cells: heatmap.grid_cells.slice(0, 3).map(c => ({
        latitude: c.latitude.toFixed(6),
        longitude: c.longitude.toFixed(6),
        update_count: c.update_count,
        intensity: c.intensity.toFixed(2),
      })),
    });

    // Test 4: Create Performance Charts (metadata only)
    console.log('\nTest 4: Generating performance charts...');
    const charts = await executePythonAnalytics('create_performance_charts', {
      team_metrics_list: [metrics, { ...metrics, team_id: 2, team_name: 'Team 2' }],
    });

    log('Charts Generated', {
      charts_available: Object.keys(charts.charts),
      distance_size_bytes: charts.charts.distance_comparison.length,
      speed_size_bytes: charts.charts.speed_comparison.length,
      active_vs_stationary_size_bytes: charts.charts.active_vs_stationary.length,
    });

    // Test 5: Create Team Route Map
    console.log('\nTest 5: Creating team route map...');
    const teamMap = await executePythonAnalytics('create_team_route_map', {
      updates: testUpdates,
      team_name: 'Test Team',
      team_color: '#3b82f6',
      include_dwell_points: true,
    });

    log('Team Route Map Created', {
      map_type: 'Folium Interactive Map',
      html_size_bytes: teamMap.map_html.length,
      contains_markers: teamMap.map_html.includes('Marker') ? 'Yes' : 'No',
      contains_polyline: teamMap.map_html.includes('PolyLine') ? 'Yes' : 'No',
    });

    // Test 6: Create Heatmap Map
    console.log('\nTest 6: Creating heatmap visualization...');
    const heatmapMap = await executePythonAnalytics('create_heatmap_map', {
      heatmap_data: heatmap,
      event_name: 'Test Event',
    });

    log('Heatmap Map Created', {
      map_type: 'Folium Heatmap Visualization',
      html_size_bytes: heatmapMap.map_html.length,
      contains_circle_markers: heatmapMap.map_html.includes('CircleMarker') ? 'Yes' : 'No',
    });

    // Test 7: Export GeoJSON
    console.log('\nTest 7: Exporting as GeoJSON...');
    const geojson = await executePythonAnalytics('export_geojson', {
      event_name: 'Test Event',
      team_metrics_list: [metrics],
      heatmap_data: heatmap,
      dwell_points_by_team: { 1: clusters.dwell_points },
    });

    const geoJsonObj = JSON.parse(geojson.geojson);
    log('GeoJSON Export', {
      feature_collection: 'Yes',
      total_features: geoJsonObj.features.length,
      feature_types: [...new Set(geoJsonObj.features.map(f => f.properties.type))],
      size_bytes: geojson.geojson.length,
    });

    // Test 8: Export CSV
    console.log('\nTest 8: Exporting as CSV...');
    const csvExports = await executePythonAnalytics('export_csv', {
      team_metrics_list: [metrics],
      dwell_points_by_team: { 1: clusters.dwell_points },
      heatmap_data: heatmap,
    });

    log('CSV Exports', {
      available_sheets: Object.keys(csvExports.csv_exports),
      team_metrics_lines: csvExports.csv_exports.team_metrics.split('\n').length,
      dwell_analysis_lines: csvExports.csv_exports.dwell_analysis.split('\n').length,
      heatmap_cells_lines: csvExports.csv_exports.heatmap_cells.split('\n').length,
    });

    // Test 9: Create Ranking Table
    console.log('\nTest 9: Creating ranking table...');
    const rankingTable = await executePythonAnalytics('create_ranking_table', {
      team_metrics_list: [
        metrics,
        { ...metrics, team_id: 2, team_name: 'Team 2', total_distance_m: 500 },
      ],
      metric: 'distance',
    });

    log('Ranking Table', {
      table_type: 'HTML Distance Ranking',
      size_bytes: rankingTable.table_html.length,
      contains_table_tag: rankingTable.table_html.includes('<table') ? 'Yes' : 'No',
    });

    console.log('\n✅ All tests passed!\n');

  } catch (error) {
    logError('Test Execution', error);
    process.exit(1);
  }
}

// Run tests
runTests().catch(error => {
  logError('Unexpected Error', error);
  process.exit(1);
});
