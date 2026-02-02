var realFs = require('fs')
var gracefulFs = require('graceful-fs')
gracefulFs.gracefulify(realFs)

var _ = require('lodash');
var express = require('express');
var getClient = require('./cbclient.js')
var config = require('./config.js')
var bodyParser = require('body-parser')
const path = require('path');

var app = express();
app.use(express.static('app'));
app.use(bodyParser.json());

// Serve release notes page
app.get('/release-notes', function(req, res) {
    res.sendFile(path.join(__dirname, 'app', 'release-notes.html'));
});

// Initialize client (async)
let client = null;
(async () => {
    try {
        client = await getClient();
        console.log('Couchbase client initialized');
    } catch (err) {
        console.error('Failed to initialize Couchbase client:', err);
        process.exit(1);
    }
})();

// Handle /versions with optional bucket parameter (Express 5 doesn't support ? syntax)
app.get('/versions', function(req, res){
  if (!client) {
    return res.status(503).send({error: 'Client not initialized'});
  }
  var bucket = req.query.bucket || undefined;
  var versions = []
  client.queryVersions(bucket)
  	.then(function(data){
  		versions = data.map(function(d){
  			return d['version']
  		})
	 	res.send(versions);
  	}).catch(function(err){
  		// err
		console.log(err)
		res.send(versions)
  	})
})

app.get('/versions/:bucket', function(req, res){
  if (!client) {
    return res.status(503).send({error: 'Client not initialized'});
  }
  var bucket = req.params.bucket
  var versions = []
  client.queryVersions(bucket)
  	.then(function(data){
  		versions = data.map(function(d){
  			return d['version']
  		})
	 	res.send(versions);
  	}).catch(function(err){
  		// err
		console.log(err)
		res.send(versions)
  	})
})

app.get('/builds/:bucket/:version/:testsFilter/:buildsFilter', function(req, res){
  if (!client) {
    return res.status(503).send({error: 'Client not initialized'});
  }
  var bucket = req.params.bucket
  var version = req.params.version
  var testsFilter = req.params.testsFilter
  var buildsFilter = req.params.buildsFilter
  
  // Extract optional filters from query parameters
  var filters = {
    platforms: req.query.platforms || null,
    features: req.query.features || null
  };
  
  var builds = []
  client.queryBuilds(bucket, version, testsFilter, buildsFilter, filters)
  	.then(function(data){
  		data.sort(function(b1, b2){
  			if(b1.build > b2.build){
  				return 1
  			}
  			if(b1.build < b2.build){
  				return -1
  			}
  			return 0
		})
		res.send(data)
  	}).catch(function(err){
  		// err
		console.log(err)
		res.send(builds)
	})
})


app.get('/timeline/:version/:bucket/:testsFilter/:buildsFilter', function(req, res){
	if (!client) {
		return res.status(503).send({error: 'Client not initialized'});
	}
	var dataMap = []
	var version = req.params.version
    var bucket = req.params.bucket
	var testsFilter = req.params.testsFilter
	var buildsFilter = req.params.buildsFilter
	var Q = "select `build` AS Version,"+
					"SUM(totalCount) AS AbsPassed,"+
					"SUM(failCount) AS AbsFailed,"+
					"((SUM(totalCount)-SUM(failCount))/SUM(totalCount))*100 AS RelPassed "+
						"FROM `greenboard` WHERE `build` LIKE '"+version+"%' AND type = '"+bucket+"' GROUP BY `build` " +
					"HAVING SUM(totalCount) >= "+testsFilter+" LIMIT "+ buildsFilter
	client.queryBucket(bucket, Q)
	  	.then(function(data){
	  		data.forEach(function(d){
	  			d['RelFailed']=100-d['AbsFailed']
	  			dataMap.push(d)
	  		})
	  		// console.log(dataMap)
		 	res.send(dataMap);
	  	}).catch(function(err){
	  		// err
			console.log(err)
			res.send(dataMap)
	  	})

})

// Handle /jobs with optional bucket parameter (Express 5 doesn't support ? syntax)
app.get('/jobs/:build', function(req, res){
	if (!client) {
		return res.status(503).send({error: 'Client not initialized'});
	}
	var bucket = req.query.bucket || undefined;
    var build = req.params.build

	client.jobsForBuild(bucket, build)
		.then(function(breakdown){
			res.send(breakdown)
		}).catch(function(err){
			console.log(err)
		})
})

