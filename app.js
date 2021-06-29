var yargs = require('yargs');
var fs = require('fs');
var os = require('os');
var path = require('path');
var rc = require('rc');
var Ansi = require('ascii-art-ansi');
var mkdirp = require('mkdirp');
var CJSON = require('comment-json');

var readCommentJSONSync = function(file, defaultConfig){
    var config;
    try{
        config = CJSON.parse(fs.readFileSync(file).toString());
        config[k] = v;
    }catch(ex){
        config = CJSON.parse(defaultConfig);
    }
    return config;
}

var writeCommentJSONSync = function(file, config){
    return fs.writeFileSync(file, CJSON.stringify(config, null, 2));
}

var writeCommentJSON = function(file, config, cb){
    fs.writeFile(file, CJSON.stringify(config, null, 2), cb);
}

var styleStr = function(str, style){
    return Ansi.codes(str, style, true);
}

var styles = {
    actionColor : 'blue',
    stringColor : 'yellow',
    flagColor : 'cyan',
    sigColor : 'magenta'
}

var CLAppPlugin = function(name, opts){
    this.name = name;
    this.data = opts || {};
}

CLAppPlugin.prototype.configureCLApp = function(app){
    app.argument({
        name : this.name,
        type : 'boolean',
        description: 'use the '+this.name+' personality'
    });
};

CLAppPlugin.prototype.isEnabled = function(argv){
    return !!argv[this.name];
};

var CLApp = function(appName, opts){
    this.options = opts || {};
    this.name = appName;
    if(!this.options.defaults) this.options.defaults = '//file created by '+"\n"+'{}';
    if(!this.options.config) this.options.config = {};
    this.commands = {};
}

CLApp.prototype.header = function(headerText){
    var header = '';
    if(headerText){
        header = headerText;
    }else{
        if(this.hasPluginsEnabled){
            header += 'Plugins:'+"\n"+'    '+(sourceList.length?sourceList.join(', '):'N/A')+"\n\n";
        }
    }
    this.headerText = header;
}

var usage = 'Usage: $0 <command> [options] <target>';
CLApp.prototype.usage = function(value){
    if(value){
        usage = value;
    }
    return usage;
}

CLApp.prototype.help = function(){
    var chr = getCharFor('help')
    yargs.help(chr).alias(chr, 'help');
}

var argv;

CLApp.prototype.argv = function(){
    return argv || (argv = yargs.argv);
}

CLApp.prototype.run = function(cb){
    try{
        var args = this.argv();
        var action = args._.shift();
        var target = args._.shift();
        if(!this.commands[action]){
            var err = new Error('unrecognized action: '+ action);
            if(!cb) throw err;
            else cb(err);
        }else{
            try{
                this.commands[action](args, target, function(){
                    if(cb) cb();
                });
            }catch(ex){
                cb(ex);
            }
        }
        return args;
    }catch(ex){
        cb(ex);
    }
}

CLApp.prototype.footer = function(footerText){
    //todo make sure command has been called
    var text = footerText;
    if((!text) && this.options.copyright && this.options.copystart){
        var year = (new Date()).getFullYear()+'';
        var range = (this.options.copystart === year)?year:this.options.copystart+' - '+year;
        yargs.epilog('[ © '+range+' : '+this.options.copyright+' ]');
    }else{
        yargs.epilog(footerText);
    }
    yargs.usage(this.headerText+"\n"+this.usage());
}

CLApp.prototype.argument = function(name, type, description, num, choices, forceChar){
    var options = typeof name === 'object'?name:{
        name:name,
        type:type,
        description:description,
        num:num,
        choices:choices,
        forceChar:forceChar
    }
    var chr = options.forceChar || getCharFor(options.name);
    if(options.forceChar){
        fwd[chr] = options.name;
        rvs[options.name] = chr;
    }
    if(!yargs[options.type]) throw new Error('Unsupported type: '+options.type);
    if(options.type !== 'string'){
        yargs[options.type](chr);
    }
    yargs.alias(chr, options.name);
    yargs.nargs(chr, options.num || (options.type === 'boolean'?0:1))
    var post = '';
    if(options.choices){
        //yargs.choices(chr, choices).skipValidation(chr);
        var chunked = chunkLines(options.choices.map(function(name){
            return styleStr(
                ' '+name+' ',
                'white_bg+black+encircled',
                true
            );
        }), ', ', 44, 55, true, {
            preindent: styleStr('Choices: ', 'yellow+bold', true)
        });
        post = "\n\n"+chunked+"\n";
        //console.log('|'+chunked+'|')
        /*
        post = "\n"+'[ '+choices.map(function(name){
            return styleStr(name, 'grey_bg+white+bold', true);
        }).join(', ')+' ]';
        //*/
    }
    yargs.describe(chr, options.description+(post?post:''))
};
CLApp.prototype.command = function(name, description, examples, action){
    var options = typeof name === 'object'?name:{
        name:name,
        description:description,
        action: action,
        examples:(examples || [])
    }
    this.commands[options.name] = options.action;
    var coloredName = styleStr(options.name, styles.actionColor, true);
    var rgx = new RegExp(' '+options.name+' ', 'g');
    var styleThings = function(str){
        return str
            .replace( rgx, ' '+coloredName+' ' )
            .replace( /(".*?")/g, function(i, match){
                return styleStr(match, styles.stringColor, true);
            }).replace( /(-.(?: |$))/g, function(i, match){
                return styleStr(match, styles.flagColor, true);
            })
    };
    yargs.command(coloredName, options.description);
    options.examples.forEach(function(example){
        if(Array.isArray(example)){
            yargs.example(styleThings(example[0]), styleThings(example[1]));
        }else{
            yargs.example(styleThings(example));
        }
    })
};

