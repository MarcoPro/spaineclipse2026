#!/usr/bin/env python3
"""
Eclipse Solar Total 2026 - Generador de Topografía con GEE
(Google Earth Engine)

Este script lee la franja de totalidad del archivo geojson y
utiliza Google Earth Engine para descargar el mapa de elevación
(SRTM) de la zona del eclipse.
Exporta los datos a un archivo JavaScript para uso offline en la web.
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
    
T_CONF = CONFIG["topography"]

GEOJSON_PATH = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "eclipse_2026.geojson")
OUTPUT_JS_PATH = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "topography_data.js")

def main():
    print("==================================================")
    print("Generador de Topografía (GEE DEM)")
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

    # 2. Cargar el polígono de la franja de totalidad
    print("Cargando polígono de la franja del eclipse...")
    if not os.path.exists(GEOJSON_PATH):
        print(f"ERROR: No se encuentra {GEOJSON_PATH}. Ejecuta primero generate_eclipse_geojson.py")
        return

    with open(GEOJSON_PATH, "r") as f:
        geojson_data = json.load(f)

    franja_polygon = None
    for feature in geojson_data.get("features", []):
        if feature.get("geometry", {}).get("type") == "Polygon":
            franja_polygon = feature["geometry"]["coordinates"][0]
            break

    if not franja_polygon:
        print("ERROR: No se encontró un polígono en el archivo GeoJSON.")
        return

    # Convertimos a coordenadas ee
    poly_coords = []
    for coord in franja_polygon:
        poly_coords.append([coord[0], coord[1]])

    # 3. Generar la ROI y pedir datos a GEE
    print(f"Enviando petición de datos a GEE usando {T_CONF['dataset']}...")
    roi = ee.Geometry.Polygon(poly_coords)

    # Cargamos el modelo digital de elevación
    dem = ee.Image(T_CONF["dataset"]).select(T_CONF["band"])

    # Recortamos a la región de interés
    dem_clipped = dem.clip(roi)

    # 4. Extraer la cuadrícula de datos directamente de GEE (getRegion)
    print("Descargando cuadrícula de altitud desde GEE (puede tardar unos segundos)...")
    
    # getRegion requiere una colección
    coleccion_temporal = ee.ImageCollection([dem_clipped])
    
    datos_brutos = coleccion_temporal.getRegion(
        geometry=roi,
        scale=T_CONF["scale_meters"] 
    ).getInfo()

    # datos_brutos es una lista de listas: [["id", "longitude", "latitude", "time", "elevation"], [...]]
    headers = datos_brutos[0]
    
    idx_lon = headers.index('longitude')
    idx_lat = headers.index('latitude')
    idx_elev = headers.index(T_CONF["band"])
    
    print(f"Procesando {len(datos_brutos) - 1} puntos topográficos...")

    puntos_json = []
    
    # Procesar filas omitiendo el header
    for row in datos_brutos[1:]:
        lon = row[idx_lon]
        lat = row[idx_lat]
        elev = row[idx_elev]
        
        if elev is None or elev <= 0: # Ignoramos el mar o valores faltantes
            continue
            
        puntos_json.append({
            "lat": round(lat, 4),
            "lng": round(lon, 4),
            "alt": round(elev)
        })

    print(f"Puntos topográficos terrestres finales: {len(puntos_json)}")

    # 6. Exportar a JavaScript
    print("Exportando a JavaScript...")
    with open(OUTPUT_JS_PATH, "w") as f:
        f.write("const topographyData = ")
        json.dump(puntos_json, f, separators=(',', ':')) # Minificado
        f.write(";\n")

    print(f"✅ ¡Topografía exportada con éxito! Archivo: {OUTPUT_JS_PATH}")

if __name__ == "__main__":
    main()
