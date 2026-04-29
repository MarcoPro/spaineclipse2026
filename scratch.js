const fs = require('fs');
global.window = {};

const code = fs.readFileSync('besselian_calculator.js', 'utf8');

const lat = 42.3439;
const lon = -3.6969;

const modCode = code.replace(/const L2_CORRECTION = [0-9.-]+;/, `const L2_CORRECTION = 0.00008;`);
eval(modCode);
const res = window.BesselianCalculator.calculateLocalCircumstances(lat, lon, 800);
const dur2 = (res.total_end.time.date - res.total_begin.time.date) / 1000;
console.log(`L2_CORRECTION=0.00008 -> Duration: ${dur2.toFixed(1)}s`);
