var gulp = require('gulp');

// Include plugins
var jshint = require('gulp-jshint')
  , stylish = require('jshint-stylish');


gulp.task('lint', function() {
  var options = {
    curly: true,
    eqeqeq: true,
    eqnull: true,
    laxcomma: true,
    indent: 2,
    newcap: true,
    undef: true,
    node: true,
    sub: true,
    unused: 'vars' // Do not warn about unused function parameters
  };
  return gulp.src(['!node_modules/**/*.js' ,'**/*.js'])
    .pipe(jshint(options))
    .pipe(jshint.reporter(stylish));
});


gulp.task('default', ['lint']);
