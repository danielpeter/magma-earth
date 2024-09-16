/***
* 3D Earth tomo viewer - project to visualize global seismic models
*
* Copyright (c) 2024 Daniel Peter
* MIT License - https://opensource.org/license/mit
***/

// particles
//
// creates particle motions

import * as vectorField from "./vectorField.js"; // vector field

// flag to add particles to view
const ADD_PARTICLES = true;

// total number of particles
let numParticles = 10000;
const USE_VARIABLE_NUMPARTICLES = false;

// maximum particle age
const maxAge = 80;

// particle array
let particles = null;

// particle velocity factor
const VELOCITY_FACTOR = 0.5; // slow down, relax - it's earth material

// particle drawing
const particleSize = 1;
const ADAPT_PARTICLESIZE = false; // adapt line width to zoom factor

// blend color to fade out existing trails
const blendColor = "rgba(0, 0, 0, 0.95)";

// quantized color scale for color buckets
let colorScale = null;
let colorList = null;
let colorBuckets = null;
const NUM_COLORS = 10; // number of quantized colors

let bounds = {};    // lon/lat area for particles
let vCenter = null; // position vector for center point

// constants
const DEGREE_TO_RADIAN = Math.PI / 180;

// Initialize particles
function initializeParticles() {
  // checks if anything to do
  if (! ADD_PARTICLES) return;

  // check if vector field is ready
  if (! vectorField.isGradientValid()) return;

  console.log(`initializeParticles: particles ${numParticles}`);

  // particles array
  if (particles == null) {
    particles = new Float32Array(numParticles * 5); // x, y, vx, vy, age
  }

  // set initial full range
  bounds = { lonMin: -180, lonMax: 180, latMin: -90, latMax: 90 };

  // loop over paths
  for (let i = 0; i < numParticles; i++) {
    createParticle(i);
  }

  // color buckets
  // instead of drawing each particle with its own path, style & stroke,
  // we use collective buckets for the same style such that a single path & stroke command can be executed per bucket
  //
  // Create a quantized color scale with 10 discrete steps
  const startColor = "rgba(155, 155, 155, 0.4)";
  const endColor = "rgba(255, 255, 155, 0.4)";

  // interpolator
  const colorInterpolator = d3.interpolateRgb(startColor, endColor);

  // scale
  colorScale = d3.scaleQuantize()
                        .domain([0.0, 1.0])    // normalized velocity range
                        .range(d3.quantize(colorInterpolator, NUM_COLORS));

  // Get the list of all possible colors from the color scale
  colorList = colorScale.range();

  // Create an object to store arrays of particles grouped by color
  colorBuckets = {};

  // Pre-initialize the buckets with empty arrays for each color
  colorList.forEach(color => {
    colorBuckets[color] = [];  // Create an empty array for each color
  });
}

function createParticle(i) {
  //console.log(`createParticle: ${i}`);

  // get current bounds
  const { lonMin, lonMax, latMin, latMax } = bounds;
  
  // specified range
  const lonRange = lonMax - lonMin;
  const latRange = latMax - latMin;

  // initial point location
  // full range
  //let lon = (Math.random() - 0.5) * 360; // in [-180,180]
  ///let lat = (Math.random() - 0.5) * 180; // in [-90,90]

  // specified range
  let lon = lonMin + Math.random() * lonRange; // in [-180,180]
  let lat = latMin + Math.random() * latRange; // in [-90,90]

  // limit latitute [-90,90]
  if (lat < -90.0) { lat = -90.0;}
  if (lat >  90.0) { lat =  90.0;}

  // limit lon [-180,180]
  //if (lon < -180.0) { lon = -180.0;} // problems with antimeridian?
  //if (lon >  180.0) { lon =  180.0;}

  // moves points according to vector field:
  //   vx - x direction == lon
  //   vy - y direction == lat
  let vx, vy;
  ({ vx,vy } = vectorField.getVectorField(lon, lat));

  // check if valid
  if (!vx || !vy){ return; }

  // scale velocities
  vx *= VELOCITY_FACTOR;
  vy *= VELOCITY_FACTOR;

  // or simple vector field
  //const lonRad = lon * DEGREE_TO_RADIAN;
  //const latRad = lat * DEGREE_TO_RADIAN;
  //vx = 4.0 * Math.sin(latRad) * Math.cos(lonRad);
  //vy = 4.0 * Math.cos(latRad);

  // initial particle age
  let age = Math.floor(Math.random() * maxAge);

  // check velocity
  // if particle doesn't move, re-create path
  //const norm = (vx*vx + vy*vy);
  //if (norm == 0.0) createParticle(i);

  // add particle
  const index = i * 5;

  particles[index] = lon;     // lon
  particles[index + 1] = lat; // lat
  particles[index + 2] = vx;  // vx
  particles[index + 3] = vy;  // vy
  particles[index + 4] = age; // age
}


