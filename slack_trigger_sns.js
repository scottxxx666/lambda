'use strict';

const aws = require('aws-sdk');

const topic = process.env.topic;
const langNeedTranslated = ['ja', 'ko', 'vi', 'th'];

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

    const sns = new aws.SNS();
    const message = {
        input: input,
        comment: comment.value
    };
    var params = {
        Message: JSON.stringify(message),
        TopicArn: topic
    };
    sns.publish(params, response => {
        done(null, {message: 'success'}, callback);
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
    console.info(event);
    processEvent(event, callback);
};
