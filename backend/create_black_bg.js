const fs = require('fs');
const { createCanvas } = require('canvas');

const canvas = createCanvas(1280, 720);
const ctx = canvas.getContext('2d');

ctx.fillStyle = 'black';
ctx.fillRect(0, 0, 1280, 720);

const buffer = canvas.toBuffer('image/jpeg');
fs.writeFileSync('black_background.jpg', buffer);
console.log('black_background.jpg created successfully.');
