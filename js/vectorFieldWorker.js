/***
* 3D Earth tomo viewer - project to visualize global seismic models
*
* Copyright (c) 2024 Daniel Peter
* MIT License - https://opensource.org/license/mit
***/

// vectorField web worker
//
// creates a web worker to process the vector field data

// imports
importScripts("./lib/d3.v7.min.js");

// smoothing kernel size
const KERNEL_SIZE = 1;

// gradient scaling
const NORMALIZE_GRADIENT = true;

// message
self.onmessage = function(event) {
  const message = event.data;
  
  switch (message.type) {
    case 'scalar': {
      // Receive image data from the main thread
      const { imageData, width, height } = message;

      // process
      const scalarArray = processVectorField(imageData, width, height);

      // Send the processed image data back to the main thread
      self.postMessage({type: 'scalarDone', scalarData: scalarArray});
      break;
    }
    case 'gradient': {
      // Receive scalar data from the main thread
      const { scalarData, width, height } = message;

      // process
      const vectorArray = processGradientField(scalarData, width, height);

      // Send the processed image data back to the main thread
      self.postMessage({type: 'gradientDone', vectorData: vectorArray});
      break;
    }
    default:
      console.error('vectorFieldWorker: Worker got unknown message type:', message.type);
  }
}


// processing
function processVectorField(imageData, width, height){

  // create a grayscale array
  console.log(`createVectorField: creating grayscale...`);

  let scalarArray = new Float32Array(width * height);

  for (let i = 0, j = 0; i < imageData.data.length; i += 4, j++) {
      const r = imageData.data[i];     // Red channel
      const g = imageData.data[i + 1]; // Green channel
      const b = imageData.data[i + 2]; // Blue channel

      // Convert to grayscale using the luminosity method
      const grayscale = 0.299 * r + 0.587 * g + 0.114 * b;
      // or average
      //const grayscale = (r + g + b) / 3;

      // Normalize to the range [0, 1]
      scalarArray[j] = grayscale / 255;
  }

  function getMinMax(data) {
    // gets min/max
    let min = data[0], max = data[0];
    for (let i = 1; i < data.length; i++){
      min = Math.min(min,data[i]);
      max = Math.max(max,data[i]);
    }
    return { min,max };
  }

  let min,max;
  ({ min, max } = getMinMax(scalarArray));
  console.log(`createVectorField: scalar data size = ${scalarArray.length} : min/max = ${min}/${max}`);

  // smooth data
  if (KERNEL_SIZE > 0) {
    console.log(`createVectorField: smoothing...`);
    const t0 = performance.now();
    
    // blur
    scalarArray = d3.blur2({data: scalarArray, width: width}, KERNEL_SIZE).data;

    const t1 = performance.now();
    console.log(`createVectorField: smoothing took: `,`${t1 - t0} milliseconds`);

    ({ min,max } = getMinMax(scalarArray));
    console.log(`createVectorField: smoothing data kernel ${KERNEL_SIZE} smoothed min/max = ${min}/${max}`);
  }

  // normalize range
  const range = max - min;
  if (range > 0.0) {
    console.log(`createVectorField: normalizing...`);
    for (let i = 0; i < scalarArray.length; i++) {
      const val = (scalarArray[i] - min) / range;
      if (val < 0.0) val = 0.0;
      if (val > 1.0) val = 1.0;
      scalarArray[i] = val;
    }
    ({ min, max } = getMinMax(scalarArray));
    console.log(`createVectorField: data range = ${range} normalized min/max = ${min}/${max}`);
  }
  //console.log(`createVectorField: data dlat/dlon = ${180/height}/${360/width}`);

  // return scalar and gradient arrays
  return scalarArray;

}


