/***
* magma earth - a 3D Earth web viewer project to visualize global seismic models
*
* Copyright (c) 2024 Daniel Peter
* MIT License - https://opensource.org/license/mit
***/

// renderer
//
// view rendering

// imports
import * as bumpMap from "./bumpMap.js";
import * as streamlines from "./streamlines.js";
import * as particles from "./particles.js";
import * as contours from "./contours.js";
import * as vectorField from "./vectorField.js";

// renderer state flags
let state = {
  showBumpMap: true,        // flag to turn on/off bumpMap rendering
  showVectorField: true,    // vector field texture
  showContours: false,      // contour lines
  showPlates: true,         // plate boundaries
  showStreamlines: false,   // streamlines
  showParticles: true,      // particles
  showEarthquakes: false    // earthquake locations
};

const graticule = d3.geoGraticule();
const grid = graticule();

const SPHERE = {type: "Sphere"};

//-------------------------------
// render view update
//-------------------------------
let visiblePoints = [];

function updateVisiblePoints(projection,width,height){
  // setup visible point coordinates
  //console.log(`updateVisiblePoints:`)

  // update particles
  if (state.showParticles) { particles.updateParticles(projection,width,height); }

  // check if anything left to do
  if (!state.showBumpMap && !state.showVectorField) return;

  console.time('updateVisiblePoints');

  // view bounds?
  /*
  let bounds = d3.geoPath().projection(projection).bounds({type: "Sphere"});
  console.log(`updateVisiblePoints: bounds`,bounds);

  // Create the sphere object, which represents the entire globe
  //const sphere = { type: "Sphere" };
  // Get the geographic bounds of the full globe (as visible in the current projection)
  //bounds = d3.geoBounds(sphere);
  //let geoBounds = d3.geoPath().projection(projection).geoBounds({type: "Sphere"}); - not working
  //console.log(`updateVisiblePoints: geo bounds`,bounds);

  // context for animation drawing
  const context = d3.select("#animation").node().getContext("2d");

  // Get the bounds of the visible area in geographic coordinates
  const topLeft = projection.invert([0, 0]); // Pixel coordinates (0, 0) -> top-left
  const bottomRight = projection.invert([context.canvas.width, context.canvas.height]); // Bottom-right

  // Display the geographic bounds for the current projection and context
  console.log("updateVisiblePoints: bounds geo points:", [topLeft, bottomRight]);
  */

  /* not working...
  // determine visibility based on clip angle
  function isPointVisible(lonLat) {
    const currentRotation = projection.rotate(); // [lon, lat, 0]
    const rotatedLon = lonLat[0] + currentRotation[0];
    const rotatedLat = lonLat[1] + currentRotation[1];

    // Check if the point is within the visible hemisphere
    return (rotatedLon >= -90 && rotatedLon <= 90 && rotatedLat >= -90 && rotatedLat <= 90);
  }
  */

  // get bounds of visible area
  /*
  let pointsBounds = [];

  // samples every 4-th pixel
  for (let iy = 0; iy < height; iy+=4){
    for (let ix = 0; ix < width; ix+=4){
      // point p = [lon,lat] with lon in [-180,180], lat in [-90,90]
      pointsBounds.push([ix,iy]);
    }
  }

  function getViewGeoBounds() {
    // determines min/max lon/lat-range for geographic points visible in View
    let lonMin = 360;
    let lonMax = -360;
    let latMin = 90;
    let latMax = -90;

    pointsBounds.forEach(point => {
        // gets lon/lat position
        const pos = projection.invert(point);
        // determines min/max
        if (pos != null) {
          lonMin = Math.min(lonMin,pos[0]);
          lonMax = Math.max(lonMax,pos[0]);
          latMin = Math.min(latMin,pos[1]);
          latMax = Math.max(latMax,pos[1]);
        }
        // makes sure min < max
        if (lonMax < lonMin) { let tmp = lonMax; lonMax = lonMin; lonMin = tmp; }
        if (latMax < latMin) { let tmp = latMax; latMax = latMin; latMin = tmp; }
      });

    return [[lonMin,latMin],[lonMax,latMax]];
  }

  function getViewXYBounds() {
    let ixMin = width;
    let ixMax = 0;
    let iyMin = height;
    let iyMax = 0;

    // gets [lonMin/latMin], [lonMax/latMax]
    const [[lon0,lat0],[lon1,lat1]] = getViewGeoBounds();

    // increments
    let dlon = (lon1 - lon0) / width;
    let dlat = (lat1 - lat0) / height;

    // fill points
    let pointsXY = [];
    // loops over all pixels of visible globe lon/lat
    for (let lat = lat0; lat < lat1; lat+=dlat){
      for (let lon = lon0; lon < lon1; lon+=dlon){
        pointsXY.push([lon,lat]);
      }
    }

    pointsXY.forEach(point => {
        // gets ix/iy position
        const pos = projection(point);
        // determines min/max
        if (pos != null) {
          ixMin = Math.min(ixMin,pos[0]);
          ixMax = Math.max(ixMax,pos[0]);
          iyMin = Math.min(iyMin,pos[1]);
          iyMax = Math.max(iyMax,pos[1]);
        }
        // makes sure min < max
        if (ixMax < ixMin) { let tmp = ixMax; ixMax = ixMin; ixMin = tmp; }
        if (iyMax < iyMin) { let tmp = iyMax; iyMax = iyMin; iyMin = tmp; }
      });

    return [[ixMin,iyMin],[ixMax,iyMax]];
  }
  */

  // Calculate the pixel distance from the center of the canvas to the clicked point
  function isPointClose(xy, width, height, scale) {
    const dx = xy[0] - width * 0.5;
    const dy = xy[1] - height * 0.5;

    //const distanceFromCenter = Math.sqrt(dx * dx + dy * dy);

    const distanceFromCenterSq = dx * dx + dy * dy;  // squared for speed

    // Determine if the point is outside the globe's radius
    //const scale = projection.scale();  // height / 2.1
    const scaleSq = scale * scale;

    // scale is enough, since globe is positioned such that it stays centered
    // scale = 238.0
    // globeRadius = 2.1

    // const globeRadius = height / scale; // Based on your projection scale

    //console.log(`render: point ix/iy = ${xy[0]}/${xy[0]} dx/dy = ${dx}/${dy} dist ${distanceFromCenter} globe ${globeRadius} $scale ${scale}`);

    // If the point is too far from the center, it's outside the globe
    return (distanceFromCenterSq <= scaleSq);
  }

  // update visible points
  visiblePoints = [];

  // full canvas pixel range
  const ix0 = 0, ix1 = width;
  const iy0 = 0, iy1 = height;

  // adapt sampling based on zoom
  // stronger zoom -> larger scale factor ~ [250,15000]
  const scale = projection.scale();

  let dx,dy;
  if (scale < 100) {
      // full globe size
      dx = 4; dy = 4;
  } else if (scale < 1000) {
      // zooming on hemisphere size
      dx = 2; dy = 2;
  } else if (scale < 5000) {
      // zooming on continent size
      dx = 2; dy = 1;
  } else {
      // zooming on country size
      dx = 1; dy = 1;
  }

  // loops over all pixels of canvas size width x height
  for (let iy = iy0; iy < iy1; iy+=dy){
    for (let ix = ix0; ix < ix1; ix+=dx){
      // point p = [lon,lat] with lon in [-180,180], lat in [-90,90]
      const p = projection.invert([ix,iy]);

      if (!p || isNaN(p[0]) || isNaN(p[1])) { continue; }

      // check if point is visible area - not working properly...
      //if (! isPointVisible(p)) { continue; }

      // check if point is visible area
      if (! isPointClose([ix,iy], width, height, scale)) { continue; }

      // lon = p[0];  lat = p[1];
      // lon in [-180,180] -> x in [0,1]
      const x = (p[0] + 180.0) / 360.0;
      // lat in [90,-90] -> y in [0,1]
      const y = (90.0 - p[1]) / 180.0;

      // store point for updating bumpMap and vectorField textures
      visiblePoints.push([ix,iy,x,y]);
    }
  }
  //console.log(`updateVisiblePoints: visible points = ${visiblePoints.length}`);

  // checks if anything left to do
  if (visiblePoints.length == 0) return;

  // bumpMap
  if (state.showBumpMap) {
    bumpMap.updateBumpMap(projection,width,height,visiblePoints,dx,dy);
  }

  // vector field texture map
  if (state.showVectorField) {
    vectorField.updateVectorField(projection,width,height,visiblePoints,dx,dy);
  }

  console.timeEnd('updateVisiblePoints');
}


