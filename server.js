var config = require('config');
var express = require('express');
var finalhandler = require('finalhandler');
var serveIndex = require('serve-index');
var async = require('async');
var debug = require('debug')('velocityServer:index.js');
var Velocity = require('velocityjs');
var File = require('vinyl');
var path = require('path');

function getExtname(filePath) {
    return (new File({path: filePath})).extname;
}

function parseVm(req, res, next) {
    var isVm = config.vm.indexOf(getExtname(req.originalUrl)) >= 0;
    debug(req.originalUrl, 'isVm=', isVm);
    if(!isVm) {
        return next();
    }
    
    var filePath = path.join(config.webapps, req.originalUrl);
    debug('filePath=', filePath);

    // TODO
}

function errorHandler(err, req, res, next) {
    var options = {
        message: true
    };
    finalhandler(req, res, options)();
};

function start(callback) {
    if(!config.webapps) {
        return console.error('请配置服务器根目录 config.webapps');
    }

    var app = express();
    
    app.set('views', config.webapps);
    app.use(parseVm);
    app.use(serveIndex(config.webapps, {icons: true}));
    app.use(express.static(config.webapps, {index: false, maxAge: 0}));
    app.use(errorHandler);

    app.listen(config.port, callback);
}

module.exports = {
    _debug: {
        getExtname: getExtname,
        parseVm: parseVm
    },
    start: start
}