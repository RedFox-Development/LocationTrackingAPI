"""
Visualization functions for analytics
Generates Folium maps, matplotlib charts, and other visualizations
"""

import json
import io
import base64
from typing import List, Dict, Optional, Tuple
import numpy as np
import matplotlib.pyplot as plt
import matplotlib.patches as mpatches
import folium
from folium import plugins
import pandas as pd

from .core import compute_team_metrics, identify_stationary_clusters


def create_team_route_map(
    updates: List[Dict],
    team_name: str,
    team_color: str = '#3b82f6',
    include_dwell_points: bool = True
) -> str:
    """
    Create an interactive Folium map showing team route.
    
    Returns: HTML string of the map
    """
    if not updates or len(updates) < 2:
        return "<div>No location data available</div>"
    
    # Calculate bounds
    lats = [u['lat'] for u in updates]
    lons = [u['lon'] for u in updates]
    center_lat = np.mean(lats)
    center_lon = np.mean(lons)
    
    # Create map
    m = folium.Map(
        location=[center_lat, center_lon],
        zoom_start=15,
        tiles='OpenStreetMap'
    )
    
    # Add route polyline
    route = [[u['lat'], u['lon']] for u in updates]
    folium.PolyLine(
        route,
        color=team_color,
        weight=3,
        opacity=0.8,
        popup=f"{team_name} route"
    ).add_to(m)
    
    # Add start marker
    folium.Marker(
        location=[updates[0]['lat'], updates[0]['lon']],
        popup=f"{team_name} - Start",
        icon=folium.Icon(color='green', prefix='fa', icon='play'),
        tooltip='Start'
    ).add_to(m)
    
    # Add end marker
    folium.Marker(
        location=[updates[-1]['lat'], updates[-1]['lon']],
        popup=f"{team_name} - End",
        icon=folium.Icon(color='red', prefix='fa', icon='stop'),
        tooltip='End'
    ).add_to(m)
    
    # Add dwell points if requested
    if include_dwell_points:
        dwell_points = identify_stationary_clusters(updates)
        
        for i, dwell in enumerate(dwell_points):
            duration_str = f"{int(dwell['duration_minutes'])} min(s)"
            folium.CircleMarker(
                location=[dwell['latitude'], dwell['longitude']],
                radius=5,
                popup=f"Dwell Point {i+1}: {duration_str}",
                color='orange',
                fill=True,
                fillColor='orange',
                fillOpacity=0.7,
                tooltip=f"Dwell: {duration_str}"
            ).add_to(m)
    
    return m._repr_html_()


