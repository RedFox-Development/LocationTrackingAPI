/**
 * Heatmap Rendering and Georeferencing
 * Generates PNG heatmap with PGW world file for georeferencing
 */

import sharp from 'sharp';
import proj4 from 'proj4';

const DEFAULT_EXPORT_CRS = 'EPSG:3067';

proj4.defs(
  DEFAULT_EXPORT_CRS,
  '+proj=tmerc +lat_0=0 +lon_0=27 +k=1 +x_0=500000 +y_0=0 +ellps=GRS80 +units=m +no_defs +type=crs'
);

const projectToExportCrs = (latitude, longitude) => {
  const [east, north] = proj4('EPSG:4326', DEFAULT_EXPORT_CRS, [longitude, latitude]);
  return { east, north };
};

/**
 * Convert intensity (0-1) to RGB color using gradient
 * Blue (low) → Cyan → Green → Yellow → Red (high)
 */
const intensityToRgb = (intensity) => {
  // Clamp between 0 and 1
  const t = Math.max(0, Math.min(1, intensity));
  
  // Gradient: Blue -> Cyan -> Green -> Yellow -> Red
  let r, g, b;
  
  if (t < 0.25) {
    // Blue to Cyan
    const pos = t / 0.25;
    r = 0;
    g = Math.round(255 * pos);
    b = 255;
  } else if (t < 0.5) {
    // Cyan to Green
    const pos = (t - 0.25) / 0.25;
    r = 0;
    g = 255;
    b = Math.round(255 * (1 - pos));
  } else if (t < 0.75) {
    // Green to Yellow
    const pos = (t - 0.5) / 0.25;
    r = Math.round(255 * pos);
    g = 255;
    b = 0;
  } else {
    // Yellow to Red
    const pos = (t - 0.75) / 0.25;
    r = 255;
    g = Math.round(255 * (1 - pos));
    b = 0;
  }
  
  return { r, g, b };
};

/**
 * Calculate grid bounds from projected heatmap cells
 * Returns: { minEast, maxEast, minNorth, maxNorth }
 */
const calculateBounds = (gridCells) => {
  if (!gridCells || gridCells.length === 0) {
    return null;
  }

  let minEast = Infinity;
  let maxEast = -Infinity;
  let minNorth = Infinity;
  let maxNorth = -Infinity;

  gridCells.forEach((cell) => {
    minEast = Math.min(minEast, cell.east);
    maxEast = Math.max(maxEast, cell.east);
    minNorth = Math.min(minNorth, cell.north);
    maxNorth = Math.max(maxNorth, cell.north);
  });

  // Add padding (5% buffer)
  const northPadding = (maxNorth - minNorth) * 0.05 || 1;
  const eastPadding = (maxEast - minEast) * 0.05 || 1;

  return {
    minEast: minEast - eastPadding,
    maxEast: maxEast + eastPadding,
    minNorth: minNorth - northPadding,
    maxNorth: maxNorth + northPadding,
  };
};

const FONT_FAMILY = 'DejaVu Sans, Liberation Sans, Noto Sans, sans-serif';

const metersToCanvasRadius = (meters, bounds, pixelWidth, pixelHeight) => {
  const metersPerPixelX = (bounds.maxEast - bounds.minEast) / Math.max(pixelWidth - 1, 1);
  const metersPerPixelY = (bounds.maxNorth - bounds.minNorth) / Math.max(pixelHeight - 1, 1);
  const metersPerPixel = Math.max(metersPerPixelX, metersPerPixelY) || 1;
  return meters / metersPerPixel;
};

/**
 * Create PNG heatmap from grid cells
 * Returns: { pngBuffer, bounds, pixelWidth, pixelHeight }
 */