CLApp.prototype.configDir = function(cb){
    this.hasConfigDirEnabled = true;
    cb();
}

CLApp.prototype.config = function(cb, autoInit){
    var file = path.join(this.rootDir(), 'config');
    if(this.hasConfigDirEnabled){

        var result = this.computedConfig || (
            (this.computedConfig = rc(this.name, {}))// &&
            //(this.computedConfig = rc(this.name, this.options.config))
        );
        var commentCompatible;
        try{
            commentCompatible = readCommentJSONSync(file, this.options.defaults);
        }catch(ex){
            console.log(ex);
            commentCompatible = {};
        }
        CJSON.assign(commentCompatible, this.rawConfig);
        setTimeout(function(){
            if(cb) cb(null, commentCompatible, function(config, callb){
                writeCommentJSON(file, config, function(){
                    if(callb) callb();
                });
            });
        },0);
        return result;
    }else{
        if(autoInit){
            var ob = this;
            return this.configDir(function(){
                try{
                    ob.config(cb);
                }catch(ex){
                    console.log(ex);
                }
            }) || this.options.config;
        }
        return this.options.config;
    }
}

CLApp.prototype.defaultPluginDir = function(cb){
    return path.join(this.rootDir(), 'node_modules');
}

CLApp.prototype.rootDir = function(cb){
    return path.join(os.homedir(), '.'+this.name);
}

var subvalue = (obj, path, val) => {
    var keys = path.split('.');
    var lastKey = keys.pop();
    var lastObj = keys.reduce((obj, key) =>
        obj[key] = obj[key] || {},
        obj);
    return lastObj[lastKey] = val;
};

CLApp.prototype.useable = function(str, callback){
    var verb = typeof str === 'function'?'use':str;
    var cb = typeof str === 'function'?str:callback;
    var ob = this;
    this.config(function(err, config, save){
        ob[verb] = function(changes, cb){
            Object.keys(changes).forEach(function(key){
                subvalue(config, key, changes[key]);
            });
            save(config, cb);
        };
        cb(err, config, save);
    }, true);
    this.command({
        name : verb,
        description: 'set the local configuration of a value',
        examples: [],
        action : function(argv, key){
            var value = argv._.shift();
            var changes = {};
            changes[key] = value;
            ob[verb](changes, function(){ });
        }
    });
}

CLApp.prototype.plugin = function(type, name){
    return lastPlugs[type] && lastPlugs[type].find(function(plug){
        return plug.name === name;
    }).data;
}

//as long as used statically, this reference is safe
var lastTypes;
var lastPlugs;
var lastFlatPlugs;

