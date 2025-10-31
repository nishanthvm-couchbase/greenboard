'usev strict'

var app = angular.module('greenBoard', [
    'ngSanitize',
    'ngAnimate',
    'ui.router',
    'svc.data',
    'svc.query',
    'svc.timeline',
    'app.main',
    'app.target',
    'app.sidebar',
    'app.infobar',
    'app.compare'
]);

app.run(['$location', '$rootScope', 'Data', function($location, $rootScope, Data){

    function initUrlParams(){
        // sets data service job filter params
        // based on options passed in from url
        var params = $location.search()
        Data.setUrlParams(params)
    }

    // detect if jobs need to be filtered by url params on init
    initUrlParams()

    // preserve url params between state changes
    $rootScope.$on('$stateChangeStart', function(e, to, tp, from, fp){
        initUrlParams()
    })
}])


app.config(['$stateProvider', '$urlRouterProvider',
    function($stateProvider, $urlRouterProvider){

        // TODO: external bootstrap with now testing build!
        $urlRouterProvider.otherwise("/server/8.1.0/latest");
        $stateProvider
            .state('target', {
                url: "/:target",
                abstract: true,
                template: '<ui-view/>',
                resolve: {
                    target: ['$stateParams', function($stateParams){
                        return $stateParams.target
                    }],
                    targetVersions: ['$stateParams', 'Data', 'QueryService',
                        function($stateParams, Data, QueryService){

                            var target = $stateParams.target
                            var versions = Data.getTargetVersions(target)
                            if(!versions){
                                // get versions for Target
                                versions = QueryService.getVersions(target)
                            }
                            return versions
                        }]
                }
            })
            .state('target.version', {
                url: "/:version",
                templateUrl: "view.html",
                controller: "NavCtrl",
                resolve: {
                    version: ['$stateParams', '$state', '$location', 'targetVersions', 'target',
                        function($stateParams, $state, $location, targetVersions, target){
                            
                            var version = $stateParams.version || "latest"
                            if ((version == "latest") || targetVersions.indexOf(version) == -1){
                                // uri is either latest version or some unknown version of target
                                // just use latested known version of target
                                version = targetVersions[targetVersions.length-1]
                            }
                            $stateParams.version = version
                            return version
                        }],
                    testsFilter: ['$stateParams', '$state', 'Data',
                    function ($stateParams, $state, Data) {
                        $stateParams.testsFilter = Data.getBuildFilter()
                        return $stateParams.testsFilter
                    }],
                    buildsFilter: ['$stateParams', '$state', 'Data',
                    function ($stateParams, $state, Data) {
                        $stateParams.buildsFilter = Data.getBuildsFilter()
                        return $stateParams.buildsFilter
                    }]
                }
            })
            .state('target.version.builds', {
                templateUrl: "partials/timeline.html",
                controller: "TimelineCtrl",
                resolve: {
                    versionBuilds: ['$stateParams', 'QueryService', 'Data', 'target', 'version', 'testsFilter',
                        'buildsFilter',
                        function($stateParams, QueryService, Data, target, version, testsFilter, buildsFilter){
                            var tests = Data.getBuildFilter()
                            var builds = Data.getBuildsFilter()
                            return QueryService.getBuilds(target, version, tests, builds).then(function(builds){
                                Data.setVersionBuilds(builds)
                                return Data.getVersionBuilds()
                            })
                        }]
                }
            })
            .state('target.version.builds.build', {
                url: "/:build",
                template: "<ui-view />",
                controller: ['$state', 'build', 'Data', function($state, build, Data){
                    // forwarder
                    Data.setBuild(build)
                    $state.go('target.version.builds.build.jobs')
                }],
                resolve: {
                    build: ['$stateParams', '$state', 'versionBuilds','Data',
                        function($stateParams, $state, versionBuilds,Data){
                            
                            var build = $stateParams.build || "latest"
                            if((build == "latest") && (versionBuilds.length > 0)){
                                var vbuild = versionBuilds[versionBuilds.length-1].build
                                $stateParams.build = vbuild.split('-')[1]
                            } else if(versionBuilds.length <= 0){
                                Data.setBuildsFilter(5)
                                Data.setBuildFilter(0)
                                $state.go('target.version.builds', {target: $stateParams.target, version: $stateParams.version})
                            }
                            return $stateParams.build
                        }]
                }
            })
            .state('target.version.builds.build.jobs', {
                templateUrl: "partials/jobs.html",
                controller: "JobsCtrl",
                resolve: {
                    buildJobs: ['$stateParams', 'QueryService', 'Data', 'target',
                        function($stateParams, QueryService, Data, target){
                            var build = Data.getBuild()
                            return QueryService.getJobs(build, target)
                        }]
                }
            })
            .state('compareBuilds', {
                templateUrl: "partials/comparer.html",
                controller: "comparer",
                resolve: {
                    target: ['$stateParams', 'Data', function($stateParams, Data){
                        $stateParams.target = $stateParams.target || Data.getCurrentTarget();
                        return $stateParams.target
                    }],
                    versions: ['$stateParams', 'Data', 'QueryService', 'target',
                        function($stateParams, Data, QueryService, target){
                            var versions = Data.getTargetVersions(target)
                            if(!versions){
                                // get versions for Target
                                versions = QueryService.getVersions(target)
                                Data.setTargetVersions(versions)
                            }
                            return versions
                        }],
                    version1: ['$stateParams', 'versions',
                        function ($stateParams, versions) {
                            $stateParams.version1 = $stateParams.version1 || versions[versions.length - 1];
                            return $stateParams.version1
                    }],
                    version2: ['$stateParams', 'versions',
                        function ($stateParams, versions) {
                            $stateParams.version2 = $stateParams.version2 || versions[versions.length - 1];
                            return $stateParams.version2
                        }],
                    builds1: ["$stateParams", 'QueryService','target', 'version1',
                        function ($stateParams, QueryService, target, version1) {
                            return QueryService.getBuilds(target, version1, 2000, 5).then(function (builds) {
                                return builds
                            })
                        }],
                    builds2: ["$stateParams", 'QueryService', 'target', 'version2', 'builds1',
                        function ($stateParams, QueryService, target, version2, builds1) {
                            if($stateParams.version1 == version2){
                                return builds1
                            }
                            return QueryService.getBuilds(target, version2, 2000, 5).then(function (builds) {
                                return builds
                            })
                        }],
                    build1: ['$stateParams', 'builds1',
                        function($stateParams, builds1){
                            $stateParams.build1 = $stateParams.build1 || builds1[builds1.length - 2].build;
                            return $stateParams.build1
                    }],
                    build2: ['$stateParams', 'builds2',
                        function($stateParams, builds2){
                            $stateParams.build2 = $stateParams.build2 || builds2[builds2.length - 1].build;
                            return $stateParams.build2
                        }],
                    build1details: ['$stateParams', 'Data', 'QueryService', 'build1',
                        function ($stateParams, Data, QueryService, build1 ) {
                            var details = QueryService.getBuildSummary(build1);
                            return details;
                    }],
                    build2details: ['$stateParams', 'Data', 'QueryService', 'build2',
                        function ($stateParams, Data, QueryService, build2 ) {
                            var details = QueryService.getBuildSummary(build2);
                            return details;
                        }]
                }
            })
    }]);

