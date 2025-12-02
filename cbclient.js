
const config = require('./config.js');
const { Cluster } = require('couchbase');
const _ = require('lodash');

const Jenkins = require('jenkins');
const URL = require('url').URL;

let jenkinsCredentials;
try {
    jenkinsCredentials = require("./jenkinsCredentials.json");
} catch (e) {
    jenkinsCredentials = [];
}

const jenkinsConnnections = {};
for (const [givenUrl, { username, password}] of Object.entries(jenkinsCredentials)) {
    const url = new URL(givenUrl);
    url.username = username;
    url.password = password;
    jenkinsConnnections[givenUrl] = new Jenkins({ baseUrl: url.toString(), promisify: true });
}

function getJenkins(jobUrl) {
    for (const [url, connection] of Object.entries(jenkinsConnnections)) {
        if (jobUrl.startsWith(url)) {
            return connection;
        }
    }
    return null;
}

// Initialize cluster connection (async)
let cluster = null;
let bucketConnections = {};
const buildsResponseCache = {};
const versionsResponseCache = {};

async function initializeCluster() {
    if (!cluster) {
        const connectionString = `couchbase://${config.Cluster}`;
        cluster = await Cluster.connect(connectionString, {
            username: config.RBACUser,
            password: config.RBACKPassword,
            // Increase timeouts for large document operations
            timeouts: {
                kvTimeout: 75000, // 75 seconds for key-value operations
                kvDurableTimeout: 10000,
                connectTimeout: 10000,
                queryTimeout: 75000,
                viewTimeout: 75000,
                managementTimeout: 75000,
                analyticsTimeout: 75000,
                searchTimeout: 75000
            }
        });
    }
    return cluster;
}

async function getBucket(bucketName) {
    await initializeCluster();
    if (!bucketConnections[bucketName]) {
        const bucket = cluster.bucket(bucketName);
        bucketConnections[bucketName] = bucket;
    }
    return bucketConnections[bucketName];
}

async function getCollection(bucketName) {
    const bucket = await getBucket(bucketName);
    return bucket.defaultCollection();
}

function strToQuery(queryStr) {
    console.log(new Date(), "QUERY:", queryStr);
    return queryStr; // SDK 4.x uses query strings directly
}

async function _query(bucket, queryStr) {
    await initializeCluster();
    try {
        const result = await cluster.query(queryStr);
        const rows = [];
        for await (const row of result.rows) {
            rows.push(row);
        }
        return rows;
    } catch (err) {
        console.error("Query error:", err);
        throw err;
    }
}

async function _getmulti(bucket, docIds, retries = 2) {
    const collection = await getCollection(bucket);
    const results = {};
    
    // Use Promise.all to fetch all documents in parallel
    const promises = docIds.map(async (docId) => {
        let lastError;
        for (let attempt = 0; attempt <= retries; attempt++) {
            try {
                // Timeout is configured at cluster level (75 seconds)
                const result = await collection.get(docId);
                return { id: docId, value: result.content, cas: result.cas };
            } catch (err) {
                lastError = err;
                // Document might not exist, return null
                if (err.code === 13) { // KEY_ENOENT
                    return { id: docId, value: null, cas: null };
                }
                // Retry on timeout errors (code 14 = unambiguous_timeout)
                if ((err.code === 14 || err.name === 'UnambiguousTimeoutError' || 
                     (err.cause && err.cause.code === 14)) && attempt < retries) {
                    console.log(`Timeout fetching ${docId}, retrying (attempt ${attempt + 1}/${retries})...`);
                    // Wait before retry (exponential backoff)
                    await new Promise(resolve => setTimeout(resolve, 1000 * (attempt + 1)));
                    continue;
                }
                // For other errors or final retry, throw
                throw err;
            }
        }
        throw lastError;
    });
    
    const fetched = await Promise.all(promises);
    fetched.forEach(item => {
        results[item.id] = item;
    });
    
    return results;
}

