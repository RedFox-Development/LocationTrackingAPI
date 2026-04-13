#!/usr/bin/env python3
"""
Analytics Runner - Entry point for Node.js to call Python analytics functions
Receives function name and JSON arguments, returns JSON results
"""

import sys
import json
from analytics.core import (
    compute_team_metrics,
    identify_stationary_clusters,
    compute_event_heatmap,
)
from analytics.visualization import (
    create_team_route_map,
    create_heatmap_map,
    create_performance_charts,
    create_ranking_table,
)
from analytics.exports import (
    export_geojson,
    export_csv,
    export_kml,
)


def run_compute_team_metrics(data):
    """Wrapper for compute_team_metrics"""
    result = compute_team_metrics(
        updates=data.get('updates', []),
        team_id=data.get('team_id'),
        team_name=data.get('team_name'),
        team_color=data.get('team_color', '#3b82f6'),
    )
    return result


def run_identify_stationary_clusters(data):
    """Wrapper for identify_stationary_clusters"""
    result = identify_stationary_clusters(
        updates=data.get('updates', []),
        radius_meters=data.get('radius_meters', 50),
        min_duration_minutes=data.get('min_duration_minutes', 5),
    )
    return {'dwell_points': result}


def run_compute_event_heatmap(data):
    """Wrapper for compute_event_heatmap"""
    result = compute_event_heatmap(
        all_updates=data.get('all_updates', []),
        grid_size_m=data.get('grid_size_m', 100),
    )
    return result


def run_create_team_route_map(data):
    """Wrapper for create_team_route_map"""
    html = create_team_route_map(
        updates=data.get('updates', []),
        team_name=data.get('team_name', 'Team'),
        team_color=data.get('team_color', '#3b82f6'),
        include_dwell_points=data.get('include_dwell_points', True),
    )
    return {'map_html': html}


def run_create_heatmap_map(data):
    """Wrapper for create_heatmap_map"""
    html = create_heatmap_map(
        heatmap_data=data.get('heatmap_data', {}),
        event_name=data.get('event_name', 'Event'),
    )
    return {'map_html': html}


def run_create_performance_charts(data):
    """Wrapper for create_performance_charts"""
    charts = create_performance_charts(
        team_metrics_list=data.get('team_metrics_list', []),
    )
    return {'charts': charts}


def run_create_ranking_table(data):
    """Wrapper for create_ranking_table"""
    html = create_ranking_table(
        team_metrics_list=data.get('team_metrics_list', []),
        metric=data.get('metric', 'distance'),
    )
    return {'table_html': html}


def run_export_geojson(data):
    """Wrapper for export_geojson"""
    geojson = export_geojson(
        event_name=data.get('event_name', 'Event'),
        team_metrics_list=data.get('team_metrics_list', []),
        heatmap_data=data.get('heatmap_data', {}),
        dwell_points_by_team=data.get('dwell_points_by_team', {}),
    )
    return {'geojson': geojson}


def run_export_csv(data):
    """Wrapper for export_csv"""
    csv_exports = export_csv(
        team_metrics_list=data.get('team_metrics_list', []),
        dwell_points_by_team=data.get('dwell_points_by_team', {}),
        heatmap_data=data.get('heatmap_data', {}),
    )
    return {'csv_exports': csv_exports}


def run_export_kml(data):
    """Wrapper for export_kml"""
    kml = export_kml(
        event_name=data.get('event_name', 'Event'),
        team_metrics_list=data.get('team_metrics_list', []),
        dwell_points_by_team=data.get('dwell_points_by_team', {}),
    )
    return {'kml': kml}


# Dispatcher dictionary
FUNCTIONS = {
    'compute_team_metrics': run_compute_team_metrics,
    'identify_stationary_clusters': run_identify_stationary_clusters,
    'compute_event_heatmap': run_compute_event_heatmap,
    'create_team_route_map': run_create_team_route_map,
    'create_heatmap_map': run_create_heatmap_map,
    'create_performance_charts': run_create_performance_charts,
    'create_ranking_table': run_create_ranking_table,
    'export_geojson': run_export_geojson,
    'export_csv': run_export_csv,
    'export_kml': run_export_kml,
}


def main():
    """Main entry point"""
    if len(sys.argv) < 3:
        print(json.dumps({'error': 'Usage: run_analytics.py <function_name> <json_data>'}))
        sys.exit(1)
    
    function_name = sys.argv[1]
    json_data = sys.argv[2]
    
    try:
        data = json.loads(json_data)
    except json.JSONDecodeError as e:
        print(json.dumps({'error': f'Invalid JSON: {e}'}))
        sys.exit(1)
    
    if function_name not in FUNCTIONS:
        print(json.dumps({'error': f'Unknown function: {function_name}'}))
        sys.exit(1)
    
    try:
        result = FUNCTIONS[function_name](data)
        print(json.dumps(result))
    except Exception as e:
        print(json.dumps({'error': str(e)}))
        sys.exit(1)


if __name__ == '__main__':
    main()
