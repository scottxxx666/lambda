'use strict';

const url = require('url');
const https = require('https');
const querystring = require('querystring')

const hookUrl = process.env.hookUrl;
const authorization = process.env.authorization;
const youdaoTranslateUrl = process.env.youdaoTranslateUrl;
const to = process.env.to;

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

function youdaoTranslate(message, callback) {
    console.info('Start Youdao translate');
    const data = {
        q: message,
        to: to
    };
    const body = querystring.stringify(data);
    const options = url.parse(youdaoTranslateUrl);
    options.method = 'POST';
    options.headers = {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(body),
    };

    post(options, body, callback);
}

function postMessage(message, callback) {
    console.info('Start post message');
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
        } else if (response.statusCode < 500) {
            console.error(`Error posting message to Slack API: ${response.statusCode} - ${response.statusMessage}`);
        } else {
            console.error(`Server error when processing message: ${response.statusCode} - ${response.statusMessage}`);
        }
    });
    callback(null);
}

function processEvent(messageString, callback) {
    const message = JSON.parse(messageString);
    const input = message.input;
    const comment = message.comment;

    try {
        youdaoTranslate(comment, (response) => {
            if (response.statusCode !== 200) {
                console.info(response);
                return false;
            }
            const body = JSON.parse(response.body);
            console.info('Youdao translate completed');
            console.info(response);
            sendSlack(input.event.channel, body.translation[0], input.event.event_ts, callback);
        });
    }
    catch(err) {
        console.error('Youdao translate error');
        console.error(err);
        callback(null);
    }
}

exports.handler = (event, context, callback) => {
    const message = event.Records[0].Sns.Message;
    console.log('From SNS:', message);
    processEvent(message, callback);
};