angular.module("app.compare", ['googlechart', 'svc.query'])
    .controller("comparer", ['$scope', '$state', 'Data', 'QueryService', 'target', 'versions', 'version1', 'version2',
        'builds1', 'builds2', 'build1', 'build2','build1details','build2details',
        function ($scope, $state, Data, QueryService, target, versions, version1, version2, builds1, builds2, build1,
                  build2, build1details, build2details) {

        var test = QueryService.getVersions(target).then(function (versions) {
            return versions;
        });
        if(!target){
            target = "server";
        }

        if (versions.length == 0){
            versions = QueryService.getVersions(target).then(function (versions) {
                return versions;
            });
        }

        if (!version1){
            version1 = versions[versions.length - 1];

        }
        if (!version2){
            version2 = versions[versions.length - 1];

        }

        if (builds1.length == 0){
            builds1 = QueryService.getBuilds(target, version1, 2000, 5).then(function (builds) {
                return builds;
            });
        }

        if (builds2.length == 0){
            builds2 = QueryService.getBuilds(target, version2, 2000, 5).then(function (builds) {
                return builds;
            });
        }

        if (!build1) {
            build1 = builds1[builds1.length - 1].build;
        }

        if (!build2){
            build2 = builds2[builds2.length  - 1].build;
        }

        if (!build1details){
            build1details = QueryService.getBuildSummary(build1).then(function (buildSummary) {
                return buildSummary;
            });
        }

        if (!build2details){
            build2details = QueryService.getBuildSummary(build2).then(function (buildSummary) {
                return buildSummary;
            })
        }

        $scope.changeCompareTarget = function (target) {
            $scope.compareTarget = target;
        };

        $scope.version1Change = function (version) {
            $scope.compareVersion1 = version;
        };

        $scope.version2Change = function (version) {
            $scope.compareVersion2 = version;
        };

        $scope.build1Change = function (build) {
            $scope.compareBuildId1 = build;
        };

        $scope.build2Change = function (build) {
            $scope.compareBuildId2 = build;
        };

        $scope.changeGraphType = function (graphType) {
            $scope.graphType = graphType;
        };

        $scope.changeOs = function (OS) {
            $scope.compareOS = OS;
        };

        $scope.$watch(function () {
            return $scope.compareTarget;
        }, function (newVal, oldVal) {
            if (newVal === oldVal){
                return;
            }
            var query = QueryService.getVersions(newVal).then(function (versions) {
                $scope.compareVersion1 = versions[versions.length - 1];
                $scope.compareVersion2 = versions[versions.length - 1];
                $scope.versions = versions;
                return versions;
            });
        });

        $scope.$watch(function () {
            return $scope.compareVersion1;
        }, function (newVal, oldVal) {
            if (newVal === oldVal){
                return;
            }
            var query = QueryService.getBuilds($scope.compareTarget, newVal, 2000, 5)
                .then(function (builds) {
                    var buildIds = _.map(_.map(builds, "build"), function (item) {
                        return item.split(['-'])[1];
                    });
                    $scope.compareBuildId1 = buildIds[buildIds.length - 1];
                    $scope.compareBuilds1 = buildIds;
                    return builds;
            });

        });

        $scope.$watch(function () {
            return $scope.compareVersion2;
        }, function (newVal, oldVal) {
            if (newVal === oldVal){
                return;
            }
            var query = QueryService.getBuilds($scope.compareTarget, newVal, 2000, 5)
                .then(function (builds) {
                    var buildIds = _.map(_.map(builds, "build"), function (item) {
                        return item.split(['-'])[1];
                    });
                    $scope.compareBuildId2 = buildIds[buildIds.length - 1];
                    $scope.compareBuilds2 = buildIds;
                    return builds;
                });
        });

        $scope.$watch(function () {
            return $scope.compareBuildId1;
        }, function (newVal, oldVal) {
            if (newVal === oldVal){
                return;
            }
            var query = QueryService.getBuildSummary($scope.compareVersion1 + "-" + newVal)
                .then(function (buildSummary) {
                $scope.osRunPercChart = getRunPercChart(buildSummary.os, build2details.os, $scope.graphType,
                    "OS", "Run %", "OS", "Total run % per OS");

                $scope.osPassPercChart = getPassPercChart(buildSummary.os, build2details.os, $scope.graphType,
                    "OS", "Pass %", "OS", "Pass % per OS");
                $scope.componentsCharts = getComponentsCharts(buildSummary.os, build2details.os);
                $scope.runPercChart = $scope.componentsCharts[$scope.compareOS].runPercChart;
                $scope.passPercChart = $scope.componentsCharts[$scope.compareOS].passPercChart;
                build1details = buildSummary;
                return buildSummary;
            });
        });

        $scope.$watch(function () {
            return $scope.compareBuildId2
        }, function (newVal, oldVal) {
            if (newVal === oldVal){
                return;
            }
            var query = QueryService.getBuildSummary($scope.compareVersion2 + "-" + newVal)
                .then(function (buildSummary) {
                $scope.osRunPercChart = getRunPercChart(build1details.os, buildSummary.os, $scope.graphType,
                    "OS", "Run %", "OS", "Total run % per OS");

                $scope.osPassPercChart = getPassPercChart(build1details.os, buildSummary.os, $scope.graphType,
                    "OS", "Pass %", "OS", "Pass % per OS");
                $scope.componentsCharts = getComponentsCharts(build1details.os, buildSummary.os);
                $scope.runPercChart = $scope.componentsCharts[$scope.compareOS].runPercChart;
                $scope.passPercChart = $scope.componentsCharts[$scope.compareOS].passPercChart;
                build2details = buildSummary;
                return buildSummary;
            });
        });

        $scope.$watch(function () {
            return $scope.graphType;
        }, function (newVal, oldVal) {
            if (newVal === oldVal){
                return;
            }
            $scope.osRunPercChart.type = newVal;
            $scope.osPassPercChart.type = newVal;
            $scope.runPercChart.type = newVal;
            $scope.passPercChart.type = newVal;
            _.forEach($scope.componentsCharts, function (value, key) {
                value.runPercChart.type = newVal;
                value.passPercChart.type = newVal;
            })
        });

        $scope.$watch(function () {
            return $scope.compareOS;
        }, function (newVal, oldVal) {
            if (newVal === oldVal){
                return;
            }
            $scope.runPercChart = $scope.componentsCharts[newVal].runPercChart;
            $scope.passPercChart = $scope.componentsCharts[newVal].passPercChart;
        });

        function getChartFormat(type, label, xaxis, yaxis, title){
            return {
                "type": type,
                "data": {
                    "cols": [
                        {
                            "id": label,
                            "label": label,
                            "type": "string",
                            "p": {}
                        },
                        {
                            "id": "build1",
                            "label": $scope.compareVersion1 + "-" + $scope.compareBuildId1,
                            "type": "number",
                            "p": {
                                "html": true
                            }
                        },
                        {
                            "id": "build2",
                            "label": $scope.compareVersion2 + "-" + $scope.compareBuildId2,
                            "type": "number",
                            "p": {
                                "html": true
                            }
                        }
                    ],
                    "rows": []
                },
                "options": {
                    "title": title,
                    "isStacked": "false",
                    "displayExactValues": true,
                    "vAxis": {
                        "title": yaxis,
                        "gridlines": {
                            "count": 5
                        }
                    },
                    "hAxis": {
                        "title": xaxis,
                        "slantedText": true,
                        "slantedTextAngle": 90,
                        "showTextEvery": 1,
                        "textStyle": {
                            "fontSize": 10
                        }
                    },
                    "bar": {
                        "groupWidth": '20%'
                    },
                    "legend": {
                        "position": "top"
                    },
                    "allowHtml": true,
                    "tooltip": {
                        "isHtml": true
                    },
                    "width": "100%",
                    "height": 500
                },
                "formatters": {
                    "color": [
                        {
                            "columnNum": 1,
                            "formats": [
                                {
                                    "from": 0,
                                    "to": 95,
                                    "color": "red"
                                },
                                {
                                    "from": 95,
                                    "to": 101,
                                    "color": "green"
                                }
                            ]
                        },
                        {
                            "columnNum": 2,
                            "formats": [
                                {
                                    "from": 0,
                                    "to": 95,
                                    "color": "red"
                                },
                                {
                                    "from": 95,
                                    "to": 101,
                                    "color": "green"
                                }
                            ]
                        }

                    ]
                }
            };
        }

        var runPercMapFunction = function (item) {
            if (!_.isObject(item)){
                return;
            }
            var runPerc = (item.totalCount / (item.totalCount + item.pending)) * 100;
            return {
                "runPerc": runPerc,
                "totalCount": item.totalCount,
                "pendingTests": item.pending
            };
        };

        var runPercChartRow = function (_build1, _build2, key) {
            if (!_.isObject(_build1) || !_.isObject(_build2)){
                return
            }
            return {
                "c": [
                    {
                        "v": key
                    },
                    {
                        "v": _.isNaN(_build1.runPerc)? 0: _build1.runPerc,
                        "f": "Run %: " + (_.isNaN(_build1.runPerc)? 0: _build1.runPerc) + "<br/>Total Test run: " +
                            _build1.totalCount + "<br/>Pending tests: " + _build1.pendingTests
                    },
                    {
                        "v": _.isNaN(_build2.runPerc)? 0: _build2.runPerc,
                        "f": "Run %: " + (_.isNaN(_build2.runPerc)? 0: _build2.runPerc) + "<br/>Total Test run: "
                            + _build2.totalCount + "<br/>Pending tests: " + _build2.pendingTests
                    }
                ]
            }
        };

        var passPercMapFunction = function (item) {
            if (!_.isObject(item)){
                return;
            }
            var passPerc = ((item.totalCount - item.failCount) / item.totalCount) * 100;
            return {
                "passPerc": passPerc,
                "passCount": item.totalCount - item.failCount,
                "failCount": item.failCount
            };
        };

        var passPercChartRow = function (_build1, _build2, key) {
            if (!_.isObject(_build1) || !_.isObject(_build2)){
                return
            }
            return {
                "c": [
                    {
                        "v": key
                    },
                    {
                        "v": _.isNaN(_build1.passPerc)? 0: _build1.passPerc,
                        "f": "Pass%: " + (_.isNaN(_build1.passPerc)? 0: _build1.passPerc) + "<br/>Passed tests: " +
                            _build1.passCount + "<br/>Failed tests: " + _build1.failCount
                    },
                    {
                        "v": _.isNaN(_build2.passPerc)? 0: _build2.passPerc,
                        "f": "Pass%: " + (_.isNaN(_build2.passPerc)? 0: _build2.passPerc) + "<br/>Passed tests: " +
                            _build2.passCount + "<br/>Failed tests: " + _build2.failCount
                    }
                ]
            }
        };

        function getRunPercChart(_build1, _build2, type, label, xaxis, yaxis, title) {
            var chart = getChartFormat(type, label, xaxis, yaxis, title);
            var build1osRunPerc = _.mapValues(_.omitBy(_build1, _.isNumber), runPercMapFunction);
            var build2osRunPerc = _.mapValues(_.omitBy(_build2, _.isNumber), runPercMapFunction);
            chart.data.rows = _.map(build1osRunPerc, function (_build1details, key) {
                var _build2details = _.get(build2osRunPerc, key, {"runPerc": 0, "totalCount": 0, "pendingTests": 0});
                return runPercChartRow(_build1details, _build2details, key);
            });
            return chart;
        }

        function getPassPercChart(_build1, _build2, type, label, xaxis, yaxis, title){
            var chart = getChartFormat(type, label, xaxis, yaxis, title);
            var build1osPassPerc = _.mapValues(_.omitBy(_build1, _.isNumber), passPercMapFunction);
            var build2osPassPerc = _.mapValues(_.omitBy(_build2, _.isNumber), passPercMapFunction);

            chart.data.rows = _.map(build1osPassPerc, function (_build1details, key) {
                var _build2details = _.get(build2osPassPerc, key, {"passPerc": 0, "passCount": 0, "failCount": 0});
                return passPercChartRow(_build1details, _build2details, key);
            });
            return chart;
        }

        function getComponentsCharts(_build1, _build2) {
            return _.mapValues(_build1, function (_build1details, key) {
                var _build2details = _.get(_build2, key);
                return {
                    "runPercChart": getRunPercChart(_build1details, _build2details,  $scope.graphType,
                        "Component for " + key, "Run %", "Component", "Runs % per component for " + key),
                    "passPercChart": getPassPercChart(_build1details, _build2details, $scope.graphType,
                        "Component for " + key, "Run %", "Component", "Pass % per component for " + key)
                };
            });
        }

        $scope.compareTargets = ["server", "mobile"];
        $scope.compareTarget = target;
        $scope.versions = versions;
        var version1 = build1.split(['-'])[0];
        $scope.compareVersion1 = $scope.versions[_.indexOf($scope.versions, version1)];
        var version2 = build2.split(['-'])[0];
        $scope.compareVersion2 = $scope.versions[_.indexOf($scope.versions, version2)];
        $scope.compareBuildId1 = build1.split(['-'])[1];
        $scope.compareBuildId2 = build2.split(['-'])[1];
        var buildIds1 = _.map(_.map(builds1, "build"), function (item) {
            return item.split(['-'])[1];
        });
        var buildIds2 = _.map(_.map(builds2, "build"), function (item) {
            return item.split(['-'])[1];
        });
        $scope.compareBuilds1 = buildIds1;
        $scope.compareBuilds2 = buildIds2;
        $scope.graphTypes = ["BarChart", "ColumnChart", "LineChart" , "Table"];
        $scope.graphType = "Table";
        $scope.osRunPercChart = getRunPercChart(build1details.os, build2details.os, $scope.graphType,
            "OS", "Run %", "OS", "Total run % per OS");
        $scope.osPassPercChart = getPassPercChart(build1details.os, build2details.os,  $scope.graphType,
            "OS", "Pass %", "OS", "Pass % per OS");
        $scope.componentsCharts = getComponentsCharts(build1details.os, build2details.os);
        $scope.compareOSs = _.keys($scope.componentsCharts);
        $scope.compareOS = "CENTOS";
        $scope.runPercChart = $scope.componentsCharts[$scope.compareOS].runPercChart;
        $scope.passPercChart = $scope.componentsCharts[$scope.compareOS].passPercChart;

    }]);

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
              var svg, layer, rect, yScale

              var margin = {top: 40, right: 10, bottom: 100, left: 70},
                  width = 800 - margin.left - margin.right,
                  height = 300 - margin.top - margin.bottom;
              var color = ['rgba(59, 201, 59, 0.5)', 'rgba(222, 0, 0, 0.5)']
              var color_selected = ['rgba(59, 201, 59, 1)', 'rgba(222, 0, 0, 1)']

              function getYMax(layers){
                return d3.max(layers, function(layer) { return d3.max(layer, function(d) { return d.y0 + d.y; }); });
              }

              function getXScale(xLabels){
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
                        .tickPadding(6)
                        .orient("left")
                          .tickSize(-width, 0, 0)
                          //.tickFormat("")
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

              function configureToolTips(svg, layers, rect){
                // add tool tip to svg 
                var printData = function(d, i) {return d;}
                var tip1 = initToolTip('e', 0, 10, printData, 'd3-tip-pass'),
                    tip2 = initToolTip('e', 0, 10, printData, 'd3-tip-fail'),
                    tip3 = initToolTip('n',-10,0, printData)

                svg.call(tip1); svg.call(tip2); svg.call(tip3)

                // bar callbacks
                rect.on("mouseover", function(d, i){
                  // show tip on pass and fail layer
                  tip1.show(layers[0][i].y, i, rect[0][i])
                  tip2.show(layers[1][i].y, i, rect[1][i])
                  tip3.show(d.x, rect[1][i])
                })
                rect.on("mouseout", function(d, i){
                  // show tip on pass and fail layer
                  tip1.hide(); tip2.hide(); tip3.hide();
                })
              }

              function configureBarClickCallback(rect, clickCallBack){
                // when bar is clicked
                rect.on("click", function(d, i_clicked){

                  // highlight the selected build
                  rect.style("fill", function(d, i, l){
                      return i==i_clicked ? color_selected[l] : color[l]
                    })

                  // and notify consumer of click callback
                  var build = d.x
                  clickCallBack(build)
                })
              }

              function renderSvgXAxis(svg, xAxis){

                // render the xAxis along graph
                svg.append("g")
                    .attr("class", "x axis")
                    .attr("transform", "translate(0," + height + ")")
                    .call(xAxis)
                    .selectAll("text") 
                      .style("text-anchor", "end")
                      .attr("dx", "-.8em")
                      .attr("dy", ".15em")
                      .attr("transform", "rotate(-65)" )
              }
              function renderSvgYAxis(svg, yAxis){

                // render the xAxis along graph
                svg.append("g")
                    .attr("class", "y axis")
                    .attr("transform", "translate(0,0)")
                    .call(yAxis)
              }

              function setHighlightedBuild(buildNames){
                build = Data.getBuild()
                // make sure build is in builds
                if(buildNames.indexOf(build) == -1){
                  build = buildNames[buildNames.length-1]
                }
              }
              function _render(builds){

                    var stack = d3.layout.stack()
                    var xLabels = _.map(builds, 'build')
                    var passFailLayers = ['Passed', 'Failed'].map(function(k){
                      return builds.map(function(b, i){ return {x: xLabels[i], y: b[k] }})
                    })
                    var layers = stack(passFailLayers)
                    var yStackMax = getYMax(layers)
                    // convert scales to  d3 axis
                    var xScale = getXScale(xLabels) 
                    var xAxis = getXAxis(xScale)
                    yScale = getYScale(yStackMax)
                    var yAxis = getYAxis(yScale, yStackMax)

                    // identify build to highlight before rendering bars
                    setHighlightedBuild(xLabels)

                    layer = appendLayersToSvg(svg, layers)
                    rect = appendRectToLayers(xScale, layer)
                    animateRectBarHeight(yScale, rect)


                    // configure toolTips behavior
                    configureToolTips(svg, layers, rect)

                    // configure barClick behavior
                    configureBarClickCallback(rect, _clickBuildCallback)

                    // renders x-axis along timeline
                    renderSvgXAxis(svg, xAxis)
                    renderSvgYAxis(svg, yAxis)

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
                    rect.transition()
                      .delay(100)
                      .attr("y", function(d) { return yScale(d.y0); })
                      .attr("height", 0);

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
                        layer.remove()
                        // re-render timeline
                        _render(builds)
                    }, 250)

                  }


              }
        }])
})();