CLApp.prototype.plugins = function(types, cb){
    lastTypes = types;
    this.hasPluginsEnabled = true;
    Object.keys(types).forEach(function(typeName){
        if(types[typeName].prefix && !types[typeName].detect){
            var prefix = types[typeName].prefix;
            types[typeName].detect = function(s){
                return s.indexOf(prefix) === 0
            };
        }
    });
    var getPlugins = function(arg1, cb){ //loadPluginsByType or 1type
        var callback = (typeof arg1 === 'function' && !cb)?arg1:cb;
        var type = (typeof arg1 === 'function' && !cb)?'*':arg1;
        if(typeNames.indexOf(type) === -1 && type !== '*'){
            return callback(new Error('type not recognized:'+type));
        }
        fs.readdir(ob.defaultPluginDir(), function(err, list){
            if(arg1 === '*'){
                var result = {};
                var resultObs = {};
                typeNames.forEach(function(typeName){
                    if(types[typeName] && types[typeName].detect){
                        result[typeName] = list.filter(function(item){
                            return types[typeName].detect(item);
                        });
                        var pth;

                        resultObs[typeName] = result[typeName].map(function(item){
                            var pth = path.join(ob.defaultPluginDir(), item, 'package.json');
                            var name = item.split('-').pop();
                            var pkg = require(pth);
                            if(pkg.main){
                                var mainPath = path.join(ob.defaultPluginDir(), item, pkg.main);
                                pkg = require(mainPath)
                            }
                            return new CLAppPlugin(name, pkg);
                        })
                    }
                });
                lastPlugs = resultObs;
                cb(null, result, resultObs);
            }else{
                var filtered = list.filter(function(item){
                    return typeNames.reduce(function(value, typeName){
                        return value || (
                            (type === '*' || type === typeName) &&
                            types[type] &&
                            types[type].detect(item)
                        );
                    }, false);
                });
                lastFlatPlugs = filtered.map(function(item){
                    var pth = path.join(ob.defaultPluginDir(), item, 'package.json');
                    var name = item.split('-').pop();
                    return new CLAppPlugin(name, require(pth));
                })
                cb(null, filtered, lastFlatPlugs);
            }
        })
    };
    this.command({
        name : 'install',
        description: 'install a particular plugin, by type',
        examples: [],
        action : function(argv, type){
            // format is: <bin> install <type> <name>
            var plugin = argv._.pop();
            if(!plugin) throw new Error('Plugins require a type and a name');
            getPlugins('*', function(err, plugins){
                if(!plugins[type]){
                    throw new Error('Unknown plugin type: '+type);
                }
                var stripped = plugins[type].map(function(str){
                    return str.split('-').pop();
                });
                argv._.unshift(plugin);
                var plugs = argv._;
                plugs.forEach(function(plug){
                    if(stripped.indexOf(plug) !== -1){
                        throw new Error('This plugin is already installed: '+plug);
                    }
                });
                var modules = plugs.map(function(plug){
                    return (types[type].prefix || '') + plug;
                });
                installInDir(modules, ob.modulePath, function(err, data){
                    console.log('INSTALLED:'+type, modules);
                });
            });
        }
    });
    this.modulePath = this.defaultPluginDir();
    var typeNames = Object.keys(types);
    var ob = this;
    var done = function(){
        return cb(null, ob.config(), getPlugins);
    }
    if(!this.hasConfigDirEnabled) this.configDir(done);
    else done();
}

var ensureDir = function(path, cb){
    fs.stat(path, function(err, stat){
        if(err){
            mkdirp(path).then(function(made){
                console.log(`made directories, starting with ${made}`)
                cb();
            }).catch(function(err2){
                cb(err2);
            })
        }else{
            cb();
        }
    })
}

var ensureConfig = function(path, cb){
    ensureDir(path, function(err){
        if(err) return cb(err);

    })
}

var installInDir = function(modules, dir, cb){
    var startDir = process.cwd();
    process.chdir(dir);
    var wrappedCb = function(err, res){
        process.chdir(startDir);
        cb(err, res);
    }
    var npm = require('npm');
    npm.load(function(err){
        if(err) return wrappedCb(err);
        npm.commands.install(modules, function(er, data) {
            if(er) return wrappedCb(er);
            wrappedCb(null, data);
        });

        npm.on('log', function(message) {
          // log installation progress
          console.log(message);
        });
    });
}


var fwd = {};
var rvs = {};

var getCharFor = function(cmd, preferCaps){
    var chars = cmd.split('');
    var chr;
    var inverse;
    for(var lcv=0; lcv < chars.length; lcv++){
        chr = chars[lcv];
        if(preferCaps){
            chr = chr.toUpperCase();
            inverse = chr.toLowerCase();
        }else{
            chr = chr.toLowerCase();
            inverse = chr.toUpperCase();
        }
        if(!fwd[chr]){
            fwd[chr] = cmd;
            rvs[cmd] = chr;
            return chr;
        }
        if(!fwd[inverse]){
            fwd[inverse] = cmd;
            rvs[cmd] = inverse;
            return inverse;
        }
    }
}

var padStart = function(s, diff, p){
    var pad = p || ' ';
    //var diff = n - Ansi.length(s);
    var padding = '';
    for(var lcv=0; lcv < diff; lcv++){
        padding += pad;
    }
    //console.log(s, n, diff, '|'+padding+'|')
    return padding+s;
}

var chunkLines = function(chunks, delimiter, length, flushTo, process, opts){
    var options = opts || {};
    var lines = [];
    var line = '';
    chunks.forEach(function(chunk){
        var lineLen = Ansi.length(line);
        var chunkLen = Ansi.length(chunk);
        if( (lineLen + chunkLen + delimiter.length) > length){
            lines.push(line);
            line = '';
        }
        line += (chunk + delimiter);
    });
    line = line.substring(0, line.length - (delimiter.length-1))
    lines.push(line);
    if(flushTo){
        lines.forEach(function(line, index){
            var lineLen = Ansi.length(lines[index]);
            var diff = flushTo - lineLen;
            if(process === true){
                diff = flushTo - length;
            }
            if(diff > 0){
                lines[index] = padStart(lines[index], diff, "⠀");
                if(options.preindent && index === 0){
                    var preindentOffset = diff - Ansi.length(options.preindent)-1;
                    lines[0] = Ansi.substring(lines[0], 0, preindentOffset)+
                        options.preindent+
                        Ansi.substring(lines[0], diff)

                }
            }
        });
    }
    return (process && process !== true)?process(lines).join("\n"):lines.join("\n");
}
module.exports = CLApp;
