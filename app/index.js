var path = require('path')
var elementClass = require('element-class')
var Ractive = require('ractive-toolkit')
var page = require('page')
var dom = require('dom')
var fs = require('fs')
var ipc = require('ipc')

var dps = require('..')() // TODO: support projects

function onerror (err) {
  var message = err.stack || err.message || JSON.stringify(err)
  console.error(message)
  window.alert(message)
}

function done (ractive) {
  dps.save(function (err) {
    if (err) return onerror(err)
    ractive.set('resources', dps.config.resources)
  })
}

function ask (ractive, cb) {
  ractive.fire('toggleModal')
  var submit = dom('.modal button[type="submit"]')[0]
  submit.onclick = function () {
    cb()
    ractive.fire('toggleModal')
  }
}

var events = {
  view: function (event, id) {
    console.log(id)
    page('/view/' + id)
  },
  toggleModal: function () {
    var modal = dom('.modal')
    elementClass(modal[0]).toggle('hidden')
    var mask = dom('.modal-mask')
    elementClass(mask[0]).toggle('hidden')
  },
  remove: function (event, location) {
    var self = this
    ask(self, function () {
      dps.remove(location, function (err) {
        if (err) return onerror(err)
        done(self)
      })
    })
  },
  doUpdate: function (event, location) {
    var self = this
    dps.updateOne(location, function (err, resource) {
      if (err) return onerror(err)
      done(self)
    })
  },
  add: function () {
    var self = this
    var location = self.get('location')
    var args = {}
    if (location.trim().length === 0) return
    dps.add(location, args, function (err, resource) {
      if (err) return onerror(err)
      self.set('location', '')
      done(self)
    })
  },
  quit: function () {
    ipc.send('terminate')
  }
}

var templates = {
  search: fs.readFileSync(path.join(__dirname, 'templates', 'search.html')).toString(),
  resources: fs.readFileSync(path.join(__dirname, 'templates', 'resources.html')).toString(),
  view: fs.readFileSync(path.join(__dirname, 'templates', 'view.html')).toString(),
  portals: fs.readFileSync(path.join(__dirname, 'templates', 'portals.html')).toString()
}

var routes = {
  view: function (ctx, next) {
    ctx.template = templates.view
    ctx.data = {resource: dps.config.resources[ctx.params.id]}
    render(ctx)
  },
  resources: function (ctx, next) {
    ctx.template = templates.resources
    ctx.data = {resources: dps.config.resources}
    render(ctx)
  },
  portals: function (ctx, next) {
    ctx.template = templates.portals
    ctx.data = {resources: dps.config.resources, portals: dps.config.portals}
    render(ctx)
  },
  search: function (ctx, next) {
    ctx.template = templates.search
    ctx.data = {resources: dps.config.resources}
    render(ctx)
  }
}

// set up routes
page('/', routes.resources)
page('/search', routes.search)
page('/portals', routes.portals)
page('/view/:id', routes.view)
// initialize
page.start()
page('/')

function render (ctx) {
  var ract = new Ractive({
    el: '#content',
    template: ctx.template,
    data: ctx.data,
    onrender: ctx.onrender
  })

  dom('.sidebar__item').each(function (el) {
    el[0].onclick = function (event) {
      dom('a.sidebar__item').each(function (el) {
        elementClass(el[0]).remove('selected')
      })
      var e = elementClass(this)
      if (!e.has('selected')) e.add('selected')
    }
  })

  ract.on(events)
  return ract
}
