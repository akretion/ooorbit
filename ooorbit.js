// OOORBIT
// copyright Akretion
// author Raphaël Valyi
// all rights reserved
var Ooorbit = {};
Ooorbit.Resource = function() {};
Ooorbit.Resource.config = {
    prefix: '/ooorest/',
    database: 'database',
    user: 'admin'
};
//Abstract the Ajax call away to make it compatible with major libs
Ooorbit.AjaxHandler = function(url, options) {
    options.async = options.asynchronous;
    options.type = options.method;
    options.data = options.parameters;
    options.url = url;
    if (typeof(Ajax) != 'undefined') { //Prototype
        options.onComplete = function(transport, json) {
            var res = options.global_callback(transport);
            options.user_callback(res);
        };
        return new Ajax.Request(url, options).transport;
    }
    else if (typeof(jQuery) != 'undefined') { //JQuery
        $.ajaxSetup({
            cache: false
        });
        options.complete = function(transport, textStatus) {
            options.user_callback(options.global_callback(transport));
        };
        return $.ajax(url, options);
    }
    else if (typeof(Ext) != 'undefined') { //Ext
        options.params = options.parameters;
        options.success = function(transport) {
            var res = options.global_callback(transport);
            options.user_callback(res);
        };
        options.failure = function(transport) {
            var res = options.global_callback(transport);
            options.user_callback(res);
        };
        //options.error = Ooorbit.errorHandler;
        return Ext.Ajax.request(options);
    }
    else if (typeof(UrlFetchApp) != 'undefined') { //Google
        options.onComplete = function(transport, json) {
            var res = option.global_callback(transport);
            options.user_callback(res);
        };
        return {
            'status': 200,
            'responseText': UrlFetchApp.fetch(url, options).getContentText()
        }; //TODO put actual status
    }
    else {
        alert('Hey dude! you need some Ajax lib: JQuery, Prototype or Sencha...');
    }
};

Ooorbit.errorHandler = function(transport, textStatus, errorThrown) {
    try {
        eval("var error = " + transport.responseText);
        alert(error.openerp_error);
    }
    catch(err){
        var error = transport.statusText
    };
    return error;
};

