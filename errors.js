var util = require('util');

var PlacematError = function(message, constructor) {
  Error.call(this);
  Error.captureStackTrace(this, constructor || this);
  this.message = message || 'error has occured';
  this.name = 'PlacematError';
};
util.inherits(PlacematError, Error);



// Unauthorized error
var ValidationError = function(fields) {
  PlacematError.call(this, 'validation has failed', this.constructor);
  this.name = 'ValidationError';
  this.message = 'validation has failed';
  this.fields = this.fields || [];
  this.fields = Array.isArray(this.fields) ? this.fields : [this.fields];
};
util.inherits(ValidationError, PlacematError);

ValidationError.prototype.addField = function addField(name, message) {
  this.fields.push({name: name, message: message});
};

ValidationError.prototype.hasErrors = function hasErrors() {
  return this.fields.length > 0;
};


exports.PlacematError = PlacematError;
exports.ValidationError = ValidationError;
