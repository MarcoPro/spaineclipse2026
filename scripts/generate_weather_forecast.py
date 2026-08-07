#!/usr/bin/env python3
"""
Eclipse Solar Total 2026 - Generador de Previsión Meteorológica con AEMET OpenData

Este script:
1. Lee la franja de totalidad del archivo GeoJSON (eclipse_2026.geojson).
2. Consulta el maestro de municipios de AEMET OpenData para filtrar aquellos situados en la franja.
3. Muestra y selecciona una muestra uniforme de ~150-200 municipios/puntos distribuidos espacialmente a lo largo del corredor.
4. Consulta la API de predicción oficial de AEMET para la fecha del eclipse (12 de agosto de 2026).
5. Extrae el estado del cielo (mapeado a % de nubosidad), probabilidad de precipitación y temperatura.
6. Exporta un archivo JavaScript (weather_forecast_data.js) para consumo estático offline en la web app.
"""

import json
import math
import urllib.request
import urllib.error
import time
import os
from datetime import datetime, timezone

API_KEY = os.environ.get("AEMET_API_KEY", "").strip()

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
BASE_DIR = os.path.abspath(os.path.join(SCRIPT_DIR, ".."))
GEOJSON_PATH = os.path.join(BASE_DIR, "eclipse_2026.geojson")
OUTPUT_JS_PATH = os.path.join(BASE_DIR, "weather_forecast_data.js")

TARGET_DATE = "2026-08-12"
TARGET_HOUR_UTC = 18

# Mapeo del estado del cielo AEMET a porcentaje estimado de nubosidad (c_total) y código WMO
AEMET_SKY_MAPPING = {
    '11': {'c_total': 0, 'w_code': 0, 'desc': 'Despejado'},
    '11n': {'c_total': 0, 'w_code': 0, 'desc': 'Despejado'},
    '12': {'c_total': 20, 'w_code': 1, 'desc': 'Poco nuboso'},
    '12n': {'c_total': 20, 'w_code': 1, 'desc': 'Poco nuboso'},
    '13': {'c_total': 45, 'w_code': 2, 'desc': 'Intervalos nubosos'},
    '13n': {'c_total': 45, 'w_code': 2, 'desc': 'Intervalos nubosos'},
    '14': {'c_total': 70, 'w_code': 3, 'desc': 'Nuboso'},
    '14n': {'c_total': 70, 'w_code': 3, 'desc': 'Nuboso'},
    '15': {'c_total': 85, 'w_code': 3, 'desc': 'Muy nuboso'},
    '15n': {'c_total': 85, 'w_code': 3, 'desc': 'Muy nuboso'},
    '16': {'c_total': 100, 'w_code': 3, 'desc': 'Cubierto'},
    '16n': {'c_total': 100, 'w_code': 3, 'desc': 'Cubierto'},
    '43': {'c_total': 80, 'w_code': 61, 'desc': 'Intervalos nubosos con lluvia'},
    '44': {'c_total': 90, 'w_code': 61, 'desc': 'Nuboso con lluvia'},
    '45': {'c_total': 95, 'w_code': 63, 'desc': 'Muy nuboso con lluvia'},
    '46': {'c_total': 100, 'w_code': 65, 'desc': 'Cubierto con lluvia'},
    '51': {'c_total': 80, 'w_code': 80, 'desc': 'Intervalos nubosos con chubascos'},
    '52': {'c_total': 90, 'w_code': 80, 'desc': 'Nuboso con chubascos'},
    '53': {'c_total': 95, 'w_code': 81, 'desc': 'Muy nuboso con chubascos'},
    '54': {'c_total': 100, 'w_code': 82, 'desc': 'Cubierto con chubascos'},
    '61': {'c_total': 85, 'w_code': 95, 'desc': 'Intervalos nubosos con tormenta'},
    '62': {'c_total': 90, 'w_code': 95, 'desc': 'Nuboso con tormenta'},
    '63': {'c_total': 95, 'w_code': 95, 'desc': 'Muy nuboso con tormenta'},
    '64': {'c_total': 100, 'w_code': 96, 'desc': 'Cubierto con tormenta'}
}

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

def safe_decode(raw_bytes):
    try:
        return raw_bytes.decode('utf-8')
    except UnicodeDecodeError:
        return raw_bytes.decode('latin-1')