export const generateHeatmapPNG = async (gridCells, pixelSize = 512) => {
  if (!gridCells || gridCells.length === 0) {
    throw new Error('No grid cells provided for heatmap');
  }

  const projectedCells = gridCells.map((cell) => {
    const { east, north } = projectToExportCrs(cell.latitude, cell.longitude);
    return {
      ...cell,
      east,
      north,
    };
  });

  const bounds = calculateBounds(projectedCells);
  if (!bounds) {
    throw new Error('Failed to calculate bounds from grid cells');
  }

  const northRange = bounds.maxNorth - bounds.minNorth;
  const eastRange = bounds.maxEast - bounds.minEast;
  
  // Determine aspect ratio
  const aspectRatio = eastRange / northRange;
  let pixelWidth = pixelSize;
  let pixelHeight = pixelSize;
  
  if (aspectRatio > 1) {
    pixelHeight = Math.round(pixelSize / aspectRatio);
  } else {
    pixelWidth = Math.round(pixelSize * aspectRatio);
  }

  // Minimum size
  pixelWidth = Math.max(pixelWidth, 128);
  pixelHeight = Math.max(pixelHeight, 128);

  // Create image buffer
  const channels = 4; // RGBA
  const data = Buffer.alloc(pixelWidth * pixelHeight * channels);
  
  // Fill with transparent background
  for (let i = 0; i < data.length; i += channels) {
    data[i] = 255;     // R
    data[i + 1] = 255; // G
    data[i + 2] = 255; // B
    data[i + 3] = 0;   // A (transparent)
  }

  // Plot cells on heatmap
  projectedCells.forEach((cell) => {
    // Convert projected coordinates to pixel coordinates
    const x = Math.round(
      ((cell.east - bounds.minEast) / eastRange) * (pixelWidth - 1)
    );
    const y = Math.round(
      ((bounds.maxNorth - cell.north) / northRange) * (pixelHeight - 1)
    );

    // Bounds check
    if (x < 0 || x >= pixelWidth || y < 0 || y >= pixelHeight) {
      return;
    }

    // Get color for intensity
    const visualIntensity = Math.sqrt(Math.max(0, Math.min(1, cell.intensity)));
    const rgb = intensityToRgb(visualIntensity);
    const pixelIndex = (y * pixelWidth + x) * channels;

    // Plot with a minimum opacity so lower-intensity cells remain readable.
    const alpha = Math.round(255 * (0.30 + 0.70 * visualIntensity));
    data[pixelIndex] = rgb.r;       // R
    data[pixelIndex + 1] = rgb.g;   // G
    data[pixelIndex + 2] = rgb.b;   // B
    data[pixelIndex + 3] = alpha;   // A
  });

  // Convert to PNG
  const pngBuffer = await sharp(data, {
    raw: {
      width: pixelWidth,
      height: pixelHeight,
      channels,
    },
  })
    .png()
    .toBuffer();

  return {
    pngBuffer,
    bounds,
    pixelWidth,
    pixelHeight,
  };
};

/**
 * Generate PGW (PNG World) file content
 * PGW format is 6 lines:
 * 1. X pixel size (degrees/pixel)
 * 2. Rotation (usually 0)
 * 3. Rotation (usually 0)
 * 4. -Y pixel size (negative degrees/pixel)
 * 5. X coordinate of upper-left corner
 * 6. Y coordinate of upper-left corner
 */
export const generatePGWContent = (bounds, pixelWidth, pixelHeight) => {
  const eastRange = bounds.maxEast - bounds.minEast;
  const northRange = bounds.maxNorth - bounds.minNorth;

  // Pixel sizes in meters
  const xPixelSize = eastRange / pixelWidth;
  const yPixelSize = northRange / pixelHeight;

  // PGW lines (6 parameters)
  const lines = [
    xPixelSize.toFixed(10),           // X pixel size
    '0',                               // No rotation
    '0',                               // No rotation
    (-yPixelSize).toFixed(10),         // -Y pixel size (negative)
    bounds.minEast.toFixed(10),        // X coordinate of upper-left
    bounds.maxNorth.toFixed(10),       // Y coordinate of upper-left
  ];

  return lines.join('\n') + '\n';
};

/**
 * Generate complete heatmap export with PNG and PGW files
 */
export const generateHeatmapExport = async (gridCells, options = {}) => {
  const {
    pixelSize = 512,
    format = 'combined', // 'png', 'pgw', 'combined'
  } = options;

  const { pngBuffer, bounds, pixelWidth, pixelHeight } = await generateHeatmapPNG(
    gridCells,
    pixelSize
  );

  const pgwContent = generatePGWContent(bounds, pixelWidth, pixelHeight);

  const result = {
    coordinateSystem: DEFAULT_EXPORT_CRS,
    bounds: {
      minEast: bounds.minEast,
      maxEast: bounds.maxEast,
      minNorth: bounds.minNorth,
      maxNorth: bounds.maxNorth,
    },
    pixelWidth,
    pixelHeight,
  };

  if (format === 'png' || format === 'combined') {
    result.png = pngBuffer.toString('base64');
    result.pngMimeType = 'image/png';
  }

  if (format === 'pgw' || format === 'combined') {
    result.pgw = pgwContent;
    result.pgwMimeType = 'text/plain';
  }

  return result;
};