def create_heatmap_map(
    heatmap_data: Dict,
    event_name: str = "Event"
) -> str:
    """
    Create an interactive heatmap visualization on a Folium map.
    
    Args:
        heatmap_data: Output from compute_event_heatmap()
        event_name: Name of the event
    
    Returns: HTML string of the map
    """
    grid_cells = heatmap_data.get('grid_cells', [])
    
    if not grid_cells:
        return "<div>No location data available</div>"
    
    # Calculate map bounds
    lats = [cell['latitude'] for cell in grid_cells]
    lons = [cell['longitude'] for cell in grid_cells]
    
    center_lat = np.mean(lats)
    center_lon = np.mean(lons)
    
    # Create map
    m = folium.Map(
        location=[center_lat, center_lon],
        zoom_start=14,
        tiles='OpenStreetMap'
    )
    
    # Normalize intensities to 0-1 for color mapping
    min_intensity = heatmap_data.get('min_intensity', 0)
    max_intensity = heatmap_data.get('max_intensity', 1)
    
    # Color function: Blue -> Green -> Yellow -> Orange -> Red
    def get_color(intensity):
        if intensity < 0.2:
            return '#0000FF'  # Blue
        elif intensity < 0.4:
            return '#00FF00'  # Green
        elif intensity < 0.6:
            return '#FFFF00'  # Yellow
        elif intensity < 0.8:
            return '#FF7700'  # Orange
        else:
            return '#FF0000'  # Red
    
    # Add grid cells
    for cell in grid_cells:
        intensity = cell.get('intensity', 0)
        color = get_color(intensity)
        
        # Create circle marker for each cell
        folium.CircleMarker(
            location=[cell['latitude'], cell['longitude']],
            radius=6,
            popup=f"Updates: {cell['update_count']}<br>Intensity: {intensity:.2f}",
            color=color,
            fill=True,
            fillColor=color,
            fillOpacity=0.6,
            weight=1,
            tooltip=f"Updates: {cell['update_count']}"
        ).add_to(m)
    
    # Add event centroid
    centroid = heatmap_data.get('event_centroid', {})
    if centroid.get('latitude') and centroid.get('longitude'):
        folium.Marker(
            location=[centroid['latitude'], centroid['longitude']],
            popup="Event Centroid",
            icon=folium.Icon(color='purple', prefix='fa', icon='star'),
            tooltip='Event Centroid'
        ).add_to(m)
    
    # Add legend
    legend_html = '''
    <div style="position: fixed; 
                bottom: 50px; right: 50px; width: 180px; height: 160px; 
                background-color: white; border:2px solid grey; z-index:9999; 
                font-size:12px; padding: 10px">
        <b>Movement Density Heatmap</b><br>
        <i style="background: #0000FF; width: 18px; height: 18px; float: left; margin-right: 8px; border-radius: 2px;"></i>Low<br>
        <i style="background: #00FF00; width: 18px; height: 18px; float: left; margin-right: 8px; border-radius: 2px;"></i>Low-Med<br>
        <i style="background: #FFFF00; width: 18px; height: 18px; float: left; margin-right: 8px; border-radius: 2px;"></i>Medium<br>
        <i style="background: #FF7700; width: 18px; height: 18px; float: left; margin-right: 8px; border-radius: 2px;"></i>Med-High<br>
        <i style="background: #FF0000; width: 18px; height: 18px; float: left; margin-right: 8px; border-radius: 2px;"></i>High<br>
        Grid: 100m × 100m<br>
        Cells: {}<br>
        Total Updates: {}
    </div>
    '''.format(len(grid_cells), heatmap_data.get('total_non_stationary_updates', 0))
    
    m.get_root().html.add_child(folium.Element(legend_html))
    
    return m._repr_html_()