function determineBoundsLonLat(projection,width,height){

  // get bounds of visible area
  let lonMin = 360;
  let lonMax = -360;
  let latMin = 90;
  let latMax = -90;

  // checks if the view is including the antimeridian
  // there, we have ranges for example:
  //   +120 to +180 and -180 to - 160 -> thus, min/max will be lon min = -180 and lon max =180
  //                                     instead we want a continuous range from [+120, -160]
  //                                     for that, we can use +120 - 360 -> -240 and range [-240, -160]
  //                                                       or -160 + 360 ->  200           [+120, +200]
  //let crossesAntimeridian = false;
  let shiftLon = 0;

  // samples every 4-th pixel (enough for bounds detection)
  for (let iy = 0; iy < height; iy+=4){
    // for antimeridian check
    let lonPrev = -360;

    for (let ix = 0; ix < width; ix+=4){
      // point p = [lon,lat] with lon in [-180,180], lat in [-90,90]
      // gets lon/lat position
      const pos = projection.invert([ix,iy]);
      // determines min/max
      if (pos != null) {
        let lon = pos[0]
        let lat = pos[1];

        // check crossing the antimeridian
        if (lonPrev == -360) lonPrev = lon; // in case we have null positions, lonPrev is still at initialized value

        if (ix > 0){
          // stepping from say +179.9 to -178.0 ?
          if (lon - lonPrev < -180) {
            //crossesAntimeridian = true;
            shiftLon = 360.0;   // add 360 to negative values to have a range like [+120, +200]
            // set as previous value
            lonPrev = lon;
          }
        }
        // adjust lon if necessary to handle crossing the antimeridian
        if (lon < 0.0) lon += shiftLon;

        lonMin = Math.min(lonMin,lon);
        lonMax = Math.max(lonMax,lon);
        latMin = Math.min(latMin,lat);
        latMax = Math.max(latMax,lat);

      }
    }
  }

  // makes sure min < max
  if (lonMax < lonMin) { let tmp = lonMax; lonMax = lonMin; lonMin = tmp; }
  if (latMax < latMin) { let tmp = latMax; latMax = latMin; latMin = tmp; }

  // set new bounds
  bounds = { lonMin, lonMax, latMin, latMax };

  console.log(`determineBoundsLonLat: bounds lon: min/max = ${lonMin}/${lonMax} lat: min/max = ${latMin}/${latMax}`);
}

function updateParticles(projection,width,height) {
  // updates all particle position for new projection

  // checks if array available
  if (particles == null) return;

  // check if vector field is ready
  if (! vectorField.isGradientValid()) return;

  //console.time('updateParticles')
  console.log(`updateParticles: width/height ${width}/${height}`);

  // context for animation drawing
  //const context = d3.select("#animation").node().getContext("2d");
  //const width = context.canvas.width;
  //const height = context.canvas.height;

  /*
  // Get the bounds of the visible area in geographic coordinates
  const topLeft = projection.invert([0, 0]); // Pixel coordinates (0, 0) -> top-left
  const bottomRight = projection.invert([width, height]); // Bottom-right

  let lonMin = topLeft[0];
  let lonMax = bottomRight[0];

  let latMax = topLeft[1];
  let latMin = bottomRight[1];

  // makes sure min < max
  if (lonMax < lonMin) {
    const tmp = lonMin;
    lonMin = lonMax;
    lonMax = tmp;
  }
  if (latMax < latMin) {
    const tmp = latMin;
    latMin = latMax;
    latMax = tmp;
  }
  */

  // updates particle area
  determineBoundsLonLat(projection,width,height);

  // adapt number of particles to view range
  if (USE_VARIABLE_NUMPARTICLES) {
    // estimate number of particles based on window size
    let estimate = 10 * Math.max(width,height);
    console.log(`updateParticles: numParticles ${numParticles} estimate window size ${estimate}`);

    // estimate based on bounds range
    estimate = (bounds.lonMax - bounds.lonMin) * (bounds.latMax - bounds.latMin);
    console.log(`updateParticles: numParticles ${numParticles} estimate bounds range ${estimate}`);

    if (estimate > 20000) {
      numParticles = 20000;
    } else {
      numParticles = 10000;
    }

    // check if we need to recreate the array
    if (particles.length != numParticles * 5) {
      console.log(`updateParticles: recreate numParticles * 5 = ${numParticles * 5} particles length = ${particles.length}`);
      // re-create new array
      particles = new Float32Array(numParticles * 5); // x, y, vx, vy, age
    }
  }

  // creates new particles in this updated view range
  for (let i = 0; i < numParticles; i++) {
    createParticle(i);
  }

  // hemisphere visibility
  // we'll use the dot-product between the center point vector and the pixel vectors to determine the visibility
  // todo: better ways to avoid this check?
  vCenter = null;
  // determine lon/lat of center point
  const ix = Math.floor(width * 0.5);
  const iy = Math.floor(height * 0.5);
  const p = projection.invert([ix,iy]);
  // check if valid
  if (!p || isNaN(p[0]) || isNaN(p[1])) { return false; }

  // radial vector
  let latRad, lonRad;
  // center vector
  lonRad = p[0] * DEGREE_TO_RADIAN;
  latRad = p[1] * DEGREE_TO_RADIAN;
  vCenter = [ Math.cos(latRad) * Math.cos(lonRad), Math.cos(latRad) * Math.sin(lonRad), Math.sin(latRad) ];

  //console.timeEnd('updateParticles');
}

