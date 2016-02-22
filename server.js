var config = require('config');
var express = require('express');
var finalhandler = require('finalhandler');
var serveIndex = require('serve-index');
var debug = require('debug')('velocityServer:index.js');
var Velocity = require('velocityjs');
var File = require('vinyl');
var path = require('path');
var fs = require('fs');
var httpProxy = require('http-proxy');

function getExtname(filePath) {
    return (new File({path: filePath})).extname;
}

function parseVm(req, res, next) {
    var isVm = config.vm.indexOf(getExtname(req.path)) >= 0;
    // debug(req.path, 'isVm=', isVm);
    if(!isVm) {
        return next();
    }
    
    var vmPath = path.join(config.webapps, req.path);
    compile(vmPath, function(err, ret) {
        if(err) {
            return next(err);
        }
        res.set('Content-Type', 'text/html; charset=utf-8');
        res.send(ret);
    });
}

function compile(vmPath, callback) {
    var vmFile = new File({path: vmPath});
    var contextFile = new File({path: vmPath});
    contextFile.extname = '.js';

    var template = getFileContent(vmPath);
    if(null === template) {
        return callback('File not found:' + vmPath);
    }
    vmFile.contents = new Buffer(template);
    var context;
    try {
        delete require.cache[require.resolve(contextFile.path)];
        context = require(contextFile.path);
    } catch(err) {}

    try {
        var html = Velocity.render(template, context, getMacros(vmFile.path));
        html = ssiInclude(html, vmFile.path);
        callback(null, html);
    } catch(err) {
        return callback(err);
    }
}

function getMacros(relativePath) {
    var ssi = function(filePath) {
        var newFilePath = path.resolve(path.dirname(relativePath), filePath);
        var content = getFileContent(newFilePath);
        if(null === content) {
            return '<!-- ERROR: {{module}} not found -->'.replace('{{module}}', filePath);
        }

        return this.eval(content);
    };

    return {
        include: ssi,
        parse: ssi
    };
}

function ssiInclude(content, relativePath) {
    return content.replace(ssiInclude.reg, function(match, filePath) {
        var newFilePath = path.resolve(path.dirname(relativePath), filePath);
        return getFileContent(newFilePath) || '<!-- ERROR: {{module}} not found -->'.replace('{{module}}', filePath);
    });
}
ssiInclude.reg = /<\!--\\?#include\s+(?:virtual|file)="([^"]*)"\s*-->/gm;

function getFileContent(filePath) {
    var content = null;
    try {
        content = fs.readFileSync(filePath, 'utf8');
    } catch(e) {}
    return content;
}

function errorHandler(err, req, res, next) {
    var options = {
        message: true
    };
    finalhandler(req, res, options)(err);
};

function json(req, res, next) {
    var filePath = path.join(config.webapps, req.path);
    var content = getFileContent(filePath);

    if(null === content) {
        next();
    } else {
        res.set({
            'Content-Type': 'application/json',
            'maxAge': 0
        });
        res.send(content);
    }
};

function myProxy(req, res, next) {
    var proxy = httpProxy.createProxyServer();
    req.url = req.originalUrl;
    proxy.web(req, res, {
        target: config.proxy.target,
        changeOrigin: true
    });
    proxy.on('error', function(err) {
        next('Unable to Connect to Proxy Server.' + err.message);
    });
    return proxy;
}

function start(callback) {
    if(!config.webapps) {
        return callback(new Error('Error: config.webapps is missing, Please set it in config/local.json file.'));
    }

    var app = express();
    
    config.proxy && config.proxy.path && app.use(config.proxy.path, myProxy);
    app.set('views', config.webapps);
    app.use(function(req, res, next) {
        res.set(config.responseHeaders);
        next();
    });
    app.use(parseVm);
    app.post('*.json', json);
    app.use(serveIndex(config.webapps, {icons: true}));
    app.use(express.static(config.webapps, {index: false, maxAge: 0}));
    app.use(errorHandler);

    app.listen(config.port, callback);
}

module.exports = {
    _debug: {
        getExtname: getExtname,
        parseVm: parseVm,
        compile: compile,
        getMacros: getMacros,
        ssiInclude: ssiInclude,
        getFileContent: getFileContent,
        errorHandler: errorHandler,
        json: json,
        myProxy: myProxy
    },
    start: start
}
