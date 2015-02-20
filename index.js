var EventEmitter = require("events").EventEmitter
  , stream = require("stream")
  , util = require("util")
  , squel = require('squel')
  , stride = require('stride')
  , revalidator = require('revalidator')
  , ValidationError = require('./errors').ValidationError
  , PlacematError = require('./errors').PlacematError
  , ConstraintError = require('./errors').ConstraintError;

// Register js Date type with squel
squel.registerValueHandler(Date, function(date) {
  return date.getUTCFullYear() + '-' +
    ('00' + (date.getUTCMonth()+1)).slice(-2) + '-' +
    ('00' + date.getUTCDate()).slice(-2) + ' ' +
    ('00' + date.getUTCHours()).slice(-2) + ':' +
    ('00' + date.getUTCMinutes()).slice(-2) + ':' +
    ('00' + date.getUTCSeconds()).slice(-2);
});

var Table = exports.Table = function(tableName, idField, schema, options) {
  // Reorg args
  if (schema === undefined) {
    schema = idField;
    options = schema;
    idField = 'id';
  }

  options = options || {};

  EventEmitter.call(this);

  this.tableName = tableName;
  this.schema = schema;
  this.idField = idField;
  this.options = options;

  this._queryTableName = options.quoteTableName ? '`' + this.tableName + '`' :
    this.tableName;

  this.fieldNames = Object.keys(schema.fields);

  this.revalidatorSchema = {properties: {}};
  this.asyncValidators = {};

  for (var field in schema.fields) {
    if (schema.fields[field].validation) {
      this.revalidatorSchema.properties[field] = schema.fields[field].validation;
    }
  }
};
util.inherits(Table, EventEmitter);

// These functions can be overwritten as necessary
Table.prototype.preValidate = function preValidate(ids, data, isNew, cb, meta) {cb();};
Table.prototype.preSave = function preSave(ids, data, isNew, cb, meta) {cb();};
Table.prototype.preDelete = function preDelete(ids, cb, meta) {cb();};
Table.prototype.postSave = function postSave(ids, data, isNew, meta) {};
Table.prototype.postDelete = function postDelete(ids, meta) {};

Table.prototype._validate = function _validate(data, isNew, cb) {
  var self = this
    , i
    , fieldNames = Object.keys(data)
    , schema = self.revalidatorSchema
    , valError = new ValidationError();

  // Make sure each field being set is in the schema
  for (i = 0; i < fieldNames.length; i++) {
    if (this.fieldNames.indexOf(fieldNames[i]) < 0) {
      valError.addField(fieldNames[i], 'invalid field');
    }
  }
  if (valError.hasErrors()) {
    return cb(valError);
  }

  // If this is an update, only validate fields that are being changed
  if (!isNew) {
    schema = {properties: {}};
    for (i = 0; i < fieldNames.length; i++) {
      schema.properties[fieldNames[i]] = self.revalidatorSchema.properties[fieldNames[i]];
    }
  }

  var result = revalidator.validate(data, schema);

  if (!result.valid) {
    for (i = 0; i < result.errors.length; i++) {
      valError.addField(result.errors[i].property, result.errors[i].message);
    }
    if (valError.hasErrors()) {
      return cb(valError);
    }
  }
  else {
    cb(null);
  }
};

Table.prototype._applyDefaults = function _applyDefaults(data, isNew) {
  // If this is an update, only apply defaults to fields that are changing
  var fieldNames = isNew ? this.fieldNames : Object.keys(data)
    , i
    , defVal;

  for (i = 0; i < fieldNames.length; i++) {
    if (data[fieldNames[i]] === undefined &&
        this.schema.fields[fieldNames[i]] &&
        this.schema.fields[fieldNames[i]].default !== undefined)
    {
      defVal = this.schema.fields[fieldNames[i]].default;
      if (typeof defVal === 'function') {
        defVal = defVal();
      }
      data[fieldNames[i]] = defVal;
    }
    // Delete undefined fields
    else if (data[fieldNames[i]] === undefined) {
      delete data[fieldNames[i]];
    }
  }
};

