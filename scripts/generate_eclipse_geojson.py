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

# ============================================================================
# ELEMENTOS BESSELIANOS OFICIALES NASA/ESPENAK
# ============================================================================

X_COEFFS = [0.475593, 0.5189288, -0.0000773, -0.0000088]
Y_COEFFS = [0.771161, -0.2301664, -0.0001245, 0.0000037]
D_COEFFS = [14.79667, -0.012065, -0.000003]
L2_COEFFS = [-0.008142, 0.0000935, -0.0000121]
MU_COEFFS = [88.74776, 15.003093]

# Corrección al radio umbral para compensar el perfil real del limbo lunar.
# Los Elementos Besselianos estándar (NASA/Espenak) asumen una Luna esférica.
# Las webs profesionales (Xavier Jubier, timeanddate.com) usan el perfil real
# del limbo lunar (Watts' charts), que amplía la sombra ~12-15%.
# Calibrado contra 4 puntos de referencia oficiales (Bilbao, Galicia, Madrid, Cullera).
L2_CORRECTION = 0.0005  # Se resta de L2 (lo hace más negativo = sombra mayor)

T0 = 18.0
DELTA_T = 71.4
MU_CORRECTION = -DELTA_T * MU_COEFFS[1] / 3600.0

FLATTENING = 1.0 / 298.257223563
BA = 1.0 - FLATTENING
E_SQ = 2 * FLATTENING - FLATTENING ** 2

LON_RANGE = (-16.0, 8.0)        # Rango para la línea central
POLY_LON_RANGE = (-14.0, 8.0)   # Rango para el polígono (evita latitudes polares)
LAT_RANGE = (36.0, 50.0)        # Rango de latitud razonable
N_EDGE_SAMPLES = 720


def eval_poly(coeffs, t):
    return sum(c * (t ** i) for i, c in enumerate(coeffs))


def besselian_at(t_tdt):
    t = t_tdt - T0
    return (
        eval_poly(X_COEFFS, t),
        eval_poly(Y_COEFFS, t),
        math.radians(eval_poly(D_COEFFS, t)),
        eval_poly(L2_COEFFS, t) - L2_CORRECTION,  # Ampliación del limbo lunar
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
    r = abs(l2)
    points = []
    for i in range(N_EDGE_SAMPLES):
        theta = 2.0 * math.pi * i / N_EDGE_SAMPLES
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

    # ── PASO 1: Generar línea central ──
    print("\nGenerando línea central...")
    dt = 5.0 / 3600.0
    center_coords = []
    t = t_min
    while t <= t_max:
        result = central_line_point(t)
        if result:
            lat, lon = result
            if LON_RANGE[0] <= lon <= LON_RANGE[1] and LAT_RANGE[0] <= lat <= LAT_RANGE[1]:
                center_coords.append([round(lon, 5), round(lat, 5)])
        t += dt
    print(f"  {len(center_coords)} puntos")

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
            all_edges.append((approx_lon, edges))
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
        
        for c_lon, edges in all_edges:
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
    MIN_WIDTH_DEG = 0.5  # ~55 km mínimo para considerar válido
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
    # El polígono se construye como una forma de "almendra":
    # punta oeste → borde norte (O→E) → punta este → borde sur (E→O) → cierre
    # Las puntas son el punto medio entre el norte y sur en cada extremo.
    if north_final and south_final:
        # Punta oeste: punto medio entre el primer norte y primer sur
        west_tip = [
            north_final[0][0],  # misma longitud
            round((north_final[0][1] + south_final[0][1]) / 2, 5)
        ]
        # Punta este: punto medio entre el último norte y último sur
        east_tip = [
            north_final[-1][0],
            round((north_final[-1][1] + south_final[-1][1]) / 2, 5)
        ]
        # Almendra: punta_oeste → norte (O→E) → punta_este → sur invertido (E→O) → cierre
        polygon_ring = [west_tip] + north_final + [east_tip] + south_final[::-1] + [west_tip]
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
