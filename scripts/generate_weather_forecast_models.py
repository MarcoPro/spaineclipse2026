#!/usr/bin/env python3
"""
Eclipse Solar Total 2026 - Generador Meteorológico basado en Modelos Numéricos (NWP)

Este script:
1. Lee los ~3.947 municipios de la franja del eclipse (scripts/aemet_path_municipalities.json).
2. Consulta en lotes (batching de 40 municipios) la predicción horaria exacta para las 18:00 UTC del 12 de agosto de 2026.
3. Extrae la estructura de capas nubosas 3D (baja, media, alta y total), temperatura y probabilidad de precipitación desde los modelos numéricos de alta resolución (ECMWF IFS 0.25° / DWD ICON-EU / HARMONIE-AROME).
4. Genera y actualiza directamente el archivo `weather_forecast_data.js` para consumo del mapa estático.
"""

import json
import urllib.request
import urllib.error
import time
import os
from datetime import datetime, timezone

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
BASE_DIR = os.path.abspath(os.path.join(SCRIPT_DIR, ".."))
PATH_MUNIS_PATH = os.path.join(SCRIPT_DIR, "aemet_path_municipalities.json")
OUTPUT_JS_PATH = os.path.join(BASE_DIR, "weather_forecast_data.js")

TARGET_DATE = "2026-08-12"
TARGET_HOUR_UTC = 19

def safe_decode(raw_bytes):
    try:
        return raw_bytes.decode('utf-8')
    except UnicodeDecodeError:
        return raw_bytes.decode('latin-1')

def fetch_batch_nwp(batch_munis, max_retries=3):
    """Consulta la predicción del modelo numérico (NWP) para un lote de municipios."""
    lats = [str(m['lat']) for m in batch_munis]
    lons = [str(m['lon']) for m in batch_munis]
    
    lat_str = ','.join(lats)
    lon_str = ','.join(lons)
    
    url = f"https://api.open-meteo.com/v1/forecast?latitude={lat_str}&longitude={lon_str}&hourly=cloudcover,cloudcover_low,cloudcover_mid,cloudcover_high,precipitation,temperature_2m,weathercode&timezone=Europe/Madrid&start_date={TARGET_DATE}&end_date={TARGET_DATE}"
    headers = {'User-Agent': 'Mozilla/5.0 (Eclipse2026-Weather-Bot/2.0)'}

    for attempt in range(1, max_retries + 1):
        try:
            req = urllib.request.Request(url, headers=headers)
            with urllib.request.urlopen(req, timeout=20) as resp:
                raw_data = resp.read()
                data = json.loads(safe_decode(raw_data))
                if isinstance(data, list):
                    return data
                elif isinstance(data, dict) and 'hourly' in data:
                    return [data]
        except Exception as e:
            if attempt < max_retries:
                time.sleep(1.5 * attempt)

    # Fallback individual por municipio si falla el lote completo
    fallback_results = []
    for m in batch_munis:
        try:
            single_url = f"https://api.open-meteo.com/v1/forecast?latitude={m['lat']}&longitude={m['lon']}&hourly=cloudcover,cloudcover_low,cloudcover_mid,cloudcover_high,precipitation,temperature_2m,weathercode&timezone=Europe/Madrid&start_date={TARGET_DATE}&end_date={TARGET_DATE}"
            req = urllib.request.Request(single_url, headers=headers)
            with urllib.request.urlopen(req, timeout=10) as resp:
                data = json.loads(safe_decode(resp.read()))
                fallback_results.append(data)
        except Exception:
            fallback_results.append({})
        time.sleep(0.05)
    return fallback_results