angular.module('svc.data', [])
    .value("DEFAULT_FILTER_BY", 2000)
    .value("DEFAULT_BUILDS_FILTER_BY", 10)
    .service('Data', ['$location', 'DEFAULT_FILTER_BY', 'DEFAULT_BUILDS_FILTER_BY',
        function ($location, DEFAULT_FILTER_BY, DEFAULT_BUILDS_FILTER_BY){

            _versions = []
            _target = "server"
            _version = null
            _versions = []
            _build = null
            _builds = []
            _targetVersions = {}
            _buildJobs = []
            _buildJobsActive = []
            _sideBarItems = {}
            _filterBy = DEFAULT_FILTER_BY
            _buildsFilterBy = DEFAULT_BUILDS_FILTER_BY
            _initUrlParams = null
            _buildInfo = {}
            _jobsPage = 0;
            _jobsPerPage = 20;
            _availableFilters = {
                features: "component",
                platforms: "os",
                serverVersions: "server_version",
                dapiVersions: "dapi",
                nebulaVersions: "dni",
                envVersions: "env"
            }

            function updateLocationUrl(type, key, disabled){
                var typeArgs = $location.search()[type]
                if(!disabled){
                    if(!typeArgs || typeArgs.length==0){
                        typeArgs = key
                    } else if(typeArgs.indexOf(key) == -1) {
                        typeArgs+=","+key
                    }
                    if(!_.some(_.map(_sideBarItems[type], "disabled"))){
                        // all items are selected now
                        typeArgs = null
                    }
                    $location.search(type, typeArgs);
                } else {
                    if(typeArgs){
                        var regex = new RegExp(",?" + key)
                        var typeArgs = typeArgs.replace(regex, "")
                            .replace(/^,/,"")
                        if(typeArgs == ""){
                            typeArgs = null
                        }
                        $location.search(type, typeArgs)
                    }
                }
            }

            function updateSidebarItemState(type, key, disabled){
                // updates disabled flag connected to sidebar item
                // for filtering
                _sideBarItems[type] = _sideBarItems[type].map(function(item){
                    if(item["key"] == key){
                        item.disabled = disabled
                    }
                    return item
                })

                updateLocationUrl(type, key, disabled)
            }


            function disableItem(key, type){


                var jobtype = _availableFilters[type]

                // diabling item: remove from active list of build jobs
                _buildJobsActive = _.reject(_buildJobsActive, function(job){
                    return job[jobtype] == key || job.variants && job.variants[jobtype] === key
                })
                updateSidebarItemState(type, key, true)

            }

            function enableItem(key, type){

                
                var jobtype = _availableFilters[type]

                // enabling item so include in active list of build jobs
                var includeJobs = _.filter(_buildJobs, function(job){

                    // detect if job matches included key
                    // show jobs not matching variant if all variants selected
                    if(job[jobtype] == key || (job.variants && job.variants[jobtype] === key)){
                        // filter out jobs if it matches another filter that is disabled
                        for (var map_key in _availableFilters) {
                            if (type === map_key) {
                                continue
                            }
                            var map_value = _availableFilters[map_key]
                            var sideBarItem = _sideBarItems[map_key].find(function(item) {
                                return item.key === job[map_value] || (job.variants && job.variants[map_value] === item.key);
                            })
                            if (sideBarItem && sideBarItem.disabled) {
                                return false
                            }
                        }
                        // only include this job if it's alternate type isn't disabled
                        // ie.. do not add back goxdcr if os is centos and centos is disabled
                        return true
                    }
                })
                _buildJobsActive = _buildJobsActive.concat(includeJobs)

                // update sidebar state
                updateSidebarItemState(type, key, false)
            }


            function getVersionBuildByFilter(){
                // return version builds according to filter
                var builds = _builds.filter(function(b){ return (b.Passed + b.Failed) > _filterBy})
                if(_filterBy == 0){
                    // also do high pass so that we can view the low builds
                    builds = _builds.filter(function(b){ return (b.Passed + b.Failed) < DEFAULT_FILTER_BY})
                }
                if((builds.length == 0) && (_filterBy != 0)){
                    builds = _builds
                    _filterBy = 0
                }
                return builds
            }

            function buildNameWithVersion(){
                var build = _build
                if (build == "latest" || build == ""){
                    if (_builds.length > 0){
                        build = _builds[_builds.length-1]
                    }
                }
                // prepend with version if necessary
                if (build && (build.indexOf("-")==-1)){
                    build = _version+"-"+build
                }
                return build
            }

            return {
                setTarget: function(target){
                    _target = target
                },
                setTargetVersions: function(versions){
                    // save versions belonging to this target
                    if(_target){
                        _targetVersions[_target] = versions
                    }
                    _versions = versions
                },
                setSelectedVersion: function(version){
                    _version = version
                },
                setBuild: function(build){
                    if(build.indexOf("-") == -1 && _version){
                        build = _version+"-"+build
                    }
                    _build = build
                },
                setBuildInfo: function(info){
                    _buildInfo = info
                },
                getBuildInfo: function(){
                    return _buildInfo
                },
                setVersionBuilds: function(builds){
                    builds.sort(function(a, b){
                        if(a.build < b.build){ return -1 }
                        if(a.build > b.build){ return 1 }
                        return 0
                    })
                    _builds = builds
                },
                setBuildJobs: function(jobs){
                    _buildJobs = jobs
                    _buildJobsActive = jobs
                },
                getBuildJobs: function(){
                    // todo get from cache too
                    return _buildJobs
                },
                getActiveJobs: function(){
                    return _buildJobsActive
                },
                getCurrentTarget: function(){
                    return _target
                },
                getTargetVersions: function(target){
                    // if requesting specific target lookup in cache
                    var versions = _versions
                    if(target){
                        versions = _targetVersions[target]
                    }
                    return versions
                },
                getSelectedVersion: function(){
                    return _version
                },
                getBuild: function(){
                    return buildNameWithVersion()
                },
                getVersionBuilds: getVersionBuildByFilter,
                toggleItem: function(key, type, disabled){

                    // check if item is being disabled
                    if(disabled){

                        // if this is first item to be disabled within os/component
                        // then inverse toggling is performed
                        var isAnyOfThisTypeDisabled = _.some(_.map(_sideBarItems[type], "disabled"))
                        if(!isAnyOfThisTypeDisabled){

                            // very well then, inverse toggling it is
                            // disable every item but this one
                            var siblingItems = _.map(_sideBarItems[type], "key")
                            siblingItems.forEach(function(k){
                                if(k!=key){
                                    disableItem(k, type)
                                }
                            })

                            // re-enable self
                            updateSidebarItemState(type, key, false)
                        } else {
                            disableItem(key, type)
                        }

                    } else {

                        // enabling item for visibility
                        enableItem(key, type)
                    }
                },
                setSideBarItems: function(items){
                    _sideBarItems = items

                    for (var item in items) {
                        if (!_availableFilters[item]) {
                            _availableFilters[item] = item
                        }
                    }

                    // remove any filters that no longer apply (e.g. after switching builds)
                    _.forEach(_availableFilters, function(_, filterName) {
                        if (!_sideBarItems[filterName]) {
                            delete _availableFilters[filterName]
                        }

                    })

                    _sideBarItems['buildVersion'] = buildNameWithVersion()

                    // default behavior is to initialize sideBarItems
                    // with items param.
                    // UNLESS: initial url params require some items be disabled on load
                    // NOTE: params only apply across same target
                    if(_initUrlParams && (_initUrlParams.target == _target)){

                        // disable everything corresponding to filtered type
                        _.mapKeys(items, function(values, type){
                            if(type in _initUrlParams){

                                // type matched what we want to filter
                                values.forEach(function(v){
                                    disableItem(v.key, type)
                                })
                            }
                        })

                        // only enable urlParams
                        _.mapKeys(_initUrlParams, function(values, type){

                            if(Object.keys(_availableFilters).indexOf(type) != -1){
                                var keys = values.split(",")
                                keys.forEach(function(k){
                                    enableItem(k, type)
                                })
                            }
                        })
                    }

                    // drop init params
                    _initUrlParams = null

                },
                getSideBarItems: function(){
                    return _sideBarItems
                },
                getItemStats: function(key, type){
                    // calculates pass fail stats for key across all
                    // enabled build jobs

                    // filter out just jobs with this key
                    var jobtype = _availableFilters[type]
                    var subset = _buildJobsActive
                    if (type != "build"){
                        subset = _.filter(_buildJobsActive, function(job){
                            // include in stat if jobtype matches, jobtype is a variant and no variants or jobtype is a variant and variant matches
                            return job[jobtype] == key || (!job[jobtype] && !job.variants) || (job.variants && job.variants[jobtype] == key)
                        })
                    }
		            subset = _.reject(subset, "olderBuild", true)
                    subset = _.reject(subset, "deleted", true)

                    // calculate absolute stats
                    var absTotal = _.sum(_.map(_.uniq(subset), "totalCount"))
                    var absFail = _.sum(_.map(_.uniq(subset), "failCount"))
                    var absPending = _.sum(_.map(_.uniq(subset), "pending"))
                    var absSkip = _.sum(_.map(_.uniq(subset), "skipCount"))
                    if (!absTotal){
                        absTotal = 0;
                    }
                    if (!absFail){
                        absFail = 0;
                    }
                    if (!absPending){
                        absPending = 0;
                    }
                    if (!absSkip){
                        absSkip = 0;
                    }
                    var absStats = {
                        passed: absTotal-absFail-absSkip,
                        failed: absFail,
                        pending: absPending,
                        skipped: absSkip,
                        total: absTotal+absPending
                    }

                    // calculate percentage based stats
                    var passedPerc = getPercOfVal(absStats, absStats.passed, false)
                    var percStats = {
                        run: getItemPercStr(absStats),
                        passed: wrapPercStr(passedPerc),
                        failed: getPercOfValStr(absStats, absStats.failed, false),
                        pending: getPercOfValStr(absStats, absStats.pending, true),
                        skipped: getPercOfValStr(absStats, absStats.skipped, true),
                        passedRaw: passedPerc
                    }

                    return {
                        absStats: absStats,
                        percStats: percStats
                    }

                },
                toggleAllSidebarItems: function(type, isDisable){

                    // set all sidebar items to disabled value
                    _sideBarItems[type].forEach(function(item){
                        // disable if not already disabled
                        if(isDisable && !item.disabled){
                            disableItem(item.key, type)
                        } else if (item.disabled) {
                            enableItem(item.key, type)
                        }
                    })
                },
                getBuildFilter: function(){
                    return _filterBy
                },
                setBuildFilter: function(filterBy){
                    if(filterBy===undefined){
                        filterBy = DEFAULT_FILTER_BY
                    }
                    _filterBy = filterBy
                },
                getBuildsFilter: function () {
                    return _buildsFilterBy
                },
                setBuildsFilter: function(buildsFilterBy){
                    if(buildsFilterBy===undefined){
                        buildsFilterBy = DEFAULT_BUILDS_FILTER_BY
                    }
                    _buildsFilterBy = buildsFilterBy
                },
                getLatestVersionBuild: function(){
                    var builds = getVersionBuildByFilter()
                    if(builds.length > 0){
                        return builds[builds.length-1].build
                    }
                    return _build
                },
                setUrlParams: function(params){

                    if(_initUrlParams === null){
                        params["target"] = _target
                        _initUrlParams = params
                    }
                },
                setJobsPerPage: function(jobsPerPage) {
                    _jobsPerPage = jobsPerPage;
                },
                setJobsPage: function(jobsPage) {
                    _jobsPage = jobsPage;
                },
                getJobsPerPage: function() {
                    return _jobsPerPage;
                },
                getJobsPage: function() {
                    return _jobsPage;
                }
            }

        }])



