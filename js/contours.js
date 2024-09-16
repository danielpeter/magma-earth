/***
* 3D Earth tomo viewer - project to visualize global seismic models
*
* Copyright (c) 2024 Daniel Peter
* MIT License - https://opensource.org/license/mit
***/

// contours
//
// creates contours, assuming GeoTIFF-like image data

// see: https://observablehq.com/@d3/geotiff-contours-ii?intent=fork
//
// invert function converts [x, y] in pixel coordinates to [longitude, latitude].
// Inverting the projection breaks the polygon ring associations:
// holes are no longer inside their exterior rings.
// Fortunately, since the winding order of the rings is consistent and we’re now in spherical coordinates,
// we can just merge everything into a single polygon!
//
//import * as d3geoProj from "https://cdn.skypack.dev/d3-geo-projection@4";
import * as d3geoProj from "./lib/d3-geo-projection@4/d3-geo-projection.js";

// coloring
import * as vectorField from "./vectorField.js";

// Define contour levels
//const dinterval = 0.2; // interval step
//const ContourThresholds = d3.range(0+ds, 1.0-ds, dinterval);
//const ContourThresholds = [0.4];
const ContourThresholds = [0.3,0.4,0.45,0.5,0.55,0.65,0.7,0.75,0.8]; // sea level ~ 0.6

// constants
const DEGREE_TO_RADIAN = Math.PI / 180;

//-------------------------------
// Contours
//-------------------------------

// contours
let Contours = null;

function createContours(data,width,height) {
  // contours
  // check
  if (data == null) return;

  // web worker for processing bump map
  let worker = new Worker("./js/contoursWorker.js");

  // Send image data to the worker for processing bump map
  worker.postMessage({data, width, height, ContourThresholds});

  // Listen for the processed image data
  worker.onmessage = function(event) {
    // store contours
    ({ Contours } = event.data);

    console.log(`createContours: Worker done: contours ${Contours.length}`);

    // update view
    // Dispatch custom up event on the window object
    window.dispatchEvent(new CustomEvent('update',{ detail: 'contoursDone'}));

    // worker is done
    worker.terminate();
    worker = null;
  };

  // Handle any errors from the worker
  worker.onerror = function(error) {
    console.error('createContours: Error processing data in worker:', error.message);
  };

}


function clearContours() {
  // clear contours array
  Contours.forEach(contour => contour = null);
  if (Contours != null) Contours = null;
}


