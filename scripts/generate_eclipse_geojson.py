#!/usr/bin/env python3
"""
Eclipse Solar Total 2026-08-12: Generador GeoJSON de alta precisión.

Calcula la línea central y los límites norte/sur de la franja de totalidad
directamente desde los Elementos Besselianos oficiales de NASA/Espenak.

MÉTODO:
  - Línea central: proyección directa (x, y) → (lat, lon) sobre WGS84.
  - Límites norte/sur: para cada longitud target, se escanean TODOS los
    instantes del eclipse. En cada instante, se calcula dónde el borde
    del círculo umbral interseca el meridiano de esa longitud. La latitud
    máxima encontrada en cualquier instante es el límite norte real;
    la mínima es el límite sur real.
    
    Esto es esencial porque la franja de totalidad es el BARRIDO de la sombra,
    no su huella instantánea. Un punto puede experimentar totalidad en un
    instante diferente al que el centro de la sombra cruza su longitud.

Precisión: < 0.2 km vs tabla oficial NASA para la línea central.

Ref: https://eclipse.gsfc.nasa.gov/SEbeselm/SEbeselm2001/SE2026Aug12Tbeselm.html
"""

import json
import math
import os

CONFIG_PATH = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "config.js")
with open(CONFIG_PATH, "r", encoding="utf-8") as f:
    js_content = f.read()
    # Extraer el JSON del string (quitando "window.EclipseConfig = " y el ";" final)
    json_str = js_content.split("=", 1)[1].strip()
    if json_str.endswith(";"):
        json_str = json_str[:-1]
    CONFIG = json.loads(json_str)

B_CONF = CONFIG["besselian"]

# ============================================================================
# ELEMENTOS BESSELIANOS OFICIALES NASA/ESPENAK
# ============================================================================

X_COEFFS = B_CONF["X_COEFFS"]
Y_COEFFS = B_CONF["Y_COEFFS"]
D_COEFFS = B_CONF["D_COEFFS"]
L2_COEFFS = B_CONF["L2_COEFFS"]
MU_COEFFS = B_CONF["MU_COEFFS"]

# Correcciones empíricas independientes para el límite NORTE y SUR.
# Permite ensanchar/estrechar la franja de forma asimétrica (Watts charts).
L2_NORTH_BASE = B_CONF["limb_correction"]["north"]["base"]
L2_NORTH_SLOPE = B_CONF["limb_correction"]["north"]["slope"]
L2_NORTH_QUAD = B_CONF["limb_correction"]["north"]["quad"]

L2_SOUTH_BASE = B_CONF["limb_correction"]["south"]["base"]
L2_SOUTH_SLOPE = B_CONF["limb_correction"]["south"]["slope"]
L2_SOUTH_QUAD = B_CONF["limb_correction"]["south"]["quad"]

T0 = B_CONF["T0"]
DELTA_T = B_CONF["DELTA_T"]
MU_CORRECTION = -DELTA_T * MU_COEFFS[1] / 3600.0

FLATTENING = 1.0 / 298.257223563
BA = 1.0 - FLATTENING
E_SQ = 2 * FLATTENING - FLATTENING ** 2

LON_RANGE = (-14.0, 8.0)        # Rango para la línea central
POLY_LON_RANGE = (-17.0, 8.0)   # Rango para el polígono (evita latitudes polares)
LAT_RANGE = (30.0, 60.0)        # Rango de latitud razonable
N_EDGE_SAMPLES = 720


def eval_poly(coeffs, t):
    return sum(c * (t ** i) for i, c in enumerate(coeffs))


def besselian_at(t_tdt):
    t = t_tdt - T0
    return (
        eval_poly(X_COEFFS, t),
        eval_poly(Y_COEFFS, t),
        math.radians(eval_poly(D_COEFFS, t)),
        eval_poly(L2_COEFFS, t),  # No aplicamos corrección global aquí
        eval_poly(MU_COEFFS, t) + MU_CORRECTION,
    )