//-------------------------------
// main renderer
//-------------------------------

function render(projection, context, path, transform, land, border, plates, quakes, use_hires) {
  //console.log(`render: use hires = ${use_hires}`);
  // timing
  if (use_hires) console.time('render: total time');

  //Current transform properties
  //console.log(`render: transform`,transform);
  //if (d3.event) {
  //  console.log(`render: event ${d3.event} d3.transform ${d3.event.transform}`);
  //  transform = d3.event.transform;
  //}
  transform = (d3.event && d3.event.transform) || transform;
  //console.log(`render: transform ${transform} k ${transform.k}`);

  // context for animation drawing
  const contextAnimation = d3.select("#animation").node().getContext("2d");

  const width = context.canvas.width;
  const height = context.canvas.height;

  // clean
  context.clearRect(0, 0, width, height);

  // clean animation drawing
  if (state.showStreamlines || !use_hires) {
    contextAnimation.clearRect(0, 0, width, height);
  }

  // Save
  context.save();

  // Move to current zoom
  context.translate(transform.x, transform.y);
  context.scale(transform.k, transform.k);

  // update current transform to pass along
  transform = d3.zoomTransform(d3.select("#navigation").node());

  // Sphere fill
  context.beginPath(), path(SPHERE), (context.fillStyle = '#000'), context.fill();

  // bump map texture
  if (use_hires && state.showBumpMap) {
    bumpMap.drawBumpMap(projection,context);
  }

  // draw vector field
  if (use_hires) {
    vectorField.drawVectorField(projection, context);
  }

  // contours
  if (use_hires && state.showContours) {
    contours.drawContours(projection, context, path, transform);
  }

  // plates
  if (plates) {
    plates.features.forEach(p => {
      if (p.properties.Type == 'subduction') {
        // subduction zone
        context.beginPath(), path(p), (context.strokeStyle = "rgba(100, 100, 120, 0.7)", context.lineWidth = 6), context.stroke();
      } else {
        // plate boundary
        context.beginPath(), path(p), (context.strokeStyle = "rgba(100, 100, 100, 0.7)", context.lineWidth = 3), context.stroke();
      }
    });
    //context.beginPath(), path(plates), (context.strokeStyle = "rgba(150, 100, 150, 0.7)", context.lineWidth = 3), context.stroke();
  }

  // back
  //projection.clipAngle(180);
  //context.beginPath(), path(land), (context.fillStyle = "#ccc"), context.fill();
  //context.beginPath(), path(borders), (context.strokeStyle = "#fff", context.lineWidth = .5), context.stroke();
  //context.beginPath(), path(SPHERE), (context.strokeStyle = "#000", context.lineWidth = 1), context.stroke();
  // Draw the Graticule
  //context.lineWidth = 1 / (transform.k < 1 ? 1 : transform.k);
  //context.beginPath(), path(grid), (context.strokeStyle = "rgba(0, 0, 0, 0.05)", context.lineWidth = .5), context.stroke();

  // front
  projection.clipAngle(90);
  if (use_hires) {
    //context.beginPath(), path(land), (context.fillStyle = "#779"), context.fill();
    context.beginPath(), path(land), (context.fillStyle = "rgba(80, 80, 80, 0.2)"), context.fill();
  }
  context.beginPath(), path(land), (context.strokeStyle = "#fff", context.lineWidth = 1), context.stroke(); // land lines
  //context.beginPath(), path(borders), (context.strokeStyle = "#fff", context.lineWidth = .5), context.stroke(); // country lines

  // Draw the Graticule
  //if (use_hires) {
  //  //context.lineWidth = 1 / (transform.k < 1 ? 1 : transform.k);
  //  context.beginPath(), path(grid), (context.strokeStyle = "rgba(0, 0, 0, 0.1)", context.lineWidth = .5), context.stroke();
  //}

  // streamlines
  if (use_hires && state.showStreamlines) {
    streamlines.drawStreamlines(projection, contextAnimation);
  }

  // sphere border
  context.beginPath(), path(SPHERE), (context.strokeStyle = "#999", context.lineWidth = 1), context.stroke();

  // Restore
  context.restore();

  // update svg element locations
  renderSVG(projection, quakes);

  // timing
  if (use_hires) console.timeEnd('render: total time');
}


