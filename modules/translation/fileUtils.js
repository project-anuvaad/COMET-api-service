const path = require("path");
const fs = require("fs");
const uuid = require("uuid").v4;
const superagent = require("superagent");
const { getAudioDurationInSeconds } = require("get-audio-duration");
const musicMetadata = require("music-metadata");

function getAudioDuration(url) {
  return new Promise((resolve, reject) => {
    if (url.indexOf("http") !== -1) {
      const targetPath = `tmp-audio-${uuid()}.${url.split(".").pop()}`;
      downloadFile(url, targetPath)
        .then(() => {
          return getAudioDurationInSeconds(url);
        })
        .then((duration) => {
          resolve(duration * 1000);
          fs.unlink(targetPath, () => {});
        })
        .catch(reject);
    } else {
      getAudioDurationInSeconds(url)
        .then((duration) => {
          resolve(duration * 1000);
        })
        .catch(reject);
    }
  });
}

function getFileDuration(url) {
  return new Promise((resolve, reject) => {
    const filePath = url.split("/").pop();
    if (url.indexOf("http") === 0) {
      downloadFile(url, filePath)
        .then(() => {
          return musicMetadata.parseFile(filePath);
        })
        .then((md) => {
          console.log(md);
          fs.unlink(filePath, (e) => {
            console.log("removed file", e);
          });
          return resolve(md.format.duration);
        })
        .catch(reject);
    } else {
      musicMetadata
        .parseFile(url)
        .then((md) => {
          console.log(md);
          return resolve(md.format.duration);
        })
        .catch(reject);
    }
  });
}

function downloadFile(url, targetPath) {
  return new Promise((resolve, reject) => {
    const extension = url.split(".").pop();
    const filePath =
      targetPath || path.join(__dirname, `${uuid()}.${extension}`);
    const stream = fs.createWriteStream(filePath);
    stream.on("finish", () => resolve(filePath));
    stream.on("error", (err) => reject(err));
    // Start download
    superagent.get(url).pipe(stream);
  });
}

module.exports = {
  getAudioDuration,
  downloadFile,
  getFileDuration,
};
