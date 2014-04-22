/*global describe, it, before, after */

var placemat = require('..');

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


var users = new placemat.Table('placemat_users', userSchema);

describe('Placemat', function() {

  var db;

  // Create MySQL table for tests
  before(function(done) {
    var connOpts = {
      adapter: 'mysql',
      host: 'localhost',
      port: 3306,
      user: 'test',
      database: 'test'
    };

    var poolOpts = {
      min: 2,
      max: 20
    };

    db = placemat.connect(connOpts, poolOpts);

    // Drop users table if it already exists
    var sql = 'DROP TABLE IF EXISTS `placemat_users`';

    db.query(sql, function(err) {
      if (err) {
        return done(err);
      }
      // Create new users table
      sql = "CREATE TABLE `placemat_users` ( " +
        "`id` int(11) unsigned NOT NULL AUTO_INCREMENT, " +
        "`age` int(11) unsigned, " +
        "`name` varchar(255) NOT NULL DEFAULT '', " +
        "`email` varchar(255) NOT NULL DEFAULT '', " +
        "`createdAt` datetime NOT NULL, " +
        "`password` varchar(255) NOT NULL DEFAULT '', " +
        "PRIMARY KEY (`id`) " +
      ") ENGINE=InnoDB DEFAULT CHARSET=utf8;";

      db.query(sql, function(err) {
        if (err) {
          return done(err);
        }
        // Insert some sample data into the db
        sql = "INSERT INTO `placemat_users` (`id`, `name`, `email`, `age`, `createdAt`, `password`) " +
          "VALUES " +
            "(1,'James','james@example.com', 26, '2014-04-21 21:23:33','123456ab'), " +
            "(2,'John','john@example.com', 32, '2014-04-21 21:23:33','123456ab'), " +
            "(3,'Jake','jake@example.com', 55, '2014-04-21 21:23:33','123456ab');";
        db.query(sql, done);
      });
    });
  });

  // Clean up test db
  after(function(done) {
    db.query('DROP TABLE IF EXISTS `placemat_users`', done);
  });

  describe('#get()', function() {
    it('should be able to retrieve a single record by id', function(done) {
      users.get(1, function(err, res) {
        if (err) {
          return done(err);
        }
        res[0].should.have.property('name', 'James');
        done();
      });
    });

    it('should be able to retrieve multiple records by id', function(done) {
      users.get([1, 2], function(err, res) {
        if (err) {
          return done(err);
        }
        res.should.have.length(2);
        res[0].should.have.property('name', 'James');
        res[1].should.have.property('name', 'John');
        done();
      });
    });

    it('should not return fields that are "private"', function(done) {
      users.get([1, 2], function(err, res) {
        if (err) {
          return done(err);
        }
        res[0].should.have.property('name', 'James');
        res[0].should.not.have.property('password');
        res[1].should.have.property('name', 'John');
        res[1].should.not.have.property('password');
        done();
      });
    });

    it('should apply getters', function(done) {
      users.get(1, function(err, res) {
        if (err) {
          return done(err);
        }
        res[0].should.have.property('createdAt', '***');
        done();
      });
    });

    it('should be able to retrieve only a single field', function(done) {
      users.get(1, null, 'name', function(err, res) {
        if (err) {
          return done(err);
        }
        res[0].should.have.keys('name');
        done();
      });
    });

    it('should be able to retrieve multiple fields', function(done) {
      users.get(1, null, ['name', 'email'], function(err, res) {
        if (err) {
          return done(err);
        }
        res[0].should.have.keys(['name', 'email']);
        res[0].should.have.property('name', 'James');
        res[0].should.have.property('email', 'james@example.com');
        done();
      });
    });

    it('should be able to retrieve a record by a field other than "id"', function(done) {
      users.get('james@example.com', 'email', function(err, res) {
        if (err) {
          return done(err);
        }
        res[0].should.have.property('name', 'James');
        done();
      });
    });
  });

  describe('#find()', function() {
    it('should execute queries successfully', function(done) {
      users.find("SELECT * FROM placemat_users", function(err, res) {
        if (err) {
          return done(err);
        }
        res[0].should.have.property('name', 'James');
        done();
      });
    });

    it('should apply getters', function(done) {
      users.find("SELECT * FROM placemat_users", function(err, res) {
        if (err) {
          return done(err);
        }
        res[0].should.have.property('createdAt', '***');
        done();
      });
    });

    it('should remove "private" fields from results', function(done) {
      users.find("SELECT * FROM placemat_users", function(err, res) {
        if (err) {
          return done(err);
        }
        res[0].should.not.have.property('password');
        res.should.have.length(3);
        done();
      });
    });

    it('should be able to retrieve only some fields without problems', function(done) {
      users.find("SELECT name FROM placemat_users", function(err, res) {
        if (err) {
          return done(err);
        }
        res[0].should.have.property('name');
        res.should.have.length(3);
        done();
      });
    });

  });


  describe('#update()', function() {
    it('should successfully save data when required field is not provided', function(done) {
      users.update(1, {
        email: 'james123@example.com'
      }, function(err, res, affectedRows) {
        if (err) {
          return done(err);
        }
        affectedRows.should.equal(1);
        users.get(1, function(err, user) {
          if (err) {
            return done(err);
          }
          user[0].should.have.property('email', 'james123@example.com');
          done();
        });
      });
    });

    it('should be able to update multiple rows simultaneously', function(done) {
      users.update([1, 2], {
        name: 'Bob'
      }, function(err, res, affectedRows) {
        if (err) {
          return done(err);
        }
        affectedRows.should.equal(2);
        users.get([1, 2], function(err, users) {
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
      users.update(1, {
        email: undefined
      }, function(err, res, affectedRows) {
        err.fields[0].name.should.equal('email');
        done();
      });
    });

    it('should fail when a unrecognized field is provided', function(done) {
      users.update(1, {
        junk: 'this is garbage'
      }, function(err, res) {
        err.fields[0].name.should.equal('junk');
        done();
      });
    });

    it('should fail when invalid data is provided', function(done) {
      users.update(1, {
        email: 'james'
      }, function(err, res) {
        err.fields[0].name.should.equal('email');
        done();
      });
    });

    it('should apply setters before data is saved', function(done) {
      users.update(1, {
        email: 'BOB456@example.com'
      }, function(err, res) {
        if (err) {
          return done(err);
        }
        users.get(1, function(err, user) {
          if (err) {
            return done(err);
          }
          user[0].should.have.property('email', 'bob456@example.com');
          done();
        });
      });
    });

    it('should be able to "null" unrequired fields by setting them to "undefined"', function(done) {
      users.update(1, {
        age: undefined
      }, function(err, res) {
        if (err) {
          return done(err);
        }
        users.get(1, function(err, user) {
          if (err) {
            return done(err);
          }
          res.should.have.property('age', null);
          done();
        });
      });
    });

    it('should be able to be called with no data properties', function(done) {
      users.update(1, {}, function(err, res) {
        if (err) {
          return done(err);
        }
        done();
      });
    });

  });

  describe('#remove()', function() {
    it('should be able to remove a single row', function(done) {
      users.remove(1, function(err, res) {
        if (err) {
          return done(err);
        }
        users.find("SELECT * FROM placemat_users", function(err, res) {
          if (err) {
            return done(err);
          }
          res.should.have.length(2);
          res[0].id.should.equal(2);
          done();
        });
      });
    });

    it('should be able to remove multiple rows', function(done) {
      users.remove([2, 3], function(err, res) {
        if (err) {
          return done(err);
        }
        users.find("SELECT * FROM placemat_users", function(err, res) {
          if (err) {
            return done(err);
          }
          res.should.have.length(0);
          done();
        });
      });
    });
  });

  describe('#insert()', function() {
    it('should insert a valid record and return a new id', function(done) {
      users.insert({
        name: 'James',
        email: 'james@example.com',
        password: '123456ab',
        createdAt: new Date()
      }, function(err, res) {
        if (err) {
          return done(err);
        }
        res.should.have.property('id');
        users.get(res.id, function(err, user) {
          user[0].should.have.property('name', 'James');
          users.remove(res.id, done);
        });
      });
    });

    it('should fail when a required field is undefined', function(done) {
      users.insert({
        name: 'James',
        password: '123456ab'
      }, function(err, res) {
        err.fields[0].name.should.equal('email');
        users.find("SELECT * FROM placemat_users", function(err, res) {
          if (err) {
            return done(err);
          }
          res.should.have.length(0);
          done();
        });
      });
    });

    it('should fail when a unrecognized field is provided', function(done) {
      users.insert({
        name: 'James',
        email: 'jamesk1187@gmail.com',
        junk: 'this is garbage',
        password: '123456ab'
      }, function(err, res) {
        err.fields[0].name.should.equal('junk');
        users.find("SELECT * FROM placemat_users", function(err, res) {
          if (err) {
            return done(err);
          }
          res.should.have.length(0);
          done();
        });
      });
    });

    it('should fail when invalid data is provided', function(done) {
      users.insert({
        name: 'James',
        email: 'jamesk1187',
        password: '123456ab'
      }, function(err, res) {
        err.fields[0].name.should.equal('email');
        users.find("SELECT * FROM placemat_users", function(err, res) {
          if (err) {
            return done(err);
          }
          res.should.have.length(0);
          done();
        });
      });
    });

    it('should apply setters before data is saved', function(done) {
      users.insert({
        name: '   James   ',
        email: 'JamesK1187@gmail.com',
        password: '123456ab'
      }, function(err, res) {
        if (err) {
          return done(err);
        }
        users.get(res.id, function(err, user) {
          user[0].name.should.equal('James');
          user[0].email.should.equal('jamesk1187@gmail.com');
          done();
        });
      });
    });

    it('should use defaults when a field is undefined', function(done) {
      users.insert({
        email: 'jamesk1187@gmail.com',
        password: '123456ab'
      }, function(err, res) {
        if (err) {
          return done(err);
        }
        res.should.have.property('createdAt');
        res.createdAt.should.be.an.instanceof(Date);
        users.get(res.id, function(err, user) {
          user[0].should.have.property('name', 'John Doe');
          done();
        });
      });
    });
  });

});

