#!/usr/bin/env python3
"""
Eclipse Solar Total 2026 - Generador de Heatmap de Nubes

Este script lee la franja de totalidad del archivo geojson, genera
una cuadrícula de puntos, comprueba cuáles están dentro de la franja,
y consulta la API histórica de Open-Meteo para obtener la cobertura de nubes
el 12 de Agosto de 2025 a las 18:00 UTC.

Finalmente exporta los datos a un archivo JavaScript para ser usados
directamente por la aplicación web.
"""

import json
import math
import urllib.request
import time
import os
from datetime import datetime

GEOJSON_PATH = "../eclipse_2026.geojson"
OUTPUT_JS_PATH = "../cloud_heatmap.js"
STEP = 0.50  # ~0.50 grados para ~250 puntos (más rápido, menos carga API)

# --- RAY CASTING ALGORITHM ---
def is_point_in_polygon(x, y, poly):
    """
    Ray casting algorithm para determinar si un punto (x, y)
    está dentro de un polígono definido como una lista de (x, y).
    """
    n = len(poly)
    inside = False
    p1x, p1y = poly[0]
    for i in range(1, n + 1):
        p2x, p2y = poly[i % n]
        if y > min(p1y, p2y):
            if y <= max(p1y, p2y):
                if x <= max(p1x, p2x):
                    if p1y != p2y:
                        xints = (y - p1y) * (p2x - p1x) / (p2y - p1y) + p1x
                    if p1x == p2x or x <= xints:
                        inside = not inside
        p1x, p1y = p2x, p2y
    return inside

def main():
    print("==================================================")
    print("Generador de Heatmap de Nubes (Cloud Cover)")
    print("==================================================")

    if not os.path.exists(GEOJSON_PATH):
        print(f"Error: No se encuentra {GEOJSON_PATH}")
        return

    # 1. Cargar el GeoJSON
    with open(GEOJSON_PATH, "r") as f:
        data = json.load(f)

    poly_coords = None
    for feature in data.get("features", []):
        if feature["geometry"]["type"] == "Polygon":
            poly_coords = feature["geometry"]["coordinates"][0]
            break
        elif feature["geometry"]["type"] == "MultiPolygon":
            poly_coords = feature["geometry"]["coordinates"][0][0]
            break

    if not poly_coords:
        print("Error: No se encontró un polígono en el GeoJSON")
        return

    # Extraer bounding box
    lons = [p[0] for p in poly_coords]
    lats = [p[1] for p in poly_coords]
    min_lon, max_lon = min(lons), max(lons)
    min_lat, max_lat = min(lats), max(lats)

    print(f"Bounding Box: Lon [{min_lon:.2f}, {max_lon:.2f}] Lat [{min_lat:.2f}, {max_lat:.2f}]")

    # 2. Generar grid de puntos
    grid_points = []
    lat = min_lat + STEP / 2
    while lat <= max_lat:
        lon = min_lon + STEP / 2
        while lon <= max_lon:
            if is_point_in_polygon(lon, lat, poly_coords):
                grid_points.append({"lat": lat, "lon": lon})
            lon += STEP
        lat += STEP

    print(f"Se generaron {len(grid_points)} puntos dentro de la franja.")

    # 3. Consultar Open-Meteo en lotes (batch)
    BATCH_SIZE = 30  # Usamos 30 para no saturar los límites de datos por query de Open-Meteo
    YEARS = list(range(2015, 2026))  # 11 años (2015-2025)
    results = []
    
    print(f"Consultando Open-Meteo Historical API para promediar {len(YEARS)} años (Agosto 12 a las 18:00 UTC)...")
    
    for i in range(0, len(grid_points), BATCH_SIZE):
        batch = grid_points[i:i+BATCH_SIZE]
        lats_str = ",".join(f"{p['lat']:.4f}" for p in batch)
        lons_str = ",".join(f"{p['lon']:.4f}" for p in batch)
        
        print(f"  Procesando lote {i//BATCH_SIZE + 1}/{(len(grid_points) + BATCH_SIZE - 1)//BATCH_SIZE}...")
        
        # Para almacenar la suma de la nubosidad de los 10 años
        batch_sums = [0] * len(batch)
        batch_counts = [0] * len(batch)
        
        for year in YEARS:
            url = (
                f"https://archive-api.open-meteo.com/v1/archive?"
                f"latitude={lats_str}&longitude={lons_str}"
                f"&start_date={year}-08-12&end_date={year}-08-12"
                f"&hourly=cloudcover"
            )
            
            max_retries = 3
            for attempt in range(max_retries):
                try:
                    req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0 EclipseMap/1.0'})
                    with urllib.request.urlopen(req) as response:
                        batch_data = json.loads(response.read().decode())
                        
                        if isinstance(batch_data, dict):
                            if "error" in batch_data:
                                print(f"    Error en API (año {year}): {batch_data}")
                                break
                            batch_data = [batch_data]
                            
                        for j, p_data in enumerate(batch_data):
                            if "hourly" in p_data and "cloudcover" in p_data["hourly"]:
                                val = p_data["hourly"]["cloudcover"][18]
                                if val is not None:
                                    batch_sums[j] += val
                                    batch_counts[j] += 1
                        break  # Salir del retry si funciona
                except urllib.error.HTTPError as e:
                    if e.code == 429:
                        print(f"    [!] Error 429: Too Many Requests. Esperando {5 * (attempt+1)}s (Intento {attempt+1}/{max_retries})")
                        time.sleep(5 * (attempt+1))
                    else:
                        print(f"    Error de red en año {year}: {e}")
                        break
                except Exception as e:
                    print(f"    Error genérico en año {year}: {e}")
                    break
                    
            time.sleep(2)  # Pausa de cortesía entre años para no saturar la API
            
        # Calcular el promedio de cada punto en el batch
        for j in range(len(batch)):
            avg_cloud = batch_sums[j] / batch_counts[j] if batch_counts[j] > 0 else 0
            results.append({
                "lat": round(batch[j]["lat"], 4),
                "lon": round(batch[j]["lon"], 4),
                "cloudcover": round(avg_cloud)
            })

    print(f"Se obtuvieron {len(results)} resultados de nubosidad.")

    # 4. Escribir a JavaScript
    js_content = f"""// Generado por scripts/generate_cloud_heatmap.py
// Promedio histórico de Open-Meteo (2015-2025) para el 12 Agosto a las 18:00 UTC
window.cloudHeatmapData = {json.dumps(results, separators=(',', ':'))};
"""

    with open(OUTPUT_JS_PATH, "w") as f:
        f.write(js_content)
        
    print(f"✅ Guardado exitosamente en {OUTPUT_JS_PATH}")

if __name__ == "__main__":
    main()
