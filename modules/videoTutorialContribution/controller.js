const {
  storageService,
  emailService,
} = require('../shared/services');
const fs = require('fs')
const VideoTutorialContribution = require('../shared/models').VideoTutorialContribution;

const fileUtils = require('./fileUtils');

const controller = {
    uploadVideo: function (req, res) {
        const { title, url } = req.body;
        let file = req.files &&  req.files.find((f) => f.fieldname === 'video');
        let uploadFilePromise;
        if (file) {
            uploadFilePromise = storageService.saveFile('videoTutorialContributions', file.filename, fs.createReadStream(file.path))
        } else if (url) {
            uploadFilePromise = new Promise((resolve, reject) => {
                fileUtils.downloadFile(url)
                .then((filePath) => {
                    file = { path: filePath };
                    return storageService.saveFile('videoTutorialContributions', filePath.split('/').pop(), fs.createReadStream(filePath))
                })
                .then((data) => {
                    return resolve(data);
                })
                .catch(reject)
            })
        } else {
            return res.status(400).send('Please upload video file or a video url')
        }
        let video;
        const videoData = {
            title,
        }
        console.log('before upload', file)
        VideoTutorialContribution.create(videoData)
        .then((doc) => {
            video = doc.toObject();
            console.log('doc created', video)
            return uploadFilePromise
        })
        .then((result) => {
            console.log(' =============== uploaded ====================');
            fs.unlink(file.path, () => { });
            const { url, data } = result;
            const Key = data.Key;
            video.Key = Key;
            video.url = url;
            video.status = 'uploaded';
            console.log('uploaed', result, video)
            res.json(video);
            console.log('created video', video)
            return VideoTutorialContribution.update({ _id: video._id }, { $set: { Key, url } })
        })
        .then(() => {
            ['smy.altamash@gmail.com'].forEach(to => {
                emailService.sendVideoContributionUploadedMessage({ to, content: `A new video contribution was uploaded with title ${video.title} on the url ${video.url}`})
                .then(() => {
                    console.log('sent message to ', to);
                })
                .catch(err => {
                    console.log('erro sending email to publish video contribution', err)
                })
            })
        })
        .catch(err => {
            console.log(err);
            fs.unlink(file.path, () => { });
            VideoTutorialContribution.update({ _id: video._id }, { $set: { status: 'failed' } });
        })
    },

    getVideos: function(req, res) {
        VideoTutorialContribution.find({ published: true })
       .then((videos) => {
            return res.json({ videos });
       })
       .catch(err => {
           console.log(err)
           return res.status(400).send('Something went wrong');
       })
    },


}

module.exports = controller;
