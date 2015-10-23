var path = require('path')
var events = require('events')
var fs = require('fs')
var util = require('util')
var rimraf = require('rimraf')
var parallel = require('run-parallel')
var fedsearch = require('federated-search')
var download = require('./lib/download.js')
var fetch = require('./lib/fetch.js')

var CONFIG_FILE = 'dps.json'
var PORTALS_PATH = path.join(__dirname, 'addons')

module.exports = DPS

function DPS (dir) {
  if (!(this instanceof DPS)) return new DPS(dir)
  if (!dir) dir = process.cwd()
  this.dir = dir
  this.configPath = path.join(this.dir, CONFIG_FILE)
  this.config = readConfig(this.configPath)
  this.core_portals = getCorePortals()

  events.EventEmitter.call(this)
}

function getCorePortals () {
  // get built-in or "core" portals
  // TODO: this is just for demo, prob needs a refactor
  var portals = []
  var addonFiles = fs.readdirSync(PORTALS_PATH)
  for (var i in addonFiles) {
    var addon = addonFiles[i]
    var data = fs.readFileSync(path.join(PORTALS_PATH, addon))
    portals.push(JSON.parse(data))
  }
  return portals
}

util.inherits(DPS, events.EventEmitter)

DPS.prototype.download = function (location, args) {
  var self = this
  var name = args.name || normalize(location) // should a name be required?
  var existingResource = self.get({location: location}) || self.get({name: name})
  if (existingResource) return self._updateResource(existingResource)

  var resource = {
    location: location,
    type: args.type,
    name: name
  }

  var downloader = download(self.dir, resource)
  downloader.on('done', function (err, resource) {
    if (!err) self._add(resource)
  })
  return downloader
}

DPS.prototype.add = function (location, args) {
  // TODO: add a local directory to the tracker..
}

DPS.prototype.search = function (text) {
  var self = this
  var searchers = []
  for (var i in self.core_portals) {
    var portal = self.core_portals[i]
    var inst = require(portal.searcher)()
    searchers.push(inst)
  }
  return fedsearch({fulltext: text}, searchers)
}

DPS.prototype.update = function (name, cb) {
  var self = this
  if (name) return self._updateResource(self.get({name: name}), cb)
  else return self._parallelize(self._updateResource, cb)
}

DPS.prototype._updateResource = function (resource, cb) {
  var self = this
  var downloader = download(self.dir, resource)
  downloader.on('done', function (newResource) {
    if (err) return cb(err)
    var i = self._get_index(resource)
    self.config.resources[i] = newResource
    cb(null, resource)
  })
}

DPS.prototype.addPortal = function (url, args, cb) {
  var self = this
  var portal = {
    type: args.type,
    url: url,
    opts: args
  }
  self.config.portals.push(portal)
  return portal
}

DPS.prototype.checkAll = function (cb) {
  this._parallelize(fetch, cb)
}

DPS.prototype.check = function (opts, cb) {
  fetch(this.get(opts), cb)
}

DPS.prototype.save = function (cb) {
  var self = this
  fs.writeFile(self.configPath, JSON.stringify(self.config, null, 2), cb)
}

DPS.prototype.remove = function (name, cb) {
  var self = this
  if (!name) return cb(new Error('Remove requires a name'))
  var resource = self.get({name: name})
  if (!resource) return cb(new Error('Resource not found with name', name))
  rimraf(resource.name, function (err) {
    if (err) return cb(err)
    self._remove(name)
    cb()
  })
}

DPS.prototype._get_index = function (query) {
  var self = this
  for (var i in self.config.resources) {
    var resource = self.config.resources[i]
    for (var key in query) {
      if (resource[key] === query[key]) return i
    }
  }
}

DPS.prototype._resourcePath = function (resource) {
  // TODO: can we get deduplicate downloads on a single machine?
  return path.join(this.dir, resource.name)
}

DPS.prototype.get = function (opts) {
  var self = this
  var i = self._get_index(opts)
  return self.config.resources[i]
}

DPS.prototype.destroy = function (cb) {
  var self = this
  self._parallelize(function (resource, done) {
    rimraf(self._resourcePath(resource), done)
  }, function () {
    rimraf(self.configPath, cb)
  })
}

DPS.prototype._parallelize = function (func, cb) {
  var self = this
  var tasks = []
  for (var i in self.config.resources) {
    (function (i) {
      tasks.push(function (done) {
        func(self.config.resources[i], done)
      })
    })(i)
  }
  parallel(tasks, cb)
}

DPS.prototype._remove = function (name) {
  var self = this
  var newResources = []
  for (var i in self.config.resources) {
    var resource = self.config.resources[i]
    if (resource.name !== name) newResources.push(resource)
  }
  self.config.resources = newResources
}

DPS.prototype._add = function (resource) {
  this.config.resources.push(resource)
}

function readConfig (configPath) {
  if (fs.existsSync(configPath)) return JSON.parse(fs.readFileSync(configPath))
  return {
    resources: [],
    portals: []
  }
}

function normalize (location) {
  return location.replace('\/', '_').replace(/[^a-z_+A-Z0-9]/ig, '')
}
