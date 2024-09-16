/***
* 3D Earth tomo viewer - project to visualize global seismic models
*
* Copyright (c) 2024 Daniel Peter
* MIT License - https://opensource.org/license/mit
***/

// vectorField
//
// vector field example
//

import * as contours from "./contours.js"; // contours
import * as streamlines from "./streamlines.js";
import * as particles from "./particles.js";

// drawing
const ADD_VECTORFIELD = true;

// contouring
const ADD_CONTOURS = true;

// streamlines
const ADD_STREAMLINES = false;

let scalarData = null; // scalar from image gray scale values
let vectorData = null; // computed gradient vector
let scalarMapWidth = 0, scalarMapHeight = 0;

// models
// note: image grayscale such that faster is brigther, slower is darker
const models = [
    { name: 'Earth',       depth: 'surface',       path: '' },
    { name: 'SGLOBE-rani', depth: 'depth 150 km',  path: './data/sglobe-rani_150.jpg' },
    { name: 'S40RTS',      depth: 'depth 150 km',  path: './data/s40rts_150.jpg' },
    { name: 'SAVANI',      depth: 'depth 150 km',  path: './data/savani_150.jpg' },
    { name: 'SPani-S',     depth: 'depth 150 km',  path: './data/spani-s_150.jpg' },
    { name: 'TX2015',      depth: 'depth 150 km',  path: './data/tx2015_150.jpg' }
  ];

const colorSchemes = [
    { name: 'none',   interpolate: (val) => 0.0 },
    { name: 'Magma',  interpolate: (val) => d3.interpolateMagma(1-val) },
    { name: 'RdYlBu', interpolate: (val) => d3.interpolateRdYlBu(val) },
    { name: 'GnBu',   interpolate: (val) => d3.interpolateGnBu(val) }
  ];

// default model selection
let selectedModel = 1;         // 0 == none, 1 == SGLOBE-rani, 2 == S40RTS, ..
let selectedColorScheme = 1;   // 0 == none, 1 == Magma, 2 == RdYlBu, 3 == GnBu

// models
function getModelName(){
  return models[selectedModel].name;
}

function getModelDepth(){
  return models[selectedModel].depth;
}

// selections
function setModelSelection(name) {
  switch (name) {
    case 'none':          selectedModel = 0; break;
    case 'SGLOBE-rani':   selectedModel = 1; break;
    case 'S40RTS':        selectedModel = 2; break;
    case 'SAVANI':        selectedModel = 3; break;
    case 'SPani-S':       selectedModel = 4; break;
    case 'TX2015':        selectedModel = 5; break;
    default: console.error('setModelSelection: unknown name:', name);
  }
}

function setColorSelection(name) {
  switch (name) {
    case 'none':    selectedColorScheme = 0; break;
    case 'Magma':   selectedColorScheme = 1; break;
    case 'RdYlBu':  selectedColorScheme = 2; break;
    case 'GnBu':    selectedColorScheme = 3; break;
    default: console.error('setColorSelection: unknown name:', name);
  }
}

function getModelSelection() {
  let name = '';
  switch (selectedModel) {
    case 0: name = 'none'; break;
    case 1: name = 'SGLOBE-rani'; break;
    case 2: name = 'S40RTS'; break;
    case 3: name = 'SAVANI'; break;
    case 4: name = 'SPani-S'; break;
    case 5: name = 'TX2015'; break;
    default: console.error('getModelSelection: unknown selection:', selectedModel);
  }
  return name;
}

function getColorSelection() {
  let name = '';
  switch (selectedColorScheme) {
    case 0: name = 'none'; break;
    case 1: name = 'Magma'; break;
    case 2: name = 'RdYlBu'; break;
    case 3: name = 'GnBu'; break;
    default: console.error('getColorSelection: unknown selection:', selectedColorScheme);
  }
  return name;
}



/*
// simple function example
function getVectorField(lat, lon, vector) {
  // Calculate the x and y components of the vector based on your desired field
  const latRad = lat * (Math.PI / 180.0);
  const lonRad = lon * (Math.PI / 180.0);
  vector[0] = Math.sin(latRad) * Math.cos(lonRad);
  vector[1] = Math.cos(latRad);
  return vector;
}
*/

/*
function loadImage(url) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error(`Failed to load image: ${url}`));
        img.src = url;
    });
}
*/


