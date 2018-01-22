'use strict';

const url = require('url');
const https = require('https');
const querystring = require('querystring')

const hookUrl = process.env.hookUrl;
const authorization = process.env.authorization;
const translateUrl = process.env.translateUrl;
const target = process.env.target;
const key = process.env.key;
const langNeedTranslated = ['ja', 'ko', 'vi'];

function post(options, body, callback) {
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

    post(options, body, callback);
}

function postMessage(message, callback) {
    const body = JSON.stringify(message);
    const options = url.parse(hookUrl);
    options.method = 'POST';
    options.headers = {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
        'Authorization': authorization
    };

    post(options, body, callback);
}

function sendSlack(channel, message, thread_ts, callback) {
    const slackMessage = {
        channel: channel,
        text: message,
        thread_ts: thread_ts
    };

    postMessage(slackMessage, (response) => {
        if (response.statusCode < 400) {
            console.info('Message posted successfully');
            done(null, {message: slackMessage}, callback);
        } else if (response.statusCode < 500) {
            console.error(`Error posting message to Slack API: ${response.statusCode} - ${response.statusMessage}`);
            done(`Error posting message to Slack API: ${response.statusCode} - ${response.statusMessage}`, callback);
            // callback(null);  // Don't retry because the error is due to a problem with the request
        } else {
            // Let Lambda retry
            // callback(`Server error when processing message: ${response.statusCode} - ${response.statusMessage}`);
            done(`Server error when processing message: ${response.statusCode} - ${response.statusMessage}`, callback);
        }
    });
}

function noNeedTranslate(input) {
    return input.event === undefined
        || input.event.type !== 'message'
        || input.event.thread_ts !== undefined
        || input.event.attachments === undefined
        || langNoNeedTranslate(input);
}

function parseLangField(input) {
    return input.event.attachments[0].fields.find(function (element) {
        if (element.title === 'lang') {
            return element
        }
    });
}

function parseCommentField(input) {
    return input.event.attachments[0].fields.find(function (element) {
        if (element.title === 'comment') {
            return element
        }
    });
}

function langNoNeedTranslate(input) {
    return parseLangField(input) && !langNeedTranslated.includes(parseLangField(input).value);
}

function done(err, res, callback) {
    return callback(null, {
        statusCode: err ? '400' : '200',
        body: err ? err.message : JSON.stringify(res),
        headers: {
            'Content-Type': 'application/json',
        },
    });
}

function processEvent(event, callback) {
    const input = retrieveInput(event);

    if (noNeedTranslate(input)) {
        done(null, {status: 'success'}, callback);
        return false;
    }

    const comment = parseCommentField(input);

    translate(comment.value, (response) => {
        if (response.statusCode !== 200) {
            console.info(response);
            return false;
        }
        const body = JSON.parse(response.body);
        sendSlack(input.event.channel, body.data.translations[0].translatedText, input.event.event_ts, callback);
    });
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
