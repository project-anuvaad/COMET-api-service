const { imageService } = require("../shared/services");
const { ImageTranslationExport, Image } = require("../shared/models");

const controller = ({ workers }) => {
  const { exporterWorker } = workers;
  return {
    get: function (req, res) {
      const { image } = req.query;
      ImageTranslationExport.find({ image })
        .sort({ created_at: -1 })
        .populate('exportRequestBy', '_id firstname lastname email')
        .then((imageTranslationExports) => {
          return res.json({
            imageTranslationExports: imageTranslationExports.map((i) =>
              i.toObject()
            ),
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
      Image 
        .findById(image)
        .populate('originalImage')
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

          return ImageTranslationExport.create({
            image,
            organization: imageDoc.organization,
            exportRequestBy: req.user._id,
            exportRequestStatus: "approved",
            status: "processing",
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