// Example usage:
async function createVectorField() {
    try {
        //console.time('createVectorField');

        // checks if anything to do
        if (selectedModel == 0) {
          clearVectorField();
          return;
        }

        //image = await loadImage(models[selectedModel].path);
        let image = await d3.image(models[selectedModel].path);
        console.log('Image loaded:', image);

        const width = image.width;
        const height = image.height;

        // store array dimensions
        scalarMapWidth = width;
        scalarMapHeight = height;

        // Continue with the rest of your code here, e.g., drawing the image on a canvas
        // Image is loaded, continue with processing
        console.log(`createVectorField: image: width/height = ${width}/${height}`);

        // creates an image canvas to extract image data
        let imageCanvas = document.createElement('canvas');
        imageCanvas.width = width;
        imageCanvas.height = height;

        let ctx = imageCanvas.getContext('2d');
        ctx.drawImage(image, 0, 0);
        let imageData = ctx.getImageData(0, 0, width, height);

        // Create the worker instance
        createVectorFieldWorker(imageData, width, height)

        // release image
        image.src = '';
        image = null;
        imageData = null;
        ctx.clearRect(0, 0, width, height);
        ctx = null;
        imageCanvas = null;

        //console.timeEnd('createVectorField');

    } catch (error) {
        console.error(error);
    }
}


function createVectorFieldWorker(imageData, width, height) {
  // web worker instance for processing image data
  let worker = new Worker("./js/vectorFieldWorker.js");

  // Send image data to the worker for processing to scalar array
  worker.postMessage({ type: 'scalar', imageData, width, height });

  // Listen for the processed image data
  worker.onmessage = function(event) {
    const message = event.data;

    switch (message.type) {
      case 'scalarDone': {
        console.log(`createVectorField: Worker done: scalar`);
        // store scalar data
        scalarData = message.scalarData;

        // Send scalar data to the worker for computing gradient
        worker.postMessage({ type: 'gradient', scalarData, width, height });

        // create map contours
        if (ADD_CONTOURS) { contours.createContours(scalarData, width, height); }

        // update view
        // Dispatch custom up event on the window object
        window.dispatchEvent(new CustomEvent('update',{ detail: 'vectorField scalarDone'}));

        break;
      }
      case 'gradientDone': {
        console.log(`createVectorField: Worker done: gradient`);
        // store vector data
        vectorData = message.vectorData;

        // create streamlines
        if (ADD_STREAMLINES) {
          streamlines.initializeStreamlines();
        }

        // create particles
        particles.initializeParticles();

        // update view
        // Dispatch custom up event on the window object
        window.dispatchEvent(new CustomEvent('update',{ detail: 'vectorField gradientDone'}));

        // worker is done
        worker.terminate();
        worker = null;

        break;
      }
      default:
        console.error('createVectorField: unknown message type from worker:', message.type);
    }
  };

  // Handle any errors from the worker
  worker.onerror = function(error) {
    console.error('Error processing vector field in worker:', error.message);
  };
}


function clearVectorField(){
  // clear arrays
  if (scalarData != null) scalarData = null;
  if (vectorData != null) vectorData = null;
  // clear contours
  if (ADD_CONTOURS) contours.clearContours();
}


function isGradientValid(){
  return (vectorData != null);
}


async function setupVectorField() {
    console.log('setupVectorField...');

    // clear existing arrays
    if (scalarData != null) clearVectorField();

    // checks if anything to do
    if (selectedModel == 0) return;

    // synchronous waiting...
    await createVectorField();
    // or
    //createVectorField().then(() => {
    //  // Wait for the image to load
    //  console.log('setupVectorField : Image processing complete. Continue with other tasks.');
    //});

    // Any code here will only run after the image has loaded and processed
    //if (data != null) console.log(`setupVectorField: data: ${scalarData.length}`);
}



function getVectorField(lon_in, lat_in, vector) {
  //console.log('vectorField: ',vectorData);

  if (vectorData == null){
    // this won't work, would need async function / await ..
    //createVectorField();
    //console.log('vectorField: vector field loaded : ',vectorData);
    vector[0] = null; // vx
    vector[1] = null; // vy
    return vector;
  }

  const width = scalarMapWidth, height = scalarMapHeight;
  const dlon = 360 / width;
  const dlat = 180 / height;

  const index_max = width * height - 1; // scalar data has for each pixel 1 float value

  // Convert lat/lng to image coordinates (normalized 0-1 range)
  // lon in range [-180,180]
  // lat in range [90,-90]
  let lon = lon_in;
  let lat = lat_in;

  if (lon > 180.0) lon -= 360.0;
  if (lon < -180.0) lon += 360.0;
  if (lat < -90.0) lat = -90.0;
  if (lat > 90.0) lat = 90.0;

  const ix = Math.floor((lon + 180) / dlon); // lon index in [0,width-1]
  const iy = Math.floor((90 - lat) / dlat);  // colat in [0,height-1]

  // gradient array data (float values)
  let index = iy * width + ix; // Calculate pixel index

  //console.log(`vectorField: lon/lat = ${lon}/${lat} width/height = ${width}/${height} ix/iy = ${ix}/${iy}`);

  if (index < 0) { index = 0; }
  if (index >= index_max) { index = index_max - 1; }

  // get gradient
  vector[0] = vectorData[index * 2 ];    // vx
  vector[1] = vectorData[index * 2 + 1]; // vy

  return vector;
}