function connectGeoContour(contour) {
  // connect contour line at anti-meridian
  // see: https://stackoverflow.com/questions/77036719/d3-geostitch-is-undefined
  const shared = {};

  //let i = 0;
  const TOL_ZERO = 0.01;

  // Record the y-intersections with the antimeridian.
  contour.coordinates.forEach(ring => {
    ring.forEach(points => {
      points.forEach(point => {
        const lon = point[0];
        const lat = point[1];

        //debug
        //i++;
        //if (i <= 5) console.log(`connectGeoContour: point ${i} : lon/lat ${lon}/${lat}`);

        //const lon = Math.round(point[0]);
        //const lat = Math.round(point[1]);

        /*
        if (lon === -180) {
          shared[lat] = (shared[lat] || 0) | 1; // bitwise OR: 1 == 0000 0001
        } else if (lon === 180) {
          shared[lat] = (shared[lat] || 0) | 2; // bitwise OR: 2 == 0000 0010
        }
        */

        if (Math.abs(lon + 180) <= TOL_ZERO) {
          shared[lat] = (shared[lat] || 0) | 1; // bitwise OR: 1 == 0000 0001
        } else if (Math.abs(lon - 180) <= TOL_ZERO) {
          shared[lat] = (shared[lat] || 0) | 2; // bitwise OR: 2 == 0000 0010
        }

      });
    });
  });

  // Offset any unshared antimeridian points to prevent their stitching.
  contour.coordinates.forEach(ring => {
    ring.forEach(points => {
      points.forEach(point => {
        let lon = point[0];
        let lat = point[1];
        //const lon = Math.round(point[0]);
        //const lat = Math.round(point[1]);
        /*
        if ((lon === -180 || lon === 180) && shared[lat] !== 3) {
          point[0] = lon === -180 ? -179.9999 : 179.9999; // Slightly adjust to prevent stitching
        }
        */

        // check if shared point has a slightly different lat
        if (Math.abs(lon + 180) < TOL_ZERO || Math.abs(lon - 180) < TOL_ZERO) {
          // for points on antimeridian, but not shared from both sides yet
          if (shared[lat] == 1 || shared[lat] == 2){
            // find closest match from opposite side
            let minDist = 180;
            let latClosest = null;
            Object.entries(shared).forEach(([sharedlat, value]) => {
              // omit own point
              if (sharedlat != lat) {
                // check if its from opposite side
                if ((shared[lat] == 1 && value == 2) || (shared[lat] == 2 && value == 1)) {
                  const dist = Math.abs(sharedlat - lat);
                  // store closest point
                  if (dist < minDist){
                    minDist = dist;
                    latClosest = sharedlat;
                  }
                }
              }
            });

            // merge if close enough
            if (minDist < 0.1){
              //console.log(`connectGeoContour: reposition ${lat} ${latClosest} ${shared[lat]} ${shared[latClosest]}`);
              // re-position to closest lat
              lat = latClosest;
              point[1] = lat;
              shared[lat] = 3;
            }
          }
        }

        if ((Math.abs(lon + 180) < TOL_ZERO || Math.abs(lon - 180) < TOL_ZERO) && shared[lat] !== 3) {
          point[0] = lon === -180 ? -179.9999 : 179.9999; // Slightly adjust to prevent stitching
        }

      });
    });
  });

  //Object.entries(shared).forEach(([lat, value]) => { console.log(`connectGeoContour: shared ${lat} ${value}`);});
  //console.log(`connectGeoContour: shared entries ${Object.entries(shared).length}`);

  contour = d3geoProj.geoStitch(contour);

  // remove line artefacts at antimeridian
  // remove antimeridian points if they follow a line along the antimeridian
  let newCoordinates = [];

  contour.coordinates.forEach((ring,ir) => {
    let newRing = [];

    ring.forEach((points,ip) => {
      let newPoints = [];
      let iremoved = 0;

      points.forEach((point,idx) => {
        // current point
        let lon = point[0]; // in range [-180,180]
        let lat = point[1];

        // put lon in range [0,360]
        if (lon < 0.0) lon += 360.0;

        // check if next point still on antimeridian
        let lon1 = 0;
        if (idx < points.length - 1){
          // next point
          lon1 = points[idx+1];
          // put lon in range [0,360]
          if (lon1 < 0.0) lon1 += 360.0;
        }

        // for antimeridian points
        const TOL_MERIDIAN_REMOVAL = 0.01;

        // skip if point close to antimeridian
        if (Math.abs(lon - 180) < TOL_MERIDIAN_REMOVAL){
          //console.log(`contour: ring ${ir} points array ${ip}/${points.length} - point ${idx} lon/lat ${lon}/${lat}`);
          iremoved++;
          //return;
        } else {
          // skip if both points are on antimeridian
          if (Math.abs(lon - 180) < TOL_MERIDIAN_REMOVAL && Math.abs(lon1 - 180) < TOL_MERIDIAN_REMOVAL){
            // skip/remove this point
            iremoved++;
          } else {
            // keep point
            newPoints.push(point);
          }
        }
      });

      //if (iremoved > 0){
      //console.log(`contour: ring ${ir} points array ${ip}/${points.length} - removed ${iremoved} new points length ${newPoints.length}`);
      // replace points
      if (newPoints.length > 0){
        newRing.push(newPoints);
      }
    });
    if (newRing.length > 0){
      newCoordinates.push(newRing);
    }
  });

  //console.log(`contour: coordinates`,contour.coordinates);
  //console.log(`contour: new coordinates`,newCoordinates);

  contour.coordinates = newCoordinates;

  // contour rings will be drawn cyclic - end point will connect to start point -> only draw line segments instead?

  return contour;
}


