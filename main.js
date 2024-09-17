/***
* 3D Earth tomo viewer - project to visualize global seismic models
*
* Copyright (c) 2024 Daniel Peter
* MIT License - https://opensource.org/license/mit
***/

// main routine
//
// 3D Earth viewer as d3 visualization example

import * as vectorField from "./js/vectorField.js";
import * as streamlines from "./js/streamlines.js";
import * as particles from "./js/particles.js";
import * as bumpMap from './js/bumpMap.js';
import * as renderer from './js/renderer.js';

// country data
const dataPath1 = "./data/world-110m.json";
const dataPath2 = "./data/world-50m.json";

// plate boundaries
const plateFile = './data/plate_boundaries.geojson'

// hot spots
const hotspotsFile = './data/geological_hotspots.geojson'

// earthquakes
const earthquakesFile = './data/usgs_query_gcmt_1976-2024_depth125-175km.json'


//-------------------------------
// main entry
//-------------------------------

// let's begin
console.log('starting...');

// canvas size
let width = 800, height = 600;

// get current window size
function getCurrentViewSize(){
  // gets window size
  const w = window; // window size
  const d = document && document.documentElement; // document size
  const b = document && document.getElementsByTagName("body")[0]; // body size
  width = w.innerWidth || d.clientWidth || b.clientWidth;
  height = w.innerHeight || d.clientHeight || b.clientHeight;

  // minimum size 500 px
  //if (width < 500) { width = 500; }
  //if (height < 500) { height = 500; }

  return { width, height };
}

function isMobileDevice() {
  // check mobile agents
  return (/Mobi|Android|iemobile|ipad|iphone|ipod|opera mini|webos/i).test(navigator.userAgent);
}

const isMobile = isMobileDevice();
if (isMobile) console.log('[mobile version]');

// set canvas size
({ width, height} = getCurrentViewSize());
d3.selectAll(".fill-screen").attr("width", width).attr("height", height);

// globe rendering
const contextGlobe = d3.select("#globe").node().getContext("2d");

// 3D projection
const projection = d3.geoOrthographic()
    .scale(height / 2.1)
    .translate([width / 2, height / 2])
    .clipAngle(90)
    .precision(0.6); // higher precision for lines -> smaller precision value? default ~ 0.7

// path for canvas
const path = d3.geoPath()
    .projection(projection)
    .context(contextGlobe);

// animation rendering
const contextAnimation = d3.select("#animation").node().getContext("2d");

// turn off smoothing on animation canvas
//try {
//  // Disable image smoothing in JavaScript
//  contextAnimation.imageSmoothingEnabled = false;
//} catch(error) {
//  console.error(error);
//}

// view zoom-in
let transform = d3.zoomIdentity;

//-------------------------------
// particles
//-------------------------------

// setup vector field
vectorField.setupVectorField().then(() => {
  // update menu state
  // model
  const model = vectorField.getModelSelection();
  highlightModelItem(model);
  // color
  const colorname = vectorField.getColorSelection();
  highlightColorItem(colorname);
});


//-------------------------------
// topography image
//-------------------------------

if (isMobile) {
  // mobile version
  // no bump map texture rendering for now - too heavy for mobiles
  renderer.state.showBumpMap = false;
} else {
  // setup bump map texture
  bumpMap.createBumpMap();
}

//-------------------------------
// view updates
//-------------------------------

// flag to indicate transition is rendering to avoid interference of full view updates
let viewUpdatesTransition = false;
let viewUpdatesZoom = false;
let modelGroup = null;

//-------------------------------
// promises
//-------------------------------

// data
let land = null, borders = null;
let landLowRes = null, bordersLowRes = null;
let plates = null, quakes = null;
let hotspots = null;

// all data loads
const promises = [ d3.json(dataPath1),
                   d3.json(dataPath2),
                   d3.json(plateFile),
                   d3.json(hotspotsFile),
                   d3.json(earthquakesFile)
                  ];