Table.prototype._applySetters = function _applySetters(data) {
  var fieldNames = Object.keys(data);

  for (var i = 0; i < fieldNames.length; i++) {
    if (this.schema.fields[fieldNames[i]].setter) {
      data[fieldNames[i]] = this.schema.fields[fieldNames[i]].setter(data[fieldNames[i]]);
    }
  }
};

Table.prototype._applyGetters = function _applyGetters(data, options) {
  var fieldNames = Object.keys(data);

  options = options || {};

  for (var i = 0; i < fieldNames.length; i++) {
    if (this.schema.fields[fieldNames[i]]) {
      if (this.schema.fields[fieldNames[i]].private && !options.ignorePrivate) {
        delete data[fieldNames[i]];
      }
      else if (this.schema.fields[fieldNames[i]].getter && !options.ignoreGetters) {
        data[fieldNames[i]] = this.schema.fields[fieldNames[i]].getter(data[fieldNames[i]]);
      }
    }
  }
};

function GetterStream(table, getterOptions) {
  this.objectMode = true;
  stream.Transform.call(this, {
    objectMode: true
  });
  this.table = table;
  this.getterOptions = getterOptions;
}
util.inherits(GetterStream, stream.Transform);

GetterStream.prototype._transform = function(chunk, encoding, cb) {
  this.table._applyGetters(chunk, this.getterOptions);
  cb(null, chunk);
};

Table.prototype.insert = function insert(connection, data, options, cb) {
  var self = this
    , meta;

  if (!connection || typeof connection.query !== 'function') {
    return cb(new PlacematError("Connection object must have query function."));
  }

  if (!cb) {
    cb = options;
    options = {};
  }

  meta = options.meta || {};

  stride(
    function defaults() {
      self._applyDefaults(data, true);
      return true;
    },
    function preValidate() {
      self.preValidate(null, data, true, this, meta);
    },
    function validate() {
      self._validate(data, true, this);
    },
    function setters() {
      self._applySetters(data);
      return true;
    },
    function preSave() {
      self.preSave(null, data, true, this, meta);
    },
    function save() {
      var sql = squel.insert().into(self._queryTableName)
        , fieldName;

      for(var field in data) {
        fieldName = self.schema.fields[field] && self.schema.fields[field].quote ?
          '`' + field + '`' : field;
        sql.set(fieldName, data[field]);
      }

      sql = sql.toParam();

      connection.query(sql.text, sql.values, this);
    },
    function getters(rows) {
      data[self.idField] = rows.insertId;
      self._applyGetters(data, options);
      return true;
    },
    function postSave() {
      self.postSave([data[self.idField]], data, true, meta);
      self.emit('insert', [data[self.idField]], data, meta);
      self.emit('save', [data[self.idField]], data, true, meta);
      return true;
    }
  ).once('done', function(err) {
    cb(self.translateError(err), data);
  });
};

