const EMAIL_SERVICE_API_ROOT = process.env.EMAIL_SERVICE_API_ROOT;
const superagent = require('superagent');

function send(content, callback) {
    superagent.post(EMAIL_SERVICE_API_ROOT, content)
        .then((res) => {
            callback(null, res.body)
        })
        .catch(err => {
            callback(err);
        })
}

module.exports = {
    send
}