/***
* magma earth - a 3D Earth web viewer project to visualize global seismic models
*
* Copyright (c) 2024 Daniel Peter
* MIT License - https://opensource.org/license/mit
***/

// bumpMap
//
// creates a topography bump map

import * as contours from "./contours.js"; // contours

// flag to add bump map texture
const ADD_BUMPMAP = true;

// bump map contouring
const ADD_CONTOURS = false;

// factor to scale alpha of bump map texture
const BUMPMAP_ALPHA = 0.6;

// hillshading
const ADD_HILLSHADE = true;

// factor to adjust exaggeration of elevation slope
const HILLSHADE_ZFACTOR = 200.0;

// factor to scale effect strength
const HILLSHADE_STRENGTH = 0.2;

// Lighting parameters
let lights = [];

// Hillshade parameters
//  * Azimuth represents the direction of the light source on the horizontal plane (measured in degrees from the north, clockwise).
//  * Elevation (or altitude) represents the angle between the light source and the horizon.
//
//const azimuth = 315;    // The direction of the light source (e.g., 315 degrees is NW)
//const altitude = 45;    // The altitude of the light source (e.g., 45 degrees is halfway up)
// light normal [x,y,z] - vector length for relative magnitude/strength of lights
lights.push( { direction: [0, 0, 1.0], azimuth: 10, altitude: 45 }) // Light source coming from top z-axis
lights.push( { direction: [0, 0, -0.3], azimuth: 180, altitude: 45 }) // Light source coming from bottom z-axis

// hillshade scale factor for bump map effect
const bumpFactor = 1.5;


// bump map image
const imagePath = './data/earth_bumpmap_4096x2048.jpg';
//const imagePath = './data/earth_bumpmap_8192x4096.jpg'; // higher res -> more memory required...

// for fun, see about a tomo file as bump map
//const imagePath = './data/s40rts.jpg';
//const imagePath = './data/sglobe-rani.jpg';
//const imagePath = './data/sglobe-rani_gray.jpg';

let bumpData = null;        // elevation topography/bathymetry
let hillshadeData = null;   // smoothed elevation for hillshade effect

let bumpMapWidth = 0, bumpMapHeight = 0;

// constants
const DEGREE_TO_RADIAN = Math.PI / 180;

//// memory optimization
// we can convert float32 to float16 and use uint16 array for storage since bumpData is normalized
// float16
//function getDataAsFloat16(data) {
//
//  let float32Value, float16Value;
//
//  const N = data.length;
//
//  // checks if anything to do
//  if (N == 0) return null;
//
//  // new array of 16-bit integers
//  const bumpMapArray = new Uint16Array(N);
//
//  // Convert Float32 to Float16 and store in bump map array
//  for (let i = 0; i < N; i++) {
//    float32Value = data[i];   // float32 value
//    bumpMapArray[i] = float32ToFloat16(float32Value);  // Convert and store as float16
//  }
//
//  // get min/max
//  float16Value = bumpMapArray[0];
//  let min = float16ToFloat32(float16Value);
//  let max = min;
//  for (let i = 1; i < N; i++) {
//    float16Value = bumpMapArray[i];   // float32 value
//    float32Value = float16ToFloat32(float16Value);  // Convert and store as float16
//    min = Math.min(min,float32Value);
//    max = Math.max(max,float32Value);
//  }
//  console.log(`getDataAsFloat16: float16 data min/max ${min}/${max}`);
//
//  return bumpMapArray;
//}
//
//// we use uint16 arrays as storage to convert from float32 to float16
//function float32ToFloat16(val) {
//  // Get a 32-bit view of the float
//  const float32 = new Float32Array(1);
//  const int32 = new Int32Array(float32.buffer);
//
//  float32[0] = val;
//
//  const x = int32[0];
//
//  let bits = (x >> 16) & 0x8000; // Get the sign
//  let m = (x >> 12) & 0x07ff; // Keep only mantissa bits
//  const e = (x >> 23) & 0xff; // Exponent bits
//
//  if (e < 103) return bits; // Too small for a subnormal float
//  if (e > 142) {
//    bits |= 0x7c00; // Set to infinity
//    bits |= (e === 255 ? 0 : 0x200) && (x & 0x007fffff); // NaN
//    return bits;
//  }
//
//  if (e < 113) {
//    m |= 0x0800;
//    bits |= (m >> (114 - e)) + ((m >> (113 - e)) & 1);
//    return bits;
//  }
//
//  bits |= ((e - 112) << 10) | (m >> 1);
//  bits += m & 1;
//  return bits;
//}
//
//function float16ToFloat32(val) {
//  const float32 = new Float32Array(1);
//  const int32 = new Int32Array(float32.buffer);
//
//  let t1 = val & 0x7fff;
//  let t2 = val & 0x8000;
//  const t3 = val & 0x7c00;
//
//  t1 <<= 13;
//  t2 <<= 16;
//
//  t1 += 0x38000000;
//
//  if (t3 === 0) t1 = 0;
//
//  int32[0] = t1 | t2;
//  return float32[0];
//}
//
//function getBumpData(index) {
//  const float16Value = bumpData[index];
//  return float16ToFloat32(float16Value);
//}
//
//function getHillshadeData(index) {
//  const float16Value = hillshadeData[index];
//  return float16ToFloat32(float16Value);
//}

