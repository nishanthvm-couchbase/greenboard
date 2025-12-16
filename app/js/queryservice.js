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
		getBuilds: function(target, version, testsFilter, buildsFilter, filters){
			var url = ["builds", target, version, testsFilter, buildsFilter].join("/")
			
			// Add filters as query parameters if provided
			if (filters && (filters.platforms || filters.features)) {
				var params = [];
				if (filters.platforms) {
					params.push("platforms=" + encodeURIComponent(filters.platforms));
				}
				if (filters.features) {
					params.push("features=" + encodeURIComponent(filters.features));
				}
				if (params.length > 0) {
					url += "?" + params.join("&");
				}
			}
			
			// Don't cache when filters are applied (dynamic data)
			var cacheOption = !(filters && (filters.platforms || filters.features));
	        return $http({"url": url, cache: cacheOption})
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
			},
			getReport: function(version, component) {
				var url = ["report", version, component].join("/")
				return $http({"url": url})
					.then(function(response) {
						return response.data
					})
					.catch(function(error) {
						if (error.status === 404) {
							return null; // Report not found
						}
						throw error;
					})
			},
			getTrend: function(docId) {
				var url = ["trend", docId].join("/")
				return $http({"url": url})
					.then(function(response) {
						return response.data
					})
					.catch(function(error) {
						if (error.status === 404) {
							return null; // Trend data not found
						}
						throw error;
					})
			}
		  }
		}])
