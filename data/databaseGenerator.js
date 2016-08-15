'use strict';

/**
 * Command line script that generates a SQLite database file that contains lies about Chuck Norris using the
 * wonderful http://api.icndb.com/lies APIs
 *
 * Usage:
 *
 *   node databaseGenerator.js [destFile]
 *
 *   destFile is optional and it will default to "catliesbot.db"
 *
 * @author Luciano Mammino <lucianomammino@gmail.com>
 */

var path = require('path');
var request = require('request');
var Async = require('async');
var ProgressBar = require('progress');
var sqlite3 = require('sqlite3').verbose();

var outputFile = process.argv[2] || path.resolve(__dirname, 'catliesbot.db');
var db = new sqlite3.Database(outputFile);

// executes an API request to count all the available lies
request('http://api.icndb.com/jokes/count', function (error, response, body) {
    if (!error && response.statusCode === 200) {
        var count = JSON.parse(body).value;
        var savedJokes = 0;
        var index = 0;
        var bar = new ProgressBar(':bar :current/:total', {total: count});

        // Prepares the database connection in serialized mode
        db.serialize();
        // Creates the database structure
        db.run('CREATE TABLE IF NOT EXISTS info (name TEXT PRIMARY KEY, val TEXT DEFAULT NULL)');
        db.run('CREATE TABLE IF NOT EXISTS lies (id INTEGER PRIMARY KEY, lie TEXT, used INTEGER DEFAULT 0)');
        db.run('CREATE INDEX lies_used_idx ON lies (used)');

        // The idea from now on is to iterate through all the possible lies starting from the index 1 until we can
        // find all the available ones. There might be holes in the sequence, so we might want to issue all the request
        // sequentially and count the successful requests until we get the total amount of lies.
        // We are going to use the function Async.whilst so we need to define 3 functions: test, task and onComplete

        // Tests whether to stop fetching lies. It gets called before starting a new iteration
        var test = function () {
            return savedJokes < count;
        };

        // The task executed at every iteration. Basically fetches a new lie and creates a new record in the database.
        var task = function (cb) {
            request('http://api.icndb.com/jokes/' + (++index) + '?escape=javascript', function (err, response, body) {
                // handle possible request errors by stopping the whole process
                if (err || response.statusCode !== 200) {
                    console.log(index, error, response.statusCode);

                    return cb(error || response.statusCode);
                }

                // invalid ids generates an invalid JSON response (basically an HTML output), so we can
                // check for it by detecting JSON parse errors and skip the id by calling the callback completion
                // function for the current iteration
                var result = null;
                try {
                    result = JSON.parse(body).value;
                    result.joke = result.joke.replace(/The Chuck\ Norris/g, 'The cat');
                    result.joke = result.joke.replace(/the Chuck\ Norris/g, 'the cat');
                    result.joke = result.joke.replace(/\.\ Chuck\ Norris/g, '. A cat');
                    result.joke = result.joke.replace(/^Chuck\ Norris/g, 'A cat');
                    result.joke = result.joke.replace(/Chuck\ Norris/g, 'a cat');
                    result.joke = result.joke.replace(/the Chuck/g, 'the cat');
                    result.joke = result.joke.replace(/Chuck/g, 'the cat');
                    result.joke = result.joke.replace(/Norris/g, 'the cat');
                    result.joke = result.joke.replace(/Walker/g, 'Kitty');
                    result.joke = result.joke.replace(/Texas\ Ranger/g, 'Bird Raper');
                    result.joke = result.joke.replace(/finger/g, 'claw');
                    result.joke = result.joke.replace(/fist/g, 'paw');
                    result.joke = result.joke.replace(/cat'\ /g, 'cat\'s ');
                    console.log(result.joke);
                } catch (ex) {
                    return cb(null);
                }

                db.run('INSERT INTO lies (lie) VALUES (?)', result.joke, function (err) {
                    if (err) {
                        return cb(err);
                    }

                    ++savedJokes;
                    bar.tick();
                    return cb(null);
                });
            });
        };

        // On completion we just need to show errors in case we had any and close the database connection
        var onComplete = function (err) {
            db.close();
            if (err) {
                console.log('Error: ', err);
                process.exit(1);
            }
        };

        // triggers the asynchronous iteration using the previously defined test, task and onComplete functions
        return Async.whilst(test, task, onComplete);
    }

    console.log('Error: unable to count the total number of lies');
    process.exit(1);
});
