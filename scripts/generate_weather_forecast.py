#!/usr/bin/env python3
"""
Eclipse Solar Total 2026 - Generador de Previsión Meteorológica Diaria Offline

Este script:
1. Lee la franja de totalidad del archivo GeoJSON (eclipse_2026.geojson).
2. Genera una cuadrícula de puntos dentro de la franja.
3. Consulta la API de predicción de Open-Meteo para el 12 de agosto de 2026 (18:00 UTC / 20:00 CEST).
4. Extrae la nubosidad total, desglose por capas (bajas, medias, altas), probabilidad de lluvia,
   código meteorológico WMO y temperatura.
5. Exporta un archivo JavaScript (weather_forecast_data.js) para consumo estático offline en la web app.
"""

import json
import math
import urllib.request
import urllib.error
import time
import os
from datetime import datetime, timezone

# Rutas de archivos
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
BASE_DIR = os.path.abspath(os.path.join(SCRIPT_DIR, ".."))
GEOJSON_PATH = os.path.join(BASE_DIR, "eclipse_2026.geojson")
OUTPUT_JS_PATH = os.path.join(BASE_DIR, "weather_forecast_data.js")

STEP = 0.35  # ~0.35 grados (aprox. 30-40km de separación entre puntos)
TARGET_DATE = "2026-08-12"
TARGET_HOUR_UTC = 18  # 18:00 UTC (20:00 CEST en España)