//-------------------------------
// bump map
//-------------------------------

async function createBumpMap() {
  try {
    // checks if anything to do
    if (! ADD_BUMPMAP) return;

    console.time('createBumpMap');

    //const image = await loadImage(imagePath);
    let image = await d3.image(imagePath);
    console.log('Image loaded:', image);

    const width = image.width;
    const height = image.height;

    // store dimensions
    bumpMapWidth = width;
    bumpMapHeight = height;

    // Continue with the rest of your code here, e.g., drawing the image on a canvas
    // Image is loaded, continue with processing
    console.log(`createBumpMap: image: width/height = ${width}/${height}`);

    let bumpCanvas = document.createElement('canvas');
    bumpCanvas.width = width;
    bumpCanvas.height = height;

    let ctx = bumpCanvas.getContext('2d');
    ctx.drawImage(image, 0, 0);
    let imageData = ctx.getImageData(0, 0, width, height);

    // Create the worker instance
    createBumpMapWorker(imageData, width, height)

    // release image
    image.src = '';
    image = null;
    imageData = null;
    ctx.clearRect(0, 0, width, height);
    ctx = null;
    bumpCanvas = null;

    console.timeEnd('createBumpMap');

  } catch (error) {
    console.error(error);
  }
}

//function createBumpMapWorker(imageData, callback) {
function createBumpMapWorker(imageData, width, height) {
  // web worker for processing bump map
  let worker = new Worker("./js/bumpMapWorker.js");

  // Send image data to the worker for processing bump map
  worker.postMessage({type: 'bump', imageData, width, height, ADD_HILLSHADE });

  // Listen for the processed image data
  worker.onmessage = function(event) {
    const message = event.data;

    switch (message.type) {
      case 'bumpDone': {
        console.log(`createBumpMap: Worker done: bump`);
        // store data
        bumpData = message.bumpData;

        // progress on the window object
        window.dispatchEvent(new CustomEvent('progress', { detail: 25 }));

        // hillshading
        if (ADD_HILLSHADE){
          // Send bump data to the worker for computing hillshade
          worker.postMessage({type: 'hillshade', bumpData, width, height });
        }

        // create bump map contours
        if (ADD_CONTOURS) {
          contours.createContours(bumpData, width, height);
        }

        // convert float32 to float16 and use uint16 array for storage since bumpData is normalized
        //bumpData = getDataAsFloat16(bumpData);

        // send progress on the window object
        let text = '';
        if (ADD_HILLSHADE) {
          text = 'bumpDone';
        } else {
          text = 'bumpDone - all done';
        }
        // update view
        // Dispatch custom up event on the window object
        window.dispatchEvent(new CustomEvent('update',{ detail: text }));

        break;
      }
      case 'hillshadeDone': {
        console.log(`createBumpMap: Worker done: hillshade`);

        // store data
        hillshadeData = message.hillshadeData;

        // convert float32 to float16 and use uint16 array for storage since bumpData is normalized
        //hillshadeData = getDataAsFloat16(hillshadeData);

        // update view
        // Dispatch custom up event on the window object
        window.dispatchEvent(new CustomEvent('update',{ detail: 'hillshadeDone - all done'}));

        // worker is done
        worker.terminate();
        worker = null;

        break;
      }
      default:
        console.error('createBumpMap: unknown message type from worker:', message.type);

    }
  };

  // Handle any errors from the worker
  worker.onerror = function(error) {
    console.error('Error processing bump map in worker:', error.message);
  };
}


