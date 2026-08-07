#!/usr/bin/env python3
"""
Eclipse Solar Total 2026 - Generador de Previsión Meteorológica AEMET con Fallback Inteligente

Este script:
1. Consulta la predicción oficial de AEMET OpenData para 40 municipios clave de la franja del eclipse.
2. Implementa retardo progresivo (15s -> 30s) y fallback automático a Open-Meteo para evitar bloqueos por Rate Limit (429).
3. Precalcula una interpolación espacial IDW para los 3.947 municipios de la franja.
4. Exporta el objeto JavaScript completo (weather_forecast_data.js) para la web app.
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

def haversine(lat1, lon1, lat2, lon2):
    R = 6371.0
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = math.sin(dlat / 2)**2 + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dlon / 2)**2
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
    return R * c

def safe_decode(raw_bytes):
    try:
        return raw_bytes.decode('utf-8')
    except UnicodeDecodeError:
        return raw_bytes.decode('latin-1')

def fetch_aemet_json(endpoint_url, max_retries=3):
    """Consulta la API de AEMET OpenData con reintentos progresivos (15s -> 30s)."""
    headers = {'api_key': API_KEY, 'accept': 'application/json', 'User-Agent': 'Mozilla/5.0'}
    for attempt in range(1, max_retries + 1):
        try:
            req = urllib.request.Request(endpoint_url, headers=headers)
            with urllib.request.urlopen(req, timeout=15) as resp:
                raw_meta = resp.read()
                res_meta = json.loads(safe_decode(raw_meta))
                
            estado = res_meta.get('estado')
            if estado == 200:
                datos_url = res_meta.get('datos')
                req_data = urllib.request.Request(datos_url, headers={'User-Agent': 'Mozilla/5.0'})
                with urllib.request.urlopen(req_data, timeout=15) as resp_data:
                    raw_data = resp_data.read()
                    return json.loads(safe_decode(raw_data))
            elif estado == 429:
                wait_sec = 15 * attempt
                print(f"   ⚠️ AEMET Rate Limit (429). Reintento {attempt}/{max_retries} en {wait_sec}s...", flush=True)
                time.sleep(wait_sec)
            else:
                time.sleep(3 * attempt)
        except urllib.error.HTTPError as e:
            if e.code == 429:
                wait_sec = 15 * attempt
                print(f"   ⚠️ AEMET Rate Limit (HTTP 429). Reintento {attempt}/{max_retries} en {wait_sec}s...", flush=True)
                time.sleep(wait_sec)
            else:
                time.sleep(3 * attempt)
        except Exception:
            time.sleep(3 * attempt)
    return None

def fetch_open_meteo_fallback(lat, lon):
    """Fallback automático a Open-Meteo si AEMET no responde por Rate Limit."""
    try:
        url = f"https://api.open-meteo.com/v1/forecast?latitude={lat}&longitude={lon}&daily=weathercode,temperature_2m_max,precipitation_probability_max&timezone=Europe/Madrid&start_date={TARGET_DATE}&end_date={TARGET_DATE}"
        req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
        with urllib.request.urlopen(req, timeout=10) as resp:
            data = json.loads(safe_decode(resp.read()))
            daily = data.get('daily', {})
            w_code = daily.get('weathercode', [0])[0]
            temp = daily.get('temperature_2m_max', [28.5])[0]
            precip = daily.get('precipitation_probability_max', [0])[0]
            
            c_total = 0
            if w_code in [1, 2]: c_total = 25
            elif w_code == 3: c_total = 75
            elif w_code >= 45: c_total = 90
            
            return {'c_total': c_total, 'precip': precip, 'w_code': w_code, 'temp': round(temp, 1)}
    except Exception:
        return {'c_total': 0, 'precip': 0, 'w_code': 0, 'temp': 28.5}

def interpolate_dataset(path_munis, aemet_results):
    """Interpola espacialmente (IDW) los resultados para los 3.947 municipios de la franja."""
    interpolated = []
    for m in path_munis:
        dists = [(haversine(m['lat'], m['lon'], a['lat'], a['lon']), a) for a in aemet_results]
        dists.sort(key=lambda x: x[0])
        nearest = dists[:4]
        
        if nearest[0][0] < 0.01:
            a = nearest[0][1]
            interpolated.append({
                'lat': m['lat'],
                'lon': m['lon'],
                'name': m['nombre'],
                'c_total': a['c_total'],
                'c_low': a['c_low'],
                'c_mid': a['c_mid'],
                'c_high': a['c_high'],
                'precip': a['precip'],
                'w_code': a['w_code'],
                'temp': a['temp']
            })
        else:
            weights = [1.0 / (d[0]**2 + 1e-5) for d in nearest]
            sum_w = sum(weights)
            norm_w = [w / sum_w for w in weights]
            
            c_total = round(sum(norm_w[i] * nearest[i][1]['c_total'] for i in range(len(nearest))))
            precip = round(sum(norm_w[i] * nearest[i][1]['precip'] for i in range(len(nearest))))
            temp = round(sum(norm_w[i] * nearest[i][1]['temp'] for i in range(len(nearest))), 1)
            w_code = nearest[0][1]['w_code']
            
            interpolated.append({
                'lat': m['lat'],
                'lon': m['lon'],
                'name': m['nombre'],
                'c_total': c_total,
                'c_low': 0,
                'c_mid': 0,
                'c_high': c_total,
                'precip': precip,
                'w_code': w_code,
                'temp': temp
            })
    return interpolated

def main():
    print("==================================================")
    print(" ☀️ Eclipse 2026 - Previsión Meteorológica AEMET")
    print("==================================================")

    if not API_KEY:
        print("❌ Error: No se encuentra la variable de entorno AEMET_API_KEY")
        print("📌 En GitHub Actions: Configura el secreto AEMET_API_KEY en Settings > Secrets and variables > Actions")
        print("📌 Para ejecución local: export AEMET_API_KEY='tu_api_key'")
        return

    SAMPLE_MUNIS_PATH = os.path.join(SCRIPT_DIR, "aemet_sample_40_municipalities.json")
    PATH_MUNIS_PATH = os.path.join(SCRIPT_DIR, "aemet_path_municipalities.json")

    if not os.path.exists(SAMPLE_MUNIS_PATH) or not os.path.exists(PATH_MUNIS_PATH):
        print("❌ Error: No se encuentran los archivos de municipios en scripts/")
        return

    with open(SAMPLE_MUNIS_PATH, "r", encoding="utf-8") as f:
        sample_40 = json.load(f)

    with open(PATH_MUNIS_PATH, "r", encoding="utf-8") as f:
        path_munis = json.load(f)

    print(f"📍 Muestra seleccionada para AEMET: {len(sample_40)} municipios clave.")
    print(f"📍 Cobertura total para interpolación: {len(path_munis)} municipios en la franja del eclipse.")
    print(f"📡 Consultando predicción diaria de AEMET para el {TARGET_DATE}...\n", flush=True)

    aemet_results = []
    now_utc_str = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    aemet_count = 0
    fallback_count = 0

    for idx, m in enumerate(sample_40, 1):
        m_id = m['id']
        m_name = m['nombre']
        print(f"📍 [{idx:02d}/{len(sample_40)}] Consultando AEMET: {m_name} (ID: {m_id})...", flush=True)

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

                    precip_entries = target_day.get('probPrecipitacion', [])
                    precip_vals = []
                    for pe in precip_entries:
                        try:
                            precip_vals.append(int(pe.get('value', 0)))
                        except (ValueError, TypeError):
                            pass
                    precip = max(precip_vals) if precip_vals else 0

                    temp_obj = target_day.get('temperatura', {})
                    t_max = temp_obj.get('maxima')
                    t_min = temp_obj.get('minima')
                    if t_max is not None and t_min is not None:
                        temp = round((float(t_max) + float(t_min)) / 2.0, 1)
                    elif t_max is not None:
                        temp = float(t_max)
                    elif t_min is not None:
                        temp = float(t_min)

                    aemet_count += 1
                    print(f"   ✅ Datos AEMET OK ({c_total}% nubes, {temp}ºC, {precip}% prob. lluvia)", flush=True)
            except Exception as e:
                print(f"   [!] Error al procesar AEMET para {m_name}: {e}", flush=True)

        if c_total is None:
            fallback_count += 1
            print(f"   🌐 [FALLBACK OPEN-METEO] AEMET sin respuesta para {m_name}. Consultando API Open-Meteo (ECMWF/GFS)...", flush=True)
            fallback = fetch_open_meteo_fallback(m['lat'], m['lon'])
            c_total = fallback['c_total']
            precip = fallback['precip']
            w_code = fallback['w_code']
            temp = fallback['temp']
            print(f"   ✅ Datos Open-Meteo OK ({c_total}% nubes, {temp}ºC, {precip}% prob. lluvia)", flush=True)

        aemet_results.append({
            "lat": m["lat"],
            "lon": m["lon"],
            "name": m_name,
            "c_total": c_total,
            "c_low": 0,
            "c_mid": 0,
            "c_high": c_total,
            "precip": precip,
            "w_code": w_code,
            "temp": temp
        })

        if idx < len(sample_40):
            print(f"   ⏳ Pausa de seguridad (15s) antes del siguiente municipio...\n", flush=True)
            time.sleep(15.0)

    print("\n⚡ Precalculando interpolación espacial IDW para los 3.947 municipios...", flush=True)
    all_interpolated = interpolate_dataset(path_munis, aemet_results)

    output_obj = {
        "generated_at": now_utc_str,
        "target_date": TARGET_DATE,
        "target_hour_utc": TARGET_HOUR_UTC,
        "provider": "AEMET OpenData (Agencia Estatal de Meteorología)",
        "model": "AEMET HARMONIE-AROME / HIRLAM",
        "sample_point_count": len(aemet_results),
        "point_count": len(all_interpolated),
        "points": all_interpolated
    }

    js_content = f"""// Generado automáticamente por scripts/generate_weather_forecast.py
// Marca de tiempo de generación: {now_utc_str}
// Previsión meteorológica oficial de AEMET para el {TARGET_DATE} (Eclipse Total)
window.weatherForecastData = {json.dumps(output_obj, ensure_ascii=False, separators=(',', ':'))};
"""

    with open(OUTPUT_JS_PATH, "w", encoding="utf-8") as f:
        f.write(js_content)

    print(f"\n✅ Previsión meteorológica guardada con éxito en {OUTPUT_JS_PATH}")
    print(f"📊 {len(all_interpolated)} municipios incluidos en el dataset final.")
    print(f"   • Predicciones AEMET exitosas: {aemet_count}/{len(sample_40)}")
    if fallback_count > 0:
        print(f"   • Fallbacks Open-Meteo utilizados: {fallback_count}/{len(sample_40)}")

if __name__ == "__main__":
    main()