# --- ALGORITMO RAY CASTING PARA POINT-IN-POLYGON ---
def is_point_in_polygon(x, y, poly):
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
    print(" ☀️ Eclipse 2026 - Generador de Previsión Diaria")
    print("==================================================")

    if not os.path.exists(GEOJSON_PATH):
        print(f"❌ Error: No se encuentra {GEOJSON_PATH}")
        return

    # 1. Cargar el GeoJSON de la franja
    with open(GEOJSON_PATH, "r", encoding="utf-8") as f:
        data = json.load(f)

    poly_coords = None
    for feature in data.get("features", []):
        gtype = feature["geometry"]["type"]
        if gtype == "Polygon":
            poly_coords = feature["geometry"]["coordinates"][0]
            break
        elif gtype == "MultiPolygon":
            poly_coords = feature["geometry"]["coordinates"][0][0]
            break

    if not poly_coords:
        print("❌ Error: No se encontró polígono válido en el GeoJSON")
        return

    # Bounding Box
    lons = [p[0] for p in poly_coords]
    lats = [p[1] for p in poly_coords]
    min_lon, max_lon = min(lons), max(lons)
    min_lat, max_lat = min(lats), max(lats)

    print(f"📌 Bounding Box: Lon [{min_lon:.2f}, {max_lon:.2f}] Lat [{min_lat:.2f}, {max_lat:.2f}]")

    # 2. Generar grid de puntos dentro de la franja
    grid_points = []
    lat = min_lat + STEP / 2
    while lat <= max_lat:
        lon = min_lon + STEP / 2
        while lon <= max_lon:
            if is_point_in_polygon(lon, lat, poly_coords):
                grid_points.append({"lat": round(lat, 4), "lon": round(lon, 4)})
            lon += STEP
        lat += STEP

    print(f"📍 Se generaron {len(grid_points)} puntos de muestreo en la franja.")

    # 3. Consultar Open-Meteo Forecast API
    BATCH_SIZE = 60
    results = []
    
    now_utc_str = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    print(f"📡 Consultando Open-Meteo API (Fecha objetivo: {TARGET_DATE} {TARGET_HOUR_UTC}:00 UTC)...", flush=True)

    for i in range(0, len(grid_points), BATCH_SIZE):
        batch = grid_points[i:i+BATCH_SIZE]
        lats_str = ",".join(f"{p['lat']}" for p in batch)
        lons_str = ",".join(f"{p['lon']}" for p in batch)
        
        batch_num = i // BATCH_SIZE + 1
        total_batches = (len(grid_points) + BATCH_SIZE - 1) // BATCH_SIZE
        print(f"  ⚡ Procesando lote {batch_num}/{total_batches} ({len(batch)} puntos)...", flush=True)

        url = (
            f"https://api.open-meteo.com/v1/forecast?"
            f"latitude={lats_str}&longitude={lons_str}"
            f"&start_date={TARGET_DATE}&end_date={TARGET_DATE}"
            f"&hourly=cloud_cover,cloud_cover_low,cloud_cover_mid,cloud_cover_high,precipitation_probability,weather_code,temperature_2m"
            f"&timezone=UTC"
        )

        max_retries = 3
        batch_data = None
        for attempt in range(max_retries):
            try:
                req = urllib.request.Request(url, headers={'User-Agent': 'Eclipse2026Forecast/1.0'})
                with urllib.request.urlopen(req, timeout=10) as response:
                    res_body = response.read().decode('utf-8')
                    batch_data = json.loads(res_body)
                    if isinstance(batch_data, dict):
                        batch_data = [batch_data]
                    break
            except urllib.error.HTTPError as e:
                if e.code == 429:
                    print(f"    [!] Límite de peticiones alcanzado. Esperando {3 * (attempt+1)}s...", flush=True)
                    time.sleep(3 * (attempt+1))
                else:
                    print(f"    [!] Error HTTP {e.code}: {e.reason}", flush=True)
                    break
            except Exception as e:
                print(f"    [!] Error en consulta: {e}", flush=True)
                break

        if batch_data and len(batch_data) == len(batch):
            for j, p_data in enumerate(batch_data):
                hourly = p_data.get("hourly", {})
                idx = TARGET_HOUR_UTC if (hourly.get("time") and len(hourly.get("time")) > TARGET_HOUR_UTC) else 0

                c_total = hourly.get("cloud_cover", [None])[idx] if (hourly.get("cloud_cover") and len(hourly.get("cloud_cover")) > idx) else None
                c_low = hourly.get("cloud_cover_low", [None])[idx] if (hourly.get("cloud_cover_low") and len(hourly.get("cloud_cover_low")) > idx) else None
                c_mid = hourly.get("cloud_cover_mid", [None])[idx] if (hourly.get("cloud_cover_mid") and len(hourly.get("cloud_cover_mid")) > idx) else None
                c_high = hourly.get("cloud_cover_high", [None])[idx] if (hourly.get("cloud_cover_high") and len(hourly.get("cloud_cover_high")) > idx) else None
                precip = hourly.get("precipitation_probability", [0])[idx] if (hourly.get("precipitation_probability") and len(hourly.get("precipitation_probability")) > idx) else 0
                w_code = hourly.get("weather_code", [0])[idx] if (hourly.get("weather_code") and len(hourly.get("weather_code")) > idx) else 0
                temp = hourly.get("temperature_2m", [25.0])[idx] if (hourly.get("temperature_2m") and len(hourly.get("temperature_2m")) > idx) else 25.0

                results.append({
                    "lat": batch[j]["lat"],
                    "lon": batch[j]["lon"],
                    "c_total": c_total if c_total is not None else None,
                    "c_low": c_low if c_low is not None else None,
                    "c_mid": c_mid if c_mid is not None else None,
                    "c_high": c_high if c_high is not None else None,
                    "precip": precip if precip is not None else 0,
                    "w_code": w_code if w_code is not None else 0,
                    "temp": round(temp, 1) if temp is not None else 25.0
                })
        else:
            # Si la petición al lote falló, guardamos los puntos con c_total: None para no falsear datos
            print(f"    [⚠] Error en lote {batch_num}: registrando puntos sin datos (c_total: None)")
            for p in batch:
                results.append({
                    "lat": p["lat"],
                    "lon": p["lon"],
                    "c_total": None,
                    "c_low": None,
                    "c_mid": None,
                    "c_high": None,
                    "precip": 0,
                    "w_code": 0,
                    "temp": 25.0
                })

        time.sleep(1)  # Pausa respetuosa entre lotes

    # 4. Construir objeto JS final
    output_obj = {
        "generated_at": now_utc_str,
        "target_date": TARGET_DATE,
        "target_hour_utc": TARGET_HOUR_UTC,
        "provider": "Open-Meteo Weather Forecast API",
        "model": "ECMWF / GFS Global Seamless",
        "point_count": len(results),
        "points": results
    }

    js_content = f"""// Generado automáticamente por scripts/generate_weather_forecast.py
// Marca de tiempo de generación: {now_utc_str}
// Previsión meteorológica numérico-climática para el {TARGET_DATE} {TARGET_HOUR_UTC}:00 UTC
window.weatherForecastData = {json.dumps(output_obj, separators=(',', ':'))};
"""

    with open(OUTPUT_JS_PATH, "w", encoding="utf-8") as f:
        f.write(js_content)

    print(f"✅ Previsión meteorológica pregenerada y guardada en {OUTPUT_JS_PATH}")
    print(f"📊 {len(results)} puntos exportados exitosamente.")

if __name__ == "__main__":
    main()
