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
const mount = function (router, rabbitmqChannel) {
  // Define module routes here

  require("./rabbitmqHandlers").init(rabbitmqChannel);

  const workers = require("./workers")({ rabbitmqChannel });
  const controller = require("./controller")({ workers });
  router.get("/", controller.getVideos);
  router.post("/", upload.any(), controller.uploadVideo);

  return router;
};

module.exports = {
  mount,
};
