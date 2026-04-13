"""
Export functions for analytics data
Generates GeoJSON, CSV, KML formats
"""

import json
import csv
from typing import List, Dict
from io import StringIO


def export_geojson(
    event_name: str,
    team_metrics_list: List[Dict],
    heatmap_data: Dict,
    dwell_points_by_team: Dict[int, List[Dict]] = None
) -> str:
    """
    Export analytics as GeoJSON FeatureCollection.
    
    Args:
        event_name: Name of the event
        team_metrics_list: List of team metrics
        heatmap_data: Heatmap data
        dwell_points_by_team: Dictionary of team_id -> list of dwell points
    
    Returns: GeoJSON string
    """
    features = []
    
    # 1. Add team routes as LineString features
    for team in team_metrics_list:
        coordinates = []
        for update in team.get('movement_path', []):
            coordinates.append([update['lon'], update['lat']])
        
        if coordinates:
            feature = {
                'type': 'Feature',
                'properties': {
                    'name': f"{team['team_name']} Route",
                    'team_id': team['team_id'],
                    'team_name': team['team_name'],
                    'color': team.get('team_color', '#3b82f6'),
                    'distance_m': team['total_distance_m'],
                    'avg_speed_kmh': team['avg_speed_kmh'],
                    'max_speed_kmh': team['max_speed_kmh'],
                    'type': 'route'
                },
                'geometry': {
                    'type': 'LineString',
                    'coordinates': coordinates
                }
            }
            features.append(feature)
    
    # 2. Add dwell points
    if dwell_points_by_team:
        for team_id, dwell_points in dwell_points_by_team.items():
            team_info = next((t for t in team_metrics_list if t['team_id'] == team_id), None)
            if not team_info:
                continue
            
            for i, dwell in enumerate(dwell_points):
                feature = {
                    'type': 'Feature',
                    'properties': {
                        'name': f"{team_info['team_name']} - Dwell {i+1}",
                        'team_id': team_id,
                        'team_name': team_info['team_name'],
                        'duration_minutes': dwell['duration_minutes'],
                        'arrived_at': dwell['arrived_at'],
                        'left_at': dwell['left_at'],
                        'type': 'dwell_point'
                    },
                    'geometry': {
                        'type': 'Point',
                        'coordinates': [dwell['longitude'], dwell['latitude']]
                    }
                }
                features.append(feature)
    
    # 3. Add heatmap cells as Polygon features
    for cell in heatmap_data.get('grid_cells', []):
        # Create a small square around the point
        half_cell = 0.00045  # Half of 100m cell size in degrees
        coords = [
            [cell['longitude'] - half_cell, cell['latitude'] - half_cell],
            [cell['longitude'] + half_cell, cell['latitude'] - half_cell],
            [cell['longitude'] + half_cell, cell['latitude'] + half_cell],
            [cell['longitude'] - half_cell, cell['latitude'] + half_cell],
            [cell['longitude'] - half_cell, cell['latitude'] - half_cell],
        ]
        
        feature = {
            'type': 'Feature',
            'properties': {
                'name': f"Heatmap Cell - {cell['update_count']} updates",
                'update_count': cell['update_count'],
                'intensity': cell['intensity'],
                'type': 'heatmap_cell'
            },
            'geometry': {
                'type': 'Polygon',
                'coordinates': [coords]
            }
        }
        features.append(feature)
    
    # Create FeatureCollection
    geojson = {
        'type': 'FeatureCollection',
        'name': event_name,
        'features': features
    }
    
    return json.dumps(geojson, indent=2)