//-------------------------------
// lighting/coloring functions
//-------------------------------

function applyBumpMap(x, y) {
    // Get the grayscale value from bump map (normalize the coordinate)
    const width = bumpMapWidth;
    const height = bumpMapHeight;

    // Extract pixel data from the bump map image at (x, y) with x in [0,1] and y in [0,1]
    //var bumpValue = getBumpValue(x, y);
    let nx = Math.floor(x * width); // lon [0,width]
    let ny = Math.floor(y * height); // lat [0,height]
    if (nx == width) { nx = width - 1; }
    if (ny == height) { ny = height - 1; }

    //var index = (ny * bumpMapWidth + nx) * 4; // Each pixel has RGBA (4 values)
    //return imageData.data[index]; // Grayscale value (R = G = B in bump map)
    const index = ny * width + nx;

    // bumpValue in [0,1]
    const bumpValue = bumpData[index];
    // or as float16
    //const float16Value = bumpData[index];
    //const float32Value = float16ToFloat32(float16Value);
    //const bumpValue = float32Value;

    return bumpValue;
}


function getShade(lon, lat, bump) {
    // get position vector
    const lonRad = lon * DEGREE_TO_RADIAN;
    const latRad = lat * DEGREE_TO_RADIAN;

    let bumpHeight = bump;

    // scaling value to range [0,bumpFactor]
    bumpHeight *= bumpFactor;

    // bump value in range [0,1]
    // Adjust z based on bump height
    const R = 1 + bumpHeight;

    const x = R * Math.cos(latRad) * Math.cos(lonRad);
    const y = R * Math.cos(latRad) * Math.sin(lonRad);
    const z = R * Math.sin(latRad);

    const normal = [x, y, z];

    // sum of dot products
    let sum = 0.0;

    lights.forEach(light => {
      const lightDirection = light.direction;
      const dotProduct = normal[0] * lightDirection[0] + normal[1] * lightDirection[1] + normal[2] * lightDirection[2];

      // add all light contributions
      //sum += dotProduct;
      // no light contributions from below?
      //if (dotProduct > 0.0) { sum += dotProduct; }
      sum += Math.max(0, dotProduct);
    });

    // normalize to have brightness in [0,1]

    // since bump height in [0,1]
    //   -> radius R in [1,1+1]
    //   -> maximum dot product for each light == 1+1 == 2
    //   (-> range of dot product for unit vector light in [-2,2])
    const brightness = sum / lights.length;
    //const brightness = sum / (2.0 * lights.length);
    //const brightness = sum / ((1 + bumpFactor) * lights.length);

    // normalize for sum in [-2,2]
    //const brightness = 0.5 * ( sum / (2.0 * lights.length) + 1.0);
    //if (brightness > 1.0) console.log(`getShade: brightness ${brightness}`);

    return brightness;
}


//-------------------------------
// update view
//-------------------------------

// visible area points
let pointsView = [];

// adapt sampling based on zoom
// stronger zoom -> larger scale factor ~ [250,15000]
let dxSampling = 1, dySampling = 1;