def create_performance_charts(
    team_metrics_list: List[Dict]
) -> Dict[str, str]:
    """
    Create performance comparison charts.
    
    Args:
        team_metrics_list: List of team metrics from compute_team_metrics()
    
    Returns: Dictionary of {chart_name: base64_encoded_png}
    """
    if not team_metrics_list:
        return {}
    
    charts = {}
    
    # Convert to DataFrame for easier manipulation
    teams = [m['team_name'] for m in team_metrics_list]
    distances = [m['total_distance_m'] / 1000 for m in team_metrics_list]  # Convert to km
    avg_speeds = [m['avg_speed_kmh'] for m in team_metrics_list]
    max_speeds = [m['max_speed_kmh'] for m in team_metrics_list]
    
    # 1. Distance comparison
    fig, ax = plt.subplots(figsize=(10, 6))
    bars = ax.bar(teams, distances, color='#3b82f6', alpha=0.7, edgecolor='black')
    ax.set_ylabel('Distance (km)', fontsize=12)
    ax.set_title('Distance Traveled by Team', fontsize=14, fontweight='bold')
    ax.grid(axis='y', alpha=0.3)
    
    # Add value labels on bars
    for bar in bars:
        height = bar.get_height()
        ax.text(bar.get_x() + bar.get_width()/2., height,
                f'{height:.1f} km', ha='center', va='bottom')
    
    plt.xticks(rotation=45, ha='right')
    plt.tight_layout()
    
    img_buffer = io.BytesIO()
    plt.savefig(img_buffer, format='png', dpi=100, bbox_inches='tight')
    img_buffer.seek(0)
    charts['distance_comparison'] = base64.b64encode(img_buffer.getvalue()).decode()
    plt.close()
    
    # 2. Speed comparison
    fig, ax = plt.subplots(figsize=(10, 6))
    x = np.arange(len(teams))
    width = 0.35
    
    ax.bar(x - width/2, avg_speeds, width, label='Average Speed', color='#10b981', alpha=0.7, edgecolor='black')
    ax.bar(x + width/2, max_speeds, width, label='Max Speed', color='#f59e0b', alpha=0.7, edgecolor='black')
    
    ax.set_ylabel('Speed (km/h)', fontsize=12)
    ax.set_title('Speed Profile by Team', fontsize=14, fontweight='bold')
    ax.set_xticks(x)
    ax.set_xticklabels(teams, rotation=45, ha='right')
    ax.legend()
    ax.grid(axis='y', alpha=0.3)
    
    plt.tight_layout()
    
    img_buffer = io.BytesIO()
    plt.savefig(img_buffer, format='png', dpi=100, bbox_inches='tight')
    img_buffer.seek(0)
    charts['speed_comparison'] = base64.b64encode(img_buffer.getvalue()).decode()
    plt.close()
    
    # 3. Active vs Stationary time
    fig, ax = plt.subplots(figsize=(10, 6))
    
    active_times = [m['active_duration_s'] / 3600 for m in team_metrics_list]  # Convert to hours
    stationary_times = [m['stationary_duration_s'] / 3600 for m in team_metrics_list]
    
    x = np.arange(len(teams))
    width = 0.35
    
    ax.bar(x - width/2, active_times, width, label='Active (Moving)', color='#06b6d4', alpha=0.7, edgecolor='black')
    ax.bar(x + width/2, stationary_times, width, label='Stationary', color='#8b5cf6', alpha=0.7, edgecolor='black')
    
    ax.set_ylabel('Time (hours)', fontsize=12)
    ax.set_title('Active vs Stationary Time', fontsize=14, fontweight='bold')
    ax.set_xticks(x)
    ax.set_xticklabels(teams, rotation=45, ha='right')
    ax.legend()
    ax.grid(axis='y', alpha=0.3)
    
    plt.tight_layout()
    
    img_buffer = io.BytesIO()
    plt.savefig(img_buffer, format='png', dpi=100, bbox_inches='tight')
    img_buffer.seek(0)
    charts['active_vs_stationary'] = base64.b64encode(img_buffer.getvalue()).decode()
    plt.close()
    
    return charts


def create_ranking_table(
    team_metrics_list: List[Dict],
    metric: str = 'distance'
) -> str:
    """
    Create HTML table ranking teams by metric.
    
    Returns: HTML string of table
    """
    # Sort by metric
    if metric == 'distance':
        sorted_teams = sorted(team_metrics_list, key=lambda x: x['total_distance_m'], reverse=True)
        header = 'Distance (km)'
        value_key = 'total_distance_m'
        formatter = lambda x: f"{x/1000:.2f}"
    elif metric == 'speed':
        sorted_teams = sorted(team_metrics_list, key=lambda x: x['avg_speed_kmh'], reverse=True)
        header = 'Avg Speed (km/h)'
        value_key = 'avg_speed_kmh'
        formatter = lambda x: f"{x:.2f}"
    else:  # active_time
        sorted_teams = sorted(team_metrics_list, key=lambda x: x['active_duration_s'], reverse=True)
        header = 'Active Time (h)'
        value_key = 'active_duration_s'
        formatter = lambda x: f"{x/3600:.2f}"
    
    html = f"<table style='width:100%; border-collapse: collapse;'>"
    html += f"<tr style='background-color: #f0f0f0;'><th style='border: 1px solid #ddd; padding: 8px;'>Rank</th><th style='border: 1px solid #ddd; padding: 8px;'>Team</th><th style='border: 1px solid #ddd; padding: 8px;'>{header}</th></tr>"
    
    for rank, team in enumerate(sorted_teams, 1):
        value = formatter(team[value_key])
        html += f"<tr><td style='border: 1px solid #ddd; padding: 8px; text-align: center;'>{rank}</td>"
        html += f"<td style='border: 1px solid #ddd; padding: 8px;'><span style='color: {team.get('team_color', '#000')}; font-weight: bold;'>●</span> {team['team_name']}</td>"
        html += f"<td style='border: 1px solid #ddd; padding: 8px; text-align: right;'>{value}</td></tr>"
    
    html += "</table>"
    return html