Ooorbit.singleOrigin = true;
// Doing it this way forces the validation of the syntax but gives flexibility enough to rename the new class.
Ooorbit.Constructor = function(model) {
    return (function CONSTRUCTOR() {
        this.klass = CONSTRUCTOR;
        this.initialize.apply(this, arguments);
        this.after_initialization.apply(this, arguments);
    }).toString().replace(/CONSTRUCTOR/g, model);
};
_.extend(Ooorbit.Resource, {
    configure: function(options) {
        options = options || {};
        this.config.prefix = options.prefix || '/ooorest/'; //TODO set all options properly
        return this.config;
    },
    login: function(login, password, database, callback) {
        var loginWork = bind(this, function(transport) {
            return transport;
        });
        var url = "/session/login.json?login=" + login + "&password=" + password + "&database=" + database;
        return this.requestAndParse('json', loginWork, url, {}, callback, this._remote);
    },
    logout: function(callback) {
        var logoutWork = bind(this, function(transport) {
            return transport;
        });
        var url = "/session/logout.json";
        return this.requestAndParse('json', logoutWork, url, {}, callback, this._remote);
    },
    get: function(model) {
        options = {};
        options.plural = _(model).toOpenERPName();
        options.format = 'json';
        options.prefix = this.config.prefix;
        return this.model(model, options);
    },
    model: function(model, options) {
        var new_model = null;
        new_model = eval(model + " = " + Ooorbit.Constructor(model));
        model = _(model).toOpenERPName();
        _.extend(new_model, Ooorbit.Resource);
        new_model.prototype = new Ooorbit.Resource();
        if (!options) options = {};
        var default_options = {
            format: "json",
            singular: _(model).underscore(),
            name: model,
            defaultParams: {}
        };
        options = _.extend(default_options, options);
        options.format = options.format.toLowerCase();
        options.remote = false;
        // Establish prefix
        if (typeof(window) == 'undefined') {
            var default_prefix = "http://localhost/";
        }
        else {
            var default_prefix = window.location.protocol + "//" + window.location.hostname + (window.location.port ? ":" + window.location.port : "");
        }
        if (options.prefix && options.prefix.match(/^https?:/)) options.remote = true;
        if (!options.prefix) options.prefix = default_prefix;
        if (!options.prefix.match(/^(https?|file):/)) options.prefix = default_prefix + (options.prefix.match(/^\//) ? "" : "/") + options.prefix;
        options.prefix = options.prefix.replace(/\b\/+$/, "");
        // Establish custom URLs
        options.urls = _.extend(this._default_urls(options), options.urls);
        // Assign options to model
        new_model.name = model;
        new_model.options = options;
        for (var opt in options)
        new_model["_" + opt] = options[opt];
        // Establish custom URL helpers
        for (var url in options.urls)
        eval('new_model._' + url + '_url = function(params) {return this._url_for("' + url + '", params);}');
        if (options.checkNew) this.buildAttributes(new_model, options);
        if (typeof(window) != 'undefined') {
            window[model] = new_model;
        }
        return new_model;
    },
    buildAttributes: function(model, options) {
        model = model || this;
        var async = options.asynchronous;
        if (async === null) async = true;
        var buildWork = bind(model, function(doc) {
            this._attributes = this._attributesFromJSON(doc);
        });
        model.requestAndParse(options.format, buildWork, model._new_url(), {
            asynchronous: async
        });
    },
    loadRemoteJSON: function(url, callback, user_callback) {
        // tack on user_callback if there is one, and only if it's really a function
        if (typeof(user_callback) == "function") ooorbitCallback = function(doc) {
            user_callback(callback(doc));
        };
        else ooorbitCallback = callback;
        var script = document.createElement("script");
        script.type = "text/javascript";
        if (url.indexOf("?") == -1) url += "?";
        else url += "&";
        url += "callback=ooorbitCallback";
        script.src = url;
        document.firstChild.appendChild(script);
    },
    requestAndParse: function(format, callback, url, options, user_callback, remote) {
        if (remote && format == "json" && user_callback && Ooorbit.singleOrigin === true) return this.loadRemoteJSON(url, callback, user_callback);
        parse_and_callback = function(transport) {
            if (transport.status != 200) {
                return Ooorbit.errorHandler(transport);
            }
            eval("var attributes = " + transport.responseText); // hashes need this kind of eval
            return callback(attributes);
        };
        // most parse requests are going to be a GET
        if (!(options.postBody || options.parameters || options.postbody || options.method == "post")) {
            options.method = "get";
        }
        return this.request(parse_and_callback, url, options, user_callback);
    },
    // Helper to aid in handling either async or synchronous requests
    request: function(callback, url, options, user_callback) {
        if (user_callback) {
            options.asynchronous = true;
            // if an options hash was given instead of a callback
            if (typeof(user_callback) == "object") {
                for (var x in user_callback)
                options[x] = user_callback[x];
                user_callback = options.onComplete;
            }
        }
        else user_callback = function(arg) {
            return arg;
        };
        if (options.asynchronous) {
            options.global_callback = callback;
            options.user_callback = user_callback;
            return Ooorbit.AjaxHandler(url, options);
        }
        else {
            options.asynchronous = false;
            return callback(Ooorbit.AjaxHandler(url, options));
        }
    },
    call: function(rpc_method, ids, params_list, params_hash, callback) { //TODO refactor with instance call!
        params_hash = typeof(params_hash) != 'undefined' ? params_hash : {};
        if (typeof(params_list) == 'object' && params_list.length < 1) {
            params_hash.empty_params = "true";
        }
        if (!callback && typeof(params_hash) == "function") {
            callback = params_hash;
            params_hash = {};
        }
        if (!callback && typeof(params_list) == "function") {
            callback = params_list;
            params_list = [];
        }
        params_list = typeof(params_list) != 'undefined' ? params_list : [];
        var c = 0;
        params_list.forEach(function(item) {
            if (typeof(item) === 'object' && !(item instanceof Array)) {
                for (var prop in item) {
                    params_hash["p" + c + "[" + prop + "]"] = item[prop];
                }
            } else {
                params_hash["p" + c] = item;
            }
            c++;
        });
        params_hash.rpc_method = rpc_method;
        var callWork = bind(this, function(transport) {
            return transport;
        });
        //var url = this._call_url(params);
        var url = this.options.prefix + "/" + this.options.singular + "/" + ids.join(',') + "/call." + this.options.format;
        return this.requestAndParse('json', callWork, url, {
            parameters: params_hash,
            method: "post"
        }, callback);
    },
    find: function(id, params, callback) {
        // allow a params hash to be omitted and a callback function given directly
        if (!callback && typeof(params) == "function") {
            callback = params;
            params = null;
        }
        var findAllWork = bind(this, function(doc) {
            if (!doc) return null;
            var collection = this._loadCollection(doc);
            if (!collection) return null;
            // This is better than requiring the controller to support a "limit" parameter
            if (id == "first") return collection[0];
            return collection;
        });
        var findOneWork = bind(this, function(doc) {
            if (!doc) return null;
            var base = this._loadSingle(doc);
            // if there were no properties, it was probably not actually loaded
            if (!base || base._properties.length === 0) return null;
            // even if the ID didn't come back, we obviously knew the ID to search with, so set it
            if (!_(base._properties).include("id")) base._setAttribute("id", parseInt(id));
            return base;
        });
        if (!params) params = {};
        if (id == "first" || id == "all") {
            var url = this._all_url(params);
            return this.requestAndParse(this._format, findAllWork, url, {}, callback, this._remote);
        }
        else if (id instanceof Array) {
            params.ids = id;
            var url = this._list_url(params);
            return this.requestAndParse(this._format, findAllWork, url, {}, callback, this._remote);
        }
        else {
            if (isNaN(parseInt(id))) return null;
            params.id = id;
            var url = this._show_url(params);
            return this.requestAndParse(this._format, findOneWork, url, {}, callback, this._remote);
        }
    },
    build: function(attributes) {
        return new this(attributes);
    },
    create: function(attributes, params, callback) {
        // allow a params hash to be omitted and a callback function given directly
        if (!callback && typeof(params) == "function") {
            callback = params;
            params = null;
        }
        var base = new this(attributes);
        createWork = bind(this, function(saved) {
            return callback(base);
        });
        if (callback) {
            return base.save(createWork);
        }
        else {
            base.save();
            return base;
        }
    },
    // Destroys a REST object.  Can be used as follows:
    // object.destroy() - when called on an instance of a model, destroys that instance
    // Model.destroy(1) - destroys the Model object with ID 1
    // Model.destroy({parent: 3, id: 1}) - destroys the Model object with Parent ID 3 and ID 1
    //
    // Any of these forms can also be passed a callback function as an additional parameter and it works as you expect.
    destroy: function(params, callback) {
        if (typeof(params) == "function") {
            callback = params;
            params = null;
        }
        if (typeof(params) == "number") {
            params = {
                id: params
            };
        }
        params.id = params.id || this.id;
        if (!params.id) return false;
        var destroyWork = bind(this, function(transport) {
            if (transport.status == 200) {
                if (!params.id || this.id == params.id) this.id = null;
                return this;
            }
            else return false;
        });
        return this.request(destroyWork, this._destroy_url(params), {
            method: "delete"
        }, callback);
    },
    _interpolate: function(string, params) {
        if (!params) return string;
        var result = string;
        _(params).each(function(value, key) {
            var re = new RegExp(":" + key, "g");
            if (result.match(re)) {
                result = result.replace(re, value);
                delete params[key];
            }
        });
        return result;
    },
    _url_for: function(action, params) {
        if (!this._urls[action]) return "";
        // if an integer is sent, it's assumed just the ID is a parameter
        if (typeof(params) == "number") params = {
            id: params
        };
        params = _(_(this._defaultParams).clone()).extend(params);
        var url = this._interpolate(this._prefix + this._urls[action], params);
        return url + (params && !(true === _(params).isEmpty()) ? "?" + _(params).toQueryString() : "");
    },
    _default_urls: function(options) {
        urls = {
            'show': "/" + options.plural + "/:id." + options.format,
            'all': "/" + options.plural + "." + options.format,
            'list': "/" + options.plural + "/:ids." + options.format,
            'new': "/" + options.plural + "/new." + options.format
        };
        urls.create = urls.list;
        urls.destroy = urls.update = urls.show;
        return urls;
    },
    // Converts a JSON hash returns from ActiveRecord::Base#to_json into a hash of attribute values
    // Does not handle associations, as AR's #to_json doesn't either
    // Also, JSON doesn't include room to store types, so little auto-transforming is done here (just on 'id')
    _attributesFromJSON: function(json) {
        if (!json || json.constructor != Object) return false;
        if (json.attributes) json = json.attributes;
        var attributes = {};
        var i = 0;
        if (json[this.options.name]) json = json[this.options.name];
        for (var attr in json) {
            var value = json[attr];
            if (attr == "id") value = parseInt(value);
            else if (attr.match(/(created_at|created_on|updated_at|updated_on)/)) {
                var date = Date.parse(value);
                if (date && !isNaN(date)) value = date;
            }
            attributes[attr] = value;
            i += 1;
        }
        if (i === 0) return false; // empty hashes should just return false
        return attributes;
    },
    _loadSingle: function(doc) {
        var attributes;
        attributes = this._attributesFromJSON(doc);
        return this.build(attributes);
    },
    _loadCollection: function(doc) {
        return _(doc).map(bind(this, function(item) {
            return this.build(this._attributesFromJSON(item));
        }));
    }
});
_.extend(Ooorbit.Resource.prototype, {
    initialize: function(attributes) {
        // Initialize no attributes, no associations
        this._properties = [];
        this._associations = [];
        this.setAttributes(this.klass._attributes || {});
        this.setAttributes(attributes);
        // Initialize with no errors
        this.errors = [];
        // Establish custom URL helpers
        for (var url in this.klass._urls)
        eval('this._' + url + '_url = function(params) {return this._url_for("' + url + '", params);}');
    },
    after_initialization: function() {},
    new_record: function() {
        return !(this.id);
    },
    valid: function() {
        return true === _(this.errors).isEmpty();
    },
    reload: function(callback) {
        var reloadWork = bind(this, function(copy) {
            this._resetAttributes(copy.attributes(true));
            if (callback) return callback(this);
            else return this;
        });
        if (this.id) {
            if (callback) return this.klass.find(this.id, {}, reloadWork);
            else return reloadWork(this.klass.find(this.id));
        }
        else return this;
    },
    // Destroys a REST object.  Can be used as follows:
    // object.destroy() - when called on an instance of a model, destroys that instance
    // Model.destroy(1) - destroys the Model object with ID 1
    // Model.destroy({parent: 3, id: 1}) - destroys the Model object with Parent ID 3 and ID 1
    //
    // Any of these forms can also be passed a callback function as an additional parameter and it works as you expect.
    destroy: function(params, callback) {
        if (params === undefined) {
            params = {};
        }
        if (typeof(params) == "function") {
            callback = params;
            params = {};
        }
        if (typeof(params) == "number") {
            params = {
                id: params
            };
        }
        if (!params.id) {
            params.id = this.id;
        }
        if (!params.id) return false;
        // collect params from instance if we're being called as an instance method
        if (this._properties !== undefined) {
            _(this._properties).each(bind(this, function(value, i) {
                if (params[value] === undefined) {
                    params[value] = this[value];
                }
            }));
        }
        var destroyWork = bind(this, function(transport) {
            if (transport.status == 200) {
                if (!params.id || this.id == params.id) this.id = null;
                return this;
            }
            else return false;
        });
        return this.klass.request(destroyWork, this._destroy_url(params), {
            method: "delete"
        }, callback);
    },
    save: function(params, callback) {
        // allow a params hash to be omitted and a callback function given directly
        if (!callback && typeof(params) == "function") {
            callback = params;
            params = null;
        }
        var saveWork = bind(this, function(transport) {
            var saved = false;
            if (transport.responseText && (_(transport.responseText).strip() !== "")) {
                var errors = this._errorsFrom(transport.responseText);
                if (errors) this._setErrors(errors);
                else {
                    var attributes = this._attributesFromJSON(transport.responseText);
                    if (attributes) this._resetAttributes(attributes);
                }
            }
            // Get ID from the location header if it's there
            if (this.new_record() && transport.status == 201) {
                loc = transport.getResponseHeader("location");
                if (loc) {
                    id = parseInt(loc.match(/\/([^\/]*?)(\.\w+)?$/)[1]);
                    if (!isNaN(id)) this._setProperty("id", id);
                }
            }
            return (transport.status >= 200 && transport.status < 300 && this.errors.length === 0);
        });
        // reset errors
        this._setErrors([]);
        var url = null;
        var method = null;
        // collect params
        var objParams = {};
        var urlParams = _.clone(this.klass._defaultParams);
        if (params) {
            _.extend(urlParams, params);
        }
        _(this._properties).each(bind(this, function(value, i) {
            objParams[this.klass._singular + "[" + value + "]"] = this[value];
            urlParams[value] = this[value];
        }));
        // distinguish between create and update
        if (this.new_record()) {
            url = this._create_url(urlParams);
            method = "post";
        }
        else {
            url = this._update_url(urlParams);
            method = "put";
        }
        // send the request
        return this.klass.request(saveWork, url, {
            parameters: objParams,
            method: method
        }, callback);
    },
    call: function(rpc_method, params_list, params_hash, callback) {
        params_hash = typeof(params_hash) != 'undefined' ? params_hash : {};
        if (typeof(params_list) == 'object' && params_list.length < 1) {
            params_hash.empty_params = "true";
        }
        if (!callback && typeof(params_hash) == "function") {
            callback = params_hash;
            params_hash = {};
        }
        if (!callback && typeof(params_list) == "function") {
            callback = params_list;
            params_list = [];
        }
        params_list = typeof(params_list) != 'undefined' ? params_list : [];
        var c = 0;
        params_list.forEach(function(item) {
            params_hash["p" + c] = item;
            c++;
        });
        params_hash.rpc_method = rpc_method;
        var callWork = bind(this, function(transport) {
            return transport;
        });
        //var url = this._call_url(params);
        var url = this.klass.options.prefix + "/" + this.klass.options.singular + "/" + this.id + "/call." + this.klass.options.format;
        return this.klass.requestAndParse('json', callWork, url, {
            parameters: params_hash,
            method: "post"
        }, callback);
    },
    setAttributes: function(attributes) {
        _(attributes).each(_.bind(function(value, key) {
            this._setAttribute(key, value);
        }, this));
        return attributes;
    },
    updateAttributes: function(attributes, callback) {
        this.setAttributes(attributes);
        return this.save(callback);
    },
    // mimics ActiveRecord's behavior of omitting associations, but keeping foreign keys
    attributes: function(include_associations) {
        var attributes = {};
        for (var i = 0; i < this._properties.length; i++)
        attributes[this._properties[i]] = this[this._properties[i]];
        if (include_associations) {
            for (var i = 0; i < this._associations.length; i++)
            attributes[this._associations[i]] = this[this._associations[i]];
        }
        return attributes;
    },
/*
    Internal methods.
  */
    _attributesFromJSON: function() {
        return this.klass._attributesFromJSON.apply(this.klass, arguments);
    },
    _errorsFrom: function(raw) {
        return this._errorsFromJSON(raw);
    },
    // Pulls errors from JSON
    _errorsFromJSON: function(json) {
        try {
            json = eval(json); // okay for arrays
        }
        catch (e) {
            return false;
        }
        if (!(json && json.constructor == Array && json[0] && json[0].constructor == Array)) return false;
        return json.map(function(pair) {
            return _(pair[0]).capitalize() + " " + pair[1];
        });
    },
    // Sets errors with an array.  Could be extended at some point to include breaking error messages into pairs (attribute, msg).
    _setErrors: function(errors) {
        this.errors = errors;
    },
    // Sets all attributes and associations at once
    // Deciding between the two on whether the attribute is a complex object or a scalar
    _resetAttributes: function(attributes) {
        this._clear();
        for (var attr in attributes)
        this._setAttribute(attr, attributes[attr]);
    },
    _setAttribute: function(attribute, value) {
        if (value && typeof(value) == "object" && value.constructor != Date) this._setAssociation(attribute, value);
        else this._setProperty(attribute, value);
    },
    _setProperties: function(properties) {
        this._clearProperties();
        for (var prop in properties)
        this._setProperty(prop, properties[prop]);
    },
    _setAssociations: function(associations) {
        this._clearAssociations();
        for (var assoc in associations)
        this._setAssociation(assoc, associations[assoc]);
    },
    _setProperty: function(property, value) {
        this[property] = value;
        if (!(_(this._properties).include(property))) this._properties.push(property);
    },
    _setAssociation: function(association, value) {
        this[association] = value;
        if (!(_(this._associations).include(association))) this._associations.push(association);
    },
    _clear: function() {
        this._clearProperties();
        this._clearAssociations();
    },
    _clearProperties: function() {
        for (var i = 0; i < this._properties.length; i++)
        this[this._properties[i]] = null;
        this._properties = [];
    },
    _clearAssociations: function() {
        for (var i = 0; i < this._associations.length; i++)
        this[this._associations[i]] = null;
        this._associations = [];
    },
    // helper URLs
    _url_for: function(action, params) {
        if (!params) params = this.id;
        if (typeof(params) == "object" && !params.id) params.id = this.id;
        return this.klass._url_for(action, params);
    }
});
// This bind function is just a reversal of Underscore's bind arguments to make it look a bit more standard

function bind(context, func) {
    return _.bind(func, context);
}
// If there is no object already called Resource, we define one to make things a little cleaner for us.
if (typeof(Resource) == "undefined") {
    var Resource = Ooorbit.Resource;
}
_.mixin({
    underscore: function(string) {
        return string.replace(/::/g, '/').replace(/([A-Z]+)([A-Z][a-z])/g, '$1_$2').replace(/([a-z\d])([A-Z])/g, '$1_$2').replace(/-/g, '_').toLowerCase();
    },
    toQueryPair: function(key, value) {
        if (_.isUndefined(value)) return key;
        return key + '=' + encodeURIComponent(value);
    },
    toQueryString: function(obj) {
        return _.reduce(obj, [], function(results, pvalue, pkey) {
            var key = encodeURIComponent(pkey),
                values = pvalue;
            if (values && typeof values == 'object') {
                if (_.isArray(values)) return results.concat(_.map(values, _.bind(_.toQueryPair, '', [key])));
            }
            else results.push(_.toQueryPair(key, values));
            return results;
        }).join('&');
    },
    capitalize: function(string) {
        return string.charAt(0).toUpperCase() + string.substring(1).toLowerCase();
    },
    toOpenERPName: function(string) {
        return string.replace(/([A-Z])/g, function($1) {
            return "_" + $1.toLowerCase();
        }).replace(/^\_*/g, "");
    }
});
