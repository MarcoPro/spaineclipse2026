#!/usr/bin/env python3
"""
Eclipse Solar Total 2026 - Generador de Heatmap de Nubes con GEE
(Google Earth Engine)

Este script lee la franja de totalidad del archivo geojson, genera
una cuadrícula de puntos de alta resolución, y utiliza los servidores de
Google Earth Engine (GEE) para consultar el histórico de nubosidad
del satélite MODIS durante los últimos 10 años (12 de Agosto).

Finalmente exporta los datos a un archivo JavaScript para ser usados
directamente por la aplicación web.
"""

import json
import os
import ee

CONFIG_PATH = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "config.js")
with open(CONFIG_PATH, "r", encoding="utf-8") as f:
    js_content = f.read()
    json_str = js_content.split("=", 1)[1].strip()
    if json_str.endswith(";"):
        json_str = json_str[:-1]
    CONFIG = json.loads(json_str)
    
H_CONF = CONFIG["heatmap"]

GEOJSON_PATH = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "eclipse_2026.geojson")
OUTPUT_JS_PATH = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "cloud_heatmap.js")
STEP = 0.25  # ~0.25 grados de paso (mayor resolución que la versión anterior)

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
    print("Generador de Heatmap de Nubes (GEE MODIS)")
    print("==================================================")

    # 1. Autenticación e Inicialización de Earth Engine
    print("Inicializando Earth Engine...")
    try:
        ee.Initialize()
    except Exception as e:
        error_msg = str(e).lower()
        if "no project found" in error_msg:
            print("\n" + "!"*60)
            print("Earth Engine requiere un ID de Proyecto de Google Cloud.")
            print("Suele ser tu nombre de usuario con 'ee-' delante (ej: ee-miusuario)")
            print("Si no tienes uno, créalo en https://code.earthengine.google.com/register")
            print("!"*60 + "\n")
            
            project_id = input("Por favor, introduce tu ID de Proyecto GEE: ").strip()
            
            try:
                ee.Initialize(project=project_id)
            except Exception as inner_e:
                print("Autenticando con el proyecto...")
                ee.Authenticate()
                ee.Initialize(project=project_id)
        else:
            print("La sesión no está iniciada. Abriendo el navegador para autenticar...")
            print("¡ATENCIÓN! Sigue las instrucciones en tu navegador para obtener el código o iniciar sesión.")
            ee.Authenticate()
            ee.Initialize()

    if not os.path.exists(GEOJSON_PATH):
        print(f"Error: No se encuentra {GEOJSON_PATH}")
        return

    # 2. Cargar el GeoJSON
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

    lons = [p[0] for p in poly_coords]
    lats = [p[1] for p in poly_coords]
    min_lon, max_lon = min(lons), max(lons)
    min_lat, max_lat = min(lats), max(lats)

    print(f"Bounding Box: Lon [{min_lon:.2f}, {max_lon:.2f}] Lat [{min_lat:.2f}, {max_lat:.2f}]")

    # 3. Generar la ROI y pedir datos directamente a GEE (sin Features de Python)
    print("Enviando petición de datos a Google Earth Engine (ERA5)...")
    
    # Creamos la región de interés (ROI) para limitar el procesamiento espacialmente
    roi = ee.Geometry.Polygon(poly_coords)

    # Leemos parámetros desde config.json
    mes = H_CONF["eclipse_month"]
    hora = H_CONF["eclipse_hour_utc"]
    y_start = H_CONF["year_start"]
    y_end = H_CONF["year_end"]
    d_start = H_CONF["day_start"]
    d_end = H_CONF["day_end"]
    scale_m = H_CONF["scale_meters"]

    # CAMBIO IMPORTANTE PARA ESTADÍSTICA Y MEMORIA: 
    # Para tener un mapa robusto libre de anomalías puntuales, pasamos de usar 1 día por año 
    # a usar un rango de días durante N años.
    imagenes_anuales = []
    # Rango de años, le sumamos 1 porque el stop en python range() es exclusivo
    for year in range(y_start, y_end + 1):
        # Formateamos las fechas (añadimos 1 al day_end para hacerlo exclusivo en GEE filterDate)
        start_date = f'{year}-{mes:02d}-{d_start:02d}'
        end_date = f'{year}-{mes:02d}-{(d_end + 1):02d}'
        
        # Extraemos las imágenes para la hora especificada
        col_year = ee.ImageCollection('ECMWF/ERA5/HOURLY') \
                    .filterBounds(roi) \
                    .filterDate(start_date, end_date) \
                    .filter(ee.Filter.calendarRange(hora, hora, 'hour'))
                    
        # TRUCO DE MEMORIA: Promediamos inmediatamente esos días en una sola imagen.
        img_mean = col_year.mean().select(['total_cloud_cover'], [f'y{year}'])
        imagenes_anuales.append(img_mean)
        
    # Calculamos la media global (el promedio de los promedios) a través del mean
    coleccion_para_media = ee.ImageCollection([img.rename('total_cloud_cover') for img in imagenes_anuales])
    probabilidad_historica = coleccion_para_media.mean().rename('accumulated')

    # Creamos una única imagen multi-banda que contiene todos los años + acumulado y CORTAMOS (.clip)
    multi_band_image = ee.Image(imagenes_anuales).addBands(probabilidad_historica).clip(roi)

    # 4. Extraer la cuadrícula de datos directamente de GEE (getRegion)
    print("Descargando cuadrícula de datos desde GEE (puede tardar unos segundos)...")
    
    # getRegion es un método de ImageCollection (no de Image).
    coleccion_temporal = ee.ImageCollection([multi_band_image])
    
    # getRegion extrae todos los píxeles de la imagen que caen dentro del ROI al scale indicado.
    datos_brutos = coleccion_temporal.getRegion(
        geometry=roi,
        scale=scale_m 
    ).getInfo()

    # datos_brutos es una lista de listas: [["id", "longitude", "latitude", "time", "y2008", ..., "accumulated"], [...]]
    if not datos_brutos or len(datos_brutos) < 2:
        print("Error: No se obtuvieron datos de GEE.")
        return

    headers = datos_brutos[0]
    lon_idx = headers.index("longitude")
    lat_idx = headers.index("latitude")
    acc_idx = headers.index("accumulated")
    
    year_indices = {year: headers.index(f"y{year}") for year in range(y_start, y_end + 1) if f"y{year}" in headers}

    results = []
    print("Filtrando puntos para ajustarlos al polígono de la totalidad...")
    
    for row in datos_brutos[1:]:
        val_acc = row[acc_idx]
        
        # Filtramos puntos que tengan datos válidos
        if val_acc is not None:
            lon = row[lon_idx]
            lat = row[lat_idx]
            
            # Comprobación estricta para asegurar que el punto está dentro de la franja (Ray Casting)
            if is_point_in_polygon(lon, lat, poly_coords):
                
                # Diccionario con valores por año
                years_data = {}
                valid_data = True
                
                for year, idx in year_indices.items():
                    val = row[idx]
                    if val is None:
                        valid_data = False
                        break
                    years_data[str(year)] = round(val * 100)
                
                # Si todos los años son válidos, lo incluimos
                if valid_data:
                    results.append({
                        "lat": round(lat, 4),
                        "lon": round(lon, 4),
                        "accumulated": round(val_acc * 100),
                        "years": years_data
                    })

    print(f"Se procesaron {len(results)} puntos válidos de nubosidad dentro de la franja.")

    # 6. Escribir a JavaScript
    js_content = f"// Generado por scripts/generate_cloud_heatmap_gee.py\n" \
                 f"// Promedio histórico de MODIS (GEE) para el 12 Agosto (2014-2024)\n" \
                 f"window.cloudHeatmapData = {json.dumps(results, separators=(',', ':'))};\n"

    with open(OUTPUT_JS_PATH, "w") as f:
        f.write(js_content)
        
    print(f"✅ Guardado exitosamente en {OUTPUT_JS_PATH}")

if __name__ == "__main__":
    main()