app.get('/jobs/:build/:bucket', function(req, res){
	if (!client) {
		return res.status(503).send({error: 'Client not initialized'});
	}
	var bucket = req.params.bucket
    var build = req.params.build

	client.jobsForBuild(bucket, build)
		.then(function(breakdown){
			res.send(breakdown)
		}).catch(function(err){
			console.log(err)
		})
})

app.get('/info/:build/:bucket', function(req, res){
	if (!client) {
		return res.status(503).send({error: 'Client not initialized'});
	}
	var build = req.params.build
	var bucket = req.params.bucket

	client.getBuildInfo(bucket, build, function(err, info){
		if(err){
			console.log(err)
			res.send({err: err})
		}  else {
			res.send(info)
		}
	})
})

app.post('/claim/:bucket/:name/:build_id', function (req, res) {
  if (!client) {
    return res.status(503).send({error: 'Client not initialized'});
  }
  var bucket = req.params.bucket
  var name = req.params.name
  var build_id = req.params.build_id
  var claim = req.body.claim
  var os = req.body.os
  var comp = req.body.comp
  var version = req.body.build
  var type = req.body.type;
  client.claimJobs(type, bucket, name, build_id, claim, os, comp, version)
    .then(function(jobs){
      res.send('POST request to the homepage');
    }).catch(function(err){
		console.error(err);
      res.status(500).send({err: err.message})
    })

});

app.get('/getBuildSummary/:buildId', function (req, res) {
	if (!client) {
		return res.status(503).send({error: 'Client not initialized'});
	}
	var buildId = req.params.buildId;
	client.getBuildSummary(buildId).then(function (buildDetails) {
		res.send(buildDetails)
    }).catch(function(err){
    	console.log(err)
	})
});

app.post("/setBestRun/:bucket/:name/:build_id", function(req, res) {
	if (!client) {
		return res.status(503).send({error: 'Client not initialized'});
	}
	const bucket = req.params.bucket
	const name = req.params.name
	const build_id = req.params.build_id
	const os = req.body.os
	const comp = req.body.comp
	const version = req.body.build
	client.setBestRun(bucket, name, build_id, os, comp, version)
		.then(() => {
			res.sendStatus(200);
		})
		.catch(err => {
			console.error(err.message);
			res.send({ err: err.message });
		})
})

app.post("/rerunJob", function (req, res) {
	if (!client) {
		return res.status(503).send({error: 'Client not initialized'});
	}
	var jobUrl = req.body.jobUrl;
	var cherryPick = req.body.cherryPick;
	client.rerunJob(jobUrl, cherryPick)
		.then(() => {
			res.sendStatus(200);
		})
		.catch(err => {
			console.error(err.message);
			res.status(400).send({ err: err.message })
		})
})

app.get("/trend/:docId", function (req, res) {
	if (!client) {
		return res.status(503).send({error: 'Client not initialized'});
	}
	var docId = decodeURIComponent(req.params.docId);
	client.getTrend(docId)
		.then(function(trendData) {
			if (trendData) {
				res.send(trendData);
			} else {
				res.status(404).send({ error: 'Trend data not found' });
			}
		})
		.catch(err => {
			console.error(err);
			res.status(500).send({ error: err.message || 'Failed to fetch trend data' });
		})
})

app.get("/report/:version/:component", function (req, res) {
	if (!client) {
		return res.status(503).send({error: 'Client not initialized'});
	}
	var version = req.params.version;
	var component = req.params.component;
	client.getReport(version, component)
		.then(function(report) {
			if (report) {
				res.send(report);
			} else {
				res.status(404).send({ error: 'Report not found' });
			}
		})
		.catch(err => {
			console.error(err);
			res.status(500).send({ error: err.message || 'Failed to fetch report' });
		})
})

app.get('/release-notes', function(req, res) {
	res.sendFile(path.join(__dirname, 'app', 'release-notes.html'));
});

// Serve compare builds page
app.get('/compare-builds', function(req, res) {
	res.sendFile(path.join(__dirname, 'app', 'compare-builds.html'));
});

