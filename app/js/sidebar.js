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

  .directive('sidebarItem', ['Data', '$rootScope', function(Data, $rootScope){
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
			
			scope.openAIReport = function(event) {
				event.stopPropagation();
				var build = Data.getBuild(); // Get current build (e.g., "8.1.0-1228")
				var component = scope.key; // Component name (e.g., "BACKUP_RECOVERY")
				// Build version is already in the format we need (e.g., "8.1.0-1228")
				$rootScope.$broadcast('openAIReport', { version: build, component: component });
			}

  			scope.getRunPercent = function(){
  				if(!scope.disabled){
  					var asNum = scope.asNum();
  					if(asNum) {
  						// Show as "X / Y" format (ran / total)
  						var stats = scope.stats.absStats;
  						var ran = stats.passed + stats.failed + stats.skipped;
  						return ran + ' / ' + stats.total;
  					}
	  				return scope.stats.percStats.run;
	  			}
			  }
			  
			scope.getPassPercent = function(){
				if(!scope.disabled){
					var asNum = scope.asNum();
					if(asNum) {
						// Show absolute passed count
						return scope.stats.absStats.passed;
					}
					return scope.stats.percStats.passed;
				}
			}
			  
			scope.getRunPercentNum = function(){
				if(!scope.disabled && scope.stats && scope.stats.percStats){
					var runPerc = scope.stats.percStats.run;
					if(!runPerc) return 0;
					if(typeof runPerc === 'string'){
						var num = parseFloat(runPerc.replace('%', '').replace(/\s/g, ''));
						return isNaN(num) ? 0 : Math.max(0, Math.min(100, num));
					}
					var num = parseFloat(runPerc);
					return isNaN(num) ? 0 : Math.max(0, Math.min(100, num));
				}
				return 0;
			}
			
			scope.getPassPercentNum = function(){
				if(!scope.disabled && scope.stats && scope.stats.percStats){
					var passPerc = scope.stats.percStats.passedRaw;
					if(!passPerc && passPerc !== 0) return 0;
					var num = parseFloat(passPerc);
					return isNaN(num) ? 0 : Math.max(0, Math.min(100, num));
				}
				return 0;
			}
			  
			scope.getDashboardUrl = function() {
				if (!scope.showDashboardUrls) {
					return null;
				}
				var dashboardMap = {
					'2I_MOI': 'ovawbLBGk',
					ANALYTICS: 'Qb8QbYfGz',
					BACKUP_RECOVERY: 'Dv_QxLfGz',
					BUILD_SANITY: 'IPm-bSLMk',
					CE_ONLY: '80ZuxLBGk',
					CLI: 'U6gubLfMz',
					COLLECTIONS: 'BGtwbLfMk',
					DURABILITY: 'qH5QbYBMz',
					EP: 'aTj_xYBGk',
					EVENTING: 'k2QQbLfMk',
					FTS: 'pBAwxLfGk',
					GEO: 'Dn4ubYfGz',
					GOXDCR: 'h1JQbLfGz',
					IPV6: 'K_rQxLBGz',
					LOG_REDACTION: 'Cv7XxYfMz',
					MAGMA: '09PQxLBMz',
					MOBILE: 'QMRuxYBGz',
					MOBILE_CONVERGENCE: 'LyywbLfGk',
					NSERV: 'iUowxYfGz',
					OS_CERTIFY: 'Od2-6tfMk',
					QUERY: 'C2dQxYBMk',
					RQG: 'tnfwbYBMk',
					RZA: 'iRIubYBMz',
					SANITY: 'tGRa6tBMk',
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