function drawContours(projection, context, path, transform){
  // check
  if (! Contours) return;

  // check data
  if (Contours.length == 0){ return; }

  console.time('drawContours');

  // hemisphere check
  function isPointVisibleHemisphere(v0,v1) {
    // dotProduct is > 0 for points in same hemisphere
    const dotProduct = v0[0] * v1[0] + v0[1] * v1[1] + v0[2] * v1[2];
    return (dotProduct >= 0);
  }

  // contours
  //console.log(`drawContours: contours ${Contours.length}`);

  // Clear canvas before drawing contours
  //context.clearRect(0, 0, canvas.width, canvas.height);

  // window size
  const width = context.canvas.width;
  const height = context.canvas.height;

  // contours are for image pixel data
  //const projectionImage = d3.geoIdentity().scale(1); // No transformation, 1:1 scaling

  // in case contour data are given in geographic system
  //const projectionImage = projection;

  // determine lon/lat of center point
  // center pixel
  const ix = Math.floor(width * 0.5);
  const iy = Math.floor(height * 0.5);

  const p = projection.invert([ix,iy]);
  // check if valid
  if (!p || isNaN(p[0]) || isNaN(p[1])) { return false; }

  // position vector
  let latRad, lonRad;

  // center vector
  lonRad = p[0] * DEGREE_TO_RADIAN;
  latRad = p[1] * DEGREE_TO_RADIAN;
  const vCenter = [ Math.cos(latRad) * Math.cos(lonRad), Math.cos(latRad) * Math.sin(lonRad), Math.sin(latRad) ];


  // Set up canvas context for drawing
  context.lineWidth = 2;

  projection.clipAngle(90);

  //Object.keys(Contours).forEach(key => { console.log(`drawContours: Contours key ${key}`);});

  Contours.forEach((contour,idx) => {

    // connect points at anti-meridian
    contour = connectGeoContour(contour);

    // Create a D3 path for each contour
    //let path = d3.geoPath()
    //                    .context(context) // Use the current canvas context
    //                    .projection(projectionImage); // Use the custom projection

    //path = d3geoProj.geoStitch(path); // not working properly...

    /*
    let i = 0;
    contour.coordinates.forEach(ring => {
        ring.forEach(points => {
          points.forEach(point => {
            i++;
            if (i <= 5) console.log(`drawContours: point ${i} : ${point}`);
            //const w = 512, h = 256;
            //const lon = point[0] / w * 360.0 - 180.0; // in [-180,180]
            //const lat = point[1] / h * 180.0 - 90.0; // in [-90,90]
            //const [ix,iy] = projection([lon,lat]);
            //if (i == 1) console.log(`drawContours: x/y ${point} lon/lat ${lon}/${lat} ix/iy ${ix}/${iy}`);
            //return [ix, iy];
            //point = [ix, iy];
          });
        });
    });
    */

    // coloring
    //const val = Object.entries(contour).value; // contour has no key `values`
    //Object.keys(contour).forEach(key => { console.log(`drawContours: contour key ${key}`);});

    // assumes that for each threshold value there is a contour, with the same ordering
    let color;
    if (Contours.length == ContourThresholds.length) {
      let val = ContourThresholds[idx];

      // to make colors intense since all threshold values > 0 and < 1
      // scale to range [0,1]
      const valMin = ContourThresholds[0];
      const valMax = ContourThresholds[ContourThresholds.length - 1];
      let valRange = valMax - valMin;
      if (valRange == 0.0) valRange = 1.0;
      val = (val - valMin) / valRange;

      /*
      // simple ocean/land coloring
      if (val < 0.6){
        color = '#447'; // Set contour line color
      } else {
        color = '#474'; // Set contour line color
      }
      */

      // same as bumpMap coloring
      //color = getPointColor(val);

      // blue-ish
      //color = d3.interpolatePuBu(val);

      // grayscale such that faster is brigther, slower is darker
      // thus, fast -> cold (bluish), slow -> hot (redish)
      //       higher val -> blue, lower val -> red

      // red-yellow-blue
      //color = d3.interpolateRdYlBu(val);

      // same as vectorField colors
      color = vectorField.getVectorFieldColor(val);

      // checks if color valid
      if (!color) return;

      // discrete color scheme - not working properly...
      //const colorScale = d3.scaleOrdinal(d3.schemeRdYlBu[6]);
      //const colorScale = d3.scaleSequential(d3.interpolateBlues);
      //color = colorScale(val);
      //console.log(`drawContours: value ${val} color ${color} - scale ${colorScale.range()}`);

      // add transparency
      color = d3.color(color).copy({opacity: 0.7});
    } else {
      // no contour value
      color = "#444";
    }

    // set line color
    context.strokeStyle = color;

    //console.log(`drawContours: contour ${idx} threshold value ${val}`);

    // Draw the contour path
    if (1 == 0){
      //context.beginPath(), path(contour), context.strokeStyle = "#999", context.lineWidth = .5, context.stroke();
      context.beginPath();
      path(contour);
      context.stroke();
    }

    //or
    // draw lines instead of contour to avoid cycling ends for rings
    if (1 == 1) {
      contour.coordinates.forEach(ring => {
        ring.forEach((points,idx) => {
          points.forEach((point,idx) => {
            // draw line to next point
            if (idx < points.length - 1) {
              // Convert pixel (x, y) to geographic coordinates (lon, lat)
              //const lon = x / w * 360 - 180; // in [-180,180]
              //const lat = 90 - y / h * 180; // invert image (colat) to lat in [-90,90]

              const [lon0,lat0] = point;
              const [lon1,lat1] = points[idx+1];

              // current point location vector
              lonRad = lon0 * DEGREE_TO_RADIAN;
              latRad = lat0 * DEGREE_TO_RADIAN;
              const v0 = [ Math.cos(latRad) * Math.cos(lonRad), Math.cos(latRad) * Math.sin(lonRad), Math.sin(latRad) ];

              lonRad = lon1 * DEGREE_TO_RADIAN;
              latRad = lat1 * DEGREE_TO_RADIAN;
              const v1 = [ Math.cos(latRad) * Math.cos(lonRad), Math.cos(latRad) * Math.sin(lonRad), Math.sin(latRad) ];

              if(! isPointVisibleHemisphere(vCenter,v0)) { return; }
              if(! isPointVisibleHemisphere(vCenter,v1)) { return; }

              // Project the geographic coordinates using the Mercator projection
              // converted to x/y
              const p0 = projection([lon0,lat0]);
              const p1 = projection([lon1,lat1]);

              // check if valid
              if (!p0 || isNaN(p0[0]) || isNaN(p0[1])) { return; }
              if (!p1 || isNaN(p1[0]) || isNaN(p1[1])) { return; }

              const [x0,y0] = p0;
              const [x1,y1] = p1;

              // Move to or draw line to the projected coordinates
              // line
              context.beginPath();
              context.moveTo(x0, y0);
              context.lineTo(x1, y1);
              context.stroke();
            }
          });
        });
      });
    }

  });

  console.timeEnd('drawContours');  
}

export { createContours, drawContours, clearContours };