// loads world, plate, hotspots, earthquake data
Promise.all(promises).then((data) => {
  // get data arrays
  const world110 = data[0];
  const world = data[1];

  plates = data[2];       // plate boundaries
  hotspots = data[3];     // hotspot locations

  const earthquakes = data[4];  // earthquake locations within 125-175km depth

  // land
  // fine resolution
  land = topojson.feature(world, world.objects.land);
  borders = topojson.mesh(world, world.objects.countries, function(a, b) { return a !== b; });
  // coarse resolution
  landLowRes = topojson.feature(world110, world110.objects.land);
  bordersLowRes = topojson.mesh(world110, world110.objects.countries, function(a, b) { return a !== b; });


  // let's add earthquakes and hotspots to the SVG window element
  const pathGenerator = d3.geoPath(projection); //.projection(projection);
  const svg = d3.select("#navigation");

  // earthquake locations
  if (earthquakes.features.length > 0) {
    console.log(`Promises: earthquakes: `,earthquakes.features.length);

    // earthquakes
    quakes = earthquakes.features; // or limited subset: earthquakes.features.slice(0,2);
    // for fun: older events have smaller 'time' property
    quakes.sort((a, b) => d3.descending(a.properties.time, b.properties.time));

    // too slow...
    //// multipolygon object w/ geo circles for SVG drawing
    //const quakes = (() => {
    //  const coordinates = [];
    //  events.forEach(d => {
    //    let radiusDeg = 0.2; // degree
    //    const magnitude = d.properties.mag;
    //    if (magnitude != null) radiusDeg *= magnitude;
    //    const [lon,lat,depth] = d.geometry.coordinates;
    //    // since tomo slices are at 150 km depth, let's focus on earthquakes in that depth range
    //    //if (depth >= 125 && depth <= 175)
    //    const circle = d3.geoCircle().center([lon,lat]).radius(radiusDeg).precision(10);
    //    // stores coordinates
    //    coordinates.push(circle().coordinates);
    //  });
    //  return {type: "MultiPolygon", coordinates};
    //})();
    ////console.log('quakes:',quakes);
    //// merged - but too slow...
    //svg.append("g")
    //    .attr('id','earthquakes-gcmt')
    //    .attr("fill", "#888")
    //    .attr("fill-opacity", 0.2)
    //    .attr("stroke", "#888")
    //    .attr("stroke-opacity", 0.5)
    //    .attr("stroke-width", 0.5)
    //    .selectAll('path')
    //    .data([quakes])
    //    .enter()
    //    .append("path")
    //    .attr("d", d => { pathGenerator(d)});

    // add quakes as circle objects
    svg.append("g")
        .attr('id','earthquakes-gcmt')
        .attr("fill", "#222")
        .attr("fill-opacity", 0.5)
        .attr("stroke", "#aaa")
        .attr("stroke-width", 0.5)
        .selectAll()
        .data(quakes)
        //.enter()
        //.append("circle")
        .join("circle")
        .attr("cx", d => projection(d.geometry.coordinates)[0])  // X position based on projection
        .attr("cy", d => projection(d.geometry.coordinates)[1])  // Y position based on projection
        .attr("r", d => 0.7 * d.properties.mag)
        .attr("display", "none");               // hide initially
        //.append("title")                     // adds tooltip info
        //.text(d => `${d.properties.title}`);
  } // earthquakes

  // hotspots
  if (hotspots.features.length > 0) {
    console.log(`Promises: hotspots: `, hotspots.features.length);

    //let hotspotPoints = [];
    //hotspots.features.forEach(({ properties, geometry }) => {
    //  console.log(`hotspot: name ${properties.name}`);
    //  console.log(`hotspot:   point ${geometry.coordinates[0]} ${geometry.coordinates[1]}`);
    //  hotspotPoints.push( {properties, geometry} );
    //  });

    // geo circles for SVG drawing
    let circles = [];
    hotspots.features.forEach(d => {
      const radiusDeg = 1.5; // 1.5 degrees
      const circle = d3.geoCircle().center(d.geometry.coordinates).radius(radiusDeg).precision(10);
      let polygon = circle();
      // add name
      polygon.properties = { name: d.properties.name };
      // store object
      circles.push(polygon);
    });
    //console.log(`circles:`,circles);

    // add hotspots circles with mouse-over effect
    svg.append("g")
        .attr('id','hotspots')
        .selectAll('path')
        .data(circles)  // Bind the circle GeoJSON data
        .enter()
        .append('path')
        .attr('d', d => pathGenerator(d))
        .attr('stroke', 'rgba(103, 100, 50, 0.5)') // Stroke color
        .attr('stroke-width', 6) // Line width
        .attr('fill', 'rgba(103, 100, 50, 0.0)')
        .on("mouseover", function(event, d) {
          // On mouseover, display the name
          //console.log(`mouseover: `,d,'event',event);
          d3.select(this)
              .attr("stroke", "orange")
              .attr('fill', 'rgba(103, 100, 50, 0.7)'); // Highlight the circle

          // get centroid
          const points = d.coordinates[0]; // points array
          const center = d3.polygonCentroid(points);

          // tooltip text position
          let x = 10,y = 20;
          let anchor = "start";

          if (!center || ! isNaN(center[0]) || ! isNaN(center[1])){
            // set centroid position
            //const [lon,lat] = center;
            // Project the geographic coordinates to SVG coordinates
            const [x0, y0] = projection(center); // projection([lon,lat])

            // text offset
            const textwidth = d.properties.name.length * 10; // assuming 10 pixel size per character

            // text position
            let x2,y2; // tooltip line end point
            if (x0 < width/2) {
              // left border, same height as center
              x = 10
              y = y0;
              x2 = x + textwidth;
              y2 = y0;
              anchor = "start";
            } else {
              // right border
              x = width - 10;
              y = y0;
              x2 = x - textwidth;
              y2 = y0;
              anchor = "end";
            }

            // tooltip line
            svg.append('line')
              .attr('x1', x0)
              .attr('y1', y0)
              .attr('x2', x2)
              .attr('y2', y2)
              .attr("id", "tooltip-line")
              .attr('stroke', '#aaa')
              .attr('stroke-width', '1px')
              //.attr('stroke-linecap', 'round')
              .transition()
              .duration(2000);
          }

          // Append a text element for the name
          svg.append("text")
             .attr("x", x)
             .attr("y", y)
             .attr("id", "tooltip")
             .attr("text-anchor", anchor)
             .attr("font-size", "18px")
             .attr("fill", "white")
             .text(d.properties.name);  // Show the name from the data
        })
        .on("mouseout", function() {
          //console.log(`mouseout: `);
          d3.select(this)
              .attr('stroke', 'rgba(103, 100, 50, 0.5)')
              .attr("fill", 'rgba(103, 100, 50, 0.0)'); // Reset the circle color
          // Remove the text element when mouseout
          d3.select("#tooltip").remove();
          d3.select("#tooltip-line").remove();
        });
  } // hotspots

  // move globe view to a country
  const rotateViewToCountry = false;

  if (rotateViewToCountry) {
    const countries = topojson.feature(world, world.objects.countries).features;
    // let's find switzerland
    console.log(`Promises: countries:`,countries.length);
    let id = 0;
    const countryName = 'Switzerland'; // or 'Samoa',.. default: 'Switzerland'
    for (let i = 0; i < countries.length; i++){
      //console.log(`country: ${i} name ${countries[i].properties.name}`);
      if (countries[i].properties.name == countryName) {
        // found country
        id = i;
        console.log(`Promises: countries: name: ${countries[i].properties.name} id ${i} `);
      }
    }
    // focus on an initial country
    transition(d3.geoCentroid(countries[id]));
  }

  //-------------------------------
  // rotating globe
  //-------------------------------

  function transition(p) {
    (d3.transition()
        .duration(850)
        .tween("rotate", () => onRotate(p))
        .on("start", () => {
            //console.log("transition: start");
            // view starts rendering transition
            viewUpdatesTransition = true;
          })
        //.on("end", () => {
            //console.log("transition: end");
        //  })
        .end()).then(() => {
            //console.log("transition: done");
            // update visible points
            renderer.updateVisiblePoints(projection, width, height);
            // rendering
            renderer.render(projection, contextGlobe, path, transform, land, borders, plates, quakes, true);
            // view is done with rendering transition
            viewUpdatesTransition = false;
          });
  }

  function onRotate(p) {
    //console.log(`onRotate: p ${p}`);
    const r = d3.interpolate(projection.rotate(), [-p[0], -p[1]]);

    return function(t) {
      //console.log(`transition: rotate t ${t}`);
      // rotation
      projection.rotate(r(t));
      // rendering
      renderer.render(projection, contextGlobe, path, transform, landLowRes, bordersLowRes, plates, quakes, false);
    };
  }


  //-------------------------------
  // model info - svg element
  //-------------------------------

  // text element to show model info
  modelGroup = (() => {
    const name = vectorField.getModelName();
    const depth = vectorField.getModelDepth();

    // right side
    const x = width - 20;
    const y = height - 120;
    const anchor = 'end';

    const modelGroup = d3.select('#navigation')
      .append("g")
      .attr("transform", `translate(${x}, ${y})`)
      .attr('text-anchor', anchor)
      .attr('id', 'info');

    const modelTextName = modelGroup.append('text')
      .style('fill','#aaa')
      .style('font-size','2em')
      .attr('id', 'info-model-name')
      .text(name);

    const modelTextDepth = modelGroup.append('text')
      .attr('y', 25)
      .style('fill','#777')
      .style('font-size','1em')
      .attr('id', 'info-model-depth')
      .text(depth);

    // Get the bounding box of the combined text elements (after it was rendered)
    function updateGroup() {
      setTimeout(() => {
        // Remove old line and rect if they exist
        modelGroup.selectAll('line').remove();
        modelGroup.selectAll('rect').remove();

        const bbox = modelGroup.node().getBBox();

        modelGroup.append("line")
          .attr("x1", bbox.x)
          .attr("y1", 8)
          .attr("x2", bbox.x + bbox.width)
          .attr("y2", 8)
          .attr("stroke", "#aaa")
          .attr("stroke-width", 2)
          .attr('stroke-linecap', 'round');

        // rectangle to serve as the background (inside the group)
        modelGroup.insert("rect", "text")
            .attr("x", bbox.x - 10)
            .attr("y", bbox.y - 10)
            .attr("width", bbox.width + 20)
            .attr("height", bbox.height + 20)
            .attr("rx", 10)  // Rounded corners
            .attr("ry", 10)
            //.style("stroke", "#aaa")  // Border color
            //.style("stroke-width", 1)
            .style("fill", "rgba(0,0,0,0.4)");  // Background color

      }, 0);
    }
    updateGroup();

    return { group: modelGroup,
             updateName: () => {
                            // get new name/depth
                            const name = vectorField.getModelName();
                            const depth = vectorField.getModelDepth();
                            modelTextName.text(name);
                            modelTextDepth.text(depth);
                            // update
                            updateGroup(); }
           };
  })();


  //-------------------------------
  // zoom-in
  //-------------------------------

  // https://observablehq.com/@d3/versor-zooming?collection=@d3/d3-zoom
  // single mouse click will trigger a 'zoomstarted' and end.render
  // check time between trigger and end to determine if we need to render
  let zoomStartedTime = d3.now();
  let zoomStartedProj = { scale: projection.scale(), rotation: projection.rotate() };

  //d3.select(context.canvas)
  d3.select("#navigation")
    .call(zoom(projection)
        .on("zoom.render", () => {
            //console.log(`zoom: zoom.render`);
            renderer.render(projection, contextGlobe, path, transform, landLowRes, bordersLowRes, plates, quakes, false);
          })
        .on("end.render", () => {
            //console.log(`zoom: end.render: zoomStartedTime ${zoomStartedTime} now ${d3.now()}`);

            // checks if zoom event had enough duration, otherwise it was just a single click...
            const reactionTime = 10; // in millisec
            if ((d3.now() - zoomStartedTime) > reactionTime) {
              // check if projection changed?
              // a long click down will trigger an update, even if the projection didn't change
              // however, the check here won't work if the view is zoomed in already and the double click is used to move left/right
              ////console.log(`zoom: end.render: scale zoomStartedProj ${zoomStartedProj.scale} projection ${projection.scale()}`);
              //const tolerance = 1.e-5;
              //if (Math.abs(projection.scale() - zoomStartedProj.scale) < tolerance){
              //  const rdiff0 = Math.abs(projection.rotate()[0] - zoomStartedProj.rotate[0]);
              //  const rdiff1 = Math.abs(projection.rotate()[1] - zoomStartedProj.rotate[1]);
              //  const rdiff2 = Math.abs(projection.rotate()[2] - zoomStartedProj.rotate[2]);
              //  //console.log(`zoom: end.render: rotate diff ${rdiff0} ${rdiff1} ${rdiff2} zoomStartedProj ${zoomStartedProj.rotate} projection ${projection.rotate()}`);
              //  if (Math.max(rdiff0,rdiff1,rdiff2) < tolerance) { return; }
              //}
              // update visible points
              renderer.updateVisiblePoints(projection, width, height);
              // rendering
              renderer.render(projection, contextGlobe, path, transform, land, borders, plates, quakes, true);
            }
            // resume animation rendering
            viewUpdatesZoom = false;
            // restart animation
            //restartAnimation();
          }))
    .call(() => {
      //console.log(`navigation: call()`);
      renderer.render(projection, contextGlobe, path, transform, land, borders, plates, quakes, true);
    })
    .node();

  function zoom(projection, {
    // Capture the projection’s original scale, before any zooming.
    scale = projection._scale === undefined
      ? (projection._scale = projection.scale())
      : projection._scale, scaleExtent = [0.8, 20]
  } = {}) {
    let v0, q0, r0, a0, tl;

    const zoom = d3.zoom()
        .scaleExtent(scaleExtent.map(x => x * scale))
        .on("start", zoomstarted)
        .on("zoom", zoomed);

    function point(event, that) {
      const t = d3.pointers(event, that);

      if (t.length !== tl) {
        tl = t.length;
        if (tl > 1) a0 = Math.atan2(t[1][1] - t[0][1], t[1][0] - t[0][0]);
        zoomstarted.call(that, event);
      }

      return tl > 1
        ? [
            d3.mean(t, p => p[0]),
            d3.mean(t, p => p[1]),
            Math.atan2(t[1][1] - t[0][1], t[1][0] - t[0][0])
          ]
        : t[0];
    }

    function zoomstarted(event) {
      //console.log(`zoom: zoomstarted`);
      // set start time
      zoomStartedTime = d3.now();
      zoomStartedProj = { scale: projection.scale(), rotate: projection.rotate() };

      // stop animation
      viewUpdatesZoom = true;
      //stopAnimation();
      //renderer.state.showParticles = false;

      // update versor
      v0 = versor.cartesian(projection.invert(point(event, this)));
      q0 = versor((r0 = projection.rotate()));
    }

    function zoomed(event) {
      //console.log(`zoom: zoomed`);
      // update projection zoom
      projection.scale(event.transform.k);

      const pt = point(event, this);
      // Cartesian coordinates [x, y, z] given spherical coordinates [lambda, phi]
      const v1 = versor.cartesian(projection.rotate(r0).invert(pt));
      // quaternion to rotate between two cartesian points on the sphere
      const delta = versor.delta(v0, v1);
      // quaternion that represents q0 * delta
      let q1 = versor.multiply(q0, delta);

      //console.log(`zoomed: point ${pt} quaternion delta ${delta}`);

      // For multitouch, compose with a rotation around the axis.
      if (pt[2]) {
        //console.log(`zoomed: multitouch point ${pt}`);
        const d = (pt[2] - a0) / 2;
        const s = -Math.sin(d);
        const c = Math.sign(Math.cos(d));
        q1 = versor.multiply([Math.sqrt(1 - s * s), 0, 0, c * s], q1);
      }
      // rotate globe, using the Euler rotation angles [lambda, phi, gamma] returned for the given quaternion q1
      projection.rotate(versor.rotation(q1));

      // In vicinity of the antipode (unstable) of q0, restart.
      if (delta[0] < 0.7) zoomstarted.call(this, event);
    }

    return Object.assign(selection => selection
        .property("__zoom", d3.zoomIdentity.scale(projection.scale()))
        .call(zoom), {
      on(type, ...options) {
        return options.length
            ? (zoom.on(type, ...options), this)
            : zoom.on(type);
      }
    });
  }

  // not used...
  //function onZoom(event){
  //  console.log(`zoom: event ${event} ${event.transform}`);
  //
  //  canvas.attr("transform", event.transform);
  //
  //  const pointer = d3.pointer(event,this);
  //  const p = projection.invert(pointer);
  //  console.log(`onZoom: pointer ${pointer} position p = ${p}`);
  //
  //  if (!p || isNaN(p[0]) || isNaN(p[1])) { return false; }
  //
  //  // set current transform
  //  transform = event.transform;
  //
  //  // no translation, only scale (transform.k)
  //  transform.x = 0;
  //  transform.y = 0;
  //
  //  // update view
  //  renderer.render(projection, context, path, transform, land, borders, plates, quakes, true);
  //}

}); // Promises