async function _getReport(version, component) {
    const docId = `${version}_${component}`;
    try {
        const collection = await getCollection('reports');
        const result = await collection.get(docId);
        return result.content;
    } catch (err) {
        // Document doesn't exist
        if (err.code === 13) { // KEY_ENOENT
            return null;
        }
        throw err;
    }
}

async function _upsert(bucket, key, doc, cas) {
    const collection = await getCollection(bucket);
    const options = {};
    if (cas) {
        options.cas = cas;
    }
    try {
        const result = await collection.upsert(key, doc, options);
        console.log(result);
        return result;
    } catch (error) {
        console.log(error);
        throw error;
    }
}

async function _get(bucket, documentId) {
    const collection = await getCollection(bucket);
    try {
        const result = await collection.get(documentId);
        return result;
    } catch (error) {
        throw error;
    }
}

async function doUpsert(bucket, key, doc) {
    const collection = await getCollection(bucket);
    try {
        const result = await collection.upsert(key, doc);
        return result;
    } catch (err) {
        throw { err: err };
    }
}

module.exports = async function () {
    await initializeCluster();
    
    var API = {
        queryJobDetails: async function(jobName, build) {
            var Q = "SELECT runs FROM `rerun` USE KEYS \"" + build + "\"";
            console.log(Q);
            try {
                const data = await _query('rerun', Q);
                console.log(data);
                return data;
            } catch (err) {
                console.error(err);
                throw err;
            }
        },
        queryVersions: async function (bucket) {
            var Q = "SELECT DISTINCT SPLIT(`build`,'-')[0] AS version " +
                "FROM `greenboard` WHERE REGEXP_LIKE(`build`, '\\\\d+.\\\\d+.\\\\d+-.*') AND SPLIT(`build`,'-')[0] is not null AND type = '" + bucket + "' ORDER BY version";
            
            async function queryVersion() {
                try {
                    const data = await _query('greenboard', Q);
                    versionsResponseCache[bucket] = data;
                    console.log(data);
                    return data;
                } catch (err) {
                    console.error(err);
                    throw err;
                }
            }

            if (bucket in versionsResponseCache) {
                var data = versionsResponseCache[bucket];
                if (data.length == 0) {
                    return await queryVersion();
                }
                queryVersion(); // Refresh cache in background
                return Promise.resolve(versionsResponseCache[bucket]);
            } else {
                return await queryVersion();
            }
        },
        queryBucket: async function (bucket, queryStr) {
            return await _query(bucket, queryStr);
        },
        queryBuilds: async function (bucket, version, testsFilter, buildsFilter) {
            var Q = "SELECT totalCount, failCount, `build` FROM `greenboard` WHERE `build` LIKE '" + version + "%' " +
                " AND type = '" + bucket + "' AND totalCount >= " + testsFilter + " ORDER BY `build` DESC limit " + buildsFilter;

            function processBuild(data) {
                var builds = _.map(data, function (buildSet) {
                    var total = buildSet.totalCount;
                    var failed = buildSet.failCount;
                    var passed = total - failed;
                    return {
                        Failed: failed,
                        Passed: passed,
                        build: buildSet.build
                    };
                });
                return builds;
            }

            async function queryBuild() {
                try {
                    const data = await _query(bucket, Q);
                    buildsResponseCache[version] = _.cloneDeep(data);
                    return processBuild(data);
                } catch (err) {
                    console.error(err);
                    throw err;
                }
            }

            return await queryBuild();
        },
        getBuildInfo: async function (bucket, build, fun) {
            try {
                const result = await _get(bucket, build);
                if (fun) {
                    fun(null, result.content);
                } else {
                    return result.content;
                }
            } catch (error) {
                if (fun) {
                    fun(error, null);
                } else {
                    throw error;
                }
            }
        },
        jobsForBuild: async function (bucket, build) {
            async function getJobs() {
                var doc_id = build.concat("_", bucket);
                var existing_builds_id = "existing_builds".concat("_", bucket);
                try {
                    const result = await _getmulti('greenboard', [doc_id, existing_builds_id]);
                    console.log(result);
                    
                    var job = result[doc_id]?.value;
                    if (!job) {
                        throw new Error("Job document not found");
                    }
                    
                    // Handle case where Couchbase returns Buffer for large documents
                    if (Buffer.isBuffer(job)) {
                        console.log("Converting Buffer to JSON for job document");
                        let jobString = job.toString();

                        // Clean the string by removing null bytes and control characters
                        const originalLength = jobString.length;
                        jobString = jobString.replace(/[\u0000-\u001F\u007F-\u009F]/g, '');
                        if (originalLength !== jobString.length) {
                            console.log("Cleaned", originalLength - jobString.length, "control characters from JSON");
                        }

                        try {
                            console.log("Buffer size:", job.length, "String length:", jobString.length);
                            console.log("First 100 chars:", jobString.substring(0, 100));
                            console.log("Last 100 chars:", jobString.substring(jobString.length - 100));
                            job = JSON.parse(jobString);
                        } catch (parseError) {
                            console.log("Failed to parse job JSON:", parseError.message);
                            const errorPos = parseError.message.match(/position (\d+)/)?.[1];
                            console.log("Error at position:", errorPos);
                            if (errorPos) {
                                const pos = parseInt(errorPos);
                                const start = Math.max(0, pos - 50);
                                const end = Math.min(jobString.length, pos + 50);
                                console.log("Context around error position:");
                                console.log("Before:", JSON.stringify(jobString.substring(start, pos)));
                                console.log("At pos:", JSON.stringify(jobString.charAt(pos)), "charCode:", jobString.charCodeAt(pos));
                                console.log("After:", JSON.stringify(jobString.substring(pos + 1, end)));
                            }
                            throw new Error("Invalid job document data");
                        }
                    }
                    
                    var allJobs = result[existing_builds_id]?.value;
                    if (!allJobs) {
                        throw new Error("Existing builds document not found");
                    }
                    
                    if (Buffer.isBuffer(allJobs)) {
                        console.log("Converting Buffer to JSON for allJobs document");
                        try {
                            const allJobsString = allJobs.toString();
                            console.log("AllJobs Buffer size:", allJobs.length, "String length:", allJobsString.length);
                            allJobs = JSON.parse(allJobsString);
                        } catch (parseError) {
                            console.log("Failed to parse allJobs JSON:", parseError.message);
                            throw new Error("Invalid allJobs document data");
                        }
                    }
                    
                    var processedJobs = processJob(job, allJobs, build);
                    buildsResponseCache[build] = processedJobs;
                    return processedJobs;
                } catch (err) {
                    console.error(err);
                    throw err;
                }
            }

            function processJob(jobs, allJobs, buildId) {
                var type = jobs.type;
                var existingJobs;
                var version = buildId.split('-')[0];

                console.log("=== JOB OBJECT DEBUG ===");
                console.log("jobs type:", typeof jobs);
                console.log("jobs isBuffer:", Buffer.isBuffer(jobs));
                console.log("jobs keys:", Object.keys(jobs));
                console.log("jobs['os'] exists:", 'os' in jobs);
                console.log("jobs['os'] type:", typeof jobs['os']);
                console.log("jobs['os'] value:", jobs['os']);
                console.log("========================");
                console.log(jobs);

                existingJobs = allJobs[bucket];
                countt = 0;
                _.forEach(existingJobs, function (components, os) {
                    _.forEach(components, function (jobNames, component) {
                        _.forEach(jobNames, function (name, job) {
                            try {
                                if (!_.has(jobs['os'], os)) {
                                    jobs['os'][os] = {};
                                }
                                if (!_.has(jobs['os'][os], component)) {
                                    jobs['os'][os][component] = {};
                                }

                                // pending if job with name or display name doesn't exist
                                const isPending = jobs['os'][os][component][job] === undefined && Object.values(jobs['os'][os][component]).find(runs => runs[0].displayName === job) === undefined;

                                if ((name.deleted === undefined || !name.deleted.includes(version)) &&
                                    bucket != "operator" && isPending &&
                                    ((name.hasOwnProperty('jobs_in')) &&
                                        (name['jobs_in'].indexOf(version) > -1))) {
                                    var pendJob = {};
                                    pendJob['pending'] = name.totalCount;
                                    pendJob['totalCount'] = 0;
                                    pendJob['failCount'] = 0;
                                    pendJob['result'] = "PENDING";
                                    pendJob['priority'] = name.priority;
                                    pendJob['url'] = name.url;
                                    pendJob['build_id'] = "";
                                    pendJob['claim'] = "";
                                    pendJob['deleted'] = false;
                                    pendJob['olderBuild'] = false;
                                    pendJob['duration'] = 0;
                                    pendJob['color'] = '';
                                    pendJob['bugs'] = [];
                                    pendJob['triage'] = '';
                                    pendJob['servers'] = [];
                                    if (name.hasOwnProperty('server_version')) {
                                        pendJob['server_version'] = name.server_version;
                                    }
                                    jobs['os'][os][component][job] = [pendJob];
                                    countt = countt + 1;
                                }
                            } catch (error) {
                                // console.log("Skipping problematic entry for os:", os, "component:", component, "job:", job, "error:", error.message);
                            }
                        });
                    });
                });
                
                function clean(el) {
                    function internalClean(el) {
                        return _.transform(el, function (result, value, key) {
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

                var cleaned = jobs;
                var toReturn = new Array();
                _.forEach(cleaned.os, function (components, os) {
                    _.forEach(components, function (jobNames, component) {
                        _.forEach(jobNames, function (jobs, jobName) {

                            var all_deleted = true;
                            const totalDuration = jobs.map(run => run.duration).reduce((a, b) => a + b, 0);
                            _.forEach(jobs, function (jobDetail, job) {
                                if (!jobDetail['deleted']) {
                                    all_deleted = false;
                                }
                                var tempJob = _.cloneDeep(jobDetail);

                                if (tempJob["skipCount"] === undefined) {
                                    tempJob["skipCount"] = 0;
                                }
                                if (tempJob["bugs"] === undefined) {
                                    tempJob["bugs"] = [];
                                }
                                if (tempJob["triage"] === undefined) {
                                    tempJob["triage"] = "";
                                }
                                if (tempJob["servers"] === undefined) {
                                    tempJob["servers"] = [];
                                }
                                tempJob["runCount"] = jobs.length;
                                tempJob["totalDuration"] = totalDuration;
                                if (tempJob["displayName"] === undefined) {
                                    tempJob["displayName"] = jobName;
                                }

                                if (tempJob.variants) {
                                    delete tempJob.variants.bucket_storage;

                                    if (tempJob.variants.GSI_type === "UNDEFINED") {
                                        tempJob.variants.GSI_type = "N/A";
                                    }
                                    if (tempJob.variants.GSI_type === "MEMORY_OPTIMIZED") {
                                        tempJob.variants.GSI_type = "MOI";
                                    }
                                }

                                tempJob['build'] = cleaned.build;
                                tempJob['name'] = jobName;
                                tempJob['displayName'] = tempJob['displayName'] || jobName;
                                tempJob['component'] = component;
                                tempJob['os'] = os;
                                toReturn[toReturn.length] = tempJob;
                            });
                            if (all_deleted) {
                                if (jobName.deleted && jobName.deleted.includes(version)) {
                                    return;
                                }

                                let pendJob = {};
                                pendJob['build'] = cleaned.build;
                                pendJob['name'] = jobName;
                                pendJob['component'] = component;
                                pendJob['os'] = os;
                                pendJob['pending'] = jobName.totalCount;
                                pendJob['totalCount'] = 0;
                                pendJob['failCount'] = 0;
                                pendJob['result'] = "PENDING";
                                pendJob['priority'] = jobName.priority;
                                pendJob['url'] = jobName.url;
                                pendJob['build_id'] = "";
                                pendJob['claim'] = "";
                                pendJob['deleted'] = false;
                                pendJob['olderBuild'] = false;
                                pendJob['duration'] = 0;
                                pendJob['color'] = '';
                                pendJob['bugs'] = [];
                                pendJob['triage'] = '';
                                pendJob['servers'] = [];
                                if (existingJobs.hasOwnProperty('server_version')) {
                                    pendJob['server_version'] = existingJobs.server_version;
                                }
                                if (jobName.hasOwnProperty('jobs_in')
                                    && jobName['jobs_in'].indexOf(version) > -1) {
                                    toReturn[toReturn.length] = pendJob;
                                }
                            }
                        });
                    });
                });
                return toReturn;
            }

            if (build in buildsResponseCache) {
                console.log("IN CACHE");
                var data = buildsResponseCache[build];
                getJobs(); // Refresh cache in background
                return Promise.resolve(data);
            } else {
                return getJobs();
            }
        },
        claimJobs: async function (type, bucket, name, build_id, claim, os, comp, version) {
            const jobs_key = `${version}_${bucket}`;
            const majorVersion = version.split("-")[0];
            const triage_history_key = `${name}_${majorVersion}_${bucket}`;

            const jobsResult = await _getmulti("greenboard", [jobs_key]);
            const jobs = jobsResult[jobs_key]?.value;
            if (!jobs) {
                throw new Error("Jobs document not found");
            }
            
            let triage_history;
            try {
                const triageResult = await _getmulti("triage_history", [triage_history_key]);
                triage_history = triageResult[triage_history_key]?.value;
            } catch (e) {
                triage_history = null;
            }
            
            const newbuildjobs = [];
            const buildjobs = jobs["os"][os][comp][name];
            buildjobs.forEach(function (d) {
                if (d["build_id"] == build_id) {
                    if (type === "bugs") {
                        d.bugs = claim;
                    } else if (type === "triage") {
                        d.triage = claim;
                    }
                }
                newbuildjobs.push(d);
            });
            jobs["os"][os][comp][name] = newbuildjobs;
            console.log(jobs["os"][os][comp][name]);
            await _upsert("greenboard", jobs_key, jobs);

            const build = parseInt(version.split("-")[1]);
            if (isNaN(build)) {
                throw Error("invalid build");
            }
            if (triage_history) {
                // overwrite with new build, reset other field to default
                if (build > triage_history.build) {
                    triage_history.build = build;
                    if (type === "bugs") {
                        triage_history.bugs = claim;
                        triage_history.triage = "";
                    } else if (type === "triage") {
                        triage_history.triage = claim;
                        triage_history.bugs = [];
                    }
                }
                // update existing build
                else if (build === triage_history.build) {
                    if (type === "bugs") {
                        triage_history.bugs = claim;
                    } else if (type === "triage") {
                        triage_history.triage = claim;
                    }
                }
            } else {
                triage_history = {
                    bugs: type === "bugs" ? claim : [],
                    triage: type === "triage" ? claim : "",
                    build
                };
            }

            await doUpsert("triage_history", triage_history_key, triage_history);
            // update cache
            if (version in buildsResponseCache) {
                const jobToUpdate = buildsResponseCache[version].find(job => job.build_id === parseInt(build_id) && job.os === os && job.component === comp);
                if (jobToUpdate) {
                    if (type === "bugs") {
                        jobToUpdate.bugs = claim;
                    } else if (type === "triage") {
                        jobToUpdate.triage = claim;
                    }
                }
            }
        },
        getBuildSummary: async function (buildId) {
            async function getBuildDetails() {
                try {
                    const result = await _getmulti('greenboard', [buildId, 'existing_builds']);
                    if (!("summary" in buildsResponseCache)) {
                        buildsResponseCache["summary"] = {};
                    }
                    buildsResponseCache["summary"][buildId] = result;
                    return processBuildDetails(result);
                } catch (err) {
                    console.error(err);
                    throw err;
                }
            }

            function processBuildDetails(data) {
                var build = data[buildId]?.value;
                if (!build) {
                    throw new Error("Build document not found");
                }
                var allJobs = data['existing_builds']?.value;
                if (!allJobs) {
                    throw new Error("Existing builds document not found");
                }
                var type = build.type;
                var version = buildId.split('-')[0];
                var existingJobs;
                if (type == "mobile") {
                    existingJobs = _.pick(allJobs, "mobile");
                } else {
                    existingJobs = _.omit(allJobs, "mobile");
                    existingJobs = _.merge(allJobs['server'], allJobs['build']);
                }
                _.forEach(existingJobs, function (components, os) {
                    _.forEach(components, function (jobNames, component) {
                        _.forEach(jobNames, function (name, job) {
                            if (!_.has(build['os'], os)) {
                                build['os'][os] = {};
                            }
                            if (!_.has(build['os'][os], component)) {
                                build['os'][os][component] = {};
                            }
                            if (!_.has(build['os'][os][component], job) && (job['jobs_in'].indexOf(version) > -1)) {
                                var pendJob = {};
                                pendJob['pending'] = name.totalCount;
                                pendJob['totalCount'] = 0;
                                pendJob['failCount'] = 0;
                                pendJob['result'] = "PENDING";
                                pendJob['priority'] = name.priority;
                                pendJob['url'] = name.url;
                                pendJob['build_id'] = "";
                                pendJob['claim'] = "";
                                pendJob['deleted'] = false;
                                pendJob['olderBuild'] = false;
                                pendJob['disabled'] = false;
                                pendJob['duration'] = 0;
                                pendJob['color'] = '';
                                build['os'][os][component][job] = [pendJob];
                            }
                        });
                    });
                });

                function clean(el) {
                    function internalClean(el) {
                        return _.transform(el, function (result, value, key) {
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

                var cleaned = clean(build);

                var sumTotalCount = function (total, job) {
                    var totalCount = _.reduce(job, function (total, _job) {
                        if (_job.olderBuild || _job.disabled) {
                            return total + 0;
                        }
                        return total + _job.totalCount;
                    }, 0);
                    return total + totalCount;
                };
                var sumFailCount = function (total, job) {
                    var failCount = _.reduce(job, function (total, _job) {
                        if (_job.olderBuild || _job.disabled) {
                            return total + 0;
                        }
                        return total + _job.failCount;
                    }, 0);
                    return total + failCount;
                };
                var sumPendingCount = function (total, job) {
                    var pendingCount = _.reduce(job, function (total, _job) {
                        if (_job.olderBuild || _job.disabled) {
                            return total + 0;
                        }
                        return total + (_job.pending || 0);
                    }, 0);
                    return total + pendingCount;
                };
                var transformComponent = function (component) {
                    return {
                        totalCount: _.reduce(component, sumTotalCount, 0),
                        failCount: _.reduce(component, sumFailCount, 0),
                        pending: _.reduce(component, sumPendingCount, 0)
                    };
                };
                var transformOs = function (os) {
                    var transformedComponents = _.mapValues(os, transformComponent);
                    var totalCount = _.reduce(transformedComponents, function (total, component) {
                        return total + component.totalCount;
                    }, 0);
                    var failCount = _.reduce(transformedComponents, function (total, component) {
                        return total + component.failCount;
                    }, 0);
                    var pendingCount = _.reduce(transformedComponents, function (total, component) {
                        return total + component.pending;
                    }, 0);
                    transformedComponents['totalCount'] = totalCount;
                    transformedComponents['failCount'] = failCount;
                    transformedComponents['pending'] = pendingCount;
                    return transformedComponents;
                };

                cleaned.os = _.mapValues(cleaned.os, transformOs);

                return cleaned;
            }

            if (("summary" in buildsResponseCache) && (buildId in buildsResponseCache["summary"])) {
                var data = buildsResponseCache["summary"][buildId];
                getBuildDetails(); // Refresh cache in background
                return Promise.resolve(processBuildDetails(data));
            }
            return getBuildDetails();
        },
        setBestRun: async function (bucket, name, build_id, os, comp, version) {
            const key = `${version}_${bucket}`;
            build_id = parseInt(build_id);
            while (true) {
                try {
                    const res = await _getmulti("greenboard", [key]);
                    const resultItem = res[key];
                    if (!resultItem) {
                        throw new Error("Document not found");
                    }
                    const cas = resultItem.cas;
                    const doc = resultItem.value;
                    for (const run of doc.os[os][comp][name]) {
                        if (run.olderBuild === false) {
                            doc.totalCount -= run.totalCount;
                            doc.failCount -= run.failCount;
                            run.olderBuild = true;
                        }
                        if (run.build_id === build_id) {
                            doc.totalCount += run.totalCount;
                            doc.failCount += run.failCount;
                            run.olderBuild = false;
                        }
                    }
                    await _upsert("greenboard", key, doc, cas);
                    if (version in buildsResponseCache) {
                        for (const run of buildsResponseCache[version].filter(job => job.os === os && job.component === comp && job.name === name)) {
                            run.olderBuild = true;
                        }
                        const bestRun = buildsResponseCache[version].find(job => job.build_id === build_id && job.os === os && job.component === comp);
                        if (bestRun) {
                            bestRun.olderBuild = false;
                        }
                    }
                    break;
                } catch (e) {
                    console.error(e);
                    // Retry on CAS mismatch
                    if (e.code === 23) { // CAS_MISMATCH
                        continue;
                    }
                    throw e;
                }
            }
        },
        rerunJob: async function (jobUrl, cherryPick) {
            const jenkins = getJenkins(jobUrl);
            const [, , name, numberStr] = new URL(jobUrl).pathname.split("/");

            if (!jenkins) {
                throw Error("Unsupported Jenkins server: " + new URL(jobUrl).origin);
            }

            const number = parseInt(numberStr);

            if (isNaN(number)) {
                throw Error("Invalid build id: " + numberStr);
            }

            const info = await jenkins.build.get(name, number);
            const parameters = getParameters(info);

            if (!parameters.dispatcher_params) {
                throw Error("Non dispatcher jobs not supported");
            }

            const dispatcherParams = JSON.parse(parameters.dispatcher_params.slice(11));

            // TODO: Remove when CBQE-6336 fixed
            if (!dispatcherParams.component) {
                throw Error("Invalid dispatcher params");
            }

            if (["ABORTED", "FAILURE"].includes(info.result)) {
                dispatcherParams.fresh_run = true;
            } else {
                dispatcherParams.fresh_run = false;
            }

            dispatcherParams.component = parameters.component;
            dispatcherParams.subcomponent = parameters.subcomponent;

            const [, , dispatcherName] = new URL(dispatcherParams.dispatcher_url).pathname.split("/");

            delete dispatcherParams.dispatcher_url;

            // Use the first server pool if there are multiple (see CBQE-7223)
            dispatcherParams.serverPoolId = dispatcherParams.serverPoolId.split(",")[0];

            await jenkins.job.build({ name: dispatcherName, parameters: dispatcherParams });
        },
        getTrend: async function (docId) {
            try {
                const result = await _get('trend', docId);
                return result.content;
            } catch (err) {
                if (err.code === 13) { // KEY_ENOENT
                    return null;
                }
                console.error(err);
                throw err;
            }
        },
        getReport: async function (version, component) {
            return await _getReport(version, component);
        }
    };

    return API;
};

function getParameters(info) {
    const parameters = {};
    for (const a of info["actions"]) {
        if (a["_class"] === "hudson.model.ParametersAction") {
            for (const param of a["parameters"]) {
                if ("name" in param && "value" in param) {
                    parameters[param['name']] = param['value'];
                }
            }
        }
    }
    return parameters;
}