// data helper methods
function getPercOfVal(stats, val, includeSkipped){
    if (!stats){
        return 0;
    }

    var denom = stats.passed + stats.failed;
    if (includeSkipped) {
        denom += stats.skipped
    }
    if(denom == 0){ return 0; }
    return (100*(val/denom)).toFixed(1);
}

function getPercOfValStr(stats, val, includeSkipped){
    return wrapPercStr(getPercOfVal(stats, val, includeSkipped))
}

function getItemPerc(stats){
    if (!stats){
        return 0;
    }

    var total = stats.passed + stats.failed + stats.skipped;
    var denom = total + stats.pending;
    if(denom == 0){ return 0; }

    return (100*(total/denom)).toFixed(1);
}

function getItemPercStr(stats){
    if (getItemPerc(stats) >= 0){
        return wrapPercStr(getItemPerc(stats))
    }
}

function wrapPercStr(val){
    return val+"%"
}


angular.module('app.infobar', [])

  .directive('viewInfobar', ['Data', 'QueryService',
  	function(Data, QueryService){
 	  	return {
	  		restrict: 'E',
	  		scope: {},
	  		templateUrl: 'partials/infobar.html',
	  		link: function(scope, elem, attrs){

          scope.expandedIndexes = []
          scope.expandChange = function(index){
            if(scope.isExpanded(index)){
              // collapse
              var at = _.indexOf(scope.expandedIndexes, index)
              scope.expandedIndexes.splice(at, 1)
            } else {
              // expand
              scope.expandedIndexes.push(index)
            }
          }

          scope.isExpanded = function(index){
            return scope.expandedIndexes.indexOf(index) > -1
          }

          scope.formatChangeMsg = function(msg){
            var parts = msg.split("\n")
            var html = parts[0]
            if(parts.length > 1){
              // wrap in review url
              var reviewUrl = parts[2].replace("Reviewed-on: ", "")
              html = '<a href="'+reviewUrl+'">'+html+'</a>'
            }
            return html
          }


          // watch for changes in active build and attempt to get info
          scope.$watch(function(){return Data.getBuild()},
            function(build, lastbuild){
                scope.hasChangeSet = false
                var target = Data.getCurrentTarget()
                QueryService.getBuildInfo(build, target)
                  .then(function(response){
                    var info = {}
                    info = response['value']
                    if(response.err){ 
                      console.log(build, response.err) 
                    } else {
                      scope.info = info
                      scope.hasChangeSet = true
                    }
                  })
            })

	  		}
	  	}
  }])
var jiraPrefixes = ["MB", "CBQE", "CBIT", "CBD", "CBSP"]

formatClaim = function(claim) {
    var claimHtml = claim
    _.forEach(jiraPrefixes, function(prefix) {
        if (claim.startsWith(prefix + "-")) {
            claimHtml = '<a target="_blank" href="https://issues.couchbase.com/browse/' + claim + '">' + claim + '</a>'
            return false;
        }
    })
    return claimHtml
}