//-------------------------------
// canvas view function
//-------------------------------

// clearing function
function clearContexts(){
  // clear both contexts, for globe & animation drawing
  contextGlobe.clearRect(0, 0, contextGlobe.canvas.width, contextGlobe.canvas.height);
  contextAnimation.clearRect(0, 0, contextAnimation.canvas.width, contextAnimation.canvas.height);
}

// view rendering
function updateFullView(){
  // streamlines
  //streamlines.updateStreamlines();

  // check flag to see if transition is still rendering
  if (viewUpdatesTransition) return;

  // check flag to see if transition is still rendering
  if (viewUpdatesZoom) return;

  // new drawing
  clearContexts();

  // update visible points
  renderer.updateVisiblePoints(projection, width, height);

  // update view with full details
  renderer.render(projection, contextGlobe, path, transform, land, borders, plates, quakes, true);
}



//-------------------------------
// particle animation
//-------------------------------

// animation timer updates
const tickDuration = 100; // in millisec

let animationStartTime = d3.now();
let animationLastTime = 0;
let animationCancel = false;
let animationRunning = false;

function startAnimation(){
  console.log(`startAnimation:`);

  // check if gradient vector field is ready
  if (!vectorField.isGradientValid()) return;

  // check if animation is already running
  if (animationRunning) return;

  // turn on particle rendering
  //renderer.state.showParticles = true;

  // update view range - already done?
  //renderer.updateVisiblePoints(projection, width, height);
  // render globe canvas
  //renderer.render(projection, contextGlobe, path, transform, land, borders, plates, quakes, true);

  // set start time
  animationStartTime = d3.now();
  animationCancel = false;

  // animate, move & draw particles
  // to avoid multi-frame delay between the initial call and callbacks
  // see: https://developer.mozilla.org/en-US/docs/Web/API/Window/requestAnimationFrame
  requestAnimationFrame(firstFrame);
  // instead of directly
  //requestAnimationFrame(doAnimationFrame);

  //console.log(`startAnimation: request animation frame ${animationStartTime}`);
}

