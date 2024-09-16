/***
* 3D Earth tomo viewer - project to visualize global seismic models
*
* Copyright (c) 2024 Daniel Peter
* MIT License - https://opensource.org/license/mit
***/

// contours web worker
//
// web worker for processing contour data

// imports
importScripts("./lib/d3.v7.min.js");
//importScripts("./lib/d3-geo-projection@4/d3-geo-projection.js");

// smoothing kernel size
const KERNEL_SIZE = 3;

// data
let contours = null;

// message
self.onmessage = function(event) {
  const { data, width, height, ContourThresholds } = event.data;

  // process
  processContourData(data, width, height, ContourThresholds);

  // Send the processed image data back to the main thread
  self.postMessage({ Contours: contours });

  // clean up
  contours.forEach(contour => contour = null);
  contours = null;

}


// processing
function processContourData(data, width, height, ContourThresholds){

  console.time('createContours');

  // sub-sampling data array for faster contouring
  // create a smaller data array
  let ds = 1; // subsampling step
  if (height % 16 == 0 && width % 16 == 0) {
    ds = 16;
  } else if (height % 8 == 0 && width % 8 == 0) {
    ds = 8;
  } else if (height % 4 == 0 && width % 4 == 0) {
    ds = 4;
  } else if (height % 2 == 0 && width % 2 == 0) {
    ds = 2;
  }

  const w = Math.round(width / ds);
  const h = Math.round(height / ds);

  console.log(`createContours: image width/height  ${width}/${height} - w/h ${w}/${h} - subsampling ds = ${ds}`);

  let dataSub = new Float32Array(w * h); // subsampled

  // Loop over image data and save a subsampled array (for faster contouring)
  for (let iy = 0; iy < height; iy+=ds) {
    for (let ix = 0; ix < width; ix+=ds) {
      // original array index
      const index = iy * width + ix;
      const val = data[index];
      // subsampled array index
      const indexSub = (iy * w + ix) / ds;
      dataSub[indexSub] = val;
    }
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

  let min, max;
  ({min,max} = getMinMax(dataSub));
  console.log(`createContours: subsampled data : min/max = ${min}/${max}`);

  // smooth data
  if (KERNEL_SIZE > 0) {
    // needed for better contouring, otherwise data is too noisy
    console.log(`createContours: smoothing subsampled data...`);
    //const dataSmoothed = d3.blur2({data: data, width: width}, 8).data;
    dataSub = d3.blur2({data: dataSub, width: w}, 3).data;

    ({min,max} = getMinMax(dataSub));
    console.log(`createContours: subsampled smoothed data : min/max = ${min}/${max}`);
  }

  // Converts from grid coordinates (indexes) to screen coordinates (pixels).
  const transformToGeo = ({type, value, coordinates}) => {
    return {type, value, coordinates: coordinates.map(rings => {
      return rings.map(points => {
        // from grid to screen coordinates
        // https://observablehq.com/@d3/contours?collection=@d3/d3-contour
        //return points.map(([x, y]) => ([grid.x + grid.k * x,grid.y + grid.k * y]));
        // from grid to lon/lat to screen
        return points.map(([x, y]) => {
          const lon = x / w * 360.0 - 180.0; // in [-180,180]
          const lat = 90.0 - y / h * 180.0; // in [-90,90]
          return [lon,lat];
        });
        //.filter(([lon]) => Math.abs(lon + 180) > 0.001 && Math.abs(lon - 180) > 0.001); // Remove points on the antimeridian
      });
    })};
  };

  // Converts from grid coordinates (indexes) to screen coordinates (pixels).
  // idea from: https://stackoverflow.com/questions/77036719/d3-geostitch-is-undefined
  //
  // not working properly...
  /*
  const transformToGeoConnect = ({type, value, coordinates}) => {
    return {
      type,
      value,
      coordinates: coordinates.map(rings => {
        const shared = {};

        let p = {
          coordinates: rings.map(points => {
            // from grid to screen coordinates
            // https://observablehq.com/@d3/contours?collection=@d3/d3-contour
            //return points.map(([x, y]) => ([grid.x + grid.k * x,grid.y + grid.k * y]));
            // from grid to lon/lat to screen
            return points.map(([x, y]) => {
              const lon = x / w * 360.0 - 180.0; // in [-180,180]
              const lat = 90.0 - y / h * 180.0; // in [-90,90]
              return [lon,lat];
            });
          })
        };

        // record the y-intersections with the anti-meridian
        p.coordinates.forEach(ring => {
          ring.forEach(points => {
            points.forEach(point => {
              const lon = point[0];
              const lat = point[1];
              if (lon === -180) {
                shared[lat] = (shared[lat] || 0) | 1;
              } else if (lon === 180) {
                shared[lat] = (shared[lat] || 0) | 2;
              }
            });
          });
        });

        // Offset any unshared antimeridian points to prevent their stiching.
        p.coordinates.forEach(ring => {
          ring.forEach(points => {
            points.forEach(point => {
              const lon = point[0];
              const lat = point[1];
              if ((lon === -180 || lon === 180) && shared[lat] !== 3) {
                point[0] = lon === -180 ? -179.9999 : 179.9999; // Slightly adjust to prevent stitching
              }
            });
          });
        });

        // use geoStitch function to handle crossing the antimeridian
        p = d3geoProj.geoStitch(p);

        // Return the adjusted coordinates
        return p.coordinates
      })
    };
  };
  */

  // Generate contours based on the grayscale data
  console.log(`createContours: contours at: ${ContourThresholds}`);

  /*
  // paths in pixel coordinates
  const contours = d3.contours()
                        .size([w, h])
                        .smooth(false)
                        .thresholds(ContourThresholds)
                        (dataSmooth);
  */

  // paths converted to lon/lat to screen pixel
  contours = d3.contours()
                        .size([w, h])
                        .smooth(true)
                        .thresholds(ContourThresholds)
                        (dataSub)
                        .map(transformToGeo);
                        //.map(transformToGeoConnect);

  console.timeEnd('createContours');

  // cleanup temporary array
  dataSub = null;

  // all done
  return;
}