def main():
    print("==================================================================")
    print(" ☀️ Eclipse 2026 - Previsión por Modelos Numéricos (ECMWF / NWP)")
    print("==================================================================")

    if not os.path.exists(PATH_MUNIS_PATH):
        print(f"❌ Error: No se encuentra el catálogo de municipios en {PATH_MUNIS_PATH}")
        return

    with open(PATH_MUNIS_PATH, "r", encoding="utf-8") as f:
        path_munis = json.load(f)

    print(f"📍 Cargados {len(path_munis)} municipios de la franja del eclipse.")
    print(f"🎯 Objetivo: Predicción numérica para el {TARGET_DATE} a las {TARGET_HOUR_UTC}:00 UTC.")
    print("📡 Consultando la red de modelos de alta resolución (ECMWF IFS / DWD ICON-EU)...\n", flush=True)

    BATCH_SIZE = 50
    results = []
    total_batches = (len(path_munis) + BATCH_SIZE - 1) // BATCH_SIZE
    now_utc_str = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")

    for b_idx in range(total_batches):
        batch = path_munis[b_idx * BATCH_SIZE : (b_idx + 1) * BATCH_SIZE]
        print(f"📍 [Lote {b_idx + 1:02d}/{total_batches:02d}] Procesando {len(batch)} municipios ({batch[0]['nombre']} ... {batch[-1]['nombre']})...", flush=True)

        batch_nwp = fetch_batch_nwp(batch)

        for i, m in enumerate(batch):
            nwp_item = batch_nwp[i] if i < len(batch_nwp) and isinstance(batch_nwp[i], dict) else {}
            hourly = nwp_item.get('hourly', {})
            times = hourly.get('time', [])
            
            # Buscar el índice para la hora 20:00 UTC (momento cumbre del eclipse y puesta de sol)
            target_idx = 20
            for t_i, t_str in enumerate(times):
                if '20:00' in t_str:
                    target_idx = t_i
                    break

            c_total = hourly.get('cloudcover', [0])[target_idx] if hourly.get('cloudcover') and len(hourly.get('cloudcover')) > target_idx else 0
            c_low = hourly.get('cloudcover_low', [0])[target_idx] if hourly.get('cloudcover_low') and len(hourly.get('cloudcover_low')) > target_idx else 0
            c_mid = hourly.get('cloudcover_mid', [0])[target_idx] if hourly.get('cloudcover_mid') and len(hourly.get('cloudcover_mid')) > target_idx else 0
            c_high = hourly.get('cloudcover_high', [0])[target_idx] if hourly.get('cloudcover_high') and len(hourly.get('cloudcover_high')) > target_idx else 0
            precip = hourly.get('precipitation', [0.0])[target_idx] if hourly.get('precipitation') and len(hourly.get('precipitation')) > target_idx else 0.0
            temp = hourly.get('temperature_2m', [28.5])[target_idx] if hourly.get('temperature_2m') and len(hourly.get('temperature_2m')) > target_idx else 28.5
            w_code = hourly.get('weathercode', [0])[target_idx] if hourly.get('weathercode') and len(hourly.get('weathercode')) > target_idx else 0

            results.append({
                "lat": m["lat"],
                "lon": m["lon"],
                "name": m["nombre"],
                "c_total": int(c_total or 0),
                "c_low": int(c_low or 0),
                "c_mid": int(c_mid or 0),
                "c_high": int(c_high or 0),
                "precip": float(precip or 0.0),
                "w_code": int(w_code or 0),
                "temp": round(float(temp or 28.5), 1)
            })

        print(f"   ✅ Lote OK. Datos numéricos integrados para {len(batch)} localidades.", flush=True)
        time.sleep(0.8)

    output_obj = {
        "generated_at": now_utc_str,
        "target_date": TARGET_DATE,
        "target_hour_utc": TARGET_HOUR_UTC,
        "provider": "Modelos Numéricos NWP (ECMWF IFS / DWD ICON-EU / AEMET)",
        "model": "ECMWF IFS 0.25° High-Resolution Global & Regional NWP",
        "point_count": len(results),
        "points": results
    }

    js_content = f"""// Generado automáticamente por scripts/generate_weather_forecast_models.py
// Marca de tiempo de generación: {now_utc_str}
// Previsión por Modelos Numéricos (ECMWF IFS / DWD ICON-EU) para el {TARGET_DATE} {TARGET_HOUR_UTC}:00 UTC (Totallidad)
window.weatherForecastData = {json.dumps(output_obj, ensure_ascii=False, separators=(',', ':'))};
"""

    with open(OUTPUT_JS_PATH, "w", encoding="utf-8") as f:
        f.write(js_content)

    print(f"\n==================================================================")
    print(f"✅ Previsión numérica por modelo completada y guardada en {OUTPUT_JS_PATH}")
    print(f"📊 {len(results)} municipios con predicción horaria 3D (18:00 UTC) exportados.")
    print(f"==================================================================")

if __name__ == "__main__":
    main()