function updateBumpMap(projection,width,height,visiblePoints,dx,dy){
  //console.log(`updateBumpMap: bump data `,bumpData)

  // checks if anything to do
  if (! ADD_BUMPMAP) return;

  // checks if data available yet
  if (bumpData == null) return;

  // checks if visible points available
  if (visiblePoints.length == 0) return;

  console.time('updateBumpMap');

  // store sampling size
  dxSampling = dx;
  dySampling = dy;

  // update visible points
  pointsView = [];

  // loops over all visible points
  visiblePoints.forEach(p => {
    // point p = [ix,iy,x,y] with ix,iy pixel coordinates, x relative lon in [0,1], y relative lat in [0,1]
    const [ix,iy,x,y] = p;

    // lon in [-180,180]
    const lon = x * 360.0 - 180.0;
    // lat in [90,-90]
    const lat = 90.0 - y * 180.0;

    // elevation
    const bump = applyBumpMap(x, y);

    // brightness from direction light
    const brightnessLight = getShade(lon, lat, bump);

    // hillshade brightness
    let brightnessHillshade = 0.0;
    if (ADD_HILLSHADE) brightnessHillshade = getHillshade(lon, lat, x, y);

    // total brightness
    const brightness = brightnessLight + brightnessHillshade;

    pointsView.push([ix,iy,brightness]);
  });

  //console.log(`updateBumpMap: projection scale ${projection.scale()} dx/dy ${dx}/${dy} points ${pointsView.length}`);

  // check if anything to do
  if (pointsView.length == 0) return;

  // determines brightness min/max
  function getBrigthnessMinMax() {
    let minval = pointsView[0][2]; // + 1.e10;
    let maxval = pointsView[0][2]; // - 1.e10;

    pointsView.forEach(point => {
        // gets ix/iy, lon/lat and brightness of point position
        //const [ix,iy] = point.xy;
        const brightness = point[2]; // brightness in [0,1]
        // gets min/max
        if (brightness < minval) minval = brightness; // minval = Math.min(minval,brightness);
        if (brightness > maxval) maxval = brightness; // maxval = Math.max(maxval,brightness);
    });

    return [minval, maxval];
  }

  // initial min/max
  let brightnessMin,brightnessMax;
  ([brightnessMin,brightnessMax] = getBrigthnessMinMax());
  //console.log(`updateBumpMap: points brightness min/max = ${brightnessMin}/${brightnessMax}`);

  // brightness scaling to its visible range
  let brightnessRange = brightnessMax - brightnessMin;
  if (brightnessRange > 0.0) {
    pointsView.forEach(point => {
        // gets ix/iy, lon/lat and brightness of point position
        let val = point[2]; // brightness in [0,1]

        // normalize within visible range
        val = (val - brightnessMin) / brightnessRange;

        // scaling value to range [0,bumpFactor]
        //val *= bumpFactor;

        // amplify
        //const ampFactor = 1.0;
        //val *= ampFactor;

        // power scaling
        const powerFactor = 3.0;
        val = Math.pow(val,powerFactor);

        // limit ?
        //if (val < 0.0) { val = 0.0; }
        //if (val > 1.0) { val = 1.0; }

        // sets new scaled brightness value
        point[2] = val;
    });
    // updated min/max
    //([brightnessMin,brightnessMax] = getBrigthnessMinMax());
    //console.log(`updateBumpMap: points brightness scaled min/max = ${brightnessMin}/${brightnessMax}`);
  }

  console.timeEnd('updateBumpMap');  
}



//-------------------------------
// hillshade effect
//-------------------------------