angular.module('app.main', [])
    .controller("NavCtrl", ['$scope', '$state', '$stateParams', 'Data', 'target', 'targetVersions', 'version',
        function($scope, $state, $stateParams, Data, target, targetVersions, version){

            targetVersions = _.compact(targetVersions)
            Data.setTarget(target)
            Data.setSelectedVersion(version)
            Data.setTargetVersions(targetVersions)

            // activate build state
            $state.go("target.version.builds.build")

            // update target versions when drop down target changes
            $scope.changeTarget = function(target){
                if(target == 'cblite' || target == 'sync_gateway'){
                    Data.setBuildFilter(0)
                }
                else
                {
                    Data.setBuildFilter(2000)
                }
                $state.go("target.version", {target: target, version: "latest"})
            }

            // update target versions when drop down target changes
            $scope.changeVersion = function(newVersion){
                if(newVersion != version){
                    Data.setBuildsFilter(10)
                    //Data.setBuildFilter(2000)
                    $state.go("target.version", {version: newVersion})
                }
            }

        }])
    .controller('TimelineCtrl', ['$scope', '$state', 'versionBuilds', 'Data',
        function($scope, $state, versionBuilds, Data){
            $scope.versionBuilds = versionBuilds
            
            // on build change reload jobs view
            $scope.onBuildChange = function(build){
                $scope.build = build
                Data.setBuild(build)
                if(build.indexOf("-") != -1){ build = build.split("-")[1]}
                $state.go("target.version.builds.build", {build: build})
            }

            // when build changes update timeline title
            $scope.$watch(function(){ return Data.getBuild()},
                function(build){
                    $scope.build = build
                })

            // activate generic build state
            $state.go("target.version.builds.build", {build: "latest"})
        }])


    .controller('JobsCtrl', ['$rootScope', '$scope', '$state', '$stateParams', 'Data', 'buildJobs', 'QueryService',
       function($rootScope, $scope, $state, $stateParams, Data, buildJobs, QueryService){

            var CLAIM_MAP = {
                "git error": ["hudson.plugins.git.GitException", "python3: can't open file 'testrunner.py': [Errno 2] No such file or directory"],
                "SSH error": ["paramiko.ssh_exception.SSHException", "Exception SSH session not active occurred on"],
                "IPv6 test on IPv4 host": ["Cannot enable IPv6 on an IPv4 machine"],
                "Python SDK error (CBQE-6230)": ["ImportError: cannot import name 'N1QLQuery' from 'couchbase.n1ql'"],
                "Syntax error": ["KeyError:", "TypeError:"],
                "json.decoder.JSONDecodeError:": ["json.decoder.JSONDecodeError:"],
                "ServerUnavailableException: unable to reach the host": ["ServerUnavailableException: unable to reach the host"],
                "Node already added to cluster": ["ServerAlreadyJoinedException:"],
                "CBQ Error": ["membase.api.exception.CBQError:", "CBQError: CBQError:"],
                "RBAC error": ["Exception: {\"errors\":{\"roles\":\"Cannot assign roles to user because the following roles are unknown, malformed or role parameters are undefined: [security_admin]\"}}"],
                "Rebalance error": ["membase.api.exception.RebalanceFailedException"],
                "Build download failed": ["Unable to copy build to", "Unable to download build in"],
                "install not started": ["INSTALL NOT STARTED ON"],
                "install failed": ["INSTALL FAILED ON"],
                "No test report xml": ["No test report files were found. Configuration error?"]
            }

            $scope.formatClaim = formatClaim

            $scope.openClaims = new Set()
            $scope.openClaim = function(jobName) {
                $scope.openClaims.add(jobName);
            }
            $scope.closeClaim = function(jobName) {
                $scope.openClaims.remove(jobName);
            }

            function getClaimSummary(jobs) {
                var claimCounts = {
                    "Analyzed": 0
                }
                var totalClaims = 0
                _.forEach(Object.keys(CLAIM_MAP), function(claim) {
                    claimCounts[claim] = {
                        jobCount: 0,
                        skippedTestCount: 0,
                        failedTestCount: 0
                    };
                })
                var jiraCounts = {}
                _.forEach(jiraPrefixes, function(prefix) {
                    jiraCounts[prefix] = 0;
                })
                var uniqueBugs = {}
                _.forEach(jiraPrefixes, function(prefix) {
                    uniqueBugs[prefix] = [];
                })
                _.forEach(jobs, function(job) {
                    var foundInJob = [];
                    _.forEach(job["bugs"], function(bug) {
                        try {
                            var prefix = bug.split("-")[0]
                            if (jiraPrefixes.includes(prefix)) {
                                if (!foundInJob.includes(bug)) {
                                    if (claimCounts[bug]) {
                                        claimCounts[bug].jobCount += 1;
                                        claimCounts[bug].failedTestCount += job["failCount"]
                                        claimCounts[bug].skippedTestCount += job["skipCount"]
                                    } else {
                                        claimCounts[bug] = {
                                            jobCount: 1,
                                            failedTestCount: job["failCount"],
                                            skippedTestCount: job["skipCount"]
                                        }
                                    }
                                    jiraCounts[prefix] += 1;
                                    foundInJob.push(bug);
                                }
                                if (!uniqueBugs[prefix].includes(bug)) {
                                    uniqueBugs[prefix].push(bug)
                                }
                            }
                            
                        } catch (e) {
                            console.error(e)
                        }
                    })
                    _.forEach(job["claim"].split("<br><br>"), function(jobClaim) {
                        if (jobClaim !== "" && !job["olderBuild"]) {
                            _.forEach(Object.keys(claimCounts), function(claim) {
                                if (jobClaim.startsWith(claim)) {
                                    if (!foundInJob.includes(claim)) {
                                        foundInJob.push(claim);
                                        claimCounts[claim].jobCount += 1;
                                        claimCounts[claim].failedTestCount += job["failCount"]
                                        claimCounts[claim].skippedTestCount += job["skipCount"]
                                    }
                                    return false;
                                }
                            })
                        }
                    })
                   
                })
                var claims = []
                _.forEach(Object.entries(claimCounts), function(entry) {
                    var jobCount = entry[1].jobCount
                    var failedTestCount = entry[1].failedTestCount
                    var skippedTestCount = entry[1].skippedTestCount
                    if (jobCount > 0) {
                        totalClaims += jobCount
                        claims.push({ claim: entry[0], skippedTestCount: skippedTestCount, failedTestCount: failedTestCount, jobCount: jobCount })
                    }
                })
                uniqueBugs["IT"] = uniqueBugs["CBD"].concat(uniqueBugs["CBIT"])
                delete uniqueBugs["CBD"]
                delete uniqueBugs["CBIT"]
                jiraCounts["IT"] = jiraCounts["CBD"] + jiraCounts["CBIT"]
                delete jiraCounts["CBD"]
                delete jiraCounts["CBIT"]
                $scope.jiraCounts = Object.entries(jiraCounts).map(function(jiraCount) {
                    var prefix = jiraCount[0]
                    var name
                    if (prefix === "MB") {
                        name = "Product bugs (MB)"
                    } else if (prefix === "CBQE") {
                        name = "Test bugs (CBQE)"
                    } else if (prefix === "IT") {
                        name = "IT bugs (CBIT/CBD)"
                    } else if (prefix === "CBSP") {
                        name = "Support bugs (CBSP)"
                    }
                    return { 
                        name: name,
                        count: jiraCount[1],
                        percent: totalClaims == 0 ? 0 : ((jiraCount[1]/totalClaims)*100).toFixed(0),
                        unique: uniqueBugs[prefix].length
                    }
                })
                .filter(function(jiraCount) {
                    return jiraCount.count > 0;
                })
                $scope.claimSummary = claims;
                $scope.totalClaims = totalClaims
                $scope.needToAnalyseCount = jobs.filter(function(job) { return !job["olderBuild"] && !job["deleted"] && (!["PENDING", "SUCCESS"].includes(job["result"]) || (job["result"] === "PENDING" && job["claim"] !== "")) }).length
                $scope.analysedPercent = $scope.needToAnalyseCount == 0 ? 0 :  (($scope.totalClaims/$scope.needToAnalyseCount)*100).toFixed(0)
            }

            $scope.jiraCounts = []
            $scope.showAnalysis = false
            $scope.changeShowAnalysis = function() {
                $scope.showAnalysis = !$scope.showAnalysis
            }

            // order by name initially
            $scope.predicate = "result"
            $scope.reverse = true
            $scope.activePanel = 0

            function setJobsPerPage(jobsPerPage) {
                if (jobsPerPage === "All") {
                    jobsPerPage = $scope.panelTabs[$scope.activePanel].jobs.length;
                }
                $scope.jobsPerPage = jobsPerPage;
                if ($scope.jobsPage > Math.max(0, $scope.numPages() - 1)) {
                    Data.setJobsPage($scope.numPages() - 1);
                }
            }

            $scope.targetBy = Data.getCurrentTarget();

            $scope.jobsPerPage = Data.getJobsPerPage();
            $scope.jobsPage = Data.getJobsPage();
            $scope.$watch(function() { return Data.getJobsPage() }, function(jobsPage) {
                $scope.jobsPage = jobsPage;
            })
            $scope.$watch(function() { return Data.getJobsPerPage() }, function(jobsPerPage) {
                setJobsPerPage(jobsPerPage);
            })

            $scope.nextPage = function() {
                if ($scope.nextPageExists()) {
                    Data.setJobsPage($scope.jobsPage + 1);
                }
            }
            $scope.prevPage = function() {
                if ($scope.jobsPage > 0) {
                    Data.setJobsPage($scope.jobsPage - 1);
                }
            }
            $scope.nextPageExists = function() {
                jobsLength = $scope.panelTabs[$scope.activePanel].jobs.length;
                return ($scope.jobsPage + 1) * $scope.jobsPerPage < jobsLength - 1;
            }
            $scope.setPage = function () {
                Data.setJobsPage(this.n);
            };
            $scope.numPages = function() {
                jobsLength = $scope.panelTabs[$scope.activePanel].jobs.length;
                if ($scope.jobsPerPage === 0) {
                    return 0;
                }
                return Math.ceil(jobsLength / $scope.jobsPerPage);
            }
            $scope.pageNumbers = function() {
                var start = $scope.jobsPage - 5;
                if (start < 0) {
                    start = 0;
                }
                var end = $scope.jobsPage + 5;
                var numPages = $scope.numPages();
                if (end > numPages) {
                    end = numPages;
                }
                return _.range(start, end);
            }
            function resetPage() {
                Data.setJobsPage(0);
                if (Data.getJobsPerPage() === "All") {
                    $scope.jobsPerPage = $scope.panelTabs[$scope.activePanel].jobs.length;
                }
            }

            $scope.predicate = "name";
            $scope.reverse = false;
            

                $scope.onselect = 
                    function(jobname,os,comp,variants){
                        var activeJobs = Data.getActiveJobs()
                        var target = Data.getCurrentTarget()
                        // activeJobs = _.reject(activeJobs, "olderBuild", true)
                        activeJobs = _.reject(activeJobs, "deleted", true)
                        
                        var requiredJobs = activeJobs.filter(function(job) {
                            return job.name === jobname && job.os === os && job.component === comp
                        })

                        $scope.model = {};
                        $scope.model.bestRun = requiredJobs.find(function(job) { return job.olderBuild === false; }).build_id.toString();
                        $scope.model.changeBestRun = function() {
                            if ($scope.model.bestRun !== undefined) {
                                _.forEach($scope.selectedjobdetails, function(job) {
                                    if (job.build_id === parseInt($scope.model.bestRun)) {
                                        job.olderBuild = false;
                                    } else {
                                        job.olderBuild = true;
                                    }
                                })
                                var updatedJobs = Data.getActiveJobs();
                                updateScopeWithJobs(updatedJobs, false);
                                $rootScope.$broadcast("recalculateStats");
                                QueryService.setBestRun(target, jobname, $scope.model.bestRun, os, comp, $scope.selectedbuild)
                            }
                        }

                            // requiredJobs = _.filter(activeJobs,["name",jobname,"os"])
                            $scope.len = requiredJobs.length
                            $scope.selectedjobdetails = requiredJobs
                            $scope.selectedjobname = requiredJobs[0].displayName
                            $scope.selectedbuild = requiredJobs[0].build
                    }
                
            $scope.search = ""
            $scope.onSearchChange = function() {
                jobs = Data.getActiveJobs()
                updateScopeWithJobs(jobs)
            }
            $scope.searchClaim = function(claim) {
                if ($scope.search === claim) {
                    $scope.search = ""
                } else {
                    $scope.search = claim
                }
                $scope.onSearchChange()
            }

            function updateScopeWithJobs(jobs, reset){
                if (reset === undefined) {
                    reset = true;
                }

                jobs = _.reject(jobs, "olderBuild", true)
                jobs = _.reject(jobs, "deleted", true)
                if ($scope.search !== "") {
                    jobs = _.reject(jobs, function(job) { 
                        return !(job.bugs.includes($scope.search) ||
                                job.claim.includes($scope.search) ||
                                job.name.includes($scope.search) || 
                                job.triage.includes($scope.search)) 
                    })
                }
                var jobsCompleted = _.uniq(_.reject(jobs, ["result", "PENDING"]))
                var jobsSuccess = _.uniq(_.filter(jobs, ["result", "SUCCESS"]))
                var jobsAborted = _.uniq(_.filter(jobs, ["result", "ABORTED"]))
                var jobsUnstable = _.uniq(_.filter(jobs, ["result", "UNSTABLE"]))
                var jobsInstallFailed = _.uniq(_.filter(jobs, ["result", "INST_FAIL"]))
                var jobsFailed = _.uniq(_.filter(jobs, ["result", "FAILURE"]))
                var jobsPending = _.uniq(_.filter(jobs, ["result", "PENDING"]))
                var jobsSkip = _.uniq(_.filter(jobs, function(job) { return job["skipCount"] > 0 }))
                

                $scope.panelTabs = [
                    {title: "Jobs Completed", jobs: jobsCompleted, active: true},
                    {title: "Jobs Success", jobs: jobsSuccess},
                    {title: "Jobs Aborted", jobs: jobsAborted},
                    {title: "Jobs Unstable", jobs: jobsUnstable},
                    {title: "Jobs Failed", jobs: jobsFailed},
                    {title: "Jobs Install Failed", jobs: jobsInstallFailed},
                    {title: "Jobs Skipped", jobs: jobsSkip},
                    {title: "Jobs Pending", jobs: jobsPending},
                ]                

                $scope.variantNames = []
                _.forEach(jobs, function(job) {
                    if (job.variants) {
                        _.forEach(job.variants, function(_, variant) {
                            if (!$scope.variantNames.includes(variant)) {
                                $scope.variantNames.push(variant)
                            }
                        })
                    }
                })
                // sort variant names, ignore case
                $scope.variantNames.sort(function(a, b) { 
                    var ia = a.toLowerCase();
                    var ib = b.toLowerCase();
                    return ia < ib ? -1 : ia > ib ? 1 : 0;
                })

                $scope.variantName = function(name) {
                    return name.split("_").map(function(part) {
                        return part[0].toUpperCase() + part.slice(1)
                    }).join(" ")
                }

                getClaimSummary(jobs)
                if (reset) {
                    resetPage();
                }
            }

            function getJobs() {
                var build = Data.getBuild()
                //var jobs = buildJobs[build].value
                //var allJobs = buildJobs['existing_builds'].value
                //var toReturn = processJob(jobs, allJobs)
                return buildJobs
            }

            function processJob(jobs, allJobs) {
                var type = jobs.type
                var existingJobs
		        var version = Data.getSelectedVersion()
                if (type == "mobile"){
                    existingJobs = _.pick(allJobs, "mobile")
                }
                else {
                    existingJobs = _.omit(allJobs, "mobile")
                    existingJobs = _.merge(allJobs['server'], allJobs['build'])
                    fs = require('fs');
                    fs.writeFile("merge.json", existingJobs)
                }
                _.forEach(existingJobs, function (components, os) {
                    _.forEach(components, function (jobNames, component) {
                        _.forEach(jobNames, function (name, job) {
                            if (!_.has(jobs['os'], os)){
                                jobs['os'][os] = {};
                            }
                            if (!_.has(jobs['os'][os], component)){
                                jobs['os'][os][component] = {};
                            }
                            if (!_.has(jobs['os'][os][component], job) && 
                                ((name.hasOwnProperty('jobs_in')) &&
                                    (name['jobs_in'].indexOf(version) > -1))) {
                                var pendJob = {}
                                pendJob['pending'] = name.totalCount
                                pendJob['totalCount'] = 0
                                pendJob['failCount'] = 0
                                pendJob['result'] = "PENDING"
                                pendJob['priority'] = name.priority
                                pendJob['url'] = name.url
                                pendJob['build_id'] = ""
                                pendJob['claim'] = ""
                                pendJob['deleted'] = false
                                pendJob['olderBuild'] = false
                                pendJob['duration'] = 0
                                pendJob['color'] = ''
                                jobs['os'][os][component][job] = [pendJob]
                            }
                        })
                    })
                })

                function clean(el) {
                    function internalClean(el) {
                        return _.transform(el, function(result, value, key) {
                            var isCollection = _.isObject(value);
                            var cleaned = isCollection ? internalClean(value) : value;

                            if (isCollection && _.isEmpty(cleaned)) {
                                return;
                            }

                            _.isArray(result) ? result.push(cleaned) : (result[key] = cleaned);
                        });
                    }

                    return _.isObject(el) ? internalClean(el) : el;
                }
                var cleaned =  clean(jobs)
                var toReturn = new Array()

                _.forEach(cleaned.os, function (components, os) {
                    _.forEach(components, function (jobNames, component) {
                        _.forEach(jobNames, function (jobs, jobName) {
                            _.forEach(jobs, function (jobDetail, job) {
                                var tempJob = _.cloneDeep(jobDetail)
                                tempJob['build'] = cleaned.build
                                tempJob['name'] = jobName
                                tempJob['component'] = component
                                tempJob['os'] = os
                                toReturn[toReturn.length] = tempJob
                            })
                        })
                    })
                })

                return toReturn
            }

            var jobs = getJobs()
            updateScopeWithJobs(jobs)
            Data.setBuildJobs(jobs)
            // set sidebar items from build job data
            var allPlatforms = _.uniq(_.map(jobs, "os"))
                .map(function(k){
                    return {key: k, disabled: false}
                })
            var allFeatures = _.uniq(_.map(jobs, "component"))
                .map(function(k){
                    return {key: k, disabled: false}
                })
            var allVersions = _.uniq(_.map(_.filter(buildJobs, function(job) { return job.server_version !== undefined }), "server_version"))
                .map(function (k) {
                    return {key: k, disabled: false}
                })
            var allDapi = _.uniq(_.map(_.filter(buildJobs, function(job) { return job.dapi !== undefined }), "dapi"))
                .map(function (k) {
                    return {key: k, disabled: false}
                })
            var allNebula = _.uniq(_.map(_.filter(buildJobs, function(job) { return job.dni !== undefined }), "dni"))
                .map(function (k) {
                    return {key: k, disabled: false}
                })
            var allEnv = _.uniq(_.map(_.filter(buildJobs, function(job) { return job.env !== undefined }), "env"))
                .map(function (k) {
                    return {key: k, disabled: false}
                })
            var sidebarItems = {platforms: allPlatforms, features: allFeatures, serverVersions: allVersions, dapiVersions: allDapi, nebulaVersions: allNebula, envVersions: allEnv }
            var allVariants = []

            _.forEach(jobs, function(job) {
                if (job.variants) {
                    _.forEach(Object.keys(job.variants), function(variant) {
                        if (!allVariants.includes(variant)) {
                            allVariants.push(variant)
                        }
                    })
                }
            })

            _.forEach(allVariants, function(variant) {
                sidebarItems[variant] = _.uniq(_.map(_.filter(jobs, function(job) { return job.variants && job.variants[variant] !== undefined }), "variants."+variant))
                .map(function (k) {
                    return {key: k, disabled: false}
                })
            })

            Data.setSideBarItems(sidebarItems);



            $scope.changePanelJobs = function(i){
                $scope.activePanel = i
                resetPage();
            }

            $scope.msToTime = msToTime
            $scope.msToDate = msToDate
            $scope.timestampToDate = function(timestmap) {
                if (timestmap) {
                    return new Date(timestmap).toLocaleString()
                } else {
                    return ""
                }
            }
            $scope.$watch(function(){ return Data.getActiveJobs() },
                function(activeJobs){
                    if(activeJobs){
                        updateScopeWithJobs(activeJobs)
                    }
                })


        }])
    .controller('JobDetailsCtrl',['$scope','$state','$stateParams','Data','target',
                function($scope,$state,$stateParams,Data,target){
                    
                    $scope.openClaims = []
                    
                    $scope.msToTime = msToTime
                    $scope.msToDate = msToDate
                    var jobname = $stateParams.jobName
                    
                    $scope.$watch(function(){
                        return Data.getActiveJobs()
                    },
                        function(activeJobs){
                            // activeJobs = _.reject(activeJobs, "olderBuild", true)
                            activeJobs = _.reject(activeJobs, "deleted", true)
                            
                            var requiredJobs = _.filter(activeJobs,["name",jobname])
                                $scope.jobDetails = requiredJobs
                           
                                $scope.jobname = jobname
                                $scope.build = requiredJobs[0].build
                        }
                    )

    }])
    .directive("claimTest", [function() {
        return {
            scope: {claim: "="},
            templateUrl: "partials/claim.html",
            link: function(scope) {
                var jobName = scope.$parent.job.name;
                scope.formatClaim = formatClaim
                var linesToShow = 50;
                scope.shortClaim = (scope.claim.length < linesToShow) ? scope.claim : scope.claim.split('<br><br>')[0].slice(0, linesToShow) + '...'
                scope.scope = {
                    showFullClaim: scope.$parent.$parent.openClaims.has(jobName),
                    changeShowFullClaim: function() {
                        if (this.showFullClaim) {
                            scope.$parent.$parent.openClaims.delete(jobName)
                        } else {
                            scope.$parent.$parent.openClaims.add(jobName)
                        }
                        this.showFullClaim = !this.showFullClaim
                    }
                }
            }
        }
    }])

    .directive('claimCell', ['Data', 'QueryService', function(Data, QueryService){
        return {
            restrict: 'E',
            scope: {job: "="},
            templateUrl: 'partials/claimcell.html',
            link: function(scope, elem, attrs){
                scope.editClaim = false;
                scope.scope = {
                    bugsText: scope.job.bugs.join(", "),
                    saveClaim: function() {
                        var bugs = this.bugsText
                        var validBugs = true;
                        if (bugs === "") {
                            bugs = []
                        } else {
                           bugs = bugs.split(",").map(function (bug) { return bug.trim() })
                           _.forEach(bugs, function(bug) {
                                console.log(bug)
                                var validBug = false;
                                _.forEach(jiraPrefixes, function(prefix) {
                                    if (bug.startsWith(prefix + "-") && !isNaN(bug.split("-")[1])) {
                                        validBug = true;
                                    }
                                })
                                if (!validBug) {
                                    validBugs = false;
                                    return false;
                                }
                            })
                        }
                        if (validBugs) {
                            scope.job.bugs = bugs
                            var target = Data.getCurrentTarget()
                            var name = scope.job.name
                            var build_id = scope.job.build_id
                            var bugs = scope.job.bugs
                            var os = scope.job.os
                            var comp = scope.job.component
                            var version = scope.job.build
                            QueryService.claimJob("bugs", target, name, build_id, bugs, os, comp, version)
                                .catch(function(err){
                                    alert("error saving claim: "+err.err)
                                }).then(function() {
                                    scope.editClaim = false;
                                })
                        } else {
                            alert("Invalid bugs list, must be " + jiraPrefixes.join(", "))
                        }
                    }
                }
                scope.formatBugs = function() {
                    return scope.job.bugs.map(function(bug) {
                        return '<a target="_blank" href="https://issues.couchbase.com/browse/' + bug + '">' + bug + '</a>'
                    }).join(", ")
                }
            }
        }
    }])

    .directive('triageCell', ['Data', 'QueryService', function(Data, QueryService){
        return {
            restrict: 'E',
            scope: {job: "="},
            templateUrl: 'partials/triagecell.html',
            link: function(scope, elem, attrs){
                scope.editClaim = false;
                scope.saveClaim = function() {
                    var target = Data.getCurrentTarget()
                    var name = scope.job.name
                    var build_id = scope.job.build_id
                    var triage = scope.job.triage
                    var os = scope.job.os
                    var comp = scope.job.component
                    var version = scope.job.build
                    QueryService.claimJob("triage", target, name, build_id, triage, os, comp, version)
                        .catch(function(err){
                            alert("error saving claim: "+err.err)
                        }).then(function() {
                            scope.editClaim = false;
                        })
                }

            }
        }
    }])
    .directive('pagination', ['Data', function(Data) {
        return {
            restrict: 'E',
            scope: {},
            templateUrl: 'partials/pagination.html',
            link: function(scope, element, attrs) {
                scope.jobsPage = Data.getJobsPage();
                scope.nextPageExists = scope.$parent.nextPageExists;
                scope.pageNumbers = scope.$parent.pageNumbers;
                scope.nextPage = scope.$parent.nextPage;
                scope.prevPage = scope.$parent.prevPage;
                scope.setPage = scope.$parent.setPage;
                scope.jobsPerPageChoices = [20, 50, 100, 500, 1000, 'All'];
                scope.jobsPerPage = Data.getJobsPerPage();

                scope.$watch(function() { return Data.getJobsPage() }, function(jobsPage) {
                    scope.jobsPage = jobsPage;
                })

                scope.$watch(function() { return Data.getJobsPerPage() }, function(jobsPerPage) {
                    scope.jobsPerPage = jobsPerPage;
                })

                scope.onJobsPerPageChange = function() {
                    Data.setJobsPerPage(scope.jobsPerPage);
                }

            }
        }

    }])
    .directive('rerunButton', ['QueryService', function(QueryService){
        return {
            restrict: 'E',
            scope: {job: "="},
            templateUrl: 'partials/rerun_button.html',
            link: function(scope, elem, attrs){
                scope.submitting = false;
                scope.error = false;
                scope.dispatched = false;
                scope.rerunJob = function() {
                    if (!confirm("Rerun " + scope.job.name + "?")) {
                        return;
                    }
                    scope.error = false;
                    scope.submitting = true;
                    scope.dispatched = false;
                    QueryService.rerunJob(scope.job.url + scope.job.build_id, null)
                        .then(function() {
                            scope.submitting = false;
                            scope.dispatched = true;
                        })
                        .catch(function(e) {
                            scope.submitting = false;
                            scope.error = true;
                            if (e.data.err) {
                                alert(e.data.err);
                            }
                        })
                }
                scope.btnText = function() {
                    if (scope.error) {
                        return "Error dispatching";
                    }
                    if (scope.submitting) {
                        return "Dispatching...";
                    }
                    if (scope.dispatched) {
                        return "Dispatched";
                    }
                    return "Rerun";
                }
            }
        }
    }])