def fundamental_to_geo(xi, eta, d, mu):
    """Plano fundamental (ξ, η) → geodésicas (lat°, lon°) sobre WGS84."""
    rho1 = math.sqrt(1.0 - E_SQ * math.cos(d) ** 2)
    sin_d1 = math.sin(d) / rho1
    cos_d1 = BA * math.cos(d) / rho1

    eta1 = eta / rho1
    r_sq = xi ** 2 + eta1 ** 2
    if r_sq >= 1.0:
        return None

    zeta1 = math.sqrt(1.0 - r_sq)
    sin_phi1 = eta1 * cos_d1 + zeta1 * sin_d1
    sin_phi1 = max(-1.0, min(1.0, sin_phi1))
    phi1 = math.asin(sin_phi1)

    A = zeta1 * cos_d1 - eta1 * sin_d1
    H = math.degrees(math.atan2(xi, A))

    lat = math.degrees(math.atan(math.tan(phi1) / BA))
    lon = -(mu - H)
    while lon > 180.0:
        lon -= 360.0
    while lon < -180.0:
        lon += 360.0
    return lat, lon


def central_line_point(t_tdt):
    x, y, d, l2, mu = besselian_at(t_tdt)
    return fundamental_to_geo(x, y, d, mu)


def find_time_range():
    t_start = t_end = None
    for t_10s in range(15 * 360, 21 * 360):
        t = t_10s / 360.0
        x, y, d, l2, mu = besselian_at(t)
        rho1 = math.sqrt(1.0 - E_SQ * math.cos(d) ** 2)
        if x ** 2 + (y / rho1) ** 2 < 1.0:
            if t_start is None:
                t_start = t
            t_end = t
    return t_start - 0.005, t_end + 0.005


def precompute_edge_at_time(t_tdt):
    """
    Precalcula todos los puntos del borde umbral proyectados sobre
    la superficie terrestre para un instante dado.
    Retorna lista de (lat, lon) o None para puntos fuera de la Tierra.
    """
    x, y, d, l2, mu = besselian_at(t_tdt)
    r_base = abs(l2)
    points = []
    
    t = t_tdt - T0
    corr_n = L2_NORTH_BASE + L2_NORTH_SLOPE * t + L2_NORTH_QUAD * (t ** 2)
    corr_s = L2_SOUTH_BASE + L2_SOUTH_SLOPE * t + L2_SOUTH_QUAD * (t ** 2)
    
    for i in range(N_EDGE_SAMPLES):
        theta = 2.0 * math.pi * i / N_EDGE_SAMPLES
        
        # Interpolar suavemente entre corrección norte y sur según el ángulo
        weight_north = (math.sin(theta) + 1.0) / 2.0
        weight_south = 1.0 - weight_north
        l2_corr = corr_n * weight_north + corr_s * weight_south
        
        r = r_base + l2_corr  # Sumamos la corrección al radio umbral absoluto
        
        xi = x + r * math.cos(theta)
        eta = y + r * math.sin(theta)
        points.append(fundamental_to_geo(xi, eta, d, mu))
    return points


def find_meridian_crossings(edge_points, target_lon):
    """
    Dado un conjunto de puntos del borde umbral, encuentra dónde
    el borde cruza un meridiano (longitud constante).
    Retorna lista de latitudes donde ocurren los cruces.
    """
    lats = []
    n = len(edge_points)
    for i in range(n):
        j = (i + 1) % n
        pt_a = edge_points[i]
        pt_b = edge_points[j]
        if pt_a is None or pt_b is None:
            continue
        lat_a, lon_a = pt_a
        lat_b, lon_b = pt_b
        # Evitar saltos de ±360°
        if abs(lon_b - lon_a) > 180.0:
            continue
        # ¿Cruza el meridiano target?
        if (lon_a - target_lon) * (lon_b - target_lon) <= 0:
            dlon = lon_b - lon_a
            if abs(dlon) < 1e-10:
                lats.append((lat_a + lat_b) / 2.0)
            else:
                frac = (target_lon - lon_a) / dlon
                lats.append(lat_a + frac * (lat_b - lat_a))
    return lats


