const L2_COEFFS = [-0.008142, 0.0000935, -0.0000121];
let t = 0.5; // somewhere in middle
let l2_base = L2_COEFFS[0] + L2_COEFFS[1]*t + L2_COEFFS[2]*t*t;
console.log("l2_base:", l2_base);

let L2_CORRECTION_WIDER = 0.0004; // The original
let l2_wider = l2_base - L2_CORRECTION_WIDER;
console.log("l2_wider:", l2_wider, "abs:", Math.abs(l2_wider));

let L2_CORRECTION_TIGHT = 0.00005; // The new one for times
let l2_tight = l2_base - L2_CORRECTION_TIGHT;
console.log("l2_tight:", l2_tight, "abs:", Math.abs(l2_tight));