//-------------------------------
// drawing
//-------------------------------

// visible area points
let pointsView = [];

// adapt sampling based on zoom
// stronger zoom -> larger scale factor ~ [250,15000]
let dxSampling = 1, dySampling = 1;

function updateVectorField(projection,width,height,visiblePoints,dx,dy){
  //console.log(`updateVectorField: width/height ${width}/${height}`);

  // checks if anything to do
  if (! ADD_VECTORFIELD) return;

  // checks scalar data has loaded
  if (scalarData == null) return;

  // checks if visible points available
  if (visiblePoints.length == 0) return;

  //console.time('updateVectorField');

  // store sampling size
  dxSampling = dx;
  dySampling = dy;

  // update visible points
  pointsView = [];

  // image size
  const mapWidth = scalarMapWidth;
  const mapHeight = scalarMapHeight;

  // loops over all visible points
  visiblePoints.forEach(p => {
    // point p = [ix,iy,x,y] with ix,iy pixel coordinates, x relative lon in [0,1], y relative lat in [0,1]
    const [ix,iy,x,y] = p;

    // image value index
    let nx = Math.floor(x * mapWidth);
    let ny = Math.floor(y * mapHeight);

    // bounds
    if (nx < 0) nx = 0;
    if (ny < 0) ny = 0;
    if (nx == mapWidth) nx = mapWidth - 1;
    if (ny == mapHeight) ny = mapHeight - 1;

    const index = ny * mapWidth + nx;
    const val = scalarData[index];

    // no additional light effects
    //const brightness = val;
    pointsView.push([ix,iy,val]);
  });

  //console.timeEnd('updateVectorField');
}


function getVectorFieldColor(val){
  // returns a color for the given value
  // assumes val in [0,1]

  // check if anything to do
  if (selectedColorScheme == 0) return null;

  //const color = d3.interpolateCubehelixDefault(val);
  //const color = d3.interpolatePuBu(val);
  //const color = d3.interpolateGreys(val);
  //const color = d3.interpolateWarm(val); // perceptual rainbow

  //const color = d3.interpolateRdYlBu(val); // default
  //const color = d3.interpolateGnBu(val); // green-blue

  // get color from selected scheme
  const color = colorSchemes[selectedColorScheme].interpolate(val);

  return color;
}


function getVectorFieldColorAtPoint(ix,iy){
  // returns a color for the given location

  // check if anything to do
  if (selectedColorScheme == 0) return null;

  // checks if any points in visible range
  if (pointsView.length == 0) return null;

  let color = null;

  // find the scalar field value at point ix,iy
  const point = pointsView.find(p => p[0] === ix && p[1] === iy);
  // check if we found a point
  if (point) {
    const val = point[2];  // return the value 'val' if found

    // get color from selected scheme
    color = colorSchemes[selectedColorScheme].interpolate(val);

  }

  return color;
}



function drawVectorField(projection, context) {
  //console.log(`drawVectorField:`,pointsView);

  // draw image as background
  //context.drawImage(image, 0, 0, 200, 100);

  // checks if anything to do
  if (! ADD_VECTORFIELD) return;

  // checks valid field
  if (scalarData == null) return;

  // checks if any points to draw
  if (pointsView.length == 0) return;

  console.time('drawVectorField');

  // draw pixels
  projection.clipAngle(90);

  pointsView.forEach(point => {
      // gets ix/iy, lon/lat and brightness of point position
      const [ix,iy,val] = point; // val = brightness in [0,1]

      // coloring
      // use selected color scheme
      let color = getVectorFieldColor(val);

      // checks if color valid
      if (!color) return;

      // adds transparency
      color = d3.color(color).copy({opacity: 0.3});

      //const color = d3.color(d3.interpolateRdYlBu(val)).copy({opacity: 0.3});

      //let color = d3.interpolateRdYlBu(val);
      //color = `rgba(${d3.rgb(color).r}, ${d3.rgb(color).g}, ${d3.rgb(color).b}, 0.3)`;

      //if (idx < 10) console.log(`point color: ${color}`);

      // line
      context.beginPath();
      context.strokeStyle = color;
      context.lineWidth = dySampling;
      context.moveTo(ix, iy);
      context.lineTo(ix + dxSampling, iy);
      context.stroke();
  });

  console.timeEnd('drawVectorField');
}

export { setupVectorField, getVectorField, updateVectorField, drawVectorField, isGradientValid,
         getVectorFieldColor, getVectorFieldColorAtPoint,
         getModelName, getModelDepth,
         setModelSelection, setColorSelection,
         getModelSelection, getColorSelection };
