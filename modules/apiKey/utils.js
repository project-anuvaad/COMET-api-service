const uuid = require('uuid').v4;
function generateApiKey() {
    return `${uuid()}-${Date.now()}`;
}

module.exports = {
    generateApiKey
}