// https://coderwall.com/p/wkdefg/converting-milliseconds-to-hh-mm-ss-mmm
function msToTime(duration) {
    var milliseconds = duration % 1000;
    duration = (duration - milliseconds) / 1000;
    var seconds = duration % 60;
    duration = (duration - seconds) / 60;
    var minutes = duration % 60;
    var hours = (duration - minutes) / 60;

    hours = (hours < 10) ? "0" + hours : hours;
    minutes = (minutes < 10) ? "0" + minutes : minutes;
    seconds = (seconds < 10) ? "0" + seconds : seconds;

    return hours + ":" + minutes + ":" + seconds;
}


function msToDate(duration) {
    var obj = new Date(duration);
    var time = obj.getUTCHours() + ":" + obj.getUTCMinutes();
    var date = obj.getDate() + "/" + (obj.getMonth() + 1) + "/" + obj.getFullYear();
    return date + " - " + time;
}

angular.module('svc.query', [])
	.service("QueryService",['$http', 'Data',
		function($http, Data){
		  return {
			getVersions: function(target){
				var url = ["versions", target].join("/")
		        return $http({"url": url, cache: true})
		        			.then(function(response){
		        				return response.data
		        			})
			},
			getBuilds: function(target, version, testsFilter, buildsFilter){
				var url = ["builds", target, version, testsFilter, buildsFilter].join("/")
		        return $http({"url": url, cache: true})
		        			.then(function(response){		
		        				return response.data
		        			})				
			},
			getJobs: function(build, target){
				var url = ["jobs", build, target].join("/")
		        return $http({"url": url, cache: true})
		        			.then(function(response){
		        				return response.data
		        			})				
			},
			getBuildInfo: function(build, target){
				var url = ["info", build, target].join("/")
				return $http({"url": url, cache: true})
                           .then(function(response){
                               return response.data
                        })
			},
			claimJob: function(type, target, name, build_id, claim, os, comp, build){
				var url = ["claim", target, name, build_id].join("/")
				return $http.post(url, {type: type, claim: claim, os: os, comp: comp, build: build})
			},
			getBuildSummary: function (buildId) {
				var url = ["getBuildSummary", buildId].join("/")
				return $http({"url": url, cache: true})
					.then(function (response) {
						return response.data
                    })
			},
			setBestRun: function(target, name, build_id, os, comp, build) {
				var url = ["setBestRun", target, name, build_id].join("/")
				return $http.post(url, {os:os,comp:comp,build:build})
			},
			rerunJob: function(jobUrl, cherryPick) {
				return $http.post("rerunJob", { cherryPick: cherryPick, jobUrl: jobUrl })
			}
		  }
		}])

