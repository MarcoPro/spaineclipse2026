import math

X_COEFFS = [0.47551399, 0.51892489, -0.00007730, -0.00000804]
Y_COEFFS = [0.77118301, -0.23016800, -0.00012460, 0.00000377]
D_COEFFS = [14.79666996, -0.01206500, -0.00000300]
L2_COEFFS = [-0.00814200, 0.00009350, -0.00001210]
MU_COEFFS = [88.74778748, 15.00308990]

T0 = 18.0
DELTA_T = 69.1
MU_CORRECTION = -DELTA_T * MU_COEFFS[1] / 3600.0

FLATTENING = 1.0 / 298.257223563
BA = 1.0 - FLATTENING
E_SQ = 2 * FLATTENING - FLATTENING ** 2

def eval_poly(coeffs, t):
    return sum(c * (t ** i) for i, c in enumerate(coeffs))

def besselian_at(t_tdt):
    t = t_tdt - T0
    return (
        eval_poly(X_COEFFS, t),
        eval_poly(Y_COEFFS, t),
        math.radians(eval_poly(D_COEFFS, t)),
        eval_poly(L2_COEFFS, t),
        eval_poly(MU_COEFFS, t) + MU_CORRECTION,
    )

def fundamental_to_geo(xi, eta, d, mu):
    rho1 = math.sqrt(1.0 - E_SQ * math.cos(d) ** 2)
    sin_d1 = math.sin(d) / rho1
    cos_d1 = BA * math.cos(d) / rho1
    eta1 = eta / rho1
    r_sq = xi ** 2 + eta1 ** 2
    if r_sq >= 1.0: return None
    zeta1 = math.sqrt(1.0 - r_sq)
    sin_phi1 = eta1 * cos_d1 + zeta1 * sin_d1
    phi1 = math.asin(max(-1.0, min(1.0, sin_phi1)))
    A = zeta1 * cos_d1 - eta1 * sin_d1
    H = math.degrees(math.atan2(xi, A))
    lat = math.degrees(math.atan(math.tan(phi1) / BA))
    lon = -(mu - H)
    while lon > 180.0: lon -= 360.0
    while lon < -180.0: lon += 360.0
    return lat, lon

def precompute_edge_at_time(t_tdt, n_base, n_slope, s_base, s_slope):
    x, y, d, l2, mu = besselian_at(t_tdt)
    r_base = abs(l2)
    points = []
    N = 720
    
    t = t_tdt - T0
    corr_n = n_base + n_slope * t
    corr_s = s_base + s_slope * t

    for i in range(N):
        theta = 2.0 * math.pi * i / N
        weight_north = (math.sin(theta) + 1.0) / 2.0
        weight_south = 1.0 - weight_north
        
        l2_corr = corr_n * weight_north + corr_s * weight_south
        
        r = r_base - l2_corr # l2_corr is subtracted because l2 is negative. 
        # Wait, if l2 is negative, abs(l2) = -l2. 
        # In original script: r = abs(l2) and l2 was (original_l2 - l2_corr).
        # abs(original_l2 - l2_corr) = -(original_l2 - l2_corr) = -original_l2 + l2_corr = r_base + l2_corr.
        # So we should ADD l2_corr to r_base!
        r = r_base + l2_corr

        xi = x + r * math.cos(theta)
        eta = y + r * math.sin(theta)
        points.append(fundamental_to_geo(xi, eta, d, mu))
    return points

def test_width(n_base, n_slope, s_base, s_slope, target_lon):
    t_start = 17.0
    t_end = 19.0
    lats = []
    t = t_start
    while t < t_end:
        edges = precompute_edge_at_time(t, n_base, n_slope, s_base, s_slope)
        valid = [pt for pt in edges if pt is not None]
        for i in range(len(valid)):
            j = (i+1)%len(valid)
            a, b = valid[i], valid[j]
            if (a[1] - target_lon) * (b[1] - target_lon) <= 0:
                dlon = b[1] - a[1]
                if abs(dlon) > 1e-5:
                    frac = (target_lon - a[1]) / dlon
                    lats.append(a[0] + frac * (b[0] - a[0]))
        t += 5.0/3600.0
    if not lats: return 0, 0
    return max(lats), min(lats)

print("Original:")
for lon in [-9.0, -3.0, 0.0]:
    n, s = test_width(0.0004, 0, 0.0004, 0, lon)
    print(f"Lon {lon}: N={n:.3f} S={s:.3f}")

print("\nCustom North widening:")
for lon in [-9.0, -3.0, 0.0]:
    n, s = test_width(0.0010, 0, 0.0004, 0, lon)
    print(f"Lon {lon}: N={n:.3f} S={s:.3f}")