function firstFrame(timestamp) {
  // to avoid multi-frame delay between the initial call and callbacks
  animationStartTime = timestamp;

  // animate, move & draw particles
  // subsequent callbacks
  doAnimationFrame(timestamp);
}

function stopAnimation(){
  //console.log(`stopAnimation:`);
  animationCancel = true;
}

function restartAnimation(){
  animationCancel = false;
  animationLastTime = 0;
  startAnimation();
}

function doAnimationFrame(currentTime) {
  //console.log(`doAnimationFrame: currentTime ${currentTime}`);

  // set flag
  animationRunning = true;

  // Calculate the time since the last frame
  const deltaTime = currentTime - animationLastTime;

  if (deltaTime >= tickDuration) {
    // move particles and redraw canvas
    //console.log(`doAnimationFrame: current time ${currentTime} delta ${deltaTime}`);

    // check if vector field ready
    if (vectorField.isGradientValid()) {
      // render when no zooming/transitioning on globe
      if (! (viewUpdatesTransition || viewUpdatesZoom) ) {
        // move particles
        particles.moveParticles();
        // render animation canvas
        particles.drawParticles(projection, contextAnimation, width, height);
      }
    }

    // Reset the lastTime
    animationLastTime = currentTime;
  }

  const elapsed = d3.now() - animationStartTime;

  // stop after 300 sec
  if (elapsed > 300 * 1000) {
    //console.log(`doAnimationFrame: stop elapsed ${elapsed}`);
    animationCancel = true;
  }

  // check if we cancelled the animation
  if (animationCancel) {
    // set flag
    animationRunning = false;
  } else {
    // Request the next frame
    requestAnimationFrame(doAnimationFrame);
  }
}