function processGradientField(scalarData, width, height) {

  const dlon = 360 / width;
  const dlat = 180 / height;

  console.log(`computeGradientField: computing vector data: width/height = ${width}/${height}`);
  const t0 = performance.now();

  vectorArray = new Float32Array(width * height * 2); // vx, vy

  // loops over all scalar data points
  for (let iy = 0; iy < height; iy++) {
    for (let ix = 0; ix < width; ix++) {
      // for gradient

      // image data
      //const index_max = (imageCanvas.width * imageCanvas.height - 1) * 4; // canvas has for each pixel 4 r/g/b/alpha uint8 values

      //let index = Math.floor((y * imageCanvas.width + x) * 4); // Calculate pixel index
      //if (index < 0) { index = 0; }
      //if (index >= index_max) { index = index_max - 1; }

      // neighbor pixel indexing: see
      // https://stackoverflow.com/questions/45963306/html5-canvas-how-to-get-adjacent-pixels-position-from-the-linearized-imagedata/45969661#45969661
      //let index_left = (index - 4);
      //let index_right = (index + 4);
      //let index_bottom = (index + imageCanvas.width * 4);
      //let index_top = (index - imageCanvas.width * 4);

      // gradient array data (float values)
      const index_max = width * height - 1; // grayscale data has for each pixel 1 float value

      let index = iy * width + ix; // Calculate pixel index

      //console.log(`vectorField: lon/lat = ${lon}/${lat} width/height = ${width}/${height} ix/iy = ${ix}/${iy}`);

      if (index < 0) { index = 0; }
      if (index >= index_max) { index = index_max - 1; }

      // finite-difference approximation
      //
      // neighbor pixel indexing
      // Zevenbergen-Thorne algorithm (see also hillshade)
      //
      //             * top
      //             |
      //   left * -- x -- * right
      //             |
      //             *  bottom
      //
      /*
      let index_left = (index - 1);
      let index_right = (index + 1);
      let index_bottom = (index + width);
      let index_top = (index - width);

      // Handle edge cases by using boundary conditions
      if (index_left < 0) { index_left = 0;}
      if (index_top < 0) { index_top = 0;}
      if (index_right > index_max) { index_right = index_max;}
      if (index_bottom > index_max) { index_bottom = index_max;}

      //const value = scalarData[index];
      //console.log(`vectorField:   index = ${index} of ${width*height} : value = ${value}`);

      // Compute the gradient components
      const Gx = scalarData[index_left] - scalarData[index_right];  // Gradient in x direction - lon
      const Gy = scalarData[index_bottom] - scalarData[index_top];  // Gradient in y direction - lat
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
      if (iy == 0) {
        index_A = ix > 0 ? ix - 1 : width - 1;
        index_B = index;
        index_C = ix < (width - 1) ? ix + 1 : 0;
      }

      // bottom boundary
      if (iy == height - 1) {
        index_F = ix > 0 ? iy * width + ix - 1 : iy * width + width - 1;
        index_G = index;
        index_H = ix < (width - 1) ? iy * width + ix + 1 : iy * width;
      }

      // left boundary points
      if (ix == 0) {
        index_D = iy * width + (width - 1);
        index_A = iy > 0 ? (iy - 1) * width + (width - 1) : index_D;
        index_F = iy < (height - 1) ? (iy + 1) * width + (width - 1) : index_D;
      }

      // right boundary points
      if (ix == width - 1) {
        index_E = iy * width;
        index_C = iy > 0 ? (iy - 1) * width : index_E;
        index_H = iy < (height - 1) ? (iy + 1) * width : index_D;

      }

      //const value = scalarData[index];
      //console.log(`vectorField:   index = ${index} of ${width*height} : value = ${value}`);

      // Compute the gradient components
      const val_A = scalarData[index_A];
      const val_B = scalarData[index_B];
      const val_C = scalarData[index_C];
      const val_D = scalarData[index_D];
      const val_E = scalarData[index_E];
      const val_F = scalarData[index_F];
      const val_G = scalarData[index_G];
      const val_H = scalarData[index_H];

      // grayscale such that faster is brigther, slower is darker
      // higher val -> fast, lower val -> slow
      //
      // with gradient in negative direction:
      //    Gx -> right - left
      //    Gy -> top - bottom

      // Gradient in x direction - lon
      const val_left = val_A + 2 * val_D + val_F;
      const val_right = val_C + 2 * val_E + val_H;
      const Gx = 0.125 * (val_right - val_left);

      // Gradient in y direction - lat
      const val_top = val_A + 2 * val_B + val_C;
      const val_bottom = val_F + 2 * val_G + val_H;
      const Gy = 0.125 * (val_top - val_bottom);

      // Calculate vector components based on gray value (adjust as needed)
      //const vx = (grayValue - 128) / 128; // Normalize to -1 to 1 range
      //const vy = vx; // Example: use same x component for simplicity

      const vx = Gx / (2 * dlon);
      const vy = Gy / (2 * dlat);

      //console.log(`vectorField:   vector vx/vy = ${vx}/${vy}`);

      // store vector
      vectorArray[index * 2 ]    = vx;
      vectorArray[index * 2 + 1] = vy;
    }
  }

  const t1 = performance.now();
  console.log(`computeGradientField: computing gradients took: `,`${t1 - t0} milliseconds`);

  // stats min/max
  function getMinMaxNorm(){
    let vxMin = vectorArray[0], vxMax = vectorArray[0];
    let vyMin = vectorArray[1], vyMax = vectorArray[1];
    let norm = 0.0;
    for (let i = 2; i < vectorArray.length; i+=2){
      const vx = vectorArray[i];
      const vy = vectorArray[i + 1];
      // vx min/max
      vxMin = Math.min(vxMin,vx);
      vxMax = Math.max(vxMax,vx);
      // vy min/max
      vyMin = Math.min(vyMin,vy);
      vyMax = Math.max(vyMax,vy);
      // norm
      norm = Math.max(norm,vx * vx + vy * vy);
    }
    norm = Math.sqrt(norm);

    return { vxMin, vxMax, vyMin, vyMax, norm};
  }

  let vxMin,vxMax,vyMin,vyMax,norm;

  ({ vxMin,vxMax,vyMin,vyMax,norm } = getMinMaxNorm());
  console.log(`computeGradientField: vector vx: min/max = ${vxMin}/${vxMax} vy: min/max = ${vyMin}/${vyMax} norm: ${norm}`);

  // normalize
  // vector length in [0,1]
  if (NORMALIZE_GRADIENT) {
    if (norm > 0.0) {
      for (let i = 2; i < vectorArray.length; i+=2){
        vectorArray[i] /= norm;
        vectorArray[i + 1] /= norm;
      }
    }
    ({ vxMin,vxMax,vyMin,vyMax,norm } = getMinMaxNorm());
    console.log(`computeGradientField: normalized vector vx: min/max = ${vxMin}/${vxMax} vy: min/max = ${vyMin}/${vyMax} norm: ${norm}`);
  }

  return vectorArray;
}