angular.module('app.sidebar', [])

  .directive('viewSidebar', ['Data', function(Data){
 	  	return {
	  		restrict: 'E',
	  		scope: {},
	  		templateUrl: 'partials/sidebar.html',
	  		link: function(scope, elem, attrs){

	  		  scope.showPerc = false
			  scope.disabled = {}

              scope.buildVersion = Data.getBuild()
			  scope.targetBy = Data.getCurrentTarget()

	  		  scope.toggleAll = function(type){
	  		  	var isDisabled = !scope.disabled[type];
				scope.disabled[type] = isDisabled
	  		  	Data.toggleAllSidebarItems(type, isDisabled)
	  		  }
			  scope.variantName = function(name) {
				return name.split("_").map(function(part) {
					return part[0].toUpperCase() + part.slice(1)
				}).join(" ")
			  }
			  
			  // Detect when build has changed
			  scope.$watch(function(){ return Data.getSideBarItems() }, 
				function(items, last){

					if(!items) { return }

					// only update sidebar items on build change
					// if(items.buildVersion != last.buildVersion){
						scope.buildVersion = items.buildVersion
					    scope.sidebarItems = {}
						_.forEach(items, function(values, name) {
							if (name === "buildVersion") {
								return;
							}
							scope.sidebarItems[name] = _.map(values, "key")
							if (scope.disabled[name] === undefined) {
								scope.disabled[name] = false
							}
						})
						// variants are any filters that are not the default
						// sort variant names, ignore case
						scope.sidebarItemsVariants = Object.keys(scope.sidebarItems).filter(function(item) {
							return !["platforms", "features", "serverVersions", "dapiVersions", "nebulaVersions", "envVersions"].includes(item);
						}).sort(function(a, b) { 
							var ia = a.toLowerCase();
							var ib = b.toLowerCase();
							return ia < ib ? -1 : ia > ib ? 1 : 0;
						})
						
					// }

					// if all sidebar items of a type selected
					// enable all checkmark
					_.forEach(items, function(values, name) {
						if (name === "buildVersion") {
							return;
						}
						noDisabled = !_.some(_.map(values, "disabled"))
						scope.disabled[name] = !noDisabled
					})

				}, true)

	  		}
	  	}
  }])

  .directive('sidebarItem', ['Data', function(Data){
  	return {
  		restrict: 'E',
  		scope: {
  			type: "@",
  			key: "@",
  			asNum: "&showPerc"
  		},
  		templateUrl: "partials/sidebar_item.html",
  		link: function(scope, elem, attrs){

  			//TODO: allow modify by location url

  			scope.disabled = false
			scope.stats = Data.getItemStats(scope.key, scope.type)
			scope.showDashboardUrls = Data.getCurrentTarget() === "server" && Data.getSelectedVersion() === "7.0.0"

  			scope.getRunPercent = function(){
  				if(!scope.disabled){
	  				return scope.stats.percStats.run
	  			}
			  }
			  
			scope.getDashboardUrl = function() {
				if (!scope.showDashboardUrls) {
					return null;
				}
				var dashboardMap = {
					'2I_MOI': 'ovawbLBGk',
					'2I_REBALANCE': 'Yr2QbLBMz',
					ANALYTICS: 'Qb8QbYfGz',
					AUTO_FAILOVER: 'mO6lbYBGz',
					BACKUP_RECOVERY: 'Dv_QxLfGz',
					BUILD_SANITY: 'IPm-bSLMk',
					CE_ONLY: '80ZuxLBGk',
					CLI: 'U6gubLfMz',
					COLLECTIONS: 'BGtwbLfMk',
					COMPRESSION: 'RQX_bYfMz',
					DURABILITY: 'qH5QbYBMz',
					EP: 'aTj_xYBGk',
					EPHEMERAL: 'feYwbLBMk',
					EVENTING: 'k2QQbLfMk',
					FTS: 'pBAwxLfGk',
					GEO: 'Dn4ubYfGz',
					GOXDCR: 'h1JQbLfGz',
					IMPORT_EXPORT: 'kf9lbLBGk',
					IPV6: 'K_rQxLBGz',
					LOG_REDACTION: 'Cv7XxYfMz',
					MAGMA: '09PQxLBMz',
					MOBILE: 'QMRuxYBGz',
					MOBILE_CONVERGENCE: 'LyywbLfGk',
					NSERV: 'iUowxYfGz',
					OS_CERTIFY: 'Od2-6tfMk',
					PLASMA: 'qiLwbLfGk',
					QUERY: 'C2dQxYBMk',
					RBAC: 'KGXQbYBMz',
					RQG: 'tnfwbYBMk',
					RZA: 'iRIubYBMz',
					SANITY: 'tGRa6tBMk',
					SDK: 'Bdq_bLBGz',
					SECURITY: 'SpxQxYfGk',
					SUBDOC: 'feuQbYBGz',
					TUNABLE: '_LmXxYBMk',
					UNIT: 'fKMuxYBMk',
					UPGRADE: 'ftKwxYfGz',
					VIEW: '-_zubYBMk'
				}
				var dashboardId = dashboardMap[scope.key]
				if (dashboardId) {
					return "http://qe.service.couchbase.com:3000/d/" + dashboardId
				} else {
					return null;
				}
			}

	  		scope.getNumOrPerc = function(key){
	  			// return value by number or percentage
	  			var stats = scope.stats
	  			var asNum = scope.asNum()
	  			return asNum ? stats.absStats[key] : stats.percStats[key]
	  		}

	  		// configure visibility
	  		scope.toggleItem = function(){
	  			if(scope.type == "build"){ return } // not clickable
		  		Data.toggleItem(scope.key, scope.type, !scope.disabled)
	  		}


	  		// set item bg
	  		scope.bgColor = function(){
	  			var color = "greyed"
	  			var stats = scope.stats
	  			if(scope.disabled){
					scope.glyphiconClass="glyphicon-unchecked"
					return color
				}

				scope.glyphiconClass="glyphicon-check"
	  			passPerc = stats.percStats.passedRaw
	  			if(passPerc == 100){
		  			color = "bg-success"
		  		} else if(passPerc >= 70){
		  			color = "bg-warning"
		  		} else if(passPerc >= 0) {
            // only set color to danger if we can prove jobs actually are failing
            if(stats.absStats.failed > 0){
              color = "bg-danger"
            } else {
              color = "bg-muted"
            }
		  		}
		  		return color
		  	}

            // deep watch sidebar to update item stats
		    scope.$watch(function(){ return Data.getSideBarItems() },
			  function(newSideBarItem){

			  	// we'll get notified here if this item was disabled
			  	var thisItem = _.find(newSideBarItem[scope.type], {"key": scope.key})
			  	if(thisItem){
			  		scope.disabled = thisItem.disabled
			    }

			  	// update item stats
                scope.stats = Data.getItemStats(scope.key, scope.type)
			}, true)

			scope.$on('recalculateStats', function() {
				// update item stats e.g. when updating best run
                scope.stats = Data.getItemStats(scope.key, scope.type);
			})

  		}
  	}
  }])