// looks too choppy ...
//// ticker
//let animationTicker = null;
//
//function startAnimation(){
//  console.log(`startAnimation:`);
//  if (animationTicker == null) {
//    console.log(`startAnimation: create ticker`);
//    animationTicker = d3.interval(onAnimationTicker, tickDuration, 2000);  // start after 200 ms
//  }
//  // set start time
//  animationStartTime = d3.now();
//  // turn on particle rendering
//  //renderer.state.showParticles = true;
//}
//
//function stopAnimation(){
//  console.log(`stopAnimation:`);
//  if (animationTicker != null) {
//    animationTicker.stop();
//    animationTicker = null;
//  }
//}
//
//function restartAnimation(){
//  if (animationTicker != null) {
//    console.log(`restartAnimation: restart ticker`);
//    animationTicker.stop();
//    animationTicker = null;
//  }
//  console.log(`restartAnimation: re-create ticker`);
//  animationTicker = d3.interval(onAnimationTicker, tickDuration, 2000);  // start after 100 ms
//  // reset start time
//  animationStartTime = d3.now();
//  //renderer.state.showParticles = true;
//}
//
//function onAnimationTicker() {
//  //console.log(`onAnimationTicker: elapsed ${elapsed}`);
//  // move particles
//  //if (renderer.state.showParticles) {
//    // updates particle positions
//    particles.moveParticles();
//    // rendering
//    //renderer.render(projection, context, path, transform, land, borders, plates, quakes, true);
//    // only render to animation canvas
//    particles.drawParticles(projection, contextAnimation, width, height);
//  //}
//
//  const elapsed = d3.now() - animationStartTime;
//
//  // stop after 15 sec
//  if (elapsed > 15000) {
//    console.log(`onAnimationTicker: stop elapsed ${elapsed}`);
//    animationTicker.stop();
//    animationTicker = null;
//  }
//}