function getHillshade(lon, lat, x, y) {
  // computes hillshade at a specified point location, point == [lon,lat], x & y in [0,1]

  // check if elevation data available for hillshade
  if (hillshadeData == null) return 0.0;

  // get position vector
  const lonRad = lon * DEGREE_TO_RADIAN;
  const latRad = lat * DEGREE_TO_RADIAN;
  const normal = [ Math.cos(latRad) * Math.cos(lonRad),
                   Math.cos(latRad) * Math.sin(lonRad),
                   Math.sin(latRad)
                 ];

  const width = bumpMapWidth;
  const height = bumpMapHeight;

  // Extract pixel data from the bump map image at (x, y) with x in [0,1] and y in [0,1]
  //var bumpValue = getBumpValue(x, y);
  let nx = Math.floor(x * width); // lon [0,width]
  let ny = Math.floor(y * height); // lat [0,height]

  // bounds
  if (nx < 0) nx = 0;
  if (ny < 0) ny = 0;
  if (nx == width) nx = width - 1;
  if (ny == height) ny = height - 1;

  //var index = (ny * bumpMapWidth + nx) * 4; // Each pixel has RGBA (4 values)
  //return imageData.data[index]; // Grayscale value (R = G = B in bump map)
  const index = ny * width + nx;

  // slope
  // finite-difference approximation
  //
  // neighbor pixel indexing
  // Zevenbergen-Thorne algorithm
  //
  //             * top
  //             |
  //   left * -- x -- * right
  //             |
  //             *  bottom
  //
  /*
  let index_left = (nx > 0) ? index - 1 : index;
  let index_right = (nx < width-1) ? index + 1 : index;

  let index_top = (ny > 0) ? (ny-1) * width + nx : index;
  let index_bottom = (ny < height-1) ? (ny+1) * width + nx : index;

  // elevation at neighbor positions
  // bumpValue in [0,1]
  const zLeft = hillshadeData[index_left];
  const zRight = hillshadeData[index_right];
  const zUp = hillshadeData[index_top];
  const zDown = hillshadeData[index_bottom];

  // Compute slope and aspect from neighboring points (simple finite difference)
  // Zevenbergen-Thorne algorithm
  const dzdx = 0.5 * (zRight - zLeft);
  const dzdy = 0.5 * (zDown - zUp);
  */

  // neighbor pixel indexing
  // Horn algorithm
  //
  //     A  *    * B  * C
  //        |    |    |
  //      D * -- x -- * E
  //        |    |    |
  //      F *    * G  * H
  //
  let index_A = (index - 1 - width);
  let index_B = (index - width);
  let index_C = (index + 1 - width);

  let index_D = (index - 1);
  let index_E = (index + 1);

  let index_F = (index - 1 + width);
  let index_G = (index + width);
  let index_H = (index + 1 + width);

  // Handle edge cases by using boundary conditions
  // wrap around
  // top boundary
  if (ny == 0) {
    index_A = nx > 0 ? nx - 1 : width - 1;
    index_B = index;
    index_C = nx < (width - 1) ? nx + 1 : 0;
  }

  // bottom boundary
  if (ny == height - 1) {
    index_F = nx > 0 ? ny * width + nx - 1 : ny * width + width - 1;
    index_G = index;
    index_H = nx < (width - 1) ? ny * width + nx + 1 : ny * width;
  }

  // left boundary points
  if (nx == 0) {
    index_D = ny * width + (width - 1);
    index_A = ny > 0 ? (ny - 1) * width + (width - 1) : index_D;
    index_F = ny < (height - 1) ? (ny + 1) * width + (width - 1) : index_D;
  }

  // right boundary points
  if (nx == width - 1) {
    index_E = ny * width;
    index_C = ny > 0 ? (ny - 1) * width : index_E;
    index_H = ny < (height - 1) ? (ny + 1) * width : index_D;
  }

  // Compute the gradient components
  const val_A = hillshadeData[index_A];
  const val_B = hillshadeData[index_B];
  const val_C = hillshadeData[index_C];
  const val_D = hillshadeData[index_D];
  const val_E = hillshadeData[index_E];
  const val_F = hillshadeData[index_F];
  const val_G = hillshadeData[index_G];
  const val_H = hillshadeData[index_H];
  // or as float16
  //const val_A = getHillshadeData(index_A);
  //const val_B = getHillshadeData(index_B);
  //const val_C = getHillshadeData(index_C);
  //const val_D = getHillshadeData(index_D);
  //const val_E = getHillshadeData(index_E);
  //const val_F = getHillshadeData(index_F);
  //const val_G = getHillshadeData(index_G);
  //const val_H = getHillshadeData(index_H);

  // Gradient in x direction - lon
  const val_left = val_A + 2 * val_D + val_F;
  const val_right = val_C + 2 * val_E + val_H;
  const dzdx = 0.125 * (val_right - val_left);

  // Gradient in y direction - lat
  const val_top = val_A + 2 * val_B + val_C;
  const val_bottom = val_F + 2 * val_G + val_H;
  const dzdy = 0.125 * (val_bottom - val_top);

  //not working properly...
  //let aspect = 0.0;
  //let slope = 0.0;
  //
  //if (1 == 0) {
  //  // Calculate slope and aspect
  //  const zNorm = Math.sqrt(dzdx * dzdx + dzdy * dzdy);
  //
  //  slope = Math.atan(HILLSHADE_ZFACTOR * zNorm);
  //
  //  // aspect to measure clockwise with respect to "true" north
  //  const TWO_PI = 2 * Math.PI;
  //  const HALF_PI = Math.PI / 2;
  //
  //  //let aspect =  Math.atan2(dzdy, -dzdx);
  //  // see: https://observablehq.com/@mapsgeek/diy-hillshade
  //  // rotated 90 degrees for proper north up in XY plane
  //  //let aspect =  HALF_PI - Math.atan2(dzdx, -dzdy);
  //
  //  // rotate XY-plane aspect to account for geographic position
  //  //let theta = (lonRad < 0) ? lonRad + 2 * Math.PI : lonRad ; // in [0,2pi]
  //  //aspect -= theta;
  //  // switch direction for [0,pi] section
  //  //if (theta < Math.PI) { aspect += Math.PI/2; } // theta []
  //
  //  // see: https://desktop.arcgis.com/en/arcmap/latest/tools/spatial-analyst-toolbox/how-hillshade-works.htm
  //  if (dzdx == 0.0) {
  //    // dz/dx is zero
  //    if (dzdy > 0) {
  //        aspect = HALF_PI;
  //    } else if (dzdy < 0) {
  //        aspect = TWO_PI - HALF_PI;
  //    } else {
  //        aspect = 0.0;
  //    }
  //  } else {
  //    aspect = Math.atan2(dzdy, -dzdx);
  //  }
  //
  //  // aspect in [0,2pi]
  //  if (aspect < 0.0) { aspect += TWO_PI; }
  //}


  // sum of hillshades
  let hillshadeTotal = 0.0;

  lights.forEach((light,idx) => {
    const lightDirection = light.direction;

    // only for positions in the same hemisphere as the light
    const dotProduct = normal[0] * lightDirection[0] + normal[1] * lightDirection[1] + normal[2] * lightDirection[2];

    // note that there is no hillshading around the equator for the given lights on north and south pole.
    if (dotProduct >= 0.0) {
      // get azimuth/altitude for XY plane given a 3D vector position ( z -> elevation, x & y -> azimuth )
      //const { azimuth, altitude } = vectorToAzimuthElevation(lightDirection);

      // pre-defined light azimuth/alitude
      const azimuth = light.azimuth;
      const altitude = light.altitude;

      // Calculate the illumination (cosine of the angle between the light and the surface normal)
      let incidence = 0.0;

      // not working properly...
      //if (1 == 0) {
      //  const zenithRad = (90 - altitude) * DEGREE_TO_RADIAN;
      //  //const azimuthRad = azimuth * DEGREE_TO_RADIAN;
      //
      //  // see: https://desktop.arcgis.com/en/arcmap/latest/tools/spatial-analyst-toolbox/how-hillshade-works.htm
      //  let azimuthRad = TWO_PI - azimuth * DEGREE_TO_RADIAN + HALF_PI;
      //  if (azimuthRad > TWO_PI) azimuthRad -= TWO_PI;
      //
      //  incidence = Math.sin(zenithRad) * Math.sin(slope) +
      //                    Math.cos(zenithRad) * Math.cos(slope) * Math.cos(azimuthRad - aspect);
      //
      //  //if (nx == 6044 && ny == 1530)
      //  //  console.log(`getHillshade: nx/ny ${nx}/${ny} index ${index} slope ${slope}/${aspect} incidence ${incidence}`);
      //}

      // from: https://observablehq.com/@sahilchinoy/a-faster-hillshader
      const alpha = Math.PI - azimuth * DEGREE_TO_RADIAN;
      const beta = altitude * DEGREE_TO_RADIAN;

      const A1 = Math.sin(beta);
      const A2 = Math.sin(alpha) * Math.cos(beta);
      const A3 = Math.cos(alpha) * Math.cos(beta);

      incidence = (A1 - HILLSHADE_ZFACTOR * dzdx * A2 - HILLSHADE_ZFACTOR * dzdy * A3)
                    / (Math.sqrt(1.0 + HILLSHADE_ZFACTOR * HILLSHADE_ZFACTOR * (dzdx * dzdx + dzdy * dzdy)));

      //if (nx == 6044 && ny == 1530)
      //  console.log(`getHillshade: nx/ny ${nx}/${ny} ${dzdx} ${dzdy} A ${A1}/${A2}/${A3} incidence ${incidence}`);

      // Normalize illumination to the range [0, 1]
      let hillshade = Math.max(0.0, Math.min(1.0, incidence));

      hillshadeTotal += dotProduct * hillshade;

      // 3366/2246
      //if (ny == 2246 && nx > 3365 && nx < 3370)
      //if (ny == 3245 && nx > 2407 && nx < 2410)
      //if (nx == 6044 && ny == 1530)
      //  console.log(`getHillshade: nx/ny ${nx}/${ny} index ${index} hillshade ${hillshade}`);
    }
  });

  // factor to scale effect strength
  hillshadeTotal *= HILLSHADE_STRENGTH;

  return hillshadeTotal;
}