Table.prototype.update = function update(connection, ids, data, options, cb) {
  var self = this
    , idIsObject = false
    , meta;

  if (!connection || typeof connection.query !== 'function') {
    return cb(new PlacematError("Connection object must have query function."));
  }

  if (!cb) {
    cb = options;
    options = {};
  }

  meta = options.meta || {};

  // If there are no ids, do nothing
  if (ids == null || (Array.isArray(ids) && !ids.length)) {
    return cb(null, data, 0);
  }

  if (!Array.isArray(ids)) {
    if (typeof ids === 'object') {
      idIsObject = true;
    }
    else {
      ids = [ids];
    }
  }

  // If there is no data, stop immediately
  if (!data || typeof data !== 'object' || Object.keys(data).length === 0) {
    return cb(null, data, 0);
  }

  stride(
    function preValidate() {
      self.preValidate(ids, data, false, this, meta);
    },
    function validate() {
      self._validate(data, false, this);
    },
    function setters() {
      self._applySetters(data);
      return true;
    },
    function preSave() {
      self.preSave(ids, data, false, this, meta);
    },
    function save() {
      var sql = squel.update().table(self._queryTableName)
        , fieldName;

      for(var field in data) {
        if (data[field] !== undefined) {
          fieldName = self.schema.fields[field] && self.schema.fields[field].quote ?
            '`' + field + '`' : field;
          sql.set(fieldName, data[field]);
        }
      }

      if (idIsObject) {
        for (var i in ids) {
          sql.where(i + ' = ?', ids[i]);
        }
        ids = [ids];
      }
      else {
        sql.where(self.idField + ' IN ?', ids);
      }

      sql = sql.toParam();

      connection.query(sql.text, sql.values, this);
    },
    function getters(rows) {
      self._applyGetters(data, options);
      return rows.affectedRows;
    },
    function postSave(affectedRows) {
      self.postSave(ids, data, false, meta);
      self.emit('update', ids, data, meta);
      self.emit('save', ids, data, false, meta);
      return affectedRows;
    }
  ).once('done', function(err, affectedRows) {
    cb(self.translateError(err), data, affectedRows);
  });

};

Table.prototype.remove = function remove(connection, ids, options, cb) {
  var self = this
    , idIsObject = false
    , whereSpecified = false
    , meta;

  if (!connection || typeof connection.query !== 'function') {
    return cb(new PlacematError("Connection object must have query function."));
  }

  if (!cb) {
    cb = options;
    options = {};
  }

  meta = options.meta || {};

  // If there are no ids, do nothing
  if (ids == null || (Array.isArray(ids) && !ids.length)) {
    return cb(null, 0);
  }

  if (!Array.isArray(ids)) {
    if (typeof ids === 'object') {
      idIsObject = true;
    }
    else {
      ids = [ids];
    }
  }

  stride(
    function preDelete() {
      self.preDelete(ids, this, meta);
    },
    function remove() {
      var sql = squel.delete().from(self._queryTableName);

      if (idIsObject) {
        for (var i in ids) {
          sql.where(i + ' = ?', ids[i]);
          whereSpecified = true;
        }
        ids = [ids];
      }
      else {
        sql.where(self.idField + ' IN ?', ids);
        whereSpecified = true;
      }

      if (!whereSpecified) {
        throw new PlacematError("No where clause specified for remove(). This could be bad.");
      }

      sql = sql.toParam();

      connection.query(sql.text, sql.values, this);
    },
    function postDelete(results) {
      self.postDelete(ids, meta);
      self.emit('remove', ids, meta);
      return results.affectedRows;
    }
  ).once('done', function(err, affectedRows) {
    cb(self.translateError(err), affectedRows);
  });
};

Table.prototype.findById = function findById(connection, ids, options, cb) {
  var self = this
    , idIsObject = false
    , returnArray = Array.isArray(ids);

  if (typeof options === 'function') {
    cb = options;
    options = {};
  }

  if (!Array.isArray(ids)) {
    if (typeof ids === 'object') {
      idIsObject = true;
    }
    else {
      ids = [ids];
    }
  }
  else if(ids.length === 0) {
    return cb(null, []);
  }

  options = options || {};
  options.where = options.where || [];
  options.where = Array.isArray(options.where) ? options.where : [options.where];
  options.params = options.params || [];

  var q = []
    , i;

  if (idIsObject) {
    for (i in ids) {
      options.where.push(i + ' = ?');
      options.params.push(ids[i]);
    }
    ids = [ids];
  }
  else {
    for (i = 0; i < ids.length; i++) {
      q.push('?');
    }

    options.where.push(self.idField + ' IN (' + q.join(',') + ')');
    options.params = options.params.concat(ids);
  }

  // If we are returning array, or there isn't a callback (i.e. using streams)
  // pass along to find() as is
  if (returnArray || cb == null) {
    return this.find(connection, options, cb);
  }

  // If only 1 result is requested...
  this.find(connection, options, function(err, results) {
    return cb(err, results.length ? results[0] : null);
  });
};