// debug timing
//let debugCount = 0;

function moveParticles() {
  // move particle positions & age

  // checks if anything to do
  if (! ADD_PARTICLES) return;

  // check if particle array is valid
  if (particles == null) return;
  if (particles.length == 0) return;

  // timing
  //if (debugCount < 10) console.time('moveParticles');
  //console.log(`moveParticles: particles ${particles.length}`);

  for (let i = 0; i < particles.length; i++) {
    const index = i * 5;

    // update position
    particles[index] += particles[index + 2]; // x += vx
    particles[index + 1] += particles[index + 3]; // y += vy

    // update velocity
    let lon = particles[index];
    let lat = particles[index + 1];

    let vx,vy;
    ({ vx, vy } = vectorField.getVectorField(lon, lat));

    // check if valid
    if (!vx || !vy){ return; }

    // scale velocities
    vx *= VELOCITY_FACTOR;
    vy *= VELOCITY_FACTOR;
    
    particles[index + 2] = vx;
    particles[index + 3] = vy;

    // ageing
    let age = particles[index + 4];

    // set to invisible for points moving around edges
    // lat
    if (lat < -90.0) age = maxAge;
    if (lat > +90.0) age = maxAge;

    // increase age
    age++;

    // Reset particle path if it has aged out
    if (age > maxAge) {
      // aged out, create new particle position
      createParticle(i);
    } else {
      particles[index + 4] = age;
    }
  }

  // timing
  //if (debugCount < 10) console.timeEnd('moveParticles');
}

