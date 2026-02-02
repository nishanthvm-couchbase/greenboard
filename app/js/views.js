angular.module('app.views', [])
  .service('Views', ['Data', 'DarkMode', '$state', '$rootScope', '$location', '$timeout', function(Data, DarkMode, $state, $rootScope, $location, $timeout) {
    var STORAGE_KEY = 'greenboard_views';
    
    // Get all views from localStorage
    function getViews() {
      try {
        var viewsJson = localStorage.getItem(STORAGE_KEY);
        return viewsJson ? JSON.parse(viewsJson) : [];
      } catch (e) {
        console.error('Error loading views:', e);
        return [];
      }
    }
    
    // Save views to localStorage
    function saveViews(views) {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(views));
        return true;
      } catch (e) {
        console.error('Error saving views:', e);
        return false;
      }
    }
    
    // Generate a shareable code from view data
    function encodeView(view) {
      try {
        var viewData = {
          n: view.name,
          f: view.features || [],
          p: view.platforms || [],
          v: view.version || '',
          t: view.target || 'server',
          d: view.darkMode || false
        };
        return btoa(JSON.stringify(viewData));
      } catch (e) {
        console.error('Error encoding view:', e);
        return null;
      }
    }
    
    // Decode a shareable code to view data
    function decodeView(code) {
      try {
        var viewData = JSON.parse(atob(code));
        return {
          name: viewData.n,
          features: viewData.f || [],
          platforms: viewData.p || [],
          version: viewData.v || '',
          target: viewData.t || 'server',
          darkMode: viewData.d || false
        };
      } catch (e) {
        console.error('Error decoding view:', e);
        return null;
      }
    }
    
    var service = {
      // Get all saved views
      getAll: function() {
        return getViews();
      },
      
      // Save current state as a view
      saveCurrent: function(name) {
        if (!name || name.trim() === '') {
          return { success: false, error: 'View name is required' };
        }
        
        // Get current state
        var currentState = this.getCurrentState();
        currentState.name = name.trim();
        currentState.createdAt = new Date().toISOString();
        currentState.id = Date.now().toString(); // Simple ID generation
        
        // Get existing views
        var views = getViews();
        
        // Check if name already exists
        var existingIndex = views.findIndex(function(v) {
          return v.name.toLowerCase() === currentState.name.toLowerCase();
        });
        
        if (existingIndex >= 0) {
          // Update existing view
          views[existingIndex] = currentState;
        } else {
          // Add new view
          views.push(currentState);
        }
        
        if (saveViews(views)) {
          return { success: true, view: currentState };
        } else {
          return { success: false, error: 'Failed to save view' };
        }
      },
      
      // Get current application state
      getCurrentState: function() {
        // Get selected features (enabled ones)
        var features = [];
        var platforms = [];
        
        if (Data.getSideBarItems && Data.getSideBarItems()) {
          var sidebarItems = Data.getSideBarItems();
          
          // Get enabled features
          if (sidebarItems.features) {
            features = sidebarItems.features
              .filter(function(item) { return !item.disabled; })
              .map(function(item) { return item.key; });
          }
          
          // Get enabled platforms
          if (sidebarItems.platforms) {
            platforms = sidebarItems.platforms
              .filter(function(item) { return !item.disabled; })
              .map(function(item) { return item.key; });
          }
        }
        
        return {
          features: features,
          platforms: platforms,
          version: Data.getSelectedVersion() || '',
          build: Data.getBuild() || '', // Store full build like "8.0.0-1442"
          target: Data.getCurrentTarget() || 'server',
          darkMode: DarkMode.isDarkMode()
        };
      },
      
      // Apply a view (restore state) - Simple: generate URL and open in new tab
      apply: function(view) {
        console.log('Views.apply called with view:', view);
        if (!view) {
          return { success: false, error: 'Invalid view' };
        }
        
        // Build the URL with all parameters
        var target = view.target || 'server';
        var version = view.version || '8.1.0';
        var build = view.build ? view.build.split('-').pop() : 'latest';
        
        // Build URL path
        var url = window.location.origin + window.location.pathname + 
                  '#!/' + target + '/' + version + '/' + build;
        
        // Add query parameters
        var params = [];
        
        if (view.features && view.features.length > 0) {
          params.push('features=' + encodeURIComponent(view.features.join(',')));
        }
        
        if (view.platforms && view.platforms.length > 0) {
          params.push('platforms=' + encodeURIComponent(view.platforms.join(',')));
        }
        
        if (params.length > 0) {
          url += '?' + params.join('&');
        }
        
        // Open in new tab
        window.open(url, '_blank');
        
        return { success: true };
      },
      
      // Old apply function - keeping for reference but not using
      _applyOld: function(view) {
        console.log('Views.apply called with view:', view);
        if (!view) {
          return { success: false, error: 'Invalid view' };
        }
        
        // Store view data for later application
        var viewToApply = angular.copy(view);
        console.log('View to apply:', viewToApply);
        
        // Apply dark mode first
        if (viewToApply.darkMode !== undefined) {
          var currentDarkMode = DarkMode.isDarkMode();
          if (currentDarkMode !== viewToApply.darkMode) {
            DarkMode.toggle();
          }
        }
        
        // Navigate to target/version/build if different
        var currentTarget = Data.getCurrentTarget();
        var currentVersion = Data.getSelectedVersion();
        var currentBuild = Data.getBuild();
        var needsNavigation = false;
        
        if (viewToApply.target && viewToApply.target !== currentTarget) {
          needsNavigation = true;
          // Navigate to target/version, build will be applied after navigation
          $state.go('target.version.builds.build', { 
            target: viewToApply.target, 
            version: viewToApply.version || 'latest',
            build: viewToApply.build ? viewToApply.build.split('-').pop() : 'latest'
          });
        } else if (viewToApply.version && viewToApply.version !== currentVersion) {
          needsNavigation = true;
          // Navigate to version, build will be applied after navigation
          $state.go('target.version.builds.build', { 
            target: currentTarget, 
            version: viewToApply.version,
            build: viewToApply.build ? viewToApply.build.split('-').pop() : 'latest'
          });
        } else if (viewToApply.build && viewToApply.build !== currentBuild) {
          needsNavigation = true;
          // Navigate to specific build
          var buildNumber = viewToApply.build.split('-').pop();
          $state.go('target.version.builds.build', { 
            target: currentTarget, 
            version: currentVersion,
            build: buildNumber
          });
        }
        
        // OLD FILTER APPLICATION LOGIC - NOT USED ANYMORE
        var applyFilters = function() {
          // Wait a bit for sidebar items to be loaded
          var attempts = 0;
          var maxAttempts = 80; // 8 seconds max wait (increased for navigation)
          var lastItemsCheck = null;
          var stableCheckCount = 0;
          var requiredStableChecks = 3; // Require 3 consecutive stable checks
          
          var tryApplyFilters = function() {
            attempts++;
            console.log('tryApplyFilters attempt:', attempts);
            var sidebarItems = Data.getSideBarItems();
            console.log('Sidebar items:', sidebarItems);
            
            // Check if sidebar items are loaded and have data
            if (!sidebarItems || 
                !sidebarItems.features || sidebarItems.features.length === 0 ||
                !sidebarItems.platforms || sidebarItems.platforms.length === 0) {
              console.log('Sidebar items not ready, retrying...');
              lastItemsCheck = null;
              stableCheckCount = 0;
              if (attempts < maxAttempts) {
                $timeout(tryApplyFilters, 100);
                return;
              } else {
                console.warn('Sidebar items not loaded after max attempts');
                return;
              }
            }
            
            // Check if sidebar items are stable (not changing)
            var currentCheck = JSON.stringify({
              features: sidebarItems.features.map(function(f) { return f.key; }),
              platforms: sidebarItems.platforms.map(function(p) { return p.key; })
            });
            
            if (lastItemsCheck === currentCheck) {
              stableCheckCount++;
              console.log('Sidebar items stable check:', stableCheckCount, '/', requiredStableChecks);
            } else {
              // Items changed, reset stability check
              lastItemsCheck = currentCheck;
              stableCheckCount = 1;
              console.log('Sidebar items changed, resetting stability check');
            }
            
            // Require items to be stable before applying filters
            if (stableCheckCount < requiredStableChecks) {
              if (attempts < maxAttempts) {
                $timeout(tryApplyFilters, 150);
                return;
              } else {
                console.warn('Sidebar items not stable after max attempts, proceeding anyway...');
              }
            }
            
            console.log('Sidebar items loaded and stable, applying filters...');
            
            // Helper function to apply filters for a type
            var applyFiltersForType = function(type, savedKeys) {
              // Get fresh state
              var currentItems = Data.getSideBarItems()[type];
              if (!currentItems || currentItems.length === 0) {
                console.warn('No items found for type:', type);
                return;
              }
              
              var totalCount = currentItems.length;
              var savedCount = savedKeys.length;
              
              console.log('Applying filters for', type, 'saved keys:', savedKeys, 'total:', totalCount);
              
              // Check current state - are all items enabled?
              var allCurrentlyEnabled = currentItems.every(function(item) { return !item.disabled; });
              console.log('All currently enabled:', allCurrentlyEnabled);
              
              if (savedCount === totalCount) {
                // All should be enabled - just enable any that are disabled
                console.log('All should be enabled');
                currentItems.forEach(function(item) {
                  if (item.disabled) {
                    console.log('Enabling:', item.key);
                    Data.toggleItem(item.key, type, true);
                  }
                });
              } else {
                // Some should be disabled
                // Find items that should be enabled vs disabled
                var itemsToEnable = currentItems.filter(function(item) {
                  return savedKeys.indexOf(item.key) !== -1;
                });
                var itemsToDisable = currentItems.filter(function(item) {
                  return savedKeys.indexOf(item.key) === -1;
                });
                
                console.log('Items to enable:', itemsToEnable.map(function(i) { return i.key; }));
                console.log('Items to disable:', itemsToDisable.map(function(i) { return i.key; }));
                
                if (allCurrentlyEnabled && itemsToDisable.length > 0) {
                  // All are currently enabled - use inverse toggling
                  // Disable the first item that should be disabled
                  // This will trigger inverse toggling: it will enable that item and disable all others
                  var firstToDisable = itemsToDisable[0];
                  console.log('Triggering inverse toggling by disabling:', firstToDisable.key);
                  Data.toggleItem(firstToDisable.key, type, false);
                  
                  // After inverse toggling, firstToDisable is now enabled, all others are disabled
                  // Now we need to enable the ones that should be enabled
                  $timeout(function() {
                    console.log('Enabling items that should be enabled');
                    var freshItems = Data.getSideBarItems()[type];
                    itemsToEnable.forEach(function(targetKey) {
                      var item = freshItems.find(function(i) { return i.key === targetKey.key; });
                      if (item && item.disabled) {
                        console.log('Enabling:', item.key);
                        Data.toggleItem(item.key, type, true);
                      }
                    });
                  }, 300);
                } else {
                  // Some items are already disabled - work with current state
                  console.log('Some items already disabled, working with current state');
                  
                  // First, enable items that should be enabled
                  itemsToEnable.forEach(function(item) {
                    if (item.disabled) {
                      console.log('Enabling:', item.key);
                      Data.toggleItem(item.key, type, true);
                    }
                  });
                  
                  // Then disable items that should be disabled
                  $timeout(function() {
                    var freshItems = Data.getSideBarItems()[type];
                    var allNowEnabled = freshItems.every(function(item) { return !item.disabled; });
                    
                    if (!allNowEnabled) {
                      itemsToDisable.forEach(function(targetKey) {
                        var item = freshItems.find(function(i) { return i.key === targetKey.key; });
                        if (item && !item.disabled) {
                          console.log('Disabling:', item.key);
                          Data.toggleItem(item.key, type, false);
                        }
                      });
                    }
                  }, 300);
                }
              }
            };
            
            // Apply feature filters
            if (viewToApply.features && viewToApply.features.length > 0) {
              console.log('Applying feature filters:', viewToApply.features);
              applyFiltersForType('features', viewToApply.features);
            } else {
              console.log('No feature filters to apply');
            }
            
            // Apply platform filters
            if (viewToApply.platforms && viewToApply.platforms.length > 0) {
              console.log('Applying platform filters:', viewToApply.platforms);
              applyFiltersForType('platforms', viewToApply.platforms);
            } else {
              console.log('No platform filters to apply');
            }
            
            // Update URL parameters to match the applied view after filters are applied
            $timeout(function() {
              var currentItems = Data.getSideBarItems();
              
              // Get actually enabled items from sidebar (not from viewToApply)
              var enabledFeatures = [];
              var enabledPlatforms = [];
              
              if (currentItems.features) {
                enabledFeatures = currentItems.features
                  .filter(function(item) { return !item.disabled; })
                  .map(function(item) { return item.key; });
              }
              
              if (currentItems.platforms) {
                enabledPlatforms = currentItems.platforms
                  .filter(function(item) { return !item.disabled; })
                  .map(function(item) { return item.key; });
              }
              
              // Build URL params for features
              if (currentItems.features && enabledFeatures.length > 0) {
                var totalFeatures = currentItems.features.length;
                if (enabledFeatures.length < totalFeatures) {
                  $location.search('features', enabledFeatures.join(','));
                } else {
                  $location.search('features', null);
                }
              }
              
              // Build URL params for platforms
              if (currentItems.platforms && enabledPlatforms.length > 0) {
                var totalPlatforms = currentItems.platforms.length;
                if (enabledPlatforms.length < totalPlatforms) {
                  $location.search('platforms', enabledPlatforms.join(','));
                } else {
                  $location.search('platforms', null);
                }
              }
              
              // Update URL without reloading
              $location.replace();
              
              // Broadcast filter change to refresh jobs table
              $timeout(function() {
                $rootScope.$broadcast('sidebarFilterChanged');
              }, 300);
            }, 1200);
            
            // Broadcast that view has been applied
            $rootScope.$broadcast('viewApplied', viewToApply);
          };
          
          if (needsNavigation) {
            // Wait for state change, then listen for sidebar items to be ready
            var stateChangeUnregister = $rootScope.$on('$stateChangeSuccess', function() {
              stateChangeUnregister();
              
              // Listen for sidebar items to be ready
              var sidebarReadyUnregister = $rootScope.$on('sidebarItemsReady', function(event, items) {
                sidebarReadyUnregister();
                console.log('Sidebar items ready event received, applying filters...');
                // Wait a bit for sidebar to fully initialize
                $timeout(function() {
                  tryApplyFilters();
                }, 500);
              });
              
              // Fallback: if event doesn't fire, try after delay
              $timeout(function() {
                if (sidebarReadyUnregister) {
                  sidebarReadyUnregister();
                  console.log('Sidebar ready event not received, trying fallback...');
                  $timeout(tryApplyFilters, 500);
                }
              }, 3000);
            });
          } else {
            // Check if sidebar is already ready
            var sidebarItems = Data.getSideBarItems();
            if (sidebarItems && sidebarItems.features && sidebarItems.features.length > 0 && 
                sidebarItems.platforms && sidebarItems.platforms.length > 0) {
              // Sidebar already ready, apply immediately
              $timeout(tryApplyFilters, 200);
            } else {
              // Wait for sidebar to be ready
              var sidebarReadyUnregister = $rootScope.$on('sidebarItemsReady', function(event, items) {
                sidebarReadyUnregister();
                console.log('Sidebar items ready event received, applying filters...');
                $timeout(tryApplyFilters, 200);
              });
              
              // Fallback
              $timeout(function() {
                if (sidebarReadyUnregister) {
                  sidebarReadyUnregister();
                  $timeout(tryApplyFilters, 300);
                }
              }, 2000);
            }
          }
        };
        
        applyFilters();
        
        return { success: true };
      },
      
      // Delete a view by ID
      delete: function(viewId) {
        var views = getViews();
        var filtered = views.filter(function(v) { return v.id !== viewId; });
        
        if (saveViews(filtered)) {
          return { success: true };
        } else {
          return { success: false, error: 'Failed to delete view' };
        }
      },
      
      // Clear all views
      clearAll: function() {
        try {
          localStorage.removeItem(STORAGE_KEY);
          return { success: true };
        } catch (e) {
          return { success: false, error: 'Failed to clear views' };
        }
      },
      
      // Generate shareable code for a view
      share: function(view) {
        var code = encodeView(view);
        if (code) {
          // Generate URL with code
          var url = window.location.origin + window.location.pathname + '?view=' + code;
          return { success: true, code: code, url: url };
        } else {
          return { success: false, error: 'Failed to generate share code' };
        }
      },
      
      // Import view from code (handles both code and URL)
      import: function(codeOrUrl) {
        // Extract code from URL if it's a URL
        var code = codeOrUrl;
        if (codeOrUrl && typeof codeOrUrl === 'string') {
          if (codeOrUrl.indexOf('?view=') >= 0) {
            // It's a URL, extract the code
            var urlParts = codeOrUrl.split('?view=');
            if (urlParts.length > 1) {
              code = urlParts[1].split('&')[0]; // Get code, ignore other params
            }
          } else if (codeOrUrl.indexOf('view=') >= 0) {
            // URL with view param
            var match = codeOrUrl.match(/view=([^&]+)/);
            if (match && match[1]) {
              code = match[1];
            }
          }
        }
        
        var view = decodeView(code);
        if (view) {
          // Save the imported view
          view.id = Date.now().toString();
          view.createdAt = new Date().toISOString();
          view.imported = true;
          
          var views = getViews();
          views.push(view);
          
          if (saveViews(views)) {
            return { success: true, view: view };
          } else {
            return { success: false, error: 'Failed to save imported view' };
          }
        } else {
          return { success: false, error: 'Invalid view code' };
        }
      },
      
      // Check URL for view code and import if present
      checkUrlForView: function() {
        // Parse URL params manually for compatibility
        var search = window.location.search.substring(1);
        var params = {};
        if (search) {
          var pairs = search.split('&');
          for (var i = 0; i < pairs.length; i++) {
            var pair = pairs[i].split('=');
            params[decodeURIComponent(pair[0])] = decodeURIComponent(pair[1] || '');
          }
        }
        
        var viewCode = params.view;
        
        if (viewCode) {
          var result = this.import(viewCode);
          if (result.success) {
            // Apply the imported view
            this.apply(result.view);
            // Remove view param from URL
            var newUrl = window.location.pathname;
            var newParams = [];
            for (var key in params) {
              if (key !== 'view') {
                newParams.push(encodeURIComponent(key) + '=' + encodeURIComponent(params[key]));
              }
            }
            newUrl += newParams.length > 0 ? '?' + newParams.join('&') : '';
            window.history.replaceState({}, '', newUrl);
            return result.view;
          }
        }
        return null;
      }
    };
    
    return service;
  }]);
