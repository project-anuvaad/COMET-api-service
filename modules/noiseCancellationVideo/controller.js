const fs = require("fs");
const { storageService } = require("../shared/services");

const NoiseCancellationVideo = require("../shared/models")
  .NoiseCancellationVideo;

const controller = ({ workers }) => {
  const audioProcessor = workers.audioProcessorWorker;
  
  return {
    getVideos: function (req, res) {
      const perPage = 10;
      let { organization, page, search } = req.query;

      const query = {
        organization: organization,
      };
      const queryKeys = Object.keys(req.query);
      // Remove page if it's in the query
      if (queryKeys.indexOf("page") !== -1) {
        delete req.query.page;
      }

      if (queryKeys.indexOf("search") !== -1) {
        query.title = new RegExp(search, "ig");
        delete req.query.search;
      }

      if (page) {
        page = parseInt(page);
      } else {
        page = 1;
      }
      const skip = page === 1 || page === 0 ? 0 : page * perPage - perPage;

      Object.keys(req.query).forEach((key) => {
        if (req.query[key]) {
          query[key] = req.query[key];
        }
      });
      let noiseCancellationVideos;
      NoiseCancellationVideo.find({ ...query })
        .skip(skip)
        .limit(perPage)
        .sort({ created_at: -1 })
        .then((v) => {
          noiseCancellationVideos = v;
          return NoiseCancellationVideo.count(query);
        })
        .then((count) => {
          return res.json({
            noiseCancellationVideos,
            pagesCount: Math.ceil(count / perPage),
            totalCount: count,
          });
        })
        .catch((err) => {
          console.log(err);
          return res.status(400).send(err.message);
        });
    },

    uploadVideo: function (req, res) {
      // 1- Create new video instance
      // 2- Upload file to s3
      // 3- Send to the exporter to transcribe it
      const { title, organization } = req.body;
      const file = req.files.find((f) => f.fieldname === "video");
      let uploadFilePromise;
      uploadFilePromise = storageService.saveFile(
        "videos",
        file.filename,
        fs.createReadStream(file.path)
      );
      // if (process.env.NODE_ENV === 'production') {
      //     console.log('======================= Uploading to s3 ======================== ');
      //     uploadFilePromise = storageService.saveFile('videos', file.filename, fs.createReadStream(file.path))
      // } else {
      //     uploadFilePromise = new Promise((resolve) => resolve({url: file.path, data: { Key: file.filename } }));
      // }
      let video;
      const videoData = {
        title,
        status: "processing",
        organization,
        uploadedBy: req.user._id,
      };
      if (organization) {
        videoData.organization = organization;
      }
      NoiseCancellationVideo.create(videoData)
        .then((doc) => {
          video = doc.toObject();
          return uploadFilePromise;
        })
        .then((result) => {
          res.json({ noiseCancellationVideo: video });
          console.log(" =============== uploaded ====================");
          fs.unlink(file.path, () => {});
          const { url, data } = result;
          const Key = data.Key;
          video.Key = Key;
          video.url = url;
          console.log("created video", video);
          return NoiseCancellationVideo.update(
            { _id: video._id },
            { $set: { Key, url, status: "processing" } }
          );
        })
        .then(() => {
          console.log("uploaded doc", video);
          audioProcessor.processNoiseCancellationVideo({
            id: video._id,
            url: video.url,
            title: video.title,
          });
        })
        .catch((err) => {
          console.log(err);
          fs.unlink(file.path, () => {});
          NoiseCancellationVideo.update(
            { _id: video._id },
            { $set: { status: "failed" } }
          );
        });
    },
  };
};

module.exports = controller;