// draw particles
function drawParticles(projection, context, width, height) {
  // checks if anything to do
  if (! ADD_PARTICLES) return;

  // check if particle array is valid
  if (particles == null) return;

  // check center point vector
  if (vCenter == null) return;

  // timing
  //if (debugCount < 20) console.time('drawParticles');
  //console.log(`drawParticles: particles ${particles.length}`);

  // Fade existing particle trails.
  // current blend mode
  const prev = context.globalCompositeOperation;
  // new blend mode (keep parts of the existing content that overlap with the new drawing)
  context.globalCompositeOperation = "destination-in";
  context.fillStyle = blendColor; // to fade out existing trails
  context.fillRect(0, 0, width, height);
  // reset previous blend mode
  context.globalCompositeOperation = prev;

  // draw updated particles
  // hemisphere check
  function isPointVisibleHemisphere(v0,v1) {
    // dotProduct is > 0 for points in same hemisphere
    const dotProduct = v0[0] * v1[0] + v0[1] * v1[1] + v0[2] * v1[2];
    return (dotProduct > 0.0);
  }

  // determine line width based on zoom factor
  let lineWidth = particleSize;
  if (ADAPT_PARTICLESIZE) {
    let k = 1.0, scaleZoom = 1.0;
    const transform = d3.zoomTransform(d3.select("#navigation").node());
    if (transform != null){
      k = transform.k; // 313 to 6266...
      const windowSize = Math.min(width,height);
      //scaleZoom = k / windowSize; // stronger zoom -> higher k -> thicker lines
      scaleZoom = windowSize / k; // less zoom -> lower k -> thicker lines
    }
    lineWidth = (scaleZoom < 1) ? particleSize : Math.floor(particleSize * scaleZoom);
    //console.log(`drawParticles: line width ${lineWidth}`);
  }

  projection.clipAngle(90);

  // Pre-initialize the buckets with empty arrays for each color
  colorList.forEach(color => {
    colorBuckets[color].length = 0; // set length to zero to avoid costly garbage collection
  });

  // fill color buckets
  for (let i = 0; i < particles.length; i++) {
    const index = i * 5;

    // check particle age
    if (particles[index + 4] < maxAge) {
      // Draw particle

      // initial position
      // lon/lat positions
      const lon0 = particles[index];
      const lat0 = particles[index + 1];

      const vx = particles[index + 2];
      const vy = particles[index + 3];

      // updated position
      const lon1 = lon0 + vx;
      const lat1 = lat0 + vy;

      // check if start/end points are visible
      // current point location vector
      const lonRad = lon0 * DEGREE_TO_RADIAN;
      const latRad = lat0 * DEGREE_TO_RADIAN;
      const v0 = [ Math.cos(latRad) * Math.cos(lonRad), Math.cos(latRad) * Math.sin(lonRad), Math.sin(latRad) ];

      const lonRad1 = lon1 * DEGREE_TO_RADIAN;
      const latRad1 = lat1 * DEGREE_TO_RADIAN;
      const v1 = [ Math.cos(latRad1) * Math.cos(lonRad1), Math.cos(latRad1) * Math.sin(lonRad1), Math.sin(latRad1) ];

      if(! isPointVisibleHemisphere(vCenter,v0)) { continue; }
      if(! isPointVisibleHemisphere(vCenter,v1)) { continue; }

      // converted to x/y pixel indexing
      const p0 = projection([lon0,lat0]);
      const p1 = projection([lon1,lat1]);

      // check if valid
      if (!p0 || isNaN(p0[0]) || isNaN(p0[1])) { continue; }
      if (!p1 || isNaN(p1[0]) || isNaN(p1[1])) { continue; }

      // line points
      const [x0,y0] = p0;
      const [x1,y1] = p1;

      // check if point is visible area
      // doesn't work, returned [x,y] pixel positions are all within globe area...
      //if (! isPointClose([x0,y0])) { continue; }
      //if (! isPointClose([x1,y1])) { continue; }

      // velocity strength
      const normSq = (vx * vx + vy * vy) / VELOCITY_FACTOR;  // in [0,1]

      // coloring
      // convert norm to rgb gray scale value
      //const val = 155 + Math.floor( normSq * 100.0 );
      // color with a yellow grade
      //const color = `rgba(${val}, ${val}, 155, 0.4)`;

      /* not working, too heavy...
      // color from vector field
      let color = vectorField.getVectorFieldColorAtPoint(x0,y0);
      //if (i < 5) console.log(`drawParticles: color ${color}`);
      if (color != null) {
        color = d3.color(color).brighter(); // brighten up color
        color = d3.color(color).copy({opacity: 0.4}); // add transparency
      } else {
        color = '#F0F';
      }
      */

      // Group particles by color
      // Determine color based on velocity
      const color = colorScale(normSq);

      // If this color doesn't have a bucket yet, create an empty array for it
      if (!colorBuckets[color]) {
        colorBuckets[color] = [];
      }

      // Add the particle to the appropriate color bucket
      colorBuckets[color].push([x0,y0,x1,y1]);
    } // age
  }

  // loop over color buckets and draw all particles with the same style with one stroke()
  colorList.forEach(color => {
    //if (debugCount < 20) { console.log(`drawParticles: color ${color} bucket ${colorBuckets[color].length}`);}

    // particles with same color style
    const bucketParticles = colorBuckets[color];
    if (bucketParticles.length == 0) return;

    // draw bucket
    context.beginPath();
    context.strokeStyle = color;
    context.lineWidth = lineWidth; //particleSize;

    bucketParticles.forEach(([x0,y0,x1,y1]) => {
      // line
      context.moveTo(x0, y0);
      context.lineTo(x1, y1);
    });

    context.stroke();
  });

  // timing
  //if (debugCount < 20) {
  //  console.timeEnd('drawParticles');
  //  debugCount++;
  //}
}


export { initializeParticles, updateParticles, moveParticles, drawParticles };