//-------------------------------
// window events
//-------------------------------

// automatically adjust size when resizing browser window
window.addEventListener('resize', onResize);

// resizing window
let timeoutResize = null;

function onResizeDone(){
  // Haven't resized in 100ms!
  //console.log(`onResizeDone: width/height = ${width}/${height}`);
  updateFullView();
  // restart animation
  restartAnimation();
}

function onResize() {
  //console.log(`onResize: width/height = ${width}/${height}`);

  // set time out to detect when resizing is done
  clearTimeout(timeoutResize);
  timeoutResize = setTimeout(onResizeDone, 100);    // timeout after 100 ms

  // gets window size
  getCurrentViewSize();

  //console.log(`onResize: new width/height = ${width}/${height}`);

  // canvas size
  //canvas.attr('width', width).attr('height', height);
  d3.selectAll(".fill-screen").attr("width", width).attr("height", height);

  // re-scale
  //projection.scale(height / 2.1)

  // re-position
  projection.translate([width / 2, height / 2]); // position in the middle

  //projection.fitExtent([[10, 10],[width - padding, height - padding]]);

  // re-position text element on right side
  const x = window.innerWidth - 20;
  const y = window.innerHeight - 120;
  modelGroup.group.attr("transform", `translate(${x}, ${y})`);

  // stop animation
  stopAnimation();

  // update view
  renderer.render(projection, contextGlobe, path, transform, landLowRes, bordersLowRes, plates, quakes, false);
}

// get mouse click events - not used yet...
//
//d3.select("#navigation").on("mousedown", onMapClick);
//d3.select("#navigation").on("touchstart", onMapClick);
//// or on canvas elements
////canvas.on("mousedown", onMapClick);
////canvas.on("touchstart", onMapClick);
//
//function onMapClick(event) {
//  // gets mouse position
//  const pointer = d3.pointer(event,this);
//  const p = projection.invert(pointer);
//
//  console.log(`[onMapClick]: pointer ${pointer} position p = ${p}`);
//
//  if (!p || isNaN(p[0]) || isNaN(p[1])) { return false; }
//
//  // Can't apply transformations unless scale 1
//  //if (transform.k !== 1) { return false; }
//
//  // rotate towards position p
//  //stopAnimation();
//  ////renderer.state.showParticles = false;
//
//  //transition(p);
//  //restartAnimation();
//  //renderer.state.showParticles = true;
//}



//-------------------------------
// custom events
//-------------------------------

// custom event for updating view
function onUpdate(event) {
  console.log('[onUpdate]:',event.detail);

  // onUpdate is triggered by bumpMap, vectorField and contours when those textures are available
  updateFullView();

  // bump map will add an "all done" to the message to indicate it finished processing
  let message = event.detail;

  // indicate progress
  let progress = progressBar_progress;
  if (message.includes("bumpDone")) {
    if (message.includes("all done")) {
      progress = 100;
    } else {
      progress = 50;
    }
    window.dispatchEvent(new CustomEvent('progress', { detail: progress }));
  }

  if (message.includes("hillshadeDone")) {
    if (message.includes("all done")) {
      if (progress < 100) {
        progress = 100;
        window.dispatchEvent(new CustomEvent('progress', { detail: progress }));
      }
    }
  }

  // mobile version has no bump map texture loads - listen to contours
  if (isMobile){
    if (message.includes("contoursDone")){
      if (progress < 100) {
        progress = 100;
        window.dispatchEvent(new CustomEvent('progress', { detail: progress }));
      }
    }
  }

  // check for "all done" to start animation
  if (message.includes("all done") ||
      (progressBar_progress >= 100 && vectorField.isGradientValid()) ||
      (isMobile && message.includes("contoursDone"))) {
    // start animation when gradient field done
    startAnimation();
  }
}

// Add an event listener for the 'update' event
window.addEventListener('update', onUpdate);



//-------------------------------
// progress bar
//-------------------------------

// custom event for updating progress bar
function onProgress(event){
  //console.log('[onProgress]:',event);
  //console.log('[onProgress]: event detail',event.detail);

  // set progress
  if (progressBar_progress < event.detail) {
    progressBar_progress = event.detail;
  }

  showProgressBar(progressBar_progress);

  // check if all done
  if (progressBar_progress == 100){
    // remove progress bar
    removeProgressBar();
  }
}