/**
 * Generate GeoTIFF-compatible metadata
 * While we're using PNG + PGW, this provides GeoTIFF-compatible bounds
 */
export const generateGeoMetadata = (bounds, pixelWidth, pixelHeight) => {
  return {
    format: 'GeoTIFF compatible',
    bounds: {
      north: bounds.maxNorth,
      south: bounds.minNorth,
      east: bounds.maxEast,
      west: bounds.minEast,
    },
    crs: DEFAULT_EXPORT_CRS,
    pixelWidth,
    pixelHeight,
    pixelSizeX: (bounds.maxEast - bounds.minEast) / pixelWidth,
    pixelSizeY: (bounds.maxNorth - bounds.minNorth) / pixelHeight,
  };
};

const escapeXml = (value) => String(value)
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&apos;');

const projectTeamPathPoints = (updates) => updates
  .slice()
  .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp))
  .map((update) => ({
    ...update,
    ...projectToExportCrs(update.lat, update.lon),
  }));

const projectDwellPoints = (dwellPointsByTeam) => {
  const projected = [];

  Object.entries(dwellPointsByTeam || {}).forEach(([teamId, team]) => {
    const teamPoints = Array.isArray(team?.dwell_points) ? team.dwell_points : [];
    teamPoints.forEach((point) => {
      const { east, north } = projectToExportCrs(point.latitude, point.longitude);
      projected.push({
        team_id: teamId,
        team_name: team.team_name || `Team ${teamId}`,
        team_color: team.team_color || '#ef4444',
        ...point,
        east,
        north,
      });
    });
  });

  return projected;
};

const pointToCanvas = (point, bounds, pixelWidth, pixelHeight) => ({
  x: ((point.east - bounds.minEast) / (bounds.maxEast - bounds.minEast)) * (pixelWidth - 1),
  y: ((bounds.maxNorth - point.north) / (bounds.maxNorth - bounds.minNorth)) * (pixelHeight - 1),
});

const buildExportSvg = ({ pixelWidth, pixelHeight, title, body }) => `
<svg xmlns="http://www.w3.org/2000/svg" width="${pixelWidth}" height="${pixelHeight}" viewBox="0 0 ${pixelWidth} ${pixelHeight}">
  <rect width="100%" height="100%" fill="rgba(255,255,255,0)" />
  ${title ? `<text x="20" y="32" font-family="${FONT_FAMILY}" font-size="22" font-weight="700" fill="#111827" stroke="#ffffff" stroke-width="4" paint-order="stroke fill">${escapeXml(title)}</text>` : ''}
  ${body}
</svg>`;

const renderSvgToPng = async (svgMarkup) => sharp(Buffer.from(svgMarkup)).png().toBuffer();

const makeLabelText = (text, x, y, fill) => `
  <text x="${x}" y="${y}" font-family="${FONT_FAMILY}" font-size="14" font-weight="700"
        fill="${fill}" stroke="#ffffff" stroke-width="3" paint-order="stroke fill">${escapeXml(text)}</text>`;

/**
 * Create a labeled team paths export (PNG + PGW) from team update sequences.
 */
