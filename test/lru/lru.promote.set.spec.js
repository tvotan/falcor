var falcor = require("./../../lib/");
var Model = falcor.Model;
var noOp = function() {};

var __head = require("./../../lib/internal/head");
var __tail = require("./../../lib/internal/tail");
var __next = require("./../../lib/internal/next");
var __prev = require("./../../lib/internal/prev");
var __key = require("./../../lib/internal/key");
var cacheGenerator = require('./../CacheGenerator');

describe('Set', function() {
    it('should set with pathValues.', function() {
        var model = getModel();

        model.set({
             path: ['1'],
             value: 'i am 1'
        }).subscribe();

        singleItem(model);
    });
    it('should set with json', function() {
        var model = getModel();

        model.set({
            json: {
                1: 'i am 1'
            }
        }).subscribe();

        singleItem(model);
    });
    it('should set with json-graph', function() {
        var model = getModel();

        model.set({
            jsonGraph: {
                1: 'i am 1'
            },
            paths: [
                [1]
            ]
        }).subscribe();

        singleItem(model);
    });
    it('should set with 2 pathValues.', function() {
        var model = getModel();

        model.set({
             path: ['1'],
             value: 'i am 1'
        }).subscribe();

        model.set({
             path: ['2'],
             value: 'i am 2'
        }).subscribe();

        doubleItem(model);
    });
    it('should set with 2 json', function() {
        var model = getModel();

        model.set({
            json: {
                1: 'i am 1'
            }
        }).subscribe();

        model.set({
            json: {
                2: 'i am 2'
            }
        }).subscribe();

        doubleItem(model);
    });
    it('should set with 2 json-graph', function() {
        var model = getModel();

        model.set({
            jsonGraph: {
                1: 'i am 1'
            },
            paths: [
                [1]
            ]
        }).subscribe();


        model.set({
            jsonGraph: {
                2: 'i am 2'
            },
            paths: [
                [2]
            ]
        }).subscribe();

        doubleItem(model);
    });
    it('should set with 3 pathValues.', function() {
        var model = getModel();

        model.set({
             path: ['1'],
             value: 'i am 1'
        }).subscribe();

        model.set({
             path: ['2'],
             value: 'i am 2'
        }).subscribe();

        model.set({
             path: ['3'],
             value: 'i am 3'
        }).subscribe();

        tripleItem(model);
    });
    it('should set with 3 json', function() {
        var model = getModel();

        model.set({
            json: {
                1: 'i am 1'
            }
        }).subscribe();

        model.set({
            json: {
                2: 'i am 2'
            }
        }).subscribe();


        model.set({
            json: {
                3: 'i am 3'
            }
        }).subscribe();

        tripleItem(model);
    });
    it('should set with 3 json-graph', function() {
        var model = getModel();

        model.set({
            jsonGraph: {
                1: 'i am 1'
            },
            paths: [
                [1]
            ]
        }).subscribe();


        model.set({
            jsonGraph: {
                2: 'i am 2'
            },
            paths: [
                [2]
            ]
        }).subscribe();

        model.set({
            jsonGraph: {
                3: 'i am 3'
            },
            paths: [
                [3]
            ]
        }).subscribe();

        tripleItem(model);
    });

    it('should promote references on a set.', function() {
        var model = new Model({
            cache: cacheGenerator(0, 1)
        });

        var root = model._root;
        var curr = root[__head];
        expect(curr[__key]).toBe('title');
        expect(curr.value).toEqual('Video 0');

        curr = curr[__next];
        expect(curr[__key]).toBe('item');
        expect(curr.value).toEqual(['videos', '0']);

        curr = curr[__next];
        expect(curr[__key]).toBe('0');
        expect(curr.value).toEqual(['lists', 'A']);

        curr = curr[__next];
        expect(curr[__key]).toBe('lolomo');
        expect(curr.value).toEqual(['lolomos', '1234']);
        expect(curr[__next]).toBeUndefined();

        model.
            set({
                path: ['lolomo', '0'],
                value: 'foo'
            }).
            subscribe();

        // new order to the list
        curr = root[__head];
        expect(curr[__key]).toBe('0');
        expect(curr.value).toEqual('foo');

        curr = curr[__next];
        expect(curr[__key]).toBe('lolomo');
        expect(curr.value).toEqual(['lolomos', '1234']);

        curr = curr[__next];
        expect(curr[__key]).toBe('title');
        expect(curr.value).toEqual('Video 0');

        curr = curr[__next];
        expect(curr[__key]).toBe('item');
        expect(curr.value).toEqual(['videos', '0']);
        expect(curr[__next]).toBeUndefined();
    });
});
function getModel() {
    var model = new Model();

    return model;
}

function singleItem(model) {
    expect(model._root[__head].value).toBe('i am 1');
    expect(model._root[__head][__next]).toBeUndefined();
    expect(model._root[__head][__prev]).toBeUndefined();
}

function doubleItem(model) {
    expect(model._root[__head].value).toBe('i am 2');
    expect(model._root[__tail].value).toBe('i am 1');
    expect(model._root[__head][__next].value).toBe('i am 1');
    expect(model._root[__tail][__prev].value).toBe('i am 2');
    expect(model._root[__head][__prev]).toBeUndefined();
    expect(model._root[__tail][__next]).toBeUndefined();
}

function tripleItem(model) {
    expect(model._root[__head].value).toBe('i am 3');
    expect(model._root[__tail].value).toBe('i am 1');
    expect(model._root[__head][__next].value).toBe('i am 2');
    expect(model._root[__tail][__prev].value).toBe('i am 2');
    expect(model._root[__head][__next][__next].value).toBe('i am 1');
    expect(model._root[__tail][__prev][__prev].value).toBe('i am 3');
    expect(model._root[__head][__prev]).toBeUndefined();
    expect(model._root[__tail][__next]).toBeUndefined();
}
