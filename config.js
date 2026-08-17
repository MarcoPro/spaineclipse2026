window.EclipseConfig = {
  // ─── Identidad del Eclipse ───
  "id": "2027-aug-02",
  "year": 2027,
  "name": "Eclipse Solar España 2027",
  "short_name": "Eclipse 2027",
  "tagline": "Eclipse solar total del 2 de Agosto de 2027 en España",
  "description": "Mapa interactivo de alta precisión para el eclipse solar total del 2 de agosto de 2027 en España.",
  "date_display": "2 de Agosto de 2027",
  "date_iso": "2027-08-02",
  "github_repo": "https://github.com/marcopro/spaineclipse2027/",
  "canonical_url": "https://marcopro.github.io/spaineclipse2027/",
  "og_image": "images/eclipse_2027.jpg",

  // ─── Versión ───
  "version": "3.0.0",
  "version_date": "2026-08-17",

  // ─── Cronología (UTC) ───
  "peak_utc": "2027-08-02T10:07:50Z",
  "timezone": "Europe/Madrid",
  "timezone_offset_hours": 2,
  "timezone_label": "CEST",

  // ─── Elementos Besselianos (Espenak/NASA + Jubier ΔT) ───
  "besselian": {
    "eclipse_date": "2027-08-02",
    "T0": 10.0,
    "DELTA_T": 69.3,
    "X_COEFFS": [-0.0197720, 0.5447123, -0.0000446, -0.0000092],
    "Y_COEFFS": [0.1600610, -0.2111582, -0.0001217, 0.0000038],
    "D_COEFFS": [17.7624702, -0.0101810, -0.0000040],
    "L1_COEFFS": [0.5305960, 0.0000138, -0.0000128],
    "L2_COEFFS": [-0.0154640, 0.0000137, -0.0000128],
    "MU_COEFFS": [328.422546, 15.002100],
    "TAN_F1": 0.0046064,
    "TAN_F2": 0.0045834,
    "GAMMA": 0.1421,
    "MAGNITUDE": 1.0790,
    "limb_correction": {
      "north": { "base": 0.0, "slope": 0.0, "quad": 0.0 },
      "south": { "base": 0.0, "slope": 0.0, "quad": 0.0 },
      "frontend": { "base": 0.0, "slope": 0.0 }
    }
  },

  // ─── Geometría Solar/Lunar ───
  "solar_lunar": {
    "parallactic_angle_deg": 35,
    "contact_v_deg": 0,
    "moon_ratio": 1.0790,
    "mean_solar_r": 959.63,
    "sun_angular_size_rad": 0.00925
  },

  // ─── Perfil de Limbo Lunar (EclipseWise/JPL DE405) ───
  "lunar_limb": {
    "libration": { "l": 0.5, "b": -0.2, "c": 14.0 },
    "eclipse_timestamp": "2027-08-02T10:07:50Z",
    "mean_radius_arcsec": 0.0,
    "profile_data": []
  },

  // ─── Contactos por defecto (fallback para la ubicación de referencia) ───
  "default_contacts": {
    "is_totality": true,
    "c1_utc": "2027-08-02T08:30:00Z",
    "c2_utc": "2027-08-02T10:05:00Z",
    "max_utc": "2027-08-02T10:07:50Z",
    "c3_utc": "2027-08-02T10:12:00Z",
    "c4_utc": "2027-08-02T11:40:00Z"
  },

  // ─── Ubicación por defecto ───
  "default_location": {
    "name": "Tarifa",
    "lat": 36.0143,
    "lng": -5.6044,
    "alt": 0,
    "az": 0
  },

  // ─── Centro del mapa ───
  "map": {
    "center": [36.75, -5.0],
    "zoom": 8,
    "geocoding_bbox": "-7.5,34.5,0.0,38.5"
  },

  // ─── Heatmap de Nubes ───
  "heatmap": {
    "eclipse_month": 8,
    "eclipse_day": 2,
    "eclipse_hour_utc": 10,
    "year_start": 2008,
    "year_end": 2026,
    "day_start": 1,
    "day_end": 4,
    "scale_meters": 15000
  },

  // ─── Topografía ───
  "topography": {
    "dataset": "CGIAR/SRTM90_V4",
    "band": "elevation",
    "scale_meters": 1100,
    "api_endpoint": "https://api.open-meteo.com/v1/elevation"
  },

  // ─── Scoring del observador ───
  "scoring": {
    "max_duration_sec": 290,
    "max_sun_altitude_deg": 50.0,
    "compass_directions": ["N","NNE","NE","ENE","E","ESE","SE","SSE","S","SSO","SO","OSO","O","ONO","NO","NNO"]
  },

  // ─── Textos dinámicos (UI) ───
  "ui_strings": {
    "title": "Eclipse Solar España 2027",
    "hero_text": "El <strong>2 de Agosto de 2027</strong>, el sur de España será testigo de un eclipse solar total. La sombra de la luna oscurecerá Cádiz, Málaga y el Estrecho de Gibraltar por la mañana.",
    "shadow_time_default": "10:07 UTC",
    "weather_label": "Previsión numérico-climática en vivo (2 Ago 10:00 UTC)",
    "card_title": "ESPAÑA — 2 DE AGOSTO DE 2027",
    "card_footer": "Generado por Eclipse Solar España 2027 — Proyecto de Divulgación Astronómica",
    "card_filename": "Pase_Observacion_Eclipse_2027.png",
    "pwa_label": "App Eclipse Solar España 2027 cargada en modo offline PWA"
  },

  // ─── Meteorología: control de características ───
  // forecast_enabled: poner a true cuando se genere weather_forecast_data.js (días antes del eclipse)
  // default_mode: 'historical' = solo datos climáticos | 'forecast' = previsión NWP activa
  "weather": {
    "forecast_enabled": false,
    "default_mode": "historical"
  }
};
