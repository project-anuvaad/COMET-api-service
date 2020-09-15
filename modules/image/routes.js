const controller = require("./controller");
const middlewares = require("./middlewares");
const multer = require("multer");

var storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, "/tmp");
  },
  filename: function (req, file, cb) {
    cb(
      null,
      file.fieldname +
        "-" +
        Date.now() +
        "." +
        file.originalname.split(".").pop()
    );
  },
});
var upload = multer({ storage: storage });

// external modules should call the mount function and pass it an instance
// of the router to add the module's routes to it
const mount = function (router) {
  // Define module routes here
  router.post(
    "/upload",
    upload.any(),
    middlewares.authorizeUploadImage,
    controller.uploadImage
  );

  router.get("/", controller.getImages);
  router.get("/translations", controller.getImagesTranslations);
  router.patch(
    "/:id",
    middlewares.authorizeUpdateImage,
    controller.updateImage
  );

  router.put("/:id/groups", controller.updateGroups);
  router.put("/:id/status", controller.updateImageStatus);

  router.post("/:id/translate", controller.translateImage);

  router.get("/:id/colors", controller.getColors);
  router.get("/:id/pixelColor", controller.getPixelColor);
  router.get("/:id/text", controller.getText);

  router.get("/:id", controller.getById);
  return router;
};

module.exports = {
  mount,
};
