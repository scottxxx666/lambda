const https = require('https');
const url = process.env.url;

function get(url) {
    https.get(url, (res) => {
        // console.log('statusCode:', res.statusCode);

        // res.on('data', (d) => {
        //   process.stdout.write(d);
        // });
    }).on('error', (e) => {
      console.error(e);
    });
}


exports.handler = (event, context, callback) => {
    get(url);
    callback(null);
};
