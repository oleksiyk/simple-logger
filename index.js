'use strict';

var util    = require('util');
var tty     = require('tty');
var _       = require('lodash');
var dgram   = require('dgram');

// is it a tty or file?
var isatty = tty.isatty(2) && tty.isatty(1);
var stdout = process.stdout, stderr = process.stderr;

var colors = {
    // text style
    bold          : '\x1B[1m',
    italic        : '\x1B[3m',
    underline     : '\x1B[4m',
    inverse       : '\x1B[7m',
    strikethrough : '\x1B[9m',
    // text colors
    default       : '\x1B[39m',
    black         : '\x1B[30m',
    blue          : '\x1B[34m',
    cyan          : '\x1B[36m',
    green         : '\x1B[32m',
    magenta       : '\x1B[35m',
    red           : '\x1B[31m',
    yellow        : '\x1B[33m',
    lgrey         : '\x1B[37m',
    dgrey         : '\x1B[90m',
    lred          : '\x1B[91m',
    lgreen        : '\x1B[92m',
    lyellow       : '\x1B[93m',
    lblue         : '\x1B[94m',
    lmagenta      : '\x1B[95m',
    lcyan         : '\x1B[96m',
    white         : '\x1B[97m',
    // background colors
    whiteBG       : '\x1B[47m',
    blackBG       : '\x1B[40m',
    blueBG        : '\x1B[44m',
    cyanBG        : '\x1B[46m',
    greenBG       : '\x1B[42m',
    magentaBG     : '\x1B[45m',
    redBG         : '\x1B[41m',
    yellowBG      : '\x1B[43m'
};

function colored(str, color) {
    // http://misc.flogisoft.com/bash/tip_colors_and_formatting
    var _color = (typeof color === 'string') ? colors[color] || colors.white : ('\x1B[38;5;' + color + 'm'); // 16 or 256 color scheme
    return _color + str + '\x1B[0m';
}

function Logger(options) {
    var self = this;

    self.hostname = require('os').hostname();
    self.logstashHosts = [];

    self.levels = {
        DEBUG : 24,
        TRACE : 172,
        INFO  : 70,
        WARN  : 'yellow',
        ERROR : 'red'
    };

    self.options = _.defaultsDeep(options || {}, {
        logLevel: 5,
        logstash: {
            enabled: false,
            connectionString: '127.0.0.1:9999',
            app: '-'
        },
        ttyColors: isatty && true,
        logFunction: null
    });

    options.logLevel = process.env.NSL_LEVEL ? parseInt(process.env.NSL_LEVEL) : options.logLevel;

    if (options.logstash.enabled) {
        self.logstashHosts = options.logstash.connectionString.split(',').map(function (hostStr) {
            var h = hostStr.trim().split(':');

            if (h.length < 2) {
                return undefined;
            }

            return {
                host: h[0],
                port: parseInt(h[1])
            };
        });

        self.logstashHosts = _.compact(self.logstashHosts);

        if (self.logstashHosts.length === 0) {
            throw new Error('No Logstash hosts defined');
        }

        self.udp = dgram.createSocket('udp4');
        self.udp.unref();

        self.udp.on('error', function (err) {
            self.options.logstash.enabled = false;
            self.error('Logger failed to send message to Logstash:', err);
            self.options.logstash.enabled = true;
        });
    }
}

module.exports = Logger;

Logger.prototype._log = function (level) {
    var ts = new Date().toISOString(), args = Array.prototype.slice.call(arguments, 1),
        data, packet, server;

    level = level || 'INFO';

    if (this.options.logstash.enabled) {
        data = {
            '@timestamp': ts,
            level: level,
            app: this.options.logstash.app,
            host: this.hostname,
            message: util.format.apply(null, args)
        };

        packet = new Buffer(JSON.stringify(data));
        server = this.logstashHosts[packet.length % this.logstashHosts.length];
        this.udp.send(packet, 0, packet.length, server.port, server.host);
    }

    if (typeof this.options.logFunction === 'function') {
        return this.options.logFunction.apply(null, arguments);
    }

    if (this.options.ttyColors) {
        level = colored(level, this.levels[level]);
        ts = colored(ts, 'dgrey');
    }

    args = [ts, level].concat(args);

    if (level === 'ERROR') {
        stderr.write(util.format.apply(null, args) + '\n');
    } else {
        stdout.write(util.format.apply(null, args) + '\n');
    }
};

Logger.prototype.log = function () {
    if (this.options.logLevel > 2) {
        this._log.apply(this, ['INFO'].concat(Array.prototype.slice.call(arguments)));
    }
};

Logger.prototype.debug = function () {
    if (this.options.logLevel > 3) {
        this._log.apply(this, ['DEBUG'].concat(Array.prototype.slice.call(arguments)));
    }
};

Logger.prototype.trace = function () {
    if (this.options.logLevel > 4) {
        this._log.apply(this, ['TRACE'].concat(Array.prototype.slice.call(arguments)));
    }
};

Logger.prototype.error = function error() {
    var loggedAt, stackErr, args, err, i;
    if (this.options.logLevel > 0) {
        // capture error() call location
        stackErr = new Error();
        Error.captureStackTrace(stackErr, error);
        loggedAt = '[' + stackErr.stack.split('\n')[1].trim() + ']';

        args = Array.prototype.slice.call(arguments);

        for (i = 0; i < args.length; i++) {
            if (args[i] instanceof Error) {
                err = args[i];
                args[i] = err.toString() + '\n' + util.inspect(err, false, 10, this.options.ttyColors);
                if (err.stack) {
                    args[i] += '\n' + err.stack.split('\n').splice(1).join('\n');
                }
            }
        }

        args.push('\n' + loggedAt);

        this._log.apply(this, ['ERROR'].concat(args));
    }
};

Logger.prototype.warn = function () {
    if (this.options.logLevel > 1) {
        this._log.apply(this, ['WARN'].concat(Array.prototype.slice.call(arguments)));
    }
};

Logger.prototype.mixin = function (dest, prefix) {
    var self = this;

    prefix = prefix || '';

    ['log', 'warn', 'debug', 'trace', 'error'].forEach(function (m) {
        dest[prefix + m] = self[m].bind(self);
    });
};
