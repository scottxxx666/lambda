'use strict';

const url = require('url');
const https = require('https');

const slackChannel = process.env.slackChannel;
const hookUrl = process.env.hookUrl;
const stripeUrl = process.env.stripeUrl;

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

function processEvent(event, callback) {
    const input = retrieveInput(event);
    const message = formatMessage(input);
    const slackMessage = {
        channel: slackChannel,
        text: message,
    };

    const done = (err, res) => callback(null, {
        statusCode: err ? '400' : '200',
        body: err ? err.message : JSON.stringify(res),
        headers: {
            'Content-Type': 'application/json',
        },
    });

    postMessage(slackMessage, (response) => {
        if (response.statusCode < 400) {
            console.info('Message posted successfully');
            done(null, {message: 'success'});
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

function formatMessage(event) {
    const url = `${stripeUrl}/${event.id}`;
    const result =
`type: ${event.type},
failure_code: ${event.data.object.failure_code},
failure_message: ${event.data.object.failure_message},
url: ${url}`;
    return result;
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