def export_csv(
    team_metrics_list: List[Dict],
    dwell_points_by_team: Dict[int, List[Dict]] = None,
    heatmap_data: Dict = None
) -> Dict[str, str]:
    """
    Export analytics as CSV files.
    
    Returns: Dictionary of {sheet_name: csv_string}
    """
    csv_outputs = {}
    
    # 1. Team metrics CSV
    output = StringIO()
    if team_metrics_list:
        fieldnames = ['Rank', 'Team', 'Distance (km)', 'Avg Speed (km/h)', 'Max Speed (km/h)', 
                      'Active (h)', 'Stationary (h)', 'Location Points']
        writer = csv.DictWriter(output, fieldnames=fieldnames)
        writer.writeheader()
        
        for rank, team in enumerate(sorted(team_metrics_list, key=lambda x: x['total_distance_m'], reverse=True), 1):
            writer.writerow({
                'Rank': rank,
                'Team': team['team_name'],
                'Distance (km)': f"{team['total_distance_m']/1000:.2f}",
                'Avg Speed (km/h)': f"{team['avg_speed_kmh']:.2f}",
                'Max Speed (km/h)': f"{team['max_speed_kmh']:.2f}",
                'Active (h)': f"{team['active_duration_s']/3600:.2f}",
                'Stationary (h)': f"{team['stationary_duration_s']/3600:.2f}",
                'Location Points': team['num_updates']
            })
    
    csv_outputs['team_metrics'] = output.getvalue()
    
    # 2. Dwell points CSV
    if dwell_points_by_team:
        output = StringIO()
        fieldnames = ['Team', 'Latitude', 'Longitude', 'Duration (min)', 'Arrived', 'Left', 'Points']
        writer = csv.DictWriter(output, fieldnames=fieldnames)
        writer.writeheader()
        
        for team_id, dwell_points in dwell_points_by_team.items():
            team_info = next((t for t in team_metrics_list if t['team_id'] == team_id), None)
            if not team_info:
                continue
            
            for dwell in dwell_points:
                writer.writerow({
                    'Team': team_info['team_name'],
                    'Latitude': f"{dwell['latitude']:.6f}",
                    'Longitude': f"{dwell['longitude']:.6f}",
                    'Duration (min)': f"{dwell['duration_minutes']:.1f}",
                    'Arrived': dwell['arrived_at'],
                    'Left': dwell['left_at'],
                    'Points': dwell['num_points']
                })
        
        csv_outputs['dwell_analysis'] = output.getvalue()
    
    # 3. Heatmap cells CSV
    if heatmap_data and heatmap_data.get('grid_cells'):
        output = StringIO()
        fieldnames = ['Latitude', 'Longitude', 'Update Count', 'Intensity', 'First Update', 'Last Update']
        writer = csv.DictWriter(output, fieldnames=fieldnames)
        writer.writeheader()
        
        for cell in heatmap_data['grid_cells']:
            writer.writerow({
                'Latitude': f"{cell['latitude']:.6f}",
                'Longitude': f"{cell['longitude']:.6f}",
                'Update Count': cell['update_count'],
                'Intensity': f"{cell['intensity']:.2f}",
                'First Update': cell['first_update_at'],
                'Last Update': cell['last_update_at']
            })
        
        csv_outputs['heatmap_cells'] = output.getvalue()
    
    return csv_outputs


def export_kml(
    event_name: str,
    team_metrics_list: List[Dict],
    dwell_points_by_team: Dict[int, List[Dict]] = None
) -> str:
    """
    Export team routes and dwell points as KML (Google Earth format).
    
    Returns: KML string
    """
    kml = '''<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <name>{}</name>
    <description>Location Tracking Analytics</description>
'''.format(event_name)
    
    # Add team routes
    for team in team_metrics_list:
        coordinates_str = '\n          '.join([
            f"{update['lon']},{update['lat']},0"
            for update in team.get('movement_path', [])
        ])
        
        if coordinates_str:
            color = team.get('team_color', '3b82f6').lstrip('#')
            # Convert hex to BGR for KML
            bgr_color = 'ff' + color[4:6] + color[2:4] + color[0:2]
            
            kml += f'''    <Placemark>
      <name>{team['team_name']} - Route</name>
      <description>Distance: {team['total_distance_m']/1000:.2f} km, Avg Speed: {team['avg_speed_kmh']:.2f} km/h</description>
      <Style>
        <LineStyle>
          <color>{bgr_color}</color>
          <width>3</width>
        </LineStyle>
      </Style>
      <LineString>
        <coordinates>
          {coordinates_str}
        </coordinates>
      </LineString>
    </Placemark>
'''
    
    # Add dwell points
    if dwell_points_by_team:
        for team_id, dwell_points in dwell_points_by_team.items():
            team_info = next((t for t in team_metrics_list if t['team_id'] == team_id), None)
            if not team_info:
                continue
            
            for i, dwell in enumerate(dwell_points):
                kml += f'''    <Placemark>
      <name>{team_info['team_name']} - Dwell {i+1}</name>
      <description>Duration: {dwell['duration_minutes']:.1f} minutes</description>
      <Point>
        <coordinates>{dwell['longitude']},{dwell['latitude']},0</coordinates>
      </Point>
    </Placemark>
'''
    
    kml += '''  </Document>
</kml>'''
    
    return kml
