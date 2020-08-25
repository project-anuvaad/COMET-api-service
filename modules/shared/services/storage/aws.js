const AWS = require('aws-sdk')
const { accessKeyId, secretAccessKey, bucketName, defaultRegion } = require('./config');

const S3 = new AWS.S3({
    accessKeyId,
    secretAccessKey,
    region: defaultRegion,
})

function saveFile(directoryName, fileName, fileStream) {
    return new Promise((resolve, reject) => {
        S3.upload({
            Key: `${directoryName}/${fileName}`,
            Bucket: bucketName,
            Body: fileStream,
            ACL: 'public-read',
        }, (err, data) => {
            if (err) return reject(err);
            return resolve({ url: data.Location, Key: data.Key, data });
        })
    })
}

function deleteFile(directoryName, fileName) {
    return new Promise((resolve, reject) => {
        let Key = fileName ? `${directoryName}/${fileName}` : directoryName;
        // let Key = fileName ? `${directoryName}/${fileName}` : directoryName;
        // DONT DELETE DIRECTORIES
        if (Key.split('').pop() === '/') {
            return reject(new Error('Can not delete a directory'));
        }
        // Verify the object exists
        S3.getObject({ Key, Bucket: bucketName }, (err) => {
            if (err) {
                console.log(err);
                return reject(new Error(err.message));
            }
            S3.deleteObject({ Key, Bucket: bucketName }, (err, data) => {
                if (err) return reject(err);
                return resolve(data);
            })
        })
    })
}

function getBucketLocation() {
    return new Promise((resolve, reject) => {
        S3.getBucketLocation({
            Bucket: bucketName
        }, (err, data) => {
            if (err) return reject(err);
            return resolve(data);
        })
    })
}
// function getFile(directoryName, fileName) {
//     // return false;
//     S3.getObject({ Key: 'backgroundMusic/8ba0613c-2da0-48ca-b4b0-f7274379f657-compressed-bg.mp3', Bucket: bucketName }, (err, data) => {
//         console.log(err, data);
//     })
// }


// function getDirectoryFiles(directoryName) {
//     return false;
// }

module.exports = {
    saveFile,
    deleteFile,
    getBucketLocation,
    // getDirectoryFiles,
    // getFile,
}