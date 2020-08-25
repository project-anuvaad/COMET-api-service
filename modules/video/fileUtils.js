const path = require('path');
const fs = require('fs');
const uuid = require('uuid').v4;
const superagent = require('superagent');
const { getAudioDurationInSeconds } = require('get-audio-duration')
const musicMetadata = require('music-metadata');

function getAudioDuration(url) {
    return new Promise((resolve, reject) => {
        getAudioDurationInSeconds(url).then((duration) => {
            resolve(duration * 1000);
        })
        .catch(reject);
    })
}

function getFileDuration(url) {
    return new Promise((resolve, reject) => {
        const filePath = path.join(__dirname, url.split('/').pop());

        downloadFile(url, filePath)
        .then(() => {
            return musicMetadata.parseFile(filePath)
        })
        .then((md) => {
            console.log(md)
            resolve(md.format.duration);
            fs.unlink(filePath, (e) => {
                console.log('removed file', e);
            })
        })
        .catch(reject)
    })
}

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
    getAudioDuration,
    downloadFile,
    getFileDuration,
}