"use strict";

var util    = require('util');
var tty     = require('tty');
var _       = require('lodash');
var express = require('express');
var dgram   = require('dgram');

// is it a tty or file?
var isatty = tty.isatty(2) && tty.isatty(1);
var stdout = process.stdout, stderr = process.stderr;

var colors = {
    // text style
    'bold'         : ['\x1B[1m', '\x1B[22m'],
    'italic'       : ['\x1B[3m', '\x1B[23m'],
    'underline'    : ['\x1B[4m', '\x1B[24m'],
    'inverse'      : ['\x1B[7m', '\x1B[27m'],
    'strikethrough': ['\x1B[9m', '\x1B[29m'],
    // text colors
    'white'        : ['\x1B[37m', '\x1B[39m'],
    // 'grey'         : ['\x1B[90m', '\x1B[39m'],
    'grey'         : ['\x1B[38;5;240m', '\x1B[39m'],
    'black'        : ['\x1B[30m', '\x1B[39m'],
    'blue'         : ['\x1B[34m', '\x1B[39m'],
    'cyan'         : ['\x1B[36m', '\x1B[39m'],
    'green'        : ['\x1B[32m', '\x1B[39m'],
    'magenta'      : ['\x1B[35m', '\x1B[39m'],
    'red'          : ['\x1B[31m', '\x1B[39m'],
    'yellow'       : ['\x1B[33m', '\x1B[39m'],
    // background colors
    'whiteBG'      : ['\x1B[47m', '\x1B[49m'],
    'greyBG'       : ['\x1B[49;5;8m', '\x1B[49m'],
    'blackBG'      : ['\x1B[40m', '\x1B[49m'],
    'blueBG'       : ['\x1B[44m', '\x1B[49m'],
    'cyanBG'       : ['\x1B[46m', '\x1B[49m'],
    'greenBG'      : ['\x1B[42m', '\x1B[49m'],
    'magentaBG'    : ['\x1B[45m', '\x1B[49m'],
    'redBG'        : ['\x1B[41m', '\x1B[49m'],
    'yellowBG'     : ['\x1B[43m', '\x1B[49m']
};

var levels = {
    'DEBUG': 'blue',
    'INFO': 'green',
    'WARN': 'yellow',
    'ERROR': 'red',
    'HTTP': 'cyan'
};

function colored(str, color) {
    return colors[color][0] + str + colors[color][1];
}

module.exports = function(options) {

    var udp, hostname = require('os').hostname(), logstashInd = 0;

    options = _.defaults(options || {}, {
        logLevel: 255,
        logstash: false,
        ttyColors: true
    });

    options.logLevel = process.env.NSL_LEVEL ? parseInt(process.env.NSL_LEVEL) : options.logLevel;

    if(options.logstash){
        options.logstash.port = options.logstash.port || 9999;
        options.logstash.hosts = options.logstash.hosts || ['127.0.0.1'];
        udp = dgram.createSocket('udp4');
    }

    var log = function(level) {

        level = level || 'INFO';

        var ts = new Date().toISOString();
        var args = Array.prototype.slice.call(arguments, 1);

        if(options.logstash){
            var data = {
                '@timestamp': ts,
                level: level,
                module: options.module || '-',
                host: hostname,
                message: util.format.apply(null, args)
            };

            var packet = JSON.stringify(data);
            packet = new Buffer(packet);
            udp.send(packet, 0, packet.length, options.logstash.port, options.logstash.hosts[logstashInd]);
            if(++logstashInd >= options.logstash.hosts.length){
                logstashInd = 0;
            }
        }

        if(isatty && options.ttyColors){
            level = colored(level, levels[level]);
            ts = colored(ts, 'grey');
        }

        if(_.isString(args[0])){
            args[0] = ts + ' ' + level + ' ' + args[0];
        } else {
            args = [ts, level].concat(args);
        }

        if(level === 'ERROR'){
            stderr.write(util.format.apply(null, args) + '\n');
        } else {
            stdout.write(util.format.apply(null, args) + '\n');
        }
    };

    return {

        /* jshint bitwise: false */

        log: function() {
            if(!(options.logLevel & 4)){
                return;
            }
            log.apply(null, ['INFO'].concat(Array.prototype.slice.call(arguments)));
        },

        debug: function() {
            if(!(options.logLevel & 16)){
                return;
            }
            log.apply(null, ['DEBUG'].concat(Array.prototype.slice.call(arguments)));
        },

        error: function error () {
            if(!(options.logLevel & 1)){
                return;
            }

            // capture error() call location
            var stackErr = new Error();
            Error.captureStackTrace(stackErr, error);
            var loggedAt = '[' + stackErr.stack.split('\n')[1].trim() + ']';

            var args = Array.prototype.slice.call(arguments);

            for(var i = 0; i < args.length; i++){
                if (args[i] instanceof Error) {
                    var err = args[i];
                    args[i] = err.toString() + '\n' + util.inspect(err, false, 10, isatty);
                    if (err.stack) {
                        args[i] += '\n' + err.stack.split('\n').splice(1).join('\n');
                    }
                }
            }

            args.push('\n' + loggedAt);

            log.apply(null, ['ERROR'].concat(args));
        },

        warn: function() {
            if(!(options.logLevel & 2)){
                return;
            }
            log.apply(null, ['WARN'].concat(Array.prototype.slice.call(arguments)));
        },

        warning: function() {
            if(!(options.logLevel & 2)){
                return;
            }
            log.apply(null, ['WARN'].concat(Array.prototype.slice.call(arguments)));
        },

        expressLogger: function (options) {
            if(!(options.logLevel & 8)){
                return;
            }

            if ('object' == typeof options) {
                options = options || {};
            } else if (options) {
                options = {
                    format: options
                };
            } else {
                options = {};
            }

            options.stream = {
                write: function (str) {
                    log.apply(null, ['HTTP', str.trim()] );
                }
            };

            return express.logger(options);
        }

    };
};
