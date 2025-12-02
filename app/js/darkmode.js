angular.module('app.darkmode', [])
  .service('DarkMode', [function() {
    var isDarkMode = false;
    
    // Load preference from localStorage
    var savedPreference = localStorage.getItem('greenboardDarkMode');
    if (savedPreference !== null) {
      isDarkMode = savedPreference === 'true';
    }
    
    var service = {
      isDarkMode: function() {
        return isDarkMode;
      },
      toggle: function() {
        isDarkMode = !isDarkMode;
        localStorage.setItem('greenboardDarkMode', isDarkMode);
        this.apply();
        return isDarkMode;
      },
      apply: function() {
        var body = document.body;
        if (isDarkMode) {
          body.classList.add('dark-mode');
        } else {
          body.classList.remove('dark-mode');
        }
      }
    };
    
    // Apply initial state
    service.apply();
    
    return service;
  }])
  .directive('darkModeToggle', ['DarkMode', function(DarkMode) {
    return {
      restrict: 'E',
      template: '<div class="theme-toggle-wrapper">' +
                '<span class="theme-toggle-text">Try dark mode <span class="theme-toggle-arrows"><span>></span><span>></span><span>></span></span></span>' +
                '<div class="theme-toggle-container" ng-click="toggleDarkMode($event)" title="Toggle Dark Mode">' +
                '<label class="theme-toggle-label" ng-class="{\'dark-active\': isDark}">' +
                '<i class="fas fa-moon"></i>' +
                '<i class="fas fa-sun"></i>' +
                '<span class="theme-toggle-ball"></span>' +
                '</label>' +
                '</div>' +
                '</div>',
      link: function(scope, element, attrs) {
        scope.isDark = DarkMode.isDarkMode();
        
        // Apply initial state
        DarkMode.apply();
        
        scope.toggleDarkMode = function($event) {
          if ($event) {
            $event.preventDefault();
            $event.stopPropagation();
          }
          scope.isDark = DarkMode.toggle();
        };
      }
    };
  }]);

