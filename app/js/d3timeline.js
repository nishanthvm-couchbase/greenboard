(function(){
    'use strict';
    angular.module('svc.timeline', [])
        .directive('viewTimeline', ['Data', 'Timeline',
          function(Data, Timeline){
              return {
                restrict: 'E',
                scope: {
                   onChange: "=",
                   builds: "="
                },
                link: function(scope, elem, attrs){

                  var builds = scope.builds
                  var id = "#"+elem.attr('id')

                  // Render timeline for version builds
                  // NOTE: onChange callback propagates up to
                  //       build-controller so that view can be
                  //       notified when a build is selected
                  Timeline.init(builds, id, scope.onChange)
                  
                  // re-render if filterBy has changed
                  scope.$watch(function(){ return Data.getBuildFilter() },
                    function(filterBy, lastFilterBy){
                      
                      if((lastFilterBy != undefined) && (filterBy != lastFilterBy)){
                        builds = Data.getVersionBuilds()

                        // update timeline
                        Timeline.update(builds, id)
                      }
                    })
		   
		                scope.$watch(function () {
                        return Data.getBuildFilter();
                    }, function (newVal, oldVal) {
                        if (newVal == oldVal){
                            return
                        }
                        builds = Data.getVersionBuilds()
                        Timeline.update(builds, id)

                    });

                    scope.$watch(function () {
                        return Data.getBuildsFilter();
                    }, function (newVal, oldVal) {
                        if (newVal == oldVal){
                            return
                        }
                        scope.spin = true
                        builds = Data.getVersionBuilds()
                        Timeline.update(builds, id)
                        scope.spin = false
                    })

                }
              }

            }])
        .service('Timeline', ['Data', '$timeout',
            function(Data, $timeout) {
              var build
              var _clickBuildCallback;
              var _domId;
              var svg, layer, rect, yScale, xScale, hoverLine, hoverCircle

              var margin = {top: 40, right: 10, bottom: 100, left: 70},
                  width = 800 - margin.left - margin.right,
                  height = 300 - margin.top - margin.bottom;
              var color = ['rgba(59, 201, 59, 0.7)', 'rgba(222, 0, 0, 0.7)']
              var color_selected = ['rgba(59, 201, 59, 1)', 'rgba(222, 0, 0, 1)']
              var color_stroke = ['rgba(59, 201, 59, 1)', 'rgba(222, 0, 0, 1)']
              var hoveredIndex = null

              function getYMax(layers){
                return d3.max(layers, function(layer) { return d3.max(layer, function(d) { return d.y0 + d.y; }); });
              }

              function getXScale(xLabels){
                // Use ordinal scale with rangeRoundBands for bar chart
                return d3.scale.ordinal()
                          .domain(xLabels)
                          .rangeRoundBands([0, width], .08)
              }

              function getYScale(yStackMax){
                return d3.scale.linear()
                        .domain([0, yStackMax])
                        .range([height, 0])
              }

              function getXAxis(xScale){
                var xaxis = d3.svg.axis()
                        .scale(xScale)
                        .tickSize(0)
                        .tickPadding(6)
                        .orient("bottom");

                // down sample tick domain to at least 30 points
                var domain = xScale.domain()
                var skipBy = Math.floor(domain.length/20)
                if(skipBy > 1){
                  var tickValues = domain.filter(function(t, i){ return (i%skipBy) == 0 })
                  xaxis.tickValues(tickValues)
                }

                return xaxis
              }

              function getYAxis(yScale, yStackMax){

                var yaxis = d3.svg.axis()
                        .scale(yScale)
                        .tickSize(0)
                        .tickPadding(8)
                        .orient("left")
                        .tickSize(-width, 0, 0)
                        .tickFormat(function(d) {
                          // Format numbers with k for thousands
                          if (d >= 1000) {
                            return (d / 1000).toFixed(d % 1000 === 0 ? 0 : 1) + 'k';
                          }
                          return d;
                        })
                var tickValues = d3.range(yStackMax)
                if(yStackMax > 50){
                  while (tickValues.length >= 10){
                    // shrink until only 5 ticks displayed on yaxis
                    tickValues = tickValues.filter(function(t, i){ return (i%10) == 0 })
                  }
                  if(tickValues.length > 5){
                    tickValues = tickValues.filter(function(t, i){ return (i%2) == 0})
                  }
                } else {
                 tickValues = [yStackMax]
                }
                yaxis.tickValues(tickValues)
                return yaxis
              }
              function scaleWidth(){
                return width + margin.left + margin.right
              }

              function scaleHeight(){
                return height + margin.top + margin.bottom
              }

              function appendSvgToDom(id){
                return d3.select(id).append("svg")
                        .attr("width", scaleWidth())
                        .attr("height", scaleHeight())
                      .append("g")
                        .attr("transform", "translate(" + margin.left + "," + margin.top + ")")
              }

              function appendLayersToSvg(svg, layers){
                // generate g elements from pass fail layer data
                var layer = svg.selectAll(".layer")
                              .data(layers)
                    layer.enter().append("g")
                        .attr("class", "layer")
                return layer
              }

              function appendRectToLayers(x, layer){
                // generate rect elements from pass fail data previously
                // bounded to the 2 layers
                var rect = layer.selectAll("rect")
                        .data(function(d) { return d; })
                      rect.enter().append("rect")
                        .attr("x", function(d) { return x(d.x); })
                        .attr("y", height)
                        .attr("width", x.rangeBand())
                        .attr("height", 0)
                        .style("fill", function(d, i, l) { 
                          return d.x == build ? color_selected[l] : color[l]
                        })
                        .style("stroke", function(d, i, l) {
                          return d.x == build ? color_stroke[l] : "rgba(255,255,255,0.4)"
                        })
                        .style("stroke-width", 1.5)
                        .style("cursor", "pointer")
                        .style("opacity", 0.85)
                        .attr("class", "bar-segment")
                        .attr("rx", 2) // Slight rounded corners
                        .attr("ry", 2)

                      // fade out on remove
                      rect.exit().transition()
                        .delay(100)
                        .attr("y", function(d) { return yScale(d.y0); })
                        .attr("height", 0)
                return rect
              }

              function animateRectBarHeight(y, rect){
                // animate showing of rect bars via y-axis
                rect.transition()
                  .delay(function(d, i) { return i * 10; })
                  .duration(600)
                  .ease("cubic-out")
                  .attr("y", function(d) { return y(d.y0 + d.y); })
                  .attr("height", function(d) { return y(d.y0) - y(d.y0 + d.y); });               
              }

              function initToolTip(direction, yOffset, xOffset, htmlFun, style){
                return d3.tip()
                      .attr('class', 'd3-tip '+style)
                      .offset([yOffset, xOffset])
                      .direction(direction)
                      .html(htmlFun)
              }


              function createHoverElements(svg){
                // Create hover line and circle for better UX
                hoverLine = svg.append("line")
                  .attr("class", "hover-line")
                  .attr("y1", 0)
                  .attr("y2", height)
                  .style("stroke", "#666")
                  .style("stroke-width", 2)
                  .style("stroke-dasharray", "3,3")
                  .style("opacity", 0)
                  .style("pointer-events", "none")
                
                hoverCircle = svg.append("g")
                  .attr("class", "hover-circles")
                  .style("opacity", 0)
                  .style("pointer-events", "none")
                
                hoverCircle.append("circle")
                  .attr("class", "hover-circle-pass")
                  .attr("r", 5)
                  .style("fill", color[0])
                  .style("stroke", "#fff")
                  .style("stroke-width", 2)
                
                hoverCircle.append("circle")
                  .attr("class", "hover-circle-fail")
                  .attr("r", 5)
                  .style("fill", color[1])
                  .style("stroke", "#fff")
                  .style("stroke-width", 2)
              }

              function configureToolTips(svg, layers, rect, builds){
                // Unified tooltip showing all information together
                var unifiedTip = initToolTip('n', -10, 0, function(d) {
                  if (!d || !d.x) return '';
                  var buildData = builds.find(function(b) { return b.build === d.x; });
                  if (!buildData) return '';
                  var total = buildData.Passed + buildData.Failed;
                  var passPct = total > 0 ? ((buildData.Passed / total) * 100).toFixed(1) : 0;
                  var failPct = total > 0 ? ((buildData.Failed / total) * 100).toFixed(1) : 0;
                  return '<div style="text-align: left; min-width: 180px;">' +
                    '<div style="margin-bottom: 8px;">' +
                    '<strong style="font-size: 14px;">' + d.x + '</strong><br/>' +
                    '<span style="font-size: 12px; opacity: 0.9;">Total: ' + total.toLocaleString() + '</span>' +
                    '</div>' +
                    '<div style="display: flex; gap: 8px; margin-top: 8px;">' +
                    '<div class="d3-tip-pass" style="flex: 1; padding: 6px 10px; border-radius: 4px; background: rgba(59, 201, 59, 0.95); color: #ffffff; font-weight: 600; text-align: center;">' +
                    '<div style="font-size: 11px; margin-bottom: 2px;">Passed</div>' +
                    '<div style="font-size: 13px;">' + buildData.Passed.toLocaleString() + '</div>' +
                    '<div style="font-size: 10px; opacity: 0.9;">(' + passPct + '%)</div>' +
                    '</div>' +
                    '<div class="d3-tip-fail" style="flex: 1; padding: 6px 10px; border-radius: 4px; background: rgba(222, 0, 0, 0.95); color: #ffffff; font-weight: 600; text-align: center;">' +
                    '<div style="font-size: 11px; margin-bottom: 2px;">Failed</div>' +
                    '<div style="font-size: 13px;">' + buildData.Failed.toLocaleString() + '</div>' +
                    '<div style="font-size: 10px; opacity: 0.9;">(' + failPct + '%)</div>' +
                    '</div>' +
                    '</div>' +
                    '</div>';
                }, 'd3-tip')

                svg.call(unifiedTip)

                // bar callbacks with pop-up effect - entire bar pops up together
                rect.on("mouseover", function(d, i){
                  var buildName = d.x;
                  var currentBar = d3.select(this);
                  
                  // Find all segments belonging to the same build (both green and red)
                  var allSegments = rect.filter(function(segmentData) {
                    return segmentData.x === buildName;
                  });
                  
                  // Apply pop-up effect to all segments of the same bar
                  allSegments.each(function() {
                    var segment = d3.select(this);
                    var segmentX = parseFloat(segment.attr("x")) + parseFloat(segment.attr("width")) / 2;
                    var segmentY = parseFloat(segment.attr("y")) + parseFloat(segment.attr("height")) / 2;
                    
                    segment
                      .transition()
                      .duration(150)
                      .attr("transform", "translate(" + segmentX + "," + segmentY + ") scale(1.05) translate(" + (-segmentX) + "," + (-segmentY) + ")")
                      .style("opacity", 1)
                      .style("filter", "drop-shadow(0 0 6px rgba(0,0,0,0.3))");
                  });
                  
                  // Show unified tip
                  unifiedTip.show(d, rect[1][i])
                })
                rect.on("mouseout", function(d, i){
                  var buildName = d.x;
                  
                  // Find all segments belonging to the same build (both green and red)
                  var allSegments = rect.filter(function(segmentData) {
                    return segmentData.x === buildName;
                  });
                  
                  // Reset pop-up effect for all segments of the same bar
                  allSegments.each(function() {
                    d3.select(this)
                      .transition()
                      .duration(150)
                      .attr("transform", "scale(1)")
                      .style("opacity", 0.8)
                      .style("filter", "none");
                  });
                  
                  // Hide tip
                  unifiedTip.hide();
                })
              }

              function configureBarClickCallback(rect, clickCallBack, layers){
                // when bar is clicked - both green and red should navigate to same build
                rect.on("click", function(d, i_clicked){
                  // d.x is the build name, i_clicked is the segment index (0=pass, 1=fail)
                  // Find the build index from the data
                  var buildName = d.x;
                  var buildIndex = -1;
                  
                  // Find which build this belongs to by checking the first layer
                  if (layers && layers[0]) {
                    for (var i = 0; i < layers[0].length; i++) {
                      if (layers[0][i].x === buildName) {
                        buildIndex = i;
                        break;
                      }
                    }
                  }

                  // highlight the selected build - highlight both segments of the same build
                  rect.style("fill", function(d, i, l){
                      // Check if this segment belongs to the clicked build
                      var isClickedBuild = d.x === buildName;
                      return isClickedBuild ? color_selected[l] : color[l]
                    })
                    .style("stroke", function(d, i, l){
                      var isClickedBuild = d.x === buildName;
                      return isClickedBuild ? color_stroke[l] : "rgba(255,255,255,0.4)"
                    })

                  // and notify consumer of click callback with the build name
                  clickCallBack(buildName)
                })
              }

              function renderSvgXAxis(svg, xAxis){

                // render the xAxis along graph with enhanced styling
                svg.append("g")
                    .attr("class", "x axis")
                    .attr("transform", "translate(0," + height + ")")
                    .call(xAxis)
                    .selectAll("text") 
                      .style("text-anchor", "end")
                      .style("font-size", "13px")
                      .style("font-weight", "600")
                      .style("fill", "#444")
                      .attr("dx", "-.8em")
                      .attr("dy", ".15em")
                      .attr("transform", "rotate(-65)" )
              }
              function renderSvgYAxis(svg, yAxis){

                // render the yAxis along graph with enhanced styling
                svg.append("g")
                    .attr("class", "y axis grid")
                    .attr("transform", "translate(0,0)")
                    .call(yAxis)
                    .selectAll("text")
                      .style("font-size", "14px")
                      .style("font-weight", "600")
                      .style("fill", "#444")
                
                // Add grid lines
                svg.append("g")
                    .attr("class", "grid")
                    .attr("transform", "translate(0,0)")
                    .call(yAxis.tickSize(-width, 0, 0).tickFormat(""))
              }

              function setHighlightedBuild(buildNames){
                build = Data.getBuild()
                // make sure build is in builds
                if(buildNames.indexOf(build) == -1){
                  build = buildNames[buildNames.length-1]
                }
              }
              function _render(builds){
                    if (!builds || builds.length === 0) return;

                    var stack = d3.layout.stack()
                    var xLabels = _.map(builds, 'build')
                    var passFailLayers = ['Passed', 'Failed'].map(function(k){
                      return builds.map(function(b, i){ return {x: xLabels[i], y: b[k] || 0} })
                    })
                    var layers = stack(passFailLayers)
                    var yStackMax = getYMax(layers)
                    
                    // convert scales to  d3 axis
                    xScale = getXScale(xLabels) 
                    var xAxis = getXAxis(xScale)
                    yScale = getYScale(yStackMax)
                    var yAxis = getYAxis(yScale, yStackMax)

                    // identify build to highlight before rendering
                    setHighlightedBuild(xLabels)


                    // Remove old elements
                    svg.selectAll(".layer").remove()
                    svg.selectAll(".hover-line").remove()
                    svg.selectAll(".hover-circles").remove()

                    layer = appendLayersToSvg(svg, layers)
                    rect = appendRectToLayers(xScale, layer)
                    animateRectBarHeight(yScale, rect)

                    // configure toolTips behavior
                    configureToolTips(svg, layers, rect, builds)

                    // configure barClick behavior - pass layers so we can identify builds
                    configureBarClickCallback(rect, _clickBuildCallback, layers)

                    // renders x-axis along timeline
                    renderSvgXAxis(svg, xAxis)
                    renderSvgYAxis(svg, yAxis)

                    // Update selected build highlight
                    if (build && rect) {
                      rect.style("fill", function(d, i, l) {
                        return d.x == build ? color_selected[l] : color[l];
                      })
                      .style("stroke", function(d, i, l) {
                        return d.x == build ? color_stroke[l] : "rgba(255,255,255,0.3)";
                      });
                    }
              }
              return {


                init:  function(builds, id, clickCallBack){

                    // init timeline svg
                    svg = appendSvgToDom(id)

                    // remember domId and click callback for future updates
                    _domId = id
                    _clickBuildCallback = clickCallBack

                    // render
                    _render(builds)

                  
                  },
                update: function(builds){

                    // fade timeline
                    if (rect) {
                      rect.transition()
                        .delay(100)
                        .duration(200)
                        .attr("y", function(d) { return yScale(d.y0); })
                        .attr("height", 0);
                    }

                    // fade out xaxis ticks
                    svg.selectAll('.tick text')
                      .transition().delay(10)
                      .style("fill", "white")

                    // after fading out view...
                    $timeout(function(){
                        // remove x axis from dom
                        svg.select(".x").remove()
                        svg.select(".y").remove()
                        // remove bars from dom
                        if (layer) layer.remove()
                        // re-render timeline
                        _render(builds)
                    }, 250)

                  }


              }
        }])
})();
