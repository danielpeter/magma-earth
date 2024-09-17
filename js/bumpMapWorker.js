/***
* 3D Earth tomo viewer - project to visualize global seismic models
*
* Copyright (c) 2024 Daniel Peter
* MIT License - https://opensource.org/license/mit
***/

// bumpMap web worker
//
// web worker for processing bump map

// imports
importScripts("./lib/d3.v7.min.js");

// message
self.onmessage = function(event) {
  const message = event.data;
  
  switch (message.type) {
    case 'bump': {
      // Receive image data from the main thread
      const { imageData, width, height } = message;

      // process
      const scalarArray = processBumpMap(imageData, width, height);

      // Send the processed image data back to the main thread
      self.postMessage({type: 'bumpDone', bumpData: scalarArray});
      break;
    }
    case 'hillshade': {
      // Receive bump data from the main thread
      const { bumpData, width, height } = message;

      // process
      const hillshadeArray = processHillshade(bumpData, width, height);

      // Send the processed image data back to the main thread
      self.postMessage({type: 'hillshadeDone', hillshadeData: hillshadeArray});
      break;
    }
    default:
      console.error('bumpMapWorker: Worker got unknown message type:', message.type);
  }
}


// processing
function processBumpMap(imageData, width, height){

  // create a grayscale array
  console.log(`createBumpMap: creating grayscale scalars...`);

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
    // normalize range to be within fully in [0,1]
    let min = data[0];
    let max = data[0];
    // Iterate through the array
    for (let i = 1; i < data.length; i++) {
      if (data[i] < min) min = data[i];
      if (data[i] > max) max = data[i];
    }
    return { min, max };
  }

  let min,max;
  ({ min, max } = getMinMax(scalarArray));
  console.log(`createBumpMap: data size = ${scalarArray.length} = ${width*height} : min/max = ${min}/${max}`);

  // smooth data
  // smoothing kernel size
  //const KERNEL_SIZE = 1; // higher res 8196x4096
  const KERNEL_SIZE = 0;
  if (KERNEL_SIZE > 0) {
    console.log(`createBumpMap: smoothing...`);
    const t0 = performance.now();

    // by blur2
    scalarArray = d3.blur2({data: scalarArray, width: width}, KERNEL_SIZE).data;
    // or manually
    /*
    let smoothData = [...scalarArray]; // array copy
    for (let i = 0; i < height; i++) {
      for (let j = 0; j < width; j++) {
        let sum = 0.0;
        for (let k = -KERNEL_SIZE; k <= KERNEL_SIZE; k+=2) {
          for (let l = -KERNEL_SIZE; l <= KERNEL_SIZE; l+=2) {
            let index = (i+k)*width + j + l;
            if (index < 0) {index = 0;}
            if (index >= scalarArray.length) {index = scalarArray.length-1;}
            sum += scalarArray[index];
          }
        }
        // average
        sum /= (KERNEL_SIZE+1)*(KERNEL_SIZE+1);
        // bounds
        if (sum < 0.0) {sum = 0.0;}
        if (sum > 1.0) {sum = 1.0;}
        // store
        smoothData[i*width + j] = sum;
      }
    }
    // replace with smoothed data
    scalarArray = smoothData;
    */
    const t1 = performance.now();
    console.log(`createBumpMap: smoothing took: `,`${t1 - t0} milliseconds`);

    ({ min,max } = getMinMax(scalarArray));
    console.log(`createBumpMap: smoothing data kernel ${KERNEL_SIZE} smoothed min/max = ${min}/${max}`);
  }

  // normalize range
  console.log(`createBumpMap: normalizing...`);
  const range = max - min;
  if (range > 0.0) {
    for (let i = 0; i < scalarArray.length; i++) {
      let val = (scalarArray[i] - min) / range;
      if (val < 0.0) val = 0.0;
      if (val > 1.0) val = 1.0;
      scalarArray[i] = val;
    }
  }
  ({ min, max } = getMinMax(scalarArray));
  console.log(`createBumpMap: data range = ${range} normalized min/max = ${min}/${max}`);
  console.log(`createBumpMap: data dlat/dlon = ${180/height}/${360/width}`);

  return scalarArray;
}

// processing
function processHillshade(bumpData, width, height){
  // for hillshade effect
  console.log(`createBumpMap: hillshade: creating elevation data...`);

  // create elevation data for hillshade
  // shallow copy
  let hillshadeArray = [...bumpData]; // or Array.from(bumpData);

  // smooth elevation data otherwise it is too rough
  // blur data
  //const KERNEL_SIZE = 1; // higher res 8196x4096
  const KERNEL_SIZE = 1;
  if (KERNEL_SIZE > 0) {
    console.log(`createBumpMap: hillshade: smoothing elevation data: kernel size ${KERNEL_SIZE}`);
    const t0 = performance.now();
    // blur
    hillshadeArray = d3.blur2({data: hillshadeArray, width: width}, KERNEL_SIZE).data;
    const t1 = performance.now();
    console.log(`createBumpMap: hillshade: smoothing took: `,`${t1 - t0} milliseconds`);
  }

  // gets min/max
  let min = hillshadeArray[0], max = hillshadeArray[0];
  for (let i = 1; i < hillshadeArray.length; i++){
    min = Math.min(min,hillshadeArray[i]);
    max = Math.max(max,hillshadeArray[i]);
  }
  console.log(`createBumpMap: hillshade: elevation data min/max ${min}/${max}`);

  return hillshadeArray;
}