// Add an event listener for the 'progress' event
window.addEventListener('progress', onProgress);

// Set up SVG dimensions
const progressBar_width = 200;
const progressBar_x0 = 20, progressBar_y0 = 250;

let progressBar_progress = 5;

// Create the actual progress bar (starting with width 0)
const progressBar = d3.select('#navigation')
  .append('line')
  .attr('x1', progressBar_x0)
  .attr('y1', progressBar_y0)
  .attr('x2', progressBar_x0 + (progressBar_progress / 100) * progressBar_width)
  .attr('y2', progressBar_y0)
  .attr('stroke', '#777')
  .attr('stroke-width', '3px')
  .attr('stroke-linecap', 'round');

// Add a text element to show the progress percentage
const progressText = d3.select('#navigation')
  .append('text')
  .attr('x', progressBar_x0)
  .attr('y', progressBar_y0)
  .attr('dy', -10)
  .attr('text-anchor', 'start')
  .style('fill','#aaa')
  .style('font-family','Helvetica,Arial,sans-serif')
  .style('font-size','1em')
  .text('loading data...');

// Simulate loading or processing data
function showProgressBar(progress) {
  // check
  if (!progressBar || progressBar_progress > 100) return;

  // Update the width of the progress bar based on the current progress
  const target = progressBar_x0 + (progress / 100) * progressBar_width;

  // Animate the progress line from current x2 to the new value
  progressBar
    .transition()
    .ease(d3.easeLinear)
    .duration(1500)  // animation duration
    .attr('x2', target);

  //progressBar.attr('width', (progress / 100) * progressBar_width);
  //progressBar.attr('x2', target);

  // Update the text to show the current progress
  if (progress >= 50) { progressText.text('processing...'); }
}

function removeProgressBar(){
  // done
  progressBar.attr('width', progressBar_width);
  progressText.text('done');

  // fade out
  progressText
    .transition()
    .duration(1000)
    .ease(d3.easeLinear)
    .style("opacity", 0);

  progressBar
    .transition()
    .duration(1000)
    .ease(d3.easeLinear)
    .style("opacity", 0)
    .end().then(() =>{
      // remove elements
      progressBar.remove();
      progressText.remove();
    });
}

// Use d3.interval to simulate data loading and update progress
const interval = d3.interval(function() {
  // Increment the progress
  progressBar_progress += 5;

  // progress on the window object
  window.dispatchEvent(new CustomEvent('progress', { detail: progressBar_progress }));

  // Update the progress line and text
  //showProgressBar(progressBar_progress);

  // Stop the interval when progress reaches 100%
  if (progressBar_progress >= 100) {
    interval.stop();  // Stop the interval
  }
}, 1000);  // Update every 1 second (1000ms)



//--------------------------------
// menu handling
//--------------------------------

// toggling the menu
const hamburger = document.getElementById('hamburger');
const cross = document.getElementById('cross');
const menu = document.getElementById('menu');

hamburger.addEventListener('click', () => {
  menu.classList.toggle('show');
  // or menu.style.display = 'block';   // Show the menu
  //hamburger.style.display = 'none';  // Hide the hamburger icon
  //cross.style.display = 'block';   // Show the cross icon

  hamburger.classList.add('active');  // Add the active class to hamburger for animation
  cross.classList.add('active');      // Show cross icon with animation

  setTimeout(() => {
    hamburger.style.display = 'none';  // Hide the hamburger icon after animation
    cross.style.display = 'block';     // Show the cross icon
  }, 200); // Delay matching the transition duration

});

cross.addEventListener('click', () => {
  menu.classList.toggle('show');
  // or menu.style.display = 'none';    // Hide the menu
  //cross.style.display = 'none';   // Hide the cross icon
  //hamburger.style.display = 'block';  // Show the hamburger icon

  cross.classList.remove('active');  // Remove active class to trigger cross transition
  hamburger.classList.remove('active');  // Prepare hamburger for reappearance

  setTimeout(() => {
    cross.style.display = 'none';     // Hide the cross icon after animation
    hamburger.style.display = 'block'; // Show the hamburger icon
  }, 200);  // Delay to match the transition duration
});