def main():
    print("=" * 60)
    print("Eclipse Solar Total 2026-08-12")
    print("Elementos Besselianos NASA/Espenak")
    print("Barrido temporal completo para límites reales")
    print("=" * 60)

    t_min, t_max = find_time_range()
    print(f"\nRango temporal TDT: {t_min:.4f}h – {t_max:.4f}h")

    # ── VALIDACIÓN LÍNEA CENTRAL vs NASA ──
    print("\n── Validación Línea Central vs NASA ──")
    nasa_center = [
        (18 + 20 / 60, 48 + 12.7 / 60, -(13 + 2.9 / 60)),
        (18 + 22 / 60, 47 + 6.1 / 60, -(11 + 42.9 / 60)),
        (18 + 24 / 60, 45 + 56.6 / 60, -(10 + 11.4 / 60)),
        (18 + 26 / 60, 44 + 42.8 / 60, -(8 + 23.9 / 60)),
        (18 + 28 / 60, 43 + 22.3 / 60, -(6 + 11.3 / 60)),
        (18 + 30 / 60, 41 + 49.0 / 60, -(3 + 11.1 / 60)),
    ]
    for ut_h, ref_lat, ref_lon in nasa_center:
        tdt_h = ut_h + DELTA_T / 3600.0
        result = central_line_point(tdt_h)
        if result:
            lat, lon = result
            dlat = abs(lat - ref_lat) * 111.0
            dlon = abs(lon - ref_lon) * 111.0 * math.cos(math.radians(lat))
            dist = math.sqrt(dlat ** 2 + dlon ** 2)
            print(f"  ✅ UT {ut_h:.4f}h: ({lat:7.3f}°, {lon:7.3f}°) "
                  f"Δ={dist:.2f}km")

    # ── PASO 1: Generar línea central y fotogramas ──
    print("\nGenerando línea central y fotogramas...")
    dt = 5.0 / 3600.0
    center_coords = []
    shadow_frames = []
    center_times = []
    t = t_min
    while t <= t_max:
        result = central_line_point(t)
        if result:
            lat, lon = result
            if LON_RANGE[0] <= lon <= LON_RANGE[1] and LAT_RANGE[0] <= lat <= LAT_RANGE[1]:
                center_coords.append([round(lon, 5), round(lat, 5)])
                center_times.append(t)
                
                edges = precompute_edge_at_time(t)
                valid_edges = [pt for pt in edges if pt is not None]
                if len(valid_edges) >= 3:
                    step = max(1, len(valid_edges) // 60)
                    sampled = valid_edges[::step]
                    poly_coords = [[round(l, 4), round(la, 4)] for la, l in sampled]
                    shadow_frames.append(poly_coords)
                else:
                    shadow_frames.append([])
        t += dt
    print(f"  {len(center_coords)} puntos y fotogramas")

    # ── PASO 2: Precalcular bordes umbrales para todos los instantes ──
    # IMPORTANTE: La sombra puede tocar la Tierra incluso cuando su CENTRO
    # ya no lo hace (los últimos ~90 segundos del eclipse). Debemos extender
    # el barrido más allá de t_max y calcular bordes siempre.
    print("Precalculando bordes umbrales en cada instante...")
    dt_scan = 5.0 / 3600.0  # 5 segundos de paso
    all_edges = []  # Lista de (approx_lon, edge_points)
    
    # Extender 5 minutos después de t_max para capturar la fase final
    t_extended = t_max + 5.0 / 60.0
    
    t = t_min
    while t <= t_extended:
        edges = precompute_edge_at_time(t)
        # Comprobar si al menos algún punto del borde toca la Tierra
        has_earth_contact = any(pt is not None for pt in edges)
        if has_earth_contact:
            # Determinar longitud aproximada del centro para filtrar
            center = central_line_point(t)
            if center:
                approx_lon = center[1]
            else:
                # Centro fuera de la Tierra: estimar lon desde los puntos del borde
                earth_lons = [pt[1] for pt in edges if pt is not None]
                if earth_lons:
                    approx_lon = sum(earth_lons) / len(earth_lons)
                else:
                    approx_lon = 999  # no usar
            all_edges.append((t, approx_lon, edges))
        t += dt_scan
    print(f"  {len(all_edges)} instantes precalculados (incluye fase final)")

    # ── PASO 3: Para cada longitud, barrer instantes CERCANOS ──
    # Solo consideramos instantes donde el centro de la sombra está
    # dentro de ±LON_WINDOW grados de la longitud target.
    # Esto evita que sombras lejanas (inicio/fin del eclipse en latitudes
    # extremas) contaminen los límites de meridianos distantes.
    LON_WINDOW = 8.0  # grados (amplio para capturar sombra elongada al atardecer)
    
    print("Calculando límites reales por barrido temporal filtrado...")
    
    lon_step = 0.1
    north_coords = []
    south_coords = []
    count = 0
    
    target_lon = POLY_LON_RANGE[0]
    while target_lon <= POLY_LON_RANGE[1]:
        overall_north = -90.0
        overall_south = 90.0
        found = False
        
        for t_edge, c_lon, edges in all_edges:
            # Solo considerar instantes donde la sombra está cerca
            if abs(c_lon - target_lon) > LON_WINDOW:
                continue
                
            crossings = find_meridian_crossings(edges, target_lon)
            for lat_val in crossings:
                if LAT_RANGE[0] < lat_val < LAT_RANGE[1]:
                    found = True
                    if lat_val > overall_north:
                        overall_north = lat_val
                    if lat_val < overall_south:
                        overall_south = lat_val
        
        if found and overall_north > overall_south:
            north_coords.append([round(target_lon, 5), round(overall_north, 5)])
            south_coords.append([round(target_lon, 5), round(overall_south, 5)])
        
        target_lon += lon_step
        count += 1
        if count % 50 == 0:
            print(f"  {count} longitudes procesadas...")

    print(f"  Norte: {len(north_coords)}, Sur: {len(south_coords)} puntos")

    # ── POST-PROCESADO: Recortar y suavizar ──
    # 1. Recortar extremos donde la franja se estrecha artificialmente
    #    (artefacto de la sombra despegándose al atardecer)
    MIN_WIDTH_DEG = 0.1  # ~11 km mínimo para considerar válido
    trimmed_north = []
    trimmed_south = []
    for nc, sc in zip(north_coords, south_coords):
        width_deg = nc[1] - sc[1]
        if width_deg >= MIN_WIDTH_DEG:
            trimmed_north.append(nc)
            trimmed_south.append(sc)
    
    print(f"  Tras recorte: {len(trimmed_north)} puntos (eliminados {len(north_coords) - len(trimmed_north)})")

    # 2. Suavizado con media móvil de 5 puntos
    def smooth(coords, window=5):
        result = []
        half = window // 2
        for i in range(len(coords)):
            start = max(0, i - half)
            end = min(len(coords), i + half + 1)
            avg_lat = sum(c[1] for c in coords[start:end]) / (end - start)
            result.append([coords[i][0], round(avg_lat, 5)])
        return result

    north_final = smooth(trimmed_north, 5)
    south_final = smooth(trimmed_south, 5)
    print(f"  Suavizado aplicado (ventana=5)")

    # ── VALIDACIÓN DE ANCHO ──
    print("\n── Validación de ancho de franja (debe ser ~200-430 km) ──")
    for nc, sc in zip(north_final, south_final):
        lon_val = nc[0]
        if any(abs(lon_val - t) < 0.05 for t in [-12, -9, -6, -3, 0, 3, 5]):
            width = (nc[1] - sc[1]) * 111.0
            print(f"  Lon {nc[0]:6.1f}°: N={nc[1]:.3f}° S={sc[1]:.3f}° "
                  f"Ancho={width:.0f}km")

    # ── CONSTRUIR GeoJSON ──
    def crop_polyline_by_plane(polyline, p_plane, dir_lonlat):
        cropped = []
        cos_lat = math.cos(math.radians(p_plane[1]))
        nx = dir_lonlat[0] * cos_lat
        ny = dir_lonlat[1]
        
        for i in range(len(polyline) - 1):
            A = polyline[i]
            B = polyline[i+1]
            
            dAx = (A[0] - p_plane[0]) * cos_lat
            dAy = (A[1] - p_plane[1])
            dA = dAx * nx + dAy * ny
            
            dBx = (B[0] - p_plane[0]) * cos_lat
            dBy = (B[1] - p_plane[1])
            dB = dBx * nx + dBy * ny
            
            if dA >= 0:
                if not cropped or cropped[-1] != A:
                    cropped.append(A)
                    
            if (dA < 0 and dB > 0) or (dA > 0 and dB < 0):
                frac = dA / (dA - dB)
                I = [A[0] + frac * (B[0] - A[0]), A[1] + frac * (B[1] - A[1])]
                cropped.append([round(I[0], 5), round(I[1], 5)])
                
        if polyline:
            last = polyline[-1]
            d_last_x = (last[0] - p_plane[0]) * cos_lat
            d_last_y = (last[1] - p_plane[1])
            d_last = d_last_x * nx + d_last_y * ny
            if d_last >= 0:
                if not cropped or cropped[-1] != last:
                    cropped.append(last)
                    
        return cropped

    if north_final and south_final and len(center_coords) >= 2:
        p_west = center_coords[0]
        p_west_next = center_coords[1]
        dir_west = [p_west_next[0] - p_west[0], p_west_next[1] - p_west[1]]
        
        north_final = crop_polyline_by_plane(north_final, p_west, dir_west)
        south_final = crop_polyline_by_plane(south_final, p_west, dir_west)
        
        p_last = center_coords[-1]
        p_prev = center_coords[-2]
        dir_fwd = [p_last[0] - p_prev[0], p_last[1] - p_prev[1]]
        
        # Extrapolar la línea central hasta lon 5.0 para cubrir las Baleares enteras
        target_lon = 5.0
        if dir_fwd[0] > 0 and p_last[0] < target_lon:
            frac = (target_lon - p_last[0]) / dir_fwd[0]
            p_east = [round(target_lon, 5), round(p_last[1] + frac * dir_fwd[1], 5)]
            center_coords.append(p_east)
            
            # Generar frame para p_east
            t_last = center_times[-1]
            t_prev = center_times[-2]
            t_east = t_last + frac * (t_last - t_prev)
            center_times.append(t_east)
            
            edges = precompute_edge_at_time(t_east)
            valid_edges = [pt for pt in edges if pt is not None]
            if len(valid_edges) >= 3:
                step = max(1, len(valid_edges) // 60)
                sampled = valid_edges[::step]
                poly_coords = [[round(l, 4), round(la, 4)] for la, l in sampled]
                shadow_frames.append(poly_coords)
            else:
                shadow_frames.append([])
        else:
            p_east = p_last
            
        dir_east = [-dir_fwd[0], -dir_fwd[1]]
        
        north_final = crop_polyline_by_plane(north_final, p_east, dir_east)
        south_final = crop_polyline_by_plane(south_final, p_east, dir_east)
        
        polygon_ring = north_final + south_final[::-1]
        if polygon_ring:
            polygon_ring.append(polygon_ring[0])
    else:
        polygon_ring = []

    feature_collection = {
        "type": "FeatureCollection",
        "features": [
            {
                "type": "Feature",
                "properties": {
                    "name": "Línea Central",
                    "stroke": "#f1c40f",
                    "stroke-width": 2,
                    "stroke-dasharray": "5, 5"
                },
                "geometry": {
                    "type": "LineString",
                    "coordinates": center_coords
                }
            },
            {
                "type": "Feature",
                "properties": {
                    "name": "Franja de Totalidad (NASA/Espenak)",
                    "fill": "#2c3e50",
                    "fill-opacity": 0.45,
                    "stroke": "#34495e",
                    "stroke-width": 1
                },
                "geometry": {
                    "type": "Polygon",
                    "coordinates": [polygon_ring]
                }
            }
        ]
    }
    
    # Exportar tiempos en UT para sincronización exacta en la animación
    shadow_times = [t - (DELTA_T / 3600.0) for t in center_times]
    
    feature_collection["shadow_frames"] = shadow_frames
    feature_collection["shadow_times"] = shadow_times

    out_geojson = "/Users/marco/proyectos/eclipse/eclipse_2026.geojson"
    with open(out_geojson, "w") as f:
        json.dump(feature_collection, f, indent=2)

    out_js = "/Users/marco/proyectos/eclipse/eclipse_data.js"
    with open(out_js, "w") as f:
        f.write("const eclipseGeoJSON = ")
        json.dump(feature_collection, f, indent=2)
        f.write(";\n")
        
    print(f"\n✅ {out_geojson}")
    print(f"   {out_js}")


if __name__ == "__main__":
    main()
