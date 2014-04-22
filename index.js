var anyDb = require('any-db')
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

var db = null
  , connection = false;

exports.connect = function(connOpts, poolOpts) {
  if (!poolOpts) {
    db = anyDb.createConnection(connOpts);
  }
  else {
    db = anyDb.createPool(connOpts, poolOpts);
  }
  connection = true;
  return db;
};

exports.db = db;


var Table = exports.Table = function(tableName, idField, schema) {
  // Reorg args
  if (schema === undefined) {
    schema = idField;
    idField = 'id';
  }

  this.tableName = tableName;
  this.schema = schema;
  this.idField = idField;

  this.fieldNames = Object.keys(schema.fields);

  this.revalidatorSchema = {properties: {}};
  this.asyncValidators = {};

  for (var field in schema.fields) {
    if (schema.fields[field].validation) {
      this.revalidatorSchema.properties[field] = schema.fields[field].validation;
    }
  }

};

// These functions can be overwritten as necessary
Table.prototype.preValidate = function preValidate(ids, data, isNew, cb) {cb();};
Table.prototype.preSave = function preSave(ids, data, isNew, cb) {cb();};
Table.prototype.preDelete = function preDelete(ids, cb) {cb();};
Table.prototype.postSave = function postSave(ids, data, isNew) {};
Table.prototype.postDelete = function postDelete(ids) {};

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
        this.schema.fields[fieldNames[i]].default)
    {
      defVal = this.schema.fields[fieldNames[i]].default;
      if (typeof defVal === 'function') {
        defVal = defVal();
      }
      data[fieldNames[i]] = defVal;
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

Table.prototype._applyGetters = function _applyGetters(data) {
  var fieldNames = Object.keys(data);

  for (var i = 0; i < fieldNames.length; i++) {
    if (this.schema.fields[fieldNames[i]]) {
      if (this.schema.fields[fieldNames[i]].private) {
        delete data[fieldNames[i]];
      }
      else if (this.schema.fields[fieldNames[i]].getter) {
        data[fieldNames[i]] = this.schema.fields[fieldNames[i]].getter(data[fieldNames[i]]);
      }
    }
  }
};

Table.prototype.insert = function insert(data, cb) {
  var self = this;

  if (!connection) {
    return cb(new PlacematError("Must open connection before calling insert()."));
  }

  stride(
    function defaults() {
      self._applyDefaults(data, true);
      return true;
    },
    function preValidate() {
      self.preValidate(null, data, true, this);
    },
    function validate() {
      self._validate(data, true, this);
    },
    function setters() {
      self._applySetters(data);
      return true;
    },
    function preSave() {
      self.preSave(null, data, true, this);
    },
    function save() {
      var sql = squel.insert().into(self.tableName);

      for(var field in data) {
        sql.set(field, data[field]);
      }

      sql = sql.toParam();

      db.query(sql.text, sql.values, this);
    },
    function postSave(result) {
      data[self.idField] = result.lastInsertId;
      self.postSave([result.lastInsertId], data, true);
      return true;
    }
  ).once('done', function(err) {
    cb(self.translateError(err), data);
  });
};

Table.prototype.update = function update(ids, idField, data, cb) {
  var self = this;

  if (!connection) {
    return cb(new PlacematError("Must open connection before calling update()."));
  }

  ids = Array.isArray(ids) ? ids : [ids];

  // Reorg args
  if (cb === undefined) {
    cb = data;
    data = idField;
    idField = undefined;
  }

  idField = idField || self.idField;

  // If there is no data, stop immediately
  if (Object.keys(data).length === 0) {
    return cb(null, data, 0);
  }

  stride(
    function preValidate() {
      self.preValidate(ids, data, false, this);
    },
    function validate() {
      self._validate(data, false, this);
    },
    function setters() {
      self._applySetters(data);
      return true;
    },
    function preSave() {
      self.preSave(ids, data, false, this);
    },
    function save() {
      var sql = squel.update().table(self.tableName);

      for(var field in data) {
        sql.set(field, data[field]);
      }

      sql.where(idField + ' IN ?', ids);

      sql = sql.toParam();

      db.query(sql.text, sql.values, this);
    },
    function postSave(results) {
      self.postSave(ids, data, false);
      return results.affectedRows;
    }
  ).once('done', function(err, affectedRows) {
    cb(self.translateError(err), data, affectedRows);
  });

};

Table.prototype.remove = function remove(ids, idField, cb) {
  var self = this;

  if (!connection) {
    return cb(new PlacematError("Must open connection before calling remove()."));
  }

  // Reorg args
  if (cb === undefined) {
    cb = idField;
    idField = undefined;
  }

  ids = Array.isArray(ids) ? ids : [ids];

  idField = idField || self.idField;

  stride(
    function preDelete() {
      self.preDelete(ids, this);
    },
    function remove() {
      var sql = squel.delete()
        .from(self.tableName)
        .where(self.idField + ' IN ?', ids);
      db.query(sql.toString(), this);
    },
    function postDelete(results) {
      self.postDelete(ids);
      return results.affectedRows;
    }
  ).once('done', function(err, affectedRows) {
    cb(self.translateError(err), affectedRows);
  });
};

Table.prototype.get = function get(ids, idField, fields, cb) {
  var self = this
    , data;

  if (!connection) {
    return cb(new PlacematError("Must open connection before calling get()."));
  }

  ids = Array.isArray(ids) ? ids : [ids];

  // Reorg args
  if (arguments.length === 2) {
    cb = idField;
    idField = undefined;
    fields = undefined;
  }
  else if(arguments.length === 3) {
    cb = fields;
    fields = undefined;
  }

  fields = fields || '*';
  fields = Array.isArray(fields) ? fields : [fields];
  idField = idField || self.idField;

  stride(
    function get() {
      var sql = squel.select().from(self.tableName);

      for (var i = 0; i < fields.length; i++) {
        sql.field(fields[i]);
      }

      sql.where(idField + ' IN ?', ids);

      db.query(sql.toString(), this);
    },
    function getters(results) {
      data = results.rows;

      if (!data.length) {
        return [];
      }

      for (var i = 0; i < data.length; i++) {
        self._applyGetters(data[i]);
      }

      return data;
    }
  ).once('done', function(err, results) {
    cb(self.translateError(err), results);
  });
};


Table.prototype.find = function find(sql, cb) {
  var self = this
    , data;

  if (!connection) {
    return cb(new PlacematError("Must open connection before calling find()."));
  }

  stride(
    function query() {
      db.query(sql, this);
    },
    function getters(results) {
      data = results.rows;

      if (!data.length) {
        return [];
      }

      for (var i = 0; i < data.length; i++) {
        self._applyGetters(data[i]);
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