function renderSVG(projection, quakes) {
  // only update SVG elements

  // update svg element locations
  const svg = d3.select("#navigation");

  const width = svg.attr("width");
  const height = svg.attr("height");

  // earthquakes
  svg.select('#earthquakes-gcmt')
        .selectAll("circle")
        //.data(quakes)
        //.join("circle")
        .attr("cx", d => projection(d.geometry.coordinates)[0])  // X position based on projection
        .attr("cy", d => projection(d.geometry.coordinates)[1])
        .attr("display", d => {
            // check if anything to show
            if (!state.showEarthquakes) { return "none"; }
            // Check if the point is visible within the orthographic projection
            function isVisibleLocation(pointLon,pointLat) {
              // hemisphere check
              function isPointVisibleHemisphere(v0,v1) {
                // dotProduct is > 0 for points in same hemisphere
                const dotProduct = v0[0] * v1[0] + v0[1] * v1[1] + v0[2] * v1[2];
                return (dotProduct > 0.1); // let's use > 0 to avoid circle on the outer rim of the sphere
              }
              function getPositionVector(lon,lat){
                const DEGREE_TO_RADIAN = Math.PI / 180;
                const lonRad = lon * DEGREE_TO_RADIAN;
                const latRad = lat * DEGREE_TO_RADIAN;
                return [ Math.cos(latRad) * Math.cos(lonRad), Math.cos(latRad) * Math.sin(lonRad), Math.sin(latRad) ];
              }
              // determine lon/lat of center point
              const pCenter = projection.invert([Math.floor(width * 0.5),Math.floor(height * 0.5)]);
              // check if valid
              if (!pCenter || isNaN(pCenter[0]) || isNaN(pCenter[1])) { return false; }
              // center vector
              const vCenter = getPositionVector(pCenter[0],pCenter[1]);
              // current position vector
              const v = getPositionVector(pointLon,pointLat);
              // return visibility
              return isPointVisibleHemisphere(vCenter,v);
            }
            // current circle position
            const p = [ d.geometry.coordinates[0], d.geometry.coordinates[1]];
            // check if visible
            if (! isVisibleLocation(p[0],p[1])) return "none";
            // x/y pixel position
            const coords = projection(p);
            // check if valid
            return (coords && coords[0] && coords[1]) ? null : "none"; // Hide points outside visible area
          });

  // hotspot circle elements
  svg.selectAll('path')
      .attr('d', d3.geoPath(projection));
}


export { render, renderSVG, updateVisiblePoints, state};

