window.EclipseConfig = {
  "besselian": {
    "eclipse_date": "2026-08-12",
    "T0": 18.0,
    "DELTA_T": 69.1,
    "X_COEFFS": [
      0.47551399,
      0.51892489,
      -7.73e-05,
      -8.04e-06
    ],
    "Y_COEFFS": [
      0.77118301,
      -0.230168,
      -0.0001246,
      3.77e-06
    ],
    "D_COEFFS": [
      14.79666996,
      -0.012065,
      -3e-06
    ],
    "L1_COEFFS": [
      0.53795499,
      9.39e-05,
      -1.21e-05
    ],
    "L2_COEFFS": [
      -0.008142,
      9.35e-05,
      -1.21e-05
    ],
    "MU_COEFFS": [
      88.74778748,
      15.0030899
    ],
    "limb_correction": {
      "north": {
        "base": 0.00265,
        "slope": -0.0030,
        "quad": -0.0029
      },
      "south": {
        "base": 0.0029,
        "slope": -0.0026,
        "quad": -0.0027
      },
      "frontend": {
        "base": 0.00011,
        "slope": -0.00015
      }
    }
  },
  "heatmap": {
    "eclipse_month": 8,
    "eclipse_hour_utc": 18,
    "year_start": 2008,
    "year_end": 2024,
    "day_start": 5,
    "day_end": 15,
    "scale_meters": 15000
  },
  "topography": {
    "dataset": "CGIAR/SRTM90_V4",
    "band": "elevation",
    "scale_meters": 5000,
    "api_endpoint": "https://api.open-meteo.com/v1/elevation"
  }
};
