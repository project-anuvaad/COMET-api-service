const { imageService } = require("../shared/services");
const { ImageTranslationExport, Image } = require("../shared/models");

const controller = ({ workers }) => {
  const { exporterWorker } = workers;
  return {
    get: function (req, res) {
      const perPage = 5;

      const { image } = req.query;
      let { page } = req.query;
      if (page) {
        page = parseInt(page);
      } else {
        page = 1;
      }

      const skip = page === 1 ? 0 : page * perPage - perPage;
      let imageTranslationExports;
      ImageTranslationExport.find({ image })
        .skip(skip)
        .limit(perPage)
        .sort({ created_at: -1 })
        .populate("exportRequestBy", "_id firstname lastname email")
        .then((ts) => {
          imageTranslationExports = ts.map((i) => i.toObject());
          return ImageTranslationExport.count({ image });
        })
        .then((count) => {
          return res.json({
            imageTranslationExports,
            pagesCount: Math.ceil(count / perPage),
          });
        })
        .catch((err) => {
          console.log(err);
          return res.status(400).send("Something went wrong");
        });
    },
    createImageTranslationExport: function (req, res) {
      const { image } = req.body;

      let imageDoc;
      Image.findById(image)
        .populate("originalImage")
        .then((i) => {
          imageDoc = i.toObject();
          return ImageTranslationExport.find({
            image,
            status: { $in: ["processing", "queued"] },
          });
        })
        .then((its) => {
          if (its && its.length > 0) {
            throw new Error("Image is already processing");
          }
          return ImageTranslationExport.find({
            image,
          })
            .sort({ created_at: -1 })
            .limit(1);
        })
        .then((latestExports) => {
          let latestExport;
          if (latestExports.length > 0) {
            latestExport = latestExports[0];
          }
          let version = 1;
          let subVersion = 0;
          if (latestExport) {
            // If it was exported, then it's a subversion update
            // Else it's a version update
            console.log("exported", imageDoc.exported);
            if (imageDoc.exported) {
              version = latestExport.version || 1;
              subVersion = (latestExport.subVersion || 0) + 1;
            } else {
              version = (latestExport.version || 0) + 1;
              subVersion = 0;
            }
          }

          return ImageTranslationExport.create({
            image,
            organization: imageDoc.organization,
            exportRequestBy: req.user._id,
            exportRequestStatus: "approved",
            status: "processing",
            version,
            subVersion,
          });
        })
        .then((imageTranslationExport) => {
          exporterWorker.exportImageTranslation({
            id: imageTranslationExport._id,
            imageUrl: imageDoc.url,
            originalWidth: imageDoc.width,
            originalHeight: imageDoc.height,
            displayWidth: imageDoc.displayWidth,
            displayHeight: imageDoc.displayHeight,
            groups: imageDoc.groups,
          });
          return res.json({
            imageTranslationExport: imageTranslationExport.toObject(),
          });
        })
        .catch((err) => {
          console.log(err);
          return res.status(400).send(err.message);
        });
    },
  };
};

module.exports = controller;