Table.prototype.find = function find(connection, options, cb) {
  var self = this
    , i;

  if (typeof options === 'function') {
    cb = options;
    options = {};
  }
  options = options || {};

  options.where = options.where || [];
  options.where = Array.isArray(options.where) ? options.where : [options.where];

  options.params = options.params || [];

  options.fields = options.fields || [];
  options.fields = Array.isArray(options.fields) ? options.fields : [options.fields];

  options.order = options.order || [];
  options.order = Array.isArray(options.order) ? options.order : [options.order];

  var sql = squel.select().from(self._queryTableName)
    , fieldName;

  for (i = 0; i < options.fields.length; i++) {
    if (typeof options.fields[i] === 'object') {
      fieldName = self.schema.fields[options.fields[i]] && self.schema.fields[options.fields[i]].quote ?
        '`' + options.fields[i].field + '`' : options.fields[i].field;
      sql.field(fieldName, options.fields[i].alias);
    }
    else {
      fieldName = self.schema.fields[options.fields[i]] && self.schema.fields[options.fields[i]].quote ?
        '`' + options.fields[i] + '`' : options.fields[i];
      sql.field(fieldName);
    }
  }

  for (i = 0; i < options.where.length; i++) {
    sql.where(options.where[i]);
  }

  for (i = 0; i < options.order.length; i++) {
    if (typeof options.order[i] === 'object') {
      sql.order(options.order[i].field, options.order[i].ascending);
    }
    else {
      sql.order(options.order[i]);
    }
  }

  if (options.limit) {
    sql.limit(options.limit);
  }

  if (options.offset) {
    sql.offset(options.offset);
  }

  // query() return value may be a stream
  return this.query(connection, sql.toString(), options.params, options, cb);
};

Table.prototype.query = function query(connection, sql, params, options, cb) {
  var self = this;

  if (typeof params === 'function') {
    cb = params;
    params = undefined;
    options = {};
  }
  else if (typeof options === 'function') {
    cb = options;
    options = {};
  }
  options = options || {};

  if (!connection || typeof connection.query !== 'function') {
    return cb(new PlacematError("Connection object must have query function."));
  }

  // If cb is undefined, pass along streams interface
  if (cb == null) {
    var gs = new GetterStream(self, options)
      , qs = connection.query(sql, params || []).stream(options);

    // Forward errors on query stream to exposed stream
    qs.on('error', function(err) {
      gs.emit('error', err);
    });

    return qs.pipe(gs);
  }

  stride(
    function runQuery() {
      connection.query(sql, params || [], this);
    },
    function getters(data) {
      if (!data.length) {
        return [];
      }

      for (var i = 0; i < data.length; i++) {
        self._applyGetters(data[i], options);
      }

      return data;
    }
  ).once('done', function(err, results) {
    cb(self.translateError(err), results);
  });
};

Table.prototype.translateError = function translateError(err) {
  var field;

  if (!err) {
    return err;
  }

  if (!(err instanceof PlacematError) && err.errno) {
    switch(err.errno) {
    case 1452: // ER_NO_REFERENCED_ROW_
      field = err.message.match(/FOREIGN KEY \(`([^`]+)`\)/)[1];
      err = new ValidationError();
      err.addField(field, 'reference not found');
      break;
    case 1062: // ER_DUP_ENTRY
      field = err.message.match(/for key '(.*)'/)[1];
      field = field === 'PRIMARY' ? this.idField : field;
      err = new ValidationError();
      err.addField(field, 'already exists');
      break;
    case 1451: // ER_ROW_IS_REFERENCED_
      err = new ConstraintError();
      break;
    default:
      break;
    }
  }

  return Table.errorAdaptor(err);
};

Table.errorAdaptor = function(err) {
  return err;
};

exports.PlacematError = PlacematError;
exports.ValidationError = ValidationError;
exports.ConstraintError = ConstraintError;