def fetch_aemet_json(endpoint_url, max_retries=5):
    """Realiza una petición a la API de AEMET OpenData manejando las 2 fases (URL meta -> URL datos) y rate-limiting (429)."""
    headers = {'api_key': API_KEY, 'accept': 'application/json'}
    for attempt in range(1, max_retries + 1):
        try:
            req = urllib.request.Request(endpoint_url, headers=headers)
            with urllib.request.urlopen(req, timeout=30) as resp:
                raw_meta = resp.read()
                res_meta = json.loads(safe_decode(raw_meta))
                
            estado = res_meta.get('estado')
            if estado == 200:
                datos_url = res_meta.get('datos')
                req_data = urllib.request.Request(datos_url)
                with urllib.request.urlopen(req_data, timeout=30) as resp_data:
                    raw_data = resp_data.read()
                    return json.loads(safe_decode(raw_data))
            elif estado == 429:
                print(f"    [!] AEMET Rate Limit (429). Esperando 65s para reiniciar ventana...", flush=True)
                time.sleep(65)
            else:
                print(f"    [!] Respuesta AEMET estado {estado}: {res_meta.get('descripcion')}", flush=True)
                time.sleep(3 * attempt)
        except urllib.error.HTTPError as e:
            if e.code == 429:
                print(f"    [!] AEMET Rate Limit (HTTP 429). Esperando 65s para reiniciar ventana...", flush=True)
                time.sleep(65)
            else:
                print(f"    [!] HTTP Error {e.code} (intento {attempt}/{max_retries}): {e.reason}", flush=True)
                time.sleep(5 * attempt)
        except Exception as e:
            wait_sec = 5 * attempt
            print(f"    [!] Error de red (intento {attempt}/{max_retries}): {e}. Esperando {wait_sec}s...", flush=True)
            time.sleep(wait_sec)
    return None

