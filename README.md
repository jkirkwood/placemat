placemat
========

A lightweight module designed to make interacting with your SQL tables a little
easier. Includes features such as validation, getters, setters, pre/post-save
hooks.

Why?
----

To provide some structure to your app's persistence layer without the weight
of a full fledged ORM.

Installation
------------

```sh
npm install placement
```

Usage
-----
First thing to do is to require placemat and to open a connection to your
database. Placemat uses [node-any-db](https://github.com/grncdr/node-any-db) to
establish a connection to the db of your choosing (Note: this module has only
been tested with MySQL. It may, or may not, work with other db varieties).

Use `placemat.connect(connOpts, poolOpts)`

See the [node-any-db docs](https://github.com/grncdr/node-any-db) for a list of
available options. As far as placemat is concerned, if poolOpts is specified
a connection pool is opened via `anyDB.createPool`. Otherwise only a single
connection is opened via `anyDB.createConnection`.



```js
var placemat = require('placemat');

var connOpts = {
  adapter: 'mysql',
  host: 'localhost',
  port: 3306,
  user: 'user',
  database: 'database'
};

var poolOpts = {
  min: 2,
  max: 20
};

placemat.connect(connOpts, poolOpts);
```

### Schema

Placemat exports a `Table` constructor that instantiates an object containing
functions to interact with your database. To create a `Table` object you must
first specify the schema for your table. A schema is a JSON object with the
following properties:

- `fields` - hash of fields represented in your table. Each field in you table
    should have a property in this hash, and may contain the following keys:
  - `validation` - properties describing how the field should be validated. Validation
    in placemat is powered by [revalidator](https://github.com/flatiron/revalidator).
    See their docs for available validation options.
  - `setter` - a function that can be used to alter a property before it is saved.
    this function must accept one parameter (the set value of the field), and must
    return the altered value.

    Example:

    ```js
    function(value) {
      return value.toLowerCase();
    }
    ```

  - `getter` - like `setter`, but applied to fields after they are retrieved from
    the database.
  - `default` - if the field is `undefined` during insertion, it will be set to
    this value.
  - `private` - if `true`, this field will be removed from retrieved data.
    Useful for passwords and other sensitive information.

Schema Example:

```js
var userSchema = {
  fields: {
    id: {
      validation: {
        type: 'integer',
        required: false,
      }
    },
    name: {
      validation: {
        type: 'string',
        required: true
      },
      setter: function(value) {
        return value.trim();
      },
      default: 'John Doe'
    },
    email: {
      validation: {
        type: 'string',
        format: 'email',
        required: true
      },
      setter: function(value) {
        return value.trim().toLowerCase();
      }
    },
    age: {
      validation: {
        type: ['integer', 'null'],
        required: false
      }
    },
    createdAt: {
      validation: {
        type: 'date',
        required: true
      },
      default: function() {
        return new Date();
      }
    },
    password: {
      validation: {
        type: 'string',
        required: true
      },
      setter: function(value) {
        return value.trim().toLowerCase();
      },
      private: true
    }
  }
}
```

Now let's instantiate the table and make some stuff happen.

```js
var users = new placemat.Table('users', userSchema);

// Create a new user
users.insert({
  name: 'Bob',
  email: 'bob@example.com',
  password: '123456'
}, function(err, data) {

  var id = data.id;

  // Update the new user's email address
  users.update(id, {
    email: 'bob123@example.com'
    }, function(err, data, affectedRows) {

      // Fetch the user by id
      users.findById(id, function(err, user) {
        var name = user.name;

        // Delete the user
        users.remove(id, function(err, affectedRows) {});
      });

    }
});
```

API
---
#### placemat.connect(connOptions, [poolOptions])
Connect to your database using [node-any-db](https://github.com/grncdr/node-any-db)
and return an instance of the connection.
- `connOptions` - connection options to use. See any-db docs for more info.
- `poolOptions` - pool options to use. See any-db docs for more info. If
  undefined, only a single connection will be opened to the specified database.

#### placemat.db
A reference to the database connection established by `placemat.connect()`.

#### placemat.Table(tableName, [idField], schema)
Instantiate a new placemat table.
- `tableName` - name of database table instance should interact with.
- `idField` - primary key of table. Defaults to `id`.
- `schema` - [schema object](#schema) for the table.

### Table Methods

#### Table#insert(data, [options], cb)
Add a new record to the table.
- `data` - object containing fields to save to the inserted row.
- `options` - object containing options, all of which are optional. Can include:
  - `ignorePrivate` - set to `true` if private fields should not be removed from
    postSave data
  - `ignoreGetters` - set to `true` if getters should not be applied to
    postSave data.
- `cb` - callback of the form `cb(err, data)`
  - `data` - Data that was inserted into the database. Primary key of inserted
    row will be included (based on lastInsertId of query). Getters are applied
    to this data.

#### Table#update(ids, data, [options], cb)
Update record(s) in the table.
- `ids` - id(s) of row(s) to update. Can be a single value, or an array of
  several values to update multiple items. This value can also be a single object
  containing field/value pairs. This comes in handy when trying to update a row
  by a field other than the primary key, or if the primary key is based on more
  than one field.
- `data` - object containing properties to update on selected row(s).
- `options` - object containing options, all of which are optional. Can include:
  - `ignorePrivate` - set to `true` if private fields should not be removed from
    postSave data
  - `ignoreGetters` - set to `true` if getters should not be applied to
    postSave data.
- `cb` - callback of the form `cb(err, data, affectedRows)`
  - `data` - data that was updated for the selected row(s). Getters are applied
    to this data.
  - `affectedRows` - the number of database rows that were updated.

#### Table#remove(ids, cb)
Delete record(s) from the table.
- `ids` - id(s) of row(s) to delete. Can be a single value, or an array of
  several values to delete multiple items. Like in `#update()` this parameter
  can also be a single object.
- `cb` - callback of the form `cb(err, affectedRows)`
  - `affectedRows` - the number of database rows that were deleted.

#### Table#findById(ids, [options], cb)
Retrieve row(s) from the table by id.
- `ids` - id(s) of row(s) to retrieve. Can be a single value, or an array of
  several values to retrieve multiple items. Like in `#update()` this parameter
  can also be a single object.
- `options` - object containing options, all of which are optional. Can include:
  - `where` - WHERE clause to use with the query. Can be a single string, or an
    array of multiple strings, each containing an individual statement.
  - `params` - array containing parameters to use with the query.
  - `fields` - array containing names of fields to retrieve from the table. If
    only a single field needs to be retrieved, this can just be a string. By
    default all fields are retrieved.
    An alias can be assigned to fields by supplying an object with a `field` and
    an `alias` property instead of a string.
  - `order` - name of field to sort results by. To sort by multiple fields this
    property can be set to an array of multiple strings. By default sorts are
    ascending. To do a descending sort pass an object with a `field` and
    `ascending` property and set `ascending` to false.
  - `limit` - number of rows to limit result to.
  - `offset` - offset to apply to retrieved rows.
  - `ignorePrivate` - set to `true` if private fields should not be removed from
    retrieved fields.
  - `ignoreGetters` - set to `true` if getters should not be applied to
    retrieved fields.
- `cb` - callback of the form `cb(err, record)`
  - `records` - if `ids` is an array, this value will be an array of objects
    (one for each row retrieved). If only a single id was specified in a
    non-array format, `records` will be an object, or `null`.

#### Table#find([options], cb)
Find table rows. By default all rows are retrieved.
- `options` - same as in `Table#findById()`.
- `cb` - callback of the form `cb(err, records)`
  - `records` - array containing each row that was found.

#### Table#query(sql, [params, options], cb)
Find table rows using a raw sql query. Useful for more advanced operations.
- `sql` - sql query to execute.
- `params` - parameters to apply in query.
- `options` - object containing options, all of which are optional. Can include:
  - `ignorePrivate` - set to `true` if private fields should not be removed from
    retrieved fields.
  - `ignoreGetters` - set to `true` if getters should not be applied to
    retrieved fields.
- `cb` - callback of the form `cb(err, records)`
  - `records` - array containing each row that was found.

### Table Hooks

These functions can be overridden on a per table basis and are called at
specific points during the insert, update, or remove process. These can be used
to modify data before it is saved, to do asynchronus validation, or to
update a caching layer when a record is changed, among other things.

#### Table#preValidate(ids, data, isNew, cb)
Called after defaults are applied but before validation occurs.
- `ids` - array containing the ids that are being saved. Will be `null` when
  called during an insert.
- `data` - data that will be saved.
- `isNew` - set to `true` when called during an insert.
- `cb` - should be called when hook is complete. An error can be passed to
  cause the save to fail.

#### Table#preSave(ids, data, isNew, cb)
Called after setters and validation are applied, but before the actual db
query.
- `ids` - array containing the ids that are being saved. Will be `null` when
  called during an insert. This will always be an array, even if a non-array id
  was passed to the emitting function.
- `data` - data that will be saved.
- `isNew` - set to `true` when called during an insert.
- `cb` - should be called when hook is complete. An error can be passed to
  cause the save to fail.

#### Table#postSave(ids, data, isNew)
Called after records have been successfully inserted or updated.
- `ids` - array containing the ids that were saved. Will include the id of
  any inserted rows. This will always be an array, even if a non-array id
  was passed to the emitting function.
- `data` - data that was saved. Getters are applied to this data.
- `isNew` - set to `true` when called during an insert.

#### Table#preDelete(ids, cb)
Called before rows are deleted.
- `ids` - array containing the ids that will be deleted. This will always be
  an array, even if a non-array id was passed to the emitting function.
- `cb` - should be called when hook is complete. An error can be passed to
  cause the deletion to fail.

#### Table#postDelete(ids)
Called after records have successfully been deleted.
- `ids` - array containing the ids that were deleted. This will always be an
  array, even if a non-array id was passed to the emitting function.

### Table Events

Table inherits `EventEmiiter` and implements the following events:

#### Event 'save'
Emitted whenever a record is inserted, or updated
- `ids` - array containing the ids that were saved. Will include the id of
  any inserted rows. This will always be an array, even if a non-array id
  was passed to the emitting function.
- `data` - data that was saved. Getters are applied to this data.
- `isNew` - set to `true` when emitted during an insert.

#### Event 'insert'
Emitted whenever a record is inserted
- `ids` - array containing the ids that were inserted. This will always be an
  array, even if a non-array id
  was passed to the emitting function.
- `data` - data that was saved.

#### Event 'update'
Emitted whenever a record is updated
- `ids` - array containing the ids that were updated. This will always be an
  array, even if a non-array id was passed to the emitting function.
- `data` - data that was updated. Getters are applied to this data.

#### Event 'remove'
Emitted whenever a record is removed
- `ids` - array containing the ids that were removed. This will always be an
  array, even if a non-array id was passed to the emitting function.


### Table Errors

The table functions can return the following errors:

#### placemat.PlacematError
Generic placemat error. Returned when function is called before database
connection is initialized.

#### placemat.ValidationError
Validation error. Contains `fields` property which is an array containing an
object for each field that failed validation. Each object has a `name` and
`message` property.

Placemat has logic built in that returns a ValidationError when a bad foreign
key reference is created, or when a duplicate is entered on a field with
unique key.

#### placemat.ConstraintError
Returned when a row has a foreign key contraint that prevents it from being
deleted.

#### Table.errorAdaptor(err)
This function is called before any error is returned from placemat. It can
be overridden to better integrate errors with your application (i.e. if you have
specific error types that you want returned for REST requests, etc.). This
function takes a placemat error as a parameter, and should return an error.




