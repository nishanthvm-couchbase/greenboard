angular.module('app.aireport', [])
  .controller('AIReportCtrl', ['$scope', '$rootScope', 'QueryService', function($scope, $rootScope, QueryService) {
    $scope.showModal = false;
    $scope.loading = false;
    $scope.report = null;
    $scope.error = null;
    $scope.version = null;
    $scope.component = null;
    $scope.activeFilter = 'all';

    // Filter function for error labels
    $scope.filterByLabel = function(errorType) {
      if ($scope.activeFilter === 'all') {
        return true;
      }
      return errorType.label === $scope.activeFilter;
    };

    // Set active filter
    $scope.setFilter = function(filter) {
      $scope.activeFilter = filter;
    };

    $rootScope.$on('openAIReport', function(event, data) {
      $scope.version = data.version;
      $scope.component = data.component;
      $scope.showModal = true;
      $scope.loading = true;
      $scope.report = null;
      $scope.error = null;
      $scope.activeFilter = 'all';

      QueryService.getReport(data.version, data.component)
        .then(function(report) {
          $scope.loading = false;
          if (report) {
            $scope.report = report;
          } else {
            $scope.error = 'Report not generated yet';
          }
        })
        .catch(function(err) {
          $scope.loading = false;
          $scope.error = 'Failed to load report: ' + (err.data && err.data.error ? err.data.error : 'Unknown error');
        });
    });

    $scope.closeModal = function() {
      $scope.showModal = false;
      $scope.report = null;
      $scope.error = null;
    };

    // Close on escape key
    $scope.$on('$destroy', function() {
      $(document).off('keydown.aireport');
    });

    $scope.$watch('showModal', function(newVal) {
      if (newVal) {
        $(document).on('keydown.aireport', function(e) {
          if (e.keyCode === 27) { // ESC key
            $scope.$apply(function() {
              $scope.closeModal();
            });
          }
        });
      } else {
        $(document).off('keydown.aireport');
      }
    });
  }])
  .directive('aiReportModal', function() {
    return {
      restrict: 'E',
      controller: 'AIReportCtrl',
      templateUrl: 'partials/ai_report_modal.html'
    };
  });

