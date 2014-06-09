/*global describe, it, before, after */

var mysql = require('mysql')
  , placemat = require('..');

require('should');

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
      },
      getter: function(value) {
        return '***';
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
};

var partsSchema = {
  fields: {
    serialNumber: {
      validation: {
        type: 'integer',
        required: true
      },
    },
    name: {
      validation: {
        type: 'string',
        required: true
      }
    },
    userId: {
      validation: {
        type: 'integer',
        required: true
      }
    }
  }
};


var users = new placemat.Table('placemat_users', userSchema);
var parts = new placemat.Table('placemat_parts', 'serialNumber', partsSchema);

var db;

describe('Placemat', function() {

  // Create MySQL table for tests
  before(function(done) {
    db = mysql.createConnection({
      host: 'localhost',
      port: 3306,
      user: 'test',
      database: 'test'
    });

    db.connect();
    done();
  });

  before(function(done) {
    db.query('DROP TABLE IF EXISTS `placemat_parts`', done);
  });

  before(function(done) {
    db.query('DROP TABLE IF EXISTS `placemat_users`', done);
  });

  before(function(done) {
    var sql = "CREATE TABLE `placemat_users` ( " +
      "`id` int(11) unsigned NOT NULL AUTO_INCREMENT, " +
      "`age` int(11) unsigned, " +
      "`name` varchar(255) NOT NULL DEFAULT '', " +
      "`email` varchar(255) NOT NULL DEFAULT '', " +
      "`createdAt` datetime NOT NULL, " +
      "`password` varchar(255) NOT NULL DEFAULT '', " +
      "PRIMARY KEY (`id`) " +
    ") ENGINE=InnoDB DEFAULT CHARSET=utf8;";
    db.query(sql, done);
  });

  before(function(done) {
    var sql = "INSERT INTO `placemat_users` (`id`, `name`, `email`, `age`, `createdAt`, `password`) " +
      "VALUES " +
        "(1,'James','james@example.com', 26, '2014-04-21 21:23:33','123456ab'), " +
        "(2,'John','john@example.com', 32, '2014-04-21 21:23:33','123456ab'), " +
        "(3,'Jake','jake@example.com', 55, '2014-04-21 21:23:33','123456ab'), " +
        "(4,'Jake','jake2@example.com', 55, '2014-04-21 21:23:33','123456ab');";
    db.query(sql, done);
  });

  before(function(done) {
    var sql = "CREATE TABLE `placemat_parts` ( " +
      "`serialNumber` int(11) NOT NULL, " +
      "`name` varchar(255) NOT NULL DEFAULT '', " +
      "`userId` int(11) unsigned NOT NULL, " +
      "PRIMARY KEY (`serialNumber`), " +
      "KEY `userId` (`userId`), " +
      "CONSTRAINT `placemat_parts_ibfk_1` FOREIGN KEY (`userId`) REFERENCES `placemat_users` (`id`) " +
    ") ENGINE=InnoDB DEFAULT CHARSET=utf8;";
    db.query(sql, done);
  });

  before(function(done) {
    var sql = "INSERT INTO `placemat_parts` (`serialNumber`, `name`, `userId`) " +
      "VALUES " +
        "(1, 'widget1', 1), " +
        "(2, 'widget2', 2), " +
        "(3, 'widget3', 3);";
    db.query(sql, done);
  });

  // Clean up test db
  after(function(done) {
    done();
    //db.query('DROP TABLE IF EXISTS `placemat_users`', done);
  });

  describe('exports.db', function() {
    it('should not be null after connection is established', function(done) {
      db.should.not.equal(null);
      done();
    });
  });

  describe('#findById()', function() {
    it('should be able to retrieve a single record by id', function(done) {
      users.findById(db, 1, function(err, res) {
        if (err) {
          return done(err);
        }
        res.should.have.property('name', 'James');
        done();
      });
    });

    it('should return "null" when no matching record is found', function(done) {
      users.findById(db, 2342, function(err, res) {
        if (err) {
          return done(err);
        }
        (res === null).should.equal(true);
        done();
      });
    });

    it('should return empty array when empty array is specified for ids', function(done) {
      users.findById(db, [], function(err, res) {
        if (err) {
          return done(err);
        }
        res.should.have.length(0);
        done();
      });
    });

    it('should be able to retrieve multiple records by id', function(done) {
      users.findById(db, [1, 2], function(err, res) {
        if (err) {
          return done(err);
        }
        res.should.have.length(2);
        res[0].should.have.property('name', 'James');
        res[1].should.have.property('name', 'John');
        done();
      });
    });

    it('should be able to retrieve a record by a field other than "id"', function(done) {
      users.findById(db, {email: 'james@example.com'}, function(err, res) {
        if (err) {
          return done(err);
        }
        res.should.have.property('name', 'James');
        done();
      });
    });

    it('should be able to work with options, but no idField parameter', function(done) {
      users.findById(db, 1, {fields: ['id', 'name']}, function(err, res) {
        if (err) {
          return done(err);
        }
        res.should.have.keys('id', 'name');
        done();
      });
    });
  });

  describe('#find()', function() {
    it('should return all records with no options', function(done) {
      users.find(db, function(err, res) {
        if (err) {
          return done(err);
        }
        res.should.have.length(4);
        done();
      });
    });

    it('should be able to use a where clause', function(done) {
      users.find(db, {
        where:'name = "Jake"'
      }, function(err, res) {
        if (err) {
          return done(err);
        }
        res.should.have.length(2);
        res[0].should.have.property('name', 'Jake');
        done();
      });
    });

    it('should be able to use multiple where clauses', function(done) {
      users.find(db, {
        where:['name = "Jake"', 'email = "jake2@example.com"']
      }, function(err, res) {
        if (err) {
          return done(err);
        }
        res.should.have.length(1);
        res[0].should.have.property('name', 'Jake');
        res[0].should.have.property('email', 'jake2@example.com');
        done();
      });
    });

    it('should accept where clause parameters', function(done) {
      users.find(db, {
        where: 'name = ?',
        params: ['James']
      }, function(err, res) {
        if (err) {
          return done(err);
        }
        res.should.have.length(1);
        res[0].should.have.property('name', 'James');
        done();
      });
    });

    it('should be able to return a single field', function(done) {
      users.find(db, {
        fields: 'name'
      }, function(err, res) {
        if (err) {
          return done(err);
        }
        res[0].should.have.keys('name');
        done();
      });
    });

    it('should be able to return multiple fields', function(done) {
      users.find(db, {
        fields: ['name', 'email']
      }, function(err, res) {
        if (err) {
          return done(err);
        }
        res[0].should.have.keys('name', 'email');
        done();
      });
    });

    it('should be able to assign an alias to fields', function(done) {
      users.find(db, {
        fields: ['name', {field: 'email', alias: 'emailAddress'}],
      }, function(err, res) {
        if (err) {
          return done(err);
        }
        res[0].should.have.keys(['name', 'emailAddress']);
        done();
      });
    });

    it('should be able to apply sorting', function(done) {
      users.find(db, {
        order: 'name'
      }, function(err, res) {
        if (err) {
          return done(err);
        }
        res.should.have.length(4);
        res[0].should.have.property('name', 'Jake');
        res[1].should.have.property('name', 'Jake');
        res[2].should.have.property('name', 'James');
        res[3].should.have.property('name', 'John');
        done();
      });
    });

    it('should be able to apply descending sorting', function(done) {
      users.find(db, {
        order: {field: 'name', ascending: false}
      }, function(err, res) {
        if (err) {
          return done(err);
        }
        res.should.have.length(4);
        res[0].should.have.property('name', 'John');
        res[1].should.have.property('name', 'James');
        res[2].should.have.property('name', 'Jake');
        res[3].should.have.property('name', 'Jake');
        done();
      });
    });
  });

  describe('#query()', function() {
    it('should execute queries successfully', function(done) {
      users.query(db, "SELECT * FROM placemat_users", function(err, res) {
        if (err) {
          return done(err);
        }
        res[0].should.have.property('name', 'James');
        done();
      });
    });

    it('should apply parameters', function(done) {
      users.query(db, "SELECT * FROM placemat_users WHERE email = ?",
        ['james@example.com'], function(err, res)
      {
        if (err) {
          return done(err);
        }
        res.should.have.length(1);
        res[0].should.have.property('email', 'james@example.com');
        done();
      });
    });

    it('should apply getters', function(done) {
      users.query(db, "SELECT * FROM placemat_users", function(err, res) {
        if (err) {
          return done(err);
        }
        res[0].should.have.property('createdAt', '***');
        done();
      });
    });

    it('should honor ignoreGetters option', function(done) {
      users.query(db, "SELECT * FROM placemat_users", null, {ignoreGetters: true},
        function(err, res) {
          if (err) {
            return done(err);
          }
          res[0].createdAt.should.be.instanceof(Date);
          done();
        });
      });

    it('should remove "private" fields from results', function(done) {
      users.query(db, "SELECT * FROM placemat_users", function(err, res) {
        if (err) {
          return done(err);
        }
        res[0].should.not.have.property('password');
        done();
      });
    });

    it('should honor ignorePrivate option', function(done) {
      users.query(db, "SELECT * FROM placemat_users", null, {ignorePrivate: true},
        function(err, res) {
          if (err) {
            return done(err);
          }
          res[0].should.have.property('password');
          done();
        });
      });

    it('should be able to retrieve only some fields without problems', function(done) {
      users.query(db, "SELECT name FROM placemat_users", function(err, res) {
        if (err) {
          return done(err);
        }
        res[0].should.have.property('name');
        done();
      });
    });

  });


  describe('#update()', function() {
    it('should successfully save data when required field is not provided', function(done) {
      users.update(db, 1, {
        email: 'james123@example.com'
      }, function(err, res, affectedRows) {
        if (err) {
          return done(err);
        }
        affectedRows.should.equal(1);
        users.findById(db, 1, function(err, user) {
          if (err) {
            return done(err);
          }
          user.should.have.property('email', 'james123@example.com');
          done();
        });
      });
    });

    it('should fire update and save events', function(done) {
      var saveCalled = false
        , updateCalled = false;
      users.once('save', function() {
        saveCalled = true;
      });
      users.once('update', function() {
        updateCalled = true;
      });
      users.update(db, 1, {
        email: 'james123@example.com'
      }, function(err, res, affectedRows) {
        if (err) {
          return done(err);
        }
        affectedRows.should.equal(1);
        users.findById(db, 1, function(err, user) {
          if (err) {
            return done(err);
          }
          user.should.have.property('email', 'james123@example.com');
          saveCalled.should.equal(true);
          updateCalled.should.equal(true);
          done();
        });
      });
    });

    it('should not crash if data is null', function(done) {
      users.update(db, 1, null, done);
    });

    it('should apply getters to returned/postSave data', function(done) {
      users.once('save', function(ids, data, isNew) {
        data.should.have.property('createdAt', '***');
        data.should.not.have.property('password');
        data.should.have.property('email', 'james24523@example.com');
      });
      users.update(db, 1, {
        email: 'james24523@example.com',
        password: '123456ab',
        createdAt: new Date()
      }, function(err, res) {
        if (err) {
          return done(err);
        }
        res.should.have.property('email', 'james24523@example.com');
        res.should.not.have.property('password');
        res.should.have.property('createdAt', '***');
        done();
      });
    });

    it('should honor ignoreGetters, and ignorePrivate option', function(done) {
      users.update(db, 1, {
        email: 'james24523@example.com',
        password: '123456ab',
        createdAt: new Date()
      }, {
        ignoreGetters: true,
        ignorePrivate: true
      }, function(err, res) {
        if (err) {
          return done(err);
        }
        res.should.have.property('email', 'james24523@example.com');
        res.should.have.property('password', '123456ab');
        res.createdAt.should.be.instanceof(Date);
        done();
      });
    });


    it('should be able to update multiple rows simultaneously', function(done) {
      users.update(db, [1, 2], {
        name: 'Bob'
      }, function(err, res, affectedRows) {
        if (err) {
          return done(err);
        }
        affectedRows.should.equal(2);
        users.findById(db, [1, 2], function(err, users) {
          if (err) {
            return done(err);
          }
          users[0].should.have.property('name', 'Bob');
          users[1].should.have.property('name', 'Bob');
          done();
        });
      });
    });

    it('should throw an error when a required field is cleared', function(done) {
      users.update(db, 1, {
        email: undefined
      }, function(err, res, affectedRows) {
        err.fields[0].name.should.equal('email');
        done();
      });
    });

    it('should fail when a unrecognized field is provided', function(done) {
      users.update(db, 1, {
        junk: 'this is garbage'
      }, function(err, res) {
        err.fields[0].name.should.equal('junk');
        done();
      });
    });

    it('should fail when invalid data is provided', function(done) {
      users.update(db, 1, {
        email: 'james'
      }, function(err, res) {
        err.fields[0].name.should.equal('email');
        done();
      });
    });

    it('should apply setters before data is saved', function(done) {
      users.update(db, 1, {
        email: 'BOB456@example.com'
      }, function(err, res) {
        if (err) {
          return done(err);
        }
        users.findById(db, 1, function(err, user) {
          if (err) {
            return done(err);
          }
          user.should.have.property('email', 'bob456@example.com');
          done();
        });
      });
    });

    it('should be able to "null" unrequired fields by setting them to "undefined"', function(done) {
      users.update(db, 1, {
        age: undefined
      }, function(err, res) {
        if (err) {
          return done(err);
        }
        users.findById(db, 1, function(err, user) {
          if (err) {
            return done(err);
          }
          user.should.have.property('age', null);
          done();
        });
      });
    });

    it('should be able to be called with no data properties', function(done) {
      users.update(db, 1, {}, function(err, res) {
        if (err) {
          return done(err);
        }
        done();
      });
    });

    it('should not crash if ids is empty array', function(done) {
      users.update(db, [], {name: 'Bob'}, done);
    });

  });

  describe('#remove()', function() {

    it('should throw a ContraintError when deleting referenced row', function(done) {
      users.remove(db, 1, function(err, res) {
        err.should.be.an.instanceof(placemat.ConstraintError);
        parts.remove(db, [1, 2, 3], done);
      });
    });

    it('should be able to remove a single row and fire "delete" event', function(done) {
      var removeCalled = false;
      users.once('remove', function() {
        removeCalled = true;
      });
      users.remove(db, 1, function(err, res) {
        if (err) {
          return done(err);
        }
        users.query(db, "SELECT * FROM placemat_users", function(err, res) {
          if (err) {
            return done(err);
          }
          res.should.have.length(3);
          res[0].id.should.equal(2);
          removeCalled.should.equal(true);
          done();
        });
      });
    });

    it('should be able to remove multiple rows', function(done) {
      users.remove(db, [2, 3], function(err, res) {
        if (err) {
          return done(err);
        }
        users.findById(db, [2, 3], function(err, res) {
          if (err) {
            return done(err);
          }
          res.should.have.length(0);
          done();
        });
      });
    });

    it('should be able to remove row by field other than id', function(done) {
      users.remove(db, {email: 'jake2@example.com'}, function(err, res) {
        if (err) {
          return done(err);
        }
        users.query(db, "SELECT * FROM placemat_users", function(err, res) {
          if (err) {
            return done(err);
          }
          res.should.have.length(0);
          done();
        });
      });
    });

    it('should not crash if ids is empty array', function(done) {
      users.remove(db, [], done);
    });
  });

  describe('#insert()', function() {
    it('should insert a valid record, return a new id, and fire events', function(done) {
      var saveCalled = false
        , insertCalled = false;
      users.once('save', function() {
        saveCalled = true;
      });
      users.once('insert', function() {
        insertCalled = true;
      });
      users.insert(db, {
        name: 'James',
        email: 'james@example.com',
        password: '123456ab',
        createdAt: new Date()
      }, function(err, res) {
        if (err) {
          return done(err);
        }
        res.should.have.property('id');
        users.findById(db, res.id, function(err, user) {
          user.should.have.property('name', 'James');
          saveCalled.should.equal(true);
          insertCalled.should.equal(true);
          users.remove(db, res.id, done);
        });
      });
    });

    it('should apply getters to returned/postSave data', function(done) {
      users.once('save', function(ids, data, isNew) {
        data.should.have.property('createdAt', '***');
        data.should.not.have.property('password');
      });
      users.insert(db, {
        name: 'James',
        email: 'james24523@example.com',
        password: '123456ab',
        createdAt: new Date()
      }, function(err, res) {
        if (err) {
          return done(err);
        }
        res.should.have.property('name', 'James');
        res.should.have.property('email', 'james24523@example.com');
        res.should.have.property('createdAt', '***');
        res.should.not.have.property('password');
        users.remove(db, res.id, done);
      });
    });

    it('should fail when a required field is undefined', function(done) {
      users.insert(db, {
        name: 'James',
        password: '123456ab'
      }, function(err, res) {
        err.fields[0].name.should.equal('email');
        users.query(db, "SELECT * FROM placemat_users", function(err, res) {
          if (err) {
            return done(err);
          }
          res.should.have.length(0);
          done();
        });
      });
    });

    it('should fail when a unrecognized field is provided', function(done) {
      users.insert(db, {
        name: 'James',
        email: 'jamesk1187@gmail.com',
        junk: 'this is garbage',
        password: '123456ab'
      }, function(err, res) {
        err.fields[0].name.should.equal('junk');
        users.query(db, "SELECT * FROM placemat_users", function(err, res) {
          if (err) {
            return done(err);
          }
          res.should.have.length(0);
          done();
        });
      });
    });

    it('should fail when invalid data is provided', function(done) {
      users.insert(db, {
        name: 'James',
        email: 'jamesk1187',
        password: '123456ab'
      }, function(err, res) {
        err.fields[0].name.should.equal('email');
        users.query(db, "SELECT * FROM placemat_users", function(err, res) {
          if (err) {
            return done(err);
          }
          res.should.have.length(0);
          done();
        });
      });
    });

    it('should apply setters before data is saved', function(done) {
      users.insert(db, {
        name: '   James   ',
        email: 'JamesK1187@gmail.com',
        password: '123456ab'
      }, function(err, res) {
        if (err) {
          return done(err);
        }
        users.findById(db, res.id, function(err, user) {
          user.name.should.equal('James');
          user.email.should.equal('jamesk1187@gmail.com');
          done();
        });
      });
    });

    it('should use defaults when a field is undefined', function(done) {
      users.preSave = function(ids, data, isNew, cb) {
        data.should.have.property('createdAt');
        data.createdAt.should.be.an.instanceof(Date);
        users.preSave = function preSave(ids, data, isNew, cb) {cb();};
        cb();
      };
      users.insert(db, {
        email: 'jamesk1187@gmail.com',
        password: '123456ab'
      }, function(err, res) {
        if (err) {
          return done(err);
        }
        users.findById(db, res.id, function(err, user) {
          user.should.have.property('name', 'John Doe');
          done();
        });
      });
    });

    it('should throw validation error when foreign key doesn\'t exist', function(done) {
      parts.insert(db, {
        serialNumber: 1,
        name: 'widget',
        userId: 1000
      }, function(err, res) {
        err.should.be.an.instanceof(placemat.ValidationError);
        err.fields[0].name.should.equal('userId');
        parts.query(db, "SELECT * FROM placemat_parts", function(err, res) {
          if (err) {
            return done(err);
          }
          res.should.have.length(0);
          done();
        });
      });
    });

    it('should throw validation error when duplicate key is inserted', function(done) {
      parts.insert(db, {
        serialNumber: 1,
        name: 'widget',
        userId: 8
      }, function(err, res) {
        if (err) {
          return done(err);
        }
        parts.insert(db, {
          serialNumber: 1,
          name: 'widget',
          userId: 8
        }, function(err, res) {
          err.should.be.an.instanceof(placemat.ValidationError);
          err.fields[0].name.should.equal('serialNumber');
          done();
        });
      });
    });
  });

});

