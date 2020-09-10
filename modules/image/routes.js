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

  router.patch(
    "/:id",
    middlewares.authorizeUpdateImage,
    controller.updateImage
  );

  return router;
};

module.exports = {
  mount,
};