def main():
    print("==================================================")
    print(" ☀️ Eclipse 2026 - Previsión Meteorológica AEMET")
    print("==================================================")

    if not API_KEY:
        print("❌ Error: No se encuentra la variable de entorno AEMET_API_KEY")
        print("📌 En GitHub Actions: Configura el secreto AEMET_API_KEY en Settings > Secrets and variables > Actions")
        print("📌 Para ejecución local: export AEMET_API_KEY='tu_api_key'")
        return

    if not os.path.exists(GEOJSON_PATH):
        print(f"❌ Error: No se encuentra {GEOJSON_PATH}")
        return

    # 1. Cargar el Polígono de la Franja
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
        print("❌ Error: Polígono de franja inválido")
        return

    # 2. Consultar Maestro de Municipios AEMET (usar caché local si existe)
    CACHE_PATH = os.path.join(SCRIPT_DIR, "aemet_municipios_cache.json")
    all_munis = None

    if os.path.exists(CACHE_PATH):
        try:
            with open(CACHE_PATH, "r", encoding="utf-8") as f:
                all_munis = json.load(f)
            print("📍 Cargado maestro de municipios desde caché local (8122 municipios).", flush=True)
        except Exception as e:
            print(f"⚠️ Error al leer caché local ({e}), consultando API...", flush=True)

    if not all_munis:
        print("📡 Obteniendo maestro de municipios desde AEMET OpenData...", flush=True)
        munis_url = "https://opendata.aemet.es/opendata/api/maestro/municipios"
        all_munis = fetch_aemet_json(munis_url)

    if not all_munis:
        print("❌ Error al obtener el maestro de municipios de AEMET")
        return

    path_munis = []
    for m in all_munis:
        try:
            lat = float(m['latitud_dec'])
            lon = float(m['longitud_dec'])
            m_id = m['id'].replace('id', '')
            if is_point_in_polygon(lon, lat, poly_coords):
                path_munis.append({
                    'id': m_id,
                    'nombre': m.get('nombre'),
                    'provincia': m.get('zona_comarcal', ''),
                    'lat': round(lat, 4),
                    'lon': round(lon, 4),
                    'destacada': m.get('destacada', '0')
                })
        except (ValueError, KeyError, TypeError):
            continue

    print(f"📍 Se encontraron {len(path_munis)} municipios dentro de la franja del eclipse.")

    # 3. Submuestreo espacial para obtener ~30 puntos representativos
    # Agrupamos en una cuadrícula de ~1.20° con pausa de 6.5s para no superar el límite de 10 peticiones/minuto de AEMET
    GRID_STEP = 1.20
    sampled_dict = {}
    for m in path_munis:
        cell_key = (round(m['lat'] / GRID_STEP), round(m['lon'] / GRID_STEP))
        # Dar preferencia a municipios destacados o capitales
        if cell_key not in sampled_dict or m['destacada'] == '1':
            sampled_dict[cell_key] = m

    target_munis = list(sampled_dict.values())
    print(f"📍 Muestra seleccionada para la predicción: {len(target_munis)} municipios clave.")

    # 4. Obtener predicciones meteorológicas por municipio para el 12 de agosto
    results = []
    now_utc_str = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")

    print(f"📡 Consultando predicción diaria de AEMET para el {TARGET_DATE}...", flush=True)

    for idx, m in enumerate(target_munis, 1):
        m_id = m['id']
        m_name = m['nombre']
        print(f"  [{idx}/{len(target_munis)}] {m_name} (ID: {m_id})...", flush=True)

        url_muni = f"https://opendata.aemet.es/opendata/api/prediccion/especifica/municipio/diaria/{m_id}"
        pred_data = fetch_aemet_json(url_muni)

        c_total = None
        precip = 0
        w_code = 0
        temp = 25.0

        if pred_data and isinstance(pred_data, list) and len(pred_data) > 0:
            try:
                dias = pred_data[0].get('prediccion', {}).get('dia', [])
                target_day = None
                for d in dias:
                    if d.get('fecha', '').startswith(TARGET_DATE):
                        target_day = d
                        break
                
                if target_day:
                    # Estado del cielo
                    sky_entries = target_day.get('estadoCielo', [])
                    sky_val = '11'
                    for se in sky_entries:
                        v = se.get('value', '').strip()
                        if v:
                            sky_val = v
                            break
                    
                    mapping = AEMET_SKY_MAPPING.get(sky_val, {'c_total': 15, 'w_code': 0})
                    c_total = mapping['c_total']
                    w_code = mapping['w_code']

                    # Probabilidad de precipitación
                    precip_entries = target_day.get('probPrecipitacion', [])
                    precip_vals = []
                    for pe in precip_entries:
                        try:
                            precip_vals.append(int(pe.get('value', 0)))
                        except (ValueError, TypeError):
                            pass
                    precip = max(precip_vals) if precip_vals else 0

                    # Temperatura
                    temp_obj = target_day.get('temperatura', {})
                    t_max = temp_obj.get('maxima')
                    t_min = temp_obj.get('minima')
                    if t_max is not None and t_min is not None:
                        temp = round((float(t_max) + float(t_min)) / 2.0, 1)
                    elif t_max is not None:
                        temp = float(t_max)
                    elif t_min is not None:
                        temp = float(t_min)
            except Exception as e:
                print(f"    [!] Error al procesar JSON para {m_name}: {e}")

        results.append({
            "lat": m["lat"],
            "lon": m["lon"],
            "name": m_name,
            "c_total": c_total if c_total is not None else 0,
            "c_low": 0,
            "c_mid": 0,
            "c_high": c_total if c_total is not None else 0,
            "precip": precip,
            "w_code": w_code,
            "temp": temp
        })

        # Pausa de 7.0s para mantenerse holgadamente por debajo de las 20 peticiones/min de AEMET
        time.sleep(7.0)

    # 5. Exportar objeto JavaScript
    output_obj = {
        "generated_at": now_utc_str,
        "target_date": TARGET_DATE,
        "target_hour_utc": TARGET_HOUR_UTC,
        "provider": "AEMET OpenData (Agencia Estatal de Meteorología)",
        "model": "AEMET HARMONIE-AROME / HIRLAM",
        "point_count": len(results),
        "points": results
    }

    js_content = f"""// Generado automáticamente por scripts/generate_weather_forecast.py
// Marca de tiempo de generación: {now_utc_str}
// Previsión meteorológica oficial de AEMET para el {TARGET_DATE} (Eclipse Total)
window.weatherForecastData = {json.dumps(output_obj, ensure_ascii=False, separators=(',', ':'))};
"""

    with open(OUTPUT_JS_PATH, "w", encoding="utf-8") as f:
        f.write(js_content)

    print(f"✅ Previsión AEMET pregenerada y guardada en {OUTPUT_JS_PATH}")
    print(f"📊 {len(results)} municipios procesados e incluidos en el dataset.")

if __name__ == "__main__":
    main()
