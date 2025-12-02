/**
 * Compatibility wrapper for d3-tip 0.9.1 to work with d3 v3.5.17
 * This creates a polyfill for d3-selection and d3-collection modules
 * and exposes d3.tip() function compatible with d3 v3
 */

(function() {
  'use strict';

  // Polyfill d3-selection module for d3 v3
  if (typeof d3 !== 'undefined') {
    // Create d3-selection compatibility
    var d3Selection = {
      selection: d3.selection,
      select: d3.select,
      selectAll: d3.selectAll
    };

    // Create d3-collection compatibility  
    var d3Collection = {
      map: function(obj) {
        var map = {};
        for (var key in obj) {
          if (obj.hasOwnProperty(key)) {
            map[key] = obj[key];
          }
        }
        return {
          keys: function() {
            return Object.keys(map);
          },
          get: function(key) {
            return map[key];
          }
        };
      }
    };

    // Store original d3.tip if it exists
    var originalD3Tip = d3.tip;

    // Load and execute d3-tip code with polyfills
    // We'll create a simple d3.tip implementation compatible with d3 v3
    d3.tip = function() {
      var direction = function() { return 'n'; };
      var offset = function() { return [0, 0]; };
      var html = function() { return ' '; };
      var rootElement = document.body;
      var node = null;
      var svg = null;
      var point = null;
      var target = null;

      function initNode() {
        var div = d3.select(document.createElement('div'));
        div
          .style('position', 'absolute')
          .style('top', 0)
          .style('opacity', 0)
          .style('pointer-events', 'none')
          .style('box-sizing', 'border-box');
        return div.node();
      }

      function getNodeEl() {
        if (node == null) {
          node = initNode();
          rootElement.appendChild(node);
        }
        return d3.select(node);
      }

      function getSVGNode(element) {
        var svgNode = element.node();
        if (!svgNode) return null;
        if (svgNode.tagName.toLowerCase() === 'svg') return svgNode;
        return svgNode.ownerSVGElement;
      }

      function getScreenBBox(targetShape) {
        var targetel = target || targetShape;
        while (targetel.getScreenCTM == null && targetel.parentNode != null) {
          targetel = targetel.parentNode;
        }

        var bbox = {};
        var matrix = targetel.getScreenCTM();
        var tbbox = targetel.getBBox();
        var width = tbbox.width;
        var height = tbbox.height;
        var x = tbbox.x;
        var y = tbbox.y;

        point.x = x;
        point.y = y;
        bbox.nw = point.matrixTransform(matrix);
        point.x += width;
        bbox.ne = point.matrixTransform(matrix);
        point.y += height;
        bbox.se = point.matrixTransform(matrix);
        point.x -= width;
        bbox.sw = point.matrixTransform(matrix);
        point.y -= height / 2;
        bbox.w = point.matrixTransform(matrix);
        point.x += width;
        bbox.e = point.matrixTransform(matrix);
        point.x -= width / 2;
        point.y -= height / 2;
        bbox.n = point.matrixTransform(matrix);
        point.y += height;
        bbox.s = point.matrixTransform(matrix);

        return bbox;
      }

      function functor(v) {
        return typeof v === 'function' ? v : function() {
          return v;
        };
      }

      var directionCallbacks = {
        n: function() {
          var bbox = getScreenBBox(this);
          return {
            top: bbox.n.y - getNodeEl().node().offsetHeight,
            left: bbox.n.x - getNodeEl().node().offsetWidth / 2
          };
        },
        s: function() {
          var bbox = getScreenBBox(this);
          return {
            top: bbox.s.y,
            left: bbox.s.x - getNodeEl().node().offsetWidth / 2
          };
        },
        e: function() {
          var bbox = getScreenBBox(this);
          return {
            top: bbox.e.y - getNodeEl().node().offsetHeight / 2,
            left: bbox.e.x
          };
        },
        w: function() {
          var bbox = getScreenBBox(this);
          return {
            top: bbox.w.y - getNodeEl().node().offsetHeight / 2,
            left: bbox.w.x - getNodeEl().node().offsetWidth
          };
        },
        nw: function() {
          var bbox = getScreenBBox(this);
          return {
            top: bbox.nw.y - getNodeEl().node().offsetHeight,
            left: bbox.nw.x - getNodeEl().node().offsetWidth
          };
        },
        ne: function() {
          var bbox = getScreenBBox(this);
          return {
            top: bbox.ne.y - getNodeEl().node().offsetHeight,
            left: bbox.ne.x
          };
        },
        sw: function() {
          var bbox = getScreenBBox(this);
          return {
            top: bbox.sw.y,
            left: bbox.sw.x - getNodeEl().node().offsetWidth
          };
        },
        se: function() {
          var bbox = getScreenBBox(this);
          return {
            top: bbox.se.y,
            left: bbox.se.x
          };
        }
      };

      function tip(vis) {
        svg = getSVGNode(vis);
        if (!svg) return;
        point = svg.createSVGPoint();
        rootElement.appendChild(getNodeEl().node());
      }

      tip.show = function() {
        var args = Array.prototype.slice.call(arguments);
        var targetElement = this instanceof SVGElement ? this : null;
        if (args.length > 0 && args[args.length - 1] instanceof SVGElement) {
          targetElement = args.pop();
        }
        if (targetElement) {
          target = targetElement;
        }

        var content = html.apply(targetElement || this, args);
        var poffset = offset.apply(targetElement || this, args);
        var dir = direction.apply(targetElement || this, args);
        var nodel = getNodeEl();
        var coords;
        var scrollTop = document.documentElement.scrollTop || rootElement.scrollTop;
        var scrollLeft = document.documentElement.scrollLeft || rootElement.scrollLeft;

        nodel.html(content)
          .style('opacity', 1)
          .style('pointer-events', 'all');

        // Remove all direction classes first
        ['n', 's', 'e', 'w', 'nw', 'ne', 'sw', 'se'].forEach(function(d) {
          nodel.classed(d, false);
        });

        coords = directionCallbacks[dir].apply(targetElement || this);
        nodel.classed(dir, true)
          .style('top', (coords.top + poffset[0]) + scrollTop + 'px')
          .style('left', (coords.left + poffset[1]) + scrollLeft + 'px');

        return tip;
      };

      tip.hide = function() {
        var nodel = getNodeEl();
        nodel.style('opacity', 0).style('pointer-events', 'none');
        return tip;
      };

      tip.attr = function(n, v) {
        if (arguments.length < 2 && typeof n === 'string') {
          return getNodeEl().attr(n);
        }
        var args = Array.prototype.slice.call(arguments);
        d3.selection.prototype.attr.apply(getNodeEl(), args);
        return tip;
      };

      tip.style = function(n, v) {
        if (arguments.length < 2 && typeof n === 'string') {
          return getNodeEl().style(n);
        }
        var args = Array.prototype.slice.call(arguments);
        d3.selection.prototype.style.apply(getNodeEl(), args);
        return tip;
      };

      tip.direction = function(v) {
        if (!arguments.length) return direction;
        direction = v == null ? v : functor(v);
        return tip;
      };

      tip.offset = function(v) {
        if (!arguments.length) return offset;
        offset = v == null ? v : functor(v);
        return tip;
      };

      tip.html = function(v) {
        if (!arguments.length) return html;
        html = v == null ? v : functor(v);
        return tip;
      };

      tip.rootElement = function(v) {
        if (!arguments.length) return rootElement;
        rootElement = v == null ? v : functor(v);
        return tip;
      };

      tip.destroy = function() {
        if (node) {
          getNodeEl().remove();
          node = null;
        }
        return tip;
      };

      return tip;
    };
  }
})();