export const generateTeamPathsExport = async (teamPaths, options = {}) => {
  if (!teamPaths || teamPaths.length === 0) {
    throw new Error('No team paths provided for export');
  }

  const pixelSize = options.pixelSize ?? 1024;
  const projectedTeams = teamPaths.map((team) => ({
    ...team,
    points: projectTeamPathPoints(team.updates || []),
  }));

  const projectedPoints = projectedTeams.flatMap((team) => team.points);
  const bounds = calculateBounds(projectedPoints);

  if (!bounds) {
    throw new Error('Failed to calculate bounds for team paths export');
  }

  const eastRange = bounds.maxEast - bounds.minEast;
  const northRange = bounds.maxNorth - bounds.minNorth;
  const aspectRatio = eastRange / northRange;
  let pixelWidth = pixelSize;
  let pixelHeight = pixelSize;

  if (aspectRatio > 1) {
    pixelHeight = Math.round(pixelSize / aspectRatio);
  } else {
    pixelWidth = Math.round(pixelSize * aspectRatio);
  }

  pixelWidth = Math.max(pixelWidth, 256);
  pixelHeight = Math.max(pixelHeight, 256);

  const body = [];

  projectedTeams.forEach((team) => {
    if (team.points.length < 2) {
      return;
    }

    const pathPoints = team.points.map((point) => {
      const canvasPoint = pointToCanvas(point, bounds, pixelWidth, pixelHeight);
      return `${canvasPoint.x.toFixed(2)},${canvasPoint.y.toFixed(2)}`;
    }).join(' ');

    const labelPoint = pointToCanvas(team.points[Math.floor(team.points.length / 2)], bounds, pixelWidth, pixelHeight);
    const endPoint = pointToCanvas(team.points[team.points.length - 1], bounds, pixelWidth, pixelHeight);
    const color = team.team_color || '#2563eb';

    body.push(`
      <polyline points="${pathPoints}" fill="none" stroke="${color}" stroke-width="5" stroke-linecap="round" stroke-linejoin="round" opacity="0.9" />
      <circle cx="${endPoint.x.toFixed(2)}" cy="${endPoint.y.toFixed(2)}" r="5" fill="${color}" stroke="#ffffff" stroke-width="2" />
      ${makeLabelText(team.team_name || `Team ${team.team_id}`, (labelPoint.x + 10).toFixed(2), (labelPoint.y - 10).toFixed(2), color)}
    `);
  });

  const svg = buildExportSvg({
    pixelWidth,
    pixelHeight,
    title: 'Team Paths',
    body: body.join('\n'),
  });

  const pngBuffer = await renderSvgToPng(svg);
  const pgwContent = generatePGWContent(bounds, pixelWidth, pixelHeight);

  return {
    coordinateSystem: DEFAULT_EXPORT_CRS,
    png: pngBuffer.toString('base64'),
    pgw: pgwContent,
    bounds: {
      minEast: bounds.minEast,
      maxEast: bounds.maxEast,
      minNorth: bounds.minNorth,
      maxNorth: bounds.maxNorth,
    },
    pixelWidth,
    pixelHeight,
    pngMimeType: 'image/png',
    pgwMimeType: 'text/plain',
  };
};

/**
 * Create a labeled dwell points export (PNG + PGW) from clustered stationary points.
 */
export const generateDwellPointsExport = async (dwellPointsByTeam, options = {}) => {
  const projectedPoints = projectDwellPoints(dwellPointsByTeam);

  if (projectedPoints.length === 0) {
    throw new Error('No dwell points provided for export');
  }

  const pixelSize = options.pixelSize ?? 1024;
  const bounds = calculateBounds(projectedPoints);

  if (!bounds) {
    throw new Error('Failed to calculate bounds for dwell points export');
  }

  const eastRange = bounds.maxEast - bounds.minEast;
  const northRange = bounds.maxNorth - bounds.minNorth;
  const aspectRatio = eastRange / northRange;
  let pixelWidth = pixelSize;
  let pixelHeight = pixelSize;

  if (aspectRatio > 1) {
    pixelHeight = Math.round(pixelSize / aspectRatio);
  } else {
    pixelWidth = Math.round(pixelSize * aspectRatio);
  }

  pixelWidth = Math.max(pixelWidth, 256);
  pixelHeight = Math.max(pixelHeight, 256);

  const body = projectedPoints.map((point) => {
    const canvasPoint = pointToCanvas(point, bounds, pixelWidth, pixelHeight);
    const radius = Math.max(4, metersToCanvasRadius(50, bounds, pixelWidth, pixelHeight));
    const label = `${point.team_name} (${point.duration_minutes}m)`;
    const fill = point.team_color || '#dc2626';

    return `
      <circle cx="${canvasPoint.x.toFixed(2)}" cy="${canvasPoint.y.toFixed(2)}" r="${radius.toFixed(2)}" fill="none" stroke="${fill}" stroke-opacity="0.75" stroke-width="3" />
      ${makeLabelText(label, (canvasPoint.x + radius + 6).toFixed(2), (canvasPoint.y - radius - 6).toFixed(2), fill)}
    `;
  });

  const svg = buildExportSvg({
    pixelWidth,
    pixelHeight,
    title: 'Dwell Points',
    body: body.join('\n'),
  });

  const pngBuffer = await renderSvgToPng(svg);
  const pgwContent = generatePGWContent(bounds, pixelWidth, pixelHeight);

  return {
    coordinateSystem: DEFAULT_EXPORT_CRS,
    png: pngBuffer.toString('base64'),
    pgw: pgwContent,
    bounds: {
      minEast: bounds.minEast,
      maxEast: bounds.maxEast,
      minNorth: bounds.minNorth,
      maxNorth: bounds.maxNorth,
    },
    pixelWidth,
    pixelHeight,
    pngMimeType: 'image/png',
    pgwMimeType: 'text/plain',
  };
};