// API to get all builds for a version (for comparison dropdown)
app.get('/compare/builds/:bucket/:version', function(req, res) {
	if (!client) {
		return res.status(503).send({error: 'Client not initialized'});
	}
	var bucket = req.params.bucket;
	var version = req.params.version;
	// Allow cross-version comparisons by listing builds across all versions
	// (queryBuilds uses `build LIKE '${version}%'`, so empty version matches everything).
	if (version === 'all' || version === '__all__' || version === 'ALL') {
		version = '';
	}

	// Allow UI to request a larger list (cap to avoid overload)
	var limit = parseInt(req.query.limit, 10);
	if (!Number.isFinite(limit) || limit <= 0) {
		limit = 500;
	}
	limit = Math.min(limit, 2000);
	
	client.queryBuilds(bucket, version, 0, limit, {})
		.then(function(data) {
			// Return just build names and basic stats
			var builds = data.map(function(b) {
				return {
					build: b.build,
					totalCount: b.totalCount,
					failCount: b.failCount,
					passRate: b.totalCount > 0 ? ((b.totalCount - b.failCount) / b.totalCount * 100).toFixed(1) : 0
				};
			});
			builds.sort(function(a, b) {
				return b.build.localeCompare(a.build);
			});
			res.send(builds);
		})
		.catch(function(err) {
			console.log(err);
			res.status(500).send({error: 'Failed to fetch builds'});
		});
});

// API to get jobs for multiple builds for comparison
app.get('/compare/jobs/:bucket', function(req, res) {
	if (!client) {
		return res.status(503).send({error: 'Client not initialized'});
	}
	var bucket = req.params.bucket;
	var builds = req.query.builds ? req.query.builds.split(',') : [];
	
	if (builds.length < 2) {
		return res.status(400).send({error: 'At least 2 builds required for comparison'});
	}
	
	// Fetch jobs for all selected builds in parallel
	var jobPromises = builds.map(function(build) {
		return client.jobsForBuild(bucket, build)
			.then(function(jobs) {
				return { build: build, jobs: jobs };
			})
			.catch(function(err) {
				console.log('Error fetching jobs for build', build, err);
				return { build: build, jobs: [], error: true };
			});
	});
	
	Promise.all(jobPromises)
		.then(function(results) {
			// Process and organize jobs for comparison
			var jobMap = {}; // key: jobName, value: { jobName, os, component, builds: { buildId: jobData } }
			var platforms = new Set();
			var features = new Set();
			
			results.forEach(function(result) {
				var buildId = result.build;
				result.jobs.forEach(function(job) {
					// Skip older runs - only use the best run (olderBuild === false or undefined)
					// This matches how Greenboard main view calculates stats
					if (job.olderBuild === true) {
						return;
					}
					
					var jobKey = job.name + '|' + job.os + '|' + job.component;
					
					platforms.add(job.os);
					features.add(job.component);
					
					if (!jobMap[jobKey]) {
						jobMap[jobKey] = {
							name: job.name,
							displayName: job.displayName || job.name,
							os: job.os,
							component: job.component,
							builds: {}
						};
					}
					
					// Store job data for this build (only best run)
					if (!jobMap[jobKey].builds[buildId]) {
						var totalCount = job.totalCount || 0;
						var failCount = job.failCount || 0;
						var skipCount = job.skipCount || 0;
						// Passed = total - failed - skipped (matches Greenboard calculation)
						var passed = totalCount - failCount - skipCount;
						
						jobMap[jobKey].builds[buildId] = {
							passed: passed,
							failed: failCount,
							skipped: skipCount,
							total: totalCount,
							duration: job.duration || 0,
							runs: job.runCount || 1,
							servers: job.servers || [],
							result: job.result || 'UNKNOWN',
							url: job.url || '',
							build_id: job.build_id !== undefined ? job.build_id : ''
						};
					}
				});
			});
			
			// Convert map to array
			var jobs = Object.values(jobMap);
			
			res.send({
				builds: builds,
				jobs: jobs,
				platforms: Array.from(platforms).sort(),
				features: Array.from(features).sort()
			});
		})
		.catch(function(err) {
			console.log(err);
			res.status(500).send({error: 'Failed to fetch comparison data'});
		});
});

var server = app.listen(config.httpPort, config.httpListen, function () {
  var addr = server.address();
  if (addr) {
    var host = addr.address;
    var port = addr.port;
    console.log('Greenboard listening at http://%s:%s', host, port);
  } else {
    console.log('Greenboard HTTP server failed to bind');
  }
});

server.on('error', function(err) {
  if (err.code === 'EADDRINUSE') {
    console.error('Port %s is already in use', config.httpPort);
  } else if (err.code === 'EACCES') {
    console.error('Permission denied: Port %s requires root privileges', config.httpPort);
  } else {
    console.error('HTTP server error:', err.message);
  }
});
