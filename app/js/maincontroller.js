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
                
            // Trend modal handling
            $scope.trendData = null;
            $scope.trendLoading = false;
            $scope.trendJobName = '';
            $scope.trendBaseVersion = '';
            $scope.trendChartType = 'scatter'; // 'scatter' or 'bar'
            
            $scope.toggleChartType = function() {
                $scope.trendChartType = $scope.trendChartType === 'scatter' ? 'bar' : 'scatter';
                if ($scope.trendData && $scope.trendData.trend) {
                    setTimeout(function() {
                        if ($scope.trendChartType === 'scatter') {
                            renderTrendChart($scope.trendData.trend);
                        } else {
                            renderBarChart($scope.trendData.trend);
                        }
                    }, 100);
                }
            };
            
            $rootScope.$on('openTrendModal', function(event, data) {
                $scope.trendData = data.trendData;
                $scope.trendJobName = data.jobName;
                $scope.trendBaseVersion = data.baseVersion;
                $scope.trendLoading = false;
                $scope.trendChartType = 'scatter'; // Reset to scatter view
                
                // Open Bootstrap modal
                $('#trendModal').modal('show');
                
                // Render chart after modal is fully shown
                $('#trendModal').on('shown.bs.modal', function() {
                    $scope.$apply(function() {
                        if ($scope.trendData && $scope.trendData.trend) {
                            setTimeout(function() {
                                renderTrendChart($scope.trendData.trend);
                            }, 100);
                        }
                    });
                });
                
                // Also try after a delay as fallback
                setTimeout(function() {
                    if ($scope.trendData && $scope.trendData.trend) {
                        var chartContainer = document.getElementById('trend-chart-container');
                        if (chartContainer && chartContainer.offsetWidth > 0) {
                            renderTrendChart($scope.trendData.trend);
                        }
                    }
                }, 500);
            });
            
            // Function to render D3 trend chart - Scatter/Timeline visualization (D3 v3 compatible)
            function renderTrendChart(trendData) {
                if (!trendData || trendData.length === 0) {
                    console.log("No trend data to render");
                    return;
                }
                
                try {
                    // Clear previous chart
                    d3.select("#trend-chart").selectAll("*").remove();
                    
                    var margin = {top: 40, right: 30, bottom: 80, left: 60};
                    var container = document.getElementById('trend-chart-container');
                    if (!container) {
                        console.error("Chart container not found");
                        return;
                    }
                    var width = container.offsetWidth - margin.left - margin.right;
                    var height = 400 - margin.top - margin.bottom;
                    
                    if (width <= 0 || height <= 0) {
                        console.error("Invalid dimensions:", width, height);
                        return;
                    }
                    
                    var svg = d3.select("#trend-chart")
                        .attr("width", width + margin.left + margin.right)
                        .attr("height", height + margin.top + margin.bottom);
                    
                    var g = svg.append("g")
                        .attr("transform", "translate(" + margin.left + "," + margin.top + ")");
                    
                    // Sort trend data by version and run number
                    var sortedData = trendData.slice().sort(function(a, b) {
                        var aVersionNum = parseInt(a.version.split('-')[1] || '0');
                        var bVersionNum = parseInt(b.version.split('-')[1] || '0');
                        if (aVersionNum !== bVersionNum) {
                            return aVersionNum - bVersionNum;
                        }
                        return a.run_number - b.run_number;
                    });
                    
                    // Get unique versions for X-axis
                    var uniqueVersions = [];
                    sortedData.forEach(function(d) {
                        if (uniqueVersions.indexOf(d.version) === -1) {
                            uniqueVersions.push(d.version);
                        }
                    });
                    
                    // Create scales (D3 v3 syntax)
                    var xScale = d3.scale.ordinal()
                        .domain(uniqueVersions)
                        .rangePoints([0, width], 1);
                    
                    var maxRunNumber = d3.max(sortedData, function(d) { return d.run_number; }) || 1;
                    var yScale = d3.scale.linear()
                        .domain([0.5, maxRunNumber + 0.5])
                        .nice()
                        .range([height, 0]);
                    
                    // Color function for pass/fail
                    var colorScale = function(d) {
                        return d.result === 'pass' ? '#28a745' : '#dc3545';
                    };
                    
                    // Remove grid lines - cleaner look
                    
                    // Group data by version for jittering (so multiple runs per version don't overlap)
                    var versionGroups = {};
                    sortedData.forEach(function(d) {
                        if (!versionGroups[d.version]) {
                            versionGroups[d.version] = [];
                        }
                        versionGroups[d.version].push(d);
                    });
                    
                    // Calculate jitter offset for multiple runs in same version
                    var jitteredData = [];
                    uniqueVersions.forEach(function(version) {
                        var runs = versionGroups[version];
                        var jitterRange = Math.min(30, width / uniqueVersions.length * 0.3);
                        runs.forEach(function(d, i) {
                            var jitter = (runs.length > 1) ? 
                                ((i - (runs.length - 1) / 2) * (jitterRange / runs.length)) : 0;
                            jitteredData.push({
                                data: d,
                                x: xScale(version) + jitter,
                                y: yScale(d.run_number)
                            });
                        });
                    });
                    
                    // Add circles for each run
                    var circles = g.selectAll(".run-circle")
                        .data(jitteredData)
                        .enter()
                        .append("circle")
                        .attr("class", "run-circle")
                        .attr("cx", function(d) { return d.x; })
                        .attr("cy", function(d) { return d.y; })
                        .attr("r", 0)
                        .attr("fill", function(d) { return colorScale(d.data); })
                        .attr("stroke", function(d) { 
                            return d.data.result === 'pass' ? '#1e7e34' : '#a71e2a';
                        })
                        .attr("stroke-width", 2)
                        .attr("opacity", 0.8)
                        .style("cursor", "pointer");
                    
                    // Animate circles appearing
                    circles.transition()
                        .duration(800)
                        .delay(function(d, i) { return i * 30; })
                        .attr("r", function(d) {
                            // Larger circles for first runs, smaller for later runs
                            return 6 + (d.data.run_number === 1 ? 2 : 0);
                        })
                        .attr("opacity", 0.9);
                    
                    // Add hover effects and tooltips
                    circles.on("mouseover", function(d) {
                            d3.select(this)
                                .transition()
                                .duration(200)
                                .attr("r", 10)
                                .attr("opacity", 1)
                                .attr("stroke-width", 3);
                            
                            var tooltip = d3.select("body").append("div")
                                .attr("class", "trend-tooltip")
                                .style("opacity", 0)
                                .style("position", "absolute")
                                .style("background", "rgba(0, 0, 0, 0.9)")
                                .style("color", "#fff")
                                .style("padding", "10px 14px")
                                .style("border-radius", "6px")
                                .style("pointer-events", "none")
                                .style("font-size", "13px")
                                .style("z-index", "10001")
                                .style("box-shadow", "0 4px 12px rgba(0,0,0,0.3)");
                            
                            var tooltipText = "<strong>" + d.data.result.toUpperCase() + "</strong><br/>" +
                                             "Version: " + d.data.version + "<br/>" +
                                             "Run #: " + d.data.run_number;
                            if (d.data.url) {
                                tooltipText += "<br/><a href='" + d.data.url + "' target='_blank' style='color: #9b8fff; text-decoration: underline;'>View Job →</a>";
                            }
                            tooltip.html(tooltipText);
                            
                            tooltip.transition()
                                .duration(200)
                                .style("opacity", 1);
                            
                            var mousePos = d3.mouse(document.body);
                            tooltip.style("left", (mousePos[0] + 15) + "px")
                                   .style("top", (mousePos[1] - 10) + "px");
                        })
                        .on("mousemove", function(d) {
                            var mousePos = d3.mouse(document.body);
                            d3.select(".trend-tooltip")
                                .style("left", (mousePos[0] + 15) + "px")
                                .style("top", (mousePos[1] - 10) + "px");
                        })
                        .on("mouseout", function(d) {
                            d3.select(this)
                                .transition()
                                .duration(200)
                                .attr("r", function(d) {
                                    return 6 + (d.data.run_number === 1 ? 2 : 0);
                                })
                                .attr("opacity", 0.9)
                                .attr("stroke-width", 2);
                            d3.selectAll(".trend-tooltip").remove();
                        });
                    
                    // Connect all dots with a trend line (chronological order)
                    // Sort by version and run number for proper connection order
                    var connectedData = jitteredData.slice().sort(function(a, b) {
                        var aVersionNum = parseInt(a.data.version.split('-')[1] || '0');
                        var bVersionNum = parseInt(b.data.version.split('-')[1] || '0');
                        if (aVersionNum !== bVersionNum) {
                            return aVersionNum - bVersionNum;
                        }
                        return a.data.run_number - b.data.run_number;
                    });
                    
                    // Create trend line connecting all points
                    var trendLine = d3.svg.line()
                        .x(function(d) { return d.x; })
                        .y(function(d) { return d.y; })
                        .interpolate("linear"); // Straight lines
                    
                    g.append("path")
                        .datum(connectedData)
                        .attr("class", "trend-line")
                        .attr("d", trendLine)
                        .attr("fill", "none")
                        .attr("stroke", "#667EEA")
                        .attr("stroke-width", 2)
                        .attr("opacity", 0.6)
                        .style("pointer-events", "none");
                    
                    // Add version lines (vertical lines connecting runs of same version)
                    uniqueVersions.forEach(function(version) {
                        var versionRuns = jitteredData.filter(function(d) { return d.data.version === version; });
                        if (versionRuns.length > 1) {
                            var lineData = versionRuns.map(function(d) { return [d.x, d.y]; });
                            var line = d3.svg.line()
                                .x(function(d) { return d[0]; })
                                .y(function(d) { return d[1]; })
                                .interpolate("linear");
                            
                            g.append("path")
                                .datum(lineData)
                                .attr("class", "version-line")
                                .attr("d", line)
                                .attr("fill", "none")
                                .attr("stroke", "#999")
                                .attr("stroke-width", 1.5)
                                .attr("stroke-dasharray", "3,3")
                                .attr("opacity", 0.5)
                                .style("pointer-events", "none");
                        }
                    });
                    
                    // Add X axis (D3 v3 syntax)
                    var xAxis = d3.svg.axis()
                        .scale(xScale)
                        .orient("bottom")
                        .tickSize(6)
                        .tickPadding(8);
                    
                    g.append("g")
                        .attr("class", "x axis")
                        .attr("transform", "translate(0," + height + ")")
                        .call(xAxis)
                        .selectAll("text")
                        .style("text-anchor", "middle")
                        .style("font-size", "11px")
                        .attr("dy", ".35em");
                    
                    // Add Y axis (D3 v3 syntax)
                    var yAxis = d3.svg.axis()
                        .scale(yScale)
                        .orient("left")
                        .ticks(Math.min(10, maxRunNumber))
                        .tickSize(6)
                        .tickPadding(8);
                    
                    g.append("g")
                        .attr("class", "y axis")
                        .call(yAxis);
                    
                    // Add axis labels
                    g.append("text")
                        .attr("transform", "rotate(-90)")
                        .attr("y", 0 - margin.left)
                        .attr("x", 0 - (height / 2))
                        .attr("dy", "1em")
                        .style("text-anchor", "middle")
                        .style("font-size", "13px")
                        .style("font-weight", "600")
                        .style("fill", "#333")
                        .text("Run Number");
                    
                    g.append("text")
                        .attr("transform", "translate(" + (width / 2) + " ," + (height + margin.bottom - 10) + ")")
                        .style("text-anchor", "middle")
                        .style("font-size", "13px")
                        .style("font-weight", "600")
                        .style("fill", "#333")
                        .text("Version");
                    
                    // Legend is now in HTML, not in SVG
                    
                    console.log("Chart rendered successfully");
                } catch (error) {
                    console.error("Error rendering chart:", error);
                }
            }
            
            // Function to render bar chart (D3 v3 compatible)
            function renderBarChart(trendData) {
                if (!trendData || trendData.length === 0) {
                    console.log("No trend data to render");
                    return;
                }
                
                try {
                    // Clear previous chart
                    d3.select("#trend-chart").selectAll("*").remove();
                    
                    var margin = {top: 40, right: 30, bottom: 80, left: 60};
                    var container = document.getElementById('trend-chart-container');
                    if (!container) {
                        console.error("Chart container not found");
                        return;
                    }
                    var width = container.offsetWidth - margin.left - margin.right;
                    var height = 400 - margin.top - margin.bottom;
                    
                    if (width <= 0 || height <= 0) {
                        console.error("Invalid dimensions:", width, height);
                        return;
                    }
                    
                    var svg = d3.select("#trend-chart")
                        .attr("width", width + margin.left + margin.right)
                        .attr("height", height + margin.top + margin.bottom);
                    
                    var g = svg.append("g")
                        .attr("transform", "translate(" + margin.left + "," + margin.top + ")");
                    
                    // Sort trend data by version and run number
                    var sortedData = trendData.slice().sort(function(a, b) {
                        var aVersionNum = parseInt(a.version.split('-')[1] || '0');
                        var bVersionNum = parseInt(b.version.split('-')[1] || '0');
                        if (aVersionNum !== bVersionNum) {
                            return aVersionNum - bVersionNum;
                        }
                        return a.run_number - b.run_number;
                    });
                    
                    // Group data by version
                    var versionGroups = {};
                    sortedData.forEach(function(d) {
                        if (!versionGroups[d.version]) {
                            versionGroups[d.version] = [];
                        }
                        versionGroups[d.version].push(d);
                    });
                    
                    // Get unique versions for X-axis
                    var uniqueVersions = Object.keys(versionGroups).sort(function(a, b) {
                        var aNum = parseInt(a.split('-')[1] || '0');
                        var bNum = parseInt(b.split('-')[1] || '0');
                        return aNum - bNum;
                    });
                    
                    // Create scales (D3 v3 syntax)
                    var xScale = d3.scale.ordinal()
                        .domain(uniqueVersions)
                        .rangeBands([0, width], 0.2);
                    
                    var maxRunNumber = d3.max(sortedData, function(d) { return d.run_number; }) || 1;
                    var yScale = d3.scale.linear()
                        .domain([0, maxRunNumber])
                        .nice()
                        .range([height, 0]);
                    
                    // Color function for pass/fail
                    var colorScale = function(d) {
                        return d.result === 'pass' ? '#28a745' : '#dc3545';
                    };
                    
                    // Calculate bar width (single bar per version, will be stacked)
                    var barWidth = xScale.rangeBand() * 0.6;
                    var barXOffset = (xScale.rangeBand() - barWidth) / 2;
                    
                    // Create stacked bars for each version
                    uniqueVersions.forEach(function(version, versionIndex) {
                        var runs = versionGroups[version].slice().sort(function(a, b) {
                            return a.run_number - b.run_number;
                        });
                        var versionX = xScale(version) + barXOffset;
                        
                        // Calculate cumulative heights for stacking
                        // Each segment height should represent the run number position
                        var cumulativeY = height;
                        var segmentDelay = 0;
                        var previousRunNumber = 0;
                        
                        runs.forEach(function(d, runIndex) {
                            // Each segment represents one run
                            // Height is based on the difference between current and previous run number
                            var currentRunY = yScale(d.run_number);
                            var previousRunY = runIndex === 0 ? height : yScale(previousRunNumber);
                            var segmentHeight = previousRunY - currentRunY;
                            var segmentY = currentRunY;
                            
                            // Store previous run number for next iteration
                            previousRunNumber = d.run_number;
                            
                            var segment = g.append("rect")
                                .attr("class", "trend-bar-segment")
                                .attr("x", versionX)
                                .attr("y", cumulativeY)
                                .attr("width", barWidth)
                                .attr("height", 0)
                                .attr("fill", colorScale(d))
                                .attr("stroke", d.result === 'pass' ? '#1e7e34' : '#a71e2a')
                                .attr("stroke-width", 2)
                                .attr("opacity", 0.9)
                                .style("cursor", "pointer")
                                .datum({
                                    data: d,
                                    runIndex: runIndex,
                                    totalRuns: runs.length
                                }); // Store data for tooltip
                            
                            // Animate segments appearing from bottom to top
                            segment.transition()
                                .duration(400)
                                .delay(versionIndex * 150 + segmentDelay)
                                .attr("y", segmentY)
                                .attr("height", segmentHeight)
                                .attr("opacity", 0.9);
                            
                            segmentDelay += 80;
                            cumulativeY = segmentY;
                            
                            // Add hover effects and tooltips for each segment
                            segment.on("mouseover", function(d) {
                                    d3.select(this)
                                        .transition()
                                        .duration(200)
                                        .attr("opacity", 1)
                                        .attr("stroke-width", 4)
                                        .attr("stroke", "#fff");
                                    
                                    var tooltip = d3.select("body").append("div")
                                        .attr("class", "trend-tooltip")
                                        .style("opacity", 0)
                                        .style("position", "absolute")
                                        .style("background", "rgba(0, 0, 0, 0.9)")
                                        .style("color", "#fff")
                                        .style("padding", "10px 14px")
                                        .style("border-radius", "6px")
                                        .style("pointer-events", "none")
                                        .style("font-size", "13px")
                                        .style("z-index", "10001")
                                        .style("box-shadow", "0 4px 12px rgba(0,0,0,0.3)");
                                    
                                    var tooltipText = "<strong>" + d.data.result.toUpperCase() + "</strong><br/>" +
                                                     "Version: " + d.data.version + "<br/>" +
                                                     "Run #: " + d.data.run_number + " of " + d.totalRuns;
                                    if (d.data.url) {
                                        tooltipText += "<br/><a href='" + d.data.url + "' target='_blank' style='color: #9b8fff; text-decoration: underline;'>View Job →</a>";
                                    }
                                    tooltip.html(tooltipText);
                                    
                                    tooltip.transition()
                                        .duration(200)
                                        .style("opacity", 1);
                                    
                                    var mousePos = d3.mouse(document.body);
                                    tooltip.style("left", (mousePos[0] + 15) + "px")
                                           .style("top", (mousePos[1] - 10) + "px");
                                })
                                .on("mousemove", function(d) {
                                    var mousePos = d3.mouse(document.body);
                                    d3.select(".trend-tooltip")
                                        .style("left", (mousePos[0] + 15) + "px")
                                        .style("top", (mousePos[1] - 10) + "px");
                                })
                                .on("mouseout", function(d) {
                                    d3.select(this)
                                        .transition()
                                        .duration(200)
                                        .attr("opacity", 0.9)
                                        .attr("stroke-width", 2)
                                        .attr("stroke", function() {
                                            var result = d.data.result;
                                            return result === 'pass' ? '#1e7e34' : '#a71e2a';
                                        });
                                    d3.selectAll(".trend-tooltip").remove();
                                });
                        });
                    });
                    
                    // Add X axis (D3 v3 syntax)
                    var xAxis = d3.svg.axis()
                        .scale(xScale)
                        .orient("bottom")
                        .tickSize(6)
                        .tickPadding(8);
                    
                    g.append("g")
                        .attr("class", "x axis")
                        .attr("transform", "translate(0," + height + ")")
                        .call(xAxis)
                        .selectAll("text")
                        .style("text-anchor", "middle")
                        .style("font-size", "11px")
                        .attr("dy", ".35em");
                    
                    // Add Y axis (D3 v3 syntax)
                    var yAxis = d3.svg.axis()
                        .scale(yScale)
                        .orient("left")
                        .ticks(Math.min(10, maxRunNumber))
                        .tickSize(6)
                        .tickPadding(8);
                    
                    g.append("g")
                        .attr("class", "y axis")
                        .call(yAxis);
                    
                    // Add axis labels
                    g.append("text")
                        .attr("transform", "rotate(-90)")
                        .attr("y", 0 - margin.left)
                        .attr("x", 0 - (height / 2))
                        .attr("dy", "1em")
                        .style("text-anchor", "middle")
                        .style("font-size", "13px")
                        .style("font-weight", "600")
                        .style("fill", "#333")
                        .text("Run Number");
                    
                    g.append("text")
                        .attr("transform", "translate(" + (width / 2) + " ," + (height + margin.bottom - 10) + ")")
                        .style("text-anchor", "middle")
                        .style("font-size", "13px")
                        .style("font-weight", "600")
                        .style("fill", "#333")
                        .text("Version");
                    
                    // Legend is now in HTML, not in SVG
                    
                    console.log("Bar chart rendered successfully");
                } catch (error) {
                    console.error("Error rendering bar chart:", error);
                }
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
            link: function(scope, element) {
                var jobName = scope.$parent.job.name;
                scope.formatClaim = formatClaim
                var linesToShow = 50;
                scope.shortClaim = (scope.claim.length < linesToShow) ? scope.claim : scope.claim.split('<br><br>')[0].slice(0, linesToShow) + '...'
                
                // Find the parent td element
                var parentTd = element.parent();
                while (parentTd.length && parentTd[0].tagName !== 'TD') {
                    parentTd = parentTd.parent();
                }
                
                scope.scope = {
                    showFullClaim: scope.$parent.$parent.openClaims.has(jobName),
                    changeShowFullClaim: function() {
                        if (this.showFullClaim) {
                            scope.$parent.$parent.openClaims.delete(jobName)
                            if (parentTd.length) parentTd.removeClass('claim-expanded')
                        } else {
                            scope.$parent.$parent.openClaims.add(jobName)
                            if (parentTd.length) parentTd.addClass('claim-expanded')
                        }
                        this.showFullClaim = !this.showFullClaim
                    }
                }
                // Set initial state
                if (scope.scope.showFullClaim && parentTd.length) {
                    parentTd.addClass('claim-expanded')
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
    .directive('trendButton', ['QueryService', '$rootScope', function(QueryService, $rootScope){
        return {
            restrict: 'E',
            scope: {job: "=", build: "="},
            templateUrl: 'partials/trend_button.html',
            link: function(scope, elem, attrs){
                scope.loading = false;
                scope.error = false;
                
                scope.openTrend = function() {
                    if (scope.loading) return;
                    
                    // Extract base version from build (e.g., "8.1.0-1228" -> "8.1.0")
                    var baseVersion = scope.build ? scope.build.split('-')[0] : '';
                    if (!baseVersion || !scope.job) {
                        alert("Unable to determine base version or job information");
                        return;
                    }
                    
                    // Construct document ID: baseVersion_OS_COMPONENT_jobName
                    var docId = baseVersion + '_' + scope.job.os + '_' + scope.job.component + '_' + scope.job.name;
                    
                    scope.loading = true;
                    scope.error = false;
                    
                    QueryService.getTrend(docId)
                        .then(function(trendData) {
                            scope.loading = false;
                            if (trendData) {
                                // Broadcast event to open trend modal
                                $rootScope.$broadcast('openTrendModal', {
                                    trendData: trendData,
                                    jobName: scope.job.displayName || scope.job.name,
                                    baseVersion: baseVersion
                                });
                            } else {
                                alert("No trend data found for this job");
                            }
                        })
                        .catch(function(e) {
                            scope.loading = false;
                            scope.error = true;
                            var errorMsg = e.data && e.data.error ? e.data.error : "Failed to fetch trend data";
                            alert(errorMsg);
                        });
                };
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
                
                // Check if rerun should be disabled based on run count
                scope.isRerunDisabled = function() {
                    return scope.job.runCount && scope.job.runCount > 2;
                };
                
                scope.rerunJob = function() {
                    // Prevent rerun if disabled due to run count
                    if (scope.isRerunDisabled()) {
                        alert("Rerun disabled: Job has more than 3 runs (" + scope.job.runCount + " runs)");
                        return;
                    }
                    
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
                    if (scope.isRerunDisabled()) {
                        return "Max runs reached";
                    }
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