//-------------------------------
// drawing functions
//-------------------------------

function getPointColor(brightness) {
  // coloring
  //let R = Math.round(80 * brightness);
  //let G = Math.round(80 * brightness);
  //let B = Math.round(80 * brightness);
  //
  //// limit range
  //if (R < 0) R = 0;
  //if (G < 0) G = 0;
  //if (B < 0) B = 0;
  //if (R > 255) R = 255;
  //if (G > 255) G = 255;
  //if (B > 255) B = 255;

  // see: https://d3js.org/d3-scale-chromatic/sequential
  // continuous
  //const color = d3.interpolatePuBu(1 - brightness);
  const color = d3.interpolateGreys(1 - brightness); // from 0 == white to 1 == black

  return color;
}


function drawBumpMap(projection, context){

  // checks if anything to do
  if (! ADD_BUMPMAP) return;

  // check if any points to draw
  if (pointsView.length == 0) return;

  console.time('drawBumpMap');

  // draw image as background
  //context.drawImage(bumpMapImage, 0, 0, width, height);

  projection.clipAngle(90);

  // add global transparency
  const prevAlpha = context.globalAlpha;

  context.globalAlpha = BUMPMAP_ALPHA;

  // draw texture
  context.lineWidth = dySampling;

  pointsView.forEach(point => {
      // gets ix/iy, lon/lat and brightness of point position
      // brightness in [0,1]
      //const [ix,iy,brightness] = point;

      // coloring
      const color = getPointColor(point[2]);

      // line
      context.beginPath();
      //context.strokeStyle = d3.rgb(R, G, B); // Shaded color // `rgba(255, 255, 255, ${alpha})`;
      context.strokeStyle = color;
      context.lineWidth = dySampling;
      //context.fillStyle = `rgba(0, 0, 0, 0.97)`;
      //context.fillStyle = `rgba(255, 255, 255, ${alpha})`;
      context.moveTo(point[0], point[1]);
      context.lineTo(point[0] + dxSampling, point[1]);
      context.stroke();
  });

  // Reset the globalAlpha (1.0 == fully opaque) for future operations
  context.globalAlpha = prevAlpha;

  console.timeEnd('drawBumpMap');
}


export { createBumpMap, updateBumpMap, drawBumpMap };
