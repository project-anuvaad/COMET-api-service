const path = require('path');
const fs = require('fs');
const uuid = require('uuid').v4;
const superagent = require('superagent');

function downloadFile(url, targetPath) {
    return new Promise((resolve, reject) => {
        const extension = url.split('.').pop();
        const filePath = targetPath || path.join(__dirname, `${uuid()}.${extension}`);
        const stream = fs.createWriteStream(filePath);
        stream.on('finish', () => resolve(filePath))
        stream.on('error', (err) => reject(err))
        // Start download
        superagent
        .get(url)
        .pipe(stream)
    })
}

module.exports = {
    downloadFile,
}