angular.module('app.target', [])

    .directive('targetSelector', ['ViewTargets', 'Data',
        function (ViewTargets, Data) {
            return {
                restrict: 'E',
                scope: {
                    changeTarget: "="
                },
                templateUrl: 'partials/targets.html',
                link: function (scope, elem, attrs) {

                    // watch changes from parent scope
                    scope.$watch(function () {
                            return Data.getCurrentTarget()
                        },
                        function (target) {
                            if (!target) {
                                return
                            }

                            // configure drop down to show all targets
                            scope.viewTargets = ViewTargets.allTargets()

                            // set currently viewed scope target
                            scope.targetBy = ViewTargets.getTarget(target)

                        })


                }
            }
        }])

    .directive('filterSelector', ['Data', 'QueryService',
        function (Data, QueryService) {
            return {
                restrict: 'E',
                scope: {
                    changeFilter: "="
                },
                templateUrl: 'partials/filters.html',
                link: function (scope, elem, attrs) {

                    scope.activeFilter = Data.getBuildFilter()
                    scope.passFilters = [0, 2000, 5000]

                    scope.changeFilter = function (f) {
			            var target = Data.getCurrentTarget()
                        var version = Data.getSelectedVersion()
                        var buildsFilter = Data.getBuildsFilter()
                        var testsFilter = f
                        QueryService.getBuilds(target, version, testsFilter, buildsFilter).then(function(builds){
                            Data.setVersionBuilds(builds)
                            Data.setBuildFilter(scope.activeFilter)
                            return Data.getVersionBuilds()
                        })
                        scope.activeFilter = f
                    }

                }
            }
        }])
    .directive('buildsFilterSelector', ['Data', 'QueryService',
        function (Data, QueryService) {
            return {
                restrict: 'E',
                scope: {
                    changeBuildsFilter: "=?"
                },
                templateUrl: 'partials/buildsfilters.html',
                link: function (scope, elem, attrs) {

                    scope.activeBuildFilter = Data.getBuildsFilter()
                    scope.buildsFilters = [5, 10, 25, 100]

                    scope.changeBuildsFilter = function (f) {
			            var target = Data.getCurrentTarget()
                        var version = Data.getSelectedVersion()
                        var testsFilter = Data.getBuildFilter()

                        var buildsFilter = f
                        var retry = 3
                        var get = function(){QueryService.getBuilds(target, version, testsFilter, buildsFilter).then(function(builds){
                            Data.setVersionBuilds(builds)
                            // if(builds.length != buildsFilter && retry!=0){
                            //     Data.setBuildsFilter(0)
                            //     setTimeout(function(){get()},3000)
                            //     retry = retry - 1
                            // }
                            // else{
                            Data.setBuildsFilter(scope.activeBuildFilter)
                            // }
                            return Data.getVersionBuilds()
                            
                        })}
                        get();
                        // Data.setBuildsFilter(scope.activeBuildFilter)
                        scope.activeBuildFilter = f
                    }

                }
            }
        }])


    .directive('versionSelector', ['$stateParams', 'ViewTargets', 'QueryService', 'Data',
        function ($stateParams, ViewTargets, QueryService, Data) {
            return {
                restrict: 'E',
                templateUrl: 'partials/versions.html',
                scope: {
                    changeVersion: "="
                },
                link: function (scope, elem, attrs) {
                    scope.hasNext = true
                    scope.hasPrevious = true
                    var versionWindowSize = 5

                    function setNextPrevStatus() {

                        var lastGroupIndex = scope.versionGroups.length - 1
                        scope.hasNext = scope.groupIndex == 0 ? false : true
                        scope.hasPrevious = scope.groupIndex == lastGroupIndex ? false : true

                    }

                    scope.showPrevious = function () {
                        if (scope.hasPrevious) {
                            scope.groupIndex++ // previous is higher increment since we're reversed
                            scope.targetVersions = scope.versionGroups[scope.groupIndex]
                            setNextPrevStatus()
                        }
                    }
                    scope.showNext = function () {
                        if (scope.hasNext) {
                            scope.groupIndex--
                            scope.targetVersions = scope.versionGroups[scope.groupIndex]
                            setNextPrevStatus()
                        }
                    }

                    scope.$watch(function () {
                            return Data.getSelectedVersion()
                        },
                        function (version) {
                            if (version) {
                                scope.version = version
                                var targetVersions = _.clone(Data.getTargetVersions())
                                targetVersions.reverse()
                                var versionIndex = _.indexOf(targetVersions, version)

                                // construct window of 5 builds
                                scope.versionGroups = _.map(_.chunk(targetVersions, versionWindowSize),
                                    function (group) {
                                        group.reverse();
                                        return group
                                    })

                                // figure out which group we're in
                                scope.groupIndex = Math.floor(versionIndex / versionWindowSize)
                                scope.targetVersions = scope.versionGroups[scope.groupIndex]


                                setNextPrevStatus()
                            }
                        })
                }
            }
        }])


    .factory('ViewTargets', ['COUCHBASE_TARGET', 'SDK_TARGET', 'SG_TARGET', 'CBLITE_TARGET', 'CBO_TARGET','CAPELLA_TARGET','SERVERLESS_TARGET',
  	function (COUCHBASE_TARGET, SDK_TARGET, SG_TARGET, CBLITE_TARGET, CBO_TARGET, CAPELLA_TARGET, SERVERLESS_TARGET){

      var viewTargets = [COUCHBASE_TARGET, SDK_TARGET, SG_TARGET, CBLITE_TARGET, CBO_TARGET, CAPELLA_TARGET, SERVERLESS_TARGET]
      var targetMap = {} // reverse lookup map

      // allow reverse lookup by bucket
      viewTargets = viewTargets.map(function(t, i){
        t['i'] = i
        targetMap[t.bucket] = t
        return t
      })

      return {
            allTargets: function(){
            	return viewTargets
            },
            getTarget: function(target){
            	return targetMap[target]
            }
        }
  }])


 .value('COUCHBASE_TARGET', {
        "title": "Couchbase Server",
        "bucket": "server",
        "key": "abspassed",
        "value": 100,
        "options": [0, 50, 100, 500]
  })
 .value('SDK_TARGET', {
        "title": "SDK",
        "bucket": "sdk",
        "key": "abspassed",
        "value": 100,
        "options": [0, 50, 100, 500]
  })
  .value('SG_TARGET', {
        "title": "Sync Gateway",
        "bucket": "sync_gateway",
        "key": "abspassed",
        "value": 0,
        "options": [0, 50, 100, 500]
  })
  .value('CBLITE_TARGET', {
        "title": "Couchbase Lite",
        "bucket": "cblite",
        "key": "abspassed",
        "value": 0,
        "options": [0, 50, 100, 500]
  })
  .value('CBO_TARGET', {
         "title": "Couchbase Operator",
         "bucket": "operator",
         "key": "abspassed",
         "value": 0,
         "options": [0, 50, 100, 500]
  })
  .value('CAPELLA_TARGET', {
         "title": "Capella",
         "bucket": "capella",
         "key": "abspassed",
         "value": 0,
         "options": [0, 50, 100, 500]
  })
  .value('SERVERLESS_TARGET', {
        "title": "Serverless",
        "bucket": "serverless",
        "key": "abspassed",
        "value": 0,
        "options": [0, 50, 100, 500]
  })
;


