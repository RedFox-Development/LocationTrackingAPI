"""
Core analytics computation functions
Processes location_updates from database and computes team metrics
"""

import json
import math
from typing import List, Dict, Tuple, Optional
from datetime import datetime, timedelta
import numpy as np
import pandas as pd
from sklearn.cluster import DBSCAN


def haversine_distance(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """
    Calculate distance between two points in meters using Haversine formula
    """
    R = 6371000  # Earth radius in meters
    
    lat1_rad = math.radians(lat1)
    lat2_rad = math.radians(lat2)
    delta_lat = math.radians(lat2 - lat1)
    delta_lon = math.radians(lon2 - lon1)
    
    a = math.sin(delta_lat / 2) ** 2 + math.cos(lat1_rad) * math.cos(lat2_rad) * math.sin(delta_lon / 2) ** 2
    c = 2 * math.asin(math.sqrt(a))
    
    return R * c


def compute_team_metrics(
    updates: List[Dict],
    team_id: int,
    team_name: str,
    team_color: str = '#3b82f6'
) -> Dict:
    """
    Compute team movement metrics from location updates.
    
    Args:
        updates: List of {lat, lon, timestamp} dicts
        team_id: Team identifier
        team_name: Team name
        team_color: Team color code
    
    Returns:
        Dictionary with computed metrics
    """
    if not updates or len(updates) < 2:
        return {
            'team_id': team_id,
            'team_name': team_name,
            'team_color': team_color,
            'total_distance_m': 0,
            'avg_speed_kmh': 0,
            'max_speed_kmh': 0,
            'active_duration_s': 0,
            'stationary_duration_s': 0,
            'num_updates': len(updates),
            'coverage_bounds': {'min_lat': None, 'max_lat': None, 'min_lon': None, 'max_lon': None},
            'start_time': None,
            'end_time': None,
        }
    
    # Sort by timestamp
    sorted_updates = sorted(updates, key=lambda x: x['timestamp'])
    
    # Calculate distances and speeds
    total_distance = 0
    speeds = []
    stationary_segments = []  # Track time spent stationary
    
    for i in range(1, len(sorted_updates)):
        prev = sorted_updates[i - 1]
        curr = sorted_updates[i]
        
        # Calculate distance
        dist = haversine_distance(prev['lat'], prev['lon'], curr['lat'], curr['lon'])
        total_distance += dist
        
        # Calculate time difference in seconds
        t1 = datetime.fromisoformat(prev['timestamp'].replace('Z', '+00:00'))
        t2 = datetime.fromisoformat(curr['timestamp'].replace('Z', '+00:00'))
        time_diff = (t2 - t1).total_seconds()
        
        if time_diff > 0:
            # Speed in m/s, convert to km/h
            speed_kmh = (dist / time_diff) * 3.6
            speeds.append(speed_kmh)
            
            # Consider stationary if speed < 1 km/h
            if speed_kmh < 1.0:
                stationary_segments.append(time_diff)
    
    # Calculate metrics
    avg_speed = np.mean(speeds) if speeds else 0
    max_speed = np.max(speeds) if speeds else 0
    
    # Total duration
    start_time = datetime.fromisoformat(sorted_updates[0]['timestamp'].replace('Z', '+00:00'))
    end_time = datetime.fromisoformat(sorted_updates[-1]['timestamp'].replace('Z', '+00:00'))
    total_duration = (end_time - start_time).total_seconds()
    
    stationary_duration = sum(stationary_segments)
    active_duration = total_duration - stationary_duration
    
    # Coverage bounds
    lats = [u['lat'] for u in sorted_updates]
    lons = [u['lon'] for u in sorted_updates]
    
    return {
        'team_id': team_id,
        'team_name': team_name,
        'team_color': team_color,
        'total_distance_m': total_distance,
        'avg_speed_kmh': avg_speed,
        'max_speed_kmh': max_speed,
        'active_duration_s': int(active_duration),
        'stationary_duration_s': int(stationary_duration),
        'num_updates': len(updates),
        'coverage_bounds': {
            'min_lat': min(lats),
            'max_lat': max(lats),
            'min_lon': min(lons),
            'max_lon': max(lons),
        },
        'start_time': start_time.isoformat(),
        'end_time': end_time.isoformat(),
        'movement_path': sorted_updates,
    }


def identify_stationary_clusters(
    updates: List[Dict],
    radius_meters: float = 50,
    min_duration_minutes: float = 5
) -> List[Dict]:
    """
    Identify stationary clusters (dwell points) using DBSCAN clustering.
    
    Args:
        updates: List of {lat, lon, timestamp} dicts
        radius_meters: Radius in meters for clustering (default 50m)
        min_duration_minutes: Minimum time spent in area to be considered dwell (default 5 min)
    
    Returns:
        List of dwell points with {lat, lon, arrived_at, left_at, duration_minutes}
    """
    if not updates or len(updates) < 3:
        return []
    
    # Prepare data for DBSCAN
    # Convert lat/lon to approximate meters for clustering
    coords = []
    timestamps = []
    
    for u in updates:
        lat = math.radians(u['lat'])
        lon = math.radians(u['lon'])
        
        # Simple Mercator projection to meters
        merc_x = lon * 6371000  # Earth radius
        merc_y = math.log(math.tan(math.pi / 4 + lat / 2)) * 6371000
        
        coords.append([merc_x, merc_y])
        timestamps.append(datetime.fromisoformat(u['timestamp'].replace('Z', '+00:00')))
    
    coords = np.array(coords)
    
    # DBSCAN clustering
    db = DBSCAN(eps=radius_meters, min_samples=2).fit(coords)
    labels = db.labels_
    
    # Group clusters
    clusters = {}
    for idx, label in enumerate(labels):
        if label == -1:  # Noise points
            continue
        
        if label not in clusters:
            clusters[label] = []
        
        clusters[label].append({
            'lat': updates[idx]['lat'],
            'lon': updates[idx]['lon'],
            'timestamp': timestamps[idx],
            'index': idx
        })
    
    # Process clusters to find dwell points
    dwell_points = []
    
    for cluster_id, points in clusters.items():
        if len(points) < 2:
            continue
        
        # Sort by timestamp
        points = sorted(points, key=lambda x: x['timestamp'])
        
        arrived = points[0]['timestamp']
        left = points[-1]['timestamp']
        duration_minutes = (left - arrived).total_seconds() / 60
        
        # Check minimum duration
        if duration_minutes >= min_duration_minutes:
            # Calculate cluster center
            avg_lat = np.mean([p['lat'] for p in points])
            avg_lon = np.mean([p['lon'] for p in points])
            
            dwell_points.append({
                'latitude': avg_lat,
                'longitude': avg_lon,
                'arrived_at': arrived.isoformat(),
                'left_at': left.isoformat(),
                'duration_minutes': duration_minutes,
                'num_points': len(points),
            })
    
    return dwell_points


def compute_grid_cells(
    updates: List[Dict],
    grid_size_m: float = 100
) -> Dict[str, Dict]:
    """
    Aggregate non-stationary updates into grid cells.
    
    Args:
        updates: List of {lat, lon, timestamp} dicts (already filtered to non-stationary)
        grid_size_m: Grid cell size in meters (default 100m)
    
    Returns:
        Dictionary of grid cells: {cell_key: {lat, lon, count, update_indices}}
    """
    # Grid cell size in degrees (at equator: 100m ≈ 0.0009 degrees)
    grid_size_degrees = grid_size_m / 111000
    
    grid_cells = {}
    
    for idx, u in enumerate(updates):
        # Round to grid cell
        cell_lat = round(u['lat'] / grid_size_degrees) * grid_size_degrees
        cell_lon = round(u['lon'] / grid_size_degrees) * grid_size_degrees
        cell_key = f"{cell_lat:.6f},{cell_lon:.6f}"
        
        if cell_key not in grid_cells:
            grid_cells[cell_key] = {
                'latitude': cell_lat,
                'longitude': cell_lon,
                'update_count': 0,
                'first_update': u['timestamp'],
                'last_update': u['timestamp'],
                'update_indices': [],
                'min_lat': u['lat'],
                'max_lat': u['lat'],
                'min_lon': u['lon'],
                'max_lon': u['lon'],
            }
        
        cell = grid_cells[cell_key]
        cell['update_count'] += 1
        cell['last_update'] = u['timestamp']
        cell['update_indices'].append(idx)
        cell['min_lat'] = min(cell['min_lat'], u['lat'])
        cell['max_lat'] = max(cell['max_lat'], u['lat'])
        cell['min_lon'] = min(cell['min_lon'], u['lon'])
        cell['max_lon'] = max(cell['max_lon'], u['lon'])
    
    return grid_cells


def compute_event_heatmap(
    all_updates: List[Dict],
    grid_size_m: float = 100
) -> Dict:
    """
    Generate heatmap data from non-stationary location updates.
    
    Args:
        all_updates: List of {lat, lon, timestamp} dicts for all teams
        grid_size_m: Grid cell size in meters (default 100m)
    
    Returns:
        Heatmap data with grid cells and metadata
    """
    if not all_updates:
        return {
            'grid_cells': [],
            'max_intensity': 0,
            'min_intensity': 0,
            'event_centroid': {'latitude': 0, 'longitude': 0},
            'cellSizeMeters': grid_size_m,
        }
    
    # Identify stationary clusters across all teams
    stationary_clusters = identify_stationary_clusters(all_updates)
    stationary_locations = set()
    
    for cluster in stationary_clusters:
        # Create a key for stationary locations near this cluster
        # Using 50m radius
        for u in all_updates:
            dist = haversine_distance(
                cluster['latitude'], cluster['longitude'],
                u['lat'], u['lon']
            )
            if dist < 50:
                key = f"{u['lat']:.6f},{u['lon']:.6f}"
                stationary_locations.add(key)
    
    # Filter to non-stationary updates
    non_stationary_updates = [
        u for u in all_updates
        if f"{u['lat']:.6f},{u['lon']:.6f}" not in stationary_locations
    ]
    
    if not non_stationary_updates:
        return {
            'grid_cells': [],
            'max_intensity': 0,
            'min_intensity': 0,
            'event_centroid': {'latitude': 0, 'longitude': 0},
            'cellSizeMeters': grid_size_m,
        }
    
    # Compute grid cells
    grid_cells = compute_grid_cells(non_stationary_updates, grid_size_m)
    
    # Calculate intensity normalization
    counts = [cell['update_count'] for cell in grid_cells.values()]
    max_intensity = max(counts) if counts else 1
    min_intensity = min(counts) if counts else 0
    
    # Normalize to 0-1 scale
    normalized_cells = []
    for cell in grid_cells.values():
        intensity = (cell['update_count'] - min_intensity) / (max_intensity - min_intensity) if max_intensity > min_intensity else 0
        
        normalized_cells.append({
            'latitude': cell['latitude'],
            'longitude': cell['longitude'],
            'update_count': cell['update_count'],
            'intensity': intensity,
            'first_update_at': cell['first_update'],
            'last_update_at': cell['last_update'],
            'min_lat': cell['min_lat'],
            'max_lat': cell['max_lat'],
            'min_lon': cell['min_lon'],
            'max_lon': cell['max_lon'],
        })
    
    # Calculate event centroid (weighted by density)
    total_weight = sum(cell['update_count'] for cell in normalized_cells)
    centroid_lat = sum(cell['latitude'] * cell['update_count'] for cell in normalized_cells) / total_weight if total_weight > 0 else 0
    centroid_lon = sum(cell['longitude'] * cell['update_count'] for cell in normalized_cells) / total_weight if total_weight > 0 else 0
    
    return {
        'grid_cells': normalized_cells,
        'max_intensity': max_intensity,
        'min_intensity': min_intensity,
        'event_centroid': {
            'latitude': centroid_lat,
            'longitude': centroid_lon,
        },
        'cellSizeMeters': grid_size_m,
        'num_cells': len(normalized_cells),
        'total_non_stationary_updates': len(non_stationary_updates),
    }
