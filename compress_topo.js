const fs = require('fs');

const fileContent = fs.readFileSync('topography_data.js', 'utf8');
const jsonStr = fileContent.replace('const topographyData = ', '').replace(';\n', '').replace(';', '');

try {
    const data = JSON.parse(jsonStr);
    const newData = data.map(pt => {
        if (Array.isArray(pt)) return pt;
        return [pt.lat, pt.lng, pt.alt];
    });
    
    fs.writeFileSync('topography_data.js', 'const topographyData = ' + JSON.stringify(newData) + ';\n');
    console.log('Successfully compressed topography_data.js');
} catch (e) {
    console.error('Error parsing JSON:', e);
}
