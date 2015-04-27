/*!
 * Copyright 2014 Netflix, Inc
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express
 * or implied. See the License for the specific language governing
 * permissions and limitations under the License.
 */
(function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);throw new Error("Cannot find module '"+o+"'")}var f=n[o]={exports:{}};t[o][0].call(f.exports,function(e){var n=t[o][1][e];return s(n?n:e)},f,f.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
var falcor = require('./index');
var HttpDataSource = require('falcor-browser');
falcor.HttpDataSource = HttpDataSource;
module.exports = falcor;

},{"./index":2,"falcor-browser":149}],2:[function(require,module,exports){
var falcor = require('./lib/falcor');
var get = require('./lib/get');
var set = require('./lib/set');
var inv = require('./lib/invalidate');
var prototype = falcor.Model.prototype;

prototype._getBoundValue = get.getBoundValue;
prototype._getValueSync = get.getValueSync;
prototype._getPathSetsAsValues = get.getAsValues;
prototype._getPathSetsAsJSON = get.getAsJSON;
prototype._getPathSetsAsPathMap = get.getAsPathMap;
prototype._getPathSetsAsJSONG = get.getAsJSONG;
prototype._getPathMapsAsValues = get.getAsValues;
prototype._getPathMapsAsJSON = get.getAsJSON;
prototype._getPathMapsAsPathMap = get.getAsPathMap;
prototype._getPathMapsAsJSONG = get.getAsJSONG;

prototype._setPathSetsAsJSON = set.setPathSetsAsJSON;
prototype._setPathSetsAsJSONG = set.setPathSetsAsJSONG;
prototype._setPathSetsAsPathMap = set.setPathSetsAsPathMap;
prototype._setPathSetsAsValues = set.setPathSetsAsValues;

prototype._setPathMapsAsJSON = set.setPathMapsAsJSON;
prototype._setPathMapsAsJSONG = set.setPathMapsAsJSONG;
prototype._setPathMapsAsPathMap = set.setPathMapsAsPathMap;
prototype._setPathMapsAsValues = set.setPathMapsAsValues;

prototype._setJSONGsAsJSON = set.setJSONGsAsJSON;
prototype._setJSONGsAsJSONG = set.setJSONGsAsJSONG;
prototype._setJSONGsAsPathMap = set.setJSONGsAsPathMap;
prototype._setJSONGsAsValues = set.setJSONGsAsValues;

prototype._invPathSetsAsJSON = inv.invPathSetsAsJSON;
prototype._invPathSetsAsJSONG = inv.invPathSetsAsJSONG;
prototype._invPathSetsAsPathMap = inv.invPathSetsAsPathMap;
prototype._invPathSetsAsValues = inv.invPathSetsAsValues;

// prototype._setCache = get.setCache;
prototype._setCache = set.setCache;

module.exports = falcor;


},{"./lib/falcor":6,"./lib/get":48,"./lib/invalidate":77,"./lib/set":85}],3:[function(require,module,exports){
if (typeof falcor === 'undefined') {
    var falcor = {};
}
var Rx = require('rx');

falcor.__Internals = {};
falcor.Observable = Rx.Observable;
falcor.EXPIRES_NOW = 0;
falcor.EXPIRES_NEVER = 1;
/**
 * The current semVer'd data version of falcor.
 */
falcor.dataVersion = '0.1.0';

falcor.now = function now() {
    return Date.now();
};
falcor.NOOP = function() {};

module.exports = falcor;

},{"rx":168}],4:[function(require,module,exports){
var falcor = require('./Falcor');
var RequestQueue = require('./request/RequestQueue');
var ImmediateScheduler = require('./scheduler/ImmediateScheduler');
var TimeoutScheduler = require('./scheduler/TimeoutScheduler');
var ERROR = require("../types/error");
var ModelResponse = require('./ModelResponse');
var call = require('./operations/call');
var operations = require('./operations');
var pathSyntax = require('falcor-path-syntax');
var getBoundValue = require('./../get/getBoundValue');
var slice = Array.prototype.slice;
var $ref = require('./../types/path');
var $error = require('./../types/error');
var $sentinel = require('./../types/sentinel');

var Model = module.exports = falcor.Model = function Model(options) {

    if (!options) {
        options = {};
    }

    this._materialized = options.materialized || false;
    this._boxed = options.boxed || false;
    this._treatErrorsAsValues = options.treatErrorsAsValues || false;

    this._dataSource = options.source;
    this._maxSize = options.maxSize || Math.pow(2, 53) - 1;
    this._collectRatio = options.collectRatio || 0.75;
    this._scheduler = new ImmediateScheduler();
    this._request = new RequestQueue(this, this._scheduler);
    this._errorSelector = options.errorSelector || Model.prototype._errorSelector;
    this._router = options.router;

    this._root = options.root || {
        expired: [],
        allowSync: 0,
        unsafeMode: false
    };
    if (options.cache && typeof options.cache === "object") {
        this.setCache(options.cache);
    } else {
        this._cache = {};
    }
    this._path = [];
};

Model.EXPIRES_NOW = falcor.EXPIRES_NOW;
Model.EXPIRES_NEVER = falcor.EXPIRES_NEVER;

Model.ref = function(path) {
    if (typeof path === 'string') {
        path = pathSyntax(path);
    }
    return {$type: $ref, value: path};
};

Model.error = function(error) {
    return {$type: $error, value: error};
};

Model.atom = function(value) {
    return {$type: $sentinel, value: value};
};

Model.prototype = {
    _boxed: false,
    _progressive: false,
    _errorSelector: function(x, y) { return y; },
    get: operations("get"),
    set: operations("set"),
    invalidate: operations("invalidate"),
    call: call,
    getValue: function(path) {
        return this.get(path, function(x) { return x; });
    },
    setValue: function(path, value) {
        path = pathSyntax.fromPath(path);
        return this.set(Array.isArray(path) ?
        {path: path, value: value} :
            path, function(x) { return x; });
    },
    bind: function(boundPath) {

        var model = this, root = model._root,
            paths = new Array(arguments.length - 1),
            i = -1, n = arguments.length - 1;

        boundPath = pathSyntax.fromPath(boundPath);

        while(++i < n) {
            paths[i] = pathSyntax.fromPath(arguments[i + 1]);
        }

        if(n === 0) { throw new Error("Model#bind requires at least one value path."); }

        return falcor.Observable.create(function(observer) {

            var boundModel;
            root.allowSync++;
            try {
                boundModel = model.bindSync(model._path.concat(boundPath));

                if (!boundModel) {
                    throw false;
                }
                observer.onNext(boundModel);
                observer.onCompleted();
            } catch (e) {
                return model.get.apply(model, paths.map(function(path) {
                    return boundPath.concat(path);
                }).concat(function(){})).subscribe(
                    function onNext() {},
                    function onError(err)  { observer.onError(err); },
                    function onCompleted() {
                        root.allowSync++;
                        try {

                            boundModel = model.bindSync(boundPath);
                            if(boundModel) {
                                observer.onNext(boundModel);
                            }
                            observer.onCompleted();
                        } catch(e) {
                            observer.onError(e);
                        }

                        // remove the inc
                        finally {
                            root.allowSync--;
                        }
                    });
            }

            // remove the inc
            finally {
                root.allowSync--;
            }
        });
    },
    setCache: function(cache) {
        return (this._cache = {}) && this._setCache(this, cache);
    },
    getCache: function() {
        var pathmaps = [{}];
        var tmpCache = this.boxValues().treatErrorsAsValues().materialize();
        tmpCache._getPathMapsAsPathMap(tmpCache, [tmpCache._cache], pathmaps);
        return pathmaps[0].json;
    },
    getValueSync: function(path) {
        path = pathSyntax.fromPath(path);
        if (Array.isArray(path) === false) {
            throw new Error("Model#getValueSync must be called with an Array path.");
        }
        if (this._path.length) {
            path = this._path.concat(path);
        }
        return this.syncCheck("getValueSync") && this._getValueSync(this, path).value;
    },
    setValueSync: function(path, value, errorSelector) {
        path = pathSyntax.fromPath(path);

        if(Array.isArray(path) === false) {
            if(typeof errorSelector !== "function") {
                errorSelector = value || this._errorSelector;
            }
            value = path.value;
            path  = path.path;
        }

        if(Array.isArray(path) === false) {
            throw new Error("Model#setValueSync must be called with an Array path.");
        }

        if(this.syncCheck("setValueSync")) {

            var json = {};
            var tEeAV = this._treatErrorsAsValues;
            var boxed = this._boxed;

            this._treatErrorsAsValues = true;
            this._boxed = true;

            this._setPathSetsAsJSON(this, [{path: path, value: value}], [json], errorSelector);

            this._treatErrorsAsValues = tEeAV;
            this._boxed = boxed;

            json = json.json;

            if(json && json.$type === ERROR && !this._treatErrorsAsValues) {
                if(this._boxed) {
                    throw json;
                } else {
                    throw json.value;
                }
            } else if(this._boxed) {
                return json;
            }

            return json && json.value;
        }
    },
    bindSync: function(path) {
        path = pathSyntax.fromPath(path);
        if(Array.isArray(path) === false) {
            throw new Error("Model#bindSync must be called with an Array path.");
        }
        var boundValue = this.syncCheck("bindSync") && getBoundValue(this, this._path.concat(path));
        var node = boundValue.value;
        path = boundValue.path;
        if(boundValue.shorted) {
            if(!!node) {
                if(node.$type === ERROR) {
                    if(this._boxed) {
                        throw node;
                    }
                    throw node.value;
                    // throw new Error("Model#bindSync can\'t bind to or beyond an error: " + boundValue.toString());
                }
            }
            return undefined;
        } else if(!!node && node.$type === ERROR) {
            if(this._boxed) {
                throw node;
            }
            throw node.value;
        }
        return this.clone(["_path", boundValue.path]);
    },
    clone: function() {

        var self = this;
        var clone = new Model();

        var key, keyValue;

        var keys = Object.keys(self);
        var keysIdx = -1;
        var keysLen = keys.length;
        while(++keysIdx < keysLen) {
            key = keys[keysIdx];
            clone[key] = self[key];
        }

        var argsIdx = -1;
        var argsLen = arguments.length;
        while(++argsIdx < argsLen) {
            keyValue = arguments[argsIdx];
            clone[keyValue[0]] = keyValue[1];
        }

        return clone;
    },
    batch: function(schedulerOrDelay) {
        if(typeof schedulerOrDelay === "number") {
            schedulerOrDelay = new TimeoutScheduler(Math.round(Math.abs(schedulerOrDelay)));
        } else if(!schedulerOrDelay || !schedulerOrDelay.schedule) {
            schedulerOrDelay = new ImmediateScheduler();
        }
        return this.clone(["_request", new RequestQueue(this, schedulerOrDelay)]);
    },
    unbatch: function() {
        return this.clone(["_request", new RequestQueue(this, new ImmediateScheduler())]);
    },
    treatErrorsAsValues: function() {
        return this.clone(["_treatErrorsAsValues", true]);
    },
    materialize: function() {
        return this.clone(["_materialized", true]);
    },
    boxValues: function() {
        return this.clone(["_boxed", true]);
    },
    unboxValues: function() {
        return this.clone(["_boxed", false]);
    },
    withoutDataSource: function() {
        return this.clone(["_dataSource", null]);
    },
    syncCheck: function(name) {
        if (!!this._dataSource && this._root.allowSync <= 0 && this._root.unsafeMode === false) {
            throw new Error("Model#" + name + " may only be called within the context of a request selector.");
        }
        return true;
    }
};

},{"../types/error":135,"./../get/getBoundValue":45,"./../types/error":135,"./../types/path":136,"./../types/sentinel":137,"./Falcor":3,"./ModelResponse":5,"./operations":12,"./operations/call":7,"./request/RequestQueue":37,"./scheduler/ImmediateScheduler":38,"./scheduler/TimeoutScheduler":39,"falcor-path-syntax":152}],5:[function(require,module,exports){
var falcor = require('./Falcor');
var pathSyntax = require('falcor-path-syntax');

if(typeof Promise !== "undefined" && Promise) {
    falcor.Promise = Promise;
} else {
    falcor.Promise = require("promise");
}

var Observable  = falcor.Observable,
    valuesMixin = { format: { value: "AsValues"  } },
    jsonMixin   = { format: { value: "AsPathMap" } },
    jsongMixin  = { format: { value: "AsJSONG"   } },
    progressiveMixin = { operationIsProgressive: { value: true } };

function ModelResponse(forEach) {
    this._subscribe = forEach;
}

ModelResponse.create = function(forEach) {
    return new ModelResponse(forEach);
};

ModelResponse.fromOperation = function(model, args, selector, forEach) {
    return new ModelResponse(function(observer) {
        return forEach(Object.create(observer, {
            operationModel: {value: model},
            operationArgs: {value: pathSyntax.fromPathsOrPathValues(args)},
            operationSelector: {value: selector}
        }));
    });
};

function noop() {}
function mixin(self) {
    var mixins = Array.prototype.slice.call(arguments, 1);
    return new ModelResponse(function(other) {
        return self.subscribe(mixins.reduce(function(proto, mixin) {
            return Object.create(proto, mixin);
        }, other));
    });
}

ModelResponse.prototype = Observable.create(noop);
ModelResponse.prototype.format = "AsPathMap";
ModelResponse.prototype.toPathValues = function() {
    return mixin(this, valuesMixin);
};
ModelResponse.prototype.toJSON = function() {
    return mixin(this, jsonMixin);
};
ModelResponse.prototype.progressively = function() {
    return mixin(this, progressiveMixin);
};
ModelResponse.prototype.toJSONG = function() {
    return mixin(this, jsongMixin);
};
ModelResponse.prototype.then = function(onNext, onError) {
    var self = this;
    return new falcor.Promise(function(resolve, reject) {
        setTimeout(function() {
            var value = undefined;
            var error = undefined;
            self.toArray().subscribe(
                function(values) {
                    if(values.length <= 1) {
                        value = values[0];
                    } else {
                        value = values;
                    }
                },
                function(errors) {
                    if(errors.length <= 1) {
                        error = errors[0];
                    } else {
                        error = errors;
                    }
                    resolve = undefined;
                },
                function() {
                    if(!!resolve) {
                        resolve(value);
                    } else {
                        reject(error);
                    }
                }
            );
        }, 0);
    }).then(onNext, onError);
};

module.exports = ModelResponse;

},{"./Falcor":3,"falcor-path-syntax":152,"promise":158}],6:[function(require,module,exports){
var falcor = require('./Falcor');
var Model = require('./Model');
falcor.Model = Model;

module.exports = falcor;

},{"./Falcor":3,"./Model":4}],7:[function(require,module,exports){
module.exports = call;

var falcor = require("../../Falcor");
var ModelResponse = require('./../../ModelResponse');

function call(path, args, suffixes, paths, selector) {

    var model = this;
    args && Array.isArray(args) || (args = []);
    suffixes && Array.isArray(suffixes) || (suffixes = []);
    paths = Array.prototype.slice.call(arguments, 3);
    if (typeof (selector = paths[paths.length - 1]) !== "function") {
        selector = undefined;
    } else {
        paths = paths.slice(0, -1);
    }

    return ModelResponse.create(function (options) {

        var rootModel = model.clone(["_path", []]),
            localRoot = rootModel.withoutDataSource(),
            dataSource = model._dataSource,
            boundPath = model._path,
            callPath = boundPath.concat(path),
            thisPath = callPath.slice(0, -1);

        var disposable = model.
            getValue(path).
            flatMap(function (localFn) {
                if (typeof localFn === "function") {
                    return falcor.Observable.return(localFn.
                        apply(rootModel.bindSync(thisPath), args).
                        map(function (pathValue) {
                            return {
                                path: thisPath.concat(pathValue.path),
                                value: pathValue.value
                            };
                        }).
                        toArray().
                        flatMap(function (pathValues) {
                            return localRoot.set.
                                apply(localRoot, pathValues).
                                toJSONG();
                        }).
                        flatMap(function (envelope) {
                            return rootModel.get.apply(rootModel,
                                envelope.paths.reduce(function (paths, path) {
                                    return paths.concat(suffixes.map(function (suffix) {
                                        return path.concat(suffix);
                                    }));
                                }, []).
                                    concat(paths.reduce(function (paths, path) {
                                        return paths.concat(thisPath.concat(path));
                                    }, []))).
                                toJSONG();
                        }));
                }
                return falcor.Observable.empty();
            }).
            defaultIfEmpty(dataSource.call(path, args, suffixes, paths)).
            mergeAll().
            subscribe(function (envelope) {
                var invalidated = envelope.invalidated;
                if (invalidated && invalidated.length) {
                    invalidatePaths(rootModel, invalidated, undefined, model._errorSelector);
                }
                disposable = localRoot.
                    set(envelope, function () {
                        return model;
                    }).
                    subscribe(function (model) {
                        var getPaths = envelope.paths.map(function (path) {
                            return path.slice(boundPath.length);
                        });
                        if (selector) {
                            getPaths[getPaths.length] = function () {
                                return selector.call(model, getPaths);
                            };
                        }
                        disposable = model.get.apply(model, getPaths).subscribe(options);
                    });
            });

        return {
            dispose: function () {
                disposable && disposable.dispose();
                disposable = undefined;
            }
        };
    });
}

},{"../../Falcor":3,"./../../ModelResponse":5}],8:[function(require,module,exports){
var combineOperations = require('./../support/combineOperations');
var setSeedsOrOnNext = require('./../support/setSeedsOrOnNext');

/**
 * The initial args that are passed into the async request pipeline.
 * @see lib/falcor/operations/request.js for how initialArgs are used
 */
module.exports = function getInitialArgs(options, seeds, onNext) {
    var seedRequired = options.format !== 'AsValues';
    var isProgressive = options.operationIsProgressive;
    var spreadOperations = false;
    var operations =
        combineOperations(
            options.operationArgs, options.format, 'get',
            spreadOperations, isProgressive);
    setSeedsOrOnNext(
        operations, seedRequired, seeds, onNext, options.operationSelector);
    var requestOptions;
    return [operations];
};

},{"./../support/combineOperations":23,"./../support/setSeedsOrOnNext":36}],9:[function(require,module,exports){
var getSourceObserver = require('./../support/getSourceObserever');
var partitionOperations = require('./../support/partitionOperations');
var mergeBoundPath = require('./../support/mergeBoundPath');

module.exports = getSourceRequest;

function getSourceRequest(
    options, onNext, seeds, combinedResults, requestOptions, cb) {

    var model = options.operationModel;
    var boundPath = model._path;
    var missingPaths = combinedResults.requestedMissingPaths;
    if (boundPath.length) {
        for (var i = 0; i < missingPaths.length; ++i) {
            var pathSetIndex = missingPaths[i].pathSetIndex;
            var path = missingPaths[i] = boundPath.concat(missingPaths[i]);
            path.pathSetIndex = pathSetIndex;
        }
    }

    return model._request.get(
        missingPaths,
        combinedResults.optimizedMissingPaths,
        getSourceObserver(
            model,
            missingPaths,
            function getSourceCallback(err, results) {
                if (err) {
                    cb(err);
                    return;
                }

                // partitions the operations by their pathSetIndex
                var partitionOperationsAndSeeds = partitionOperations(
                    results,
                    seeds,
                    options.format,
                    onNext);

                // We allow for the rerequesting to happen.
                cb(null, partitionOperationsAndSeeds);
            }));
}


},{"./../support/getSourceObserever":24,"./../support/mergeBoundPath":28,"./../support/partitionOperations":31}],10:[function(require,module,exports){
var getInitialArgs = require('./getInitialArgs');
var getSourceRequest = require('./getSourceRequest');
var shouldRequest = require('./shouldRequest');
var request = require('./../request');
var processOperations = require('./../support/processOperations');
var get = request(
    getInitialArgs,
    getSourceRequest,
    processOperations,
    shouldRequest);

module.exports = get;

},{"./../request":15,"./../support/processOperations":33,"./getInitialArgs":8,"./getSourceRequest":9,"./shouldRequest":11}],11:[function(require,module,exports){
module.exports = function(model, combinedResults) {
    return model._dataSource && combinedResults.requestedMissingPaths.length > 0;
};

},{}],12:[function(require,module,exports){
var ModelResponse = require('../ModelResponse');
var get = require('./get');
var set = require('./set');
var invalidate = require('./invalidate');

module.exports = function modelOperation(name) {
    return function() {
        var model = this, root = model._root,
            args = Array.prototype.slice.call(arguments),
            selector = args[args.length - 1];
        if (typeof selector === 'function') {
            args.pop();
        } else {
            selector = false;
        }

        var modelResponder;
        switch (name) {
            case 'get':
                modelResponder = get;
                break;
            case 'set':
                modelResponder = set;
                break;
            case 'invalidate':
                modelResponder = invalidate;
                break;
        }
        return ModelResponse.fromOperation(
            model,
            args,
            selector,
            modelResponder);
    };
};

},{"../ModelResponse":5,"./get":10,"./invalidate":13,"./set":16}],13:[function(require,module,exports){
var invalidateInitialArgs = require('./invalidateInitialArgs');
var request = require('./../request');
var processOperations = require('./../support/processOperations');
var invalidate = request(
    invalidateInitialArgs,
    null,
    processOperations);

module.exports = invalidate;

},{"./../request":15,"./../support/processOperations":33,"./invalidateInitialArgs":14}],14:[function(require,module,exports){
var combineOperations = require('./../support/combineOperations');
var setSeedsOrOnNext = require('./../support/setSeedsOrOnNext');
module.exports = function getInitialArgs(options, seeds, onNext) {
    var seedRequired = options.format !== 'AsValues';
    var operations = combineOperations(
        options.operationArgs, options.format, 'inv');
    setSeedsOrOnNext(
        operations, seedRequired, seeds,
        onNext, options.operationSelector);

    return [operations, seeds];
};

},{"./../support/combineOperations":23,"./../support/setSeedsOrOnNext":36}],15:[function(require,module,exports){
var setSeedsOrOnNext = require('./support/setSeedsOrOnNext');
var onNextValues = require('./support/onNextValue');
var onCompletedOrError = require('./support/onCompletedOrError');
var primeSeeds = require('./support/primeSeeds');
var autoFalse = function() { return false; };

module.exports = request;

function request(initialArgs, sourceRequest, processOperations, shouldRequestFn) {
    if (!shouldRequestFn) {
        shouldRequestFn = autoFalse;
    }
    return function innerRequest(options) {
        var selector = options.operationSelector;
        var model = options.operationModel;
        var args = options.operationArgs;
        var onNext = options.onNext.bind(options);
        var onError = options.onError.bind(options);
        var onCompleted = options.onCompleted.bind(options);
        var isProgressive = options.operationIsProgressive;
        var errorSelector = model._errorSelector;
        var selectorLength = selector && selector.length || 0;

        // State variables
        var errors = [];
        var format = options.format = selector && 'AsJSON' ||
            options.format || 'AsPathMap';
        var toJSONG = format === 'AsJSONG';
        var toJSON = format === 'AsPathMap';
        var toPathValues = format === 'AsValues';
        var seedRequired = toJSON || toJSONG || selector;
        var boundPath = model._path;
        var i, len;
        var foundValue = false;
        var seeds = primeSeeds(selector, selectorLength);
        var loopCount = 0;

        function recurse(operations, opts) {
            if (loopCount > 50) {
                throw 'Loop Kill switch thrown.';
            }
            var combinedResults = processOperations(
                model,
                operations,
                errorSelector,
                opts);

            foundValue = foundValue || combinedResults.valuesReceived;
            if (combinedResults.errors.length) {
                errors = errors.concat(combinedResults.errors);
            }

            // if in progressiveMode, values are emitted
            // each time through the recurse loop.  This may have
            // to change when the router is considered.
            if (isProgressive && !toPathValues) {
                onNextValues(model, onNext, seeds, selector);
            }

            // Performs the recursing via dataSource
            if (shouldRequestFn(model, combinedResults, loopCount)) {
                sourceRequest(
                    options,
                    onNext,
                    seeds,
                    combinedResults,
                    opts,
                    function onCompleteFromSourceSet(err, results) {
                        if (err) {
                            errors = errors.concat(err);
                            recurse([], seeds);
                            return;
                        }
                        ++loopCount;

                        // We continue to string the opts through
                        recurse(results, opts);
                    });
            }

            // Else we need to onNext values and complete/error.
            else {
                if (!toPathValues && !isProgressive && foundValue) {
                    onNextValues(model, onNext, seeds, selector);
                }
                onCompletedOrError(onCompleted, onError, errors);
            }
        }

        try {
            recurse.apply(null,
                initialArgs(options, seeds, onNext));
        } catch(e) {
            errors = [e];
            onCompletedOrError(onCompleted, onError, errors);
        }
    };
}

},{"./support/onCompletedOrError":29,"./support/onNextValue":30,"./support/primeSeeds":32,"./support/setSeedsOrOnNext":36}],16:[function(require,module,exports){
var setInitialArgs = require('./setInitialArgs');
var setSourceRequest = require('./setSourceRequest');
var request = require('./../request');
var setProcessOperations = require('./setProcessOperations');
var shouldRequest = require('./shouldRequest');
var set = request(
    setInitialArgs,
    setSourceRequest,
    setProcessOperations,
    shouldRequest);

module.exports = set;

},{"./../request":15,"./setInitialArgs":17,"./setProcessOperations":18,"./setSourceRequest":19,"./shouldRequest":20}],17:[function(require,module,exports){
var combineOperations = require('./../support/combineOperations');
var setSeedsOrOnNext = require('./../support/setSeedsOrOnNext');
var Formats = require('./../support/Formats');
var toPathValues = Formats.toPathValues;
var toJSONG = Formats.toJSONG;
module.exports = function setInitialArgs(options, seeds, onNext) {
    var isPathValues = options.format === toPathValues;
    var seedRequired = !isPathValues;
    var shouldRequest = !!options.operationModel._dataSource;
    var format = options.format;
    var args = options.operationArgs;
    var selector = options.operationSelector;
    var isProgressive = options.operationIsProgressive;
    var firstSeeds, operations;
    var requestOptions = {
        removeBoundPath: shouldRequest
    };

    // If Model is a slave, in shouldRequest mode,
    // a single seed is required to accumulate the jsong results.
    if (shouldRequest) {
        operations =
            combineOperations(args, toJSONG, 'set', selector, false);
        firstSeeds = [{}];
        setSeedsOrOnNext(
            operations, true, firstSeeds, false, options.selector);

        // we must keep track of the set seeds.
        requestOptions.requestSeed = firstSeeds[0];
    }

    // This model is the master, therefore a regular set can be performed.
    else {
        firstSeeds = seeds;
        operations = combineOperations(args, format, 'set');
        setSeedsOrOnNext(
            operations, seedRequired, seeds, onNext, options.operationSelector);
    }

    // We either have to construct the master operations if
    // the ModelResponse is isProgressive
    // the ModelResponse is toPathValues
    // but luckily we can just perform a get for the progressive or
    // toPathValues mode.
    if (isProgressive || isPathValues) {
        var getOps = combineOperations(
            args, format, 'get', selector, true);
        setSeedsOrOnNext(
            getOps, seedRequired, seeds, onNext, options.operationSelector);
        operations = operations.concat(getOps);

        requestOptions.isProgressive = true;
    }

    return [operations, requestOptions];
};

},{"./../support/Formats":21,"./../support/combineOperations":23,"./../support/setSeedsOrOnNext":36}],18:[function(require,module,exports){
var processOperations = require('./../support/processOperations');
var combineOperations = require('./../support/combineOperations');
var mergeBoundPath = require('./../support/mergeBoundPath');
var Formats = require('./../support/Formats');
var toPathValues = Formats.toPathValues;

module.exports = setProcessOperations;

function setProcessOperations(model, operations, errorSelector, requestOptions) {

    var boundPath = model._path;
    var hasBoundPath = boundPath.length > 0;
    var removeBoundPath = requestOptions && requestOptions.removeBoundPath;
    var isProgressive = requestOptions && requestOptions.isProgressive;
    var progressiveOperations;

    // if in progressive mode, then the progressive operations
    // need to be executed but the bound path must stay intact.
    if (isProgressive && removeBoundPath && hasBoundPath) {
        progressiveOperations = operations.filter(function(op) {
            return op.isProgressive;
        });
        operations = operations.filter(function(op) {
            return !op.isProgressive;
        });
    }

    if (removeBoundPath && hasBoundPath) {
        model._path = [];

        // For every operations arguments, the bound path must be adjusted.
        for (var i = 0, opLen = operations.length; i < opLen; i++) {
            var args = operations[i].args;
            for (var j = 0, argsLen = args.length; j < argsLen; j++) {
                args[j] = mergeBoundPath(args[j], boundPath);
            }
        }
    }

    var results = processOperations(model, operations, errorSelector);

    // Undo what we have done to the model's bound path.
    if (removeBoundPath && hasBoundPath) {
        model._path = boundPath;
    }

    // executes the progressive ops
    if (progressiveOperations) {
        processOperations(model, progressiveOperations, errorSelector);
    }

    return results;
}

},{"./../support/Formats":21,"./../support/combineOperations":23,"./../support/mergeBoundPath":28,"./../support/processOperations":33}],19:[function(require,module,exports){
var getSourceObserver = require('./../support/getSourceObserever');
var combineOperations = require('./../support/combineOperations');
var setSeedsOrOnNext = require('./../support/setSeedsOrOnNext');
var toPathValues = require('./../support/Formats').toPathValues;

module.exports = setSourceRequest;

function setSourceRequest(
        options, onNext, seeds, combinedResults, requestOptions, cb) {
    var model = options.operationModel;
    var seedRequired = options.format !== toPathValues;
    var requestSeed = requestOptions.requestSeed;
    return model._request.set(
        requestSeed,
        getSourceObserver(
            model,
            requestSeed.paths,
            function setSourceRequestCB(err, results) {
                if (err) {
                    cb(err);
                }

                // Sets the results into the model.
                model._setJSONGsAsJSON(model, [results], []);

                // Gets the original paths / maps back out.
                var operations = combineOperations(
                        options.operationArgs, options.format, 'get');
                setSeedsOrOnNext(
                    operations, seedRequired,
                    seeds, onNext, options.operationSelector);

                // unset the removeBoundPath.
                requestOptions.removeBoundPath = false;

                cb(null, operations);
            }));
}


},{"./../support/Formats":21,"./../support/combineOperations":23,"./../support/getSourceObserever":24,"./../support/setSeedsOrOnNext":36}],20:[function(require,module,exports){
// Set differs from get in the sense that the first time through
// the recurse loop a server operation must be performed if it can be.
module.exports = function(model, combinedResults, loopCount) {
    return model._dataSource && (
        combinedResults.requestedMissingPaths.length > 0 ||
        loopCount === 0);
};

},{}],21:[function(require,module,exports){
module.exports = {
    toPathValues: 'AsValues',
    toJSON: 'AsPathMap',
    toJSONG: 'AsJSONG',
    selector: 'AsJSON',
};

},{}],22:[function(require,module,exports){
module.exports = function buildJSONGOperation(format, seeds, jsongOp, seedOffset, onNext) {
    return {
        methodName: '_setJSONGs' + format,
        format: format,
        isValues: format === 'AsValues',
        onNext: onNext,
        seeds: seeds,
        seedsOffset: seedOffset,
        args: [jsongOp]
    };
};

},{}],23:[function(require,module,exports){
var isSeedRequired = require('./seedRequired');
var isJSONG = require('./isJSONG');
var isPathOrPathValue = require('./isPathOrPathValue');
var Formats = require('./Formats');
var toSelector = Formats.selector;
module.exports = function combineOperations(args, format, name, spread, isProgressive) {
    var seedRequired = isSeedRequired(format);
    var isValues = !seedRequired;
    var hasSelector = seedRequired && format === toSelector;
    var seedsOffset = 0;

    return args.
        reduce(function(groups, argument) {
            var group = groups[groups.length - 1];
            var type  = isPathOrPathValue(argument) ? "PathSets" :
                isJSONG(argument) ? "JSONGs" : "PathMaps";
            var groupType = group && group.type;
            var methodName = '_' + name + type + format;

            if (!groupType || type !== groupType || spread) {
                group = {
                    methodName: methodName,
                    format: format,
                    operation: name,
                    isValues: isValues,
                    seeds: [],
                    onNext: null,
                    seedsOffset: seedsOffset,
                    isProgressive: isProgressive,
                    type: type,
                    args: []
                };
                groups.push(group);
            }
            if (hasSelector) {
                ++seedsOffset;
            }
            group.args.push(argument);
            return groups;
        }, []);
};

},{"./Formats":21,"./isJSONG":26,"./isPathOrPathValue":27,"./seedRequired":34}],24:[function(require,module,exports){
var insertErrors = require('./insertErrors.js');
/**
 * creates the model source observer
 * @param {Model} model
 * @param {Array.<Array>} requestedMissingPaths
 * @param {Function} cb
 */
function getSourceObserver(model, requestedMissingPaths, cb) {
    var incomingValues;
    return {
        onNext: function(jsongEnvelop) {
            incomingValues = {
                jsong: jsongEnvelop.jsong,
                paths: requestedMissingPaths
            };
        },
        onError: function(err) {
            cb(insertErrors(model, requestedMissingPaths, err));
        },
        onCompleted: function() {
            cb(false, incomingValues);
        }
    };
}

module.exports = getSourceObserver;

},{"./insertErrors.js":25}],25:[function(require,module,exports){
/**
 * will insert the error provided for every requestedPath.
 * @param {Model} model
 * @param {Array.<Array>} requestedPaths
 * @param {Object} err
 */
module.exports = function insertErrors(model, requestedPaths, err) {
    var out = model._setPathSetsAsJSON.apply(null, [model].concat(
        requestedPaths.
            reduce(function(acc, r) {
                acc[0].push({
                    path: r,
                    value: err
                });
                return acc;
            }, [[]]),
        [],
        model._errorSelector
    ));
    return out.errors;
};


},{}],26:[function(require,module,exports){
module.exports = function isJSONG(x) {
    return x.hasOwnProperty("jsong");
};

},{}],27:[function(require,module,exports){
module.exports = function isPathOrPathValue(x) {
    return !!(Array.isArray(x)) || (
        x.hasOwnProperty("path") && x.hasOwnProperty("value"));
};

},{}],28:[function(require,module,exports){
var isJSONG = require('./isJSONG');
var isPathValue = require('./isPathOrPathValue');

module.exports =  mergeBoundPath;

function mergeBoundPath(arg, boundPath) {
    return isJSONG(arg) && mergeBoundPathIntoJSONG(arg, boundPath) ||
        isPathValue(arg) && mergeBoundPathIntoPathValue(arg, boundPath) ||
        mergeBoundPathIntoJSON(arg, boundPath);
}

function mergeBoundPathIntoJSONG(jsongEnv, boundPath) {
    var newJSONGEnv = {jsong: jsongEnv.jsong, paths: jsongEnv.paths};
    if (boundPath.length) {
        var paths = [];
        for (i = 0, len = jsongEnv.paths.length; i < len; i++) {
            paths[i] = boundPath.concat(jsongEnv.paths[i]);
        }
        newJSONGEnv.paths = paths;
    }

    return newJSONGEnv;
}

function mergeBoundPathIntoJSON(arg, boundPath) {
    var newArg = arg;
    if (boundPath.length) {
        newArg = {};
        for (var i = 0, len = boundPath.length - 1; i < len; i++) {
            newArg[boundPath[i]] = {};
        }
        newArg[boundPath[i]] = arg;
    }

    return newArg;
}

function mergeBoundPathIntoPathValue(arg, boundPath) {
    return {
        path: boundPath.concat(arg.path),
        value: arg.value
    };
}

},{"./isJSONG":26,"./isPathOrPathValue":27}],29:[function(require,module,exports){
module.exports = function onCompletedOrError(onCompleted, onError, errors) {
    if (errors.length) {
        onError(errors);
    } else {
        onCompleted();
    }
};

},{}],30:[function(require,module,exports){
/**
 * will onNext the observer with the seeds provided.
 * @param {Model} model
 * @param {Function} onNext
 * @param {Array.<Object>} seeds
 * @param {Function} [selector]
 */
module.exports = function onNextValues(model, onNext, seeds, selector) {
    var root = model._root;

    root.allowSync++;
    try {
        if (selector) {
            if (seeds.length) {
                // they should be wrapped in json items
                onNext(selector.apply(model, seeds.map(function(x, i) {
                    return x.json;
                })));
            } else {
                onNext(selector.call(model));
            }
        } else {
            // this means there is an onNext function that is not AsValues or progressive,
            // therefore there must only be one onNext call, which should only be the 0
            // index of the values of the array
            onNext(seeds[0]);
        }
    } catch(e) {
        
    } finally {
        root.allowSync--;
    }
};

},{}],31:[function(require,module,exports){
var buildJSONGOperation = require('./buildJSONGOperation');

/**
 * It performs the opposite of combine operations.  It will take a JSONG
 * response and partition them into the required amount of operations.
 * @param {{jsong: {}, paths:[]}} jsongResponse
 */
module.exports = partitionOperations;

function partitionOperations(
        jsongResponse, seeds, format, onNext) {

    var partitionedOps = [];
    var requestedMissingPaths = jsongResponse.paths;

    if (format === 'AsJSON') {
        // fast collapse ass the requestedMissingPaths into their
        // respective groups
        var opsFromRequestedMissingPaths = [];
        var op = null;
        for (var i = 0, len = requestedMissingPaths.length; i < len; i++) {
            var missingPath = requestedMissingPaths[i];
            if (!op || op.idx !== missingPath.pathSetIndex) {
                op = {
                    idx: missingPath.pathSetIndex,
                    paths: []
                };
                opsFromRequestedMissingPaths.push(op);
            }
            op.paths.push(missingPath);
        }
        opsFromRequestedMissingPaths.forEach(function(op, i) {
            var seed = [seeds[op.idx]];
            var jsong = {
                jsong: jsongResponse.jsong,
                paths: op.paths
            };
            partitionedOps.push(buildJSONGOperation(
                format,
                seed,
                jsong,
                op.idx,
                onNext));
        });
    } else {
        partitionedOps[0] = buildJSONGOperation(format, seeds, jsongResponse, 0, onNext);
    }
    return partitionedOps;
}


},{"./buildJSONGOperation":22}],32:[function(require,module,exports){
module.exports = function primeSeeds(selector, selectorLength) {
    var seeds = [];
    if (selector) {
        for (i = 0; i < selectorLength; i++) {
            seeds.push({});
        }
    } else {
        seeds[0] = {};
    }
    return seeds;
};

},{}],33:[function(require,module,exports){
module.exports = function processOperations(model, operations, errorSelector, boundPath) {
    return operations.reduce(function(memo, operation) {

        var jsonGraphOperation = model[operation.methodName];
        var seedsOrFunction = operation.isValues ?
            operation.onNext : operation.seeds;
        var results = jsonGraphOperation(
            model,
            operation.args,
            seedsOrFunction,
            operation.onNext,
            errorSelector,
            boundPath);
        var missing = results.requestedMissingPaths;
        var offset = operation.seedsOffset;

        for (var i = 0, len = missing.length; i < len; i++) {
            missing[i].boundPath = boundPath;
            missing[i].pathSetIndex += offset;
        }

        memo.requestedMissingPaths = memo.requestedMissingPaths.concat(missing);
        memo.optimizedMissingPaths = memo.optimizedMissingPaths.concat(results.optimizedMissingPaths);
        memo.errors = memo.errors.concat(results.errors);
        memo.valuesReceived = memo.valuesReceived || results.requestedPaths.length > 0;

        return memo;
    }, {
        errors: [],
        requestedMissingPaths: [],
        optimizedMissingPaths: [],
        valuesReceived: false
    });
}

},{}],34:[function(require,module,exports){
module.exports = function isSeedRequired(format) {
    return format === 'AsJSON' || format === 'AsJSONG' || format === 'AsPathMap';
};

},{}],35:[function(require,module,exports){
module.exports = function setSeedsOnGroups(groups, seeds, hasSelector) {
    var valueIndex = 0;
    var seedsLength = seeds.length;
    var j, i, len = groups.length, gLen, group;
    if (hasSelector) {
        for (i = 0; i < len && valueIndex < seedsLength; i++) {
            group = groups[i];
            gLen = gLen = group.args.length;
            for (j = 0; j < gLen && valueIndex < seedsLength; j++, valueIndex++) {
                group.seeds.push(seeds[valueIndex]);
            }
        }
    } else {
        for (i = 0; i < len && valueIndex < seedsLength; i++) {
            groups[i].seeds = seeds;
        }
    }
}

},{}],36:[function(require,module,exports){
var setSeedsOnGroups = require('./setSeedsOnGroups');
module.exports = function setSeedsOrOnNext(operations, seedRequired, seeds, onNext, selector) {
    if (seedRequired) {
        setSeedsOnGroups(operations, seeds, selector);
    } else {
        for (i = 0; i < operations.length; i++) {
            operations[i].onNext = onNext;
        }
    }
};

},{"./setSeedsOnGroups":35}],37:[function(require,module,exports){
var falcor = require('./../Falcor');
var NOOP = falcor.NOOP;
var RequestQueue = function(jsongModel, scheduler) {
    this._scheduler = scheduler;
    this._jsongModel = jsongModel;

    this._scheduled = false;
    this._requests = [];
};

RequestQueue.prototype = {
    _get: function() {
        var i = -1;
        var requests = this._requests;
        while (++i < requests.length) {
            if (!requests[i].pending && requests[i].isGet) {
                return requests[i];
            }
        }
        return requests[requests.length] = new GetRequest(this._jsongModel, this);
    },
    _set: function() {
        var i = -1;
        var requests = this._requests;

        // TODO: Set always sends off a request immediately, so there is no batching.
        while (++i < requests.length) {
            if (!requests[i].pending && requests[i].isSet) {
                return requests[i];
            }
        }
        return requests[requests.length] = new SetRequest(this._jsongModel, this);
    },

    remove: function(request) {
        for (var i = this._requests.length - 1; i > -1; i--) {
            if (this._requests[i].id === request.id && this._requests.splice(i, 1)) {
                break;
            }
        }
    },

    set: function(jsongEnv, observer) {
        var self = this;
        var disposable = self._set().batch(jsongEnv, observer).flush();

        return {
            dispose: function() {
                disposable.dispose();
            }
        };
    },

    get: function(requestedPaths, optimizedPaths, observer) {
        var self = this;
        var disposable = null;

        // TODO: get does not batch across requests.
        self._get().batch(requestedPaths, optimizedPaths, observer);

        if (!self._scheduled) {
            self._scheduled = true;
            disposable = self._scheduler.schedule(self._flush.bind(self));
        }

        return {
            dispose: function() {
                disposable.dispose();
            }
        };
    },

    _flush: function() {
        this._scheduled = false;

        var requests = this._requests, i = -1;
        var disposables = [];
        while (++i < requests.length) {
            if (!requests[i].pending) {
                disposables[disposables.length] = requests[i].flush();
            }
        }

        return {
            dispose: function() {
                disposables.forEach(function(d) { d.dispose(); });
            }
        };
    }
};

var REQUEST_ID = 0;

var SetRequest = function(model, queue) {
    var self = this;
    self._jsongModel = model;
    self._queue = queue;
    self.observers = [];
    self.jsongEnvs = [];
    self.pending = false;
    self.id = ++REQUEST_ID;
    self.isSet = true;
};

SetRequest.prototype = {
    batch: function(jsongEnv, observer) {
        var self = this;
        observer.onNext = observer.onNext || NOOP;
        observer.onError = observer.onError || NOOP;
        observer.onCompleted = observer.onCompleted || NOOP;

        if (!observer.__observerId) {
            observer.__observerId = ++REQUEST_ID;
        }
        observer._requestId = self.id;

        self.observers[self.observers.length] = observer;
        self.jsongEnvs[self.jsongEnvs.length] = jsongEnv;

        return self;
    },
    flush: function() {
        var incomingValues, query, op, len;
        var self = this;
        var jsongs = self.jsongEnvs;
        var observers = self.observers;
        var model = self._jsongModel;
        self.pending = true;

        // TODO: Set does not batch.
        return model._dataSource.
            set(jsongs[0]).
            subscribe(function(response) {
                incomingValues = response;
            }, function(err) {
                var i = -1;
                var n = observers.length;
                while (++i < n) {
                    obs = observers[i];
                    obs.onError && obs.onError(err);
                }
            }, function() {
                var i, n, obs;
                self._queue.remove(self);
                i = -1;
                n = observers.length;
                while (++i < n) {
                    obs = observers[i];
                    obs.onNext && obs.onNext({
                        jsong: incomingValues.jsong || incomingValues.value,
                        paths: incomingValues.paths
                    });
                    obs.onCompleted && obs.onCompleted();
                }
            });
    }
};



var GetRequest = function(jsongModel, queue) {
    var self = this;
    self._jsongModel = jsongModel;
    self._queue = queue;
    self.observers = [];
    self.optimizedPaths = [];
    self.requestedPaths = [];
    self.pending = false;
    self.id = ++REQUEST_ID;
    self.isGet = true;
};

GetRequest.prototype = {

    batch: function(requestedPaths, optimizedPaths, observer) {
        // TODO: Do we need to gap fill?
        var self = this;
        observer.onNext = observer.onNext || NOOP;
        observer.onError = observer.onError || NOOP;
        observer.onCompleted = observer.onCompleted || NOOP;

        if (!observer.__observerId) {
            observer.__observerId = ++REQUEST_ID;
        }
        observer._requestId = self.id;

        self.observers[self.observers.length] = observer;
        self.optimizedPaths[self.optimizedPaths.length] = optimizedPaths;
        self.requestedPaths[self.requestedPaths.length] = requestedPaths;

        return self;
    },

    flush: function() {
        var incomingValues, query, op, len;
        var self = this;
        var requested = self.requestedPaths;
        var optimized = self.optimizedPaths;
        var observers = self.observers;
        var disposables = [];
        var results = [];
        var model = self._jsongModel;
        self._scheduled = false;
        self.pending = true;

        var optimizedMaps = {};
        var requestedMaps = {};
        var r, o, i, j, obs, resultIndex;
        for (i = 0, len = requested.length; i < len; i++) {
            r = requested[i];
            o = optimized[i];
            obs = observers[i];
            for (j = 0; j < r.length; j++) {
                pathsToMapWithObservers(r[j], 0, readyNode(requestedMaps, null, obs), obs);
                pathsToMapWithObservers(o[j], 0, readyNode(optimizedMaps, null, obs), obs);
            }
        }
        return model._dataSource.
            get(collapse(optimizedMaps)).
            subscribe(function(response) {
                incomingValues = response;
            }, function(err) {
                var i = -1;
                var n = observers.length;
                while (++i < n) {
                    obs = observers[i];
                    obs.onError && obs.onError(err);
                }
            }, function() {
                var i, n, obs;
                self._queue.remove(self);
                i = -1;
                n = observers.length;
                while (++i < n) {
                    obs = observers[i];
                    obs.onNext && obs.onNext({
                        jsong: incomingValues.jsong || incomingValues.value,
                        paths: incomingValues.paths
                    });
                    obs.onCompleted && obs.onCompleted();
                }
            });
    },
    // Returns the paths that are contained within this request.
    contains: function(requestedPaths, optimizedPaths) {
        // TODO:
    }
};

function pathsToMapWithObservers(path, idx, branch, observer) {
    var curr = path[idx];

    // Object / Array
    if (typeof curr === 'object') {
        if (Array.isArray(curr)) {
            curr.forEach(function(v) {
                readyNode(branch, v, observer);
                if (path.length > idx + 1) {
                    pathsToMapWithObservers(path, idx + 1, branch[v], observer);
                }
            });
        } else {
            var from = curr.from || 0;
            var to = curr.to >= 0 ? curr.to : curr.length;
            for (var i = from; i <= to; i++) {
                readyNode(branch, i, observer);
                if (path.length > idx + 1) {
                    pathsToMapWithObservers(path, idx + 1, branch[i], observer);
                }
            }
        }
    } else {
        readyNode(branch, curr, observer);
        if (path.length > idx + 1) {
            pathsToMapWithObservers(path, idx + 1, branch[curr], observer);
        }
    }
}

/**
 * Builds the set of collapsed
 * queries by traversing the tree
 * once
 */
var charPattern = /\D/i;

function readyNode(branch, key, observer) {
    if (key === null) {
        branch.__observers = branch.__observers || [];
        !containsObserver(branch.__observers, observer) && branch.__observers.push(observer);
        return branch;
    }

    if (!branch[key]) {
        branch[key] = {__observers: []};
    }

    !containsObserver(branch[key].__observers, observer) && branch[key].__observers.push(observer);
    return branch;
}

function containsObserver(observers, observer) {
    if (!observer) {
        return;
    }
    return observers.reduce(function(acc, x) {
        return acc || x.__observerId === observer.__observerId;
    }, false);
}

function collapse(pathMap) {
    return rangeCollapse(buildQueries(pathMap));
}

/**
 * Collapse ranges, e.g. when there is a continuous range
 * in an array, turn it into an object instead
 *
 * [1,2,3,4,5,6] => {"from":1, "to":6}
 *
 */
function rangeCollapse(paths) {
    paths.forEach(function (path) {
        path.forEach(function (elt, index) {
            var range;
            if (Array.isArray(elt) && elt.every(isNumber) && allUnique(elt)) {
                elt.sort(function(a, b) {
                    return a - b;
                });
                if (elt[elt.length-1] - elt[0] === elt.length-1) {
                    // create range
                    range = {};
                    range.from = elt[0];
                    range.to = elt[elt.length-1];
                    path[index] = range;
                }
            }
        });
    });
    return paths;
}

/* jshint forin: false */
function buildQueries(root) {

    if (root == null || typeof root !== 'object') {
        return [ [] ];
    }

    var children = Object.keys(root).filter(notPathMapInternalKeys),
        child, memo, paths, key, childIsNum,
        list, head, tail, clone, results,
        i = -1, n = children.length,
        j, k, x;

    if (n === 0 || Array.isArray(root) === true) {
        return [ [] ];
    }

    memo = {};
    while(++i < n) {
        child = children[i];
        paths = buildQueries(root[child]);
        key = createKey(paths);

        childIsNum = typeof child === 'string' && !charPattern.test(child);

        if ((list = memo[key]) && (head = list.head)) {
            head[head.length] = childIsNum ? parseInt(child, 10) : child;
        } else {
            memo[key] = {
                head: [childIsNum ? parseInt(child, 10) : child],
                tail: paths
            };
        }
    }

    results = [];
    for(x in memo) {
        head = (list = memo[x]).head;
        tail = list.tail;
        i = -1;
        n = tail.length;
        while(++i < n) {
            list = tail[i];
            j = -1;
            k = list.length;
            if(head[0] === '') {
                clone = [];
            } else {
                clone = [head.length === 1 ? head[0] : head];
                while(++j < k) {
                    clone[j + 1] = list[j];
                }
            }
            results[results.length] = clone;
        }
    }
    return results;
}

function notPathMapInternalKeys(key) {
    return (
        key !== "__observers" &&
        key !== "__pending" &&
        key !== "__batchID"
        );
}

/**
 * Return true if argument is a number
 */
function isNumber(val) {
    return typeof val === "number";
}

/**
 * allUnique
 * return true if every number in an array is unique
 */
function allUnique(arr) {
    var hash = {},
        index,
        len;

    for (index = 0, len = arr.length; index < len; index++) {
        if (hash[arr[index]]) {
            return false;
        }
        hash[arr[index]] = true;
    }
    return true;
}

/**
 * Sort a list-of-lists
 * Used for generating a unique hash
 * key for each subtree; used by the
 * memoization
 */
function sortLol(lol) {
    return lol.reduce(function (result, curr) {
        if (curr instanceof Array) {
            result.push(sortLol(curr).slice(0).sort());
            return result;
        }
        return result.concat(curr);
    }, []).slice(0).sort();
}

/**
 * Create a unique hash key for a set
 * of paths
 */
function createKey(list) {
    return JSON.stringify(sortLol(list));
}
// Note: For testing
falcor.__Internals.buildQueries = buildQueries;

module.exports = RequestQueue;

},{"./../Falcor":3}],38:[function(require,module,exports){
function ImmediateScheduler() {
}

ImmediateScheduler.prototype = {
    schedule: function(action) {
        action();
    }
};

module.exports = ImmediateScheduler;

},{}],39:[function(require,module,exports){
function TimeoutScheduler(delay) {
    this.delay = delay;
}

TimeoutScheduler.prototype = {
    schedule: function(action) {
        setTimeout(action, this.delay);
    }
};

module.exports = TimeoutScheduler;

},{}],40:[function(require,module,exports){
var hardLink = require('./util/hardlink');
var createHardlink = hardLink.create;
var onValue = require('./onValue');
var isExpired = require('./util/isExpired');
var $path = require('./../types/path.js');
var __context = require("../internal/context");

function followReference(model, root, node, referenceContainer, reference, seed, outputFormat) {

    var depth = 0;
    var k, next;

    while (true) {
        if (depth === 0 && referenceContainer[__context]) {
            depth = reference.length;
            next = referenceContainer[__context];
        } else {
            k = reference[depth++];
            next = node[k];
        }
        if (next) {
            var type = next.$type;
            var value = type && next.value || next;

            if (depth < reference.length) {
                if (type) {
                    node = next;
                    break;
                }

                node = next;
                continue;
            }

            // We need to report a value or follow another reference.
            else {

                node = next;

                if (type && isExpired(next)) {
                    break;
                }

                if (!referenceContainer[__context]) {
                    createHardlink(referenceContainer, next);
                }

                // Restart the reference follower.
                if (type === $path) {
                    if (outputFormat === 'JSONG') {
                        onValue(model, next, seed, null, null, reference, null, outputFormat);
                    }

                    depth = 0;
                    reference = value;
                    referenceContainer = next;
                    node = root;
                    continue;
                }

                break;
            }
        } else {
            node = undefined;
        }
        break;
    }


    if (depth < reference.length && node !== undefined) {
        var ref = [];
        for (var i = 0; i < depth; i++) {
            ref[i] = reference[i];
        }
        reference = ref;
    }

    return [node, reference];
}

module.exports = followReference;

},{"../internal/context":62,"./../types/path.js":136,"./onValue":52,"./util/hardlink":54,"./util/isExpired":55}],41:[function(require,module,exports){
var getBoundValue = require('./getBoundValue');
var isPathValue = require('./util/isPathValue');
module.exports = function(walk) {
    return function getAsJSON(model, paths, values) {
        var results = {
            values: [],
            errors: [],
            requestedPaths: [],
            optimizedPaths: [],
            requestedMissingPaths: [],
            optimizedMissingPaths: []
        };
        var requestedMissingPaths = results.requestedMissingPaths;
        var inputFormat = Array.isArray(paths[0]) || isPathValue(paths[0]) ?
            'Paths' : 'JSON';
        var cache = model._cache;
        var boundPath = model._path;
        var currentCachePosition;
        var missingIdx = 0;
        var boundOptimizedPath, optimizedPath;
        var i, j, len, bLen;

        results.values = values;
        if (!values) {
            values = [];
        }
        if (boundPath.length) {
            var boundValue = getBoundValue(model, boundPath);
            currentCachePosition = boundValue.value;
            optimizedPath = boundOptimizedPath = boundValue.path;
        } else {
            currentCachePosition = cache;
            optimizedPath = boundOptimizedPath = [];
        }

        for (i = 0, len = paths.length; i < len; i++) {
            var valueNode = undefined;
            var pathSet = paths[i];
            if (values[i]) {
                valueNode = values[i];
            }
            if (len > 1) {
                optimizedPath = [];
                for (j = 0, bLen = boundOptimizedPath.length; j < bLen; j++) {
                    optimizedPath[j] = boundOptimizedPath[j];
                }
            }
            if (pathSet.path) {
                pathSet = pathSet.path;
            }

            walk(model, cache, currentCachePosition, pathSet, 0, valueNode, [], results, optimizedPath, [], inputFormat, 'JSON');
            if (missingIdx < requestedMissingPaths.length) {
                for (j = missingIdx, length = requestedMissingPaths.length; j < length; j++) {
                    requestedMissingPaths[j].pathSetIndex = i;
                }
                missingIdx = length;
            }
        }

        return results;
    };
};


},{"./getBoundValue":45,"./util/isPathValue":57}],42:[function(require,module,exports){
var getBoundValue = require('./getBoundValue');
var isPathValue = require('./util/isPathValue');
module.exports = function(walk) {
    return function getAsJSONG(model, paths, values) {
        var results = {
            values: [],
            errors: [],
            requestedPaths: [],
            optimizedPaths: [],
            requestedMissingPaths: [],
            optimizedMissingPaths: []
        };
        var inputFormat = Array.isArray(paths[0]) || isPathValue(paths[0]) ?
            'Paths' : 'JSON';
        results.values = values;
        var cache = model._cache;
        var boundPath = model._path;
        var currentCachePosition;
        if (boundPath.length) {
            throw 'It is not legal to use the JSON Graph format from a bound Model. JSON Graph format can only be used from a root model.';
        } else {
            currentCachePosition = cache;
        }

        for (var i = 0, len = paths.length; i < len; i++) {
            var pathSet = paths[i];
            if (pathSet.path) {
                pathSet = pathSet.path;
            }
            walk(model, cache, currentCachePosition, pathSet, 0, values[0], [], results, [], [], inputFormat, 'JSONG');
        }
        return results;
    };
};


},{"./getBoundValue":45,"./util/isPathValue":57}],43:[function(require,module,exports){
var getBoundValue = require('./getBoundValue');
var isPathValue = require('./util/isPathValue');
module.exports = function(walk) {
    return function getAsPathMap(model, paths, values) {
        var valueNode;
        var results = {
            values: [],
            errors: [],
            requestedPaths: [],
            optimizedPaths: [],
            requestedMissingPaths: [],
            optimizedMissingPaths: []
        };
        var inputFormat = Array.isArray(paths[0]) || isPathValue(paths[0]) ?
            'Paths' : 'JSON';
        valueNode = values[0];
        results.values = values;

        var cache = model._cache;
        var boundPath = model._path;
        var currentCachePosition;
        var optimizedPath, boundOptimizedPath;
        if (boundPath.length) {
            var boundValue = getBoundValue(model, boundPath);
            currentCachePosition = boundValue.value;
            optimizedPath = boundOptimizedPath = boundValue.path;
        } else {
            currentCachePosition = cache;
            optimizedPath = boundOptimizedPath = [];
        }

        for (var i = 0, len = paths.length; i < len; i++) {
            if (len > 1) {
                optimizedPath = [];
                for (j = 0, bLen = boundOptimizedPath.length; j < bLen; j++) {
                    optimizedPath[j] = boundOptimizedPath[j];
                }
            }
            var pathSet = paths[i];
            if (pathSet.path) {
                pathSet = pathSet.path;
            }
            walk(model, cache, currentCachePosition, pathSet, 0, valueNode, [], results, optimizedPath, [], inputFormat, 'PathMap');
        }
        return results;
    };
};

},{"./getBoundValue":45,"./util/isPathValue":57}],44:[function(require,module,exports){
var getBoundValue = require('./getBoundValue');
var isPathValue = require('./util/isPathValue');
module.exports = function(walk) {
    return function getAsValues(model, paths, onNext) {
        var results = {
            values: [],
            errors: [],
            requestedPaths: [],
            optimizedPaths: [],
            requestedMissingPaths: [],
            optimizedMissingPaths: []
        };
        var inputFormat = Array.isArray(paths[0]) || isPathValue(paths[0]) ?
            'Paths' : 'JSON';
        var cache = model._cache;
        var boundPath = model._path;
        var currentCachePosition;
        var optimizedPath, boundOptimizedPath;
        if (boundPath.length) {
            var boundValue = getBoundValue(model, boundPath);
            currentCachePosition = boundValue.value;
            optimizedPath = boundOptimizedPath = boundValue.path;
        } else {
            currentCachePosition = cache;
            optimizedPath = boundOptimizedPath = [];
        }

        for (var i = 0, len = paths.length; i < len; i++) {
            if (len > 1) {
                optimizedPath = [];
                for (j = 0, bLen = boundOptimizedPath.length; j < bLen; j++) {
                    optimizedPath[j] = boundOptimizedPath[j];
                }
            }
            var pathSet = paths[i];
            if (pathSet.path) {
                pathSet = pathSet.path;
            }
            walk(model, cache, currentCachePosition, pathSet, 0, onNext, null, results, optimizedPath, [], inputFormat, 'Values');
        }
        return results;
    };
};


},{"./getBoundValue":45,"./util/isPathValue":57}],45:[function(require,module,exports){
var getValueSync = require('./getValueSync');
module.exports = function getBoundValue(model, path) {
    var boxed, value, shorted;

    boxed = model._boxed;
    model._boxed = true;
    value = getValueSync(model, path.concat(null));
    model._boxed = boxed;
    path = value.optimizedPath;
    shorted = value.shorted;
    value = value.value;
    while (path.length && path[path.length - 1] === null) {
        path.pop();
    }

    return {
        path: path,
        value: value,
        shorted: shorted
    };
};


},{"./getValueSync":46}],46:[function(require,module,exports){
var followReference = require('./followReference');
var clone = require('./util/clone');
var isExpired = require('./util/isExpired');
var promote = require('./util/lru').promote;
var $path = require('./../types/path.js');
var $sentinel = require('./../types/sentinel.js');
var $error = require('./../types/error.js');

module.exports = function getValueSync(model, simplePath) {
    var root = model._cache;
    var len = simplePath.length;
    var optimizedPath = [];
    var shorted = false, shouldShort = false;
    var depth = 0;
    var key, i, next = root, type, curr = root, out, ref, refNode;
    do {
        key = simplePath[depth++];
        if (key !== null) {
            next = curr[key];
            optimizedPath.push(key);
        }

        if (!next) {
            out = undefined;
            shorted = true;
            break;
        }

        type = next.$type;

        // Up to the last key we follow references
        if (depth < len) {
            if (type === $path) {
                ref = followReference(model, root, root, next, next.value);
                refNode = ref[0];

                if (!refNode) {
                    out = undefined;
                    break;
                }
                type = refNode.$type;
                next = refNode;
                optimizedPath = ref[1];
            }

            if (type) {
                break;
            }
        }
        // If there is a value, then we have great success, else, report an undefined.
        else {
            out = next;
        }
        curr = next;

    } while (next && depth < len);

    if (depth < len) {
        // Unfortunately, if all that follows are nulls, then we have not shorted.
        for (i = depth; i < len; ++i) {
            if (simplePath[depth] !== null) {
                shouldShort = true;
                break;
            }
        }
        // if we should short or report value.  Values are reported on nulls.
        if (shouldShort) {
            shorted = true;
            out = undefined;
        } else {
            out = next;
        }

        for (i = depth; i < len; ++i) {
            optimizedPath[optimizedPath.length] = simplePath[i];
        }
    }

    // promotes if not expired
    if (out) {
        if (isExpired(out)) {
            out = undefined;
        } else {
            promote(model, out);
        }
    }

    if (out && out.$type === $error && !model._treatErrorsAsValues) {
        throw {path: simplePath, value: out.value};
    } else if (out && model._boxed) {
        out = !!type ? clone(out) : out;
    } else if (!out && model._materialized) {
        out = {$type: $sentinel};
    } else if (out) {
        out = out.value;
    }

    return {
        value: out,
        shorted: shorted,
        optimizedPath: optimizedPath
    };
};

},{"./../types/error.js":135,"./../types/path.js":136,"./../types/sentinel.js":137,"./followReference":40,"./util/clone":53,"./util/isExpired":55,"./util/lru":58}],47:[function(require,module,exports){
var followReference = require('./followReference');
var onError = require('./onError');
var onMissing = require('./onMissing');
var onValue = require('./onValue');
var lru = require('./util/lru');
var hardLink = require('./util/hardlink');
var isMaterialized = require('./util/isMaterialzed');
var removeHardlink = hardLink.remove;
var splice = lru.splice;
var isExpired = require('./util/isExpired');
var permuteKey = require('./util/permuteKey');
var $path = require('./../types/path');
var $error = require('./../types/error');
var __invalidated = require("../internal/invalidated");

function walk(model, root, curr, pathOrJSON, depth, seedOrFunction, positionalInfo, outerResults, optimizedPath, requestedPath, inputFormat, outputFormat, fromReference) {
    if ((!curr || curr && curr.$type) &&
        evaluateNode(model, curr, pathOrJSON, depth, seedOrFunction, requestedPath, optimizedPath, positionalInfo, outerResults, outputFormat, fromReference)) {
        return;
    }

    // We continue the search to the end of the path/json structure.
    else {

        // Base case of the searching:  Have we hit the end of the road?
        // Paths
        // 1) depth === path.length
        // PathMaps (json input)
        // 2) if its an object with no keys
        // 3) its a non-object
        var jsonQuery = inputFormat === 'JSON';
        var atEndOfJSONQuery = false;
        var k, i, len;
        if (jsonQuery) {
            // it has a $type property means we have hit a end.
            if (pathOrJSON && pathOrJSON.$type) {
                atEndOfJSONQuery = true;
            }

            // is it an object?
            else if (pathOrJSON && typeof pathOrJSON === 'object') {
                // A terminating condition
                k = Object.keys(pathOrJSON);
                if (k.length === 1) {
                    k = k[0];
                }
            }

            // found a primitive, we hit the end.
            else {
                atEndOfJSONQuery = true;
            }
        } else {
            k = pathOrJSON[depth];
        }

        // BaseCase: we have hit the end of our query without finding a 'leaf' node, therefore emit missing.
        if (atEndOfJSONQuery || !jsonQuery && depth === pathOrJSON.length) {
            if (isMaterialized(model)) {
                onValue(model, curr, seedOrFunction, outerResults, requestedPath, optimizedPath, positionalInfo, outputFormat, fromReference);
                return;
            }
            onMissing(model, curr, pathOrJSON, depth, seedOrFunction, outerResults, requestedPath, optimizedPath, positionalInfo, outputFormat);
            return;
        }

        var memo = {done: false};
        var permutePosition = positionalInfo;
        var permuteRequested = requestedPath;
        var permuteOptimized = optimizedPath;
        var asJSONG = outputFormat === 'JSONG';
        var asJSON = outputFormat === 'JSON';
        var isKeySet = false;
        var hasChildren = false;
        depth++;

        var key;
        if (k && typeof k === 'object') {
            memo.isArray = Array.isArray(k);
            memo.arrOffset = 0;

            key = permuteKey(k, memo);
            isKeySet = true;

            // The complex key provided is actual empty
            if (memo.done) {
                return;
            }
        } else {
            key = k;
            memo.done = true;
        }

        if (asJSON && isKeySet) {
            permutePosition = [];
            for (i = 0, len = positionalInfo.length; i < len; i++) {
                permutePosition[i] = positionalInfo[i];
            }
            permutePosition.push(depth - 1);
        }

        do {
            fromReference = false;
            if (!memo.done) {
                permuteOptimized = [];
                permuteRequested = [];
                for (i = 0, len = requestedPath.length; i < len; i++) {
                    permuteRequested[i] = requestedPath[i];
                }
                for (i = 0, len = optimizedPath.length; i < len; i++) {
                    permuteOptimized[i] = optimizedPath[i];
                }
            }

            var nextPathOrPathMap = jsonQuery ? pathOrJSON[key] : pathOrJSON;
            if (jsonQuery && nextPathOrPathMap) {
                if (typeof nextPathOrPathMap === 'object') {
                    if (nextPathOrPathMap.$type) {
                        hasChildren = false;
                    } else {
                        hasChildren = Object.keys(nextPathOrPathMap).length > 0;
                    }
                }
            }

            var next;
            if (key === null || jsonQuery && key === '__null') {
                next = curr;
            } else {
                next = curr[key];
                permuteOptimized.push(key);
                permuteRequested.push(key);
            }

            if (next) {
                var nType = next.$type;
                var value = nType && next.value || next;

                if (jsonQuery && hasChildren || !jsonQuery && depth < pathOrJSON.length) {

                    if (nType && nType === $path && !isExpired(next)) {
                        if (asJSONG) {
                            onValue(model, next, seedOrFunction, outerResults, false, permuteOptimized, permutePosition, outputFormat);
                        }
                        var ref = followReference(model, root, root, next, value, seedOrFunction, outputFormat);
                        fromReference = true;
                        next = ref[0];
                        var refPath = ref[1];

                        permuteOptimized = [];
                        for (i = 0, len = refPath.length; i < len; i++) {
                            permuteOptimized[i] = refPath[i];
                        }
                    }
                }
            }
            walk(model, root, next, nextPathOrPathMap, depth, seedOrFunction, permutePosition, outerResults, permuteOptimized, permuteRequested, inputFormat, outputFormat, fromReference);

            if (!memo.done) {
                key = permuteKey(k, memo);
            }

        } while (!memo.done);
    }
}

function evaluateNode(model, curr, pathOrJSON, depth, seedOrFunction, requestedPath, optimizedPath, positionalInfo, outerResults, outputFormat, fromReference) {
    // BaseCase: This position does not exist, emit missing.
    if (!curr) {
        if (isMaterialized(model)) {
            onValue(model, curr, seedOrFunction, outerResults, requestedPath, optimizedPath, positionalInfo, outputFormat, fromReference);
        } else {
            onMissing(model, curr, pathOrJSON, depth, seedOrFunction, outerResults, requestedPath, optimizedPath, positionalInfo, outputFormat);
        }
        return true;
    }

    var currType = curr.$type;

    positionalInfo = positionalInfo || [];

    // The Base Cases.  There is a type, therefore we have hit a 'leaf' node.
    if (currType === $error) {
        if (fromReference) {
            requestedPath.push(null);
        }
        if (outputFormat === 'JSONG' || model._treatErrorsAsValues) {
            onValue(model, curr, seedOrFunction, outerResults, requestedPath, optimizedPath, positionalInfo, outputFormat, fromReference);
        } else {
            onError(model, curr, requestedPath, optimizedPath, outerResults);
        }
    }

    // Else we have found a value, emit the current position information.
    else {
        if (isExpired(curr)) {
            if (!curr[__invalidated]) {
                splice(model, curr);
                removeHardlink(curr);
            }
            onMissing(model, curr, pathOrJSON, depth, seedOrFunction, outerResults, requestedPath, optimizedPath, positionalInfo, outputFormat);
        } else {
            onValue(model, curr, seedOrFunction, outerResults, requestedPath, optimizedPath, positionalInfo, outputFormat, fromReference);
        }
    }

    return true;
}

module.exports = walk;

},{"../internal/invalidated":65,"./../types/error":135,"./../types/path":136,"./followReference":40,"./onError":50,"./onMissing":51,"./onValue":52,"./util/hardlink":54,"./util/isExpired":55,"./util/isMaterialzed":56,"./util/lru":58,"./util/permuteKey":59}],48:[function(require,module,exports){
var walk = require('./getWalk');
module.exports = {
    getAsJSON: require('./getAsJSON')(walk),
    getAsJSONG: require('./getAsJSONG')(walk),
    getAsValues: require('./getAsValues')(walk),
    getAsPathMap: require('./getAsPathMap')(walk),
    getValueSync: require('./getValueSync'),
    getBoundValue: require('./getBoundValue'),
    setCache: require('./legacy_setCache')
};


},{"./getAsJSON":41,"./getAsJSONG":42,"./getAsPathMap":43,"./getAsValues":44,"./getBoundValue":45,"./getValueSync":46,"./getWalk":47,"./legacy_setCache":49}],49:[function(require,module,exports){
/* istanbul ignore next */
var NOOP = function NOOP() {},
    __GENERATION_GUID = 0,
    __GENERATION_VERSION = 0,
    __CONTAINER = "__reference_container",
    __CONTEXT = "__context",
    __GENERATION = "__generation",
    __GENERATION_UPDATED = "__generation_updated",
    __INVALIDATED = "__invalidated",
    __KEY = "__key",
    __KEYS = "__keys",
    __IS_KEY_SET = "__is_key_set",
    __NULL = "__null",
    __SELF = "./",
    __PARENT = "../",
    __REF = "__ref",
    __REF_INDEX = "__ref_index",
    __REFS_LENGTH = "__refs_length",
    __ROOT = "/",
    __OFFSET = "__offset",
    __FALKOR_EMPTY_OBJECT = '__FALKOR_EMPTY_OBJECT',
    __INTERNAL_KEYS = [
        __CONTAINER, __CONTEXT, __GENERATION, __GENERATION_UPDATED,
        __INVALIDATED, __KEY, __KEYS, __IS_KEY_SET, __NULL, __SELF,
        __PARENT, __REF, __REF_INDEX, __REFS_LENGTH, __OFFSET, __ROOT
    ],

    $TYPE = "$type",
    $SIZE = "$size",
    $EXPIRES = "$expires",
    $TIMESTAMP = "$timestamp",

    SENTINEL = "sentinel",
    PATH = "ref",
    ERROR = "error",
    VALUE = "value",
    EXPIRED = "expired",
    LEAF = "leaf";

/* istanbul ignore next */
module.exports = function setCache(model, map) {
    var root = model._root, expired = root.expired, depth = 0, height = 0, mapStack = [], nodes = [], nodeRoot = model._cache, nodeParent = nodeRoot, node = nodeParent, nodeType, nodeValue, nodeSize, nodeTimestamp, nodeExpires;
    mapStack[0] = map;
    nodes[-1] = nodeParent;
    while (depth > -1) {
        /* Walk Path Map */
        var isTerminus = false, offset = 0, keys = void 0, index = void 0, key = void 0, isKeySet = false;
        node = nodeParent = nodes[depth - 1];
        depth = depth;
        follow_path_map_9177:
            do {
                height = depth;
                nodeType = node && node[$TYPE] || void 0;
                nodeValue = nodeType === SENTINEL ? node[VALUE] : node;
                if ((isTerminus = !((map = mapStack[offset = depth * 4]) != null && typeof map === 'object') || map[$TYPE] !== void 0 || Array.isArray(map) || !((keys = mapStack[offset + 1] || (mapStack[offset + 1] = Object.keys(map))) && ((index = mapStack[offset + 2] || (mapStack[offset + 2] = 0)) || true) && ((isKeySet = keys.length > 1) || keys.length > 0))) || (node == null || nodeType !== void 0 || typeof node !== 'object' || Array.isArray(nodeValue))) {
                    if ((nodeExpires = (node && node[$EXPIRES]) != null) && (nodeExpires !== 1 && (nodeExpires === 0 || nodeExpires < now())) || node != null && node[__INVALIDATED] === true) {
                        nodeType = void 0;
                        nodeValue = void 0;
                        node = (expired[expired.length] = node) && (node[__INVALIDATED] = true) && void 0;
                    }
                    if (!isTerminus && ((!nodeType || nodeType === SENTINEL) && Array.isArray(nodeValue))) {
                        if (node == null || nodeType !== void 0 || typeof node !== 'object' || Array.isArray(nodeValue)) {
                            key = null;
                            node = node;
                            depth = depth;
                            continue follow_path_map_9177;
                        }
                    } else {
                        if (key != null) {
                            var newNode, sizeOffset, edgeSize = node && node[$SIZE] || 0;
                            nodeType = map && map[$TYPE] || void 0;
                            nV2 = nodeType ? map[VALUE] : void 0;
                            nodeValue = nodeType === SENTINEL ? map[VALUE] : map;
                            newNode = map;
                            if ((!nodeType || nodeType === SENTINEL || nodeType === PATH) && Array.isArray(nodeValue)) {
                                delete nodeValue[$SIZE];
                                // console.log(1);
                                if (nodeType) {
                                    nodeSize = 50 + (nodeValue.length || 1);
                                } else {
                                    nodeSize = nodeValue.length || 1;
                                }
                                newNode[$SIZE] = nodeSize;
                                nodeValue[__CONTAINER] = newNode;
                            } else if (nodeType === SENTINEL || nodeType === PATH) {
                                newNode[$SIZE] = nodeSize = 50 + (nV2 && typeof nV2.length === 'number' ? nV2.length : 1);
                            } else if (nodeType === ERROR) {
                                newNode[$SIZE] = nodeSize = map && map[$SIZE] || 0 || 50 + 1;
                            } else if (!(map != null && typeof map === 'object')) {
                                nodeSize = 50 + (typeof nodeValue === 'string' && nodeValue.length || 1);
                                nodeType = 'sentinel';
                                newNode = {};
                                newNode[VALUE] = nodeValue;
                                newNode[$TYPE] = nodeType;
                                newNode[$SIZE] = nodeSize;
                            } else {
                                nodeType = newNode[$TYPE] = nodeType || GROUP;
                                newNode[$SIZE] = nodeSize = map && map[$SIZE] || 0 || 50 + 1;
                            }
                            ;
                            if (node !== newNode && (node != null && typeof node === 'object')) {
                                var nodeRefsLength = node[__REFS_LENGTH] || 0, destRefsLength = newNode[__REFS_LENGTH] || 0, i = -1, ref;
                                while (++i < nodeRefsLength) {
                                    if ((ref = node[__REF + i]) !== void 0) {
                                        ref[__CONTEXT] = newNode;
                                        newNode[__REF + (destRefsLength + i)] = ref;
                                        node[__REF + i] = void 0;
                                    }
                                }
                                newNode[__REFS_LENGTH] = nodeRefsLength + destRefsLength;
                                node[__REFS_LENGTH] = ref = void 0;
                                var invParent = nodeParent, invChild = node, invKey = key, keys$2, index$2, offset$2, childType, childValue, isBranch, stack = [
                                        nodeParent,
                                        invKey,
                                        node
                                    ], depth$2 = 0;
                                while (depth$2 > -1) {
                                    nodeParent = stack[offset$2 = depth$2 * 8];
                                    invKey = stack[offset$2 + 1];
                                    node = stack[offset$2 + 2];
                                    if ((childType = stack[offset$2 + 3]) === void 0 || (childType = void 0)) {
                                        childType = stack[offset$2 + 3] = node && node[$TYPE] || void 0 || null;
                                    }
                                    childValue = stack[offset$2 + 4] || (stack[offset$2 + 4] = childType === SENTINEL ? node[VALUE] : node);
                                    if ((isBranch = stack[offset$2 + 5]) === void 0) {
                                        isBranch = stack[offset$2 + 5] = !childType && (node != null && typeof node === 'object') && !Array.isArray(childValue);
                                    }
                                    if (isBranch === true) {
                                        if ((keys$2 = stack[offset$2 + 6]) === void 0) {
                                            keys$2 = stack[offset$2 + 6] = [];
                                            index$2 = -1;
                                            for (var childKey in node) {
                                                !(!(childKey[0] !== '_' || childKey[1] !== '_') || (childKey === __SELF || childKey === __PARENT || childKey === __ROOT) || childKey[0] === '$') && (keys$2[++index$2] = childKey);
                                            }
                                        }
                                        index$2 = stack[offset$2 + 7] || (stack[offset$2 + 7] = 0);
                                        if (index$2 < keys$2.length) {
                                            stack[offset$2 + 7] = index$2 + 1;
                                            stack[offset$2 = ++depth$2 * 8] = node;
                                            stack[offset$2 + 1] = invKey = keys$2[index$2];
                                            stack[offset$2 + 2] = node[invKey];
                                            continue;
                                        }
                                    }
                                    var ref$2 = node[$TYPE] === SENTINEL ? node[VALUE] : node, destination;
                                    if (ref$2 && Array.isArray(ref$2)) {
                                        destination = ref$2[__CONTEXT];
                                        if (destination) {
                                            var i$2 = (ref$2[__REF_INDEX] || 0) - 1, n = (destination[__REFS_LENGTH] || 0) - 1;
                                            while (++i$2 <= n) {
                                                destination[__REF + i$2] = destination[__REF + (i$2 + 1)];
                                            }
                                            destination[__REFS_LENGTH] = n;
                                            ref$2[__REF_INDEX] = ref$2[__CONTEXT] = destination = void 0;
                                        }
                                    }
                                    if (node != null && typeof node === 'object') {
                                        var ref$3, i$3 = -1, n$2 = node[__REFS_LENGTH] || 0;
                                        while (++i$3 < n$2) {
                                            if ((ref$3 = node[__REF + i$3]) !== void 0) {
                                                ref$3[__CONTEXT] = node[__REF + i$3] = void 0;
                                            }
                                        }
                                        node[__REFS_LENGTH] = void 0;
                                        var root$2 = root, head = root$2.__head, tail = root$2.__tail, next = node.__next, prev = node.__prev;
                                        next != null && typeof next === 'object' && (next.__prev = prev);
                                        prev != null && typeof prev === 'object' && (prev.__next = next);
                                        node === head && (root$2.__head = root$2.__next = next);
                                        node === tail && (root$2.__tail = root$2.__prev = prev);
                                        node.__next = node.__prev = void 0;
                                        head = tail = next = prev = void 0;
                                        ;
                                        nodeParent[invKey] = node[__SELF] = node[__PARENT] = node[__ROOT] = void 0;
                                    }
                                    ;
                                    delete stack[offset$2 + 0];
                                    delete stack[offset$2 + 1];
                                    delete stack[offset$2 + 2];
                                    delete stack[offset$2 + 3];
                                    delete stack[offset$2 + 4];
                                    delete stack[offset$2 + 5];
                                    delete stack[offset$2 + 6];
                                    delete stack[offset$2 + 7];
                                    --depth$2;
                                }
                                nodeParent = invParent;
                                node = invChild;
                            }
                            nodeParent[key] = node = newNode;
                            nodeType = node && node[$TYPE] || void 0;
                            node = !node[__SELF] && ((node[__SELF] = node) || true) && ((node[__KEY] = key) || true) && ((node[__PARENT] = nodeParent) || true) && ((node[__ROOT] = nodeRoot) || true) && (node[__GENERATION] || (node[__GENERATION] = ++__GENERATION_GUID) && node) && ((!nodeType || nodeType === SENTINEL) && Array.isArray(nodeValue) && (nodeValue[__CONTAINER] = node)) || node;
                            sizeOffset = edgeSize - nodeSize;
                            var self = nodeParent, child = node;
                            while (node = nodeParent) {
                                nodeParent = node[__PARENT];
                                if ((node[$SIZE] = (node[$SIZE] || 0) - sizeOffset) <= 0 && nodeParent) {
                                    var ref$4 = node[$TYPE] === SENTINEL ? node[VALUE] : node, destination$2;
                                    if (ref$4 && Array.isArray(ref$4)) {
                                        destination$2 = ref$4[__CONTEXT];
                                        if (destination$2) {
                                            var i$4 = (ref$4[__REF_INDEX] || 0) - 1, n$3 = (destination$2[__REFS_LENGTH] || 0) - 1;
                                            while (++i$4 <= n$3) {
                                                destination$2[__REF + i$4] = destination$2[__REF + (i$4 + 1)];
                                            }
                                            destination$2[__REFS_LENGTH] = n$3;
                                            ref$4[__REF_INDEX] = ref$4[__CONTEXT] = destination$2 = void 0;
                                        }
                                    }
                                    if (node != null && typeof node === 'object') {
                                        var ref$5, i$5 = -1, n$4 = node[__REFS_LENGTH] || 0;
                                        while (++i$5 < n$4) {
                                            if ((ref$5 = node[__REF + i$5]) !== void 0) {
                                                ref$5[__CONTEXT] = node[__REF + i$5] = void 0;
                                            }
                                        }
                                        node[__REFS_LENGTH] = void 0;
                                        var root$3 = root, head$2 = root$3.__head, tail$2 = root$3.__tail, next$2 = node.__next, prev$2 = node.__prev;
                                        next$2 != null && typeof next$2 === 'object' && (next$2.__prev = prev$2);
                                        prev$2 != null && typeof prev$2 === 'object' && (prev$2.__next = next$2);
                                        node === head$2 && (root$3.__head = root$3.__next = next$2);
                                        node === tail$2 && (root$3.__tail = root$3.__prev = prev$2);
                                        node.__next = node.__prev = void 0;
                                        head$2 = tail$2 = next$2 = prev$2 = void 0;
                                        ;
                                        nodeParent[node[__KEY]] = node[__SELF] = node[__PARENT] = node[__ROOT] = void 0;
                                    }
                                } else if (node[__GENERATION_UPDATED] !== __GENERATION_VERSION) {
                                    var self$2 = node, stack$2 = [], depth$3 = 0, linkPaths, ref$6, i$6, k, n$5;
                                    while (depth$3 > -1) {
                                        if ((linkPaths = stack$2[depth$3]) === void 0) {
                                            i$6 = k = -1;
                                            n$5 = node[__REFS_LENGTH] || 0;
                                            node[__GENERATION_UPDATED] = __GENERATION_VERSION;
                                            node[__GENERATION] = ++__GENERATION_GUID;
                                            if ((ref$6 = node[__PARENT]) !== void 0 && ref$6[__GENERATION_UPDATED] !== __GENERATION_VERSION) {
                                                stack$2[depth$3] = linkPaths = new Array(n$5 + 1);
                                                linkPaths[++k] = ref$6;
                                            } else if (n$5 > 0) {
                                                stack$2[depth$3] = linkPaths = new Array(n$5);
                                            }
                                            while (++i$6 < n$5) {
                                                if ((ref$6 = node[__REF + i$6]) !== void 0 && ref$6[__GENERATION_UPDATED] !== __GENERATION_VERSION) {
                                                    linkPaths[++k] = ref$6;
                                                }
                                            }
                                        }
                                        if ((node = linkPaths && linkPaths.pop()) !== void 0) {
                                            ++depth$3;
                                        } else {
                                            stack$2[depth$3--] = void 0;
                                        }
                                    }
                                    node = self$2;
                                }
                            }
                            nodeParent = self;
                            node = child;
                        }
                        ;
                        node = node;
                        break follow_path_map_9177;
                    }
                }
                if ((key = keys[index]) == null) {
                    node = node;
                    break follow_path_map_9177;
                } else if (key === __NULL && ((key = null) || true) || !(!(key[0] !== '_' || key[1] !== '_') || (key === __SELF || key === __PARENT || key === __ROOT) || key[0] === '$') && ((mapStack[(depth + 1) * 4] = map[key]) || true)) {
                    mapStack[(depth + 1) * 4 + 3] = key;
                } else {
                    mapStack[offset + 2] = index + 1;
                    node = node;
                    depth = depth;
                    continue follow_path_map_9177;
                }
                nodes[depth - 1] = nodeParent = node;
                if (key != null) {
                    node = nodeParent && nodeParent[key];
                    if (typeof map === 'object') {
                        for (var key$2 in map) {
                            key$2[0] === '$' && key$2 !== $SIZE && (nodeParent && (nodeParent[key$2] = map[key$2]) || true);
                        }
                        map = map[key];
                    }
                    var mapType = map && map[$TYPE] || void 0;
                    var mapValue = mapType === SENTINEL ? map[VALUE] : map;
                    if ((node == null || typeof node !== 'object' || !!nodeType && nodeType !== SENTINEL && !Array.isArray(nodeValue)) && (!mapType && (map != null && typeof map === 'object') && !Array.isArray(mapValue))) {
                        nodeType = void 0;
                        nodeValue = {};
                        nodeSize = node && node[$SIZE] || 0;
                        if (node !== nodeValue && (node != null && typeof node === 'object')) {
                            var nodeRefsLength$2 = node[__REFS_LENGTH] || 0, destRefsLength$2 = nodeValue[__REFS_LENGTH] || 0, i$7 = -1, ref$7;
                            while (++i$7 < nodeRefsLength$2) {
                                if ((ref$7 = node[__REF + i$7]) !== void 0) {
                                    ref$7[__CONTEXT] = nodeValue;
                                    nodeValue[__REF + (destRefsLength$2 + i$7)] = ref$7;
                                    node[__REF + i$7] = void 0;
                                }
                            }
                            nodeValue[__REFS_LENGTH] = nodeRefsLength$2 + destRefsLength$2;
                            node[__REFS_LENGTH] = ref$7 = void 0;
                            var invParent$2 = nodeParent, invChild$2 = node, invKey$2 = key, keys$3, index$3, offset$3, childType$2, childValue$2, isBranch$2, stack$3 = [
                                    nodeParent,
                                    invKey$2,
                                    node
                                ], depth$4 = 0;
                            while (depth$4 > -1) {
                                nodeParent = stack$3[offset$3 = depth$4 * 8];
                                invKey$2 = stack$3[offset$3 + 1];
                                node = stack$3[offset$3 + 2];
                                if ((childType$2 = stack$3[offset$3 + 3]) === void 0 || (childType$2 = void 0)) {
                                    childType$2 = stack$3[offset$3 + 3] = node && node[$TYPE] || void 0 || null;
                                }
                                childValue$2 = stack$3[offset$3 + 4] || (stack$3[offset$3 + 4] = childType$2 === SENTINEL ? node[VALUE] : node);
                                if ((isBranch$2 = stack$3[offset$3 + 5]) === void 0) {
                                    isBranch$2 = stack$3[offset$3 + 5] = !childType$2 && (node != null && typeof node === 'object') && !Array.isArray(childValue$2);
                                }
                                if (isBranch$2 === true) {
                                    if ((keys$3 = stack$3[offset$3 + 6]) === void 0) {
                                        keys$3 = stack$3[offset$3 + 6] = [];
                                        index$3 = -1;
                                        for (var childKey$2 in node) {
                                            !(!(childKey$2[0] !== '_' || childKey$2[1] !== '_') || (childKey$2 === __SELF || childKey$2 === __PARENT || childKey$2 === __ROOT) || childKey$2[0] === '$') && (keys$3[++index$3] = childKey$2);
                                        }
                                    }
                                    index$3 = stack$3[offset$3 + 7] || (stack$3[offset$3 + 7] = 0);
                                    if (index$3 < keys$3.length) {
                                        stack$3[offset$3 + 7] = index$3 + 1;
                                        stack$3[offset$3 = ++depth$4 * 8] = node;
                                        stack$3[offset$3 + 1] = invKey$2 = keys$3[index$3];
                                        stack$3[offset$3 + 2] = node[invKey$2];
                                        continue;
                                    }
                                }
                                var ref$8 = node[$TYPE] === SENTINEL ? node[VALUE] : node, destination$3;
                                if (ref$8 && Array.isArray(ref$8)) {
                                    destination$3 = ref$8[__CONTEXT];
                                    if (destination$3) {
                                        var i$8 = (ref$8[__REF_INDEX] || 0) - 1, n$6 = (destination$3[__REFS_LENGTH] || 0) - 1;
                                        while (++i$8 <= n$6) {
                                            destination$3[__REF + i$8] = destination$3[__REF + (i$8 + 1)];
                                        }
                                        destination$3[__REFS_LENGTH] = n$6;
                                        ref$8[__REF_INDEX] = ref$8[__CONTEXT] = destination$3 = void 0;
                                    }
                                }
                                if (node != null && typeof node === 'object') {
                                    var ref$9, i$9 = -1, n$7 = node[__REFS_LENGTH] || 0;
                                    while (++i$9 < n$7) {
                                        if ((ref$9 = node[__REF + i$9]) !== void 0) {
                                            ref$9[__CONTEXT] = node[__REF + i$9] = void 0;
                                        }
                                    }
                                    node[__REFS_LENGTH] = void 0;
                                    var root$4 = root, head$3 = root$4.__head, tail$3 = root$4.__tail, next$3 = node.__next, prev$3 = node.__prev;
                                    next$3 != null && typeof next$3 === 'object' && (next$3.__prev = prev$3);
                                    prev$3 != null && typeof prev$3 === 'object' && (prev$3.__next = next$3);
                                    node === head$3 && (root$4.__head = root$4.__next = next$3);
                                    node === tail$3 && (root$4.__tail = root$4.__prev = prev$3);
                                    node.__next = node.__prev = void 0;
                                    head$3 = tail$3 = next$3 = prev$3 = void 0;
                                    ;
                                    nodeParent[invKey$2] = node[__SELF] = node[__PARENT] = node[__ROOT] = void 0;
                                }
                                ;
                                delete stack$3[offset$3 + 0];
                                delete stack$3[offset$3 + 1];
                                delete stack$3[offset$3 + 2];
                                delete stack$3[offset$3 + 3];
                                delete stack$3[offset$3 + 4];
                                delete stack$3[offset$3 + 5];
                                delete stack$3[offset$3 + 6];
                                delete stack$3[offset$3 + 7];
                                --depth$4;
                            }
                            nodeParent = invParent$2;
                            node = invChild$2;
                        }
                        nodeParent[key] = node = nodeValue;
                        node = !node[__SELF] && ((node[__SELF] = node) || true) && ((node[__KEY] = key) || true) && ((node[__PARENT] = nodeParent) || true) && ((node[__ROOT] = nodeRoot) || true) && (node[__GENERATION] || (node[__GENERATION] = ++__GENERATION_GUID) && node) && ((!nodeType || nodeType === SENTINEL) && Array.isArray(nodeValue) && (nodeValue[__CONTAINER] = node)) || node;
                        var self$3 = node, node$2;
                        while (node$2 = node) {
                            if (node[__GENERATION_UPDATED] !== __GENERATION_VERSION) {
                                var self$4 = node, stack$4 = [], depth$5 = 0, linkPaths$2, ref$10, i$10, k$2, n$8;
                                while (depth$5 > -1) {
                                    if ((linkPaths$2 = stack$4[depth$5]) === void 0) {
                                        i$10 = k$2 = -1;
                                        n$8 = node[__REFS_LENGTH] || 0;
                                        node[__GENERATION_UPDATED] = __GENERATION_VERSION;
                                        node[__GENERATION] = ++__GENERATION_GUID;
                                        if ((ref$10 = node[__PARENT]) !== void 0 && ref$10[__GENERATION_UPDATED] !== __GENERATION_VERSION) {
                                            stack$4[depth$5] = linkPaths$2 = new Array(n$8 + 1);
                                            linkPaths$2[++k$2] = ref$10;
                                        } else if (n$8 > 0) {
                                            stack$4[depth$5] = linkPaths$2 = new Array(n$8);
                                        }
                                        while (++i$10 < n$8) {
                                            if ((ref$10 = node[__REF + i$10]) !== void 0 && ref$10[__GENERATION_UPDATED] !== __GENERATION_VERSION) {
                                                linkPaths$2[++k$2] = ref$10;
                                            }
                                        }
                                    }
                                    if ((node = linkPaths$2 && linkPaths$2.pop()) !== void 0) {
                                        ++depth$5;
                                    } else {
                                        stack$4[depth$5--] = void 0;
                                    }
                                }
                                node = self$4;
                            }
                            node = node$2[__PARENT];
                        }
                        node = self$3;
                    }
                }
                node = node;
                depth = depth + 1;
                continue follow_path_map_9177;
            } while (true);
        node = node;
        var offset$4 = depth * 4, keys$4, index$4;
        do {
            delete mapStack[offset$4 + 0];
            delete mapStack[offset$4 + 1];
            delete mapStack[offset$4 + 2];
            delete mapStack[offset$4 + 3];
        } while ((keys$4 = mapStack[(offset$4 = 4 * --depth) + 1]) && ((index$4 = mapStack[offset$4 + 2]) || true) && (mapStack[offset$4 + 2] = ++index$4) >= keys$4.length);
    }
    return nodeRoot;
}

},{}],50:[function(require,module,exports){
var lru = require('./util/lru');
var clone = require('./util/clone');
var promote = lru.promote;
module.exports = function onError(model, node, permuteRequested, permuteOptimized, outerResults) {
    outerResults.errors.push({path: permuteRequested, value: node.value});

    promote(model, node);
    
    if (permuteOptimized) {
        outerResults.requestedPaths.push(permuteRequested);
        outerResults.optimizedPaths.push(permuteOptimized);
    }
};


},{"./util/clone":53,"./util/lru":58}],51:[function(require,module,exports){
var support = require('./util/support');
var fastCat = support.fastCat,
    fastCatSkipNulls = support.fastCatSkipNulls,
    fastCopy = support.fastCopy;
var isExpired = require('./util/isExpired');
var spreadJSON = require('./util/spreadJSON');
var clone = require('./util/clone');

module.exports = function onMissing(model, node, path, depth, seedOrFunction, outerResults, permuteRequested, permuteOptimized, permutePosition, outputFormat) {
    var pathSlice;
    if (Array.isArray(path)) {
        if (depth < path.length) {
            pathSlice = fastCopy(path, depth);
        } else {
            pathSlice = [];
        }

        concatAndInsertMissing(pathSlice, outerResults, permuteRequested, permuteOptimized, permutePosition, outputFormat);
    } else {
        pathSlice = [];
        spreadJSON(path, pathSlice);

        for (var i = 0, len = pathSlice.length; i < len; i++) {
            concatAndInsertMissing(pathSlice[i], outerResults, permuteRequested, permuteOptimized, permutePosition, outputFormat, true);
        }
    }
};

function concatAndInsertMissing(remainingPath, results, permuteRequested, permuteOptimized, permutePosition, outputFormat, __null) {
    var i = 0, len;
    if (__null) {
        for (i = 0, len = remainingPath.length; i < len; i++) {
            if (remainingPath[i] === '__null') {
                remainingPath[i] = null;
            }
        }
    }
    if (outputFormat === 'JSON') {
        permuteRequested = fastCat(permuteRequested, remainingPath);
        for (i = 0, len = permutePosition.length; i < len; i++) {
            var idx = permutePosition[i];
            var r = permuteRequested[idx];
            permuteRequested[idx] = [r];
        }
        results.requestedMissingPaths.push(permuteRequested);
        results.optimizedMissingPaths.push(fastCatSkipNulls(permuteOptimized, remainingPath));
    } else {
        results.requestedMissingPaths.push(fastCat(permuteRequested, remainingPath));
        results.optimizedMissingPaths.push(fastCatSkipNulls(permuteOptimized, remainingPath));
    }
}


},{"./util/clone":53,"./util/isExpired":55,"./util/spreadJSON":60,"./util/support":61}],52:[function(require,module,exports){
var lru = require('./util/lru');
var clone = require('./util/clone');
var promote = lru.promote;
var $path = require('./../types/path');
var $sentinel = require('./../types/sentinel');
var $error = require('./../types/error');
module.exports = function onValue(model, node, seedOrFunction, outerResults, permuteRequested, permuteOptimized, permutePosition, outputFormat, fromReference) {
    var i, len, k, key, curr, prev, prevK;
    var materialized = false, valueNode;
    if (node) {
        promote(model, node);

    }

    if (!node || node.value === undefined) {
        materialized = model._materialized;
    }

    // materialized
    if (materialized) {
        valueNode = {$type: $sentinel};
    }

    // Boxed Mode & Reference Node & Error node (only happens when model is in treat errors as values).
    else if (model._boxed) {
        valueNode = clone(node);
    }

    else if (node.$type === $path || node.$type === $error) {
        if (outputFormat === 'JSONG') {
            valueNode = clone(node);
        } else {
            valueNode = node.value;
        }
    }

    else {
        if (outputFormat === 'JSONG') {
            if (typeof node.value === 'object') {
                valueNode = clone(node);
            } else {
                valueNode = node.value;
            }
        } else {
            valueNode = node.value;
        }
    }


    if (permuteRequested) {
        if (fromReference && permuteRequested[permuteRequested.length - 1] !== null) {
            permuteRequested.push(null);
        }
        outerResults.requestedPaths.push(permuteRequested);
        outerResults.optimizedPaths.push(permuteOptimized);
    }
    switch (outputFormat) {

        case 'Values':
            // in any subscription situation, onNexts are always provided, even as a noOp.
            seedOrFunction({path: permuteRequested, value: valueNode});
            break;

        case 'PathMap':
            len = permuteRequested.length - 1;
            if (len === -1) {
                seedOrFunction.json = valueNode;
            } else {
                curr = seedOrFunction.json;
                if (!curr) {
                    curr = seedOrFunction.json = {};
                }
                for (i = 0; i < len; i++) {
                    k = permuteRequested[i];
                    if (!curr[k]) {
                        curr[k] = {};
                    }
                    prev = curr;
                    prevK = k;
                    curr = curr[k];
                }
                k = permuteRequested[i];
                if (k !== null) {
                    curr[k] = valueNode;
                } else {
                    prev[prevK] = valueNode;
                }
            }
            break;

        case 'JSON':
            if (seedOrFunction) {
                if (permutePosition.length) {
                    if (!seedOrFunction.json) {
                        seedOrFunction.json = {};
                    }
                    curr = seedOrFunction.json;
                    for (i = 0, len = permutePosition.length - 1; i < len; i++) {
                        k = permutePosition[i];
                        key = permuteRequested[k];

                        if (!curr[key]) {
                            curr[key] = {};
                        }
                        curr = curr[key];
                    }

                    // assign the last
                    k = permutePosition[i];
                    key = permuteRequested[k];
                    curr[key] = valueNode;
                } else {
                    seedOrFunction.json = valueNode;
                }
            }
            break;

        case 'JSONG':
            curr = seedOrFunction.jsong;
            if (!curr) {
                curr = seedOrFunction.jsong = {};
                seedOrFunction.paths = [];
            }
            for (i = 0, len = permuteOptimized.length - 1; i < len; i++) {
                key = permuteOptimized[i];

                if (!curr[key]) {
                    curr[key] = {};
                }
                curr = curr[key];
            }

            // assign the last
            key = permuteOptimized[i];

            // TODO: Special case? do string comparisons make big difference?
            curr[key] = materialized ? {$type: $sentinel} : valueNode;
            if (permuteRequested) {
                seedOrFunction.paths.push(permuteRequested);
            }
            break;
    }
};



},{"./../types/error":135,"./../types/path":136,"./../types/sentinel":137,"./util/clone":53,"./util/lru":58}],53:[function(require,module,exports){
// Copies the node
var prefix = require("../../internal/prefix");
module.exports = function clone(node) {
    var outValue, i, len;
    var keys = Object.keys(node);
    
    outValue = {};
    for (i = 0, len = keys.length; i < len; i++) {
        var k = keys[i];
        if (k[0] === prefix) {
            continue;
        }
        outValue[k] = node[k];
    }
    return outValue;
};


},{"../../internal/prefix":70}],54:[function(require,module,exports){
var __ref = require("../../internal/ref");
var __context = require("../../internal/context");
var __ref_index = require("../../internal/ref-index");
var __refs_length = require("../../internal/refs-length");

function createHardlink(from, to) {
    
    // create a back reference
    var backRefs  = to[__refs_length] || 0;
    to[__ref + backRefs] = from;
    to[__refs_length] = backRefs + 1;
    
    // create a hard reference
    from[__ref_index] = backRefs;
    from[__context] = to;
}

function removeHardlink(cacheObject) {
    var context = cacheObject[__context];
    if (context) {
        var idx = cacheObject[__ref_index];
        var len = context[__refs_length];
        
        while (idx < len) {
            context[__ref + idx] = context[__REF + idx + 1];
            ++idx;
        }
        
        context[__refs_length] = len - 1;
        cacheObject[__context] = undefined;
        cacheObject[__ref_index] = undefined;
    }
}

module.exports = {
    create: createHardlink,
    remove: removeHardlink
};

},{"../../internal/context":62,"../../internal/ref":73,"../../internal/ref-index":72,"../../internal/refs-length":74}],55:[function(require,module,exports){
var now = require('../../support/now');
module.exports = function isExpired(node) {
    var $expires = node.$expires === undefined && -1 || node.$expires;
    return $expires !== -1 && $expires !== 1 && ($expires === 0 || $expires < now());
};

},{"../../support/now":122}],56:[function(require,module,exports){
module.exports = function isMaterialized(model) {
    return model._materialized && !(model._router || model._dataSource);
};

},{}],57:[function(require,module,exports){
module.exports = function(x) {
    return x.path && x.value;
};
},{}],58:[function(require,module,exports){
var __head = require("../../internal/head");
var __tail = require("../../internal/tail");
var __next = require("../../internal/next");
var __prev = require("../../internal/prev");
var __invalidated = require("../../internal/invalidated");

// [H] -> Next -> ... -> [T]
// [T] -> Prev -> ... -> [H]
function lruPromote(model, object) {
    var root = model._root;
    var head = root[__head];
    if (head === object) {
        return;
    }

    // First insert
    if (!head) {
        root[__head] = object;
        return;
    }

    // The head and the tail need to separate
    if (!root[__tail]) {
        root[__head] = object;
        root[__tail] = head;
        object[__next] = head;
        
        // Now tail
        head[__prev] = object;
        return;
    }

    // Its in the cache.  Splice out.
    var prev = object[__prev];
    var next = object[__next];
    if (next) {
        next[__prev] = prev;
    }
    if (prev) {
        prev[__next] = next;
    }
    object[__prev] = undefined;

    // Insert into head position
    root[__head] = object;
    object[__next] = head;
    head[__prev] = object;
}

function lruSplice(model, object) {
    var root = model._root;

    // Its in the cache.  Splice out.
    var prev = object[__prev];
    var next = object[__next];
    if (next) {
        next[__prev] = prev;
    }
    if (prev) {
        prev[__next] = next;
    }
    object[__prev] = undefined;
    
    if (object === root[__head]) {
        root[__head] = undefined;
    }
    if (object === root[__tail]) {
        root[__tail] = undefined;
    }
    object[__invalidated] = true;
    root.expired.push(object);
}

module.exports = {
    promote: lruPromote,
    splice: lruSplice
};
},{"../../internal/head":64,"../../internal/invalidated":65,"../../internal/next":67,"../../internal/prev":71,"../../internal/tail":75}],59:[function(require,module,exports){
var prefix = require("../../internal/prefix");
module.exports = function permuteKey(key, memo) {
    if (memo.isArray) {
        if (memo.loaded && memo.rangeOffset > memo.to) {
            memo.arrOffset++;
            memo.loaded = false;
        }

        var idx = memo.arrOffset, length = key.length;
        if (idx === length) {
            memo.done = true;
            return '';
        }

        var el = key[memo.arrOffset];
        var type = typeof el;
        if (type === 'object') {
            if (!memo.loaded) {
                memo.from = el.from || 0;
                memo.to = el.to ||
                    typeof el.length === 'number' && memo.from + el.length - 1 || 0;
                memo.rangeOffset = memo.from;
                memo.loaded = true;
            }

            return memo.rangeOffset++;
        } else {
            do  {
                // if (type !== 'string') {
                //     break;
                // }

                if (el[0] !== prefix && el[0] !== '$') {
                    break;
                }

                el = key[++idx];
            } while (el !== undefined || idx < length);

            if (el === undefined || idx === length) {
                memo.done = true;
                return '';
            }

            memo.arrOffset = idx + 1;
            return el;
        }
    } else {
        if (!memo.loaded) {
            memo.from = key.from || 0;
            memo.to = key.to ||
                typeof key.length === 'number' && memo.from + key.length - 1 || 0;
            memo.rangeOffset = memo.from;
            memo.loaded = true;
        }
        if (memo.rangeOffset > memo.to) {
            memo.done = true;
            return '';
        }

        return memo.rangeOffset++;
    }
};


},{"../../internal/prefix":70}],60:[function(require,module,exports){
var fastCopy = require('./support').fastCopy;
module.exports = function spreadJSON(root, bins, bin) {
    bin = bin || [];
    if (!bins.length) {
        bins.push(bin);
    }
    if (!root || typeof root !== 'object' || root.$type) {
        return [];
    }
    var keys = Object.keys(root);
    if (keys.length === 1) {
        bin.push(keys[0]);
        spreadJSON(root[keys[0]], bins, bin);
    } else {
        for (var i = 0, len = keys.length; i < len; i++) {
            var k = keys[i];
            var nextBin = fastCopy(bin);
            nextBin.push(k);
            bins.push(nextBin);
            spreadJSON(root[k], bins, nextBin);
        }
    }
};

},{"./support":61}],61:[function(require,module,exports){


function fastCopy(arr, i) {
    var a = [], len, j;
    for (j = 0, i = i || 0, len = arr.length; i < len; j++, i++) {
        a[j] = arr[i];
    }
    return a;
}

function fastCatSkipNulls(arr1, arr2) {
    var a = [], i, len, j;
    for (i = 0, len = arr1.length; i < len; i++) {
        a[i] = arr1[i];
    }
    for (j = 0, len = arr2.length; j < len; j++) {
        if (arr2[j] !== null) {
            a[i++] = arr2[j];
        }
    }
    return a;
}

function fastCat(arr1, arr2) {
    var a = [], i, len, j;
    for (i = 0, len = arr1.length; i < len; i++) {
        a[i] = arr1[i];
    }
    for (j = 0, len = arr2.length; j < len; j++) {
        a[i++] = arr2[j];
    }
    return a;
}



module.exports = {
    fastCat: fastCat,
    fastCatSkipNulls: fastCatSkipNulls,
    fastCopy: fastCopy
};

},{}],62:[function(require,module,exports){
module.exports = require("./prefix") + "context";
},{"./prefix":70}],63:[function(require,module,exports){
module.exports = require("./prefix") + "generation";
},{"./prefix":70}],64:[function(require,module,exports){
module.exports = require("./prefix") + "head";
},{"./prefix":70}],65:[function(require,module,exports){
module.exports = require("./prefix") + "invalidated";
},{"./prefix":70}],66:[function(require,module,exports){
module.exports = require("./prefix") + "key";
},{"./prefix":70}],67:[function(require,module,exports){
module.exports = require("./prefix") + "next";
},{"./prefix":70}],68:[function(require,module,exports){
module.exports = require("./prefix") + "offset";
},{"./prefix":70}],69:[function(require,module,exports){
module.exports = require("./prefix") + "parent";
},{"./prefix":70}],70:[function(require,module,exports){
// This may look like an empty string, but it's actually a single zero-width-space character.
module.exports = "​";
},{}],71:[function(require,module,exports){
module.exports = require("./prefix") + "prev";
},{"./prefix":70}],72:[function(require,module,exports){
module.exports = require("./prefix") + "ref-index";
},{"./prefix":70}],73:[function(require,module,exports){
module.exports = require("./prefix") + "ref";
},{"./prefix":70}],74:[function(require,module,exports){
module.exports = require("./prefix") + "refs-length";
},{"./prefix":70}],75:[function(require,module,exports){
module.exports = require("./prefix") + "tail";
},{"./prefix":70}],76:[function(require,module,exports){
module.exports = require("./prefix") + "version";
},{"./prefix":70}],77:[function(require,module,exports){
module.exports = {
    invPathSetsAsJSON: require("./invalidate-path-sets-as-json-dense"),
    invPathSetsAsJSONG: require("./invalidate-path-sets-as-json-graph"),
    invPathSetsAsPathMap: require("./invalidate-path-sets-as-json-sparse"),
    invPathSetsAsValues: require("./invalidate-path-sets-as-json-values")
};
},{"./invalidate-path-sets-as-json-dense":78,"./invalidate-path-sets-as-json-graph":79,"./invalidate-path-sets-as-json-sparse":80,"./invalidate-path-sets-as-json-values":81}],78:[function(require,module,exports){
module.exports = invalidate_path_sets_as_json_dense;

var clone = require("../support/clone-dense-json");
var array_clone = require("../support/array-clone");
var array_slice = require("../support/array-slice");

var options = require("../support/options");
var walk_path_set = require("../walk/walk-path-set");

var is_object = require("../support/is-object");

var get_valid_key = require("../support/get-valid-key");
var update_graph = require("../support/update-graph");
var invalidate_node = require("../support/invalidate-node");

var collect = require("../lru/collect");

function invalidate_path_sets_as_json_dense(model, pathsets, values) {

    var roots = options([], model);
    var index = -1;
    var count = pathsets.length;
    var nodes = roots.nodes;
    var parents = array_clone(nodes);
    var requested = [];
    var optimized = [];
    var json, hasValue;

    roots[0] = roots.root;

    while (++index < count) {

        json = values && values[index];
        if (is_object(json)) {
            roots[3] = parents[3] = nodes[3] = json.json || (json.json = {})
        } else {
            roots[3] = parents[3] = nodes[3] = undefined;
        }

        var pathset = pathsets[index];
        roots.index = index;
        
        walk_path_set(onNode, onEdge, pathset, 0, roots, parents, nodes, requested, optimized);

        if (is_object(json)) {
            json.json = roots.json;
        }
        delete roots.json;
    }

    collect(
        roots.lru,
        roots.expired,
        roots.version,
        roots.root.$size || 0,
        model._maxSize,
        model._collectRatio
    );

    return {
        values: values,
        errors: roots.errors,
        hasValue: true,
        requestedPaths: roots.requestedPaths,
        optimizedPaths: roots.optimizedPaths,
        requestedMissingPaths: roots.requestedMissingPaths,
        optimizedMissingPaths: roots.optimizedMissingPaths
    };
}

function onNode(pathset, roots, parents, nodes, requested, optimized, is_top_level, is_branch, key, keyset, is_keyset) {

    var parent, json;

    if (key == null) {
        if ((key = get_valid_key(optimized)) == null) {
            return;
        }
        json = parents[3];
        parent = parents[0];
    } else {
        json = is_keyset && nodes[3] || parents[3];
        parent = nodes[0];
    }

    var node = parent[key];

    if (!is_top_level) {
        parents[0] = parent;
        nodes[0] = node;
        return;
    }

    if (is_branch) {
        parents[0] = nodes[0] = node;
        if (is_keyset && !!(parents[3] = json)) {
            nodes[3] = json[keyset] || (json[keyset] = {});
        }
        return;
    }

    nodes[0] = node;

    if (!!json) {
        var type = is_object(node) && node.$type || undefined;
        var jsonkey = keyset;
        if (jsonkey == null) {
            json = roots;
            jsonkey = 3;
        }
        json[jsonkey] = clone(roots, node, type, node && node.value);
    }

    var lru = roots.lru;
    var size = node.$size || 0;
    var version = roots.version;
    invalidate_node(parent, node, key, roots.lru);
    update_graph(parent, size, version, lru);
}

function onEdge(pathset, depth, roots, parents, nodes, requested, optimized, key, keyset) {
    roots.json = roots[3];
    roots.hasValue = true;
    roots.requestedPaths.push(array_slice(requested, roots.offset));
}
},{"../lru/collect":82,"../support/array-clone":100,"../support/array-slice":101,"../support/clone-dense-json":102,"../support/get-valid-key":112,"../support/invalidate-node":116,"../support/is-object":118,"../support/options":123,"../support/update-graph":133,"../walk/walk-path-set":143}],79:[function(require,module,exports){
module.exports = invalidate_path_sets_as_json_graph;

var $path = require("../types/path");

var clone = require("../support/clone-dense-json");
var array_clone = require("../support/array-clone");

var options = require("../support/options");
var walk_path_set = require("../walk/walk-path-set-soft-link");

var is_object = require("../support/is-object");

var get_valid_key = require("../support/get-valid-key");
var update_graph = require("../support/update-graph");
var invalidate_node = require("../support/invalidate-node");
var clone_success = require("../support/clone-success-paths");
var collect = require("../lru/collect");

function invalidate_path_sets_as_json_graph(model, pathsets, values) {

    var roots = options([], model);
    var index = -1;
    var count = pathsets.length;
    var nodes = roots.nodes;
    var parents = array_clone(nodes);
    var requested = [];
    var optimized = [];
    var json = values[0];

    roots[0] = roots.root;
    roots[1] = parents[1] = nodes[1] = json.jsong || (json.jsong = {});
    roots.requestedPaths = json.paths || (json.paths = roots.requestedPaths);

    while (++index < count) {
        var pathset = pathsets[index];
        walk_path_set(onNode, onEdge, pathset, 0, roots, parents, nodes, requested, optimized);
    }

    collect(
        roots.lru,
        roots.expired,
        roots.version,
        roots.root.$size || 0,
        model._maxSize,
        model._collectRatio
    );

    return {
        values: values,
        errors: roots.errors,
        hasValue: true,
        requestedPaths: roots.requestedPaths,
        optimizedPaths: roots.optimizedPaths,
        requestedMissingPaths: roots.requestedMissingPaths,
        optimizedMissingPaths: roots.optimizedMissingPaths
    };
}

function onNode(pathset, roots, parents, nodes, requested, optimized, is_top_level, is_branch, key, keyset, is_keyset) {

    var parent, json;

    if (key == null) {
        if ((key = get_valid_key(optimized)) == null) {
            return;
        }
        json = parents[1];
        parent = parents[0];
    } else {
        json = nodes[1];
        parent = nodes[0];
    }

    var jsonkey = key;
    var node = parent[key];

    if (!is_top_level) {
        parents[0] = parent;
        nodes[0] = node;
        parents[1] = json;
        nodes[1] = json[jsonkey] || (json[jsonkey] = {});
        return;
    }

    var type = is_object(node) && node.$type || undefined;
    
    if (is_branch) {
        parents[0] = nodes[0] = node;
        parents[1] = json;
        if (type == $path) {
            json[jsonkey] = clone(roots, node, type, node.value);
        } else {
            nodes[1] = json[jsonkey] || (json[jsonkey] = {});
        }
        return;
    }

    nodes[0] = node;

    json[jsonkey] = clone(roots, node, type, node && node.value);

    var lru = roots.lru;
    var size = node.$size || 0;
    var version = roots.version;
    invalidate_node(parent, node, key, roots.lru);
    update_graph(parent, size, version, lru);
}

function onEdge(pathset, depth, roots, parents, nodes, requested, optimized, key, keyset) {
    clone_success(roots, requested, optimized);
    roots.json = roots[1];
    roots.hasValue = true;
}

},{"../lru/collect":82,"../support/array-clone":100,"../support/clone-dense-json":102,"../support/clone-success-paths":108,"../support/get-valid-key":112,"../support/invalidate-node":116,"../support/is-object":118,"../support/options":123,"../support/update-graph":133,"../types/path":136,"../walk/walk-path-set-soft-link":142}],80:[function(require,module,exports){
module.exports = invalidate_path_sets_as_json_sparse;

var clone = require("../support/clone-dense-json");
var array_clone = require("../support/array-clone");
var array_slice = require("../support/array-slice");

var options = require("../support/options");
var walk_path_set = require("../walk/walk-path-set");

var is_object = require("../support/is-object");

var get_valid_key = require("../support/get-valid-key");
var update_graph = require("../support/update-graph");
var invalidate_node = require("../support/invalidate-node");

var collect = require("../lru/collect");

function invalidate_path_sets_as_json_sparse(model, pathsets, values) {

    var roots = options([], model);
    var index = -1;
    var count = pathsets.length;
    var nodes = roots.nodes;
    var parents = array_clone(nodes);
    var requested = [];
    var optimized = [];
    var json = values[0];

    roots[0] = roots.root;
    roots[3] = parents[3] = nodes[3] = json.json || (json.json = {});

    while (++index < count) {
        var pathset = pathsets[index];
        walk_path_set(onNode, onEdge, pathset, 0, roots, parents, nodes, requested, optimized);
    }

    collect(
        roots.lru,
        roots.expired,
        roots.version,
        roots.root.$size || 0,
        model._maxSize,
        model._collectRatio
    );

    return {
        values: values,
        errors: roots.errors,
        hasValue: true,
        requestedPaths: roots.requestedPaths,
        optimizedPaths: roots.optimizedPaths,
        requestedMissingPaths: roots.requestedMissingPaths,
        optimizedMissingPaths: roots.optimizedMissingPaths
    };
}

function onNode(pathset, roots, parents, nodes, requested, optimized, is_top_level, is_branch, key, keyset, is_keyset) {

    var parent, json, jsonkey;

    if (key == null) {
        if ((key = get_valid_key(optimized)) == null) {
            return;
        }
        jsonkey = get_valid_key(requested);
        json = parents[3];
        parent = parents[0];
    } else {
        jsonkey = key;
        json = nodes[3];
        parent = nodes[0];
    }

    var node = parent[key];

    if (!is_top_level) {
        parents[0] = parent;
        nodes[0] = node;
        return;
    }

    if (is_branch) {
        parents[0] = nodes[0] = node;
        parents[3] = json;
        nodes[3] = json[jsonkey] || (json[jsonkey] = {});
        return;
    }

    nodes[0] = node;

    var type = is_object(node) && node.$type || undefined;
    json[jsonkey] = clone(roots, node, type, node && node.value);

    var lru = roots.lru;
    var size = node.$size || 0;
    var version = roots.version;
    invalidate_node(parent, node, key, roots.lru);
    update_graph(parent, size, version, lru);
}

function onEdge(pathset, depth, roots, parents, nodes, requested, optimized, key, keyset) {
    roots.json = roots[3];
    roots.hasValue = true;
    roots.requestedPaths.push(array_slice(requested, roots.offset));
}
},{"../lru/collect":82,"../support/array-clone":100,"../support/array-slice":101,"../support/clone-dense-json":102,"../support/get-valid-key":112,"../support/invalidate-node":116,"../support/is-object":118,"../support/options":123,"../support/update-graph":133,"../walk/walk-path-set":143}],81:[function(require,module,exports){
module.exports = invalidate_path_sets_as_json_values;

var clone = require("../support/clone-dense-json");
var array_clone = require("../support/array-clone");
var array_slice = require("../support/array-slice");

var options = require("../support/options");
var walk_path_set = require("../walk/walk-path-set");

var is_object = require("../support/is-object");

var get_valid_key = require("../support/get-valid-key");
var update_graph = require("../support/update-graph");
var invalidate_node = require("../support/invalidate-node");

var collect = require("../lru/collect");

function invalidate_path_sets_as_json_values(model, pathsets, onNext) {

    var roots = options([], model);
    var index = -1;
    var count = pathsets.length;
    var nodes = roots.nodes;
    var parents = array_clone(nodes);
    var requested = [];
    var optimized = [];

    roots[0] = roots.root;
    roots.onNext = onNext;

    while (++index < count) {
        var pathset = pathsets[index];
        walk_path_set(onNode, onEdge, pathset, 0, roots, parents, nodes, requested, optimized);
    }

    collect(
        roots.lru,
        roots.expired,
        roots.version,
        roots.root.$size || 0,
        model._maxSize,
        model._collectRatio
    );

    return {
        values: null,
        errors: roots.errors,
        requestedPaths: roots.requestedPaths,
        optimizedPaths: roots.optimizedPaths,
        requestedMissingPaths: roots.requestedMissingPaths,
        optimizedMissingPaths: roots.optimizedMissingPaths
    };
}

function onNode(pathset, roots, parents, nodes, requested, optimized, is_top_level, is_branch, key, keyset, is_keyset) {

    var parent;

    if (key == null) {
        if ((key = get_valid_key(optimized)) == null) {
            return;
        }
        parent = parents[0];
    } else {
        parent = nodes[0];
    }

    var node = parent[key];

    if (!is_top_level) {
        parents[0] = parent;
        nodes[0] = node;
        return;
    }

    if (is_branch) {
        parents[0] = nodes[0] = node;
        return;
    }

    nodes[0] = node;

    var lru = roots.lru;
    var size = node.$size || 0;
    var version = roots.version;
    invalidate_node(parent, node, key, roots.lru);
    update_graph(parent, size, version, lru);
}

function onEdge(pathset, depth, roots, parents, nodes, requested, optimized, key, keyset) {
    var node = nodes[0];
    var type = is_object(node) && node.$type || undefined;
    var onNext = roots.onNext;
    if (!!type && onNext) {
        onNext({
            path: array_clone(requested),
            value: clone(roots, node, type, node && node.value)
        });
    }
    roots.requestedPaths.push(array_slice(requested, roots.offset));
}
},{"../lru/collect":82,"../support/array-clone":100,"../support/array-slice":101,"../support/clone-dense-json":102,"../support/get-valid-key":112,"../support/invalidate-node":116,"../support/is-object":118,"../support/options":123,"../support/update-graph":133,"../walk/walk-path-set":143}],82:[function(require,module,exports){
var __head = require("../internal/head");
var __tail = require("../internal/tail");
var __next = require("../internal/next");
var __prev = require("../internal/prev");

var update_graph = require("../support/update-graph");
module.exports = function(lru, expired, version, total, max, ratio) {
    
    var targetSize = max * ratio;
    var node, size;
    
    while(!!(node = expired.pop())) {
        size = node.$size || 0;
        total -= size;
        update_graph(node, size, version, lru);
    }
    
    if(total >= max) {
        var prev = lru[__tail];
        while((total >= targetSize) && !!(node = prev)) {
            prev = prev[__prev];
            size = node.$size || 0;
            total -= size;
            update_graph(node, size, version, lru);
        }
        
        if((lru[__tail] = lru[__prev] = prev) == null) {
            lru[__head] = lru[__next] = undefined;
        } else {
            prev[__next] = undefined;
        }
    }
};
},{"../internal/head":64,"../internal/next":67,"../internal/prev":71,"../internal/tail":75,"../support/update-graph":133}],83:[function(require,module,exports){
var $expires_never = require("../values/expires-never");
var __head = require("../internal/head");
var __tail = require("../internal/tail");
var __next = require("../internal/next");
var __prev = require("../internal/prev");

var is_object = require("../support/is-object");
module.exports = function(root, node) {
    if(is_object(node) && (node.$expires !== $expires_never)) {
        var head = root[__head], tail = root[__tail],
            next = node[__next], prev = node[__prev];
        if (node !== head) {
            (next != null && typeof next === "object") && (next[__prev] = prev);
            (prev != null && typeof prev === "object") && (prev[__next] = next);
            (next = head) && (head != null && typeof head === "object") && (head[__prev] = node);
            (root[__head] = root[__next] = head = node);
            (head[__next] = next);
            (head[__prev] = undefined);
        }
        if (tail == null || node === tail) {
            root[__tail] = root[__prev] = tail = prev || node;
        }
    }
    return node;
};
},{"../internal/head":64,"../internal/next":67,"../internal/prev":71,"../internal/tail":75,"../support/is-object":118,"../values/expires-never":138}],84:[function(require,module,exports){
var __head = require("../internal/head");
var __tail = require("../internal/tail");
var __next = require("../internal/next");
var __prev = require("../internal/prev");

module.exports = function(root, node) {
    var head = root[__head], tail = root[__tail],
        next = node[__next], prev = node[__prev];
    (next != null && typeof next === "object") && (next[__prev] = prev);
    (prev != null && typeof prev === "object") && (prev[__next] = next);
    (node === head) && (root[__head] = root[__next] = next);
    (node === tail) && (root[__tail] = root[__prev] = prev);
    node[__next] = node[__prev] = undefined;
    head = tail = next = prev = undefined;
};
},{"../internal/head":64,"../internal/next":67,"../internal/prev":71,"../internal/tail":75}],85:[function(require,module,exports){
module.exports = {
    setPathSetsAsJSON: require('./set-json-values-as-json-dense'),
    setPathSetsAsJSONG: require('./set-json-values-as-json-graph'),
    setPathSetsAsPathMap: require('./set-json-values-as-json-sparse'),
    setPathSetsAsValues: require('./set-json-values-as-json-values'),
    
    setPathMapsAsJSON: require('./set-json-sparse-as-json-dense'),
    setPathMapsAsJSONG: require('./set-json-sparse-as-json-graph'),
    setPathMapsAsPathMap: require('./set-json-sparse-as-json-sparse'),
    setPathMapsAsValues: require('./set-json-sparse-as-json-values'),
    
    setJSONGsAsJSON: require('./set-json-graph-as-json-dense'),
    setJSONGsAsJSONG: require('./set-json-graph-as-json-graph'),
    setJSONGsAsPathMap: require('./set-json-graph-as-json-sparse'),
    setJSONGsAsValues: require('./set-json-graph-as-json-values'),
    
    setCache: require('./set-cache')
};

},{"./set-cache":86,"./set-json-graph-as-json-dense":87,"./set-json-graph-as-json-graph":88,"./set-json-graph-as-json-sparse":89,"./set-json-graph-as-json-values":90,"./set-json-sparse-as-json-dense":91,"./set-json-sparse-as-json-graph":92,"./set-json-sparse-as-json-sparse":93,"./set-json-sparse-as-json-values":94,"./set-json-values-as-json-dense":95,"./set-json-values-as-json-graph":96,"./set-json-values-as-json-sparse":97,"./set-json-values-as-json-values":98}],86:[function(require,module,exports){
module.exports = set_cache;

var $error = require("../types/error");
var $sentinel = require("../types/sentinel");

var clone = require("../support/clone-dense-json");
var array_clone = require("../support/array-clone");

var options = require("../support/options");
var walk_path_map = require("../walk/walk-path-map");

var is_object = require("../support/is-object");

var get_valid_key = require("../support/get-valid-key");
var create_branch = require("../support/create-branch");
var wrap_node = require("../support/wrap-node");
var replace_node = require("../support/replace-node");
var graph_node = require("../support/graph-node");
var update_back_refs = require("../support/update-back-refs");
var update_graph = require("../support/update-graph");
var inc_generation = require("../support/inc-generation");

var collect = require("../lru/collect");

function set_cache(model, pathmap, error_selector) {

    var roots = options([], model, error_selector);
    var nodes = roots.nodes;
    var parents = array_clone(nodes);
    var requested = [];
    var optimized = [];
    var keys_stack = [];
    
    roots[0] = roots.root;

    walk_path_map(onNode, onEdge, pathmap, keys_stack, 0, roots, parents, nodes, requested, optimized);

    collect(
        roots.lru,
        roots.expired,
        roots.version,
        roots.root.$size || 0,
        model._maxSize,
        model._collectRatio
    );

    return model;
}

function onNode(pathmap, roots, parents, nodes, requested, optimized, is_top_level, is_branch, key, keyset, is_keyset) {

    var parent;

    if (key == null) {
        if ((key = get_valid_key(optimized)) == null) {
            return;
        }
        parent = parents[0];
    } else {
        parent = nodes[0];
    }

    var node = parent[key],
        type;

    if (is_branch) {
        type = is_object(node) && node.$type || undefined;
        node = create_branch(roots, parent, node, type, key);
        parents[0] = nodes[0] = node;
        return;
    }

    var selector = roots.error_selector;
    var root = roots[0];
    var size = is_object(node) && node.$size || 0;
    var mess = pathmap;

    type = is_object(mess) && mess.$type || undefined;
    mess = wrap_node(mess, type, !!type ? mess.value : mess);
    type || (type = $sentinel);

    if (type == $error && !!selector) {
        mess = selector(requested, mess);
    }

    node = replace_node(parent, node, mess, key, roots.lru);
    node = graph_node(root, parent, node, key, inc_generation());
    update_graph(parent, size - node.$size, roots.version, roots.lru);
    nodes[0] = node;
}

function onEdge(pathmap, keys_stack, depth, roots, parents, nodes, requested, optimized, key, keyset) {

}
},{"../lru/collect":82,"../support/array-clone":100,"../support/clone-dense-json":102,"../support/create-branch":110,"../support/get-valid-key":112,"../support/graph-node":113,"../support/inc-generation":114,"../support/is-object":118,"../support/options":123,"../support/replace-node":126,"../support/update-back-refs":132,"../support/update-graph":133,"../support/wrap-node":134,"../types/error":135,"../types/sentinel":137,"../walk/walk-path-map":141}],87:[function(require,module,exports){
module.exports = set_json_graph_as_json_dense;

var $path = require("../types/path");

var clone = require("../support/clone-dense-json");
var array_clone = require("../support/array-clone");

var options = require("../support/options");
var walk_path_set = require("../walk/walk-path-set-soft-link");

var is_object = require("../support/is-object");

var get_valid_key = require("../support/get-valid-key");
var merge_node = require("../support/merge-node");

var node_as_miss = require("../support/treat-node-as-missing-path-set");
var node_as_error = require("../support/treat-node-as-error");
var clone_success = require("../support/clone-success-paths");

var collect = require("../lru/collect");

function set_json_graph_as_json_dense(model, envelopes, values, error_selector) {

    var roots = [];
    roots.offset = model._path.length;
    roots.bound = [];
    roots = options(roots, model, error_selector);
    
    var index = -1;
    var index2 = -1;
    var count = envelopes.length;
    var nodes = roots.nodes;
    var parents = array_clone(nodes);
    var requested = [];
    var optimized = [];
    var json, hasValue, hasValues;

    roots[0] = roots.root;

    while (++index < count) {
        var envelope = envelopes[index];
        var pathsets = envelope.paths;
        var jsong = envelope.jsong || envelope.values || envelope.value;
        var index3 = -1;
        var count2 = pathsets.length;
        roots[2] = jsong;
        nodes[2] = jsong;
        while (++index3 < count2) {

            json = values && values[++index2];
            if (is_object(json)) {
                roots.json = roots[3] = parents[3] = nodes[3] = json.json || (json.json = {});
            } else {
                roots.json = roots[3] = parents[3] = nodes[3] = undefined;
            }

            var pathset = pathsets[index3];
            roots.index = index3;

            walk_path_set(onNode, onEdge, pathset, 0, roots, parents, nodes, requested, optimized);

            hasValue = roots.hasValue;
            if (!!hasValue) {
                hasValues = true;
                if (is_object(json)) {
                    json.json = roots.json;
                }
                delete roots.json;
                delete roots.hasValue;
            } else if (is_object(json)) {
                delete json.json;
            }
        }
    }

    collect(
        roots.lru,
        roots.expired,
        roots.version,
        roots.root.$size || 0,
        model._maxSize,
        model._collectRatio
    );

    return {
        values: values,
        errors: roots.errors,
        requestedPaths: roots.requestedPaths,
        optimizedPaths: roots.optimizedPaths,
        requestedMissingPaths: roots.requestedMissingPaths,
        optimizedMissingPaths: roots.optimizedMissingPaths
    };
}

function onNode(pathset, roots, parents, nodes, requested, optimized, is_top_level, is_branch, key, keyset, is_keyset) {

    var parent, messageParent, json;

    if (key == null) {
        if ((key = get_valid_key(optimized)) == null) {
            return;
        }
        json = parents[3];
        parent = parents[0];
        messageParent = parents[2];
    } else {
        json = is_keyset && nodes[3] || parents[3];
        parent = nodes[0];
        messageParent = nodes[2];
    }

    var node = parent[key];
    var message = messageParent && messageParent[key];

    nodes[2] = message;
    nodes[0] = node = merge_node(roots, parent, node, messageParent, message, key);

    if (!is_top_level) {
        parents[0] = parent;
        parents[2] = messageParent;
        return;
    }

    var length = requested.length;
    var offset = roots.offset;
    
    parents[3] = json;
    
    if (is_branch) {
        parents[0] = node;
        parents[2] = message;
        if ((length > offset) && is_keyset && !!json) {
            nodes[3] = json[keyset] || (json[keyset] = {});
        }
    }
}

function onEdge(pathset, depth, roots, parents, nodes, requested, optimized, key, keyset) {

    var json;
    var node = nodes[0];
    var type = is_object(node) && node.$type || (node = undefined);

    if (node_as_miss(roots, node, type, pathset, depth, requested, optimized) === false) {
        clone_success(roots, requested, optimized);
        if (node_as_error(roots, node, type, requested) === false) {
            if(keyset == null) {
                roots.json = clone(roots, node, type, node && node.value);
            } else if(!!(json = parents[3])) {
                json[keyset] = clone(roots, node, type, node && node.value);
            }
            roots.hasValue = true;
        }
    }
}

},{"../lru/collect":82,"../support/array-clone":100,"../support/clone-dense-json":102,"../support/clone-success-paths":108,"../support/get-valid-key":112,"../support/is-object":118,"../support/merge-node":121,"../support/options":123,"../support/treat-node-as-error":128,"../support/treat-node-as-missing-path-set":130,"../types/path":136,"../walk/walk-path-set-soft-link":142}],88:[function(require,module,exports){
module.exports = set_json_graph_as_json_graph;

var $path = require("../types/path");

var clone = require("../support/clone-graph-json");
var array_clone = require("../support/array-clone");

var options = require("../support/options");
var walk_path_set = require("../walk/walk-path-set-soft-link");

var is_object = require("../support/is-object");

var get_valid_key = require("../support/get-valid-key");
var merge_node = require("../support/merge-node");

var node_as_miss = require("../support/treat-node-as-missing-path-set");
var node_as_error = require("../support/treat-node-as-error");
var clone_success = require("../support/clone-success-paths");

var promote = require("../lru/promote");
var collect = require("../lru/collect");

function set_json_graph_as_json_graph(model, envelopes, values, error_selector) {

    var roots = [];
    roots.offset = 0;
    roots.bound = [];
    roots = options(roots, model, error_selector);

    var index = -1;
    var count = envelopes.length;
    var nodes = roots.nodes;
    var parents = array_clone(nodes);
    var requested = [];
    var optimized = [];
    var json = values[0];
    var hasValue;

    roots[0] = roots.root;
    roots[1] = parents[1] = nodes[1] = json.jsong || (json.jsong = {});
    roots.requestedPaths = json.paths || (json.paths = roots.requestedPaths);

    while (++index < count) {
        var envelope = envelopes[index];
        var pathsets = envelope.paths;
        var jsong = envelope.jsong || envelope.values || envelope.value;
        var index2 = -1;
        var count2 = pathsets.length;
        roots[2] = jsong;
        nodes[2] = jsong;
        while (++index2 < count2) {
            var pathset = pathsets[index2];
            walk_path_set(onNode, onEdge, pathset, 0, roots, parents, nodes, requested, optimized);
        }
    }

    hasValue = roots.hasValue;
    if(hasValue) {
        json.jsong = roots[1];
    } else {
        delete json.jsong;
        delete json.paths;
    }

    collect(
        roots.lru,
        roots.expired,
        roots.version,
        roots.root.$size || 0,
        model._maxSize,
        model._collectRatio
    );

    return {
        values: values,
        errors: roots.errors,
        requestedPaths: roots.requestedPaths,
        optimizedPaths: roots.optimizedPaths,
        requestedMissingPaths: roots.requestedMissingPaths,
        optimizedMissingPaths: roots.optimizedMissingPaths
    };
}

function onNode(pathset, roots, parents, nodes, requested, optimized, is_top_level, is_branch, key, keyset, is_keyset) {

    var parent, messageParent, json, jsonkey;

    if (key == null) {
        if ((key = get_valid_key(optimized)) == null) {
            return;
        }
        json = parents[1];
        parent = parents[0];
        messageParent = parents[2];
    } else {
        json = nodes[1];
        parent = nodes[0];
        messageParent = nodes[2];
    }

    var jsonkey = key;
    var node = parent[key];
    var message = messageParent && messageParent[key];

    nodes[2] = message;
    nodes[0] = node = merge_node(roots, parent, node, messageParent, message, key);

    if (!is_top_level) {
        parents[0] = parent;
        parents[2] = messageParent;
        parents[1] = json;
        nodes[1] = json[jsonkey] || (json[jsonkey] = {});
        return;
    }

    var type = is_object(node) && node.$type || undefined;

    if (is_branch) {
        parents[0] = node;
        parents[2] = message;
        parents[1] = json;
        if (type == $path) {
            json[jsonkey] = clone(roots, node, type, node.value);
            roots.hasValue = true;
        } else {
            nodes[1] = json[jsonkey] || (json[jsonkey] = {});
        }
        return;
    }

    json[jsonkey] = clone(roots, node, type, node && node.value);
    roots.hasValue = true;
}

function onEdge(pathset, depth, roots, parents, nodes, requested, optimized, key, keyset) {

    var json;
    var node = nodes[0];
    var type = is_object(node) && node.$type || (node = undefined);

    if (node_as_miss(roots, node, type, pathset, depth, requested, optimized) === false) {
        clone_success(roots, requested, optimized);
        promote(roots.lru, node);
        if (keyset == null && !roots.hasValue && (keyset = get_valid_key(optimized)) == null) {
            node = clone(roots, node, type, node && node.value);
            json = roots[1];
            json.$type = node.$type;
            json.value = node.value;
        }
        roots.hasValue = true;
    }
}

},{"../lru/collect":82,"../lru/promote":83,"../support/array-clone":100,"../support/clone-graph-json":103,"../support/clone-success-paths":108,"../support/get-valid-key":112,"../support/is-object":118,"../support/merge-node":121,"../support/options":123,"../support/treat-node-as-error":128,"../support/treat-node-as-missing-path-set":130,"../types/path":136,"../walk/walk-path-set-soft-link":142}],89:[function(require,module,exports){
module.exports = set_json_graph_as_json_sparse;

var $path = require("../types/path");

var clone = require("../support/clone-dense-json");
var array_clone = require("../support/array-clone");

var options = require("../support/options");
var walk_path_set = require("../walk/walk-path-set-soft-link");

var is_object = require("../support/is-object");

var get_valid_key = require("../support/get-valid-key");
var merge_node = require("../support/merge-node");

var node_as_miss = require("../support/treat-node-as-missing-path-set");
var node_as_error = require("../support/treat-node-as-error");
var clone_success = require("../support/clone-success-paths");

var collect = require("../lru/collect");

function set_json_graph_as_json_sparse(model, envelopes, values, error_selector) {

    var roots = [];
    roots.offset = model._path.length;
    roots.bound = [];
    roots = options(roots, model, error_selector);

    var index = -1;
    var count = envelopes.length;
    var nodes = roots.nodes;
    var parents = array_clone(nodes);
    var requested = [];
    var optimized = [];
    var json = values[0];
    var hasValue;

    roots[0] = roots.root;
    roots[3] = parents[3] = nodes[3] = json.json || (json.json = {});

    while (++index < count) {
        var envelope = envelopes[index];
        var pathsets = envelope.paths;
        var jsong = envelope.jsong || envelope.values || envelope.value;
        var index2 = -1;
        var count2 = pathsets.length;
        roots[2] = jsong;
        nodes[2] = jsong;
        while (++index2 < count2) {
            var pathset = pathsets[index2];
            walk_path_set(onNode, onEdge, pathset, 0, roots, parents, nodes, requested, optimized);
        }
    }

    hasValue = roots.hasValue;
    if(hasValue) {
        json.json = roots[3];
    } else {
        delete json.json;
    }

    collect(
        roots.lru,
        roots.expired,
        roots.version,
        roots.root.$size || 0,
        model._maxSize,
        model._collectRatio
    );

    return {
        values: values,
        errors: roots.errors,
        requestedPaths: roots.requestedPaths,
        optimizedPaths: roots.optimizedPaths,
        requestedMissingPaths: roots.requestedMissingPaths,
        optimizedMissingPaths: roots.optimizedMissingPaths
    };
}

function onNode(pathset, roots, parents, nodes, requested, optimized, is_top_level, is_branch, key, keyset, is_keyset) {

    var parent, messageParent, json, jsonkey;

    if (key == null) {
        if ((key = get_valid_key(optimized)) == null) {
            return;
        }
        jsonkey = get_valid_key(requested);
        json = parents[3];
        parent = parents[0];
        messageParent = parents[2];
    } else {
        jsonkey = key;
        json = nodes[3];
        parent = nodes[0];
        messageParent = nodes[2];
    }

    var node = parent[key];
    var message = messageParent && messageParent[key];

    nodes[2] = message;
    nodes[0] = node = merge_node(roots, parent, node, messageParent, message, key);

    if (!is_top_level) {
        parents[0] = parent;
        parents[2] = messageParent;
        return;
    }

    parents[3] = json;

    if (is_branch) {
        var length = requested.length;
        var offset = roots.offset;
        var type = is_object(node) && node.$type || undefined;

        parents[0] = node;
        parents[2] = message;
        if ((length > offset) && (!type || type == $path)) {
            nodes[3] = json[jsonkey] || (json[jsonkey] = {});
        }
    }
}

function onEdge(pathset, depth, roots, parents, nodes, requested, optimized, key, keyset) {

    var json;
    var node = nodes[0];
    var type = is_object(node) && node.$type || (node = undefined);

    if (node_as_miss(roots, node, type, pathset, depth, requested, optimized) === false) {
        clone_success(roots, requested, optimized);
        if (node_as_error(roots, node, type, requested) === false) {
            if (keyset == null && !roots.hasValue && (keyset = get_valid_key(optimized)) == null) {
                node = clone(roots, node, type, node && node.value);
                json = roots[3];
                json.$type = node.$type;
                json.value = node.value;
            } else {
                json = parents[3];
                json[key] = clone(roots, node, type, node && node.value);
            }
            roots.hasValue = true;
        }
    }
}

},{"../lru/collect":82,"../support/array-clone":100,"../support/clone-dense-json":102,"../support/clone-success-paths":108,"../support/get-valid-key":112,"../support/is-object":118,"../support/merge-node":121,"../support/options":123,"../support/treat-node-as-error":128,"../support/treat-node-as-missing-path-set":130,"../types/path":136,"../walk/walk-path-set-soft-link":142}],90:[function(require,module,exports){
module.exports = set_json_graph_as_json_values;

var $path = require("../types/path");

var clone = require("../support/clone-dense-json");
var array_clone = require("../support/array-clone");
var array_slice = require("../support/array-slice");

var options = require("../support/options");
var walk_path_set = require("../walk/walk-path-set-soft-link");

var is_object = require("../support/is-object");

var get_valid_key = require("../support/get-valid-key");
var merge_node = require("../support/merge-node");

var node_as_miss = require("../support/treat-node-as-missing-path-set");
var node_as_error = require("../support/treat-node-as-error");
var clone_success = require("../support/clone-success-paths");

var collect = require("../lru/collect");

function set_json_graph_as_json_values(model, envelopes, onNext, error_selector) {

    var roots = [];
    roots.offset = model._path.length;
    roots.bound = [];
    roots = options(roots, model, error_selector);

    var index = -1;
    var count = envelopes.length;
    var nodes = roots.nodes;
    var parents = array_clone(nodes);
    var requested = [];
    var optimized = [];

    roots[0] = roots.root;
    roots.onNext = onNext;

    while (++index < count) {
        var envelope = envelopes[index];
        var pathsets = envelope.paths;
        var jsong = envelope.jsong || envelope.values || envelope.value;
        var index2 = -1;
        var count2 = pathsets.length;
        roots[2] = jsong;
        nodes[2] = jsong;
        while (++index2 < count2) {
            var pathset = pathsets[index2];
            walk_path_set(onNode, onEdge, pathset, 0, roots, parents, nodes, requested, optimized);
        }
    }

    collect(
        roots.lru,
        roots.expired,
        roots.version,
        roots.root.$size || 0,
        model._maxSize,
        model._collectRatio
    );

    return {
        values: null,
        errors: roots.errors,
        requestedPaths: roots.requestedPaths,
        optimizedPaths: roots.optimizedPaths,
        requestedMissingPaths: roots.requestedMissingPaths,
        optimizedMissingPaths: roots.optimizedMissingPaths
    };
}

function onNode(pathset, roots, parents, nodes, requested, optimized, is_top_level, is_branch, key, keyset) {

    var parent, messageParent;

    if (key == null) {
        if ((key = get_valid_key(optimized)) == null) {
            return;
        }
        parent = parents[0];
        messageParent = parents[2];
    } else {
        parent = nodes[0];
        messageParent = nodes[2];
    }

    var node = parent[key];
    var message = messageParent && messageParent[key];

    nodes[2] = message;
    nodes[0] = node = merge_node(roots, parent, node, messageParent, message, key);

    if (!is_top_level) {
        parents[0] = parent;
        parents[2] = messageParent;
        return;
    }

    if (is_branch) {
        parents[0] = node;
        parents[2] = message;
    }
}

function onEdge(pathset, depth, roots, parents, nodes, requested, optimized, key, keyset, is_keyset) {

    var node = nodes[0];
    var type = is_object(node) && node.$type || (node = undefined);

    if (node_as_miss(roots, node, type, pathset, depth, requested, optimized) === false) {
        clone_success(roots, requested, optimized);
        if (node_as_error(roots, node, type, requested) === false) {
            roots.onNext({
                path: array_slice(requested, roots.offset),
                value: clone(roots, node, type, node && node.value)
            });
        }
    }
}

},{"../lru/collect":82,"../support/array-clone":100,"../support/array-slice":101,"../support/clone-dense-json":102,"../support/clone-success-paths":108,"../support/get-valid-key":112,"../support/is-object":118,"../support/merge-node":121,"../support/options":123,"../support/treat-node-as-error":128,"../support/treat-node-as-missing-path-set":130,"../types/path":136,"../walk/walk-path-set-soft-link":142}],91:[function(require,module,exports){
module.exports = set_json_sparse_as_json_dense;

var $path = require("../types/path");
var $error = require("../types/error");
var $sentinel = require("../types/sentinel");

var clone = require("../support/clone-dense-json");
var array_clone = require("../support/array-clone");

var options = require("../support/options");
var walk_path_map = require("../walk/walk-path-map");

var is_object = require("../support/is-object");

var get_valid_key = require("../support/get-valid-key");
var create_branch = require("../support/create-branch");
var wrap_node = require("../support/wrap-node");
var replace_node = require("../support/replace-node");
var graph_node = require("../support/graph-node");
var update_back_refs = require("../support/update-back-refs");
var update_graph = require("../support/update-graph");
var inc_generation = require("../support/inc-generation");

var node_as_miss = require("../support/treat-node-as-missing-path-map");
var node_as_error = require("../support/treat-node-as-error");
var clone_success = require("../support/clone-success-paths");

var collect = require("../lru/collect");

function set_json_sparse_as_json_dense(model, pathmaps, values, error_selector) {

    var roots = options([], model, error_selector);
    var index = -1;
    var count = pathmaps.length;
    var nodes = roots.nodes;
    var parents = array_clone(nodes);
    var requested = [];
    var optimized = [];
    var keys_stack = [];
    var json, hasValue, hasValues;

    roots[0] = roots.root;

    while (++index < count) {

        json = values && values[index];
        if (is_object(json)) {
            roots.json = roots[3] = parents[3] = nodes[3] = json.json || (json.json = {})
        } else {
            roots.json = roots[3] = parents[3] = nodes[3] = undefined;
        }

        var pathmap = pathmaps[index];
        roots.index = index;

        walk_path_map(onNode, onEdge, pathmap, keys_stack, 0, roots, parents, nodes, requested, optimized);

        hasValue = roots.hasValue;
        if (!!hasValue) {
            hasValues = true;
            if (is_object(json)) {
                json.json = roots.json;
            }
            delete roots.json;
            delete roots.hasValue;
        } else if (is_object(json)) {
            delete json.json;
        }
    }

    collect(
        roots.lru,
        roots.expired,
        roots.version,
        roots.root.$size || 0,
        model._maxSize,
        model._collectRatio
    );

    return {
        values: values,
        errors: roots.errors,
        hasValue: hasValues,
        requestedPaths: roots.requestedPaths,
        optimizedPaths: roots.optimizedPaths,
        requestedMissingPaths: roots.requestedMissingPaths,
        optimizedMissingPaths: roots.optimizedMissingPaths
    };
}

function onNode(pathmap, roots, parents, nodes, requested, optimized, is_top_level, is_branch, key, keyset, is_keyset) {

    var parent, json;

    if (key == null) {
        if ((key = get_valid_key(optimized)) == null) {
            return;
        }
        json = parents[3];
        parent = parents[0];
    } else {
        json = is_keyset && nodes[3] || parents[3];
        parent = nodes[0];
    }

    var node = parent[key],
        type;

    if (!is_top_level) {
        type = is_object(node) && node.$type || undefined;
        type = type && is_branch && "." || type;
        node = create_branch(roots, parent, node, type, key);
        parents[0] = parent;
        nodes[0] = node;
        return;
    }

    parents[3] = json;

    if (is_branch) {
        type = is_object(node) && node.$type || undefined;
        node = create_branch(roots, parent, node, type, key);
        parents[0] = nodes[0] = node;
        if (is_keyset && !!json) {
            nodes[3] = json[keyset] || (json[keyset] = {});
        }
        return;
    }

    var selector = roots.error_selector;
    var root = roots[0];
    var size = is_object(node) && node.$size || 0;
    var mess = pathmap;

    type = is_object(mess) && mess.$type || undefined;
    mess = wrap_node(mess, type, !!type ? mess.value : mess);
    type || (type = $sentinel);

    if (type == $error && !!selector) {
        mess = selector(requested, mess);
    }

    node = replace_node(parent, node, mess, key, roots.lru);
    node = graph_node(root, parent, node, key, inc_generation());
    update_graph(parent, size - node.$size, roots.version, roots.lru);
    nodes[0] = node;
}

function onEdge(pathmap, keys_stack, depth, roots, parents, nodes, requested, optimized, key, keyset) {

    var json;
    var node = nodes[0];
    var type = is_object(node) && node.$type || (node = undefined);

    if (node_as_miss(roots, node, type, pathmap, keys_stack, depth, requested, optimized) === false) {
        clone_success(roots, requested, optimized);
        if (node_as_error(roots, node, type, requested) === false) {
            if(keyset == null) {
                roots.json = clone(roots, node, type, node && node.value);
            } else if(!!(json = parents[3])) {
                json[keyset] = clone(roots, node, type, node && node.value);
            }
            roots.hasValue = true;
        }
    }
}
},{"../lru/collect":82,"../support/array-clone":100,"../support/clone-dense-json":102,"../support/clone-success-paths":108,"../support/create-branch":110,"../support/get-valid-key":112,"../support/graph-node":113,"../support/inc-generation":114,"../support/is-object":118,"../support/options":123,"../support/replace-node":126,"../support/treat-node-as-error":128,"../support/treat-node-as-missing-path-map":129,"../support/update-back-refs":132,"../support/update-graph":133,"../support/wrap-node":134,"../types/error":135,"../types/path":136,"../types/sentinel":137,"../walk/walk-path-map":141}],92:[function(require,module,exports){
module.exports = set_json_sparse_as_json_graph;

var $path = require("../types/path");
var $error = require("../types/error");
var $sentinel = require("../types/sentinel");

var clone = require("../support/clone-graph-json");
var array_clone = require("../support/array-clone");

var options = require("../support/options");
var walk_path_map = require("../walk/walk-path-map-soft-link");

var is_object = require("../support/is-object");

var get_valid_key = require("../support/get-valid-key");
var create_branch = require("../support/create-branch");
var wrap_node = require("../support/wrap-node");
var replace_node = require("../support/replace-node");
var graph_node = require("../support/graph-node");
var update_back_refs = require("../support/update-back-refs");
var update_graph = require("../support/update-graph");
var inc_generation = require("../support/inc-generation");

var node_as_miss = require("../support/treat-node-as-missing-path-map");
var node_as_error = require("../support/treat-node-as-error");
var clone_success = require("../support/clone-success-paths");

var promote = require("../lru/promote");
var collect = require("../lru/collect");

function set_json_sparse_as_json_graph(model, pathmaps, values, error_selector) {

    var roots = options([], model, error_selector);
    var index = -1;
    var count = pathmaps.length;
    var nodes = roots.nodes;
    var parents = array_clone(nodes);
    var requested = [];
    var optimized = [];
    var keys_stack = [];
    var json = values[0];
    var hasValue;

    roots[0] = roots.root;
    roots[1] = parents[1] = nodes[1] = json.jsong || (json.jsong = {});
    roots.requestedPaths = json.paths || (json.paths = roots.requestedPaths);

    while (++index < count) {
        var pathmap = pathmaps[index];
        walk_path_map(onNode, onEdge, pathmap, keys_stack, 0, roots, parents, nodes, requested, optimized);
    }

    hasValue = roots.hasValue;
    if(hasValue) {
        json.jsong = roots[1];
    } else {
        delete json.jsong;
        delete json.paths;
    }

    collect(
        roots.lru,
        roots.expired,
        roots.version,
        roots.root.$size || 0,
        model._maxSize,
        model._collectRatio
    );

    return {
        values: values,
        errors: roots.errors,
        hasValue: hasValue,
        requestedPaths: roots.requestedPaths,
        optimizedPaths: roots.optimizedPaths,
        requestedMissingPaths: roots.requestedMissingPaths,
        optimizedMissingPaths: roots.optimizedMissingPaths
    };
}

function onNode(pathmap, roots, parents, nodes, requested, optimized, is_top_level, is_branch, key, keyset, is_keyset) {

    var parent, json;

    if (key == null) {
        if ((key = get_valid_key(optimized)) == null) {
            return;
        }
        json = parents[1];
        parent = parents[0];
    } else {
        json = nodes[1];
        parent = nodes[0];
    }

    var jsonkey = key;
    var node = parent[key],
        type;

    if (!is_top_level) {
        type = is_object(node) && node.$type || undefined;
        type = type && is_branch && "." || type;
        node = create_branch(roots, parent, node, type, key);
        parents[0] = parent;
        nodes[0] = node;
        parents[1] = json;
        if (type == $path) {
            json[jsonkey] = clone(roots, node, type, node.value);
            roots.hasValue = true;
        } else {
            nodes[1] = json[jsonkey] || (json[jsonkey] = {});
        }
        return;
    }

    if (is_branch) {
        type = is_object(node) && node.$type || undefined;
        node = create_branch(roots, parent, node, type, key);
        type = node.$type;
        parents[0] = nodes[0] = node;
        parents[1] = json;
        if (type == $path) {
            json[jsonkey] = clone(roots, node, type, node.value);
            roots.hasValue = true;
        } else {
            nodes[1] = json[jsonkey] || (json[jsonkey] = {});
        }
        return;
    }

    var selector = roots.error_selector;
    var root = roots[0];
    var size = is_object(node) && node.$size || 0;
    var mess = pathmap;

    type = is_object(mess) && mess.$type || undefined;
    mess = wrap_node(mess, type, !!type ? mess.value : mess);
    type || (type = $sentinel);

    if (type == $error && !!selector) {
        mess = selector(requested, mess);
    }

    node = replace_node(parent, node, mess, key, roots.lru);
    node = graph_node(root, parent, node, key, inc_generation());
    update_graph(parent, size - node.$size, roots.version, roots.lru);
    nodes[0] = node;

    json[jsonkey] = clone(roots, node, type, node && node.value);
    roots.hasValue = true;
}

function onEdge(pathmap, keys_stack, depth, roots, parents, nodes, requested, optimized, key, keyset) {

    var json;
    var node = nodes[0];
    var type = is_object(node) && node.$type || (node = undefined);

    if (node_as_miss(roots, node, type, pathmap, keys_stack, depth, requested, optimized) === false) {
        clone_success(roots, requested, optimized);
        promote(roots.lru, node);
        if (keyset == null && !roots.hasValue && (keyset = get_valid_key(optimized)) == null) {
            node = clone(roots, node, type, node && node.value);
            json = roots[1];
            json.$type = node.$type;
            json.value = node.value;
        }
        roots.hasValue = true;
    }
}
},{"../lru/collect":82,"../lru/promote":83,"../support/array-clone":100,"../support/clone-graph-json":103,"../support/clone-success-paths":108,"../support/create-branch":110,"../support/get-valid-key":112,"../support/graph-node":113,"../support/inc-generation":114,"../support/is-object":118,"../support/options":123,"../support/replace-node":126,"../support/treat-node-as-error":128,"../support/treat-node-as-missing-path-map":129,"../support/update-back-refs":132,"../support/update-graph":133,"../support/wrap-node":134,"../types/error":135,"../types/path":136,"../types/sentinel":137,"../walk/walk-path-map-soft-link":140}],93:[function(require,module,exports){
module.exports = set_json_sparse_as_json_sparse;

var $path = require("../types/path");
var $error = require("../types/error");
var $sentinel = require("../types/sentinel");

var clone = require("../support/clone-dense-json");
var array_clone = require("../support/array-clone");

var options = require("../support/options");
var walk_path_map = require("../walk/walk-path-map");

var is_object = require("../support/is-object");

var get_valid_key = require("../support/get-valid-key");
var create_branch = require("../support/create-branch");
var wrap_node = require("../support/wrap-node");
var replace_node = require("../support/replace-node");
var graph_node = require("../support/graph-node");
var update_back_refs = require("../support/update-back-refs");
var update_graph = require("../support/update-graph");
var inc_generation = require("../support/inc-generation");

var node_as_miss = require("../support/treat-node-as-missing-path-map");
var node_as_error = require("../support/treat-node-as-error");
var clone_success = require("../support/clone-success-paths");

var collect = require("../lru/collect");

function set_json_sparse_as_json_sparse(model, pathmaps, values, error_selector) {

    var roots = options([], model, error_selector);
    var index = -1;
    var count = pathmaps.length;
    var nodes = roots.nodes;
    var parents = array_clone(nodes);
    var requested = [];
    var optimized = [];
    var keys_stack = [];
    var json = values[0];
    var hasValue;

    roots[0] = roots.root;
    roots[3] = parents[3] = nodes[3] = json.json || (json.json = {});

    while (++index < count) {
        var pathmap = pathmaps[index];
        walk_path_map(onNode, onEdge, pathmap, keys_stack, 0, roots, parents, nodes, requested, optimized);
    }

    hasValue = roots.hasValue;
    if(hasValue) {
        json.json = roots[3];
    } else {
        delete json.json;
    }

    collect(
        roots.lru,
        roots.expired,
        roots.version,
        roots.root.$size || 0,
        model._maxSize,
        model._collectRatio
    );

    return {
        values: values,
        errors: roots.errors,
        hasValue: hasValue,
        requestedPaths: roots.requestedPaths,
        optimizedPaths: roots.optimizedPaths,
        requestedMissingPaths: roots.requestedMissingPaths,
        optimizedMissingPaths: roots.optimizedMissingPaths
    };
}

function onNode(pathmap, roots, parents, nodes, requested, optimized, is_top_level, is_branch, key, keyset, is_keyset) {

    var parent, json, jsonkey;

    if (key == null) {
        if ((key = get_valid_key(optimized)) == null) {
            return;
        }
        jsonkey = get_valid_key(requested);
        json = parents[3];
        parent = parents[0];
    } else {
        jsonkey = key;
        json = nodes[3];
        parent = nodes[0];
    }

    var node = parent[key],
        type;

    if (!is_top_level) {
        type = is_object(node) && node.$type || undefined;
        type = type && is_branch && "." || type;
        node = create_branch(roots, parent, node, type, key);
        parents[0] = parent;
        nodes[0] = node;
        return;
    }
    
    parents[3] = json;
    
    if (is_branch) {
        type = is_object(node) && node.$type || undefined;
        node = create_branch(roots, parent, node, type, key);
        parents[0] = nodes[0] = node;
        nodes[3] = json[jsonkey] || (json[jsonkey] = {});
        return;
    }

    var selector = roots.error_selector;
    var root = roots[0];
    var size = is_object(node) && node.$size || 0;
    var mess = pathmap;

    type = is_object(mess) && mess.$type || undefined;
    mess = wrap_node(mess, type, !!type ? mess.value : mess);
    type || (type = $sentinel);

    if (type == $error && !!selector) {
        mess = selector(requested, mess);
    }

    node = replace_node(parent, node, mess, key, roots.lru);
    node = graph_node(root, parent, node, key, inc_generation());
    update_graph(parent, size - node.$size, roots.version, roots.lru);
    nodes[0] = node;
}

function onEdge(pathmap, keys_stack, depth, roots, parents, nodes, requested, optimized, key, keyset) {

    var json;
    var node = nodes[0];
    var type = is_object(node) && node.$type || (node = undefined);

    if (node_as_miss(roots, node, type, pathmap, keys_stack, depth, requested, optimized) === false) {
        clone_success(roots, requested, optimized);
        if (node_as_error(roots, node, type, requested) === false) {
            if (keyset == null && !roots.hasValue && (keyset = get_valid_key(optimized)) == null) {
                node = clone(roots, node, type, node && node.value);
                json = roots[3];
                json.$type = node.$type;
                json.value = node.value;
            } else {
                json = parents[3];
                json[key] = clone(roots, node, type, node && node.value);
            }
            roots.hasValue = true;
        }
    }
}
},{"../lru/collect":82,"../support/array-clone":100,"../support/clone-dense-json":102,"../support/clone-success-paths":108,"../support/create-branch":110,"../support/get-valid-key":112,"../support/graph-node":113,"../support/inc-generation":114,"../support/is-object":118,"../support/options":123,"../support/replace-node":126,"../support/treat-node-as-error":128,"../support/treat-node-as-missing-path-map":129,"../support/update-back-refs":132,"../support/update-graph":133,"../support/wrap-node":134,"../types/error":135,"../types/path":136,"../types/sentinel":137,"../walk/walk-path-map":141}],94:[function(require,module,exports){
module.exports = set_path_map_as_json_values;

var $error = require("../types/error");
var $sentinel = require("../types/sentinel");

var clone = require("../support/clone-dense-json");
var array_clone = require("../support/array-clone");

var options = require("../support/options");
var walk_path_map = require("../walk/walk-path-map");

var is_object = require("../support/is-object");

var get_valid_key = require("../support/get-valid-key");
var create_branch = require("../support/create-branch");
var wrap_node = require("../support/wrap-node");
var replace_node = require("../support/replace-node");
var graph_node = require("../support/graph-node");
var update_back_refs = require("../support/update-back-refs");
var update_graph = require("../support/update-graph");
var inc_generation = require("../support/inc-generation");

var node_as_miss = require("../support/treat-node-as-missing-path-map");
var node_as_error = require("../support/treat-node-as-error");
var clone_success = require("../support/clone-success-paths");

var collect = require("../lru/collect");

function set_path_map_as_json_values(model, pathmaps, onNext, error_selector) {

    var roots = options([], model, error_selector);
    var index = -1;
    var count = pathmaps.length;
    var nodes = roots.nodes;
    var parents = array_clone(nodes);
    var requested = [];
    var optimized = [];
    var keys_stack = [];
    roots[0] = roots.root;
    roots.onNext = onNext;

    while (++index < count) {
        var pathmap = pathmaps[index];
        walk_path_map(onNode, onEdge, pathmap, keys_stack, 0, roots, parents, nodes, requested, optimized);
    }

    collect(
        roots.lru,
        roots.expired,
        roots.version,
        roots.root.$size || 0,
        model._maxSize,
        model._collectRatio
    );

    return {
        values: null,
        errors: roots.errors,
        requestedPaths: roots.requestedPaths,
        optimizedPaths: roots.optimizedPaths,
        requestedMissingPaths: roots.requestedMissingPaths,
        optimizedMissingPaths: roots.optimizedMissingPaths
    };
}

function onNode(pathmap, roots, parents, nodes, requested, optimized, is_top_level, is_branch, key, keyset, is_keyset) {

    var parent;

    if (key == null) {
        if ((key = get_valid_key(optimized)) == null) {
            return;
        }
        parent = parents[0];
    } else {
        parent = nodes[0];
    }

    var node = parent[key],
        type;

    if (!is_top_level) {
        type = is_object(node) && node.$type || undefined;
        type = type && is_branch && "." || type;
        node = create_branch(roots, parent, node, type, key);
        parents[0] = parent;
        nodes[0] = node;
        return;
    }

    if (is_branch) {
        type = is_object(node) && node.$type || undefined;
        node = create_branch(roots, parent, node, type, key);
        parents[0] = nodes[0] = node;
        return;
    }

    var selector = roots.error_selector;
    var root = roots[0];
    var size = is_object(node) && node.$size || 0;
    var mess = pathmap;

    type = is_object(mess) && mess.$type || undefined;
    mess = wrap_node(mess, type, !!type ? mess.value : mess);
    type || (type = $sentinel);

    if (type == $error && !!selector) {
        mess = selector(requested, mess);
    }

    node = replace_node(parent, node, mess, key, roots.lru);
    node = graph_node(root, parent, node, key, inc_generation());
    update_graph(parent, size - node.$size, roots.version, roots.lru);
    nodes[0] = node;
}

function onEdge(pathmap, keys_stack, depth, roots, parents, nodes, requested, optimized, key, keyset) {

    var node = nodes[0];
    var type = is_object(node) && node.$type || (node = undefined);

    if (node_as_miss(roots, node, type, pathmap, keys_stack, depth, requested, optimized) === false) {
        clone_success(roots, requested, optimized);
        if (node_as_error(roots, node, type, requested) === false) {
            roots.onNext({
                path: array_clone(requested),
                value: clone(roots, node, type, node && node.value)
            });
        }
    }
}
},{"../lru/collect":82,"../support/array-clone":100,"../support/clone-dense-json":102,"../support/clone-success-paths":108,"../support/create-branch":110,"../support/get-valid-key":112,"../support/graph-node":113,"../support/inc-generation":114,"../support/is-object":118,"../support/options":123,"../support/replace-node":126,"../support/treat-node-as-error":128,"../support/treat-node-as-missing-path-map":129,"../support/update-back-refs":132,"../support/update-graph":133,"../support/wrap-node":134,"../types/error":135,"../types/sentinel":137,"../walk/walk-path-map":141}],95:[function(require,module,exports){
module.exports = set_json_values_as_json_dense;

var $path = require("../types/path");
var $error = require("../types/error");
var $sentinel = require("../types/sentinel");

var clone = require("../support/clone-dense-json");
var array_clone = require("../support/array-clone");

var options = require("../support/options");
var walk_path_set = require("../walk/walk-path-set");

var is_object = require("../support/is-object");

var get_valid_key = require("../support/get-valid-key");
var create_branch = require("../support/create-branch");
var wrap_node = require("../support/wrap-node");
var invalidate_node = require("../support/invalidate-node");
var replace_node = require("../support/replace-node");
var graph_node = require("../support/graph-node");
var update_back_refs = require("../support/update-back-refs");
var update_graph = require("../support/update-graph");
var inc_generation = require("../support/inc-generation");

var node_as_miss = require("../support/treat-node-as-missing-path-set");
var node_as_error = require("../support/treat-node-as-error");
var clone_success = require("../support/clone-success-paths");

var collect = require("../lru/collect");

function set_json_values_as_json_dense(model, pathvalues, values, error_selector) {

    var roots = options([], model, error_selector);
    var index = -1;
    var count = pathvalues.length;
    var nodes = roots.nodes;
    var parents = array_clone(nodes);
    var requested = [];
    var optimized = [];
    var json, hasValue, hasValues;

    roots[0] = roots.root;

    while (++index < count) {

        json = values && values[index];
        if (is_object(json)) {
            roots.json = roots[3] = parents[3] = nodes[3] = json.json || (json.json = {})
        } else {
            roots.json = roots[3] = parents[3] = nodes[3] = undefined;
        }

        var pv = pathvalues[index];
        var pathset = pv.path;
        roots.value = pv.value;
        roots.index = index;

        walk_path_set(onNode, onEdge, pathset, 0, roots, parents, nodes, requested, optimized);

        hasValue = roots.hasValue;
        if (!!hasValue) {
            hasValues = true;
            if (is_object(json)) {
                json.json = roots.json;
            }
            delete roots.json;
            delete roots.hasValue;
        } else if (is_object(json)) {
            delete json.json;
        }
    }

    collect(
        roots.lru,
        roots.expired,
        roots.version,
        roots.root.$size || 0,
        model._maxSize,
        model._collectRatio
    );

    return {
        values: values,
        errors: roots.errors,
        hasValue: hasValues,
        requestedPaths: roots.requestedPaths,
        optimizedPaths: roots.optimizedPaths,
        requestedMissingPaths: roots.requestedMissingPaths,
        optimizedMissingPaths: roots.optimizedMissingPaths
    };
}

function onNode(pathset, roots, parents, nodes, requested, optimized, is_top_level, is_branch, key, keyset, is_keyset) {

    var parent, json;

    if (key == null) {
        if ((key = get_valid_key(optimized)) == null) {
            return;
        }
        json = parents[3];
        parent = parents[0];
    } else {
        json = is_keyset && nodes[3] || parents[3];
        parent = nodes[0];
    }

    var node = parent[key],
        type;

    if (!is_top_level) {
        type = is_object(node) && node.$type || undefined;
        type = type && is_branch && "." || type;
        node = create_branch(roots, parent, node, type, key);
        parents[0] = parent;
        nodes[0] = node;
        return;
    }

    parents[3] = json;

    if (is_branch) {
        type = is_object(node) && node.$type || undefined;
        node = create_branch(roots, parent, node, type, key);
        parents[0] = parent;
        nodes[0] = node;
        if (is_keyset && !!json) {
            nodes[3] = json[keyset] || (json[keyset] = {});
        }
        return;
    }

    var selector = roots.error_selector;
    var root = roots[0];
    var size = is_object(node) && node.$size || 0;
    var mess = roots.value;

    if(mess === undefined && roots.headless) {
        invalidate_node(parent, node, key, roots.lru);
        update_graph(parent, size, roots.version, roots.lru);
        node = undefined;
    } else {
        type = is_object(mess) && mess.$type || undefined;
        mess = wrap_node(mess, type, !!type ? mess.value : mess);
        type || (type = $sentinel);

        if (type == $error && !!selector) {
            mess = selector(requested, mess);
        }

        node = replace_node(parent, node, mess, key, roots.lru);
        node = graph_node(root, parent, node, key, inc_generation());
        update_graph(parent, size - node.$size, roots.version, roots.lru);
    }
    
    nodes[0] = node;
}

function onEdge(pathset, depth, roots, parents, nodes, requested, optimized, key, keyset) {

    var json;
    var node = nodes[0];
    var type = is_object(node) && node.$type || (node = undefined);

    if (node_as_miss(roots, node, type, pathset, depth, requested, optimized) === false) {
        clone_success(roots, requested, optimized);
        if (node_as_error(roots, node, type, requested) === false) {
            if(keyset == null) {
                roots.json = clone(roots, node, type, node && node.value);
            } else if(!!(json = parents[3])) {
                json[keyset] = clone(roots, node, type, node && node.value);
            }
            roots.hasValue = true;
        }
    }
}

},{"../lru/collect":82,"../support/array-clone":100,"../support/clone-dense-json":102,"../support/clone-success-paths":108,"../support/create-branch":110,"../support/get-valid-key":112,"../support/graph-node":113,"../support/inc-generation":114,"../support/invalidate-node":116,"../support/is-object":118,"../support/options":123,"../support/replace-node":126,"../support/treat-node-as-error":128,"../support/treat-node-as-missing-path-set":130,"../support/update-back-refs":132,"../support/update-graph":133,"../support/wrap-node":134,"../types/error":135,"../types/path":136,"../types/sentinel":137,"../walk/walk-path-set":143}],96:[function(require,module,exports){
module.exports = set_json_values_as_json_graph;

var $path = require("../types/path");
var $error = require("../types/error");
var $sentinel = require("../types/sentinel");

var clone = require("../support/clone-graph-json");
var array_clone = require("../support/array-clone");

var options = require("../support/options");
var walk_path_set = require("../walk/walk-path-set-soft-link");

var is_object = require("../support/is-object");

var get_valid_key = require("../support/get-valid-key");
var create_branch = require("../support/create-branch");
var wrap_node = require("../support/wrap-node");
var invalidate_node = require("../support/invalidate-node");
var replace_node = require("../support/replace-node");
var graph_node = require("../support/graph-node");
var update_back_refs = require("../support/update-back-refs");
var update_graph = require("../support/update-graph");
var inc_generation = require("../support/inc-generation");

var node_as_miss = require("../support/treat-node-as-missing-path-set");
var node_as_error = require("../support/treat-node-as-error");
var clone_success = require("../support/clone-success-paths");

var promote = require("../lru/promote");
var collect = require("../lru/collect");

function set_json_values_as_json_graph(model, pathvalues, values, error_selector) {

    var roots = options([], model, error_selector);
    var index = -1;
    var count = pathvalues.length;
    var nodes = roots.nodes;
    var parents = array_clone(nodes);
    var requested = [];
    var optimized = [];
    var json = values[0];
    var hasValue;

    roots[0] = roots.root;
    roots[1] = parents[1] = nodes[1] = json.jsong || (json.jsong = {});
    roots.requestedPaths = json.paths || (json.paths = roots.requestedPaths);

    while (++index < count) {

        var pv = pathvalues[index];
        var pathset = pv.path;
        roots.value = pv.value;

        walk_path_set(onNode, onEdge, pathset, 0, roots, parents, nodes, requested, optimized);
    }

    hasValue = roots.hasValue;
    if(hasValue) {
        json.jsong = roots[1];
    } else {
        delete json.jsong;
        delete json.paths;
    }

    collect(
        roots.lru,
        roots.expired,
        roots.version,
        roots.root.$size || 0,
        model._maxSize,
        model._collectRatio
    );

    return {
        values: values,
        errors: roots.errors,
        hasValue: hasValue,
        requestedPaths: roots.requestedPaths,
        optimizedPaths: roots.optimizedPaths,
        requestedMissingPaths: roots.requestedMissingPaths,
        optimizedMissingPaths: roots.optimizedMissingPaths
    };
}

function onNode(pathset, roots, parents, nodes, requested, optimized, is_top_level, is_branch, key, keyset, is_keyset) {

    var parent, json;

    if (key == null) {
        if ((key = get_valid_key(optimized)) == null) {
            return;
        }
        json = parents[1];
        parent = parents[0];
    } else {
        json = nodes[1];
        parent = nodes[0];
    }

    var jsonkey = key;
    var node = parent[key],
        type;

    if (!is_top_level) {
        type = is_object(node) && node.$type || undefined;
        type = type && is_branch && "." || type;
        node = create_branch(roots, parent, node, type, key);
        parents[0] = parent;
        nodes[0] = node;
        parents[1] = json;
        if (type == $path) {
            json[jsonkey] = clone(roots, node, type, node.value);
            roots.hasValue = true;
        } else {
            nodes[1] = json[jsonkey] || (json[jsonkey] = {});
        }
        return;
    }

    if (is_branch) {
        type = is_object(node) && node.$type || undefined;
        node = create_branch(roots, parent, node, type, key);
        type = node.$type;
        parents[0] = parent;
        nodes[0] = node;
        parents[1] = json;
        if (type == $path) {
            json[jsonkey] = clone(roots, node, type, node.value);
            roots.hasValue = true;
        } else {
            nodes[1] = json[jsonkey] || (json[jsonkey] = {});
        }
        return;
    }

    var selector = roots.error_selector;
    var root = roots[0];
    var size = is_object(node) && node.$size || 0;
    var mess = roots.value;

    if(mess === undefined && roots.headless) {
        invalidate_node(parent, node, key, roots.lru);
        update_graph(parent, size, roots.version, roots.lru);
        node = undefined;
    } else {
        type = is_object(mess) && mess.$type || undefined;
        mess = wrap_node(mess, type, !!type ? mess.value : mess);
        type || (type = $sentinel);

        if (type == $error && !!selector) {
            mess = selector(requested, mess);
        }

        node = replace_node(parent, node, mess, key, roots.lru);
        node = graph_node(root, parent, node, key, inc_generation());
        update_graph(parent, size - node.$size, roots.version, roots.lru);
    }
    nodes[0] = node;

    json[jsonkey] = clone(roots, node, type, node && node.value);
    roots.hasValue = true;
}

function onEdge(pathset, depth, roots, parents, nodes, requested, optimized, key, keyset) {

    var json;
    var node = nodes[0];
    var type = is_object(node) && node.$type || (node = undefined);

    if (node_as_miss(roots, node, type, pathset, depth, requested, optimized) === false) {
        clone_success(roots, requested, optimized);
        promote(roots.lru, node);
        if (keyset == null && !roots.hasValue && (keyset = get_valid_key(optimized)) == null) {
            node = clone(roots, node, type, node && node.value);
            json = roots[1];
            json.$type = node.$type;
            json.value = node.value;
        }
        roots.hasValue = true;
    }
}

},{"../lru/collect":82,"../lru/promote":83,"../support/array-clone":100,"../support/clone-graph-json":103,"../support/clone-success-paths":108,"../support/create-branch":110,"../support/get-valid-key":112,"../support/graph-node":113,"../support/inc-generation":114,"../support/invalidate-node":116,"../support/is-object":118,"../support/options":123,"../support/replace-node":126,"../support/treat-node-as-error":128,"../support/treat-node-as-missing-path-set":130,"../support/update-back-refs":132,"../support/update-graph":133,"../support/wrap-node":134,"../types/error":135,"../types/path":136,"../types/sentinel":137,"../walk/walk-path-set-soft-link":142}],97:[function(require,module,exports){
module.exports = set_json_values_as_json_sparse;

var $path = require("../types/path");
var $error = require("../types/error");
var $sentinel = require("../types/sentinel");

var clone = require("../support/clone-dense-json");
var array_clone = require("../support/array-clone");

var options = require("../support/options");
var walk_path_set = require("../walk/walk-path-set");

var is_object = require("../support/is-object");

var get_valid_key = require("../support/get-valid-key");
var create_branch = require("../support/create-branch");
var wrap_node = require("../support/wrap-node");
var invalidate_node = require("../support/invalidate-node");
var replace_node = require("../support/replace-node");
var graph_node = require("../support/graph-node");
var update_back_refs = require("../support/update-back-refs");
var update_graph = require("../support/update-graph");
var inc_generation = require("../support/inc-generation");

var node_as_miss = require("../support/treat-node-as-missing-path-set");
var node_as_error = require("../support/treat-node-as-error");
var clone_success = require("../support/clone-success-paths");

var collect = require("../lru/collect");

function set_json_values_as_json_sparse(model, pathvalues, values, error_selector) {

    var roots = options([], model, error_selector);
    var index = -1;
    var count = pathvalues.length;
    var nodes = roots.nodes;
    var parents = array_clone(nodes);
    var requested = [];
    var optimized = [];
    var json = values[0];
    var hasValue;

    roots[0] = roots.root;
    roots[3] = parents[3] = nodes[3] = json.json || (json.json = {});

    while (++index < count) {

        var pv = pathvalues[index];
        var pathset = pv.path;
        roots.value = pv.value;

        walk_path_set(onNode, onEdge, pathset, 0, roots, parents, nodes, requested, optimized);
    }

    hasValue = roots.hasValue;
    if(hasValue) {
        json.json = roots[3];
    } else {
        delete json.json;
    }

    collect(
        roots.lru,
        roots.expired,
        roots.version,
        roots.root.$size || 0,
        model._maxSize,
        model._collectRatio
    );

    return {
        values: values,
        errors: roots.errors,
        hasValue: hasValue,
        requestedPaths: roots.requestedPaths,
        optimizedPaths: roots.optimizedPaths,
        requestedMissingPaths: roots.requestedMissingPaths,
        optimizedMissingPaths: roots.optimizedMissingPaths
    };
}

function onNode(pathset, roots, parents, nodes, requested, optimized, is_top_level, is_branch, key, keyset, is_keyset) {

    var parent, json, jsonkey;

    if (key == null) {
        if ((key = get_valid_key(optimized)) == null) {
            return;
        }
        jsonkey = get_valid_key(requested);
        json = parents[3];
        parent = parents[0];
    } else {
        jsonkey = key;
        json = nodes[3];
        parent = nodes[0];
    }

    var node = parent[key],
        type;

    if (!is_top_level) {
        type = is_object(node) && node.$type || undefined;
        type = type && is_branch && "." || type;
        node = create_branch(roots, parent, node, type, key);
        parents[0] = parent;
        nodes[0] = node;
        return;
    }

    parents[3] = json;

    if (is_branch) {
        type = is_object(node) && node.$type || undefined;
        node = create_branch(roots, parent, node, type, key);
        parents[0] = parent;
        nodes[0] = node;
        nodes[3] = json[jsonkey] || (json[jsonkey] = {});
        return;
    }

    var selector = roots.error_selector;
    var root = roots[0];
    var size = is_object(node) && node.$size || 0;
    var mess = roots.value;

    if(mess === undefined && roots.headless) {
        invalidate_node(parent, node, key, roots.lru);
        update_graph(parent, size, roots.version, roots.lru);
        node = undefined;
    } else {
        type = is_object(mess) && mess.$type || undefined;
        mess = wrap_node(mess, type, !!type ? mess.value : mess);
        type || (type = $sentinel);

        if (type == $error && !!selector) {
            mess = selector(requested, mess);
        }

        node = replace_node(parent, node, mess, key, roots.lru);
        node = graph_node(root, parent, node, key, inc_generation());
        update_graph(parent, size - node.$size, roots.version, roots.lru);
    }
    nodes[0] = node;
}

function onEdge(pathset, depth, roots, parents, nodes, requested, optimized, key, keyset) {

    var json;
    var node = nodes[0];
    var type = is_object(node) && node.$type || (node = undefined);

    if (node_as_miss(roots, node, type, pathset, depth, requested, optimized) === false) {
        clone_success(roots, requested, optimized);
        if (node_as_error(roots, node, type, requested) === false) {
            if (keyset == null && !roots.hasValue && (keyset = get_valid_key(optimized)) == null) {
                node = clone(roots, node, type, node && node.value);
                json = roots[3];
                json.$type = node.$type;
                json.value = node.value;
            } else {
                json = parents[3];
                json[key] = clone(roots, node, type, node && node.value);
            }
            roots.hasValue = true;
        }
    }
}

},{"../lru/collect":82,"../support/array-clone":100,"../support/clone-dense-json":102,"../support/clone-success-paths":108,"../support/create-branch":110,"../support/get-valid-key":112,"../support/graph-node":113,"../support/inc-generation":114,"../support/invalidate-node":116,"../support/is-object":118,"../support/options":123,"../support/replace-node":126,"../support/treat-node-as-error":128,"../support/treat-node-as-missing-path-set":130,"../support/update-back-refs":132,"../support/update-graph":133,"../support/wrap-node":134,"../types/error":135,"../types/path":136,"../types/sentinel":137,"../walk/walk-path-set":143}],98:[function(require,module,exports){
module.exports = set_json_values_as_json_values;

var $error = require("../types/error");
var $sentinel = require("../types/sentinel");

var clone = require("../support/clone-dense-json");
var array_clone = require("../support/array-clone");

var options = require("../support/options");
var walk_path_set = require("../walk/walk-path-set");

var is_object = require("../support/is-object");

var get_valid_key = require("../support/get-valid-key");
var create_branch = require("../support/create-branch");
var wrap_node = require("../support/wrap-node");
var invalidate_node = require("../support/invalidate-node");
var replace_node = require("../support/replace-node");
var graph_node = require("../support/graph-node");
var update_back_refs = require("../support/update-back-refs");
var update_graph = require("../support/update-graph");
var inc_generation = require("../support/inc-generation");

var node_as_miss = require("../support/treat-node-as-missing-path-set");
var node_as_error = require("../support/treat-node-as-error");
var clone_success = require("../support/clone-success-paths");

var collect = require("../lru/collect");

function set_json_values_as_json_values(model, pathvalues, onNext, error_selector) {

    var roots = options([], model, error_selector);
    var index = -1;
    var count = pathvalues.length;
    var nodes = roots.nodes;
    var parents = array_clone(nodes);
    var requested = [];
    var optimized = [];

    roots[0] = roots.root;
    roots.onNext = onNext;

    while (++index < count) {
        var pv = pathvalues[index];
        var pathset = pv.path;
        roots.value = pv.value;
        walk_path_set(onNode, onEdge, pathset, 0, roots, parents, nodes, requested, optimized);
    }

    collect(
        roots.lru,
        roots.expired,
        roots.version,
        roots.root.$size || 0,
        model._maxSize,
        model._collectRatio
    );

    return {
        values: null,
        errors: roots.errors,
        requestedPaths: roots.requestedPaths,
        optimizedPaths: roots.optimizedPaths,
        requestedMissingPaths: roots.requestedMissingPaths,
        optimizedMissingPaths: roots.optimizedMissingPaths
    };
}

function onNode(pathset, roots, parents, nodes, requested, optimized, is_top_level, is_branch, key, keyset, is_keyset) {

    var parent;

    if (key == null) {
        if ((key = get_valid_key(optimized, nodes)) == null) {
            return;
        }
        parent = parents[0];
    } else {
        parent = nodes[0];
    }

    var node = parent[key], type;

    if (!is_top_level) {
        type = is_object(node) && node.$type || undefined;
        type = type && is_branch && "." || type;
        node = create_branch(roots, parent, node, type, key);
        parents[0] = parent;
        nodes[0] = node;
        return;
    }

    if (is_branch) {
        type = is_object(node) && node.$type || undefined;
        node = create_branch(roots, parent, node, type, key);
        parents[0] = parent;
        nodes[0] = node;
        return;
    }

    var selector = roots.error_selector;
    var root = roots[0];
    var size = is_object(node) && node.$size || 0;
    var mess = roots.value;
    
    if(mess === undefined && roots.headless) {
        invalidate_node(parent, node, key, roots.lru);
        update_graph(parent, size, roots.version, roots.lru);
        node = undefined;
    } else {
        type = is_object(mess) && mess.$type || undefined;
        mess = wrap_node(mess, type, !!type ? mess.value : mess);
        type || (type = $sentinel);

        if (type == $error && !!selector) {
            mess = selector(requested, mess);
        }

        node = replace_node(parent, node, mess, key, roots.lru);
        node = graph_node(root, parent, node, key, inc_generation());
        update_graph(parent, size - node.$size, roots.version, roots.lru);
    }
    nodes[0] = node;
}

function onEdge(pathset, depth, roots, parents, nodes, requested, optimized, key, keyset) {

    var node = nodes[0];
    var type = is_object(node) && node.$type || (node = undefined);

    if (node_as_miss(roots, node, type, pathset, depth, requested, optimized) === false) {
        clone_success(roots, requested, optimized);
        if (node_as_error(roots, node, type, requested) === false) {
            roots.onNext({
                path: array_clone(requested),
                value: clone(roots, node, type, node && node.value)
            });
        }
    }
}

},{"../lru/collect":82,"../support/array-clone":100,"../support/clone-dense-json":102,"../support/clone-success-paths":108,"../support/create-branch":110,"../support/get-valid-key":112,"../support/graph-node":113,"../support/inc-generation":114,"../support/invalidate-node":116,"../support/is-object":118,"../support/options":123,"../support/replace-node":126,"../support/treat-node-as-error":128,"../support/treat-node-as-missing-path-set":130,"../support/update-back-refs":132,"../support/update-graph":133,"../support/wrap-node":134,"../types/error":135,"../types/sentinel":137,"../walk/walk-path-set":143}],99:[function(require,module,exports){
module.exports = function(array, value) {
    var i = -1;
    var n = array.length;
    var array2 = new Array(n + 1);
    while(++i < n) { array2[i] = array[i]; }
    array2[i] = value;
    return array2;
};
},{}],100:[function(require,module,exports){
module.exports = function(array) {
    var i = -1;
    var n = array.length;
    var array2 = new Array(n);
    while(++i < n) { array2[i] = array[i]; }
    return array2;
};
},{}],101:[function(require,module,exports){
module.exports = function(array, index) {
    var i = -1;
    var n = array.length - index;
    var array2 = new Array(n);
    while(++i < n) { array2[i] = array[i + index]; }
    return array2;
};
},{}],102:[function(require,module,exports){
var $sentinel = require("../types/sentinel");
var clone = require("./clone");
module.exports = function(roots, node, type, value) {

    if(node == null || value === undefined) {
        return { $type: $sentinel };
    }

    if(roots.boxed == true) {
        return !!type && clone(node) || node;
    }

    return value;
}

},{"../types/sentinel":137,"./clone":109}],103:[function(require,module,exports){
var $sentinel = require("../types/sentinel");
var clone = require("./clone");
var is_primitive = require("./is-primitive");
module.exports = function(roots, node, type, value) {

    if(node == null || value === undefined) {
        return { $type: $sentinel };
    }

    if(roots.boxed == true) {
        return !!type && clone(node) || node;
    }

    if(!type || (type === $sentinel && is_primitive(value))) {
        return value;
    }

    return clone(node);
}

},{"../types/sentinel":137,"./clone":109,"./is-primitive":119}],104:[function(require,module,exports){
var clone_requested = require("./clone-requested-path");
var clone_optimized = require("./clone-optimized-path");
var walk_path_map   = require("../walk/walk-path-map-soft-link");
var is_object = require("./is-object");
var empty = [];

module.exports = function(roots, pathmap, keys_stack, depth, requested, optimized) {
    var patset_keys = explode_keys(pathmap, keys_stack.concat(), depth);
    var pathset = patset_keys.map(function(keys) {
        keys = keys.filter(function(key) { return key != "null"; });
        switch(keys.length) {
            case 0:
                return null;
            case 1:
                return keys[0];
            default:
                return keys;
        }
    });
    
    roots.requestedMissingPaths.push(clone_requested(roots.bound, requested, pathset, depth, roots.index));
    roots.optimizedMissingPaths.push(clone_optimized(optimized, pathset, depth));
}

function explode_keys(pathmap, keys_stack, depth) {
    if(is_object(pathmap)) {
        var keys = Object.keys(pathmap);
        var keys2 = keys_stack[depth] || (keys_stack[depth] = []);
        keys2.push.apply(keys2, keys);
        keys.forEach(function(key) {
            explode_keys(pathmap[key], keys_stack, depth + 1);
        });
    }
    return keys_stack;
}
},{"../walk/walk-path-map-soft-link":140,"./clone-optimized-path":106,"./clone-requested-path":107,"./is-object":118}],105:[function(require,module,exports){
var clone_requested_path = require("./clone-requested-path");
var clone_optimized_path = require("./clone-optimized-path");
module.exports = function(roots, pathset, depth, requested, optimized) {
    roots.requestedMissingPaths.push(clone_requested_path(roots.bound, requested, pathset, depth, roots.index));
    roots.optimizedMissingPaths.push(clone_optimized_path(optimized, pathset, depth));
}
},{"./clone-optimized-path":106,"./clone-requested-path":107}],106:[function(require,module,exports){
module.exports = function(optimized, pathset, depth) {
    var x;
    var i = -1;
    var j = depth - 1;
    var n = optimized.length;
    var m = pathset.length;
    var array2 = [];
    while(++i < n) {
        array2[i] = optimized[i];
    }
    while(++j < m) {
        if((x = pathset[j]) != null) {
            array2[i++] = x;
        }
    }
    return array2;
}
},{}],107:[function(require,module,exports){
var is_object = require("./is-object");
module.exports = function(bound, requested, pathset, depth, index) {
    var x;
    var i = -1;
    var j = -1;
    var l = 0;
    var m = requested.length;
    var n = bound.length;
    var array2 = [];
    while(++i < n) {
        array2[i] = bound[i];
    }
    while(++j < m) {
        if((x = requested[j]) != null) {
            if(is_object(pathset[l++])) {
                array2[i++] = [x];
            } else {
                array2[i++] = x;
            }
        }
    }
    m = n + l + pathset.length - depth;
    while(i < m) {
        array2[i++] = pathset[l++];
    }
    if(index != null) {
        array2.pathSetIndex = index;
    }
    return array2;
}
},{"./is-object":118}],108:[function(require,module,exports){
var array_slice = require("./array-slice");
var array_clone = require("./array-clone");
module.exports = function(roots, requested, optimized) {
    roots.requestedPaths.push(array_slice(requested, roots.offset));
    roots.optimizedPaths.push(array_clone(optimized));
}
},{"./array-clone":100,"./array-slice":101}],109:[function(require,module,exports){
var is_object = require("./is-object");
var prefix = require("../internal/prefix");

module.exports = function(value) {
    var dest = value, src = dest, i = -1, n, keys, key;
    if(is_object(dest)) {
        dest = {};
        keys = Object.keys(src);
        n = keys.length;
        while(++i < n) {
            key = keys[i];
            if(key[0] !== prefix) {
                dest[key] = src[key];
            }
        }
    }
    return dest;
}
},{"../internal/prefix":70,"./is-object":118}],110:[function(require,module,exports){
var $path = require("../types/path");
var $expired = "expired";
var replace_node = require("./replace-node");
var graph_node = require("./graph-node");
var update_back_refs = require("./update-back-refs");
var is_primitive = require("./is-primitive");
var is_expired = require("./is-expired");

module.exports = function(roots, parent, node, type, key) {

    if(!!type && is_expired(roots, node)) {
        type = $expired;
    }

    if((!!type && type != $path) || is_primitive(node)) {
        node = replace_node(parent, node, {}, key, roots.lru);
        node = graph_node(roots[0], parent, node, key, 0);
        node = update_back_refs(node, roots.version);
    }
    return node;
}

},{"../types/path":136,"./graph-node":113,"./is-expired":117,"./is-primitive":119,"./replace-node":126,"./update-back-refs":132}],111:[function(require,module,exports){
var __ref = require("../internal/ref");
var __context = require("../internal/context");
var __ref_index = require("../internal/ref-index");
var __refs_length = require("../internal/refs-length");

module.exports = function(node) {
    var ref, i = -1, n = node[__refs_length] || 0;
    while(++i < n) {
        if((ref = node[__ref + i]) !== undefined) {
            ref[__context] = ref[__ref_index] = node[__ref + i] = undefined;
        }
    }
    node[__refs_length] = undefined
}
},{"../internal/context":62,"../internal/ref":73,"../internal/ref-index":72,"../internal/refs-length":74}],112:[function(require,module,exports){
module.exports = function(path) {
    var key, index = path.length - 1;
    do {
        if((key = path[index]) != null) {
            return key;
        }
    } while(--index > -1);
    return null;
}
},{}],113:[function(require,module,exports){
var __parent = require("../internal/parent");
var __key = require("../internal/key");
var __generation = require("../internal/generation");

module.exports = function(root, parent, node, key, generation) {
    node[__parent] = parent;
    node[__key] = key;
    node[__generation] = generation;
    return node;
}
},{"../internal/generation":63,"../internal/key":66,"../internal/parent":69}],114:[function(require,module,exports){
var generation = 0;
module.exports = function() { return generation++; }
},{}],115:[function(require,module,exports){
var version = 0;
module.exports = function() { return version++; }
},{}],116:[function(require,module,exports){
module.exports = invalidate;

var is_object = require("./is-object");
var remove_node = require("./remove-node");
var prefix = require("../internal/prefix");

function invalidate(parent, node, key, lru) {
    if(remove_node(parent, node, key, lru)) {
        var type = is_object(node) && node.$type || undefined;
        if(type == null) {
            var keys = Object.keys(node);
            for(var i = -1, n = keys.length; ++i < n;) {
                var key = keys[i];
                if(key[0] !== prefix && key[0] !== "$") {
                    invalidate(node, node[key], key, lru);
                }
            }
        }
        return true;
    }
    return false;
}
},{"../internal/prefix":70,"./is-object":118,"./remove-node":125}],117:[function(require,module,exports){
var $expires_now = require("../values/expires-now");
var $expires_never = require("../values/expires-never");
var __invalidated = require("../internal/invalidated");
var now = require("./now");
var splice = require("../lru/splice");

module.exports = function(roots, node) {
    var expires = node.$expires;
    if((expires != null                            ) && (
        expires != $expires_never                  ) && (
        expires == $expires_now || expires < now()))    {
        if(!node[__invalidated]) {
            node[__invalidated] = true;
            roots.expired.push(node);
            splice(roots.lru, node);
        }
        return true;
    }
    return false;
}

},{"../internal/invalidated":65,"../lru/splice":84,"../values/expires-never":138,"../values/expires-now":139,"./now":122}],118:[function(require,module,exports){
var obj_typeof = "object";
module.exports = function(value) {
    return value != null && typeof value == obj_typeof;
}
},{}],119:[function(require,module,exports){
var obj_typeof = "object";
module.exports = function(value) {
    return value == null || typeof value != obj_typeof;
}
},{}],120:[function(require,module,exports){
module.exports = key_to_keyset;

var __offset = require("../internal/offset");
var is_array = Array.isArray;
var is_object = require("./is-object");

function key_to_keyset(key, iskeyset) {
    if(iskeyset) {
        if(is_array(key)) {
            key = key[key[__offset]];
            return key_to_keyset(key, is_object(key));
        } else {
            return key[__offset];
        }
    }
    return key;
}


},{"../internal/offset":68,"./is-object":118}],121:[function(require,module,exports){

var $self = "./";
var $path = require("../types/path");
var $sentinel = require("../types/sentinel");
var $expires_now = require("../values/expires-now");

var is_object = require("./is-object");
var is_primitive = require("./is-primitive");
var is_expired = require("./is-expired");
var promote = require("../lru/promote");
var wrap_node = require("./wrap-node");
var graph_node = require("./graph-node");
var replace_node = require("../support/replace-node");
var update_graph  = require("../support/update-graph");
var inc_generation = require("./inc-generation");
var invalidate_node = require("./invalidate-node");

module.exports = function(roots, parent, node, messageParent, message, key) {

    var type, messageType, node_is_object, message_is_object;

    // If the cache and message are the same, we can probably return early:
    // - If they're both null, return null.
    // - If they're both branches, return the branch.
    // - If they're both edges, continue below.
    if(node == message) {
        if(node == null) {
            return null;
        } else if(node_is_object = is_object(node)) {
            type = node.$type;
            if(type == null) {
                if(node[$self] == null) {
                    return graph_node(roots[0], parent, node, key, 0);
                }
                return node;
            }
        }
    } else if(node_is_object = is_object(node)) {
        type = node.$type;
    }

    var value, messageValue;

    if(type == $path) {
        if(message == null) {
            // If the cache is an expired reference, but the message
            // is empty, remove the cache value and return undefined
            // so we build a missing path.
            if(is_expired(roots, node)) {
                invalidate_node(parent, node, key, roots.lru);
                return undefined;
            }
            // If the cache has a reference and the message is empty,
            // leave the cache alone and follow the reference.
            return node;
        } else if(message_is_object = is_object(message)) {
            messageType = message.$type;
            // If the cache and the message are both references,
            // check if we need to replace the cache reference.
            if(messageType == $path) {
                if(node === message) {
                    // If the cache and message are the same reference,
                    // we performed a whole-branch merge of one of the
                    // grandparents. If we've previously graphed this
                    // reference, break early.
                    if(node[$self] != null) {
                        return node;
                    }
                }
                // If the message doesn't expire immediately and is newer than the
                // cache (or either cache or message don't have timestamps), attempt
                // to use the message value.
                // Note: Number and `undefined` compared LT/GT to `undefined` is `false`.
                else if((
                    is_expired(roots, message) === false) && ((
                    message.$timestamp < node.$timestamp) === false)) {

                    // Compare the cache and message references.
                    // - If they're the same, break early so we don't insert.
                    // - If they're different, replace the cache reference.

                    value = node.value;
                    messageValue = message.value;

                    var count = value.length;

                    // If the reference lengths are equal, check their keys for equality.
                    if(count === messageValue.length) {
                        while(--count > -1) {
                            // If any of their keys are different, replace the reference
                            // in the cache with the reference in the message.
                            if(value[count] !== messageValue[count]) {
                                break;
                            }
                        }
                        // If all their keys are equal, leave the cache value alone.
                        if(count === -1) {
                            return node;
                        }
                    }
                }
            }
        }
    } else {
        if(message_is_object = is_object(message)) {
            messageType = message.$type;
        }
        if(node_is_object && !type) {
            // Otherwise if the cache is a branch and the message is either
            // null or also a branch, continue with the cache branch.
            if(message == null || (message_is_object && !messageType)) {
                return node;
            }
        }
    }

    // If the message is an expired edge, report it back out so we don't build a missing path, but
    // don't insert it into the cache. If a value exists in the cache that didn't come from a
    // whole-branch grandparent merge, remove the cache value.
    if(!!messageType && !!message[$self] && is_expired(roots, message)) {
        if(node_is_object && node != message) {
            invalidate_node(parent, node, key, roots.lru);
        }
        return message;
    }
    // If the cache is a value, but the message is a branch, merge the branch over the value.
    else if(!!type && message_is_object && !messageType) {
        node = replace_node(parent, node, message, key, roots.lru);
        return graph_node(roots[0], parent, node, key, 0);
    }
    // If the message is a value, insert it into the cache.
    else if(!message_is_object || !!messageType) {
        var offset = 0;
        // If we've arrived at this message value, but didn't perform a whole-branch merge
        // on one of its ancestors, replace the cache node with the message value.
        if(node != message) {
            messageValue || (messageValue = !!messageType ? message.value : message);
            message = wrap_node(message, messageType, messageValue);

            var size = node_is_object && node.$size || 0;
            var messageSize = message.$size;
            offset = size - messageSize;

            node = replace_node(parent, node, message, key, roots.lru);
            update_graph(parent, offset, roots.version, roots.lru);
            node = graph_node(roots[0], parent, node, key, inc_generation());
        }
        // If the cache and the message are the same value, we branch-merged one of its
        // ancestors. Give the message a $size and $type, attach its graph pointers, and
        // update the cache sizes and generations.
        else if(node_is_object && node[$self] == null) {
            node = parent[key] = wrap_node(node, type, node.value);
            offset = -node.$size;
            update_graph(parent, offset, roots.version, roots.lru);
            node = graph_node(roots[0], parent, node, key, inc_generation());
        }
        // Otherwise, cache and message are the same primitive value. Wrap in a sentinel and insert.
        else {
            node = parent[key] = wrap_node(node, type, node);
            offset = -node.$size;
            update_graph(parent, offset, roots.version, roots.lru);
            node = graph_node(roots[0], parent, node, key, inc_generation());
        }
        // If the node is already expired, return undefined to build a missing path.
        // if(is_expired(roots, node)) {
        //     return undefined;
        // }

        // Promote the message edge in the LRU.
        promote(roots.lru, node);
    }
    // If we get here, the cache is empty and the message is a branch.
    // Merge the whole branch over.
    else if(node == null) {
        node = parent[key] = graph_node(roots[0], parent, message, key, 0);
    }

    return node;
}

},{"../lru/promote":83,"../support/replace-node":126,"../support/update-graph":133,"../types/path":136,"../types/sentinel":137,"../values/expires-now":139,"./graph-node":113,"./inc-generation":114,"./invalidate-node":116,"./is-expired":117,"./is-object":118,"./is-primitive":119,"./wrap-node":134}],122:[function(require,module,exports){
module.exports = Date.now;
},{}],123:[function(require,module,exports){
var inc_version = require("../support/inc-version");
var getBoundValue = require('../get/getBoundValue');

module.exports = function(options, model, error_selector) {
    
    var bound = options.bound     || (options.bound                 = model._path || []);
    var root  = options.root      || (options.root                  = model._cache);
    var nodes = options.nodes     || (options.nodes                 = []);
    var lru   = options.lru       || (options.lru                   = model._root);
    options.expired               || (options.expired               = lru.expired);
    options.errors                || (options.errors                = []);
    options.requestedPaths        || (options.requestedPaths        = []);
    options.optimizedPaths        || (options.optimizedPaths        = []);
    options.requestedMissingPaths || (options.requestedMissingPaths = []);
    options.optimizedMissingPaths || (options.optimizedMissingPaths = []);
    options.boxed  = model._boxed || false;
    options.materialized = model._materialized;
    options.errorsAsValues = model._treatErrorsAsValues || false;
    options.headless = model._dataSource == null;
    options.version = inc_version();
    
    options.offset || (options.offset = 0);
    options.error_selector = error_selector || model._errorSelector;
    
    if(bound.length) {
        nodes[0] = getBoundValue(model, bound).value;
    } else {
        nodes[0] = root;
    }
    
    return options;
};
},{"../get/getBoundValue":45,"../support/inc-version":115}],124:[function(require,module,exports){
module.exports = permute_keyset;

var __offset = require("../internal/offset");
var is_array = Array.isArray;
var is_object = require("./is-object");

function permute_keyset(key) {
    if(is_array(key)) {
        
        if(key[__offset] === undefined) {
            key[__offset] = -1;
            if(key.length == 0) {
                return false;
            }
        }
        if(++key[__offset] >= key.length) {
            return permute_keyset(key[key[__offset] = -1]);
        } else {
            return true;
        }
    } else if(is_object(key)) {
        if(key[__offset] === undefined) {
            key[__offset] = (key.from || (key.from = 0)) - 1;
            if(key.to === undefined) {
                if(key.length === undefined) {
                    throw new Error("Range keysets must specify at least one index to retrieve.");
                } else if(key.length === 0) {
                    return false;
                }
                key.to = key.from + (key.length || 1) - 1;
            }
        }
        
        if(++key[__offset] > key.to) {
            key[__offset] = key.from - 1;
            return false;
        }
        
        return true;
    }
    
    return false;
}


},{"../internal/offset":68,"./is-object":118}],125:[function(require,module,exports){
var $path = require("../types/path");
var __parent = require("../internal/parent");
var unlink = require("./unlink");
var delete_back_refs = require("./delete-back-refs");
var splice = require("../lru/splice");
var is_object = require("./is-object");

module.exports = function(parent, node, key, lru) {
    if(is_object(node)) {
        var type  = node.$type;
        if(!!type) {
            if(type == $path) { unlink(node); }
            splice(lru, node);
        }
        delete_back_refs(node);
        parent[key] = node[__parent] = undefined;
        return true;
    }
    return false;
}

},{"../internal/parent":69,"../lru/splice":84,"../types/path":136,"./delete-back-refs":111,"./is-object":118,"./unlink":131}],126:[function(require,module,exports){
var transfer_back_refs = require("./transfer-back-refs");
var invalidate_node = require("./invalidate-node");

module.exports = function(parent, node, replacement, key, lru) {
    if(node != null && node !== replacement && typeof node == "object") {
        transfer_back_refs(node, replacement);
        invalidate_node(parent, node, key, lru);
    }
    return parent[key] = replacement;
}
},{"./invalidate-node":116,"./transfer-back-refs":127}],127:[function(require,module,exports){
var __ref = require("../internal/ref");
var __context = require("../internal/context");
var __refs_length = require("../internal/refs-length");

module.exports = function(node, dest) {
    var nodeRefsLength = node[__refs_length] || 0,
        destRefsLength = dest[__refs_length] || 0,
        i = -1, ref;
    while(++i < nodeRefsLength) {
        ref = node[__ref + i];
        if(ref !== undefined) {
            ref[__context] = dest;
            dest[__ref + (destRefsLength + i)] = ref;
            node[__ref + i] = undefined;
        }
    }
    dest[__refs_length] = nodeRefsLength + destRefsLength;
    node[__refs_length] = ref = undefined;
}
},{"../internal/context":62,"../internal/ref":73,"../internal/refs-length":74}],128:[function(require,module,exports){
var $error = require("../types/error");
var promote = require("../lru/promote");
var array_clone = require("./array-clone");
module.exports = function(roots, node, type, path) {
    if(node == null) {
        return false;
    }
    promote(roots.lru, node);
    if(type != $error || roots.errorsAsValues) {
        return false;
    }
    roots.errors.push({ path: array_clone(path), value: node.value });
    return true;
};

},{"../lru/promote":83,"../types/error":135,"./array-clone":100}],129:[function(require,module,exports){
var $sentinel = require("../types/sentinel");
var clone_misses = require("./clone-missing-path-maps");
var is_expired = require("./is-expired");

module.exports = function(roots, node, type, pathmap, keys_stack, depth, requested, optimized) {
    var dematerialized = !roots.materialized;
    if(node == null && dematerialized) {
        clone_misses(roots, pathmap, keys_stack, depth, requested, optimized);
        return true;
    } else if(!!type) {
        if(type == $sentinel && node.value === undefined && dematerialized && !roots.boxed) {
            return true;
        } else if(is_expired(roots, node)) {
            clone_misses(roots, pathmap, keys_stack, depth, requested, optimized);
            return true;
        }
    }
    return false;
};
},{"../types/sentinel":137,"./clone-missing-path-maps":104,"./is-expired":117}],130:[function(require,module,exports){
var $sentinel = require("../types/sentinel");
var clone_misses = require("./clone-missing-path-sets");
var is_expired = require("./is-expired");

module.exports = function(roots, node, type, pathset, depth, requested, optimized) {
    var dematerialized = !roots.materialized;
    if(node == null && dematerialized) {
        clone_misses(roots, pathset, depth, requested, optimized);
        return true;
    } else if(!!type) {
        if(type == $sentinel && node.value === undefined && dematerialized && !roots.boxed) {
            return true;
        } else if(is_expired(roots, node)) {
            clone_misses(roots, pathset, depth, requested, optimized);
            return true;
        }
    }
    return false;
};

},{"../types/sentinel":137,"./clone-missing-path-sets":105,"./is-expired":117}],131:[function(require,module,exports){
var __ref = require("../internal/ref");
var __context = require("../internal/context");
var __ref_index = require("../internal/ref-index");
var __refs_length = require("../internal/refs-length");

module.exports = function(ref) {
    var destination = ref[__context];
    if(destination) {
        var i = (ref[__ref_index] || 0) - 1,
            n = (destination[__refs_length] || 0) - 1;
        while(++i <= n) {
            destination[__ref + i] = destination[__ref + (i + 1)];
        }
        destination[__refs_length] = n;
        ref[__ref_index] = ref[__context] = destination = undefined;
    }
}
},{"../internal/context":62,"../internal/ref":73,"../internal/ref-index":72,"../internal/refs-length":74}],132:[function(require,module,exports){
module.exports = update_back_refs;

var __ref = require("../internal/ref");
var __parent = require("../internal/parent");
var __version = require("../internal/version");
var __generation = require("../internal/generation");
var __refs_length = require("../internal/refs-length");

var generation = require("./inc-generation");

function update_back_refs(node, version) {
    if(node && node[__version] !== version) {
        node[__version] = version;
        node[__generation] = generation();
        update_back_refs(node[__parent], version);
        var i = -1, n = node[__refs_length] || 0;
        while(++i < n) {
            update_back_refs(node[__ref + i], version);
        }
    }
    return node;
}

},{"../internal/generation":63,"../internal/parent":69,"../internal/ref":73,"../internal/refs-length":74,"../internal/version":76,"./inc-generation":114}],133:[function(require,module,exports){
var __key = require("../internal/key");
var __version = require("../internal/version");
var __parent = require("../internal/parent");
var remove_node = require("./remove-node");
var update_back_refs = require("./update-back-refs");

module.exports = function(node, offset, version, lru) {
    var child;
    while(child = node) {
        node = child[__parent];
        if((child.$size = (child.$size || 0) - offset) <= 0 && node != null) {
            remove_node(node, child, child[__key], lru);
        } else if(child[__version] !== version) {
            update_back_refs(child, version);
        }
    }
}
},{"../internal/key":66,"../internal/parent":69,"../internal/version":76,"./remove-node":125,"./update-back-refs":132}],134:[function(require,module,exports){
var $path = require("../types/path");
var $error = require("../types/error");
var $sentinel = require("../types/sentinel");

var now = require("./now");
var clone = require("./clone");
var is_array = Array.isArray;
var is_object = require("./is-object");

module.exports = function(node, type, value) {

    var dest = node, size = 0;

    if(!!type) {
        dest = clone(node);
        size = dest.$size;
    // }
    // if(type == $path) {
    //     dest = clone(node);
    //     size = 50 + (value.length || 1);
    // } else if(is_object(node) && (type || (type = node.$type))) {
    //     dest = clone(node);
    //     size = dest.$size;
    } else {
        dest = { value: value };
        type = $sentinel;
    }

    if(size <= 0 || size == null) {
        switch(typeof value) {
            case "number":
            case "boolean":
            case "function":
            case "undefined":
                size = 51;
                break;
            case "object":
                size = is_array(value) && (50 + value.length) || 51;
                break;
            case "string":
                size = 50 + value.length;
                break;
        }
    }

    var expires = is_object(node) && node.$expires || undefined;
    if(typeof expires === "number" && expires < 0) {
        dest.$expires = now() + (expires * -1);
    }

    dest.$type = type;
    dest.$size = size;

    return dest;
}

},{"../types/error":135,"../types/path":136,"../types/sentinel":137,"./clone":109,"./is-object":118,"./now":122}],135:[function(require,module,exports){
module.exports = "error";
},{}],136:[function(require,module,exports){
module.exports = "ref";
},{}],137:[function(require,module,exports){
module.exports = "sentinel";
},{}],138:[function(require,module,exports){
module.exports = 1;
},{}],139:[function(require,module,exports){
module.exports = 0;
},{}],140:[function(require,module,exports){
module.exports = walk_path_map;

var prefix = require("../internal/prefix");
var $path = require("../types/path");

var walk_reference = require("./walk-reference");

var array_slice = require("../support/array-slice");
var array_clone    = require("../support/array-clone");
var array_append   = require("../support/array-append");

var is_expired = require("../support/is-expired");
var is_primitive = require("../support/is-primitive");
var is_object = require("../support/is-object");
var is_array = Array.isArray;

var promote = require("../lru/promote");

function walk_path_map(onNode, onEdge, pathmap, keys_stack, depth, roots, parents, nodes, requested, optimized, key, keyset, is_keyset) {

    var node = nodes[0];

    if(is_primitive(pathmap) || is_primitive(node)) {
        return onEdge(pathmap, keys_stack, depth, roots, parents, nodes, requested, optimized, key, keyset);
    }

    var type = node.$type;

    while(type === $path) {

        if(is_expired(roots, node)) {
            nodes[0] = undefined;
            return onEdge(pathmap, keys_stack, depth, roots, parents, nodes, requested, optimized, key, keyset);
        }

        promote(roots.lru, node);

        var container = node;
        var reference = node.value;

        nodes[0] = parents[0] = roots[0];
        nodes[1] = parents[1] = roots[1];
        nodes[2] = parents[2] = roots[2];

        walk_reference(onNode, container, reference, roots, parents, nodes, requested, optimized);

        node = nodes[0];

        if(node == null) {
            optimized = array_clone(reference);
            return onEdge(pathmap, keys_stack, depth, roots, parents, nodes, requested, optimized, key, keyset);
        } else if(is_primitive(node) || ((type = node.$type) && type != $path)) {
            onNode(pathmap, roots, parents, nodes, requested, optimized, true, null, keyset, false);
            return onEdge(pathmap, keys_stack, depth, roots, parents, nodes, array_append(requested, null), optimized, key, keyset);
        }
    }

    if(type != null) {
        return onEdge(pathmap, keys_stack, depth, roots, parents, nodes, requested, optimized, key, keyset);
    }

    var keys = keys_stack[depth] = Object.keys(pathmap);

    if(keys.length == 0) {
        return onEdge(pathmap, keys_stack, depth, roots, parents, nodes, requested, optimized, key, keyset);
    }

    var is_outer_keyset = keys.length > 1;

    for(var i = -1, n = keys.length; ++i < n;) {

        var inner_key = keys[i];

        if((inner_key[0] === prefix) || (inner_key[0] === "$")) {
            continue;
        }

        var inner_keyset = is_outer_keyset ? inner_key : keyset;
        var nodes2 = array_clone(nodes);
        var parents2 = array_clone(parents);
        var pathmap2 = pathmap[inner_key];
        var requested2, optimized2, is_branch;
        var has_child_key = false;

        var is_branch = is_object(pathmap2) && !pathmap2.$type;// && !is_array(pathmap2);
        if(is_branch) {
            for(child_key in pathmap2) {
                if((child_key[0] === prefix) || (child_key[0] === "$")) {
                    continue;
                }
                child_key = pathmap2.hasOwnProperty(child_key);
                break;
            }
            is_branch = child_key === true;
        }

        if(inner_key == "null") {
            requested2 = array_append(requested, null);
            optimized2 = array_clone(optimized);
            inner_key  = key;
            inner_keyset = keyset;
            pathmap2 = pathmap;
            onNode(pathmap2, roots, parents2, nodes2, requested2, optimized2, true, is_branch, null, inner_keyset, false);
        } else {
            requested2 = array_append(requested, inner_key);
            optimized2 = array_append(optimized, inner_key);
            onNode(pathmap2, roots, parents2, nodes2, requested2, optimized2, true, is_branch, inner_key, inner_keyset, is_outer_keyset);
        }

        if(is_branch) {
            walk_path_map(onNode, onEdge,
                pathmap2, keys_stack, depth + 1,
                roots, parents2, nodes2,
                requested2, optimized2,
                inner_key, inner_keyset, is_outer_keyset
            );
        } else {
            onEdge(pathmap2, keys_stack, depth, roots, parents2, nodes2, requested2, optimized2, inner_key, inner_keyset);
        }
    }
}

},{"../internal/prefix":70,"../lru/promote":83,"../support/array-append":99,"../support/array-clone":100,"../support/array-slice":101,"../support/is-expired":117,"../support/is-object":118,"../support/is-primitive":119,"../types/path":136,"./walk-reference":144}],141:[function(require,module,exports){
module.exports = walk_path_map;

var prefix = require("../internal/prefix");
var __context = require("../internal/context");
var $path = require("../types/path");

var walk_reference = require("./walk-reference");

var array_slice = require("../support/array-slice");
var array_clone    = require("../support/array-clone");
var array_append   = require("../support/array-append");

var is_expired = require("../support/is-expired");
var is_primitive = require("../support/is-primitive");
var is_object = require("../support/is-object");
var is_array = Array.isArray;

var promote = require("../lru/promote");

function walk_path_map(onNode, onEdge, pathmap, keys_stack, depth, roots, parents, nodes, requested, optimized, key, keyset, is_keyset) {

    var node = nodes[0];

    if(is_primitive(pathmap) || is_primitive(node)) {
        return onEdge(pathmap, keys_stack, depth, roots, parents, nodes, requested, optimized, key, keyset);
    }

    var type = node.$type;

    while(type === $path) {

        if(is_expired(roots, node)) {
            nodes[0] = undefined;
            return onEdge(pathmap, keys_stack, depth, roots, parents, nodes, requested, optimized, key, keyset);
        }

        promote(roots.lru, node);

        var container = node;
        var reference = node.value;
        node = node[__context];

        if(node != null) {
            type = node.$type;
            optimized = array_clone(reference);
            nodes[0] = node;
        } else {

            nodes[0] = parents[0] = roots[0];

            walk_reference(onNode, container, reference, roots, parents, nodes, requested, optimized);

            node = nodes[0];

            if(node == null) {
                optimized = array_clone(reference);
                return onEdge(pathmap, keys_stack, depth, roots, parents, nodes, requested, optimized, key, keyset);
            } else if(is_primitive(node) || ((type = node.$type) && type != $path)) {
                onNode(pathmap, roots, parents, nodes, requested, optimized, true, null, keyset, false);
                return onEdge(pathmap, keys_stack, depth, roots, parents, nodes, array_append(requested, null), optimized, key, keyset);
            }
        }
    }

    if(type != null) {
        return onEdge(pathmap, keys_stack, depth, roots, parents, nodes, requested, optimized, key, keyset);
    }

    var keys = keys_stack[depth] = Object.keys(pathmap);

    if(keys.length == 0) {
        return onEdge(pathmap, keys_stack, depth, roots, parents, nodes, requested, optimized, key, keyset);
    }

    var is_outer_keyset = keys.length > 1;

    for(var i = -1, n = keys.length; ++i < n;) {

        var inner_key = keys[i];

        if((inner_key[0] === prefix) || (inner_key[0] === "$")) {
            continue;
        }

        var inner_keyset = is_outer_keyset ? inner_key : keyset;
        var nodes2 = array_clone(nodes);
        var parents2 = array_clone(parents);
        var pathmap2 = pathmap[inner_key];
        var requested2, optimized2, is_branch;
        var child_key = false;

        var is_branch = is_object(pathmap2) && !pathmap2.$type;// && !is_array(pathmap2);
        if(is_branch) {
            for(child_key in pathmap2) {
                if((child_key[0] === prefix) || (child_key[0] === "$")) {
                    continue;
                }
                child_key = pathmap2.hasOwnProperty(child_key);
                break;
            }
            is_branch = child_key === true;
        }

        if(inner_key == "null") {
            requested2 = array_append(requested, null);
            optimized2 = array_clone(optimized);
            inner_key  = key;
            inner_keyset = keyset;
            pathmap2 = pathmap;
            onNode(pathmap2, roots, parents2, nodes2, requested2, optimized2, true, is_branch, null, inner_keyset, false);
        } else {
            requested2 = array_append(requested, inner_key);
            optimized2 = array_append(optimized, inner_key);
            onNode(pathmap2, roots, parents2, nodes2, requested2, optimized2, true, is_branch, inner_key, inner_keyset, is_outer_keyset);
        }

        if(is_branch) {
            walk_path_map(onNode, onEdge,
                pathmap2, keys_stack, depth + 1,
                roots, parents2, nodes2,
                requested2, optimized2,
                inner_key, inner_keyset, is_outer_keyset
            );
        } else {
            onEdge(pathmap2, keys_stack, depth, roots, parents2, nodes2, requested2, optimized2, inner_key, inner_keyset);
        }
    }
}

},{"../internal/context":62,"../internal/prefix":70,"../lru/promote":83,"../support/array-append":99,"../support/array-clone":100,"../support/array-slice":101,"../support/is-expired":117,"../support/is-object":118,"../support/is-primitive":119,"../types/path":136,"./walk-reference":144}],142:[function(require,module,exports){
module.exports = walk_path_set;

var $path = require("../types/path");
var empty_array = new Array(0);

var walk_reference = require("./walk-reference");

var array_slice    = require("../support/array-slice");
var array_clone    = require("../support/array-clone");
var array_append   = require("../support/array-append");

var is_expired = require("../support/is-expired");
var is_primitive = require("../support/is-primitive");
var is_object = require("../support/is-object");

var keyset_to_key  = require("../support/keyset-to-key");
var permute_keyset = require("../support/permute-keyset");

var promote = require("../lru/promote");

function walk_path_set(onNode, onEdge, pathset, depth, roots, parents, nodes, requested, optimized, key, keyset, is_keyset) {

    var node = nodes[0];

    if(depth >= pathset.length || is_primitive(node)) {
        return onEdge(pathset, depth, roots, parents, nodes, requested, optimized, key, keyset);
    }

    var type = node.$type;

    while(type === $path) {

        if(is_expired(roots, node)) {
            nodes[0] = undefined;
            return onEdge(pathset, depth, roots, parents, nodes, requested, optimized, key, keyset);
        }

        promote(roots.lru, node);

        var container = node;
        var reference = node.value;

        nodes[0] = parents[0] = roots[0];
        nodes[1] = parents[1] = roots[1];
        nodes[2] = parents[2] = roots[2];

        walk_reference(onNode, container, reference, roots, parents, nodes, requested, optimized);

        node = nodes[0];

        if(node == null) {
            optimized = array_clone(reference);
            return onEdge(pathset, depth, roots, parents, nodes, requested, optimized, key, keyset);
        } else if(is_primitive(node) || ((type = node.$type) && type != $path)) {
            onNode(pathset, roots, parents, nodes, requested, optimized, true, false, null, keyset, false);
            return onEdge(pathset, depth, roots, parents, nodes, array_append(requested, null), optimized, key, keyset);
        }
    }

    if(type != null) {
        return onEdge(pathset, depth, roots, parents, nodes, requested, optimized, key, keyset);
    }

    var outer_key = pathset[depth];
    var is_outer_keyset = is_object(outer_key);
    var is_branch = depth < pathset.length - 1;
    var run_once = false;

    while(is_outer_keyset && permute_keyset(outer_key) && (run_once = true) || (run_once = !run_once)) {
        var inner_key, inner_keyset;

        if(is_outer_keyset === true) {
            inner_key = keyset_to_key(outer_key, true);
            inner_keyset = inner_key;
        } else {
            inner_key = outer_key;
            inner_keyset = keyset;
        }

        var nodes2 = array_clone(nodes);
        var parents2 = array_clone(parents);
        var requested2, optimized2;

        if(inner_key == null) {
            requested2 = array_append(requested, null);
            optimized2 = array_clone(optimized);
            // optimized2 = optimized;
            inner_key = key;
            inner_keyset = keyset;
            onNode(pathset, roots, parents2, nodes2, requested2, optimized2, true, is_branch, null, inner_keyset, false);
        } else {
            requested2 = array_append(requested, inner_key);
            optimized2 = array_append(optimized, inner_key);
            onNode(pathset, roots, parents2, nodes2, requested2, optimized2, true, is_branch, inner_key, inner_keyset, is_outer_keyset);
        }

        walk_path_set(onNode, onEdge,
            pathset, depth + 1,
            roots, parents2, nodes2,
            requested2, optimized2,
            inner_key, inner_keyset, is_outer_keyset
        );
    }
}

},{"../lru/promote":83,"../support/array-append":99,"../support/array-clone":100,"../support/array-slice":101,"../support/is-expired":117,"../support/is-object":118,"../support/is-primitive":119,"../support/keyset-to-key":120,"../support/permute-keyset":124,"../types/path":136,"./walk-reference":144}],143:[function(require,module,exports){
module.exports = walk_path_set;

var prefix = require("../internal/prefix");
var __context = require("../internal/context");
var $path = require("../types/path");
var empty_array = new Array(0);

var walk_reference = require("./walk-reference");

var array_slice    = require("../support/array-slice");
var array_clone    = require("../support/array-clone");
var array_append   = require("../support/array-append");

var is_expired = require("../support/is-expired");
var is_primitive = require("../support/is-primitive");
var is_object = require("../support/is-object");

var keyset_to_key  = require("../support/keyset-to-key");
var permute_keyset = require("../support/permute-keyset");

var promote = require("../lru/promote");

function walk_path_set(onNode, onEdge, pathset, depth, roots, parents, nodes, requested, optimized, key, keyset, is_keyset) {

    var node = nodes[0];

    if(depth >= pathset.length || is_primitive(node)) {
        return onEdge(pathset, depth, roots, parents, nodes, requested, optimized, key, keyset);
    }

    var type = node.$type;

    while(type === $path) {

        if(is_expired(roots, node)) {
            nodes[0] = undefined;
            return onEdge(pathset, depth, roots, parents, nodes, requested, optimized, key, keyset);
        }

        promote(roots.lru, node);

        var container = node;
        var reference = node.value;
        node = node[__context];

        if(node != null) {
            type = node.$type;
            optimized = array_clone(reference);
            nodes[0]  = node;
        } else {

            nodes[0] = parents[0] = roots[0];
            // nodes[1] = parents[1] = roots[1];
            // nodes[2] = parents[2] = roots[2];

            walk_reference(onNode, container, reference, roots, parents, nodes, requested, optimized);

            node = nodes[0];

            if(node == null) {
                optimized = array_clone(reference);
                return onEdge(pathset, depth, roots, parents, nodes, requested, optimized, key, keyset);
            } else if(is_primitive(node) || ((type = node.$type) && type != $path)) {
                onNode(pathset, roots, parents, nodes, requested, optimized, true, false, null, keyset, false);
                return onEdge(pathset, depth, roots, parents, nodes, array_append(requested, null), optimized, key, keyset);
            }
        }
    }

    if(type != null) {
        return onEdge(pathset, depth, roots, parents, nodes, requested, optimized, key, keyset);
    }

    var outer_key = pathset[depth];
    var is_outer_keyset = is_object(outer_key);
    var is_branch = depth < pathset.length - 1;
    var run_once = false;

    while(is_outer_keyset && permute_keyset(outer_key) && (run_once = true) || (run_once = !run_once)) {

        var inner_key, inner_keyset;

        if(is_outer_keyset === true) {
            inner_key = keyset_to_key(outer_key, true);
            inner_keyset = inner_key;
        } else {
            inner_key = outer_key;
            inner_keyset = keyset;
        }

        var nodes2 = array_clone(nodes);
        var parents2 = array_clone(parents);
        var requested2, optimized2;

        if(inner_key == null) {
            requested2 = array_append(requested, null);
            optimized2 = array_clone(optimized);
            // optimized2 = optimized;
            inner_key = key;
            inner_keyset = keyset;
            onNode(pathset, roots, parents2, nodes2, requested2, optimized2, true, is_branch, null, inner_keyset, false);
        } else {
            requested2 = array_append(requested, inner_key);
            optimized2 = array_append(optimized, inner_key);
            onNode(pathset, roots, parents2, nodes2, requested2, optimized2, true, is_branch, inner_key, inner_keyset, is_outer_keyset);
        }

        walk_path_set(onNode, onEdge,
            pathset, depth + 1,
            roots, parents2, nodes2,
            requested2, optimized2,
            inner_key, inner_keyset, is_outer_keyset
        );
    }
}

},{"../internal/context":62,"../internal/prefix":70,"../lru/promote":83,"../support/array-append":99,"../support/array-clone":100,"../support/array-slice":101,"../support/is-expired":117,"../support/is-object":118,"../support/is-primitive":119,"../support/keyset-to-key":120,"../support/permute-keyset":124,"../types/path":136,"./walk-reference":144}],144:[function(require,module,exports){
module.exports = walk_reference;

var prefix = require("../internal/prefix");
var __ref = require("../internal/ref");
var __context = require("../internal/context");
var __ref_index = require("../internal/ref-index");
var __refs_length = require("../internal/refs-length");

var is_object      = require("../support/is-object");
var is_primitive   = require("../support/is-primitive");
var array_slice    = require("../support/array-slice");
var array_append   = require("../support/array-append");

function walk_reference(onNode, container, reference, roots, parents, nodes, requested, optimized) {

    optimized.length = 0;

    var index = -1;
    var count = reference.length;
    var node, key, keyset;

    while(++index < count) {

        node = nodes[0];

        if(node == null) {
            return nodes;
        } else if(is_primitive(node) || node.$type) {
            onNode(reference, roots, parents, nodes, requested, optimized, false, false, keyset, null, false);
            return nodes;
        }

        do {
            key = reference[index];
            if(key != null) {
                keyset = key;
                optimized.push(key);
                onNode(reference, roots, parents, nodes, requested, optimized, false, index < count - 1, key, null, false);
                break;
            }
        } while(++index < count);
    }

    node = nodes[0];

    if(is_object(node) && container[__context] !== node) {
        var backrefs = node[__refs_length] || 0;
        node[__refs_length] = backrefs + 1;
        node[__ref + backrefs] = container;
        container[__context]    = node;
        container[__ref_index]  = backrefs;
    }

    return nodes;
}

},{"../internal/context":62,"../internal/prefix":70,"../internal/ref":73,"../internal/ref-index":72,"../internal/refs-length":74,"../support/array-append":99,"../support/array-slice":101,"../support/is-object":118,"../support/is-primitive":119}],145:[function(require,module,exports){
/*global define:false require:false */
module.exports = (function(){
	// Import Events
	var events = require('events')

	// Export Domain
	var domain = {}
	domain.createDomain = domain.create = function(){
		var d = new events.EventEmitter()

		function emitError(e) {
			d.emit('error', e)
		}

		d.add = function(emitter){
			emitter.on('error', emitError)
		}
		d.remove = function(emitter){
			emitter.removeListener('error', emitError)
		}
		d.bind = function(fn){
			return function(){
				var args = Array.prototype.slice.call(arguments)
				try {
					fn.apply(null, args)
				}
				catch (err){
					emitError(err)
				}
			}
		}
		d.intercept = function(fn){
			return function(err){
				if ( err ) {
					emitError(err)
				}
				else {
					var args = Array.prototype.slice.call(arguments, 1)
					try {
						fn.apply(null, args)
					}
					catch (err){
						emitError(err)
					}
				}
			}
		}
		d.run = function(fn){
			try {
				fn()
			}
			catch (err) {
				emitError(err)
			}
			return this
		};
		d.dispose = function(){
			this.removeAllListeners()
			return this
		};
		d.enter = d.exit = function(){
			return this
		}
		return d
	};
	return domain
}).call(this)
},{"events":146}],146:[function(require,module,exports){
// Copyright Joyent, Inc. and other Node contributors.
//
// Permission is hereby granted, free of charge, to any person obtaining a
// copy of this software and associated documentation files (the
// "Software"), to deal in the Software without restriction, including
// without limitation the rights to use, copy, modify, merge, publish,
// distribute, sublicense, and/or sell copies of the Software, and to permit
// persons to whom the Software is furnished to do so, subject to the
// following conditions:
//
// The above copyright notice and this permission notice shall be included
// in all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
// OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
// MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN
// NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
// DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
// OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE
// USE OR OTHER DEALINGS IN THE SOFTWARE.

function EventEmitter() {
  this._events = this._events || {};
  this._maxListeners = this._maxListeners || undefined;
}
module.exports = EventEmitter;

// Backwards-compat with node 0.10.x
EventEmitter.EventEmitter = EventEmitter;

EventEmitter.prototype._events = undefined;
EventEmitter.prototype._maxListeners = undefined;

// By default EventEmitters will print a warning if more than 10 listeners are
// added to it. This is a useful default which helps finding memory leaks.
EventEmitter.defaultMaxListeners = 10;

// Obviously not all Emitters should be limited to 10. This function allows
// that to be increased. Set to zero for unlimited.
EventEmitter.prototype.setMaxListeners = function(n) {
  if (!isNumber(n) || n < 0 || isNaN(n))
    throw TypeError('n must be a positive number');
  this._maxListeners = n;
  return this;
};

EventEmitter.prototype.emit = function(type) {
  var er, handler, len, args, i, listeners;

  if (!this._events)
    this._events = {};

  // If there is no 'error' event listener then throw.
  if (type === 'error') {
    if (!this._events.error ||
        (isObject(this._events.error) && !this._events.error.length)) {
      er = arguments[1];
      if (er instanceof Error) {
        throw er; // Unhandled 'error' event
      }
      throw TypeError('Uncaught, unspecified "error" event.');
    }
  }

  handler = this._events[type];

  if (isUndefined(handler))
    return false;

  if (isFunction(handler)) {
    switch (arguments.length) {
      // fast cases
      case 1:
        handler.call(this);
        break;
      case 2:
        handler.call(this, arguments[1]);
        break;
      case 3:
        handler.call(this, arguments[1], arguments[2]);
        break;
      // slower
      default:
        len = arguments.length;
        args = new Array(len - 1);
        for (i = 1; i < len; i++)
          args[i - 1] = arguments[i];
        handler.apply(this, args);
    }
  } else if (isObject(handler)) {
    len = arguments.length;
    args = new Array(len - 1);
    for (i = 1; i < len; i++)
      args[i - 1] = arguments[i];

    listeners = handler.slice();
    len = listeners.length;
    for (i = 0; i < len; i++)
      listeners[i].apply(this, args);
  }

  return true;
};

EventEmitter.prototype.addListener = function(type, listener) {
  var m;

  if (!isFunction(listener))
    throw TypeError('listener must be a function');

  if (!this._events)
    this._events = {};

  // To avoid recursion in the case that type === "newListener"! Before
  // adding it to the listeners, first emit "newListener".
  if (this._events.newListener)
    this.emit('newListener', type,
              isFunction(listener.listener) ?
              listener.listener : listener);

  if (!this._events[type])
    // Optimize the case of one listener. Don't need the extra array object.
    this._events[type] = listener;
  else if (isObject(this._events[type]))
    // If we've already got an array, just append.
    this._events[type].push(listener);
  else
    // Adding the second element, need to change to array.
    this._events[type] = [this._events[type], listener];

  // Check for listener leak
  if (isObject(this._events[type]) && !this._events[type].warned) {
    var m;
    if (!isUndefined(this._maxListeners)) {
      m = this._maxListeners;
    } else {
      m = EventEmitter.defaultMaxListeners;
    }

    if (m && m > 0 && this._events[type].length > m) {
      this._events[type].warned = true;
      console.error('(node) warning: possible EventEmitter memory ' +
                    'leak detected. %d listeners added. ' +
                    'Use emitter.setMaxListeners() to increase limit.',
                    this._events[type].length);
      if (typeof console.trace === 'function') {
        // not supported in IE 10
        console.trace();
      }
    }
  }

  return this;
};

EventEmitter.prototype.on = EventEmitter.prototype.addListener;

EventEmitter.prototype.once = function(type, listener) {
  if (!isFunction(listener))
    throw TypeError('listener must be a function');

  var fired = false;

  function g() {
    this.removeListener(type, g);

    if (!fired) {
      fired = true;
      listener.apply(this, arguments);
    }
  }

  g.listener = listener;
  this.on(type, g);

  return this;
};

// emits a 'removeListener' event iff the listener was removed
EventEmitter.prototype.removeListener = function(type, listener) {
  var list, position, length, i;

  if (!isFunction(listener))
    throw TypeError('listener must be a function');

  if (!this._events || !this._events[type])
    return this;

  list = this._events[type];
  length = list.length;
  position = -1;

  if (list === listener ||
      (isFunction(list.listener) && list.listener === listener)) {
    delete this._events[type];
    if (this._events.removeListener)
      this.emit('removeListener', type, listener);

  } else if (isObject(list)) {
    for (i = length; i-- > 0;) {
      if (list[i] === listener ||
          (list[i].listener && list[i].listener === listener)) {
        position = i;
        break;
      }
    }

    if (position < 0)
      return this;

    if (list.length === 1) {
      list.length = 0;
      delete this._events[type];
    } else {
      list.splice(position, 1);
    }

    if (this._events.removeListener)
      this.emit('removeListener', type, listener);
  }

  return this;
};

EventEmitter.prototype.removeAllListeners = function(type) {
  var key, listeners;

  if (!this._events)
    return this;

  // not listening for removeListener, no need to emit
  if (!this._events.removeListener) {
    if (arguments.length === 0)
      this._events = {};
    else if (this._events[type])
      delete this._events[type];
    return this;
  }

  // emit removeListener for all listeners on all events
  if (arguments.length === 0) {
    for (key in this._events) {
      if (key === 'removeListener') continue;
      this.removeAllListeners(key);
    }
    this.removeAllListeners('removeListener');
    this._events = {};
    return this;
  }

  listeners = this._events[type];

  if (isFunction(listeners)) {
    this.removeListener(type, listeners);
  } else {
    // LIFO order
    while (listeners.length)
      this.removeListener(type, listeners[listeners.length - 1]);
  }
  delete this._events[type];

  return this;
};

EventEmitter.prototype.listeners = function(type) {
  var ret;
  if (!this._events || !this._events[type])
    ret = [];
  else if (isFunction(this._events[type]))
    ret = [this._events[type]];
  else
    ret = this._events[type].slice();
  return ret;
};

EventEmitter.listenerCount = function(emitter, type) {
  var ret;
  if (!emitter._events || !emitter._events[type])
    ret = 0;
  else if (isFunction(emitter._events[type]))
    ret = 1;
  else
    ret = emitter._events[type].length;
  return ret;
};

function isFunction(arg) {
  return typeof arg === 'function';
}

function isNumber(arg) {
  return typeof arg === 'number';
}

function isObject(arg) {
  return typeof arg === 'object' && arg !== null;
}

function isUndefined(arg) {
  return arg === void 0;
}

},{}],147:[function(require,module,exports){
// shim for using process in browser

var process = module.exports = {};

process.nextTick = (function () {
    var canSetImmediate = typeof window !== 'undefined'
    && window.setImmediate;
    var canPost = typeof window !== 'undefined'
    && window.postMessage && window.addEventListener
    ;

    if (canSetImmediate) {
        return function (f) { return window.setImmediate(f) };
    }

    if (canPost) {
        var queue = [];
        window.addEventListener('message', function (ev) {
            var source = ev.source;
            if ((source === window || source === null) && ev.data === 'process-tick') {
                ev.stopPropagation();
                if (queue.length > 0) {
                    var fn = queue.shift();
                    fn();
                }
            }
        }, true);

        return function nextTick(fn) {
            queue.push(fn);
            window.postMessage('process-tick', '*');
        };
    }

    return function nextTick(fn) {
        setTimeout(fn, 0);
    };
})();

process.title = 'browser';
process.browser = true;
process.env = {};
process.argv = [];

function noop() {}

process.on = noop;
process.addListener = noop;
process.once = noop;
process.off = noop;
process.removeListener = noop;
process.removeAllListeners = noop;
process.emit = noop;

process.binding = function (name) {
    throw new Error('process.binding is not supported');
}

// TODO(shtylman)
process.cwd = function () { return '/' };
process.chdir = function (dir) {
    throw new Error('process.chdir is not supported');
};

},{}],148:[function(require,module,exports){
(function (global){
/*!
 * Copyright 2014 Netflix, Inc
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express
 * or implied. See the License for the specific language governing
 * permissions and limitations under the License.
 */
!function(e){if("object"==typeof exports)module.exports=e();else if("function"==typeof define&&define.amd)define(e);else{var f;"undefined"!=typeof window?f=window:"undefined"!=typeof global?f=global:"undefined"!=typeof self&&(f=self),f.falcor=e()}}(function(){var define,module,exports;return (function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);throw new Error("Cannot find module '"+o+"'")}var f=n[o]={exports:{}};t[o][0].call(f.exports,function(e){var n=t[o][1][e];return s(n?n:e)},f,f.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(_dereq_,module,exports){
module.exports = _dereq_('./operations');

},{"./operations":149}],2:[function(_dereq_,module,exports){
if (typeof falcor === 'undefined') {
    var falcor = {};
}
var Rx = _dereq_('./rx.ultralite');

falcor.__Internals = {};
falcor.Observable = Rx.Observable;
falcor.EXPIRES_NOW = 0;
falcor.EXPIRES_NEVER = 1;
/**
 * The current semVer'd data version of falcor.
 */
falcor.dataVersion = '0.1.0';

falcor.now = function now() {
    return Date.now();
};
falcor.NOOP = function() {};

module.exports = falcor;

},{"./rx.ultralite":41}],3:[function(_dereq_,module,exports){
var falcor = _dereq_('./Falcor');
var RequestQueue = _dereq_('./request/RequestQueue');
var ImmediateScheduler = _dereq_('./scheduler/ImmediateScheduler');
var TimeoutScheduler = _dereq_('./scheduler/TimeoutScheduler');
var ERROR = _dereq_("../types/error");
var ModelResponse = _dereq_('./ModelResponse');
var call = _dereq_('./operations/call');
var operations = _dereq_('./operations');
var dotSyntaxParser = _dereq_('./operations/parser/parser');
var getBoundValue = _dereq_('./../get/getBoundValue');
var slice = Array.prototype.slice;
var $ref = _dereq_('./../types/path');
var $error = _dereq_('./../types/error');
var $sentinel = _dereq_('./../types/sentinel');

var Model = module.exports = falcor.Model = function Model(options) {

    if (!options) {
        options = {};
    }

    this._materialized = options.materialized || false;
    this._boxed = options.boxed || false;
    this._treatErrorsAsValues = options.treatErrorsAsValues || false;

    this._dataSource = options.source;
    this._maxSize = options.maxSize || Math.pow(2, 53) - 1;
    this._collectRatio = options.collectRatio || 0.75;
    this._scheduler = new ImmediateScheduler();
    this._request = new RequestQueue(this, this._scheduler);
    this._errorSelector = options.errorSelector || Model.prototype._errorSelector;
    this._router = options.router;

    this._root = options.root || {
        expired: [],
        allowSync: false,
        unsafeMode: true
    };
    if (options.cache && typeof options.cache === "object") {
        this.setCache(options.cache);
    } else {
        this._cache = {};
    }
    this._path = [];
};

Model.EXPIRES_NOW = falcor.EXPIRES_NOW;
Model.EXPIRES_NEVER = falcor.EXPIRES_NEVER;

Model.ref = function(path) {
    if (typeof path === 'string') {
        path = dotSyntaxParser(path);
    }
    return {$type: $ref, value: path};
};

Model.error = function(error) {
    return {$type: $error, value: error};
};

Model.atom = function(value) {
    return {$type: $sentinel, value: value};
};

Model.prototype = {
    _boxed: false,
    _progressive: false,
    _errorSelector: function(x, y) { return y; },
    get: operations('get'),
    set: operations("set"),
    invalidate: operations("invalidate"),
    call: call,
    getValue: function(path) {
        return this.get(path, function(x) { return x });
    },
    setValue: function(path, value) {
        return this.set(Array.isArray(path) ?
        {path: path, value: value} :
            path, function(x) { return x; });
    },
    bind: function(boundPath) {

        var model = this, root = model._root,
            paths = new Array(arguments.length - 1),
            i = -1, n = arguments.length - 1;

        while(++i < n) {
            paths[i] = arguments[i + 1];
        }

        if(n === 0) { throw new Error("Model#bind requires at least one value path."); }

        return falcor.Observable.create(function(observer) {

            var boundModel;
            try {
                root.allowSync = true;
                if(!(boundModel = model.bindSync(model._path.concat(boundPath)))) {
                    throw false;
                }
                root.allowSync = false;
                observer.onNext(boundModel);
                observer.onCompleted();
            } catch (e) {
                root.allowSync = false;
                return model.get.apply(model, paths.map(function(path) {
                    return boundPath.concat(path);
                }).concat(function(){})).subscribe(
                    function onNext() {},
                    function onError(err)  { observer.onError(err); },
                    function onCompleted() {
                        try {
                            if(boundModel = model.bindSync(boundPath)) {
                                observer.onNext(boundModel);
                            }
                            observer.onCompleted();
                        } catch(e) {
                            observer.onError(e);
                        }
                    });
            }
        });
    },
    setCache: function(cache) {
        return (this._cache = {}) && this._setCache(this, cache);
    },
    getValueSync: function(path) {
        if (Array.isArray(path) === false) {
            throw new Error("Model#getValueSync must be called with an Array path.");
        }
        if (this._path.length) {
            path = this._path.concat(path);
        }
        return this.syncCheck("getValueSync") && this._getValueSync(this, path).value;
    },
    setValueSync: function(path, value, errorSelector) {

        if(Array.isArray(path) === false) {
            if(typeof errorSelector !== "function") {
                errorSelector = value || this._errorSelector;
            }
            value = path.value;
            path  = path.path;
        }

        if(Array.isArray(path) === false) {
            throw new Error("Model#setValueSync must be called with an Array path.");
        }

        if(this.syncCheck("setValueSync")) {

            var json = {};
            var tEeAV = this._treatErrorsAsValues;
            var boxed = this._boxed;

            this._treatErrorsAsValues = true;
            this._boxed = true;

            this._setPathSetsAsJSON(this, [{path: path, value: value}], [json], errorSelector);

            this._treatErrorsAsValues = tEeAV;
            this._boxed = boxed;

            json = json.json;

            if(json && json.$type === ERROR && !this._treatErrorsAsValues) {
                if(this._boxed) {
                    throw json;
                } else {
                    throw json.value;
                }
            } else if(this._boxed) {
                return json;
            }

            return json && json.value;
        }
    },
    bindSync: function(path) {
        if(Array.isArray(path) === false) {
            throw new Error("Model#bindSync must be called with an Array path.");
        }
        var boundValue = this.syncCheck("bindSync") && getBoundValue(this, this._path.concat(path));
        var node = boundValue.value;
        path = boundValue.path;
        if(boundValue.shorted) {
            if(!!node) {
                if(node.$type === ERROR) {
                    if(this._boxed) {
                        throw node;
                    }
                    throw node.value;
                    // throw new Error("Model#bindSync can\'t bind to or beyond an error: " + boundValue.toString());
                }
            }
            return undefined;
        } else if(!!node && node.$type === ERROR) {
            if(this._boxed) {
                throw node;
            }
            throw node.value;
        }
        return this.clone(["_path", boundValue.path]);
    },
    // TODO: This seems like a great place for optimizations
    clone: function() {
        var self = this;
        var clone = new Model();

        Object.keys(self).forEach(function(key) {
            clone[key] = self[key];
        });

        slice.call(arguments).forEach(function(tuple) {
            clone[tuple[0]] = tuple[1];
        });

        return clone;
    },
    batch: function(schedulerOrDelay) {
        if(typeof schedulerOrDelay === "number") {
            schedulerOrDelay = new TimeoutScheduler(Math.round(Math.abs(schedulerOrDelay)));
        } else if(!schedulerOrDelay || !schedulerOrDelay.schedule) {
            schedulerOrDelay = new ImmediateScheduler();
        }
        return this.clone(["_request", new RequestQueue(this, schedulerOrDelay)]);
    },
    unbatch: function() {
        return this.clone(["_request", new RequestQueue(this, new ImmediateScheduler())]);
    },
    treatErrorsAsValues: function() {
        return this.clone(["_treatErrorsAsValues", true]);
    },
    materialize: function() {
        return this.clone(["_materialized", true]);
    },
    boxValues: function() {
        return this.clone(["_boxed", true]);
    },
    unboxValues: function() {
        return this.clone(["_boxed", false]);
    },
    withoutDataSource: function() {
        return this.clone(["_dataSource", null]);
    },
    syncCheck: function(name) {
        if (!!this._dataSource && this._root.allowSync === false && this._root.unsafeMode === false) {
            throw new Error("Model#" + name + " may only be called within the context of a request selector.");
        }
        return true;
    }
};

},{"../types/error":139,"./../get/getBoundValue":49,"./../types/error":139,"./../types/path":140,"./../types/sentinel":141,"./Falcor":2,"./ModelResponse":4,"./operations":11,"./operations/call":6,"./operations/parser/parser":16,"./request/RequestQueue":40,"./scheduler/ImmediateScheduler":42,"./scheduler/TimeoutScheduler":43}],4:[function(_dereq_,module,exports){
var falcor = _dereq_('./Falcor');

var Observable  = falcor.Observable,
    valuesMixin = { format: { value: "AsValues"  } },
    jsonMixin   = { format: { value: "AsPathMap" } },
    jsongMixin  = { format: { value: "AsJSONG"   } },
    progressiveMixin = { operationIsProgressive: { value: true } };

function ModelResponse(forEach) {
    this._subscribe = forEach;
}

ModelResponse.create = function(forEach) {
    return new ModelResponse(forEach);
};

ModelResponse.fromOperation = function(model, args, selector, forEach) {
    return new ModelResponse(function(observer) {
        return forEach(Object.create(observer, {
            operationModel: {value: model},
            operationArgs: {value: args},
            operationSelector: {value: selector}
        }));
    });
};

function noop() {}
function mixin(self) {
    var mixins = Array.prototype.slice.call(arguments, 1);
    return new ModelResponse(function(other) {
        return self.subscribe(mixins.reduce(function(proto, mixin) {
            return Object.create(proto, mixin);
        }, other));
    });
}

ModelResponse.prototype = Observable.create(noop);
ModelResponse.prototype.format = "AsPathMap";
ModelResponse.prototype.toPathValues = function() {
    return mixin(this, valuesMixin);
};
ModelResponse.prototype.toJSON = function() {
    return mixin(this, jsonMixin);
};
ModelResponse.prototype.progressively = function() {
    return mixin(this, progressiveMixin);
};
ModelResponse.prototype.toJSONG = function() {
    return mixin(this, jsongMixin);
};

module.exports = ModelResponse;

},{"./Falcor":2}],5:[function(_dereq_,module,exports){
var falcor = _dereq_('./Falcor');
var Model = _dereq_('./Model');
falcor.Model = Model;

module.exports = falcor;

},{"./Falcor":2,"./Model":3}],6:[function(_dereq_,module,exports){
module.exports = call;

var falcor = _dereq_("../../Falcor");
var ModelResponse = _dereq_('./../../ModelResponse');

function call(path, args, suffixes, paths, selector) {

    var model = this;
    args && Array.isArray(args) || (args = []);
    suffixes && Array.isArray(suffixes) || (suffixes = []);
    paths = Array.prototype.slice.call(arguments, 3);
    if (typeof (selector = paths[paths.length - 1]) !== "function") {
        selector = undefined;
    } else {
        paths = paths.slice(0, -1);
    }

    return ModelResponse.create(function (options) {

        var rootModel = model.clone(["_path", []]),
            localRoot = rootModel.withoutDataSource(),
            dataSource = model._dataSource,
            boundPath = model._path,
            callPath = boundPath.concat(path),
            thisPath = callPath.slice(0, -1);

        var disposable = model.
            getValue(path).
            flatMap(function (localFn) {
                if (typeof localFn === "function") {
                    return falcor.Observable.return(localFn.
                        apply(rootModel.bindSync(thisPath), args).
                        map(function (pathValue) {
                            return {
                                path: thisPath.concat(pathValue.path),
                                value: pathValue.value
                            };
                        }).
                        toArray().
                        flatMap(function (pathValues) {
                            return localRoot.set.
                                apply(localRoot, pathValues).
                                toJSONG();
                        }).
                        flatMap(function (envelope) {
                            return rootModel.get.apply(rootModel,
                                envelope.paths.reduce(function (paths, path) {
                                    return paths.concat(suffixes.map(function (suffix) {
                                        return path.concat(suffix);
                                    }));
                                }, []).
                                    concat(paths.reduce(function (paths, path) {
                                        return paths.concat(thisPath.concat(path));
                                    }, []))).
                                toJSONG();
                        }));
                }
                return falcor.Observable.empty();
            }).
            defaultIfEmpty(dataSource.call(path, args, suffixes, paths)).
            mergeAll().
            subscribe(function (envelope) {
                var invalidated = envelope.invalidated;
                if (invalidated && invalidated.length) {
                    invalidatePaths(rootModel, invalidated, undefined, model._errorSelector);
                }
                disposable = localRoot.
                    set(envelope, function () {
                        return model;
                    }).
                    subscribe(function (model) {
                        var getPaths = envelope.paths.map(function (path) {
                            return path.slice(boundPath.length);
                        });
                        if (selector) {
                            getPaths[getPaths.length] = function () {
                                return selector.call(model, getPaths);
                            };
                        }
                        disposable = model.get.apply(model, getPaths).subscribe(options);
                    });
            });

        return {
            dispose: function () {
                disposable && disposable.dispose();
                disposable = undefined;
            }
        };
    });
}

},{"../../Falcor":2,"./../../ModelResponse":4}],7:[function(_dereq_,module,exports){
var combineOperations = _dereq_('./../support/combineOperations');
var setSeedsOrOnNext = _dereq_('./../support/setSeedsOrOnNext');

/**
 * The initial args that are passed into the async request pipeline.
 * @see lib/falcor/operations/request.js for how initialArgs are used
 */
module.exports = function getInitialArgs(options, seeds, onNext) {
    var seedRequired = options.format !== 'AsValues';
    var isProgressive = options.operationIsProgressive;
    var spreadOperations = false;
    var operations =
        combineOperations(
            options.operationArgs, options.format, 'get',
            spreadOperations, isProgressive);
    setSeedsOrOnNext(
        operations, seedRequired, seeds, onNext, options.operationSelector);
    var requestOptions;
    return [operations];
};

},{"./../support/combineOperations":26,"./../support/setSeedsOrOnNext":39}],8:[function(_dereq_,module,exports){
var getSourceObserver = _dereq_('./../support/getSourceObserever');
var partitionOperations = _dereq_('./../support/partitionOperations');
var mergeBoundPath = _dereq_('./../support/mergeBoundPath');

module.exports = getSourceRequest;

function getSourceRequest(
    options, onNext, seeds, combinedResults, requestOptions, cb) {

    var model = options.operationModel;
    var boundPath = model._path;
    var missingPaths = combinedResults.requestedMissingPaths;
    if (boundPath.length) {
        for (var i = 0; i < missingPaths.length; ++i) {
            var pathSetIndex = missingPaths[i].pathSetIndex;
            var path = missingPaths[i] = boundPath.concat(missingPaths[i]);
            path.pathSetIndex = pathSetIndex;
        }
    }

    return model._request.get(
        missingPaths,
        combinedResults.optimizedMissingPaths,
        getSourceObserver(
            model,
            missingPaths,
            function getSourceCallback(err, results) {
                if (err) {
                    cb(err);
                    return;
                }

                // partitions the operations by their pathSetIndex
                var partitionOperationsAndSeeds = partitionOperations(
                    results,
                    seeds,
                    options.format,
                    onNext);

                // We allow for the rerequesting to happen.
                cb(null, partitionOperationsAndSeeds);
            }));
}


},{"./../support/getSourceObserever":27,"./../support/mergeBoundPath":31,"./../support/partitionOperations":34}],9:[function(_dereq_,module,exports){
var getInitialArgs = _dereq_('./getInitialArgs');
var getSourceRequest = _dereq_('./getSourceRequest');
var shouldRequest = _dereq_('./shouldRequest');
var request = _dereq_('./../request');
var processOperations = _dereq_('./../support/processOperations');
var get = request(
    getInitialArgs,
    getSourceRequest,
    processOperations,
    shouldRequest);

module.exports = get;

},{"./../request":18,"./../support/processOperations":36,"./getInitialArgs":7,"./getSourceRequest":8,"./shouldRequest":10}],10:[function(_dereq_,module,exports){
module.exports = function(model, combinedResults) {
    return model._dataSource && combinedResults.requestedMissingPaths.length > 0;
};

},{}],11:[function(_dereq_,module,exports){
var ModelResponse = _dereq_('../ModelResponse');
var get = _dereq_('./get');
var set = _dereq_('./set');
var invalidate = _dereq_('./invalidate');

module.exports = function modelOperation(name) {
    return function() {
        var model = this, root = model._root,
            args = Array.prototype.slice.call(arguments),
            selector = args[args.length - 1];
        if (typeof selector === 'function') {
            args.pop();
        } else {
            selector = false;
        }

        var modelResponder;
        switch (name) {
            case 'get':
                modelResponder = get;
                break;
            case 'set':
                modelResponder = set;
                break;
            case 'invalidate':
                modelResponder = invalidate;
                break;
        }
        return ModelResponse.fromOperation(
            model,
            args,
            selector,
            modelResponder);
    };
};

},{"../ModelResponse":4,"./get":9,"./invalidate":12,"./set":19}],12:[function(_dereq_,module,exports){
var invalidateInitialArgs = _dereq_('./invalidateInitialArgs');
var request = _dereq_('./../request');
var processOperations = _dereq_('./../support/processOperations');
var invalidate = request(
    invalidateInitialArgs,
    null,
    processOperations);

module.exports = invalidate;

},{"./../request":18,"./../support/processOperations":36,"./invalidateInitialArgs":13}],13:[function(_dereq_,module,exports){
var combineOperations = _dereq_('./../support/combineOperations');
var setSeedsOrOnNext = _dereq_('./../support/setSeedsOrOnNext');
module.exports = function getInitialArgs(options, seeds, onNext) {
    var seedRequired = options.format !== 'AsValues';
    var operations = combineOperations(
        options.operationArgs, options.format, 'inv');
    setSeedsOrOnNext(
        operations, seedRequired, seeds,
        onNext, options.operationSelector);

    return [operations, seeds];
};

},{"./../support/combineOperations":26,"./../support/setSeedsOrOnNext":39}],14:[function(_dereq_,module,exports){
module.exports = {
    token: 'token',
    dotSeparator: '.',
    commaSeparator: ',',
    openingBracket: '[',
    closingBracket: ']',
    space: 'space',
    quote: 'quote',
    unknown: 'unknown'
};

},{}],15:[function(_dereq_,module,exports){
module.exports = {
    nestedIndexers: 'Indexers cannot be nested',
    closingWithoutOpeningIndexer: 'A closing indexer, "]", was provided without an opening indexer.',
    leadingDotInIndexer: 'The dot operator in an indexer cannot be used this way.',
    twoDot: 'Cannot have two dot separators outside of an indexer range.',
    dotComma: 'Cannot have a comma preceded by a dot separator.',
    commasOutsideOfIndexers: 'Commas cannot be used outside of indexers.',
    trailingComma: 'Cannot have trailing commas in indexers.',
    leadingComma: 'Leading commas in ranges are not allowed.',
    emptyQuotes: 'Cannot have empty quotes',
    emptyIndexer: 'Cannot have empty indexer.',
    quotesOutsideIndexer: 'Cannot have quotes outside indexer.',
    nonTerminatingQuotes: 'The quotes within the indexer were not closed.',
    tokensMustBeNumeric: 'Tokens without quotes must be numeric.',
    indexerTokensMustBeCommaDelimited: 'Indexer tokens must be comma delimited.',
    numericRange: 'Only numeric keys can be used in ranges.'
};

},{}],16:[function(_dereq_,module,exports){
var tokenizer = _dereq_('./tokenizer');
var TokenTypes = _dereq_('./TokenTypes');
var Expections = _dereq_('./expections');

/**
 * not only is this the parser, it is also the
 * semantic analyzer for brevity sake / we never need
 * this to change overall types of output.
 */
module.exports = function parser(string) {
    var out = [];
    var tokenized = tokenizer(string);
    var state = {};

    var token = tokenized();
    while (!token.done) {

        switch (token.type) {
            case TokenTypes.token:
                insertToken(token.token, state, out);
                break;
            case TokenTypes.dotSeparator:
                dotSeparator(token.token, state, out);
                break;
            case TokenTypes.space:
                space(token.token, state, out);
                break;
            case TokenTypes.commaSeparator:
                commaSeparator(token.token, state, out);
                break;
            case TokenTypes.openingBracket:
                openIndexer(token.token, state, out);
                break;
            case TokenTypes.closingBracket:
                closeIndexer(token.token, state, out);
                break;
            case TokenTypes.quote:
                quote(token.token, state, out);
                break;
        }

        token = tokenized();
    }

    return out;
};

function space(token, state, out) {
    // The space character only matters when inIndexer
    // and in quote mode.
    if (state.inIndexer && state.quote) {
        state.indexerToken += token;
    }
}

function insertToken(token, state, out) {
    state.hasDot = false;

    // if within indexer then there are several edge cases.
    if (state.inIndexer) {
        tokenInIndexer(token, state, out);
        return;
    }

    // if not in indexer just insert into end position.
    out[out.length] = token;
}

function dotSeparator(token, state, out) {

    // If in indexer then dotOperators have different meanings.
    if (state.inIndexer) {
        indexerDotOperator(token, state, out);
    }

    // throws an expection if a range operator is outside of a range.
    else if (state.hasDot) {
        throw Expections.twoDot;
    }
    state.hasDot = true;
}

function commaSeparator(token, state, out) {
    if (state.hasDot) {
        throw Expections.dotComma;
    }

    // If in indexer then dotOperators have different meanings.
    if (state.inIndexer) {
        indexerCommaOperator(token, state, out);
    }
}

// Accumulates dotSeparators inside indexers
function indexerDotOperator(token, state, out) {

    // must be preceded by token.
    if (state.indexerToken === undefined) {
        throw Expections.leadingDotInIndexer;
    }

    // if in quote mode, add the dot indexer to quote.
    if (state.quote) {
        state.indexerToken += token;
        return;
    }


    if (!state.rangeCount) {
        state.range = true;
        state.rangeCount = 0;
    }

    ++state.rangeCount;

    if (state.rangeCount === 2) {
        state.inclusiveRange = true;
    }

    else if (state.rangeCount === 3) {
        state.exclusiveRange = true;
        state.inclusiveRange = false;
    }
}

function indexerCommaOperator(token, state, out) {

    // are we a range indexer?
    if (state.range) {
        closeRangedIndexer(token, state, out);
    }

    // push previous token and clear state.
    else if (state.inIndexer) {
        pushTokenIntoIndexer(token, state, out);
    }

    // If a comma is used outside of an indexer throw
    else {
        throw Expections.commasOutsideOfIndexers;
    }
}

function pushTokenIntoIndexer(token, state, out) {
    // no token to push, throw error.
    if (state.indexerToken === undefined) {
        throw Expections.leadingComma;
    }

    // push the current token onto the stack then clear state.
    state.indexer[state.indexer.length] = state.indexerToken;
    cleanIndexerTokenState(state);
}

function openIndexer(token, state, out) {
    if (state.inIndexer) {
        throw Expections.nestedIndexers;
    }
    state.inIndexer = true;
    state.indexer = [];
}

function closeIndexer(token, state, out) {

    // must be within an indexer to close.
    if (!state.inIndexer) {
        throw Expections.closingWithoutOpeningIndexer;
    }

    // The quotes could be non terminating
    if (state.quote) {
        throw Expections.nonTerminatingQuotes;
    }


    // are we a range indexer?
    if (state.range) {
        closeRangedIndexer(token, state, out);
    }

    // are we have a token?
    else if (state.indexerToken !== undefined) {
        pushTokenIntoIndexer(token, state, out);
    }

    // empty indexer.  Must be after the potential addition
    // statements.
    if (state.indexer && state.indexer.length === 0) {
        throw Expections.emptyIndexer;
    }

    // flatten to avoid odd JSON output.
    if (state.indexer && state.indexer.length === 1) {
        state.indexer = state.indexer[0];
    }

    out[out.length] = state.indexer;

    // removes all indexer state
    cleanIndexerRangeState(state);
    cleanIndexerTokenState(state);
    state.indexer =
        state.inIndexer = undefined;
}

function closeRangedIndexer(token, state, out) {
    state.indexer[state.indexer.length] = {
        from: state.indexerToken,
        to: state.rangeCloseToken - (state.exclusiveRange && 1 || 0)
    };
    cleanIndexerRangeState(state);
}

function cleanIndexerRangeState(state) {
    state.inclusiveRange =
        state.exclusiveRange =
        state.range =
        state.rangeCloseToken =
        state.rangeCount = undefined;
}

// removes state associated with indexerTokenState.
function cleanIndexerTokenState(state) {
    state.indexerToken =
        state.indexerTokenQuoted = undefined;
}

function tokenInRange(token, state, out) {
    token = +token;
    if (isNaN(token)) {
        throw Expections.numericRange;
    }

    state.rangeCloseToken = token;
}

function tokenInIndexer(token, state, out) {

    // finish the range token.
    if (state.range) {
        tokenInRange(token, state, out);
    }


    // quote mode, accumulate tokens.
    else if (state.quote) {
        if (state.indexerToken === undefined) {
            state.indexerToken = '';
        }
        state.indexerToken += token;
    }

    // We are in range mode.
    else {
        token = +token;
        if (isNaN(token)) {
            throw Expections.tokensMustBeNumeric;
        }

        state.indexerToken = token;
    }
}

// this function just ensures that quotes only happen in indexers,
// outside of ranges, and with 1 or more length tokens.
function quote(token, state, out) {

    if (state.indexerTokenQuoted) {
        throw Expections.indexerTokensMustBeCommaDelimited;
    }

    if (!state.inIndexer) {
        throw Expections.quotesOutsideIndexer;
    }

    var was = state.quote;
    var toBe = !was;
    state.quote = toBe;

    // so deep
    if (was && !toBe) {
        if (state.indexerToken === undefined) {
            throw Expections.emptyQuotes;
        }
        state.indexerTokenQuoted = true;
    }
}

},{"./TokenTypes":14,"./expections":15,"./tokenizer":17}],17:[function(_dereq_,module,exports){
var TokenTypes = _dereq_('./TokenTypes');
var DOT_SEPARATOR = '.';
var COMMA_SEPARATOR = ',';
var OPENING_BRACKET = '[';
var CLOSING_BRACKET = ']';
var DOUBLE_OUOTES = '"';
var SINGE_OUOTES = "'";
var SPACE = " ";
var SPECIAL_CHARACTERS = '\'"[]., ';
var TokenTypes = _dereq_('./TokenTypes');

module.exports = function tokenizer(string) {
    var idx = -1;
    return function() {
        var token = '';
        var done;
        do {

            done = idx === string.length;
            if (done) {
                return {done: true};
            }
            // we have to peek at the next token
            var character = string[idx + 1];

            // if its not a special character we need to accumulate it.
            var isQuote = character === SINGE_OUOTES ||
                character === DOUBLE_OUOTES;

            if (character !== undefined &&
                    SPECIAL_CHARACTERS.indexOf(character) === -1) {
                token += character;
                ++idx;
                continue;
            }
            if (token.length) {
                return toOutput(token, TokenTypes.token, done);
            }

            ++idx;
            var type;
            switch (character) {
                case DOT_SEPARATOR:
                    type = TokenTypes.dotSeparator;
                    break;
                case COMMA_SEPARATOR:
                    type = TokenTypes.commaSeparator;
                    break;
                case OPENING_BRACKET:
                    type = TokenTypes.openingBracket;
                    break;
                case CLOSING_BRACKET:
                    type = TokenTypes.closingBracket;
                    break;
                case SPACE:
                    type = TokenTypes.space;
                    break;
                case DOUBLE_OUOTES:
                case SINGE_OUOTES:
                    type = TokenTypes.quote;
                    break;
            }
            if (type) {
                return toOutput(token, type, done);
            }
        } while (!done);
        if (token.length) {
            return toOutput(token, TokenTypes.token, false);
        }
        return {done: true};
    };
};

function toOutput(token, type, done) {
    return {
        token: token,
        done: done,
        type: type
    };
}


},{"./TokenTypes":14}],18:[function(_dereq_,module,exports){
var setSeedsOrOnNext = _dereq_('./support/setSeedsOrOnNext');
var onNextValues = _dereq_('./support/onNextValue');
var onCompletedOrError = _dereq_('./support/onCompletedOrError');
var dotSyntaxParser = _dereq_('./parser/parser');
var primeSeeds = _dereq_('./support/primeSeeds');
var autoFalse = function() { return false; };

module.exports = request;

function request(initialArgs, sourceRequest, processOperations, shouldRequestFn) {
    if (!shouldRequestFn) {
        shouldRequestFn = autoFalse;
    }
    return function innerRequest(options) {
        var selector = options.operationSelector;
        var model = options.operationModel;
        var args = options.operationArgs;
        var onNext = options.onNext.bind(options);
        var onError = options.onError.bind(options);
        var onCompleted = options.onCompleted.bind(options);
        var isProgressive = options.operationIsProgressive;
        var errorSelector = model._errorSelector;
        var selectorLength = selector && selector.length || 0;

        // State variables
        var errors = [];
        var format = options.format = selector && 'AsJSON' ||
            options.format || 'AsPathMap';
        var toJSONG = format === 'AsJSONG';
        var toJSON = format === 'AsPathMap';
        var toPathValues = format === 'AsValues';
        var seedRequired = toJSON || toJSONG || selector;
        var boundPath = model._path;
        var i, len;
        var foundValue = false;
        var seeds = primeSeeds(selector, selectorLength);
        var loopCount = 0;

        // parse any dotSyntax
        for (i = 0, len = args.length; i < len; i++) {
            // it is a dotSyntax string.
            if (typeof args[i] === 'string') {
                args[i] = dotSyntaxParser(args[i]);
            }

            // it is a pathValue with dotSyntax.
            else if (typeof args[i].path === 'string') {
                args[i].path = dotSyntaxParser(args[i].path);
            }
        }

        function recurse(operations, opts) {
            if (loopCount > 50) {
                throw 'Loop Kill switch thrown.';
            }
            var combinedResults = processOperations(
                model,
                operations,
                errorSelector,
                opts);

            foundValue = foundValue || combinedResults.valuesReceived;
            if (combinedResults.errors.length) {
                errors = errors.concat(combinedResults.errors);
            }

            // if in progressiveMode, values are emitted
            // each time through the recurse loop.  This may have
            // to change when the router is considered.
            if (isProgressive && !toPathValues) {
                onNextValues(model, onNext, seeds, selector);
            }

            // Performs the recursing via dataSource
            if (shouldRequestFn(model, combinedResults, loopCount)) {
                sourceRequest(
                    options,
                    onNext,
                    seeds,
                    combinedResults,
                    opts,
                    function onCompleteFromSourceSet(err, results) {
                        if (err) {
                            errors = errors.concat(err);
                            recurse([], seeds);
                            return;
                        }
                        ++loopCount;

                        // We continue to string the opts through
                        recurse(results, opts);
                    });
            }

            // Else we need to onNext values and complete/error.
            else {
                if (!toPathValues && !isProgressive && foundValue) {
                    onNextValues(model, onNext, seeds, selector);
                }
                onCompletedOrError(onCompleted, onError, errors);
            }
        }

        try {
            recurse.apply(null,
                initialArgs(options, seeds, onNext));
        } catch(e) {
            errors = [e];
            onCompletedOrError(onCompleted, onError, errors);
        }
    };
}

},{"./parser/parser":16,"./support/onCompletedOrError":32,"./support/onNextValue":33,"./support/primeSeeds":35,"./support/setSeedsOrOnNext":39}],19:[function(_dereq_,module,exports){
var setInitialArgs = _dereq_('./setInitialArgs');
var setSourceRequest = _dereq_('./setSourceRequest');
var request = _dereq_('./../request');
var setProcessOperations = _dereq_('./setProcessOperations');
var shouldRequest = _dereq_('./shouldRequest');
var set = request(
    setInitialArgs,
    setSourceRequest,
    setProcessOperations,
    shouldRequest);

module.exports = set;

},{"./../request":18,"./setInitialArgs":20,"./setProcessOperations":21,"./setSourceRequest":22,"./shouldRequest":23}],20:[function(_dereq_,module,exports){
var combineOperations = _dereq_('./../support/combineOperations');
var setSeedsOrOnNext = _dereq_('./../support/setSeedsOrOnNext');
var Formats = _dereq_('./../support/Formats');
var toPathValues = Formats.toPathValues;
var toJSONG = Formats.toJSONG;
module.exports = function setInitialArgs(options, seeds, onNext) {
    var isPathValues = options.format === toPathValues;
    var seedRequired = !isPathValues;
    var shouldRequest = !!options.operationModel._dataSource;
    var format = options.format;
    var args = options.operationArgs;
    var selector = options.operationSelector;
    var isProgressive = options.operationIsProgressive;
    var firstSeeds, operations;
    var requestOptions = {
        removeBoundPath: shouldRequest
    };

    // If Model is a slave, in shouldRequest mode,
    // a single seed is required to accumulate the jsong results.
    if (shouldRequest) {
        operations =
            combineOperations(args, toJSONG, 'set', selector, false);
        firstSeeds = [{}];
        setSeedsOrOnNext(
            operations, true, firstSeeds, false, options.selector);

        // we must keep track of the set seeds.
        requestOptions.requestSeed = firstSeeds[0];
    }

    // This model is the master, therefore a regular set can be performed.
    else {
        firstSeeds = seeds;
        operations = combineOperations(args, format, 'set');
        setSeedsOrOnNext(
            operations, seedRequired, seeds, onNext, options.operationSelector);
    }

    // We either have to construct the master operations if
    // the ModelResponse is isProgressive
    // the ModelResponse is toPathValues
    // but luckily we can just perform a get for the progressive or
    // toPathValues mode.
    if (isProgressive || isPathValues) {
        var getOps = combineOperations(
            args, format, 'get', selector, true);
        setSeedsOrOnNext(
            getOps, seedRequired, seeds, onNext, options.operationSelector);
        operations = operations.concat(getOps);

        requestOptions.isProgressive = true;
    }

    return [operations, requestOptions];
};

},{"./../support/Formats":24,"./../support/combineOperations":26,"./../support/setSeedsOrOnNext":39}],21:[function(_dereq_,module,exports){
var processOperations = _dereq_('./../support/processOperations');
var combineOperations = _dereq_('./../support/combineOperations');
var mergeBoundPath = _dereq_('./../support/mergeBoundPath');
var Formats = _dereq_('./../support/Formats');
var toPathValues = Formats.toPathValues;

module.exports = setProcessOperations;

function setProcessOperations(model, operations, errorSelector, requestOptions) {

    var boundPath = model._path;
    var hasBoundPath = boundPath.length > 0;
    var removeBoundPath = requestOptions && requestOptions.removeBoundPath;
    var isProgressive = requestOptions && requestOptions.isProgressive;
    var progressiveOperations;

    // if in progressive mode, then the progressive operations
    // need to be executed but the bound path must stay intact.
    if (isProgressive && removeBoundPath && hasBoundPath) {
        progressiveOperations = operations.filter(function(op) {
            return op.isProgressive;
        });
        operations = operations.filter(function(op) {
            return !op.isProgressive;
        });
    }

    if (removeBoundPath && hasBoundPath) {
        model._path = [];

        // For every operations arguments, the bound path must be adjusted.
        for (var i = 0, opLen = operations.length; i < opLen; i++) {
            var args = operations[i].args;
            for (var j = 0, argsLen = args.length; j < argsLen; j++) {
                args[j] = mergeBoundPath(args[j], boundPath);
            }
        }
    }

    var results = processOperations(model, operations, errorSelector);

    // Undo what we have done to the model's bound path.
    if (removeBoundPath && hasBoundPath) {
        model._path = boundPath;
    }

    // executes the progressive ops
    if (progressiveOperations) {
        processOperations(model, progressiveOperations, errorSelector);
    }

    return results;
}

},{"./../support/Formats":24,"./../support/combineOperations":26,"./../support/mergeBoundPath":31,"./../support/processOperations":36}],22:[function(_dereq_,module,exports){
var getSourceObserver = _dereq_('./../support/getSourceObserever');
var combineOperations = _dereq_('./../support/combineOperations');
var setSeedsOrOnNext = _dereq_('./../support/setSeedsOrOnNext');
var toPathValues = _dereq_('./../support/Formats').toPathValues;

module.exports = setSourceRequest;

function setSourceRequest(
        options, onNext, seeds, combinedResults, requestOptions, cb) {
    var model = options.operationModel;
    var seedRequired = options.format !== toPathValues;
    var requestSeed = requestOptions.requestSeed;
    return model._request.set(
        requestSeed,
        getSourceObserver(
            model,
            requestSeed.paths,
            function setSourceRequestCB(err, results) {
                if (err) {
                    cb(err);
                }

                // Sets the results into the model.
                model._setJSONGsAsJSON(model, [results], []);

                // Gets the original paths / maps back out.
                var operations = combineOperations(
                        options.operationArgs, options.format, 'get');
                setSeedsOrOnNext(
                    operations, seedRequired,
                    seeds, onNext, options.operationSelector);

                // unset the removeBoundPath.
                requestOptions.removeBoundPath = false;

                cb(null, operations);
            }));
}


},{"./../support/Formats":24,"./../support/combineOperations":26,"./../support/getSourceObserever":27,"./../support/setSeedsOrOnNext":39}],23:[function(_dereq_,module,exports){
// Set differs from get in the sense that the first time through
// the recurse loop a server operation must be performed if it can be.
module.exports = function(model, combinedResults, loopCount) {
    return model._dataSource && (
        combinedResults.requestedMissingPaths.length > 0 ||
        loopCount === 0);
};

},{}],24:[function(_dereq_,module,exports){
module.exports = {
    toPathValues: 'AsValues',
    toJSON: 'AsPathMap',
    toJSONG: 'AsJSONG',
    selector: 'AsJSON',
};

},{}],25:[function(_dereq_,module,exports){
module.exports = function buildJSONGOperation(format, seeds, jsongOp, seedOffset, onNext) {
    return {
        methodName: '_setJSONGs' + format,
        format: format,
        isValues: format === 'AsValues',
        onNext: onNext,
        seeds: seeds,
        seedsOffset: seedOffset,
        args: [jsongOp]
    };
};

},{}],26:[function(_dereq_,module,exports){
var isSeedRequired = _dereq_('./seedRequired');
var isJSONG = _dereq_('./isJSONG');
var isPathOrPathValue = _dereq_('./isPathOrPathValue');
var Formats = _dereq_('./Formats');
var toSelector = Formats.selector;
module.exports = function combineOperations(args, format, name, spread, isProgressive) {
    var seedRequired = isSeedRequired(format);
    var isValues = !seedRequired;
    var hasSelector = seedRequired && format === toSelector;
    var seedsOffset = 0;

    return args.
        reduce(function(groups, argument) {
            var group = groups[groups.length - 1];
            var type  = isPathOrPathValue(argument) ? "PathSets" :
                isJSONG(argument) ? "JSONGs" : "PathMaps";
            var groupType = group && group.type;
            var methodName = '_' + name + type + format;

            if (!groupType || type !== groupType || spread) {
                group = {
                    methodName: methodName,
                    format: format,
                    operation: name,
                    isValues: isValues,
                    seeds: [],
                    onNext: null,
                    seedsOffset: seedsOffset,
                    isProgressive: isProgressive,
                    type: type,
                    args: []
                };
                groups.push(group);
            }
            if (hasSelector) {
                ++seedsOffset;
            }
            group.args.push(argument);
            return groups;
        }, []);
};

},{"./Formats":24,"./isJSONG":29,"./isPathOrPathValue":30,"./seedRequired":37}],27:[function(_dereq_,module,exports){
var insertErrors = _dereq_('./insertErrors.js');
/**
 * creates the model source observer
 * @param {Model} model
 * @param {Array.<Array>} requestedMissingPaths
 * @param {Function} cb
 */
function getSourceObserver(model, requestedMissingPaths, cb) {
    var incomingValues;
    return {
        onNext: function(jsongEnvelop) {
            incomingValues = {
                jsong: jsongEnvelop.jsong,
                paths: requestedMissingPaths
            };
        },
        onError: function(err) {
            cb(insertErrors(model, requestedMissingPaths, err));
        },
        onCompleted: function() {
            cb(false, incomingValues);
        }
    };
}

module.exports = getSourceObserver;

},{"./insertErrors.js":28}],28:[function(_dereq_,module,exports){
/**
 * will insert the error provided for every requestedPath.
 * @param {Model} model
 * @param {Array.<Array>} requestedPaths
 * @param {Object} err
 */
module.exports = function insertErrors(model, requestedPaths, err) {
    var out = model._setPathSetsAsJSON.apply(null, [model].concat(
        requestedPaths.
            reduce(function(acc, r) {
                acc[0].push({
                    path: r,
                    value: err
                });
                return acc;
            }, [[]]),
        [],
        model._errorSelector
    ));
    return out.errors;
};


},{}],29:[function(_dereq_,module,exports){
module.exports = function isJSONG(x) {
    return x.hasOwnProperty("jsong");
};

},{}],30:[function(_dereq_,module,exports){
module.exports = function isPathOrPathValue(x) {
    return !!(Array.isArray(x)) || (
        x.hasOwnProperty("path") && x.hasOwnProperty("value"));
};

},{}],31:[function(_dereq_,module,exports){
var isJSONG = _dereq_('./isJSONG');
var isPathValue = _dereq_('./isPathOrPathValue');

module.exports =  mergeBoundPath;

function mergeBoundPath(arg, boundPath) {
    return isJSONG(arg) && mergeBoundPathIntoJSONG(arg, boundPath) ||
        isPathValue(arg) && mergeBoundPathIntoPathValue(arg, boundPath) ||
        mergeBoundPathIntoJSON(arg, boundPath);
}

function mergeBoundPathIntoJSONG(jsongEnv, boundPath) {
    var newJSONGEnv = {jsong: jsongEnv.jsong, paths: jsongEnv.paths};
    if (boundPath.length) {
        var paths = [];
        for (i = 0, len = jsongEnv.paths.length; i < len; i++) {
            paths[i] = boundPath.concat(jsongEnv.paths[i]);
        }
        newJSONGEnv.paths = paths;
    }

    return newJSONGEnv;
}

function mergeBoundPathIntoJSON(arg, boundPath) {
    var newArg = arg;
    if (boundPath.length) {
        newArg = {};
        for (var i = 0, len = boundPath.length - 1; i < len; i++) {
            newArg[boundPath[i]] = {};
        }
        newArg[boundPath[i]] = arg;
    }

    return newArg;
}

function mergeBoundPathIntoPathValue(arg, boundPath) {
    return {
        path: boundPath.concat(arg.path),
        value: arg.value
    };
}

},{"./isJSONG":29,"./isPathOrPathValue":30}],32:[function(_dereq_,module,exports){
module.exports = function onCompletedOrError(onCompleted, onError, errors) {
    if (errors.length) {
        onError(errors);
    } else {
        onCompleted();
    }
};

},{}],33:[function(_dereq_,module,exports){
/**
 * will onNext the observer with the seeds provided.
 * @param {Model} model
 * @param {Function} onNext
 * @param {Array.<Object>} seeds
 * @param {Function} [selector]
 */
module.exports = function onNextValues(model, onNext, seeds, selector) {
    var root = model._root;

    root.allowSync = true;
    if (selector) {
        if (seeds.length) {
            // they should be wrapped in json items
            onNext(selector.apply(model, seeds.map(function(x, i) {
                return x.json;
            })));
        } else {
            onNext(selector.call(model));
        }
    } else {
        // this means there is an onNext function that is not AsValues or progressive,
        // therefore there must only be one onNext call, which should only be the 0
        // index of the values of the array
        onNext(seeds[0]);
    }
    root.allowSync = false;
};

},{}],34:[function(_dereq_,module,exports){
var buildJSONGOperation = _dereq_('./buildJSONGOperation');

/**
 * It performs the opposite of combine operations.  It will take a JSONG
 * response and partition them into the required amount of operations.
 * @param {{jsong: {}, paths:[]}} jsongResponse
 */
module.exports = partitionOperations;

function partitionOperations(
        jsongResponse, seeds, format, onNext) {

    var partitionedOps = [];
    var requestedMissingPaths = jsongResponse.paths;

    if (format === 'AsJSON') {
        // fast collapse ass the requestedMissingPaths into their
        // respective groups
        var opsFromRequestedMissingPaths = [];
        var op = null;
        for (var i = 0, len = requestedMissingPaths.length; i < len; i++) {
            var missingPath = requestedMissingPaths[i];
            if (!op || op.idx !== missingPath.pathSetIndex) {
                op = {
                    idx: missingPath.pathSetIndex,
                    paths: []
                };
                opsFromRequestedMissingPaths.push(op);
            }
            op.paths.push(missingPath);
        }
        opsFromRequestedMissingPaths.forEach(function(op, i) {
            var seed = [seeds[op.idx]];
            var jsong = {
                jsong: jsongResponse.jsong,
                paths: op.paths
            };
            partitionedOps.push(buildJSONGOperation(
                format,
                seed,
                jsong,
                op.idx,
                onNext));
        });
    } else {
        partitionedOps[0] = buildJSONGOperation(format, seeds, jsongResponse, 0, onNext);
    }
    return partitionedOps;
}


},{"./buildJSONGOperation":25}],35:[function(_dereq_,module,exports){
module.exports = function primeSeeds(selector, selectorLength) {
    var seeds = [];
    if (selector) {
        for (i = 0; i < selectorLength; i++) {
            seeds.push({});
        }
    } else {
        seeds[0] = {};
    }
    return seeds;
};

},{}],36:[function(_dereq_,module,exports){
module.exports = function processOperations(model, operations, errorSelector, boundPath) {
    return operations.reduce(function(memo, operation) {

        var jsonGraphOperation = model[operation.methodName];
        var seedsOrFunction = operation.isValues ?
            operation.onNext : operation.seeds;
        var results = jsonGraphOperation(
            model,
            operation.args,
            seedsOrFunction,
            operation.onNext,
            errorSelector,
            boundPath);
        var missing = results.requestedMissingPaths;
        var offset = operation.seedsOffset;

        for (var i = 0, len = missing.length; i < len; i++) {
            missing[i].boundPath = boundPath;
            missing[i].pathSetIndex += offset;
        }

        memo.requestedMissingPaths = memo.requestedMissingPaths.concat(missing);
        memo.optimizedMissingPaths = memo.optimizedMissingPaths.concat(results.optimizedMissingPaths);
        memo.errors = memo.errors.concat(results.errors);
        memo.valuesReceived = memo.valuesReceived || results.requestedPaths.length > 0;

        return memo;
    }, {
        errors: [],
        requestedMissingPaths: [],
        optimizedMissingPaths: [],
        valuesReceived: false
    });
}

},{}],37:[function(_dereq_,module,exports){
module.exports = function isSeedRequired(format) {
    return format === 'AsJSON' || format === 'AsJSONG' || format === 'AsPathMap';
};

},{}],38:[function(_dereq_,module,exports){
module.exports = function setSeedsOnGroups(groups, seeds, hasSelector) {
    var valueIndex = 0;
    var seedsLength = seeds.length;
    var j, i, len = groups.length, gLen, group;
    if (hasSelector) {
        for (i = 0; i < len && valueIndex < seedsLength; i++) {
            group = groups[i];
            gLen = gLen = group.args.length;
            for (j = 0; j < gLen && valueIndex < seedsLength; j++, valueIndex++) {
                group.seeds.push(seeds[valueIndex]);
            }
        }
    } else {
        for (i = 0; i < len && valueIndex < seedsLength; i++) {
            groups[i].seeds = seeds;
        }
    }
}

},{}],39:[function(_dereq_,module,exports){
var setSeedsOnGroups = _dereq_('./setSeedsOnGroups');
module.exports = function setSeedsOrOnNext(operations, seedRequired, seeds, onNext, selector) {
    if (seedRequired) {
        setSeedsOnGroups(operations, seeds, selector);
    } else {
        for (i = 0; i < operations.length; i++) {
            operations[i].onNext = onNext;
        }
    }
};

},{"./setSeedsOnGroups":38}],40:[function(_dereq_,module,exports){
var falcor = _dereq_('./../Falcor');
var NOOP = falcor.NOOP;
var RequestQueue = function(jsongModel, scheduler) {
    this._scheduler = scheduler;
    this._jsongModel = jsongModel;

    this._scheduled = false;
    this._requests = [];
};

RequestQueue.prototype = {
    _get: function() {
        var i = -1;
        var requests = this._requests;
        while (++i < requests.length) {
            if (!requests[i].pending && requests[i].isGet) {
                return requests[i];
            }
        }
        return requests[requests.length] = new GetRequest(this._jsongModel, this);
    },
    _set: function() {
        var i = -1;
        var requests = this._requests;

        // TODO: Set always sends off a request immediately, so there is no batching.
        while (++i < requests.length) {
            if (!requests[i].pending && requests[i].isSet) {
                return requests[i];
            }
        }
        return requests[requests.length] = new SetRequest(this._jsongModel, this);
    },

    remove: function(request) {
        for (var i = this._requests.length - 1; i > -1; i--) {
            if (this._requests[i].id === request.id && this._requests.splice(i, 1)) {
                break;
            }
        }
    },

    set: function(jsongEnv, observer) {
        var self = this;
        var disposable = self._set().batch(jsongEnv, observer).flush();

        return {
            dispose: function() {
                disposable.dispose();
            }
        };
    },

    get: function(requestedPaths, optimizedPaths, observer) {
        var self = this;
        var disposable = null;

        // TODO: get does not batch across requests.
        self._get().batch(requestedPaths, optimizedPaths, observer);

        if (!self._scheduled) {
            self._scheduled = true;
            disposable = self._scheduler.schedule(self._flush.bind(self));
        }

        return {
            dispose: function() {
                disposable.dispose();
            }
        };
    },

    _flush: function() {
        this._scheduled = false;

        var requests = this._requests, i = -1;
        var disposables = [];
        while (++i < requests.length) {
            if (!requests[i].pending) {
                disposables[disposables.length] = requests[i].flush();
            }
        }

        return {
            dispose: function() {
                disposables.forEach(function(d) { d.dispose(); });
            }
        };
    }
};

var REQUEST_ID = 0;

var SetRequest = function(model, queue) {
    var self = this;
    self._jsongModel = model;
    self._queue = queue;
    self.observers = [];
    self.jsongEnvs = [];
    self.pending = false;
    self.id = ++REQUEST_ID;
    self.isSet = true;
};

SetRequest.prototype = {
    batch: function(jsongEnv, observer) {
        var self = this;
        observer.onNext = observer.onNext || NOOP;
        observer.onError = observer.onError || NOOP;
        observer.onCompleted = observer.onCompleted || NOOP;

        if (!observer.__observerId) {
            observer.__observerId = ++REQUEST_ID;
        }
        observer._requestId = self.id;

        self.observers[self.observers.length] = observer;
        self.jsongEnvs[self.jsongEnvs.length] = jsongEnv;

        return self;
    },
    flush: function() {
        var incomingValues, query, op, len;
        var self = this;
        var jsongs = self.jsongEnvs;
        var observers = self.observers;
        var model = self._jsongModel;
        self.pending = true;

        // TODO: Set does not batch.
        return model._dataSource.
            set(jsongs[0]).
            subscribe(function(response) {
                incomingValues = response;
            }, function(err) {
                var i = -1;
                var n = observers.length;
                while (++i < n) {
                    obs = observers[i];
                    obs.onError && obs.onError(err);
                }
            }, function() {
                var i, n, obs;
                self._queue.remove(self);
                i = -1;
                n = observers.length;
                while (++i < n) {
                    obs = observers[i];
                    obs.onNext && obs.onNext({
                        jsong: incomingValues.jsong || incomingValues.value,
                        paths: incomingValues.paths
                    });
                    obs.onCompleted && obs.onCompleted();
                }
            });
    }
};



var GetRequest = function(jsongModel, queue) {
    var self = this;
    self._jsongModel = jsongModel;
    self._queue = queue;
    self.observers = [];
    self.optimizedPaths = [];
    self.requestedPaths = [];
    self.pending = false;
    self.id = ++REQUEST_ID;
    self.isGet = true;
};

GetRequest.prototype = {

    batch: function(requestedPaths, optimizedPaths, observer) {
        // TODO: Do we need to gap fill?
        var self = this;
        observer.onNext = observer.onNext || NOOP;
        observer.onError = observer.onError || NOOP;
        observer.onCompleted = observer.onCompleted || NOOP;

        if (!observer.__observerId) {
            observer.__observerId = ++REQUEST_ID;
        }
        observer._requestId = self.id;

        self.observers[self.observers.length] = observer;
        self.optimizedPaths[self.optimizedPaths.length] = optimizedPaths;
        self.requestedPaths[self.requestedPaths.length] = requestedPaths;

        return self;
    },

    flush: function() {
        var incomingValues, query, op, len;
        var self = this;
        var requested = self.requestedPaths;
        var optimized = self.optimizedPaths;
        var observers = self.observers;
        var disposables = [];
        var results = [];
        var model = self._jsongModel;
        self._scheduled = false;
        self.pending = true;

        var optimizedMaps = {};
        var requestedMaps = {};
        var r, o, i, j, obs, resultIndex;
        for (i = 0, len = requested.length; i < len; i++) {
            r = requested[i];
            o = optimized[i];
            obs = observers[i];
            for (j = 0; j < r.length; j++) {
                pathsToMapWithObservers(r[j], 0, readyNode(requestedMaps, null, obs), obs);
                pathsToMapWithObservers(o[j], 0, readyNode(optimizedMaps, null, obs), obs);
            }
        }
        return model._dataSource.
            get(collapse(optimizedMaps)).
            subscribe(function(response) {
                incomingValues = response;
            }, function(err) {
                var i = -1;
                var n = observers.length;
                while (++i < n) {
                    obs = observers[i];
                    obs.onError && obs.onError(err);
                }
            }, function() {
                var i, n, obs;
                self._queue.remove(self);
                i = -1;
                n = observers.length;
                while (++i < n) {
                    obs = observers[i];
                    obs.onNext && obs.onNext({
                        jsong: incomingValues.jsong || incomingValues.value,
                        paths: incomingValues.paths
                    });
                    obs.onCompleted && obs.onCompleted();
                }
            });
    },
    // Returns the paths that are contained within this request.
    contains: function(requestedPaths, optimizedPaths) {
        // TODO:
    }
};

function pathsToMapWithObservers(path, idx, branch, observer) {
    var curr = path[idx];

    // Object / Array
    if (typeof curr === 'object') {
        if (Array.isArray(curr)) {
            curr.forEach(function(v) {
                readyNode(branch, v, observer);
                if (path.length > idx + 1) {
                    pathsToMapWithObservers(path, idx + 1, branch[v], observer);
                }
            });
        } else {
            var from = curr.from || 0;
            var to = curr.to >= 0 ? curr.to : curr.length;
            for (var i = from; i <= to; i++) {
                readyNode(branch, i, observer);
                if (path.length > idx + 1) {
                    pathsToMapWithObservers(path, idx + 1, branch[i], observer);
                }
            }
        }
    } else {
        readyNode(branch, curr, observer);
        if (path.length > idx + 1) {
            pathsToMapWithObservers(path, idx + 1, branch[curr], observer);
        }
    }
}

/**
 * Builds the set of collapsed
 * queries by traversing the tree
 * once
 */
var charPattern = /\D/i;

function readyNode(branch, key, observer) {
    if (key === null) {
        branch.__observers = branch.__observers || [];
        !containsObserver(branch.__observers, observer) && branch.__observers.push(observer);
        return branch;
    }

    if (!branch[key]) {
        branch[key] = {__observers: []};
    }

    !containsObserver(branch[key].__observers, observer) && branch[key].__observers.push(observer);
    return branch;
}

function containsObserver(observers, observer) {
    if (!observer) {
        return;
    }
    return observers.reduce(function(acc, x) {
        return acc || x.__observerId === observer.__observerId;
    }, false);
}

function collapse(pathMap) {
    return rangeCollapse(buildQueries(pathMap));
}

/**
 * Collapse ranges, e.g. when there is a continuous range
 * in an array, turn it into an object instead
 *
 * [1,2,3,4,5,6] => {"from":1, "to":6}
 *
 */
function rangeCollapse(paths) {
    paths.forEach(function (path) {
        path.forEach(function (elt, index) {
            var range;
            if (Array.isArray(elt) && elt.every(isNumber) && allUnique(elt)) {
                elt.sort(function(a, b) {
                    return a - b;
                });
                if (elt[elt.length-1] - elt[0] === elt.length-1) {
                    // create range
                    range = {};
                    range.from = elt[0];
                    range.to = elt[elt.length-1];
                    path[index] = range;
                }
            }
        });
    });
    return paths;
}

/* jshint forin: false */
function buildQueries(root) {

    if (root == null || typeof root !== 'object') {
        return [ [] ];
    }

    var children = Object.keys(root).filter(notPathMapInternalKeys),
        child, memo, paths, key, childIsNum,
        list, head, tail, clone, results,
        i = -1, n = children.length,
        j, k, x;

    if (n === 0 || Array.isArray(root) === true) {
        return [ [] ];
    }

    memo = {};
    while(++i < n) {
        child = children[i];
        paths = buildQueries(root[child]);
        key = createKey(paths);

        childIsNum = typeof child === 'string' && !charPattern.test(child);

        if ((list = memo[key]) && (head = list.head)) {
            head[head.length] = childIsNum ? parseInt(child, 10) : child;
        } else {
            memo[key] = {
                head: [childIsNum ? parseInt(child, 10) : child],
                tail: paths
            };
        }
    }

    results = [];
    for(x in memo) {
        head = (list = memo[x]).head;
        tail = list.tail;
        i = -1;
        n = tail.length;
        while(++i < n) {
            list = tail[i];
            j = -1;
            k = list.length;
            if(head[0] === '') {
                clone = [];
            } else {
                clone = [head.length === 1 ? head[0] : head];
                while(++j < k) {
                    clone[j + 1] = list[j];
                }
            }
            results[results.length] = clone;
        }
    }
    return results;
}

function notPathMapInternalKeys(key) {
    return (
        key !== "__observers" &&
        key !== "__pending" &&
        key !== "__batchID"
        );
}

/**
 * Return true if argument is a number
 */
function isNumber(val) {
    return typeof val === "number";
}

/**
 * allUnique
 * return true if every number in an array is unique
 */
function allUnique(arr) {
    var hash = {},
        index,
        len;

    for (index = 0, len = arr.length; index < len; index++) {
        if (hash[arr[index]]) {
            return false;
        }
        hash[arr[index]] = true;
    }
    return true;
}

/**
 * Sort a list-of-lists
 * Used for generating a unique hash
 * key for each subtree; used by the
 * memoization
 */
function sortLol(lol) {
    return lol.reduce(function (result, curr) {
        if (curr instanceof Array) {
            result.push(sortLol(curr).slice(0).sort());
            return result;
        }
        return result.concat(curr);
    }, []).slice(0).sort();
}

/**
 * Create a unique hash key for a set
 * of paths
 */
function createKey(list) {
    return JSON.stringify(sortLol(list));
}
// Note: For testing
falcor.__Internals.buildQueries = buildQueries;

module.exports = RequestQueue;

},{"./../Falcor":2}],41:[function(_dereq_,module,exports){
(function (global){
/**
    Rx Ultralite!
    Rx on the Roku Tyler throws this (possibly related to browserify-ing Rx):
    Error: 'TypeError: 'undefined' is not a function (evaluating 'root.document.createElement('script')')'
 */

var Rx;

if (typeof window !== "undefined" && typeof window["Rx"] !== "undefined") {
    // Browser environment
    Rx = window["Rx"];
} else if (typeof global !== "undefined" && typeof global["Rx"] !== "undefined") {
    // Node.js environment
    Rx = global["Rx"];
} else if (typeof _dereq_ !== 'undefined' || typeof window !== 'undefined' && window.require) {
    var r = typeof _dereq_ !== 'undefined' && _dereq_ || window.require;
    try {
        // CommonJS environment with rx module
        Rx = r("rx");
    } catch(e) {
        Rx = undefined;
    }
}

if(Rx === undefined) {
    Rx = {
        I: function() { return arguments[0]; },
        Disposable: (function() {
            
            function Disposable(a) {
                this.action = a;
            }
            
            Disposable.create = function(a) {
                return new Disposable(a);
            };
            
            Disposable.empty = new Disposable(function(){});
            
            Disposable.prototype.dispose = function() {
                if(typeof this.action === 'function') {
                    this.action();
                }
            };
            
            return Disposable;
        })(),
        Observable: (function() {
            
            function Observable(s) {
                this._subscribe = s;
            }
            
            Observable.create = Observable.createWithDisposable = function(s) {
                return new Observable(s);
            };
            
            Observable.fastCreateWithDisposable = Observable.create;
            
            Observable.fastReturnValue = function(value) {
                return Observable.create(function(observer) {
                    observer.onNext(value);
                    observer.onCompleted();
                });
            };
            
            // NOTE: Required for Router
            Observable.prototype.from;
            Observable.prototype.materialize;
            Observable.prototype.reduce;

            Observable.of = function() {
                var len = arguments.length, args = new Array(len);
                for(var i = 0; i < len; i++) { args[i] = arguments[i]; }
                return Observable.create(function(observer) {
                    var errorOcurred = false;
                    try {
                        for(var i = 0; i < len; ++i) {
                            observer.onNext(args[i]);
                        }
                    } catch(e) {
                        errorOcurred = true;
                        observer.onError(e);
                    }
                    if(errorOcurred !== true) {
                        observer.onCompleted();
                    }
                });
            }

            Observable.prototype.subscribe = function(n, e, c) {
                return this._subscribe(
                    (n != null && typeof n === 'object') ?
                    n :
                    Rx.Observer.create(n, e, c)
                );
            };
            Observable.prototype.forEach = Observable.prototype.subscribe;
            
            Observable.prototype.catchException = function(next) {
                var self = this;
                return Observable.create(function(o) {
                    return self.subscribe(
                        function(x) { o.onNext(x); },
                        function(e) {
                            return (
                                (typeof next === 'function') ?
                                next(e) : next
                            ).subscribe(o);
                        },
                        function() { o.onCompleted(); });
                });
            };
            
            return Observable;
        })(),
        Observer: (function() {
            
            function Observer(n, e, c) {
                this.onNext =       n || Rx.I;
                this.onError =      e || Rx.I;
                this.onCompleted =  c || Rx.I;
            }
            
            Observer.create = function(n, e, c) {
                return new Observer(n, e, c);
            };
            
            return Observer;
        })(),
        Subject: (function(){
            function Subject() {
                this.observers = [];
            }
            Subject.prototype.subscribe = function(subscriber) {
                var a = this.observers,
                    n = a.length;
                a[n] = subscriber;
                return {
                    dispose: function() {
                        a.splice(n, 1);
                    }
                }
            };
            Subject.prototype.onNext = function(x) {
                var listeners = this.observers.concat(),
                    i = -1, n = listeners.length;
                while(++i < n) {
                    listeners[i].onNext(x);
                }
            };
            Subject.prototype.onError = function(e) {
                var listeners = this.observers.concat(),
                    i  = -1, n = listeners.length;
                this.observers.length = 0;
                while(++i < n) {
                    listeners[i].onError(e);
                }
            };
            Subject.prototype.onCompleted = function() {
                var listeners = this.observers.concat(),
                    i  = -1, n = listeners.length;
                this.observers.length = 0;
                while(++i < n) {
                    listeners[i].onCompleted();
                }
            };
        })()
    };
}

module.exports = Rx;


}).call(this,typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})
},{}],42:[function(_dereq_,module,exports){
function ImmediateScheduler() {
}

ImmediateScheduler.prototype = {
    schedule: function(action) {
        action();
    }
};

module.exports = ImmediateScheduler;

},{}],43:[function(_dereq_,module,exports){
function TimeoutScheduler(delay) {
    this.delay = delay;
}

TimeoutScheduler.prototype = {
    schedule: function(action) {
        setTimeout(action, this.delay);
    }
};

module.exports = TimeoutScheduler;

},{}],44:[function(_dereq_,module,exports){
var hardLink = _dereq_('./util/hardlink');
var createHardlink = hardLink.create;
var onValue = _dereq_('./onValue');
var isExpired = _dereq_('./util/isExpired');
var $path = _dereq_('./../types/path.js');
var __context = _dereq_("../internal/context");

function followReference(model, root, node, referenceContainer, reference, seed, outputFormat) {

    var depth = 0;
    var k, next;

    while (true) {
        if (depth === 0 && referenceContainer[__context]) {
            depth = reference.length;
            next = referenceContainer[__context];
        } else {
            k = reference[depth++];
            next = node[k];
        }
        if (next) {
            var type = next.$type;
            var value = type && next.value || next;

            if (depth < reference.length) {
                if (type) {
                    node = next;
                    break;
                }

                node = next;
                continue;
            }

            // We need to report a value or follow another reference.
            else {

                node = next;

                if (type && isExpired(next)) {
                    break;
                }

                if (!referenceContainer[__context]) {
                    createHardlink(referenceContainer, next);
                }

                // Restart the reference follower.
                if (type === $path) {
                    if (outputFormat === 'JSONG') {
                        onValue(model, next, seed, null, null, reference, null, outputFormat);
                    }

                    depth = 0;
                    reference = value;
                    referenceContainer = next;
                    node = root;
                    continue;
                }

                break;
            }
        } else {
            node = undefined;
        }
        break;
    }

    if (depth < reference.length) {
        var ref = [];
        for (var i = 0; i < depth; i++) {
            ref[i] = reference[i];
        }
        reference = ref;
    }

    return [node, reference];
}

module.exports = followReference;

},{"../internal/context":66,"./../types/path.js":140,"./onValue":56,"./util/hardlink":58,"./util/isExpired":59}],45:[function(_dereq_,module,exports){
var getBoundValue = _dereq_('./getBoundValue');
var isPathValue = _dereq_('./util/isPathValue');
module.exports = function(walk) {
    return function getAsJSON(model, paths, values) {
        var results = {
            values: [],
            errors: [],
            requestedPaths: [],
            optimizedPaths: [],
            requestedMissingPaths: [],
            optimizedMissingPaths: []
        };
        var requestedMissingPaths = results.requestedMissingPaths;
        var inputFormat = Array.isArray(paths[0]) || isPathValue(paths[0]) ?
            'Paths' : 'JSON';
        var cache = model._cache;
        var boundPath = model._path;
        var currentCachePosition;
        var missingIdx = 0;
        var boundOptimizedPath, optimizedPath;
        var i, j, len, bLen;

        results.values = values;
        if (!values) {
            values = [];
        }
        if (boundPath.length) {
            var boundValue = getBoundValue(model, boundPath);
            currentCachePosition = boundValue.value;
            optimizedPath = boundOptimizedPath = boundValue.path;
        } else {
            currentCachePosition = cache;
            optimizedPath = boundOptimizedPath = [];
        }

        for (i = 0, len = paths.length; i < len; i++) {
            var valueNode = undefined;
            var pathSet = paths[i];
            if (values[i]) {
                valueNode = values[i];
            }
            if (len > 1) {
                optimizedPath = [];
                for (j = 0, bLen = boundOptimizedPath.length; j < bLen; j++) {
                    optimizedPath[i] = boundOptimizedPath[i];
                }
            }
            if (pathSet.path) {
                pathSet = pathSet.path;
            }

            walk(model, cache, currentCachePosition, pathSet, 0, valueNode, [], results, optimizedPath, [], inputFormat, 'JSON');
            if (missingIdx < requestedMissingPaths.length) {
                for (j = missingIdx, length = requestedMissingPaths.length; j < length; j++) {
                    requestedMissingPaths[j].pathSetIndex = i;
                }
                missingIdx = length;
            }
        }

        return results;
    };
};


},{"./getBoundValue":49,"./util/isPathValue":61}],46:[function(_dereq_,module,exports){
var getBoundValue = _dereq_('./getBoundValue');
var isPathValue = _dereq_('./util/isPathValue');
module.exports = function(walk) {
    return function getAsJSONG(model, paths, values) {
        var results = {
            values: [],
            errors: [],
            requestedPaths: [],
            optimizedPaths: [],
            requestedMissingPaths: [],
            optimizedMissingPaths: []
        };
        var inputFormat = Array.isArray(paths[0]) || isPathValue(paths[0]) ?
            'Paths' : 'JSON';
        results.values = values;
        var cache = model._cache;
        var boundPath = model._path;
        var currentCachePosition;
        if (boundPath.length) {
            throw 'It is not legal to use the JSON Graph format from a bound Model. JSON Graph format can only be used from a root model.';
        } else {
            currentCachePosition = cache;
        }

        for (var i = 0, len = paths.length; i < len; i++) {
            var pathSet = paths[i];
            if (pathSet.path) {
                pathSet = pathSet.path;
            }
            walk(model, cache, currentCachePosition, pathSet, 0, values[0], [], results, [], [], inputFormat, 'JSONG');
        }
        return results;
    };
};


},{"./getBoundValue":49,"./util/isPathValue":61}],47:[function(_dereq_,module,exports){
var getBoundValue = _dereq_('./getBoundValue');
var isPathValue = _dereq_('./util/isPathValue');
module.exports = function(walk) {
    return function getAsPathMap(model, paths, values) {
        var valueNode;
        var results = {
            values: [],
            errors: [],
            requestedPaths: [],
            optimizedPaths: [],
            requestedMissingPaths: [],
            optimizedMissingPaths: []
        };
        var inputFormat = Array.isArray(paths[0]) || isPathValue(paths[0]) ?
            'Paths' : 'JSON';
        valueNode = values[0];
        results.values = values;

        var cache = model._cache;
        var boundPath = model._path;
        var currentCachePosition;
        var optimizedPath, boundOptimizedPath;
        if (boundPath.length) {
            var boundValue = getBoundValue(model, boundPath);
            currentCachePosition = boundValue.value;
            optimizedPath = boundOptimizedPath = boundValue.path;
        } else {
            currentCachePosition = cache;
            optimizedPath = boundOptimizedPath = [];
        }

        for (var i = 0, len = paths.length; i < len; i++) {
            if (len > 1) {
                optimizedPath = [];
                for (j = 0, bLen = boundOptimizedPath.length; j < bLen; j++) {
                    optimizedPath[i] = boundOptimizedPath[i];
                }
            }
            var pathSet = paths[i];
            if (pathSet.path) {
                pathSet = pathSet.path;
            }
            walk(model, cache, currentCachePosition, pathSet, 0, valueNode, [], results, optimizedPath, [], inputFormat, 'PathMap');
        }
        return results;
    };
};

},{"./getBoundValue":49,"./util/isPathValue":61}],48:[function(_dereq_,module,exports){
var getBoundValue = _dereq_('./getBoundValue');
var isPathValue = _dereq_('./util/isPathValue');
module.exports = function(walk) {
    return function getAsValues(model, paths, onNext) {
        var results = {
            values: [],
            errors: [],
            requestedPaths: [],
            optimizedPaths: [],
            requestedMissingPaths: [],
            optimizedMissingPaths: []
        };
        var inputFormat = Array.isArray(paths[0]) || isPathValue(paths[0]) ?
            'Paths' : 'JSON';
        var cache = model._cache;
        var boundPath = model._path;
        var currentCachePosition;
        var optimizedPath, boundOptimizedPath;
        if (boundPath.length) {
            var boundValue = getBoundValue(model, boundPath);
            currentCachePosition = boundValue.value;
            optimizedPath = boundOptimizedPath = boundValue.path;
        } else {
            currentCachePosition = cache;
            optimizedPath = boundOptimizedPath = [];
        }

        for (var i = 0, len = paths.length; i < len; i++) {
            if (len > 1) {
                optimizedPath = [];
                for (j = 0, bLen = boundOptimizedPath.length; j < bLen; j++) {
                    optimizedPath[i] = boundOptimizedPath[i];
                }
            }
            var pathSet = paths[i];
            if (pathSet.path) {
                pathSet = pathSet.path;
            }
            walk(model, cache, currentCachePosition, pathSet, 0, onNext, null, results, optimizedPath, [], inputFormat, 'Values');
        }
        return results;
    };
};


},{"./getBoundValue":49,"./util/isPathValue":61}],49:[function(_dereq_,module,exports){
var getValueSync = _dereq_('./getValueSync');
module.exports = function getBoundValue(model, path) {
    var boxed, value, shorted;

    boxed = model._boxed;
    model._boxed = true;
    value = getValueSync(model, path.concat(null));
    model._boxed = boxed;
    path = value.optimizedPath;
    shorted = value.shorted;
    value = value.value;
    while (path.length && path[path.length - 1] === null) {
        path.pop();
    }

    return {
        path: path,
        value: value,
        shorted: shorted
    };
};


},{"./getValueSync":50}],50:[function(_dereq_,module,exports){
var followReference = _dereq_('./followReference');
var clone = _dereq_('./util/clone');
var isExpired = _dereq_('./util/isExpired');
var promote = _dereq_('./util/lru').promote;
var $path = _dereq_('./../types/path.js');
var $sentinel = _dereq_('./../types/sentinel.js');
var $error = _dereq_('./../types/error.js');

module.exports = function getValueSync(model, simplePath) {
    var root = model._cache;
    var len = simplePath.length;
    var optimizedPath = [];
    var shorted = false, shouldShort = false;
    var depth = 0;
    var key, next = root, type, curr = root, out, ref, refNode;
    do {
        key = simplePath[depth++];
        if (key !== null) {
            next = curr[key];
        }

        if (!next) {
            out = undefined;
            shorted = true;
            break;
        }
        type = next.$type;
        optimizedPath.push(key);

        // Up to the last key we follow references
        if (depth < len) {
            if (type === $path) {
                ref = followReference(model, root, root, next, next.value);
                refNode = ref[0];

                if (!refNode) {
                    out = undefined;
                    break;
                }
                type = refNode.$type;
                next = refNode;
                optimizedPath = ref[1];
            }

            if (type) {
                break;
            }
        }
        // If there is a value, then we have great success, else, report an undefined.
        else {
            out = next;
        }
        curr = next;

    } while (next && depth < len);

    if (depth < len) {
        // Unfortunately, if all that follows are nulls, then we have not shorted.
        for (;depth < len; ++depth) {
            if (simplePath[depth] !== null) {
                shouldShort = true;
                break;
            }
        }
        // if we should short or report value.  Values are reported on nulls.
        if (shouldShort) {
            shorted = true;
            out = undefined;
        } else {
            out = next;
        }
    }

    // promotes if not expired
    if (out) {
        if (isExpired(out)) {
            out = undefined;
        } else {
            promote(model, out);
        }
    }

    if (out && out.$type === $error && !model._treatErrorsAsValues) {
        throw {path: simplePath, value: out.value};
    } else if (out && model._boxed) {
        out = !!type ? clone(out) : out;
    } else if (!out && model._materialized) {
        out = {$type: $sentinel};
    } else if (out) {
        out = out.value;
    }

    return {
        value: out,
        shorted: shorted,
        optimizedPath: optimizedPath
    };
};

},{"./../types/error.js":139,"./../types/path.js":140,"./../types/sentinel.js":141,"./followReference":44,"./util/clone":57,"./util/isExpired":59,"./util/lru":62}],51:[function(_dereq_,module,exports){
var followReference = _dereq_('./followReference');
var onError = _dereq_('./onError');
var onMissing = _dereq_('./onMissing');
var onValue = _dereq_('./onValue');
var lru = _dereq_('./util/lru');
var hardLink = _dereq_('./util/hardlink');
var isMaterialized = _dereq_('./util/isMaterialzed');
var removeHardlink = hardLink.remove;
var splice = lru.splice;
var isExpired = _dereq_('./util/isExpired');
var permuteKey = _dereq_('./util/permuteKey');
var $path = _dereq_('./../types/path');
var $error = _dereq_('./../types/error');
var __invalidated = _dereq_("../internal/invalidated");

// TODO: Objectify?
function walk(model, root, curr, pathOrJSON, depth, seedOrFunction, positionalInfo, outerResults, optimizedPath, requestedPath, inputFormat, outputFormat, fromReference) {
    if ((!curr || curr && curr.$type) &&
        evaluateNode(model, curr, pathOrJSON, depth, seedOrFunction, requestedPath, optimizedPath, positionalInfo, outerResults, outputFormat, fromReference)) {
        return;
    }

    // We continue the search to the end of the path/json structure.
    else {

        // Base case of the searching:  Have we hit the end of the road?
        // Paths
        // 1) depth === path.length
        // PathMaps (json input)
        // 2) if its an object with no keys
        // 3) its a non-object
        var jsonQuery = inputFormat === 'JSON';
        var atEndOfJSONQuery = false;
        var k, i, len;
        if (jsonQuery) {
            // it has a $type property means we have hit a end.
            if (pathOrJSON && pathOrJSON.$type) {
                atEndOfJSONQuery = true;
            }

            // is it an object?
            else if (pathOrJSON && typeof pathOrJSON === 'object') {
                // A terminating condition
                k = Object.keys(pathOrJSON);
                if (k.length === 1) {
                    k = k[0];
                }
            }

            // found a primitive, we hit the end.
            else {
                atEndOfJSONQuery = true;
            }
        } else {
            k = pathOrJSON[depth];
        }

        // BaseCase: we have hit the end of our query without finding a 'leaf' node, therefore emit missing.
        if (atEndOfJSONQuery || !jsonQuery && depth === pathOrJSON.length) {
            if (isMaterialized(model)) {
                onValue(model, curr, seedOrFunction, outerResults, requestedPath, optimizedPath, positionalInfo, outputFormat, fromReference);
                return;
            }
            onMissing(model, curr, pathOrJSON, depth, seedOrFunction, outerResults, requestedPath, optimizedPath, positionalInfo, outputFormat);
            return;
        }

        var memo = {done: false};
        var permutePosition = positionalInfo;
        var permuteRequested = requestedPath;
        var permuteOptimized = optimizedPath;
        var asJSONG = outputFormat === 'JSONG';
        var asJSON = outputFormat === 'JSON';
        var isKeySet = false;
        var hasChildren = false;
        depth++;

        var key;
        if (k && typeof k === 'object') {
            memo.isArray = Array.isArray(k);
            memo.arrOffset = 0;

            key = permuteKey(k, memo);
            isKeySet = true;
        } else {
            key = k;
            memo.done = true;
        }

        if (asJSON && isKeySet) {
            permutePosition = [];
            for (i = 0, len = positionalInfo.length; i < len; i++) {
                permutePosition[i] = positionalInfo[i];
            }
            permutePosition.push(depth - 1);
        }

        do {
            fromReference = false;
            if (!memo.done) {
                permuteOptimized = [];
                permuteRequested = [];
                for (i = 0, len = requestedPath.length; i < len; i++) {
                    permuteRequested[i] = requestedPath[i];
                }
                for (i = 0, len = optimizedPath.length; i < len; i++) {
                    permuteOptimized[i] = optimizedPath[i];
                }
            }

            var nextPathOrPathMap = jsonQuery ? pathOrJSON[key] : pathOrJSON;
            if (jsonQuery && nextPathOrPathMap) {
                if (typeof nextPathOrPathMap === 'object') {
                    if (nextPathOrPathMap.$type) {
                        hasChildren = false;
                    } else {
                        hasChildren = Object.keys(nextPathOrPathMap).length > 0;
                    }
                }
            }

            var next;
            if (key === null || jsonQuery && key === '__null') {
                next = curr;
            } else {
                next = curr[key];
                permuteOptimized.push(key);
                permuteRequested.push(key);
            }

            if (next) {
                var nType = next.$type;
                var value = nType && next.value || next;

                if (jsonQuery && hasChildren || !jsonQuery && depth < pathOrJSON.length) {

                    if (nType && nType === $path && !isExpired(next)) {
                        if (asJSONG) {
                            onValue(model, next, seedOrFunction, outerResults, false, permuteOptimized, permutePosition, outputFormat);
                        }
                        var ref = followReference(model, root, root, next, value, seedOrFunction, outputFormat);
                        fromReference = true;
                        next = ref[0];
                        var refPath = ref[1];

                        permuteOptimized = [];
                        for (i = 0, len = refPath.length; i < len; i++) {
                            permuteOptimized[i] = refPath[i];
                        }
                    }
                }
            }
            walk(model, root, next, nextPathOrPathMap, depth, seedOrFunction, permutePosition, outerResults, permuteOptimized, permuteRequested, inputFormat, outputFormat, fromReference);

            if (!memo.done) {
                key = permuteKey(k, memo);
            }

        } while (!memo.done);
    }
}

function evaluateNode(model, curr, pathOrJSON, depth, seedOrFunction, requestedPath, optimizedPath, positionalInfo, outerResults, outputFormat, fromReference) {
    // BaseCase: This position does not exist, emit missing.
    if (!curr) {
        if (isMaterialized(model)) {
            onValue(model, curr, seedOrFunction, outerResults, requestedPath, optimizedPath, positionalInfo, outputFormat, fromReference);
        } else {
            onMissing(model, curr, pathOrJSON, depth, seedOrFunction, outerResults, requestedPath, optimizedPath, positionalInfo, outputFormat);
        }
        return true;
    }

    var currType = curr.$type;

    positionalInfo = positionalInfo || [];

    // The Base Cases.  There is a type, therefore we have hit a 'leaf' node.
    if (currType === $error) {
        if (fromReference) {
            requestedPath.push(null);
        }
        if (outputFormat === 'JSONG' || model._treatErrorsAsValues) {
            onValue(model, curr, seedOrFunction, outerResults, requestedPath, optimizedPath, positionalInfo, outputFormat, fromReference);
        } else {
            onError(model, curr, requestedPath, optimizedPath, outerResults);
        }
    }

    // Else we have found a value, emit the current position information.
    else {
        if (isExpired(curr)) {
            if (!curr[__invalidated]) {
                splice(model, curr);
                removeHardlink(curr);
            }
            onMissing(model, curr, pathOrJSON, depth, seedOrFunction, outerResults, requestedPath, optimizedPath, positionalInfo, outputFormat);
        } else {
            onValue(model, curr, seedOrFunction, outerResults, requestedPath, optimizedPath, positionalInfo, outputFormat, fromReference);
        }
    }

    return true;
}

module.exports = walk;

},{"../internal/invalidated":69,"./../types/error":139,"./../types/path":140,"./followReference":44,"./onError":54,"./onMissing":55,"./onValue":56,"./util/hardlink":58,"./util/isExpired":59,"./util/isMaterialzed":60,"./util/lru":62,"./util/permuteKey":63}],52:[function(_dereq_,module,exports){
var walk = _dereq_('./getWalk');
module.exports = {
    getAsJSON: _dereq_('./getAsJSON')(walk),
    getAsJSONG: _dereq_('./getAsJSONG')(walk),
    getAsValues: _dereq_('./getAsValues')(walk),
    getAsPathMap: _dereq_('./getAsPathMap')(walk),
    getValueSync: _dereq_('./getValueSync'),
    getBoundValue: _dereq_('./getBoundValue'),
    setCache: _dereq_('./legacy_setCache')
};


},{"./getAsJSON":45,"./getAsJSONG":46,"./getAsPathMap":47,"./getAsValues":48,"./getBoundValue":49,"./getValueSync":50,"./getWalk":51,"./legacy_setCache":53}],53:[function(_dereq_,module,exports){
/* istanbul ignore next */
var NOOP = function NOOP() {},
    __GENERATION_GUID = 0,
    __GENERATION_VERSION = 0,
    __CONTAINER = "__reference_container",
    __CONTEXT = "__context",
    __GENERATION = "__generation",
    __GENERATION_UPDATED = "__generation_updated",
    __INVALIDATED = "__invalidated",
    __KEY = "__key",
    __KEYS = "__keys",
    __IS_KEY_SET = "__is_key_set",
    __NULL = "__null",
    __SELF = "./",
    __PARENT = "../",
    __REF = "__ref",
    __REF_INDEX = "__ref_index",
    __REFS_LENGTH = "__refs_length",
    __ROOT = "/",
    __OFFSET = "__offset",
    __FALKOR_EMPTY_OBJECT = '__FALKOR_EMPTY_OBJECT',
    __INTERNAL_KEYS = [
        __CONTAINER, __CONTEXT, __GENERATION, __GENERATION_UPDATED,
        __INVALIDATED, __KEY, __KEYS, __IS_KEY_SET, __NULL, __SELF,
        __PARENT, __REF, __REF_INDEX, __REFS_LENGTH, __OFFSET, __ROOT
    ],

    $TYPE = "$type",
    $SIZE = "$size",
    $EXPIRES = "$expires",
    $TIMESTAMP = "$timestamp",

    SENTINEL = "sentinel",
    PATH = "ref",
    ERROR = "error",
    VALUE = "value",
    EXPIRED = "expired",
    LEAF = "leaf";

/* istanbul ignore next */
module.exports = function setCache(model, map) {
    var root = model._root, expired = root.expired, depth = 0, height = 0, mapStack = [], nodes = [], nodeRoot = model._cache, nodeParent = nodeRoot, node = nodeParent, nodeType, nodeValue, nodeSize, nodeTimestamp, nodeExpires;
    mapStack[0] = map;
    nodes[-1] = nodeParent;
    while (depth > -1) {
        /* Walk Path Map */
        var isTerminus = false, offset = 0, keys = void 0, index = void 0, key = void 0, isKeySet = false;
        node = nodeParent = nodes[depth - 1];
        depth = depth;
        follow_path_map_9177:
            do {
                height = depth;
                nodeType = node && node[$TYPE] || void 0;
                nodeValue = nodeType === SENTINEL ? node[VALUE] : node;
                if ((isTerminus = !((map = mapStack[offset = depth * 4]) != null && typeof map === 'object') || map[$TYPE] !== void 0 || Array.isArray(map) || !((keys = mapStack[offset + 1] || (mapStack[offset + 1] = Object.keys(map))) && ((index = mapStack[offset + 2] || (mapStack[offset + 2] = 0)) || true) && ((isKeySet = keys.length > 1) || keys.length > 0))) || (node == null || nodeType !== void 0 || typeof node !== 'object' || Array.isArray(nodeValue))) {
                    if ((nodeExpires = (node && node[$EXPIRES]) != null) && (nodeExpires !== 1 && (nodeExpires === 0 || nodeExpires < now())) || node != null && node[__INVALIDATED] === true) {
                        nodeType = void 0;
                        nodeValue = void 0;
                        node = (expired[expired.length] = node) && (node[__INVALIDATED] = true) && void 0;
                    }
                    if (!isTerminus && ((!nodeType || nodeType === SENTINEL) && Array.isArray(nodeValue))) {
                        if (node == null || nodeType !== void 0 || typeof node !== 'object' || Array.isArray(nodeValue)) {
                            key = null;
                            node = node;
                            depth = depth;
                            continue follow_path_map_9177;
                        }
                    } else {
                        if (key != null) {
                            var newNode, sizeOffset, edgeSize = node && node[$SIZE] || 0;
                            nodeType = map && map[$TYPE] || void 0;
                            nV2 = nodeType ? map[VALUE] : void 0;
                            nodeValue = nodeType === SENTINEL ? map[VALUE] : map;
                            newNode = map;
                            if ((!nodeType || nodeType === SENTINEL || nodeType === PATH) && Array.isArray(nodeValue)) {
                                delete nodeValue[$SIZE];
                                // console.log(1);
                                if (nodeType) {
                                    nodeSize = 50 + (nodeValue.length || 1);
                                } else {
                                    nodeSize = nodeValue.length || 1;
                                }
                                newNode[$SIZE] = nodeSize;
                                nodeValue[__CONTAINER] = newNode;
                            } else if (nodeType === SENTINEL || nodeType === PATH) {
                                newNode[$SIZE] = nodeSize = 50 + (nV2 && typeof nV2.length === 'number' ? nV2.length : 1);
                            } else if (nodeType === ERROR) {
                                newNode[$SIZE] = nodeSize = map && map[$SIZE] || 0 || 50 + 1;
                            } else if (!(map != null && typeof map === 'object')) {
                                nodeSize = 50 + (typeof nodeValue === 'string' && nodeValue.length || 1);
                                nodeType = 'sentinel';
                                newNode = {};
                                newNode[VALUE] = nodeValue;
                                newNode[$TYPE] = nodeType;
                                newNode[$SIZE] = nodeSize;
                            } else {
                                nodeType = newNode[$TYPE] = nodeType || GROUP;
                                newNode[$SIZE] = nodeSize = map && map[$SIZE] || 0 || 50 + 1;
                            }
                            ;
                            if (node !== newNode && (node != null && typeof node === 'object')) {
                                var nodeRefsLength = node[__REFS_LENGTH] || 0, destRefsLength = newNode[__REFS_LENGTH] || 0, i = -1, ref;
                                while (++i < nodeRefsLength) {
                                    if ((ref = node[__REF + i]) !== void 0) {
                                        ref[__CONTEXT] = newNode;
                                        newNode[__REF + (destRefsLength + i)] = ref;
                                        node[__REF + i] = void 0;
                                    }
                                }
                                newNode[__REFS_LENGTH] = nodeRefsLength + destRefsLength;
                                node[__REFS_LENGTH] = ref = void 0;
                                var invParent = nodeParent, invChild = node, invKey = key, keys$2, index$2, offset$2, childType, childValue, isBranch, stack = [
                                        nodeParent,
                                        invKey,
                                        node
                                    ], depth$2 = 0;
                                while (depth$2 > -1) {
                                    nodeParent = stack[offset$2 = depth$2 * 8];
                                    invKey = stack[offset$2 + 1];
                                    node = stack[offset$2 + 2];
                                    if ((childType = stack[offset$2 + 3]) === void 0 || (childType = void 0)) {
                                        childType = stack[offset$2 + 3] = node && node[$TYPE] || void 0 || null;
                                    }
                                    childValue = stack[offset$2 + 4] || (stack[offset$2 + 4] = childType === SENTINEL ? node[VALUE] : node);
                                    if ((isBranch = stack[offset$2 + 5]) === void 0) {
                                        isBranch = stack[offset$2 + 5] = !childType && (node != null && typeof node === 'object') && !Array.isArray(childValue);
                                    }
                                    if (isBranch === true) {
                                        if ((keys$2 = stack[offset$2 + 6]) === void 0) {
                                            keys$2 = stack[offset$2 + 6] = [];
                                            index$2 = -1;
                                            for (var childKey in node) {
                                                !(!(childKey[0] !== '_' || childKey[1] !== '_') || (childKey === __SELF || childKey === __PARENT || childKey === __ROOT) || childKey[0] === '$') && (keys$2[++index$2] = childKey);
                                            }
                                        }
                                        index$2 = stack[offset$2 + 7] || (stack[offset$2 + 7] = 0);
                                        if (index$2 < keys$2.length) {
                                            stack[offset$2 + 7] = index$2 + 1;
                                            stack[offset$2 = ++depth$2 * 8] = node;
                                            stack[offset$2 + 1] = invKey = keys$2[index$2];
                                            stack[offset$2 + 2] = node[invKey];
                                            continue;
                                        }
                                    }
                                    var ref$2 = node[$TYPE] === SENTINEL ? node[VALUE] : node, destination;
                                    if (ref$2 && Array.isArray(ref$2)) {
                                        destination = ref$2[__CONTEXT];
                                        if (destination) {
                                            var i$2 = (ref$2[__REF_INDEX] || 0) - 1, n = (destination[__REFS_LENGTH] || 0) - 1;
                                            while (++i$2 <= n) {
                                                destination[__REF + i$2] = destination[__REF + (i$2 + 1)];
                                            }
                                            destination[__REFS_LENGTH] = n;
                                            ref$2[__REF_INDEX] = ref$2[__CONTEXT] = destination = void 0;
                                        }
                                    }
                                    if (node != null && typeof node === 'object') {
                                        var ref$3, i$3 = -1, n$2 = node[__REFS_LENGTH] || 0;
                                        while (++i$3 < n$2) {
                                            if ((ref$3 = node[__REF + i$3]) !== void 0) {
                                                ref$3[__CONTEXT] = node[__REF + i$3] = void 0;
                                            }
                                        }
                                        node[__REFS_LENGTH] = void 0;
                                        var root$2 = root, head = root$2.__head, tail = root$2.__tail, next = node.__next, prev = node.__prev;
                                        next != null && typeof next === 'object' && (next.__prev = prev);
                                        prev != null && typeof prev === 'object' && (prev.__next = next);
                                        node === head && (root$2.__head = root$2.__next = next);
                                        node === tail && (root$2.__tail = root$2.__prev = prev);
                                        node.__next = node.__prev = void 0;
                                        head = tail = next = prev = void 0;
                                        ;
                                        nodeParent[invKey] = node[__SELF] = node[__PARENT] = node[__ROOT] = void 0;
                                    }
                                    ;
                                    delete stack[offset$2 + 0];
                                    delete stack[offset$2 + 1];
                                    delete stack[offset$2 + 2];
                                    delete stack[offset$2 + 3];
                                    delete stack[offset$2 + 4];
                                    delete stack[offset$2 + 5];
                                    delete stack[offset$2 + 6];
                                    delete stack[offset$2 + 7];
                                    --depth$2;
                                }
                                nodeParent = invParent;
                                node = invChild;
                            }
                            nodeParent[key] = node = newNode;
                            nodeType = node && node[$TYPE] || void 0;
                            node = !node[__SELF] && ((node[__SELF] = node) || true) && ((node[__KEY] = key) || true) && ((node[__PARENT] = nodeParent) || true) && ((node[__ROOT] = nodeRoot) || true) && (node[__GENERATION] || (node[__GENERATION] = ++__GENERATION_GUID) && node) && ((!nodeType || nodeType === SENTINEL) && Array.isArray(nodeValue) && (nodeValue[__CONTAINER] = node)) || node;
                            sizeOffset = edgeSize - nodeSize;
                            var self = nodeParent, child = node;
                            while (node = nodeParent) {
                                nodeParent = node[__PARENT];
                                if ((node[$SIZE] = (node[$SIZE] || 0) - sizeOffset) <= 0 && nodeParent) {
                                    var ref$4 = node[$TYPE] === SENTINEL ? node[VALUE] : node, destination$2;
                                    if (ref$4 && Array.isArray(ref$4)) {
                                        destination$2 = ref$4[__CONTEXT];
                                        if (destination$2) {
                                            var i$4 = (ref$4[__REF_INDEX] || 0) - 1, n$3 = (destination$2[__REFS_LENGTH] || 0) - 1;
                                            while (++i$4 <= n$3) {
                                                destination$2[__REF + i$4] = destination$2[__REF + (i$4 + 1)];
                                            }
                                            destination$2[__REFS_LENGTH] = n$3;
                                            ref$4[__REF_INDEX] = ref$4[__CONTEXT] = destination$2 = void 0;
                                        }
                                    }
                                    if (node != null && typeof node === 'object') {
                                        var ref$5, i$5 = -1, n$4 = node[__REFS_LENGTH] || 0;
                                        while (++i$5 < n$4) {
                                            if ((ref$5 = node[__REF + i$5]) !== void 0) {
                                                ref$5[__CONTEXT] = node[__REF + i$5] = void 0;
                                            }
                                        }
                                        node[__REFS_LENGTH] = void 0;
                                        var root$3 = root, head$2 = root$3.__head, tail$2 = root$3.__tail, next$2 = node.__next, prev$2 = node.__prev;
                                        next$2 != null && typeof next$2 === 'object' && (next$2.__prev = prev$2);
                                        prev$2 != null && typeof prev$2 === 'object' && (prev$2.__next = next$2);
                                        node === head$2 && (root$3.__head = root$3.__next = next$2);
                                        node === tail$2 && (root$3.__tail = root$3.__prev = prev$2);
                                        node.__next = node.__prev = void 0;
                                        head$2 = tail$2 = next$2 = prev$2 = void 0;
                                        ;
                                        nodeParent[node[__KEY]] = node[__SELF] = node[__PARENT] = node[__ROOT] = void 0;
                                    }
                                } else if (node[__GENERATION_UPDATED] !== __GENERATION_VERSION) {
                                    var self$2 = node, stack$2 = [], depth$3 = 0, linkPaths, ref$6, i$6, k, n$5;
                                    while (depth$3 > -1) {
                                        if ((linkPaths = stack$2[depth$3]) === void 0) {
                                            i$6 = k = -1;
                                            n$5 = node[__REFS_LENGTH] || 0;
                                            node[__GENERATION_UPDATED] = __GENERATION_VERSION;
                                            node[__GENERATION] = ++__GENERATION_GUID;
                                            if ((ref$6 = node[__PARENT]) !== void 0 && ref$6[__GENERATION_UPDATED] !== __GENERATION_VERSION) {
                                                stack$2[depth$3] = linkPaths = new Array(n$5 + 1);
                                                linkPaths[++k] = ref$6;
                                            } else if (n$5 > 0) {
                                                stack$2[depth$3] = linkPaths = new Array(n$5);
                                            }
                                            while (++i$6 < n$5) {
                                                if ((ref$6 = node[__REF + i$6]) !== void 0 && ref$6[__GENERATION_UPDATED] !== __GENERATION_VERSION) {
                                                    linkPaths[++k] = ref$6;
                                                }
                                            }
                                        }
                                        if ((node = linkPaths && linkPaths.pop()) !== void 0) {
                                            ++depth$3;
                                        } else {
                                            stack$2[depth$3--] = void 0;
                                        }
                                    }
                                    node = self$2;
                                }
                            }
                            nodeParent = self;
                            node = child;
                        }
                        ;
                        node = node;
                        break follow_path_map_9177;
                    }
                }
                if ((key = keys[index]) == null) {
                    node = node;
                    break follow_path_map_9177;
                } else if (key === __NULL && ((key = null) || true) || !(!(key[0] !== '_' || key[1] !== '_') || (key === __SELF || key === __PARENT || key === __ROOT) || key[0] === '$') && ((mapStack[(depth + 1) * 4] = map[key]) || true)) {
                    mapStack[(depth + 1) * 4 + 3] = key;
                } else {
                    mapStack[offset + 2] = index + 1;
                    node = node;
                    depth = depth;
                    continue follow_path_map_9177;
                }
                nodes[depth - 1] = nodeParent = node;
                if (key != null) {
                    node = nodeParent && nodeParent[key];
                    if (typeof map === 'object') {
                        for (var key$2 in map) {
                            key$2[0] === '$' && key$2 !== $SIZE && (nodeParent && (nodeParent[key$2] = map[key$2]) || true);
                        }
                        map = map[key];
                    }
                    var mapType = map && map[$TYPE] || void 0;
                    var mapValue = mapType === SENTINEL ? map[VALUE] : map;
                    if ((node == null || typeof node !== 'object' || !!nodeType && nodeType !== SENTINEL && !Array.isArray(nodeValue)) && (!mapType && (map != null && typeof map === 'object') && !Array.isArray(mapValue))) {
                        nodeType = void 0;
                        nodeValue = {};
                        nodeSize = node && node[$SIZE] || 0;
                        if (node !== nodeValue && (node != null && typeof node === 'object')) {
                            var nodeRefsLength$2 = node[__REFS_LENGTH] || 0, destRefsLength$2 = nodeValue[__REFS_LENGTH] || 0, i$7 = -1, ref$7;
                            while (++i$7 < nodeRefsLength$2) {
                                if ((ref$7 = node[__REF + i$7]) !== void 0) {
                                    ref$7[__CONTEXT] = nodeValue;
                                    nodeValue[__REF + (destRefsLength$2 + i$7)] = ref$7;
                                    node[__REF + i$7] = void 0;
                                }
                            }
                            nodeValue[__REFS_LENGTH] = nodeRefsLength$2 + destRefsLength$2;
                            node[__REFS_LENGTH] = ref$7 = void 0;
                            var invParent$2 = nodeParent, invChild$2 = node, invKey$2 = key, keys$3, index$3, offset$3, childType$2, childValue$2, isBranch$2, stack$3 = [
                                    nodeParent,
                                    invKey$2,
                                    node
                                ], depth$4 = 0;
                            while (depth$4 > -1) {
                                nodeParent = stack$3[offset$3 = depth$4 * 8];
                                invKey$2 = stack$3[offset$3 + 1];
                                node = stack$3[offset$3 + 2];
                                if ((childType$2 = stack$3[offset$3 + 3]) === void 0 || (childType$2 = void 0)) {
                                    childType$2 = stack$3[offset$3 + 3] = node && node[$TYPE] || void 0 || null;
                                }
                                childValue$2 = stack$3[offset$3 + 4] || (stack$3[offset$3 + 4] = childType$2 === SENTINEL ? node[VALUE] : node);
                                if ((isBranch$2 = stack$3[offset$3 + 5]) === void 0) {
                                    isBranch$2 = stack$3[offset$3 + 5] = !childType$2 && (node != null && typeof node === 'object') && !Array.isArray(childValue$2);
                                }
                                if (isBranch$2 === true) {
                                    if ((keys$3 = stack$3[offset$3 + 6]) === void 0) {
                                        keys$3 = stack$3[offset$3 + 6] = [];
                                        index$3 = -1;
                                        for (var childKey$2 in node) {
                                            !(!(childKey$2[0] !== '_' || childKey$2[1] !== '_') || (childKey$2 === __SELF || childKey$2 === __PARENT || childKey$2 === __ROOT) || childKey$2[0] === '$') && (keys$3[++index$3] = childKey$2);
                                        }
                                    }
                                    index$3 = stack$3[offset$3 + 7] || (stack$3[offset$3 + 7] = 0);
                                    if (index$3 < keys$3.length) {
                                        stack$3[offset$3 + 7] = index$3 + 1;
                                        stack$3[offset$3 = ++depth$4 * 8] = node;
                                        stack$3[offset$3 + 1] = invKey$2 = keys$3[index$3];
                                        stack$3[offset$3 + 2] = node[invKey$2];
                                        continue;
                                    }
                                }
                                var ref$8 = node[$TYPE] === SENTINEL ? node[VALUE] : node, destination$3;
                                if (ref$8 && Array.isArray(ref$8)) {
                                    destination$3 = ref$8[__CONTEXT];
                                    if (destination$3) {
                                        var i$8 = (ref$8[__REF_INDEX] || 0) - 1, n$6 = (destination$3[__REFS_LENGTH] || 0) - 1;
                                        while (++i$8 <= n$6) {
                                            destination$3[__REF + i$8] = destination$3[__REF + (i$8 + 1)];
                                        }
                                        destination$3[__REFS_LENGTH] = n$6;
                                        ref$8[__REF_INDEX] = ref$8[__CONTEXT] = destination$3 = void 0;
                                    }
                                }
                                if (node != null && typeof node === 'object') {
                                    var ref$9, i$9 = -1, n$7 = node[__REFS_LENGTH] || 0;
                                    while (++i$9 < n$7) {
                                        if ((ref$9 = node[__REF + i$9]) !== void 0) {
                                            ref$9[__CONTEXT] = node[__REF + i$9] = void 0;
                                        }
                                    }
                                    node[__REFS_LENGTH] = void 0;
                                    var root$4 = root, head$3 = root$4.__head, tail$3 = root$4.__tail, next$3 = node.__next, prev$3 = node.__prev;
                                    next$3 != null && typeof next$3 === 'object' && (next$3.__prev = prev$3);
                                    prev$3 != null && typeof prev$3 === 'object' && (prev$3.__next = next$3);
                                    node === head$3 && (root$4.__head = root$4.__next = next$3);
                                    node === tail$3 && (root$4.__tail = root$4.__prev = prev$3);
                                    node.__next = node.__prev = void 0;
                                    head$3 = tail$3 = next$3 = prev$3 = void 0;
                                    ;
                                    nodeParent[invKey$2] = node[__SELF] = node[__PARENT] = node[__ROOT] = void 0;
                                }
                                ;
                                delete stack$3[offset$3 + 0];
                                delete stack$3[offset$3 + 1];
                                delete stack$3[offset$3 + 2];
                                delete stack$3[offset$3 + 3];
                                delete stack$3[offset$3 + 4];
                                delete stack$3[offset$3 + 5];
                                delete stack$3[offset$3 + 6];
                                delete stack$3[offset$3 + 7];
                                --depth$4;
                            }
                            nodeParent = invParent$2;
                            node = invChild$2;
                        }
                        nodeParent[key] = node = nodeValue;
                        node = !node[__SELF] && ((node[__SELF] = node) || true) && ((node[__KEY] = key) || true) && ((node[__PARENT] = nodeParent) || true) && ((node[__ROOT] = nodeRoot) || true) && (node[__GENERATION] || (node[__GENERATION] = ++__GENERATION_GUID) && node) && ((!nodeType || nodeType === SENTINEL) && Array.isArray(nodeValue) && (nodeValue[__CONTAINER] = node)) || node;
                        var self$3 = node, node$2;
                        while (node$2 = node) {
                            if (node[__GENERATION_UPDATED] !== __GENERATION_VERSION) {
                                var self$4 = node, stack$4 = [], depth$5 = 0, linkPaths$2, ref$10, i$10, k$2, n$8;
                                while (depth$5 > -1) {
                                    if ((linkPaths$2 = stack$4[depth$5]) === void 0) {
                                        i$10 = k$2 = -1;
                                        n$8 = node[__REFS_LENGTH] || 0;
                                        node[__GENERATION_UPDATED] = __GENERATION_VERSION;
                                        node[__GENERATION] = ++__GENERATION_GUID;
                                        if ((ref$10 = node[__PARENT]) !== void 0 && ref$10[__GENERATION_UPDATED] !== __GENERATION_VERSION) {
                                            stack$4[depth$5] = linkPaths$2 = new Array(n$8 + 1);
                                            linkPaths$2[++k$2] = ref$10;
                                        } else if (n$8 > 0) {
                                            stack$4[depth$5] = linkPaths$2 = new Array(n$8);
                                        }
                                        while (++i$10 < n$8) {
                                            if ((ref$10 = node[__REF + i$10]) !== void 0 && ref$10[__GENERATION_UPDATED] !== __GENERATION_VERSION) {
                                                linkPaths$2[++k$2] = ref$10;
                                            }
                                        }
                                    }
                                    if ((node = linkPaths$2 && linkPaths$2.pop()) !== void 0) {
                                        ++depth$5;
                                    } else {
                                        stack$4[depth$5--] = void 0;
                                    }
                                }
                                node = self$4;
                            }
                            node = node$2[__PARENT];
                        }
                        node = self$3;
                    }
                }
                node = node;
                depth = depth + 1;
                continue follow_path_map_9177;
            } while (true);
        node = node;
        var offset$4 = depth * 4, keys$4, index$4;
        do {
            delete mapStack[offset$4 + 0];
            delete mapStack[offset$4 + 1];
            delete mapStack[offset$4 + 2];
            delete mapStack[offset$4 + 3];
        } while ((keys$4 = mapStack[(offset$4 = 4 * --depth) + 1]) && ((index$4 = mapStack[offset$4 + 2]) || true) && (mapStack[offset$4 + 2] = ++index$4) >= keys$4.length);
    }
    return nodeRoot;
}

},{}],54:[function(_dereq_,module,exports){
var lru = _dereq_('./util/lru');
var clone = _dereq_('./util/clone');
var promote = lru.promote;
module.exports = function onError(model, node, permuteRequested, permuteOptimized, outerResults) {
    outerResults.errors.push({path: permuteRequested, value: node.value});

    promote(model, node);
    
    if (permuteOptimized) {
        outerResults.requestedPaths.push(permuteRequested);
        outerResults.optimizedPaths.push(permuteOptimized);
    }
};


},{"./util/clone":57,"./util/lru":62}],55:[function(_dereq_,module,exports){
var support = _dereq_('./util/support');
var fastCat = support.fastCat,
    fastCatSkipNulls = support.fastCatSkipNulls,
    fastCopy = support.fastCopy;
var isExpired = _dereq_('./util/isExpired');
var spreadJSON = _dereq_('./util/spreadJSON');
var clone = _dereq_('./util/clone');

module.exports = function onMissing(model, node, path, depth, seedOrFunction, outerResults, permuteRequested, permuteOptimized, permutePosition, outputFormat) {
    var pathSlice;
    if (Array.isArray(path)) {
        if (depth < path.length) {
            pathSlice = fastCopy(path, depth);
        } else {
            pathSlice = [];
        }

        concatAndInsertMissing(pathSlice, outerResults, permuteRequested, permuteOptimized, permutePosition, outputFormat);
    } else {
        pathSlice = [];
        spreadJSON(path, pathSlice);

        for (var i = 0, len = pathSlice.length; i < len; i++) {
            concatAndInsertMissing(pathSlice[i], outerResults, permuteRequested, permuteOptimized, permutePosition, outputFormat, true);
        }
    }
};

function concatAndInsertMissing(remainingPath, results, permuteRequested, permuteOptimized, permutePosition, outputFormat, __null) {
    var i = 0, len;
    if (__null) {
        for (i = 0, len = remainingPath.length; i < len; i++) {
            if (remainingPath[i] === '__null') {
                remainingPath[i] = null;
            }
        }
    }
    if (outputFormat === 'JSON') {
        permuteRequested = fastCat(permuteRequested, remainingPath);
        for (i = 0, len = permutePosition.length; i < len; i++) {
            var idx = permutePosition[i];
            var r = permuteRequested[idx];
            permuteRequested[idx] = [r];
        }
        results.requestedMissingPaths.push(permuteRequested);
        results.optimizedMissingPaths.push(fastCatSkipNulls(permuteOptimized, remainingPath));
    } else {
        results.requestedMissingPaths.push(fastCat(permuteRequested, remainingPath));
        results.optimizedMissingPaths.push(fastCatSkipNulls(permuteOptimized, remainingPath));
    }
}


},{"./util/clone":57,"./util/isExpired":59,"./util/spreadJSON":64,"./util/support":65}],56:[function(_dereq_,module,exports){
var lru = _dereq_('./util/lru');
var clone = _dereq_('./util/clone');
var promote = lru.promote;
var $path = _dereq_('./../types/path');
var $sentinel = _dereq_('./../types/sentinel');
var $error = _dereq_('./../types/error');
module.exports = function onValue(model, node, seedOrFunction, outerResults, permuteRequested, permuteOptimized, permutePosition, outputFormat, fromReference) {
    var i, len, k, key, curr, prev, prevK;
    var materialized = false, valueNode;
    if (node) {
        promote(model, node);

    }

    if (!node || node.value === undefined) {
        materialized = model._materialized;
    }

    // materialized
    if (materialized) {
        valueNode = {$type: $sentinel};
    }

    // Boxed Mode & Reference Node & Error node (only happens when model is in treat errors as values).
    else if (model._boxed) {
        valueNode = clone(node);
    }

    else if (node.$type === $path || node.$type === $error) {
        if (outputFormat === 'JSONG') {
            valueNode = clone(node);
        } else {
            valueNode = node.value;
        }
    }

    else {
        if (outputFormat === 'JSONG') {
            if (typeof node.value === 'object') {
                valueNode = clone(node);
            } else {
                valueNode = node.value;
            }
        } else {
            valueNode = node.value;
        }
    }


    if (permuteRequested) {
        if (fromReference && permuteRequested[permuteRequested.length - 1] !== null) {
            permuteRequested.push(null);
        }
        outerResults.requestedPaths.push(permuteRequested);
        outerResults.optimizedPaths.push(permuteOptimized);
    }
    switch (outputFormat) {

        case 'Values':
            // in any subscription situation, onNexts are always provided, even as a noOp.
            seedOrFunction({path: permuteRequested, value: valueNode});
            break;

        case 'PathMap':
            len = permuteRequested.length - 1;
            if (len === -1) {
                seedOrFunction.json = valueNode;
            } else {
                curr = seedOrFunction.json;
                if (!curr) {
                    curr = seedOrFunction.json = {};
                }
                for (i = 0; i < len; i++) {
                    k = permuteRequested[i];
                    if (!curr[k]) {
                        curr[k] = {};
                    }
                    prev = curr;
                    prevK = k;
                    curr = curr[k];
                }
                k = permuteRequested[i];
                if (k !== null) {
                    curr[k] = valueNode;
                } else {
                    prev[prevK] = valueNode;
                }
            }
            break;

        case 'JSON':
            if (seedOrFunction) {
                if (permutePosition.length) {
                    if (!seedOrFunction.json) {
                        seedOrFunction.json = {};
                    }
                    curr = seedOrFunction.json;
                    for (i = 0, len = permutePosition.length - 1; i < len; i++) {
                        k = permutePosition[i];
                        key = permuteRequested[k];

                        if (!curr[key]) {
                            curr[key] = {};
                        }
                        curr = curr[key];
                    }

                    // assign the last
                    k = permutePosition[i];
                    key = permuteRequested[k];
                    curr[key] = valueNode;
                } else {
                    seedOrFunction.json = valueNode;
                }
            }
            break;

        case 'JSONG':
            curr = seedOrFunction.jsong;
            if (!curr) {
                curr = seedOrFunction.jsong = {};
                seedOrFunction.paths = [];
            }
            for (i = 0, len = permuteOptimized.length - 1; i < len; i++) {
                key = permuteOptimized[i];

                if (!curr[key]) {
                    curr[key] = {};
                }
                curr = curr[key];
            }

            // assign the last
            key = permuteOptimized[i];

            // TODO: Special case? do string comparisons make big difference?
            curr[key] = materialized ? {$type: $sentinel} : valueNode;
            if (permuteRequested) {
                seedOrFunction.paths.push(permuteRequested);
            }
            break;
    }
};



},{"./../types/error":139,"./../types/path":140,"./../types/sentinel":141,"./util/clone":57,"./util/lru":62}],57:[function(_dereq_,module,exports){
// Copies the node
var prefix = _dereq_("../../internal/prefix");
module.exports = function clone(node) {
    var outValue, i, len;
    var keys = Object.keys(node);
    
    outValue = {};
    for (i = 0, len = keys.length; i < len; i++) {
        var k = keys[i];
        if (k[0] === prefix) {
            continue;
        }
        outValue[k] = node[k];
    }
    return outValue;
};


},{"../../internal/prefix":74}],58:[function(_dereq_,module,exports){
var __ref = _dereq_("../../internal/ref");
var __context = _dereq_("../../internal/context");
var __ref_index = _dereq_("../../internal/ref-index");
var __refs_length = _dereq_("../../internal/refs-length");

function createHardlink(from, to) {
    
    // create a back reference
    var backRefs  = to[__refs_length] || 0;
    to[__ref + backRefs] = from;
    to[__refs_length] = backRefs + 1;
    
    // create a hard reference
    from[__ref_index] = backRefs;
    from[__context] = to;
}

function removeHardlink(cacheObject) {
    var context = cacheObject[__context];
    if (context) {
        var idx = cacheObject[__ref_index];
        var len = context[__refs_length];
        
        while (idx < len) {
            context[__ref + idx] = context[__REF + idx + 1];
            ++idx;
        }
        
        context[__refs_length] = len - 1;
        cacheObject[__context] = undefined;
        cacheObject[__ref_index] = undefined;
    }
}

module.exports = {
    create: createHardlink,
    remove: removeHardlink
};

},{"../../internal/context":66,"../../internal/ref":77,"../../internal/ref-index":76,"../../internal/refs-length":78}],59:[function(_dereq_,module,exports){
var now = _dereq_('../../support/now');
module.exports = function isExpired(node) {
    var $expires = node.$expires === undefined && -1 || node.$expires;
    return $expires !== -1 && $expires !== 1 && ($expires === 0 || $expires < now());
};

},{"../../support/now":126}],60:[function(_dereq_,module,exports){
module.exports = function isMaterialized(model) {
    return model._materialized && !(model._router || model._dataSource);
};

},{}],61:[function(_dereq_,module,exports){
module.exports = function(x) {
    return x.path && x.value;
};
},{}],62:[function(_dereq_,module,exports){
var __head = _dereq_("../../internal/head");
var __tail = _dereq_("../../internal/tail");
var __next = _dereq_("../../internal/next");
var __prev = _dereq_("../../internal/prev");
var __invalidated = _dereq_("../../internal/invalidated");

// [H] -> Next -> ... -> [T]
// [T] -> Prev -> ... -> [H]
function lruPromote(model, object) {
    var root = model._root;
    var head = root[__head];
    if (head === object) {
        return;
    }

    // First insert
    if (!head) {
        root[__head] = object;
        return;
    }

    // The head and the tail need to separate
    if (!root[__tail]) {
        root[__head] = object;
        root[__tail] = head;
        object[__next] = head;
        
        // Now tail
        head[__prev] = object;
        return;
    }

    // Its in the cache.  Splice out.
    var prev = object[__prev];
    var next = object[__next];
    if (next) {
        next[__prev] = prev;
    }
    if (prev) {
        prev[__next] = next;
    }
    object[__prev] = undefined;

    // Insert into head position
    root[__head] = object;
    object[__next] = head;
    head[__prev] = object;
}

function lruSplice(model, object) {
    var root = model._root;

    // Its in the cache.  Splice out.
    var prev = object[__prev];
    var next = object[__next];
    if (next) {
        next[__prev] = prev;
    }
    if (prev) {
        prev[__next] = next;
    }
    object[__prev] = undefined;
    
    if (object === root[__head]) {
        root[__head] = undefined;
    }
    if (object === root[__tail]) {
        root[__tail] = undefined;
    }
    object[__invalidated] = true;
    root.expired.push(object);
}

module.exports = {
    promote: lruPromote,
    splice: lruSplice
};
},{"../../internal/head":68,"../../internal/invalidated":69,"../../internal/next":71,"../../internal/prev":75,"../../internal/tail":79}],63:[function(_dereq_,module,exports){
var prefix = _dereq_("../../internal/prefix");
module.exports = function permuteKey(key, memo) {
    if (memo.isArray) {
        if (memo.loaded && memo.rangeOffset > memo.to) {
            memo.arrOffset++;
            memo.loaded = false;
        }

        var idx = memo.arrOffset, length = key.length;
        if (idx === length) {
            memo.done = true;
            return '';
        }

        var el = key[memo.arrOffset];
        var type = typeof el;
        if (type === 'object') {
            if (!memo.loaded) {
                memo.from = el.from || 0;
                memo.to = el.to || el.length && memo.from + el.length - 1 || 0;
                memo.rangeOffset = memo.from;
                memo.loaded = true;
            }


            return memo.rangeOffset++;
        } else {
            do  {
                if (type !== 'string') {
                    break;
                }

                if (el[0] !== prefix && el[0] !== '$') {
                    break;
                }

                el = key[++idx];
            } while (el === undefined || idx < length);

            if (el === undefined || idx === length) {
                memo.done = true;
                return '';
            }

            memo.arrOffset = idx + 1;
            return el;
        }
    } else {
        if (!memo.loaded) {
            memo.from = key.from || 0;
            memo.to = key.to || key.length && memo.from + key.length - 1 || 0;
            memo.rangeOffset = memo.from;
            memo.loaded = true;
        }
        if (memo.rangeOffset > memo.to) {
            memo.done = true;
            return '';
        }

        return memo.rangeOffset++;
    }
};


},{"../../internal/prefix":74}],64:[function(_dereq_,module,exports){
var fastCopy = _dereq_('./support').fastCopy;
module.exports = function spreadJSON(root, bins, bin) {
    bin = bin || [];
    if (!bins.length) {
        bins.push(bin);
    }
    if (!root || typeof root !== 'object' || root.$type) {
        return [];
    }
    var keys = Object.keys(root);
    if (keys.length === 1) {
        bin.push(keys[0]);
        spreadJSON(root[keys[0]], bins, bin);
    } else {
        for (var i = 0, len = keys.length; i < len; i++) {
            var k = keys[i];
            var nextBin = fastCopy(bin);
            nextBin.push(k);
            bins.push(nextBin);
            spreadJSON(root[k], bins, nextBin);
        }
    }
};

},{"./support":65}],65:[function(_dereq_,module,exports){


function fastCopy(arr, i) {
    var a = [], len, j;
    for (j = 0, i = i || 0, len = arr.length; i < len; j++, i++) {
        a[j] = arr[i];
    }
    return a;
}

function fastCatSkipNulls(arr1, arr2) {
    var a = [], i, len, j;
    for (i = 0, len = arr1.length; i < len; i++) {
        a[i] = arr1[i];
    }
    for (j = 0, len = arr2.length; j < len; j++) {
        if (arr2[j] !== null) {
            a[i++] = arr2[j];
        }
    }
    return a;
}

function fastCat(arr1, arr2) {
    var a = [], i, len, j;
    for (i = 0, len = arr1.length; i < len; i++) {
        a[i] = arr1[i];
    }
    for (j = 0, len = arr2.length; j < len; j++) {
        a[i++] = arr2[j];
    }
    return a;
}



module.exports = {
    fastCat: fastCat,
    fastCatSkipNulls: fastCatSkipNulls,
    fastCopy: fastCopy
};

},{}],66:[function(_dereq_,module,exports){
module.exports = _dereq_("./prefix") + "context";
},{"./prefix":74}],67:[function(_dereq_,module,exports){
module.exports = _dereq_("./prefix") + "generation";
},{"./prefix":74}],68:[function(_dereq_,module,exports){
module.exports = _dereq_("./prefix") + "head";
},{"./prefix":74}],69:[function(_dereq_,module,exports){
module.exports = _dereq_("./prefix") + "invalidated";
},{"./prefix":74}],70:[function(_dereq_,module,exports){
module.exports = _dereq_("./prefix") + "key";
},{"./prefix":74}],71:[function(_dereq_,module,exports){
module.exports = _dereq_("./prefix") + "next";
},{"./prefix":74}],72:[function(_dereq_,module,exports){
module.exports = _dereq_("./prefix") + "offset";
},{"./prefix":74}],73:[function(_dereq_,module,exports){
module.exports = _dereq_("./prefix") + "parent";
},{"./prefix":74}],74:[function(_dereq_,module,exports){
// This may look like an empty string, but it's actually a single zero-width-space character.
module.exports = "​";
},{}],75:[function(_dereq_,module,exports){
module.exports = _dereq_("./prefix") + "prev";
},{"./prefix":74}],76:[function(_dereq_,module,exports){
module.exports = _dereq_("./prefix") + "ref-index";
},{"./prefix":74}],77:[function(_dereq_,module,exports){
module.exports = _dereq_("./prefix") + "ref";
},{"./prefix":74}],78:[function(_dereq_,module,exports){
module.exports = _dereq_("./prefix") + "refs-length";
},{"./prefix":74}],79:[function(_dereq_,module,exports){
module.exports = _dereq_("./prefix") + "tail";
},{"./prefix":74}],80:[function(_dereq_,module,exports){
module.exports = _dereq_("./prefix") + "version";
},{"./prefix":74}],81:[function(_dereq_,module,exports){
module.exports = {
    invPathSetsAsJSON: _dereq_("./invalidate-path-sets-as-json-dense"),
    invPathSetsAsJSONG: _dereq_("./invalidate-path-sets-as-json-graph"),
    invPathSetsAsPathMap: _dereq_("./invalidate-path-sets-as-json-sparse"),
    invPathSetsAsValues: _dereq_("./invalidate-path-sets-as-json-values")
};
},{"./invalidate-path-sets-as-json-dense":82,"./invalidate-path-sets-as-json-graph":83,"./invalidate-path-sets-as-json-sparse":84,"./invalidate-path-sets-as-json-values":85}],82:[function(_dereq_,module,exports){
module.exports = invalidate_path_sets_as_json_dense;

var clone = _dereq_("../support/clone-dense-json");
var array_clone = _dereq_("../support/array-clone");
var array_slice = _dereq_("../support/array-slice");

var options = _dereq_("../support/options");
var walk_path_set = _dereq_("../walk/walk-path-set");

var is_object = _dereq_("../support/is-object");

var get_valid_key = _dereq_("../support/get-valid-key");
var update_graph = _dereq_("../support/update-graph");
var invalidate_node = _dereq_("../support/invalidate-node");

var collect = _dereq_("../lru/collect");

function invalidate_path_sets_as_json_dense(model, pathsets, values) {

    var roots = options([], model);
    var index = -1;
    var count = pathsets.length;
    var nodes = roots.nodes;
    var parents = array_clone(nodes);
    var requested = [];
    var optimized = [];
    var json, hasValue;

    roots[0] = roots.root;

    while (++index < count) {

        json = values && values[index];
        if (is_object(json)) {
            roots[3] = parents[3] = nodes[3] = json.json || (json.json = {})
        } else {
            roots[3] = parents[3] = nodes[3] = undefined;
        }

        var pathset = pathsets[index];
        roots.index = index;
        
        walk_path_set(onNode, onEdge, pathset, 0, roots, parents, nodes, requested, optimized);

        if (is_object(json)) {
            json.json = roots.json;
        }
        delete roots.json;
    }

    collect(
        roots.lru,
        roots.expired,
        roots.version,
        roots.root.$size || 0,
        model._maxSize,
        model._collectRatio
    );

    return {
        values: values,
        errors: roots.errors,
        hasValue: true,
        requestedPaths: roots.requestedPaths,
        optimizedPaths: roots.optimizedPaths,
        requestedMissingPaths: roots.requestedMissingPaths,
        optimizedMissingPaths: roots.optimizedMissingPaths
    };
}

function onNode(pathset, roots, parents, nodes, requested, optimized, is_top_level, is_branch, key, keyset, is_keyset) {

    var parent, json;

    if (key == null) {
        if ((key = get_valid_key(optimized)) == null) {
            return;
        }
        json = parents[3];
        parent = parents[0];
    } else {
        json = is_keyset && nodes[3] || parents[3];
        parent = nodes[0];
    }

    var node = parent[key];

    if (!is_top_level) {
        parents[0] = parent;
        nodes[0] = node;
        return;
    }

    if (is_branch) {
        parents[0] = nodes[0] = node;
        if (is_keyset && !!(parents[3] = json)) {
            nodes[3] = json[keyset] || (json[keyset] = {});
        }
        return;
    }

    nodes[0] = node;

    if (!!json) {
        var type = is_object(node) && node.$type || undefined;
        var jsonkey = keyset;
        if (jsonkey == null) {
            json = roots;
            jsonkey = 3;
        }
        json[jsonkey] = clone(roots, node, type, node && node.value);
    }

    var lru = roots.lru;
    var size = node.$size || 0;
    var version = roots.version;
    invalidate_node(parent, node, key, roots.lru);
    update_graph(parent, size, version, lru);
}

function onEdge(pathset, depth, roots, parents, nodes, requested, optimized, key, keyset) {
    roots.json = roots[3];
    roots.hasValue = true;
    roots.requestedPaths.push(array_slice(requested, roots.offset));
}
},{"../lru/collect":86,"../support/array-clone":104,"../support/array-slice":105,"../support/clone-dense-json":106,"../support/get-valid-key":116,"../support/invalidate-node":120,"../support/is-object":122,"../support/options":127,"../support/update-graph":137,"../walk/walk-path-set":147}],83:[function(_dereq_,module,exports){
module.exports = invalidate_path_sets_as_json_graph;

var $path = _dereq_("../types/path");

var clone = _dereq_("../support/clone-dense-json");
var array_clone = _dereq_("../support/array-clone");

var options = _dereq_("../support/options");
var walk_path_set = _dereq_("../walk/walk-path-set-soft-link");

var is_object = _dereq_("../support/is-object");

var get_valid_key = _dereq_("../support/get-valid-key");
var update_graph = _dereq_("../support/update-graph");
var invalidate_node = _dereq_("../support/invalidate-node");
var clone_success = _dereq_("../support/clone-success-paths");
var collect = _dereq_("../lru/collect");

function invalidate_path_sets_as_json_graph(model, pathsets, values) {

    var roots = options([], model);
    var index = -1;
    var count = pathsets.length;
    var nodes = roots.nodes;
    var parents = array_clone(nodes);
    var requested = [];
    var optimized = [];
    var json = values[0];

    roots[0] = roots.root;
    roots[1] = parents[1] = nodes[1] = json.jsong || (json.jsong = {});
    roots.requestedPaths = json.paths || (json.paths = roots.requestedPaths);

    while (++index < count) {
        var pathset = pathsets[index];
        walk_path_set(onNode, onEdge, pathset, 0, roots, parents, nodes, requested, optimized);
    }

    collect(
        roots.lru,
        roots.expired,
        roots.version,
        roots.root.$size || 0,
        model._maxSize,
        model._collectRatio
    );

    return {
        values: values,
        errors: roots.errors,
        hasValue: true,
        requestedPaths: roots.requestedPaths,
        optimizedPaths: roots.optimizedPaths,
        requestedMissingPaths: roots.requestedMissingPaths,
        optimizedMissingPaths: roots.optimizedMissingPaths
    };
}

function onNode(pathset, roots, parents, nodes, requested, optimized, is_top_level, is_branch, key, keyset, is_keyset) {

    var parent, json;

    if (key == null) {
        if ((key = get_valid_key(optimized)) == null) {
            return;
        }
        json = parents[1];
        parent = parents[0];
    } else {
        json = nodes[1];
        parent = nodes[0];
    }

    var jsonkey = key;
    var node = parent[key];

    if (!is_top_level) {
        parents[0] = parent;
        nodes[0] = node;
        parents[1] = json;
        nodes[1] = json[jsonkey] || (json[jsonkey] = {});
        return;
    }

    var type = is_object(node) && node.$type || undefined;
    
    if (is_branch) {
        parents[0] = nodes[0] = node;
        parents[1] = json;
        if (type == $path) {
            json[jsonkey] = clone(roots, node, type, node.value);
        } else {
            nodes[1] = json[jsonkey] || (json[jsonkey] = {});
        }
        return;
    }

    nodes[0] = node;

    json[jsonkey] = clone(roots, node, type, node && node.value);

    var lru = roots.lru;
    var size = node.$size || 0;
    var version = roots.version;
    invalidate_node(parent, node, key, roots.lru);
    update_graph(parent, size, version, lru);
}

function onEdge(pathset, depth, roots, parents, nodes, requested, optimized, key, keyset) {
    clone_success(roots, requested, optimized);
    roots.json = roots[1];
    roots.hasValue = true;
}

},{"../lru/collect":86,"../support/array-clone":104,"../support/clone-dense-json":106,"../support/clone-success-paths":112,"../support/get-valid-key":116,"../support/invalidate-node":120,"../support/is-object":122,"../support/options":127,"../support/update-graph":137,"../types/path":140,"../walk/walk-path-set-soft-link":146}],84:[function(_dereq_,module,exports){
module.exports = invalidate_path_sets_as_json_sparse;

var clone = _dereq_("../support/clone-dense-json");
var array_clone = _dereq_("../support/array-clone");
var array_slice = _dereq_("../support/array-slice");

var options = _dereq_("../support/options");
var walk_path_set = _dereq_("../walk/walk-path-set");

var is_object = _dereq_("../support/is-object");

var get_valid_key = _dereq_("../support/get-valid-key");
var update_graph = _dereq_("../support/update-graph");
var invalidate_node = _dereq_("../support/invalidate-node");

var collect = _dereq_("../lru/collect");

function invalidate_path_sets_as_json_sparse(model, pathsets, values) {

    var roots = options([], model);
    var index = -1;
    var count = pathsets.length;
    var nodes = roots.nodes;
    var parents = array_clone(nodes);
    var requested = [];
    var optimized = [];
    var json = values[0];

    roots[0] = roots.root;
    roots[3] = parents[3] = nodes[3] = json.json || (json.json = {});

    while (++index < count) {
        var pathset = pathsets[index];
        walk_path_set(onNode, onEdge, pathset, 0, roots, parents, nodes, requested, optimized);
    }

    collect(
        roots.lru,
        roots.expired,
        roots.version,
        roots.root.$size || 0,
        model._maxSize,
        model._collectRatio
    );

    return {
        values: values,
        errors: roots.errors,
        hasValue: true,
        requestedPaths: roots.requestedPaths,
        optimizedPaths: roots.optimizedPaths,
        requestedMissingPaths: roots.requestedMissingPaths,
        optimizedMissingPaths: roots.optimizedMissingPaths
    };
}

function onNode(pathset, roots, parents, nodes, requested, optimized, is_top_level, is_branch, key, keyset, is_keyset) {

    var parent, json, jsonkey;

    if (key == null) {
        if ((key = get_valid_key(optimized)) == null) {
            return;
        }
        jsonkey = get_valid_key(requested);
        json = parents[3];
        parent = parents[0];
    } else {
        jsonkey = key;
        json = nodes[3];
        parent = nodes[0];
    }

    var node = parent[key];

    if (!is_top_level) {
        parents[0] = parent;
        nodes[0] = node;
        return;
    }

    if (is_branch) {
        parents[0] = nodes[0] = node;
        parents[3] = json;
        nodes[3] = json[jsonkey] || (json[jsonkey] = {});
        return;
    }

    nodes[0] = node;

    var type = is_object(node) && node.$type || undefined;
    json[jsonkey] = clone(roots, node, type, node && node.value);

    var lru = roots.lru;
    var size = node.$size || 0;
    var version = roots.version;
    invalidate_node(parent, node, key, roots.lru);
    update_graph(parent, size, version, lru);
}

function onEdge(pathset, depth, roots, parents, nodes, requested, optimized, key, keyset) {
    roots.json = roots[3];
    roots.hasValue = true;
    roots.requestedPaths.push(array_slice(requested, roots.offset));
}
},{"../lru/collect":86,"../support/array-clone":104,"../support/array-slice":105,"../support/clone-dense-json":106,"../support/get-valid-key":116,"../support/invalidate-node":120,"../support/is-object":122,"../support/options":127,"../support/update-graph":137,"../walk/walk-path-set":147}],85:[function(_dereq_,module,exports){
module.exports = invalidate_path_sets_as_json_values;

var clone = _dereq_("../support/clone-dense-json");
var array_clone = _dereq_("../support/array-clone");
var array_slice = _dereq_("../support/array-slice");

var options = _dereq_("../support/options");
var walk_path_set = _dereq_("../walk/walk-path-set");

var is_object = _dereq_("../support/is-object");

var get_valid_key = _dereq_("../support/get-valid-key");
var update_graph = _dereq_("../support/update-graph");
var invalidate_node = _dereq_("../support/invalidate-node");

var collect = _dereq_("../lru/collect");

function invalidate_path_sets_as_json_values(model, pathsets, onNext) {

    var roots = options([], model);
    var index = -1;
    var count = pathsets.length;
    var nodes = roots.nodes;
    var parents = array_clone(nodes);
    var requested = [];
    var optimized = [];

    roots[0] = roots.root;
    roots.onNext = onNext;

    while (++index < count) {
        var pathset = pathsets[index];
        walk_path_set(onNode, onEdge, pathset, 0, roots, parents, nodes, requested, optimized);
    }

    collect(
        roots.lru,
        roots.expired,
        roots.version,
        roots.root.$size || 0,
        model._maxSize,
        model._collectRatio
    );

    return {
        values: null,
        errors: roots.errors,
        requestedPaths: roots.requestedPaths,
        optimizedPaths: roots.optimizedPaths,
        requestedMissingPaths: roots.requestedMissingPaths,
        optimizedMissingPaths: roots.optimizedMissingPaths
    };
}

function onNode(pathset, roots, parents, nodes, requested, optimized, is_top_level, is_branch, key, keyset, is_keyset) {

    var parent;

    if (key == null) {
        if ((key = get_valid_key(optimized)) == null) {
            return;
        }
        parent = parents[0];
    } else {
        parent = nodes[0];
    }

    var node = parent[key];

    if (!is_top_level) {
        parents[0] = parent;
        nodes[0] = node;
        return;
    }

    if (is_branch) {
        parents[0] = nodes[0] = node;
        return;
    }

    nodes[0] = node;

    var lru = roots.lru;
    var size = node.$size || 0;
    var version = roots.version;
    invalidate_node(parent, node, key, roots.lru);
    update_graph(parent, size, version, lru);
}

function onEdge(pathset, depth, roots, parents, nodes, requested, optimized, key, keyset) {
    var node = nodes[0];
    var type = is_object(node) && node.$type || undefined;
    var onNext = roots.onNext;
    if (!!type && onNext) {
        onNext({
            path: array_clone(requested),
            value: clone(roots, node, type, node && node.value)
        });
    }
    roots.requestedPaths.push(array_slice(requested, roots.offset));
}
},{"../lru/collect":86,"../support/array-clone":104,"../support/array-slice":105,"../support/clone-dense-json":106,"../support/get-valid-key":116,"../support/invalidate-node":120,"../support/is-object":122,"../support/options":127,"../support/update-graph":137,"../walk/walk-path-set":147}],86:[function(_dereq_,module,exports){
var __head = _dereq_("../internal/head");
var __tail = _dereq_("../internal/tail");
var __next = _dereq_("../internal/next");
var __prev = _dereq_("../internal/prev");

var update_graph = _dereq_("../support/update-graph");
module.exports = function(lru, expired, version, total, max, ratio) {
    
    var targetSize = max * ratio;
    var node, size;
    
    while(!!(node = expired.pop())) {
        size = node.$size || 0;
        total -= size;
        update_graph(node, size, version, lru);
    }
    
    if(total >= max) {
        var prev = lru[__tail];
        while((total >= targetSize) && !!(node = prev)) {
            prev = prev[__prev];
            size = node.$size || 0;
            total -= size;
            update_graph(node, size, version, lru);
        }
        
        if((lru[__tail] = lru[__prev] = prev) == null) {
            lru[__head] = lru[__next] = undefined;
        } else {
            prev[__next] = undefined;
        }
    }
};
},{"../internal/head":68,"../internal/next":71,"../internal/prev":75,"../internal/tail":79,"../support/update-graph":137}],87:[function(_dereq_,module,exports){
var $expires_never = _dereq_("../values/expires-never");
var __head = _dereq_("../internal/head");
var __tail = _dereq_("../internal/tail");
var __next = _dereq_("../internal/next");
var __prev = _dereq_("../internal/prev");

var is_object = _dereq_("../support/is-object");
module.exports = function(root, node) {
    if(is_object(node) && (node.$expires !== $expires_never)) {
        var head = root[__head], tail = root[__tail],
            next = node[__next], prev = node[__prev];
        if (node !== head) {
            (next != null && typeof next === "object") && (next[__prev] = prev);
            (prev != null && typeof prev === "object") && (prev[__next] = next);
            (next = head) && (head != null && typeof head === "object") && (head[__prev] = node);
            (root[__head] = root[__next] = head = node);
            (head[__next] = next);
            (head[__prev] = undefined);
        }
        if (tail == null || node === tail) {
            root[__tail] = root[__prev] = tail = prev || node;
        }
    }
    return node;
};
},{"../internal/head":68,"../internal/next":71,"../internal/prev":75,"../internal/tail":79,"../support/is-object":122,"../values/expires-never":142}],88:[function(_dereq_,module,exports){
var __head = _dereq_("../internal/head");
var __tail = _dereq_("../internal/tail");
var __next = _dereq_("../internal/next");
var __prev = _dereq_("../internal/prev");

module.exports = function(root, node) {
    var head = root[__head], tail = root[__tail],
        next = node[__next], prev = node[__prev];
    (next != null && typeof next === "object") && (next[__prev] = prev);
    (prev != null && typeof prev === "object") && (prev[__next] = next);
    (node === head) && (root[__head] = root[__next] = next);
    (node === tail) && (root[__tail] = root[__prev] = prev);
    node[__next] = node[__prev] = undefined;
    head = tail = next = prev = undefined;
};
},{"../internal/head":68,"../internal/next":71,"../internal/prev":75,"../internal/tail":79}],89:[function(_dereq_,module,exports){
module.exports = {
    setPathSetsAsJSON: _dereq_('./set-json-values-as-json-dense'),
    setPathSetsAsJSONG: _dereq_('./set-json-values-as-json-graph'),
    setPathSetsAsPathMap: _dereq_('./set-json-values-as-json-sparse'),
    setPathSetsAsValues: _dereq_('./set-json-values-as-json-values'),
    
    setPathMapsAsJSON: _dereq_('./set-json-sparse-as-json-dense'),
    setPathMapsAsJSONG: _dereq_('./set-json-sparse-as-json-graph'),
    setPathMapsAsPathMap: _dereq_('./set-json-sparse-as-json-sparse'),
    setPathMapsAsValues: _dereq_('./set-json-sparse-as-json-values'),
    
    setJSONGsAsJSON: _dereq_('./set-json-graph-as-json-dense'),
    setJSONGsAsJSONG: _dereq_('./set-json-graph-as-json-graph'),
    setJSONGsAsPathMap: _dereq_('./set-json-graph-as-json-sparse'),
    setJSONGsAsValues: _dereq_('./set-json-graph-as-json-values'),
    
    setCache: _dereq_('./set-cache')
};

},{"./set-cache":90,"./set-json-graph-as-json-dense":91,"./set-json-graph-as-json-graph":92,"./set-json-graph-as-json-sparse":93,"./set-json-graph-as-json-values":94,"./set-json-sparse-as-json-dense":95,"./set-json-sparse-as-json-graph":96,"./set-json-sparse-as-json-sparse":97,"./set-json-sparse-as-json-values":98,"./set-json-values-as-json-dense":99,"./set-json-values-as-json-graph":100,"./set-json-values-as-json-sparse":101,"./set-json-values-as-json-values":102}],90:[function(_dereq_,module,exports){
module.exports = set_cache;

var $error = _dereq_("../types/error");
var $sentinel = _dereq_("../types/sentinel");

var clone = _dereq_("../support/clone-dense-json");
var array_clone = _dereq_("../support/array-clone");

var options = _dereq_("../support/options");
var walk_path_map = _dereq_("../walk/walk-path-map");

var is_object = _dereq_("../support/is-object");

var get_valid_key = _dereq_("../support/get-valid-key");
var create_branch = _dereq_("../support/create-branch");
var wrap_node = _dereq_("../support/wrap-node");
var replace_node = _dereq_("../support/replace-node");
var graph_node = _dereq_("../support/graph-node");
var update_back_refs = _dereq_("../support/update-back-refs");
var update_graph = _dereq_("../support/update-graph");
var inc_generation = _dereq_("../support/inc-generation");

var collect = _dereq_("../lru/collect");

function set_cache(model, pathmap, error_selector) {

    var roots = options([], model, error_selector);
    var nodes = roots.nodes;
    var parents = array_clone(nodes);
    var requested = [];
    var optimized = [];
    var keys_stack = [];
    
    roots[0] = roots.root;

    walk_path_map(onNode, onEdge, pathmap, keys_stack, 0, roots, parents, nodes, requested, optimized);

    collect(
        roots.lru,
        roots.expired,
        roots.version,
        roots.root.$size || 0,
        model._maxSize,
        model._collectRatio
    );

    return model;
}

function onNode(pathmap, roots, parents, nodes, requested, optimized, is_top_level, is_branch, key, keyset, is_keyset) {

    var parent;

    if (key == null) {
        if ((key = get_valid_key(optimized)) == null) {
            return;
        }
        parent = parents[0];
    } else {
        parent = nodes[0];
    }

    var node = parent[key],
        type;

    if (is_branch) {
        type = is_object(node) && node.$type || undefined;
        node = create_branch(roots, parent, node, type, key);
        parents[0] = nodes[0] = node;
        return;
    }

    var selector = roots.error_selector;
    var root = roots[0];
    var size = is_object(node) && node.$size || 0;
    var mess = pathmap;

    type = is_object(mess) && mess.$type || undefined;
    mess = wrap_node(mess, type, !!type ? mess.value : mess);
    type || (type = $sentinel);

    if (type == $error && !!selector) {
        mess = selector(requested, mess);
    }

    node = replace_node(parent, node, mess, key, roots.lru);
    node = graph_node(root, parent, node, key, inc_generation());
    update_graph(parent, size - node.$size, roots.version, roots.lru);
    nodes[0] = node;
}

function onEdge(pathmap, keys_stack, depth, roots, parents, nodes, requested, optimized, key, keyset) {

}
},{"../lru/collect":86,"../support/array-clone":104,"../support/clone-dense-json":106,"../support/create-branch":114,"../support/get-valid-key":116,"../support/graph-node":117,"../support/inc-generation":118,"../support/is-object":122,"../support/options":127,"../support/replace-node":130,"../support/update-back-refs":136,"../support/update-graph":137,"../support/wrap-node":138,"../types/error":139,"../types/sentinel":141,"../walk/walk-path-map":145}],91:[function(_dereq_,module,exports){
module.exports = set_json_graph_as_json_dense;

var $path = _dereq_("../types/path");

var clone = _dereq_("../support/clone-dense-json");
var array_clone = _dereq_("../support/array-clone");

var options = _dereq_("../support/options");
var walk_path_set = _dereq_("../walk/walk-path-set-soft-link");

var is_object = _dereq_("../support/is-object");

var get_valid_key = _dereq_("../support/get-valid-key");
var merge_node = _dereq_("../support/merge-node");

var node_as_miss = _dereq_("../support/treat-node-as-missing-path-set");
var node_as_error = _dereq_("../support/treat-node-as-error");
var clone_success = _dereq_("../support/clone-success-paths");

var collect = _dereq_("../lru/collect");

function set_json_graph_as_json_dense(model, envelopes, values, error_selector) {

    var roots = [];
    roots.offset = model._path.length;
    roots.bound = [];
    roots = options(roots, model, error_selector);
    
    var index = -1;
    var index2 = -1;
    var count = envelopes.length;
    var nodes = roots.nodes;
    var parents = array_clone(nodes);
    var requested = [];
    var optimized = [];
    var json, hasValue, hasValues;

    roots[0] = roots.root;

    while (++index < count) {
        var envelope = envelopes[index];
        var pathsets = envelope.paths;
        var jsong = envelope.jsong || envelope.values || envelope.value;
        var index3 = -1;
        var count2 = pathsets.length;
        roots[2] = jsong;
        nodes[2] = jsong;
        while (++index3 < count2) {

            json = values && values[++index2];
            if (is_object(json)) {
                roots.json = roots[3] = parents[3] = nodes[3] = json.json || (json.json = {});
            } else {
                roots.json = roots[3] = parents[3] = nodes[3] = undefined;
            }

            var pathset = pathsets[index3];
            roots.index = index3;

            walk_path_set(onNode, onEdge, pathset, 0, roots, parents, nodes, requested, optimized);

            hasValue = roots.hasValue;
            if (!!hasValue) {
                hasValues = true;
                if (is_object(json)) {
                    json.json = roots.json;
                }
                delete roots.json;
                delete roots.hasValue;
            } else if (is_object(json)) {
                delete json.json;
            }
        }
    }

    collect(
        roots.lru,
        roots.expired,
        roots.version,
        roots.root.$size || 0,
        model._maxSize,
        model._collectRatio
    );

    return {
        values: values,
        errors: roots.errors,
        requestedPaths: roots.requestedPaths,
        optimizedPaths: roots.optimizedPaths,
        requestedMissingPaths: roots.requestedMissingPaths,
        optimizedMissingPaths: roots.optimizedMissingPaths
    };
}

function onNode(pathset, roots, parents, nodes, requested, optimized, is_top_level, is_branch, key, keyset, is_keyset) {

    var parent, messageParent, json;

    if (key == null) {
        if ((key = get_valid_key(optimized)) == null) {
            return;
        }
        json = parents[3];
        parent = parents[0];
        messageParent = parents[2];
    } else {
        json = is_keyset && nodes[3] || parents[3];
        parent = nodes[0];
        messageParent = nodes[2];
    }

    var node = parent[key];
    var message = messageParent && messageParent[key];

    nodes[2] = message;
    nodes[0] = node = merge_node(roots, parent, node, messageParent, message, key);

    if (!is_top_level) {
        parents[0] = parent;
        parents[2] = messageParent;
        return;
    }

    var length = requested.length;
    var offset = roots.offset;
    
    parents[3] = json;
    
    if (is_branch) {
        parents[0] = node;
        parents[2] = message;
        if ((length > offset) && is_keyset && !!json) {
            nodes[3] = json[keyset] || (json[keyset] = {});
        }
    }
}

function onEdge(pathset, depth, roots, parents, nodes, requested, optimized, key, keyset) {

    var json;
    var node = nodes[0];
    var type = is_object(node) && node.$type || (node = undefined);

    if (node_as_miss(roots, node, type, pathset, depth, requested, optimized) === false) {
        clone_success(roots, requested, optimized);
        if (node_as_error(roots, node, type, requested) === false) {
            if(keyset == null) {
                roots.json = clone(roots, node, type, node && node.value);
            } else if(!!(json = parents[3])) {
                json[keyset] = clone(roots, node, type, node && node.value);
            }
            roots.hasValue = true;
        }
    }
}

},{"../lru/collect":86,"../support/array-clone":104,"../support/clone-dense-json":106,"../support/clone-success-paths":112,"../support/get-valid-key":116,"../support/is-object":122,"../support/merge-node":125,"../support/options":127,"../support/treat-node-as-error":132,"../support/treat-node-as-missing-path-set":134,"../types/path":140,"../walk/walk-path-set-soft-link":146}],92:[function(_dereq_,module,exports){
module.exports = set_json_graph_as_json_graph;

var $path = _dereq_("../types/path");

var clone = _dereq_("../support/clone-graph-json");
var array_clone = _dereq_("../support/array-clone");

var options = _dereq_("../support/options");
var walk_path_set = _dereq_("../walk/walk-path-set-soft-link");

var is_object = _dereq_("../support/is-object");

var get_valid_key = _dereq_("../support/get-valid-key");
var merge_node = _dereq_("../support/merge-node");

var node_as_miss = _dereq_("../support/treat-node-as-missing-path-set");
var node_as_error = _dereq_("../support/treat-node-as-error");
var clone_success = _dereq_("../support/clone-success-paths");

var promote = _dereq_("../lru/promote");
var collect = _dereq_("../lru/collect");

function set_json_graph_as_json_graph(model, envelopes, values, error_selector) {

    var roots = [];
    roots.offset = 0;
    roots.bound = [];
    roots = options(roots, model, error_selector);

    var index = -1;
    var count = envelopes.length;
    var nodes = roots.nodes;
    var parents = array_clone(nodes);
    var requested = [];
    var optimized = [];
    var json = values[0];
    var hasValue;

    roots[0] = roots.root;
    roots[1] = parents[1] = nodes[1] = json.jsong || (json.jsong = {});
    roots.requestedPaths = json.paths || (json.paths = roots.requestedPaths);

    while (++index < count) {
        var envelope = envelopes[index];
        var pathsets = envelope.paths;
        var jsong = envelope.jsong || envelope.values || envelope.value;
        var index2 = -1;
        var count2 = pathsets.length;
        roots[2] = jsong;
        nodes[2] = jsong;
        while (++index2 < count2) {
            var pathset = pathsets[index2];
            walk_path_set(onNode, onEdge, pathset, 0, roots, parents, nodes, requested, optimized);
        }
    }

    hasValue = roots.hasValue;
    if(hasValue) {
        json.jsong = roots[1];
    } else {
        delete json.jsong;
        delete json.paths;
    }

    collect(
        roots.lru,
        roots.expired,
        roots.version,
        roots.root.$size || 0,
        model._maxSize,
        model._collectRatio
    );

    return {
        values: values,
        errors: roots.errors,
        requestedPaths: roots.requestedPaths,
        optimizedPaths: roots.optimizedPaths,
        requestedMissingPaths: roots.requestedMissingPaths,
        optimizedMissingPaths: roots.optimizedMissingPaths
    };
}

function onNode(pathset, roots, parents, nodes, requested, optimized, is_top_level, is_branch, key, keyset, is_keyset) {

    var parent, messageParent, json, jsonkey;

    if (key == null) {
        if ((key = get_valid_key(optimized)) == null) {
            return;
        }
        json = parents[1];
        parent = parents[0];
        messageParent = parents[2];
    } else {
        json = nodes[1];
        parent = nodes[0];
        messageParent = nodes[2];
    }

    var jsonkey = key;
    var node = parent[key];
    var message = messageParent && messageParent[key];

    nodes[2] = message;
    nodes[0] = node = merge_node(roots, parent, node, messageParent, message, key);

    if (!is_top_level) {
        parents[0] = parent;
        parents[2] = messageParent;
        parents[1] = json;
        nodes[1] = json[jsonkey] || (json[jsonkey] = {});
        return;
    }

    var type = is_object(node) && node.$type || undefined;

    if (is_branch) {
        parents[0] = node;
        parents[2] = message;
        parents[1] = json;
        if (type == $path) {
            json[jsonkey] = clone(roots, node, type, node.value);
            roots.hasValue = true;
        } else {
            nodes[1] = json[jsonkey] || (json[jsonkey] = {});
        }
        return;
    }

    json[jsonkey] = clone(roots, node, type, node && node.value);
    roots.hasValue = true;
}

function onEdge(pathset, depth, roots, parents, nodes, requested, optimized, key, keyset) {

    var json;
    var node = nodes[0];
    var type = is_object(node) && node.$type || (node = undefined);

    if (node_as_miss(roots, node, type, pathset, depth, requested, optimized) === false) {
        clone_success(roots, requested, optimized);
        promote(roots.lru, node);
        if (keyset == null && !roots.hasValue && (keyset = get_valid_key(optimized)) == null) {
            node = clone(roots, node, type, node && node.value);
            json = roots[1];
            json.$type = node.$type;
            json.value = node.value;
        }
        roots.hasValue = true;
    }
}

},{"../lru/collect":86,"../lru/promote":87,"../support/array-clone":104,"../support/clone-graph-json":107,"../support/clone-success-paths":112,"../support/get-valid-key":116,"../support/is-object":122,"../support/merge-node":125,"../support/options":127,"../support/treat-node-as-error":132,"../support/treat-node-as-missing-path-set":134,"../types/path":140,"../walk/walk-path-set-soft-link":146}],93:[function(_dereq_,module,exports){
module.exports = set_json_graph_as_json_sparse;

var $path = _dereq_("../types/path");

var clone = _dereq_("../support/clone-dense-json");
var array_clone = _dereq_("../support/array-clone");

var options = _dereq_("../support/options");
var walk_path_set = _dereq_("../walk/walk-path-set-soft-link");

var is_object = _dereq_("../support/is-object");

var get_valid_key = _dereq_("../support/get-valid-key");
var merge_node = _dereq_("../support/merge-node");

var node_as_miss = _dereq_("../support/treat-node-as-missing-path-set");
var node_as_error = _dereq_("../support/treat-node-as-error");
var clone_success = _dereq_("../support/clone-success-paths");

var collect = _dereq_("../lru/collect");

function set_json_graph_as_json_sparse(model, envelopes, values, error_selector) {

    var roots = [];
    roots.offset = model._path.length;
    roots.bound = [];
    roots = options(roots, model, error_selector);

    var index = -1;
    var count = envelopes.length;
    var nodes = roots.nodes;
    var parents = array_clone(nodes);
    var requested = [];
    var optimized = [];
    var json = values[0];
    var hasValue;

    roots[0] = roots.root;
    roots[3] = parents[3] = nodes[3] = json.json || (json.json = {});

    while (++index < count) {
        var envelope = envelopes[index];
        var pathsets = envelope.paths;
        var jsong = envelope.jsong || envelope.values || envelope.value;
        var index2 = -1;
        var count2 = pathsets.length;
        roots[2] = jsong;
        nodes[2] = jsong;
        while (++index2 < count2) {
            var pathset = pathsets[index2];
            walk_path_set(onNode, onEdge, pathset, 0, roots, parents, nodes, requested, optimized);
        }
    }

    hasValue = roots.hasValue;
    if(hasValue) {
        json.json = roots[3];
    } else {
        delete json.json;
    }

    collect(
        roots.lru,
        roots.expired,
        roots.version,
        roots.root.$size || 0,
        model._maxSize,
        model._collectRatio
    );

    return {
        values: values,
        errors: roots.errors,
        requestedPaths: roots.requestedPaths,
        optimizedPaths: roots.optimizedPaths,
        requestedMissingPaths: roots.requestedMissingPaths,
        optimizedMissingPaths: roots.optimizedMissingPaths
    };
}

function onNode(pathset, roots, parents, nodes, requested, optimized, is_top_level, is_branch, key, keyset, is_keyset) {

    var parent, messageParent, json, jsonkey;

    if (key == null) {
        if ((key = get_valid_key(optimized)) == null) {
            return;
        }
        jsonkey = get_valid_key(requested);
        json = parents[3];
        parent = parents[0];
        messageParent = parents[2];
    } else {
        jsonkey = key;
        json = nodes[3];
        parent = nodes[0];
        messageParent = nodes[2];
    }

    var node = parent[key];
    var message = messageParent && messageParent[key];

    nodes[2] = message;
    nodes[0] = node = merge_node(roots, parent, node, messageParent, message, key);

    if (!is_top_level) {
        parents[0] = parent;
        parents[2] = messageParent;
        return;
    }

    parents[3] = json;

    if (is_branch) {
        var length = requested.length;
        var offset = roots.offset;
        var type = is_object(node) && node.$type || undefined;

        parents[0] = node;
        parents[2] = message;
        if ((length > offset) && (!type || type == $path)) {
            nodes[3] = json[jsonkey] || (json[jsonkey] = {});
        }
    }
}

function onEdge(pathset, depth, roots, parents, nodes, requested, optimized, key, keyset) {

    var json;
    var node = nodes[0];
    var type = is_object(node) && node.$type || (node = undefined);

    if (node_as_miss(roots, node, type, pathset, depth, requested, optimized) === false) {
        clone_success(roots, requested, optimized);
        if (node_as_error(roots, node, type, requested) === false) {
            if (keyset == null && !roots.hasValue && (keyset = get_valid_key(optimized)) == null) {
                node = clone(roots, node, type, node && node.value);
                json = roots[3];
                json.$type = node.$type;
                json.value = node.value;
            } else {
                json = parents[3];
                json[key] = clone(roots, node, type, node && node.value);
            }
            roots.hasValue = true;
        }
    }
}

},{"../lru/collect":86,"../support/array-clone":104,"../support/clone-dense-json":106,"../support/clone-success-paths":112,"../support/get-valid-key":116,"../support/is-object":122,"../support/merge-node":125,"../support/options":127,"../support/treat-node-as-error":132,"../support/treat-node-as-missing-path-set":134,"../types/path":140,"../walk/walk-path-set-soft-link":146}],94:[function(_dereq_,module,exports){
module.exports = set_json_graph_as_json_values;

var $path = _dereq_("../types/path");

var clone = _dereq_("../support/clone-dense-json");
var array_clone = _dereq_("../support/array-clone");
var array_slice = _dereq_("../support/array-slice");

var options = _dereq_("../support/options");
var walk_path_set = _dereq_("../walk/walk-path-set-soft-link");

var is_object = _dereq_("../support/is-object");

var get_valid_key = _dereq_("../support/get-valid-key");
var merge_node = _dereq_("../support/merge-node");

var node_as_miss = _dereq_("../support/treat-node-as-missing-path-set");
var node_as_error = _dereq_("../support/treat-node-as-error");
var clone_success = _dereq_("../support/clone-success-paths");

var collect = _dereq_("../lru/collect");

function set_json_graph_as_json_values(model, envelopes, onNext, error_selector) {

    var roots = [];
    roots.offset = model._path.length;
    roots.bound = [];
    roots = options(roots, model, error_selector);

    var index = -1;
    var count = envelopes.length;
    var nodes = roots.nodes;
    var parents = array_clone(nodes);
    var requested = [];
    var optimized = [];

    roots[0] = roots.root;
    roots.onNext = onNext;

    while (++index < count) {
        var envelope = envelopes[index];
        var pathsets = envelope.paths;
        var jsong = envelope.jsong || envelope.values || envelope.value;
        var index2 = -1;
        var count2 = pathsets.length;
        roots[2] = jsong;
        nodes[2] = jsong;
        while (++index2 < count2) {
            var pathset = pathsets[index2];
            walk_path_set(onNode, onEdge, pathset, 0, roots, parents, nodes, requested, optimized);
        }
    }

    collect(
        roots.lru,
        roots.expired,
        roots.version,
        roots.root.$size || 0,
        model._maxSize,
        model._collectRatio
    );

    return {
        values: null,
        errors: roots.errors,
        requestedPaths: roots.requestedPaths,
        optimizedPaths: roots.optimizedPaths,
        requestedMissingPaths: roots.requestedMissingPaths,
        optimizedMissingPaths: roots.optimizedMissingPaths
    };
}

function onNode(pathset, roots, parents, nodes, requested, optimized, is_top_level, is_branch, key, keyset) {

    var parent, messageParent;

    if (key == null) {
        if ((key = get_valid_key(optimized)) == null) {
            return;
        }
        parent = parents[0];
        messageParent = parents[2];
    } else {
        parent = nodes[0];
        messageParent = nodes[2];
    }

    var node = parent[key];
    var message = messageParent && messageParent[key];

    nodes[2] = message;
    nodes[0] = node = merge_node(roots, parent, node, messageParent, message, key);

    if (!is_top_level) {
        parents[0] = parent;
        parents[2] = messageParent;
        return;
    }

    if (is_branch) {
        parents[0] = node;
        parents[2] = message;
    }
}

function onEdge(pathset, depth, roots, parents, nodes, requested, optimized, key, keyset, is_keyset) {

    var node = nodes[0];
    var type = is_object(node) && node.$type || (node = undefined);

    if (node_as_miss(roots, node, type, pathset, depth, requested, optimized) === false) {
        clone_success(roots, requested, optimized);
        if (node_as_error(roots, node, type, requested) === false) {
            roots.onNext({
                path: array_slice(requested, roots.offset),
                value: clone(roots, node, type, node && node.value)
            });
        }
    }
}

},{"../lru/collect":86,"../support/array-clone":104,"../support/array-slice":105,"../support/clone-dense-json":106,"../support/clone-success-paths":112,"../support/get-valid-key":116,"../support/is-object":122,"../support/merge-node":125,"../support/options":127,"../support/treat-node-as-error":132,"../support/treat-node-as-missing-path-set":134,"../types/path":140,"../walk/walk-path-set-soft-link":146}],95:[function(_dereq_,module,exports){
module.exports = set_json_sparse_as_json_dense;

var $path = _dereq_("../types/path");
var $error = _dereq_("../types/error");
var $sentinel = _dereq_("../types/sentinel");

var clone = _dereq_("../support/clone-dense-json");
var array_clone = _dereq_("../support/array-clone");

var options = _dereq_("../support/options");
var walk_path_map = _dereq_("../walk/walk-path-map");

var is_object = _dereq_("../support/is-object");

var get_valid_key = _dereq_("../support/get-valid-key");
var create_branch = _dereq_("../support/create-branch");
var wrap_node = _dereq_("../support/wrap-node");
var replace_node = _dereq_("../support/replace-node");
var graph_node = _dereq_("../support/graph-node");
var update_back_refs = _dereq_("../support/update-back-refs");
var update_graph = _dereq_("../support/update-graph");
var inc_generation = _dereq_("../support/inc-generation");

var node_as_miss = _dereq_("../support/treat-node-as-missing-path-map");
var node_as_error = _dereq_("../support/treat-node-as-error");
var clone_success = _dereq_("../support/clone-success-paths");

var collect = _dereq_("../lru/collect");

function set_json_sparse_as_json_dense(model, pathmaps, values, error_selector) {

    var roots = options([], model, error_selector);
    var index = -1;
    var count = pathmaps.length;
    var nodes = roots.nodes;
    var parents = array_clone(nodes);
    var requested = [];
    var optimized = [];
    var keys_stack = [];
    var json, hasValue, hasValues;

    roots[0] = roots.root;

    while (++index < count) {

        json = values && values[index];
        if (is_object(json)) {
            roots.json = roots[3] = parents[3] = nodes[3] = json.json || (json.json = {})
        } else {
            roots.json = roots[3] = parents[3] = nodes[3] = undefined;
        }

        var pathmap = pathmaps[index];
        roots.index = index;

        walk_path_map(onNode, onEdge, pathmap, keys_stack, 0, roots, parents, nodes, requested, optimized);

        hasValue = roots.hasValue;
        if (!!hasValue) {
            hasValues = true;
            if (is_object(json)) {
                json.json = roots.json;
            }
            delete roots.json;
            delete roots.hasValue;
        } else if (is_object(json)) {
            delete json.json;
        }
    }

    collect(
        roots.lru,
        roots.expired,
        roots.version,
        roots.root.$size || 0,
        model._maxSize,
        model._collectRatio
    );

    return {
        values: values,
        errors: roots.errors,
        hasValue: hasValues,
        requestedPaths: roots.requestedPaths,
        optimizedPaths: roots.optimizedPaths,
        requestedMissingPaths: roots.requestedMissingPaths,
        optimizedMissingPaths: roots.optimizedMissingPaths
    };
}

function onNode(pathmap, roots, parents, nodes, requested, optimized, is_top_level, is_branch, key, keyset, is_keyset) {

    var parent, json;

    if (key == null) {
        if ((key = get_valid_key(optimized)) == null) {
            return;
        }
        json = parents[3];
        parent = parents[0];
    } else {
        json = is_keyset && nodes[3] || parents[3];
        parent = nodes[0];
    }

    var node = parent[key],
        type;

    if (!is_top_level) {
        type = is_object(node) && node.$type || undefined;
        type = type && is_branch && "." || type;
        node = create_branch(roots, parent, node, type, key);
        parents[0] = parent;
        nodes[0] = node;
        return;
    }

    parents[3] = json;

    if (is_branch) {
        type = is_object(node) && node.$type || undefined;
        node = create_branch(roots, parent, node, type, key);
        parents[0] = nodes[0] = node;
        if (is_keyset && !!json) {
            nodes[3] = json[keyset] || (json[keyset] = {});
        }
        return;
    }

    var selector = roots.error_selector;
    var root = roots[0];
    var size = is_object(node) && node.$size || 0;
    var mess = pathmap;

    type = is_object(mess) && mess.$type || undefined;
    mess = wrap_node(mess, type, !!type ? mess.value : mess);
    type || (type = $sentinel);

    if (type == $error && !!selector) {
        mess = selector(requested, mess);
    }

    node = replace_node(parent, node, mess, key, roots.lru);
    node = graph_node(root, parent, node, key, inc_generation());
    update_graph(parent, size - node.$size, roots.version, roots.lru);
    nodes[0] = node;
}

function onEdge(pathmap, keys_stack, depth, roots, parents, nodes, requested, optimized, key, keyset) {

    var json;
    var node = nodes[0];
    var type = is_object(node) && node.$type || (node = undefined);

    if (node_as_miss(roots, node, type, pathmap, keys_stack, depth, requested, optimized) === false) {
        clone_success(roots, requested, optimized);
        if (node_as_error(roots, node, type, requested) === false) {
            if(keyset == null) {
                roots.json = clone(roots, node, type, node && node.value);
            } else if(!!(json = parents[3])) {
                json[keyset] = clone(roots, node, type, node && node.value);
            }
            roots.hasValue = true;
        }
    }
}
},{"../lru/collect":86,"../support/array-clone":104,"../support/clone-dense-json":106,"../support/clone-success-paths":112,"../support/create-branch":114,"../support/get-valid-key":116,"../support/graph-node":117,"../support/inc-generation":118,"../support/is-object":122,"../support/options":127,"../support/replace-node":130,"../support/treat-node-as-error":132,"../support/treat-node-as-missing-path-map":133,"../support/update-back-refs":136,"../support/update-graph":137,"../support/wrap-node":138,"../types/error":139,"../types/path":140,"../types/sentinel":141,"../walk/walk-path-map":145}],96:[function(_dereq_,module,exports){
module.exports = set_json_sparse_as_json_graph;

var $path = _dereq_("../types/path");
var $error = _dereq_("../types/error");
var $sentinel = _dereq_("../types/sentinel");

var clone = _dereq_("../support/clone-graph-json");
var array_clone = _dereq_("../support/array-clone");

var options = _dereq_("../support/options");
var walk_path_map = _dereq_("../walk/walk-path-map-soft-link");

var is_object = _dereq_("../support/is-object");

var get_valid_key = _dereq_("../support/get-valid-key");
var create_branch = _dereq_("../support/create-branch");
var wrap_node = _dereq_("../support/wrap-node");
var replace_node = _dereq_("../support/replace-node");
var graph_node = _dereq_("../support/graph-node");
var update_back_refs = _dereq_("../support/update-back-refs");
var update_graph = _dereq_("../support/update-graph");
var inc_generation = _dereq_("../support/inc-generation");

var node_as_miss = _dereq_("../support/treat-node-as-missing-path-map");
var node_as_error = _dereq_("../support/treat-node-as-error");
var clone_success = _dereq_("../support/clone-success-paths");

var promote = _dereq_("../lru/promote");
var collect = _dereq_("../lru/collect");

function set_json_sparse_as_json_graph(model, pathmaps, values, error_selector) {

    var roots = options([], model, error_selector);
    var index = -1;
    var count = pathmaps.length;
    var nodes = roots.nodes;
    var parents = array_clone(nodes);
    var requested = [];
    var optimized = [];
    var keys_stack = [];
    var json = values[0];
    var hasValue;

    roots[0] = roots.root;
    roots[1] = parents[1] = nodes[1] = json.jsong || (json.jsong = {});
    roots.requestedPaths = json.paths || (json.paths = roots.requestedPaths);

    while (++index < count) {
        var pathmap = pathmaps[index];
        walk_path_map(onNode, onEdge, pathmap, keys_stack, 0, roots, parents, nodes, requested, optimized);
    }

    hasValue = roots.hasValue;
    if(hasValue) {
        json.jsong = roots[1];
    } else {
        delete json.jsong;
        delete json.paths;
    }

    collect(
        roots.lru,
        roots.expired,
        roots.version,
        roots.root.$size || 0,
        model._maxSize,
        model._collectRatio
    );

    return {
        values: values,
        errors: roots.errors,
        hasValue: hasValue,
        requestedPaths: roots.requestedPaths,
        optimizedPaths: roots.optimizedPaths,
        requestedMissingPaths: roots.requestedMissingPaths,
        optimizedMissingPaths: roots.optimizedMissingPaths
    };
}

function onNode(pathmap, roots, parents, nodes, requested, optimized, is_top_level, is_branch, key, keyset, is_keyset) {

    var parent, json;

    if (key == null) {
        if ((key = get_valid_key(optimized)) == null) {
            return;
        }
        json = parents[1];
        parent = parents[0];
    } else {
        json = nodes[1];
        parent = nodes[0];
    }

    var jsonkey = key;
    var node = parent[key],
        type;

    if (!is_top_level) {
        type = is_object(node) && node.$type || undefined;
        type = type && is_branch && "." || type;
        node = create_branch(roots, parent, node, type, key);
        parents[0] = parent;
        nodes[0] = node;
        parents[1] = json;
        if (type == $path) {
            json[jsonkey] = clone(roots, node, type, node.value);
            roots.hasValue = true;
        } else {
            nodes[1] = json[jsonkey] || (json[jsonkey] = {});
        }
        return;
    }

    if (is_branch) {
        type = is_object(node) && node.$type || undefined;
        node = create_branch(roots, parent, node, type, key);
        type = node.$type;
        parents[0] = nodes[0] = node;
        parents[1] = json;
        if (type == $path) {
            json[jsonkey] = clone(roots, node, type, node.value);
            roots.hasValue = true;
        } else {
            nodes[1] = json[jsonkey] || (json[jsonkey] = {});
        }
        return;
    }

    var selector = roots.error_selector;
    var root = roots[0];
    var size = is_object(node) && node.$size || 0;
    var mess = pathmap;

    type = is_object(mess) && mess.$type || undefined;
    mess = wrap_node(mess, type, !!type ? mess.value : mess);
    type || (type = $sentinel);

    if (type == $error && !!selector) {
        mess = selector(requested, mess);
    }

    node = replace_node(parent, node, mess, key, roots.lru);
    node = graph_node(root, parent, node, key, inc_generation());
    update_graph(parent, size - node.$size, roots.version, roots.lru);
    nodes[0] = node;

    json[jsonkey] = clone(roots, node, type, node && node.value);
    roots.hasValue = true;
}

function onEdge(pathmap, keys_stack, depth, roots, parents, nodes, requested, optimized, key, keyset) {

    var json;
    var node = nodes[0];
    var type = is_object(node) && node.$type || (node = undefined);

    if (node_as_miss(roots, node, type, pathmap, keys_stack, depth, requested, optimized) === false) {
        clone_success(roots, requested, optimized);
        promote(roots.lru, node);
        if (keyset == null && !roots.hasValue && (keyset = get_valid_key(optimized)) == null) {
            node = clone(roots, node, type, node && node.value);
            json = roots[1];
            json.$type = node.$type;
            json.value = node.value;
        }
        roots.hasValue = true;
    }
}
},{"../lru/collect":86,"../lru/promote":87,"../support/array-clone":104,"../support/clone-graph-json":107,"../support/clone-success-paths":112,"../support/create-branch":114,"../support/get-valid-key":116,"../support/graph-node":117,"../support/inc-generation":118,"../support/is-object":122,"../support/options":127,"../support/replace-node":130,"../support/treat-node-as-error":132,"../support/treat-node-as-missing-path-map":133,"../support/update-back-refs":136,"../support/update-graph":137,"../support/wrap-node":138,"../types/error":139,"../types/path":140,"../types/sentinel":141,"../walk/walk-path-map-soft-link":144}],97:[function(_dereq_,module,exports){
module.exports = set_json_sparse_as_json_sparse;

var $path = _dereq_("../types/path");
var $error = _dereq_("../types/error");
var $sentinel = _dereq_("../types/sentinel");

var clone = _dereq_("../support/clone-dense-json");
var array_clone = _dereq_("../support/array-clone");

var options = _dereq_("../support/options");
var walk_path_map = _dereq_("../walk/walk-path-map");

var is_object = _dereq_("../support/is-object");

var get_valid_key = _dereq_("../support/get-valid-key");
var create_branch = _dereq_("../support/create-branch");
var wrap_node = _dereq_("../support/wrap-node");
var replace_node = _dereq_("../support/replace-node");
var graph_node = _dereq_("../support/graph-node");
var update_back_refs = _dereq_("../support/update-back-refs");
var update_graph = _dereq_("../support/update-graph");
var inc_generation = _dereq_("../support/inc-generation");

var node_as_miss = _dereq_("../support/treat-node-as-missing-path-map");
var node_as_error = _dereq_("../support/treat-node-as-error");
var clone_success = _dereq_("../support/clone-success-paths");

var collect = _dereq_("../lru/collect");

function set_json_sparse_as_json_sparse(model, pathmaps, values, error_selector) {

    var roots = options([], model, error_selector);
    var index = -1;
    var count = pathmaps.length;
    var nodes = roots.nodes;
    var parents = array_clone(nodes);
    var requested = [];
    var optimized = [];
    var keys_stack = [];
    var json = values[0];
    var hasValue;

    roots[0] = roots.root;
    roots[3] = parents[3] = nodes[3] = json.json || (json.json = {});

    while (++index < count) {
        var pathmap = pathmaps[index];
        walk_path_map(onNode, onEdge, pathmap, keys_stack, 0, roots, parents, nodes, requested, optimized);
    }

    hasValue = roots.hasValue;
    if(hasValue) {
        json.json = roots[3];
    } else {
        delete json.json;
    }

    collect(
        roots.lru,
        roots.expired,
        roots.version,
        roots.root.$size || 0,
        model._maxSize,
        model._collectRatio
    );

    return {
        values: values,
        errors: roots.errors,
        hasValue: hasValue,
        requestedPaths: roots.requestedPaths,
        optimizedPaths: roots.optimizedPaths,
        requestedMissingPaths: roots.requestedMissingPaths,
        optimizedMissingPaths: roots.optimizedMissingPaths
    };
}

function onNode(pathmap, roots, parents, nodes, requested, optimized, is_top_level, is_branch, key, keyset, is_keyset) {

    var parent, json, jsonkey;

    if (key == null) {
        if ((key = get_valid_key(optimized)) == null) {
            return;
        }
        jsonkey = get_valid_key(requested);
        json = parents[3];
        parent = parents[0];
    } else {
        jsonkey = key;
        json = nodes[3];
        parent = nodes[0];
    }

    var node = parent[key],
        type;

    if (!is_top_level) {
        type = is_object(node) && node.$type || undefined;
        type = type && is_branch && "." || type;
        node = create_branch(roots, parent, node, type, key);
        parents[0] = parent;
        nodes[0] = node;
        return;
    }
    
    parents[3] = json;
    
    if (is_branch) {
        type = is_object(node) && node.$type || undefined;
        node = create_branch(roots, parent, node, type, key);
        parents[0] = nodes[0] = node;
        nodes[3] = json[jsonkey] || (json[jsonkey] = {});
        return;
    }

    var selector = roots.error_selector;
    var root = roots[0];
    var size = is_object(node) && node.$size || 0;
    var mess = pathmap;

    type = is_object(mess) && mess.$type || undefined;
    mess = wrap_node(mess, type, !!type ? mess.value : mess);
    type || (type = $sentinel);

    if (type == $error && !!selector) {
        mess = selector(requested, mess);
    }

    node = replace_node(parent, node, mess, key, roots.lru);
    node = graph_node(root, parent, node, key, inc_generation());
    update_graph(parent, size - node.$size, roots.version, roots.lru);
    nodes[0] = node;
}

function onEdge(pathmap, keys_stack, depth, roots, parents, nodes, requested, optimized, key, keyset) {

    var json;
    var node = nodes[0];
    var type = is_object(node) && node.$type || (node = undefined);

    if (node_as_miss(roots, node, type, pathmap, keys_stack, depth, requested, optimized) === false) {
        clone_success(roots, requested, optimized);
        if (node_as_error(roots, node, type, requested) === false) {
            if (keyset == null && !roots.hasValue && (keyset = get_valid_key(optimized)) == null) {
                node = clone(roots, node, type, node && node.value);
                json = roots[3];
                json.$type = node.$type;
                json.value = node.value;
            } else {
                json = parents[3];
                json[key] = clone(roots, node, type, node && node.value);
            }
            roots.hasValue = true;
        }
    }
}
},{"../lru/collect":86,"../support/array-clone":104,"../support/clone-dense-json":106,"../support/clone-success-paths":112,"../support/create-branch":114,"../support/get-valid-key":116,"../support/graph-node":117,"../support/inc-generation":118,"../support/is-object":122,"../support/options":127,"../support/replace-node":130,"../support/treat-node-as-error":132,"../support/treat-node-as-missing-path-map":133,"../support/update-back-refs":136,"../support/update-graph":137,"../support/wrap-node":138,"../types/error":139,"../types/path":140,"../types/sentinel":141,"../walk/walk-path-map":145}],98:[function(_dereq_,module,exports){
module.exports = set_path_map_as_json_values;

var $error = _dereq_("../types/error");
var $sentinel = _dereq_("../types/sentinel");

var clone = _dereq_("../support/clone-dense-json");
var array_clone = _dereq_("../support/array-clone");

var options = _dereq_("../support/options");
var walk_path_map = _dereq_("../walk/walk-path-map");

var is_object = _dereq_("../support/is-object");

var get_valid_key = _dereq_("../support/get-valid-key");
var create_branch = _dereq_("../support/create-branch");
var wrap_node = _dereq_("../support/wrap-node");
var replace_node = _dereq_("../support/replace-node");
var graph_node = _dereq_("../support/graph-node");
var update_back_refs = _dereq_("../support/update-back-refs");
var update_graph = _dereq_("../support/update-graph");
var inc_generation = _dereq_("../support/inc-generation");

var node_as_miss = _dereq_("../support/treat-node-as-missing-path-map");
var node_as_error = _dereq_("../support/treat-node-as-error");
var clone_success = _dereq_("../support/clone-success-paths");

var collect = _dereq_("../lru/collect");

function set_path_map_as_json_values(model, pathmaps, onNext, error_selector) {

    var roots = options([], model, error_selector);
    var index = -1;
    var count = pathmaps.length;
    var nodes = roots.nodes;
    var parents = array_clone(nodes);
    var requested = [];
    var optimized = [];
    var keys_stack = [];
    roots[0] = roots.root;
    roots.onNext = onNext;

    while (++index < count) {
        var pathmap = pathmaps[index];
        walk_path_map(onNode, onEdge, pathmap, keys_stack, 0, roots, parents, nodes, requested, optimized);
    }

    collect(
        roots.lru,
        roots.expired,
        roots.version,
        roots.root.$size || 0,
        model._maxSize,
        model._collectRatio
    );

    return {
        values: null,
        errors: roots.errors,
        requestedPaths: roots.requestedPaths,
        optimizedPaths: roots.optimizedPaths,
        requestedMissingPaths: roots.requestedMissingPaths,
        optimizedMissingPaths: roots.optimizedMissingPaths
    };
}

function onNode(pathmap, roots, parents, nodes, requested, optimized, is_top_level, is_branch, key, keyset, is_keyset) {

    var parent;

    if (key == null) {
        if ((key = get_valid_key(optimized)) == null) {
            return;
        }
        parent = parents[0];
    } else {
        parent = nodes[0];
    }

    var node = parent[key],
        type;

    if (!is_top_level) {
        type = is_object(node) && node.$type || undefined;
        type = type && is_branch && "." || type;
        node = create_branch(roots, parent, node, type, key);
        parents[0] = parent;
        nodes[0] = node;
        return;
    }

    if (is_branch) {
        type = is_object(node) && node.$type || undefined;
        node = create_branch(roots, parent, node, type, key);
        parents[0] = nodes[0] = node;
        return;
    }

    var selector = roots.error_selector;
    var root = roots[0];
    var size = is_object(node) && node.$size || 0;
    var mess = pathmap;

    type = is_object(mess) && mess.$type || undefined;
    mess = wrap_node(mess, type, !!type ? mess.value : mess);
    type || (type = $sentinel);

    if (type == $error && !!selector) {
        mess = selector(requested, mess);
    }

    node = replace_node(parent, node, mess, key, roots.lru);
    node = graph_node(root, parent, node, key, inc_generation());
    update_graph(parent, size - node.$size, roots.version, roots.lru);
    nodes[0] = node;
}

function onEdge(pathmap, keys_stack, depth, roots, parents, nodes, requested, optimized, key, keyset) {

    var node = nodes[0];
    var type = is_object(node) && node.$type || (node = undefined);

    if (node_as_miss(roots, node, type, pathmap, keys_stack, depth, requested, optimized) === false) {
        clone_success(roots, requested, optimized);
        if (node_as_error(roots, node, type, requested) === false) {
            roots.onNext({
                path: array_clone(requested),
                value: clone(roots, node, type, node && node.value)
            });
        }
    }
}
},{"../lru/collect":86,"../support/array-clone":104,"../support/clone-dense-json":106,"../support/clone-success-paths":112,"../support/create-branch":114,"../support/get-valid-key":116,"../support/graph-node":117,"../support/inc-generation":118,"../support/is-object":122,"../support/options":127,"../support/replace-node":130,"../support/treat-node-as-error":132,"../support/treat-node-as-missing-path-map":133,"../support/update-back-refs":136,"../support/update-graph":137,"../support/wrap-node":138,"../types/error":139,"../types/sentinel":141,"../walk/walk-path-map":145}],99:[function(_dereq_,module,exports){
module.exports = set_json_values_as_json_dense;

var $path = _dereq_("../types/path");
var $error = _dereq_("../types/error");
var $sentinel = _dereq_("../types/sentinel");

var clone = _dereq_("../support/clone-dense-json");
var array_clone = _dereq_("../support/array-clone");

var options = _dereq_("../support/options");
var walk_path_set = _dereq_("../walk/walk-path-set");

var is_object = _dereq_("../support/is-object");

var get_valid_key = _dereq_("../support/get-valid-key");
var create_branch = _dereq_("../support/create-branch");
var wrap_node = _dereq_("../support/wrap-node");
var invalidate_node = _dereq_("../support/invalidate-node");
var replace_node = _dereq_("../support/replace-node");
var graph_node = _dereq_("../support/graph-node");
var update_back_refs = _dereq_("../support/update-back-refs");
var update_graph = _dereq_("../support/update-graph");
var inc_generation = _dereq_("../support/inc-generation");

var node_as_miss = _dereq_("../support/treat-node-as-missing-path-set");
var node_as_error = _dereq_("../support/treat-node-as-error");
var clone_success = _dereq_("../support/clone-success-paths");

var collect = _dereq_("../lru/collect");

function set_json_values_as_json_dense(model, pathvalues, values, error_selector) {

    var roots = options([], model, error_selector);
    var index = -1;
    var count = pathvalues.length;
    var nodes = roots.nodes;
    var parents = array_clone(nodes);
    var requested = [];
    var optimized = [];
    var json, hasValue, hasValues;

    roots[0] = roots.root;

    while (++index < count) {

        json = values && values[index];
        if (is_object(json)) {
            roots.json = roots[3] = parents[3] = nodes[3] = json.json || (json.json = {})
        } else {
            roots.json = roots[3] = parents[3] = nodes[3] = undefined;
        }

        var pv = pathvalues[index];
        var pathset = pv.path;
        roots.value = pv.value;
        roots.index = index;

        walk_path_set(onNode, onEdge, pathset, 0, roots, parents, nodes, requested, optimized);

        hasValue = roots.hasValue;
        if (!!hasValue) {
            hasValues = true;
            if (is_object(json)) {
                json.json = roots.json;
            }
            delete roots.json;
            delete roots.hasValue;
        } else if (is_object(json)) {
            delete json.json;
        }
    }

    collect(
        roots.lru,
        roots.expired,
        roots.version,
        roots.root.$size || 0,
        model._maxSize,
        model._collectRatio
    );

    return {
        values: values,
        errors: roots.errors,
        hasValue: hasValues,
        requestedPaths: roots.requestedPaths,
        optimizedPaths: roots.optimizedPaths,
        requestedMissingPaths: roots.requestedMissingPaths,
        optimizedMissingPaths: roots.optimizedMissingPaths
    };
}

function onNode(pathset, roots, parents, nodes, requested, optimized, is_top_level, is_branch, key, keyset, is_keyset) {

    var parent, json;

    if (key == null) {
        if ((key = get_valid_key(optimized)) == null) {
            return;
        }
        json = parents[3];
        parent = parents[0];
    } else {
        json = is_keyset && nodes[3] || parents[3];
        parent = nodes[0];
    }

    var node = parent[key],
        type;

    if (!is_top_level) {
        type = is_object(node) && node.$type || undefined;
        type = type && is_branch && "." || type;
        node = create_branch(roots, parent, node, type, key);
        parents[0] = parent;
        nodes[0] = node;
        return;
    }

    parents[3] = json;

    if (is_branch) {
        type = is_object(node) && node.$type || undefined;
        node = create_branch(roots, parent, node, type, key);
        parents[0] = parent;
        nodes[0] = node;
        if (is_keyset && !!json) {
            nodes[3] = json[keyset] || (json[keyset] = {});
        }
        return;
    }

    var selector = roots.error_selector;
    var root = roots[0];
    var size = is_object(node) && node.$size || 0;
    var mess = roots.value;

    if(mess === undefined && roots.headless) {
        invalidate_node(parent, node, key, roots.lru);
        update_graph(parent, size, roots.version, roots.lru);
        node = undefined;
    } else {
        type = is_object(mess) && mess.$type || undefined;
        mess = wrap_node(mess, type, !!type ? mess.value : mess);
        type || (type = $sentinel);

        if (type == $error && !!selector) {
            mess = selector(requested, mess);
        }

        node = replace_node(parent, node, mess, key, roots.lru);
        node = graph_node(root, parent, node, key, inc_generation());
        update_graph(parent, size - node.$size, roots.version, roots.lru);
    }
    
    nodes[0] = node;
}

function onEdge(pathset, depth, roots, parents, nodes, requested, optimized, key, keyset) {

    var json;
    var node = nodes[0];
    var type = is_object(node) && node.$type || (node = undefined);

    if (node_as_miss(roots, node, type, pathset, depth, requested, optimized) === false) {
        clone_success(roots, requested, optimized);
        if (node_as_error(roots, node, type, requested) === false) {
            if(keyset == null) {
                roots.json = clone(roots, node, type, node && node.value);
            } else if(!!(json = parents[3])) {
                json[keyset] = clone(roots, node, type, node && node.value);
            }
            roots.hasValue = true;
        }
    }
}

},{"../lru/collect":86,"../support/array-clone":104,"../support/clone-dense-json":106,"../support/clone-success-paths":112,"../support/create-branch":114,"../support/get-valid-key":116,"../support/graph-node":117,"../support/inc-generation":118,"../support/invalidate-node":120,"../support/is-object":122,"../support/options":127,"../support/replace-node":130,"../support/treat-node-as-error":132,"../support/treat-node-as-missing-path-set":134,"../support/update-back-refs":136,"../support/update-graph":137,"../support/wrap-node":138,"../types/error":139,"../types/path":140,"../types/sentinel":141,"../walk/walk-path-set":147}],100:[function(_dereq_,module,exports){
module.exports = set_json_values_as_json_graph;

var $path = _dereq_("../types/path");
var $error = _dereq_("../types/error");
var $sentinel = _dereq_("../types/sentinel");

var clone = _dereq_("../support/clone-graph-json");
var array_clone = _dereq_("../support/array-clone");

var options = _dereq_("../support/options");
var walk_path_set = _dereq_("../walk/walk-path-set-soft-link");

var is_object = _dereq_("../support/is-object");

var get_valid_key = _dereq_("../support/get-valid-key");
var create_branch = _dereq_("../support/create-branch");
var wrap_node = _dereq_("../support/wrap-node");
var invalidate_node = _dereq_("../support/invalidate-node");
var replace_node = _dereq_("../support/replace-node");
var graph_node = _dereq_("../support/graph-node");
var update_back_refs = _dereq_("../support/update-back-refs");
var update_graph = _dereq_("../support/update-graph");
var inc_generation = _dereq_("../support/inc-generation");

var node_as_miss = _dereq_("../support/treat-node-as-missing-path-set");
var node_as_error = _dereq_("../support/treat-node-as-error");
var clone_success = _dereq_("../support/clone-success-paths");

var promote = _dereq_("../lru/promote");
var collect = _dereq_("../lru/collect");

function set_json_values_as_json_graph(model, pathvalues, values, error_selector) {

    var roots = options([], model, error_selector);
    var index = -1;
    var count = pathvalues.length;
    var nodes = roots.nodes;
    var parents = array_clone(nodes);
    var requested = [];
    var optimized = [];
    var json = values[0];
    var hasValue;

    roots[0] = roots.root;
    roots[1] = parents[1] = nodes[1] = json.jsong || (json.jsong = {});
    roots.requestedPaths = json.paths || (json.paths = roots.requestedPaths);

    while (++index < count) {

        var pv = pathvalues[index];
        var pathset = pv.path;
        roots.value = pv.value;

        walk_path_set(onNode, onEdge, pathset, 0, roots, parents, nodes, requested, optimized);
    }

    hasValue = roots.hasValue;
    if(hasValue) {
        json.jsong = roots[1];
    } else {
        delete json.jsong;
        delete json.paths;
    }

    collect(
        roots.lru,
        roots.expired,
        roots.version,
        roots.root.$size || 0,
        model._maxSize,
        model._collectRatio
    );

    return {
        values: values,
        errors: roots.errors,
        hasValue: hasValue,
        requestedPaths: roots.requestedPaths,
        optimizedPaths: roots.optimizedPaths,
        requestedMissingPaths: roots.requestedMissingPaths,
        optimizedMissingPaths: roots.optimizedMissingPaths
    };
}

function onNode(pathset, roots, parents, nodes, requested, optimized, is_top_level, is_branch, key, keyset, is_keyset) {

    var parent, json;

    if (key == null) {
        if ((key = get_valid_key(optimized)) == null) {
            return;
        }
        json = parents[1];
        parent = parents[0];
    } else {
        json = nodes[1];
        parent = nodes[0];
    }

    var jsonkey = key;
    var node = parent[key],
        type;

    if (!is_top_level) {
        type = is_object(node) && node.$type || undefined;
        type = type && is_branch && "." || type;
        node = create_branch(roots, parent, node, type, key);
        parents[0] = parent;
        nodes[0] = node;
        parents[1] = json;
        if (type == $path) {
            json[jsonkey] = clone(roots, node, type, node.value);
            roots.hasValue = true;
        } else {
            nodes[1] = json[jsonkey] || (json[jsonkey] = {});
        }
        return;
    }

    if (is_branch) {
        type = is_object(node) && node.$type || undefined;
        node = create_branch(roots, parent, node, type, key);
        type = node.$type;
        parents[0] = parent;
        nodes[0] = node;
        parents[1] = json;
        if (type == $path) {
            json[jsonkey] = clone(roots, node, type, node.value);
            roots.hasValue = true;
        } else {
            nodes[1] = json[jsonkey] || (json[jsonkey] = {});
        }
        return;
    }

    var selector = roots.error_selector;
    var root = roots[0];
    var size = is_object(node) && node.$size || 0;
    var mess = roots.value;

    if(mess === undefined && roots.headless) {
        invalidate_node(parent, node, key, roots.lru);
        update_graph(parent, size, roots.version, roots.lru);
        node = undefined;
    } else {
        type = is_object(mess) && mess.$type || undefined;
        mess = wrap_node(mess, type, !!type ? mess.value : mess);
        type || (type = $sentinel);

        if (type == $error && !!selector) {
            mess = selector(requested, mess);
        }

        node = replace_node(parent, node, mess, key, roots.lru);
        node = graph_node(root, parent, node, key, inc_generation());
        update_graph(parent, size - node.$size, roots.version, roots.lru);
    }
    nodes[0] = node;

    json[jsonkey] = clone(roots, node, type, node && node.value);
    roots.hasValue = true;
}

function onEdge(pathset, depth, roots, parents, nodes, requested, optimized, key, keyset) {

    var json;
    var node = nodes[0];
    var type = is_object(node) && node.$type || (node = undefined);

    if (node_as_miss(roots, node, type, pathset, depth, requested, optimized) === false) {
        clone_success(roots, requested, optimized);
        promote(roots.lru, node);
        if (keyset == null && !roots.hasValue && (keyset = get_valid_key(optimized)) == null) {
            node = clone(roots, node, type, node && node.value);
            json = roots[1];
            json.$type = node.$type;
            json.value = node.value;
        }
        roots.hasValue = true;
    }
}

},{"../lru/collect":86,"../lru/promote":87,"../support/array-clone":104,"../support/clone-graph-json":107,"../support/clone-success-paths":112,"../support/create-branch":114,"../support/get-valid-key":116,"../support/graph-node":117,"../support/inc-generation":118,"../support/invalidate-node":120,"../support/is-object":122,"../support/options":127,"../support/replace-node":130,"../support/treat-node-as-error":132,"../support/treat-node-as-missing-path-set":134,"../support/update-back-refs":136,"../support/update-graph":137,"../support/wrap-node":138,"../types/error":139,"../types/path":140,"../types/sentinel":141,"../walk/walk-path-set-soft-link":146}],101:[function(_dereq_,module,exports){
module.exports = set_json_values_as_json_sparse;

var $path = _dereq_("../types/path");
var $error = _dereq_("../types/error");
var $sentinel = _dereq_("../types/sentinel");

var clone = _dereq_("../support/clone-dense-json");
var array_clone = _dereq_("../support/array-clone");

var options = _dereq_("../support/options");
var walk_path_set = _dereq_("../walk/walk-path-set");

var is_object = _dereq_("../support/is-object");

var get_valid_key = _dereq_("../support/get-valid-key");
var create_branch = _dereq_("../support/create-branch");
var wrap_node = _dereq_("../support/wrap-node");
var invalidate_node = _dereq_("../support/invalidate-node");
var replace_node = _dereq_("../support/replace-node");
var graph_node = _dereq_("../support/graph-node");
var update_back_refs = _dereq_("../support/update-back-refs");
var update_graph = _dereq_("../support/update-graph");
var inc_generation = _dereq_("../support/inc-generation");

var node_as_miss = _dereq_("../support/treat-node-as-missing-path-set");
var node_as_error = _dereq_("../support/treat-node-as-error");
var clone_success = _dereq_("../support/clone-success-paths");

var collect = _dereq_("../lru/collect");

function set_json_values_as_json_sparse(model, pathvalues, values, error_selector) {

    var roots = options([], model, error_selector);
    var index = -1;
    var count = pathvalues.length;
    var nodes = roots.nodes;
    var parents = array_clone(nodes);
    var requested = [];
    var optimized = [];
    var json = values[0];
    var hasValue;

    roots[0] = roots.root;
    roots[3] = parents[3] = nodes[3] = json.json || (json.json = {});

    while (++index < count) {

        var pv = pathvalues[index];
        var pathset = pv.path;
        roots.value = pv.value;

        walk_path_set(onNode, onEdge, pathset, 0, roots, parents, nodes, requested, optimized);
    }

    hasValue = roots.hasValue;
    if(hasValue) {
        json.json = roots[3];
    } else {
        delete json.json;
    }

    collect(
        roots.lru,
        roots.expired,
        roots.version,
        roots.root.$size || 0,
        model._maxSize,
        model._collectRatio
    );

    return {
        values: values,
        errors: roots.errors,
        hasValue: hasValue,
        requestedPaths: roots.requestedPaths,
        optimizedPaths: roots.optimizedPaths,
        requestedMissingPaths: roots.requestedMissingPaths,
        optimizedMissingPaths: roots.optimizedMissingPaths
    };
}

function onNode(pathset, roots, parents, nodes, requested, optimized, is_top_level, is_branch, key, keyset, is_keyset) {

    var parent, json, jsonkey;

    if (key == null) {
        if ((key = get_valid_key(optimized)) == null) {
            return;
        }
        jsonkey = get_valid_key(requested);
        json = parents[3];
        parent = parents[0];
    } else {
        jsonkey = key;
        json = nodes[3];
        parent = nodes[0];
    }

    var node = parent[key],
        type;

    if (!is_top_level) {
        type = is_object(node) && node.$type || undefined;
        type = type && is_branch && "." || type;
        node = create_branch(roots, parent, node, type, key);
        parents[0] = parent;
        nodes[0] = node;
        return;
    }

    parents[3] = json;

    if (is_branch) {
        type = is_object(node) && node.$type || undefined;
        node = create_branch(roots, parent, node, type, key);
        parents[0] = parent;
        nodes[0] = node;
        nodes[3] = json[jsonkey] || (json[jsonkey] = {});
        return;
    }

    var selector = roots.error_selector;
    var root = roots[0];
    var size = is_object(node) && node.$size || 0;
    var mess = roots.value;

    if(mess === undefined && roots.headless) {
        invalidate_node(parent, node, key, roots.lru);
        update_graph(parent, size, roots.version, roots.lru);
        node = undefined;
    } else {
        type = is_object(mess) && mess.$type || undefined;
        mess = wrap_node(mess, type, !!type ? mess.value : mess);
        type || (type = $sentinel);

        if (type == $error && !!selector) {
            mess = selector(requested, mess);
        }

        node = replace_node(parent, node, mess, key, roots.lru);
        node = graph_node(root, parent, node, key, inc_generation());
        update_graph(parent, size - node.$size, roots.version, roots.lru);
    }
    nodes[0] = node;
}

function onEdge(pathset, depth, roots, parents, nodes, requested, optimized, key, keyset) {

    var json;
    var node = nodes[0];
    var type = is_object(node) && node.$type || (node = undefined);

    if (node_as_miss(roots, node, type, pathset, depth, requested, optimized) === false) {
        clone_success(roots, requested, optimized);
        if (node_as_error(roots, node, type, requested) === false) {
            if (keyset == null && !roots.hasValue && (keyset = get_valid_key(optimized)) == null) {
                node = clone(roots, node, type, node && node.value);
                json = roots[3];
                json.$type = node.$type;
                json.value = node.value;
            } else {
                json = parents[3];
                json[key] = clone(roots, node, type, node && node.value);
            }
            roots.hasValue = true;
        }
    }
}

},{"../lru/collect":86,"../support/array-clone":104,"../support/clone-dense-json":106,"../support/clone-success-paths":112,"../support/create-branch":114,"../support/get-valid-key":116,"../support/graph-node":117,"../support/inc-generation":118,"../support/invalidate-node":120,"../support/is-object":122,"../support/options":127,"../support/replace-node":130,"../support/treat-node-as-error":132,"../support/treat-node-as-missing-path-set":134,"../support/update-back-refs":136,"../support/update-graph":137,"../support/wrap-node":138,"../types/error":139,"../types/path":140,"../types/sentinel":141,"../walk/walk-path-set":147}],102:[function(_dereq_,module,exports){
module.exports = set_json_values_as_json_values;

var $error = _dereq_("../types/error");
var $sentinel = _dereq_("../types/sentinel");

var clone = _dereq_("../support/clone-dense-json");
var array_clone = _dereq_("../support/array-clone");

var options = _dereq_("../support/options");
var walk_path_set = _dereq_("../walk/walk-path-set");

var is_object = _dereq_("../support/is-object");

var get_valid_key = _dereq_("../support/get-valid-key");
var create_branch = _dereq_("../support/create-branch");
var wrap_node = _dereq_("../support/wrap-node");
var invalidate_node = _dereq_("../support/invalidate-node");
var replace_node = _dereq_("../support/replace-node");
var graph_node = _dereq_("../support/graph-node");
var update_back_refs = _dereq_("../support/update-back-refs");
var update_graph = _dereq_("../support/update-graph");
var inc_generation = _dereq_("../support/inc-generation");

var node_as_miss = _dereq_("../support/treat-node-as-missing-path-set");
var node_as_error = _dereq_("../support/treat-node-as-error");
var clone_success = _dereq_("../support/clone-success-paths");

var collect = _dereq_("../lru/collect");

function set_json_values_as_json_values(model, pathvalues, onNext, error_selector) {

    var roots = options([], model, error_selector);
    var index = -1;
    var count = pathvalues.length;
    var nodes = roots.nodes;
    var parents = array_clone(nodes);
    var requested = [];
    var optimized = [];

    roots[0] = roots.root;
    roots.onNext = onNext;

    while (++index < count) {
        var pv = pathvalues[index];
        var pathset = pv.path;
        roots.value = pv.value;
        walk_path_set(onNode, onEdge, pathset, 0, roots, parents, nodes, requested, optimized);
    }

    collect(
        roots.lru,
        roots.expired,
        roots.version,
        roots.root.$size || 0,
        model._maxSize,
        model._collectRatio
    );

    return {
        values: null,
        errors: roots.errors,
        requestedPaths: roots.requestedPaths,
        optimizedPaths: roots.optimizedPaths,
        requestedMissingPaths: roots.requestedMissingPaths,
        optimizedMissingPaths: roots.optimizedMissingPaths
    };
}

function onNode(pathset, roots, parents, nodes, requested, optimized, is_top_level, is_branch, key, keyset, is_keyset) {

    var parent;

    if (key == null) {
        if ((key = get_valid_key(optimized, nodes)) == null) {
            return;
        }
        parent = parents[0];
    } else {
        parent = nodes[0];
    }

    var node = parent[key], type;

    if (!is_top_level) {
        type = is_object(node) && node.$type || undefined;
        type = type && is_branch && "." || type;
        node = create_branch(roots, parent, node, type, key);
        parents[0] = parent;
        nodes[0] = node;
        return;
    }

    if (is_branch) {
        type = is_object(node) && node.$type || undefined;
        node = create_branch(roots, parent, node, type, key);
        parents[0] = parent;
        nodes[0] = node;
        return;
    }

    var selector = roots.error_selector;
    var root = roots[0];
    var size = is_object(node) && node.$size || 0;
    var mess = roots.value;
    
    if(mess === undefined && roots.headless) {
        invalidate_node(parent, node, key, roots.lru);
        update_graph(parent, size, roots.version, roots.lru);
        node = undefined;
    } else {
        type = is_object(mess) && mess.$type || undefined;
        mess = wrap_node(mess, type, !!type ? mess.value : mess);
        type || (type = $sentinel);

        if (type == $error && !!selector) {
            mess = selector(requested, mess);
        }

        node = replace_node(parent, node, mess, key, roots.lru);
        node = graph_node(root, parent, node, key, inc_generation());
        update_graph(parent, size - node.$size, roots.version, roots.lru);
    }
    nodes[0] = node;
}

function onEdge(pathset, depth, roots, parents, nodes, requested, optimized, key, keyset) {

    var node = nodes[0];
    var type = is_object(node) && node.$type || (node = undefined);

    if (node_as_miss(roots, node, type, pathset, depth, requested, optimized) === false) {
        clone_success(roots, requested, optimized);
        if (node_as_error(roots, node, type, requested) === false) {
            roots.onNext({
                path: array_clone(requested),
                value: clone(roots, node, type, node && node.value)
            });
        }
    }
}

},{"../lru/collect":86,"../support/array-clone":104,"../support/clone-dense-json":106,"../support/clone-success-paths":112,"../support/create-branch":114,"../support/get-valid-key":116,"../support/graph-node":117,"../support/inc-generation":118,"../support/invalidate-node":120,"../support/is-object":122,"../support/options":127,"../support/replace-node":130,"../support/treat-node-as-error":132,"../support/treat-node-as-missing-path-set":134,"../support/update-back-refs":136,"../support/update-graph":137,"../support/wrap-node":138,"../types/error":139,"../types/sentinel":141,"../walk/walk-path-set":147}],103:[function(_dereq_,module,exports){
module.exports = function(array, value) {
    var i = -1;
    var n = array.length;
    var array2 = new Array(n + 1);
    while(++i < n) { array2[i] = array[i]; }
    array2[i] = value;
    return array2;
};
},{}],104:[function(_dereq_,module,exports){
module.exports = function(array) {
    var i = -1;
    var n = array.length;
    var array2 = new Array(n);
    while(++i < n) { array2[i] = array[i]; }
    return array2;
};
},{}],105:[function(_dereq_,module,exports){
module.exports = function(array, index) {
    var i = -1;
    var n = array.length - index;
    var array2 = new Array(n);
    while(++i < n) { array2[i] = array[i + index]; }
    return array2;
};
},{}],106:[function(_dereq_,module,exports){
var $sentinel = _dereq_("../types/sentinel");
var clone = _dereq_("./clone");
module.exports = function(roots, node, type, value) {

    if(node == null || value === undefined) {
        return { $type: $sentinel };
    }

    if(roots.boxed == true) {
        return !!type && clone(node) || node;
    }

    return value;
}

},{"../types/sentinel":141,"./clone":113}],107:[function(_dereq_,module,exports){
var $sentinel = _dereq_("../types/sentinel");
var clone = _dereq_("./clone");
var is_primitive = _dereq_("./is-primitive");
module.exports = function(roots, node, type, value) {

    if(node == null || value === undefined) {
        return { $type: $sentinel };
    }

    if(roots.boxed == true) {
        return !!type && clone(node) || node;
    }

    if(!type || (type === $sentinel && is_primitive(value))) {
        return value;
    }

    return clone(node);
}

},{"../types/sentinel":141,"./clone":113,"./is-primitive":123}],108:[function(_dereq_,module,exports){
var clone_requested = _dereq_("./clone-requested-path");
var clone_optimized = _dereq_("./clone-optimized-path");
var walk_path_map   = _dereq_("../walk/walk-path-map-soft-link");
var is_object = _dereq_("./is-object");
var empty = [];

module.exports = function(roots, pathmap, keys_stack, depth, requested, optimized) {
    var patset_keys = explode_keys(pathmap, keys_stack.concat(), depth);
    var pathset = patset_keys.map(function(keys) {
        keys = keys.filter(function(key) { return key != "null"; });
        switch(keys.length) {
            case 0:
                return null;
            case 1:
                return keys[0];
            default:
                return keys;
        }
    });
    
    roots.requestedMissingPaths.push(clone_requested(roots.bound, requested, pathset, depth, roots.index));
    roots.optimizedMissingPaths.push(clone_optimized(optimized, pathset, depth));
}

function explode_keys(pathmap, keys_stack, depth) {
    if(is_object(pathmap)) {
        var keys = Object.keys(pathmap);
        var keys2 = keys_stack[depth] || (keys_stack[depth] = []);
        keys2.push.apply(keys2, keys);
        keys.forEach(function(key) {
            explode_keys(pathmap[key], keys_stack, depth + 1);
        });
    }
    return keys_stack;
}
},{"../walk/walk-path-map-soft-link":144,"./clone-optimized-path":110,"./clone-requested-path":111,"./is-object":122}],109:[function(_dereq_,module,exports){
var clone_requested_path = _dereq_("./clone-requested-path");
var clone_optimized_path = _dereq_("./clone-optimized-path");
module.exports = function(roots, pathset, depth, requested, optimized) {
    roots.requestedMissingPaths.push(clone_requested_path(roots.bound, requested, pathset, depth, roots.index));
    roots.optimizedMissingPaths.push(clone_optimized_path(optimized, pathset, depth));
}
},{"./clone-optimized-path":110,"./clone-requested-path":111}],110:[function(_dereq_,module,exports){
module.exports = function(optimized, pathset, depth) {
    var x;
    var i = -1;
    var j = depth - 1;
    var n = optimized.length;
    var m = pathset.length;
    var array2 = [];
    while(++i < n) {
        array2[i] = optimized[i];
    }
    while(++j < m) {
        if((x = pathset[j]) != null) {
            array2[i++] = x;
        }
    }
    return array2;
}
},{}],111:[function(_dereq_,module,exports){
var is_object = _dereq_("./is-object");
module.exports = function(bound, requested, pathset, depth, index) {
    var x;
    var i = -1;
    var j = -1;
    var l = 0;
    var m = requested.length;
    var n = bound.length;
    var array2 = [];
    while(++i < n) {
        array2[i] = bound[i];
    }
    while(++j < m) {
        if((x = requested[j]) != null) {
            if(is_object(pathset[l++])) {
                array2[i++] = [x];
            } else {
                array2[i++] = x;
            }
        }
    }
    m = n + l + pathset.length - depth;
    while(i < m) {
        array2[i++] = pathset[l++];
    }
    if(index != null) {
        array2.pathSetIndex = index;
    }
    return array2;
}
},{"./is-object":122}],112:[function(_dereq_,module,exports){
var array_slice = _dereq_("./array-slice");
var array_clone = _dereq_("./array-clone");
module.exports = function(roots, requested, optimized) {
    roots.requestedPaths.push(array_slice(requested, roots.offset));
    roots.optimizedPaths.push(array_clone(optimized));
}
},{"./array-clone":104,"./array-slice":105}],113:[function(_dereq_,module,exports){
var is_object = _dereq_("./is-object");
var prefix = _dereq_("../internal/prefix");

module.exports = function(value) {
    var dest = value, src = dest, i = -1, n, keys, key;
    if(is_object(dest)) {
        dest = {};
        keys = Object.keys(src);
        n = keys.length;
        while(++i < n) {
            key = keys[i];
            if(key[0] !== prefix) {
                dest[key] = src[key];
            }
        }
    }
    return dest;
}
},{"../internal/prefix":74,"./is-object":122}],114:[function(_dereq_,module,exports){
var $path = _dereq_("../types/path");
var $expired = "expired";
var replace_node = _dereq_("./replace-node");
var graph_node = _dereq_("./graph-node");
var update_back_refs = _dereq_("./update-back-refs");
var is_primitive = _dereq_("./is-primitive");
var is_expired = _dereq_("./is-expired");

module.exports = function(roots, parent, node, type, key) {

    if(!!type && is_expired(roots, node)) {
        type = $expired;
    }

    if((!!type && type != $path) || is_primitive(node)) {
        node = replace_node(parent, node, {}, key, roots.lru);
        node = graph_node(roots[0], parent, node, key, 0);
        node = update_back_refs(node, roots.version);
    }
    return node;
}

},{"../types/path":140,"./graph-node":117,"./is-expired":121,"./is-primitive":123,"./replace-node":130,"./update-back-refs":136}],115:[function(_dereq_,module,exports){
var __ref = _dereq_("../internal/ref");
var __context = _dereq_("../internal/context");
var __ref_index = _dereq_("../internal/ref-index");
var __refs_length = _dereq_("../internal/refs-length");

module.exports = function(node) {
    var ref, i = -1, n = node[__refs_length] || 0;
    while(++i < n) {
        if((ref = node[__ref + i]) !== undefined) {
            ref[__context] = ref[__ref_index] = node[__ref + i] = undefined;
        }
    }
    node[__refs_length] = undefined
}
},{"../internal/context":66,"../internal/ref":77,"../internal/ref-index":76,"../internal/refs-length":78}],116:[function(_dereq_,module,exports){
module.exports = function(path) {
    var key, index = path.length - 1;
    do {
        if((key = path[index]) != null) {
            return key;
        }
    } while(--index > -1);
    return null;
}
},{}],117:[function(_dereq_,module,exports){
var __parent = _dereq_("../internal/parent");
var __key = _dereq_("../internal/key");
var __generation = _dereq_("../internal/generation");

module.exports = function(root, parent, node, key, generation) {
    node[__parent] = parent;
    node[__key] = key;
    node[__generation] = generation;
    return node;
}
},{"../internal/generation":67,"../internal/key":70,"../internal/parent":73}],118:[function(_dereq_,module,exports){
var generation = 0;
module.exports = function() { return generation++; }
},{}],119:[function(_dereq_,module,exports){
var version = 0;
module.exports = function() { return version++; }
},{}],120:[function(_dereq_,module,exports){
module.exports = invalidate;

var is_object = _dereq_("./is-object");
var remove_node = _dereq_("./remove-node");
var prefix = _dereq_("../internal/prefix");

function invalidate(parent, node, key, lru) {
    if(remove_node(parent, node, key, lru)) {
        var type = is_object(node) && node.$type || undefined;
        if(type == null) {
            var keys = Object.keys(node);
            for(var i = -1, n = keys.length; ++i < n;) {
                var key = keys[i];
                if(key[0] !== prefix && key[0] !== "$") {
                    invalidate(node, node[key], key, lru);
                }
            }
        }
        return true;
    }
    return false;
}
},{"../internal/prefix":74,"./is-object":122,"./remove-node":129}],121:[function(_dereq_,module,exports){
var $expires_now = _dereq_("../values/expires-now");
var $expires_never = _dereq_("../values/expires-never");
var __invalidated = _dereq_("../internal/invalidated");
var now = _dereq_("./now");
var splice = _dereq_("../lru/splice");

module.exports = function(roots, node) {
    var expires = node.$expires;
    if((expires != null                            ) && (
        expires != $expires_never                  ) && (
        expires == $expires_now || expires < now()))    {
        if(!node[__invalidated]) {
            node[__invalidated] = true;
            roots.expired.push(node);
            splice(roots.lru, node);
        }
        return true;
    }
    return false;
}

},{"../internal/invalidated":69,"../lru/splice":88,"../values/expires-never":142,"../values/expires-now":143,"./now":126}],122:[function(_dereq_,module,exports){
var obj_typeof = "object";
module.exports = function(value) {
    return value != null && typeof value == obj_typeof;
}
},{}],123:[function(_dereq_,module,exports){
var obj_typeof = "object";
module.exports = function(value) {
    return value == null || typeof value != obj_typeof;
}
},{}],124:[function(_dereq_,module,exports){
module.exports = key_to_keyset;

var __offset = _dereq_("../internal/offset");
var is_array = Array.isArray;
var is_object = _dereq_("./is-object");

function key_to_keyset(key, iskeyset) {
    if(iskeyset) {
        if(is_array(key)) {
            key = key[key[__offset]];
            return key_to_keyset(key, is_object(key));
        } else {
            return key[__offset];
        }
    }
    return key;
}


},{"../internal/offset":72,"./is-object":122}],125:[function(_dereq_,module,exports){

var $self = "./";
var $path = _dereq_("../types/path");
var $sentinel = _dereq_("../types/sentinel");
var $expires_now = _dereq_("../values/expires-now");

var is_object = _dereq_("./is-object");
var is_primitive = _dereq_("./is-primitive");
var is_expired = _dereq_("./is-expired");
var promote = _dereq_("../lru/promote");
var wrap_node = _dereq_("./wrap-node");
var graph_node = _dereq_("./graph-node");
var replace_node = _dereq_("../support/replace-node");
var update_graph  = _dereq_("../support/update-graph");
var inc_generation = _dereq_("./inc-generation");
var invalidate_node = _dereq_("./invalidate-node");

module.exports = function(roots, parent, node, messageParent, message, key) {

    var type, messageType, node_is_object, message_is_object;

    // If the cache and message are the same, we can probably return early:
    // - If they're both null, return null.
    // - If they're both branches, return the branch.
    // - If they're both edges, continue below.
    if(node == message) {
        if(node == null) {
            return null;
        } else if(node_is_object = is_object(node)) {
            type = node.$type;
            if(type == null) {
                if(node[$self] == null) {
                    return graph_node(roots[0], parent, node, key, 0);
                }
                return node;
            }
        }
    } else if(node_is_object = is_object(node)) {
        type = node.$type;
    }

    var value, messageValue;

    if(type == $path) {
        if(message == null) {
            // If the cache is an expired reference, but the message
            // is empty, remove the cache value and return undefined
            // so we build a missing path.
            if(is_expired(roots, node)) {
                invalidate_node(parent, node, key, roots.lru);
                return undefined;
            }
            // If the cache has a reference and the message is empty,
            // leave the cache alone and follow the reference.
            return node;
        } else if(message_is_object = is_object(message)) {
            messageType = message.$type;
            // If the cache and the message are both references,
            // check if we need to replace the cache reference.
            if(messageType == $path) {
                if(node === message) {
                    // If the cache and message are the same reference,
                    // we performed a whole-branch merge of one of the
                    // grandparents. If we've previously graphed this
                    // reference, break early.
                    if(node[$self] != null) {
                        return node;
                    }
                }
                // If the message doesn't expire immediately and is newer than the
                // cache (or either cache or message don't have timestamps), attempt
                // to use the message value.
                // Note: Number and `undefined` compared LT/GT to `undefined` is `false`.
                else if((
                    is_expired(roots, message) === false) && ((
                    message.$timestamp < node.$timestamp) === false)) {

                    // Compare the cache and message references.
                    // - If they're the same, break early so we don't insert.
                    // - If they're different, replace the cache reference.

                    value = node.value;
                    messageValue = message.value;

                    var count = value.length;

                    // If the reference lengths are equal, check their keys for equality.
                    if(count === messageValue.length) {
                        while(--count > -1) {
                            // If any of their keys are different, replace the reference
                            // in the cache with the reference in the message.
                            if(value[count] !== messageValue[count]) {
                                break;
                            }
                        }
                        // If all their keys are equal, leave the cache value alone.
                        if(count === -1) {
                            return node;
                        }
                    }
                }
            }
        }
    } else {
        if(message_is_object = is_object(message)) {
            messageType = message.$type;
        }
        if(node_is_object && !type) {
            // Otherwise if the cache is a branch and the message is either
            // null or also a branch, continue with the cache branch.
            if(message == null || (message_is_object && !messageType)) {
                return node;
            }
        }
    }

    // If the message is an expired edge, report it back out so we don't build a missing path, but
    // don't insert it into the cache. If a value exists in the cache that didn't come from a
    // whole-branch grandparent merge, remove the cache value.
    if(!!messageType && !!message[$self] && is_expired(roots, message)) {
        if(node_is_object && node != message) {
            invalidate_node(parent, node, key, roots.lru);
        }
        return message;
    }
    // If the cache is a value, but the message is a branch, merge the branch over the value.
    else if(!!type && message_is_object && !messageType) {
        node = replace_node(parent, node, message, key, roots.lru);
        return graph_node(roots[0], parent, node, key, 0);
    }
    // If the message is a value, insert it into the cache.
    else if(!message_is_object || !!messageType) {
        var offset = 0;
        // If we've arrived at this message value, but didn't perform a whole-branch merge
        // on one of its ancestors, replace the cache node with the message value.
        if(node != message) {
            messageValue || (messageValue = !!messageType ? message.value : message);
            message = wrap_node(message, messageType, messageValue);

            var size = node_is_object && node.$size || 0;
            var messageSize = message.$size;
            offset = size - messageSize;

            node = replace_node(parent, node, message, key, roots.lru);
            update_graph(parent, offset, roots.version, roots.lru);
            node = graph_node(roots[0], parent, node, key, inc_generation());
        }
        // If the cache and the message are the same value, we branch-merged one of its
        // ancestors. Give the message a $size and $type, attach its graph pointers, and
        // update the cache sizes and generations.
        else if(node_is_object && node[$self] == null) {
            node = parent[key] = wrap_node(node, type, node.value);
            offset = -node.$size;
            update_graph(parent, offset, roots.version, roots.lru);
            node = graph_node(roots[0], parent, node, key, inc_generation());
        }
        // Otherwise, cache and message are the same primitive value. Wrap in a sentinel and insert.
        else {
            node = parent[key] = wrap_node(node, type, node);
            offset = -node.$size;
            update_graph(parent, offset, roots.version, roots.lru);
            node = graph_node(roots[0], parent, node, key, inc_generation());
        }
        // If the node is already expired, return undefined to build a missing path.
        // if(is_expired(roots, node)) {
        //     return undefined;
        // }

        // Promote the message edge in the LRU.
        promote(roots.lru, node);
    }
    // If we get here, the cache is empty and the message is a branch.
    // Merge the whole branch over.
    else if(node == null) {
        node = parent[key] = graph_node(roots[0], parent, message, key, 0);
    }

    return node;
}

},{"../lru/promote":87,"../support/replace-node":130,"../support/update-graph":137,"../types/path":140,"../types/sentinel":141,"../values/expires-now":143,"./graph-node":117,"./inc-generation":118,"./invalidate-node":120,"./is-expired":121,"./is-object":122,"./is-primitive":123,"./wrap-node":138}],126:[function(_dereq_,module,exports){
module.exports = Date.now;
},{}],127:[function(_dereq_,module,exports){
var inc_version = _dereq_("../support/inc-version");
var getBoundValue = _dereq_('../get/getBoundValue');

module.exports = function(options, model, error_selector) {
    
    var bound = options.bound     || (options.bound                 = model._path || []);
    var root  = options.root      || (options.root                  = model._cache);
    var nodes = options.nodes     || (options.nodes                 = []);
    var lru   = options.lru       || (options.lru                   = model._root);
    options.expired               || (options.expired               = lru.expired);
    options.errors                || (options.errors                = []);
    options.requestedPaths        || (options.requestedPaths        = []);
    options.optimizedPaths        || (options.optimizedPaths        = []);
    options.requestedMissingPaths || (options.requestedMissingPaths = []);
    options.optimizedMissingPaths || (options.optimizedMissingPaths = []);
    options.boxed  = model._boxed || false;
    options.materialized = model._materialized;
    options.errorsAsValues = model._treatErrorsAsValues || false;
    options.headless = model._dataSource == null;
    options.version = inc_version();
    
    options.offset || (options.offset = 0);
    options.error_selector = error_selector || model._errorSelector;
    
    if(bound.length) {
        nodes[0] = getBoundValue(model, bound).value;
    } else {
        nodes[0] = root;
    }
    
    return options;
};
},{"../get/getBoundValue":49,"../support/inc-version":119}],128:[function(_dereq_,module,exports){
module.exports = permute_keyset;

var __offset = _dereq_("../internal/offset");
var is_array = Array.isArray;
var is_object = _dereq_("./is-object");

function permute_keyset(key) {
    if(is_array(key)) {
        
        if(key[__offset] === undefined) {
            key[__offset] = -1;
            if(key.length == 0) {
                return false;
            }
        }
        if(++key[__offset] >= key.length) {
            return permute_keyset(key[key[__offset] = -1]);
        } else {
            return true;
        }
    } else if(is_object(key)) {
        if(key[__offset] === undefined) {
            key[__offset] = (key.from || (key.from = 0)) - 1;
            if(key.to === undefined) {
                if(key.length === undefined) {
                    throw new Error("Range keysets must specify at least one index to retrieve.");
                } else if(key.length === 0) {
                    return false;
                }
                key.to = key.from + (key.length || 1) - 1;
            }
        }
        
        if(++key[__offset] > key.to) {
            key[__offset] = key.from - 1;
            return false;
        }
        
        return true;
    }
    
    return false;
}


},{"../internal/offset":72,"./is-object":122}],129:[function(_dereq_,module,exports){
var $path = _dereq_("../types/path");
var __parent = _dereq_("../internal/parent");
var unlink = _dereq_("./unlink");
var delete_back_refs = _dereq_("./delete-back-refs");
var splice = _dereq_("../lru/splice");
var is_object = _dereq_("./is-object");

module.exports = function(parent, node, key, lru) {
    if(is_object(node)) {
        var type  = node.$type;
        if(!!type) {
            if(type == $path) { unlink(node); }
            splice(lru, node);
        }
        delete_back_refs(node);
        parent[key] = node[__parent] = undefined;
        return true;
    }
    return false;
}

},{"../internal/parent":73,"../lru/splice":88,"../types/path":140,"./delete-back-refs":115,"./is-object":122,"./unlink":135}],130:[function(_dereq_,module,exports){
var transfer_back_refs = _dereq_("./transfer-back-refs");
var invalidate_node = _dereq_("./invalidate-node");

module.exports = function(parent, node, replacement, key, lru) {
    if(node != null && node !== replacement && typeof node == "object") {
        transfer_back_refs(node, replacement);
        invalidate_node(parent, node, key, lru);
    }
    return parent[key] = replacement;
}
},{"./invalidate-node":120,"./transfer-back-refs":131}],131:[function(_dereq_,module,exports){
var __ref = _dereq_("../internal/ref");
var __context = _dereq_("../internal/context");
var __refs_length = _dereq_("../internal/refs-length");

module.exports = function(node, dest) {
    var nodeRefsLength = node[__refs_length] || 0,
        destRefsLength = dest[__refs_length] || 0,
        i = -1, ref;
    while(++i < nodeRefsLength) {
        ref = node[__ref + i];
        if(ref !== undefined) {
            ref[__context] = dest;
            dest[__ref + (destRefsLength + i)] = ref;
            node[__ref + i] = undefined;
        }
    }
    dest[__refs_length] = nodeRefsLength + destRefsLength;
    node[__refs_length] = ref = undefined;
}
},{"../internal/context":66,"../internal/ref":77,"../internal/refs-length":78}],132:[function(_dereq_,module,exports){
var $error = _dereq_("../types/error");
var promote = _dereq_("../lru/promote");
var array_clone = _dereq_("./array-clone");
module.exports = function(roots, node, type, path) {
    if(node == null) {
        return false;
    }
    promote(roots.lru, node);
    if(type != $error || roots.errorsAsValues) {
        return false;
    }
    roots.errors.push({ path: array_clone(path), value: node.value });
    return true;
};

},{"../lru/promote":87,"../types/error":139,"./array-clone":104}],133:[function(_dereq_,module,exports){
var $sentinel = _dereq_("../types/sentinel");
var clone_misses = _dereq_("./clone-missing-path-maps");
var is_expired = _dereq_("./is-expired");

module.exports = function(roots, node, type, pathmap, keys_stack, depth, requested, optimized) {
    var dematerialized = !roots.materialized;
    if(node == null && dematerialized) {
        clone_misses(roots, pathmap, keys_stack, depth, requested, optimized);
        return true;
    } else if(!!type) {
        if(type == $sentinel && node.value === undefined && dematerialized && !roots.boxed) {
            return true;
        } else if(is_expired(roots, node)) {
            clone_misses(roots, pathmap, keys_stack, depth, requested, optimized);
            return true;
        }
    }
    return false;
};
},{"../types/sentinel":141,"./clone-missing-path-maps":108,"./is-expired":121}],134:[function(_dereq_,module,exports){
var $sentinel = _dereq_("../types/sentinel");
var clone_misses = _dereq_("./clone-missing-path-sets");
var is_expired = _dereq_("./is-expired");

module.exports = function(roots, node, type, pathset, depth, requested, optimized) {
    var dematerialized = !roots.materialized;
    if(node == null && dematerialized) {
        clone_misses(roots, pathset, depth, requested, optimized);
        return true;
    } else if(!!type) {
        if(type == $sentinel && node.value === undefined && dematerialized && !roots.boxed) {
            return true;
        } else if(is_expired(roots, node)) {
            clone_misses(roots, pathset, depth, requested, optimized);
            return true;
        }
    }
    return false;
};

},{"../types/sentinel":141,"./clone-missing-path-sets":109,"./is-expired":121}],135:[function(_dereq_,module,exports){
var __ref = _dereq_("../internal/ref");
var __context = _dereq_("../internal/context");
var __ref_index = _dereq_("../internal/ref-index");
var __refs_length = _dereq_("../internal/refs-length");

module.exports = function(ref) {
    var destination = ref[__context];
    if(destination) {
        var i = (ref[__ref_index] || 0) - 1,
            n = (destination[__refs_length] || 0) - 1;
        while(++i <= n) {
            destination[__ref + i] = destination[__ref + (i + 1)];
        }
        destination[__refs_length] = n;
        ref[__ref_index] = ref[__context] = destination = undefined;
    }
}
},{"../internal/context":66,"../internal/ref":77,"../internal/ref-index":76,"../internal/refs-length":78}],136:[function(_dereq_,module,exports){
module.exports = update_back_refs;

var __ref = _dereq_("../internal/ref");
var __parent = _dereq_("../internal/parent");
var __version = _dereq_("../internal/version");
var __generation = _dereq_("../internal/generation");
var __refs_length = _dereq_("../internal/refs-length");

var generation = _dereq_("./inc-generation");

function update_back_refs(node, version) {
    if(node && node[__version] !== version) {
        node[__version] = version;
        node[__generation] = generation();
        update_back_refs(node[__parent], version);
        var i = -1, n = node[__refs_length] || 0;
        while(++i < n) {
            update_back_refs(node[__ref + i], version);
        }
    }
    return node;
}

},{"../internal/generation":67,"../internal/parent":73,"../internal/ref":77,"../internal/refs-length":78,"../internal/version":80,"./inc-generation":118}],137:[function(_dereq_,module,exports){
var __key = _dereq_("../internal/key");
var __version = _dereq_("../internal/version");
var __parent = _dereq_("../internal/parent");
var remove_node = _dereq_("./remove-node");
var update_back_refs = _dereq_("./update-back-refs");

module.exports = function(node, offset, version, lru) {
    var child;
    while(child = node) {
        node = child[__parent];
        if((child.$size = (child.$size || 0) - offset) <= 0 && node != null) {
            remove_node(node, child, child[__key], lru);
        } else if(child[__version] !== version) {
            update_back_refs(child, version);
        }
    }
}
},{"../internal/key":70,"../internal/parent":73,"../internal/version":80,"./remove-node":129,"./update-back-refs":136}],138:[function(_dereq_,module,exports){
var $path = _dereq_("../types/path");
var $error = _dereq_("../types/error");
var $sentinel = _dereq_("../types/sentinel");

var now = _dereq_("./now");
var clone = _dereq_("./clone");
var is_array = Array.isArray;
var is_object = _dereq_("./is-object");

module.exports = function(node, type, value) {

    var dest = node, size = 0;

    if(!!type) {
        dest = clone(node);
        size = dest.$size;
    // }
    // if(type == $path) {
    //     dest = clone(node);
    //     size = 50 + (value.length || 1);
    // } else if(is_object(node) && (type || (type = node.$type))) {
    //     dest = clone(node);
    //     size = dest.$size;
    } else {
        dest = { value: value };
        type = $sentinel;
    }

    if(size <= 0 || size == null) {
        switch(typeof value) {
            case "number":
            case "boolean":
            case "function":
            case "undefined":
                size = 51;
                break;
            case "object":
                size = is_array(value) && (50 + value.length) || 51;
                break;
            case "string":
                size = 50 + value.length;
                break;
        }
    }

    var expires = is_object(node) && node.$expires || undefined;
    if(typeof expires === "number" && expires < 0) {
        dest.$expires = now() + (expires * -1);
    }

    dest.$type = type;
    dest.$size = size;

    return dest;
}

},{"../types/error":139,"../types/path":140,"../types/sentinel":141,"./clone":113,"./is-object":122,"./now":126}],139:[function(_dereq_,module,exports){
module.exports = "error";
},{}],140:[function(_dereq_,module,exports){
module.exports = "ref";
},{}],141:[function(_dereq_,module,exports){
module.exports = "sentinel";
},{}],142:[function(_dereq_,module,exports){
module.exports = 1;
},{}],143:[function(_dereq_,module,exports){
module.exports = 0;
},{}],144:[function(_dereq_,module,exports){
module.exports = walk_path_map;

var prefix = _dereq_("../internal/prefix");
var $path = _dereq_("../types/path");

var walk_reference = _dereq_("./walk-reference");

var array_slice = _dereq_("../support/array-slice");
var array_clone    = _dereq_("../support/array-clone");
var array_append   = _dereq_("../support/array-append");

var is_expired = _dereq_("../support/is-expired");
var is_primitive = _dereq_("../support/is-primitive");
var is_object = _dereq_("../support/is-object");
var is_array = Array.isArray;

var promote = _dereq_("../lru/promote");

function walk_path_map(onNode, onEdge, pathmap, keys_stack, depth, roots, parents, nodes, requested, optimized, key, keyset, is_keyset) {
    
    var node = nodes[0];
    
    if(is_primitive(pathmap) || is_primitive(node)) {
        return onEdge(pathmap, keys_stack, depth, roots, parents, nodes, requested, optimized, key, keyset);
    }
    
    var type = node.$type;
    
    while(type === $path) {
        
        if(is_expired(roots, node)) {
            nodes[0] = undefined;
            return onEdge(pathmap, keys_stack, depth, roots, parents, nodes, requested, optimized, key, keyset);
        }
        
        promote(roots.lru, node);
        
        var container = node;
        var reference = node.value;
        
        nodes[0] = parents[0] = roots[0];
        nodes[1] = parents[1] = roots[1];
        nodes[2] = parents[2] = roots[2];
        
        walk_reference(onNode, container, reference, roots, parents, nodes, requested, optimized);
        
        node = nodes[0];
        
        if(node == null) {
            return onEdge(pathmap, keys_stack, depth, roots, parents, nodes, requested, optimized, key, keyset);
        } else if(is_primitive(node) || ((type = node.$type) && type != $path)) {
            onNode(pathmap, roots, parents, nodes, requested, optimized, true, null, keyset, false);
            return onEdge(pathmap, keys_stack, depth, roots, parents, nodes, array_append(requested, null), optimized, key, keyset);
        }
    }
    
    if(type != null) {
        return onEdge(pathmap, keys_stack, depth, roots, parents, nodes, requested, optimized, key, keyset);
    }
    
    var keys = keys_stack[depth] = Object.keys(pathmap);
    
    if(keys.length == 0) {
        return onEdge(pathmap, keys_stack, depth, roots, parents, nodes, requested, optimized, key, keyset);
    }
    
    var is_outer_keyset = keys.length > 1;
    
    for(var i = -1, n = keys.length; ++i < n;) {
        
        var inner_key = keys[i];
        
        if((inner_key[0] === prefix) || (inner_key[0] === "$")) {
            continue;
        }
        
        var inner_keyset = is_outer_keyset ? inner_key : keyset;
        var nodes2 = array_clone(nodes);
        var parents2 = array_clone(parents);
        var pathmap2 = pathmap[inner_key];
        var requested2, optimized2, is_branch;
        var has_child_key = false;
        
        var is_branch = is_object(pathmap2) && !pathmap2.$type;// && !is_array(pathmap2);
        if(is_branch) {
            for(child_key in pathmap2) {
                if((child_key[0] === prefix) || (child_key[0] === "$")) {
                    continue;
                }
                child_key = pathmap2.hasOwnProperty(child_key);
                break;
            }
            is_branch = child_key === true;
        }
        
        if(inner_key == "null") {
            requested2 = array_append(requested, null);
            optimized2 = array_clone(optimized);
            inner_key  = key;
            inner_keyset = keyset;
            pathmap2 = pathmap;
            onNode(pathmap2, roots, parents2, nodes2, requested2, optimized2, true, is_branch, null, inner_keyset, false);
        } else {
            requested2 = array_append(requested, inner_key);
            optimized2 = array_append(optimized, inner_key);
            onNode(pathmap2, roots, parents2, nodes2, requested2, optimized2, true, is_branch, inner_key, inner_keyset, is_outer_keyset);
        }
        
        if(is_branch) {
            walk_path_map(onNode, onEdge,
                pathmap2, keys_stack, depth + 1,
                roots, parents2, nodes2,
                requested2, optimized2,
                inner_key, inner_keyset, is_outer_keyset
            );
        } else {
            onEdge(pathmap2, keys_stack, depth, roots, parents2, nodes2, requested2, optimized2, inner_key, inner_keyset);
        }
    }
}

},{"../internal/prefix":74,"../lru/promote":87,"../support/array-append":103,"../support/array-clone":104,"../support/array-slice":105,"../support/is-expired":121,"../support/is-object":122,"../support/is-primitive":123,"../types/path":140,"./walk-reference":148}],145:[function(_dereq_,module,exports){
module.exports = walk_path_map;

var prefix = _dereq_("../internal/prefix");
var __context = _dereq_("../internal/context");
var $path = _dereq_("../types/path");

var walk_reference = _dereq_("./walk-reference");

var array_slice = _dereq_("../support/array-slice");
var array_clone    = _dereq_("../support/array-clone");
var array_append   = _dereq_("../support/array-append");

var is_expired = _dereq_("../support/is-expired");
var is_primitive = _dereq_("../support/is-primitive");
var is_object = _dereq_("../support/is-object");
var is_array = Array.isArray;

var promote = _dereq_("../lru/promote");

function walk_path_map(onNode, onEdge, pathmap, keys_stack, depth, roots, parents, nodes, requested, optimized, key, keyset, is_keyset) {
    
    var node = nodes[0];
    
    if(is_primitive(pathmap) || is_primitive(node)) {
        return onEdge(pathmap, keys_stack, depth, roots, parents, nodes, requested, optimized, key, keyset);
    }
    
    var type = node.$type;
    
    while(type === $path) {
        
        if(is_expired(roots, node)) {
            nodes[0] = undefined;
            return onEdge(pathmap, keys_stack, depth, roots, parents, nodes, requested, optimized, key, keyset);
        }
        
        promote(roots.lru, node);
        
        var container = node;
        var reference = node.value;
        node = node[__context];
        
        if(node != null) {
            type = node.$type;
            optimized = array_clone(reference);
            nodes[0] = node;
        } else {
            
            nodes[0] = parents[0] = roots[0];
            
            walk_reference(onNode, container, reference, roots, parents, nodes, requested, optimized);
            
            node = nodes[0];
            
            if(node == null) {
                return onEdge(pathmap, keys_stack, depth, roots, parents, nodes, requested, optimized, key, keyset);
            } else if(is_primitive(node) || ((type = node.$type) && type != $path)) {
                onNode(pathmap, roots, parents, nodes, requested, optimized, true, null, keyset, false);
                return onEdge(pathmap, keys_stack, depth, roots, parents, nodes, array_append(requested, null), optimized, key, keyset);
            }
        }
    }
    
    if(type != null) {
        return onEdge(pathmap, keys_stack, depth, roots, parents, nodes, requested, optimized, key, keyset);
    }
    
    var keys = keys_stack[depth] = Object.keys(pathmap);
    
    if(keys.length == 0) {
        return onEdge(pathmap, keys_stack, depth, roots, parents, nodes, requested, optimized, key, keyset);
    }
    
    var is_outer_keyset = keys.length > 1;
    
    for(var i = -1, n = keys.length; ++i < n;) {
        
        var inner_key = keys[i];
        
        if((inner_key[0] === prefix) || (inner_key[0] === "$")) {
            continue;
        }
        
        var inner_keyset = is_outer_keyset ? inner_key : keyset;
        var nodes2 = array_clone(nodes);
        var parents2 = array_clone(parents);
        var pathmap2 = pathmap[inner_key];
        var requested2, optimized2, is_branch;
        var child_key = false;
        
        var is_branch = is_object(pathmap2) && !pathmap2.$type;// && !is_array(pathmap2);
        if(is_branch) {
            for(child_key in pathmap2) {
                if((child_key[0] === prefix) || (child_key[0] === "$")) {
                    continue;
                }
                child_key = pathmap2.hasOwnProperty(child_key);
                break;
            }
            is_branch = child_key === true;
        }
        
        if(inner_key == "null") {
            requested2 = array_append(requested, null);
            optimized2 = array_clone(optimized);
            inner_key  = key;
            inner_keyset = keyset;
            pathmap2 = pathmap;
            onNode(pathmap2, roots, parents2, nodes2, requested2, optimized2, true, is_branch, null, inner_keyset, false);
        } else {
            requested2 = array_append(requested, inner_key);
            optimized2 = array_append(optimized, inner_key);
            onNode(pathmap2, roots, parents2, nodes2, requested2, optimized2, true, is_branch, inner_key, inner_keyset, is_outer_keyset);
        }
        
        if(is_branch) {
            walk_path_map(onNode, onEdge,
                pathmap2, keys_stack, depth + 1,
                roots, parents2, nodes2,
                requested2, optimized2,
                inner_key, inner_keyset, is_outer_keyset
            );
        } else {
            onEdge(pathmap2, keys_stack, depth, roots, parents2, nodes2, requested2, optimized2, inner_key, inner_keyset);
        }
    }
}

},{"../internal/context":66,"../internal/prefix":74,"../lru/promote":87,"../support/array-append":103,"../support/array-clone":104,"../support/array-slice":105,"../support/is-expired":121,"../support/is-object":122,"../support/is-primitive":123,"../types/path":140,"./walk-reference":148}],146:[function(_dereq_,module,exports){
module.exports = walk_path_set;

var $path = _dereq_("../types/path");
var empty_array = new Array(0);

var walk_reference = _dereq_("./walk-reference");

var array_slice    = _dereq_("../support/array-slice");
var array_clone    = _dereq_("../support/array-clone");
var array_append   = _dereq_("../support/array-append");

var is_expired = _dereq_("../support/is-expired");
var is_primitive = _dereq_("../support/is-primitive");
var is_object = _dereq_("../support/is-object");

var keyset_to_key  = _dereq_("../support/keyset-to-key");
var permute_keyset = _dereq_("../support/permute-keyset");

var promote = _dereq_("../lru/promote");

function walk_path_set(onNode, onEdge, pathset, depth, roots, parents, nodes, requested, optimized, key, keyset, is_keyset) {

    var node = nodes[0];

    if(depth >= pathset.length || is_primitive(node)) {
        return onEdge(pathset, depth, roots, parents, nodes, requested, optimized, key, keyset);
    }

    var type = node.$type;

    while(type === $path) {

        if(is_expired(roots, node)) {
            nodes[0] = undefined;
            return onEdge(pathset, depth, roots, parents, nodes, requested, optimized, key, keyset);
        }
        
        promote(roots.lru, node);
        
        var container = node;
        var reference = node.value;

        nodes[0] = parents[0] = roots[0];
        nodes[1] = parents[1] = roots[1];
        nodes[2] = parents[2] = roots[2];

        walk_reference(onNode, container, reference, roots, parents, nodes, requested, optimized);

        node = nodes[0];

        if(node == null) {
            return onEdge(pathset, depth, roots, parents, nodes, requested, optimized, key, keyset);
        } else if(is_primitive(node) || ((type = node.$type) && type != $path)) {
            onNode(pathset, roots, parents, nodes, requested, optimized, true, false, null, keyset, false);
            return onEdge(pathset, depth, roots, parents, nodes, array_append(requested, null), optimized, key, keyset);
        }
    }

    if(type != null) {
        return onEdge(pathset, depth, roots, parents, nodes, requested, optimized, key, keyset);
    }

    var outer_key = pathset[depth];
    var is_outer_keyset = is_object(outer_key);
    var is_branch = depth < pathset.length - 1;
    var run_once = false;
    
    while(is_outer_keyset && permute_keyset(outer_key) && (run_once = true) || (run_once = !run_once)) {
        var inner_key, inner_keyset;

        if(is_outer_keyset === true) {
            inner_key = keyset_to_key(outer_key, true);
            inner_keyset = inner_key;
        } else {
            inner_key = outer_key;
            inner_keyset = keyset;
        }

        var nodes2 = array_clone(nodes);
        var parents2 = array_clone(parents);
        var requested2, optimized2;

        if(inner_key == null) {
            requested2 = array_append(requested, null);
            optimized2 = array_clone(optimized);
            // optimized2 = optimized;
            inner_key = key;
            inner_keyset = keyset;
            onNode(pathset, roots, parents2, nodes2, requested2, optimized2, true, is_branch, null, inner_keyset, false);
        } else {
            requested2 = array_append(requested, inner_key);
            optimized2 = array_append(optimized, inner_key);
            onNode(pathset, roots, parents2, nodes2, requested2, optimized2, true, is_branch, inner_key, inner_keyset, is_outer_keyset);
        }

        walk_path_set(onNode, onEdge,
            pathset, depth + 1,
            roots, parents2, nodes2,
            requested2, optimized2,
            inner_key, inner_keyset, is_outer_keyset
        );
    }
}
},{"../lru/promote":87,"../support/array-append":103,"../support/array-clone":104,"../support/array-slice":105,"../support/is-expired":121,"../support/is-object":122,"../support/is-primitive":123,"../support/keyset-to-key":124,"../support/permute-keyset":128,"../types/path":140,"./walk-reference":148}],147:[function(_dereq_,module,exports){
module.exports = walk_path_set;

var prefix = _dereq_("../internal/prefix");
var __context = _dereq_("../internal/context");
var $path = _dereq_("../types/path");
var empty_array = new Array(0);

var walk_reference = _dereq_("./walk-reference");

var array_slice    = _dereq_("../support/array-slice");
var array_clone    = _dereq_("../support/array-clone");
var array_append   = _dereq_("../support/array-append");

var is_expired = _dereq_("../support/is-expired");
var is_primitive = _dereq_("../support/is-primitive");
var is_object = _dereq_("../support/is-object");

var keyset_to_key  = _dereq_("../support/keyset-to-key");
var permute_keyset = _dereq_("../support/permute-keyset");

var promote = _dereq_("../lru/promote");

function walk_path_set(onNode, onEdge, pathset, depth, roots, parents, nodes, requested, optimized, key, keyset, is_keyset) {

    var node = nodes[0];

    if(depth >= pathset.length || is_primitive(node)) {
        return onEdge(pathset, depth, roots, parents, nodes, requested, optimized, key, keyset);
    }

    var type = node.$type;

    while(type === $path) {

        if(is_expired(roots, node)) {
            nodes[0] = undefined;
            return onEdge(pathset, depth, roots, parents, nodes, requested, optimized, key, keyset);
        }
        
        promote(roots.lru, node);
        
        var container = node;
        var reference = node.value;
        node = node[__context];

        if(node != null) {
            type = node.$type;
            optimized = array_clone(reference);
            nodes[0]  = node;
        } else {

            nodes[0] = parents[0] = roots[0];
            // nodes[1] = parents[1] = roots[1];
            // nodes[2] = parents[2] = roots[2];

            walk_reference(onNode, container, reference, roots, parents, nodes, requested, optimized);

            node = nodes[0];

            if(node == null) {
                return onEdge(pathset, depth, roots, parents, nodes, requested, optimized, key, keyset);
            } else if(is_primitive(node) || ((type = node.$type) && type != $path)) {
                onNode(pathset, roots, parents, nodes, requested, optimized, true, false, null, keyset, false);
                return onEdge(pathset, depth, roots, parents, nodes, array_append(requested, null), optimized, key, keyset);
            }
        }
    }

    if(type != null) {
        return onEdge(pathset, depth, roots, parents, nodes, requested, optimized, key, keyset);
    }

    var outer_key = pathset[depth];
    var is_outer_keyset = is_object(outer_key);
    var is_branch = depth < pathset.length - 1;
    var run_once = false;
    
    while(is_outer_keyset && permute_keyset(outer_key) && (run_once = true) || (run_once = !run_once)) {
        
        var inner_key, inner_keyset;

        if(is_outer_keyset === true) {
            inner_key = keyset_to_key(outer_key, true);
            inner_keyset = inner_key;
        } else {
            inner_key = outer_key;
            inner_keyset = keyset;
        }

        var nodes2 = array_clone(nodes);
        var parents2 = array_clone(parents);
        var requested2, optimized2;

        if(inner_key == null) {
            requested2 = array_append(requested, null);
            optimized2 = array_clone(optimized);
            // optimized2 = optimized;
            inner_key = key;
            inner_keyset = keyset;
            onNode(pathset, roots, parents2, nodes2, requested2, optimized2, true, is_branch, null, inner_keyset, false);
        } else {
            requested2 = array_append(requested, inner_key);
            optimized2 = array_append(optimized, inner_key);
            onNode(pathset, roots, parents2, nodes2, requested2, optimized2, true, is_branch, inner_key, inner_keyset, is_outer_keyset);
        }

        walk_path_set(onNode, onEdge,
            pathset, depth + 1,
            roots, parents2, nodes2,
            requested2, optimized2,
            inner_key, inner_keyset, is_outer_keyset
        );
    }
}

},{"../internal/context":66,"../internal/prefix":74,"../lru/promote":87,"../support/array-append":103,"../support/array-clone":104,"../support/array-slice":105,"../support/is-expired":121,"../support/is-object":122,"../support/is-primitive":123,"../support/keyset-to-key":124,"../support/permute-keyset":128,"../types/path":140,"./walk-reference":148}],148:[function(_dereq_,module,exports){
module.exports = walk_reference;

var prefix = _dereq_("../internal/prefix");
var __ref = _dereq_("../internal/ref");
var __context = _dereq_("../internal/context");
var __ref_index = _dereq_("../internal/ref-index");
var __refs_length = _dereq_("../internal/refs-length");

var is_object      = _dereq_("../support/is-object");
var is_primitive   = _dereq_("../support/is-primitive");
var array_slice    = _dereq_("../support/array-slice");
var array_append   = _dereq_("../support/array-append");

function walk_reference(onNode, container, reference, roots, parents, nodes, requested, optimized) {
    
    optimized.length = 0;
    
    var index = -1;
    var count = reference.length;
    var node, key, keyset;
    
    while(++index < count) {
        
        node = nodes[0];
        
        if(node == null) {
            return nodes;
        } else if(is_primitive(node) || node.$type) {
            onNode(reference, roots, parents, nodes, requested, optimized, false, false, keyset, null, false);
            return nodes;
        }
        
        do {
            key = reference[index];
            if(key != null) {
                keyset = key;
                optimized.push(key);
                onNode(reference, roots, parents, nodes, requested, optimized, false, index < count - 1, key, null, false);
                break;
            }
        } while(++index < count);
    }
    
    node = nodes[0];
    
    if(is_object(node) && container[__context] !== node) {
        var backrefs = node[__refs_length] || 0;
        node[__refs_length] = backrefs + 1;
        node[__ref + backrefs] = container;
        container[__context]    = node;
        container[__ref_index]  = backrefs;
    }
    
    return nodes;
}
},{"../internal/context":66,"../internal/prefix":74,"../internal/ref":77,"../internal/ref-index":76,"../internal/refs-length":78,"../support/array-append":103,"../support/array-slice":105,"../support/is-object":122,"../support/is-primitive":123}],149:[function(_dereq_,module,exports){
var falcor = _dereq_('./lib/falcor');
var get = _dereq_('./lib/get');
var set = _dereq_('./lib/set');
var inv = _dereq_('./lib/invalidate');
var prototype = falcor.Model.prototype;

prototype._getBoundValue = get.getBoundValue;
prototype._getValueSync = get.getValueSync;
prototype._getPathSetsAsValues = get.getAsValues;
prototype._getPathSetsAsJSON = get.getAsJSON;
prototype._getPathSetsAsPathMap = get.getAsPathMap;
prototype._getPathSetsAsJSONG = get.getAsJSONG;
prototype._getPathMapsAsValues = get.getAsValues;
prototype._getPathMapsAsJSON = get.getAsJSON;
prototype._getPathMapsAsPathMap = get.getAsPathMap;
prototype._getPathMapsAsJSONG = get.getAsJSONG;

prototype._setPathSetsAsJSON = set.setPathSetsAsJSON;
prototype._setPathSetsAsJSONG = set.setPathSetsAsJSONG;
prototype._setPathSetsAsPathMap = set.setPathSetsAsPathMap;
prototype._setPathSetsAsValues = set.setPathSetsAsValues;

prototype._setPathMapsAsJSON = set.setPathMapsAsJSON;
prototype._setPathMapsAsJSONG = set.setPathMapsAsJSONG;
prototype._setPathMapsAsPathMap = set.setPathMapsAsPathMap;
prototype._setPathMapsAsValues = set.setPathMapsAsValues;

prototype._setJSONGsAsJSON = set.setJSONGsAsJSON;
prototype._setJSONGsAsJSONG = set.setJSONGsAsJSONG;
prototype._setJSONGsAsPathMap = set.setJSONGsAsPathMap;
prototype._setJSONGsAsValues = set.setJSONGsAsValues;

prototype._invPathSetsAsJSON = inv.invPathSetsAsJSON;
prototype._invPathSetsAsJSONG = inv.invPathSetsAsJSONG;
prototype._invPathSetsAsPathMap = inv.invPathSetsAsPathMap;
prototype._invPathSetsAsValues = inv.invPathSetsAsValues;

// prototype._setCache = get.setCache;
prototype._setCache = set.setCache;

module.exports = falcor;


},{"./lib/falcor":5,"./lib/get":52,"./lib/invalidate":81,"./lib/set":89}]},{},[1])
(1)
});
}).call(this,typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})
},{}],149:[function(require,module,exports){
var falcor = require('falcor');
var Observable = falcor.Observable;

function XMLHttpSource(jsongUrl, timeout) {
    this._jsongUrl = jsongUrl;
    this._timeout = timeout || 15000;
}

XMLHttpSource.prototype = {
    /**
     * @inheritDoc DataSource#get
     */
    get: function (pathSet) {
        var method = 'GET';
        var config = buildQueryObject(this._jsongUrl, method, {
            path: pathSet,
            method: 'get'
        });
        return request(method, config);
    },
    /**
     * @inheritDoc DataSource#set
     */
    set: function () {
        // TODO: What to send what to send
    },

    /**
     * @inheritDoc DataSource#call
     */
    call: function (callPath, args, pathSuffix, paths) {
        var method = 'GET';
        var queryData = [];
        args = args || [];
        pathSuffix = pathSuffix || [];
        paths = paths || [];
        paths.forEach(function (path) {
            queryData.push('path=' + encodeURIComponent(JSON.stringify(path)));
        });

        queryData.push('method=call');
        queryData.push('callPath=' + encodeURIComponent(JSON.stringify(callPath)));

        if (Array.isArray(args)) {
            args.forEach(function (value) {
                queryData.push('param=' + encodeURIComponent(JSON.stringify(value)));
            });
        }

        if (Array.isArray(pathSuffix)) {
            pathSuffix.forEach(function (value) {
                queryData.push('pathSuffix=' + encodeURIComponent(JSON.stringify(value)));
            });
        }

        var config = buildQueryObject(this._jsongUrl, method, queryData.join('&'));
        return request(method, config);
    }
};

function request(method, config) {
    return Observable.create(function (observer) {
        // i have to actual work now :(
        var xhr = new XMLHttpRequest();

        // Link the response methods
        xhr.onload = onXhrLoad.bind(null, observer, xhr);
        xhr.onerror = onXhrError.bind(null, observer, xhr);
        xhr.ontimeout = onXhrTimeout.bind(null, observer, xhr);

        // Sets information
        xhr.timeout = config.timeout;

        // Anything but explicit false results in true.
        xhr.withCredentials = !(config.withCredentials === false);
        xhr.responseType = 'json';

        // Takes the url and opens the connection
        xhr.open(method, config.url);

        // Fills the request headers
        var requestHeaders = config.requestHeaders || {};
        var keys = Object.keys(requestHeaders);
        keys.forEach(function (k) {
            xhr.setRequestHeader(k, requestHeaders[k]);
        });

        // Sends the request.
        xhr.send(config.data);

        return function () {
            // TODO: Dispose of request.
        };
    });
}

/*
 * General handling of a successfully completed request (that had a 200 response code)
 */
function _handleXhrComplete(observer, data) {
    observer.onNext(data);
    observer.onCompleted();
}

/*
 * General handling of ultimate failure (after appropriate retries)
 */
function _handleXhrError(observer, textStatus, errorThrown) {
    if (!errorThrown) {
        errorThrown = new Error(textStatus);
    }

    observer.onError(errorThrown);
}

function onXhrLoad(observer, xhr) {
    var status,
        responseData,
        responseObject;

    // If there's no observer, the request has been (or is being) cancelled.
    if (xhr && observer) {
        status = xhr.status;
        responseData = xhr.responseText;

        if (status >= 200 && status <= 399) {
            try {
                responseData = JSON.parse(responseData || '');
            } catch (e) {
                _handleXhrError(observer, 'invalid json', e);
            }
            _handleXhrComplete(observer, responseData);
        } else if (status === 401 || status === 403 || status === 407) {
            _handleXhrError(observer, responseData);
        } else if (status === 410) {
            // TODO: Retry ?
            _handleXhrError(observer, responseData);
        } else if (status === 408 || status === 504) {
            // TODO: Retry ?
            _handleXhrError(observer, responseData);
        } else {
            _handleXhrError(observer, responseData || ('Response code ' + status));
        }
    }
}

function onXhrError(observer, xhr) {
    _handleXhrError(observer, xhr.statusText || 'request error');
}

function onXhrTimeout(observer) {
    _handleXhrError(observer, 'request timeout');
}

function buildQueryObject(url, method, queryData) {
    var qData = [];
    var keys;
    var data = {url: url};

    if (typeof queryData === 'string') {
        qData.push(queryData);
    } else {
        keys = Object.keys(queryData);
        keys.forEach(function (k) {
            var value = typeof queryData[k] === 'object' ? JSON.stringify(queryData[k]) : queryData[k];
            qData.push(k + '=' + value);
        });
    }

    if (method === 'GET') {
        data.url += '?' + qData.join('&');
    } else {
        data.data = qData.join('&');
    }

    return data;
}

module.exports = XMLHttpSource;

},{"falcor":148}],150:[function(require,module,exports){
var TokenTypes = {
    token: 'token',
    dotSeparator: '.',
    commaSeparator: ',',
    openingBracket: '[',
    closingBracket: ']',
    openingBrace: '{',
    closingBrace: '}',
    escape: '\\',
    space: ' ',
    quote: 'quote',
    unknown: 'unknown'
};

module.exports = TokenTypes;

},{}],151:[function(require,module,exports){
module.exports = {
    indexer: {
        nested: 'Indexers cannot be nested.',
        needQuotes: 'unquoted indexers must be numeric.',
        empty: 'cannot have empty indexers.',
        leadingDot: 'Indexers cannot have leading dots.',
        leadingComma: 'Indexers cannot have leading comma.',
        requiresComma: 'Indexers require commas between indexer args.'
    },
    range: {
        precedingNaN: 'ranges must be preceded by numbers.',
        suceedingNaN: 'ranges must be suceeded by numbers.'
    },
    quote: {
        empty: 'cannot have empty quoted keys.',
        illegalEscape: 'Invalid escape character.  Only quotes are escapable.'
    },
    unexpectedToken: 'Unexpected token.',
    throwError: function(err, state, token) {
        if (token) {
            throw err + ' -- ' + state.parseString + ' with next token: ' + token;
        }
        throw err + ' -- ' + state.parseString;
    }
};


},{}],152:[function(require,module,exports){
var Tokenizer = require('./tokenizer');
var head = require('./parse-tree/head');
var parser = function parser(string, extendedRules) {
    return head(new Tokenizer(string, extendedRules));
};

module.exports = parser;

// Constructs the paths from paths / pathValues that have strings.
// If it does not have a string, just moves the value into the return
// results.
parser.fromPathsOrPathValues = function(paths, ext) {
    var out = [];
    for (i = 0, len = paths.length; i < len; i++) {

        // Is the path a string
        if (typeof paths[i] === 'string') {
            out[i] = parser(paths[i], ext);
        }

        // is the path a path value with a string value.
        else if (typeof paths[i].path === 'string') {
            out[i] = {
                path: parser(paths[i].path, ext), value: paths[i].value
            };
        }

        // just copy it over.
        else {
            out[i] = paths[i];
        }
    }

    return out;
};

// If the argument is a string, this with convert, else just return
// the path provided.
parser.fromPath = function(path, ext) {
    if (typeof path === 'string') {
        return parser(path, ext);
    }
    return path;
};

},{"./parse-tree/head":153,"./tokenizer":157}],153:[function(require,module,exports){
var TokenTypes = require('./../TokenTypes');
var Expections = require('./../exceptions');
var indexer = require('./indexer');

/**
 * The top level of the parse tree.  This returns the generated path
 * from the tokenizer.
 */
module.exports = function head(tokenizer) {
    var token = tokenizer.next();
    var first = true;
    var state = {
        parseString: ''
    };
    var out = [];

    while (!token.done) {

        // continue to build the parse string.
        state.parseString += token.token;

        switch (token.type) {
            case TokenTypes.token:
                out[out.length] = token.token;
                break;

            // dotSeparators at the top level have no meaning
            case TokenTypes.dotSeparator:
                if (first) {
                    // TODO: Fix me
                    throw 'ohh no!';
                }
                break;

            // Spaces do nothing.
            case TokenTypes.space:
                // NOTE: Spaces at the top level are allowed.
                // titlesById  .summary is a valid path.
                break;


            // Its time to decend the parse tree.
            case TokenTypes.openingBracket:
                indexer(tokenizer, token, state, out);
                break;

            // TODO: Fix me
            default:
                throw 'ohh no!';
        }

        first = false;

        // Keep cycling through the tokenizer.
        token = tokenizer.next();
    }

    if (first) {
        // TODO: Ohh no! Fix me
        throw 'ohh no!';
    }

    return out;
};


},{"./../TokenTypes":150,"./../exceptions":151,"./indexer":154}],154:[function(require,module,exports){
var TokenTypes = require('./../TokenTypes');
var E = require('./../exceptions');
var idxE = E.indexer;
var range = require('./range');
var quote = require('./quote');

/**
 * The indexer is all the logic that happens in between
 * the '[', opening bracket, and ']' closing bracket.
 */
module.exports = function indexer(tokenizer, openingToken, state, out) {
    var token = tokenizer.next();
    var done = false;
    var allowedMaxLength = 1;

    // State variables
    state.indexer = [];

    while (!token.done) {

        // continue to build the parse string.
        state.parseString += token.token;
        switch (token.type) {
            case TokenTypes.token:
            case TokenTypes.quote:

                // ensures that token adders are properly delimited.
                if (state.indexer.length === allowedMaxLength) {
                    E.throwError(idxE.requiresComma, state);
                }
                break;
        }

        switch (token.type) {
            case TokenTypes.token:
                var t = +token.token;
                if (isNaN(t)) {
                    E.throwError(idxE.needQuotes, state);
                }
                state.indexer[state.indexer.length] = t;
                break;

            // dotSeparators at the top level have no meaning
            case TokenTypes.dotSeparator:
                if (!state.indexer.length) {
                    E.throwError(idxE.leadingDot, state);
                }
                range(tokenizer, token, state, out);
                break;

            // Spaces do nothing.
            case TokenTypes.space:
                break;

            case TokenTypes.closingBracket:
                done = true;
                break;


            // The quotes require their own tree due to what can be in it.
            case TokenTypes.quote:
                quote(tokenizer, token, state, out);
                break;


            // Its time to decend the parse tree.
            case TokenTypes.openingBracket:
                E.throwError(idxE.nested, state);
                break;

            case TokenTypes.commaSeparator:
                ++allowedMaxLength;
                break;

            default:
                E.throwError(idxE.unexpectedToken, state);
        }

        // If done, leave loop
        if (done) {
            break;
        }

        // Keep cycling through the tokenizer.
        token = tokenizer.next();
    }

    if (state.indexer.length === 0) {
        E.throwError(idxE.empty, state);
    }

    // Remember, if an array of 1, keySets will be generated.
    if (state.indexer.length === 1) {
        state.indexer = state.indexer[0];
    }

    out[out.length] = state.indexer;

    // Clean state.
    state.indexer = undefined;
};


},{"./../TokenTypes":150,"./../exceptions":151,"./quote":155,"./range":156}],155:[function(require,module,exports){
var TokenTypes = require('./../TokenTypes');
var E = require('./../exceptions');
var quoteE = E.quote;

/**
 * The indexer is all the logic that happens in between
 * the '[', opening bracket, and ']' closing bracket.
 */
module.exports = function quote(tokenizer, openingToken, state, out) {
    var token = tokenizer.next();
    var innerToken = '';
    var openingQuote = openingToken.token;
    var escaping = false;
    var done = false;

    while (!token.done) {

        // continue to build the parse string.
        state.parseString += token.token;

        switch (token.type) {
            case TokenTypes.token:
            case TokenTypes.space:

            case TokenTypes.dotSeparator:
            case TokenTypes.commaSeparator:

            case TokenTypes.openingBracket:
            case TokenTypes.closingBracket:
            case TokenTypes.openingBrace:
            case TokenTypes.closingBrace:
                if (escaping) {
                    E.throwError(quoteE.illegalEscape, state);
                }

                innerToken += token.token;
                break;


            case TokenTypes.quote:
                // the simple case.  We are escaping
                if (escaping) {
                    innerToken += token.token;
                    escaping = false;
                }

                // its not a quote that is the opening quote
                else if (token.token !== openingQuote) {
                    innerToken += token.token;
                }

                // last thing left.  Its a quote that is the opening quote
                // therefore we must produce the inner token of the indexer.
                else {
                    done = true;
                }

                break;
            case TokenTypes.escape:
                escaping = true;
                break;

            default:
                E.throwError(E.unexpectedToken, state);
        }

        // If done, leave loop
        if (done) {
            break;
        }

        // Keep cycling through the tokenizer.
        token = tokenizer.next();
    }

    if (innerToken.length === 0) {
        E.throwError(quoteE.empty, state);
    }

    state.indexer[state.indexer.length] = innerToken;
};


},{"./../TokenTypes":150,"./../exceptions":151}],156:[function(require,module,exports){
var Tokenizer = require('./../tokenizer');
var TokenTypes = require('./../TokenTypes');
var E = require('./../exceptions');

/**
 * The indexer is all the logic that happens in between
 * the '[', opening bracket, and ']' closing bracket.
 */
module.exports = function range(tokenizer, openingToken, state, out) {
    var token = tokenizer.peek();
    var dotCount = 1;
    var done = false;
    var inclusive = true;

    // Grab the last token off the stack.  Must be an integer.
    var idx = state.indexer.length - 1;
    var from = Tokenizer.toNumber(state.indexer[idx]);
    var to;

    if (isNaN(from)) {
        E.throwError(E.range.precedingNaN, state);
    }

    // Why is number checking so difficult in javascript.

    while (!done && !token.done) {

        switch (token.type) {

            // dotSeparators at the top level have no meaning
            case TokenTypes.dotSeparator:
                if (dotCount === 3) {
                    E.throwError(E.unexpectedToken, state);
                }
                ++dotCount;

                if (dotCount === 3) {
                    inclusive = false;
                }
                break;

            case TokenTypes.token:
                // move the tokenizer forward and save to.
                to = Tokenizer.toNumber(tokenizer.next().token);

                // continue to build the parse string.
                state.parseString += token.token;

                // throw potential error.
                if (isNaN(to)) {
                    E.throwError(E.range.suceedingNaN, state);
                }

                done = true;
                break;

            default:
                done = true;
                break;
        }

        // Keep cycling through the tokenizer.  But ranges have to peek
        // before they go to the next token since there is no 'terminating'
        // character.
        if (!done) {
            tokenizer.next();

            // continue to build the parse string.
            state.parseString += token.token;

            // go to the next token without consuming.
            token = tokenizer.peek();
        }

        // break and remove state information.
        else {
            break;
        }
    }

    state.indexer[idx] = {from: from, to: inclusive ? to : to - 1};
};


},{"./../TokenTypes":150,"./../exceptions":151,"./../tokenizer":157}],157:[function(require,module,exports){
var TokenTypes = require('./../TokenTypes');
var DOT_SEPARATOR = '.';
var COMMA_SEPARATOR = ',';
var OPENING_BRACKET = '[';
var CLOSING_BRACKET = ']';
var OPENING_BRACE = '{';
var CLOSING_BRACE = '}';
var ESCAPE = '\\';
var DOUBLE_OUOTES = '"';
var SINGE_OUOTES = "'";
var SPACE = " ";
var SPECIAL_CHARACTERS = '\\\'"[]., ';
var EXT_SPECIAL_CHARACTERS = '\\{}\'"[]., ';

var Tokenizer = module.exports = function(string, ext) {
    this._string = string;
    this._idx = -1;
    this._extended = ext;
};

Tokenizer.prototype = {
    /**
     * grabs the next token either from the peek operation or generates the
     * next token.
     */
    next: function() {
        var nextToken = this._nextToken ?
            this._nextToken : getNext(this._string, this._idx, this._extended);

        this._idx = nextToken.idx;
        this._nextToken = false;

        return nextToken.token;
    },

    /**
     * will peak but not increment the tokenizer
     */
    peek: function() {
        var nextToken = this._nextToken ?
            this._nextToken : getNext(this._string, this._idx, this._extended);
        this._nextToken = nextToken;

        return nextToken.token;
    }
};

Tokenizer.toNumber = function toNumber(x) {
    if (!isNaN(+x)) {
        return +x;
    }
    return NaN;
};

function toOutput(token, type, done) {
    return {
        token: token,
        done: done,
        type: type
    };
}

function getNext(string, idx, ext) {
    var output = false;
    var token = '';
    var specialChars = ext ?
        EXT_SPECIAL_CHARACTERS : SPECIAL_CHARACTERS;
    do {

        done = idx + 1 >= string.length;
        if (done) {
            break;
        }

        // we have to peek at the next token
        var character = string[idx + 1];

        if (character !== undefined &&
            specialChars.indexOf(character) === -1) {

            token += character;
            ++idx;
            continue;
        }

        // The token to delimiting character transition.
        else if (token.length) {
            break;
        }

        ++idx;
        var type;
        switch (character) {
            case DOT_SEPARATOR:
                type = TokenTypes.dotSeparator;
                break;
            case COMMA_SEPARATOR:
                type = TokenTypes.commaSeparator;
                break;
            case OPENING_BRACKET:
                type = TokenTypes.openingBracket;
                break;
            case CLOSING_BRACKET:
                type = TokenTypes.closingBracket;
                break;
            case OPENING_BRACE:
                type = TokenTypes.openingBrace;
                break;
            case CLOSING_BRACE:
                type = TokenTypes.closingBrace;
                break;
            case SPACE:
                type = TokenTypes.space;
                break;
            case DOUBLE_OUOTES:
            case SINGE_OUOTES:
                type = TokenTypes.quote;
                break;
            case ESCAPE:
                type = TokenTypes.escape;
                break;
            default:
                type = TokenTypes.unknown;
                break;
        }
        output = toOutput(character, type, false);
        break;
    } while (!done);

    if (!output && token.length) {
        output = toOutput(token, TokenTypes.token, false);
    }

    if (!output) {
        output = {done: true};
    }

    return {
        token: output,
        idx: idx
    };
}



},{"./../TokenTypes":150}],158:[function(require,module,exports){
'use strict';

module.exports = require('./lib')

},{"./lib":163}],159:[function(require,module,exports){
'use strict';

var asap = require('asap/raw')

function noop() {};

// States:
//
// 0 - pending
// 1 - fulfilled with _value
// 2 - rejected with _value
// 3 - adopted the state of another promise, _value
//
// once the state is no longer pending (0) it is immutable

// All `_` prefixed properties will be reduced to `_{random number}`
// at build time to obfuscate them and discourage their use.
// We don't use symbols or Object.defineProperty to fully hide them
// because the performance isn't good enough.


// to avoid using try/catch inside critical functions, we
// extract them to here.
var LAST_ERROR = null;
var IS_ERROR = {};
function getThen(obj) {
  try {
    return obj.then;
  } catch (ex) {
    LAST_ERROR = ex;
    return IS_ERROR;
  }
}

function tryCallOne(fn, a) {
  try {
    return fn(a);
  } catch (ex) {
    LAST_ERROR = ex;
    return IS_ERROR;
  }
}
function tryCallTwo(fn, a, b) {
  try {
    fn(a, b);
  } catch (ex) {
    LAST_ERROR = ex;
    return IS_ERROR;
  }
}

module.exports = Promise;
function Promise(fn) {
  if (typeof this !== 'object') throw new TypeError('Promises must be constructed via new')
  if (typeof fn !== 'function') throw new TypeError('not a function')
  this._71 = 0;
  this._18 = null;
  this._61 = [];
  if (fn === noop) return;
  doResolve(fn, this);
}
Promise.prototype._10 = function (onFulfilled, onRejected) {
  var self = this;
  return new this.constructor(function (resolve, reject) {
    var res = new Promise(noop);
    res.then(resolve, reject);
    self._24(new Handler(onFulfilled, onRejected, res));
  });
};
Promise.prototype.then = function(onFulfilled, onRejected) {
  if (this.constructor !== Promise) return this._10(onFulfilled, onRejected);
  var res = new Promise(noop);
  this._24(new Handler(onFulfilled, onRejected, res));
  return res;
};
Promise.prototype._24 = function(deferred) {
  if (this._71 === 3) {
    this._18._24(deferred);
    return;
  }
  if (this._71 === 0) {
    this._61.push(deferred);
    return;
  }
  var state = this._71;
  var value = this._18;
  asap(function() {
    var cb = state === 1 ? deferred.onFulfilled : deferred.onRejected
    if (cb === null) {
      (state === 1 ? deferred.promise._82(value) : deferred.promise._67(value))
      return
    }
    var ret = tryCallOne(cb, value);
    if (ret === IS_ERROR) {
      deferred.promise._67(LAST_ERROR)
    } else {
      deferred.promise._82(ret)
    }
  });
};
Promise.prototype._82 = function(newValue) {
  //Promise Resolution Procedure: https://github.com/promises-aplus/promises-spec#the-promise-resolution-procedure
  if (newValue === this) {
    return this._67(new TypeError('A promise cannot be resolved with itself.'))
  }
  if (newValue && (typeof newValue === 'object' || typeof newValue === 'function')) {
    var then = getThen(newValue);
    if (then === IS_ERROR) {
      return this._67(LAST_ERROR);
    }
    if (
      then === this.then &&
      newValue instanceof Promise &&
      newValue._24 === this._24
    ) {
      this._71 = 3;
      this._18 = newValue;
      for (var i = 0; i < this._61.length; i++) {
        newValue._24(this._61[i]);
      }
      return;
    } else if (typeof then === 'function') {
      doResolve(then.bind(newValue), this)
      return
    }
  }
  this._71 = 1
  this._18 = newValue
  this._94()
}

Promise.prototype._67 = function (newValue) {
  this._71 = 2
  this._18 = newValue
  this._94()
}
Promise.prototype._94 = function () {
  for (var i = 0; i < this._61.length; i++)
    this._24(this._61[i])
  this._61 = null
}


function Handler(onFulfilled, onRejected, promise){
  this.onFulfilled = typeof onFulfilled === 'function' ? onFulfilled : null
  this.onRejected = typeof onRejected === 'function' ? onRejected : null
  this.promise = promise;
}

/**
 * Take a potentially misbehaving resolver function and make sure
 * onFulfilled and onRejected are only called once.
 *
 * Makes no guarantees about asynchrony.
 */
function doResolve(fn, promise) {
  var done = false;
  var res = tryCallTwo(fn, function (value) {
    if (done) return
    done = true
    promise._82(value)
  }, function (reason) {
    if (done) return
    done = true
    promise._67(reason)
  })
  if (!done && res === IS_ERROR) {
    done = true
    promise._67(LAST_ERROR)
  }
}
},{"asap/raw":167}],160:[function(require,module,exports){
'use strict';

var Promise = require('./core.js')

module.exports = Promise
Promise.prototype.done = function (onFulfilled, onRejected) {
  var self = arguments.length ? this.then.apply(this, arguments) : this
  self.then(null, function (err) {
    setTimeout(function () {
      throw err
    }, 0)
  })
}
},{"./core.js":159}],161:[function(require,module,exports){
'use strict';

//This file contains the ES6 extensions to the core Promises/A+ API

var Promise = require('./core.js')
var asap = require('asap/raw')

module.exports = Promise

/* Static Functions */

function ValuePromise(value) {
  this.then = function (onFulfilled) {
    if (typeof onFulfilled !== 'function') return this
    return new Promise(function (resolve, reject) {
      asap(function () {
        try {
          resolve(onFulfilled(value))
        } catch (ex) {
          reject(ex);
        }
      })
    })
  }
}
ValuePromise.prototype = Promise.prototype

var TRUE = new ValuePromise(true)
var FALSE = new ValuePromise(false)
var NULL = new ValuePromise(null)
var UNDEFINED = new ValuePromise(undefined)
var ZERO = new ValuePromise(0)
var EMPTYSTRING = new ValuePromise('')

Promise.resolve = function (value) {
  if (value instanceof Promise) return value

  if (value === null) return NULL
  if (value === undefined) return UNDEFINED
  if (value === true) return TRUE
  if (value === false) return FALSE
  if (value === 0) return ZERO
  if (value === '') return EMPTYSTRING

  if (typeof value === 'object' || typeof value === 'function') {
    try {
      var then = value.then
      if (typeof then === 'function') {
        return new Promise(then.bind(value))
      }
    } catch (ex) {
      return new Promise(function (resolve, reject) {
        reject(ex)
      })
    }
  }

  return new ValuePromise(value)
}

Promise.all = function (arr) {
  var args = Array.prototype.slice.call(arr)

  return new Promise(function (resolve, reject) {
    if (args.length === 0) return resolve([])
    var remaining = args.length
    function res(i, val) {
      if (val && (typeof val === 'object' || typeof val === 'function')) {
        var then = val.then
        if (typeof then === 'function') {
          then.call(val, function (val) { res(i, val) }, reject)
          return
        }
      }
      args[i] = val
      if (--remaining === 0) {
        resolve(args);
      }
    }
    for (var i = 0; i < args.length; i++) {
      res(i, args[i])
    }
  })
}

Promise.reject = function (value) {
  return new Promise(function (resolve, reject) { 
    reject(value);
  });
}

Promise.race = function (values) {
  return new Promise(function (resolve, reject) { 
    values.forEach(function(value){
      Promise.resolve(value).then(resolve, reject);
    })
  });
}

/* Prototype Methods */

Promise.prototype['catch'] = function (onRejected) {
  return this.then(null, onRejected);
}

},{"./core.js":159,"asap/raw":167}],162:[function(require,module,exports){
'use strict';

var Promise = require('./core.js')

module.exports = Promise
Promise.prototype['finally'] = function (f) {
  return this.then(function (value) {
    return Promise.resolve(f()).then(function () {
      return value
    })
  }, function (err) {
    return Promise.resolve(f()).then(function () {
      throw err
    })
  })
}

},{"./core.js":159}],163:[function(require,module,exports){
'use strict';

module.exports = require('./core.js')
require('./done.js')
require('./finally.js')
require('./es6-extensions.js')
require('./node-extensions.js')

},{"./core.js":159,"./done.js":160,"./es6-extensions.js":161,"./finally.js":162,"./node-extensions.js":164}],164:[function(require,module,exports){
'use strict';

//This file contains then/promise specific extensions that are only useful for node.js interop

var Promise = require('./core.js')
var asap = require('asap')

module.exports = Promise

/* Static Functions */

Promise.denodeify = function (fn, argumentCount) {
  argumentCount = argumentCount || Infinity
  return function () {
    var self = this
    var args = Array.prototype.slice.call(arguments)
    return new Promise(function (resolve, reject) {
      while (args.length && args.length > argumentCount) {
        args.pop()
      }
      args.push(function (err, res) {
        if (err) reject(err)
        else resolve(res)
      })
      var res = fn.apply(self, args)
      if (res && (typeof res === 'object' || typeof res === 'function') && typeof res.then === 'function') {
        resolve(res)
      }
    })
  }
}
Promise.nodeify = function (fn) {
  return function () {
    var args = Array.prototype.slice.call(arguments)
    var callback = typeof args[args.length - 1] === 'function' ? args.pop() : null
    var ctx = this
    try {
      return fn.apply(this, arguments).nodeify(callback, ctx)
    } catch (ex) {
      if (callback === null || typeof callback == 'undefined') {
        return new Promise(function (resolve, reject) { reject(ex) })
      } else {
        asap(function () {
          callback.call(ctx, ex)
        })
      }
    }
  }
}

Promise.prototype.nodeify = function (callback, ctx) {
  if (typeof callback != 'function') return this

  this.then(function (value) {
    asap(function () {
      callback.call(ctx, null, value)
    })
  }, function (err) {
    asap(function () {
      callback.call(ctx, err)
    })
  })
}

},{"./core.js":159,"asap":165}],165:[function(require,module,exports){
"use strict";

// rawAsap provides everything we need except exception management.
var rawAsap = require("./raw");
// RawTasks are recycled to reduce GC churn.
var freeTasks = [];
// We queue errors to ensure they are thrown in right order (FIFO).
// Array-as-queue is good enough here, since we are just dealing with exceptions.
var pendingErrors = [];
var requestErrorThrow = rawAsap.makeRequestCallFromTimer(throwFirstError);

function throwFirstError() {
    if (pendingErrors.length) {
        throw pendingErrors.shift();
    }
}

/**
 * Calls a task as soon as possible after returning, in its own event, with priority
 * over other events like animation, reflow, and repaint. An error thrown from an
 * event will not interrupt, nor even substantially slow down the processing of
 * other events, but will be rather postponed to a lower priority event.
 * @param {{call}} task A callable object, typically a function that takes no
 * arguments.
 */
module.exports = asap;
function asap(task) {
    var rawTask;
    if (freeTasks.length) {
        rawTask = freeTasks.pop();
    } else {
        rawTask = new RawTask();
    }
    rawTask.task = task;
    rawAsap(rawTask);
}

// We wrap tasks with recyclable task objects.  A task object implements
// `call`, just like a function.
function RawTask() {
    this.task = null;
}

// The sole purpose of wrapping the task is to catch the exception and recycle
// the task object after its single use.
RawTask.prototype.call = function () {
    try {
        this.task.call();
    } catch (error) {
        if (asap.onerror) {
            // This hook exists purely for testing purposes.
            // Its name will be periodically randomized to break any code that
            // depends on its existence.
            asap.onerror(error);
        } else {
            // In a web browser, exceptions are not fatal. However, to avoid
            // slowing down the queue of pending tasks, we rethrow the error in a
            // lower priority turn.
            pendingErrors.push(error);
            requestErrorThrow();
        }
    } finally {
        this.task = null;
        freeTasks[freeTasks.length] = this;
    }
};

},{"./raw":166}],166:[function(require,module,exports){
(function (global){
"use strict";

// Use the fastest means possible to execute a task in its own turn, with
// priority over other events including IO, animation, reflow, and redraw
// events in browsers.
//
// An exception thrown by a task will permanently interrupt the processing of
// subsequent tasks. The higher level `asap` function ensures that if an
// exception is thrown by a task, that the task queue will continue flushing as
// soon as possible, but if you use `rawAsap` directly, you are responsible to
// either ensure that no exceptions are thrown from your task, or to manually
// call `rawAsap.requestFlush` if an exception is thrown.
module.exports = rawAsap;
function rawAsap(task) {
    if (!queue.length) {
        requestFlush();
        flushing = true;
    }
    // Equivalent to push, but avoids a function call.
    queue[queue.length] = task;
}

var queue = [];
// Once a flush has been requested, no further calls to `requestFlush` are
// necessary until the next `flush` completes.
var flushing = false;
// `requestFlush` is an implementation-specific method that attempts to kick
// off a `flush` event as quickly as possible. `flush` will attempt to exhaust
// the event queue before yielding to the browser's own event loop.
var requestFlush;
// The position of the next task to execute in the task queue. This is
// preserved between calls to `flush` so that it can be resumed if
// a task throws an exception.
var index = 0;
// If a task schedules additional tasks recursively, the task queue can grow
// unbounded. To prevent memory exhaustion, the task queue will periodically
// truncate already-completed tasks.
var capacity = 1024;

// The flush function processes all tasks that have been scheduled with
// `rawAsap` unless and until one of those tasks throws an exception.
// If a task throws an exception, `flush` ensures that its state will remain
// consistent and will resume where it left off when called again.
// However, `flush` does not make any arrangements to be called again if an
// exception is thrown.
function flush() {
    while (index < queue.length) {
        var currentIndex = index;
        // Advance the index before calling the task. This ensures that we will
        // begin flushing on the next task the task throws an error.
        index = index + 1;
        queue[currentIndex].call();
        // Prevent leaking memory for long chains of recursive calls to `asap`.
        // If we call `asap` within tasks scheduled by `asap`, the queue will
        // grow, but to avoid an O(n) walk for every task we execute, we don't
        // shift tasks off the queue after they have been executed.
        // Instead, we periodically shift 1024 tasks off the queue.
        if (index > capacity) {
            // Manually shift all values starting at the index back to the
            // beginning of the queue.
            for (var scan = 0; scan < index; scan++) {
                queue[scan] = queue[scan + index];
            }
            queue.length -= index;
            index = 0;
        }
    }
    queue.length = 0;
    index = 0;
    flushing = false;
}

// `requestFlush` is implemented using a strategy based on data collected from
// every available SauceLabs Selenium web driver worker at time of writing.
// https://docs.google.com/spreadsheets/d/1mG-5UYGup5qxGdEMWkhP6BWCz053NUb2E1QoUTU16uA/edit#gid=783724593

// Safari 6 and 6.1 for desktop, iPad, and iPhone are the only browsers that
// have WebKitMutationObserver but not un-prefixed MutationObserver.
// Must use `global` instead of `window` to work in both frames and web
// workers. `global` is a provision of Browserify, Mr, Mrs, or Mop.
var BrowserMutationObserver = global.MutationObserver || global.WebKitMutationObserver;

// MutationObservers are desirable because they have high priority and work
// reliably everywhere they are implemented.
// They are implemented in all modern browsers.
//
// - Android 4-4.3
// - Chrome 26-34
// - Firefox 14-29
// - Internet Explorer 11
// - iPad Safari 6-7.1
// - iPhone Safari 7-7.1
// - Safari 6-7
if (typeof BrowserMutationObserver === "function") {
    requestFlush = makeRequestCallFromMutationObserver(flush);

// MessageChannels are desirable because they give direct access to the HTML
// task queue, are implemented in Internet Explorer 10, Safari 5.0-1, and Opera
// 11-12, and in web workers in many engines.
// Although message channels yield to any queued rendering and IO tasks, they
// would be better than imposing the 4ms delay of timers.
// However, they do not work reliably in Internet Explorer or Safari.

// Internet Explorer 10 is the only browser that has setImmediate but does
// not have MutationObservers.
// Although setImmediate yields to the browser's renderer, it would be
// preferrable to falling back to setTimeout since it does not have
// the minimum 4ms penalty.
// Unfortunately there appears to be a bug in Internet Explorer 10 Mobile (and
// Desktop to a lesser extent) that renders both setImmediate and
// MessageChannel useless for the purposes of ASAP.
// https://github.com/kriskowal/q/issues/396

// Timers are implemented universally.
// We fall back to timers in workers in most engines, and in foreground
// contexts in the following browsers.
// However, note that even this simple case requires nuances to operate in a
// broad spectrum of browsers.
//
// - Firefox 3-13
// - Internet Explorer 6-9
// - iPad Safari 4.3
// - Lynx 2.8.7
} else {
    requestFlush = makeRequestCallFromTimer(flush);
}

// `requestFlush` requests that the high priority event queue be flushed as
// soon as possible.
// This is useful to prevent an error thrown in a task from stalling the event
// queue if the exception handled by Node.js’s
// `process.on("uncaughtException")` or by a domain.
rawAsap.requestFlush = requestFlush;

// To request a high priority event, we induce a mutation observer by toggling
// the text of a text node between "1" and "-1".
function makeRequestCallFromMutationObserver(callback) {
    var toggle = 1;
    var observer = new BrowserMutationObserver(callback);
    var node = document.createTextNode("");
    observer.observe(node, {characterData: true});
    return function requestCall() {
        toggle = -toggle;
        node.data = toggle;
    };
}

// The message channel technique was discovered by Malte Ubl and was the
// original foundation for this library.
// http://www.nonblocking.io/2011/06/windownexttick.html

// Safari 6.0.5 (at least) intermittently fails to create message ports on a
// page's first load. Thankfully, this version of Safari supports
// MutationObservers, so we don't need to fall back in that case.

// function makeRequestCallFromMessageChannel(callback) {
//     var channel = new MessageChannel();
//     channel.port1.onmessage = callback;
//     return function requestCall() {
//         channel.port2.postMessage(0);
//     };
// }

// For reasons explained above, we are also unable to use `setImmediate`
// under any circumstances.
// Even if we were, there is another bug in Internet Explorer 10.
// It is not sufficient to assign `setImmediate` to `requestFlush` because
// `setImmediate` must be called *by name* and therefore must be wrapped in a
// closure.
// Never forget.

// function makeRequestCallFromSetImmediate(callback) {
//     return function requestCall() {
//         setImmediate(callback);
//     };
// }

// Safari 6.0 has a problem where timers will get lost while the user is
// scrolling. This problem does not impact ASAP because Safari 6.0 supports
// mutation observers, so that implementation is used instead.
// However, if we ever elect to use timers in Safari, the prevalent work-around
// is to add a scroll event listener that calls for a flush.

// `setTimeout` does not call the passed callback if the delay is less than
// approximately 7 in web workers in Firefox 8 through 18, and sometimes not
// even then.

function makeRequestCallFromTimer(callback) {
    return function requestCall() {
        // We dispatch a timeout with a specified delay of 0 for engines that
        // can reliably accommodate that request. This will usually be snapped
        // to a 4 milisecond delay, but once we're flushing, there's no delay
        // between events.
        var timeoutHandle = setTimeout(handleTimer, 0);
        // However, since this timer gets frequently dropped in Firefox
        // workers, we enlist an interval handle that will try to fire
        // an event 20 times per second until it succeeds.
        var intervalHandle = setInterval(handleTimer, 50);

        function handleTimer() {
            // Whichever timer succeeds will cancel both timers and
            // execute the callback.
            clearTimeout(timeoutHandle);
            clearInterval(intervalHandle);
            callback();
        }
    };
}

// This is for `asap.js` only.
// Its name will be periodically randomized to break any code that depends on
// its existence.
rawAsap.makeRequestCallFromTimer = makeRequestCallFromTimer;

// ASAP was originally a nextTick shim included in Q. This was factored out
// into this ASAP package. It was later adapted to RSVP which made further
// amendments. These decisions, particularly to marginalize MessageChannel and
// to capture the MutationObserver implementation in a closure, were integrated
// back into ASAP proper.
// https://github.com/tildeio/rsvp.js/blob/cddf7232546a9cf858524b75cde6f9edf72620a7/lib/rsvp/asap.js


}).call(this,typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})
},{}],167:[function(require,module,exports){
(function (process){
"use strict";

var domain; // The domain module is executed on demand
var hasSetImmediate = typeof setImmediate === "function";

// Use the fastest means possible to execute a task in its own turn, with
// priority over other events including network IO events in Node.js.
//
// An exception thrown by a task will permanently interrupt the processing of
// subsequent tasks. The higher level `asap` function ensures that if an
// exception is thrown by a task, that the task queue will continue flushing as
// soon as possible, but if you use `rawAsap` directly, you are responsible to
// either ensure that no exceptions are thrown from your task, or to manually
// call `rawAsap.requestFlush` if an exception is thrown.
module.exports = rawAsap;
function rawAsap(task) {
    if (!queue.length) {
        requestFlush();
        flushing = true;
    }
    // Avoids a function call
    queue[queue.length] = task;
}

var queue = [];
// Once a flush has been requested, no further calls to `requestFlush` are
// necessary until the next `flush` completes.
var flushing = false;
// The position of the next task to execute in the task queue. This is
// preserved between calls to `flush` so that it can be resumed if
// a task throws an exception.
var index = 0;
// If a task schedules additional tasks recursively, the task queue can grown
// unbounded. To prevent memory excaustion, the task queue will periodically
// truncate already-completed tasks.
var capacity = 1024;

// The flush function processes all tasks that have been scheduled with
// `rawAsap` unless and until one of those tasks throws an exception.
// If a task throws an exception, `flush` ensures that its state will remain
// consistent and will resume where it left off when called again.
// However, `flush` does not make any arrangements to be called again if an
// exception is thrown.
function flush() {
    while (index < queue.length) {
        var currentIndex = index;
        // Advance the index before calling the task. This ensures that we will
        // begin flushing on the next task the task throws an error.
        index = index + 1;
        queue[currentIndex].call();
        // Prevent leaking memory for long chains of recursive calls to `asap`.
        // If we call `asap` within tasks scheduled by `asap`, the queue will
        // grow, but to avoid an O(n) walk for every task we execute, we don't
        // shift tasks off the queue after they have been executed.
        // Instead, we periodically shift 1024 tasks off the queue.
        if (index > capacity) {
            // Manually shift all values starting at the index back to the
            // beginning of the queue.
            for (var scan = 0; scan < index; scan++) {
                queue[scan] = queue[scan + index];
            }
            queue.length -= index;
            index = 0;
        }
    }
    queue.length = 0;
    index = 0;
    flushing = false;
}

rawAsap.requestFlush = requestFlush;
function requestFlush() {
    // Ensure flushing is not bound to any domain.
    // It is not sufficient to exit the domain, because domains exist on a stack.
    // To execute code outside of any domain, the following dance is necessary.
    var parentDomain = process.domain;
    if (parentDomain) {
        if (!domain) {
            // Lazy execute the domain module.
            // Only employed if the user elects to use domains.
            domain = require("domain");
        }
        domain.active = process.domain = null;
    }

    // `setImmediate` is slower that `process.nextTick`, but `process.nextTick`
    // cannot handle recursion.
    // `requestFlush` will only be called recursively from `asap.js`, to resume
    // flushing after an error is thrown into a domain.
    // Conveniently, `setImmediate` was introduced in the same version
    // `process.nextTick` started throwing recursion errors.
    if (flushing && hasSetImmediate) {
        setImmediate(flush);
    } else {
        process.nextTick(flush);
    }

    if (parentDomain) {
        domain.active = process.domain = parentDomain;
    }
}


}).call(this,require("FWaASH"))
},{"FWaASH":147,"domain":145}],168:[function(require,module,exports){
(function (process,global){
// Copyright (c) Microsoft Open Technologies, Inc. All rights reserved. See License.txt in the project root for license information.

;(function (undefined) {

  var objectTypes = {
    'boolean': false,
    'function': true,
    'object': true,
    'number': false,
    'string': false,
    'undefined': false
  };

  var root = (objectTypes[typeof window] && window) || this,
    freeExports = objectTypes[typeof exports] && exports && !exports.nodeType && exports,
    freeModule = objectTypes[typeof module] && module && !module.nodeType && module,
    moduleExports = freeModule && freeModule.exports === freeExports && freeExports,
    freeGlobal = objectTypes[typeof global] && global;

  if (freeGlobal && (freeGlobal.global === freeGlobal || freeGlobal.window === freeGlobal)) {
    root = freeGlobal;
  }

  var Rx = {
      internals: {},
      config: {
        Promise: root.Promise
      },
      helpers: { }
  };

  // Defaults
  var noop = Rx.helpers.noop = function () { },
    notDefined = Rx.helpers.notDefined = function (x) { return typeof x === 'undefined'; },
    isScheduler = Rx.helpers.isScheduler = function (x) { return x instanceof Rx.Scheduler; },
    identity = Rx.helpers.identity = function (x) { return x; },
    pluck = Rx.helpers.pluck = function (property) { return function (x) { return x[property]; }; },
    just = Rx.helpers.just = function (value) { return function () { return value; }; },
    defaultNow = Rx.helpers.defaultNow = Date.now,
    defaultComparer = Rx.helpers.defaultComparer = function (x, y) { return isEqual(x, y); },
    defaultSubComparer = Rx.helpers.defaultSubComparer = function (x, y) { return x > y ? 1 : (x < y ? -1 : 0); },
    defaultKeySerializer = Rx.helpers.defaultKeySerializer = function (x) { return x.toString(); },
    defaultError = Rx.helpers.defaultError = function (err) { throw err; },
    isPromise = Rx.helpers.isPromise = function (p) { return !!p && typeof p.then === 'function'; },
    asArray = Rx.helpers.asArray = function () { return Array.prototype.slice.call(arguments); },
    not = Rx.helpers.not = function (a) { return !a; },
    isFunction = Rx.helpers.isFunction = (function () {

      var isFn = function (value) {
        return typeof value == 'function' || false;
      }

      // fallback for older versions of Chrome and Safari
      if (isFn(/x/)) {
        isFn = function(value) {
          return typeof value == 'function' && toString.call(value) == '[object Function]';
        };
      }

      return isFn;
    }());

  function cloneArray(arr) { for(var a = [], i = 0, len = arr.length; i < len; i++) { a.push(arr[i]); } return a;}

  Rx.config.longStackSupport = false;
  var hasStacks = false;
  try {
    throw new Error();
  } catch (e) {
    hasStacks = !!e.stack;
  }

  // All code after this point will be filtered from stack traces reported by RxJS
  var rStartingLine = captureLine(), rFileName;

  var STACK_JUMP_SEPARATOR = "From previous event:";

  function makeStackTraceLong(error, observable) {
      // If possible, transform the error stack trace by removing Node and RxJS
      // cruft, then concatenating with the stack trace of `observable`.
      if (hasStacks &&
          observable.stack &&
          typeof error === "object" &&
          error !== null &&
          error.stack &&
          error.stack.indexOf(STACK_JUMP_SEPARATOR) === -1
      ) {
        var stacks = [];
        for (var o = observable; !!o; o = o.source) {
          if (o.stack) {
            stacks.unshift(o.stack);
          }
        }
        stacks.unshift(error.stack);

        var concatedStacks = stacks.join("\n" + STACK_JUMP_SEPARATOR + "\n");
        error.stack = filterStackString(concatedStacks);
    }
  }

  function filterStackString(stackString) {
    var lines = stackString.split("\n"),
        desiredLines = [];
    for (var i = 0, len = lines.length; i < len; i++) {
      var line = lines[i];

      if (!isInternalFrame(line) && !isNodeFrame(line) && line) {
        desiredLines.push(line);
      }
    }
    return desiredLines.join("\n");
  }

  function isInternalFrame(stackLine) {
    var fileNameAndLineNumber = getFileNameAndLineNumber(stackLine);
    if (!fileNameAndLineNumber) {
      return false;
    }
    var fileName = fileNameAndLineNumber[0], lineNumber = fileNameAndLineNumber[1];

    return fileName === rFileName &&
      lineNumber >= rStartingLine &&
      lineNumber <= rEndingLine;
  }

  function isNodeFrame(stackLine) {
    return stackLine.indexOf("(module.js:") !== -1 ||
      stackLine.indexOf("(node.js:") !== -1;
  }

  function captureLine() {
    if (!hasStacks) { return; }

    try {
      throw new Error();
    } catch (e) {
      var lines = e.stack.split("\n");
      var firstLine = lines[0].indexOf("@") > 0 ? lines[1] : lines[2];
      var fileNameAndLineNumber = getFileNameAndLineNumber(firstLine);
      if (!fileNameAndLineNumber) { return; }

      rFileName = fileNameAndLineNumber[0];
      return fileNameAndLineNumber[1];
    }
  }

  function getFileNameAndLineNumber(stackLine) {
    // Named functions: "at functionName (filename:lineNumber:columnNumber)"
    var attempt1 = /at .+ \((.+):(\d+):(?:\d+)\)$/.exec(stackLine);
    if (attempt1) { return [attempt1[1], Number(attempt1[2])]; }

    // Anonymous functions: "at filename:lineNumber:columnNumber"
    var attempt2 = /at ([^ ]+):(\d+):(?:\d+)$/.exec(stackLine);
    if (attempt2) { return [attempt2[1], Number(attempt2[2])]; }

    // Firefox style: "function@filename:lineNumber or @filename:lineNumber"
    var attempt3 = /.*@(.+):(\d+)$/.exec(stackLine);
    if (attempt3) { return [attempt3[1], Number(attempt3[2])]; }
  }

  var EmptyError = Rx.EmptyError = function() {
    this.message = 'Sequence contains no elements.';
    Error.call(this);
  };
  EmptyError.prototype = Error.prototype;

  var ObjectDisposedError = Rx.ObjectDisposedError = function() {
    this.message = 'Object has been disposed';
    Error.call(this);
  };
  ObjectDisposedError.prototype = Error.prototype;

  var ArgumentOutOfRangeError = Rx.ArgumentOutOfRangeError = function () {
    this.message = 'Argument out of range';
    Error.call(this);
  };
  ArgumentOutOfRangeError.prototype = Error.prototype;

  var NotSupportedError = Rx.NotSupportedError = function (message) {
    this.message = message || 'This operation is not supported';
    Error.call(this);
  };
  NotSupportedError.prototype = Error.prototype;

  var NotImplementedError = Rx.NotImplementedError = function (message) {
    this.message = message || 'This operation is not implemented';
    Error.call(this);
  };
  NotImplementedError.prototype = Error.prototype;

  var notImplemented = Rx.helpers.notImplemented = function () {
    throw new NotImplementedError();
  };

  var notSupported = Rx.helpers.notSupported = function () {
    throw new NotSupportedError();
  };

  // Shim in iterator support
  var $iterator$ = (typeof Symbol === 'function' && Symbol.iterator) ||
    '_es6shim_iterator_';
  // Bug for mozilla version
  if (root.Set && typeof new root.Set()['@@iterator'] === 'function') {
    $iterator$ = '@@iterator';
  }

  var doneEnumerator = Rx.doneEnumerator = { done: true, value: undefined };

  var isIterable = Rx.helpers.isIterable = function (o) {
    return o[$iterator$] !== undefined;
  }

  var isArrayLike = Rx.helpers.isArrayLike = function (o) {
    return o && o.length !== undefined;
  }

  Rx.helpers.iterator = $iterator$;

  var bindCallback = Rx.internals.bindCallback = function (func, thisArg, argCount) {
    if (typeof thisArg === 'undefined') { return func; }
    switch(argCount) {
      case 0:
        return function() {
          return func.call(thisArg)
        };
      case 1:
        return function(arg) {
          return func.call(thisArg, arg);
        }
      case 2:
        return function(value, index) {
          return func.call(thisArg, value, index);
        };
      case 3:
        return function(value, index, collection) {
          return func.call(thisArg, value, index, collection);
        };
    }

    return function() {
      return func.apply(thisArg, arguments);
    };
  };

  /** Used to determine if values are of the language type Object */
  var dontEnums = ['toString',
    'toLocaleString',
    'valueOf',
    'hasOwnProperty',
    'isPrototypeOf',
    'propertyIsEnumerable',
    'constructor'],
  dontEnumsLength = dontEnums.length;

  /** `Object#toString` result shortcuts */
  var argsClass = '[object Arguments]',
    arrayClass = '[object Array]',
    boolClass = '[object Boolean]',
    dateClass = '[object Date]',
    errorClass = '[object Error]',
    funcClass = '[object Function]',
    numberClass = '[object Number]',
    objectClass = '[object Object]',
    regexpClass = '[object RegExp]',
    stringClass = '[object String]';

  var toString = Object.prototype.toString,
    hasOwnProperty = Object.prototype.hasOwnProperty,
    supportsArgsClass = toString.call(arguments) == argsClass, // For less <IE9 && FF<4
    supportNodeClass,
    errorProto = Error.prototype,
    objectProto = Object.prototype,
    stringProto = String.prototype,
    propertyIsEnumerable = objectProto.propertyIsEnumerable;

  try {
    supportNodeClass = !(toString.call(document) == objectClass && !({ 'toString': 0 } + ''));
  } catch (e) {
    supportNodeClass = true;
  }

  var nonEnumProps = {};
  nonEnumProps[arrayClass] = nonEnumProps[dateClass] = nonEnumProps[numberClass] = { 'constructor': true, 'toLocaleString': true, 'toString': true, 'valueOf': true };
  nonEnumProps[boolClass] = nonEnumProps[stringClass] = { 'constructor': true, 'toString': true, 'valueOf': true };
  nonEnumProps[errorClass] = nonEnumProps[funcClass] = nonEnumProps[regexpClass] = { 'constructor': true, 'toString': true };
  nonEnumProps[objectClass] = { 'constructor': true };

  var support = {};
  (function () {
    var ctor = function() { this.x = 1; },
      props = [];

    ctor.prototype = { 'valueOf': 1, 'y': 1 };
    for (var key in new ctor) { props.push(key); }
    for (key in arguments) { }

    // Detect if `name` or `message` properties of `Error.prototype` are enumerable by default.
    support.enumErrorProps = propertyIsEnumerable.call(errorProto, 'message') || propertyIsEnumerable.call(errorProto, 'name');

    // Detect if `prototype` properties are enumerable by default.
    support.enumPrototypes = propertyIsEnumerable.call(ctor, 'prototype');

    // Detect if `arguments` object indexes are non-enumerable
    support.nonEnumArgs = key != 0;

    // Detect if properties shadowing those on `Object.prototype` are non-enumerable.
    support.nonEnumShadows = !/valueOf/.test(props);
  }(1));

  var isObject = Rx.internals.isObject = function(value) {
    var type = typeof value;
    return value && (type == 'function' || type == 'object') || false;
  };

  function keysIn(object) {
    var result = [];
    if (!isObject(object)) {
      return result;
    }
    if (support.nonEnumArgs && object.length && isArguments(object)) {
      object = slice.call(object);
    }
    var skipProto = support.enumPrototypes && typeof object == 'function',
        skipErrorProps = support.enumErrorProps && (object === errorProto || object instanceof Error);

    for (var key in object) {
      if (!(skipProto && key == 'prototype') &&
          !(skipErrorProps && (key == 'message' || key == 'name'))) {
        result.push(key);
      }
    }

    if (support.nonEnumShadows && object !== objectProto) {
      var ctor = object.constructor,
          index = -1,
          length = dontEnumsLength;

      if (object === (ctor && ctor.prototype)) {
        var className = object === stringProto ? stringClass : object === errorProto ? errorClass : toString.call(object),
            nonEnum = nonEnumProps[className];
      }
      while (++index < length) {
        key = dontEnums[index];
        if (!(nonEnum && nonEnum[key]) && hasOwnProperty.call(object, key)) {
          result.push(key);
        }
      }
    }
    return result;
  }

  function internalFor(object, callback, keysFunc) {
    var index = -1,
      props = keysFunc(object),
      length = props.length;

    while (++index < length) {
      var key = props[index];
      if (callback(object[key], key, object) === false) {
        break;
      }
    }
    return object;
  }

  function internalForIn(object, callback) {
    return internalFor(object, callback, keysIn);
  }

  function isNode(value) {
    // IE < 9 presents DOM nodes as `Object` objects except they have `toString`
    // methods that are `typeof` "string" and still can coerce nodes to strings
    return typeof value.toString != 'function' && typeof (value + '') == 'string';
  }

  var isArguments = function(value) {
    return (value && typeof value == 'object') ? toString.call(value) == argsClass : false;
  }

  // fallback for browsers that can't detect `arguments` objects by [[Class]]
  if (!supportsArgsClass) {
    isArguments = function(value) {
      return (value && typeof value == 'object') ? hasOwnProperty.call(value, 'callee') : false;
    };
  }

  var isEqual = Rx.internals.isEqual = function (x, y) {
    return deepEquals(x, y, [], []);
  };

  /** @private
   * Used for deep comparison
   **/
  function deepEquals(a, b, stackA, stackB) {
    // exit early for identical values
    if (a === b) {
      // treat `+0` vs. `-0` as not equal
      return a !== 0 || (1 / a == 1 / b);
    }

    var type = typeof a,
        otherType = typeof b;

    // exit early for unlike primitive values
    if (a === a && (a == null || b == null ||
        (type != 'function' && type != 'object' && otherType != 'function' && otherType != 'object'))) {
      return false;
    }

    // compare [[Class]] names
    var className = toString.call(a),
        otherClass = toString.call(b);

    if (className == argsClass) {
      className = objectClass;
    }
    if (otherClass == argsClass) {
      otherClass = objectClass;
    }
    if (className != otherClass) {
      return false;
    }
    switch (className) {
      case boolClass:
      case dateClass:
        // coerce dates and booleans to numbers, dates to milliseconds and booleans
        // to `1` or `0` treating invalid dates coerced to `NaN` as not equal
        return +a == +b;

      case numberClass:
        // treat `NaN` vs. `NaN` as equal
        return (a != +a) ?
          b != +b :
          // but treat `-0` vs. `+0` as not equal
          (a == 0 ? (1 / a == 1 / b) : a == +b);

      case regexpClass:
      case stringClass:
        // coerce regexes to strings (http://es5.github.io/#x15.10.6.4)
        // treat string primitives and their corresponding object instances as equal
        return a == String(b);
    }
    var isArr = className == arrayClass;
    if (!isArr) {

      // exit for functions and DOM nodes
      if (className != objectClass || (!support.nodeClass && (isNode(a) || isNode(b)))) {
        return false;
      }
      // in older versions of Opera, `arguments` objects have `Array` constructors
      var ctorA = !support.argsObject && isArguments(a) ? Object : a.constructor,
          ctorB = !support.argsObject && isArguments(b) ? Object : b.constructor;

      // non `Object` object instances with different constructors are not equal
      if (ctorA != ctorB &&
            !(hasOwnProperty.call(a, 'constructor') && hasOwnProperty.call(b, 'constructor')) &&
            !(isFunction(ctorA) && ctorA instanceof ctorA && isFunction(ctorB) && ctorB instanceof ctorB) &&
            ('constructor' in a && 'constructor' in b)
          ) {
        return false;
      }
    }
    // assume cyclic structures are equal
    // the algorithm for detecting cyclic structures is adapted from ES 5.1
    // section 15.12.3, abstract operation `JO` (http://es5.github.io/#x15.12.3)
    var initedStack = !stackA;
    stackA || (stackA = []);
    stackB || (stackB = []);

    var length = stackA.length;
    while (length--) {
      if (stackA[length] == a) {
        return stackB[length] == b;
      }
    }
    var size = 0;
    var result = true;

    // add `a` and `b` to the stack of traversed objects
    stackA.push(a);
    stackB.push(b);

    // recursively compare objects and arrays (susceptible to call stack limits)
    if (isArr) {
      // compare lengths to determine if a deep comparison is necessary
      length = a.length;
      size = b.length;
      result = size == length;

      if (result) {
        // deep compare the contents, ignoring non-numeric properties
        while (size--) {
          var index = length,
              value = b[size];

          if (!(result = deepEquals(a[size], value, stackA, stackB))) {
            break;
          }
        }
      }
    }
    else {
      // deep compare objects using `forIn`, instead of `forOwn`, to avoid `Object.keys`
      // which, in this case, is more costly
      internalForIn(b, function(value, key, b) {
        if (hasOwnProperty.call(b, key)) {
          // count the number of properties.
          size++;
          // deep compare each property value.
          return (result = hasOwnProperty.call(a, key) && deepEquals(a[key], value, stackA, stackB));
        }
      });

      if (result) {
        // ensure both objects have the same number of properties
        internalForIn(a, function(value, key, a) {
          if (hasOwnProperty.call(a, key)) {
            // `size` will be `-1` if `a` has more properties than `b`
            return (result = --size > -1);
          }
        });
      }
    }
    stackA.pop();
    stackB.pop();

    return result;
  }

  var hasProp = {}.hasOwnProperty,
      slice = Array.prototype.slice;

  var inherits = this.inherits = Rx.internals.inherits = function (child, parent) {
    function __() { this.constructor = child; }
    __.prototype = parent.prototype;
    child.prototype = new __();
  };

  var addProperties = Rx.internals.addProperties = function (obj) {
    for(var sources = [], i = 1, len = arguments.length; i < len; i++) { sources.push(arguments[i]); }
    for (var idx = 0, ln = sources.length; idx < ln; idx++) {
      var source = sources[idx];
      for (var prop in source) {
        obj[prop] = source[prop];
      }
    }
  };

  // Rx Utils
  var addRef = Rx.internals.addRef = function (xs, r) {
    return new AnonymousObservable(function (observer) {
      return new CompositeDisposable(r.getDisposable(), xs.subscribe(observer));
    });
  };

  function arrayInitialize(count, factory) {
    var a = new Array(count);
    for (var i = 0; i < count; i++) {
      a[i] = factory();
    }
    return a;
  }

  var errorObj = {e: {}};
  var tryCatchTarget;
  function tryCatcher() {
    try {
      return tryCatchTarget.apply(this, arguments);
    } catch (e) {
      errorObj.e = e;
      return errorObj;
    }
  }
  function tryCatch(fn) {
    if (!isFunction(fn)) { throw new TypeError('fn must be a function'); }
    tryCatchTarget = fn;
    return tryCatcher;
  }
  function thrower(e) {
    throw e;
  }

  // Collections
  function IndexedItem(id, value) {
    this.id = id;
    this.value = value;
  }

  IndexedItem.prototype.compareTo = function (other) {
    var c = this.value.compareTo(other.value);
    c === 0 && (c = this.id - other.id);
    return c;
  };

  // Priority Queue for Scheduling
  var PriorityQueue = Rx.internals.PriorityQueue = function (capacity) {
    this.items = new Array(capacity);
    this.length = 0;
  };

  var priorityProto = PriorityQueue.prototype;
  priorityProto.isHigherPriority = function (left, right) {
    return this.items[left].compareTo(this.items[right]) < 0;
  };

  priorityProto.percolate = function (index) {
    if (index >= this.length || index < 0) { return; }
    var parent = index - 1 >> 1;
    if (parent < 0 || parent === index) { return; }
    if (this.isHigherPriority(index, parent)) {
      var temp = this.items[index];
      this.items[index] = this.items[parent];
      this.items[parent] = temp;
      this.percolate(parent);
    }
  };

  priorityProto.heapify = function (index) {
    +index || (index = 0);
    if (index >= this.length || index < 0) { return; }
    var left = 2 * index + 1,
        right = 2 * index + 2,
        first = index;
    if (left < this.length && this.isHigherPriority(left, first)) {
      first = left;
    }
    if (right < this.length && this.isHigherPriority(right, first)) {
      first = right;
    }
    if (first !== index) {
      var temp = this.items[index];
      this.items[index] = this.items[first];
      this.items[first] = temp;
      this.heapify(first);
    }
  };

  priorityProto.peek = function () { return this.items[0].value; };

  priorityProto.removeAt = function (index) {
    this.items[index] = this.items[--this.length];
    this.items[this.length] = undefined;
    this.heapify();
  };

  priorityProto.dequeue = function () {
    var result = this.peek();
    this.removeAt(0);
    return result;
  };

  priorityProto.enqueue = function (item) {
    var index = this.length++;
    this.items[index] = new IndexedItem(PriorityQueue.count++, item);
    this.percolate(index);
  };

  priorityProto.remove = function (item) {
    for (var i = 0; i < this.length; i++) {
      if (this.items[i].value === item) {
        this.removeAt(i);
        return true;
      }
    }
    return false;
  };
  PriorityQueue.count = 0;

  /**
   * Represents a group of disposable resources that are disposed together.
   * @constructor
   */
  var CompositeDisposable = Rx.CompositeDisposable = function () {
    var args = [], i, len;
    if (Array.isArray(arguments[0])) {
      args = arguments[0];
      len = args.length;
    } else {
      len = arguments.length;
      args = new Array(len);
      for(i = 0; i < len; i++) { args[i] = arguments[i]; }
    }
    for(i = 0; i < len; i++) {
      if (!isDisposable(args[i])) { throw new TypeError('Not a disposable'); }
    }
    this.disposables = args;
    this.isDisposed = false;
    this.length = args.length;
  };

  var CompositeDisposablePrototype = CompositeDisposable.prototype;

  /**
   * Adds a disposable to the CompositeDisposable or disposes the disposable if the CompositeDisposable is disposed.
   * @param {Mixed} item Disposable to add.
   */
  CompositeDisposablePrototype.add = function (item) {
    if (this.isDisposed) {
      item.dispose();
    } else {
      this.disposables.push(item);
      this.length++;
    }
  };

  /**
   * Removes and disposes the first occurrence of a disposable from the CompositeDisposable.
   * @param {Mixed} item Disposable to remove.
   * @returns {Boolean} true if found; false otherwise.
   */
  CompositeDisposablePrototype.remove = function (item) {
    var shouldDispose = false;
    if (!this.isDisposed) {
      var idx = this.disposables.indexOf(item);
      if (idx !== -1) {
        shouldDispose = true;
        this.disposables.splice(idx, 1);
        this.length--;
        item.dispose();
      }
    }
    return shouldDispose;
  };

  /**
   *  Disposes all disposables in the group and removes them from the group.
   */
  CompositeDisposablePrototype.dispose = function () {
    if (!this.isDisposed) {
      this.isDisposed = true;
      var len = this.disposables.length, currentDisposables = new Array(len);
      for(var i = 0; i < len; i++) { currentDisposables[i] = this.disposables[i]; }
      this.disposables = [];
      this.length = 0;

      for (i = 0; i < len; i++) {
        currentDisposables[i].dispose();
      }
    }
  };

  /**
   * Provides a set of static methods for creating Disposables.
   * @param {Function} dispose Action to run during the first call to dispose. The action is guaranteed to be run at most once.
   */
  var Disposable = Rx.Disposable = function (action) {
    this.isDisposed = false;
    this.action = action || noop;
  };

  /** Performs the task of cleaning up resources. */
  Disposable.prototype.dispose = function () {
    if (!this.isDisposed) {
      this.action();
      this.isDisposed = true;
    }
  };

  /**
   * Creates a disposable object that invokes the specified action when disposed.
   * @param {Function} dispose Action to run during the first call to dispose. The action is guaranteed to be run at most once.
   * @return {Disposable} The disposable object that runs the given action upon disposal.
   */
  var disposableCreate = Disposable.create = function (action) { return new Disposable(action); };

  /**
   * Gets the disposable that does nothing when disposed.
   */
  var disposableEmpty = Disposable.empty = { dispose: noop };

  /**
   * Validates whether the given object is a disposable
   * @param {Object} Object to test whether it has a dispose method
   * @returns {Boolean} true if a disposable object, else false.
   */
  var isDisposable = Disposable.isDisposable = function (d) {
    return d && isFunction(d.dispose);
  };

  var checkDisposed = Disposable.checkDisposed = function (disposable) {
    if (disposable.isDisposed) { throw new ObjectDisposedError(); }
  };

  var SingleAssignmentDisposable = Rx.SingleAssignmentDisposable = (function () {
    function BooleanDisposable () {
      this.isDisposed = false;
      this.current = null;
    }

    var booleanDisposablePrototype = BooleanDisposable.prototype;

    /**
     * Gets the underlying disposable.
     * @return The underlying disposable.
     */
    booleanDisposablePrototype.getDisposable = function () {
      return this.current;
    };

    /**
     * Sets the underlying disposable.
     * @param {Disposable} value The new underlying disposable.
     */
    booleanDisposablePrototype.setDisposable = function (value) {
      var shouldDispose = this.isDisposed;
      if (!shouldDispose) {
        var old = this.current;
        this.current = value;
      }
      old && old.dispose();
      shouldDispose && value && value.dispose();
    };

    /**
     * Disposes the underlying disposable as well as all future replacements.
     */
    booleanDisposablePrototype.dispose = function () {
      if (!this.isDisposed) {
        this.isDisposed = true;
        var old = this.current;
        this.current = null;
      }
      old && old.dispose();
    };

    return BooleanDisposable;
  }());
  var SerialDisposable = Rx.SerialDisposable = SingleAssignmentDisposable;

  /**
   * Represents a disposable resource that only disposes its underlying disposable resource when all dependent disposable objects have been disposed.
   */
  var RefCountDisposable = Rx.RefCountDisposable = (function () {

    function InnerDisposable(disposable) {
      this.disposable = disposable;
      this.disposable.count++;
      this.isInnerDisposed = false;
    }

    InnerDisposable.prototype.dispose = function () {
      if (!this.disposable.isDisposed && !this.isInnerDisposed) {
        this.isInnerDisposed = true;
        this.disposable.count--;
        if (this.disposable.count === 0 && this.disposable.isPrimaryDisposed) {
          this.disposable.isDisposed = true;
          this.disposable.underlyingDisposable.dispose();
        }
      }
    };

    /**
     * Initializes a new instance of the RefCountDisposable with the specified disposable.
     * @constructor
     * @param {Disposable} disposable Underlying disposable.
      */
    function RefCountDisposable(disposable) {
      this.underlyingDisposable = disposable;
      this.isDisposed = false;
      this.isPrimaryDisposed = false;
      this.count = 0;
    }

    /**
     * Disposes the underlying disposable only when all dependent disposables have been disposed
     */
    RefCountDisposable.prototype.dispose = function () {
      if (!this.isDisposed && !this.isPrimaryDisposed) {
        this.isPrimaryDisposed = true;
        if (this.count === 0) {
          this.isDisposed = true;
          this.underlyingDisposable.dispose();
        }
      }
    };

    /**
     * Returns a dependent disposable that when disposed decreases the refcount on the underlying disposable.
     * @returns {Disposable} A dependent disposable contributing to the reference count that manages the underlying disposable's lifetime.
     */
    RefCountDisposable.prototype.getDisposable = function () {
      return this.isDisposed ? disposableEmpty : new InnerDisposable(this);
    };

    return RefCountDisposable;
  })();

  function ScheduledDisposable(scheduler, disposable) {
    this.scheduler = scheduler;
    this.disposable = disposable;
    this.isDisposed = false;
  }

  function scheduleItem(s, self) {
    if (!self.isDisposed) {
      self.isDisposed = true;
      self.disposable.dispose();
    }
  }

  ScheduledDisposable.prototype.dispose = function () {
    this.scheduler.scheduleWithState(this, scheduleItem);
  };

  var ScheduledItem = Rx.internals.ScheduledItem = function (scheduler, state, action, dueTime, comparer) {
    this.scheduler = scheduler;
    this.state = state;
    this.action = action;
    this.dueTime = dueTime;
    this.comparer = comparer || defaultSubComparer;
    this.disposable = new SingleAssignmentDisposable();
  }

  ScheduledItem.prototype.invoke = function () {
    this.disposable.setDisposable(this.invokeCore());
  };

  ScheduledItem.prototype.compareTo = function (other) {
    return this.comparer(this.dueTime, other.dueTime);
  };

  ScheduledItem.prototype.isCancelled = function () {
    return this.disposable.isDisposed;
  };

  ScheduledItem.prototype.invokeCore = function () {
    return this.action(this.scheduler, this.state);
  };

  /** Provides a set of static properties to access commonly used schedulers. */
  var Scheduler = Rx.Scheduler = (function () {

    function Scheduler(now, schedule, scheduleRelative, scheduleAbsolute) {
      this.now = now;
      this._schedule = schedule;
      this._scheduleRelative = scheduleRelative;
      this._scheduleAbsolute = scheduleAbsolute;
    }

    function invokeAction(scheduler, action) {
      action();
      return disposableEmpty;
    }

    var schedulerProto = Scheduler.prototype;

    /**
     * Schedules an action to be executed.
     * @param {Function} action Action to execute.
     * @returns {Disposable} The disposable object used to cancel the scheduled action (best effort).
     */
    schedulerProto.schedule = function (action) {
      return this._schedule(action, invokeAction);
    };

    /**
     * Schedules an action to be executed.
     * @param state State passed to the action to be executed.
     * @param {Function} action Action to be executed.
     * @returns {Disposable} The disposable object used to cancel the scheduled action (best effort).
     */
    schedulerProto.scheduleWithState = function (state, action) {
      return this._schedule(state, action);
    };

    /**
     * Schedules an action to be executed after the specified relative due time.
     * @param {Function} action Action to execute.
     * @param {Number} dueTime Relative time after which to execute the action.
     * @returns {Disposable} The disposable object used to cancel the scheduled action (best effort).
     */
    schedulerProto.scheduleWithRelative = function (dueTime, action) {
      return this._scheduleRelative(action, dueTime, invokeAction);
    };

    /**
     * Schedules an action to be executed after dueTime.
     * @param state State passed to the action to be executed.
     * @param {Function} action Action to be executed.
     * @param {Number} dueTime Relative time after which to execute the action.
     * @returns {Disposable} The disposable object used to cancel the scheduled action (best effort).
     */
    schedulerProto.scheduleWithRelativeAndState = function (state, dueTime, action) {
      return this._scheduleRelative(state, dueTime, action);
    };

    /**
     * Schedules an action to be executed at the specified absolute due time.
     * @param {Function} action Action to execute.
     * @param {Number} dueTime Absolute time at which to execute the action.
     * @returns {Disposable} The disposable object used to cancel the scheduled action (best effort).
      */
    schedulerProto.scheduleWithAbsolute = function (dueTime, action) {
      return this._scheduleAbsolute(action, dueTime, invokeAction);
    };

    /**
     * Schedules an action to be executed at dueTime.
     * @param {Mixed} state State passed to the action to be executed.
     * @param {Function} action Action to be executed.
     * @param {Number}dueTime Absolute time at which to execute the action.
     * @returns {Disposable} The disposable object used to cancel the scheduled action (best effort).
     */
    schedulerProto.scheduleWithAbsoluteAndState = function (state, dueTime, action) {
      return this._scheduleAbsolute(state, dueTime, action);
    };

    /** Gets the current time according to the local machine's system clock. */
    Scheduler.now = defaultNow;

    /**
     * Normalizes the specified TimeSpan value to a positive value.
     * @param {Number} timeSpan The time span value to normalize.
     * @returns {Number} The specified TimeSpan value if it is zero or positive; otherwise, 0
     */
    Scheduler.normalize = function (timeSpan) {
      timeSpan < 0 && (timeSpan = 0);
      return timeSpan;
    };

    return Scheduler;
  }());

  var normalizeTime = Scheduler.normalize;

  (function (schedulerProto) {

    function invokeRecImmediate(scheduler, pair) {
      var state = pair[0], action = pair[1], group = new CompositeDisposable();

      function recursiveAction(state1) {
        action(state1, function (state2) {
          var isAdded = false, isDone = false,
          d = scheduler.scheduleWithState(state2, function (scheduler1, state3) {
            if (isAdded) {
              group.remove(d);
            } else {
              isDone = true;
            }
            recursiveAction(state3);
            return disposableEmpty;
          });
          if (!isDone) {
            group.add(d);
            isAdded = true;
          }
        });
      }

      recursiveAction(state);
      return group;
    }

    function invokeRecDate(scheduler, pair, method) {
      var state = pair[0], action = pair[1], group = new CompositeDisposable();
      function recursiveAction(state1) {
        action(state1, function (state2, dueTime1) {
          var isAdded = false, isDone = false,
          d = scheduler[method](state2, dueTime1, function (scheduler1, state3) {
            if (isAdded) {
              group.remove(d);
            } else {
              isDone = true;
            }
            recursiveAction(state3);
            return disposableEmpty;
          });
          if (!isDone) {
            group.add(d);
            isAdded = true;
          }
        });
      };
      recursiveAction(state);
      return group;
    }

    function scheduleInnerRecursive(action, self) {
      action(function(dt) { self(action, dt); });
    }

    /**
     * Schedules an action to be executed recursively.
     * @param {Function} action Action to execute recursively. The parameter passed to the action is used to trigger recursive scheduling of the action.
     * @returns {Disposable} The disposable object used to cancel the scheduled action (best effort).
     */
    schedulerProto.scheduleRecursive = function (action) {
      return this.scheduleRecursiveWithState(action, function (_action, self) {
        _action(function () { self(_action); }); });
    };

    /**
     * Schedules an action to be executed recursively.
     * @param {Mixed} state State passed to the action to be executed.
     * @param {Function} action Action to execute recursively. The last parameter passed to the action is used to trigger recursive scheduling of the action, passing in recursive invocation state.
     * @returns {Disposable} The disposable object used to cancel the scheduled action (best effort).
     */
    schedulerProto.scheduleRecursiveWithState = function (state, action) {
      return this.scheduleWithState([state, action], invokeRecImmediate);
    };

    /**
     * Schedules an action to be executed recursively after a specified relative due time.
     * @param {Function} action Action to execute recursively. The parameter passed to the action is used to trigger recursive scheduling of the action at the specified relative time.
     * @param {Number}dueTime Relative time after which to execute the action for the first time.
     * @returns {Disposable} The disposable object used to cancel the scheduled action (best effort).
     */
    schedulerProto.scheduleRecursiveWithRelative = function (dueTime, action) {
      return this.scheduleRecursiveWithRelativeAndState(action, dueTime, scheduleInnerRecursive);
    };

    /**
     * Schedules an action to be executed recursively after a specified relative due time.
     * @param {Mixed} state State passed to the action to be executed.
     * @param {Function} action Action to execute recursively. The last parameter passed to the action is used to trigger recursive scheduling of the action, passing in the recursive due time and invocation state.
     * @param {Number}dueTime Relative time after which to execute the action for the first time.
     * @returns {Disposable} The disposable object used to cancel the scheduled action (best effort).
     */
    schedulerProto.scheduleRecursiveWithRelativeAndState = function (state, dueTime, action) {
      return this._scheduleRelative([state, action], dueTime, function (s, p) {
        return invokeRecDate(s, p, 'scheduleWithRelativeAndState');
      });
    };

    /**
     * Schedules an action to be executed recursively at a specified absolute due time.
     * @param {Function} action Action to execute recursively. The parameter passed to the action is used to trigger recursive scheduling of the action at the specified absolute time.
     * @param {Number}dueTime Absolute time at which to execute the action for the first time.
     * @returns {Disposable} The disposable object used to cancel the scheduled action (best effort).
     */
    schedulerProto.scheduleRecursiveWithAbsolute = function (dueTime, action) {
      return this.scheduleRecursiveWithAbsoluteAndState(action, dueTime, scheduleInnerRecursive);
    };

    /**
     * Schedules an action to be executed recursively at a specified absolute due time.
     * @param {Mixed} state State passed to the action to be executed.
     * @param {Function} action Action to execute recursively. The last parameter passed to the action is used to trigger recursive scheduling of the action, passing in the recursive due time and invocation state.
     * @param {Number}dueTime Absolute time at which to execute the action for the first time.
     * @returns {Disposable} The disposable object used to cancel the scheduled action (best effort).
     */
    schedulerProto.scheduleRecursiveWithAbsoluteAndState = function (state, dueTime, action) {
      return this._scheduleAbsolute([state, action], dueTime, function (s, p) {
        return invokeRecDate(s, p, 'scheduleWithAbsoluteAndState');
      });
    };
  }(Scheduler.prototype));

  (function (schedulerProto) {

    /**
     * Schedules a periodic piece of work by dynamically discovering the scheduler's capabilities. The periodic task will be scheduled using window.setInterval for the base implementation.
     * @param {Number} period Period for running the work periodically.
     * @param {Function} action Action to be executed.
     * @returns {Disposable} The disposable object used to cancel the scheduled recurring action (best effort).
     */
    Scheduler.prototype.schedulePeriodic = function (period, action) {
      return this.schedulePeriodicWithState(null, period, action);
    };

    /**
     * Schedules a periodic piece of work by dynamically discovering the scheduler's capabilities. The periodic task will be scheduled using window.setInterval for the base implementation.
     * @param {Mixed} state Initial state passed to the action upon the first iteration.
     * @param {Number} period Period for running the work periodically.
     * @param {Function} action Action to be executed, potentially updating the state.
     * @returns {Disposable} The disposable object used to cancel the scheduled recurring action (best effort).
     */
    Scheduler.prototype.schedulePeriodicWithState = function(state, period, action) {
      if (typeof root.setInterval === 'undefined') { throw new NotSupportedError(); }
      period = normalizeTime(period);
      var s = state, id = root.setInterval(function () { s = action(s); }, period);
      return disposableCreate(function () { root.clearInterval(id); });
    };

  }(Scheduler.prototype));

  (function (schedulerProto) {
    /**
     * Returns a scheduler that wraps the original scheduler, adding exception handling for scheduled actions.
     * @param {Function} handler Handler that's run if an exception is caught. The exception will be rethrown if the handler returns false.
     * @returns {Scheduler} Wrapper around the original scheduler, enforcing exception handling.
     */
    schedulerProto.catchError = schedulerProto['catch'] = function (handler) {
      return new CatchScheduler(this, handler);
    };
  }(Scheduler.prototype));

  var SchedulePeriodicRecursive = Rx.internals.SchedulePeriodicRecursive = (function () {
    function tick(command, recurse) {
      recurse(0, this._period);
      try {
        this._state = this._action(this._state);
      } catch (e) {
        this._cancel.dispose();
        throw e;
      }
    }

    function SchedulePeriodicRecursive(scheduler, state, period, action) {
      this._scheduler = scheduler;
      this._state = state;
      this._period = period;
      this._action = action;
    }

    SchedulePeriodicRecursive.prototype.start = function () {
      var d = new SingleAssignmentDisposable();
      this._cancel = d;
      d.setDisposable(this._scheduler.scheduleRecursiveWithRelativeAndState(0, this._period, tick.bind(this)));

      return d;
    };

    return SchedulePeriodicRecursive;
  }());

  /** Gets a scheduler that schedules work immediately on the current thread. */
  var immediateScheduler = Scheduler.immediate = (function () {
    function scheduleNow(state, action) { return action(this, state); }
    return new Scheduler(defaultNow, scheduleNow, notSupported, notSupported);
  }());

  /**
   * Gets a scheduler that schedules work as soon as possible on the current thread.
   */
  var currentThreadScheduler = Scheduler.currentThread = (function () {
    var queue;

    function runTrampoline () {
      while (queue.length > 0) {
        var item = queue.dequeue();
        !item.isCancelled() && item.invoke();
      }
    }

    function scheduleNow(state, action) {
      var si = new ScheduledItem(this, state, action, this.now());

      if (!queue) {
        queue = new PriorityQueue(4);
        queue.enqueue(si);

        var result = tryCatch(runTrampoline)();
        queue = null;
        if (result === errorObj) { return thrower(result.e); }
      } else {
        queue.enqueue(si);
      }
      return si.disposable;
    }

    var currentScheduler = new Scheduler(defaultNow, scheduleNow, notSupported, notSupported);
    currentScheduler.scheduleRequired = function () { return !queue; };

    return currentScheduler;
  }());

  var scheduleMethod, clearMethod;

  var localTimer = (function () {
    var localSetTimeout, localClearTimeout = noop;
    if (!!root.WScript) {
      localSetTimeout = function (fn, time) {
        root.WScript.Sleep(time);
        fn();
      };
    } else if (!!root.setTimeout) {
      localSetTimeout = root.setTimeout;
      localClearTimeout = root.clearTimeout;
    } else {
      throw new NotSupportedError();
    }

    return {
      setTimeout: localSetTimeout,
      clearTimeout: localClearTimeout
    };
  }());
  var localSetTimeout = localTimer.setTimeout,
    localClearTimeout = localTimer.clearTimeout;

  (function () {

    var nextHandle = 1, tasksByHandle = {}, currentlyRunning = false;

    clearMethod = function (handle) {
      delete tasksByHandle[handle];
    };

    function runTask(handle) {
      if (currentlyRunning) {
        localSetTimeout(function () { runTask(handle) }, 0);
      } else {
        var task = tasksByHandle[handle];
        if (task) {
          currentlyRunning = true;
          var result = tryCatch(task)();
          clearMethod(handle);
          currentlyRunning = false;
          if (result === errorObj) { return thrower(result.e); }
        }
      }
    }

    var reNative = RegExp('^' +
      String(toString)
        .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
        .replace(/toString| for [^\]]+/g, '.*?') + '$'
    );

    var setImmediate = typeof (setImmediate = freeGlobal && moduleExports && freeGlobal.setImmediate) == 'function' &&
      !reNative.test(setImmediate) && setImmediate;

    function postMessageSupported () {
      // Ensure not in a worker
      if (!root.postMessage || root.importScripts) { return false; }
      var isAsync = false, oldHandler = root.onmessage;
      // Test for async
      root.onmessage = function () { isAsync = true; };
      root.postMessage('', '*');
      root.onmessage = oldHandler;

      return isAsync;
    }

    // Use in order, setImmediate, nextTick, postMessage, MessageChannel, script readystatechanged, setTimeout
    if (isFunction(setImmediate)) {
      scheduleMethod = function (action) {
        var id = nextHandle++;
        tasksByHandle[id] = action;
        setImmediate(function () { runTask(id); });

        return id;
      };
    } else if (typeof process !== 'undefined' && {}.toString.call(process) === '[object process]') {
      scheduleMethod = function (action) {
        var id = nextHandle++;
        tasksByHandle[id] = action;
        process.nextTick(function () { runTask(id); });

        return id;
      };
    } else if (postMessageSupported()) {
      var MSG_PREFIX = 'ms.rx.schedule' + Math.random();

      function onGlobalPostMessage(event) {
        // Only if we're a match to avoid any other global events
        if (typeof event.data === 'string' && event.data.substring(0, MSG_PREFIX.length) === MSG_PREFIX) {
          runTask(event.data.substring(MSG_PREFIX.length));
        }
      }

      if (root.addEventListener) {
        root.addEventListener('message', onGlobalPostMessage, false);
      } else {
        root.attachEvent('onmessage', onGlobalPostMessage, false);
      }

      scheduleMethod = function (action) {
        var id = nextHandle++;
        tasksByHandle[id] = action;
        root.postMessage(MSG_PREFIX + currentId, '*');
        return id;
      };
    } else if (!!root.MessageChannel) {
      var channel = new root.MessageChannel();

      channel.port1.onmessage = function (e) { runTask(e.data); };

      scheduleMethod = function (action) {
        var id = nextHandle++;
        tasksByHandle[id] = action;
        channel.port2.postMessage(id);
        return id;
      };
    } else if ('document' in root && 'onreadystatechange' in root.document.createElement('script')) {

      scheduleMethod = function (action) {
        var scriptElement = root.document.createElement('script');
        var id = nextHandle++;
        tasksByHandle[id] = action;

        scriptElement.onreadystatechange = function () {
          runTask(id);
          scriptElement.onreadystatechange = null;
          scriptElement.parentNode.removeChild(scriptElement);
          scriptElement = null;
        };
        root.document.documentElement.appendChild(scriptElement);
        return id;
      };

    } else {
      scheduleMethod = function (action) {
        var id = nextHandle++;
        tasksByHandle[id] = action;
        localSetTimeout(function () {
          runTask(id);
        }, 0);

        return id;
      };
    }
  }());

  /**
   * Gets a scheduler that schedules work via a timed callback based upon platform.
   */
  var timeoutScheduler = Scheduler.timeout = Scheduler.default = (function () {

    function scheduleNow(state, action) {
      var scheduler = this,
        disposable = new SingleAssignmentDisposable();
      var id = scheduleMethod(function () {
        if (!disposable.isDisposed) {
          disposable.setDisposable(action(scheduler, state));
        }
      });
      return new CompositeDisposable(disposable, disposableCreate(function () {
        clearMethod(id);
      }));
    }

    function scheduleRelative(state, dueTime, action) {
      var scheduler = this, dt = Scheduler.normalize(dueTime);
      if (dt === 0) { return scheduler.scheduleWithState(state, action); }
      var disposable = new SingleAssignmentDisposable();
      var id = localSetTimeout(function () {
        if (!disposable.isDisposed) {
          disposable.setDisposable(action(scheduler, state));
        }
      }, dt);
      return new CompositeDisposable(disposable, disposableCreate(function () {
        localClearTimeout(id);
      }));
    }

    function scheduleAbsolute(state, dueTime, action) {
      return this.scheduleWithRelativeAndState(state, dueTime - this.now(), action);
    }

    return new Scheduler(defaultNow, scheduleNow, scheduleRelative, scheduleAbsolute);
  })();

  var CatchScheduler = (function (__super__) {

    function scheduleNow(state, action) {
      return this._scheduler.scheduleWithState(state, this._wrap(action));
    }

    function scheduleRelative(state, dueTime, action) {
      return this._scheduler.scheduleWithRelativeAndState(state, dueTime, this._wrap(action));
    }

    function scheduleAbsolute(state, dueTime, action) {
      return this._scheduler.scheduleWithAbsoluteAndState(state, dueTime, this._wrap(action));
    }

    inherits(CatchScheduler, __super__);

    function CatchScheduler(scheduler, handler) {
      this._scheduler = scheduler;
      this._handler = handler;
      this._recursiveOriginal = null;
      this._recursiveWrapper = null;
      __super__.call(this, this._scheduler.now.bind(this._scheduler), scheduleNow, scheduleRelative, scheduleAbsolute);
    }

    CatchScheduler.prototype._clone = function (scheduler) {
        return new CatchScheduler(scheduler, this._handler);
    };

    CatchScheduler.prototype._wrap = function (action) {
      var parent = this;
      return function (self, state) {
        try {
          return action(parent._getRecursiveWrapper(self), state);
        } catch (e) {
          if (!parent._handler(e)) { throw e; }
          return disposableEmpty;
        }
      };
    };

    CatchScheduler.prototype._getRecursiveWrapper = function (scheduler) {
      if (this._recursiveOriginal !== scheduler) {
        this._recursiveOriginal = scheduler;
        var wrapper = this._clone(scheduler);
        wrapper._recursiveOriginal = scheduler;
        wrapper._recursiveWrapper = wrapper;
        this._recursiveWrapper = wrapper;
      }
      return this._recursiveWrapper;
    };

    CatchScheduler.prototype.schedulePeriodicWithState = function (state, period, action) {
      var self = this, failed = false, d = new SingleAssignmentDisposable();

      d.setDisposable(this._scheduler.schedulePeriodicWithState(state, period, function (state1) {
        if (failed) { return null; }
        try {
          return action(state1);
        } catch (e) {
          failed = true;
          if (!self._handler(e)) { throw e; }
          d.dispose();
          return null;
        }
      }));

      return d;
    };

    return CatchScheduler;
  }(Scheduler));

  /**
   *  Represents a notification to an observer.
   */
  var Notification = Rx.Notification = (function () {
    function Notification(kind, value, exception, accept, acceptObservable, toString) {
      this.kind = kind;
      this.value = value;
      this.exception = exception;
      this._accept = accept;
      this._acceptObservable = acceptObservable;
      this.toString = toString;
    }

    /**
     * Invokes the delegate corresponding to the notification or the observer's method corresponding to the notification and returns the produced result.
     *
     * @memberOf Notification
     * @param {Any} observerOrOnNext Delegate to invoke for an OnNext notification or Observer to invoke the notification on..
     * @param {Function} onError Delegate to invoke for an OnError notification.
     * @param {Function} onCompleted Delegate to invoke for an OnCompleted notification.
     * @returns {Any} Result produced by the observation.
     */
    Notification.prototype.accept = function (observerOrOnNext, onError, onCompleted) {
      return observerOrOnNext && typeof observerOrOnNext === 'object' ?
        this._acceptObservable(observerOrOnNext) :
        this._accept(observerOrOnNext, onError, onCompleted);
    };

    /**
     * Returns an observable sequence with a single notification.
     *
     * @memberOf Notifications
     * @param {Scheduler} [scheduler] Scheduler to send out the notification calls on.
     * @returns {Observable} The observable sequence that surfaces the behavior of the notification upon subscription.
     */
    Notification.prototype.toObservable = function (scheduler) {
      var self = this;
      isScheduler(scheduler) || (scheduler = immediateScheduler);
      return new AnonymousObservable(function (observer) {
        return scheduler.scheduleWithState(self, function (_, notification) {
          notification._acceptObservable(observer);
          notification.kind === 'N' && observer.onCompleted();
        });
      });
    };

    return Notification;
  })();

  /**
   * Creates an object that represents an OnNext notification to an observer.
   * @param {Any} value The value contained in the notification.
   * @returns {Notification} The OnNext notification containing the value.
   */
  var notificationCreateOnNext = Notification.createOnNext = (function () {
      function _accept(onNext) { return onNext(this.value); }
      function _acceptObservable(observer) { return observer.onNext(this.value); }
      function toString() { return 'OnNext(' + this.value + ')'; }

      return function (value) {
        return new Notification('N', value, null, _accept, _acceptObservable, toString);
      };
  }());

  /**
   * Creates an object that represents an OnError notification to an observer.
   * @param {Any} error The exception contained in the notification.
   * @returns {Notification} The OnError notification containing the exception.
   */
  var notificationCreateOnError = Notification.createOnError = (function () {
    function _accept (onNext, onError) { return onError(this.exception); }
    function _acceptObservable(observer) { return observer.onError(this.exception); }
    function toString () { return 'OnError(' + this.exception + ')'; }

    return function (e) {
      return new Notification('E', null, e, _accept, _acceptObservable, toString);
    };
  }());

  /**
   * Creates an object that represents an OnCompleted notification to an observer.
   * @returns {Notification} The OnCompleted notification.
   */
  var notificationCreateOnCompleted = Notification.createOnCompleted = (function () {
    function _accept (onNext, onError, onCompleted) { return onCompleted(); }
    function _acceptObservable(observer) { return observer.onCompleted(); }
    function toString () { return 'OnCompleted()'; }

    return function () {
      return new Notification('C', null, null, _accept, _acceptObservable, toString);
    };
  }());

  var Enumerator = Rx.internals.Enumerator = function (next) {
    this._next = next;
  };

  Enumerator.prototype.next = function () {
    return this._next();
  };

  Enumerator.prototype[$iterator$] = function () { return this; }

  var Enumerable = Rx.internals.Enumerable = function (iterator) {
    this._iterator = iterator;
  };

  Enumerable.prototype[$iterator$] = function () {
    return this._iterator();
  };

  Enumerable.prototype.concat = function () {
    var sources = this;
    return new AnonymousObservable(function (o) {
      var e = sources[$iterator$]();

      var isDisposed, subscription = new SerialDisposable();
      var cancelable = immediateScheduler.scheduleRecursive(function (self) {
        if (isDisposed) { return; }
        try {
          var currentItem = e.next();
        } catch (ex) {
          return o.onError(ex);
        }

        if (currentItem.done) {
          return o.onCompleted();
        }

        // Check if promise
        var currentValue = currentItem.value;
        isPromise(currentValue) && (currentValue = observableFromPromise(currentValue));

        var d = new SingleAssignmentDisposable();
        subscription.setDisposable(d);
        d.setDisposable(currentValue.subscribe(
          function(x) { o.onNext(x); },
          function(err) { o.onError(err); },
          self)
        );
      });

      return new CompositeDisposable(subscription, cancelable, disposableCreate(function () {
        isDisposed = true;
      }));
    });
  };

  Enumerable.prototype.catchError = function () {
    var sources = this;
    return new AnonymousObservable(function (o) {
      var e = sources[$iterator$]();

      var isDisposed, subscription = new SerialDisposable();
      var cancelable = immediateScheduler.scheduleRecursiveWithState(null, function (lastException, self) {
        if (isDisposed) { return; }

        try {
          var currentItem = e.next();
        } catch (ex) {
          return observer.onError(ex);
        }

        if (currentItem.done) {
          if (lastException !== null) {
            o.onError(lastException);
          } else {
            o.onCompleted();
          }
          return;
        }

        // Check if promise
        var currentValue = currentItem.value;
        isPromise(currentValue) && (currentValue = observableFromPromise(currentValue));

        var d = new SingleAssignmentDisposable();
        subscription.setDisposable(d);
        d.setDisposable(currentValue.subscribe(
          function(x) { o.onNext(x); },
          self,
          function() { o.onCompleted(); }));
      });
      return new CompositeDisposable(subscription, cancelable, disposableCreate(function () {
        isDisposed = true;
      }));
    });
  };


  Enumerable.prototype.catchErrorWhen = function (notificationHandler) {
    var sources = this;
    return new AnonymousObservable(function (o) {
      var exceptions = new Subject(),
        notifier = new Subject(),
        handled = notificationHandler(exceptions),
        notificationDisposable = handled.subscribe(notifier);

      var e = sources[$iterator$]();

      var isDisposed,
        lastException,
        subscription = new SerialDisposable();
      var cancelable = immediateScheduler.scheduleRecursive(function (self) {
        if (isDisposed) { return; }

        try {
          var currentItem = e.next();
        } catch (ex) {
          return o.onError(ex);
        }

        if (currentItem.done) {
          if (lastException) {
            o.onError(lastException);
          } else {
            o.onCompleted();
          }
          return;
        }

        // Check if promise
        var currentValue = currentItem.value;
        isPromise(currentValue) && (currentValue = observableFromPromise(currentValue));

        var outer = new SingleAssignmentDisposable();
        var inner = new SingleAssignmentDisposable();
        subscription.setDisposable(new CompositeDisposable(inner, outer));
        outer.setDisposable(currentValue.subscribe(
          function(x) { o.onNext(x); },
          function (exn) {
            inner.setDisposable(notifier.subscribe(self, function(ex) {
              o.onError(ex);
            }, function() {
              o.onCompleted();
            }));

            exceptions.onNext(exn);
          },
          function() { o.onCompleted(); }));
      });

      return new CompositeDisposable(notificationDisposable, subscription, cancelable, disposableCreate(function () {
        isDisposed = true;
      }));
    });
  };

  var enumerableRepeat = Enumerable.repeat = function (value, repeatCount) {
    if (repeatCount == null) { repeatCount = -1; }
    return new Enumerable(function () {
      var left = repeatCount;
      return new Enumerator(function () {
        if (left === 0) { return doneEnumerator; }
        if (left > 0) { left--; }
        return { done: false, value: value };
      });
    });
  };

  var enumerableOf = Enumerable.of = function (source, selector, thisArg) {
    if (selector) {
      var selectorFn = bindCallback(selector, thisArg, 3);
    }
    return new Enumerable(function () {
      var index = -1;
      return new Enumerator(
        function () {
          return ++index < source.length ?
            { done: false, value: !selector ? source[index] : selectorFn(source[index], index, source) } :
            doneEnumerator;
        });
    });
  };

  /**
   * Supports push-style iteration over an observable sequence.
   */
  var Observer = Rx.Observer = function () { };

  /**
   *  Creates a notification callback from an observer.
   * @returns The action that forwards its input notification to the underlying observer.
   */
  Observer.prototype.toNotifier = function () {
    var observer = this;
    return function (n) { return n.accept(observer); };
  };

  /**
   *  Hides the identity of an observer.
   * @returns An observer that hides the identity of the specified observer.
   */
  Observer.prototype.asObserver = function () {
    return new AnonymousObserver(this.onNext.bind(this), this.onError.bind(this), this.onCompleted.bind(this));
  };

  /**
   *  Checks access to the observer for grammar violations. This includes checking for multiple OnError or OnCompleted calls, as well as reentrancy in any of the observer methods.
   *  If a violation is detected, an Error is thrown from the offending observer method call.
   * @returns An observer that checks callbacks invocations against the observer grammar and, if the checks pass, forwards those to the specified observer.
   */
  Observer.prototype.checked = function () { return new CheckedObserver(this); };

  /**
   *  Creates an observer from the specified OnNext, along with optional OnError, and OnCompleted actions.
   * @param {Function} [onNext] Observer's OnNext action implementation.
   * @param {Function} [onError] Observer's OnError action implementation.
   * @param {Function} [onCompleted] Observer's OnCompleted action implementation.
   * @returns {Observer} The observer object implemented using the given actions.
   */
  var observerCreate = Observer.create = function (onNext, onError, onCompleted) {
    onNext || (onNext = noop);
    onError || (onError = defaultError);
    onCompleted || (onCompleted = noop);
    return new AnonymousObserver(onNext, onError, onCompleted);
  };

  /**
   *  Creates an observer from a notification callback.
   *
   * @static
   * @memberOf Observer
   * @param {Function} handler Action that handles a notification.
   * @returns The observer object that invokes the specified handler using a notification corresponding to each message it receives.
   */
  Observer.fromNotifier = function (handler, thisArg) {
    return new AnonymousObserver(function (x) {
      return handler.call(thisArg, notificationCreateOnNext(x));
    }, function (e) {
      return handler.call(thisArg, notificationCreateOnError(e));
    }, function () {
      return handler.call(thisArg, notificationCreateOnCompleted());
    });
  };

  /**
   * Schedules the invocation of observer methods on the given scheduler.
   * @param {Scheduler} scheduler Scheduler to schedule observer messages on.
   * @returns {Observer} Observer whose messages are scheduled on the given scheduler.
   */
  Observer.prototype.notifyOn = function (scheduler) {
    return new ObserveOnObserver(scheduler, this);
  };

  Observer.prototype.makeSafe = function(disposable) {
    return new AnonymousSafeObserver(this._onNext, this._onError, this._onCompleted, disposable);
  };

  /**
   * Abstract base class for implementations of the Observer class.
   * This base class enforces the grammar of observers where OnError and OnCompleted are terminal messages.
   */
  var AbstractObserver = Rx.internals.AbstractObserver = (function (__super__) {
    inherits(AbstractObserver, __super__);

    /**
     * Creates a new observer in a non-stopped state.
     */
    function AbstractObserver() {
      this.isStopped = false;
      __super__.call(this);
    }

    // Must be implemented by other observers
    AbstractObserver.prototype.next = notImplemented;
    AbstractObserver.prototype.error = notImplemented;
    AbstractObserver.prototype.completed = notImplemented;

    /**
     * Notifies the observer of a new element in the sequence.
     * @param {Any} value Next element in the sequence.
     */
    AbstractObserver.prototype.onNext = function (value) {
      if (!this.isStopped) { this.next(value); }
    };

    /**
     * Notifies the observer that an exception has occurred.
     * @param {Any} error The error that has occurred.
     */
    AbstractObserver.prototype.onError = function (error) {
      if (!this.isStopped) {
        this.isStopped = true;
        this.error(error);
      }
    };

    /**
     * Notifies the observer of the end of the sequence.
     */
    AbstractObserver.prototype.onCompleted = function () {
      if (!this.isStopped) {
        this.isStopped = true;
        this.completed();
      }
    };

    /**
     * Disposes the observer, causing it to transition to the stopped state.
     */
    AbstractObserver.prototype.dispose = function () {
      this.isStopped = true;
    };

    AbstractObserver.prototype.fail = function (e) {
      if (!this.isStopped) {
        this.isStopped = true;
        this.error(e);
        return true;
      }

      return false;
    };

    return AbstractObserver;
  }(Observer));

  /**
   * Class to create an Observer instance from delegate-based implementations of the on* methods.
   */
  var AnonymousObserver = Rx.AnonymousObserver = (function (__super__) {
    inherits(AnonymousObserver, __super__);

    /**
     * Creates an observer from the specified OnNext, OnError, and OnCompleted actions.
     * @param {Any} onNext Observer's OnNext action implementation.
     * @param {Any} onError Observer's OnError action implementation.
     * @param {Any} onCompleted Observer's OnCompleted action implementation.
     */
    function AnonymousObserver(onNext, onError, onCompleted) {
      __super__.call(this);
      this._onNext = onNext;
      this._onError = onError;
      this._onCompleted = onCompleted;
    }

    /**
     * Calls the onNext action.
     * @param {Any} value Next element in the sequence.
     */
    AnonymousObserver.prototype.next = function (value) {
      this._onNext(value);
    };

    /**
     * Calls the onError action.
     * @param {Any} error The error that has occurred.
     */
    AnonymousObserver.prototype.error = function (error) {
      this._onError(error);
    };

    /**
     *  Calls the onCompleted action.
     */
    AnonymousObserver.prototype.completed = function () {
      this._onCompleted();
    };

    return AnonymousObserver;
  }(AbstractObserver));

  var CheckedObserver = (function (__super__) {
    inherits(CheckedObserver, __super__);

    function CheckedObserver(observer) {
      __super__.call(this);
      this._observer = observer;
      this._state = 0; // 0 - idle, 1 - busy, 2 - done
    }

    var CheckedObserverPrototype = CheckedObserver.prototype;

    CheckedObserverPrototype.onNext = function (value) {
      this.checkAccess();
      var res = tryCatch(this._observer.onNext).call(this._observer, value);
      this._state = 0;
      res === errorObj && thrower(res.e);
    };

    CheckedObserverPrototype.onError = function (err) {
      this.checkAccess();
      var res = tryCatch(this._observer.onError).call(this._observer, err);
      this._state = 2;
      res === errorObj && thrower(res.e);
    };

    CheckedObserverPrototype.onCompleted = function () {
      this.checkAccess();
      var res = tryCatch(this._observer.onCompleted).call(this._observer);
      this._state = 2;
      res === errorObj && thrower(res.e);
    };

    CheckedObserverPrototype.checkAccess = function () {
      if (this._state === 1) { throw new Error('Re-entrancy detected'); }
      if (this._state === 2) { throw new Error('Observer completed'); }
      if (this._state === 0) { this._state = 1; }
    };

    return CheckedObserver;
  }(Observer));

  var ScheduledObserver = Rx.internals.ScheduledObserver = (function (__super__) {
    inherits(ScheduledObserver, __super__);

    function ScheduledObserver(scheduler, observer) {
      __super__.call(this);
      this.scheduler = scheduler;
      this.observer = observer;
      this.isAcquired = false;
      this.hasFaulted = false;
      this.queue = [];
      this.disposable = new SerialDisposable();
    }

    ScheduledObserver.prototype.next = function (value) {
      var self = this;
      this.queue.push(function () { self.observer.onNext(value); });
    };

    ScheduledObserver.prototype.error = function (e) {
      var self = this;
      this.queue.push(function () { self.observer.onError(e); });
    };

    ScheduledObserver.prototype.completed = function () {
      var self = this;
      this.queue.push(function () { self.observer.onCompleted(); });
    };

    ScheduledObserver.prototype.ensureActive = function () {
      var isOwner = false, parent = this;
      if (!this.hasFaulted && this.queue.length > 0) {
        isOwner = !this.isAcquired;
        this.isAcquired = true;
      }
      if (isOwner) {
        this.disposable.setDisposable(this.scheduler.scheduleRecursive(function (self) {
          var work;
          if (parent.queue.length > 0) {
            work = parent.queue.shift();
          } else {
            parent.isAcquired = false;
            return;
          }
          try {
            work();
          } catch (ex) {
            parent.queue = [];
            parent.hasFaulted = true;
            throw ex;
          }
          self();
        }));
      }
    };

    ScheduledObserver.prototype.dispose = function () {
      __super__.prototype.dispose.call(this);
      this.disposable.dispose();
    };

    return ScheduledObserver;
  }(AbstractObserver));

  var ObserveOnObserver = (function (__super__) {
    inherits(ObserveOnObserver, __super__);

    function ObserveOnObserver(scheduler, observer, cancel) {
      __super__.call(this, scheduler, observer);
      this._cancel = cancel;
    }

    ObserveOnObserver.prototype.next = function (value) {
      __super__.prototype.next.call(this, value);
      this.ensureActive();
    };

    ObserveOnObserver.prototype.error = function (e) {
      __super__.prototype.error.call(this, e);
      this.ensureActive();
    };

    ObserveOnObserver.prototype.completed = function () {
      __super__.prototype.completed.call(this);
      this.ensureActive();
    };

    ObserveOnObserver.prototype.dispose = function () {
      __super__.prototype.dispose.call(this);
      this._cancel && this._cancel.dispose();
      this._cancel = null;
    };

    return ObserveOnObserver;
  })(ScheduledObserver);

  var observableProto;

  /**
   * Represents a push-style collection.
   */
  var Observable = Rx.Observable = (function () {

    function Observable(subscribe) {
      if (Rx.config.longStackSupport && hasStacks) {
        try {
          throw new Error();
        } catch (e) {
          this.stack = e.stack.substring(e.stack.indexOf("\n") + 1);
        }

        var self = this;
        this._subscribe = function (observer) {
          var oldOnError = observer.onError.bind(observer);

          observer.onError = function (err) {
            makeStackTraceLong(err, self);
            oldOnError(err);
          };

          return subscribe.call(self, observer);
        };
      } else {
        this._subscribe = subscribe;
      }
    }

    observableProto = Observable.prototype;

    /**
     *  Subscribes an observer to the observable sequence.
     *  @param {Mixed} [observerOrOnNext] The object that is to receive notifications or an action to invoke for each element in the observable sequence.
     *  @param {Function} [onError] Action to invoke upon exceptional termination of the observable sequence.
     *  @param {Function} [onCompleted] Action to invoke upon graceful termination of the observable sequence.
     *  @returns {Diposable} A disposable handling the subscriptions and unsubscriptions.
     */
    observableProto.subscribe = observableProto.forEach = function (observerOrOnNext, onError, onCompleted) {
      return this._subscribe(typeof observerOrOnNext === 'object' ?
        observerOrOnNext :
        observerCreate(observerOrOnNext, onError, onCompleted));
    };

    /**
     * Subscribes to the next value in the sequence with an optional "this" argument.
     * @param {Function} onNext The function to invoke on each element in the observable sequence.
     * @param {Any} [thisArg] Object to use as this when executing callback.
     * @returns {Disposable} A disposable handling the subscriptions and unsubscriptions.
     */
    observableProto.subscribeOnNext = function (onNext, thisArg) {
      return this._subscribe(observerCreate(typeof thisArg !== 'undefined' ? function(x) { onNext.call(thisArg, x); } : onNext));
    };

    /**
     * Subscribes to an exceptional condition in the sequence with an optional "this" argument.
     * @param {Function} onError The function to invoke upon exceptional termination of the observable sequence.
     * @param {Any} [thisArg] Object to use as this when executing callback.
     * @returns {Disposable} A disposable handling the subscriptions and unsubscriptions.
     */
    observableProto.subscribeOnError = function (onError, thisArg) {
      return this._subscribe(observerCreate(null, typeof thisArg !== 'undefined' ? function(e) { onError.call(thisArg, e); } : onError));
    };

    /**
     * Subscribes to the next value in the sequence with an optional "this" argument.
     * @param {Function} onCompleted The function to invoke upon graceful termination of the observable sequence.
     * @param {Any} [thisArg] Object to use as this when executing callback.
     * @returns {Disposable} A disposable handling the subscriptions and unsubscriptions.
     */
    observableProto.subscribeOnCompleted = function (onCompleted, thisArg) {
      return this._subscribe(observerCreate(null, null, typeof thisArg !== 'undefined' ? function() { onCompleted.call(thisArg); } : onCompleted));
    };

    return Observable;
  })();

  var ObservableBase = Rx.ObservableBase = (function (__super__) {
    inherits(ObservableBase, __super__);

    function fixSubscriber(subscriber) {
      return subscriber && isFunction(subscriber.dispose) ? subscriber :
        isFunction(subscriber) ? disposableCreate(subscriber) : disposableEmpty;
    }

    function setDisposable(s, state) {
      var ado = state[0], self = state[1];
      var sub = tryCatch(self.subscribeCore).call(self, ado);

      if (sub === errorObj) {
        if(!ado.fail(errorObj.e)) { return thrower(errorObj.e); }
      }
      ado.setDisposable(fixSubscriber(sub));
    }

    function subscribe(observer) {
      var ado = new AutoDetachObserver(observer), state = [ado, this];

      if (currentThreadScheduler.scheduleRequired()) {
        currentThreadScheduler.scheduleWithState(state, setDisposable);
      } else {
        setDisposable(null, state);
      }
      return ado;
    }

    function ObservableBase() {
      __super__.call(this, subscribe);
    }

    ObservableBase.prototype.subscribeCore = notImplemented;

    return ObservableBase;
  }(Observable));

   /**
   *  Wraps the source sequence in order to run its observer callbacks on the specified scheduler.
   *
   *  This only invokes observer callbacks on a scheduler. In case the subscription and/or unsubscription actions have side-effects
   *  that require to be run on a scheduler, use subscribeOn.
   *
   *  @param {Scheduler} scheduler Scheduler to notify observers on.
   *  @returns {Observable} The source sequence whose observations happen on the specified scheduler.
   */
  observableProto.observeOn = function (scheduler) {
    var source = this;
    return new AnonymousObservable(function (observer) {
      return source.subscribe(new ObserveOnObserver(scheduler, observer));
    }, source);
  };

   /**
   *  Wraps the source sequence in order to run its subscription and unsubscription logic on the specified scheduler. This operation is not commonly used;
   *  see the remarks section for more information on the distinction between subscribeOn and observeOn.

   *  This only performs the side-effects of subscription and unsubscription on the specified scheduler. In order to invoke observer
   *  callbacks on a scheduler, use observeOn.

   *  @param {Scheduler} scheduler Scheduler to perform subscription and unsubscription actions on.
   *  @returns {Observable} The source sequence whose subscriptions and unsubscriptions happen on the specified scheduler.
   */
  observableProto.subscribeOn = function (scheduler) {
    var source = this;
    return new AnonymousObservable(function (observer) {
      var m = new SingleAssignmentDisposable(), d = new SerialDisposable();
      d.setDisposable(m);
      m.setDisposable(scheduler.schedule(function () {
        d.setDisposable(new ScheduledDisposable(scheduler, source.subscribe(observer)));
      }));
      return d;
    }, source);
  };

  /**
   * Converts a Promise to an Observable sequence
   * @param {Promise} An ES6 Compliant promise.
   * @returns {Observable} An Observable sequence which wraps the existing promise success and failure.
   */
  var observableFromPromise = Observable.fromPromise = function (promise) {
    return observableDefer(function () {
      var subject = new Rx.AsyncSubject();

      promise.then(
        function (value) {
          subject.onNext(value);
          subject.onCompleted();
        },
        subject.onError.bind(subject));

      return subject;
    });
  };

  /*
   * Converts an existing observable sequence to an ES6 Compatible Promise
   * @example
   * var promise = Rx.Observable.return(42).toPromise(RSVP.Promise);
   *
   * // With config
   * Rx.config.Promise = RSVP.Promise;
   * var promise = Rx.Observable.return(42).toPromise();
   * @param {Function} [promiseCtor] The constructor of the promise. If not provided, it looks for it in Rx.config.Promise.
   * @returns {Promise} An ES6 compatible promise with the last value from the observable sequence.
   */
  observableProto.toPromise = function (promiseCtor) {
    promiseCtor || (promiseCtor = Rx.config.Promise);
    if (!promiseCtor) { throw new NotSupportedError('Promise type not provided nor in Rx.config.Promise'); }
    var source = this;
    return new promiseCtor(function (resolve, reject) {
      // No cancellation can be done
      var value, hasValue = false;
      source.subscribe(function (v) {
        value = v;
        hasValue = true;
      }, reject, function () {
        hasValue && resolve(value);
      });
    });
  };

  var ToArrayObservable = (function(__super__) {
    inherits(ToArrayObservable, __super__);
    function ToArrayObservable(source) {
      this.source = source;
      __super__.call(this);
    }

    ToArrayObservable.prototype.subscribeCore = function(observer) {
      return this.source.subscribe(new ToArrayObserver(observer));
    };

    return ToArrayObservable;
  }(ObservableBase));

  function ToArrayObserver(observer) {
    this.observer = observer;
    this.a = [];
    this.isStopped = false;
  }
  ToArrayObserver.prototype.onNext = function (x) { if(!this.isStopped) { this.a.push(x); } };
  ToArrayObserver.prototype.onError = function (e) {
    if (!this.isStopped) {
      this.isStopped = true;
      this.observer.onError(e);
    }
  };
  ToArrayObserver.prototype.onCompleted = function () {
    if (!this.isStopped) {
      this.isStopped = true;
      this.observer.onNext(this.a);
      this.observer.onCompleted();
    }
  };
  ToArrayObserver.prototype.dispose = function () { this.isStopped = true; }
  ToArrayObserver.prototype.fail = function (e) {
    if (!this.isStopped) {
      this.isStopped = true;
      this.observer.onError(e);
      return true;
    }

    return false;
  };

  /**
  * Creates an array from an observable sequence.
  * @returns {Observable} An observable sequence containing a single element with a list containing all the elements of the source sequence.
  */
  observableProto.toArray = function () {
    return new ToArrayObservable(this);
  };

  /**
   *  Creates an observable sequence from a specified subscribe method implementation.
   * @example
   *  var res = Rx.Observable.create(function (observer) { return function () { } );
   *  var res = Rx.Observable.create(function (observer) { return Rx.Disposable.empty; } );
   *  var res = Rx.Observable.create(function (observer) { } );
   * @param {Function} subscribe Implementation of the resulting observable sequence's subscribe method, returning a function that will be wrapped in a Disposable.
   * @returns {Observable} The observable sequence with the specified implementation for the Subscribe method.
   */
  Observable.create = Observable.createWithDisposable = function (subscribe, parent) {
    return new AnonymousObservable(subscribe, parent);
  };

  /**
   *  Returns an observable sequence that invokes the specified factory function whenever a new observer subscribes.
   *
   * @example
   *  var res = Rx.Observable.defer(function () { return Rx.Observable.fromArray([1,2,3]); });
   * @param {Function} observableFactory Observable factory function to invoke for each observer that subscribes to the resulting sequence or Promise.
   * @returns {Observable} An observable sequence whose observers trigger an invocation of the given observable factory function.
   */
  var observableDefer = Observable.defer = function (observableFactory) {
    return new AnonymousObservable(function (observer) {
      var result;
      try {
        result = observableFactory();
      } catch (e) {
        return observableThrow(e).subscribe(observer);
      }
      isPromise(result) && (result = observableFromPromise(result));
      return result.subscribe(observer);
    });
  };

  /**
   *  Returns an empty observable sequence, using the specified scheduler to send out the single OnCompleted message.
   *
   * @example
   *  var res = Rx.Observable.empty();
   *  var res = Rx.Observable.empty(Rx.Scheduler.timeout);
   * @param {Scheduler} [scheduler] Scheduler to send the termination call on.
   * @returns {Observable} An observable sequence with no elements.
   */
  var observableEmpty = Observable.empty = function (scheduler) {
    isScheduler(scheduler) || (scheduler = immediateScheduler);
    return new AnonymousObservable(function (observer) {
      return scheduler.scheduleWithState(null, function () {
        observer.onCompleted();
      });
    });
  };

  var FromObservable = (function(__super__) {
    inherits(FromObservable, __super__);
    function FromObservable(iterable, mapper, scheduler) {
      this.iterable = iterable;
      this.mapper = mapper;
      this.scheduler = scheduler;
      __super__.call(this);
    }

    FromObservable.prototype.subscribeCore = function (observer) {
      var sink = new FromSink(observer, this);
      return sink.run();
    };

    return FromObservable;
  }(ObservableBase));

  var FromSink = (function () {
    function FromSink(observer, parent) {
      this.observer = observer;
      this.parent = parent;
    }

    FromSink.prototype.run = function () {
      var list = Object(this.parent.iterable),
          it = getIterable(list),
          observer = this.observer,
          mapper = this.parent.mapper;

      function loopRecursive(i, recurse) {
        try {
          var next = it.next();
        } catch (e) {
          return observer.onError(e);
        }
        if (next.done) {
          return observer.onCompleted();
        }

        var result = next.value;

        if (mapper) {
          try {
            result = mapper(result, i);
          } catch (e) {
            return observer.onError(e);
          }
        }

        observer.onNext(result);
        recurse(i + 1);
      }

      return this.parent.scheduler.scheduleRecursiveWithState(0, loopRecursive);
    };

    return FromSink;
  }());

  var maxSafeInteger = Math.pow(2, 53) - 1;

  function StringIterable(str) {
    this._s = s;
  }

  StringIterable.prototype[$iterator$] = function () {
    return new StringIterator(this._s);
  };

  function StringIterator(str) {
    this._s = s;
    this._l = s.length;
    this._i = 0;
  }

  StringIterator.prototype[$iterator$] = function () {
    return this;
  };

  StringIterator.prototype.next = function () {
    return this._i < this._l ? { done: false, value: this._s.charAt(this._i++) } : doneEnumerator;
  };

  function ArrayIterable(a) {
    this._a = a;
  }

  ArrayIterable.prototype[$iterator$] = function () {
    return new ArrayIterator(this._a);
  };

  function ArrayIterator(a) {
    this._a = a;
    this._l = toLength(a);
    this._i = 0;
  }

  ArrayIterator.prototype[$iterator$] = function () {
    return this;
  };

  ArrayIterator.prototype.next = function () {
    return this._i < this._l ? { done: false, value: this._a[this._i++] } : doneEnumerator;
  };

  function numberIsFinite(value) {
    return typeof value === 'number' && root.isFinite(value);
  }

  function isNan(n) {
    return n !== n;
  }

  function getIterable(o) {
    var i = o[$iterator$], it;
    if (!i && typeof o === 'string') {
      it = new StringIterable(o);
      return it[$iterator$]();
    }
    if (!i && o.length !== undefined) {
      it = new ArrayIterable(o);
      return it[$iterator$]();
    }
    if (!i) { throw new TypeError('Object is not iterable'); }
    return o[$iterator$]();
  }

  function sign(value) {
    var number = +value;
    if (number === 0) { return number; }
    if (isNaN(number)) { return number; }
    return number < 0 ? -1 : 1;
  }

  function toLength(o) {
    var len = +o.length;
    if (isNaN(len)) { return 0; }
    if (len === 0 || !numberIsFinite(len)) { return len; }
    len = sign(len) * Math.floor(Math.abs(len));
    if (len <= 0) { return 0; }
    if (len > maxSafeInteger) { return maxSafeInteger; }
    return len;
  }

  /**
  * This method creates a new Observable sequence from an array-like or iterable object.
  * @param {Any} arrayLike An array-like or iterable object to convert to an Observable sequence.
  * @param {Function} [mapFn] Map function to call on every element of the array.
  * @param {Any} [thisArg] The context to use calling the mapFn if provided.
  * @param {Scheduler} [scheduler] Optional scheduler to use for scheduling.  If not provided, defaults to Scheduler.currentThread.
  */
  var observableFrom = Observable.from = function (iterable, mapFn, thisArg, scheduler) {
    if (iterable == null) {
      throw new Error('iterable cannot be null.')
    }
    if (mapFn && !isFunction(mapFn)) {
      throw new Error('mapFn when provided must be a function');
    }
    if (mapFn) {
      var mapper = bindCallback(mapFn, thisArg, 2);
    }
    isScheduler(scheduler) || (scheduler = currentThreadScheduler);
    return new FromObservable(iterable, mapper, scheduler);
  }

  var FromArrayObservable = (function(__super__) {
    inherits(FromArrayObservable, __super__);
    function FromArrayObservable(args, scheduler) {
      this.args = args;
      this.scheduler = scheduler;
      __super__.call(this);
    }

    FromArrayObservable.prototype.subscribeCore = function (observer) {
      var sink = new FromArraySink(observer, this);
      return sink.run();
    };

    return FromArrayObservable;
  }(ObservableBase));

  function FromArraySink(observer, parent) {
    this.observer = observer;
    this.parent = parent;
  }

  FromArraySink.prototype.run = function () {
    var observer = this.observer, args = this.parent.args, len = args.length;
    function loopRecursive(i, recurse) {
      if (i < len) {
        observer.onNext(args[i]);
        recurse(i + 1);
      } else {
        observer.onCompleted();
      }
    }

    return this.parent.scheduler.scheduleRecursiveWithState(0, loopRecursive);
  };

  /**
  *  Converts an array to an observable sequence, using an optional scheduler to enumerate the array.
  * @deprecated use Observable.from or Observable.of
  * @param {Scheduler} [scheduler] Scheduler to run the enumeration of the input sequence on.
  * @returns {Observable} The observable sequence whose elements are pulled from the given enumerable sequence.
  */
  var observableFromArray = Observable.fromArray = function (array, scheduler) {
    isScheduler(scheduler) || (scheduler = currentThreadScheduler);
    return new FromArrayObservable(array, scheduler)
  };

  /**
   *  Generates an observable sequence by running a state-driven loop producing the sequence's elements, using the specified scheduler to send out observer messages.
   *
   * @example
   *  var res = Rx.Observable.generate(0, function (x) { return x < 10; }, function (x) { return x + 1; }, function (x) { return x; });
   *  var res = Rx.Observable.generate(0, function (x) { return x < 10; }, function (x) { return x + 1; }, function (x) { return x; }, Rx.Scheduler.timeout);
   * @param {Mixed} initialState Initial state.
   * @param {Function} condition Condition to terminate generation (upon returning false).
   * @param {Function} iterate Iteration step function.
   * @param {Function} resultSelector Selector function for results produced in the sequence.
   * @param {Scheduler} [scheduler] Scheduler on which to run the generator loop. If not provided, defaults to Scheduler.currentThread.
   * @returns {Observable} The generated sequence.
   */
  Observable.generate = function (initialState, condition, iterate, resultSelector, scheduler) {
    isScheduler(scheduler) || (scheduler = currentThreadScheduler);
    return new AnonymousObservable(function (o) {
      var first = true;
      return scheduler.scheduleRecursiveWithState(initialState, function (state, self) {
        var hasResult, result;
        try {
          if (first) {
            first = false;
          } else {
            state = iterate(state);
          }
          hasResult = condition(state);
          hasResult && (result = resultSelector(state));
        } catch (e) {
          return o.onError(e);
        }
        if (hasResult) {
          o.onNext(result);
          self(state);
        } else {
          o.onCompleted();
        }
      });
    });
  };

  function observableOf (scheduler, array) {
    isScheduler(scheduler) || (scheduler = currentThreadScheduler);
    return new FromArrayObservable(array, scheduler);
  }

  /**
  *  This method creates a new Observable instance with a variable number of arguments, regardless of number or type of the arguments.
  * @returns {Observable} The observable sequence whose elements are pulled from the given arguments.
  */
  Observable.of = function () {
    var len = arguments.length, args = new Array(len);
    for(var i = 0; i < len; i++) { args[i] = arguments[i]; }
    return new FromArrayObservable(args, currentThreadScheduler);
  };

  /**
  *  This method creates a new Observable instance with a variable number of arguments, regardless of number or type of the arguments.
  * @param {Scheduler} scheduler A scheduler to use for scheduling the arguments.
  * @returns {Observable} The observable sequence whose elements are pulled from the given arguments.
  */
  Observable.ofWithScheduler = function (scheduler) {
    var len = arguments.length, args = new Array(len - 1);
    for(var i = 1; i < len; i++) { args[i - 1] = arguments[i]; }
    return new FromArrayObservable(args, scheduler);
  };

  /**
   * Creates an Observable sequence from changes to an array using Array.observe.
   * @param {Array} array An array to observe changes.
   * @returns {Observable} An observable sequence containing changes to an array from Array.observe.
   */
  Observable.ofArrayChanges = function(array) {
    if (!Array.isArray(array)) { throw new TypeError('Array.observe only accepts arrays.'); }
    if (typeof Array.observe !== 'function' && typeof Array.unobserve !== 'function') { throw new TypeError('Array.observe is not supported on your platform') }
    return new AnonymousObservable(function(observer) {
      function observerFn(changes) {
        for(var i = 0, len = changes.length; i < len; i++) {
          observer.onNext(changes[i]);
        }
      }
      
      Array.observe(array, observerFn);

      return function () {
        Array.unobserve(array, observerFn);
      };
    });
  };

  /**
   * Creates an Observable sequence from changes to an object using Object.observe.
   * @param {Object} obj An object to observe changes.
   * @returns {Observable} An observable sequence containing changes to an object from Object.observe.
   */
  Observable.ofObjectChanges = function(obj) {
    if (obj == null) { throw new TypeError('object must not be null or undefined.'); }
    if (typeof Object.observe !== 'function' && typeof Object.unobserve !== 'function') { throw new TypeError('Array.observe is not supported on your platform') }
    return new AnonymousObservable(function(observer) {
      function observerFn(changes) {
        for(var i = 0, len = changes.length; i < len; i++) {
          observer.onNext(changes[i]);
        }
      }

      Object.observe(obj, observerFn);

      return function () {
        Object.unobserve(obj, observerFn);
      };
    });
  };

  /**
   *  Returns a non-terminating observable sequence, which can be used to denote an infinite duration (e.g. when using reactive joins).
   * @returns {Observable} An observable sequence whose observers will never get called.
   */
  var observableNever = Observable.never = function () {
    return new AnonymousObservable(function () {
      return disposableEmpty;
    });
  };

  /**
   * Convert an object into an observable sequence of [key, value] pairs.
   * @param {Object} obj The object to inspect.
   * @param {Scheduler} [scheduler] Scheduler to run the enumeration of the input sequence on.
   * @returns {Observable} An observable sequence of [key, value] pairs from the object.
   */
  Observable.pairs = function (obj, scheduler) {
    scheduler || (scheduler = Rx.Scheduler.currentThread);
    return new AnonymousObservable(function (observer) {
      var keys = Object.keys(obj), len = keys.length;
      return scheduler.scheduleRecursiveWithState(0, function (idx, self) {
        if (idx < len) {
          var key = keys[idx];
          observer.onNext([key, obj[key]]);
          self(idx + 1);
        } else {
          observer.onCompleted();
        }
      });
    });
  };

    var RangeObservable = (function(__super__) {
    inherits(RangeObservable, __super__);
    function RangeObservable(start, count, scheduler) {
      this.start = start;
      this.count = count;
      this.scheduler = scheduler;
      __super__.call(this);
    }

    RangeObservable.prototype.subscribeCore = function (observer) {
      var sink = new RangeSink(observer, this);
      return sink.run();
    };

    return RangeObservable;
  }(ObservableBase));

  var RangeSink = (function () {
    function RangeSink(observer, parent) {
      this.observer = observer;
      this.parent = parent;
    }

    RangeSink.prototype.run = function () {
      var start = this.parent.start, count = this.parent.count, observer = this.observer;
      function loopRecursive(i, recurse) {
        if (i < count) {
          observer.onNext(start + i);
          recurse(i + 1);
        } else {
          observer.onCompleted();
        }
      }

      return this.parent.scheduler.scheduleRecursiveWithState(0, loopRecursive);
    };

    return RangeSink;
  }());

  /**
  *  Generates an observable sequence of integral numbers within a specified range, using the specified scheduler to send out observer messages.
  * @param {Number} start The value of the first integer in the sequence.
  * @param {Number} count The number of sequential integers to generate.
  * @param {Scheduler} [scheduler] Scheduler to run the generator loop on. If not specified, defaults to Scheduler.currentThread.
  * @returns {Observable} An observable sequence that contains a range of sequential integral numbers.
  */
  Observable.range = function (start, count, scheduler) {
    isScheduler(scheduler) || (scheduler = currentThreadScheduler);
    return new RangeObservable(start, count, scheduler);
  };

  /**
   *  Generates an observable sequence that repeats the given element the specified number of times, using the specified scheduler to send out observer messages.
   *
   * @example
   *  var res = Rx.Observable.repeat(42);
   *  var res = Rx.Observable.repeat(42, 4);
   *  3 - res = Rx.Observable.repeat(42, 4, Rx.Scheduler.timeout);
   *  4 - res = Rx.Observable.repeat(42, null, Rx.Scheduler.timeout);
   * @param {Mixed} value Element to repeat.
   * @param {Number} repeatCount [Optiona] Number of times to repeat the element. If not specified, repeats indefinitely.
   * @param {Scheduler} scheduler Scheduler to run the producer loop on. If not specified, defaults to Scheduler.immediate.
   * @returns {Observable} An observable sequence that repeats the given element the specified number of times.
   */
  Observable.repeat = function (value, repeatCount, scheduler) {
    isScheduler(scheduler) || (scheduler = currentThreadScheduler);
    return observableReturn(value, scheduler).repeat(repeatCount == null ? -1 : repeatCount);
  };

  /**
   *  Returns an observable sequence that contains a single element, using the specified scheduler to send out observer messages.
   *  There is an alias called 'just' or browsers <IE9.
   * @param {Mixed} value Single element in the resulting observable sequence.
   * @param {Scheduler} scheduler Scheduler to send the single element on. If not specified, defaults to Scheduler.immediate.
   * @returns {Observable} An observable sequence containing the single specified element.
   */
  var observableReturn = Observable['return'] = Observable.just = Observable.returnValue = function (value, scheduler) {
    isScheduler(scheduler) || (scheduler = immediateScheduler);
    return new AnonymousObservable(function (o) {
      return scheduler.scheduleWithState(value, function(_,v) {
        o.onNext(v);
        o.onCompleted();
      });
    });
  };

  /**
   *  Returns an observable sequence that terminates with an exception, using the specified scheduler to send out the single onError message.
   *  There is an alias to this method called 'throwError' for browsers <IE9.
   * @param {Mixed} error An object used for the sequence's termination.
   * @param {Scheduler} scheduler Scheduler to send the exceptional termination call on. If not specified, defaults to Scheduler.immediate.
   * @returns {Observable} The observable sequence that terminates exceptionally with the specified exception object.
   */
  var observableThrow = Observable['throw'] = Observable.throwError = function (error, scheduler) {
    isScheduler(scheduler) || (scheduler = immediateScheduler);
    return new AnonymousObservable(function (observer) {
      return scheduler.schedule(function () {
        observer.onError(error);
      });
    });
  };

  /** @deprecated use #some instead */
  Observable.throwException = function () {
    //deprecate('throwException', 'throwError');
    return Observable.throwError.apply(null, arguments);
  };

  /**
   * Constructs an observable sequence that depends on a resource object, whose lifetime is tied to the resulting observable sequence's lifetime.
   * @param {Function} resourceFactory Factory function to obtain a resource object.
   * @param {Function} observableFactory Factory function to obtain an observable sequence that depends on the obtained resource.
   * @returns {Observable} An observable sequence whose lifetime controls the lifetime of the dependent resource object.
   */
  Observable.using = function (resourceFactory, observableFactory) {
    return new AnonymousObservable(function (observer) {
      var disposable = disposableEmpty, resource, source;
      try {
        resource = resourceFactory();
        resource && (disposable = resource);
        source = observableFactory(resource);
      } catch (exception) {
        return new CompositeDisposable(observableThrow(exception).subscribe(observer), disposable);
      }
      return new CompositeDisposable(source.subscribe(observer), disposable);
    });
  };

  /**
   * Propagates the observable sequence or Promise that reacts first.
   * @param {Observable} rightSource Second observable sequence or Promise.
   * @returns {Observable} {Observable} An observable sequence that surfaces either of the given sequences, whichever reacted first.
   */
  observableProto.amb = function (rightSource) {
    var leftSource = this;
    return new AnonymousObservable(function (observer) {
      var choice,
        leftChoice = 'L', rightChoice = 'R',
        leftSubscription = new SingleAssignmentDisposable(),
        rightSubscription = new SingleAssignmentDisposable();

      isPromise(rightSource) && (rightSource = observableFromPromise(rightSource));

      function choiceL() {
        if (!choice) {
          choice = leftChoice;
          rightSubscription.dispose();
        }
      }

      function choiceR() {
        if (!choice) {
          choice = rightChoice;
          leftSubscription.dispose();
        }
      }

      leftSubscription.setDisposable(leftSource.subscribe(function (left) {
        choiceL();
        if (choice === leftChoice) {
          observer.onNext(left);
        }
      }, function (err) {
        choiceL();
        if (choice === leftChoice) {
          observer.onError(err);
        }
      }, function () {
        choiceL();
        if (choice === leftChoice) {
          observer.onCompleted();
        }
      }));

      rightSubscription.setDisposable(rightSource.subscribe(function (right) {
        choiceR();
        if (choice === rightChoice) {
          observer.onNext(right);
        }
      }, function (err) {
        choiceR();
        if (choice === rightChoice) {
          observer.onError(err);
        }
      }, function () {
        choiceR();
        if (choice === rightChoice) {
          observer.onCompleted();
        }
      }));

      return new CompositeDisposable(leftSubscription, rightSubscription);
    });
  };

  /**
   * Propagates the observable sequence or Promise that reacts first.
   *
   * @example
   * var = Rx.Observable.amb(xs, ys, zs);
   * @returns {Observable} An observable sequence that surfaces any of the given sequences, whichever reacted first.
   */
  Observable.amb = function () {
    var acc = observableNever(), items = [];
    if (Array.isArray(arguments[0])) {
      items = arguments[0];
    } else {
      for(var i = 0, len = arguments.length; i < len; i++) { items.push(arguments[i]); }
    }

    function func(previous, current) {
      return previous.amb(current);
    }
    for (var i = 0, len = items.length; i < len; i++) {
      acc = func(acc, items[i]);
    }
    return acc;
  };

  function observableCatchHandler(source, handler) {
    return new AnonymousObservable(function (o) {
      var d1 = new SingleAssignmentDisposable(), subscription = new SerialDisposable();
      subscription.setDisposable(d1);
      d1.setDisposable(source.subscribe(function (x) { o.onNext(x); }, function (e) {
        try {
          var result = handler(e);
        } catch (ex) {
          return o.onError(ex);
        }
        isPromise(result) && (result = observableFromPromise(result));

        var d = new SingleAssignmentDisposable();
        subscription.setDisposable(d);
        d.setDisposable(result.subscribe(o));
      }, function (x) { o.onCompleted(x); }));

      return subscription;
    }, source);
  }

  /**
   * Continues an observable sequence that is terminated by an exception with the next observable sequence.
   * @example
   * 1 - xs.catchException(ys)
   * 2 - xs.catchException(function (ex) { return ys(ex); })
   * @param {Mixed} handlerOrSecond Exception handler function that returns an observable sequence given the error that occurred in the first sequence, or a second observable sequence used to produce results when an error occurred in the first sequence.
   * @returns {Observable} An observable sequence containing the first sequence's elements, followed by the elements of the handler sequence in case an exception occurred.
   */
  observableProto['catch'] = observableProto.catchError = observableProto.catchException = function (handlerOrSecond) {
    return typeof handlerOrSecond === 'function' ?
      observableCatchHandler(this, handlerOrSecond) :
      observableCatch([this, handlerOrSecond]);
  };

  /**
   * Continues an observable sequence that is terminated by an exception with the next observable sequence.
   * @param {Array | Arguments} args Arguments or an array to use as the next sequence if an error occurs.
   * @returns {Observable} An observable sequence containing elements from consecutive source sequences until a source sequence terminates successfully.
   */
  var observableCatch = Observable.catchError = Observable['catch'] = Observable.catchException = function () {
    var items = [];
    if (Array.isArray(arguments[0])) {
      items = arguments[0];
    } else {
      for(var i = 0, len = arguments.length; i < len; i++) { items.push(arguments[i]); }
    }
    return enumerableOf(items).catchError();
  };

  /**
   * Merges the specified observable sequences into one observable sequence by using the selector function whenever any of the observable sequences or Promises produces an element.
   * This can be in the form of an argument list of observables or an array.
   *
   * @example
   * 1 - obs = observable.combineLatest(obs1, obs2, obs3, function (o1, o2, o3) { return o1 + o2 + o3; });
   * 2 - obs = observable.combineLatest([obs1, obs2, obs3], function (o1, o2, o3) { return o1 + o2 + o3; });
   * @returns {Observable} An observable sequence containing the result of combining elements of the sources using the specified result selector function.
   */
  observableProto.combineLatest = function () {
    var len = arguments.length, args = new Array(len);
    for(var i = 0; i < len; i++) { args[i] = arguments[i]; }
    if (Array.isArray(args[0])) {
      args[0].unshift(this);
    } else {
      args.unshift(this);
    }
    return combineLatest.apply(this, args);
  };

  /**
   * Merges the specified observable sequences into one observable sequence by using the selector function whenever any of the observable sequences or Promises produces an element.
   *
   * @example
   * 1 - obs = Rx.Observable.combineLatest(obs1, obs2, obs3, function (o1, o2, o3) { return o1 + o2 + o3; });
   * 2 - obs = Rx.Observable.combineLatest([obs1, obs2, obs3], function (o1, o2, o3) { return o1 + o2 + o3; });
   * @returns {Observable} An observable sequence containing the result of combining elements of the sources using the specified result selector function.
   */
  var combineLatest = Observable.combineLatest = function () {
    var len = arguments.length, args = new Array(len);
    for(var i = 0; i < len; i++) { args[i] = arguments[i]; }
    var resultSelector = args.pop();
    Array.isArray(args[0]) && (args = args[0]);

    return new AnonymousObservable(function (o) {
      var n = args.length,
        falseFactory = function () { return false; },
        hasValue = arrayInitialize(n, falseFactory),
        hasValueAll = false,
        isDone = arrayInitialize(n, falseFactory),
        values = new Array(n);

      function next(i) {
        hasValue[i] = true;
        if (hasValueAll || (hasValueAll = hasValue.every(identity))) {
          try {
            var res = resultSelector.apply(null, values);
          } catch (e) {
            return o.onError(e);
          }
          o.onNext(res);
        } else if (isDone.filter(function (x, j) { return j !== i; }).every(identity)) {
          o.onCompleted();
        }
      }

      function done (i) {
        isDone[i] = true;
        isDone.every(identity) && o.onCompleted();
      }

      var subscriptions = new Array(n);
      for (var idx = 0; idx < n; idx++) {
        (function (i) {
          var source = args[i], sad = new SingleAssignmentDisposable();
          isPromise(source) && (source = observableFromPromise(source));
          sad.setDisposable(source.subscribe(function (x) {
              values[i] = x;
              next(i);
            },
            function(e) { o.onError(e); },
            function () { done(i); }
          ));
          subscriptions[i] = sad;
        }(idx));
      }

      return new CompositeDisposable(subscriptions);
    }, this);
  };

  /**
   * Concatenates all the observable sequences.  This takes in either an array or variable arguments to concatenate.
   * @returns {Observable} An observable sequence that contains the elements of each given sequence, in sequential order.
   */
  observableProto.concat = function () {
    for(var args = [], i = 0, len = arguments.length; i < len; i++) { args.push(arguments[i]); }
    args.unshift(this);
    return observableConcat.apply(null, args);
  };

  /**
   * Concatenates all the observable sequences.
   * @param {Array | Arguments} args Arguments or an array to concat to the observable sequence.
   * @returns {Observable} An observable sequence that contains the elements of each given sequence, in sequential order.
   */
  var observableConcat = Observable.concat = function () {
    var args;
    if (Array.isArray(arguments[0])) {
      args = arguments[0];
    } else {
      args = new Array(arguments.length);
      for(var i = 0, len = arguments.length; i < len; i++) { args[i] = arguments[i]; }
    }
    return enumerableOf(args).concat();
  };

  /**
   * Concatenates an observable sequence of observable sequences.
   * @returns {Observable} An observable sequence that contains the elements of each observed inner sequence, in sequential order.
   */
  observableProto.concatAll = observableProto.concatObservable = function () {
    return this.merge(1);
  };

  var MergeObservable = (function (__super__) {
    inherits(MergeObservable, __super__);

    function MergeObservable(source, maxConcurrent) {
      this.source = source;
      this.maxConcurrent = maxConcurrent;
      __super__.call(this);
    }

    MergeObservable.prototype.subscribeCore = function(observer) {
      var g = new CompositeDisposable();
      g.add(this.source.subscribe(new MergeObserver(observer, this.maxConcurrent, g)));
      return g;
    };

    return MergeObservable;

  }(ObservableBase));

  var MergeObserver = (function () {
    function MergeObserver(o, max, g) {
      this.o = o;
      this.max = max;
      this.g = g;
      this.done = false;
      this.q = [];
      this.activeCount = 0;
      this.isStopped = false;
    }
    MergeObserver.prototype.handleSubscribe = function (xs) {
      var sad = new SingleAssignmentDisposable();
      this.g.add(sad);
      isPromise(xs) && (xs = observableFromPromise(xs));
      sad.setDisposable(xs.subscribe(new InnerObserver(this, sad)));
    };
    MergeObserver.prototype.onNext = function (innerSource) {
      if (this.isStopped) { return; }
        if(this.activeCount < this.max) {
          this.activeCount++;
          this.handleSubscribe(innerSource);
        } else {
          this.q.push(innerSource);
        }
      };
      MergeObserver.prototype.onError = function (e) {
        if (!this.isStopped) {
          this.isStopped = true;
          this.o.onError(e);
        }
      };
      MergeObserver.prototype.onCompleted = function () {
        if (!this.isStopped) {
          this.isStopped = true;
          this.done = true;
          this.activeCount === 0 && this.o.onCompleted();
        }
      };
      MergeObserver.prototype.dispose = function() { this.isStopped = true; };
      MergeObserver.prototype.fail = function (e) {
        if (!this.isStopped) {
          this.isStopped = true;
          this.o.onError(e);
          return true;
        }

        return false;
      };

      function InnerObserver(parent, sad) {
        this.parent = parent;
        this.sad = sad;
        this.isStopped = false;
      }
      InnerObserver.prototype.onNext = function (x) { if(!this.isStopped) { this.parent.o.onNext(x); } };
      InnerObserver.prototype.onError = function (e) {
        if (!this.isStopped) {
          this.isStopped = true;
          this.parent.o.onError(e);
        }
      };
      InnerObserver.prototype.onCompleted = function () {
        if(!this.isStopped) {
          this.isStopped = true;
          var parent = this.parent;
          parent.g.remove(this.sad);
          if (parent.q.length > 0) {
            parent.handleSubscribe(parent.q.shift());
          } else {
            parent.activeCount--;
            parent.done && parent.activeCount === 0 && parent.o.onCompleted();
          }
        }
      };
      InnerObserver.prototype.dispose = function() { this.isStopped = true; };
      InnerObserver.prototype.fail = function (e) {
        if (!this.isStopped) {
          this.isStopped = true;
          this.parent.o.onError(e);
          return true;
        }

        return false;
      };

      return MergeObserver;
  }());





  /**
  * Merges an observable sequence of observable sequences into an observable sequence, limiting the number of concurrent subscriptions to inner sequences.
  * Or merges two observable sequences into a single observable sequence.
  *
  * @example
  * 1 - merged = sources.merge(1);
  * 2 - merged = source.merge(otherSource);
  * @param {Mixed} [maxConcurrentOrOther] Maximum number of inner observable sequences being subscribed to concurrently or the second observable sequence.
  * @returns {Observable} The observable sequence that merges the elements of the inner sequences.
  */
  observableProto.merge = function (maxConcurrentOrOther) {
    return typeof maxConcurrentOrOther !== 'number' ?
      observableMerge(this, maxConcurrentOrOther) :
      new MergeObservable(this, maxConcurrentOrOther);
  };

  /**
   * Merges all the observable sequences into a single observable sequence.
   * The scheduler is optional and if not specified, the immediate scheduler is used.
   * @returns {Observable} The observable sequence that merges the elements of the observable sequences.
   */
  var observableMerge = Observable.merge = function () {
    var scheduler, sources = [], i, len = arguments.length;
    if (!arguments[0]) {
      scheduler = immediateScheduler;
      for(i = 1; i < len; i++) { sources.push(arguments[i]); }
    } else if (isScheduler(arguments[0])) {
      scheduler = arguments[0];
      for(i = 1; i < len; i++) { sources.push(arguments[i]); }
    } else {
      scheduler = immediateScheduler;
      for(i = 0; i < len; i++) { sources.push(arguments[i]); }
    }
    if (Array.isArray(sources[0])) {
      sources = sources[0];
    }
    return observableOf(scheduler, sources).mergeAll();
  };

  var MergeAllObservable = (function (__super__) {
    inherits(MergeAllObservable, __super__);

    function MergeAllObservable(source) {
      this.source = source;
      __super__.call(this);
    }

    MergeAllObservable.prototype.subscribeCore = function (observer) {
      var g = new CompositeDisposable(), m = new SingleAssignmentDisposable();
      g.add(m);
      m.setDisposable(this.source.subscribe(new MergeAllObserver(observer, g)));
      return g;
    };

    return MergeAllObservable;
  }(ObservableBase));

  var MergeAllObserver = (function() {

    function MergeAllObserver(o, g) {
      this.o = o;
      this.g = g;
      this.isStopped = false;
      this.done = false;
    }
    MergeAllObserver.prototype.onNext = function(innerSource) {
      if(this.isStopped) { return; }
      var sad = new SingleAssignmentDisposable();
      this.g.add(sad);

      isPromise(innerSource) && (innerSource = observableFromPromise(innerSource));

      sad.setDisposable(innerSource.subscribe(new InnerObserver(this, this.g, sad)));
    };
    MergeAllObserver.prototype.onError = function (e) {
      if(!this.isStopped) {
        this.isStopped = true;
        this.o.onError(e);
      }
    };
    MergeAllObserver.prototype.onCompleted = function () {
      if(!this.isStopped) {
        this.isStopped = true;
        this.done = true;
        this.g.length === 1 && this.o.onCompleted();
      }
    };
    MergeAllObserver.prototype.dispose = function() { this.isStopped = true; };
    MergeAllObserver.prototype.fail = function (e) {
      if (!this.isStopped) {
        this.isStopped = true;
        this.o.onError(e);
        return true;
      }

      return false;
    };

    function InnerObserver(parent, g, sad) {
      this.parent = parent;
      this.g = g;
      this.sad = sad;
      this.isStopped = false;
    }
    InnerObserver.prototype.onNext = function (x) { if (!this.isStopped) { this.parent.o.onNext(x); } };
    InnerObserver.prototype.onError = function (e) {
      if(!this.isStopped) {
        this.isStopped = true;
        this.parent.o.onError(e);
      }
    };
    InnerObserver.prototype.onCompleted = function () {
      if(!this.isStopped) {
        var parent = this.parent;
        this.isStopped = true;
        parent.g.remove(this.sad);
        parent.done && parent.g.length === 1 && parent.o.onCompleted();
      }
    };
    InnerObserver.prototype.dispose = function() { this.isStopped = true; };
    InnerObserver.prototype.fail = function (e) {
      if (!this.isStopped) {
        this.isStopped = true;
        this.parent.o.onError(e);
        return true;
      }

      return false;
    };

    return MergeAllObserver;

  }());

  /**
  * Merges an observable sequence of observable sequences into an observable sequence.
  * @returns {Observable} The observable sequence that merges the elements of the inner sequences.
  */
  observableProto.mergeAll = observableProto.mergeObservable = function () {
    return new MergeAllObservable(this);
  };

  var CompositeError = Rx.CompositeError = function(errors) {
    this.name = "NotImplementedError";
    this.innerErrors = errors;
    this.message = 'This contains multiple errors. Check the innerErrors';
    Error.call(this);
  }
  CompositeError.prototype = Error.prototype;

  /**
  * Flattens an Observable that emits Observables into one Observable, in a way that allows an Observer to
  * receive all successfully emitted items from all of the source Observables without being interrupted by
  * an error notification from one of them.
  *
  * This behaves like Observable.prototype.mergeAll except that if any of the merged Observables notify of an
  * error via the Observer's onError, mergeDelayError will refrain from propagating that
  * error notification until all of the merged Observables have finished emitting items.
  * @param {Array | Arguments} args Arguments or an array to merge.
  * @returns {Observable} an Observable that emits all of the items emitted by the Observables emitted by the Observable
  */
  Observable.mergeDelayError = function() {
    var args;
    if (Array.isArray(arguments[0])) {
      args = arguments[0];
    } else {
      var len = arguments.length;
      args = new Array(len);
      for(var i = 0; i < len; i++) { args[i] = arguments[i]; }
    }
    var source = observableOf(null, args);

    return new AnonymousObservable(function (o) {
      var group = new CompositeDisposable(),
        m = new SingleAssignmentDisposable(),
        isStopped = false,
        errors = [];

      function setCompletion() {
        if (errors.length === 0) {
          o.onCompleted();
        } else if (errors.length === 1) {
          o.onError(errors[0]);
        } else {
          o.onError(new CompositeError(errors));
        }
      }

      group.add(m);

      m.setDisposable(source.subscribe(
        function (innerSource) {
          var innerSubscription = new SingleAssignmentDisposable();
          group.add(innerSubscription);

          // Check for promises support
          isPromise(innerSource) && (innerSource = observableFromPromise(innerSource));

          innerSubscription.setDisposable(innerSource.subscribe(
            function (x) { o.onNext(x); },
            function (e) {
              errors.push(e);
              group.remove(innerSubscription);
              isStopped && group.length === 1 && setCompletion();
            },
            function () {
              group.remove(innerSubscription);
              isStopped && group.length === 1 && setCompletion();
          }));
        },
        function (e) {
          errors.push(e);
          isStopped = true;
          group.length === 1 && setCompletion();
        },
        function () {
          isStopped = true;
          group.length === 1 && setCompletion();
        }));
      return group;
    });
  };

  /**
   * Continues an observable sequence that is terminated normally or by an exception with the next observable sequence.
   * @param {Observable} second Second observable sequence used to produce results after the first sequence terminates.
   * @returns {Observable} An observable sequence that concatenates the first and second sequence, even if the first sequence terminates exceptionally.
   */
  observableProto.onErrorResumeNext = function (second) {
    if (!second) { throw new Error('Second observable is required'); }
    return onErrorResumeNext([this, second]);
  };

  /**
   * Continues an observable sequence that is terminated normally or by an exception with the next observable sequence.
   *
   * @example
   * 1 - res = Rx.Observable.onErrorResumeNext(xs, ys, zs);
   * 1 - res = Rx.Observable.onErrorResumeNext([xs, ys, zs]);
   * @returns {Observable} An observable sequence that concatenates the source sequences, even if a sequence terminates exceptionally.
   */
  var onErrorResumeNext = Observable.onErrorResumeNext = function () {
    var sources = [];
    if (Array.isArray(arguments[0])) {
      sources = arguments[0];
    } else {
      for(var i = 0, len = arguments.length; i < len; i++) { sources.push(arguments[i]); }
    }
    return new AnonymousObservable(function (observer) {
      var pos = 0, subscription = new SerialDisposable(),
      cancelable = immediateScheduler.scheduleRecursive(function (self) {
        var current, d;
        if (pos < sources.length) {
          current = sources[pos++];
          isPromise(current) && (current = observableFromPromise(current));
          d = new SingleAssignmentDisposable();
          subscription.setDisposable(d);
          d.setDisposable(current.subscribe(observer.onNext.bind(observer), self, self));
        } else {
          observer.onCompleted();
        }
      });
      return new CompositeDisposable(subscription, cancelable);
    });
  };

  /**
   * Returns the values from the source observable sequence only after the other observable sequence produces a value.
   * @param {Observable | Promise} other The observable sequence or Promise that triggers propagation of elements of the source sequence.
   * @returns {Observable} An observable sequence containing the elements of the source sequence starting from the point the other sequence triggered propagation.
   */
  observableProto.skipUntil = function (other) {
    var source = this;
    return new AnonymousObservable(function (o) {
      var isOpen = false;
      var disposables = new CompositeDisposable(source.subscribe(function (left) {
        isOpen && o.onNext(left);
      }, function (e) { o.onError(e); }, function () {
        isOpen && o.onCompleted();
      }));

      isPromise(other) && (other = observableFromPromise(other));

      var rightSubscription = new SingleAssignmentDisposable();
      disposables.add(rightSubscription);
      rightSubscription.setDisposable(other.subscribe(function () {
        isOpen = true;
        rightSubscription.dispose();
      }, function (e) { o.onError(e); }, function () {
        rightSubscription.dispose();
      }));

      return disposables;
    }, source);
  };

  /**
   * Transforms an observable sequence of observable sequences into an observable sequence producing values only from the most recent observable sequence.
   * @returns {Observable} The observable sequence that at any point in time produces the elements of the most recent inner observable sequence that has been received.
   */
  observableProto['switch'] = observableProto.switchLatest = function () {
    var sources = this;
    return new AnonymousObservable(function (observer) {
      var hasLatest = false,
        innerSubscription = new SerialDisposable(),
        isStopped = false,
        latest = 0,
        subscription = sources.subscribe(
          function (innerSource) {
            var d = new SingleAssignmentDisposable(), id = ++latest;
            hasLatest = true;
            innerSubscription.setDisposable(d);

            // Check if Promise or Observable
            isPromise(innerSource) && (innerSource = observableFromPromise(innerSource));

            d.setDisposable(innerSource.subscribe(
              function (x) { latest === id && observer.onNext(x); },
              function (e) { latest === id && observer.onError(e); },
              function () {
                if (latest === id) {
                  hasLatest = false;
                  isStopped && observer.onCompleted();
                }
              }));
          },
          function (e) { observer.onError(e); },
          function () {
            isStopped = true;
            !hasLatest && observer.onCompleted();
          });
      return new CompositeDisposable(subscription, innerSubscription);
    }, sources);
  };

  /**
   * Returns the values from the source observable sequence until the other observable sequence produces a value.
   * @param {Observable | Promise} other Observable sequence or Promise that terminates propagation of elements of the source sequence.
   * @returns {Observable} An observable sequence containing the elements of the source sequence up to the point the other sequence interrupted further propagation.
   */
  observableProto.takeUntil = function (other) {
    var source = this;
    return new AnonymousObservable(function (o) {
      isPromise(other) && (other = observableFromPromise(other));
      return new CompositeDisposable(
        source.subscribe(o),
        other.subscribe(function () { o.onCompleted(); }, function (e) { o.onError(e); }, noop)
      );
    }, source);
  };

  /**
   * Merges the specified observable sequences into one observable sequence by using the selector function only when the (first) source observable sequence produces an element.
   *
   * @example
   * 1 - obs = obs1.withLatestFrom(obs2, obs3, function (o1, o2, o3) { return o1 + o2 + o3; });
   * 2 - obs = obs1.withLatestFrom([obs2, obs3], function (o1, o2, o3) { return o1 + o2 + o3; });
   * @returns {Observable} An observable sequence containing the result of combining elements of the sources using the specified result selector function.
   */
  observableProto.withLatestFrom = function () {
    var len = arguments.length, args = new Array(len)
    for(var i = 0; i < len; i++) { args[i] = arguments[i]; }
    var resultSelector = args.pop(), source = this;

    if (typeof source === 'undefined') {
      throw new Error('Source observable not found for withLatestFrom().');
    }
    if (typeof resultSelector !== 'function') {
      throw new Error('withLatestFrom() expects a resultSelector function.');
    }
    if (Array.isArray(args[0])) {
      args = args[0];
    }

    return new AnonymousObservable(function (observer) {
      var falseFactory = function () { return false; },
        n = args.length,
        hasValue = arrayInitialize(n, falseFactory),
        hasValueAll = false,
        values = new Array(n);

      var subscriptions = new Array(n + 1);
      for (var idx = 0; idx < n; idx++) {
        (function (i) {
          var other = args[i], sad = new SingleAssignmentDisposable();
          isPromise(other) && (other = observableFromPromise(other));
          sad.setDisposable(other.subscribe(function (x) {
            values[i] = x;
            hasValue[i] = true;
            hasValueAll = hasValue.every(identity);
          }, observer.onError.bind(observer), function () {}));
          subscriptions[i] = sad;
        }(idx));
      }

      var sad = new SingleAssignmentDisposable();
      sad.setDisposable(source.subscribe(function (x) {
        var res;
        var allValues = [x].concat(values);
        if (!hasValueAll) return;
        try {
          res = resultSelector.apply(null, allValues);
        } catch (ex) {
          observer.onError(ex);
          return;
        }
        observer.onNext(res);
      }, observer.onError.bind(observer), function () {
        observer.onCompleted();
      }));
      subscriptions[n] = sad;

      return new CompositeDisposable(subscriptions);
    }, this);
  };

  function zipArray(second, resultSelector) {
    var first = this;
    return new AnonymousObservable(function (observer) {
      var index = 0, len = second.length;
      return first.subscribe(function (left) {
        if (index < len) {
          var right = second[index++], result;
          try {
            result = resultSelector(left, right);
          } catch (e) {
            return observer.onError(e);
          }
          observer.onNext(result);
        } else {
          observer.onCompleted();
        }
      }, function (e) { observer.onError(e); }, function () { observer.onCompleted(); });
    }, first);
  }

  function falseFactory() { return false; }
  function emptyArrayFactory() { return []; }

  /**
   * Merges the specified observable sequences into one observable sequence by using the selector function whenever all of the observable sequences or an array have produced an element at a corresponding index.
   * The last element in the arguments must be a function to invoke for each series of elements at corresponding indexes in the args.
   *
   * @example
   * 1 - res = obs1.zip(obs2, fn);
   * 1 - res = x1.zip([1,2,3], fn);
   * @returns {Observable} An observable sequence containing the result of combining elements of the args using the specified result selector function.
   */
  observableProto.zip = function () {
    if (Array.isArray(arguments[0])) { return zipArray.apply(this, arguments); }
    var len = arguments.length, args = new Array(len);
    for(var i = 0; i < len; i++) { args[i] = arguments[i]; }

    var parent = this, resultSelector = args.pop();
    args.unshift(parent);
    return new AnonymousObservable(function (observer) {
      var n = args.length,
        queues = arrayInitialize(n, emptyArrayFactory),
        isDone = arrayInitialize(n, falseFactory);

      function next(i) {
        var res, queuedValues;
        if (queues.every(function (x) { return x.length > 0; })) {
          try {
            queuedValues = queues.map(function (x) { return x.shift(); });
            res = resultSelector.apply(parent, queuedValues);
          } catch (ex) {
            observer.onError(ex);
            return;
          }
          observer.onNext(res);
        } else if (isDone.filter(function (x, j) { return j !== i; }).every(identity)) {
          observer.onCompleted();
        }
      };

      function done(i) {
        isDone[i] = true;
        if (isDone.every(function (x) { return x; })) {
          observer.onCompleted();
        }
      }

      var subscriptions = new Array(n);
      for (var idx = 0; idx < n; idx++) {
        (function (i) {
          var source = args[i], sad = new SingleAssignmentDisposable();
          isPromise(source) && (source = observableFromPromise(source));
          sad.setDisposable(source.subscribe(function (x) {
            queues[i].push(x);
            next(i);
          }, function (e) { observer.onError(e); }, function () {
            done(i);
          }));
          subscriptions[i] = sad;
        })(idx);
      }

      return new CompositeDisposable(subscriptions);
    }, parent);
  };

  /**
   * Merges the specified observable sequences into one observable sequence by using the selector function whenever all of the observable sequences have produced an element at a corresponding index.
   * @param arguments Observable sources.
   * @param {Function} resultSelector Function to invoke for each series of elements at corresponding indexes in the sources.
   * @returns {Observable} An observable sequence containing the result of combining elements of the sources using the specified result selector function.
   */
  Observable.zip = function () {
    var len = arguments.length, args = new Array(len);
    for(var i = 0; i < len; i++) { args[i] = arguments[i]; }
    var first = args.shift();
    return first.zip.apply(first, args);
  };

  /**
   * Merges the specified observable sequences into one observable sequence by emitting a list with the elements of the observable sequences at corresponding indexes.
   * @param arguments Observable sources.
   * @returns {Observable} An observable sequence containing lists of elements at corresponding indexes.
   */
  Observable.zipArray = function () {
    var sources;
    if (Array.isArray(arguments[0])) {
      sources = arguments[0];
    } else {
      var len = arguments.length;
      sources = new Array(len);
      for(var i = 0; i < len; i++) { sources[i] = arguments[i]; }
    }
    return new AnonymousObservable(function (observer) {
      var n = sources.length,
        queues = arrayInitialize(n, function () { return []; }),
        isDone = arrayInitialize(n, function () { return false; });

      function next(i) {
        if (queues.every(function (x) { return x.length > 0; })) {
          var res = queues.map(function (x) { return x.shift(); });
          observer.onNext(res);
        } else if (isDone.filter(function (x, j) { return j !== i; }).every(identity)) {
          observer.onCompleted();
          return;
        }
      };

      function done(i) {
        isDone[i] = true;
        if (isDone.every(identity)) {
          observer.onCompleted();
          return;
        }
      }

      var subscriptions = new Array(n);
      for (var idx = 0; idx < n; idx++) {
        (function (i) {
          subscriptions[i] = new SingleAssignmentDisposable();
          subscriptions[i].setDisposable(sources[i].subscribe(function (x) {
            queues[i].push(x);
            next(i);
          }, function (e) { observer.onError(e); }, function () {
            done(i);
          }));
        })(idx);
      }

      return new CompositeDisposable(subscriptions);
    });
  };

  /**
   *  Hides the identity of an observable sequence.
   * @returns {Observable} An observable sequence that hides the identity of the source sequence.
   */
  observableProto.asObservable = function () {
    var source = this;
    return new AnonymousObservable(function (o) { return source.subscribe(o); }, this);
  };

  /**
   *  Projects each element of an observable sequence into zero or more buffers which are produced based on element count information.
   *
   * @example
   *  var res = xs.bufferWithCount(10);
   *  var res = xs.bufferWithCount(10, 1);
   * @param {Number} count Length of each buffer.
   * @param {Number} [skip] Number of elements to skip between creation of consecutive buffers. If not provided, defaults to the count.
   * @returns {Observable} An observable sequence of buffers.
   */
  observableProto.bufferWithCount = function (count, skip) {
    if (typeof skip !== 'number') {
      skip = count;
    }
    return this.windowWithCount(count, skip).selectMany(function (x) {
      return x.toArray();
    }).where(function (x) {
      return x.length > 0;
    });
  };

  /**
   * Dematerializes the explicit notification values of an observable sequence as implicit notifications.
   * @returns {Observable} An observable sequence exhibiting the behavior corresponding to the source sequence's notification values.
   */
  observableProto.dematerialize = function () {
    var source = this;
    return new AnonymousObservable(function (o) {
      return source.subscribe(function (x) { return x.accept(o); }, function(e) { o.onError(e); }, function () { o.onCompleted(); });
    }, this);
  };

  /**
   *  Returns an observable sequence that contains only distinct contiguous elements according to the keySelector and the comparer.
   *
   *  var obs = observable.distinctUntilChanged();
   *  var obs = observable.distinctUntilChanged(function (x) { return x.id; });
   *  var obs = observable.distinctUntilChanged(function (x) { return x.id; }, function (x, y) { return x === y; });
   *
   * @param {Function} [keySelector] A function to compute the comparison key for each element. If not provided, it projects the value.
   * @param {Function} [comparer] Equality comparer for computed key values. If not provided, defaults to an equality comparer function.
   * @returns {Observable} An observable sequence only containing the distinct contiguous elements, based on a computed key value, from the source sequence.
   */
  observableProto.distinctUntilChanged = function (keySelector, comparer) {
    var source = this;
    comparer || (comparer = defaultComparer);
    return new AnonymousObservable(function (o) {
      var hasCurrentKey = false, currentKey;
      return source.subscribe(function (value) {
        var key = value;
        if (keySelector) {
          try {
            key = keySelector(value);
          } catch (e) {
            o.onError(e);
            return;
          }
        }
        if (hasCurrentKey) {
          try {
            var comparerEquals = comparer(currentKey, key);
          } catch (e) {
            o.onError(e);
            return;
          }
        }
        if (!hasCurrentKey || !comparerEquals) {
          hasCurrentKey = true;
          currentKey = key;
          o.onNext(value);
        }
      }, function (e) { o.onError(e); }, function () { o.onCompleted(); });
    }, this);
  };

  /**
   *  Invokes an action for each element in the observable sequence and invokes an action upon graceful or exceptional termination of the observable sequence.
   *  This method can be used for debugging, logging, etc. of query behavior by intercepting the message stream to run arbitrary actions for messages on the pipeline.
   * @param {Function | Observer} observerOrOnNext Action to invoke for each element in the observable sequence or an observer.
   * @param {Function} [onError]  Action to invoke upon exceptional termination of the observable sequence. Used if only the observerOrOnNext parameter is also a function.
   * @param {Function} [onCompleted]  Action to invoke upon graceful termination of the observable sequence. Used if only the observerOrOnNext parameter is also a function.
   * @returns {Observable} The source sequence with the side-effecting behavior applied.
   */
  observableProto['do'] = observableProto.tap = observableProto.doAction = function (observerOrOnNext, onError, onCompleted) {
    var source = this;
    return new AnonymousObservable(function (observer) {
      var tapObserver = !observerOrOnNext || isFunction(observerOrOnNext) ?
        observerCreate(observerOrOnNext || noop, onError || noop, onCompleted || noop) :
        observerOrOnNext;

      return source.subscribe(function (x) {
        try {
          tapObserver.onNext(x);
        } catch (e) {
          observer.onError(e);
        }
        observer.onNext(x);
      }, function (err) {
          try {
            tapObserver.onError(err);
          } catch (e) {
            observer.onError(e);
          }
        observer.onError(err);
      }, function () {
        try {
          tapObserver.onCompleted();
        } catch (e) {
          observer.onError(e);
        }
        observer.onCompleted();
      });
    }, this);
  };

  /**
   *  Invokes an action for each element in the observable sequence.
   *  This method can be used for debugging, logging, etc. of query behavior by intercepting the message stream to run arbitrary actions for messages on the pipeline.
   * @param {Function} onNext Action to invoke for each element in the observable sequence.
   * @param {Any} [thisArg] Object to use as this when executing callback.
   * @returns {Observable} The source sequence with the side-effecting behavior applied.
   */
  observableProto.doOnNext = observableProto.tapOnNext = function (onNext, thisArg) {
    return this.tap(typeof thisArg !== 'undefined' ? function (x) { onNext.call(thisArg, x); } : onNext);
  };

  /**
   *  Invokes an action upon exceptional termination of the observable sequence.
   *  This method can be used for debugging, logging, etc. of query behavior by intercepting the message stream to run arbitrary actions for messages on the pipeline.
   * @param {Function} onError Action to invoke upon exceptional termination of the observable sequence.
   * @param {Any} [thisArg] Object to use as this when executing callback.
   * @returns {Observable} The source sequence with the side-effecting behavior applied.
   */
  observableProto.doOnError = observableProto.tapOnError = function (onError, thisArg) {
    return this.tap(noop, typeof thisArg !== 'undefined' ? function (e) { onError.call(thisArg, e); } : onError);
  };

  /**
   *  Invokes an action upon graceful termination of the observable sequence.
   *  This method can be used for debugging, logging, etc. of query behavior by intercepting the message stream to run arbitrary actions for messages on the pipeline.
   * @param {Function} onCompleted Action to invoke upon graceful termination of the observable sequence.
   * @param {Any} [thisArg] Object to use as this when executing callback.
   * @returns {Observable} The source sequence with the side-effecting behavior applied.
   */
  observableProto.doOnCompleted = observableProto.tapOnCompleted = function (onCompleted, thisArg) {
    return this.tap(noop, null, typeof thisArg !== 'undefined' ? function () { onCompleted.call(thisArg); } : onCompleted);
  };

  /**
   *  Invokes a specified action after the source observable sequence terminates gracefully or exceptionally.
   * @param {Function} finallyAction Action to invoke after the source observable sequence terminates.
   * @returns {Observable} Source sequence with the action-invoking termination behavior applied.
   */
  observableProto['finally'] = observableProto.ensure = function (action) {
    var source = this;
    return new AnonymousObservable(function (observer) {
      var subscription;
      try {
        subscription = source.subscribe(observer);
      } catch (e) {
        action();
        throw e;
      }
      return disposableCreate(function () {
        try {
          subscription.dispose();
        } catch (e) {
          throw e;
        } finally {
          action();
        }
      });
    }, this);
  };

  /**
   * @deprecated use #finally or #ensure instead.
   */
  observableProto.finallyAction = function (action) {
    //deprecate('finallyAction', 'finally or ensure');
    return this.ensure(action);
  };

  /**
   *  Ignores all elements in an observable sequence leaving only the termination messages.
   * @returns {Observable} An empty observable sequence that signals termination, successful or exceptional, of the source sequence.
   */
  observableProto.ignoreElements = function () {
    var source = this;
    return new AnonymousObservable(function (o) {
      return source.subscribe(noop, function (e) { o.onError(e); }, function () { o.onCompleted(); });
    }, source);
  };

  /**
   *  Materializes the implicit notifications of an observable sequence as explicit notification values.
   * @returns {Observable} An observable sequence containing the materialized notification values from the source sequence.
   */
  observableProto.materialize = function () {
    var source = this;
    return new AnonymousObservable(function (observer) {
      return source.subscribe(function (value) {
        observer.onNext(notificationCreateOnNext(value));
      }, function (e) {
        observer.onNext(notificationCreateOnError(e));
        observer.onCompleted();
      }, function () {
        observer.onNext(notificationCreateOnCompleted());
        observer.onCompleted();
      });
    }, source);
  };

  /**
   *  Repeats the observable sequence a specified number of times. If the repeat count is not specified, the sequence repeats indefinitely.
   * @param {Number} [repeatCount]  Number of times to repeat the sequence. If not provided, repeats the sequence indefinitely.
   * @returns {Observable} The observable sequence producing the elements of the given sequence repeatedly.
   */
  observableProto.repeat = function (repeatCount) {
    return enumerableRepeat(this, repeatCount).concat();
  };

  /**
   *  Repeats the source observable sequence the specified number of times or until it successfully terminates. If the retry count is not specified, it retries indefinitely.
   *  Note if you encounter an error and want it to retry once, then you must use .retry(2);
   *
   * @example
   *  var res = retried = retry.repeat();
   *  var res = retried = retry.repeat(2);
   * @param {Number} [retryCount]  Number of times to retry the sequence. If not provided, retry the sequence indefinitely.
   * @returns {Observable} An observable sequence producing the elements of the given sequence repeatedly until it terminates successfully.
   */
  observableProto.retry = function (retryCount) {
    return enumerableRepeat(this, retryCount).catchError();
  };

  /**
   *  Repeats the source observable sequence upon error each time the notifier emits or until it successfully terminates. 
   *  if the notifier completes, the observable sequence completes.
   *
   * @example
   *  var timer = Observable.timer(500);
   *  var source = observable.retryWhen(timer);
   * @param {Observable} [notifier] An observable that triggers the retries or completes the observable with onNext or onCompleted respectively.
   * @returns {Observable} An observable sequence producing the elements of the given sequence repeatedly until it terminates successfully.
   */
  observableProto.retryWhen = function (notifier) {
    return enumerableRepeat(this).catchErrorWhen(notifier);
  };
  /**
   *  Applies an accumulator function over an observable sequence and returns each intermediate result. The optional seed value is used as the initial accumulator value.
   *  For aggregation behavior with no intermediate results, see Observable.aggregate.
   * @example
   *  var res = source.scan(function (acc, x) { return acc + x; });
   *  var res = source.scan(0, function (acc, x) { return acc + x; });
   * @param {Mixed} [seed] The initial accumulator value.
   * @param {Function} accumulator An accumulator function to be invoked on each element.
   * @returns {Observable} An observable sequence containing the accumulated values.
   */
  observableProto.scan = function () {
    var hasSeed = false, seed, accumulator, source = this;
    if (arguments.length === 2) {
      hasSeed = true;
      seed = arguments[0];
      accumulator = arguments[1];
    } else {
      accumulator = arguments[0];
    }
    return new AnonymousObservable(function (o) {
      var hasAccumulation, accumulation, hasValue;
      return source.subscribe (
        function (x) {
          !hasValue && (hasValue = true);
          try {
            if (hasAccumulation) {
              accumulation = accumulator(accumulation, x);
            } else {
              accumulation = hasSeed ? accumulator(seed, x) : x;
              hasAccumulation = true;
            }
          } catch (e) {
            o.onError(e);
            return;
          }

          o.onNext(accumulation);
        },
        function (e) { o.onError(e); },
        function () {
          !hasValue && hasSeed && o.onNext(seed);
          o.onCompleted();
        }
      );
    }, source);
  };

  /**
   *  Bypasses a specified number of elements at the end of an observable sequence.
   * @description
   *  This operator accumulates a queue with a length enough to store the first `count` elements. As more elements are
   *  received, elements are taken from the front of the queue and produced on the result sequence. This causes elements to be delayed.
   * @param count Number of elements to bypass at the end of the source sequence.
   * @returns {Observable} An observable sequence containing the source sequence elements except for the bypassed ones at the end.
   */
  observableProto.skipLast = function (count) {
    if (count < 0) { throw new ArgumentOutOfRangeError(); }
    var source = this;
    return new AnonymousObservable(function (o) {
      var q = [];
      return source.subscribe(function (x) {
        q.push(x);
        q.length > count && o.onNext(q.shift());
      }, function (e) { o.onError(e); }, function () { o.onCompleted(); });
    }, source);
  };

  /**
   *  Prepends a sequence of values to an observable sequence with an optional scheduler and an argument list of values to prepend.
   *  @example
   *  var res = source.startWith(1, 2, 3);
   *  var res = source.startWith(Rx.Scheduler.timeout, 1, 2, 3);
   * @param {Arguments} args The specified values to prepend to the observable sequence
   * @returns {Observable} The source sequence prepended with the specified values.
   */
  observableProto.startWith = function () {
    var values, scheduler, start = 0;
    if (!!arguments.length && isScheduler(arguments[0])) {
      scheduler = arguments[0];
      start = 1;
    } else {
      scheduler = immediateScheduler;
    }
    for(var args = [], i = start, len = arguments.length; i < len; i++) { args.push(arguments[i]); }
    return enumerableOf([observableFromArray(args, scheduler), this]).concat();
  };

  /**
   *  Returns a specified number of contiguous elements from the end of an observable sequence.
   * @description
   *  This operator accumulates a buffer with a length enough to store elements count elements. Upon completion of
   *  the source sequence, this buffer is drained on the result sequence. This causes the elements to be delayed.
   * @param {Number} count Number of elements to take from the end of the source sequence.
   * @returns {Observable} An observable sequence containing the specified number of elements from the end of the source sequence.
   */
  observableProto.takeLast = function (count) {
    if (count < 0) { throw new ArgumentOutOfRangeError(); }
    var source = this;
    return new AnonymousObservable(function (o) {
      var q = [];
      return source.subscribe(function (x) {
        q.push(x);
        q.length > count && q.shift();
      }, function (e) { o.onError(e); }, function () {
        while (q.length > 0) { o.onNext(q.shift()); }
        o.onCompleted();
      });
    }, source);
  };

  /**
   *  Returns an array with the specified number of contiguous elements from the end of an observable sequence.
   *
   * @description
   *  This operator accumulates a buffer with a length enough to store count elements. Upon completion of the
   *  source sequence, this buffer is produced on the result sequence.
   * @param {Number} count Number of elements to take from the end of the source sequence.
   * @returns {Observable} An observable sequence containing a single array with the specified number of elements from the end of the source sequence.
   */
  observableProto.takeLastBuffer = function (count) {
    var source = this;
    return new AnonymousObservable(function (o) {
      var q = [];
      return source.subscribe(function (x) {
        q.push(x);
        q.length > count && q.shift();
      }, function (e) { o.onError(e); }, function () {
        o.onNext(q);
        o.onCompleted();
      });
    }, source);
  };

  /**
   *  Projects each element of an observable sequence into zero or more windows which are produced based on element count information.
   *
   *  var res = xs.windowWithCount(10);
   *  var res = xs.windowWithCount(10, 1);
   * @param {Number} count Length of each window.
   * @param {Number} [skip] Number of elements to skip between creation of consecutive windows. If not specified, defaults to the count.
   * @returns {Observable} An observable sequence of windows.
   */
  observableProto.windowWithCount = function (count, skip) {
    var source = this;
    +count || (count = 0);
    Math.abs(count) === Infinity && (count = 0);
    if (count <= 0) { throw new ArgumentOutOfRangeError(); }
    skip == null && (skip = count);
    +skip || (skip = 0);
    Math.abs(skip) === Infinity && (skip = 0);

    if (skip <= 0) { throw new ArgumentOutOfRangeError(); }
    return new AnonymousObservable(function (observer) {
      var m = new SingleAssignmentDisposable(),
        refCountDisposable = new RefCountDisposable(m),
        n = 0,
        q = [];

      function createWindow () {
        var s = new Subject();
        q.push(s);
        observer.onNext(addRef(s, refCountDisposable));
      }

      createWindow();

      m.setDisposable(source.subscribe(
        function (x) {
          for (var i = 0, len = q.length; i < len; i++) { q[i].onNext(x); }
          var c = n - count + 1;
          c >= 0 && c % skip === 0 && q.shift().onCompleted();
          ++n % skip === 0 && createWindow();
        },
        function (e) {
          while (q.length > 0) { q.shift().onError(e); }
          observer.onError(e);
        },
        function () {
          while (q.length > 0) { q.shift().onCompleted(); }
          observer.onCompleted();
        }
      ));
      return refCountDisposable;
    }, source);
  };

  function concatMap(source, selector, thisArg) {
    var selectorFunc = bindCallback(selector, thisArg, 3);
    return source.map(function (x, i) {
      var result = selectorFunc(x, i, source);
      isPromise(result) && (result = observableFromPromise(result));
      (isArrayLike(result) || isIterable(result)) && (result = observableFrom(result));
      return result;
    }).concatAll();
  }

  /**
   *  One of the Following:
   *  Projects each element of an observable sequence to an observable sequence and merges the resulting observable sequences into one observable sequence.
   *
   * @example
   *  var res = source.concatMap(function (x) { return Rx.Observable.range(0, x); });
   *  Or:
   *  Projects each element of an observable sequence to an observable sequence, invokes the result selector for the source element and each of the corresponding inner sequence's elements, and merges the results into one observable sequence.
   *
   *  var res = source.concatMap(function (x) { return Rx.Observable.range(0, x); }, function (x, y) { return x + y; });
   *  Or:
   *  Projects each element of the source observable sequence to the other observable sequence and merges the resulting observable sequences into one observable sequence.
   *
   *  var res = source.concatMap(Rx.Observable.fromArray([1,2,3]));
   * @param {Function} selector A transform function to apply to each element or an observable sequence to project each element from the
   * source sequence onto which could be either an observable or Promise.
   * @param {Function} [resultSelector]  A transform function to apply to each element of the intermediate sequence.
   * @returns {Observable} An observable sequence whose elements are the result of invoking the one-to-many transform function collectionSelector on each element of the input sequence and then mapping each of those sequence elements and their corresponding source element to a result element.
   */
  observableProto.selectConcat = observableProto.concatMap = function (selector, resultSelector, thisArg) {
    if (isFunction(selector) && isFunction(resultSelector)) {
      return this.concatMap(function (x, i) {
        var selectorResult = selector(x, i);
        isPromise(selectorResult) && (selectorResult = observableFromPromise(selectorResult));
        (isArrayLike(selectorResult) || isIterable(selectorResult)) && (selectorResult = observableFrom(selectorResult));

        return selectorResult.map(function (y, i2) {
          return resultSelector(x, y, i, i2);
        });
      });
    }
    return isFunction(selector) ?
      concatMap(this, selector, thisArg) :
      concatMap(this, function () { return selector; });
  };

  /**
   * Projects each notification of an observable sequence to an observable sequence and concats the resulting observable sequences into one observable sequence.
   * @param {Function} onNext A transform function to apply to each element; the second parameter of the function represents the index of the source element.
   * @param {Function} onError A transform function to apply when an error occurs in the source sequence.
   * @param {Function} onCompleted A transform function to apply when the end of the source sequence is reached.
   * @param {Any} [thisArg] An optional "this" to use to invoke each transform.
   * @returns {Observable} An observable sequence whose elements are the result of invoking the one-to-many transform function corresponding to each notification in the input sequence.
   */
  observableProto.concatMapObserver = observableProto.selectConcatObserver = function(onNext, onError, onCompleted, thisArg) {
    var source = this,
        onNextFunc = bindCallback(onNext, thisArg, 2),
        onErrorFunc = bindCallback(onError, thisArg, 1),
        onCompletedFunc = bindCallback(onCompleted, thisArg, 0);
    return new AnonymousObservable(function (observer) {
      var index = 0;
      return source.subscribe(
        function (x) {
          var result;
          try {
            result = onNextFunc(x, index++);
          } catch (e) {
            observer.onError(e);
            return;
          }
          isPromise(result) && (result = observableFromPromise(result));
          observer.onNext(result);
        },
        function (err) {
          var result;
          try {
            result = onErrorFunc(err);
          } catch (e) {
            observer.onError(e);
            return;
          }
          isPromise(result) && (result = observableFromPromise(result));
          observer.onNext(result);
          observer.onCompleted();
        },
        function () {
          var result;
          try {
            result = onCompletedFunc();
          } catch (e) {
            observer.onError(e);
            return;
          }
          isPromise(result) && (result = observableFromPromise(result));
          observer.onNext(result);
          observer.onCompleted();
        });
    }, this).concatAll();
  };

    /**
     *  Returns the elements of the specified sequence or the specified value in a singleton sequence if the sequence is empty.
     *
     *  var res = obs = xs.defaultIfEmpty();
     *  2 - obs = xs.defaultIfEmpty(false);
     *
     * @memberOf Observable#
     * @param defaultValue The value to return if the sequence is empty. If not provided, this defaults to null.
     * @returns {Observable} An observable sequence that contains the specified default value if the source is empty; otherwise, the elements of the source itself.
     */
    observableProto.defaultIfEmpty = function (defaultValue) {
      var source = this;
      defaultValue === undefined && (defaultValue = null);
      return new AnonymousObservable(function (observer) {
        var found = false;
        return source.subscribe(function (x) {
          found = true;
          observer.onNext(x);
        },
        function (e) { observer.onError(e); }, 
        function () {
          !found && observer.onNext(defaultValue);
          observer.onCompleted();
        });
      }, source);
    };

  // Swap out for Array.findIndex
  function arrayIndexOfComparer(array, item, comparer) {
    for (var i = 0, len = array.length; i < len; i++) {
      if (comparer(array[i], item)) { return i; }
    }
    return -1;
  }

  function HashSet(comparer) {
    this.comparer = comparer;
    this.set = [];
  }
  HashSet.prototype.push = function(value) {
    var retValue = arrayIndexOfComparer(this.set, value, this.comparer) === -1;
    retValue && this.set.push(value);
    return retValue;
  };

  /**
   *  Returns an observable sequence that contains only distinct elements according to the keySelector and the comparer.
   *  Usage of this operator should be considered carefully due to the maintenance of an internal lookup structure which can grow large.
   *
   * @example
   *  var res = obs = xs.distinct();
   *  2 - obs = xs.distinct(function (x) { return x.id; });
   *  2 - obs = xs.distinct(function (x) { return x.id; }, function (a,b) { return a === b; });
   * @param {Function} [keySelector]  A function to compute the comparison key for each element.
   * @param {Function} [comparer]  Used to compare items in the collection.
   * @returns {Observable} An observable sequence only containing the distinct elements, based on a computed key value, from the source sequence.
   */
  observableProto.distinct = function (keySelector, comparer) {
    var source = this;
    comparer || (comparer = defaultComparer);
    return new AnonymousObservable(function (o) {
      var hashSet = new HashSet(comparer);
      return source.subscribe(function (x) {
        var key = x;

        if (keySelector) {
          try {
            key = keySelector(x);
          } catch (e) {
            o.onError(e);
            return;
          }
        }
        hashSet.push(key) && o.onNext(x);
      },
      function (e) { o.onError(e); }, function () { o.onCompleted(); });
    }, this);
  };

  /**
   *  Groups the elements of an observable sequence according to a specified key selector function and comparer and selects the resulting elements by using a specified function.
   *
   * @example
   *  var res = observable.groupBy(function (x) { return x.id; });
   *  2 - observable.groupBy(function (x) { return x.id; }), function (x) { return x.name; });
   *  3 - observable.groupBy(function (x) { return x.id; }), function (x) { return x.name; }, function (x) { return x.toString(); });
   * @param {Function} keySelector A function to extract the key for each element.
   * @param {Function} [elementSelector]  A function to map each source element to an element in an observable group.
   * @param {Function} [comparer] Used to determine whether the objects are equal.
   * @returns {Observable} A sequence of observable groups, each of which corresponds to a unique key value, containing all elements that share that same key value.
   */
  observableProto.groupBy = function (keySelector, elementSelector, comparer) {
    return this.groupByUntil(keySelector, elementSelector, observableNever, comparer);
  };

    /**
     *  Groups the elements of an observable sequence according to a specified key selector function.
     *  A duration selector function is used to control the lifetime of groups. When a group expires, it receives an OnCompleted notification. When a new element with the same
     *  key value as a reclaimed group occurs, the group will be reborn with a new lifetime request.
     *
     * @example
     *  var res = observable.groupByUntil(function (x) { return x.id; }, null,  function () { return Rx.Observable.never(); });
     *  2 - observable.groupBy(function (x) { return x.id; }), function (x) { return x.name; },  function () { return Rx.Observable.never(); });
     *  3 - observable.groupBy(function (x) { return x.id; }), function (x) { return x.name; },  function () { return Rx.Observable.never(); }, function (x) { return x.toString(); });
     * @param {Function} keySelector A function to extract the key for each element.
     * @param {Function} durationSelector A function to signal the expiration of a group.
     * @param {Function} [comparer] Used to compare objects. When not specified, the default comparer is used.
     * @returns {Observable}
     *  A sequence of observable groups, each of which corresponds to a unique key value, containing all elements that share that same key value.
     *  If a group's lifetime expires, a new group with the same key value can be created once an element with such a key value is encoutered.
     *
     */
    observableProto.groupByUntil = function (keySelector, elementSelector, durationSelector, comparer) {
      var source = this;
      elementSelector || (elementSelector = identity);
      comparer || (comparer = defaultComparer);
      return new AnonymousObservable(function (observer) {
        function handleError(e) { return function (item) { item.onError(e); }; }
        var map = new Dictionary(0, comparer),
          groupDisposable = new CompositeDisposable(),
          refCountDisposable = new RefCountDisposable(groupDisposable);

        groupDisposable.add(source.subscribe(function (x) {
          var key;
          try {
            key = keySelector(x);
          } catch (e) {
            map.getValues().forEach(handleError(e));
            observer.onError(e);
            return;
          }

          var fireNewMapEntry = false,
            writer = map.tryGetValue(key);
          if (!writer) {
            writer = new Subject();
            map.set(key, writer);
            fireNewMapEntry = true;
          }

          if (fireNewMapEntry) {
            var group = new GroupedObservable(key, writer, refCountDisposable),
              durationGroup = new GroupedObservable(key, writer);
            try {
              duration = durationSelector(durationGroup);
            } catch (e) {
              map.getValues().forEach(handleError(e));
              observer.onError(e);
              return;
            }

            observer.onNext(group);

            var md = new SingleAssignmentDisposable();
            groupDisposable.add(md);

            var expire = function () {
              map.remove(key) && writer.onCompleted();
              groupDisposable.remove(md);
            };

            md.setDisposable(duration.take(1).subscribe(
              noop,
              function (exn) {
                map.getValues().forEach(handleError(exn));
                observer.onError(exn);
              },
              expire)
            );
          }

          var element;
          try {
            element = elementSelector(x);
          } catch (e) {
            map.getValues().forEach(handleError(e));
            observer.onError(e);
            return;
          }

          writer.onNext(element);
      }, function (ex) {
        map.getValues().forEach(handleError(ex));
        observer.onError(ex);
      }, function () {
        map.getValues().forEach(function (item) { item.onCompleted(); });
        observer.onCompleted();
      }));

      return refCountDisposable;
    }, source);
  };

  var MapObservable = (function (__super__) {
    inherits(MapObservable, __super__);

    function MapObservable(source, selector, thisArg) {
      this.source = source;
      this.selector = bindCallback(selector, thisArg, 3);
      __super__.call(this);
    }

    MapObservable.prototype.internalMap = function (selector, thisArg) {
      var self = this;
      return new MapObservable(this.source, function (x, i, o) { return selector.call(this, self.selector(x, i, o), i, o); }, thisArg)
    };

    MapObservable.prototype.subscribeCore = function (observer) {
      return this.source.subscribe(new MapObserver(observer, this.selector, this));
    };

    return MapObservable;

  }(ObservableBase));

  function MapObserver(observer, selector, source) {
    this.observer = observer;
    this.selector = selector;
    this.source = source;
    this.i = 0;
    this.isStopped = false;
  }

  MapObserver.prototype.onNext = function(x) {
    if (this.isStopped) { return; }
    var result = tryCatch(this.selector).call(this, x, this.i++, this.source);
    if (result === errorObj) {
      return this.observer.onError(result.e);
    }
    this.observer.onNext(result);
  };
  MapObserver.prototype.onError = function (e) {
    if(!this.isStopped) { this.isStopped = true; this.observer.onError(e); }
  };
  MapObserver.prototype.onCompleted = function () {
    if(!this.isStopped) { this.isStopped = true; this.observer.onCompleted(); }
  };
  MapObserver.prototype.dispose = function() { this.isStopped = true; };
  MapObserver.prototype.fail = function (e) {
    if (!this.isStopped) {
      this.isStopped = true;
      this.observer.onError(e);
      return true;
    }

    return false;
  };

  /**
  * Projects each element of an observable sequence into a new form by incorporating the element's index.
  * @param {Function} selector A transform function to apply to each source element; the second parameter of the function represents the index of the source element.
  * @param {Any} [thisArg] Object to use as this when executing callback.
  * @returns {Observable} An observable sequence whose elements are the result of invoking the transform function on each element of source.
  */
  observableProto.map = observableProto.select = function (selector, thisArg) {
    var selectorFn = typeof selector === 'function' ? selector : function () { return selector; };
    return this instanceof MapObservable ?
      this.internalMap(selectorFn, thisArg) :
      new MapObservable(this, selectorFn, thisArg);
  };

  /**
   * Retrieves the value of a specified nested property from all elements in
   * the Observable sequence.
   * @param {Arguments} arguments The nested properties to pluck.
   * @returns {Observable} Returns a new Observable sequence of property values.
   */
  observableProto.pluck = function () {
    var args = arguments, len = arguments.length;
    if (len === 0) { throw new Error('List of properties cannot be empty.'); }
    return this.map(function (x) {
      var currentProp = x;
      for (var i = 0; i < len; i++) {
        var p = currentProp[args[i]];
        if (typeof p !== 'undefined') {
          currentProp = p;
        } else {
          return undefined;
        }
      }
      return currentProp;
    });
  };

  function flatMap(source, selector, thisArg) {
    var selectorFunc = bindCallback(selector, thisArg, 3);
    return source.map(function (x, i) {
      var result = selectorFunc(x, i, source);
      isPromise(result) && (result = observableFromPromise(result));
      (isArrayLike(result) || isIterable(result)) && (result = observableFrom(result));
      return result;
    }).mergeAll();
  }

  /**
   *  One of the Following:
   *  Projects each element of an observable sequence to an observable sequence and merges the resulting observable sequences into one observable sequence.
   *
   * @example
   *  var res = source.selectMany(function (x) { return Rx.Observable.range(0, x); });
   *  Or:
   *  Projects each element of an observable sequence to an observable sequence, invokes the result selector for the source element and each of the corresponding inner sequence's elements, and merges the results into one observable sequence.
   *
   *  var res = source.selectMany(function (x) { return Rx.Observable.range(0, x); }, function (x, y) { return x + y; });
   *  Or:
   *  Projects each element of the source observable sequence to the other observable sequence and merges the resulting observable sequences into one observable sequence.
   *
   *  var res = source.selectMany(Rx.Observable.fromArray([1,2,3]));
   * @param {Function} selector A transform function to apply to each element or an observable sequence to project each element from the source sequence onto which could be either an observable or Promise.
   * @param {Function} [resultSelector]  A transform function to apply to each element of the intermediate sequence.
   * @param {Any} [thisArg] Object to use as this when executing callback.
   * @returns {Observable} An observable sequence whose elements are the result of invoking the one-to-many transform function collectionSelector on each element of the input sequence and then mapping each of those sequence elements and their corresponding source element to a result element.
   */
  observableProto.selectMany = observableProto.flatMap = function (selector, resultSelector, thisArg) {
    if (isFunction(selector) && isFunction(resultSelector)) {
      return this.flatMap(function (x, i) {
        var selectorResult = selector(x, i);
        isPromise(selectorResult) && (selectorResult = observableFromPromise(selectorResult));
        (isArrayLike(selectorResult) || isIterable(selectorResult)) && (selectorResult = observableFrom(selectorResult));

        return selectorResult.map(function (y, i2) {
          return resultSelector(x, y, i, i2);
        });
      }, thisArg);
    }
    return isFunction(selector) ?
      flatMap(this, selector, thisArg) :
      flatMap(this, function () { return selector; });
  };

  /**
   * Projects each notification of an observable sequence to an observable sequence and merges the resulting observable sequences into one observable sequence.
   * @param {Function} onNext A transform function to apply to each element; the second parameter of the function represents the index of the source element.
   * @param {Function} onError A transform function to apply when an error occurs in the source sequence.
   * @param {Function} onCompleted A transform function to apply when the end of the source sequence is reached.
   * @param {Any} [thisArg] An optional "this" to use to invoke each transform.
   * @returns {Observable} An observable sequence whose elements are the result of invoking the one-to-many transform function corresponding to each notification in the input sequence.
   */
  observableProto.flatMapObserver = observableProto.selectManyObserver = function (onNext, onError, onCompleted, thisArg) {
    var source = this;
    return new AnonymousObservable(function (observer) {
      var index = 0;

      return source.subscribe(
        function (x) {
          var result;
          try {
            result = onNext.call(thisArg, x, index++);
          } catch (e) {
            observer.onError(e);
            return;
          }
          isPromise(result) && (result = observableFromPromise(result));
          observer.onNext(result);
        },
        function (err) {
          var result;
          try {
            result = onError.call(thisArg, err);
          } catch (e) {
            observer.onError(e);
            return;
          }
          isPromise(result) && (result = observableFromPromise(result));
          observer.onNext(result);
          observer.onCompleted();
        },
        function () {
          var result;
          try {
            result = onCompleted.call(thisArg);
          } catch (e) {
            observer.onError(e);
            return;
          }
          isPromise(result) && (result = observableFromPromise(result));
          observer.onNext(result);
          observer.onCompleted();
        });
    }, source).mergeAll();
  };

  /**
   *  Projects each element of an observable sequence into a new sequence of observable sequences by incorporating the element's index and then
   *  transforms an observable sequence of observable sequences into an observable sequence producing values only from the most recent observable sequence.
   * @param {Function} selector A transform function to apply to each source element; the second parameter of the function represents the index of the source element.
   * @param {Any} [thisArg] Object to use as this when executing callback.
   * @returns {Observable} An observable sequence whose elements are the result of invoking the transform function on each element of source producing an Observable of Observable sequences
   *  and that at any point in time produces the elements of the most recent inner observable sequence that has been received.
   */
  observableProto.selectSwitch = observableProto.flatMapLatest = observableProto.switchMap = function (selector, thisArg) {
    return this.select(selector, thisArg).switchLatest();
  };

  /**
   * Bypasses a specified number of elements in an observable sequence and then returns the remaining elements.
   * @param {Number} count The number of elements to skip before returning the remaining elements.
   * @returns {Observable} An observable sequence that contains the elements that occur after the specified index in the input sequence.
   */
  observableProto.skip = function (count) {
    if (count < 0) { throw new ArgumentOutOfRangeError(); }
    var source = this;
    return new AnonymousObservable(function (o) {
      var remaining = count;
      return source.subscribe(function (x) {
        if (remaining <= 0) {
          o.onNext(x);
        } else {
          remaining--;
        }
      }, function (e) { o.onError(e); }, function () { o.onCompleted(); });
    }, source);
  };

  /**
   *  Bypasses elements in an observable sequence as long as a specified condition is true and then returns the remaining elements.
   *  The element's index is used in the logic of the predicate function.
   *
   *  var res = source.skipWhile(function (value) { return value < 10; });
   *  var res = source.skipWhile(function (value, index) { return value < 10 || index < 10; });
   * @param {Function} predicate A function to test each element for a condition; the second parameter of the function represents the index of the source element.
   * @param {Any} [thisArg] Object to use as this when executing callback.
   * @returns {Observable} An observable sequence that contains the elements from the input sequence starting at the first element in the linear series that does not pass the test specified by predicate.
   */
  observableProto.skipWhile = function (predicate, thisArg) {
    var source = this,
        callback = bindCallback(predicate, thisArg, 3);
    return new AnonymousObservable(function (o) {
      var i = 0, running = false;
      return source.subscribe(function (x) {
        if (!running) {
          try {
            running = !callback(x, i++, source);
          } catch (e) {
            o.onError(e);
            return;
          }
        }
        running && o.onNext(x);
      }, function (e) { o.onError(e); }, function () { o.onCompleted(); });
    }, source);
  };

  /**
   *  Returns a specified number of contiguous elements from the start of an observable sequence, using the specified scheduler for the edge case of take(0).
   *
   *  var res = source.take(5);
   *  var res = source.take(0, Rx.Scheduler.timeout);
   * @param {Number} count The number of elements to return.
   * @param {Scheduler} [scheduler] Scheduler used to produce an OnCompleted message in case <paramref name="count count</paramref> is set to 0.
   * @returns {Observable} An observable sequence that contains the specified number of elements from the start of the input sequence.
   */
  observableProto.take = function (count, scheduler) {
    if (count < 0) { throw new ArgumentOutOfRangeError(); }
    if (count === 0) { return observableEmpty(scheduler); }
    var source = this;
    return new AnonymousObservable(function (o) {
      var remaining = count;
      return source.subscribe(function (x) {
        if (remaining-- > 0) {
          o.onNext(x);
          remaining === 0 && o.onCompleted();
        }
      }, function (e) { o.onError(e); }, function () { o.onCompleted(); });
    }, source);
  };

  /**
   *  Returns elements from an observable sequence as long as a specified condition is true.
   *  The element's index is used in the logic of the predicate function.
   * @param {Function} predicate A function to test each element for a condition; the second parameter of the function represents the index of the source element.
   * @param {Any} [thisArg] Object to use as this when executing callback.
   * @returns {Observable} An observable sequence that contains the elements from the input sequence that occur before the element at which the test no longer passes.
   */
  observableProto.takeWhile = function (predicate, thisArg) {
    var source = this,
        callback = bindCallback(predicate, thisArg, 3);
    return new AnonymousObservable(function (o) {
      var i = 0, running = true;
      return source.subscribe(function (x) {
        if (running) {
          try {
            running = callback(x, i++, source);
          } catch (e) {
            o.onError(e);
            return;
          }
          if (running) {
            o.onNext(x);
          } else {
            o.onCompleted();
          }
        }
      }, function (e) { o.onError(e); }, function () { o.onCompleted(); });
    }, source);
  };

  var FilterObservable = (function (__super__) {
    inherits(FilterObservable, __super__);

    function FilterObservable(source, predicate, thisArg) {
      this.source = source;
      this.predicate = bindCallback(predicate, thisArg, 3);
      __super__.call(this);
    }

    FilterObservable.prototype.subscribeCore = function (observer) {
      return this.source.subscribe(new FilterObserver(observer, this.predicate, this));
    };

    FilterObservable.prototype.internalFilter = function(predicate, thisArg) {
      var self = this;
      return new FilterObservable(this.source, function(x, i, o) { return self.predicate(x, i, o) && predicate.call(this, x, i, o); }, thisArg);
    };

    return FilterObservable;

  }(ObservableBase));

  function FilterObserver(observer, predicate, source) {
    this.observer = observer;
    this.predicate = predicate;
    this.source = source;
    this.i = 0;
    this.isStopped = false;
  }

  FilterObserver.prototype.onNext = function(x) {
    if (this.isStopped) { return; }
    var shouldYield = tryCatch(this.predicate).call(this, x, this.i++, this.source);
    if (shouldYield === errorObj) {
      return this.observer.onError(shouldYield.e);
    }
    shouldYield && this.observer.onNext(x);
  };
  FilterObserver.prototype.onError = function (e) {
    if(!this.isStopped) { this.isStopped = true; this.observer.onError(e); }
  };
  FilterObserver.prototype.onCompleted = function () {
    if(!this.isStopped) { this.isStopped = true; this.observer.onCompleted(); }
  };
  FilterObserver.prototype.dispose = function() { this.isStopped = true; };
  FilterObserver.prototype.fail = function (e) {
    if (!this.isStopped) {
      this.isStopped = true;
      this.observer.onError(e);
      return true;
    }
    return false;
  };

  /**
  *  Filters the elements of an observable sequence based on a predicate by incorporating the element's index.
  * @param {Function} predicate A function to test each source element for a condition; the second parameter of the function represents the index of the source element.
  * @param {Any} [thisArg] Object to use as this when executing callback.
  * @returns {Observable} An observable sequence that contains elements from the input sequence that satisfy the condition.
  */
  observableProto.filter = observableProto.where = function (predicate, thisArg) {
    return this instanceof FilterObservable ? this.internalFilter(predicate, thisArg) :
      new FilterObservable(this, predicate, thisArg);
  };

  function extremaBy(source, keySelector, comparer) {
    return new AnonymousObservable(function (o) {
      var hasValue = false, lastKey = null, list = [];
      return source.subscribe(function (x) {
        var comparison, key;
        try {
          key = keySelector(x);
        } catch (ex) {
          o.onError(ex);
          return;
        }
        comparison = 0;
        if (!hasValue) {
          hasValue = true;
          lastKey = key;
        } else {
          try {
            comparison = comparer(key, lastKey);
          } catch (ex1) {
            o.onError(ex1);
            return;
          }
        }
        if (comparison > 0) {
          lastKey = key;
          list = [];
        }
        if (comparison >= 0) { list.push(x); }
      }, function (e) { o.onError(e); }, function () {
        o.onNext(list);
        o.onCompleted();
      });
    }, source);
  }

  function firstOnly(x) {
    if (x.length === 0) { throw new EmptyError(); }
    return x[0];
  }

  /**
   * Applies an accumulator function over an observable sequence, returning the result of the aggregation as a single element in the result sequence. The specified seed value is used as the initial accumulator value.
   * For aggregation behavior with incremental intermediate results, see Observable.scan.
   * @deprecated Use #reduce instead
   * @param {Mixed} [seed] The initial accumulator value.
   * @param {Function} accumulator An accumulator function to be invoked on each element.
   * @returns {Observable} An observable sequence containing a single element with the final accumulator value.
   */
  observableProto.aggregate = function () {
    var hasSeed = false, accumulator, seed, source = this;
    if (arguments.length === 2) {
      hasSeed = true;
      seed = arguments[0];
      accumulator = arguments[1];
    } else {
      accumulator = arguments[0];
    }
    return new AnonymousObservable(function (o) {
      var hasAccumulation, accumulation, hasValue;
      return source.subscribe (
        function (x) {
          !hasValue && (hasValue = true);
          try {
            if (hasAccumulation) {
              accumulation = accumulator(accumulation, x);
            } else {
              accumulation = hasSeed ? accumulator(seed, x) : x;
              hasAccumulation = true;
            }
          } catch (e) {
            return o.onError(e);
          }
        },
        function (e) { o.onError(e); },
        function () {
          hasValue && o.onNext(accumulation);
          !hasValue && hasSeed && o.onNext(seed);
          !hasValue && !hasSeed && o.onError(new EmptyError());
          o.onCompleted();
        }
      );
    }, source);
  };

  /**
   * Applies an accumulator function over an observable sequence, returning the result of the aggregation as a single element in the result sequence. The specified seed value is used as the initial accumulator value.
   * For aggregation behavior with incremental intermediate results, see Observable.scan.
   * @param {Function} accumulator An accumulator function to be invoked on each element.
   * @param {Any} [seed] The initial accumulator value.
   * @returns {Observable} An observable sequence containing a single element with the final accumulator value.
   */
  observableProto.reduce = function (accumulator) {
    var hasSeed = false, seed, source = this;
    if (arguments.length === 2) {
      hasSeed = true;
      seed = arguments[1];
    }
    return new AnonymousObservable(function (o) {
      var hasAccumulation, accumulation, hasValue;
      return source.subscribe (
        function (x) {
          !hasValue && (hasValue = true);
          try {
            if (hasAccumulation) {
              accumulation = accumulator(accumulation, x);
            } else {
              accumulation = hasSeed ? accumulator(seed, x) : x;
              hasAccumulation = true;
            }
          } catch (e) {
            return o.onError(e);
          }
        },
        function (e) { o.onError(e); },
        function () {
          hasValue && o.onNext(accumulation);
          !hasValue && hasSeed && o.onNext(seed);
          !hasValue && !hasSeed && o.onError(new EmptyError());
          o.onCompleted();
        }
      );
    }, source);
  };

  /**
   * Determines whether any element of an observable sequence satisfies a condition if present, else if any items are in the sequence.
   * @param {Function} [predicate] A function to test each element for a condition.
   * @returns {Observable} An observable sequence containing a single element determining whether any elements in the source sequence pass the test in the specified predicate if given, else if any items are in the sequence.
   */
  observableProto.some = function (predicate, thisArg) {
    var source = this;
    return predicate ?
      source.filter(predicate, thisArg).some() :
      new AnonymousObservable(function (observer) {
        return source.subscribe(function () {
          observer.onNext(true);
          observer.onCompleted();
        }, function (e) { observer.onError(e); }, function () {
          observer.onNext(false);
          observer.onCompleted();
        });
      }, source);
  };

  /** @deprecated use #some instead */
  observableProto.any = function () {
    //deprecate('any', 'some');
    return this.some.apply(this, arguments);
  };

  /**
   * Determines whether an observable sequence is empty.
   * @returns {Observable} An observable sequence containing a single element determining whether the source sequence is empty.
   */
  observableProto.isEmpty = function () {
    return this.any().map(not);
  };

  /**
   * Determines whether all elements of an observable sequence satisfy a condition.
   * @param {Function} [predicate] A function to test each element for a condition.
   * @param {Any} [thisArg] Object to use as this when executing callback.
   * @returns {Observable} An observable sequence containing a single element determining whether all elements in the source sequence pass the test in the specified predicate.
   */
  observableProto.every = function (predicate, thisArg) {
    return this.filter(function (v) { return !predicate(v); }, thisArg).some().map(not);
  };

  /** @deprecated use #every instead */
  observableProto.all = function () {
    //deprecate('all', 'every');
    return this.every.apply(this, arguments);
  };

  /**
   * Determines whether an observable sequence includes a specified element with an optional equality comparer.
   * @param searchElement The value to locate in the source sequence.
   * @param {Number} [fromIndex] An equality comparer to compare elements.
   * @returns {Observable} An observable sequence containing a single element determining whether the source sequence includes an element that has the specified value from the given index.
   */
  observableProto.includes = function (searchElement, fromIndex) {
    var source = this;
    function comparer(a, b) {
      return (a === 0 && b === 0) || (a === b || (isNaN(a) && isNaN(b)));
    }
    return new AnonymousObservable(function (o) {
      var i = 0, n = +fromIndex || 0;
      Math.abs(n) === Infinity && (n = 0);
      if (n < 0) {
        o.onNext(false);
        o.onCompleted();
        return disposableEmpty;
      }
      return source.subscribe(
        function (x) {
          if (i++ >= n && comparer(x, searchElement)) {
            o.onNext(true);
            o.onCompleted();
          }
        },
        function (e) { o.onError(e); },
        function () {
          o.onNext(false);
          o.onCompleted();
        });
    }, this);
  };

  /**
   * @deprecated use #includes instead.
   */
  observableProto.contains = function (searchElement, fromIndex) {
    //deprecate('contains', 'includes');
    observableProto.includes(searchElement, fromIndex);
  };
  /**
   * Returns an observable sequence containing a value that represents how many elements in the specified observable sequence satisfy a condition if provided, else the count of items.
   * @example
   * res = source.count();
   * res = source.count(function (x) { return x > 3; });
   * @param {Function} [predicate]A function to test each element for a condition.
   * @param {Any} [thisArg] Object to use as this when executing callback.
   * @returns {Observable} An observable sequence containing a single element with a number that represents how many elements in the input sequence satisfy the condition in the predicate function if provided, else the count of items in the sequence.
   */
  observableProto.count = function (predicate, thisArg) {
    return predicate ?
      this.filter(predicate, thisArg).count() :
      this.reduce(function (count) { return count + 1; }, 0);
  };

  /**
   * Returns the first index at which a given element can be found in the observable sequence, or -1 if it is not present.
   * @param {Any} searchElement Element to locate in the array.
   * @param {Number} [fromIndex] The index to start the search.  If not specified, defaults to 0.
   * @returns {Observable} And observable sequence containing the first index at which a given element can be found in the observable sequence, or -1 if it is not present.
   */
  observableProto.indexOf = function(searchElement, fromIndex) {
    var source = this;
    return new AnonymousObservable(function (o) {
      var i = 0, n = +fromIndex || 0;
      Math.abs(n) === Infinity && (n = 0);
      if (n < 0) {
        o.onNext(-1);
        o.onCompleted();
        return disposableEmpty;
      }
      return source.subscribe(
        function (x) {
          if (i >= n && x === searchElement) {
            o.onNext(i);
            o.onCompleted();
          }
          i++;
        },
        function (e) { o.onError(e); },
        function () {
          o.onNext(-1);
          o.onCompleted();
        });
    }, source);
  };

  /**
   * Computes the sum of a sequence of values that are obtained by invoking an optional transform function on each element of the input sequence, else if not specified computes the sum on each item in the sequence.
   * @param {Function} [selector] A transform function to apply to each element.
   * @param {Any} [thisArg] Object to use as this when executing callback.
   * @returns {Observable} An observable sequence containing a single element with the sum of the values in the source sequence.
   */
  observableProto.sum = function (keySelector, thisArg) {
    return keySelector && isFunction(keySelector) ?
      this.map(keySelector, thisArg).sum() :
      this.reduce(function (prev, curr) { return prev + curr; }, 0);
  };

  /**
   * Returns the elements in an observable sequence with the minimum key value according to the specified comparer.
   * @example
   * var res = source.minBy(function (x) { return x.value; });
   * var res = source.minBy(function (x) { return x.value; }, function (x, y) { return x - y; });
   * @param {Function} keySelector Key selector function.
   * @param {Function} [comparer] Comparer used to compare key values.
   * @returns {Observable} An observable sequence containing a list of zero or more elements that have a minimum key value.
   */
  observableProto.minBy = function (keySelector, comparer) {
    comparer || (comparer = defaultSubComparer);
    return extremaBy(this, keySelector, function (x, y) { return comparer(x, y) * -1; });
  };

  /**
   * Returns the minimum element in an observable sequence according to the optional comparer else a default greater than less than check.
   * @example
   * var res = source.min();
   * var res = source.min(function (x, y) { return x.value - y.value; });
   * @param {Function} [comparer] Comparer used to compare elements.
   * @returns {Observable} An observable sequence containing a single element with the minimum element in the source sequence.
   */
  observableProto.min = function (comparer) {
    return this.minBy(identity, comparer).map(function (x) { return firstOnly(x); });
  };

  /**
   * Returns the elements in an observable sequence with the maximum  key value according to the specified comparer.
   * @example
   * var res = source.maxBy(function (x) { return x.value; });
   * var res = source.maxBy(function (x) { return x.value; }, function (x, y) { return x - y;; });
   * @param {Function} keySelector Key selector function.
   * @param {Function} [comparer]  Comparer used to compare key values.
   * @returns {Observable} An observable sequence containing a list of zero or more elements that have a maximum key value.
   */
  observableProto.maxBy = function (keySelector, comparer) {
    comparer || (comparer = defaultSubComparer);
    return extremaBy(this, keySelector, comparer);
  };

  /**
   * Returns the maximum value in an observable sequence according to the specified comparer.
   * @example
   * var res = source.max();
   * var res = source.max(function (x, y) { return x.value - y.value; });
   * @param {Function} [comparer] Comparer used to compare elements.
   * @returns {Observable} An observable sequence containing a single element with the maximum element in the source sequence.
   */
  observableProto.max = function (comparer) {
    return this.maxBy(identity, comparer).map(function (x) { return firstOnly(x); });
  };

  /**
   * Computes the average of an observable sequence of values that are in the sequence or obtained by invoking a transform function on each element of the input sequence if present.
   * @param {Function} [selector] A transform function to apply to each element.
   * @param {Any} [thisArg] Object to use as this when executing callback.
   * @returns {Observable} An observable sequence containing a single element with the average of the sequence of values.
   */
  observableProto.average = function (keySelector, thisArg) {
    return keySelector && isFunction(keySelector) ?
      this.map(keySelector, thisArg).average() :
      this.reduce(function (prev, cur) {
        return {
          sum: prev.sum + cur,
          count: prev.count + 1
        };
      }, {sum: 0, count: 0 }).map(function (s) {
        if (s.count === 0) { throw new EmptyError(); }
        return s.sum / s.count;
      });
  };

  /**
   *  Determines whether two sequences are equal by comparing the elements pairwise using a specified equality comparer.
   *
   * @example
   * var res = res = source.sequenceEqual([1,2,3]);
   * var res = res = source.sequenceEqual([{ value: 42 }], function (x, y) { return x.value === y.value; });
   * 3 - res = source.sequenceEqual(Rx.Observable.returnValue(42));
   * 4 - res = source.sequenceEqual(Rx.Observable.returnValue({ value: 42 }), function (x, y) { return x.value === y.value; });
   * @param {Observable} second Second observable sequence or array to compare.
   * @param {Function} [comparer] Comparer used to compare elements of both sequences.
   * @returns {Observable} An observable sequence that contains a single element which indicates whether both sequences are of equal length and their corresponding elements are equal according to the specified equality comparer.
   */
  observableProto.sequenceEqual = function (second, comparer) {
    var first = this;
    comparer || (comparer = defaultComparer);
    return new AnonymousObservable(function (o) {
      var donel = false, doner = false, ql = [], qr = [];
      var subscription1 = first.subscribe(function (x) {
        var equal, v;
        if (qr.length > 0) {
          v = qr.shift();
          try {
            equal = comparer(v, x);
          } catch (e) {
            o.onError(e);
            return;
          }
          if (!equal) {
            o.onNext(false);
            o.onCompleted();
          }
        } else if (doner) {
          o.onNext(false);
          o.onCompleted();
        } else {
          ql.push(x);
        }
      }, function(e) { o.onError(e); }, function () {
        donel = true;
        if (ql.length === 0) {
          if (qr.length > 0) {
            o.onNext(false);
            o.onCompleted();
          } else if (doner) {
            o.onNext(true);
            o.onCompleted();
          }
        }
      });

      (isArrayLike(second) || isIterable(second)) && (second = observableFrom(second));
      isPromise(second) && (second = observableFromPromise(second));
      var subscription2 = second.subscribe(function (x) {
        var equal;
        if (ql.length > 0) {
          var v = ql.shift();
          try {
            equal = comparer(v, x);
          } catch (exception) {
            o.onError(exception);
            return;
          }
          if (!equal) {
            o.onNext(false);
            o.onCompleted();
          }
        } else if (donel) {
          o.onNext(false);
          o.onCompleted();
        } else {
          qr.push(x);
        }
      }, function(e) { o.onError(e); }, function () {
        doner = true;
        if (qr.length === 0) {
          if (ql.length > 0) {
            o.onNext(false);
            o.onCompleted();
          } else if (donel) {
            o.onNext(true);
            o.onCompleted();
          }
        }
      });
      return new CompositeDisposable(subscription1, subscription2);
    }, first);
  };

  function elementAtOrDefault(source, index, hasDefault, defaultValue) {
    if (index < 0) { throw new ArgumentOutOfRangeError(); }
    return new AnonymousObservable(function (o) {
      var i = index;
      return source.subscribe(function (x) {
        if (i-- === 0) {
          o.onNext(x);
          o.onCompleted();
        }
      }, function (e) { o.onError(e); }, function () {
        if (!hasDefault) {
          o.onError(new ArgumentOutOfRangeError());
        } else {
          o.onNext(defaultValue);
          o.onCompleted();
        }
      });
    }, source);
  }

  /**
   * Returns the element at a specified index in a sequence.
   * @example
   * var res = source.elementAt(5);
   * @param {Number} index The zero-based index of the element to retrieve.
   * @returns {Observable} An observable sequence that produces the element at the specified position in the source sequence.
   */
  observableProto.elementAt =  function (index) {
    return elementAtOrDefault(this, index, false);
  };

  /**
   * Returns the element at a specified index in a sequence or a default value if the index is out of range.
   * @example
   * var res = source.elementAtOrDefault(5);
   * var res = source.elementAtOrDefault(5, 0);
   * @param {Number} index The zero-based index of the element to retrieve.
   * @param [defaultValue] The default value if the index is outside the bounds of the source sequence.
   * @returns {Observable} An observable sequence that produces the element at the specified position in the source sequence, or a default value if the index is outside the bounds of the source sequence.
   */
  observableProto.elementAtOrDefault = function (index, defaultValue) {
    return elementAtOrDefault(this, index, true, defaultValue);
  };

  function singleOrDefaultAsync(source, hasDefault, defaultValue) {
    return new AnonymousObservable(function (o) {
      var value = defaultValue, seenValue = false;
      return source.subscribe(function (x) {
        if (seenValue) {
          o.onError(new Error('Sequence contains more than one element'));
        } else {
          value = x;
          seenValue = true;
        }
      }, function (e) { o.onError(e); }, function () {
        if (!seenValue && !hasDefault) {
          o.onError(new EmptyError());
        } else {
          o.onNext(value);
          o.onCompleted();
        }
      });
    }, source);
  }

  /**
   * Returns the only element of an observable sequence that satisfies the condition in the optional predicate, and reports an exception if there is not exactly one element in the observable sequence.
   * @param {Function} [predicate] A predicate function to evaluate for elements in the source sequence.
   * @param {Any} [thisArg] Object to use as `this` when executing the predicate.
   * @returns {Observable} Sequence containing the single element in the observable sequence that satisfies the condition in the predicate.
   */
  observableProto.single = function (predicate, thisArg) {
    return predicate && isFunction(predicate) ?
      this.where(predicate, thisArg).single() :
      singleOrDefaultAsync(this, false);
  };

  /**
   * Returns the only element of an observable sequence that matches the predicate, or a default value if no such element exists; this method reports an exception if there is more than one element in the observable sequence.
   * @example
   * var res = res = source.singleOrDefault();
   * var res = res = source.singleOrDefault(function (x) { return x === 42; });
   * res = source.singleOrDefault(function (x) { return x === 42; }, 0);
   * res = source.singleOrDefault(null, 0);
   * @memberOf Observable#
   * @param {Function} predicate A predicate function to evaluate for elements in the source sequence.
   * @param [defaultValue] The default value if the index is outside the bounds of the source sequence.
   * @param {Any} [thisArg] Object to use as `this` when executing the predicate.
   * @returns {Observable} Sequence containing the single element in the observable sequence that satisfies the condition in the predicate, or a default value if no such element exists.
   */
  observableProto.singleOrDefault = function (predicate, defaultValue, thisArg) {
    return predicate && isFunction(predicate) ?
      this.filter(predicate, thisArg).singleOrDefault(null, defaultValue) :
      singleOrDefaultAsync(this, true, defaultValue);
  };

  function firstOrDefaultAsync(source, hasDefault, defaultValue) {
    return new AnonymousObservable(function (o) {
      return source.subscribe(function (x) {
        o.onNext(x);
        o.onCompleted();
      }, function (e) { o.onError(e); }, function () {
        if (!hasDefault) {
          o.onError(new EmptyError());
        } else {
          o.onNext(defaultValue);
          o.onCompleted();
        }
      });
    }, source);
  }

  /**
   * Returns the first element of an observable sequence that satisfies the condition in the predicate if present else the first item in the sequence.
   * @example
   * var res = res = source.first();
   * var res = res = source.first(function (x) { return x > 3; });
   * @param {Function} [predicate] A predicate function to evaluate for elements in the source sequence.
   * @param {Any} [thisArg] Object to use as `this` when executing the predicate.
   * @returns {Observable} Sequence containing the first element in the observable sequence that satisfies the condition in the predicate if provided, else the first item in the sequence.
   */
  observableProto.first = function (predicate, thisArg) {
    return predicate ?
      this.where(predicate, thisArg).first() :
      firstOrDefaultAsync(this, false);
  };

  /**
   * Returns the first element of an observable sequence that satisfies the condition in the predicate, or a default value if no such element exists.
   * @param {Function} [predicate] A predicate function to evaluate for elements in the source sequence.
   * @param {Any} [defaultValue] The default value if no such element exists.  If not specified, defaults to null.
   * @param {Any} [thisArg] Object to use as `this` when executing the predicate.
   * @returns {Observable} Sequence containing the first element in the observable sequence that satisfies the condition in the predicate, or a default value if no such element exists.
   */
  observableProto.firstOrDefault = function (predicate, defaultValue, thisArg) {
    return predicate ?
      this.where(predicate).firstOrDefault(null, defaultValue) :
      firstOrDefaultAsync(this, true, defaultValue);
  };

  function lastOrDefaultAsync(source, hasDefault, defaultValue) {
    return new AnonymousObservable(function (o) {
      var value = defaultValue, seenValue = false;
      return source.subscribe(function (x) {
        value = x;
        seenValue = true;
      }, function (e) { o.onError(e); }, function () {
        if (!seenValue && !hasDefault) {
          o.onError(new EmptyError());
        } else {
          o.onNext(value);
          o.onCompleted();
        }
      });
    }, source);
  }

  /**
   * Returns the last element of an observable sequence that satisfies the condition in the predicate if specified, else the last element.
   * @param {Function} [predicate] A predicate function to evaluate for elements in the source sequence.
   * @param {Any} [thisArg] Object to use as `this` when executing the predicate.
   * @returns {Observable} Sequence containing the last element in the observable sequence that satisfies the condition in the predicate.
   */
  observableProto.last = function (predicate, thisArg) {
    return predicate ?
      this.where(predicate, thisArg).last() :
      lastOrDefaultAsync(this, false);
  };

  /**
   * Returns the last element of an observable sequence that satisfies the condition in the predicate, or a default value if no such element exists.
   * @param {Function} [predicate] A predicate function to evaluate for elements in the source sequence.
   * @param [defaultValue] The default value if no such element exists.  If not specified, defaults to null.
   * @param {Any} [thisArg] Object to use as `this` when executing the predicate.
   * @returns {Observable} Sequence containing the last element in the observable sequence that satisfies the condition in the predicate, or a default value if no such element exists.
   */
  observableProto.lastOrDefault = function (predicate, defaultValue, thisArg) {
    return predicate ?
      this.where(predicate, thisArg).lastOrDefault(null, defaultValue) :
      lastOrDefaultAsync(this, true, defaultValue);
  };

  function findValue (source, predicate, thisArg, yieldIndex) {
    var callback = bindCallback(predicate, thisArg, 3);
    return new AnonymousObservable(function (o) {
      var i = 0;
      return source.subscribe(function (x) {
        var shouldRun;
        try {
          shouldRun = callback(x, i, source);
        } catch (e) {
          o.onError(e);
          return;
        }
        if (shouldRun) {
          o.onNext(yieldIndex ? i : x);
          o.onCompleted();
        } else {
          i++;
        }
      }, function (e) { o.onError(e); }, function () {
        o.onNext(yieldIndex ? -1 : undefined);
        o.onCompleted();
      });
    }, source);
  }

  /**
   * Searches for an element that matches the conditions defined by the specified predicate, and returns the first occurrence within the entire Observable sequence.
   * @param {Function} predicate The predicate that defines the conditions of the element to search for.
   * @param {Any} [thisArg] Object to use as `this` when executing the predicate.
   * @returns {Observable} An Observable sequence with the first element that matches the conditions defined by the specified predicate, if found; otherwise, undefined.
   */
  observableProto.find = function (predicate, thisArg) {
    return findValue(this, predicate, thisArg, false);
  };

  /**
   * Searches for an element that matches the conditions defined by the specified predicate, and returns
   * an Observable sequence with the zero-based index of the first occurrence within the entire Observable sequence.
   * @param {Function} predicate The predicate that defines the conditions of the element to search for.
   * @param {Any} [thisArg] Object to use as `this` when executing the predicate.
   * @returns {Observable} An Observable sequence with the zero-based index of the first occurrence of an element that matches the conditions defined by match, if found; otherwise, –1.
  */
  observableProto.findIndex = function (predicate, thisArg) {
    return findValue(this, predicate, thisArg, true);
  };

  /**
   * Converts the observable sequence to a Set if it exists.
   * @returns {Observable} An observable sequence with a single value of a Set containing the values from the observable sequence.
   */
  observableProto.toSet = function () {
    if (typeof root.Set === 'undefined') { throw new TypeError(); }
    var source = this;
    return new AnonymousObservable(function (o) {
      var s = new root.Set();
      return source.subscribe(
        function (x) { s.add(x); },
        function (e) { o.onError(e); },
        function () {
          o.onNext(s);
          o.onCompleted();
        });
    }, source);
  };

  /**
  * Converts the observable sequence to a Map if it exists.
  * @param {Function} keySelector A function which produces the key for the Map.
  * @param {Function} [elementSelector] An optional function which produces the element for the Map. If not present, defaults to the value from the observable sequence.
  * @returns {Observable} An observable sequence with a single value of a Map containing the values from the observable sequence.
  */
  observableProto.toMap = function (keySelector, elementSelector) {
    if (typeof root.Map === 'undefined') { throw new TypeError(); }
    var source = this;
    return new AnonymousObservable(function (o) {
      var m = new root.Map();
      return source.subscribe(
        function (x) {
          var key;
          try {
            key = keySelector(x);
          } catch (e) {
            o.onError(e);
            return;
          }

          var element = x;
          if (elementSelector) {
            try {
              element = elementSelector(x);
            } catch (e) {
              o.onError(e);
              return;
            }
          }

          m.set(key, element);
        },
        function (e) { o.onError(e); },
        function () {
          o.onNext(m);
          o.onCompleted();
        });
    }, source);
  };

  var fnString = 'function',
      throwString = 'throw',
      isObject = Rx.internals.isObject;

  function toThunk(obj, ctx) {
    if (Array.isArray(obj)) {  return objectToThunk.call(ctx, obj); }
    if (isGeneratorFunction(obj)) { return observableSpawn(obj.call(ctx)); }
    if (isGenerator(obj)) {  return observableSpawn(obj); }
    if (isObservable(obj)) { return observableToThunk(obj); }
    if (isPromise(obj)) { return promiseToThunk(obj); }
    if (typeof obj === fnString) { return obj; }
    if (isObject(obj) || Array.isArray(obj)) { return objectToThunk.call(ctx, obj); }

    return obj;
  }

  function objectToThunk(obj) {
    var ctx = this;

    return function (done) {
      var keys = Object.keys(obj),
          pending = keys.length,
          results = new obj.constructor(),
          finished;

      if (!pending) {
        timeoutScheduler.schedule(function () { done(null, results); });
        return;
      }

      for (var i = 0, len = keys.length; i < len; i++) {
        run(obj[keys[i]], keys[i]);
      }

      function run(fn, key) {
        if (finished) { return; }
        try {
          fn = toThunk(fn, ctx);

          if (typeof fn !== fnString) {
            results[key] = fn;
            return --pending || done(null, results);
          }

          fn.call(ctx, function(err, res) {
            if (finished) { return; }

            if (err) {
              finished = true;
              return done(err);
            }

            results[key] = res;
            --pending || done(null, results);
          });
        } catch (e) {
          finished = true;
          done(e);
        }
      }
    }
  }

  function observableToThunk(observable) {
    return function (fn) {
      var value, hasValue = false;
      observable.subscribe(
        function (v) {
          value = v;
          hasValue = true;
        },
        fn,
        function () {
          hasValue && fn(null, value);
        });
    }
  }

  function promiseToThunk(promise) {
    return function(fn) {
      promise.then(function(res) {
        fn(null, res);
      }, fn);
    }
  }

  function isObservable(obj) {
    return obj && typeof obj.subscribe === fnString;
  }

  function isGeneratorFunction(obj) {
    return obj && obj.constructor && obj.constructor.name === 'GeneratorFunction';
  }

  function isGenerator(obj) {
    return obj && typeof obj.next === fnString && typeof obj[throwString] === fnString;
  }

  /*
   * Spawns a generator function which allows for Promises, Observable sequences, Arrays, Objects, Generators and functions.
   * @param {Function} The spawning function.
   * @returns {Function} a function which has a done continuation.
   */
  var observableSpawn = Rx.spawn = function (fn) {
    var isGenFun = isGeneratorFunction(fn);

    return function (done) {
      var ctx = this,
        gen = fn;

      if (isGenFun) {
        for(var args = [], i = 0, len = arguments.length; i < len; i++) { args.push(arguments[i]); }
        var len = args.length,
          hasCallback = len && typeof args[len - 1] === fnString;

        done = hasCallback ? args.pop() : handleError;
        gen = fn.apply(this, args);
      } else {
        done = done || handleError;
      }

      next();

      function exit(err, res) {
        timeoutScheduler.schedule(done.bind(ctx, err, res));
      }

      function next(err, res) {
        var ret;

        // multiple args
        if (arguments.length > 2) {
          for(var res = [], i = 1, len = arguments.length; i < len; i++) { res.push(arguments[i]); }
        }

        if (err) {
          try {
            ret = gen[throwString](err);
          } catch (e) {
            return exit(e);
          }
        }

        if (!err) {
          try {
            ret = gen.next(res);
          } catch (e) {
            return exit(e);
          }
        }

        if (ret.done)  {
          return exit(null, ret.value);
        }

        ret.value = toThunk(ret.value, ctx);

        if (typeof ret.value === fnString) {
          var called = false;
          try {
            ret.value.call(ctx, function() {
              if (called) {
                return;
              }

              called = true;
              next.apply(ctx, arguments);
            });
          } catch (e) {
            timeoutScheduler.schedule(function () {
              if (called) {
                return;
              }

              called = true;
              next.call(ctx, e);
            });
          }
          return;
        }

        // Not supported
        next(new TypeError('Rx.spawn only supports a function, Promise, Observable, Object or Array.'));
      }
    }
  };

  function handleError(err) {
    if (!err) { return; }
    timeoutScheduler.schedule(function() {
      throw err;
    });
  }

  /**
   * Invokes the specified function asynchronously on the specified scheduler, surfacing the result through an observable sequence.
   *
   * @example
   * var res = Rx.Observable.start(function () { console.log('hello'); });
   * var res = Rx.Observable.start(function () { console.log('hello'); }, Rx.Scheduler.timeout);
   * var res = Rx.Observable.start(function () { this.log('hello'); }, Rx.Scheduler.timeout, console);
   *
   * @param {Function} func Function to run asynchronously.
   * @param {Scheduler} [scheduler]  Scheduler to run the function on. If not specified, defaults to Scheduler.timeout.
   * @param [context]  The context for the func parameter to be executed.  If not specified, defaults to undefined.
   * @returns {Observable} An observable sequence exposing the function's result value, or an exception.
   *
   * Remarks
   * * The function is called immediately, not during the subscription of the resulting sequence.
   * * Multiple subscriptions to the resulting sequence can observe the function's result.
   */
  Observable.start = function (func, context, scheduler) {
    return observableToAsync(func, context, scheduler)();
  };

  /**
   * Converts the function into an asynchronous function. Each invocation of the resulting asynchronous function causes an invocation of the original synchronous function on the specified scheduler.
   * @param {Function} function Function to convert to an asynchronous function.
   * @param {Scheduler} [scheduler] Scheduler to run the function on. If not specified, defaults to Scheduler.timeout.
   * @param {Mixed} [context] The context for the func parameter to be executed.  If not specified, defaults to undefined.
   * @returns {Function} Asynchronous function.
   */
  var observableToAsync = Observable.toAsync = function (func, context, scheduler) {
    isScheduler(scheduler) || (scheduler = timeoutScheduler);
    return function () {
      var args = arguments,
        subject = new AsyncSubject();

      scheduler.schedule(function () {
        var result;
        try {
          result = func.apply(context, args);
        } catch (e) {
          subject.onError(e);
          return;
        }
        subject.onNext(result);
        subject.onCompleted();
      });
      return subject.asObservable();
    };
  };

  /**
   * Converts a callback function to an observable sequence.
   *
   * @param {Function} function Function with a callback as the last parameter to convert to an Observable sequence.
   * @param {Mixed} [context] The context for the func parameter to be executed.  If not specified, defaults to undefined.
   * @param {Function} [selector] A selector which takes the arguments from the callback to produce a single item to yield on next.
   * @returns {Function} A function, when executed with the required parameters minus the callback, produces an Observable sequence with a single value of the arguments to the callback as an array.
   */
  Observable.fromCallback = function (func, context, selector) {
    return function () {
      var len = arguments.length, args = new Array(len)
      for(var i = 0; i < len; i++) { args[i] = arguments[i]; }

      return new AnonymousObservable(function (observer) {
        function handler() {
          var len = arguments.length, results = new Array(len);
          for(var i = 0; i < len; i++) { results[i] = arguments[i]; }

          if (selector) {
            try {
              results = selector.apply(context, results);
            } catch (e) {
              return observer.onError(e);
            }

            observer.onNext(results);
          } else {
            if (results.length <= 1) {
              observer.onNext.apply(observer, results);
            } else {
              observer.onNext(results);
            }
          }

          observer.onCompleted();
        }

        args.push(handler);
        func.apply(context, args);
      }).publishLast().refCount();
    };
  };

  /**
   * Converts a Node.js callback style function to an observable sequence.  This must be in function (err, ...) format.
   * @param {Function} func The function to call
   * @param {Mixed} [context] The context for the func parameter to be executed.  If not specified, defaults to undefined.
   * @param {Function} [selector] A selector which takes the arguments from the callback minus the error to produce a single item to yield on next.
   * @returns {Function} An async function which when applied, returns an observable sequence with the callback arguments as an array.
   */
  Observable.fromNodeCallback = function (func, context, selector) {
    return function () {
      var len = arguments.length, args = new Array(len);
      for(var i = 0; i < len; i++) { args[i] = arguments[i]; }

      return new AnonymousObservable(function (observer) {
        function handler(err) {
          if (err) {
            observer.onError(err);
            return;
          }

          var len = arguments.length, results = [];
          for(var i = 1; i < len; i++) { results[i - 1] = arguments[i]; }

          if (selector) {
            try {
              results = selector.apply(context, results);
            } catch (e) {
              return observer.onError(e);
            }
            observer.onNext(results);
          } else {
            if (results.length <= 1) {
              observer.onNext.apply(observer, results);
            } else {
              observer.onNext(results);
            }
          }

          observer.onCompleted();
        }

        args.push(handler);
        func.apply(context, args);
      }).publishLast().refCount();
    };
  };

  function createListener (element, name, handler) {
    if (element.addEventListener) {
      element.addEventListener(name, handler, false);
      return disposableCreate(function () {
        element.removeEventListener(name, handler, false);
      });
    }
    throw new Error('No listener found');
  }

  function createEventListener (el, eventName, handler) {
    var disposables = new CompositeDisposable();

    // Asume NodeList
    if (Object.prototype.toString.call(el) === '[object NodeList]') {
      for (var i = 0, len = el.length; i < len; i++) {
        disposables.add(createEventListener(el.item(i), eventName, handler));
      }
    } else if (el) {
      disposables.add(createListener(el, eventName, handler));
    }

    return disposables;
  }

  /**
   * Configuration option to determine whether to use native events only
   */
  Rx.config.useNativeEvents = false;

  /**
   * Creates an observable sequence by adding an event listener to the matching DOMElement or each item in the NodeList.
   *
   * @example
   *   var source = Rx.Observable.fromEvent(element, 'mouseup');
   *
   * @param {Object} element The DOMElement or NodeList to attach a listener.
   * @param {String} eventName The event name to attach the observable sequence.
   * @param {Function} [selector] A selector which takes the arguments from the event handler to produce a single item to yield on next.
   * @returns {Observable} An observable sequence of events from the specified element and the specified event.
   */
  Observable.fromEvent = function (element, eventName, selector) {
    // Node.js specific
    if (element.addListener) {
      return fromEventPattern(
        function (h) { element.addListener(eventName, h); },
        function (h) { element.removeListener(eventName, h); },
        selector);
    }

    // Use only if non-native events are allowed
    if (!Rx.config.useNativeEvents) {
      // Handles jq, Angular.js, Zepto, Marionette, Ember.js
      if (typeof element.on === 'function' && typeof element.off === 'function') {
        return fromEventPattern(
          function (h) { element.on(eventName, h); },
          function (h) { element.off(eventName, h); },
          selector);
      }
    }
    return new AnonymousObservable(function (observer) {
      return createEventListener(
        element,
        eventName,
        function handler (e) {
          var results = e;

          if (selector) {
            try {
              results = selector(arguments);
            } catch (err) {
              return observer.onError(err);
            }
          }

          observer.onNext(results);
        });
    }).publish().refCount();
  };

  /**
   * Creates an observable sequence from an event emitter via an addHandler/removeHandler pair.
   * @param {Function} addHandler The function to add a handler to the emitter.
   * @param {Function} [removeHandler] The optional function to remove a handler from an emitter.
   * @param {Function} [selector] A selector which takes the arguments from the event handler to produce a single item to yield on next.
   * @returns {Observable} An observable sequence which wraps an event from an event emitter
   */
  var fromEventPattern = Observable.fromEventPattern = function (addHandler, removeHandler, selector) {
    return new AnonymousObservable(function (observer) {
      function innerHandler (e) {
        var result = e;
        if (selector) {
          try {
            result = selector(arguments);
          } catch (err) {
            return observer.onError(err);
          }
        }
        observer.onNext(result);
      }

      var returnValue = addHandler(innerHandler);
      return disposableCreate(function () {
        if (removeHandler) {
          removeHandler(innerHandler, returnValue);
        }
      });
    }).publish().refCount();
  };

  /**
   * Invokes the asynchronous function, surfacing the result through an observable sequence.
   * @param {Function} functionAsync Asynchronous function which returns a Promise to run.
   * @returns {Observable} An observable sequence exposing the function's result value, or an exception.
   */
  Observable.startAsync = function (functionAsync) {
    var promise;
    try {
      promise = functionAsync();
    } catch (e) {
      return observableThrow(e);
    }
    return observableFromPromise(promise);
  }

  var PausableObservable = (function (__super__) {

    inherits(PausableObservable, __super__);

    function subscribe(observer) {
      var conn = this.source.publish(),
        subscription = conn.subscribe(observer),
        connection = disposableEmpty;

      var pausable = this.pauser.distinctUntilChanged().subscribe(function (b) {
        if (b) {
          connection = conn.connect();
        } else {
          connection.dispose();
          connection = disposableEmpty;
        }
      });

      return new CompositeDisposable(subscription, connection, pausable);
    }

    function PausableObservable(source, pauser) {
      this.source = source;
      this.controller = new Subject();

      if (pauser && pauser.subscribe) {
        this.pauser = this.controller.merge(pauser);
      } else {
        this.pauser = this.controller;
      }

      __super__.call(this, subscribe, source);
    }

    PausableObservable.prototype.pause = function () {
      this.controller.onNext(false);
    };

    PausableObservable.prototype.resume = function () {
      this.controller.onNext(true);
    };

    return PausableObservable;

  }(Observable));

  /**
   * Pauses the underlying observable sequence based upon the observable sequence which yields true/false.
   * @example
   * var pauser = new Rx.Subject();
   * var source = Rx.Observable.interval(100).pausable(pauser);
   * @param {Observable} pauser The observable sequence used to pause the underlying sequence.
   * @returns {Observable} The observable sequence which is paused based upon the pauser.
   */
  observableProto.pausable = function (pauser) {
    return new PausableObservable(this, pauser);
  };

  function combineLatestSource(source, subject, resultSelector) {
    return new AnonymousObservable(function (o) {
      var hasValue = [false, false],
        hasValueAll = false,
        isDone = false,
        values = new Array(2),
        err;

      function next(x, i) {
        values[i] = x
        var res;
        hasValue[i] = true;
        if (hasValueAll || (hasValueAll = hasValue.every(identity))) {
          if (err) {
            o.onError(err);
            return;
          }

          try {
            res = resultSelector.apply(null, values);
          } catch (ex) {
            o.onError(ex);
            return;
          }
          o.onNext(res);
        }
        if (isDone && values[1]) {
          o.onCompleted();
        }
      }

      return new CompositeDisposable(
        source.subscribe(
          function (x) {
            next(x, 0);
          },
          function (e) {
            if (values[1]) {
              o.onError(e);
            } else {
              err = e;
            }
          },
          function () {
            isDone = true;
            values[1] && o.onCompleted();
          }),
        subject.subscribe(
          function (x) {
            next(x, 1);
          },
          function (e) { o.onError(e); },
          function () {
            isDone = true;
            next(true, 1);
          })
        );
    }, source);
  }

  var PausableBufferedObservable = (function (__super__) {

    inherits(PausableBufferedObservable, __super__);

    function subscribe(o) {
      var q = [], previousShouldFire;

      var subscription =
        combineLatestSource(
          this.source,
          this.pauser.distinctUntilChanged().startWith(false),
          function (data, shouldFire) {
            return { data: data, shouldFire: shouldFire };
          })
          .subscribe(
            function (results) {
              if (previousShouldFire !== undefined && results.shouldFire != previousShouldFire) {
                previousShouldFire = results.shouldFire;
                // change in shouldFire
                if (results.shouldFire) {
                  while (q.length > 0) {
                    o.onNext(q.shift());
                  }
                }
              } else {
                previousShouldFire = results.shouldFire;
                // new data
                if (results.shouldFire) {
                  o.onNext(results.data);
                } else {
                  q.push(results.data);
                }
              }
            },
            function (err) {
              // Empty buffer before sending error
              while (q.length > 0) {
                o.onNext(q.shift());
              }
              o.onError(err);
            },
            function () {
              // Empty buffer before sending completion
              while (q.length > 0) {
                o.onNext(q.shift());
              }
              o.onCompleted();
            }
          );
      return subscription;
    }

    function PausableBufferedObservable(source, pauser) {
      this.source = source;
      this.controller = new Subject();

      if (pauser && pauser.subscribe) {
        this.pauser = this.controller.merge(pauser);
      } else {
        this.pauser = this.controller;
      }

      __super__.call(this, subscribe, source);
    }

    PausableBufferedObservable.prototype.pause = function () {
      this.controller.onNext(false);
    };

    PausableBufferedObservable.prototype.resume = function () {
      this.controller.onNext(true);
    };

    return PausableBufferedObservable;

  }(Observable));

  /**
   * Pauses the underlying observable sequence based upon the observable sequence which yields true/false,
   * and yields the values that were buffered while paused.
   * @example
   * var pauser = new Rx.Subject();
   * var source = Rx.Observable.interval(100).pausableBuffered(pauser);
   * @param {Observable} pauser The observable sequence used to pause the underlying sequence.
   * @returns {Observable} The observable sequence which is paused based upon the pauser.
   */
  observableProto.pausableBuffered = function (subject) {
    return new PausableBufferedObservable(this, subject);
  };

  var ControlledObservable = (function (__super__) {

    inherits(ControlledObservable, __super__);

    function subscribe (observer) {
      return this.source.subscribe(observer);
    }

    function ControlledObservable (source, enableQueue) {
      __super__.call(this, subscribe, source);
      this.subject = new ControlledSubject(enableQueue);
      this.source = source.multicast(this.subject).refCount();
    }

    ControlledObservable.prototype.request = function (numberOfItems) {
      if (numberOfItems == null) { numberOfItems = -1; }
      return this.subject.request(numberOfItems);
    };

    return ControlledObservable;

  }(Observable));

  var ControlledSubject = (function (__super__) {

    function subscribe (observer) {
      return this.subject.subscribe(observer);
    }

    inherits(ControlledSubject, __super__);

    function ControlledSubject(enableQueue) {
      enableQueue == null && (enableQueue = true);

      __super__.call(this, subscribe);
      this.subject = new Subject();
      this.enableQueue = enableQueue;
      this.queue = enableQueue ? [] : null;
      this.requestedCount = 0;
      this.requestedDisposable = disposableEmpty;
      this.error = null;
      this.hasFailed = false;
      this.hasCompleted = false;
    }

    addProperties(ControlledSubject.prototype, Observer, {
      onCompleted: function () {
        this.hasCompleted = true;
        if (!this.enableQueue || this.queue.length === 0)
          this.subject.onCompleted();
        else
          this.queue.push(Rx.Notification.createOnCompleted());
      },
      onError: function (error) {
        this.hasFailed = true;
        this.error = error;
        if (!this.enableQueue || this.queue.length === 0)
          this.subject.onError(error);
        else
          this.queue.push(Rx.Notification.createOnError(error));
      },
      onNext: function (value) {
        var hasRequested = false;

        if (this.requestedCount === 0) {
          this.enableQueue && this.queue.push(Rx.Notification.createOnNext(value));
        } else {
          (this.requestedCount !== -1 && this.requestedCount-- === 0) && this.disposeCurrentRequest();
          hasRequested = true;
        }
        hasRequested && this.subject.onNext(value);
      },
      _processRequest: function (numberOfItems) {
        if (this.enableQueue) {
          while ((this.queue.length >= numberOfItems && numberOfItems > 0) ||
          (this.queue.length > 0 && this.queue[0].kind !== 'N')) {
            var first = this.queue.shift();
            first.accept(this.subject);
            if (first.kind === 'N') numberOfItems--;
            else { this.disposeCurrentRequest(); this.queue = []; }
          }

          return { numberOfItems : numberOfItems, returnValue: this.queue.length !== 0};
        }

        //TODO I don't think this is ever necessary, since termination of a sequence without a queue occurs in the onCompletion or onError function
        //if (this.hasFailed) {
        //  this.subject.onError(this.error);
        //} else if (this.hasCompleted) {
        //  this.subject.onCompleted();
        //}

        return { numberOfItems: numberOfItems, returnValue: false };
      },
      request: function (number) {
        this.disposeCurrentRequest();
        var self = this, r = this._processRequest(number);

        var number = r.numberOfItems;
        if (!r.returnValue) {
          this.requestedCount = number;
          this.requestedDisposable = disposableCreate(function () {
            self.requestedCount = 0;
          });

          return this.requestedDisposable;
        } else {
          return disposableEmpty;
        }
      },
      disposeCurrentRequest: function () {
        this.requestedDisposable.dispose();
        this.requestedDisposable = disposableEmpty;
      }
    });

    return ControlledSubject;
  }(Observable));

  /**
   * Attaches a controller to the observable sequence with the ability to queue.
   * @example
   * var source = Rx.Observable.interval(100).controlled();
   * source.request(3); // Reads 3 values
   * @param {Observable} pauser The observable sequence used to pause the underlying sequence.
   * @returns {Observable} The observable sequence which is paused based upon the pauser.
   */
  observableProto.controlled = function (enableQueue) {
    if (enableQueue == null) {  enableQueue = true; }
    return new ControlledObservable(this, enableQueue);
  };

  var StopAndWaitObservable = (function (__super__) {

    function subscribe (observer) {
      this.subscription = this.source.subscribe(new StopAndWaitObserver(observer, this, this.subscription));

      var self = this;
      timeoutScheduler.schedule(function () { self.source.request(1); });

      return this.subscription;
    }

    inherits(StopAndWaitObservable, __super__);

    function StopAndWaitObservable (source) {
      __super__.call(this, subscribe, source);
      this.source = source;
    }

    var StopAndWaitObserver = (function (__sub__) {

      inherits(StopAndWaitObserver, __sub__);

      function StopAndWaitObserver (observer, observable, cancel) {
        __sub__.call(this);
        this.observer = observer;
        this.observable = observable;
        this.cancel = cancel;
      }

      var stopAndWaitObserverProto = StopAndWaitObserver.prototype;

      stopAndWaitObserverProto.completed = function () {
        this.observer.onCompleted();
        this.dispose();
      };

      stopAndWaitObserverProto.error = function (error) {
        this.observer.onError(error);
        this.dispose();
      }

      stopAndWaitObserverProto.next = function (value) {
        this.observer.onNext(value);

        var self = this;
        timeoutScheduler.schedule(function () {
          self.observable.source.request(1);
        });
      };

      stopAndWaitObserverProto.dispose = function () {
        this.observer = null;
        if (this.cancel) {
          this.cancel.dispose();
          this.cancel = null;
        }
        __sub__.prototype.dispose.call(this);
      };

      return StopAndWaitObserver;
    }(AbstractObserver));

    return StopAndWaitObservable;
  }(Observable));


  /**
   * Attaches a stop and wait observable to the current observable.
   * @returns {Observable} A stop and wait observable.
   */
  ControlledObservable.prototype.stopAndWait = function () {
    return new StopAndWaitObservable(this);
  };

  var WindowedObservable = (function (__super__) {

    function subscribe (observer) {
      this.subscription = this.source.subscribe(new WindowedObserver(observer, this, this.subscription));

      var self = this;
      timeoutScheduler.schedule(function () {
        self.source.request(self.windowSize);
      });

      return this.subscription;
    }

    inherits(WindowedObservable, __super__);

    function WindowedObservable(source, windowSize) {
      __super__.call(this, subscribe, source);
      this.source = source;
      this.windowSize = windowSize;
    }

    var WindowedObserver = (function (__sub__) {

      inherits(WindowedObserver, __sub__);

      function WindowedObserver(observer, observable, cancel) {
        this.observer = observer;
        this.observable = observable;
        this.cancel = cancel;
        this.received = 0;
      }

      var windowedObserverPrototype = WindowedObserver.prototype;

      windowedObserverPrototype.completed = function () {
        this.observer.onCompleted();
        this.dispose();
      };

      windowedObserverPrototype.error = function (error) {
        this.observer.onError(error);
        this.dispose();
      };

      windowedObserverPrototype.next = function (value) {
        this.observer.onNext(value);

        this.received = ++this.received % this.observable.windowSize;
        if (this.received === 0) {
          var self = this;
          timeoutScheduler.schedule(function () {
            self.observable.source.request(self.observable.windowSize);
          });
        }
      };

      windowedObserverPrototype.dispose = function () {
        this.observer = null;
        if (this.cancel) {
          this.cancel.dispose();
          this.cancel = null;
        }
        __sub__.prototype.dispose.call(this);
      };

      return WindowedObserver;
    }(AbstractObserver));

    return WindowedObservable;
  }(Observable));

  /**
   * Creates a sliding windowed observable based upon the window size.
   * @param {Number} windowSize The number of items in the window
   * @returns {Observable} A windowed observable based upon the window size.
   */
  ControlledObservable.prototype.windowed = function (windowSize) {
    return new WindowedObservable(this, windowSize);
  };

  /**
   * Pipes the existing Observable sequence into a Node.js Stream.
   * @param {Stream} dest The destination Node.js stream.
   * @returns {Stream} The destination stream.
   */
  observableProto.pipe = function (dest) {
    var source = this.pausableBuffered();

    function onDrain() {
      source.resume();
    }

    dest.addListener('drain', onDrain);

    source.subscribe(
      function (x) {
        !dest.write(String(x)) && source.pause();
      },
      function (err) {
        dest.emit('error', err);
      },
      function () {
        // Hack check because STDIO is not closable
        !dest._isStdio && dest.end();
        dest.removeListener('drain', onDrain);
      });

    source.resume();

    return dest;
  };

  /**
   * Multicasts the source sequence notifications through an instantiated subject into all uses of the sequence within a selector function. Each
   * subscription to the resulting sequence causes a separate multicast invocation, exposing the sequence resulting from the selector function's
   * invocation. For specializations with fixed subject types, see Publish, PublishLast, and Replay.
   *
   * @example
   * 1 - res = source.multicast(observable);
   * 2 - res = source.multicast(function () { return new Subject(); }, function (x) { return x; });
   *
   * @param {Function|Subject} subjectOrSubjectSelector
   * Factory function to create an intermediate subject through which the source sequence's elements will be multicast to the selector function.
   * Or:
   * Subject to push source elements into.
   *
   * @param {Function} [selector] Optional selector function which can use the multicasted source sequence subject to the policies enforced by the created subject. Specified only if <paramref name="subjectOrSubjectSelector" is a factory function.
   * @returns {Observable} An observable sequence that contains the elements of a sequence produced by multicasting the source sequence within a selector function.
   */
  observableProto.multicast = function (subjectOrSubjectSelector, selector) {
    var source = this;
    return typeof subjectOrSubjectSelector === 'function' ?
      new AnonymousObservable(function (observer) {
        var connectable = source.multicast(subjectOrSubjectSelector());
        return new CompositeDisposable(selector(connectable).subscribe(observer), connectable.connect());
      }, source) :
      new ConnectableObservable(source, subjectOrSubjectSelector);
  };

  /**
   * Returns an observable sequence that is the result of invoking the selector on a connectable observable sequence that shares a single subscription to the underlying sequence.
   * This operator is a specialization of Multicast using a regular Subject.
   *
   * @example
   * var resres = source.publish();
   * var res = source.publish(function (x) { return x; });
   *
   * @param {Function} [selector] Selector function which can use the multicasted source sequence as many times as needed, without causing multiple subscriptions to the source sequence. Subscribers to the given source will receive all notifications of the source from the time of the subscription on.
   * @returns {Observable} An observable sequence that contains the elements of a sequence produced by multicasting the source sequence within a selector function.
   */
  observableProto.publish = function (selector) {
    return selector && isFunction(selector) ?
      this.multicast(function () { return new Subject(); }, selector) :
      this.multicast(new Subject());
  };

  /**
   * Returns an observable sequence that shares a single subscription to the underlying sequence.
   * This operator is a specialization of publish which creates a subscription when the number of observers goes from zero to one, then shares that subscription with all subsequent observers until the number of observers returns to zero, at which point the subscription is disposed.
   * @returns {Observable} An observable sequence that contains the elements of a sequence produced by multicasting the source sequence.
   */
  observableProto.share = function () {
    return this.publish().refCount();
  };

  /**
   * Returns an observable sequence that is the result of invoking the selector on a connectable observable sequence that shares a single subscription to the underlying sequence containing only the last notification.
   * This operator is a specialization of Multicast using a AsyncSubject.
   *
   * @example
   * var res = source.publishLast();
   * var res = source.publishLast(function (x) { return x; });
   *
   * @param selector [Optional] Selector function which can use the multicasted source sequence as many times as needed, without causing multiple subscriptions to the source sequence. Subscribers to the given source will only receive the last notification of the source.
   * @returns {Observable} An observable sequence that contains the elements of a sequence produced by multicasting the source sequence within a selector function.
   */
  observableProto.publishLast = function (selector) {
    return selector && isFunction(selector) ?
      this.multicast(function () { return new AsyncSubject(); }, selector) :
      this.multicast(new AsyncSubject());
  };

  /**
   * Returns an observable sequence that is the result of invoking the selector on a connectable observable sequence that shares a single subscription to the underlying sequence and starts with initialValue.
   * This operator is a specialization of Multicast using a BehaviorSubject.
   *
   * @example
   * var res = source.publishValue(42);
   * var res = source.publishValue(function (x) { return x.select(function (y) { return y * y; }) }, 42);
   *
   * @param {Function} [selector] Optional selector function which can use the multicasted source sequence as many times as needed, without causing multiple subscriptions to the source sequence. Subscribers to the given source will receive immediately receive the initial value, followed by all notifications of the source from the time of the subscription on.
   * @param {Mixed} initialValue Initial value received by observers upon subscription.
   * @returns {Observable} An observable sequence that contains the elements of a sequence produced by multicasting the source sequence within a selector function.
   */
  observableProto.publishValue = function (initialValueOrSelector, initialValue) {
    return arguments.length === 2 ?
      this.multicast(function () {
        return new BehaviorSubject(initialValue);
      }, initialValueOrSelector) :
      this.multicast(new BehaviorSubject(initialValueOrSelector));
  };

  /**
   * Returns an observable sequence that shares a single subscription to the underlying sequence and starts with an initialValue.
   * This operator is a specialization of publishValue which creates a subscription when the number of observers goes from zero to one, then shares that subscription with all subsequent observers until the number of observers returns to zero, at which point the subscription is disposed.
   * @param {Mixed} initialValue Initial value received by observers upon subscription.
   * @returns {Observable} An observable sequence that contains the elements of a sequence produced by multicasting the source sequence.
   */
  observableProto.shareValue = function (initialValue) {
    return this.publishValue(initialValue).refCount();
  };

  /**
   * Returns an observable sequence that is the result of invoking the selector on a connectable observable sequence that shares a single subscription to the underlying sequence replaying notifications subject to a maximum time length for the replay buffer.
   * This operator is a specialization of Multicast using a ReplaySubject.
   *
   * @example
   * var res = source.replay(null, 3);
   * var res = source.replay(null, 3, 500);
   * var res = source.replay(null, 3, 500, scheduler);
   * var res = source.replay(function (x) { return x.take(6).repeat(); }, 3, 500, scheduler);
   *
   * @param selector [Optional] Selector function which can use the multicasted source sequence as many times as needed, without causing multiple subscriptions to the source sequence. Subscribers to the given source will receive all the notifications of the source subject to the specified replay buffer trimming policy.
   * @param bufferSize [Optional] Maximum element count of the replay buffer.
   * @param windowSize [Optional] Maximum time length of the replay buffer.
   * @param scheduler [Optional] Scheduler where connected observers within the selector function will be invoked on.
   * @returns {Observable} An observable sequence that contains the elements of a sequence produced by multicasting the source sequence within a selector function.
   */
  observableProto.replay = function (selector, bufferSize, windowSize, scheduler) {
    return selector && isFunction(selector) ?
      this.multicast(function () { return new ReplaySubject(bufferSize, windowSize, scheduler); }, selector) :
      this.multicast(new ReplaySubject(bufferSize, windowSize, scheduler));
  };

  /**
   * Returns an observable sequence that shares a single subscription to the underlying sequence replaying notifications subject to a maximum time length for the replay buffer.
   * This operator is a specialization of replay which creates a subscription when the number of observers goes from zero to one, then shares that subscription with all subsequent observers until the number of observers returns to zero, at which point the subscription is disposed.
   *
   * @example
   * var res = source.shareReplay(3);
   * var res = source.shareReplay(3, 500);
   * var res = source.shareReplay(3, 500, scheduler);
   *

   * @param bufferSize [Optional] Maximum element count of the replay buffer.
   * @param window [Optional] Maximum time length of the replay buffer.
   * @param scheduler [Optional] Scheduler where connected observers within the selector function will be invoked on.
   * @returns {Observable} An observable sequence that contains the elements of a sequence produced by multicasting the source sequence.
   */
  observableProto.shareReplay = function (bufferSize, windowSize, scheduler) {
    return this.replay(null, bufferSize, windowSize, scheduler).refCount();
  };

  var InnerSubscription = function (subject, observer) {
    this.subject = subject;
    this.observer = observer;
  };

  InnerSubscription.prototype.dispose = function () {
    if (!this.subject.isDisposed && this.observer !== null) {
      var idx = this.subject.observers.indexOf(this.observer);
      this.subject.observers.splice(idx, 1);
      this.observer = null;
    }
  };

  /**
   *  Represents a value that changes over time.
   *  Observers can subscribe to the subject to receive the last (or initial) value and all subsequent notifications.
   */
  var BehaviorSubject = Rx.BehaviorSubject = (function (__super__) {
    function subscribe(observer) {
      checkDisposed(this);
      if (!this.isStopped) {
        this.observers.push(observer);
        observer.onNext(this.value);
        return new InnerSubscription(this, observer);
      }
      if (this.hasError) {
        observer.onError(this.error);
      } else {
        observer.onCompleted();
      }
      return disposableEmpty;
    }

    inherits(BehaviorSubject, __super__);

    /**
     *  Initializes a new instance of the BehaviorSubject class which creates a subject that caches its last value and starts with the specified value.
     *  @param {Mixed} value Initial value sent to observers when no other value has been received by the subject yet.
     */
    function BehaviorSubject(value) {
      __super__.call(this, subscribe);
      this.value = value,
      this.observers = [],
      this.isDisposed = false,
      this.isStopped = false,
      this.hasError = false;
    }

    addProperties(BehaviorSubject.prototype, Observer, {
      /**
       * Gets the current value or throws an exception.
       * Value is frozen after onCompleted is called.
       * After onError is called always throws the specified exception.
       * An exception is always thrown after dispose is called.
       * @returns {Mixed} The initial value passed to the constructor until onNext is called; after which, the last value passed to onNext.
       */
      getValue: function () {
          checkDisposed(this);
          if (this.hasError) {
              throw this.error;
          }
          return this.value;
      },
      /**
       * Indicates whether the subject has observers subscribed to it.
       * @returns {Boolean} Indicates whether the subject has observers subscribed to it.
       */
      hasObservers: function () { return this.observers.length > 0; },
      /**
       * Notifies all subscribed observers about the end of the sequence.
       */
      onCompleted: function () {
        checkDisposed(this);
        if (this.isStopped) { return; }
        this.isStopped = true;
        for (var i = 0, os = cloneArray(this.observers), len = os.length; i < len; i++) {
          os[i].onCompleted();
        }

        this.observers.length = 0;
      },
      /**
       * Notifies all subscribed observers about the exception.
       * @param {Mixed} error The exception to send to all observers.
       */
      onError: function (error) {
        checkDisposed(this);
        if (this.isStopped) { return; }
        this.isStopped = true;
        this.hasError = true;
        this.error = error;

        for (var i = 0, os = cloneArray(this.observers), len = os.length; i < len; i++) {
          os[i].onError(error);
        }

        this.observers.length = 0;
      },
      /**
       * Notifies all subscribed observers about the arrival of the specified element in the sequence.
       * @param {Mixed} value The value to send to all observers.
       */
      onNext: function (value) {
        checkDisposed(this);
        if (this.isStopped) { return; }
        this.value = value;
        for (var i = 0, os = cloneArray(this.observers), len = os.length; i < len; i++) {
          os[i].onNext(value);
        }
      },
      /**
       * Unsubscribe all observers and release resources.
       */
      dispose: function () {
        this.isDisposed = true;
        this.observers = null;
        this.value = null;
        this.exception = null;
      }
    });

    return BehaviorSubject;
  }(Observable));

  /**
   * Represents an object that is both an observable sequence as well as an observer.
   * Each notification is broadcasted to all subscribed and future observers, subject to buffer trimming policies.
   */
  var ReplaySubject = Rx.ReplaySubject = (function (__super__) {

    var maxSafeInteger = Math.pow(2, 53) - 1;

    function createRemovableDisposable(subject, observer) {
      return disposableCreate(function () {
        observer.dispose();
        !subject.isDisposed && subject.observers.splice(subject.observers.indexOf(observer), 1);
      });
    }

    function subscribe(observer) {
      var so = new ScheduledObserver(this.scheduler, observer),
        subscription = createRemovableDisposable(this, so);
      checkDisposed(this);
      this._trim(this.scheduler.now());
      this.observers.push(so);

      for (var i = 0, len = this.q.length; i < len; i++) {
        so.onNext(this.q[i].value);
      }

      if (this.hasError) {
        so.onError(this.error);
      } else if (this.isStopped) {
        so.onCompleted();
      }

      so.ensureActive();
      return subscription;
    }

    inherits(ReplaySubject, __super__);

    /**
     *  Initializes a new instance of the ReplaySubject class with the specified buffer size, window size and scheduler.
     *  @param {Number} [bufferSize] Maximum element count of the replay buffer.
     *  @param {Number} [windowSize] Maximum time length of the replay buffer.
     *  @param {Scheduler} [scheduler] Scheduler the observers are invoked on.
     */
    function ReplaySubject(bufferSize, windowSize, scheduler) {
      this.bufferSize = bufferSize == null ? maxSafeInteger : bufferSize;
      this.windowSize = windowSize == null ? maxSafeInteger : windowSize;
      this.scheduler = scheduler || currentThreadScheduler;
      this.q = [];
      this.observers = [];
      this.isStopped = false;
      this.isDisposed = false;
      this.hasError = false;
      this.error = null;
      __super__.call(this, subscribe);
    }

    addProperties(ReplaySubject.prototype, Observer.prototype, {
      /**
       * Indicates whether the subject has observers subscribed to it.
       * @returns {Boolean} Indicates whether the subject has observers subscribed to it.
       */
      hasObservers: function () {
        return this.observers.length > 0;
      },
      _trim: function (now) {
        while (this.q.length > this.bufferSize) {
          this.q.shift();
        }
        while (this.q.length > 0 && (now - this.q[0].interval) > this.windowSize) {
          this.q.shift();
        }
      },
      /**
       * Notifies all subscribed observers about the arrival of the specified element in the sequence.
       * @param {Mixed} value The value to send to all observers.
       */
      onNext: function (value) {
        checkDisposed(this);
        if (this.isStopped) { return; }
        var now = this.scheduler.now();
        this.q.push({ interval: now, value: value });
        this._trim(now);

        for (var i = 0, os = cloneArray(this.observers), len = os.length; i < len; i++) {
          var observer = os[i];
          observer.onNext(value);
          observer.ensureActive();
        }
      },
      /**
       * Notifies all subscribed observers about the exception.
       * @param {Mixed} error The exception to send to all observers.
       */
      onError: function (error) {
        checkDisposed(this);
        if (this.isStopped) { return; }
        this.isStopped = true;
        this.error = error;
        this.hasError = true;
        var now = this.scheduler.now();
        this._trim(now);
        for (var i = 0, os = cloneArray(this.observers), len = os.length; i < len; i++) {
          var observer = os[i];
          observer.onError(error);
          observer.ensureActive();
        }
        this.observers.length = 0;
      },
      /**
       * Notifies all subscribed observers about the end of the sequence.
       */
      onCompleted: function () {
        checkDisposed(this);
        if (this.isStopped) { return; }
        this.isStopped = true;
        var now = this.scheduler.now();
        this._trim(now);
        for (var i = 0, os = cloneArray(this.observers), len = os.length; i < len; i++) {
          var observer = os[i];
          observer.onCompleted();
          observer.ensureActive();
        }
        this.observers.length = 0;
      },
      /**
       * Unsubscribe all observers and release resources.
       */
      dispose: function () {
        this.isDisposed = true;
        this.observers = null;
      }
    });

    return ReplaySubject;
  }(Observable));

  var ConnectableObservable = Rx.ConnectableObservable = (function (__super__) {
    inherits(ConnectableObservable, __super__);

    function ConnectableObservable(source, subject) {
      var hasSubscription = false,
        subscription,
        sourceObservable = source.asObservable();

      this.connect = function () {
        if (!hasSubscription) {
          hasSubscription = true;
          subscription = new CompositeDisposable(sourceObservable.subscribe(subject), disposableCreate(function () {
            hasSubscription = false;
          }));
        }
        return subscription;
      };

      __super__.call(this, function (o) { return subject.subscribe(o); });
    }

    ConnectableObservable.prototype.refCount = function () {
      var connectableSubscription, count = 0, source = this;
      return new AnonymousObservable(function (observer) {
          var shouldConnect = ++count === 1,
            subscription = source.subscribe(observer);
          shouldConnect && (connectableSubscription = source.connect());
          return function () {
            subscription.dispose();
            --count === 0 && connectableSubscription.dispose();
          };
      });
    };

    return ConnectableObservable;
  }(Observable));

  var Dictionary = (function () {

    var primes = [1, 3, 7, 13, 31, 61, 127, 251, 509, 1021, 2039, 4093, 8191, 16381, 32749, 65521, 131071, 262139, 524287, 1048573, 2097143, 4194301, 8388593, 16777213, 33554393, 67108859, 134217689, 268435399, 536870909, 1073741789, 2147483647],
      noSuchkey = "no such key",
      duplicatekey = "duplicate key";

    function isPrime(candidate) {
      if ((candidate & 1) === 0) { return candidate === 2; }
      var num1 = Math.sqrt(candidate),
        num2 = 3;
      while (num2 <= num1) {
        if (candidate % num2 === 0) { return false; }
        num2 += 2;
      }
      return true;
    }

    function getPrime(min) {
      var index, num, candidate;
      for (index = 0; index < primes.length; ++index) {
        num = primes[index];
        if (num >= min) { return num; }
      }
      candidate = min | 1;
      while (candidate < primes[primes.length - 1]) {
        if (isPrime(candidate)) { return candidate; }
        candidate += 2;
      }
      return min;
    }

    function stringHashFn(str) {
      var hash = 757602046;
      if (!str.length) { return hash; }
      for (var i = 0, len = str.length; i < len; i++) {
        var character = str.charCodeAt(i);
        hash = ((hash << 5) - hash) + character;
        hash = hash & hash;
      }
      return hash;
    }

    function numberHashFn(key) {
      var c2 = 0x27d4eb2d;
      key = (key ^ 61) ^ (key >>> 16);
      key = key + (key << 3);
      key = key ^ (key >>> 4);
      key = key * c2;
      key = key ^ (key >>> 15);
      return key;
    }

    var getHashCode = (function () {
      var uniqueIdCounter = 0;

      return function (obj) {
        if (obj == null) { throw new Error(noSuchkey); }

        // Check for built-ins before tacking on our own for any object
        if (typeof obj === 'string') { return stringHashFn(obj); }
        if (typeof obj === 'number') { return numberHashFn(obj); }
        if (typeof obj === 'boolean') { return obj === true ? 1 : 0; }
        if (obj instanceof Date) { return numberHashFn(obj.valueOf()); }
        if (obj instanceof RegExp) { return stringHashFn(obj.toString()); }
        if (typeof obj.valueOf === 'function') {
          // Hack check for valueOf
          var valueOf = obj.valueOf();
          if (typeof valueOf === 'number') { return numberHashFn(valueOf); }
          if (typeof valueOf === 'string') { return stringHashFn(valueOf); }
        }
        if (obj.hashCode) { return obj.hashCode(); }

        var id = 17 * uniqueIdCounter++;
        obj.hashCode = function () { return id; };
        return id;
      };
    }());

    function newEntry() {
      return { key: null, value: null, next: 0, hashCode: 0 };
    }

    function Dictionary(capacity, comparer) {
      if (capacity < 0) { throw new ArgumentOutOfRangeError(); }
      if (capacity > 0) { this._initialize(capacity); }

      this.comparer = comparer || defaultComparer;
      this.freeCount = 0;
      this.size = 0;
      this.freeList = -1;
    }

    var dictionaryProto = Dictionary.prototype;

    dictionaryProto._initialize = function (capacity) {
      var prime = getPrime(capacity), i;
      this.buckets = new Array(prime);
      this.entries = new Array(prime);
      for (i = 0; i < prime; i++) {
        this.buckets[i] = -1;
        this.entries[i] = newEntry();
      }
      this.freeList = -1;
    };

    dictionaryProto.add = function (key, value) {
      this._insert(key, value, true);
    };

    dictionaryProto._insert = function (key, value, add) {
      if (!this.buckets) { this._initialize(0); }
      var index3,
        num = getHashCode(key) & 2147483647,
        index1 = num % this.buckets.length;
      for (var index2 = this.buckets[index1]; index2 >= 0; index2 = this.entries[index2].next) {
        if (this.entries[index2].hashCode === num && this.comparer(this.entries[index2].key, key)) {
          if (add) { throw new Error(duplicatekey); }
          this.entries[index2].value = value;
          return;
        }
      }
      if (this.freeCount > 0) {
        index3 = this.freeList;
        this.freeList = this.entries[index3].next;
        --this.freeCount;
      } else {
        if (this.size === this.entries.length) {
          this._resize();
          index1 = num % this.buckets.length;
        }
        index3 = this.size;
        ++this.size;
      }
      this.entries[index3].hashCode = num;
      this.entries[index3].next = this.buckets[index1];
      this.entries[index3].key = key;
      this.entries[index3].value = value;
      this.buckets[index1] = index3;
    };

    dictionaryProto._resize = function () {
      var prime = getPrime(this.size * 2),
        numArray = new Array(prime);
      for (index = 0; index < numArray.length; ++index) {  numArray[index] = -1; }
      var entryArray = new Array(prime);
      for (index = 0; index < this.size; ++index) { entryArray[index] = this.entries[index]; }
      for (var index = this.size; index < prime; ++index) { entryArray[index] = newEntry(); }
      for (var index1 = 0; index1 < this.size; ++index1) {
        var index2 = entryArray[index1].hashCode % prime;
        entryArray[index1].next = numArray[index2];
        numArray[index2] = index1;
      }
      this.buckets = numArray;
      this.entries = entryArray;
    };

    dictionaryProto.remove = function (key) {
      if (this.buckets) {
        var num = getHashCode(key) & 2147483647,
          index1 = num % this.buckets.length,
          index2 = -1;
        for (var index3 = this.buckets[index1]; index3 >= 0; index3 = this.entries[index3].next) {
          if (this.entries[index3].hashCode === num && this.comparer(this.entries[index3].key, key)) {
            if (index2 < 0) {
              this.buckets[index1] = this.entries[index3].next;
            } else {
              this.entries[index2].next = this.entries[index3].next;
            }
            this.entries[index3].hashCode = -1;
            this.entries[index3].next = this.freeList;
            this.entries[index3].key = null;
            this.entries[index3].value = null;
            this.freeList = index3;
            ++this.freeCount;
            return true;
          } else {
            index2 = index3;
          }
        }
      }
      return false;
    };

    dictionaryProto.clear = function () {
      var index, len;
      if (this.size <= 0) { return; }
      for (index = 0, len = this.buckets.length; index < len; ++index) {
        this.buckets[index] = -1;
      }
      for (index = 0; index < this.size; ++index) {
        this.entries[index] = newEntry();
      }
      this.freeList = -1;
      this.size = 0;
    };

    dictionaryProto._findEntry = function (key) {
      if (this.buckets) {
        var num = getHashCode(key) & 2147483647;
        for (var index = this.buckets[num % this.buckets.length]; index >= 0; index = this.entries[index].next) {
          if (this.entries[index].hashCode === num && this.comparer(this.entries[index].key, key)) {
            return index;
          }
        }
      }
      return -1;
    };

    dictionaryProto.count = function () {
      return this.size - this.freeCount;
    };

    dictionaryProto.tryGetValue = function (key) {
      var entry = this._findEntry(key);
      return entry >= 0 ?
        this.entries[entry].value :
        undefined;
    };

    dictionaryProto.getValues = function () {
      var index = 0, results = [];
      if (this.entries) {
        for (var index1 = 0; index1 < this.size; index1++) {
          if (this.entries[index1].hashCode >= 0) {
            results[index++] = this.entries[index1].value;
          }
        }
      }
      return results;
    };

    dictionaryProto.get = function (key) {
      var entry = this._findEntry(key);
      if (entry >= 0) { return this.entries[entry].value; }
      throw new Error(noSuchkey);
    };

    dictionaryProto.set = function (key, value) {
      this._insert(key, value, false);
    };

    dictionaryProto.containskey = function (key) {
      return this._findEntry(key) >= 0;
    };

    return Dictionary;
  }());

  /**
   *  Correlates the elements of two sequences based on overlapping durations.
   *
   *  @param {Observable} right The right observable sequence to join elements for.
   *  @param {Function} leftDurationSelector A function to select the duration (expressed as an observable sequence) of each element of the left observable sequence, used to determine overlap.
   *  @param {Function} rightDurationSelector A function to select the duration (expressed as an observable sequence) of each element of the right observable sequence, used to determine overlap.
   *  @param {Function} resultSelector A function invoked to compute a result element for any two overlapping elements of the left and right observable sequences. The parameters passed to the function correspond with the elements from the left and right source sequences for which overlap occurs.
   *  @returns {Observable} An observable sequence that contains result elements computed from source elements that have an overlapping duration.
   */
  observableProto.join = function (right, leftDurationSelector, rightDurationSelector, resultSelector) {
    var left = this;
    return new AnonymousObservable(function (observer) {
      var group = new CompositeDisposable();
      var leftDone = false, rightDone = false;
      var leftId = 0, rightId = 0;
      var leftMap = new Dictionary(), rightMap = new Dictionary();

      group.add(left.subscribe(
        function (value) {
          var id = leftId++;
          var md = new SingleAssignmentDisposable();

          leftMap.add(id, value);
          group.add(md);

          var expire = function () {
            leftMap.remove(id) && leftMap.count() === 0 && leftDone && observer.onCompleted();
            group.remove(md);
          };

          var duration;
          try {
            duration = leftDurationSelector(value);
          } catch (e) {
            observer.onError(e);
            return;
          }

          md.setDisposable(duration.take(1).subscribe(noop, observer.onError.bind(observer), expire));

          rightMap.getValues().forEach(function (v) {
            var result;
            try {
              result = resultSelector(value, v);
            } catch (exn) {
              observer.onError(exn);
              return;
            }

            observer.onNext(result);
          });
        },
        observer.onError.bind(observer),
        function () {
          leftDone = true;
          (rightDone || leftMap.count() === 0) && observer.onCompleted();
        })
      );

      group.add(right.subscribe(
        function (value) {
          var id = rightId++;
          var md = new SingleAssignmentDisposable();

          rightMap.add(id, value);
          group.add(md);

          var expire = function () {
            rightMap.remove(id) && rightMap.count() === 0 && rightDone && observer.onCompleted();
            group.remove(md);
          };

          var duration;
          try {
            duration = rightDurationSelector(value);
          } catch (e) {
            observer.onError(e);
            return;
          }

          md.setDisposable(duration.take(1).subscribe(noop, observer.onError.bind(observer), expire));

          leftMap.getValues().forEach(function (v) {
            var result;
            try {
              result = resultSelector(v, value);
            } catch (exn) {
              observer.onError(exn);
              return;
            }

            observer.onNext(result);
          });
        },
        observer.onError.bind(observer),
        function () {
          rightDone = true;
          (leftDone || rightMap.count() === 0) && observer.onCompleted();
        })
      );
      return group;
    }, left);
  };

  /**
   *  Correlates the elements of two sequences based on overlapping durations, and groups the results.
   *
   *  @param {Observable} right The right observable sequence to join elements for.
   *  @param {Function} leftDurationSelector A function to select the duration (expressed as an observable sequence) of each element of the left observable sequence, used to determine overlap.
   *  @param {Function} rightDurationSelector A function to select the duration (expressed as an observable sequence) of each element of the right observable sequence, used to determine overlap.
   *  @param {Function} resultSelector A function invoked to compute a result element for any element of the left sequence with overlapping elements from the right observable sequence. The first parameter passed to the function is an element of the left sequence. The second parameter passed to the function is an observable sequence with elements from the right sequence that overlap with the left sequence's element.
   *  @returns {Observable} An observable sequence that contains result elements computed from source elements that have an overlapping duration.
   */
  observableProto.groupJoin = function (right, leftDurationSelector, rightDurationSelector, resultSelector) {
    var left = this;
    return new AnonymousObservable(function (observer) {
      var group = new CompositeDisposable();
      var r = new RefCountDisposable(group);
      var leftMap = new Dictionary(), rightMap = new Dictionary();
      var leftId = 0, rightId = 0;

      function handleError(e) { return function (v) { v.onError(e); }; };

      group.add(left.subscribe(
        function (value) {
          var s = new Subject();
          var id = leftId++;
          leftMap.add(id, s);

          var result;
          try {
            result = resultSelector(value, addRef(s, r));
          } catch (e) {
            leftMap.getValues().forEach(handleError(e));
            observer.onError(e);
            return;
          }
          observer.onNext(result);

          rightMap.getValues().forEach(function (v) { s.onNext(v); });

          var md = new SingleAssignmentDisposable();
          group.add(md);

          var expire = function () {
            leftMap.remove(id) && s.onCompleted();
            group.remove(md);
          };

          var duration;
          try {
            duration = leftDurationSelector(value);
          } catch (e) {
            leftMap.getValues().forEach(handleError(e));
            observer.onError(e);
            return;
          }

          md.setDisposable(duration.take(1).subscribe(
            noop,
            function (e) {
              leftMap.getValues().forEach(handleError(e));
              observer.onError(e);
            },
            expire)
          );
        },
        function (e) {
          leftMap.getValues().forEach(handleError(e));
          observer.onError(e);
        },
        observer.onCompleted.bind(observer))
      );

      group.add(right.subscribe(
        function (value) {
          var id = rightId++;
          rightMap.add(id, value);

          var md = new SingleAssignmentDisposable();
          group.add(md);

          var expire = function () {
            rightMap.remove(id);
            group.remove(md);
          };

          var duration;
          try {
            duration = rightDurationSelector(value);
          } catch (e) {
            leftMap.getValues().forEach(handleError(e));
            observer.onError(e);
            return;
          }
          md.setDisposable(duration.take(1).subscribe(
            noop,
            function (e) {
              leftMap.getValues().forEach(handleError(e));
              observer.onError(e);
            },
            expire)
          );

          leftMap.getValues().forEach(function (v) { v.onNext(value); });
        },
        function (e) {
          leftMap.getValues().forEach(handleError(e));
          observer.onError(e);
        })
      );

      return r;
    }, left);
  };

    /**
     *  Projects each element of an observable sequence into zero or more buffers.
     *
     *  @param {Mixed} bufferOpeningsOrClosingSelector Observable sequence whose elements denote the creation of new windows, or, a function invoked to define the boundaries of the produced windows (a new window is started when the previous one is closed, resulting in non-overlapping windows).
     *  @param {Function} [bufferClosingSelector] A function invoked to define the closing of each produced window. If a closing selector function is specified for the first parameter, this parameter is ignored.
     *  @returns {Observable} An observable sequence of windows.
     */
    observableProto.buffer = function (bufferOpeningsOrClosingSelector, bufferClosingSelector) {
        return this.window.apply(this, arguments).selectMany(function (x) { return x.toArray(); });
    };

  /**
   *  Projects each element of an observable sequence into zero or more windows.
   *
   *  @param {Mixed} windowOpeningsOrClosingSelector Observable sequence whose elements denote the creation of new windows, or, a function invoked to define the boundaries of the produced windows (a new window is started when the previous one is closed, resulting in non-overlapping windows).
   *  @param {Function} [windowClosingSelector] A function invoked to define the closing of each produced window. If a closing selector function is specified for the first parameter, this parameter is ignored.
   *  @returns {Observable} An observable sequence of windows.
   */
  observableProto.window = function (windowOpeningsOrClosingSelector, windowClosingSelector) {
    if (arguments.length === 1 && typeof arguments[0] !== 'function') {
      return observableWindowWithBoundaries.call(this, windowOpeningsOrClosingSelector);
    }
    return typeof windowOpeningsOrClosingSelector === 'function' ?
      observableWindowWithClosingSelector.call(this, windowOpeningsOrClosingSelector) :
      observableWindowWithOpenings.call(this, windowOpeningsOrClosingSelector, windowClosingSelector);
  };

  function observableWindowWithOpenings(windowOpenings, windowClosingSelector) {
    return windowOpenings.groupJoin(this, windowClosingSelector, observableEmpty, function (_, win) {
      return win;
    });
  }

  function observableWindowWithBoundaries(windowBoundaries) {
    var source = this;
    return new AnonymousObservable(function (observer) {
      var win = new Subject(),
        d = new CompositeDisposable(),
        r = new RefCountDisposable(d);

      observer.onNext(addRef(win, r));

      d.add(source.subscribe(function (x) {
        win.onNext(x);
      }, function (err) {
        win.onError(err);
        observer.onError(err);
      }, function () {
        win.onCompleted();
        observer.onCompleted();
      }));

      isPromise(windowBoundaries) && (windowBoundaries = observableFromPromise(windowBoundaries));

      d.add(windowBoundaries.subscribe(function (w) {
        win.onCompleted();
        win = new Subject();
        observer.onNext(addRef(win, r));
      }, function (err) {
        win.onError(err);
        observer.onError(err);
      }, function () {
        win.onCompleted();
        observer.onCompleted();
      }));

      return r;
    }, source);
  }

  function observableWindowWithClosingSelector(windowClosingSelector) {
    var source = this;
    return new AnonymousObservable(function (observer) {
      var m = new SerialDisposable(),
        d = new CompositeDisposable(m),
        r = new RefCountDisposable(d),
        win = new Subject();
      observer.onNext(addRef(win, r));
      d.add(source.subscribe(function (x) {
          win.onNext(x);
      }, function (err) {
          win.onError(err);
          observer.onError(err);
      }, function () {
          win.onCompleted();
          observer.onCompleted();
      }));

      function createWindowClose () {
        var windowClose;
        try {
          windowClose = windowClosingSelector();
        } catch (e) {
          observer.onError(e);
          return;
        }

        isPromise(windowClose) && (windowClose = observableFromPromise(windowClose));

        var m1 = new SingleAssignmentDisposable();
        m.setDisposable(m1);
        m1.setDisposable(windowClose.take(1).subscribe(noop, function (err) {
          win.onError(err);
          observer.onError(err);
        }, function () {
          win.onCompleted();
          win = new Subject();
          observer.onNext(addRef(win, r));
          createWindowClose();
        }));
      }

      createWindowClose();
      return r;
    }, source);
  }

  /**
   * Returns a new observable that triggers on the second and subsequent triggerings of the input observable.
   * The Nth triggering of the input observable passes the arguments from the N-1th and Nth triggering as a pair.
   * The argument passed to the N-1th triggering is held in hidden internal state until the Nth triggering occurs.
   * @returns {Observable} An observable that triggers on successive pairs of observations from the input observable as an array.
   */
  observableProto.pairwise = function () {
    var source = this;
    return new AnonymousObservable(function (observer) {
      var previous, hasPrevious = false;
      return source.subscribe(
        function (x) {
          if (hasPrevious) {
            observer.onNext([previous, x]);
          } else {
            hasPrevious = true;
          }
          previous = x;
        },
        observer.onError.bind(observer),
        observer.onCompleted.bind(observer));
    }, source);
  };

  /**
   * Returns two observables which partition the observations of the source by the given function.
   * The first will trigger observations for those values for which the predicate returns true.
   * The second will trigger observations for those values where the predicate returns false.
   * The predicate is executed once for each subscribed observer.
   * Both also propagate all error observations arising from the source and each completes
   * when the source completes.
   * @param {Function} predicate
   *    The function to determine which output Observable will trigger a particular observation.
   * @returns {Array}
   *    An array of observables. The first triggers when the predicate returns true,
   *    and the second triggers when the predicate returns false.
  */
  observableProto.partition = function(predicate, thisArg) {
    return [
      this.filter(predicate, thisArg),
      this.filter(function (x, i, o) { return !predicate.call(thisArg, x, i, o); })
    ];
  };

  function enumerableWhile(condition, source) {
    return new Enumerable(function () {
      return new Enumerator(function () {
        return condition() ?
          { done: false, value: source } :
          { done: true, value: undefined };
      });
    });
  }

   /**
   *  Returns an observable sequence that is the result of invoking the selector on the source sequence, without sharing subscriptions.
   *  This operator allows for a fluent style of writing queries that use the same sequence multiple times.
   *
   * @param {Function} selector Selector function which can use the source sequence as many times as needed, without sharing subscriptions to the source sequence.
   * @returns {Observable} An observable sequence that contains the elements of a sequence produced by multicasting the source sequence within a selector function.
   */
  observableProto.letBind = observableProto['let'] = function (func) {
    return func(this);
  };

   /**
   *  Determines whether an observable collection contains values. There is an alias for this method called 'ifThen' for browsers <IE9
   *
   * @example
   *  1 - res = Rx.Observable.if(condition, obs1);
   *  2 - res = Rx.Observable.if(condition, obs1, obs2);
   *  3 - res = Rx.Observable.if(condition, obs1, scheduler);
   * @param {Function} condition The condition which determines if the thenSource or elseSource will be run.
   * @param {Observable} thenSource The observable sequence or Promise that will be run if the condition function returns true.
   * @param {Observable} [elseSource] The observable sequence or Promise that will be run if the condition function returns false. If this is not provided, it defaults to Rx.Observabe.Empty with the specified scheduler.
   * @returns {Observable} An observable sequence which is either the thenSource or elseSource.
   */
  Observable['if'] = Observable.ifThen = function (condition, thenSource, elseSourceOrScheduler) {
    return observableDefer(function () {
      elseSourceOrScheduler || (elseSourceOrScheduler = observableEmpty());

      isPromise(thenSource) && (thenSource = observableFromPromise(thenSource));
      isPromise(elseSourceOrScheduler) && (elseSourceOrScheduler = observableFromPromise(elseSourceOrScheduler));

      // Assume a scheduler for empty only
      typeof elseSourceOrScheduler.now === 'function' && (elseSourceOrScheduler = observableEmpty(elseSourceOrScheduler));
      return condition() ? thenSource : elseSourceOrScheduler;
    });
  };

   /**
   *  Concatenates the observable sequences obtained by running the specified result selector for each element in source.
   * There is an alias for this method called 'forIn' for browsers <IE9
   * @param {Array} sources An array of values to turn into an observable sequence.
   * @param {Function} resultSelector A function to apply to each item in the sources array to turn it into an observable sequence.
   * @returns {Observable} An observable sequence from the concatenated observable sequences.
   */
  Observable['for'] = Observable.forIn = function (sources, resultSelector, thisArg) {
    return enumerableOf(sources, resultSelector, thisArg).concat();
  };

   /**
   *  Repeats source as long as condition holds emulating a while loop.
   * There is an alias for this method called 'whileDo' for browsers <IE9
   *
   * @param {Function} condition The condition which determines if the source will be repeated.
   * @param {Observable} source The observable sequence that will be run if the condition function returns true.
   * @returns {Observable} An observable sequence which is repeated as long as the condition holds.
   */
  var observableWhileDo = Observable['while'] = Observable.whileDo = function (condition, source) {
    isPromise(source) && (source = observableFromPromise(source));
    return enumerableWhile(condition, source).concat();
  };

   /**
   *  Repeats source as long as condition holds emulating a do while loop.
   *
   * @param {Function} condition The condition which determines if the source will be repeated.
   * @param {Observable} source The observable sequence that will be run if the condition function returns true.
   * @returns {Observable} An observable sequence which is repeated as long as the condition holds.
   */
  observableProto.doWhile = function (condition) {
    return observableConcat([this, observableWhileDo(condition, this)]);
  };

   /**
   *  Uses selector to determine which source in sources to use.
   *  There is an alias 'switchCase' for browsers <IE9.
   *
   * @example
   *  1 - res = Rx.Observable.case(selector, { '1': obs1, '2': obs2 });
   *  1 - res = Rx.Observable.case(selector, { '1': obs1, '2': obs2 }, obs0);
   *  1 - res = Rx.Observable.case(selector, { '1': obs1, '2': obs2 }, scheduler);
   *
   * @param {Function} selector The function which extracts the value for to test in a case statement.
   * @param {Array} sources A object which has keys which correspond to the case statement labels.
   * @param {Observable} [elseSource] The observable sequence or Promise that will be run if the sources are not matched. If this is not provided, it defaults to Rx.Observabe.empty with the specified scheduler.
   *
   * @returns {Observable} An observable sequence which is determined by a case statement.
   */
  Observable['case'] = Observable.switchCase = function (selector, sources, defaultSourceOrScheduler) {
    return observableDefer(function () {
      isPromise(defaultSourceOrScheduler) && (defaultSourceOrScheduler = observableFromPromise(defaultSourceOrScheduler));
      defaultSourceOrScheduler || (defaultSourceOrScheduler = observableEmpty());

      typeof defaultSourceOrScheduler.now === 'function' && (defaultSourceOrScheduler = observableEmpty(defaultSourceOrScheduler));

      var result = sources[selector()];
      isPromise(result) && (result = observableFromPromise(result));

      return result || defaultSourceOrScheduler;
    });
  };

   /**
   *  Expands an observable sequence by recursively invoking selector.
   *
   * @param {Function} selector Selector function to invoke for each produced element, resulting in another sequence to which the selector will be invoked recursively again.
   * @param {Scheduler} [scheduler] Scheduler on which to perform the expansion. If not provided, this defaults to the current thread scheduler.
   * @returns {Observable} An observable sequence containing all the elements produced by the recursive expansion.
   */
  observableProto.expand = function (selector, scheduler) {
    isScheduler(scheduler) || (scheduler = immediateScheduler);
    var source = this;
    return new AnonymousObservable(function (observer) {
      var q = [],
        m = new SerialDisposable(),
        d = new CompositeDisposable(m),
        activeCount = 0,
        isAcquired = false;

      var ensureActive = function () {
        var isOwner = false;
        if (q.length > 0) {
          isOwner = !isAcquired;
          isAcquired = true;
        }
        if (isOwner) {
          m.setDisposable(scheduler.scheduleRecursive(function (self) {
            var work;
            if (q.length > 0) {
              work = q.shift();
            } else {
              isAcquired = false;
              return;
            }
            var m1 = new SingleAssignmentDisposable();
            d.add(m1);
            m1.setDisposable(work.subscribe(function (x) {
              observer.onNext(x);
              var result = null;
              try {
                result = selector(x);
              } catch (e) {
                observer.onError(e);
              }
              q.push(result);
              activeCount++;
              ensureActive();
            }, observer.onError.bind(observer), function () {
              d.remove(m1);
              activeCount--;
              if (activeCount === 0) {
                observer.onCompleted();
              }
            }));
            self();
          }));
        }
      };

      q.push(source);
      activeCount++;
      ensureActive();
      return d;
    }, this);
  };

   /**
   *  Runs all observable sequences in parallel and collect their last elements.
   *
   * @example
   *  1 - res = Rx.Observable.forkJoin([obs1, obs2]);
   *  1 - res = Rx.Observable.forkJoin(obs1, obs2, ...);
   * @returns {Observable} An observable sequence with an array collecting the last elements of all the input sequences.
   */
  Observable.forkJoin = function () {
    var allSources = [];
    if (Array.isArray(arguments[0])) {
      allSources = arguments[0];
    } else {
      for(var i = 0, len = arguments.length; i < len; i++) { allSources.push(arguments[i]); }
    }
    return new AnonymousObservable(function (subscriber) {
      var count = allSources.length;
      if (count === 0) {
        subscriber.onCompleted();
        return disposableEmpty;
      }
      var group = new CompositeDisposable(),
        finished = false,
        hasResults = new Array(count),
        hasCompleted = new Array(count),
        results = new Array(count);

      for (var idx = 0; idx < count; idx++) {
        (function (i) {
          var source = allSources[i];
          isPromise(source) && (source = observableFromPromise(source));
          group.add(
            source.subscribe(
              function (value) {
              if (!finished) {
                hasResults[i] = true;
                results[i] = value;
              }
            },
            function (e) {
              finished = true;
              subscriber.onError(e);
              group.dispose();
            },
            function () {
              if (!finished) {
                if (!hasResults[i]) {
                    subscriber.onCompleted();
                    return;
                }
                hasCompleted[i] = true;
                for (var ix = 0; ix < count; ix++) {
                  if (!hasCompleted[ix]) { return; }
                }
                finished = true;
                subscriber.onNext(results);
                subscriber.onCompleted();
              }
            }));
        })(idx);
      }

      return group;
    });
  };

   /**
   *  Runs two observable sequences in parallel and combines their last elemenets.
   *
   * @param {Observable} second Second observable sequence.
   * @param {Function} resultSelector Result selector function to invoke with the last elements of both sequences.
   * @returns {Observable} An observable sequence with the result of calling the selector function with the last elements of both input sequences.
   */
  observableProto.forkJoin = function (second, resultSelector) {
    var first = this;
    return new AnonymousObservable(function (observer) {
      var leftStopped = false, rightStopped = false,
        hasLeft = false, hasRight = false,
        lastLeft, lastRight,
        leftSubscription = new SingleAssignmentDisposable(), rightSubscription = new SingleAssignmentDisposable();

      isPromise(second) && (second = observableFromPromise(second));

      leftSubscription.setDisposable(
          first.subscribe(function (left) {
            hasLeft = true;
            lastLeft = left;
          }, function (err) {
            rightSubscription.dispose();
            observer.onError(err);
          }, function () {
            leftStopped = true;
            if (rightStopped) {
              if (!hasLeft) {
                  observer.onCompleted();
              } else if (!hasRight) {
                  observer.onCompleted();
              } else {
                var result;
                try {
                  result = resultSelector(lastLeft, lastRight);
                } catch (e) {
                  observer.onError(e);
                  return;
                }
                observer.onNext(result);
                observer.onCompleted();
              }
            }
          })
      );

      rightSubscription.setDisposable(
        second.subscribe(function (right) {
          hasRight = true;
          lastRight = right;
        }, function (err) {
          leftSubscription.dispose();
          observer.onError(err);
        }, function () {
          rightStopped = true;
          if (leftStopped) {
            if (!hasLeft) {
              observer.onCompleted();
            } else if (!hasRight) {
              observer.onCompleted();
            } else {
              var result;
              try {
                result = resultSelector(lastLeft, lastRight);
              } catch (e) {
                observer.onError(e);
                return;
              }
              observer.onNext(result);
              observer.onCompleted();
            }
          }
        })
      );

      return new CompositeDisposable(leftSubscription, rightSubscription);
    }, first);
  };

  /**
   * Comonadic bind operator.
   * @param {Function} selector A transform function to apply to each element.
   * @param {Object} scheduler Scheduler used to execute the operation. If not specified, defaults to the ImmediateScheduler.
   * @returns {Observable} An observable sequence which results from the comonadic bind operation.
   */
  observableProto.manySelect = function (selector, scheduler) {
    isScheduler(scheduler) || (scheduler = immediateScheduler);
    var source = this;
    return observableDefer(function () {
      var chain;

      return source
        .map(function (x) {
          var curr = new ChainObservable(x);

          chain && chain.onNext(x);
          chain = curr;

          return curr;
        })
        .tap(
          noop,
          function (e) { chain && chain.onError(e); },
          function () { chain && chain.onCompleted(); }
        )
        .observeOn(scheduler)
        .map(selector);
    }, source);
  };

  var ChainObservable = (function (__super__) {

    function subscribe (observer) {
      var self = this, g = new CompositeDisposable();
      g.add(currentThreadScheduler.schedule(function () {
        observer.onNext(self.head);
        g.add(self.tail.mergeAll().subscribe(observer));
      }));

      return g;
    }

    inherits(ChainObservable, __super__);

    function ChainObservable(head) {
      __super__.call(this, subscribe);
      this.head = head;
      this.tail = new AsyncSubject();
    }

    addProperties(ChainObservable.prototype, Observer, {
      onCompleted: function () {
        this.onNext(Observable.empty());
      },
      onError: function (e) {
        this.onNext(Observable.throwError(e));
      },
      onNext: function (v) {
        this.tail.onNext(v);
        this.tail.onCompleted();
      }
    });

    return ChainObservable;

  }(Observable));

  /** @private */
  var Map = root.Map || (function () {

    function Map() {
      this._keys = [];
      this._values = [];
    }

    Map.prototype.get = function (key) {
      var i = this._keys.indexOf(key);
      return i !== -1 ? this._values[i] : undefined;
    };

    Map.prototype.set = function (key, value) {
      var i = this._keys.indexOf(key);
      i !== -1 && (this._values[i] = value);
      this._values[this._keys.push(key) - 1] = value;
    };

    Map.prototype.forEach = function (callback, thisArg) {
      for (var i = 0, len = this._keys.length; i < len; i++) {
        callback.call(thisArg, this._values[i], this._keys[i]);
      }
    };

    return Map;
  }());

  /**
   * @constructor
   * Represents a join pattern over observable sequences.
   */
  function Pattern(patterns) {
    this.patterns = patterns;
  }

  /**
   *  Creates a pattern that matches the current plan matches and when the specified observable sequences has an available value.
   *  @param other Observable sequence to match in addition to the current pattern.
   *  @return {Pattern} Pattern object that matches when all observable sequences in the pattern have an available value.
   */
  Pattern.prototype.and = function (other) {
    return new Pattern(this.patterns.concat(other));
  };

  /**
   *  Matches when all observable sequences in the pattern (specified using a chain of and operators) have an available value and projects the values.
   *  @param {Function} selector Selector that will be invoked with available values from the source sequences, in the same order of the sequences in the pattern.
   *  @return {Plan} Plan that produces the projected values, to be fed (with other plans) to the when operator.
   */
  Pattern.prototype.thenDo = function (selector) {
    return new Plan(this, selector);
  };

  function Plan(expression, selector) {
      this.expression = expression;
      this.selector = selector;
  }

  Plan.prototype.activate = function (externalSubscriptions, observer, deactivate) {
    var self = this;
    var joinObservers = [];
    for (var i = 0, len = this.expression.patterns.length; i < len; i++) {
      joinObservers.push(planCreateObserver(externalSubscriptions, this.expression.patterns[i], observer.onError.bind(observer)));
    }
    var activePlan = new ActivePlan(joinObservers, function () {
      var result;
      try {
        result = self.selector.apply(self, arguments);
      } catch (e) {
        observer.onError(e);
        return;
      }
      observer.onNext(result);
    }, function () {
      for (var j = 0, jlen = joinObservers.length; j < jlen; j++) {
        joinObservers[j].removeActivePlan(activePlan);
      }
      deactivate(activePlan);
    });
    for (i = 0, len = joinObservers.length; i < len; i++) {
      joinObservers[i].addActivePlan(activePlan);
    }
    return activePlan;
  };

  function planCreateObserver(externalSubscriptions, observable, onError) {
    var entry = externalSubscriptions.get(observable);
    if (!entry) {
      var observer = new JoinObserver(observable, onError);
      externalSubscriptions.set(observable, observer);
      return observer;
    }
    return entry;
  }

  function ActivePlan(joinObserverArray, onNext, onCompleted) {
    this.joinObserverArray = joinObserverArray;
    this.onNext = onNext;
    this.onCompleted = onCompleted;
    this.joinObservers = new Map();
    for (var i = 0, len = this.joinObserverArray.length; i < len; i++) {
      var joinObserver = this.joinObserverArray[i];
      this.joinObservers.set(joinObserver, joinObserver);
    }
  }

  ActivePlan.prototype.dequeue = function () {
    this.joinObservers.forEach(function (v) { v.queue.shift(); });
  };

  ActivePlan.prototype.match = function () {
    var i, len, hasValues = true;
    for (i = 0, len = this.joinObserverArray.length; i < len; i++) {
      if (this.joinObserverArray[i].queue.length === 0) {
        hasValues = false;
        break;
      }
    }
    if (hasValues) {
      var firstValues = [],
          isCompleted = false;
      for (i = 0, len = this.joinObserverArray.length; i < len; i++) {
        firstValues.push(this.joinObserverArray[i].queue[0]);
        this.joinObserverArray[i].queue[0].kind === 'C' && (isCompleted = true);
      }
      if (isCompleted) {
        this.onCompleted();
      } else {
        this.dequeue();
        var values = [];
        for (i = 0, len = firstValues.length; i < firstValues.length; i++) {
          values.push(firstValues[i].value);
        }
        this.onNext.apply(this, values);
      }
    }
  };

  var JoinObserver = (function (__super__) {
    inherits(JoinObserver, __super__);

    function JoinObserver(source, onError) {
      __super__.call(this);
      this.source = source;
      this.onError = onError;
      this.queue = [];
      this.activePlans = [];
      this.subscription = new SingleAssignmentDisposable();
      this.isDisposed = false;
    }

    var JoinObserverPrototype = JoinObserver.prototype;

    JoinObserverPrototype.next = function (notification) {
      if (!this.isDisposed) {
        if (notification.kind === 'E') {
          return this.onError(notification.exception);
        }
        this.queue.push(notification);
        var activePlans = this.activePlans.slice(0);
        for (var i = 0, len = activePlans.length; i < len; i++) {
          activePlans[i].match();
        }
      }
    };

    JoinObserverPrototype.error = noop;
    JoinObserverPrototype.completed = noop;

    JoinObserverPrototype.addActivePlan = function (activePlan) {
      this.activePlans.push(activePlan);
    };

    JoinObserverPrototype.subscribe = function () {
      this.subscription.setDisposable(this.source.materialize().subscribe(this));
    };

    JoinObserverPrototype.removeActivePlan = function (activePlan) {
      this.activePlans.splice(this.activePlans.indexOf(activePlan), 1);
      this.activePlans.length === 0 && this.dispose();
    };

    JoinObserverPrototype.dispose = function () {
      __super__.prototype.dispose.call(this);
      if (!this.isDisposed) {
        this.isDisposed = true;
        this.subscription.dispose();
      }
    };

    return JoinObserver;
  } (AbstractObserver));

  /**
   *  Creates a pattern that matches when both observable sequences have an available value.
   *
   *  @param right Observable sequence to match with the current sequence.
   *  @return {Pattern} Pattern object that matches when both observable sequences have an available value.
   */
  observableProto.and = function (right) {
    return new Pattern([this, right]);
  };

  /**
   *  Matches when the observable sequence has an available value and projects the value.
   *
   *  @param {Function} selector Selector that will be invoked for values in the source sequence.
   *  @returns {Plan} Plan that produces the projected values, to be fed (with other plans) to the when operator.
   */
  observableProto.thenDo = function (selector) {
    return new Pattern([this]).thenDo(selector);
  };

  /**
   *  Joins together the results from several patterns.
   *
   *  @param plans A series of plans (specified as an Array of as a series of arguments) created by use of the Then operator on patterns.
   *  @returns {Observable} Observable sequence with the results form matching several patterns.
   */
  Observable.when = function () {
    var len = arguments.length, plans;
    if (Array.isArray(arguments[0])) {
      plans = arguments[0];
    } else {
      plans = new Array(len);
      for(var i = 0; i < len; i++) { plans[i] = arguments[i]; }
    }
    return new AnonymousObservable(function (o) {
      var activePlans = [],
          externalSubscriptions = new Map();
      var outObserver = observerCreate(
        function (x) { o.onNext(x); },
        function (err) {
          externalSubscriptions.forEach(function (v) { v.onError(err); });
          o.onError(err);
        },
        function (x) { o.onCompleted(); }
      );
      try {
        for (var i = 0, len = plans.length; i < len; i++) {
          activePlans.push(plans[i].activate(externalSubscriptions, outObserver, function (activePlan) {
            var idx = activePlans.indexOf(activePlan);
            activePlans.splice(idx, 1);
            activePlans.length === 0 && o.onCompleted();
          }));
        }
      } catch (e) {
        observableThrow(e).subscribe(o);
      }
      var group = new CompositeDisposable();
      externalSubscriptions.forEach(function (joinObserver) {
        joinObserver.subscribe();
        group.add(joinObserver);
      });

      return group;
    });
  };

  function observableTimerDate(dueTime, scheduler) {
    return new AnonymousObservable(function (observer) {
      return scheduler.scheduleWithAbsolute(dueTime, function () {
        observer.onNext(0);
        observer.onCompleted();
      });
    });
  }

  function observableTimerDateAndPeriod(dueTime, period, scheduler) {
    return new AnonymousObservable(function (observer) {
      var d = dueTime, p = normalizeTime(period);
      return scheduler.scheduleRecursiveWithAbsoluteAndState(0, d, function (count, self) {
        if (p > 0) {
          var now = scheduler.now();
          d = d + p;
          d <= now && (d = now + p);
        }
        observer.onNext(count);
        self(count + 1, d);
      });
    });
  }

  function observableTimerTimeSpan(dueTime, scheduler) {
    return new AnonymousObservable(function (observer) {
      return scheduler.scheduleWithRelative(normalizeTime(dueTime), function () {
        observer.onNext(0);
        observer.onCompleted();
      });
    });
  }

  function observableTimerTimeSpanAndPeriod(dueTime, period, scheduler) {
    return dueTime === period ?
      new AnonymousObservable(function (observer) {
        return scheduler.schedulePeriodicWithState(0, period, function (count) {
          observer.onNext(count);
          return count + 1;
        });
      }) :
      observableDefer(function () {
        return observableTimerDateAndPeriod(scheduler.now() + dueTime, period, scheduler);
      });
  }

  /**
   *  Returns an observable sequence that produces a value after each period.
   *
   * @example
   *  1 - res = Rx.Observable.interval(1000);
   *  2 - res = Rx.Observable.interval(1000, Rx.Scheduler.timeout);
   *
   * @param {Number} period Period for producing the values in the resulting sequence (specified as an integer denoting milliseconds).
   * @param {Scheduler} [scheduler] Scheduler to run the timer on. If not specified, Rx.Scheduler.timeout is used.
   * @returns {Observable} An observable sequence that produces a value after each period.
   */
  var observableinterval = Observable.interval = function (period, scheduler) {
    return observableTimerTimeSpanAndPeriod(period, period, isScheduler(scheduler) ? scheduler : timeoutScheduler);
  };

  /**
   *  Returns an observable sequence that produces a value after dueTime has elapsed and then after each period.
   * @param {Number} dueTime Absolute (specified as a Date object) or relative time (specified as an integer denoting milliseconds) at which to produce the first value.
   * @param {Mixed} [periodOrScheduler]  Period to produce subsequent values (specified as an integer denoting milliseconds), or the scheduler to run the timer on. If not specified, the resulting timer is not recurring.
   * @param {Scheduler} [scheduler]  Scheduler to run the timer on. If not specified, the timeout scheduler is used.
   * @returns {Observable} An observable sequence that produces a value after due time has elapsed and then each period.
   */
  var observableTimer = Observable.timer = function (dueTime, periodOrScheduler, scheduler) {
    var period;
    isScheduler(scheduler) || (scheduler = timeoutScheduler);
    if (periodOrScheduler !== undefined && typeof periodOrScheduler === 'number') {
      period = periodOrScheduler;
    } else if (isScheduler(periodOrScheduler)) {
      scheduler = periodOrScheduler;
    }
    if (dueTime instanceof Date && period === undefined) {
      return observableTimerDate(dueTime.getTime(), scheduler);
    }
    if (dueTime instanceof Date && period !== undefined) {
      period = periodOrScheduler;
      return observableTimerDateAndPeriod(dueTime.getTime(), period, scheduler);
    }
    return period === undefined ?
      observableTimerTimeSpan(dueTime, scheduler) :
      observableTimerTimeSpanAndPeriod(dueTime, period, scheduler);
  };

  function observableDelayTimeSpan(source, dueTime, scheduler) {
    return new AnonymousObservable(function (observer) {
      var active = false,
        cancelable = new SerialDisposable(),
        exception = null,
        q = [],
        running = false,
        subscription;
      subscription = source.materialize().timestamp(scheduler).subscribe(function (notification) {
        var d, shouldRun;
        if (notification.value.kind === 'E') {
          q = [];
          q.push(notification);
          exception = notification.value.exception;
          shouldRun = !running;
        } else {
          q.push({ value: notification.value, timestamp: notification.timestamp + dueTime });
          shouldRun = !active;
          active = true;
        }
        if (shouldRun) {
          if (exception !== null) {
            observer.onError(exception);
          } else {
            d = new SingleAssignmentDisposable();
            cancelable.setDisposable(d);
            d.setDisposable(scheduler.scheduleRecursiveWithRelative(dueTime, function (self) {
              var e, recurseDueTime, result, shouldRecurse;
              if (exception !== null) {
                return;
              }
              running = true;
              do {
                result = null;
                if (q.length > 0 && q[0].timestamp - scheduler.now() <= 0) {
                  result = q.shift().value;
                }
                if (result !== null) {
                  result.accept(observer);
                }
              } while (result !== null);
              shouldRecurse = false;
              recurseDueTime = 0;
              if (q.length > 0) {
                shouldRecurse = true;
                recurseDueTime = Math.max(0, q[0].timestamp - scheduler.now());
              } else {
                active = false;
              }
              e = exception;
              running = false;
              if (e !== null) {
                observer.onError(e);
              } else if (shouldRecurse) {
                self(recurseDueTime);
              }
            }));
          }
        }
      });
      return new CompositeDisposable(subscription, cancelable);
    }, source);
  }

  function observableDelayDate(source, dueTime, scheduler) {
    return observableDefer(function () {
      return observableDelayTimeSpan(source, dueTime - scheduler.now(), scheduler);
    });
  }

  /**
   *  Time shifts the observable sequence by dueTime. The relative time intervals between the values are preserved.
   *
   * @example
   *  1 - res = Rx.Observable.delay(new Date());
   *  2 - res = Rx.Observable.delay(new Date(), Rx.Scheduler.timeout);
   *
   *  3 - res = Rx.Observable.delay(5000);
   *  4 - res = Rx.Observable.delay(5000, 1000, Rx.Scheduler.timeout);
   * @memberOf Observable#
   * @param {Number} dueTime Absolute (specified as a Date object) or relative time (specified as an integer denoting milliseconds) by which to shift the observable sequence.
   * @param {Scheduler} [scheduler] Scheduler to run the delay timers on. If not specified, the timeout scheduler is used.
   * @returns {Observable} Time-shifted sequence.
   */
  observableProto.delay = function (dueTime, scheduler) {
    isScheduler(scheduler) || (scheduler = timeoutScheduler);
    return dueTime instanceof Date ?
      observableDelayDate(this, dueTime.getTime(), scheduler) :
      observableDelayTimeSpan(this, dueTime, scheduler);
  };

  /**
   *  Ignores values from an observable sequence which are followed by another value before dueTime.
   * @param {Number} dueTime Duration of the debounce period for each value (specified as an integer denoting milliseconds).
   * @param {Scheduler} [scheduler]  Scheduler to run the debounce timers on. If not specified, the timeout scheduler is used.
   * @returns {Observable} The debounced sequence.
   */
  observableProto.debounce = observableProto.throttleWithTimeout = function (dueTime, scheduler) {
    isScheduler(scheduler) || (scheduler = timeoutScheduler);
    var source = this;
    return new AnonymousObservable(function (observer) {
      var cancelable = new SerialDisposable(), hasvalue = false, value, id = 0;
      var subscription = source.subscribe(
        function (x) {
          hasvalue = true;
          value = x;
          id++;
          var currentId = id,
            d = new SingleAssignmentDisposable();
          cancelable.setDisposable(d);
          d.setDisposable(scheduler.scheduleWithRelative(dueTime, function () {
            hasvalue && id === currentId && observer.onNext(value);
            hasvalue = false;
          }));
        },
        function (e) {
          cancelable.dispose();
          observer.onError(e);
          hasvalue = false;
          id++;
        },
        function () {
          cancelable.dispose();
          hasvalue && observer.onNext(value);
          observer.onCompleted();
          hasvalue = false;
          id++;
        });
      return new CompositeDisposable(subscription, cancelable);
    }, this);
  };

  /**
   * @deprecated use #debounce or #throttleWithTimeout instead.
   */
  observableProto.throttle = function(dueTime, scheduler) {
    //deprecate('throttle', 'debounce or throttleWithTimeout');
    return this.debounce(dueTime, scheduler);
  };

  /**
   *  Projects each element of an observable sequence into zero or more windows which are produced based on timing information.
   * @param {Number} timeSpan Length of each window (specified as an integer denoting milliseconds).
   * @param {Mixed} [timeShiftOrScheduler]  Interval between creation of consecutive windows (specified as an integer denoting milliseconds), or an optional scheduler parameter. If not specified, the time shift corresponds to the timeSpan parameter, resulting in non-overlapping adjacent windows.
   * @param {Scheduler} [scheduler]  Scheduler to run windowing timers on. If not specified, the timeout scheduler is used.
   * @returns {Observable} An observable sequence of windows.
   */
  observableProto.windowWithTime = function (timeSpan, timeShiftOrScheduler, scheduler) {
    var source = this, timeShift;
    timeShiftOrScheduler == null && (timeShift = timeSpan);
    isScheduler(scheduler) || (scheduler = timeoutScheduler);
    if (typeof timeShiftOrScheduler === 'number') {
      timeShift = timeShiftOrScheduler;
    } else if (isScheduler(timeShiftOrScheduler)) {
      timeShift = timeSpan;
      scheduler = timeShiftOrScheduler;
    }
    return new AnonymousObservable(function (observer) {
      var groupDisposable,
        nextShift = timeShift,
        nextSpan = timeSpan,
        q = [],
        refCountDisposable,
        timerD = new SerialDisposable(),
        totalTime = 0;
        groupDisposable = new CompositeDisposable(timerD),
        refCountDisposable = new RefCountDisposable(groupDisposable);

       function createTimer () {
        var m = new SingleAssignmentDisposable(),
          isSpan = false,
          isShift = false;
        timerD.setDisposable(m);
        if (nextSpan === nextShift) {
          isSpan = true;
          isShift = true;
        } else if (nextSpan < nextShift) {
            isSpan = true;
        } else {
          isShift = true;
        }
        var newTotalTime = isSpan ? nextSpan : nextShift,
          ts = newTotalTime - totalTime;
        totalTime = newTotalTime;
        if (isSpan) {
          nextSpan += timeShift;
        }
        if (isShift) {
          nextShift += timeShift;
        }
        m.setDisposable(scheduler.scheduleWithRelative(ts, function () {
          if (isShift) {
            var s = new Subject();
            q.push(s);
            observer.onNext(addRef(s, refCountDisposable));
          }
          isSpan && q.shift().onCompleted();
          createTimer();
        }));
      };
      q.push(new Subject());
      observer.onNext(addRef(q[0], refCountDisposable));
      createTimer();
      groupDisposable.add(source.subscribe(
        function (x) {
          for (var i = 0, len = q.length; i < len; i++) { q[i].onNext(x); }
        },
        function (e) {
          for (var i = 0, len = q.length; i < len; i++) { q[i].onError(e); }
          observer.onError(e);
        },
        function () {
          for (var i = 0, len = q.length; i < len; i++) { q[i].onCompleted(); }
          observer.onCompleted();
        }
      ));
      return refCountDisposable;
    }, source);
  };

  /**
   *  Projects each element of an observable sequence into a window that is completed when either it's full or a given amount of time has elapsed.
   * @param {Number} timeSpan Maximum time length of a window.
   * @param {Number} count Maximum element count of a window.
   * @param {Scheduler} [scheduler]  Scheduler to run windowing timers on. If not specified, the timeout scheduler is used.
   * @returns {Observable} An observable sequence of windows.
   */
  observableProto.windowWithTimeOrCount = function (timeSpan, count, scheduler) {
    var source = this;
    isScheduler(scheduler) || (scheduler = timeoutScheduler);
    return new AnonymousObservable(function (observer) {
      var timerD = new SerialDisposable(),
          groupDisposable = new CompositeDisposable(timerD),
          refCountDisposable = new RefCountDisposable(groupDisposable),
          n = 0,
          windowId = 0,
          s = new Subject();

      function createTimer(id) {
        var m = new SingleAssignmentDisposable();
        timerD.setDisposable(m);
        m.setDisposable(scheduler.scheduleWithRelative(timeSpan, function () {
          if (id !== windowId) { return; }
          n = 0;
          var newId = ++windowId;
          s.onCompleted();
          s = new Subject();
          observer.onNext(addRef(s, refCountDisposable));
          createTimer(newId);
        }));
      }

      observer.onNext(addRef(s, refCountDisposable));
      createTimer(0);

      groupDisposable.add(source.subscribe(
        function (x) {
          var newId = 0, newWindow = false;
          s.onNext(x);
          if (++n === count) {
            newWindow = true;
            n = 0;
            newId = ++windowId;
            s.onCompleted();
            s = new Subject();
            observer.onNext(addRef(s, refCountDisposable));
          }
          newWindow && createTimer(newId);
        },
        function (e) {
          s.onError(e);
          observer.onError(e);
        }, function () {
          s.onCompleted();
          observer.onCompleted();
        }
      ));
      return refCountDisposable;
    }, source);
  };

    /**
     *  Projects each element of an observable sequence into zero or more buffers which are produced based on timing information.
     *
     * @example
     *  1 - res = xs.bufferWithTime(1000, scheduler); // non-overlapping segments of 1 second
     *  2 - res = xs.bufferWithTime(1000, 500, scheduler; // segments of 1 second with time shift 0.5 seconds
     *
     * @param {Number} timeSpan Length of each buffer (specified as an integer denoting milliseconds).
     * @param {Mixed} [timeShiftOrScheduler]  Interval between creation of consecutive buffers (specified as an integer denoting milliseconds), or an optional scheduler parameter. If not specified, the time shift corresponds to the timeSpan parameter, resulting in non-overlapping adjacent buffers.
     * @param {Scheduler} [scheduler]  Scheduler to run buffer timers on. If not specified, the timeout scheduler is used.
     * @returns {Observable} An observable sequence of buffers.
     */
    observableProto.bufferWithTime = function (timeSpan, timeShiftOrScheduler, scheduler) {
        return this.windowWithTime.apply(this, arguments).selectMany(function (x) { return x.toArray(); });
    };

    /**
     *  Projects each element of an observable sequence into a buffer that is completed when either it's full or a given amount of time has elapsed.
     *
     * @example
     *  1 - res = source.bufferWithTimeOrCount(5000, 50); // 5s or 50 items in an array
     *  2 - res = source.bufferWithTimeOrCount(5000, 50, scheduler); // 5s or 50 items in an array
     *
     * @param {Number} timeSpan Maximum time length of a buffer.
     * @param {Number} count Maximum element count of a buffer.
     * @param {Scheduler} [scheduler]  Scheduler to run bufferin timers on. If not specified, the timeout scheduler is used.
     * @returns {Observable} An observable sequence of buffers.
     */
    observableProto.bufferWithTimeOrCount = function (timeSpan, count, scheduler) {
        return this.windowWithTimeOrCount(timeSpan, count, scheduler).selectMany(function (x) {
            return x.toArray();
        });
    };

  /**
   *  Records the time interval between consecutive values in an observable sequence.
   *
   * @example
   *  1 - res = source.timeInterval();
   *  2 - res = source.timeInterval(Rx.Scheduler.timeout);
   *
   * @param [scheduler]  Scheduler used to compute time intervals. If not specified, the timeout scheduler is used.
   * @returns {Observable} An observable sequence with time interval information on values.
   */
  observableProto.timeInterval = function (scheduler) {
    var source = this;
    isScheduler(scheduler) || (scheduler = timeoutScheduler);
    return observableDefer(function () {
      var last = scheduler.now();
      return source.map(function (x) {
        var now = scheduler.now(), span = now - last;
        last = now;
        return { value: x, interval: span };
      });
    });
  };

  /**
   *  Records the timestamp for each value in an observable sequence.
   *
   * @example
   *  1 - res = source.timestamp(); // produces { value: x, timestamp: ts }
   *  2 - res = source.timestamp(Rx.Scheduler.timeout);
   *
   * @param {Scheduler} [scheduler]  Scheduler used to compute timestamps. If not specified, the timeout scheduler is used.
   * @returns {Observable} An observable sequence with timestamp information on values.
   */
  observableProto.timestamp = function (scheduler) {
    isScheduler(scheduler) || (scheduler = timeoutScheduler);
    return this.map(function (x) {
      return { value: x, timestamp: scheduler.now() };
    });
  };

  function sampleObservable(source, sampler) {
    return new AnonymousObservable(function (observer) {
      var atEnd, value, hasValue;

      function sampleSubscribe() {
        if (hasValue) {
          hasValue = false;
          observer.onNext(value);
        }
        atEnd && observer.onCompleted();
      }

      return new CompositeDisposable(
        source.subscribe(function (newValue) {
          hasValue = true;
          value = newValue;
        }, observer.onError.bind(observer), function () {
          atEnd = true;
        }),
        sampler.subscribe(sampleSubscribe, observer.onError.bind(observer), sampleSubscribe)
      );
    }, source);
  }

  /**
   *  Samples the observable sequence at each interval.
   *
   * @example
   *  1 - res = source.sample(sampleObservable); // Sampler tick sequence
   *  2 - res = source.sample(5000); // 5 seconds
   *  2 - res = source.sample(5000, Rx.Scheduler.timeout); // 5 seconds
   *
   * @param {Mixed} intervalOrSampler Interval at which to sample (specified as an integer denoting milliseconds) or Sampler Observable.
   * @param {Scheduler} [scheduler]  Scheduler to run the sampling timer on. If not specified, the timeout scheduler is used.
   * @returns {Observable} Sampled observable sequence.
   */
  observableProto.sample = observableProto.throttleLatest = function (intervalOrSampler, scheduler) {
    isScheduler(scheduler) || (scheduler = timeoutScheduler);
    return typeof intervalOrSampler === 'number' ?
      sampleObservable(this, observableinterval(intervalOrSampler, scheduler)) :
      sampleObservable(this, intervalOrSampler);
  };

  /**
   *  Returns the source observable sequence or the other observable sequence if dueTime elapses.
   * @param {Number} dueTime Absolute (specified as a Date object) or relative time (specified as an integer denoting milliseconds) when a timeout occurs.
   * @param {Observable} [other]  Sequence to return in case of a timeout. If not specified, a timeout error throwing sequence will be used.
   * @param {Scheduler} [scheduler]  Scheduler to run the timeout timers on. If not specified, the timeout scheduler is used.
   * @returns {Observable} The source sequence switching to the other sequence in case of a timeout.
   */
  observableProto.timeout = function (dueTime, other, scheduler) {
    (other == null || typeof other === 'string') && (other = observableThrow(new Error(other || 'Timeout')));
    isScheduler(scheduler) || (scheduler = timeoutScheduler);

    var source = this, schedulerMethod = dueTime instanceof Date ?
      'scheduleWithAbsolute' :
      'scheduleWithRelative';

    return new AnonymousObservable(function (observer) {
      var id = 0,
        original = new SingleAssignmentDisposable(),
        subscription = new SerialDisposable(),
        switched = false,
        timer = new SerialDisposable();

      subscription.setDisposable(original);

      function createTimer() {
        var myId = id;
        timer.setDisposable(scheduler[schedulerMethod](dueTime, function () {
          if (id === myId) {
            isPromise(other) && (other = observableFromPromise(other));
            subscription.setDisposable(other.subscribe(observer));
          }
        }));
      }

      createTimer();

      original.setDisposable(source.subscribe(function (x) {
        if (!switched) {
          id++;
          observer.onNext(x);
          createTimer();
        }
      }, function (e) {
        if (!switched) {
          id++;
          observer.onError(e);
        }
      }, function () {
        if (!switched) {
          id++;
          observer.onCompleted();
        }
      }));
      return new CompositeDisposable(subscription, timer);
    }, source);
  };

  /**
   *  Generates an observable sequence by iterating a state from an initial state until the condition fails.
   *
   * @example
   *  res = source.generateWithAbsoluteTime(0,
   *      function (x) { return return true; },
   *      function (x) { return x + 1; },
   *      function (x) { return x; },
   *      function (x) { return new Date(); }
   *  });
   *
   * @param {Mixed} initialState Initial state.
   * @param {Function} condition Condition to terminate generation (upon returning false).
   * @param {Function} iterate Iteration step function.
   * @param {Function} resultSelector Selector function for results produced in the sequence.
   * @param {Function} timeSelector Time selector function to control the speed of values being produced each iteration, returning Date values.
   * @param {Scheduler} [scheduler]  Scheduler on which to run the generator loop. If not specified, the timeout scheduler is used.
   * @returns {Observable} The generated sequence.
   */
  Observable.generateWithAbsoluteTime = function (initialState, condition, iterate, resultSelector, timeSelector, scheduler) {
    isScheduler(scheduler) || (scheduler = timeoutScheduler);
    return new AnonymousObservable(function (observer) {
      var first = true,
        hasResult = false,
        result,
        state = initialState,
        time;
      return scheduler.scheduleRecursiveWithAbsolute(scheduler.now(), function (self) {
        hasResult && observer.onNext(result);

        try {
          if (first) {
            first = false;
          } else {
            state = iterate(state);
          }
          hasResult = condition(state);
          if (hasResult) {
            result = resultSelector(state);
            time = timeSelector(state);
          }
        } catch (e) {
          observer.onError(e);
          return;
        }
        if (hasResult) {
          self(time);
        } else {
          observer.onCompleted();
        }
      });
    });
  };

  /**
   *  Generates an observable sequence by iterating a state from an initial state until the condition fails.
   *
   * @example
   *  res = source.generateWithRelativeTime(0,
   *      function (x) { return return true; },
   *      function (x) { return x + 1; },
   *      function (x) { return x; },
   *      function (x) { return 500; }
   *  );
   *
   * @param {Mixed} initialState Initial state.
   * @param {Function} condition Condition to terminate generation (upon returning false).
   * @param {Function} iterate Iteration step function.
   * @param {Function} resultSelector Selector function for results produced in the sequence.
   * @param {Function} timeSelector Time selector function to control the speed of values being produced each iteration, returning integer values denoting milliseconds.
   * @param {Scheduler} [scheduler]  Scheduler on which to run the generator loop. If not specified, the timeout scheduler is used.
   * @returns {Observable} The generated sequence.
   */
  Observable.generateWithRelativeTime = function (initialState, condition, iterate, resultSelector, timeSelector, scheduler) {
    isScheduler(scheduler) || (scheduler = timeoutScheduler);
    return new AnonymousObservable(function (observer) {
      var first = true,
        hasResult = false,
        result,
        state = initialState,
        time;
      return scheduler.scheduleRecursiveWithRelative(0, function (self) {
        hasResult && observer.onNext(result);

        try {
          if (first) {
            first = false;
          } else {
            state = iterate(state);
          }
          hasResult = condition(state);
          if (hasResult) {
            result = resultSelector(state);
            time = timeSelector(state);
          }
        } catch (e) {
          observer.onError(e);
          return;
        }
        if (hasResult) {
          self(time);
        } else {
          observer.onCompleted();
        }
      });
    });
  };

  /**
   *  Time shifts the observable sequence by delaying the subscription.
   *
   * @example
   *  1 - res = source.delaySubscription(5000); // 5s
   *  2 - res = source.delaySubscription(5000, Rx.Scheduler.timeout); // 5 seconds
   *
   * @param {Number} dueTime Absolute or relative time to perform the subscription at.
   * @param {Scheduler} [scheduler]  Scheduler to run the subscription delay timer on. If not specified, the timeout scheduler is used.
   * @returns {Observable} Time-shifted sequence.
   */
  observableProto.delaySubscription = function (dueTime, scheduler) {
    return this.delayWithSelector(observableTimer(dueTime, isScheduler(scheduler) ? scheduler : timeoutScheduler), observableEmpty);
  };

  /**
   *  Time shifts the observable sequence based on a subscription delay and a delay selector function for each element.
   *
   * @example
   *  1 - res = source.delayWithSelector(function (x) { return Rx.Scheduler.timer(5000); }); // with selector only
   *  1 - res = source.delayWithSelector(Rx.Observable.timer(2000), function (x) { return Rx.Observable.timer(x); }); // with delay and selector
   *
   * @param {Observable} [subscriptionDelay]  Sequence indicating the delay for the subscription to the source.
   * @param {Function} delayDurationSelector Selector function to retrieve a sequence indicating the delay for each given element.
   * @returns {Observable} Time-shifted sequence.
   */
  observableProto.delayWithSelector = function (subscriptionDelay, delayDurationSelector) {
      var source = this, subDelay, selector;
      if (typeof subscriptionDelay === 'function') {
        selector = subscriptionDelay;
      } else {
        subDelay = subscriptionDelay;
        selector = delayDurationSelector;
      }
      return new AnonymousObservable(function (observer) {
        var delays = new CompositeDisposable(), atEnd = false, done = function () {
            if (atEnd && delays.length === 0) { observer.onCompleted(); }
        }, subscription = new SerialDisposable(), start = function () {
          subscription.setDisposable(source.subscribe(function (x) {
              var delay;
              try {
                delay = selector(x);
              } catch (error) {
                observer.onError(error);
                return;
              }
              var d = new SingleAssignmentDisposable();
              delays.add(d);
              d.setDisposable(delay.subscribe(function () {
                observer.onNext(x);
                delays.remove(d);
                done();
              }, observer.onError.bind(observer), function () {
                observer.onNext(x);
                delays.remove(d);
                done();
              }));
          }, observer.onError.bind(observer), function () {
            atEnd = true;
            subscription.dispose();
            done();
          }));
      };

      if (!subDelay) {
        start();
      } else {
        subscription.setDisposable(subDelay.subscribe(start, observer.onError.bind(observer), start));
      }

      return new CompositeDisposable(subscription, delays);
    }, this);
  };

    /**
     *  Returns the source observable sequence, switching to the other observable sequence if a timeout is signaled.
     * @param {Observable} [firstTimeout]  Observable sequence that represents the timeout for the first element. If not provided, this defaults to Observable.never().
     * @param {Function} timeoutDurationSelector Selector to retrieve an observable sequence that represents the timeout between the current element and the next element.
     * @param {Observable} [other]  Sequence to return in case of a timeout. If not provided, this is set to Observable.throwException().
     * @returns {Observable} The source sequence switching to the other sequence in case of a timeout.
     */
    observableProto.timeoutWithSelector = function (firstTimeout, timeoutdurationSelector, other) {
      if (arguments.length === 1) {
          timeoutdurationSelector = firstTimeout;
          firstTimeout = observableNever();
      }
      other || (other = observableThrow(new Error('Timeout')));
      var source = this;
      return new AnonymousObservable(function (observer) {
        var subscription = new SerialDisposable(), timer = new SerialDisposable(), original = new SingleAssignmentDisposable();

        subscription.setDisposable(original);

        var id = 0, switched = false;

        function setTimer(timeout) {
          var myId = id;

          function timerWins () {
            return id === myId;
          }

          var d = new SingleAssignmentDisposable();
          timer.setDisposable(d);
          d.setDisposable(timeout.subscribe(function () {
            timerWins() && subscription.setDisposable(other.subscribe(observer));
            d.dispose();
          }, function (e) {
            timerWins() && observer.onError(e);
          }, function () {
            timerWins() && subscription.setDisposable(other.subscribe(observer));
          }));
        };

        setTimer(firstTimeout);

        function observerWins() {
          var res = !switched;
          if (res) { id++; }
          return res;
        }

        original.setDisposable(source.subscribe(function (x) {
          if (observerWins()) {
            observer.onNext(x);
            var timeout;
            try {
              timeout = timeoutdurationSelector(x);
            } catch (e) {
              observer.onError(e);
              return;
            }
            setTimer(isPromise(timeout) ? observableFromPromise(timeout) : timeout);
          }
        }, function (e) {
          observerWins() && observer.onError(e);
        }, function () {
          observerWins() && observer.onCompleted();
        }));
        return new CompositeDisposable(subscription, timer);
      }, source);
    };

  /**
   * Ignores values from an observable sequence which are followed by another value within a computed throttle duration.
   * @param {Function} durationSelector Selector function to retrieve a sequence indicating the throttle duration for each given element.
   * @returns {Observable} The debounced sequence.
   */
  observableProto.debounceWithSelector = function (durationSelector) {
    var source = this;
    return new AnonymousObservable(function (observer) {
      var value, hasValue = false, cancelable = new SerialDisposable(), id = 0;
      var subscription = source.subscribe(function (x) {
        var throttle;
        try {
          throttle = durationSelector(x);
        } catch (e) {
          observer.onError(e);
          return;
        }

        isPromise(throttle) && (throttle = observableFromPromise(throttle));

        hasValue = true;
        value = x;
        id++;
        var currentid = id, d = new SingleAssignmentDisposable();
        cancelable.setDisposable(d);
        d.setDisposable(throttle.subscribe(function () {
          hasValue && id === currentid && observer.onNext(value);
          hasValue = false;
          d.dispose();
        }, observer.onError.bind(observer), function () {
          hasValue && id === currentid && observer.onNext(value);
          hasValue = false;
          d.dispose();
        }));
      }, function (e) {
        cancelable.dispose();
        observer.onError(e);
        hasValue = false;
        id++;
      }, function () {
        cancelable.dispose();
        hasValue && observer.onNext(value);
        observer.onCompleted();
        hasValue = false;
        id++;
      });
      return new CompositeDisposable(subscription, cancelable);
    }, source);
  };

  /**
   * @deprecated use #debounceWithSelector instead.
   */
  observableProto.throttleWithSelector = function (durationSelector) {
    //deprecate('throttleWithSelector', 'debounceWithSelector');
    return this.debounceWithSelector(durationSelector);
  };

  /**
   *  Skips elements for the specified duration from the end of the observable source sequence, using the specified scheduler to run timers.
   *
   *  1 - res = source.skipLastWithTime(5000);
   *  2 - res = source.skipLastWithTime(5000, scheduler);
   *
   * @description
   *  This operator accumulates a queue with a length enough to store elements received during the initial duration window.
   *  As more elements are received, elements older than the specified duration are taken from the queue and produced on the
   *  result sequence. This causes elements to be delayed with duration.
   * @param {Number} duration Duration for skipping elements from the end of the sequence.
   * @param {Scheduler} [scheduler]  Scheduler to run the timer on. If not specified, defaults to Rx.Scheduler.timeout
   * @returns {Observable} An observable sequence with the elements skipped during the specified duration from the end of the source sequence.
   */
  observableProto.skipLastWithTime = function (duration, scheduler) {
    isScheduler(scheduler) || (scheduler = timeoutScheduler);
    var source = this;
    return new AnonymousObservable(function (o) {
      var q = [];
      return source.subscribe(function (x) {
        var now = scheduler.now();
        q.push({ interval: now, value: x });
        while (q.length > 0 && now - q[0].interval >= duration) {
          o.onNext(q.shift().value);
        }
      }, function (e) { o.onError(e); }, function () {
        var now = scheduler.now();
        while (q.length > 0 && now - q[0].interval >= duration) {
          o.onNext(q.shift().value);
        }
        o.onCompleted();
      });
    }, source);
  };

  /**
   *  Returns elements within the specified duration from the end of the observable source sequence, using the specified schedulers to run timers and to drain the collected elements.
   * @description
   *  This operator accumulates a queue with a length enough to store elements received during the initial duration window.
   *  As more elements are received, elements older than the specified duration are taken from the queue and produced on the
   *  result sequence. This causes elements to be delayed with duration.
   * @param {Number} duration Duration for taking elements from the end of the sequence.
   * @param {Scheduler} [scheduler]  Scheduler to run the timer on. If not specified, defaults to Rx.Scheduler.timeout.
   * @returns {Observable} An observable sequence with the elements taken during the specified duration from the end of the source sequence.
   */
  observableProto.takeLastWithTime = function (duration, scheduler) {
    var source = this;
    isScheduler(scheduler) || (scheduler = timeoutScheduler);
    return new AnonymousObservable(function (o) {
      var q = [];
      return source.subscribe(function (x) {
        var now = scheduler.now();
        q.push({ interval: now, value: x });
        while (q.length > 0 && now - q[0].interval >= duration) {
          q.shift();
        }
      }, function (e) { o.onError(e); }, function () {
        var now = scheduler.now();
        while (q.length > 0) {
          var next = q.shift();
          if (now - next.interval <= duration) { o.onNext(next.value); }
        }
        o.onCompleted();
      });
    }, source);
  };

  /**
   *  Returns an array with the elements within the specified duration from the end of the observable source sequence, using the specified scheduler to run timers.
   * @description
   *  This operator accumulates a queue with a length enough to store elements received during the initial duration window.
   *  As more elements are received, elements older than the specified duration are taken from the queue and produced on the
   *  result sequence. This causes elements to be delayed with duration.
   * @param {Number} duration Duration for taking elements from the end of the sequence.
   * @param {Scheduler} scheduler Scheduler to run the timer on. If not specified, defaults to Rx.Scheduler.timeout.
   * @returns {Observable} An observable sequence containing a single array with the elements taken during the specified duration from the end of the source sequence.
   */
  observableProto.takeLastBufferWithTime = function (duration, scheduler) {
    var source = this;
    isScheduler(scheduler) || (scheduler = timeoutScheduler);
    return new AnonymousObservable(function (o) {
      var q = [];
      return source.subscribe(function (x) {
        var now = scheduler.now();
        q.push({ interval: now, value: x });
        while (q.length > 0 && now - q[0].interval >= duration) {
          q.shift();
        }
      }, function (e) { o.onError(e); }, function () {
        var now = scheduler.now(), res = [];
        while (q.length > 0) {
          var next = q.shift();
          now - next.interval <= duration && res.push(next.value);
        }
        o.onNext(res);
        o.onCompleted();
      });
    }, source);
  };

  /**
   *  Takes elements for the specified duration from the start of the observable source sequence, using the specified scheduler to run timers.
   *
   * @example
   *  1 - res = source.takeWithTime(5000,  [optional scheduler]);
   * @description
   *  This operator accumulates a queue with a length enough to store elements received during the initial duration window.
   *  As more elements are received, elements older than the specified duration are taken from the queue and produced on the
   *  result sequence. This causes elements to be delayed with duration.
   * @param {Number} duration Duration for taking elements from the start of the sequence.
   * @param {Scheduler} scheduler Scheduler to run the timer on. If not specified, defaults to Rx.Scheduler.timeout.
   * @returns {Observable} An observable sequence with the elements taken during the specified duration from the start of the source sequence.
   */
  observableProto.takeWithTime = function (duration, scheduler) {
    var source = this;
    isScheduler(scheduler) || (scheduler = timeoutScheduler);
    return new AnonymousObservable(function (o) {
      return new CompositeDisposable(scheduler.scheduleWithRelative(duration, function () { o.onCompleted(); }), source.subscribe(o));
    }, source);
  };

  /**
   *  Skips elements for the specified duration from the start of the observable source sequence, using the specified scheduler to run timers.
   *
   * @example
   *  1 - res = source.skipWithTime(5000, [optional scheduler]);
   *
   * @description
   *  Specifying a zero value for duration doesn't guarantee no elements will be dropped from the start of the source sequence.
   *  This is a side-effect of the asynchrony introduced by the scheduler, where the action that causes callbacks from the source sequence to be forwarded
   *  may not execute immediately, despite the zero due time.
   *
   *  Errors produced by the source sequence are always forwarded to the result sequence, even if the error occurs before the duration.
   * @param {Number} duration Duration for skipping elements from the start of the sequence.
   * @param {Scheduler} scheduler Scheduler to run the timer on. If not specified, defaults to Rx.Scheduler.timeout.
   * @returns {Observable} An observable sequence with the elements skipped during the specified duration from the start of the source sequence.
   */
  observableProto.skipWithTime = function (duration, scheduler) {
    var source = this;
    isScheduler(scheduler) || (scheduler = timeoutScheduler);
    return new AnonymousObservable(function (observer) {
      var open = false;
      return new CompositeDisposable(
        scheduler.scheduleWithRelative(duration, function () { open = true; }),
        source.subscribe(function (x) { open && observer.onNext(x); }, observer.onError.bind(observer), observer.onCompleted.bind(observer)));
    }, source);
  };

  /**
   *  Skips elements from the observable source sequence until the specified start time, using the specified scheduler to run timers.
   *  Errors produced by the source sequence are always forwarded to the result sequence, even if the error occurs before the start time.
   *
   * @examples
   *  1 - res = source.skipUntilWithTime(new Date(), [scheduler]);
   *  2 - res = source.skipUntilWithTime(5000, [scheduler]);
   * @param {Date|Number} startTime Time to start taking elements from the source sequence. If this value is less than or equal to Date(), no elements will be skipped.
   * @param {Scheduler} [scheduler] Scheduler to run the timer on. If not specified, defaults to Rx.Scheduler.timeout.
   * @returns {Observable} An observable sequence with the elements skipped until the specified start time.
   */
  observableProto.skipUntilWithTime = function (startTime, scheduler) {
    isScheduler(scheduler) || (scheduler = timeoutScheduler);
    var source = this, schedulerMethod = startTime instanceof Date ?
      'scheduleWithAbsolute' :
      'scheduleWithRelative';
    return new AnonymousObservable(function (o) {
      var open = false;

      return new CompositeDisposable(
        scheduler[schedulerMethod](startTime, function () { open = true; }),
        source.subscribe(
          function (x) { open && o.onNext(x); },
          function (e) { o.onError(e); }, function () { o.onCompleted(); }));
    }, source);
  };

  /**
   *  Takes elements for the specified duration until the specified end time, using the specified scheduler to run timers.
   * @param {Number | Date} endTime Time to stop taking elements from the source sequence. If this value is less than or equal to new Date(), the result stream will complete immediately.
   * @param {Scheduler} [scheduler] Scheduler to run the timer on.
   * @returns {Observable} An observable sequence with the elements taken until the specified end time.
   */
  observableProto.takeUntilWithTime = function (endTime, scheduler) {
    isScheduler(scheduler) || (scheduler = timeoutScheduler);
    var source = this, schedulerMethod = endTime instanceof Date ?
      'scheduleWithAbsolute' :
      'scheduleWithRelative';
    return new AnonymousObservable(function (o) {
      return new CompositeDisposable(
        scheduler[schedulerMethod](endTime, function () { o.onCompleted(); }),
        source.subscribe(o));
    }, source);
  };

  /**
   * Returns an Observable that emits only the first item emitted by the source Observable during sequential time windows of a specified duration.
   * @param {Number} windowDuration time to wait before emitting another item after emitting the last item
   * @param {Scheduler} [scheduler] the Scheduler to use internally to manage the timers that handle timeout for each item. If not provided, defaults to Scheduler.timeout.
   * @returns {Observable} An Observable that performs the throttle operation.
   */
  observableProto.throttleFirst = function (windowDuration, scheduler) {
    isScheduler(scheduler) || (scheduler = timeoutScheduler);
    var duration = +windowDuration || 0;
    if (duration <= 0) { throw new RangeError('windowDuration cannot be less or equal zero.'); }
    var source = this;
    return new AnonymousObservable(function (o) {
      var lastOnNext = 0;
      return source.subscribe(
        function (x) {
          var now = scheduler.now();
          if (lastOnNext === 0 || now - lastOnNext >= duration) {
            lastOnNext = now;
            o.onNext(x);
          }
        },function (e) { o.onError(e); }, function () { o.onCompleted(); }
      );
    }, source);
  };

  /**
   * Executes a transducer to transform the observable sequence
   * @param {Transducer} transducer A transducer to execute
   * @returns {Observable} An Observable sequence containing the results from the transducer.
   */
  observableProto.transduce = function(transducer) {
    var source = this;

    function transformForObserver(o) {
      return {
        '@@transducer/init': function() {
          return o;
        },
        '@@transducer/step': function(obs, input) {
          return obs.onNext(input);
        },
        '@@transducer/result': function(obs) {
          return obs.onCompleted();
        }
      };
    }

    return new AnonymousObservable(function(o) {
      var xform = transducer(transformForObserver(o));
      return source.subscribe(
        function(v) {
          try {
            xform['@@transducer/step'](o, v);
          } catch (e) {
            o.onError(e);
          }
        },
        function (e) { o.onError(e); },
        function() { xform['@@transducer/result'](o); }
      );
    }, source);
  };

  /*
   * Performs a exclusive waiting for the first to finish before subscribing to another observable.
   * Observables that come in between subscriptions will be dropped on the floor.
   * @returns {Observable} A exclusive observable with only the results that happen when subscribed.
   */
  observableProto.exclusive = function () {
    var sources = this;
    return new AnonymousObservable(function (observer) {
      var hasCurrent = false,
        isStopped = false,
        m = new SingleAssignmentDisposable(),
        g = new CompositeDisposable();

      g.add(m);

      m.setDisposable(sources.subscribe(
        function (innerSource) {
          if (!hasCurrent) {
            hasCurrent = true;

            isPromise(innerSource) && (innerSource = observableFromPromise(innerSource));

            var innerSubscription = new SingleAssignmentDisposable();
            g.add(innerSubscription);

            innerSubscription.setDisposable(innerSource.subscribe(
              observer.onNext.bind(observer),
              observer.onError.bind(observer),
              function () {
                g.remove(innerSubscription);
                hasCurrent = false;
                if (isStopped && g.length === 1) {
                  observer.onCompleted();
                }
            }));
          }
        },
        observer.onError.bind(observer),
        function () {
          isStopped = true;
          if (!hasCurrent && g.length === 1) {
            observer.onCompleted();
          }
        }));

      return g;
    }, this);
  };

  /*
   * Performs a exclusive map waiting for the first to finish before subscribing to another observable.
   * Observables that come in between subscriptions will be dropped on the floor.
   * @param {Function} selector Selector to invoke for every item in the current subscription.
   * @param {Any} [thisArg] An optional context to invoke with the selector parameter.
   * @returns {Observable} An exclusive observable with only the results that happen when subscribed.
   */
  observableProto.exclusiveMap = function (selector, thisArg) {
    var sources = this,
        selectorFunc = bindCallback(selector, thisArg, 3);
    return new AnonymousObservable(function (observer) {
      var index = 0,
        hasCurrent = false,
        isStopped = true,
        m = new SingleAssignmentDisposable(),
        g = new CompositeDisposable();

      g.add(m);

      m.setDisposable(sources.subscribe(
        function (innerSource) {

          if (!hasCurrent) {
            hasCurrent = true;

            innerSubscription = new SingleAssignmentDisposable();
            g.add(innerSubscription);

            isPromise(innerSource) && (innerSource = observableFromPromise(innerSource));

            innerSubscription.setDisposable(innerSource.subscribe(
              function (x) {
                var result;
                try {
                  result = selectorFunc(x, index++, innerSource);
                } catch (e) {
                  observer.onError(e);
                  return;
                }

                observer.onNext(result);
              },
              function (e) { observer.onError(e); },
              function () {
                g.remove(innerSubscription);
                hasCurrent = false;

                if (isStopped && g.length === 1) {
                  observer.onCompleted();
                }
              }));
          }
        },
        function (e) { observer.onError(e); },
        function () {
          isStopped = true;
          if (g.length === 1 && !hasCurrent) {
            observer.onCompleted();
          }
        }));
      return g;
    }, this);
  };

  /** Provides a set of extension methods for virtual time scheduling. */
  Rx.VirtualTimeScheduler = (function (__super__) {

    function localNow() {
      return this.toDateTimeOffset(this.clock);
    }

    function scheduleNow(state, action) {
      return this.scheduleAbsoluteWithState(state, this.clock, action);
    }

    function scheduleRelative(state, dueTime, action) {
      return this.scheduleRelativeWithState(state, this.toRelative(dueTime), action);
    }

    function scheduleAbsolute(state, dueTime, action) {
      return this.scheduleRelativeWithState(state, this.toRelative(dueTime - this.now()), action);
    }

    function invokeAction(scheduler, action) {
      action();
      return disposableEmpty;
    }

    inherits(VirtualTimeScheduler, __super__);

    /**
     * Creates a new virtual time scheduler with the specified initial clock value and absolute time comparer.
     *
     * @constructor
     * @param {Number} initialClock Initial value for the clock.
     * @param {Function} comparer Comparer to determine causality of events based on absolute time.
     */
    function VirtualTimeScheduler(initialClock, comparer) {
      this.clock = initialClock;
      this.comparer = comparer;
      this.isEnabled = false;
      this.queue = new PriorityQueue(1024);
      __super__.call(this, localNow, scheduleNow, scheduleRelative, scheduleAbsolute);
    }

    var VirtualTimeSchedulerPrototype = VirtualTimeScheduler.prototype;

    /**
     * Adds a relative time value to an absolute time value.
     * @param {Number} absolute Absolute virtual time value.
     * @param {Number} relative Relative virtual time value to add.
     * @return {Number} Resulting absolute virtual time sum value.
     */
    VirtualTimeSchedulerPrototype.add = notImplemented;

    /**
     * Converts an absolute time to a number
     * @param {Any} The absolute time.
     * @returns {Number} The absolute time in ms
     */
    VirtualTimeSchedulerPrototype.toDateTimeOffset = notImplemented;

    /**
     * Converts the TimeSpan value to a relative virtual time value.
     * @param {Number} timeSpan TimeSpan value to convert.
     * @return {Number} Corresponding relative virtual time value.
     */
    VirtualTimeSchedulerPrototype.toRelative = notImplemented;

    /**
     * Schedules a periodic piece of work by dynamically discovering the scheduler's capabilities. The periodic task will be emulated using recursive scheduling.
     * @param {Mixed} state Initial state passed to the action upon the first iteration.
     * @param {Number} period Period for running the work periodically.
     * @param {Function} action Action to be executed, potentially updating the state.
     * @returns {Disposable} The disposable object used to cancel the scheduled recurring action (best effort).
     */
    VirtualTimeSchedulerPrototype.schedulePeriodicWithState = function (state, period, action) {
      var s = new SchedulePeriodicRecursive(this, state, period, action);
      return s.start();
    };

    /**
     * Schedules an action to be executed after dueTime.
     * @param {Mixed} state State passed to the action to be executed.
     * @param {Number} dueTime Relative time after which to execute the action.
     * @param {Function} action Action to be executed.
     * @returns {Disposable} The disposable object used to cancel the scheduled action (best effort).
     */
    VirtualTimeSchedulerPrototype.scheduleRelativeWithState = function (state, dueTime, action) {
      var runAt = this.add(this.clock, dueTime);
      return this.scheduleAbsoluteWithState(state, runAt, action);
    };

    /**
     * Schedules an action to be executed at dueTime.
     * @param {Number} dueTime Relative time after which to execute the action.
     * @param {Function} action Action to be executed.
     * @returns {Disposable} The disposable object used to cancel the scheduled action (best effort).
     */
    VirtualTimeSchedulerPrototype.scheduleRelative = function (dueTime, action) {
      return this.scheduleRelativeWithState(action, dueTime, invokeAction);
    };

    /**
     * Starts the virtual time scheduler.
     */
    VirtualTimeSchedulerPrototype.start = function () {
      if (!this.isEnabled) {
        this.isEnabled = true;
        do {
          var next = this.getNext();
          if (next !== null) {
            this.comparer(next.dueTime, this.clock) > 0 && (this.clock = next.dueTime);
            next.invoke();
          } else {
            this.isEnabled = false;
          }
        } while (this.isEnabled);
      }
    };

    /**
     * Stops the virtual time scheduler.
     */
    VirtualTimeSchedulerPrototype.stop = function () {
      this.isEnabled = false;
    };

    /**
     * Advances the scheduler's clock to the specified time, running all work till that point.
     * @param {Number} time Absolute time to advance the scheduler's clock to.
     */
    VirtualTimeSchedulerPrototype.advanceTo = function (time) {
      var dueToClock = this.comparer(this.clock, time);
      if (this.comparer(this.clock, time) > 0) { throw new ArgumentOutOfRangeError(); }
      if (dueToClock === 0) { return; }
      if (!this.isEnabled) {
        this.isEnabled = true;
        do {
          var next = this.getNext();
          if (next !== null && this.comparer(next.dueTime, time) <= 0) {
            this.comparer(next.dueTime, this.clock) > 0 && (this.clock = next.dueTime);
            next.invoke();
          } else {
            this.isEnabled = false;
          }
        } while (this.isEnabled);
        this.clock = time;
      }
    };

    /**
     * Advances the scheduler's clock by the specified relative time, running all work scheduled for that timespan.
     * @param {Number} time Relative time to advance the scheduler's clock by.
     */
    VirtualTimeSchedulerPrototype.advanceBy = function (time) {
      var dt = this.add(this.clock, time),
          dueToClock = this.comparer(this.clock, dt);
      if (dueToClock > 0) { throw new ArgumentOutOfRangeError(); }
      if (dueToClock === 0) {  return; }

      this.advanceTo(dt);
    };

    /**
     * Advances the scheduler's clock by the specified relative time.
     * @param {Number} time Relative time to advance the scheduler's clock by.
     */
    VirtualTimeSchedulerPrototype.sleep = function (time) {
      var dt = this.add(this.clock, time);
      if (this.comparer(this.clock, dt) >= 0) { throw new ArgumentOutOfRangeError(); }

      this.clock = dt;
    };

    /**
     * Gets the next scheduled item to be executed.
     * @returns {ScheduledItem} The next scheduled item.
     */
    VirtualTimeSchedulerPrototype.getNext = function () {
      while (this.queue.length > 0) {
        var next = this.queue.peek();
        if (next.isCancelled()) {
          this.queue.dequeue();
        } else {
          return next;
        }
      }
      return null;
    };

    /**
     * Schedules an action to be executed at dueTime.
     * @param {Scheduler} scheduler Scheduler to execute the action on.
     * @param {Number} dueTime Absolute time at which to execute the action.
     * @param {Function} action Action to be executed.
     * @returns {Disposable} The disposable object used to cancel the scheduled action (best effort).
     */
    VirtualTimeSchedulerPrototype.scheduleAbsolute = function (dueTime, action) {
      return this.scheduleAbsoluteWithState(action, dueTime, invokeAction);
    };

    /**
     * Schedules an action to be executed at dueTime.
     * @param {Mixed} state State passed to the action to be executed.
     * @param {Number} dueTime Absolute time at which to execute the action.
     * @param {Function} action Action to be executed.
     * @returns {Disposable} The disposable object used to cancel the scheduled action (best effort).
     */
    VirtualTimeSchedulerPrototype.scheduleAbsoluteWithState = function (state, dueTime, action) {
      var self = this;

      function run(scheduler, state1) {
        self.queue.remove(si);
        return action(scheduler, state1);
      }

      var si = new ScheduledItem(this, state, run, dueTime, this.comparer);
      this.queue.enqueue(si);

      return si.disposable;
    };

    return VirtualTimeScheduler;
  }(Scheduler));

  /** Provides a virtual time scheduler that uses Date for absolute time and number for relative time. */
  Rx.HistoricalScheduler = (function (__super__) {
    inherits(HistoricalScheduler, __super__);

    /**
     * Creates a new historical scheduler with the specified initial clock value.
     * @constructor
     * @param {Number} initialClock Initial value for the clock.
     * @param {Function} comparer Comparer to determine causality of events based on absolute time.
     */
    function HistoricalScheduler(initialClock, comparer) {
      var clock = initialClock == null ? 0 : initialClock;
      var cmp = comparer || defaultSubComparer;
      __super__.call(this, clock, cmp);
    }

    var HistoricalSchedulerProto = HistoricalScheduler.prototype;

    /**
     * Adds a relative time value to an absolute time value.
     * @param {Number} absolute Absolute virtual time value.
     * @param {Number} relative Relative virtual time value to add.
     * @return {Number} Resulting absolute virtual time sum value.
     */
    HistoricalSchedulerProto.add = function (absolute, relative) {
      return absolute + relative;
    };

    HistoricalSchedulerProto.toDateTimeOffset = function (absolute) {
      return new Date(absolute).getTime();
    };

    /**
     * Converts the TimeSpan value to a relative virtual time value.
     * @memberOf HistoricalScheduler
     * @param {Number} timeSpan TimeSpan value to convert.
     * @return {Number} Corresponding relative virtual time value.
     */
    HistoricalSchedulerProto.toRelative = function (timeSpan) {
      return timeSpan;
    };

    return HistoricalScheduler;
  }(Rx.VirtualTimeScheduler));

  var AnonymousObservable = Rx.AnonymousObservable = (function (__super__) {
    inherits(AnonymousObservable, __super__);

    // Fix subscriber to check for undefined or function returned to decorate as Disposable
    function fixSubscriber(subscriber) {
      return subscriber && isFunction(subscriber.dispose) ? subscriber :
        isFunction(subscriber) ? disposableCreate(subscriber) : disposableEmpty;
    }

    function setDisposable(s, state) {
      var ado = state[0], subscribe = state[1];
      var sub = tryCatch(subscribe)(ado);

      if (sub === errorObj) {
        if(!ado.fail(errorObj.e)) { return thrower(errorObj.e); }
      }
      ado.setDisposable(fixSubscriber(sub));
    }

    function AnonymousObservable(subscribe, parent) {
      this.source = parent;

      function s(observer) {
        var ado = new AutoDetachObserver(observer), state = [ado, subscribe];

        if (currentThreadScheduler.scheduleRequired()) {
          currentThreadScheduler.scheduleWithState(state, setDisposable);
        } else {
          setDisposable(null, state);
        }
        return ado;
      }

      __super__.call(this, s);
    }

    return AnonymousObservable;

  }(Observable));

  var AutoDetachObserver = (function (__super__) {
    inherits(AutoDetachObserver, __super__);

    function AutoDetachObserver(observer) {
      __super__.call(this);
      this.observer = observer;
      this.m = new SingleAssignmentDisposable();
    }

    var AutoDetachObserverPrototype = AutoDetachObserver.prototype;

    AutoDetachObserverPrototype.next = function (value) {
      var result = tryCatch(this.observer.onNext).call(this.observer, value);
      if (result === errorObj) {
        this.dispose();
        thrower(result.e);
      }
    };

    AutoDetachObserverPrototype.error = function (err) {
      var result = tryCatch(this.observer.onError).call(this.observer, err);
      this.dispose();
      result === errorObj && thrower(result.e);
    };

    AutoDetachObserverPrototype.completed = function () {
      var result = tryCatch(this.observer.onCompleted).call(this.observer);
      this.dispose();
      result === errorObj && thrower(result.e);
    };

    AutoDetachObserverPrototype.setDisposable = function (value) { this.m.setDisposable(value); };
    AutoDetachObserverPrototype.getDisposable = function () { return this.m.getDisposable(); };

    AutoDetachObserverPrototype.dispose = function () {
      __super__.prototype.dispose.call(this);
      this.m.dispose();
    };

    return AutoDetachObserver;
  }(AbstractObserver));

  var GroupedObservable = (function (__super__) {
    inherits(GroupedObservable, __super__);

    function subscribe(observer) {
      return this.underlyingObservable.subscribe(observer);
    }

    function GroupedObservable(key, underlyingObservable, mergedDisposable) {
      __super__.call(this, subscribe);
      this.key = key;
      this.underlyingObservable = !mergedDisposable ?
        underlyingObservable :
        new AnonymousObservable(function (observer) {
          return new CompositeDisposable(mergedDisposable.getDisposable(), underlyingObservable.subscribe(observer));
        });
    }

    return GroupedObservable;
  }(Observable));

  /**
   *  Represents an object that is both an observable sequence as well as an observer.
   *  Each notification is broadcasted to all subscribed observers.
   */
  var Subject = Rx.Subject = (function (__super__) {
    function subscribe(observer) {
      checkDisposed(this);
      if (!this.isStopped) {
        this.observers.push(observer);
        return new InnerSubscription(this, observer);
      }
      if (this.hasError) {
        observer.onError(this.error);
        return disposableEmpty;
      }
      observer.onCompleted();
      return disposableEmpty;
    }

    inherits(Subject, __super__);

    /**
     * Creates a subject.
     */
    function Subject() {
      __super__.call(this, subscribe);
      this.isDisposed = false,
      this.isStopped = false,
      this.observers = [];
      this.hasError = false;
    }

    addProperties(Subject.prototype, Observer.prototype, {
      /**
       * Indicates whether the subject has observers subscribed to it.
       * @returns {Boolean} Indicates whether the subject has observers subscribed to it.
       */
      hasObservers: function () { return this.observers.length > 0; },
      /**
       * Notifies all subscribed observers about the end of the sequence.
       */
      onCompleted: function () {
        checkDisposed(this);
        if (!this.isStopped) {
          this.isStopped = true;
          for (var i = 0, os = cloneArray(this.observers), len = os.length; i < len; i++) {
            os[i].onCompleted();
          }

          this.observers.length = 0;
        }
      },
      /**
       * Notifies all subscribed observers about the exception.
       * @param {Mixed} error The exception to send to all observers.
       */
      onError: function (error) {
        checkDisposed(this);
        if (!this.isStopped) {
          this.isStopped = true;
          this.error = error;
          this.hasError = true;
          for (var i = 0, os = cloneArray(this.observers), len = os.length; i < len; i++) {
            os[i].onError(error);
          }

          this.observers.length = 0;
        }
      },
      /**
       * Notifies all subscribed observers about the arrival of the specified element in the sequence.
       * @param {Mixed} value The value to send to all observers.
       */
      onNext: function (value) {
        checkDisposed(this);
        if (!this.isStopped) {
          for (var i = 0, os = cloneArray(this.observers), len = os.length; i < len; i++) {
            os[i].onNext(value);
          }
        }
      },
      /**
       * Unsubscribe all observers and release resources.
       */
      dispose: function () {
        this.isDisposed = true;
        this.observers = null;
      }
    });

    /**
     * Creates a subject from the specified observer and observable.
     * @param {Observer} observer The observer used to send messages to the subject.
     * @param {Observable} observable The observable used to subscribe to messages sent from the subject.
     * @returns {Subject} Subject implemented using the given observer and observable.
     */
    Subject.create = function (observer, observable) {
      return new AnonymousSubject(observer, observable);
    };

    return Subject;
  }(Observable));

  /**
   *  Represents the result of an asynchronous operation.
   *  The last value before the OnCompleted notification, or the error received through OnError, is sent to all subscribed observers.
   */
  var AsyncSubject = Rx.AsyncSubject = (function (__super__) {

    function subscribe(observer) {
      checkDisposed(this);

      if (!this.isStopped) {
        this.observers.push(observer);
        return new InnerSubscription(this, observer);
      }

      if (this.hasError) {
        observer.onError(this.error);
      } else if (this.hasValue) {
        observer.onNext(this.value);
        observer.onCompleted();
      } else {
        observer.onCompleted();
      }

      return disposableEmpty;
    }

    inherits(AsyncSubject, __super__);

    /**
     * Creates a subject that can only receive one value and that value is cached for all future observations.
     * @constructor
     */
    function AsyncSubject() {
      __super__.call(this, subscribe);

      this.isDisposed = false;
      this.isStopped = false;
      this.hasValue = false;
      this.observers = [];
      this.hasError = false;
    }

    addProperties(AsyncSubject.prototype, Observer, {
      /**
       * Indicates whether the subject has observers subscribed to it.
       * @returns {Boolean} Indicates whether the subject has observers subscribed to it.
       */
      hasObservers: function () {
        checkDisposed(this);
        return this.observers.length > 0;
      },
      /**
       * Notifies all subscribed observers about the end of the sequence, also causing the last received value to be sent out (if any).
       */
      onCompleted: function () {
        var i, len;
        checkDisposed(this);
        if (!this.isStopped) {
          this.isStopped = true;
          var os = cloneArray(this.observers), len = os.length;

          if (this.hasValue) {
            for (i = 0; i < len; i++) {
              var o = os[i];
              o.onNext(this.value);
              o.onCompleted();
            }
          } else {
            for (i = 0; i < len; i++) {
              os[i].onCompleted();
            }
          }

          this.observers.length = 0;
        }
      },
      /**
       * Notifies all subscribed observers about the error.
       * @param {Mixed} error The Error to send to all observers.
       */
      onError: function (error) {
        checkDisposed(this);
        if (!this.isStopped) {
          this.isStopped = true;
          this.hasError = true;
          this.error = error;

          for (var i = 0, os = cloneArray(this.observers), len = os.length; i < len; i++) {
            os[i].onError(error);
          }

          this.observers.length = 0;
        }
      },
      /**
       * Sends a value to the subject. The last value received before successful termination will be sent to all subscribed and future observers.
       * @param {Mixed} value The value to store in the subject.
       */
      onNext: function (value) {
        checkDisposed(this);
        if (this.isStopped) { return; }
        this.value = value;
        this.hasValue = true;
      },
      /**
       * Unsubscribe all observers and release resources.
       */
      dispose: function () {
        this.isDisposed = true;
        this.observers = null;
        this.exception = null;
        this.value = null;
      }
    });

    return AsyncSubject;
  }(Observable));

  var AnonymousSubject = Rx.AnonymousSubject = (function (__super__) {
    inherits(AnonymousSubject, __super__);

    function subscribe(observer) {
      return this.observable.subscribe(observer);
    }

    function AnonymousSubject(observer, observable) {
      this.observer = observer;
      this.observable = observable;
      __super__.call(this, subscribe);
    }

    addProperties(AnonymousSubject.prototype, Observer.prototype, {
      onCompleted: function () {
        this.observer.onCompleted();
      },
      onError: function (error) {
        this.observer.onError(error);
      },
      onNext: function (value) {
        this.observer.onNext(value);
      }
    });

    return AnonymousSubject;
  }(Observable));

  /**
  * Used to pause and resume streams.
  */
  Rx.Pauser = (function (__super__) {
    inherits(Pauser, __super__);

    function Pauser() {
      __super__.call(this);
    }

    /**
     * Pauses the underlying sequence.
     */
    Pauser.prototype.pause = function () { this.onNext(false); };

    /**
    * Resumes the underlying sequence.
    */
    Pauser.prototype.resume = function () { this.onNext(true); };

    return Pauser;
  }(Subject));

  if (typeof define == 'function' && typeof define.amd == 'object' && define.amd) {
    root.Rx = Rx;

    define(function() {
      return Rx;
    });
  } else if (freeExports && freeModule) {
    // in Node.js or RingoJS
    if (moduleExports) {
      (freeModule.exports = Rx).Rx = Rx;
    } else {
      freeExports.Rx = Rx;
    }
  } else {
    // in a browser or Rhino
    root.Rx = Rx;
  }

  // All code before this point will be filtered from stack traces.
  var rEndingLine = captureLine();

}.call(this));

}).call(this,require("FWaASH"),typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})
},{"FWaASH":147}]},{},[1])