// add event listeners to all menu items
d3.selectAll('.menu-item')
    .on('click', function(event, d) {
      const element = d3.select(this);
      const itemId = element.attr('id'); // Get the ID of the clicked item
      console.log(`[click]: id ${itemId}`);

      // check if anything to do
      if (element.classed('highlighted')) {
        // already highlighted - no change required
        //console.log(`[click]: id ${itemId} already highlighted`);
        return;
      }

      // toggle highlighted model/color
      if (itemId.includes('nav-model')) {
        // model selection
        let name = '';
        switch (itemId){
          // models
          // 0 == none, 1 == SGLOBE-rani, 2 == S40RTS, ..
          case 'nav-model-sglobe-rani': { name = 'SGLOBE-rani'; break; }
          case 'nav-model-s40rts': { name = 'S40RTS'; break; }
          case 'nav-model-savani': { name = 'SAVANI'; break; }
          case 'nav-model-spani-s': { name = 'SPani-S'; break; }
          case 'nav-model-tx2015': { name = 'TX2015'; break; }
          case 'nav-model-none': { name = 'none'; break; }
        }
        // highlight clicked item
        highlightModelItem(name);
        // set new model selection
        vectorField.setModelSelection(name);
        // checks if done
        if (name == 'none') { stopAnimation(); }
        // clear both contexts, for globe & animation drawing
        clearContexts();
        // low-res render
        renderer.render(projection, contextGlobe, path, transform, landLowRes, bordersLowRes, plates, quakes, false);
        // setup vector field
        vectorField.setupVectorField().then(() => {
          // setup vector field texture map
          //vectorField.updateVectorField(projection,width,height);
          console.log(`setupVectorField: done`);
          // update view
          updateFullView();
          // update svg element name
          modelGroup.updateName();
        });
      }

      if (itemId.includes('nav-color')) {
        // color selection
        let name = '';
        switch (itemId){
          case 'nav-color-none': { name = 'none'; break; }
          case 'nav-color-Magma': { name = 'Magma'; break; }
          case 'nav-color-RdYlBu': { name = 'RdYlBu'; break; }
          case 'nav-color-GnBu': { name = 'GnBu'; break; }
        }
        // highlight clicked item
        highlightColorItem(name);
        // set new color selection
        vectorField.setColorSelection(name);
        // update view
        updateFullView();
      }
    });


function highlightModelItem(name) {
  // Function to highlight a menu item
  // models
  d3.selectAll("[id^='nav-model-']")
    .each(function() {
      const element = d3.select(this);  // 'this' refers to the current element

      // Get the full id, e.g., 'nav-model-sglobe-rani'
      const id = element.attr('id');
    
      // Split the id to get the part after 'nav-model-'
      const modelName = id.replace('nav-model-', '');  // Extract 'sglobe-rani'
    
      // case-insensitive comparison
      if (modelName.toLowerCase() === name.toLowerCase()) {
        // highlight element
        //console.log(`Match found: ${modelName}`);
        element.classed('highlighted', true);
      } else {
        // remove highlight
        //console.log(`No match for: ${modelName}`);
        element.classed('highlighted', false);
      }
    });

  //const item = document.getElementById(itemId);
  //item.classList.add('highlighted'); // Add the highlighted class
  //item.classList.remove('highlighted'); // Remove the highlighted class
}

function highlightColorItem(name) {
  // Function to highlight a menu item
  // colors
  switch (name){
    case 'Magma': {
      d3.select('#nav-color-Magma').classed('highlighted', true);
      d3.select('#nav-color-RdYlBu').classed('highlighted', false);
      d3.select('#nav-color-GnBu').classed('highlighted', false);
      d3.select('#nav-color-none').classed('highlighted', false);
      break;
    }
    case 'RdYlBu': {
      d3.select('#nav-color-Magma').classed('highlighted', false);
      d3.select('#nav-color-RdYlBu').classed('highlighted', true);
      d3.select('#nav-color-GnBu').classed('highlighted', false);
      d3.select('#nav-color-none').classed('highlighted', false);
      break;
    }
    case 'GnBu': {
      d3.select('#nav-color-Magma').classed('highlighted', false);
      d3.select('#nav-color-RdYlBu').classed('highlighted', false);
      d3.select('#nav-color-GnBu').classed('highlighted', true);
      d3.select('#nav-color-none').classed('highlighted', false);
      break;
    }
    case 'none': {
      d3.select('#nav-color-Magma').classed('highlighted', false);
      d3.select('#nav-color-RdYlBu').classed('highlighted', false);
      d3.select('#nav-color-GnBu').classed('highlighted', false);
      d3.select('#nav-color-none').classed('highlighted', true);
      break;
    }    
    default:
      console.log(`highlightColorItem: unrecognized name ${name}`);
  }
  //const item = document.getElementById(itemId);
  //item.classList.add('highlighted'); // Add the highlighted class
  //item.classList.remove('highlighted'); // Remove the highlighted class
}


// checkboxes
// earthquake locations checkbox
const checkboxQuakes = document.getElementById('check-earthquakes');
// contour lines
const checkboxContours = document.getElementById('check-contours');

checkboxQuakes.addEventListener('change', function() {
  if (this.checked) {
    //console.log("Checkbox: is checked");
    d3.select('#check-earthquakes-label').classed('highlighted', true);
    // set render flag
    renderer.state.showEarthquakes = true;
  } else {
    //console.log("Checkbox: is unchecked");
    d3.select('#check-earthquakes-label').classed('highlighted', false);
    // set render flag
    renderer.state.showEarthquakes = false;
  }
  // update svg elements
  renderer.renderSVG(projection, quakes);
});

checkboxContours.addEventListener('change', function() {
  if (this.checked) {
    //console.log("Checkbox: is checked");
    d3.select('#check-contours-label').classed('highlighted', true);
    // set render flag
    renderer.state.showContours = true;
  } else {
    //console.log("Checkbox: is unchecked");
    d3.select('#check-contours-label').classed('highlighted', false);
    // set render flag
    renderer.state.showContours = false;
  }
  // update canvas
  renderer.render(projection, contextGlobe, path, transform, land, borders, plates, quakes, true);
});

