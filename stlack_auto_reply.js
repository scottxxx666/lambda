'use strict';

const url = require('url');
const https = require('https');
const querystring = require('querystring')

const slackChannel = process.env.slackChannel;
const hookUrl = process.env.hookUrl;
const translateUrl = process.env.translateUrl;
const target = process.env.target;
const key = process.env.key;

function translate(message, callback) {
    const data = {
        target: target,
        q: message,
        key: key
    };
    const body = querystring.stringify(data);
    const options = url.parse(translateUrl);
    options.method = 'POST';
    options.headers = {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(body),
    };

    const postReq = https.request(options, (res) => {
        const chunks = [];
        res.setEncoding('utf8');
        res.on('data', (chunk) => chunks.push(chunk));
        res.on('end', () => {
            if (callback) {
                callback({
                    body: chunks.join(''),
                    statusCode: res.statusCode,
                    statusMessage: res.statusMessage,
                });
            }
        });
        return res;
    });

    postReq.write(body);
    postReq.end();
}

function postMessage(message, callback) {
    const body = JSON.stringify(message);
    const options = url.parse(hookUrl);
    options.method = 'POST';
    options.headers = {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
    };

    const postReq = https.request(options, (res) => {
        const chunks = [];
        res.setEncoding('utf8');
        res.on('data', (chunk) => chunks.push(chunk));
        res.on('end', () => {
            if (callback) {
                callback({
                    body: chunks.join(''),
                    statusCode: res.statusCode,
                    statusMessage: res.statusMessage,
                });
            }
        });
        return res;
    });

    postReq.write(body);
    postReq.end();
}

function sendSlack(message, callback) {

    const done = (err, res) => callback(null, {
        statusCode: err ? '400' : '200',
        body: err ? err.message : JSON.stringify(res),
        headers: {
            'Content-Type': 'application/json',
        },
    });

    // const message = JSON.stringify(input.event.type);
    const slackMessage = {
        channel: slackChannel,
        text: message,
    };
    console.info(message);

    postMessage(slackMessage, (response) => {
        if (response.statusCode < 400) {
            console.info('Message posted successfully');
            done(null, {message: slackMessage});
            // done(null, {message: 'success'});
        } else if (response.statusCode < 500) {
            console.error(`Error posting message to Slack API: ${response.statusCode} - ${response.statusMessage}`);
            done(`Error posting message to Slack API: ${response.statusCode} - ${response.statusMessage}`);
            // callback(null);  // Don't retry because the error is due to a problem with the request
        } else {
            // Let Lambda retry
            // callback(`Server error when processing message: ${response.statusCode} - ${response.statusMessage}`);
            done(`Server error when processing message: ${response.statusCode} - ${response.statusMessage}`);
        }
    });
}

function processEvent(event, callback) {
    const input = retrieveInput(event);
    const done = (err, res) => callback(null, {
        statusCode: err ? '400' : '200',
        body: err ? err.message : JSON.stringify(res),
        headers: {
            'Content-Type': 'application/json',
        },
    });

    if (input.event !== undefined && input.event.type === 'message' && input.event.thread_ts === undefined) {
        translate(input.event.text, (response) => {
            if (response.statusCode !== 200) {
                console.info(response);
                return false;
            }
            const body = JSON.parse(response.body);
            sendSlack(body.data.translations[0].translatedText, callback);
        });
    } else {
        done(null, {status: 'success'});
        return false;
    }
}

function retrieveInput(event) {
    if (!('httpMethod' in event)) {
        return event;
    }
    if (event.httpMethod == 'GET') {
        return event.queryStringParameters;
    }
    return JSON.parse(event.body);
}


exports.handler = (event, context, callback) => {
    if (hookUrl) {
        // Container reuse, simply process the event with the key in memory
        processEvent(event, callback);
    } else {
        callback('Hook URL has not been set.');
    }
};
